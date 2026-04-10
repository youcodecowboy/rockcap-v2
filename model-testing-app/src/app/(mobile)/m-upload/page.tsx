'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Loader2 } from 'lucide-react';
import type { BatchInfo } from '@/lib/bulkQueueProcessor';
import UploadSetup from './components/UploadSetup';

type UploadPhase =
  | { phase: 'setup' }
  | { phase: 'processing'; batchId: string; files: File[]; batchInfo: BatchInfo }
  | { phase: 'review'; batchId: string }
  | { phase: 'done'; batchId: string };

export default function MobileUploadPage() {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const currentUser = useQuery(api.users.getCurrent, {});

  const [uploadPhase, setUploadPhase] = useState<UploadPhase>({ phase: 'setup' });

  // Check for pending batches on mount
  const pendingBatches = useQuery(
    api.bulkUpload.getPendingBatches,
    currentUser?._id ? { userId: currentUser._id } : 'skip'
  );

  // Resume review phase if a pending batch in review status exists
  useEffect(() => {
    if (pendingBatches && pendingBatches.length > 0 && uploadPhase.phase === 'setup') {
      const reviewBatch = pendingBatches.find((b: any) => b.status === 'review');
      if (reviewBatch) {
        setUploadPhase({ phase: 'review', batchId: reviewBatch._id });
      }
    }
  }, [pendingBatches, uploadPhase.phase]);

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
    setUploadPhase({ phase: 'processing', batchId, files, batchInfo });
  };

  // Loading state while we check for pending batches
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[var(--m-text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Loading...</span>
      </div>
    );
  }

  if (uploadPhase.phase === 'setup') {
    return (
      <UploadSetup
        initialContext={initialContext}
        onBatchCreated={handleBatchCreated}
      />
    );
  }

  if (uploadPhase.phase === 'processing') {
    return (
      <div className="flex items-center justify-center h-full px-[var(--m-page-px)]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--m-text-tertiary)] mx-auto" />
          <div className="text-[15px] font-medium text-[var(--m-text-primary)]">Processing uploads...</div>
          <div className="text-[12px] text-[var(--m-text-tertiary)]">
            Batch: {uploadPhase.batchId}
          </div>
        </div>
      </div>
    );
  }

  if (uploadPhase.phase === 'review') {
    return (
      <div className="flex items-center justify-center h-full px-[var(--m-page-px)]">
        <div className="text-center space-y-3">
          <div className="text-[15px] font-medium text-[var(--m-text-primary)]">Review pending</div>
          <div className="text-[12px] text-[var(--m-text-tertiary)]">
            Batch: {uploadPhase.batchId}
          </div>
        </div>
      </div>
    );
  }

  if (uploadPhase.phase === 'done') {
    return (
      <div className="flex items-center justify-center h-full px-[var(--m-page-px)]">
        <div className="text-center space-y-3">
          <div className="text-[15px] font-medium text-[var(--m-text-primary)]">Upload complete</div>
          <button
            onClick={() => setUploadPhase({ phase: 'setup' })}
            className="px-4 py-2 text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-lg"
          >
            New Upload
          </button>
        </div>
      </div>
    );
  }

  return null;
}
