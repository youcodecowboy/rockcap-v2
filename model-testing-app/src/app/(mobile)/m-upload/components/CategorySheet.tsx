'use client';

import { useState, useMemo } from 'react';
import { X, Search, Check } from 'lucide-react';

const CATEGORIES = [
  'Appraisals',
  'Plans',
  'Inspections',
  'Professional Reports',
  'KYC',
  'Loan Terms',
  'Legal Documents',
  'Project Documents',
  'Financial Documents',
  'Insurance',
  'Communications',
  'Warranties',
  'Photographs',
] as const;

interface CategorySheetProps {
  currentCategory: string;
  currentType: string;
  onSelect: (category: string, type: string) => void;
  onClose: () => void;
}

export default function CategorySheet({
  currentCategory,
  currentType,
  onSelect,
  onClose,
}: CategorySheetProps) {
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);
  const [type, setType] = useState(currentType);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return CATEGORIES;
    const q = search.toLowerCase();
    return CATEGORIES.filter(c => c.toLowerCase().includes(q));
  }, [search]);

  function handleApply() {
    onSelect(selectedCategory, type);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[85vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-[var(--m-page-px)] pt-1 pb-3 border-b border-[var(--m-border)] flex-shrink-0 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-[var(--m-text-primary)]">Classification</span>
          <button onClick={onClose} className="p-1 -mr-1 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-[var(--m-page-px)] py-2.5 flex-shrink-0">
          <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories..."
              className="flex-1 bg-transparent text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>

        {/* Category list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(cat => {
            const isActive = cat === selectedCategory;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                  isActive ? 'bg-white' : ''
                }`}
              >
                <span className={`flex-1 text-[13px] ${isActive ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-secondary)]'}`}>
                  {cat}
                </span>
                {isActive && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
              No categories match your search
            </div>
          )}
        </div>

        {/* Document type input */}
        <div className="flex-shrink-0 border-t border-[var(--m-border)] px-[var(--m-page-px)] pt-3 pb-2">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-[var(--m-text-secondary)] mb-1.5 block">
            Document Type
          </label>
          <input
            type="text"
            value={type}
            onChange={e => setType(e.target.value)}
            placeholder="e.g. RICS Valuation Report"
            className="w-full bg-[var(--m-bg-inset)] rounded-lg px-3 py-2.5 text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none border border-[var(--m-border)]"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Apply button */}
        <div className="flex-shrink-0 px-[var(--m-page-px)] pt-2 pb-1">
          <button
            onClick={handleApply}
            disabled={!selectedCategory}
            className="w-full py-2.5 text-center text-[14px] font-medium text-white bg-black rounded-lg disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
