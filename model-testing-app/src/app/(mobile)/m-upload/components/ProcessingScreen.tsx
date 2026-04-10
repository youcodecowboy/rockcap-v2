'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useConvex } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { createBulkQueueProcessor, type BatchInfo } from '@/lib/bulkQueueProcessor';
import { Loader2, Check, AlertCircle, Clock } from 'lucide-react';

interface ProcessingScreenProps {
  batchId: string;
  files: File[];
  batchInfo: BatchInfo;
  onComplete: () => void;
}

export default function ProcessingScreen({ batchId, files, batchInfo, onComplete }: ProcessingScreenProps) {
  const convex = useConvex();
  const processingStarted = useRef(false);
  const processorRef = useRef<ReturnType<typeof createBulkQueueProcessor> | null>(null);

  // Convex mutations for processor callbacks
  const updateItemStatus = useMutation(api.bulkUpload.updateItemStatus);
  const updateItemAnalysis = useMutation(api.bulkUpload.updateItemAnalysis);
  const updateBatchStatus = useMutation(api.bulkUpload.updateBatchStatus);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Reactive query for batch items — updates as processor saves results
  const items = useQuery(api.bulkUpload.getBatchItems, {
    batchId: batchId as Id<'bulkUploadBatches'>,
  });

  // Track auto-advance
  const [autoAdvanceTriggered, setAutoAdvanceTriggered] = useState(false);

  // Create processor and start processing once items are loaded
  useEffect(() => {
    if (!items || items.length === 0 || processingStarted.current) return;
    processingStarted.current = true;

    const processor = createBulkQueueProcessor(
      {
        updateItemStatus,
        updateItemAnalysis,
        updateBatchStatus,
        checkForDuplicates: async (args) => {
          if (!args.clientId) {
            return { isDuplicate: false, existingDocuments: [] };
          }
          const params = new URLSearchParams({
            originalFileName: args.originalFileName,
            clientId: args.clientId,
          });
          if (args.projectId) params.append('projectId', args.projectId);
          try {
            const response = await fetch(`/api/check-duplicates?${params.toString()}`);
            if (!response.ok) return { isDuplicate: false, existingDocuments: [] };
            return response.json();
          } catch {
            return { isDuplicate: false, existingDocuments: [] };
          }
        },
        generateUploadUrl,
        getStorageUrl: (storageId) => convex.query(api.documents.getFileUrl, { storageId }),
      },
      {
        concurrency: 1, // mobile: gentle on network
      }
    );

    processor.setBatchInfo(batchInfo);
    processorRef.current = processor;

    // Match each batch item to its File by fileName, add to processor
    for (const item of items) {
      const file = files.find(f => f.name === item.fileName);
      if (file) {
        processor.addItem(item._id, file, item.folderHint);
      }
    }

    // Start processing in background
    processor.processQueue().catch(err => {
      console.error('[ProcessingScreen] Background processing error:', err);
    });
  }, [items, files, batchInfo, updateItemStatus, updateItemAnalysis, updateBatchStatus, generateUploadUrl, convex]);

  // Auto-advance when all items are done
  useEffect(() => {
    if (!items || items.length === 0 || autoAdvanceTriggered) return;

    const allDone = items.every(
      (item) => item.status === 'ready_for_review' || item.status === 'error' || item.status === 'filed'
    );
    const hasSuccess = items.some(
      (item) => item.status === 'ready_for_review' || item.status === 'filed'
    );
    const allErrored = items.every((item) => item.status === 'error');

    if (allDone && hasSuccess && !allErrored) {
      setAutoAdvanceTriggered(true);
      const timer = setTimeout(() => onComplete(), 1000);
      return () => clearTimeout(timer);
    }
  }, [items, autoAdvanceTriggered, onComplete]);

  // Derive overall status
  const totalItems = items?.length ?? files.length;
  const completedItems = items?.filter(
    (i) => i.status === 'ready_for_review' || i.status === 'error' || i.status === 'filed'
  ).length ?? 0;
  const errorItems = items?.filter((i) => i.status === 'error').length ?? 0;
  const allDone = items && items.length > 0 && completedItems === totalItems;
  const allErrored = allDone && errorItems === totalItems;

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg)]">
      {/* Header */}
      <div className="px-[var(--m-page-px)] pt-6 pb-4">
        <h1 className="text-[17px] font-semibold text-[var(--m-text-primary)]">
          {allDone
            ? allErrored
              ? 'Processing Failed'
              : 'Processing Complete'
            : 'Processing...'}
        </h1>
        <p className="text-[13px] text-[var(--m-text-tertiary)] mt-1">
          {completedItems} of {totalItems} files analyzed
        </p>
      </div>

      {/* Center status icon */}
      <div className="flex items-center justify-center py-4">
        {allDone ? (
          allErrored ? (
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
          )
        ) : (
          <div className="w-12 h-12 rounded-full bg-[var(--m-bg-secondary)] flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--m-text-tertiary)]" />
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="px-[var(--m-page-px)] pb-4">
        <div className="h-1.5 bg-[var(--m-border)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--m-text-primary)] rounded-full transition-all duration-500 ease-out"
            style={{ width: totalItems > 0 ? `${(completedItems / totalItems) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Per-file rows */}
      <div className="flex-1 overflow-y-auto px-[var(--m-page-px)]">
        <div className="space-y-1">
          {items?.map((item) => (
            <div
              key={item._id}
              className="flex items-center gap-3 py-2.5 px-3 rounded-lg"
            >
              {/* Status icon */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {item.status === 'pending' && (
                  <Clock className="w-4 h-4 text-[var(--m-text-tertiary)] opacity-50" />
                )}
                {item.status === 'processing' && (
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--m-text-secondary)]" />
                )}
                {(item.status === 'ready_for_review' || item.status === 'filed') && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
                {item.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[13px] truncate ${
                    item.status === 'pending'
                      ? 'text-[var(--m-text-tertiary)]'
                      : 'text-[var(--m-text-primary)]'
                  }`}
                >
                  {item.fileName}
                </p>
                {item.status === 'processing' && (
                  <div className="mt-1 h-1 bg-[var(--m-border)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--m-text-secondary)] rounded-full animate-pulse w-2/3" />
                  </div>
                )}
                {item.status === 'error' && item.error && (
                  <p className="text-[11px] text-red-500 mt-0.5 truncate">{item.error}</p>
                )}
                {(item.status === 'ready_for_review' || item.status === 'filed') && item.category && (
                  <p className="text-[11px] text-[var(--m-text-tertiary)] mt-0.5 truncate">
                    {item.category}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-[var(--m-page-px)] py-4 border-t border-[var(--m-border)]">
        {allErrored ? (
          <p className="text-[12px] text-red-500 text-center">
            All files failed to process. Check your connection and try again.
          </p>
        ) : (
          <p className="text-[12px] text-[var(--m-text-tertiary)] text-center">
            You can navigate away — processing continues in the background
          </p>
        )}
      </div>
    </div>
  );
}
