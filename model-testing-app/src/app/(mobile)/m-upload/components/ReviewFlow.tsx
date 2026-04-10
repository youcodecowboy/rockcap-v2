'use client';

import { useUpload } from '@/contexts/UploadContext';
import { ChevronLeft, Loader2 } from 'lucide-react';
import DocReview from './DocReview';

export default function ReviewFlow() {
  const {
    phase,
    reviewDocs,
    setReviewIndex,
    updateReviewDoc,
    deleteReviewDoc,
    finishReview,
  } = useUpload();

  // Saving state — show spinner
  if (phase.name === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--m-text-secondary)]">
        <Loader2 size={28} className="animate-spin" />
        <span className="text-sm">Saving documents...</span>
      </div>
    );
  }

  const currentIndex = phase.name === 'review' ? phase.currentIndex : 0;
  const total = reviewDocs.length;
  const doc = reviewDocs[currentIndex];

  if (!doc) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;
  const allHaveClient = reviewDocs.every((d) => !!d.clientId);

  const handleDelete = () => {
    if (!confirm(`Delete "${doc.fileName}" from this batch?`)) return;
    // If last doc, deleteReviewDoc resets to pick phase automatically
    if (total === 1) {
      deleteReviewDoc(doc.id);
      return;
    }
    // Adjust index before deleting if we're on the last item
    if (currentIndex >= total - 1) {
      setReviewIndex(Math.max(0, currentIndex - 1));
    }
    deleteReviewDoc(doc.id);
  };

  const handlePrev = () => {
    if (!isFirst) setReviewIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (!isLast) setReviewIndex(currentIndex + 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-[var(--m-page-px)] border-b border-[var(--m-border)] flex-shrink-0"
        style={{ height: 'var(--m-header-h)' }}
      >
        <button
          onClick={handlePrev}
          disabled={isFirst}
          className={`flex items-center gap-1 bg-transparent border-none text-[var(--m-text-primary)] text-sm p-0 ${
            isFirst ? 'opacity-35 cursor-default' : 'cursor-pointer'
          }`}
        >
          <ChevronLeft size={18} />
          <span>Back</span>
        </button>

        <span className="text-sm text-[var(--m-text-secondary)]">
          {currentIndex + 1} of {total}
        </span>

        <button
          onClick={handleDelete}
          className="flex items-center gap-1 bg-transparent border-none text-[var(--m-error)] text-sm p-0 cursor-pointer"
        >
          Delete
        </button>
      </div>

      {/* Doc Review Content */}
      <DocReview
        doc={doc}
        onUpdate={(updates) => updateReviewDoc(doc.id, updates)}
      />

      {/* Footer */}
      <div className="flex gap-2.5 py-3 px-[var(--m-page-px)] border-t border-[var(--m-border)] flex-shrink-0">
        <button
          onClick={handlePrev}
          disabled={isFirst}
          className={`flex-1 h-11 rounded-[10px] text-[15px] bg-[var(--m-bg-subtle)] text-[var(--m-text-primary)] border border-[var(--m-border)] ${
            isFirst ? 'opacity-35 cursor-default' : 'cursor-pointer'
          }`}
        >
          Previous
        </button>

        {isLast ? (
          <button
            onClick={finishReview}
            disabled={!allHaveClient}
            className={`flex-1 h-11 rounded-[10px] text-[15px] font-semibold bg-[var(--m-accent)] text-white border-none ${
              allHaveClient ? 'opacity-100 cursor-pointer' : 'opacity-40 cursor-default'
            }`}
          >
            Finish
          </button>
        ) : (
          <button
            onClick={handleNext}
            className="flex-1 h-11 rounded-[10px] text-[15px] font-semibold bg-[var(--m-accent)] text-white border-none cursor-pointer"
          >
            Next &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
