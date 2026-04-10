'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface DocumentAnalysisSectionProps {
  analysis: any;
  defaultExpanded?: boolean;
}

export default function DocumentAnalysisSection({ analysis, defaultExpanded = false }: DocumentAnalysisSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!analysis) return null;

  const characteristics: string[] = [];
  if (analysis.documentCharacteristics?.isFinancial) characteristics.push('Financial');
  if (analysis.documentCharacteristics?.isLegal) characteristics.push('Legal');
  if (analysis.documentCharacteristics?.isReport) characteristics.push('Report');
  if (analysis.documentCharacteristics?.isIdentity) characteristics.push('Identity');
  if (analysis.documentCharacteristics?.isDesign) characteristics.push('Design');
  if (analysis.documentCharacteristics?.isCorrespondence) characteristics.push('Correspondence');

  return (
    <div className="bg-[var(--m-bg-subtle)] border border-[var(--m-border)] rounded-[10px] p-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <span className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase">
          Document Analysis
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--m-text-tertiary)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--m-text-tertiary)]" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Purpose */}
          {analysis.documentPurpose && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase mb-1">Purpose</div>
              <p className="text-[12px] text-[var(--m-text-primary)] leading-relaxed">{analysis.documentPurpose}</p>
            </div>
          )}

          {/* Entities */}
          {analysis.entities && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase mb-1">Entities</div>
              <div className="flex flex-wrap gap-1">
                {analysis.entities.companies?.map((c: string, i: number) => (
                  <span key={`co-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-[var(--m-accent-subtle)] text-[var(--m-accent-indicator)]">{c}</span>
                ))}
                {analysis.entities.locations?.map((l: string, i: number) => (
                  <span key={`loc-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-[#f0fdf4] text-[var(--m-success)]">{l}</span>
                ))}
                {analysis.entities.people?.map((p: string, i: number) => (
                  <span key={`per-${i}`} className="text-[11px] px-2 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Key Amounts */}
          {analysis.keyAmounts?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase mb-1">Key Amounts</div>
              <p className="text-[12px] text-[var(--m-text-primary)]">{analysis.keyAmounts.join(' \u00b7 ')}</p>
            </div>
          )}

          {/* Key Dates */}
          {analysis.keyDates?.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase mb-1">Key Dates</div>
              <p className="text-[12px] text-[var(--m-text-primary)]">{analysis.keyDates.join(' \u00b7 ')}</p>
            </div>
          )}

          {/* Characteristics */}
          {characteristics.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-[var(--m-text-tertiary)] uppercase mb-1">Characteristics</div>
              <div className="flex flex-wrap gap-1">
                {characteristics.map((c) => (
                  <span key={c} className="text-[11px] px-2 py-0.5 rounded bg-[var(--m-bg-inset)] text-[var(--m-text-secondary)]">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
