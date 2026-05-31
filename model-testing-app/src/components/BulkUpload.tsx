'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Building2,
  FolderOpen,
  FileText,
  ArrowRight,
  Info,
  Building,
  User,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Panel,
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  FlagChip,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { getUserInitials } from '@/lib/documentNaming';
import { BulkQueueProcessor, createBulkQueueProcessor, BatchInfo } from '@/lib/bulkQueueProcessor';
import BulkUploadHistory from './BulkUploadHistory';
import { SearchableSelect } from '@/components/ui/searchable-select';

const MAX_FILES = 500;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const BACKGROUND_THRESHOLD = 5; // Files > this threshold trigger background processing
const ESTIMATED_SECONDS_PER_FILE = 20;

/** Supported file extensions (lowercase, without dot) shared across all upload paths */
const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx', 'xls', 'xlsm', 'eml',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif',
]);

/**
 * accept attribute for file inputs.
 * Uses only file extensions (no MIME types) for consistent cross-platform
 * behavior — Windows Chrome can grey-out valid files when MIME types are mixed
 * with extensions in the accept string.
 */
const FILE_INPUT_ACCEPT = Array.from(SUPPORTED_EXTENSIONS).map(e => `.${e}`).join(',');

/**
 * Recursively traverse a FileSystemEntry tree and collect all files.
 * Used for drag-and-drop folder support.
 */
async function traverseFileTree(entry: FileSystemEntry, path: string = ''): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((file) => {
        // Attach the relative path so extractFolderHints can use it
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false,
        });
        resolve([file]);
      }, () => resolve([])); // Skip files that can't be read
    });
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();

    // readEntries returns batches of up to 100 — must loop until empty
    const readAllEntries = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve) => {
        const batch: FileSystemEntry[] = [];
        const readBatch = () => {
          dirReader.readEntries((results) => {
            if (results.length === 0) {
              resolve(batch);
            } else {
              batch.push(...results);
              readBatch();
            }
          }, () => resolve(batch)); // Skip unreadable dirs
        };
        readBatch();
      });

    const childEntries = await readAllEntries();
    const files: File[] = [];
    for (const child of childEntries) {
      const childFiles = await traverseFileTree(child, path + entry.name + '/');
      files.push(...childFiles);
    }
    return files;
  }

  return [];
}

/**
 * Extract project folder hints from webkitRelativePath.
 *
 * Hierarchy rule:
 * - The SELECTED root folder is always the project (or a hint toward it).
 * - Internal subfolders are organizational, not additional projects.
 *
 * Exception — multi-project mode:
 * If there are 2+ distinct immediate subfolders, each subfolder is treated
 * as a separate project (client-level upload with project subfolders).
 *
 * Examples:
 *   "Refinance Overrun/doc.pdf"               → hint: "Refinance Overrun"
 *   "Refinance Overrun/Additional Files/x.pdf" → hint: "Refinance Overrun" (subfolder = org)
 *   "ClientDocs/Project A/x.pdf" + "ClientDocs/Project B/y.pdf" → hints: "Project A", "Project B"
 */
// Known organizational folder names — subfolders matching these are filing categories,
// not projects. Case-insensitive matching.
const ORGANIZATIONAL_FOLDER_NAMES = new Set([
  'kyc', 'background', 'plans', 'monitoring', 'appraisals', 'legal',
  'notes', 'photos', 'photographs', 'pictures', 'images',
  'terms', 'terms comparison', 'terms request', 'credit submission',
  'post completion', 'post-completion', 'professional reports',
  'insurance', 'warranties', 'financial', 'financials',
  'correspondence', 'communications', 'miscellaneous', 'other',
  'operational model', 'valuations', 'inspections', 'documents',
  'contracts', 'invoices', 'receipts', 'reports', 'drawings',
  'planning', 'surveys', 'titles', 'certificates',
]);

function extractFolderHints(files: File[]): Map<number, string> {
  const hints = new Map<number, string>();
  const allParts = files.map(f => {
    const rel = (f as any).webkitRelativePath || '';
    return rel ? rel.split('/') : [];
  });

  const filesWithPaths = allParts.filter(p => p.length >= 2);
  if (filesWithPaths.length === 0) return hints;

  // Count distinct immediate subfolder names (depth 2)
  const subfolderNames = allParts.filter(p => p.length >= 3).map(p => p[1]);
  const uniqueSubfolders = new Set(subfolderNames);

  if (uniqueSubfolders.size >= 2) {
    // Check if subfolders look like organizational categories vs project names.
    // If most subfolders match known category names, this is a single project
    // with organizational subfolders (e.g., Creeland Grove/KYC/, Creeland Grove/Plans/)
    const orgCount = [...uniqueSubfolders].filter(name =>
      ORGANIZATIONAL_FOLDER_NAMES.has(name.toLowerCase())
    ).length;
    const orgRatio = orgCount / uniqueSubfolders.size;

    if (orgRatio > 0.4) {
      // Most subfolders are organizational — treat root as single project
      for (let i = 0; i < files.length; i++) {
        const parts = allParts[i];
        if (parts.length >= 2) hints.set(i, parts[0]);
      }
    } else {
      // Multi-project mode: root/ProjectFolder/file.pdf → ProjectFolder is the project
      for (let i = 0; i < files.length; i++) {
        const parts = allParts[i];
        if (parts.length >= 3) hints.set(i, parts[1]);
        // files at root/file.pdf are client-level — no hint
      }
    }
  } else {
    // Single-project mode: root folder IS the project, subfolders are organizational
    for (let i = 0; i < files.length; i++) {
      const parts = allParts[i];
      if (parts.length >= 2) hints.set(i, parts[0]);
    }
  }

  return hints;
}

interface BulkUploadProps {
  onBatchCreated?: (batchId: Id<"bulkUploadBatches">) => void;
  onComplete?: (batchId: Id<"bulkUploadBatches">) => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export default function BulkUpload({ onBatchCreated, onComplete }: BulkUploadProps) {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  
  // State - Document scope
  type DocumentScope = 'client' | 'internal' | 'personal';
  const [uploadScope, setUploadScope] = useState<DocumentScope>('client');
  const [selectedInternalFolderId, setSelectedInternalFolderId] = useState<string>('');
  const [selectedPersonalFolderId, setSelectedPersonalFolderId] = useState<string>('');

  // State - Client/Project
  const [selectedClientId, setSelectedClientId] = useState<Id<"clients"> | ''>('');
  const [selectedProjectId, setSelectedProjectId] = useState<Id<"projects"> | ''>('');
  const [isInternal, setIsInternal] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ processed: 0, total: 0, currentFile: '' });
  const [activeBatchId, setActiveBatchId] = useState<Id<"bulkUploadBatches"> | null>(null);
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectShortcode, setNewProjectShortcode] = useState('');
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientType, setNewClientType] = useState<string>('');
  const [editingShortcode, setEditingShortcode] = useState(false);
  const [editShortcodeValue, setEditShortcodeValue] = useState('');

  // Folder upload state
  const [folderHints, setFolderHints] = useState<Map<number, string>>(new Map());
  const [detectedProjects, setDetectedProjects] = useState<string[]>([]);
  // folderInputRef removed — now using dynamic input element in openFolderPicker

  // Previous selection state
  const [previousSelection, setPreviousSelection] = useState<{
    scope: DocumentScope;
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectName?: string;
    internalFolderId?: string;
    personalFolderId?: string;
  } | null>(null);
  const [previousSelectionDismissed, setPreviousSelectionDismissed] = useState(false);

  // Background processing state (for >5 files)
  const [showBackgroundDialog, setShowBackgroundDialog] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);

  // Queries
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(
    api.projects.list,
    selectedClientId ? { clientId: selectedClientId as Id<"clients"> } : "skip"
  );
  // Client projects for folder hint matching
  const clientProjects = useQuery(
    api.projects.getByClient,
    selectedClientId ? { clientId: selectedClientId as Id<"clients"> } : "skip"
  );

  // Internal and personal folders for non-client scopes
  const internalFolders = useQuery(
    api.internalFolders.list,
    uploadScope === 'internal' ? {} : "skip"
  );
  const personalFolders = useQuery(
    api.personalFolders.list,
    uploadScope === 'personal' ? {} : "skip"
  );

  // Checklist items and folders for V4 AI pipeline matching
  // Use pre-computed args to avoid excessive TypeScript recursion depth with Convex generics
  const _projectId = selectedProjectId && selectedProjectId !== '' ? selectedProjectId as Id<"projects"> : undefined;
  const _clientId = selectedClientId && selectedClientId !== '' ? selectedClientId as Id<"clients"> : undefined;
  const _projChecklistArgs = uploadScope === 'client' && _projectId ? { projectId: _projectId } : "skip" as const;
  const _clientChecklistArgs = uploadScope === 'client' && _clientId && !_projectId ? { clientId: _clientId } : "skip" as const;
  const _projFolderArgs = uploadScope === 'client' && _projectId ? { projectId: _projectId } : "skip" as const;
  const _clientFolderArgs = uploadScope === 'client' && _clientId ? { clientId: _clientId } : "skip" as const;

  const projectChecklistItems = useQuery(api.knowledgeLibrary.getChecklistByProject, _projChecklistArgs);
  const clientChecklistItems = useQuery(api.knowledgeLibrary.getClientLevelChecklist, _clientChecklistArgs);
  const projectFolders = useQuery(api.projects.getProjectFolders, _projFolderArgs);
  const clientFolders = useQuery(api.clients.getClientFolders, _clientFolderArgs);

  const shortcodeSuggestion = useQuery(
    api.projects.suggestShortcode,
    newProjectName ? { name: newProjectName } : "skip"
  );
  const shortcodeAvailable = useQuery(
    api.projects.isShortcodeAvailable,
    newProjectShortcode ? { shortcode: newProjectShortcode } : "skip"
  );
  const currentUser = useQuery(api.users.getCurrent, {});
  const pendingBatches = useQuery(
    api.bulkUpload.getPendingBatches,
    currentUser?._id ? { userId: currentUser._id } : 'skip'
  );

  // Tab state
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');

  // Mutations
  const createBatch = useMutation(api.bulkUpload.createBatch);
  const addItemToBatch = useMutation(api.bulkUpload.addItemToBatch);
  const updateItemStatus = useMutation(api.bulkUpload.updateItemStatus);
  const updateItemAnalysis = useMutation(api.bulkUpload.updateItemAnalysis);
  const updateBatchStatus = useMutation(api.bulkUpload.updateBatchStatus);
  const checkForDuplicates = useQuery(api.bulkUpload.checkForDuplicates, "skip");
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const convex = useConvex();
  const createProject = useMutation(api.projects.create);
  const createClient = useMutation(api.clients.create);
  const updateProject = useMutation(api.projects.update);
  const startBackgroundProcessing = useMutation(api.bulkBackgroundProcessor.startBackgroundProcessing);

  // Get selected client and project details
  const selectedClient = useMemo(() => {
    if (!selectedClientId || !clients) return null;
    return clients.find(c => c._id === selectedClientId);
  }, [selectedClientId, clients]);

  const selectedProject = useMemo(() => {
    if (!selectedProjectId || selectedProjectId === 'none' || !projects) return null;
    return projects.find(p => p._id === selectedProjectId);
  }, [selectedProjectId, projects]);

  // Get selected internal/personal folder details
  const selectedInternalFolder = useMemo(() => {
    if (!selectedInternalFolderId || !internalFolders) return null;
    return internalFolders.find(f => f.folderType === selectedInternalFolderId);
  }, [selectedInternalFolderId, internalFolders]);

  const selectedPersonalFolder = useMemo(() => {
    if (!selectedPersonalFolderId || !personalFolders) return null;
    return personalFolders.find(f => f.folderType === selectedPersonalFolderId);
  }, [selectedPersonalFolderId, personalFolders]);

  // Query for edit shortcode availability (must be after selectedProject is defined)
  const editShortcodeAvailable = useQuery(
    api.projects.isShortcodeAvailable,
    editShortcodeValue && editShortcodeValue !== selectedProject?.projectShortcode 
      ? { shortcode: editShortcodeValue } 
      : "skip"
  );

  // User initials
  const uploaderInitials = useMemo(() => {
    const name = user?.fullName || user?.firstName || currentUser?.name || 'User';
    return getUserInitials(name);
  }, [user, currentUser]);

  // Update shortcode suggestion when project name changes
  useEffect(() => {
    if (shortcodeSuggestion?.shortcode && !newProjectShortcode) {
      setNewProjectShortcode(shortcodeSuggestion.shortcode);
    }
  }, [shortcodeSuggestion, newProjectShortcode]);

  // Load previous selection from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('rockcap-filing-last-selection');
      if (stored) {
        setPreviousSelection(JSON.parse(stored));
      }
    } catch {}
  }, []);

  // Apply previous selection
  const applyPreviousSelection = useCallback(() => {
    if (!previousSelection) return;
    setUploadScope(previousSelection.scope);
    if (previousSelection.scope === 'client' && previousSelection.clientId) {
      setSelectedClientId(previousSelection.clientId as Id<"clients">);
      if (previousSelection.projectId) {
        setSelectedProjectId(previousSelection.projectId as Id<"projects">);
      }
    } else if (previousSelection.scope === 'internal' && previousSelection.internalFolderId) {
      setSelectedInternalFolderId(previousSelection.internalFolderId);
    } else if (previousSelection.scope === 'personal' && previousSelection.personalFolderId) {
      setSelectedPersonalFolderId(previousSelection.personalFolderId);
    }
    setPreviousSelectionDismissed(true);
  }, [previousSelection]);

  // File handling
  const handleFiles = useCallback((newFiles: File[]) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of newFiles) {
      // Validate extension — the accept attribute handles this in most
      // browsers, but on Windows the OS file picker can let unsupported
      // files through when MIME type mappings differ from Mac.
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!ext || !SUPPORTED_EXTENSIONS.has(ext)) {
        errors.push(`${file.name}: Unsupported file type`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 100MB)`);
        continue;
      }
      validFiles.push(file);
    }

    if (files.length + validFiles.length > MAX_FILES) {
      const remaining = MAX_FILES - files.length;
      errors.push(`Can only add ${remaining} more files (max ${MAX_FILES})`);
      validFiles.splice(remaining);
    }

    if (errors.length > 0) {
      alert(errors.join('\n'));
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  }, [files.length]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const allFiles: File[] = [];

    // Use webkitGetAsEntry to detect folders vs files
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      }
    }

    if (entries.length > 0) {
      // We have entries — traverse any directories
      for (const entry of entries) {
        const files = await traverseFileTree(entry);
        allFiles.push(...files);
      }
    } else {
      // Fallback: browser doesn't support webkitGetAsEntry
      allFiles.push(...Array.from(e.dataTransfer.files));
    }

    if (allFiles.length === 0) return;

    // Extract folder hints if no project is pre-selected (same as handleFolderSelect)
    if (!selectedProjectId) {
      const hints = extractFolderHints(allFiles);
      if (hints.size > 0) {
        setFolderHints(hints);
        setDetectedProjects([...new Set(hints.values())]);
      }
    }

    handleFiles(allFiles);
  }, [handleFiles, selectedProjectId]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
    e.target.value = '';
  }, [handleFiles]);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAllFiles = useCallback(() => {
    setFiles([]);
    setFolderHints(new Map());
    setDetectedProjects([]);
  }, []);

  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const allFiles = Array.from(fileList);

    // Filter to supported file types only
    const supportedFiles = allFiles.filter(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext ? SUPPORTED_EXTENSIONS.has(ext) : false;
    });

    if (supportedFiles.length === 0) {
      toast.error('No supported documents found in the selected folder');
      return;
    }

    // Only extract folder hints when no project is pre-selected.
    // If a project is already selected, all files simply go to that project.
    if (!selectedProjectId) {
      const hints = extractFolderHints(supportedFiles);
      setFolderHints(hints);
      setDetectedProjects([...new Set(hints.values())]);
    }

    // Add files to the upload queue
    setFiles(prev => {
      const newFiles = [...prev, ...supportedFiles].slice(0, MAX_FILES);
      return newFiles;
    });

    e.target.value = '';
  }, [selectedProjectId]);

  // Open folder picker by creating a dynamic input element
  // This avoids the browser bug where a pre-mounted webkitdirectory input
  // doesn't register the attribute on first render, causing the "Open" button
  // to be disabled on the first click.
  const openFolderPicker = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.onchange = (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (!fileList || fileList.length === 0) return;
      // Reuse the same logic as handleFolderSelect
      const fakeEvent = { target: { files: fileList, value: '' } } as any;
      handleFolderSelect(fakeEvent);
    };
    input.click();
  }, [handleFolderSelect]);

  // Remove a single detected project (and its hints) when the user dismisses it
  const dismissDetectedProject = useCallback((projectName: string) => {
    setDetectedProjects(prev => prev.filter(p => p !== projectName));
    setFolderHints(prev => {
      const next = new Map(prev);
      for (const [idx, name] of next.entries()) {
        if (name === projectName) next.delete(idx);
      }
      return next;
    });
  }, []);

  // Create new client
  const handleCreateClient = async () => {
    if (!newClientName) return;

    try {
      const clientId = await createClient({
        name: newClientName,
        type: newClientType || undefined,
        status: 'active',
      });
      
      setSelectedClientId(clientId);
      setShowNewClientDialog(false);
      setNewClientName('');
      setNewClientType('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create client');
    }
  };

  // Update project shortcode
  const handleUpdateShortcode = async () => {
    if (!selectedProjectId || !editShortcodeValue) return;
    if (editShortcodeValue !== selectedProject?.projectShortcode && editShortcodeAvailable === false) return;

    try {
      await updateProject({
        id: selectedProjectId as Id<"projects">,
        projectShortcode: editShortcodeValue.toUpperCase(),
      });
      setEditingShortcode(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update shortcode');
    }
  };

  // Create new project
  const handleCreateProject = async () => {
    if (!selectedClientId || !newProjectName || !newProjectShortcode) return;

    try {
      const projectId = await createProject({
        name: newProjectName,
        projectShortcode: newProjectShortcode,
        clientRoles: [{ clientId: selectedClientId as Id<"clients">, role: 'borrower' }],
        status: 'active',
      });
      
      setSelectedProjectId(projectId);
      setShowNewProjectDialog(false);
      setNewProjectName('');
      setNewProjectShortcode('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create project');
    }
  };

  // Start bulk upload
  const handleStartUpload = async () => {
    // Validate based on scope
    if (uploadScope === 'client' && (!selectedClientId || !selectedClient)) {
      return;
    }
    if (files.length === 0 || !currentUser) {
      return;
    }

    // Background mode only works in production (Convex can't reach localhost)
    const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
    const isBackgroundMode = files.length > BACKGROUND_THRESHOLD && !isLocalhost;

    setIsUploading(true);
    setUploadProgress({ processed: 0, total: files.length, currentFile: '' });

    // Save selection to localStorage for "use previous" feature
    try {
      localStorage.setItem('rockcap-filing-last-selection', JSON.stringify({
        scope: uploadScope,
        clientId: uploadScope === 'client' ? selectedClientId || undefined : undefined,
        clientName: uploadScope === 'client' ? selectedClient?.name : undefined,
        projectId: uploadScope === 'client' ? selectedProjectId || undefined : undefined,
        projectName: uploadScope === 'client' ? selectedProject?.name : undefined,
        internalFolderId: uploadScope === 'internal' ? selectedInternalFolderId || undefined : undefined,
        personalFolderId: uploadScope === 'personal' ? selectedPersonalFolderId || undefined : undefined,
      }));
    } catch {}

    try {
      // Create batch with scope-aware parameters
      const batchId = await createBatch({
        scope: uploadScope,
        clientId: uploadScope === 'client' && selectedClientId ? selectedClientId as Id<"clients"> : undefined,
        clientName: uploadScope === 'client' && selectedClient ? selectedClient.name : undefined,
        projectId: uploadScope === 'client' && selectedProjectId ? selectedProjectId as Id<"projects"> : undefined,
        projectName: uploadScope === 'client' ? selectedProject?.name : undefined,
        projectShortcode: uploadScope === 'client' ? selectedProject?.projectShortcode : undefined,
        internalFolderId: uploadScope === 'internal' ? selectedInternalFolderId || undefined : undefined,
        internalFolderName: uploadScope === 'internal' && selectedInternalFolder ? selectedInternalFolder.name : undefined,
        personalFolderId: uploadScope === 'personal' ? selectedPersonalFolderId || undefined : undefined,
        personalFolderName: uploadScope === 'personal' && selectedPersonalFolder ? selectedPersonalFolder.name : undefined,
        isInternal: uploadScope === 'internal' || isInternal,
        isMultiProject: folderHints.size > 0 && !selectedProjectId,
        instructions: instructions || undefined,
        uploaderInitials,
        userId: currentUser._id,
        totalFiles: files.length,
        processingMode: isBackgroundMode ? 'background' : 'foreground',
      });

      setActiveBatchId(batchId);
      onBatchCreated?.(batchId);

      if (isBackgroundMode) {
        // BACKGROUND MODE: Upload files to storage first, then process in background
        setUploadProgress({ processed: 0, total: files.length, currentFile: 'Uploading files to storage...' });

        // Upload all files to storage and create items with fileStorageId
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadProgress({ processed: i, total: files.length, currentFile: `Uploading ${file.name}...` });

          // Upload file to storage
          const uploadUrl = await generateUploadUrl();
          const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });

          if (!uploadResponse.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }

          const { storageId } = await uploadResponse.json();

          // Create item with fileStorageId
          await addItemToBatch({
            batchId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            fileStorageId: storageId,
          });
        }

        // Calculate estimated time
        const estimatedMins = Math.ceil((files.length * ESTIMATED_SECONDS_PER_FILE) / 60);

        // Start background processing (may queue if another batch is active)
        const bgResult = await startBackgroundProcessing({
          batchId,
          baseUrl: window.location.origin,
        });

        // Reset form so user can queue another upload immediately
        setIsUploading(false);
        setFiles([]);
        setFolderHints(new Map());
        setDetectedProjects([]);

        const isQueued = bgResult && 'queued' in bgResult && bgResult.queued;
        toast.success(isQueued ? 'Files queued for processing' : 'Files uploaded successfully', {
          description: isQueued
            ? `${files.length} files queued (position ${bgResult.queuePosition}). Will start when the current batch completes.`
            : `${files.length} files are processing in the background (~${estimatedMins} min). You can queue another upload.`,
          duration: 5000,
          action: {
            label: 'Watch Progress',
            onClick: () => router.push(`/docs/bulk/${batchId}`),
          },
        });

      } else {
        // FOREGROUND MODE: Use existing BulkQueueProcessor (unchanged)
        const processor = createBulkQueueProcessor(
          {
            updateItemStatus,
            updateItemAnalysis,
            updateBatchStatus,
            checkForDuplicates: async (args) => {
              // Direct API call for duplicate check by original filename
              // Skip duplicate check for internal/personal scope for now
              if (uploadScope !== 'client' || !args.clientId) {
                return { isDuplicate: false, existingDocuments: [] };
              }
              const params = new URLSearchParams({
                originalFileName: args.originalFileName,
                clientId: args.clientId,
              });
              if (args.projectId) {
                params.append('projectId', args.projectId);
              }
              const response = await fetch(`/api/check-duplicates?${params.toString()}`);
              if (!response.ok) {
                return { isDuplicate: false, existingDocuments: [] };
              }
              return response.json();
            },
            generateUploadUrl,
            getStorageUrl: (storageId) => convex.query(api.documents.getFileUrl, { storageId }),
          },
          {
            onProgress: (processed, total, currentFile) => {
              setUploadProgress({ processed, total, currentFile });
            },
            onError: (itemId, error) => {
              console.error(`Error processing item ${itemId}:`, error);
            },
            onComplete: (completedBatchId) => {
              onComplete?.(completedBatchId);
            },
            concurrency: 5,
          }
        );

        // Build checklist items for V4 pipeline matching
        const rawChecklist = selectedProjectId ? projectChecklistItems : clientChecklistItems;
        const checklistForPipeline = rawChecklist
          ?.filter(item => item.status === 'missing' || item.status === 'pending_review')
          ?.map(item => ({
            id: item._id,
            name: item.name || '',
            category: item.category,
            status: item.status,
            matchingDocumentTypes: item.matchingDocumentTypes,
          }));

        // Build available folders for V4 pipeline
        const foldersForPipeline: Array<{ folderKey: string; name: string; level: 'client' | 'project' }> = [];
        if (clientFolders) {
          for (const f of clientFolders) {
            foldersForPipeline.push({ folderKey: f.folderType, name: f.name, level: 'client' });
          }
        }
        if (projectFolders) {
          for (const f of projectFolders) {
            foldersForPipeline.push({ folderKey: f.folderType, name: f.name, level: 'project' });
          }
        }

        // Determine if this is a multi-project upload (folder hints present, no project pre-selected)
        const isMultiProject = folderHints.size > 0 && !selectedProjectId;

        // Build available projects list for AI matching
        const availableProjectsList = clientProjects?.map(p => ({
          id: p._id,
          name: p.name,
          shortcode: p.projectShortcode,
          address: p.address,
        }));

        // Set batch info based on scope
        const batchInfo: BatchInfo = {
          batchId,
          clientId: uploadScope === 'client' && selectedClient ? selectedClient._id : ('' as Id<"clients">),
          clientName: uploadScope === 'client' && selectedClient ? selectedClient.name : 'Internal',
          clientType: uploadScope === 'client' && selectedClient ? (selectedClient.type || 'borrower') : 'internal',
          projectId: uploadScope === 'client' ? selectedProject?._id : undefined,
          projectShortcode: uploadScope === 'client' ? selectedProject?.projectShortcode : undefined,
          isInternal: uploadScope === 'internal' || isInternal,
          instructions: instructions || undefined,
          uploaderInitials,
          checklistItems: checklistForPipeline,
          availableFolders: foldersForPipeline.length > 0 ? foldersForPipeline : undefined,
          isMultiProject,
          availableProjects: isMultiProject && availableProjectsList ? availableProjectsList : undefined,
          folderHints: folderHints.size > 0 ? Object.fromEntries(folderHints) : undefined,
        };
        processor.setBatchInfo(batchInfo);

        // Add all files to processor (with per-file folder hints)
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const itemId = await addItemToBatch({
            batchId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });
          processor.addItem(itemId, file, folderHints.get(i));
        }

        // Reset form so user can queue another upload immediately
        setIsUploading(false);
        setFiles([]);
        setFolderHints(new Map());
        setDetectedProjects([]);

        toast.success('Files uploaded successfully', {
          description: `${files.length} files are processing. You can queue another upload.`,
          duration: 5000,
          action: {
            label: 'Watch Progress',
            onClick: () => router.push(`/docs/bulk/${batchId}`),
          },
        });

        // Start processing in background
        processor.processQueue().catch(err => {
          console.error('[BulkUpload] Background processing error:', err);
        });
      }
    } catch (error) {
      console.error('Error starting bulk upload:', error);
      alert(error instanceof Error ? error.message : 'Failed to start bulk upload');
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Require shortcode if a project is selected (client scope only)
  const needsShortcode = uploadScope === 'client' && selectedProjectId && selectedProject && !selectedProject.projectShortcode;

  // Determine if upload can start based on scope
  const canStartUpload = useMemo(() => {
    if (files.length === 0 || isUploading) return false;
    if (needsShortcode) return false;

    switch (uploadScope) {
      case 'client':
        return !!selectedClientId;
      case 'internal':
        // Internal can start even without folder (will go to miscellaneous)
        return true;
      case 'personal':
        // Personal can start even without folder (will go to my_documents)
        return true;
      default:
        return false;
    }
  }, [uploadScope, selectedClientId, files.length, isUploading, needsShortcode]);

  const activeBatchCount = (pendingBatches?.filter(
    (b: any) => b.status === 'processing' || b.status === 'queued'
  ) ?? []).length;

  return (
    <div className="space-y-4">
      {/* Tab header */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upload' | 'history')}>
        <TabsList className="mb-4">
          <TabsTrigger value="upload">Upload Files</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            History
            {activeBatchCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 16,
                  height: 16,
                  padding: '0 5px',
                  fontSize: 10,
                  fontWeight: 500,
                  borderRadius: 4,
                  background: colors.bg.cardAlt,
                  color: colors.text.secondary,
                  border: `1px solid ${colors.border.default}`,
                }}
              >
                {activeBatchCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div className="space-y-6">
      {/* Step 1: Document Scope Selection */}
      <Panel title="Step 1: Document Type">
        <div className="space-y-4">
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            Choose where these documents should be stored
          </p>
          {/* Use Previous Selection banner */}
          {previousSelection && !previousSelectionDismissed && !isUploading && (
            <div
              className="flex items-center justify-between p-3 rounded"
              style={{ background: `${colors.accent.blue}15`, border: `1px solid ${colors.accent.blue}40` }}
            >
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: colors.text.secondary }}>
                <RotateCcw className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.blue }} />
                <span>
                  Use previous: <span style={{ fontWeight: 500, color: colors.text.primary }}>
                    {previousSelection.scope === 'client' ? 'Client' : previousSelection.scope === 'internal' ? 'Internal' : 'Personal'}
                    {previousSelection.clientName && ` → ${previousSelection.clientName}`}
                    {previousSelection.projectName && ` → ${previousSelection.projectName}`}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={applyPreviousSelection}>
                  Apply
                </Button>
                <button
                  onClick={() => setPreviousSelectionDismissed(true)}
                  style={{ color: colors.text.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {([
              { scope: 'client' as const, icon: Building2, title: 'Client Documents', sub: 'For client/project files', tone: colors.accent.blue, onClick: () => { setUploadScope('client'); setSelectedInternalFolderId(''); setSelectedPersonalFolderId(''); } },
              { scope: 'internal' as const, icon: Building, title: 'RockCap Internal', sub: 'Company-wide documents', tone: colors.accent.yellow, onClick: () => { setUploadScope('internal'); setSelectedClientId(''); setSelectedProjectId(''); setSelectedPersonalFolderId(''); } },
              { scope: 'personal' as const, icon: User, title: 'Personal', sub: 'Private to you only', tone: colors.accent.purple, onClick: () => { setUploadScope('personal'); setSelectedClientId(''); setSelectedProjectId(''); setSelectedInternalFolderId(''); } },
            ]).map(({ scope, icon: Icon, title, sub, tone, onClick }) => {
              const active = uploadScope === scope;
              return (
                <button
                  key={scope}
                  onClick={onClick}
                  disabled={isUploading}
                  className="flex flex-col items-center gap-2 p-4"
                  style={{
                    borderRadius: 4,
                    border: `1px solid ${active ? tone : colors.border.default}`,
                    background: active ? `${tone}15` : colors.bg.card,
                    color: active ? tone : colors.text.secondary,
                    opacity: isUploading ? 0.5 : 1,
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    transition: 'background 100ms linear, border-color 100ms linear',
                  }}
                >
                  <Icon className="w-6 h-6" />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{title}</span>
                  <span style={{ fontSize: 10, color: active ? tone : colors.text.muted, textAlign: 'center' }}>
                    {sub}
                  </span>
                </button>
              );
            })}
          </div>

          {uploadScope === 'personal' && (
            <div
              className="flex items-center gap-2 p-3 rounded"
              style={{ background: `${colors.accent.purple}15`, border: `1px solid ${colors.accent.purple}40`, fontSize: 12, color: colors.text.secondary }}
            >
              <Lock className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.purple }} />
              <span>Personal documents are only visible to you.</span>
            </div>
          )}
        </div>
      </Panel>

      {/* Step 2: Client Selection (Client scope only) */}
      {uploadScope === 'client' && (
        <Panel title="Step 2: Select Client">
          <div className="space-y-4">
            <p style={{ fontSize: 12, color: colors.text.secondary }}>
              All files in this batch will be associated with this client
            </p>
            <SearchableSelect
              options={(clients || []).map((c) => ({
                value: c._id,
                label: c.name,
              }))}
              value={selectedClientId}
              onSelect={(val) => {
                setSelectedClientId(val as Id<"clients"> | '');
                setSelectedProjectId('');
              }}
              placeholder="Search for a client..."
              disabled={isUploading}
              renderOption={(option) => {
                const client = clients?.find((c) => c._id === option.value);
                return (
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.muted }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{option.label}</div>
                      {client?.companyName && (
                        <div style={{ fontSize: 10, color: colors.text.muted }}>{client.companyName}</div>
                      )}
                    </div>
                  </div>
                );
              }}
            />

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowNewClientDialog(true)}
              disabled={isUploading}
            >
              + Create New Client
            </Button>
          </div>
        </Panel>
      )}

      {/* Step 2: Internal Folder Selection (Internal scope only) */}
      {uploadScope === 'internal' && (
        <Panel title="Step 2: Select Folder (Optional)">
          <div className="space-y-4">
            <p style={{ fontSize: 12, color: colors.text.secondary }}>
              Choose where to store these internal documents
            </p>
            <Select
              value={selectedInternalFolderId || 'miscellaneous'}
              onChange={(e) => setSelectedInternalFolderId(e.target.value)}
              disabled={isUploading}
            >
              {internalFolders?.map((folder) => (
                <option key={folder.folderType} value={folder.folderType}>
                  {folder.name}
                </option>
              ))}
              {(!internalFolders || internalFolders.length === 0) && (
                <option value="miscellaneous">Miscellaneous</option>
              )}
            </Select>
            <p style={{ fontSize: 10, color: colors.text.muted }}>
              If no folder is selected, documents will be placed in Miscellaneous.
            </p>
          </div>
        </Panel>
      )}

      {/* Step 2: Personal Folder Selection (Personal scope only) */}
      {uploadScope === 'personal' && (
        <Panel title="Step 2: Select Folder (Optional)">
          <div className="space-y-4">
            <p style={{ fontSize: 12, color: colors.text.secondary }}>
              Choose where to store your personal documents
            </p>
            <Select
              value={selectedPersonalFolderId || 'my_documents'}
              onChange={(e) => setSelectedPersonalFolderId(e.target.value)}
              disabled={isUploading}
            >
              {personalFolders?.map((folder) => (
                <option key={folder.folderType} value={folder.folderType}>
                  {folder.name}
                </option>
              ))}
              {(!personalFolders || personalFolders.length === 0) && (
                <option value="my_documents">My Documents</option>
              )}
            </Select>
            <p style={{ fontSize: 10, color: colors.text.muted }}>
              If no folder is selected, documents will be placed in My Documents.
            </p>
          </div>
        </Panel>
      )}

      {/* Step 3: Project Selection (Optional) - Client scope only */}
      {uploadScope === 'client' && selectedClientId && (
        <Panel title="Step 3: Select Project (Optional)">
          <div className="space-y-4">
            <p style={{ fontSize: 12, color: colors.text.secondary }}>
              Optionally associate files with a specific project
            </p>
            <SearchableSelect
              options={(projects || []).map((p) => ({
                value: p._id,
                label: p.name,
              }))}
              value={selectedProjectId}
              onSelect={(val) => {
                setSelectedProjectId(val as Id<"projects"> | '');
              }}
              placeholder="Search for a project (optional)..."
              disabled={isUploading}
              renderOption={(option) => {
                const project = projects?.find((p) => p._id === option.value);
                return (
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.muted }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{option.label}</div>
                      {project?.projectShortcode && (
                        <div style={{ fontSize: 10, color: colors.text.muted }}>{project.projectShortcode}</div>
                      )}
                    </div>
                  </div>
                );
              }}
            />

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowNewProjectDialog(true)}
              disabled={isUploading}
            >
              + Create New Project
            </Button>

            {selectedProject && (
              <div className="space-y-2">
                <div className="flex items-center gap-2" style={{ fontSize: 12 }}>
                  <Info className="w-4 h-4" style={{ color: colors.text.muted }} />
                  <span style={{ color: colors.text.muted }}>Project shortcode:</span>

                  {editingShortcode ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editShortcodeValue}
                        onChange={(e) => setEditShortcodeValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                        placeholder="SHORTCODE"
                        className="w-28"
                        style={{ fontFamily: MONO, padding: '4px 8px', fontSize: 11 }}
                        maxLength={10}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleUpdateShortcode}
                        disabled={!editShortcodeValue || (editShortcodeValue !== selectedProject.projectShortcode && editShortcodeAvailable === false)}
                      >
                        <CheckCircle2 className="w-4 h-4" style={{ color: colors.accent.green }} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingShortcode(false)}
                      >
                        <AlertCircle className="w-4 h-4" style={{ color: colors.accent.red }} />
                      </Button>
                    </div>
                  ) : selectedProject.projectShortcode ? (
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: colors.bg.cardAlt,
                          color: colors.text.secondary,
                          border: `1px solid ${colors.border.default}`,
                        }}
                      >
                        {selectedProject.projectShortcode}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditShortcodeValue(selectedProject.projectShortcode || '');
                          setEditingShortcode(true);
                        }}
                        disabled={isUploading}
                      >
                        <Info className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <FlagChip label="Required" severity="warn" />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditShortcodeValue('');
                          setEditingShortcode(true);
                        }}
                        disabled={isUploading}
                      >
                        Set Shortcode
                      </Button>
                    </div>
                  )}
                </div>

                {editingShortcode && editShortcodeValue && editShortcodeValue !== selectedProject.projectShortcode && (
                  <p className="pl-6" style={{ fontSize: 10 }}>
                    {editShortcodeAvailable === undefined ? (
                      <span style={{ color: colors.text.muted }}>Checking availability...</span>
                    ) : editShortcodeAvailable ? (
                      <span style={{ color: colors.accent.green }}>Available</span>
                    ) : (
                      <span style={{ color: colors.accent.red }}>Already in use</span>
                    )}
                  </p>
                )}

                {!selectedProject.projectShortcode && !editingShortcode && (
                  <p className="pl-6" style={{ fontSize: 10, color: colors.accent.yellow }}>
                    A shortcode is required to generate standardized document names
                  </p>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Step 3/4: Options - Show for all scopes once destination is selected */}
      {(uploadScope === 'client' ? selectedClientId : true) && (
        <Panel title={`Step ${uploadScope === 'client' ? '4' : '3'}: Options`}>
          <div className="space-y-4">
            {/* Internal/External Toggle - Only show for client scope */}
            {uploadScope === 'client' && (
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="internal-toggle" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                    Internal Documents
                  </Label>
                  <p style={{ fontSize: 10, color: colors.text.muted }}>
                    Toggle on if these are internal RockCap documents
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 12, color: colors.text.muted }}>External</span>
                  <Switch
                    id="internal-toggle"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                    disabled={isUploading}
                  />
                  <span style={{ fontSize: 12, color: colors.text.muted }}>Internal</span>
                </div>
              </div>
            )}

            {/* Instructions */}
            <Field label="Additional Instructions (Optional)">
              <Textarea
                id="instructions"
                placeholder="Any additional context for the AI to consider when analyzing these documents..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={isUploading}
                style={{ minHeight: 80 }}
              />
            </Field>
          </div>
        </Panel>
      )}

      {/* Step 4/5: File Upload - Show for all scopes once destination is selected */}
      {(uploadScope === 'client' ? selectedClientId : true) && (
        <Panel title={`Step ${uploadScope === 'client' ? '5' : '4'}: Upload Files`}>
          <div className="space-y-4">
            <p style={{ fontSize: 12, color: colors.text.secondary }}>
              Drop up to {MAX_FILES} files or click to browse
            </p>
            {/* Drop Zone */}
            <div
              className="relative p-8 text-center"
              style={{
                border: `1px dashed ${isDragging ? colors.accent.blue : colors.border.mid}`,
                background: isDragging ? `${colors.accent.blue}15` : colors.bg.cardAlt,
                borderRadius: 4,
                cursor: 'pointer',
                pointerEvents: isUploading ? 'none' : 'auto',
                opacity: isUploading ? 0.5 : 1,
                transition: 'border-color 200ms linear, background 200ms linear',
              }}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onClick={() => !isUploading && document.getElementById('bulk-file-input')?.click()}
            >
              <input
                id="bulk-file-input"
                type="file"
                multiple
                className="hidden"
                onChange={handleFileInput}
                accept={FILE_INPUT_ACCEPT}
                disabled={isUploading}
              />
              {/* Folder input created dynamically on click — see openFolderPicker */}
              <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: colors.text.muted }} />
              <p style={{ fontSize: 15, fontWeight: 500, color: colors.text.primary }}>
                {isDragging ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p style={{ fontSize: 12, color: colors.text.muted, marginTop: 4 }}>
                or click to browse
              </p>
              <p style={{ fontSize: 10, color: colors.text.dim, marginTop: 8 }}>
                PDF, Word, Excel, CSV, TXT • Max 100MB per file
              </p>
            </div>

            {/* Browse / Upload Folder buttons */}
            <div className="flex items-center gap-2 justify-center">
              <Button variant="secondary" onClick={() => document.getElementById('bulk-file-input')?.click()} disabled={isUploading}>
                <FileText className="w-4 h-4" /> Browse Files
              </Button>
              <Button variant="secondary" onClick={openFolderPicker} disabled={isUploading}>
                <FolderOpen className="w-4 h-4" /> Upload Folder
              </Button>
            </div>

            {/* Detected projects from folder structure */}
            {detectedProjects.length > 0 && (
              <div
                className="rounded p-3"
                style={{ background: `${colors.accent.blue}15`, border: `1px solid ${colors.accent.blue}40`, fontSize: 12 }}
              >
                <p style={{ fontWeight: 500, color: colors.text.primary, marginBottom: 4 }}>
                  Detected {detectedProjects.length} project folder{detectedProjects.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {detectedProjects.map(name => (
                    <span
                      key={name}
                      className="flex items-center gap-1"
                      style={{
                        fontSize: 11,
                        padding: '2px 4px 2px 8px',
                        borderRadius: 4,
                        background: colors.bg.card,
                        color: colors.text.secondary,
                        border: `1px solid ${colors.border.default}`,
                      }}
                    >
                      {name}
                      <button
                        onClick={() => dismissDetectedProject(name)}
                        style={{ borderRadius: 9999, padding: 2, marginLeft: 2, background: 'transparent', border: 'none', cursor: 'pointer', color: colors.text.muted }}
                        title="Remove project detection — files will go to the selected project"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <p style={{ color: colors.text.muted, marginTop: 6, fontSize: 10 }}>
                  Projects will be created or matched during analysis. You can adjust in the review step.
                </p>
              </div>
            )}

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>
                    {files.length} file{files.length !== 1 ? 's' : ''} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFiles}
                    disabled={isUploading}
                  >
                    Clear all
                  </Button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between px-3 py-2"
                      style={{ background: colors.bg.cardAlt, borderRadius: 4 }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.muted }} />
                        <span className="truncate" style={{ fontSize: 12, color: colors.text.primary }}>{file.name}</span>
                        <span style={{ fontSize: 10, color: colors.text.muted }}>
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      {!isUploading && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between" style={{ fontSize: 12, color: colors.text.secondary }}>
                  <span>Processing: {uploadProgress.currentFile}</span>
                  <span>{uploadProgress.processed} / {uploadProgress.total}</span>
                </div>
                <Progress
                  value={(uploadProgress.processed / uploadProgress.total) * 100}
                />
                <div
                  className="p-3 rounded"
                  style={{ background: `${colors.accent.blue}15`, border: `1px solid ${colors.accent.blue}40` }}
                >
                  <p style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }}>You can safely navigate away</p>
                  <p style={{ fontSize: 10, color: colors.text.muted, marginTop: 4 }}>
                    Files are being analyzed in the background. You can start another upload, browse other pages, or come back later — you'll get a notification when it's done.
                  </p>
                </div>
              </div>
            )}

            {/* Shortcode warning */}
            {needsShortcode && (
              <div
                className="p-3 rounded"
                style={{ background: `${colors.accent.yellow}15`, border: `1px solid ${colors.accent.yellow}40`, fontSize: 12, color: colors.text.secondary }}
              >
                <span style={{ fontWeight: 500, color: colors.text.primary }}>Shortcode required:</span> Please set a project shortcode above before uploading. This is required to generate standardized document names.
              </div>
            )}

            {/* Start Button */}
            <Button
              variant="primary"
              onClick={handleStartUpload}
              disabled={!canStartUpload}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Start Bulk Upload
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </Panel>
      )}

      {/* New Project Dialog */}
      <Modal
        open={showNewProjectDialog}
        onClose={() => setShowNewProjectDialog(false)}
        title="Create New Project"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewProjectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateProject}
              disabled={!newProjectName || !newProjectShortcode || !shortcodeAvailable}
            >
              Create Project
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            Create a new project for {selectedClient?.name}
          </p>
          <Field label="Project Name">
            <Input
              id="project-name"
              placeholder="e.g., Wimbledon Park 28, SW8 1PQ"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                setNewProjectShortcode(''); // Reset to trigger new suggestion
              }}
            />
          </Field>
          <Field
            label="Project Shortcode (max 10 characters)"
            hint={`Used in document naming: ${newProjectShortcode || 'SHORTCODE'}-TYPE-INT-JS-V1.0-2026-01-12`}
          >
            <Input
              id="project-shortcode"
              placeholder="e.g., WIMBPARK28"
              value={newProjectShortcode}
              onChange={(e) => setNewProjectShortcode(e.target.value.toUpperCase().slice(0, 10))}
              maxLength={10}
              style={{ fontFamily: MONO }}
            />
            {newProjectShortcode && (
              <p style={{ fontSize: 10 }}>
                {shortcodeAvailable ? (
                  <span className="flex items-center gap-1" style={{ color: colors.accent.green }}>
                    <CheckCircle2 className="w-3 h-3" />
                    Shortcode available
                  </span>
                ) : (
                  <span className="flex items-center gap-1" style={{ color: colors.accent.red }}>
                    <AlertCircle className="w-3 h-3" />
                    Shortcode already in use
                  </span>
                )}
              </p>
            )}
          </Field>
        </div>
      </Modal>

      {/* New Client Dialog */}
      <Modal
        open={showNewClientDialog}
        onClose={() => setShowNewClientDialog(false)}
        title="Create New Client"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewClientDialog(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateClient} disabled={!newClientName}>
              Create Client
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            Add a new client to associate with this bulk upload
          </p>
          <Field label="Client Name *">
            <Input
              id="client-name"
              placeholder="e.g., Acme Property Holdings"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
            />
          </Field>
          <Field label="Client Type (Optional)">
            <Select
              value={newClientType}
              onChange={(e) => setNewClientType(e.target.value)}
            >
              <option value="">Select type...</option>
              <option value="borrower">Borrower</option>
              <option value="lender">Lender</option>
              <option value="developer">Developer</option>
              <option value="investor">Investor</option>
              <option value="other">Other</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Background Processing Dialog */}
      <Modal
        open={showBackgroundDialog}
        onClose={() => setShowBackgroundDialog(false)}
        title="Files Uploaded Successfully"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setShowBackgroundDialog(false);
                setFiles([]);
                router.push('/docs');
              }}
            >
              <FileText className="w-4 h-4" />
              Go to Documents
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowBackgroundDialog(false);
                setFiles([]);
                if (activeBatchId) {
                  router.push(`/docs/bulk/${activeBatchId}`);
                }
              }}
            >
              <Loader2 className="w-4 h-4" />
              Watch Progress
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" style={{ color: colors.accent.green }} />
            <span style={{ fontSize: 13, color: colors.text.secondary }}>
              Your {files.length} files are now being processed in the background.
            </span>
          </div>
          <div
            className="p-4 space-y-2"
            style={{ background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 4 }}
          >
            <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
              <span style={{ color: colors.text.muted }}>Estimated processing time</span>
              <span style={{ fontWeight: 500, color: colors.text.primary }}>~{estimatedMinutes} minute{estimatedMinutes !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
              <span style={{ color: colors.text.muted }}>Files</span>
              <span style={{ fontWeight: 500, color: colors.text.primary }}>{files.length} documents</span>
            </div>
          </div>
          <p style={{ fontSize: 12, color: colors.text.muted }}>
            You can navigate away and continue working. We&apos;ll send you a notification when processing is complete and your files are ready for review.
          </p>
        </div>
      </Modal>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <BulkUploadHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
