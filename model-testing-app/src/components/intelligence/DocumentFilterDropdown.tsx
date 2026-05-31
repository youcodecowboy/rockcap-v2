'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { FileText, FolderOpen, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ContributingDocument } from './intelligenceUtils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface DocumentWithFolder extends ContributingDocument {
  folderName?: string;
}

interface DocumentFilterDropdownProps {
  documents: DocumentWithFolder[];
  onSelect: (doc: { documentId: string; documentName: string }) => void;
}

export function DocumentFilterDropdown({ documents, onSelect }: DocumentFilterDropdownProps) {
  const colors = useColors();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Group documents by folder
  const groupedDocs = useMemo(() => {
    const filtered = searchQuery.trim()
      ? documents.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : documents;

    const groups = new Map<string, DocumentWithFolder[]>();
    for (const doc of filtered) {
      const folder = doc.folderName || 'Unfiled';
      if (!groups.has(folder)) groups.set(folder, []);
      groups.get(folder)!.push(doc);
    }

    // Sort: named folders first (alphabetical), "Unfiled" last
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Unfiled') return 1;
      if (b === 'Unfiled') return -1;
      return a.localeCompare(b);
    });

    return sorted;
  }, [documents, searchQuery]);

  if (documents.length === 0) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FileText size={12} />
        By Document
        <ChevronDown
          size={12}
          style={{ transition: 'transform 100ms linear', transform: isOpen ? 'rotate(180deg)' : 'none' }}
        />
      </Button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-50 w-80 max-h-[320px] overflow-y-auto"
          style={{
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
          }}
        >
          {/* Search input (show if >10 documents) */}
          {documents.length > 10 && (
            <div
              className="sticky top-0 p-2"
              style={{ background: colors.bg.card, borderBottom: `1px solid ${colors.border.light}` }}
            >
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: colors.text.dim }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full pl-8 pr-3 py-1.5"
                  style={{
                    fontSize: 12,
                    color: colors.text.primary,
                    background: colors.bg.card,
                    border: `1px solid ${colors.border.default}`,
                    borderRadius: 4,
                    outline: 'none',
                  }}
                  autoFocus
                />
              </div>
            </div>
          )}

          {groupedDocs.length === 0 ? (
            <div className="p-4 text-center" style={{ fontSize: 12, color: colors.text.dim }}>
              No documents found
            </div>
          ) : (
            groupedDocs.map(([folderName, docs]) => (
              <div key={folderName}>
                {/* Folder header */}
                <div
                  className="px-3 py-1.5 flex items-center gap-1.5"
                  style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                    color: colors.text.muted,
                    background: colors.bg.light,
                    borderBottom: `1px solid ${colors.border.light}`,
                  }}
                >
                  <FolderOpen size={12} />
                  {folderName}
                </div>
                {/* Document rows */}
                {docs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    style={{
                      background: hoveredId === doc.id ? colors.bg.cardAlt : 'transparent',
                      borderBottom: `1px solid ${colors.border.light}`,
                      transition: 'background 100ms linear',
                    }}
                    onMouseEnter={() => setHoveredId(doc.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => {
                      onSelect({ documentId: doc.id, documentName: doc.name });
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <FileText size={14} style={{ color: colors.text.dim, flexShrink: 0 }} />
                    <span className="flex-1 min-w-0 truncate" style={{ fontSize: 12, color: colors.text.primary }}>
                      {doc.name}
                    </span>
                    <span
                      className="flex-shrink-0 tabular-nums"
                      style={{ fontFamily: MONO, fontSize: 10, color: colors.text.dim }}
                    >
                      {doc.fieldCount} {doc.fieldCount === 1 ? 'field' : 'fields'}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
