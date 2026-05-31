'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button, Modal, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ArrowRight,
  Loader2,
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

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
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

  const cardStyle = (selected: boolean, tone: string) => ({
    padding: 12,
    border: `1px solid ${selected ? `${tone}40` : colors.border.default}`,
    background: selected ? `${tone}10` : colors.bg.card,
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'border-color 100ms linear, background 100ms linear',
  });

  const sectionTitleStyle = {
    fontSize: 13,
    fontWeight: 500,
    color: colors.text.primary,
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Consolidate Intelligence"
      width={760}
      footer={
        <>
          {hasSelections && (
            <span style={{ fontSize: 12, color: colors.text.muted, marginRight: 'auto' }}>
              {selectedDuplicates.size} duplicates, {selectedReclassify.size} reclassify, {selectedConflicts.size} conflicts selected
            </span>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {result && !isClean && (
            <Button variant="secondary" onClick={handleAnalyze} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
              Re-analyze
            </Button>
          )}
          {hasResults && hasSelections && (
            <Button variant="primary" accent={colors.accent.blue} onClick={handleApply} disabled={applying}>
              {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Apply Selected
            </Button>
          )}
        </>
      }
    >
      <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        Detect duplicates, conflicts, and normalization opportunities
      </p>

      {/* Initial state - show analyze button */}
      {!loading && !result && (
        <EmptyState
          icon={<RefreshCw size={24} />}
          title="Analyze Knowledge Base"
          body="Analyze your knowledge base to find duplicates, conflicting values, and custom fields that could be normalized to canonical fields."
          action={
            <Button variant="primary" accent={colors.accent.blue} onClick={handleAnalyze}>
              <RefreshCw size={14} />
              Analyze Knowledge Base
            </Button>
          }
        />
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={32} className="animate-spin" style={{ color: colors.accent.blue, marginBottom: 16 }} />
          <p style={{ fontSize: 13, color: colors.text.muted }}>Analyzing knowledge base...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ background: `${colors.accent.red}10`, border: `1px solid ${colors.accent.red}40`, borderRadius: 4, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.accent.red }}>
            <AlertTriangle size={16} />
            <span style={{ fontWeight: 500, fontSize: 13 }}>Error</span>
          </div>
          <p style={{ fontSize: 12, color: colors.accent.red, marginTop: 4 }}>{error}</p>
        </div>
      )}

      {/* Clean state - no issues found */}
      {isClean && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', textAlign: 'center' }}>
          <CheckCircle2 size={32} style={{ color: colors.accent.green, marginBottom: 16 }} />
          <p style={{ fontSize: 15, fontWeight: 500, color: colors.text.primary, marginBottom: 8 }}>All Clean</p>
          <p style={{ fontSize: 12, color: colors.text.muted, maxWidth: 360 }}>
            No duplicates, conflicts, or normalization opportunities found. Your knowledge base is well organized.
          </p>
          <p style={{ fontSize: 11, color: colors.text.dim, marginTop: 16 }}>
            Analyzed {result.summary.totalItems} items
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, background: colors.bg.light, border: `1px solid ${colors.border.default}`, borderRadius: 4 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 300, color: colors.text.primary }}>{result.summary.totalItems}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>Total Items</div>
            </div>
            <div style={{ height: 32, width: 1, background: colors.border.mid }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 300, color: colors.accent.orange }}>{result.summary.duplicatesFound}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>Duplicates</div>
            </div>
            <div style={{ height: 32, width: 1, background: colors.border.mid }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 300, color: colors.accent.red }}>{result.summary.conflictsFound}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>Conflicts</div>
            </div>
            <div style={{ height: 32, width: 1, background: colors.border.mid }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 300, color: colors.accent.blue }}>{result.summary.reclassifySuggestions}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted }}>Reclassify</div>
            </div>
          </div>

          {/* Duplicates */}
          {result.duplicates.length > 0 && (
            <div>
              <h3 style={sectionTitleStyle}>
                <Copy size={16} style={{ color: colors.accent.orange }} />
                Duplicates ({result.duplicates.length})
              </h3>
              <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
                Multiple items for the same field. We&apos;ll keep the best source and archive the rest.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.duplicates.map((dup) => (
                  <div
                    key={dup.fieldPath}
                    style={cardStyle(selectedDuplicates.has(dup.fieldPath), colors.accent.orange)}
                    onClick={() => toggleDuplicate(dup.fieldPath)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500, color: colors.text.primary, fontSize: 13 }}>{dup.fieldPath}</div>
                        <p style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>{dup.reason}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <StatusPill label="Keep 1" tone={colors.accent.green} />
                          <StatusPill label={`Remove ${dup.removeIds.length}`} tone={colors.accent.red} />
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedDuplicates.has(dup.fieldPath)}
                        onChange={() => toggleDuplicate(dup.fieldPath)}
                        style={{ marginTop: 4 }}
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
              <h3 style={sectionTitleStyle}>
                <AlertTriangle size={16} style={{ color: colors.accent.red }} />
                Conflicts ({result.conflicts.length})
              </h3>
              <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
                Same field with different values. These need manual review.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.conflicts.map((conflict) => (
                  <div
                    key={conflict.fieldPath}
                    style={cardStyle(selectedConflicts.has(conflict.fieldPath), colors.accent.red)}
                    onClick={() => toggleConflict(conflict.fieldPath)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 500, color: colors.text.primary, fontSize: 13 }}>{conflict.fieldPath}</div>
                        <p style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>{conflict.description}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          {conflict.values.map((value, i) => (
                            <StatusPill
                              key={i}
                              label={formatValue(value).substring(0, 30) + (formatValue(value).length > 30 ? '...' : '')}
                              tone={colors.text.muted}
                            />
                          ))}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedConflicts.has(conflict.fieldPath)}
                        onChange={() => toggleConflict(conflict.fieldPath)}
                        style={{ marginTop: 4 }}
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
              <h3 style={sectionTitleStyle}>
                <Tag size={16} style={{ color: colors.accent.blue }} />
                Normalize to Canonical ({result.reclassify.length})
              </h3>
              <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 12 }}>
                Custom fields that should be reclassified to canonical fields.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.reclassify.map((rec) => (
                  <div
                    key={rec.itemId}
                    style={cardStyle(selectedReclassify.has(rec.itemId), colors.accent.blue)}
                    onClick={() => toggleReclassify(rec.itemId)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: MONO, fontSize: 12, color: colors.text.secondary }}>{rec.currentPath}</span>
                          <ArrowRight size={14} style={{ color: colors.text.dim }} />
                          <span style={{ fontFamily: MONO, fontSize: 12, color: colors.accent.blue, fontWeight: 500 }}>{rec.suggestedPath}</span>
                        </div>
                        <p style={{ fontSize: 12, color: colors.text.secondary, marginTop: 4 }}>{rec.reason}</p>
                        <div style={{ marginTop: 8 }}>
                          <StatusPill label={`${Math.round(rec.confidence * 100)}% confident`} tone={colors.text.muted} />
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedReclassify.has(rec.itemId)}
                        onChange={() => toggleReclassify(rec.itemId)}
                        style={{ marginTop: 4 }}
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
    </Modal>
  );
}
