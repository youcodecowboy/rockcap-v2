'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  CheckCircle,
  AlertCircle,
  Check,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface CompletionSummaryProps {
  batchId: string;
  onUploadMore: () => void;
}

export default function CompletionSummary({ batchId, onUploadMore }: CompletionSummaryProps) {
  const router = useRouter();

  const batch = useQuery(api.bulkUpload.getBatch, { batchId: batchId as Id<'bulkUploadBatches'> });
  const items = useQuery(api.bulkUpload.getBatchItems, { batchId: batchId as Id<'bulkUploadBatches'> });

  if (batch === undefined || items === undefined) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-[var(--m-text-tertiary)]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Loading...</span>
      </div>
    );
  }

  const filedItems = items.filter((i: any) => i.status === 'filed');
  const errorItems = items.filter((i: any) => i.status === 'error');
  const hasErrors = errorItems.length > 0;

  // Build batch context label
  const buildBatchContext = () => {
    const scope = (batch as any).scope || 'client';
    if (scope === 'internal') {
      return (batch as any).internalFolderName || 'Internal';
    }
    if (scope === 'personal') {
      return (batch as any).personalFolderName || 'Personal';
    }
    // client scope
    const parts: string[] = [];
    if ((batch as any).clientName) parts.push((batch as any).clientName);
    if ((batch as any).projectName) parts.push((batch as any).projectName);
    const label = parts.join(' → ');
    return label || 'Unknown';
  };

  const batchContextLabel = buildBatchContext();
  const scopeTag = (() => {
    const scope = (batch as any).scope || 'client';
    if (scope === 'internal') return 'Internal';
    if (scope === 'personal') return 'Personal';
    return 'External';
  })();

  const handleDocumentTap = (item: any) => {
    if (item.documentId) {
      router.push(`/m-docs?documentId=${item.documentId}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg)]">
      {/* Header */}
      <div className="flex items-center px-[var(--m-page-px)] h-12 border-b border-[var(--m-border-subtle)] flex-shrink-0">
        <span className="text-[16px] font-semibold text-[var(--m-text-primary)]">Complete</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* Success block */}
        <div className="flex flex-col items-center gap-2 px-[var(--m-page-px)] pt-8 pb-6">
          {hasErrors ? (
            <AlertCircle className="w-12 h-12 text-[var(--m-warning)]" />
          ) : (
            <CheckCircle className="w-12 h-12 text-[var(--m-success)]" />
          )}
          <div className="text-[18px] font-semibold text-[var(--m-text-primary)] mt-1">
            {filedItems.length} {filedItems.length === 1 ? 'document' : 'documents'} filed
          </div>
          <div className="text-[13px] text-[var(--m-text-secondary)]">
            {hasErrors
              ? `${errorItems.length} ${errorItems.length === 1 ? 'file' : 'files'} failed`
              : 'All files analyzed and filed'}
          </div>
        </div>

        {/* Batch context card */}
        <div className="mx-[var(--m-page-px)] mb-4 bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[12px] px-4 py-3">
          <span className="text-[13px] text-[var(--m-text-primary)]">
            {batchContextLabel}
            {' · '}
            <span className="text-[var(--m-text-secondary)]">{scopeTag}</span>
          </span>
        </div>

        {/* Document list */}
        <div className="mx-[var(--m-page-px)] border border-[var(--m-border)] rounded-[12px] overflow-hidden">
          {[...filedItems, ...errorItems].map((item: any, index: number, arr: any[]) => {
            const isError = item.status === 'error';
            const isTappable = !!item.documentId;
            const isLast = index === arr.length - 1;

            return (
              <button
                key={item._id}
                onClick={() => isTappable && handleDocumentTap(item)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-3 text-left bg-[var(--m-bg-subtle)]',
                  !isLast ? 'border-b border-[var(--m-border-subtle)]' : '',
                  isTappable ? 'active:bg-[var(--m-bg-inset)]' : '',
                ].join(' ')}
              >
                {/* Status icon */}
                <div
                  className={[
                    'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                    isError
                      ? 'bg-red-100'
                      : 'bg-[var(--m-accent-subtle)]',
                  ].join(' ')}
                >
                  {isError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-[var(--m-accent)]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">
                    {item.generatedDocumentCode || item.fileName}
                  </div>
                  {isError ? (
                    <div className="text-[11px] text-red-500 truncate mt-0.5">
                      {item.errorMessage || 'Failed to file'}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {item.category && (
                        <span className="bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] text-[10px] font-medium px-1.5 py-0.5 rounded">
                          {item.category}
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--m-text-tertiary)] truncate">
                        {item.fileName}
                      </span>
                    </div>
                  )}
                </div>

                {/* Chevron */}
                {isTappable && (
                  <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky footer */}
      <div className="flex-shrink-0 px-[var(--m-page-px)] pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] border-t border-[var(--m-border-subtle)] bg-[var(--m-bg)] flex gap-3">
        <button
          onClick={onUploadMore}
          className="flex-1 py-3 text-[14px] font-medium text-[var(--m-text-primary)] border border-[var(--m-border)] rounded-[10px] bg-transparent active:bg-[var(--m-bg-inset)]"
        >
          Upload More
        </button>
        <button
          onClick={() => router.push('/m-docs')}
          className="flex-1 py-3 text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-[10px] active:opacity-80"
        >
          Done
        </button>
      </div>
    </div>
  );
}
