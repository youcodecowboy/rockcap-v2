'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
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
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getUserInitials } from '@/lib/documentNaming';
import { BulkQueueProcessor, createBulkQueueProcessor, BatchInfo } from '@/lib/bulkQueueProcessor';

const MAX_FILES = 100;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const BACKGROUND_THRESHOLD = 5; // Files > this threshold trigger background processing
const ESTIMATED_SECONDS_PER_FILE = 20;

interface BulkUploadProps {
  onBatchCreated?: (batchId: Id<"bulkUploadBatches">) => void;
  onComplete?: (batchId: Id<"bulkUploadBatches">) => void;
}

export default function BulkUpload({ onBatchCreated, onComplete }: BulkUploadProps) {
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

  // Background processing state (for >5 files)
  const [showBackgroundDialog, setShowBackgroundDialog] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(0);

  // Queries
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(
    api.projects.list,
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
  const shortcodeSuggestion = useQuery(
    api.projects.suggestShortcode,
    newProjectName ? { name: newProjectName } : "skip"
  );
  const shortcodeAvailable = useQuery(
    api.projects.isShortcodeAvailable,
    newProjectShortcode ? { shortcode: newProjectShortcode } : "skip"
  );
  const currentUser = useQuery(api.users.getCurrent, {});

  // Mutations
  const createBatch = useMutation(api.bulkUpload.createBatch);
  const addItemToBatch = useMutation(api.bulkUpload.addItemToBatch);
  const updateItemStatus = useMutation(api.bulkUpload.updateItemStatus);
  const updateItemAnalysis = useMutation(api.bulkUpload.updateItemAnalysis);
  const updateBatchStatus = useMutation(api.bulkUpload.updateBatchStatus);
  const checkForDuplicates = useQuery(api.bulkUpload.checkForDuplicates, "skip");
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
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

  // File handling
  const handleFiles = useCallback((newFiles: File[]) => {
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of newFiles) {
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

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, [handleFiles]);

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
        instructions: instructions || undefined,
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

        // Start background processing
        await startBackgroundProcessing({
          batchId,
          baseUrl: window.location.origin,
        });

        // Show toast and navigate to review page
        setIsUploading(false);
        setFiles([]);

        toast.success('Files uploaded successfully', {
          description: `${files.length} files are processing in the background (~${estimatedMins} min). You'll be notified when ready.`,
          duration: 5000,
          action: {
            label: 'Watch Progress',
            onClick: () => router.push(`/docs/bulk/${batchId}`),
          },
        });

        // Navigate to review page to watch progress
        router.push(`/docs/bulk/${batchId}`);

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
          }
        );

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
        };
        processor.setBatchInfo(batchInfo);

        // Add all files to processor
        for (const file of files) {
          const itemId = await addItemToBatch({
            batchId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          });
          processor.addItem(itemId, file);
        }

        // Start processing
        await processor.processQueue();

        // Navigate to review page
        router.push(`/docs/bulk/${batchId}`);
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

  return (
    <div className="space-y-6">
      {/* Step 1: Document Scope Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5" />
            Step 1: Document Type
          </CardTitle>
          <CardDescription>
            Choose where these documents should be stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => {
                setUploadScope('client');
                setSelectedInternalFolderId('');
                setSelectedPersonalFolderId('');
              }}
              disabled={isUploading}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                ${uploadScope === 'client'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-border hover:border-blue-300 hover:bg-blue-50/50'}
                ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <Building2 className="w-6 h-6" />
              <span className="font-medium text-sm">Client Documents</span>
              <span className="text-xs text-muted-foreground text-center">
                For client/project files
              </span>
            </button>

            <button
              onClick={() => {
                setUploadScope('internal');
                setSelectedClientId('');
                setSelectedProjectId('');
                setSelectedPersonalFolderId('');
              }}
              disabled={isUploading}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                ${uploadScope === 'internal'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-border hover:border-amber-300 hover:bg-amber-50/50'}
                ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <Building className="w-6 h-6" />
              <span className="font-medium text-sm">RockCap Internal</span>
              <span className="text-xs text-muted-foreground text-center">
                Company-wide documents
              </span>
            </button>

            <button
              onClick={() => {
                setUploadScope('personal');
                setSelectedClientId('');
                setSelectedProjectId('');
                setSelectedInternalFolderId('');
              }}
              disabled={isUploading}
              className={`
                flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                ${uploadScope === 'personal'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-border hover:border-purple-300 hover:bg-purple-50/50'}
                ${isUploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <User className="w-6 h-6" />
              <span className="font-medium text-sm">Personal</span>
              <span className="text-xs text-muted-foreground text-center">
                Private to you only
              </span>
            </button>
          </div>

          {uploadScope === 'personal' && (
            <div className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
              <Lock className="w-4 h-4 flex-shrink-0" />
              <span>Personal documents are only visible to you.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Client Selection (Client scope only) */}
      {uploadScope === 'client' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5" />
              Step 2: Select Client
            </CardTitle>
            <CardDescription>
              All files in this batch will be associated with this client
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={selectedClientId || ''}
              onValueChange={(value) => {
                setSelectedClientId(value as Id<"clients">);
                setSelectedProjectId(''); // Reset project when client changes
              }}
              disabled={isUploading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client..." />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client._id} value={client._id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewClientDialog(true)}
              disabled={isUploading}
            >
              + Create New Client
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Internal Folder Selection (Internal scope only) */}
      {uploadScope === 'internal' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="w-5 h-5" />
              Step 2: Select Folder (Optional)
            </CardTitle>
            <CardDescription>
              Choose where to store these internal documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={selectedInternalFolderId || 'miscellaneous'}
              onValueChange={setSelectedInternalFolderId}
              disabled={isUploading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a folder..." />
              </SelectTrigger>
              <SelectContent>
                {internalFolders?.map((folder) => (
                  <SelectItem key={folder.folderType} value={folder.folderType}>
                    {folder.name}
                  </SelectItem>
                ))}
                {(!internalFolders || internalFolders.length === 0) && (
                  <SelectItem value="miscellaneous">Miscellaneous</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              If no folder is selected, documents will be placed in Miscellaneous.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Personal Folder Selection (Personal scope only) */}
      {uploadScope === 'personal' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="w-5 h-5" />
              Step 2: Select Folder (Optional)
            </CardTitle>
            <CardDescription>
              Choose where to store your personal documents
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={selectedPersonalFolderId || 'my_documents'}
              onValueChange={setSelectedPersonalFolderId}
              disabled={isUploading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a folder..." />
              </SelectTrigger>
              <SelectContent>
                {personalFolders?.map((folder) => (
                  <SelectItem key={folder.folderType} value={folder.folderType}>
                    {folder.name}
                  </SelectItem>
                ))}
                {(!personalFolders || personalFolders.length === 0) && (
                  <SelectItem value="my_documents">My Documents</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              If no folder is selected, documents will be placed in My Documents.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Project Selection (Optional) - Client scope only */}
      {uploadScope === 'client' && selectedClientId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="w-5 h-5" />
              Step 3: Select Project (Optional)
            </CardTitle>
            <CardDescription>
              Optionally associate files with a specific project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={selectedProjectId || 'none'}
              onValueChange={(value) => setSelectedProjectId(value === 'none' ? '' : value as Id<"projects">)}
              disabled={isUploading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project (optional)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project (Client-level documents)</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                    {project.projectShortcode && (
                      <span className="ml-2 text-muted-foreground">
                        ({project.projectShortcode})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewProjectDialog(true)}
              disabled={isUploading}
            >
              + Create New Project
            </Button>

            {selectedProject && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Project shortcode:</span>
                  
                  {editingShortcode ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editShortcodeValue}
                        onChange={(e) => setEditShortcodeValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                        placeholder="SHORTCODE"
                        className="h-7 w-28 text-xs font-mono"
                        maxLength={10}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={handleUpdateShortcode}
                        disabled={!editShortcodeValue || (editShortcodeValue !== selectedProject.projectShortcode && editShortcodeAvailable === false)}
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditingShortcode(false)}
                      >
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  ) : selectedProject.projectShortcode ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">{selectedProject.projectShortcode}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
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
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                        Required
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs"
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
                  <p className="text-xs pl-6">
                    {editShortcodeAvailable === undefined ? (
                      <span className="text-muted-foreground">Checking availability...</span>
                    ) : editShortcodeAvailable ? (
                      <span className="text-green-600">✓ Available</span>
                    ) : (
                      <span className="text-red-600">✗ Already in use</span>
                    )}
                  </p>
                )}
                
                {!selectedProject.projectShortcode && !editingShortcode && (
                  <p className="text-xs text-amber-600 pl-6">
                    A shortcode is required to generate standardized document names
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3/4: Options - Show for all scopes once destination is selected */}
      {(uploadScope === 'client' ? selectedClientId : true) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" />
              Step {uploadScope === 'client' ? '4' : '3'}: Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Internal/External Toggle - Only show for client scope */}
            {uploadScope === 'client' && (
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="internal-toggle" className="text-sm font-medium">
                    Internal Documents
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Toggle on if these are internal RockCap documents
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">External</span>
                  <Switch
                    id="internal-toggle"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                    disabled={isUploading}
                  />
                  <span className="text-sm text-muted-foreground">Internal</span>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="instructions" className="text-sm font-medium">
                Additional Instructions (Optional)
              </Label>
              <Textarea
                id="instructions"
                placeholder="Any additional context for the AI to consider when analyzing these documents..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={isUploading}
                className="h-20"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4/5: File Upload - Show for all scopes once destination is selected */}
      {(uploadScope === 'client' ? selectedClientId : true) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="w-5 h-5" />
              Step {uploadScope === 'client' ? '5' : '4'}: Upload Files
            </CardTitle>
            <CardDescription>
              Drop up to {MAX_FILES} files or click to browse
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drop Zone */}
            <div
              className={`
                relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                transition-colors duration-200
                ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                ${isUploading ? 'pointer-events-none opacity-50' : ''}
              `}
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
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt"
                disabled={isUploading}
              />
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium">
                {isDragging ? 'Drop files here' : 'Drag & drop files here'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, Word, Excel, CSV, TXT • Max 100MB per file
              </p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
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
                      className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-md"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      {!isUploading && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing: {uploadProgress.currentFile}</span>
                  <span>{uploadProgress.processed} / {uploadProgress.total}</span>
                </div>
                <Progress 
                  value={(uploadProgress.processed / uploadProgress.total) * 100} 
                />
              </div>
            )}

            {/* Shortcode warning */}
            {needsShortcode && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="font-medium">⚠️ Shortcode Required:</span> Please set a project shortcode above before uploading. This is required to generate standardized document names.
              </div>
            )}

            {/* Start Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={handleStartUpload}
              disabled={!canStartUpload}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Start Bulk Upload
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* New Project Dialog */}
      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Create a new project for {selectedClient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g., Wimbledon Park 28, SW8 1PQ"
                value={newProjectName}
                onChange={(e) => {
                  setNewProjectName(e.target.value);
                  setNewProjectShortcode(''); // Reset to trigger new suggestion
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-shortcode">
                Project Shortcode (max 10 characters)
              </Label>
              <Input
                id="project-shortcode"
                placeholder="e.g., WIMBPARK28"
                value={newProjectShortcode}
                onChange={(e) => setNewProjectShortcode(e.target.value.toUpperCase().slice(0, 10))}
                maxLength={10}
              />
              {newProjectShortcode && (
                <p className="text-xs">
                  {shortcodeAvailable ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Shortcode available
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Shortcode already in use
                    </span>
                  )}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Used in document naming: {newProjectShortcode || 'SHORTCODE'}-TYPE-INT-JS-V1.0-2026-01-12
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProjectDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateProject}
              disabled={!newProjectName || !newProjectShortcode || !shortcodeAvailable}
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Client Dialog */}
      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
            <DialogDescription>
              Add a new client to associate with this bulk upload
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name *</Label>
              <Input
                id="client-name"
                placeholder="e.g., Acme Property Holdings"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-type">Client Type (Optional)</Label>
              <Select
                value={newClientType}
                onValueChange={setNewClientType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="borrower">Borrower</SelectItem>
                  <SelectItem value="lender">Lender</SelectItem>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="investor">Investor</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewClientDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateClient}
              disabled={!newClientName}
            >
              Create Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Background Processing Dialog */}
      <Dialog open={showBackgroundDialog} onOpenChange={setShowBackgroundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Files Uploaded Successfully
            </DialogTitle>
            <DialogDescription>
              Your {files.length} files are now being processed in the background.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated processing time</span>
                <span className="font-medium">~{estimatedMinutes} minute{estimatedMinutes !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Files</span>
                <span className="font-medium">{files.length} documents</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              You can navigate away and continue working. We&apos;ll send you a notification when processing is complete and your files are ready for review.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowBackgroundDialog(false);
                setFiles([]);
                router.push('/docs');
              }}
              className="w-full sm:w-auto"
            >
              <FileText className="w-4 h-4 mr-2" />
              Go to Documents
            </Button>
            <Button
              onClick={() => {
                setShowBackgroundDialog(false);
                setFiles([]);
                if (activeBatchId) {
                  router.push(`/docs/bulk/${activeBatchId}`);
                }
              }}
              className="w-full sm:w-auto"
            >
              <Loader2 className="w-4 h-4 mr-2" />
              Watch Progress
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
