'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, Filter, Plus, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { IntelligenceCard } from './IntelligenceCard';
import { getCategoryIcon, getRelativeTimeString, type EvidenceEntry } from './intelligenceUtils';

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
}

const SORT_LABELS: Record<SortMode, string> = {
  recent: 'Recent',
  confidence: 'Confidence',
  alphabetical: 'A–Z',
};

const SORT_MODES: SortMode[] = ['recent', 'confidence', 'alphabetical'];

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
}: IntelligenceCardListProps) {
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

  const icon = categoryIcon || getCategoryIcon(categoryName);

  return (
    <div className="flex flex-col gap-3">
      {/* Category header row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Icon + name */}
        <span className="text-lg leading-none" aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-gray-900 flex-1 min-w-0 truncate">
          {categoryName}
        </h3>

        {/* Filled/total count */}
        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
          {filled}/{total}
        </span>

        {/* Last updated */}
        {lastUpdated && (
          <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {getRelativeTimeString(lastUpdated)}
          </span>
        )}

        {/* Sort control */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-gray-500 hover:text-gray-900 flex-shrink-0"
          onClick={cycleSortMode}
          title={`Sort: ${SORT_LABELS[sortMode]}`}
        >
          <ArrowUpDown className="w-3 h-3 mr-1" />
          {SORT_LABELS[sortMode]}
        </Button>

        {/* Filter indicator */}
        {filterMode !== 'all' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 flex-shrink-0"
            onClick={() => setFilterMode('all')}
            title="Clear filter"
          >
            <Filter className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}

        {/* Add button (placeholder — wired up in later task) */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-gray-400 hover:text-gray-700 flex-shrink-0"
          title="Add field"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>

      {/* Attention chips */}
      {(conflictCount > 0 || missingCount > 0 || recentCount > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {conflictCount > 0 && (
            <button
              type="button"
              onClick={() => handleChipClick('conflicts')}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                filterMode === 'conflicts'
                  ? 'bg-amber-200 border-amber-400 text-amber-900'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              )}
            >
              <AlertTriangle className="w-3 h-3" />
              {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
            </button>
          )}

          {missingCount > 0 && (
            <button
              type="button"
              onClick={() => handleChipClick('missing')}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors',
                filterMode === 'missing'
                  ? 'bg-red-200 border-red-400 text-red-900'
                  : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
              )}
            >
              <span className="w-3 h-3 rounded-full bg-red-400 inline-block flex-shrink-0" />
              {missingCount} missing
            </button>
          )}

          {recentCount > 0 && (
            <button
              type="button"
              onClick={() => handleChipClick('all')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-green-50 border-green-200 text-green-700 hover:bg-green-100 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              {recentCount} updated
            </button>
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
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <Filter className="w-6 h-6 mb-2 opacity-40" />
            <p className="text-sm">
              {filterMode !== 'all'
                ? 'No items match this filter'
                : 'No fields in this category'}
            </p>
            {filterMode !== 'all' && (
              <button
                type="button"
                className="mt-2 text-xs text-blue-500 hover:text-blue-700 underline"
                onClick={() => setFilterMode('all')}
              >
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
