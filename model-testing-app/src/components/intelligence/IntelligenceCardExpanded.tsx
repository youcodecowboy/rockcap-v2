'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import {
  FileText,
  ExternalLink,
  AlertTriangle,
  History,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { StatusPill, Skeleton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import {
  getConfidenceColor,
  getConfidenceLabel,
  getRelativeTimeString,
  type ConfidenceLevel,
  type EvidenceEntry,
} from './intelligenceUtils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function confidenceTone(level: ConfidenceLevel, colors: ColorPalette): string {
  if (level === 'green') return colors.accent.green;
  if (level === 'amber') return colors.accent.orange;
  return colors.accent.red;
}

function SectionHeading({ children, color }: { children: ReactNode; color: string }) {
  return (
    <h4
      style={{
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontWeight: 500,
        color,
      }}
    >
      {children}
    </h4>
  );
}

interface IntelligenceCardExpandedProps {
  evidenceTrail: EvidenceEntry[];
  sourceDocumentId?: string;
  clientId: string;
  projectId?: string;
  fieldPath: string;
}

export function IntelligenceCardExpanded({
  evidenceTrail,
  sourceDocumentId,
  clientId,
  projectId,
  fieldPath,
}: IntelligenceCardExpandedProps) {
  const colors = useColors();

  // Fetch document analysis on-demand when expanded
  const document = useQuery(
    api.documents.get,
    sourceDocumentId
      ? { id: sourceDocumentId as Id<'documents'> }
      : 'skip'
  );

  // Filter evidence entries for this field
  const fieldEntries = evidenceTrail.filter((e) => e.fieldPath === fieldPath);

  // Sort by confidence desc — first is current value
  const sorted = [...fieldEntries].sort((a, b) => b.confidence - a.confidence);
  const currentEntry = sorted[0];

  // Conflicts: different values from the current
  const conflicts = sorted.slice(1).filter(
    (e) =>
      String(e.value).toLowerCase() !== String(currentEntry?.value).toLowerCase()
  );

  // Prior values: same value but from older sources (superseded)
  const priorValues = sorted.slice(1).filter(
    (e) =>
      String(e.value).toLowerCase() === String(currentEntry?.value).toLowerCase()
  );

  return (
    <div
      className="px-4 py-3 space-y-4"
      style={{ borderTop: `1px solid ${colors.border.light}`, background: colors.bg.light }}
    >
      {/* Source Document Panel */}
      {sourceDocumentId && (
        <div className="space-y-2">
          <SectionHeading color={colors.text.muted}>Source Document</SectionHeading>
          {document === undefined ? (
            <div className="py-2">
              <Skeleton width="60%" height={14} />
            </div>
          ) : document === null ? (
            <p style={{ fontSize: 11, fontStyle: 'italic', color: colors.text.dim }}>Document not found</p>
          ) : (
            <div
              className="p-3 space-y-2"
              style={{ background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 4 }}
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={`/docs/${sourceDocumentId}/`}
                  className="flex items-center gap-1.5"
                  style={{ fontSize: 13, fontWeight: 500, color: colors.accent.blue }}
                >
                  <FileText size={14} style={{ flexShrink: 0 }} />
                  <span className="truncate">{document.name || document.fileName}</span>
                  <ExternalLink size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
                </a>
              </div>

              {/* Category tags */}
              {document.category && (
                <div className="flex items-center gap-1.5">
                  <StatusPill label={document.category} tone={colors.text.muted} />
                  {document.fileTypeDetected && document.fileTypeDetected !== document.category && (
                    <StatusPill label={document.fileTypeDetected} tone={colors.text.dim} />
                  )}
                </div>
              )}

              {/* Executive summary */}
              {document.documentAnalysis?.executiveSummary && (
                <p style={{ fontSize: 11, lineHeight: 1.5, color: colors.text.secondary }}>
                  {document.documentAnalysis.executiveSummary}
                </p>
              )}

              {/* Extraction metadata */}
              <div
                className="flex items-center gap-3 pt-1"
                style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
              >
                {currentEntry?.pageNumber && <span>Page {currentEntry.pageNumber}</span>}
                {currentEntry?.extractedAt && (
                  <span>Extracted {getRelativeTimeString(currentEntry.extractedAt as string)}</span>
                )}
                {currentEntry?.method && (
                  <span className="capitalize">{(currentEntry.method as string).replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence Panel */}
      {currentEntry?.sourceText && (
        <div className="space-y-2">
          <SectionHeading color={colors.text.muted}>Evidence</SectionHeading>
          <blockquote
            className="pl-3 pr-2 py-2"
            style={{
              borderLeft: `3px solid ${colors.accent.indigo}`,
              background: `${colors.accent.indigo}10`,
              borderRadius: '0 4px 4px 0',
              fontSize: 11,
              fontStyle: 'italic',
              lineHeight: 1.5,
              color: colors.text.secondary,
            }}
          >
            &ldquo;{String(currentEntry.sourceText)}&rdquo;
          </blockquote>
        </div>
      )}

      {/* Conflict Panel */}
      {conflicts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={14} style={{ color: colors.accent.orange }} />
            <SectionHeading color={colors.accent.orange}>Conflicting Values</SectionHeading>
          </div>
          <div
            className="p-3 space-y-2"
            style={{ background: `${colors.accent.orange}10`, border: `1px solid ${colors.accent.orange}40`, borderRadius: 4 }}
          >
            {conflicts.map((conflict, idx) => {
              const level = getConfidenceColor(conflict.confidence);
              return (
                <div key={idx} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0" style={{ fontSize: 11 }}>
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>
                      {String(conflict.value)}
                    </span>
                    {conflict.sourceDocumentName && (
                      <span style={{ marginLeft: 6, color: colors.text.muted }}>
                        from {String(conflict.sourceDocumentName)}
                      </span>
                    )}
                  </div>
                  <span style={{ flexShrink: 0 }}>
                    <StatusPill label={getConfidenceLabel(conflict.confidence)} tone={confidenceTone(level, colors)} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Prior Values Panel */}
      {priorValues.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <History size={14} style={{ color: colors.text.dim }} />
            <SectionHeading color={colors.text.dim}>Prior Values</SectionHeading>
          </div>
          <div className="space-y-1.5">
            {priorValues.map((prior, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2"
                style={{ fontSize: 11, opacity: 0.6 }}
              >
                <span style={{ textDecoration: 'line-through', color: colors.text.secondary }}>
                  {String(prior.value)}
                </span>
                {prior.sourceDocumentName && (
                  <span className="truncate max-w-[150px]" style={{ color: colors.text.dim }}>
                    {String(prior.sourceDocumentName)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
