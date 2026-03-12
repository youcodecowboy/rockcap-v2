'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { useUser } from '@clerk/nextjs';
import { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  Building2,
  FolderOpen,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileCheck,
  RefreshCw,
  Pencil,
  Check,
  X,
  ExternalLink,
  ClipboardList,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import BulkReviewTable from '@/components/BulkReviewTable';
import NewProjectsPanel, { NewProjectEntry, buildNewProjectEntries } from '@/components/NewProjectsPanel';
import VersionCandidatesPanel from '@/components/VersionCandidatesPanel';
import { buildVersionCandidateGroups } from '@/lib/versionDetection';
import UploadMoreModal from './components/UploadMoreModal';
import { getUserInitials } from '@/lib/documentNaming';
import { toast } from 'sonner';

export default function BulkReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const batchId = params.batchId as Id<"bulkUploadBatches">;

  const [isFilingAll, setIsFilingAll] = useState(false);
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [showFileAllDialog, setShowFileAllDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showUploadMore, setShowUploadMore] = useState(false);
  const [filingResult, setFilingResult] = useState<{ totalFiled: number; totalErrors: number } | null>(null);
  
  // Shortcode editing state
  const [isEditingShortcode, setIsEditingShortcode] = useState(false);
  const [shortcodeInput, setShortcodeInput] = useState('');
  const [shortcodeSaving, setShortcodeSaving] = useState(false);

  // New projects panel state
  const [newProjects, setNewProjects] = useState<NewProjectEntry[]>([]);
  const [isCreatingProjects, setIsCreatingProjects] = useState(false);

  // Queries
  const batch = useQuery(api.bulkUpload.getBatch, { batchId });
  const items = useQuery(api.bulkUpload.getBatchItems, { batchId });
  const stats = useQuery(api.bulkUpload.getBatchStats, { batchId });
  const currentUser = useQuery(api.users.getCurrent, {});

  // Compute effective projectId for checklist: use per-item project assignment if batch has none
  const effectiveProjectId = useMemo(() => {
    if (batch?.projectId) return batch.projectId;
    if (!items) return undefined;
    const projectIds = items.map((i: any) => i.itemProjectId).filter(Boolean);
    if (projectIds.length > 0) return projectIds[0];
    return undefined;
  }, [batch?.projectId, items]);

  // Query checklist items — includes project-level items when items are assigned to a project
  // @ts-ignore - Known Convex TypeScript type instantiation depth issue
  const checklistItems = useQuery(
    api.knowledgeLibrary.getAllChecklistItemsForClient,
    batch?.clientId ? { clientId: batch.clientId, projectId: effectiveProjectId } : "skip"
  );
  
  // Calculate checklist stats
  const checklistStats = useMemo(() => {
    if (!checklistItems) return null;
    const total = checklistItems.length;
    const fulfilled = checklistItems.filter((i: any) => i.status === 'fulfilled').length;
    const missing = total - fulfilled;
    return { total, fulfilled, missing };
  }, [checklistItems]);
  
  // Query projects for multi-project batches (also fetches when items suggest new projects)
  const clientProjects = useQuery(
    api.projects.getByClient,
    batch?.clientId ? { clientId: batch.clientId } : "skip"
  );

  // Check shortcode availability
  const shortcodeAvailable = useQuery(
    api.projects.isShortcodeAvailable,
    shortcodeInput && shortcodeInput !== batch?.projectShortcode 
      ? { shortcode: shortcodeInput } 
      : "skip"
  );

  // Mutations
  const fileBatch = useMutation(api.bulkUpload.fileBatch);
  const updateProject = useMutation(api.projects.update);
  const updateBatch = useMutation(api.bulkUpload.updateBatchStatus);
  const retryItem = useMutation(api.bulkBackgroundProcessor.retryItem);
  const createBulkUploadProjects = useMutation(api.bulkUpload.createBulkUploadProjects);
  const updateItemProject = useMutation(api.bulkUpload.updateItemProject);
  const discardBatch = useMutation(api.bulkUpload.discardBatch);
  const applyVersionLabels = useMutation(api.bulkUpload.applyVersionLabels);
  const deleteItemsMutation = useMutation(api.bulkUpload.deleteItems);

  // Initialize shortcode input when batch loads
  useEffect(() => {
    if (batch?.projectShortcode) {
      setShortcodeInput(batch.projectShortcode);
    }
  }, [batch?.projectShortcode]);

  // Build new projects list when items and client projects load
  // Detects new projects from items with suggestedProjectName (works even if isMultiProject wasn't set)
  useEffect(() => {
    if (!items || batch?.status !== 'review') {
      setNewProjects([]);
      return;
    }
    // Check if any items have suggested project names (auto-detect multi-project)
    const hasSuggestedProjects = items.some((i: any) => i.suggestedProjectName && !i.itemProjectId);
    if (!batch?.isMultiProject && !hasSuggestedProjects) {
      setNewProjects([]);
      return;
    }
    const existingNames = (clientProjects || []).map((p: any) => p.name);
    const entries = buildNewProjectEntries(items as any, existingNames);
    setNewProjects(entries);
  }, [items, clientProjects, batch?.isMultiProject, batch?.status]);

  // Build version candidate groups from items
  const versionCandidateGroups = useMemo(() => {
    if (!items || batch?.status !== 'review') return [];
    return buildVersionCandidateGroups(items as any);
  }, [items, batch?.status]);

  // Handle creating new projects from the panel (before filing)
  const handleCreateProjects = async (enabledProjects: NewProjectEntry[]) => {
    if (!batch) return;
    setIsCreatingProjects(true);
    try {
      // Create projects and get mapping
      const mapping = await createBulkUploadProjects({
        batchId,
        newProjects: enabledProjects.map(p => ({
          suggestedName: p.suggestedName,
          name: p.name.trim(),
          projectShortcode: p.projectShortcode.trim().toUpperCase(),
        })),
      });

      // Assign items to the newly created projects
      if (mapping && items) {
        const projectMap = new Map<string, any>();
        for (const entry of mapping) {
          projectMap.set(entry.suggestedName.toLowerCase(), entry.projectId);
        }

        // Also map merged suggested names to the same project
        for (const proj of enabledProjects) {
          if (proj.mergedSuggestedNames && proj.mergedSuggestedNames.length > 1) {
            const projectId = projectMap.get(proj.suggestedName.toLowerCase());
            if (projectId) {
              for (const name of proj.mergedSuggestedNames) {
                projectMap.set(name.toLowerCase(), projectId);
              }
            }
          }
        }

        // Also build set of disabled project names (unchecked by user)
        const disabledNames = new Set(
          newProjects
            .filter(p => !p.enabled)
            .map(p => p.suggestedName.toLowerCase())
        );

        // Default project: if user only created one project, unmatched items go there
        const defaultProjectId = mapping.length === 1 ? mapping[0].projectId : null;

        for (const item of items as any[]) {
          if (item.suggestedProjectName && !item.itemProjectId) {
            const suggestedKey = item.suggestedProjectName.toLowerCase();
            const projectId = projectMap.get(suggestedKey);
            if (projectId) {
              // Direct match — assign to the created project
              await updateItemProject({ itemId: item._id, itemProjectId: projectId, isClientLevel: false });
            } else if (disabledNames.has(suggestedKey) && defaultProjectId) {
              // Suggested project was rejected — assign to the remaining project
              await updateItemProject({ itemId: item._id, itemProjectId: defaultProjectId, isClientLevel: false });
            }
          }
        }
      }

      // Clear new projects panel — they're now existing projects
      setNewProjects([]);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create projects');
    } finally {
      setIsCreatingProjects(false);
    }
  };

  const handleApplyVersions = async (versions: Array<{ itemId: any; version: string; isBase: boolean }>) => {
    if (!batch) return;
    await applyVersionLabels({ batchId: batch._id, versions });
    toast.success(`Applied version labels to ${versions.length} items`);
  };

  const handleDeleteItems = async (itemIds: any[]) => {
    if (!batch) return;
    await deleteItemsMutation({ batchId: batch._id, itemIds });
    toast.success(`Deleted ${itemIds.length} items`);
  };

  // Handle shortcode save
  const handleSaveShortcode = async () => {
    if (!batch?.projectId || !shortcodeInput || shortcodeInput.length === 0) return;
    if (shortcodeInput !== batch.projectShortcode && shortcodeAvailable === false) return;
    
    setShortcodeSaving(true);
    try {
      // Update project shortcode
      await updateProject({
        id: batch.projectId,
        projectShortcode: shortcodeInput.toUpperCase(),
      });
      
      // Update batch shortcode 
      await updateBatch({
        batchId,
        projectShortcode: shortcodeInput.toUpperCase(),
      });
      
      setIsEditingShortcode(false);
    } catch (error) {
      console.error('Failed to save shortcode:', error);
      alert(error instanceof Error ? error.message : 'Failed to save shortcode');
    } finally {
      setShortcodeSaving(false);
    }
  };

  // Detect multi-project mode: batch flag, suggested projects, OR items assigned to different projects
  const isEffectivelyMultiProject = useMemo(() => {
    if (batch?.isMultiProject) return true;
    if (!items) return false;
    // Any item with a suggested project name (even if already assigned) = multi-project
    if (items.some((i: any) => i.suggestedProjectName)) return true;
    // Items assigned to different projects = multi-project
    const projectIds = new Set(items.map((i: any) => i.itemProjectId).filter(Boolean));
    return projectIds.size > 1 || (projectIds.size === 1 && !batch?.projectId);
  }, [batch?.isMultiProject, batch?.projectId, items]);

  // Effective project name — resolves from batch or from item assignments
  const effectiveProjectName = useMemo(() => {
    if (batch?.projectName) return batch.projectName;
    if (effectiveProjectId && clientProjects) {
      const project = clientProjects.find((p: any) => p._id === effectiveProjectId);
      if (project) return project.name;
    }
    return null;
  }, [batch?.projectName, effectiveProjectId, clientProjects]);

  // Computed values
  const uploaderInitials = useMemo(() => {
    const name = user?.fullName || user?.firstName || currentUser?.name || 'User';
    return getUserInitials(name);
  }, [user, currentUser]);

  const progress = useMemo(() => {
    if (!batch) return 0;
    return batch.totalFiles > 0 ? (batch.processedFiles / batch.totalFiles) * 100 : 0;
  }, [batch]);

  const canFileAll = useMemo(() => {
    if (!stats) return false;
    return stats.statusCounts.ready_for_review > 0 && stats.unresolvedDuplicates === 0;
  }, [stats]);

  const hasNewProjectDuplicates = useMemo(() => {
    const enabled = newProjects.filter(p => p.enabled);
    const shortcodes = enabled.map(p => p.projectShortcode.toUpperCase());
    return new Set(shortcodes).size !== shortcodes.length;
  }, [newProjects]);

  // Handle file all
  const handleFileAll = async () => {
    if (!batch || !canFileAll) return;

    setShowFileAllDialog(false);
    setIsFilingAll(true);

    try {
      // Step 1: Create new projects if any are enabled
      let projectMapping: { suggestedName: string; projectId: any }[] | undefined;
      const enabledProjects = newProjects.filter(p => p.enabled && p.name.trim() && p.projectShortcode.trim());

      if (enabledProjects.length > 0) {
        projectMapping = await createBulkUploadProjects({
          batchId,
          newProjects: enabledProjects.map(p => ({
            suggestedName: p.suggestedName,
            name: p.name.trim(),
            projectShortcode: p.projectShortcode.trim().toUpperCase(),
          })),
        });
      }

      // Step 2: File all items with the project mapping
      const result = await fileBatch({
        batchId,
        uploaderInitials,
        projectMapping,
      });
      setFilingResult(result);

      // NOTE: process-extraction-queue call removed — V4 pipeline handles
      // extraction during the initial analysis stage, making the post-filing
      // extraction queue redundant.
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to file documents');
    } finally {
      setIsFilingAll(false);
    }
  };

  // Retry all stuck items handler
  const handleRetryAllStuck = async () => {
    if (!items) return;
    const stuckItems = items.filter((i: any) => i.status === 'processing' || i.status === 'error');
    if (stuckItems.length === 0) return;

    setIsRetryingAll(true);
    try {
      for (const item of stuckItems) {
        await retryItem({ itemId: item._id, batchId, baseUrl: window.location.origin });
      }
    } catch (e) {
      console.error('Failed to retry all stuck items:', e);
    } finally {
      setIsRetryingAll(false);
    }
  };

  // Loading state
  if (!batch || !items || !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Discarded batch — redirect
  if (batch.isDeleted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Trash2 className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground">This upload has been discarded.</p>
        <Button variant="outline" onClick={() => router.push('/filing')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Filing
        </Button>
      </div>
    );
  }

  // Stuck items count
  const stuckCount = items?.filter((i: any) => i.status === 'processing' || i.status === 'error').length ?? 0;

  // Get status info
  const getStatusInfo = () => {
    switch (batch.status) {
      case 'uploading':
        return { label: 'Uploading', color: 'bg-blue-100 text-blue-700', icon: Loader2 };
      case 'processing':
        return { label: 'Processing', color: 'bg-blue-100 text-blue-700', icon: Loader2 };
      case 'review':
        return { label: 'Ready for Review', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle };
      case 'completed':
        return { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle2 };
      case 'partial':
        return { label: 'Partially Completed', color: 'bg-orange-100 text-orange-700', icon: AlertTriangle };
      default:
        return { label: batch.status, color: 'bg-gray-100 text-gray-700', icon: Clock };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <div className="px-6 py-4 max-w-[1600px] mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/filing')}
            className="h-8"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Bulk Upload Review</h1>
            <p className="text-sm text-muted-foreground">
              Review and file {batch.totalFiles} documents
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={statusInfo.color}>
            <StatusIcon className={`w-3 h-3 mr-1 ${batch.status === 'processing' || batch.status === 'uploading' ? 'animate-spin' : ''}`} />
            {statusInfo.label}
          </Badge>
          {batch.status !== 'completed' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setShowDiscardDialog(true)}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Discard
            </Button>
          )}
        </div>
      </div>

      {/* Batch Info - Compact horizontal layout */}
      <div className="flex flex-wrap items-stretch gap-3">
        {/* Client Card - Clickable */}
        <Card 
          className="flex-1 min-w-[180px] cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => router.push(`/clients/${batch.clientId}`)}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Client</p>
              <p className="font-medium text-sm truncate">{batch.clientName}</p>
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          </CardContent>
        </Card>

        {/* Project Card - Clickable if has project */}
        <Card 
          className={`flex-1 min-w-[200px] ${batch.projectId ? 'cursor-pointer hover:border-primary/50' : ''} transition-colors`}
          onClick={() => batch.projectId && router.push(`/docs/project/${batch.projectId}`)}
        >
          <CardContent className="p-3 flex items-center gap-3">
            <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Project</p>
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">
                  {effectiveProjectName || 'Client-level'}
                </p>
                {batch.projectId && (
                  isEditingShortcode ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={shortcodeInput}
                        onChange={(e) => setShortcodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                        placeholder="CODE"
                        className="h-5 w-16 text-[10px] font-mono uppercase px-1"
                        maxLength={10}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                        onClick={(e) => { e.stopPropagation(); handleSaveShortcode(); }}
                        disabled={shortcodeSaving || !shortcodeInput || (shortcodeInput !== batch.projectShortcode && shortcodeAvailable === false)}
                      >
                        {shortcodeSaving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5 text-green-600" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 w-5 p-0"
                        onClick={(e) => { e.stopPropagation(); setIsEditingShortcode(false); setShortcodeInput(batch.projectShortcode || ''); }}
                      >
                        <X className="w-2.5 h-2.5 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <Badge 
                      variant={batch.projectShortcode ? "secondary" : "outline"} 
                      className={`text-[10px] h-5 font-mono ${!batch.projectShortcode ? 'text-amber-600 border-amber-300' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setShortcodeInput(batch.projectShortcode || ''); setIsEditingShortcode(true); }}
                    >
                      {batch.projectShortcode || 'Set code'}
                      <Pencil className="w-2 h-2 ml-1" />
                    </Badge>
                  )
                )}
              </div>
            </div>
            {batch.projectId && <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
          </CardContent>
        </Card>

        {/* Progress Card - Compact */}
        <Card className="flex-1 min-w-[160px]">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Progress</p>
                <Progress value={progress} className="h-1.5 mt-1" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {batch.processedFiles} processed · {batch.filedFiles} filed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist Status Card - Only show if checklist items exist */}
        {checklistStats && checklistStats.total > 0 && (
          <Card 
            className="flex-1 min-w-[140px] cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => router.push(`/clients/${batch.clientId}?tab=checklist`)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <ClipboardList className={`w-4 h-4 flex-shrink-0 ${checklistStats.missing > 0 ? 'text-amber-500' : 'text-green-500'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Checklist</p>
                <p className={`font-medium text-sm ${checklistStats.missing > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                  {checklistStats.missing > 0 ? (
                    <>{checklistStats.missing} missing</>
                  ) : (
                    <>All complete</>
                  )}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {checklistStats.fulfilled}/{checklistStats.total}
              </span>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Classification Badge - More compact */}
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="outline" className="text-xs h-6">
          {batch.isInternal ? 'Internal' : 'External'}
        </Badge>
        {batch.instructions && (
          <span className="text-xs text-muted-foreground truncate max-w-md">
            Instructions: "{batch.instructions.slice(0, 60)}{batch.instructions.length > 60 ? '...' : ''}"
          </span>
        )}
      </div>

      {/* Background Processing Progress */}
      {batch.processingMode === 'background' && batch.status === 'processing' && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-100">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-blue-900">Processing in Background</h3>
                  <span className="text-sm text-blue-700">
                    {batch.processedFiles} of {batch.totalFiles} files
                  </span>
                </div>
                <Progress value={(batch.processedFiles / batch.totalFiles) * 100} className="h-2" />
                {batch.estimatedCompletionTime && (
                  <p className="text-xs text-blue-600 mt-2">
                    Estimated completion: {new Date(batch.estimatedCompletionTime).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-blue-700 mt-3">
              Your files are being processed in the background. You can safely navigate away, start another upload, or come back later — you&apos;ll get a notification when it&apos;s done.
              This page will automatically update as files are processed.
            </p>
            <div className="mt-2">
              <Button
                variant="link"
                size="sm"
                className="text-blue-700 hover:text-blue-900 p-0 h-auto"
                onClick={() => router.push('/docs/upload')}
              >
                Start Another Upload →
              </Button>
            </div>
            {stuckCount > 0 && (
              <div className="mt-3 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                  onClick={handleRetryAllStuck}
                  disabled={isRetryingAll}
                >
                  {isRetryingAll ? (
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-2" />
                  )}
                  Retry Stuck Files ({stuckCount})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stuck items warning - shown when batch is not in processing state */}
      {batch.status !== 'processing' && stuckCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-100">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-medium text-amber-900">
                    {stuckCount} file{stuckCount > 1 ? 's' : ''} need attention
                  </h3>
                  <p className="text-sm text-amber-700">
                    {stuckCount} file{stuckCount > 1 ? 's are' : ' is'} stuck in processing or failed.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={handleRetryAllStuck}
                disabled={isRetryingAll}
              >
                {isRetryingAll ? (
                  <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3 mr-2" />
                )}
                Retry All Stuck ({stuckCount})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {stats.unresolvedDuplicates > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-amber-800">
              {stats.unresolvedDuplicates} duplicate{stats.unresolvedDuplicates > 1 ? 's' : ''} detected
            </div>
            <p className="text-sm text-amber-700 mt-1">
              Please select a version type (minor or significant change) for each duplicate before filing.
            </p>
          </div>
        </div>
      )}

      {/* Filing Result */}
      {filingResult && (
        <div className={`p-4 rounded-lg flex items-start gap-3 ${
          filingResult.totalErrors > 0 
            ? 'bg-orange-50 border border-orange-200'
            : 'bg-green-50 border border-green-200'
        }`}>
          {filingResult.totalErrors > 0 ? (
            <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <div className={`font-medium ${filingResult.totalErrors > 0 ? 'text-orange-800' : 'text-green-800'}`}>
              {filingResult.totalFiled} document{filingResult.totalFiled !== 1 ? 's' : ''} filed successfully
              {filingResult.totalErrors > 0 && `, ${filingResult.totalErrors} error${filingResult.totalErrors !== 1 ? 's' : ''}`}
            </div>
            {filingResult.totalFiled > 0 && (
              <Button
                variant="link"
                size="sm"
                className="p-0 h-auto mt-1"
                onClick={() => router.push(`/docs?clientId=${batch.clientId}`)}
              >
                View in Document Library →
              </Button>
            )}
          </div>
        </div>
      )}

      {/* New Projects Panel — shown when new projects are detected */}
      {batch?.status === 'review' && newProjects.length > 0 && (
        <NewProjectsPanel
          projects={newProjects}
          onChange={setNewProjects}
          onCreateProjects={handleCreateProjects}
          isCreating={isCreatingProjects}
        />
      )}

      {/* Version Candidates Panel — shown when version candidate groups are detected */}
      {batch?.status === 'review' && versionCandidateGroups.length > 0 && (
        <VersionCandidatesPanel
          groups={versionCandidateGroups}
          onApplyVersions={handleApplyVersions}
          onDeleteItems={handleDeleteItems}
        />
      )}

      {/* Review Table */}
      {/* Multi-project summary */}
      {isEffectivelyMultiProject && items && (
        <div className="flex items-center gap-4 text-sm p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
          <span className="font-medium">{items.length} documents</span>
          <span className="text-gray-400">|</span>
          <span>{new Set(items.map((i: any) => i.itemProjectId).filter(Boolean)).size} projects assigned</span>
          <span className="text-gray-400">|</span>
          <span>{items.filter((i: any) => i.suggestedProjectName && !i.itemProjectId).length} new projects suggested</span>
        </div>
      )}

      {/* Review Table */}
      {items && items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          All items have been removed from this batch.
        </div>
      ) : (
        <BulkReviewTable
          items={items as any}
          batchIsInternal={batch.isInternal}
          hasProject={!!effectiveProjectId}
          clientId={batch.clientId}
          projectId={effectiveProjectId}
          isMultiProject={isEffectivelyMultiProject}
          projects={clientProjects?.map((p: any) => ({
            _id: p._id,
            name: p.name,
            projectShortcode: p.projectShortcode,
          }))}
        />
      )}

      {/* Action Bar - Compact */}
      <div className="flex items-center justify-between p-3 bg-background border-t sticky bottom-0 z-40">
        <div className="text-sm text-muted-foreground">
          {stats.statusCounts.ready_for_review} file{stats.statusCounts.ready_for_review !== 1 ? 's' : ''} ready to file
        </div>
        <div className="flex items-center gap-2">
          {batch.status === 'completed' || batch.status === 'partial' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/docs?clientId=${batch.clientId}`)}
            >
              <FileCheck className="w-4 h-4 mr-2" />
              View Documents
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setShowUploadMore(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Upload More
              </Button>
              <Button
                onClick={() => setShowFileAllDialog(true)}
                disabled={!canFileAll || isFilingAll || hasNewProjectDuplicates}
              >
                {isFilingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Filing...
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4 mr-2" />
                    File All Documents ({stats.statusCounts.ready_for_review})
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Confirm File All Dialog */}
      <AlertDialog open={showFileAllDialog} onOpenChange={setShowFileAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File All Documents?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  This will file {stats.statusCounts.ready_for_review} document{stats.statusCounts.ready_for_review !== 1 ? 's' : ''} to the document library
                  under <strong>{batch.clientName}</strong>
                  {batch.projectName && <> / <strong>{batch.projectName}</strong></>}.
                </p>
                <p className="mt-2">
                  Documents will be named using the new naming convention with your initials ({uploaderInitials}).
                </p>
                {items.some(i => i.extractionEnabled && i.status === 'ready_for_review') && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800 font-medium">
                      📊 Data Extraction Queued
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      {items.filter(i => i.extractionEnabled && i.status === 'ready_for_review').length} spreadsheet(s) will be processed for data extraction after filing.
                      You can safely leave this page - extraction runs in the background.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleFileAll}>
              File All Documents
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard Batch Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard This Upload?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently discard all {batch.totalFiles} files in this batch and delete the uploaded files from storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDiscarding}
              onClick={async () => {
                setIsDiscarding(true);
                try {
                  await discardBatch({ batchId });
                  router.push('/filing');
                } catch (e) {
                  console.error('Failed to discard batch:', e);
                  setIsDiscarding(false);
                }
              }}
            >
              {isDiscarding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Discarding...
                </>
              ) : (
                'Discard Batch'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload More Modal */}
      <UploadMoreModal
        isOpen={showUploadMore}
        onClose={() => setShowUploadMore(false)}
        batchId={batchId}
        batch={{
          clientId: batch.clientId,
          clientName: batch.clientName,
          projectId: batch.projectId,
          projectName: batch.projectName,
          projectShortcode: batch.projectShortcode,
          isInternal: batch.isInternal,
          instructions: batch.instructions,
        }}
      />
    </div>
  );
}
