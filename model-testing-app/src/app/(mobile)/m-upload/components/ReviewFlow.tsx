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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 12,
          color: 'var(--m-text-secondary, #888)',
        }}
      >
        <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: 14 }}>Saving documents...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
    deleteReviewDoc(doc.id);
    // If last doc deleted, context resets to pick automatically via empty reviewDocs
    if (total === 1) return;
    // Adjust index if we deleted last item
    if (currentIndex >= total - 1) {
      setReviewIndex(Math.max(0, currentIndex - 1));
    }
  };

  const handlePrev = () => {
    if (!isFirst) setReviewIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (!isLast) setReviewIndex(currentIndex + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 'var(--m-header-h, 52px)',
          padding: '0 var(--m-page-px, 16px)',
          borderBottom: '1px solid var(--m-border, #2a2a2a)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handlePrev}
          disabled={isFirst}
          style={{
            ...headerBtnStyle,
            opacity: isFirst ? 0.35 : 1,
            cursor: isFirst ? 'default' : 'pointer',
          }}
        >
          <ChevronLeft size={18} />
          <span>Back</span>
        </button>

        <span style={{ fontSize: 14, color: 'var(--m-text-secondary, #888)' }}>
          {currentIndex + 1} of {total}
        </span>

        <button onClick={handleDelete} style={{ ...headerBtnStyle, color: '#ef4444' }}>
          Delete
        </button>
      </div>

      {/* Doc Review Content */}
      <DocReview
        doc={doc}
        onUpdate={(updates) => updateReviewDoc(doc.id, updates)}
      />

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '12px var(--m-page-px, 16px)',
          borderTop: '1px solid var(--m-border, #2a2a2a)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={handlePrev}
          disabled={isFirst}
          style={{
            ...footerBtnStyle,
            flex: 1,
            opacity: isFirst ? 0.35 : 1,
            cursor: isFirst ? 'default' : 'pointer',
            background: 'var(--m-card, #1a1a1a)',
            color: 'var(--m-text-primary, #fff)',
            border: '1px solid var(--m-border, #2a2a2a)',
          }}
        >
          Previous
        </button>

        {isLast ? (
          <button
            onClick={finishReview}
            disabled={!allHaveClient}
            style={{
              ...footerBtnStyle,
              flex: 1,
              opacity: allHaveClient ? 1 : 0.4,
              cursor: allHaveClient ? 'pointer' : 'default',
              background: 'var(--m-accent, #3b82f6)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Finish
          </button>
        ) : (
          <button
            onClick={handleNext}
            style={{
              ...footerBtnStyle,
              flex: 1,
              background: 'var(--m-accent, #3b82f6)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Next &rarr;
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const headerBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  color: 'var(--m-text-primary, #fff)',
  fontSize: 14,
  padding: 0,
  cursor: 'pointer',
};

const footerBtnStyle: React.CSSProperties = {
  height: 44,
  borderRadius: 10,
  fontSize: 15,
  cursor: 'pointer',
};
