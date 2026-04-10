'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { ChevronLeft, Loader2 } from 'lucide-react';
import DocReviewCard from './DocReviewCard';

interface ReviewFlowProps {
  batchId: string;
  onFiled: () => void;
}

export default function ReviewFlow({ batchId, onFiled }: ReviewFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFiling, setIsFiling] = useState(false);

  const items = useQuery(api.bulkUpload.getBatchItems, {
    batchId: batchId as Id<'bulkUploadBatches'>,
  });
  const batch = useQuery(api.bulkUpload.getBatch, {
    batchId: batchId as Id<'bulkUploadBatches'>,
  });

  const fileBatch = useMutation(api.bulkUpload.fileBatch);
  const deleteItems = useMutation(api.bulkUpload.deleteItems);

  const reviewableItems =
    items?.filter((i) => i.status === 'ready_for_review') || [];

  const currentItem = reviewableItems[currentIndex];
  const isLastItem = currentIndex === reviewableItems.length - 1;

  const handleFileAll = async () => {
    setIsFiling(true);
    try {
      await fileBatch({
        batchId: batchId as Id<'bulkUploadBatches'>,
        uploaderInitials: batch?.uploaderInitials || 'XX',
      });
      onFiled();
    } catch (err) {
      alert(
        `Filing failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setIsFiling(false);
    }
  };

  const handleDelete = async () => {
    if (!currentItem) return;
    const confirmed = window.confirm(
      `Delete "${currentItem.fileName}"? This cannot be undone.`
    );
    if (!confirmed) return;

    await deleteItems({
      batchId: batchId as Id<'bulkUploadBatches'>,
      itemIds: [currentItem._id as Id<'bulkUploadItems'>],
    });

    // Adjust index after deletion
    if (reviewableItems.length <= 1) {
      // Last item deleted — index will reset when list becomes empty
      setCurrentIndex(0);
    } else if (currentIndex >= reviewableItems.length - 1) {
      // Was on the last item, step back
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Loading state
  if (items === undefined || batch === undefined) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[var(--m-text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Loading documents...</span>
      </div>
    );
  }

  // Empty state
  if (reviewableItems.length === 0) {
    return (
      <div className="flex items-center justify-center h-full px-[var(--m-page-px)]">
        <div className="text-center space-y-2">
          <div className="text-[15px] font-medium text-[var(--m-text-primary)]">
            No documents ready for review
          </div>
          <div className="text-[12px] text-[var(--m-text-tertiary)]">
            All documents may still be processing or have errors.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-[var(--m-page-px)] border-b border-[var(--m-border)] flex-shrink-0"
        style={{ height: 'var(--m-header-h)' }}
      >
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-0.5 text-[14px] text-[var(--m-text-primary)]"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>Back</span>
        </button>

        <span className="text-[13px] font-medium text-[var(--m-text-secondary)]">
          {currentIndex + 1} of {reviewableItems.length}
        </span>

        <button
          onClick={handleDelete}
          className="text-[14px] font-medium text-[var(--m-error)]"
        >
          Delete
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-4">
        <DocReviewCard item={currentItem} batchId={batchId} />
      </div>

      {/* Sticky footer */}
      <div
        className="flex-shrink-0 border-t border-[var(--m-border)] bg-[var(--m-bg)] px-[var(--m-page-px)] pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="flex gap-3">
          <button
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0 || isFiling}
            className="flex-1 py-2.5 rounded-lg text-[14px] font-medium bg-[var(--m-bg-subtle)] border border-[var(--m-border)] text-[var(--m-text-primary)] disabled:opacity-40"
          >
            Previous
          </button>

          {isLastItem ? (
            <button
              onClick={handleFileAll}
              disabled={isFiling}
              className="flex-1 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--m-text-primary)] text-white disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isFiling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Filing...
                </>
              ) : (
                'File All'
              )}
            </button>
          ) : (
            <button
              onClick={() =>
                setCurrentIndex((i) =>
                  Math.min(reviewableItems.length - 1, i + 1)
                )
              }
              disabled={isFiling}
              className="flex-1 py-2.5 rounded-lg text-[14px] font-semibold bg-[var(--m-text-primary)] text-white disabled:opacity-60"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
