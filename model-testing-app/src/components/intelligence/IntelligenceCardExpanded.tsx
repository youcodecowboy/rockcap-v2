'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  ExternalLink,
  AlertTriangle,
  History,
  Loader2,
} from 'lucide-react';
import {
  getConfidenceColor,
  getConfidenceLabel,
  getRelativeTimeString,
  CONFIDENCE_BADGE_STYLES,
  type EvidenceEntry,
} from './intelligenceUtils';

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
    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-4 text-sm">
      {/* Source Document Panel */}
      {sourceDocumentId && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Source Document
          </h4>
          {document === undefined ? (
            <div className="flex items-center gap-2 text-gray-400 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading document...</span>
            </div>
          ) : document === null ? (
            <p className="text-xs text-gray-400 italic">Document not found</p>
          ) : (
            <div className="bg-white rounded-md border border-gray-200 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={`/docs/${sourceDocumentId}/`}
                  className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
                >
                  <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{document.name || document.fileName}</span>
                  <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
                </a>
              </div>

              {/* Category tags */}
              {document.category && (
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {document.category}
                  </Badge>
                  {document.fileTypeDetected && document.fileTypeDetected !== document.category && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-gray-500"
                    >
                      {document.fileTypeDetected}
                    </Badge>
                  )}
                </div>
              )}

              {/* Executive summary */}
              {document.documentAnalysis?.executiveSummary && (
                <p className="text-xs text-gray-600 leading-relaxed">
                  {document.documentAnalysis.executiveSummary}
                </p>
              )}

              {/* Extraction metadata */}
              <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-1">
                {currentEntry?.pageNumber && (
                  <span>Page {currentEntry.pageNumber}</span>
                )}
                {currentEntry?.extractedAt && (
                  <span>
                    Extracted{' '}
                    {getRelativeTimeString(currentEntry.extractedAt as string)}
                  </span>
                )}
                {currentEntry?.method && (
                  <span className="capitalize">
                    {(currentEntry.method as string).replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evidence Panel */}
      {currentEntry?.sourceText && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Evidence
          </h4>
          <blockquote className="border-l-4 border-l-indigo-400 bg-indigo-50/50 pl-3 pr-2 py-2 text-xs text-gray-700 italic leading-relaxed rounded-r-md">
            &ldquo;{String(currentEntry.sourceText)}&rdquo;
          </blockquote>
        </div>
      )}

      {/* Conflict Panel */}
      {conflicts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
              Conflicting Values
            </h4>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
            {conflicts.map((conflict, idx) => {
              const level = getConfidenceColor(conflict.confidence);
              return (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-2 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-900">
                      {String(conflict.value)}
                    </span>
                    {conflict.sourceDocumentName && (
                      <span className="text-gray-500 ml-1.5">
                        from {String(conflict.sourceDocumentName)}
                      </span>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0 flex-shrink-0',
                      CONFIDENCE_BADGE_STYLES[level]
                    )}
                  >
                    {getConfidenceLabel(conflict.confidence)}
                  </Badge>
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
            <History className="w-3.5 h-3.5 text-gray-400" />
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Prior Values
            </h4>
          </div>
          <div className="space-y-1.5">
            {priorValues.map((prior, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 text-xs opacity-60"
              >
                <span className="line-through text-gray-600">
                  {String(prior.value)}
                </span>
                {prior.sourceDocumentName && (
                  <span className="text-gray-400 truncate max-w-[150px]">
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
