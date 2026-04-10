'use client';

import { useState, useRef, useMemo, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  ChevronRight,
  Search,
  X,
  Loader2,
  FileText,
  Table,
  FileType,
  Image,
  Mail,
  File,
  Plus,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  Upload,
  Check,
} from 'lucide-react';
import { getUserInitials } from '@/lib/documentNaming';
import type { BatchInfo } from '@/lib/bulkQueueProcessor';
import ScopeToggle, { type UploadScope } from './ScopeToggle';
import ShortcodeInput from './ShortcodeInput';
import FolderSheet from './FolderSheet';

const ACCEPTED_TYPES = '.pdf,.docx,.doc,.xls,.xlsx,.xlsm,.csv,.txt,.md,.eml,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif';
const MAX_FILES = 5;

interface InitialContext {
  clientId?: string;
  clientName?: string;
  projectId?: string;
  projectName?: string;
  folderTypeKey?: string;
  folderLevel?: 'client' | 'project';
  folderName?: string;
}

interface UploadSetupProps {
  initialContext?: InitialContext;
  onBatchCreated: (batchId: string, files: File[], batchInfo: BatchInfo) => void;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />;
  if (['xlsx', 'xls', 'xlsm', 'csv'].includes(ext)) return <Table className="w-5 h-5 text-green-600 flex-shrink-0" />;
  if (['docx', 'doc'].includes(ext)) return <FileType className="w-5 h-5 text-blue-600 flex-shrink-0" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return <Image className="w-5 h-5 text-purple-500 flex-shrink-0" />;
  if (ext === 'eml') return <Mail className="w-5 h-5 text-amber-600 flex-shrink-0" />;
  return <File className="w-5 h-5 text-[var(--m-text-tertiary)] flex-shrink-0" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadSetup({ initialContext, onBatchCreated }: UploadSetupProps) {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [scope, setScope] = useState<UploadScope>(initialContext?.clientId ? 'client' : 'client');
  const [clientId, setClientId] = useState<string | undefined>(initialContext?.clientId);
  const [clientName, setClientName] = useState<string | undefined>(initialContext?.clientName);
  const [projectId, setProjectId] = useState<string | undefined>(initialContext?.projectId);
  const [projectName, setProjectName] = useState<string | undefined>(initialContext?.projectName);
  const [projectShortcode, setProjectShortcode] = useState<string>('');
  const [folderKey, setFolderKey] = useState<string | null>(initialContext?.folderTypeKey || null);
  const [folderName, setFolderName] = useState<string | null>(initialContext?.folderName || null);
  const [folderLevel, setFolderLevel] = useState<'client' | 'project' | null>(initialContext?.folderLevel || null);
  const [isInternal, setIsInternal] = useState(false);
  const [deepExtraction, setDeepExtraction] = useState(false);
  const [instructions, setInstructions] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [showClientSheet, setShowClientSheet] = useState(false);
  const [showProjectSheet, setShowProjectSheet] = useState(false);
  const [showFolderSheet, setShowFolderSheet] = useState(false);
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Queries
  const currentUser = useQuery(api.users.getCurrent, {});
  const clients = useQuery(api.clients.list, scope === 'client' ? {} : 'skip');
  const projects = useQuery(
    api.projects.getByClient,
    scope === 'client' && clientId ? { clientId: clientId as Id<'clients'> } : 'skip'
  );
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    scope === 'client' && clientId ? { clientId: clientId as Id<'clients'> } : 'skip'
  );
  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    scope === 'client' && projectId ? { projectId: projectId as Id<'projects'> } : 'skip'
  );
  const projectChecklist = useQuery(
    api.knowledgeLibrary.getChecklistByProject,
    scope === 'client' && projectId ? { projectId: projectId as Id<'projects'> } : 'skip'
  );
  const clientChecklist = useQuery(
    api.knowledgeLibrary.getClientLevelChecklist,
    scope === 'client' && clientId && !projectId ? { clientId: clientId as Id<'clients'> } : 'skip'
  );

  // Mutations
  const createBatch = useMutation(api.bulkUpload.createBatch);
  const addItemToBatch = useMutation(api.bulkUpload.addItemToBatch);

  // Set project shortcode when project changes
  const selectedProject = useMemo(() => {
    if (!projects || !projectId) return null;
    return projects.find((p: any) => p._id === projectId) || null;
  }, [projects, projectId]);

  // Sync shortcode from selected project
  useMemo(() => {
    if (selectedProject?.projectShortcode) {
      setProjectShortcode(selectedProject.projectShortcode);
    }
  }, [selectedProject]);

  // Reset dependent state on scope change
  const handleScopeChange = useCallback((newScope: UploadScope) => {
    setScope(newScope);
    if (newScope !== 'client') {
      setClientId(undefined);
      setClientName(undefined);
      setProjectId(undefined);
      setProjectName(undefined);
      setProjectShortcode('');
    }
    setFolderKey(null);
    setFolderName(null);
    setFolderLevel(null);
    setIsInternal(newScope === 'internal');
  }, []);

  const handleClientSelect = useCallback((id: string, name: string) => {
    setClientId(id);
    setClientName(name);
    setProjectId(undefined);
    setProjectName(undefined);
    setProjectShortcode('');
    setFolderKey(null);
    setFolderName(null);
    setFolderLevel(null);
    setShowClientSheet(false);
  }, []);

  const handleProjectSelect = useCallback((id: string | undefined, name: string | undefined) => {
    setProjectId(id);
    setProjectName(name);
    setProjectShortcode('');
    setFolderKey(null);
    setFolderName(null);
    setFolderLevel(null);
    setShowProjectSheet(false);
  }, []);

  const handleFilesChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    setFiles((prev) => {
      const combined = [...prev, ...newFiles];
      if (combined.length > MAX_FILES) {
        alert(`Maximum ${MAX_FILES} files allowed. Only the first ${MAX_FILES} will be kept.`);
        return combined.slice(0, MAX_FILES);
      }
      return combined;
    });
    // Reset input so the same file can be re-added
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Validation
  const canSubmit = useMemo(() => {
    if (files.length === 0) return false;
    if (isSubmitting) return false;
    if (scope === 'client') {
      if (!clientId) return false;
      if (projectId && !projectShortcode) return false;
    }
    return true;
  }, [files.length, isSubmitting, scope, clientId, projectId, projectShortcode]);

  // Submit
  const handleSubmit = async () => {
    if (!canSubmit || !currentUser) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const uploaderInitials = getUserInitials(
        user?.fullName || user?.firstName || currentUser?.name || 'User'
      );

      // Build checklist items
      const rawChecklist = projectId ? projectChecklist : clientChecklist;
      const checklistForPipeline = (rawChecklist as any[])
        ?.filter((item: any) => item.status === 'missing' || item.status === 'pending_review')
        ?.map((item: any) => ({
          id: item._id,
          name: item.name || '',
          category: item.category,
          status: item.status,
          matchingDocumentTypes: item.matchingDocumentTypes,
        }));

      // Build available folders
      const foldersForPipeline: Array<{ folderKey: string; name: string; level: 'client' | 'project' }> = [];
      if (clientFolders) {
        for (const f of clientFolders as any[]) {
          foldersForPipeline.push({ folderKey: f.folderType, name: f.name, level: 'client' });
        }
      }
      if (projectFolders) {
        for (const f of projectFolders as any[]) {
          foldersForPipeline.push({ folderKey: f.folderType, name: f.name, level: 'project' });
        }
      }

      const batchId = await createBatch({
        scope,
        clientId: clientId ? (clientId as Id<'clients'>) : undefined,
        clientName,
        projectId: projectId ? (projectId as Id<'projects'>) : undefined,
        projectName,
        projectShortcode: projectShortcode || undefined,
        internalFolderId: scope === 'internal' ? folderKey || undefined : undefined,
        personalFolderId: scope === 'personal' ? folderKey || undefined : undefined,
        isInternal,
        instructions: instructions || undefined,
        uploaderInitials,
        userId: currentUser._id,
        totalFiles: files.length,
        processingMode: 'foreground',
      });

      for (const f of files) {
        await addItemToBatch({
          batchId,
          fileName: f.name,
          fileSize: f.size,
          fileType: f.type || 'application/octet-stream',
          folderHint: folderKey || undefined,
        });
      }

      const batchInfo: BatchInfo = {
        batchId,
        clientId: (clientId || '') as Id<'clients'>,
        clientName: clientName || '',
        projectId: projectId ? (projectId as Id<'projects'>) : undefined,
        projectShortcode: projectShortcode || undefined,
        isInternal,
        instructions: instructions || undefined,
        uploaderInitials,
        checklistItems: checklistForPipeline,
        availableFolders: foldersForPipeline.length > 0 ? foldersForPipeline : undefined,
      };

      onBatchCreated(batchId, files, batchInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create upload batch');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content — bottom padding clears fixed button + nav */}
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="px-[var(--m-page-px)] py-4 space-y-5">
          {/* Scope toggle */}
          <div>
            <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
              Upload Scope
            </label>
            <ScopeToggle value={scope} onChange={handleScopeChange} />
          </div>

          {/* Client picker (client scope only) */}
          {scope === 'client' && (
            <div>
              <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
                Client *
              </label>
              <button
                type="button"
                onClick={() => setShowClientSheet(true)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg text-left"
              >
                <span className={`text-[14px] ${clientName ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`}>
                  {clientName || 'Select client...'}
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              </button>
            </div>
          )}

          {/* Project picker (client scope + client selected) */}
          {scope === 'client' && clientId && (
            <div>
              <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
                Project
              </label>
              <button
                type="button"
                onClick={() => setShowProjectSheet(true)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg text-left"
              >
                <span className={`text-[14px] ${projectName ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`}>
                  {projectName || 'Client-level (no project)'}
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              </button>
            </div>
          )}

          {/* Shortcode (when project is selected) */}
          {scope === 'client' && projectId && (
            <div>
              <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
                Project Shortcode *
              </label>
              <ShortcodeInput
                projectId={projectId}
                projectName={projectName}
                value={projectShortcode}
                onChange={setProjectShortcode}
              />
            </div>
          )}

          {/* Folder picker */}
          <div>
            <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
              Folder
            </label>
            <button
              type="button"
              onClick={() => setShowFolderSheet(true)}
              disabled={scope === 'client' && !clientId}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg text-left disabled:opacity-40"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FolderOpen className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
                <span className={`text-[14px] truncate ${folderName ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`}>
                  {folderName || 'No specific folder'}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
            </button>
          </div>

          {/* Instructions (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setInstructionsExpanded(!instructionsExpanded)}
              className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2"
            >
              Instructions
              {instructionsExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              {instructions && !instructionsExpanded && (
                <Check className="w-3.5 h-3.5 text-green-600 ml-1" />
              )}
            </button>
            {instructionsExpanded && (
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional instructions for the AI classifier..."
                rows={3}
                className="w-full px-3 py-2.5 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-tertiary)] outline-none focus:border-[var(--m-text-secondary)] resize-none"
                style={{ fontSize: '16px' }}
              />
            )}
          </div>

          {/* Deep Extraction toggle */}
          {/* TODO: Wire deepExtraction to batch items after processing — currently UI-only.
              Desktop uses per-item extractionEnabled in review; mobile sets it as a batch-level
              setting here. Requires backend coordination to apply to items post-processing. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase block">
                Deep Extraction
              </label>
              <p className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 leading-relaxed">
                Run a detailed second-pass analysis on spreadsheets for full data extraction
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDeepExtraction(!deepExtraction)}
              className={`mt-0.5 w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                deepExtraction ? 'bg-[var(--m-text-primary)]' : 'bg-[var(--m-border)]'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  deepExtraction ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* File picker */}
          <div>
            <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
              Files ({files.length}/{MAX_FILES})
            </label>

            {/* File list */}
            {files.length > 0 && (
              <div className="mb-3 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] divide-y divide-[var(--m-border-subtle)]">
                {files.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="flex items-center gap-2.5 px-3 py-2.5">
                    {getFileIcon(f.name)}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[var(--m-text-primary)] truncate">{f.name}</div>
                      <div className="text-[11px] text-[var(--m-text-tertiary)]">{formatFileSize(f.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-1 text-[var(--m-text-tertiary)] active:text-[var(--m-text-primary)]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add files button */}
            {files.length < MAX_FILES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-[120px] flex flex-col items-center justify-center gap-2 bg-[var(--m-accent-subtle)] border-2 border-dashed border-[var(--m-accent-indicator)] rounded-xl text-[var(--m-accent-indicator)] active:opacity-80"
              >
                <div className="relative">
                  <File className="w-8 h-8" />
                  <Plus className="w-4 h-4 absolute -top-1 -right-1.5 bg-[var(--m-accent-subtle)] rounded-full" />
                </div>
                <span className="text-[13px] font-medium">Add Files</span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES}
              onChange={handleFilesChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Fixed footer — flush above nav bar */}
      <div
        className="fixed left-0 right-0 border-t border-[var(--m-border)] px-[var(--m-page-px)] pt-3 pb-3 bg-[var(--m-bg)] z-20"
        style={{ bottom: 'calc(var(--m-footer-h) + env(safe-area-inset-bottom, 0px))' }}
      >
        {error && (
          <div className="text-[11px] text-red-500 pb-2">{error}</div>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 text-center text-[15px] font-semibold text-white bg-[var(--m-text-primary)] rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating batch...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload &amp; Analyze
            </>
          )}
        </button>
      </div>

      {/* Client picker sheet */}
      {showClientSheet && (
        <PickerSheet
          title="Select Client"
          items={(clients as any[])?.map((c: any) => ({ id: c._id, label: c.name })) || []}
          selectedId={clientId}
          onSelect={(id, label) => handleClientSelect(id, label)}
          onClose={() => setShowClientSheet(false)}
          isLoading={clients === undefined}
        />
      )}

      {/* Project picker sheet */}
      {showProjectSheet && (
        <PickerSheet
          title="Select Project"
          items={[
            { id: '__none__', label: 'Client-level (no project)' },
            ...((projects as any[])?.map((p: any) => ({ id: p._id, label: p.name })) || []),
          ]}
          selectedId={projectId || '__none__'}
          onSelect={(id, label) => {
            if (id === '__none__') {
              handleProjectSelect(undefined, undefined);
            } else {
              handleProjectSelect(id, label);
            }
          }}
          onClose={() => setShowProjectSheet(false)}
          isLoading={projects === undefined}
        />
      )}

      {/* Folder sheet */}
      {showFolderSheet && (
        <FolderSheet
          scope={scope}
          clientId={clientId}
          projectId={projectId}
          selectedFolderKey={folderKey}
          onSelect={(key, name, level) => {
            setFolderKey(key);
            setFolderName(name);
            setFolderLevel(level);
          }}
          onClose={() => setShowFolderSheet(false)}
        />
      )}
    </div>
  );
}

/* --- Reusable searchable picker sheet --- */

interface PickerSheetProps {
  title: string;
  items: Array<{ id: string; label: string }>;
  selectedId?: string;
  onSelect: (id: string, label: string) => void;
  onClose: () => void;
  isLoading?: boolean;
}

function PickerSheet({ title, items, selectedId, onSelect, onClose, isLoading }: PickerSheetProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(lower));
  }, [items, search]);

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[80vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-[var(--m-page-px)] pt-1 pb-3 border-b border-[var(--m-border)] flex-shrink-0">
          <div className="text-[15px] font-semibold text-[var(--m-text-primary)]">{title}</div>
        </div>

        {/* Search */}
        <div className="px-[var(--m-page-px)] py-2 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg">
            <Search className="w-4 h-4 text-[var(--m-text-tertiary)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent text-[14px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-tertiary)] outline-none"
              style={{ fontSize: '16px' }}
              autoFocus
            />
            {search && (
              <button type="button" onClick={() => setSearch('')}>
                <X className="w-4 h-4 text-[var(--m-text-tertiary)]" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-[12px] text-[var(--m-text-tertiary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
              No results found
            </div>
          )}

          {filtered.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id, item.label)}
                className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                  isSelected ? 'bg-[var(--m-bg-subtle)]' : ''
                }`}
              >
                <span className={`flex-1 text-[14px] ${item.id === '__none__' ? 'text-[var(--m-text-secondary)] italic' : 'text-[var(--m-text-primary)]'}`}>
                  {item.label}
                </span>
                {isSelected && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <div className="flex-shrink-0 border-t border-[var(--m-border)] px-[var(--m-page-px)] pt-2.5 pb-1">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-center text-[14px] font-medium text-[var(--m-text-secondary)] bg-[var(--m-bg-inset)] rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
