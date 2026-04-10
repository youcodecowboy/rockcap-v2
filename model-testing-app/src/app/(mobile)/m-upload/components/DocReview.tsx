'use client';

import { useState } from 'react';
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

function confidenceColor(confidence: number): string {
  if (confidence >= 80) return '#22c55e'; // green
  if (confidence >= 50) return '#f59e0b'; // amber
  return '#ef4444'; // red
}

export default function DocReview({ doc, onUpdate }: DocReviewProps) {
  const [showCategory, setShowCategory] = useState(false);
  const [showFiling, setShowFiling] = useState(false);

  const keyDetails = extractKeyDetails(doc.analysis.extractedData);
  const conf = doc.analysis.confidence;

  return (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 var(--m-page-px, 16px) 24px' }}>

        {/* Document Title */}
        <label style={labelStyle}>DOCUMENT TITLE</label>
        <div style={cardStyle}>
          <span style={{ fontSize: 14, color: 'var(--m-text-primary, #fff)', wordBreak: 'break-word' }}>
            {doc.fileName}
          </span>
        </div>

        {/* Summary */}
        <label style={labelStyle}>SUMMARY</label>
        <div style={cardStyle}>
          <span style={{ fontSize: 14, color: 'var(--m-text-primary, #fff)', lineHeight: 1.5 }}>
            {doc.analysis.summary}
          </span>
        </div>

        {/* Classification */}
        <label style={labelStyle}>CLASSIFICATION</label>
        <div
          style={{ ...cardStyle, cursor: 'pointer' }}
          onClick={() => setShowCategory(true)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 16, flex: 1 }}>
              <div>
                <div style={sublabelStyle}>Category</div>
                <div style={{ fontSize: 14, color: 'var(--m-text-primary, #fff)' }}>{doc.category}</div>
              </div>
              <div>
                <div style={sublabelStyle}>Type</div>
                <div style={{ fontSize: 14, color: 'var(--m-text-primary, #fff)' }}>{doc.fileType}</div>
              </div>
            </div>
            <span style={{ color: 'var(--m-text-secondary, #888)', fontSize: 12 }}>{'\u25BC'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: confidenceColor(conf),
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--m-text-secondary, #888)' }}>
              {conf}% confidence
            </span>
          </div>
        </div>

        {/* Filing Destination */}
        <label style={labelStyle}>FILE TO</label>
        <div
          style={{ ...cardStyle, cursor: 'pointer' }}
          onClick={() => setShowFiling(true)}
        >
          {doc.clientId ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, color: 'var(--m-text-primary, #fff)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{'\uD83C\uDFE0'}</span>
                  <span>
                    {doc.clientName}
                    {doc.projectName ? ` \u2192 ${doc.projectName}` : ''}
                  </span>
                </div>
                {doc.folderName && (
                  <div style={{ fontSize: 12, color: 'var(--m-text-secondary, #888)', marginTop: 4 }}>
                    {doc.folderName}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, color: 'var(--m-accent, #3b82f6)' }}>Edit</span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#ef4444' }}>
                Client required &mdash; tap to select
              </span>
              <span style={{ fontSize: 12, color: 'var(--m-accent, #3b82f6)' }}>Edit</span>
            </div>
          )}
        </div>

        {/* Key Details */}
        {keyDetails.length > 0 && (
          <>
            <label style={labelStyle}>KEY DETAILS</label>
            <div style={cardStyle}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {keyDetails.map((kv) => (
                    <tr key={kv.label}>
                      <td
                        style={{
                          fontSize: 12,
                          color: 'var(--m-text-secondary, #888)',
                          padding: '6px 8px 6px 0',
                          verticalAlign: 'top',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {kv.label}
                      </td>
                      <td
                        style={{
                          fontSize: 14,
                          color: 'var(--m-text-primary, #fff)',
                          padding: '6px 0',
                          wordBreak: 'break-word',
                        }}
                      >
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

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  color: 'var(--m-text-secondary, #888)',
  marginTop: 20,
  marginBottom: 6,
};

const sublabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--m-text-secondary, #888)',
  marginBottom: 2,
};

const cardStyle: React.CSSProperties = {
  background: 'var(--m-card, #1a1a1a)',
  borderRadius: 10,
  padding: '12px 14px',
  border: '1px solid var(--m-border, #2a2a2a)',
};
