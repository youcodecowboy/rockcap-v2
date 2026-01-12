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
import { getUserInitials } from '@/lib/documentNaming';

export default function BulkReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const batchId = params.batchId as Id<"bulkUploadBatches">;

  const [isFilingAll, setIsFilingAll] = useState(false);
  const [showFileAllDialog, setShowFileAllDialog] = useState(false);
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
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/filing')}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Bulk Upload Review</h1>
            <p className="text-muted-foreground">
              Review and file {batch.totalFiles} documents
            </p>
          </div>
        </div>
        <Badge className={statusInfo.color}>
          <StatusIcon className={`w-3 h-3 mr-1 ${batch.status === 'processing' || batch.status === 'uploading' ? 'animate-spin' : ''}`} />
          {statusInfo.label}
        </Badge>
      </div>

      {/* Batch Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{batch.clientName}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {batch.projectName || 'No project (Client-level)'}
            </div>
            
            {/* Shortcode - editable if project exists */}
            {batch.projectId ? (
              <div className="mt-2">
                {isEditingShortcode ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={shortcodeInput}
                      onChange={(e) => setShortcodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                      placeholder="SHORTCODE"
                      className="h-7 w-32 text-xs font-mono uppercase"
                      maxLength={10}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={handleSaveShortcode}
                      disabled={shortcodeSaving || !shortcodeInput || (shortcodeInput !== batch.projectShortcode && shortcodeAvailable === false)}
                    >
                      {shortcodeSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3 text-green-600" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setIsEditingShortcode(false);
                        setShortcodeInput(batch.projectShortcode || '');
                      }}
                      disabled={shortcodeSaving}
                    >
                      <X className="w-3 h-3 text-red-600" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {batch.projectShortcode ? (
                      <Badge variant="secondary" className="font-mono">
                        {batch.projectShortcode}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                        No shortcode set
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setShortcodeInput(batch.projectShortcode || '');
                        setIsEditingShortcode(true);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {isEditingShortcode && shortcodeInput && shortcodeInput !== batch.projectShortcode && (
                  <p className="text-xs mt-1">
                    {shortcodeAvailable === undefined ? (
                      <span className="text-muted-foreground">Checking...</span>
                    ) : shortcodeAvailable ? (
                      <span className="text-green-600">✓ Available</span>
                    ) : (
                      <span className="text-red-600">✗ Already in use</span>
                    )}
                  </p>
                )}
                {!batch.projectShortcode && !isEditingShortcode && (
                  <p className="text-xs text-amber-600 mt-1">
                    Set a shortcode to generate document names
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Client-level uploads use client name
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress value={progress} />
              <div className="flex justify-between text-sm">
                <span>{batch.processedFiles} processed</span>
                <span>{batch.filedFiles} filed</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Classification Info */}
      <div className="flex items-center gap-4">
        <Badge variant="outline" className="text-sm">
          {batch.isInternal ? 'Internal Documents' : 'External Documents'}
        </Badge>
        {batch.instructions && (
          <span className="text-sm text-muted-foreground">
            Instructions: "{batch.instructions.slice(0, 50)}{batch.instructions.length > 50 ? '...' : ''}"
          </span>
        )}
      </div>

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
                onClick={() => router.push(`/docs/client/${batch.clientId}`)}
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
      />

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg sticky bottom-4">
        <div className="text-sm text-muted-foreground">
          {stats.statusCounts.ready_for_review} file{stats.statusCounts.ready_for_review !== 1 ? 's' : ''} ready to file
        </div>
        <div className="flex items-center gap-3">
          {batch.status === 'completed' || batch.status === 'partial' ? (
            <Button
              variant="outline"
              onClick={() => router.push(`/docs/client/${batch.clientId}`)}
            >
              <FileCheck className="w-4 h-4 mr-2" />
              View Documents
            </Button>
          ) : (
            <Button
              onClick={() => setShowFileAllDialog(true)}
              disabled={!canFileAll || isFilingAll}
              size="lg"
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
          )}
        </div>
      </div>

      {/* Confirm File All Dialog */}
      <AlertDialog open={showFileAllDialog} onOpenChange={setShowFileAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File All Documents?</AlertDialogTitle>
            <AlertDialogDescription>
              This will file {stats.statusCounts.ready_for_review} document{stats.statusCounts.ready_for_review !== 1 ? 's' : ''} to the document library 
              under <strong>{batch.clientName}</strong>
              {batch.projectName && <> / <strong>{batch.projectName}</strong></>}.
              <br /><br />
              Documents will be named using the new naming convention with your initials ({uploaderInitials}).
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
    </div>
  );
}
