'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Loader2 } from 'lucide-react';
import { consumePendingProcessing } from '../processingCache';
import type { BatchInfo } from '@/lib/bulkQueueProcessor';
import ProcessingScreen from '../components/ProcessingScreen';
import ReviewFlow from '../components/ReviewFlow';
import CompletionSummary from '../components/CompletionSummary';

export default function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = use(params);
  const router = useRouter();

  // Consume pending processing data (files + batchInfo) if we were just redirected from setup
  const [pendingData, setPendingData] = useState<{ files: File[]; batchInfo: BatchInfo } | null>(null);
  const [consumed, setConsumed] = useState(false);

  useEffect(() => {
    if (!consumed) {
      const data = consumePendingProcessing();
      if (data) {
        setPendingData(data);
      }
      setConsumed(true);
    }
  }, [consumed]);

  // Reactive batch status from Convex
  const batch = useQuery(api.bulkUpload.getBatch, {
    batchId: batchId as Id<'bulkUploadBatches'>,
  });

  if (batch === undefined) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[var(--m-text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Loading...</span>
      </div>
    );
  }

  if (batch === null) {
    return (
      <div className="flex items-center justify-center h-full px-[var(--m-page-px)]">
        <div className="text-center space-y-2">
          <div className="text-[15px] font-medium text-[var(--m-text-primary)]">
            Batch not found
          </div>
          <button
            onClick={() => router.push('/m-upload')}
            className="text-[13px] text-[var(--m-text-secondary)] underline"
          >
            Back to Upload
          </button>
        </div>
      </div>
    );
  }

  const status = batch.status as string;

  // Processing phase
  if (status === 'uploading' || status === 'processing') {
    return (
      <ProcessingScreen
        batchId={batchId}
        files={pendingData?.files}
        batchInfo={pendingData?.batchInfo}
        onComplete={() => {
          // Batch status will update reactively — no need to navigate
        }}
      />
    );
  }

  // Review phase
  if (status === 'review') {
    return (
      <ReviewFlow
        batchId={batchId}
        onFiled={() => {
          // Batch status will update reactively — no need to navigate
        }}
      />
    );
  }

  // Completed
  if (status === 'completed' || status === 'filed') {
    return (
      <CompletionSummary
        batchId={batchId}
        onUploadMore={() => router.push('/m-upload')}
      />
    );
  }

  // Fallback
  return (
    <div className="flex items-center justify-center h-full gap-2 text-[var(--m-text-tertiary)]">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[13px]">Loading batch...</span>
    </div>
  );
}
