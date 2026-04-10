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
        <DocumentSheet
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onViewDocument={(docId) => {
            setSelectedItem(null);
            setViewingDocId(docId);
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/* Document Summary Sheet — tabbed bottom sheet                */
/* ─────────────────────────────────────────────────────────── */

type SheetTab = 'summary' | 'intelligence' | 'details';

function DocumentSheet({ item, onClose, onViewDocument }: {
  item: any;
  onClose: () => void;
  onViewDocument: (docId: string) => void;
}) {
  const [tab, setTab] = useState<SheetTab>('summary');

  const analysis = item.documentAnalysis;
  const intelligence = item.extractedIntelligence?.fields || [];
  const hasIntelligence = intelligence.length > 0;
  const hasDetails = !!analysis;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl flex flex-col pb-[env(safe-area-inset-bottom)]" style={{ height: '90vh' }}>
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-[var(--m-page-px)] py-3 border-b border-[var(--m-border)] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-[var(--m-text-primary)] truncate">
              {item.generatedDocumentCode || item.fileName}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {item.category && (
                <span className="bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)] text-[11px] font-medium px-1.5 py-0.5 rounded">
                  {item.category}
                </span>
              )}
              {item.fileTypeDetected && (
                <span className="text-[11px] text-[var(--m-text-tertiary)]">{item.fileTypeDetected}</span>
              )}
              {item.confidence != null && (
                <span className={`text-[11px] ml-auto ${
                  item.confidence >= 0.9 ? 'text-[var(--m-success)]'
                    : item.confidence >= 0.7 ? 'text-[var(--m-warning)]'
                    : 'text-[var(--m-error)]'
                }`}>
                  {Math.round(item.confidence * 100)}%
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)] ml-3 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Document button */}
        {item.documentId && (
          <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] flex-shrink-0">
            <button
              onClick={() => onViewDocument(item.documentId)}
              className="w-full py-2.5 flex items-center justify-center gap-2 text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-[10px] active:opacity-80"
            >
              <Eye className="w-4 h-4" />
              View Document
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[var(--m-border)] flex-shrink-0">
          {(['summary', 'intelligence', 'details'] as SheetTab[]).map(t => {
            const label = t === 'summary' ? 'Summary' : t === 'intelligence' ? `Intelligence${hasIntelligence ? ` (${intelligence.length})` : ''}` : 'Details';
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-[12px] font-medium text-center border-b-2 transition-colors ${
                  tab === t
                    ? 'text-[var(--m-text-primary)] border-[var(--m-text-primary)]'
                    : 'text-[var(--m-text-tertiary)] border-transparent'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] py-4">
          {tab === 'summary' && <SummaryTab item={item} />}
          {tab === 'intelligence' && <IntelligenceTab fields={intelligence} />}
          {tab === 'details' && <DetailsTab item={item} />}
        </div>
      </div>
    </div>
  );
}

/* ── Summary Tab ── */
function SummaryTab({ item }: { item: any }) {
  const analysis = item.documentAnalysis;

  return (
    <div className="space-y-5">
      {/* Executive Summary */}
      {item.summary && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Executive Summary</div>
          <div className="text-[13px] text-[var(--m-text-primary)] leading-[1.7] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
            {item.summary}
          </div>
        </div>
      )}

      {/* Purpose */}
      {analysis?.documentPurpose && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Purpose</div>
          <div className="text-[13px] text-[var(--m-text-primary)] leading-[1.7]">
            {analysis.documentPurpose}
          </div>
        </div>
      )}

      {/* Key Amounts — as bullet list */}
      {analysis?.keyAmounts?.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Key Amounts</div>
          <ul className="space-y-1 pl-0 list-none">
            {analysis.keyAmounts.map((amt: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--m-text-primary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--m-text-tertiary)] mt-[7px] flex-shrink-0" />
                {amt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Dates — as bullet list */}
      {analysis?.keyDates?.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Key Dates</div>
          <ul className="space-y-1 pl-0 list-none">
            {analysis.keyDates.map((d: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--m-text-primary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--m-text-tertiary)] mt-[7px] flex-shrink-0" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Entities */}
      {analysis?.entities && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Entities</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.entities.companies?.map((c: string, i: number) => (
              <span key={`co-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)]">{c}</span>
            ))}
            {analysis.entities.people?.map((p: string, i: number) => (
              <span key={`pe-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]">{p}</span>
            ))}
            {analysis.entities.locations?.map((l: string, i: number) => (
              <span key={`lo-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-[#f0fdf4] text-[var(--m-success)]">{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* Filed To */}
      <div>
        <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Filed To</div>
        <div className="text-[13px] text-[var(--m-text-primary)] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-lg px-3 py-2">
          {item.targetFolder || 'Unfiled'}
        </div>
      </div>
    </div>
  );
}

/* ── Intelligence Tab ── */
function IntelligenceTab({ fields }: { fields: any[] }) {
  if (!fields || fields.length === 0) {
    return (
      <div className="text-center py-12 text-[13px] text-[var(--m-text-tertiary)]">
        No intelligence fields extracted
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="text-[11px] text-[var(--m-text-tertiary)] mb-3">
        {fields.length} field{fields.length !== 1 ? 's' : ''} extracted from document
      </div>
      <div className="border border-[var(--m-border)] rounded-[10px] overflow-hidden">
        {fields.map((field: any, i: number) => (
          <div
            key={i}
            className={`px-3 py-2.5 ${i < fields.length - 1 ? 'border-b border-[var(--m-border-subtle)]' : ''}`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[12px] font-medium text-[var(--m-text-primary)]">{field.label}</span>
              <div className="flex items-center gap-1.5">
                {field.confidence != null && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    field.confidence >= 0.9 ? 'bg-[#f0fdf4] text-[var(--m-success)]'
                      : field.confidence >= 0.7 ? 'bg-[#fefce8] text-[var(--m-warning)]'
                      : 'text-[var(--m-error)]'
                  }`}>
                    {field.confidence >= 0.9 ? 'High' : field.confidence >= 0.7 ? 'Med' : 'Low'}
                  </span>
                )}
                {field.scope && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    field.scope === 'client'
                      ? 'bg-[#fefce8] text-[var(--m-warning)]'
                      : 'bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)]'
                  }`}>
                    {field.scope === 'client' ? 'C' : 'P'}
                  </span>
                )}
              </div>
            </div>
            <div className="text-[12px] text-[var(--m-text-secondary)] leading-relaxed">
              {String(field.value)}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-[var(--m-text-tertiary)] mt-3 text-center">
        Fields saved to client/project intelligence
      </div>
    </div>
  );
}

/* ── Details Tab ── */
function DetailsTab({ item }: { item: any }) {
  const analysis = item.documentAnalysis;

  return (
    <div className="space-y-5">
      {/* File info */}
      <div>
        <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">File Information</div>
        <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] overflow-hidden">
          <DetailRow label="File Name" value={item.fileName} />
          <DetailRow label="Document Code" value={item.generatedDocumentCode || '—'} />
          <DetailRow label="Category" value={item.category || '—'} />
          <DetailRow label="Type" value={item.fileTypeDetected || '—'} />
          <DetailRow label="Folder" value={item.targetFolder || 'Unfiled'} last />
        </div>
      </div>

      {/* Document characteristics */}
      {analysis?.documentCharacteristics && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Characteristics</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.documentCharacteristics.isFinancial && <CharPill label="Financial" />}
            {analysis.documentCharacteristics.isLegal && <CharPill label="Legal" />}
            {analysis.documentCharacteristics.isReport && <CharPill label="Report" />}
            {analysis.documentCharacteristics.isIdentity && <CharPill label="Identity" />}
            {analysis.documentCharacteristics.isDesign && <CharPill label="Design" />}
            {analysis.documentCharacteristics.isCorrespondence && <CharPill label="Correspondence" />}
            {analysis.documentCharacteristics.isInternal && <CharPill label="Internal" />}
          </div>
        </div>
      )}

      {/* Classification reasoning */}
      {item.classificationReasoning && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Classification Reasoning</div>
          <div className="text-[12px] text-[var(--m-text-secondary)] leading-[1.7] bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
            {item.classificationReasoning}
          </div>
        </div>
      )}

      {/* Checklist matches */}
      {item.suggestedChecklistItems?.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">
            Checklist Matches ({item.suggestedChecklistItems.length})
          </div>
          <div className="border border-[var(--m-border)] rounded-[10px] overflow-hidden">
            {item.suggestedChecklistItems.map((match: any, i: number) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 px-3 py-2.5 ${
                  i < item.suggestedChecklistItems.length - 1 ? 'border-b border-[var(--m-border-subtle)]' : ''
                }`}
              >
                <Check className="w-4 h-4 text-[var(--m-success)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[var(--m-text-primary)] truncate">
                    {match.itemName || match.name}
                  </div>
                  <div className="text-[11px] text-[var(--m-text-tertiary)]">
                    {match.category}{match.confidence ? ` \u00B7 ${Math.round(match.confidence * 100)}% match` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email metadata */}
      {item.emailMetadata && (
        <div>
          <div className="text-[10px] font-semibold tracking-wider text-[var(--m-text-tertiary)] uppercase mb-2">Email Metadata</div>
          <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] overflow-hidden">
            {item.emailMetadata.from && <DetailRow label="From" value={item.emailMetadata.from} />}
            {item.emailMetadata.to && <DetailRow label="To" value={item.emailMetadata.to} />}
            {item.emailMetadata.subject && <DetailRow label="Subject" value={item.emailMetadata.subject} />}
            {item.emailMetadata.date && <DetailRow label="Date" value={item.emailMetadata.date} last />}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex justify-between items-start px-3 py-2.5 ${!last ? 'border-b border-[var(--m-border-subtle)]' : ''}`}>
      <span className="text-[12px] text-[var(--m-text-tertiary)] flex-shrink-0">{label}</span>
      <span className="text-[12px] text-[var(--m-text-primary)] text-right ml-4 break-words">{value}</span>
    </div>
  );
}

function CharPill({ label }: { label: string }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]">
      {label}
    </span>
  );
}
