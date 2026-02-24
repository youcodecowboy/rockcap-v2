'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ArrowRight,
  Loader2,
  X,
  Trash2,
  RefreshCw,
  Tag,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface DuplicateRecommendation {
  fieldPath: string;
  keepId: string;
  removeIds: string[];
  reason: string;
}

interface ConflictDetection {
  fieldPath: string;
  itemIds: string[];
  values: unknown[];
  description: string;
}

interface ReclassificationSuggestion {
  itemId: string;
  currentPath: string;
  suggestedPath: string;
  reason: string;
  confidence: number;
}

interface ConsolidationResult {
  duplicates: DuplicateRecommendation[];
  conflicts: ConflictDetection[];
  reclassify: ReclassificationSuggestion[];
  summary: {
    totalItems: number;
    duplicatesFound: number;
    conflictsFound: number;
    reclassifySuggestions: number;
  };
}

interface ConsolidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  onConsolidationApplied?: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ConsolidationModal({
  isOpen,
  onClose,
  clientId,
  projectId,
  onConsolidationApplied,
}: ConsolidationModalProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ConsolidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());
  const [selectedReclassify, setSelectedReclassify] = useState<Set<string>>(new Set());
  const [selectedConflicts, setSelectedConflicts] = useState<Set<string>>(new Set());

  // @ts-ignore - Convex type instantiation is excessively deep
  const applyConsolidation = useMutation(api.knowledgeLibrary.applyConsolidation);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/consolidate-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, projectId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Consolidation failed');
      }

      setResult(data.result);

      // Pre-select all suggestions
      setSelectedDuplicates(new Set(data.result.duplicates.map((d: DuplicateRecommendation) => d.fieldPath)));
      setSelectedReclassify(new Set(data.result.reclassify.map((r: ReclassificationSuggestion) => r.itemId)));
      setSelectedConflicts(new Set(data.result.conflicts.map((c: ConflictDetection) => c.fieldPath)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!result) return;

    setApplying(true);
    setError(null);

    try {
      // Build the mutations to apply
      const duplicateResolutions = result.duplicates
        .filter(d => selectedDuplicates.has(d.fieldPath))
        .map(d => ({
          keepId: d.keepId as Id<"knowledgeItems">,
          removeIds: d.removeIds as Id<"knowledgeItems">[],
        }));

      const reclassifications = result.reclassify
        .filter(r => selectedReclassify.has(r.itemId))
        .map(r => ({
          itemId: r.itemId as Id<"knowledgeItems">,
          newFieldPath: r.suggestedPath,
          newLabel: r.suggestedPath.split('.').pop()?.replace(/([A-Z])/g, ' $1').trim() || r.suggestedPath,
          newCategory: r.suggestedPath.split('.')[0],
        }));

      const createConflicts = result.conflicts
        .filter(c => selectedConflicts.has(c.fieldPath))
        .map(c => ({
          fieldPath: c.fieldPath,
          category: c.fieldPath.split('.')[0],
          description: c.description,
          relatedItemIds: c.itemIds as Id<"knowledgeItems">[],
        }));

      await applyConsolidation({
        clientId: clientId,
        projectId: projectId,
        duplicateResolutions,
        reclassifications,
        createConflicts,
      });

      onConsolidationApplied?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply consolidation');
    } finally {
      setApplying(false);
    }
  };

  const toggleDuplicate = (fieldPath: string) => {
    const newSet = new Set(selectedDuplicates);
    if (newSet.has(fieldPath)) {
      newSet.delete(fieldPath);
    } else {
      newSet.add(fieldPath);
    }
    setSelectedDuplicates(newSet);
  };

  const toggleReclassify = (itemId: string) => {
    const newSet = new Set(selectedReclassify);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setSelectedReclassify(newSet);
  };

  const toggleConflict = (fieldPath: string) => {
    const newSet = new Set(selectedConflicts);
    if (newSet.has(fieldPath)) {
      newSet.delete(fieldPath);
    } else {
      newSet.add(fieldPath);
    }
    setSelectedConflicts(newSet);
  };

  if (!isOpen) return null;

  const hasSelections = selectedDuplicates.size > 0 || selectedReclassify.size > 0 || selectedConflicts.size > 0;
  const hasResults = result && (result.duplicates.length > 0 || result.reclassify.length > 0 || result.conflicts.length > 0);
  const isClean = result && result.duplicates.length === 0 && result.reclassify.length === 0 && result.conflicts.length === 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              Consolidate Intelligence
            </h2>
            <p className="text-sm text-gray-500">Detect duplicates, conflicts, and normalization opportunities</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Initial state - show analyze button */}
          {!loading && !result && (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4 text-center max-w-md">
                Analyze your knowledge base to find duplicates, conflicting values, and custom fields that could be normalized to canonical fields.
              </p>
              <Button onClick={handleAnalyze} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Analyze Knowledge Base
              </Button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
              <p className="text-gray-500">Analyzing knowledge base...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          )}

          {/* Clean state - no issues found */}
          {isClean && (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <p className="text-lg font-medium text-gray-900 mb-2">All Clean!</p>
              <p className="text-gray-500 text-center max-w-md">
                No duplicates, conflicts, or normalization opportunities found. Your knowledge base is well organized.
              </p>
              <p className="text-sm text-gray-400 mt-4">
                Analyzed {result.summary.totalItems} items
              </p>
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{result.summary.totalItems}</div>
                  <div className="text-xs text-gray-500">Total Items</div>
                </div>
                <div className="h-8 w-px bg-gray-300" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{result.summary.duplicatesFound}</div>
                  <div className="text-xs text-gray-500">Duplicates</div>
                </div>
                <div className="h-8 w-px bg-gray-300" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{result.summary.conflictsFound}</div>
                  <div className="text-xs text-gray-500">Conflicts</div>
                </div>
                <div className="h-8 w-px bg-gray-300" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{result.summary.reclassifySuggestions}</div>
                  <div className="text-xs text-gray-500">Reclassify</div>
                </div>
              </div>

              {/* Duplicates */}
              {result.duplicates.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <Copy className="w-4 h-4 text-orange-500" />
                    Duplicates ({result.duplicates.length})
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    Multiple items for the same field. We'll keep the best source and archive the rest.
                  </p>
                  <div className="space-y-2">
                    {result.duplicates.map((dup) => (
                      <div
                        key={dup.fieldPath}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedDuplicates.has(dup.fieldPath)
                            ? 'border-orange-300 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleDuplicate(dup.fieldPath)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{dup.fieldPath}</div>
                            <p className="text-sm text-gray-600 mt-1">{dup.reason}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                Keep 1
                              </Badge>
                              <Badge variant="outline" className="text-xs text-red-600 border-red-300">
                                <Trash2 className="w-3 h-3 mr-1" />
                                Remove {dup.removeIds.length}
                              </Badge>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedDuplicates.has(dup.fieldPath)}
                            onChange={() => toggleDuplicate(dup.fieldPath)}
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conflicts */}
              {result.conflicts.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Conflicts ({result.conflicts.length})
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    Same field with different values. These need manual review.
                  </p>
                  <div className="space-y-2">
                    {result.conflicts.map((conflict) => (
                      <div
                        key={conflict.fieldPath}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedConflicts.has(conflict.fieldPath)
                            ? 'border-red-300 bg-red-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleConflict(conflict.fieldPath)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-gray-900">{conflict.fieldPath}</div>
                            <p className="text-sm text-gray-600 mt-1">{conflict.description}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {conflict.values.map((value, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {formatValue(value).substring(0, 30)}
                                  {formatValue(value).length > 30 && '...'}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedConflicts.has(conflict.fieldPath)}
                            onChange={() => toggleConflict(conflict.fieldPath)}
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reclassify */}
              {result.reclassify.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-blue-500" />
                    Normalize to Canonical ({result.reclassify.length})
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    Custom fields that should be reclassified to canonical fields.
                  </p>
                  <div className="space-y-2">
                    {result.reclassify.map((rec) => (
                      <div
                        key={rec.itemId}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedReclassify.has(rec.itemId)
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => toggleReclassify(rec.itemId)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-gray-600">{rec.currentPath}</span>
                              <ArrowRight className="w-4 h-4 text-gray-400" />
                              <span className="font-mono text-sm text-blue-600 font-medium">{rec.suggestedPath}</span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{rec.reason}</p>
                            <Badge variant="outline" className="text-xs mt-2">
                              {Math.round(rec.confidence * 100)}% confident
                            </Badge>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedReclassify.has(rec.itemId)}
                            onChange={() => toggleReclassify(rec.itemId)}
                            className="mt-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {hasSelections && (
              <span>
                {selectedDuplicates.size} duplicates, {selectedReclassify.size} reclassify, {selectedConflicts.size} conflicts selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            {result && !isClean && (
              <Button onClick={handleAnalyze} variant="outline" disabled={loading} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Re-analyze
              </Button>
            )}
            {hasResults && hasSelections && (
              <Button onClick={handleApply} disabled={applying} className="gap-2">
                {applying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Apply Selected
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
