'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ClassificationDoc {
  fileTypeDetected?: string;
  category?: string;
  confidence?: number;
  classificationReasoning?: string;
  documentAnalysis?: {
    documentCharacteristics?: {
      isFinancial?: boolean;
      isLegal?: boolean;
      isIdentity?: boolean;
      isReport?: boolean;
      isDesign?: boolean;
      isCorrespondence?: boolean;
      hasMultipleProjects?: boolean;
      isInternal?: boolean;
    };
  };
}

interface ClassificationTabProps {
  doc: ClassificationDoc;
}

const CHARACTERISTIC_LABELS: Record<string, string> = {
  isFinancial: 'Financial',
  isLegal: 'Legal',
  isIdentity: 'Identity',
  isReport: 'Report',
  isDesign: 'Design',
  isCorrespondence: 'Correspondence',
  hasMultipleProjects: 'Multi-project',
  isInternal: 'Internal',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] font-medium text-[var(--m-text-secondary)] mb-1.5">{children}</p>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={[
        'inline-flex items-center px-2.5 py-1 text-[12px] rounded-full',
        className ?? 'bg-[var(--m-bg-inset)] text-[var(--m-text-primary)]',
      ].join(' ')}
    >
      {children}
    </span>
  );
}

function confidenceClass(pct: number): string {
  if (pct >= 80) return 'bg-green-100 text-green-800';
  if (pct >= 60) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export default function ClassificationTab({ doc }: ClassificationTabProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  const characteristics = doc.documentAnalysis?.documentCharacteristics;
  const trueFlags = characteristics
    ? (Object.keys(characteristics) as (keyof typeof characteristics)[]).filter(
        (k) => characteristics[k] === true
      )
    : [];

  const confidencePct =
    doc.confidence !== undefined ? Math.round(doc.confidence * 100) : undefined;

  const hasAnyData =
    doc.fileTypeDetected ||
    doc.category ||
    confidencePct !== undefined ||
    trueFlags.length > 0 ||
    doc.classificationReasoning;

  if (!hasAnyData) {
    return (
      <div className="px-[var(--m-page-px)] py-10 text-center text-[13px] text-[var(--m-text-tertiary)]">
        Document not yet classified
      </div>
    );
  }

  return (
    <div className="px-[var(--m-page-px)] pb-6">
      {doc.fileTypeDetected && (
        <div className="py-3 border-b border-[var(--m-border-subtle)]">
          <SectionLabel>Document Type</SectionLabel>
          <Badge>{doc.fileTypeDetected}</Badge>
        </div>
      )}

      {doc.category && (
        <div className="py-3 border-b border-[var(--m-border-subtle)]">
          <SectionLabel>Category</SectionLabel>
          <Badge>{doc.category}</Badge>
        </div>
      )}

      {confidencePct !== undefined && (
        <div className="py-3 border-b border-[var(--m-border-subtle)]">
          <SectionLabel>Confidence</SectionLabel>
          <Badge className={confidenceClass(confidencePct)}>{confidencePct}%</Badge>
        </div>
      )}

      {trueFlags.length > 0 && (
        <div className="py-3 border-b border-[var(--m-border-subtle)]">
          <SectionLabel>Characteristics</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {trueFlags.map((flag) => (
              <Badge key={flag}>{CHARACTERISTIC_LABELS[flag] ?? flag}</Badge>
            ))}
          </div>
        </div>
      )}

      {doc.classificationReasoning && (
        <div className="py-3">
          <button
            onClick={() => setReasoningOpen((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <SectionLabel>Classification Reasoning</SectionLabel>
            {reasoningOpen ? (
              <ChevronUp size={16} className="text-[var(--m-text-tertiary)] shrink-0 mb-1.5" />
            ) : (
              <ChevronDown size={16} className="text-[var(--m-text-tertiary)] shrink-0 mb-1.5" />
            )}
          </button>
          {reasoningOpen && (
            <p className="text-[13px] text-[var(--m-text-primary)] leading-relaxed mt-1">
              {doc.classificationReasoning}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
