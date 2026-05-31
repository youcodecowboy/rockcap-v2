'use client';

import { useState, useMemo } from 'react';
import { ArrowUpDown, Filter, Plus, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { Button, IconButton, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { IntelligenceCard } from './IntelligenceCard';
import { getCategoryLucideIcon, getRelativeTimeString, type EvidenceEntry } from './intelligenceUtils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface IntelligenceItem {
  fieldKey: string;
  fieldLabel: string;
  fieldValue: string | number;
  confidence: number;
  sourceDocumentName?: string;
  sourceDocumentId?: string;
  extractedAt?: string;
  isCore: boolean;
  conflictCount: number;
  priorValueCount: number;
  isRecentlyUpdated: boolean;
}

type SortMode = 'recent' | 'confidence' | 'alphabetical';
type FilterMode = 'all' | 'conflicts' | 'missing';

interface IntelligenceCardListProps {
  items: IntelligenceItem[];
  categoryName: string;
  categoryIcon: string;
  filled: number;
  total: number;
  lastUpdated?: string;
  clientId: string;
  projectId?: string;
  evidenceTrail: EvidenceEntry[];
  onDocumentFilter?: (doc: { documentId: string; documentName: string }) => void;
}

const SORT_LABELS: Record<SortMode, string> = {
  recent: 'Recent',
  confidence: 'Confidence',
  alphabetical: 'A–Z',
};

const SORT_MODES: SortMode[] = ['recent', 'confidence', 'alphabetical'];

function AttentionChip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-center gap-1"
      style={{
        padding: '2px 8px',
        borderRadius: 2,
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.04em',
        fontWeight: 500,
        border: `1px solid ${tone}40`,
        color: tone,
        background: active || hover ? `${tone}20` : `${tone}12`,
        transition: 'background 100ms linear',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export function IntelligenceCardList({
  items,
  categoryName,
  categoryIcon,
  filled,
  total,
  lastUpdated,
  clientId,
  projectId,
  evidenceTrail,
  onDocumentFilter,
}: IntelligenceCardListProps) {
  const colors = useColors();
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Derive attention counts
  const conflictCount = useMemo(
    () => items.filter((item) => item.conflictCount > 0).length,
    [items]
  );
  const missingCount = useMemo(
    () => total - filled,
    [total, filled]
  );
  const recentCount = useMemo(
    () => items.filter((item) => item.isRecentlyUpdated).length,
    [items]
  );

  // Filter
  const filteredItems = useMemo(() => {
    switch (filterMode) {
      case 'conflicts':
        return items.filter((item) => item.conflictCount > 0);
      case 'missing':
        // "Missing" items have no value — represent them as empty string
        return items.filter(
          (item) => item.fieldValue === '' || item.fieldValue === null || item.fieldValue === undefined
        );
      default:
        return items;
    }
  }, [items, filterMode]);

  // Sort
  const sortedItems = useMemo(() => {
    const arr = [...filteredItems];
    switch (sortMode) {
      case 'confidence':
        return arr.sort((a, b) => b.confidence - a.confidence);
      case 'alphabetical':
        return arr.sort((a, b) => a.fieldLabel.localeCompare(b.fieldLabel));
      case 'recent':
      default:
        return arr.sort((a, b) => {
          // Recently updated first, then by extractedAt desc
          if (a.isRecentlyUpdated && !b.isRecentlyUpdated) return -1;
          if (!a.isRecentlyUpdated && b.isRecentlyUpdated) return 1;
          const aTime = a.extractedAt ? new Date(a.extractedAt).getTime() : 0;
          const bTime = b.extractedAt ? new Date(b.extractedAt).getTime() : 0;
          return bTime - aTime;
        });
    }
  }, [filteredItems, sortMode]);

  // Cycle through sort modes
  function cycleSortMode() {
    const idx = SORT_MODES.indexOf(sortMode);
    setSortMode(SORT_MODES[(idx + 1) % SORT_MODES.length]);
  }

  // Toggle attention chip filters
  function handleChipClick(chip: FilterMode) {
    setFilterMode((prev) => (prev === chip ? 'all' : chip));
  }

  const IconComponent = getCategoryLucideIcon(categoryName);

  return (
    <div className="flex flex-col gap-3">
      {/* Category header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Icon + name */}
        <IconComponent size={18} style={{ color: colors.text.secondary, flexShrink: 0 }} aria-hidden="true" />
        <h3
          className="flex-1 min-w-0 truncate"
          style={{ fontSize: 13, fontWeight: 600, color: colors.text.primary }}
        >
          {categoryName}
        </h3>

        {/* Filled/total count */}
        <span
          className="tabular-nums flex-shrink-0"
          style={{ fontFamily: MONO, fontSize: 11, color: colors.text.dim }}
        >
          {filled}/{total}
        </span>

        {/* Last updated */}
        {lastUpdated && (
          <span
            className="flex items-center gap-1 flex-shrink-0"
            style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
          >
            <Clock size={12} />
            {getRelativeTimeString(lastUpdated)}
          </span>
        )}

        {/* Sort control */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cycleSortMode}
          title={`Sort: ${SORT_LABELS[sortMode]}`}
        >
          <ArrowUpDown size={12} />
          {SORT_LABELS[sortMode]}
        </Button>

        {/* Filter indicator */}
        {filterMode !== 'all' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFilterMode('all')}
            title="Clear filter"
          >
            <Filter size={12} />
            Clear
          </Button>
        )}

        {/* Add button (placeholder — wired up in later task) */}
        <IconButton label="Add field">
          <Plus size={14} />
        </IconButton>
      </div>

      {/* Attention chips */}
      {(conflictCount > 0 || missingCount > 0 || recentCount > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {conflictCount > 0 && (
            <AttentionChip active={filterMode === 'conflicts'} tone={colors.accent.orange} onClick={() => handleChipClick('conflicts')}>
              <AlertTriangle size={12} />
              {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
            </AttentionChip>
          )}

          {missingCount > 0 && (
            <AttentionChip active={filterMode === 'missing'} tone={colors.accent.red} onClick={() => handleChipClick('missing')}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent.red, display: 'inline-block', flexShrink: 0 }} />
              {missingCount} missing
            </AttentionChip>
          )}

          {recentCount > 0 && (
            <AttentionChip active={false} tone={colors.accent.green} onClick={() => handleChipClick('all')}>
              <Sparkles size={12} />
              {recentCount} updated
            </AttentionChip>
          )}
        </div>
      )}

      {/* Card list */}
      <div className="flex flex-col gap-2">
        {sortedItems.length > 0 ? (
          sortedItems.map((item) => (
            <IntelligenceCard
              key={item.fieldKey}
              fieldKey={item.fieldKey}
              fieldLabel={item.fieldLabel}
              fieldValue={item.fieldValue}
              confidence={item.confidence}
              sourceDocumentName={item.sourceDocumentName}
              sourceDocumentId={item.sourceDocumentId}
              extractedAt={item.extractedAt}
              isCore={item.isCore}
              conflictCount={item.conflictCount}
              priorValueCount={item.priorValueCount}
              isRecentlyUpdated={item.isRecentlyUpdated}
              evidenceTrail={evidenceTrail}
              clientId={clientId}
              projectId={projectId}
              onDocumentFilter={onDocumentFilter}
            />
          ))
        ) : (
          <EmptyState
            icon={<Filter size={24} />}
            title={filterMode !== 'all' ? 'No items match this filter' : 'No fields in this category'}
            action={
              filterMode !== 'all' ? (
                <Button variant="secondary" onClick={() => setFilterMode('all')}>
                  Clear filter
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
