'use client';

import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  Clock,
  AlertTriangle,
  History,
  Filter,
} from 'lucide-react';
import { StatusPill, FlagChip } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';
import {
  getConfidenceColor,
  getConfidenceLabel,
  getRelativeTimeString,
  formatFieldValue,
  type ConfidenceLevel,
  type EvidenceEntry,
} from './intelligenceUtils';
import { IntelligenceCardExpanded } from './IntelligenceCardExpanded';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function confidenceTone(level: ConfidenceLevel, colors: ColorPalette): string {
  if (level === 'green') return colors.accent.green;
  if (level === 'amber') return colors.accent.orange;
  return colors.accent.red;
}

interface IntelligenceCardProps {
  fieldLabel: string;
  fieldValue: string | number;
  fieldKey: string;
  confidence: number;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
  extractedAt?: string;
  isCore: boolean;
  conflictCount: number;
  priorValueCount: number;
  isRecentlyUpdated: boolean;
  evidenceTrail: EvidenceEntry[];
  clientId: string;
  projectId?: string;
  onDocumentFilter?: (doc: { documentId: string; documentName: string }) => void;
}

function truncateValue(value: string, maxLength = 80): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + '...';
}

export function IntelligenceCard({
  fieldLabel,
  fieldValue,
  fieldKey,
  confidence,
  sourceDocumentName,
  sourceDocumentId,
  extractedAt,
  isCore,
  conflictCount,
  priorValueCount,
  isRecentlyUpdated,
  evidenceTrail,
  clientId,
  projectId,
  onDocumentFilter,
}: IntelligenceCardProps) {
  const colors = useColors();
  const [isExpanded, setIsExpanded] = useState(false);
  const [filterHover, setFilterHover] = useState(false);

  const confidenceLevel = getConfidenceColor(confidence);
  const confidenceLabel = getConfidenceLabel(confidence);
  const tone = confidenceTone(confidenceLevel, colors);

  return (
    <TooltipProvider>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div
          style={{
            background: isRecentlyUpdated ? `${colors.accent.green}0d` : colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderLeft: `3px solid ${tone}`,
            borderRadius: 4,
            transition: 'background 100ms linear',
          }}
        >
          {/* Collapsed Card */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full text-left px-4 py-3 focus:outline-none"
              style={{ borderRadius: 4 }}
            >
              <div className="flex items-start justify-between gap-2">
                {/* Left: label + value */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        fontWeight: 500,
                        color: colors.text.muted,
                      }}
                    >
                      {fieldLabel}
                    </span>
                    {isCore && <StatusPill label="Core" tone={colors.accent.blue} />}
                  </div>
                  <p className="mt-1 break-words" style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>
                    {truncateValue(formatFieldValue(fieldValue, fieldKey))}
                  </p>
                </div>

                {/* Right: badges + chevron */}
                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                  {/* Confidence badge */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <StatusPill label={confidenceLabel} tone={tone} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Confidence: {confidenceLabel}</TooltipContent>
                  </Tooltip>

                  {/* Conflict indicator */}
                  {conflictCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <FlagChip label={`${conflictCount}`} severity="warn" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {conflictCount} conflicting {conflictCount === 1 ? 'value' : 'values'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Prior values indicator */}
                  {priorValueCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <StatusPill label={`${priorValueCount}`} tone={colors.text.muted} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {priorValueCount} prior {priorValueCount === 1 ? 'value' : 'values'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Expand/collapse chevron */}
                  {isExpanded ? (
                    <ChevronUp size={16} style={{ color: colors.text.dim }} />
                  ) : (
                    <ChevronDown size={16} style={{ color: colors.text.dim }} />
                  )}
                </div>
              </div>

              {/* Source doc + timestamp footer */}
              <div className="mt-2 flex items-center gap-1.5" style={{ fontSize: 11, color: colors.text.dim }}>
                {sourceDocumentId ? (
                  <>
                    <span
                      className="flex items-center gap-1"
                      style={{ color: colors.accent.blue }}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.location.href = `/docs/${sourceDocumentId}/`;
                      }}
                      role="link"
                      tabIndex={-1}
                    >
                      <FileText size={12} />
                      <span className="truncate max-w-[180px]">
                        {sourceDocumentName || 'Source document'}
                      </span>
                      <ExternalLink size={10} style={{ opacity: 0.6 }} />
                    </span>
                    {onDocumentFilter && (
                      <button
                        type="button"
                        className="p-0.5"
                        style={{
                          borderRadius: 3,
                          background: filterHover ? colors.bg.cardAlt : 'transparent',
                          transition: 'background 100ms linear',
                        }}
                        onMouseEnter={() => setFilterHover(true)}
                        onMouseLeave={() => setFilterHover(false)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDocumentFilter({
                            documentId: sourceDocumentId,
                            documentName: sourceDocumentName || 'Source document',
                          });
                        }}
                        title="View all intelligence from this document"
                      >
                        <Filter size={12} style={{ color: colors.text.muted }} />
                      </button>
                    )}
                  </>
                ) : sourceDocumentName ? (
                  <span className="flex items-center gap-1">
                    <FileText size={12} />
                    <span className="truncate max-w-[180px]">{sourceDocumentName}</span>
                  </span>
                ) : null}

                {extractedAt && (
                  <>
                    {(sourceDocumentName || sourceDocumentId) && (
                      <span style={{ color: colors.border.mid }}>|</span>
                    )}
                    <Clock size={12} />
                    <span>{getRelativeTimeString(extractedAt)}</span>
                  </>
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Expanded Detail Panel */}
          <CollapsibleContent>
            <IntelligenceCardExpanded
              evidenceTrail={evidenceTrail}
              sourceDocumentId={sourceDocumentId}
              clientId={clientId}
              projectId={projectId}
              fieldPath={fieldKey}
            />
          </CollapsibleContent>
        </div>
      </Collapsible>
    </TooltipProvider>
  );
}
