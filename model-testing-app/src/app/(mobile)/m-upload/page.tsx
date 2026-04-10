'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Loader2, ChevronRight, Clock, Eye, CheckCircle } from 'lucide-react';
import type { BatchInfo } from '@/lib/bulkQueueProcessor';
import { setPendingProcessing } from './processingCache';
import UploadSetup from './components/UploadSetup';

function StatusBadge({ status }: { status: string }) {
  if (status === 'processing' || status === 'uploading') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <Clock className="w-2.5 h-2.5" />
        Processing
      </span>
    );
  }
  if (status === 'review') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
        <Eye className="w-2.5 h-2.5" />
        Review
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
      <CheckCircle className="w-2.5 h-2.5" />
      Completed
    </span>
  );
}

function RecentBatchCards({ userId }: { userId: string }) {
  const router = useRouter();
  const recentBatches = useQuery(api.bulkUpload.getRecentBatches, {
    userId: userId as any,
    limit: 3,
  });

  if (!recentBatches || recentBatches.length === 0) return null;

  return (
    <div className="px-[var(--m-page-px)] pt-4 pb-1">
      <label className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-2 block">
        Recent Uploads
      </label>
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {recentBatches.map((batch: any) => {
          const scopeLabel =
            batch.scope === 'internal'
              ? 'Internal'
              : batch.scope === 'personal'
                ? 'Personal'
                : batch.clientName || 'Client';
          const created = new Date(batch._creationTime);
          const dateStr = created.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          });

          return (
            <button
              key={batch._id}
              onClick={() => router.push(`/m-upload/${batch._id}`)}
              className="flex-shrink-0 w-[160px] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3 text-left active:bg-[var(--m-bg-inset)]"
            >
              <StatusBadge status={batch.status} />
              <div className="mt-2 text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                {scopeLabel}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11px] text-[var(--m-text-tertiary)]">
                  {batch.totalFiles} {batch.totalFiles === 1 ? 'file' : 'files'}
                </span>
                <span className="text-[11px] text-[var(--m-text-tertiary)]">{dateStr}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MobileUploadPage() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const currentUser = useQuery(api.users.getCurrent, {});
  const router = useRouter();

  // Parse initial context from URL params
  const initialContext = useMemo(() => {
    const clientId = searchParams.get('clientId') || undefined;
    const clientName = searchParams.get('clientName') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const projectName = searchParams.get('projectName') || undefined;
    const folderTypeKey = searchParams.get('folderTypeKey') || undefined;
    const folderLevel = (searchParams.get('folderLevel') as 'client' | 'project') || undefined;
    const folderName = searchParams.get('folderName') || undefined;

    if (!clientId && !projectId && !folderTypeKey) return undefined;

    return { clientId, clientName, projectId, projectName, folderTypeKey, folderLevel, folderName };
  }, [searchParams]);

  const handleBatchCreated = (batchId: string, files: File[], batchInfo: BatchInfo) => {
    // Stash files + batchInfo in module cache so the [batchId] page can pick them up
    setPendingProcessing({ files, batchInfo });
    router.push(`/m-upload/${batchId}`);
  };

  // Loading state
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[var(--m-text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Recent uploads cards */}
      {currentUser?._id && <RecentBatchCards userId={currentUser._id} />}

      {/* Setup form */}
      <div className="flex-1 min-h-0">
        <UploadSetup
          initialContext={initialContext}
          onBatchCreated={handleBatchCreated}
        />
      </div>
    </div>
  );
}
