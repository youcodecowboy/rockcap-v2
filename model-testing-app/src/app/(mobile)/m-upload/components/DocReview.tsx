'use client';

import { useState } from 'react';
import { Building } from 'lucide-react';
import { ReviewDoc } from '@/contexts/UploadContext';
import CategorySheet from './CategorySheet';
import FilingSheet from './FilingSheet';

interface DocReviewProps {
  doc: ReviewDoc;
  onUpdate: (updates: Partial<ReviewDoc>) => void;
}

/** Map of common extracted-data keys to display labels */
const KEY_DETAIL_FIELDS: [string[], string][] = [
  [['propertyAddress', 'property'], 'Property'],
  [['valuationAmount', 'value', 'totalValue'], 'Value'],
  [['surveyor', 'preparedBy', 'author'], 'Author'],
  [['date', 'reportDate', 'valuationDate'], 'Date'],
  [['borrower', 'applicant'], 'Borrower'],
  [['lender'], 'Lender'],
];

function extractKeyDetails(data: any): { label: string; value: string }[] {
  if (!data || typeof data !== 'object') return [];
  const results: { label: string; value: string }[] = [];
  for (const [keys, label] of KEY_DETAIL_FIELDS) {
    for (const k of keys) {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
        results.push({ label, value: String(data[k]) });
        break;
      }
    }
  }
  return results;
}

function confidenceColorClass(confidence: number): string {
  if (confidence >= 80) return 'bg-[var(--m-success)]';
  if (confidence >= 50) return 'bg-[var(--m-warning)]';
  return 'bg-[var(--m-error)]';
}

export default function DocReview({ doc, onUpdate }: DocReviewProps) {
  const [showCategory, setShowCategory] = useState(false);
  const [showFiling, setShowFiling] = useState(false);

  const keyDetails = extractKeyDetails(doc.analysis.extractedData);
  const conf = doc.analysis.confidence;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-[var(--m-page-px)] pb-6">

        {/* Document Title */}
        <label className="block text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] mt-5 mb-1.5">DOCUMENT TITLE</label>
        <div className="bg-[var(--m-bg-subtle)] rounded-[10px] px-3.5 py-3 border border-[var(--m-border)]">
          <span className="text-sm text-[var(--m-text-primary)] break-words">
            {doc.fileName}
          </span>
        </div>

        {/* Summary */}
        <label className="block text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] mt-5 mb-1.5">SUMMARY</label>
        <div className="bg-[var(--m-bg-subtle)] rounded-[10px] px-3.5 py-3 border border-[var(--m-border)]">
          <span className="text-sm text-[var(--m-text-primary)] leading-relaxed">
            {doc.analysis.summary}
          </span>
        </div>

        {/* Classification */}
        <label className="block text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] mt-5 mb-1.5">CLASSIFICATION</label>
        <div
          className="bg-[var(--m-bg-subtle)] rounded-[10px] px-3.5 py-3 border border-[var(--m-border)] cursor-pointer"
          onClick={() => setShowCategory(true)}
        >
          <div className="flex justify-between items-center">
            <div className="flex gap-4 flex-1">
              <div>
                <div className="text-[11px] text-[var(--m-text-secondary)] mb-0.5">Category</div>
                <div className="text-sm text-[var(--m-text-primary)]">{doc.category}</div>
              </div>
              <div>
                <div className="text-[11px] text-[var(--m-text-secondary)] mb-0.5">Type</div>
                <div className="text-sm text-[var(--m-text-primary)]">{doc.fileType}</div>
              </div>
            </div>
            <span className="text-[var(--m-text-secondary)] text-xs">{'\u25BC'}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <span
              className={`w-2 h-2 rounded-full inline-block ${confidenceColorClass(conf)}`}
            />
            <span className="text-xs text-[var(--m-text-secondary)]">
              {conf}% confidence
            </span>
          </div>
        </div>

        {/* Filing Destination */}
        <label className="block text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] mt-5 mb-1.5">FILE TO</label>
        <div
          className="bg-[var(--m-bg-subtle)] rounded-[10px] px-3.5 py-3 border border-[var(--m-border)] cursor-pointer"
          onClick={() => setShowFiling(true)}
        >
          {doc.clientId ? (
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm text-[var(--m-text-primary)] flex items-center gap-1.5">
                  <Building size={14} className="text-[var(--m-text-tertiary)] flex-shrink-0" />
                  <span>
                    {doc.clientName}
                    {doc.projectName ? ` \u2192 ${doc.projectName}` : ''}
                  </span>
                </div>
                {doc.folderName && (
                  <div className="text-xs text-[var(--m-text-secondary)] mt-1">
                    {doc.folderName}
                  </div>
                )}
              </div>
              <span className="text-xs text-[var(--m-accent)]">Edit</span>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-sm text-[var(--m-error)]">
                Client required &mdash; tap to select
              </span>
              <span className="text-xs text-[var(--m-accent)]">Edit</span>
            </div>
          )}
        </div>

        {/* Key Details */}
        {keyDetails.length > 0 && (
          <>
            <label className="block text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] mt-5 mb-1.5">KEY DETAILS</label>
            <div className="bg-[var(--m-bg-subtle)] rounded-[10px] px-3.5 py-3 border border-[var(--m-border)]">
              <table className="w-full border-collapse">
                <tbody>
                  {keyDetails.map((kv) => (
                    <tr key={kv.label}>
                      <td className="text-xs text-[var(--m-text-secondary)] py-1.5 pr-2 align-top whitespace-nowrap">
                        {kv.label}
                      </td>
                      <td className="text-sm text-[var(--m-text-primary)] py-1.5 break-words">
                        {kv.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Category Sheet */}
      {showCategory && (
        <CategorySheet
          currentCategory={doc.category}
          currentType={doc.fileType}
          onSelect={(category, fileType) => {
            onUpdate({ category, fileType });
            setShowCategory(false);
          }}
          onClose={() => setShowCategory(false)}
        />
      )}

      {/* Filing Sheet */}
      {showFiling && (
        <FilingSheet
          currentClientId={doc.clientId}
          currentProjectId={doc.projectId as string | undefined}
          currentFolderTypeKey={doc.folderTypeKey}
          currentFolderLevel={doc.folderLevel}
          onSelect={(filing) => {
            onUpdate({
              clientId: filing.clientId as any,
              clientName: filing.clientName,
              projectId: filing.projectId as any,
              projectName: filing.projectName,
              folderTypeKey: filing.folderTypeKey,
              folderLevel: filing.folderLevel,
              folderName: filing.folderName,
            });
            setShowFiling(false);
          }}
          onClose={() => setShowFiling(false)}
        />
      )}
    </>
  );
}
