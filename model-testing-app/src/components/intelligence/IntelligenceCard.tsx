'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import {
  getConfidenceColor,
  getConfidenceLabel,
  getRelativeTimeString,
  CONFIDENCE_BORDER_COLORS,
  CONFIDENCE_BADGE_STYLES,
  type EvidenceEntry,
} from './intelligenceUtils';
import { IntelligenceCardExpanded } from './IntelligenceCardExpanded';

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
}

function truncateValue(value: string | number, maxLength = 80): string {
  const str = String(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
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
}: IntelligenceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const confidenceLevel = getConfidenceColor(confidence);
  const confidenceLabel = getConfidenceLabel(confidence);

  return (
    <TooltipProvider>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div
          className={cn(
            'bg-white border rounded-lg border-l-4 transition-all',
            CONFIDENCE_BORDER_COLORS[confidenceLevel],
            isRecentlyUpdated && 'bg-green-50/30',
            isExpanded && 'shadow-sm'
          )}
        >
          {/* Collapsed Card */}
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full text-left px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset rounded-lg"
            >
              <div className="flex items-start justify-between gap-2">
                {/* Left: label + value */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {fieldLabel}
                    </span>
                    {isCore && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-700 bg-blue-50"
                      >
                        Core
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-900 break-words">
                    {truncateValue(fieldValue)}
                  </p>
                </div>

                {/* Right: badges + chevron */}
                <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                  {/* Confidence badge */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0',
                            CONFIDENCE_BADGE_STYLES[confidenceLevel]
                          )}
                        >
                          {confidenceLabel}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Confidence: {confidenceLabel}
                    </TooltipContent>
                  </Tooltip>

                  {/* Conflict indicator */}
                  {conflictCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50"
                          >
                            <AlertTriangle className="w-3 h-3 mr-0.5" />
                            {conflictCount}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {conflictCount} conflicting{' '}
                        {conflictCount === 1 ? 'value' : 'values'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Prior values indicator */}
                  {priorValueCount > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500 bg-gray-50"
                          >
                            <History className="w-3 h-3 mr-0.5" />
                            {priorValueCount}
                          </Badge>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {priorValueCount} prior{' '}
                        {priorValueCount === 1 ? 'value' : 'values'}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Expand/collapse chevron */}
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Source doc + timestamp footer */}
              <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                {sourceDocumentId ? (
                  <span
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.location.href = `/docs/${sourceDocumentId}/`;
                    }}
                    role="link"
                    tabIndex={-1}
                  >
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[180px]">
                      {sourceDocumentName || 'Source document'}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </span>
                ) : sourceDocumentName ? (
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span className="truncate max-w-[180px]">
                      {sourceDocumentName}
                    </span>
                  </span>
                ) : null}

                {extractedAt && (
                  <>
                    {(sourceDocumentName || sourceDocumentId) && (
                      <span className="text-gray-300">|</span>
                    )}
                    <Clock className="w-3 h-3" />
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
