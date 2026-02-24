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
import UploadMoreModal from './components/UploadMoreModal';
import { getUserInitials } from '@/lib/documentNaming';

export default function BulkReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const batchId = params.batchId as Id<"bulkUploadBatches">;

  const [isFilingAll, setIsFilingAll] = useState(false);
  const [showFileAllDialog, setShowFileAllDialog] = useState(false);
  const [showUploadMore, setShowUploadMore] = useState(false);
  const [filingResult, setFilingResult] = useState<{ totalFiled: number; totalErrors: number } | null>(null);
  
  // Shortcode editing state
  const [isEditingShortcode, setIsEditingShortcode] = useState(false);
  const [shortcodeInput, setShortcodeInput] = useState('');
  const [shortcodeSaving, setShortcodeSaving] = useState(false);

  // Queries
  const batch = useQuery(api.bulkUpload.getBatch, { batchId });
  const items = useQuery(api.bulkUpload.getBatchItems, { batchId });
  const stats = useQuery(api.bulkUpload.getBatchStats, { batchId });
  const currentUser = useQuery(api.users.getCurrent, {});
  
  // Query checklist items for missing documents count
  // @ts-ignore - Known Convex TypeScript type instantiation depth issue
  const checklistItems = useQuery(
    api.knowledgeLibrary.getAllChecklistItemsForClient,
    batch?.clientId ? { clientId: batch.clientId, projectId: batch.projectId } : "skip"
  );
  
  // Calculate checklist stats
  const checklistStats = useMemo(() => {
    if (!checklistItems) return null;
    const total = checklistItems.length;
    const fulfilled = checklistItems.filter((i: any) => i.status === 'fulfilled').length;
    const missing = total - fulfilled;
    return { total, fulfilled, missing };
  }, [checklistItems]);
  
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

  // Initialize shortcode input when batch loads
  useEffect(() => {
    if (batch?.projectShortcode) {
      setShortcodeInput(batch.projectShortcode);
    }
  }, [batch?.projectShortcode]);

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

  // Handle file all
  const handleFileAll = async () => {
    if (!batch || !canFileAll) return;

    setShowFileAllDialog(false);
    setIsFilingAll(true);

    try {
      const result = await fileBatch({
        batchId,
        uploaderInitials,
      });
      setFilingResult(result);
      
      // Trigger extraction queue processing (non-blocking)
      // This processes any documents that had extraction enabled (spreadsheets)
      fetch('/api/process-extraction-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      }).then(response => {
        if (response.ok) {
          console.log('[BulkUpload] Extraction queue processing started');
        }
      }).catch(err => {
        console.error('[BulkUpload] Failed to trigger extraction queue:', err);
      });

      // Trigger intelligence extraction queue (non-blocking)
      // This extracts client/project intelligence from documents
      fetch('/api/process-intelligence-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 20 }),
      }).then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
          console.log(`[BulkUpload] Intelligence queue: ${data.message || 'processing started'}`, {
            processed: data.processed,
            successful: data.successful,
            skipped: data.skipped,
            failed: data.failed,
          });
        } else {
          console.warn('[BulkUpload] Intelligence queue returned:', data);
        }
      }).catch(err => {
        console.error('[BulkUpload] Failed to trigger intelligence queue:', err);
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to file documents');
    } finally {
      setIsFilingAll(false);
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
        <Badge className={statusInfo.color}>
          <StatusIcon className={`w-3 h-3 mr-1 ${batch.status === 'processing' || batch.status === 'uploading' ? 'animate-spin' : ''}`} />
          {statusInfo.label}
        </Badge>
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
                  {batch.projectName || 'Client-level'}
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
            onClick={() => router.push(`/clients/${batch.clientId}?tab=knowledge`)}
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
              Files are being analyzed in the background. You&apos;ll receive a notification when processing is complete.
              This page will automatically update as files are processed.
            </p>
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

      {/* Review Table */}
      <BulkReviewTable
        items={items}
        batchIsInternal={batch.isInternal}
        hasProject={!!batch.projectId}
        clientId={batch.clientId}
        projectId={batch.projectId}
      />

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
                disabled={!canFileAll || isFilingAll}
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
