'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { FileText, FolderOpen, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ContributingDocument } from './intelligenceUtils';

interface DocumentWithFolder extends ContributingDocument {
  folderName?: string;
}

interface DocumentFilterDropdownProps {
  documents: DocumentWithFolder[];
  onSelect: (doc: { documentId: string; documentName: string }) => void;
}

export function DocumentFilterDropdown({ documents, onSelect }: DocumentFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs text-gray-600 gap-1.5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <FileText className="w-3 h-3" />
        By Document
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 max-h-[320px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Search input (show if >10 documents) */}
          {documents.length > 10 && (
            <div className="sticky top-0 bg-white border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
              </div>
            </div>
          )}

          {groupedDocs.length === 0 ? (
            <div className="p-4 text-center text-xs text-gray-400">No documents found</div>
          ) : (
            groupedDocs.map(([folderName, docs]) => (
              <div key={folderName}>
                {/* Folder header */}
                <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-100 flex items-center gap-1.5">
                  <FolderOpen className="w-3 h-3" />
                  {folderName}
                </div>
                {/* Document rows */}
                {docs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 border-b border-gray-50 last:border-b-0 transition-colors"
                    onClick={() => {
                      onSelect({ documentId: doc.id, documentName: doc.name });
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate text-xs">{doc.name}</span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 tabular-nums">
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
