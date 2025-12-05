'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, ChevronDown, History, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
      <div className="flex items-center gap-2 text-sm">
        <FileSpreadsheet className="w-4 h-4 text-gray-500" />
        <span className="text-gray-700 truncate max-w-[200px]">{activeDocument.fileName}</span>
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          v{activeDocument.version}
        </Badge>
        <span className="text-xs text-gray-500">
          {formatDate(activeDocument.extractedAt)}
        </span>
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 h-8 px-2 hover:bg-gray-100"
        >
          <FileSpreadsheet className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-700 truncate max-w-[180px]">
            {activeDocument?.fileName || 'Select file'}
          </span>
          {activeDocument && (
            <>
              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                v{activeDocument.version}
              </Badge>
              <span className="text-xs text-gray-500">
                {formatDate(activeDocument.extractedAt)}
              </span>
            </>
          )}
          <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="px-3 py-2 border-b flex items-center gap-2">
          <History className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-sm">Version History</span>
        </div>
        <div className="max-h-[300px] overflow-y-auto">
          {sortedDocuments.map((doc) => {
            const isActive = doc.documentId === effectiveActiveId;
            return (
              <button
                key={doc.documentId}
                onClick={() => {
                  onDocumentChange(doc.documentId);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                  isActive ? 'bg-blue-50' : ''
                }`}
              >
                <FileSpreadsheet className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm truncate ${isActive ? 'font-medium text-blue-900' : 'text-gray-700'}`}>
                      {doc.fileName}
                    </span>
                    <Badge 
                      variant={isActive ? "default" : "secondary"} 
                      className="text-[10px] px-1.5 py-0 flex-shrink-0"
                    >
                      v{doc.version}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {formatDate(doc.extractedAt)}
                  </div>
                </div>
                {isActive && (
                  <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

