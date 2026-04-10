'use client';

import { useState } from 'react';
import { X, Check, Search } from 'lucide-react';

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
];

interface CategorySheetProps {
  currentCategory: string;
  currentType: string;
  onSelect: (category: string, type: string) => void;
  onClose: () => void;
}

export default function CategorySheet({ currentCategory, currentType, onSelect, onClose }: CategorySheetProps) {
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);
  const [docType, setDocType] = useState(currentType);
  const [search, setSearch] = useState('');

  const filtered = search
    ? CATEGORIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : CATEGORIES;

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-2xl max-h-[80vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-[var(--m-page-px)] pt-4 pb-3 border-b border-[var(--m-border)]">
          <span className="text-[15px] font-semibold text-[var(--m-text-primary)]">Classification</span>
          <button onClick={onClose} className="p-1">
            <X className="w-5 h-5 text-[var(--m-text-tertiary)]" />
          </button>
        </div>

        {/* Search */}
        <div className="px-[var(--m-page-px)] py-2 border-b border-[var(--m-border)]">
          <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
            <input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-tertiary)] outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>

        {/* Categories list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex items-center justify-between w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)] ${
                  isSelected ? 'bg-[var(--m-bg-subtle)] font-medium' : ''
                }`}
              >
                <span className="text-[13px] text-[var(--m-text-primary)]">{cat}</span>
                {isSelected && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Document Type */}
        <div className="px-[var(--m-page-px)] py-3 border-t border-[var(--m-border)]">
          <div className="text-[11px] font-semibold tracking-wider text-[var(--m-text-secondary)] uppercase mb-1.5">
            Document Type
          </div>
          <input
            type="text"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            placeholder="e.g. RICS Valuation Report"
            className="w-full bg-[var(--m-bg-inset)] rounded-lg px-3 py-2 text-[13px] text-[var(--m-text-primary)] placeholder:text-[var(--m-text-tertiary)] outline-none border border-[var(--m-border)]"
            style={{ fontSize: '16px' }}
          />
        </div>

        {/* Apply button */}
        <div className="px-[var(--m-page-px)] pb-2">
          <button
            onClick={() => onSelect(selectedCategory, docType)}
            className="w-full py-2.5 text-center text-[14px] font-medium text-white bg-[var(--m-text-primary)] rounded-lg"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
