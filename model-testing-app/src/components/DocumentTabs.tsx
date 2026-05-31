'use client';

import React, { useState } from 'react';
import { FileSpreadsheet, ChevronDown, History, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface DocumentTab {
  documentId: string;
  fileName: string;
  extractedAt: string;
  version: number;
  isActive?: boolean;
}

interface DocumentTabsProps {
  documents: DocumentTab[];
  activeDocumentId: string | null;
  onDocumentChange: (documentId: string) => void;
}

function VersionPill({ label }: { label: string }) {
  const colors = useColors();
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: 2,
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.04em',
        background: colors.bg.cardAlt,
        color: colors.text.muted,
        border: `1px solid ${colors.border.default}`,
      }}
    >
      {label}
    </span>
  );
}

export default function DocumentTabs({
  documents,
  activeDocumentId,
  onDocumentChange,
}: DocumentTabsProps) {
  const colors = useColors();
  const [isOpen, setIsOpen] = useState(false);

  // Sort documents by extractedAt (most recent first)
  const sortedDocuments = [...documents].sort((a, b) =>
    new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()
  );

  // Use most recent as active if none selected
  const effectiveActiveId = activeDocumentId || sortedDocuments[0]?.documentId || null;
  const activeDocument = sortedDocuments.find(d => d.documentId === effectiveActiveId);

  if (sortedDocuments.length === 0) {
    return null;
  }

  // Auto-select most recent if none selected
  React.useEffect(() => {
    if (!activeDocumentId && sortedDocuments.length > 0) {
      onDocumentChange(sortedDocuments[0].documentId);
    }
  }, [activeDocumentId, sortedDocuments, onDocumentChange]);

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  // If only one document, show simple indicator
  if (sortedDocuments.length === 1 && activeDocument) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <FileSpreadsheet size={16} style={{ color: colors.text.muted }} />
        <span style={{ color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
          {activeDocument.fileName}
        </span>
        <VersionPill label={`v${activeDocument.version}`} />
        <span style={{ fontSize: 11, color: colors.text.muted }}>
          {formatDate(activeDocument.extractedAt)}
        </span>
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '5px 8px',
            background: 'transparent',
            border: `1px solid ${colors.border.default}`,
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          <FileSpreadsheet size={16} style={{ color: colors.text.muted }} />
          <span style={{ fontSize: 13, color: colors.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
            {activeDocument?.fileName || 'Select file'}
          </span>
          {activeDocument && (
            <>
              <VersionPill label={`v${activeDocument.version}`} />
              <span style={{ fontSize: 11, color: colors.text.muted }}>
                {formatDate(activeDocument.extractedAt)}
              </span>
            </>
          )}
          <ChevronDown size={16} style={{ color: colors.text.dim, marginLeft: 4 }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderBottom: `1px solid ${colors.border.default}`,
          }}
        >
          <History size={16} style={{ color: colors.text.muted }} />
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500 }}>
            Version History
          </span>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {sortedDocuments.map((doc) => {
            const isActive = doc.documentId === effectiveActiveId;
            return (
              <button
                key={doc.documentId}
                onClick={() => {
                  onDocumentChange(doc.documentId);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: isActive ? `${colors.accent.blue}15` : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background 100ms linear',
                }}
              >
                <FileSpreadsheet size={16} style={{ flexShrink: 0, color: isActive ? colors.accent.blue : colors.text.dim }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? colors.accent.blue : colors.text.secondary, fontWeight: isActive ? 500 : 400 }}>
                      {doc.fileName}
                    </span>
                    <VersionPill label={`v${doc.version}`} />
                  </div>
                  <div style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                    {formatDate(doc.extractedAt)}
                  </div>
                </div>
                {isActive && (
                  <Check size={16} style={{ color: colors.accent.blue, flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
