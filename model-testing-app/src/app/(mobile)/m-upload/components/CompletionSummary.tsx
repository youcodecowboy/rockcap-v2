'use client';

import { useState } from 'react';
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
  X,
  Eye,
} from 'lucide-react';
import DocumentViewer from '../../m-docs/components/DocumentViewer';

interface CompletionSummaryProps {
  batchId: string;
  onUploadMore: () => void;
}

export default function CompletionSummary({ batchId, onUploadMore }: CompletionSummaryProps) {
  const router = useRouter();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const batch = useQuery(api.bulkUpload.getBatch, { batchId: batchId as Id<'bulkUploadBatches'> });
  const items = useQuery(api.bulkUpload.getBatchItems, { batchId: batchId as Id<'bulkUploadBatches'> });

  // If viewing a document, show the full viewer
  if (viewingDocId) {
    return (
      <DocumentViewer
        documentId={viewingDocId}
        onClose={() => setViewingDocId(null)}
      />
    );
  }

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

  const buildBatchContext = () => {
    const scope = (batch as any).scope || 'client';
    if (scope === 'internal') return (batch as any).internalFolderName || 'Internal';
    if (scope === 'personal') return (batch as any).personalFolderName || 'Personal';
    const parts: string[] = [];
    if ((batch as any).clientName) parts.push((batch as any).clientName);
    if ((batch as any).projectName) parts.push((batch as any).projectName);
    return parts.join(' \u2192 ') || 'Unknown';
  };

  const scopeTag = (() => {
    const scope = (batch as any).scope || 'client';
    if (scope === 'internal') return 'Internal';
    if (scope === 'personal') return 'Personal';
    return 'External';
  })();

  return (
    <div className="flex flex-col h-full bg-[var(--m-bg)]">
      {/* Header */}
      <div className="flex items-center px-[var(--m-page-px)] h-12 border-b border-[var(--m-border-subtle)] flex-shrink-0">
        <span className="text-[16px] font-semibold text-[var(--m-text-primary)]">Complete</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-20">
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
            {buildBatchContext()}
            {' \u00B7 '}
            <span className="text-[var(--m-text-secondary)]">{scopeTag}</span>
          </span>
        </div>

        {/* Document list */}
        <div className="mx-[var(--m-page-px)] border border-[var(--m-border)] rounded-[12px] overflow-hidden">
          {[...filedItems, ...errorItems].map((item: any, index: number, arr: any[]) => {
            const isError = item.status === 'error';
            const isLast = index === arr.length - 1;

            return (
              <button
                key={item._id}
                onClick={() => !isError && setSelectedItem(item)}
                className={[
                  'w-full flex items-center gap-3 px-3 py-3 text-left bg-[var(--m-bg-subtle)]',
                  !isLast ? 'border-b border-[var(--m-border-subtle)]' : '',
                  !isError ? 'active:bg-[var(--m-bg-inset)]' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                    isError ? 'bg-red-100' : 'bg-[var(--m-accent-subtle)]',
                  ].join(' ')}
                >
                  {isError ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-[var(--m-accent)]" />
                  )}
                </div>
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
                {!isError && (
                  <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixed footer — flush above nav bar */}
      <div
        className="fixed left-0 right-0 px-[var(--m-page-px)] pt-3 pb-3 border-t border-[var(--m-border-subtle)] bg-[var(--m-bg)] flex gap-3 z-20"
        style={{ bottom: 'calc(var(--m-footer-h) + env(safe-area-inset-bottom, 0px))' }}
      >
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

      {/* Document summary sheet */}
      {selectedItem && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSelectedItem(null)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[80vh] flex flex-col pb-[env(safe-area-inset-bottom)]">
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-[var(--m-page-px)] py-3 border-b border-[var(--m-border)] flex-shrink-0">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-[var(--m-text-primary)] truncate">
                  {selectedItem.generatedDocumentCode || selectedItem.fileName}
                </div>
                <div className="text-[12px] text-[var(--m-text-tertiary)] truncate mt-0.5">
                  {selectedItem.fileName}
                </div>
              </div>
              <button onClick={() => setSelectedItem(null)} className="p-1 text-[var(--m-text-tertiary)] ml-3">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* View Document button */}
            {selectedItem.documentId && (
              <div className="px-[var(--m-page-px)] py-3 border-b border-[var(--m-border-subtle)] flex-shrink-0">
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setViewingDocId(selectedItem.documentId);
                  }}
                  className="w-full py-2.5 flex items-center justify-center gap-2 text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-[10px] active:opacity-80"
                >
                  <Eye className="w-4 h-4" />
                  View Document
                </button>
              </div>
            )}

            {/* Scrollable summary content */}
            <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-4 space-y-4">
              {/* Classification */}
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-1">Classification</div>
                <div className="flex items-center gap-2">
                  {selectedItem.category && (
                    <span className="bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] text-[12px] font-medium px-2 py-0.5 rounded">
                      {selectedItem.category}
                    </span>
                  )}
                  {selectedItem.fileTypeDetected && (
                    <span className="text-[12px] text-[var(--m-text-secondary)]">
                      {selectedItem.fileTypeDetected}
                    </span>
                  )}
                  {selectedItem.confidence != null && (
                    <span className={`text-[11px] ml-auto ${
                      selectedItem.confidence >= 0.9 ? 'text-[var(--m-success)]'
                        : selectedItem.confidence >= 0.7 ? 'text-[var(--m-warning)]'
                        : 'text-[var(--m-error)]'
                    }`}>
                      {Math.round(selectedItem.confidence * 100)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Summary */}
              {selectedItem.summary && (
                <div>
                  <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-1">Summary</div>
                  <div className="text-[13px] text-[var(--m-text-primary)] leading-relaxed">
                    {selectedItem.summary}
                  </div>
                </div>
              )}

              {/* Key details from document analysis */}
              {selectedItem.documentAnalysis && (
                <div>
                  <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-1">Key Details</div>
                  <div className="space-y-1.5">
                    {selectedItem.documentAnalysis.keyAmounts?.length > 0 && (
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[var(--m-text-tertiary)]">Amounts</span>
                        <span className="text-[var(--m-text-primary)]">{selectedItem.documentAnalysis.keyAmounts.join(', ')}</span>
                      </div>
                    )}
                    {selectedItem.documentAnalysis.keyDates?.length > 0 && (
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[var(--m-text-tertiary)]">Dates</span>
                        <span className="text-[var(--m-text-primary)]">{selectedItem.documentAnalysis.keyDates.join(', ')}</span>
                      </div>
                    )}
                    {selectedItem.documentAnalysis.entities?.companies?.length > 0 && (
                      <div className="flex justify-between text-[12px]">
                        <span className="text-[var(--m-text-tertiary)]">Companies</span>
                        <span className="text-[var(--m-text-primary)]">{selectedItem.documentAnalysis.entities.companies.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Filing destination */}
              <div>
                <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-1">Filed To</div>
                <div className="text-[13px] text-[var(--m-text-primary)]">
                  {selectedItem.targetFolder || 'Unfiled'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
