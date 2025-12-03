'use client';

import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

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

export default function DocumentTabs({
  documents,
  activeDocumentId,
  onDocumentChange,
}: DocumentTabsProps) {
  // Sort documents by extractedAt (most recent first)
  const sortedDocuments = [...documents].sort((a, b) => 
    new Date(b.extractedAt).getTime() - new Date(a.extractedAt).getTime()
  );

  // Use most recent as active if none selected
  const effectiveActiveId = activeDocumentId || sortedDocuments[0]?.documentId || null;

  if (sortedDocuments.length === 0) {
    return null;
  }

  // Auto-select most recent if none selected
  React.useEffect(() => {
    if (!activeDocumentId && sortedDocuments.length > 0) {
      onDocumentChange(sortedDocuments[0].documentId);
    }
  }, [activeDocumentId, sortedDocuments, onDocumentChange]);

  return (
    <Tabs value={effectiveActiveId || undefined} onValueChange={onDocumentChange}>
      <TabsList className="w-full justify-start h-auto p-0.5 gap-1 overflow-x-auto">
        {sortedDocuments.map((doc) => (
          <TabsTrigger
            key={doc.documentId}
            value={doc.documentId}
            className="flex items-center gap-1 px-2 py-1 text-xs h-7 min-w-0 flex-shrink-0"
          >
            <FileText className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[100px]">{doc.fileName}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 flex-shrink-0">
              v{doc.version}
            </Badge>
            <span className="text-[10px] text-gray-500 flex-shrink-0 whitespace-nowrap">
              {new Date(doc.extractedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

