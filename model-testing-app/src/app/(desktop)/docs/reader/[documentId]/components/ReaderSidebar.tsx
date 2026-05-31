'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Section, Row, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileType,
  FolderOpen,
  Calendar,
  Clock,
  HardDrive,
  User,
  FileText,
  MessageSquare,
  Brain,
} from 'lucide-react';
import DocumentNoteForm from './DocumentNoteForm';
import DocumentNoteCard from './DocumentNoteCard';

function getConfidenceLevel(confidence: number): string {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'medium';
  return 'low';
}

interface Document {
  _id: Id<"documents">;
  fileName: string;
  documentCode?: string;
  summary: string;
  category: string;
  fileTypeDetected?: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  savedAt?: string;
  clientId?: Id<"clients">;
  clientName?: string;
  projectId?: Id<"projects">;
  projectName?: string;
  version?: string;
  uploaderInitials?: string;
  lastOpenedAt?: string;
  hasNotes?: boolean;
  noteCount?: number;
}

interface ReaderSidebarProps {
  document: Document;
  documentId: Id<"documents">;
}

export default function ReaderSidebar({ document, documentId }: ReaderSidebarProps) {
  const colors = useColors();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<'success' | 'error' | null>(null);

  // Query document notes
  const notes = useQuery(api.documentNotes.getByDocument, { documentId });

  // Query intelligence items
  const intelligenceItems = useQuery(api.documents.getDocumentIntelligence, { documentId });
  const hasIntelligence = intelligenceItems && intelligenceItems.length > 0;

  // Group intelligence items by category
  const intelligenceByCategory = intelligenceItems
    ? intelligenceItems.reduce((acc: Record<string, any[]>, item: any) => {
        const cat = item.category || 'general';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
      }, {} as Record<string, any[]>)
    : {};

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const confidenceTone = (level: string) =>
    level === 'high' ? colors.accent.green : level === 'medium' ? colors.accent.yellow : colors.accent.red;

  const categoryTone = (category: string) => {
    const map: Record<string, string> = {
      Appraisals: colors.accent.purple,
      Financial: colors.accent.green,
      Legal: colors.accent.blue,
      Terms: colors.accent.orange,
      Credit: colors.accent.red,
      KYC: colors.accent.yellow,
      Correspondence: colors.accent.cyan,
    };
    return map[category] || colors.text.muted;
  };

  return (
    <ScrollArea className="h-full">
      <div style={{ padding: 16 }}>
        {/* Classification Section */}
        <Section title="Classification">
          {document.fileTypeDetected && (
            <Row label="Document Type" value={document.fileTypeDetected} pill={colors.text.muted} />
          )}
          <Row label="Category" value={document.category} pill={categoryTone(document.category)} />
          {(document.clientName || document.projectName) && (
            <Row
              label="Location"
              value={
                <>
                  {document.clientName}
                  {document.projectName && (
                    <span style={{ color: colors.text.muted }}> / {document.projectName}</span>
                  )}
                </>
              }
            />
          )}
        </Section>

        {/* File Details Section */}
        <Section title="File Details">
          {document.documentCode && (
            <Row label="Original Filename" value={document.fileName} mono />
          )}
          <Row label="Size" value={formatFileSize(document.fileSize)} mono />
          {document.version && <Row label="Version" value={document.version} pill={colors.accent.blue} />}
          {document.uploaderInitials && (
            <Row label="Uploaded by" value={document.uploaderInitials} />
          )}
        </Section>

        {/* Dates Section */}
        <Section title="Dates">
          <Row label="Uploaded" value={formatDate(document.uploadedAt)} mono />
          {document.lastOpenedAt && (
            <Row label="Last Opened" value={formatDate(document.lastOpenedAt)} mono />
          )}
        </Section>

        {/* Summary Section */}
        {document.summary && (
          <Section title="Summary">
            <p style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 1.6 }}>{document.summary}</p>
          </Section>
        )}

        {/* Intelligence Section */}
        <Section title={hasIntelligence ? `Intelligence · ${intelligenceItems.length}` : 'Intelligence'}>
          {hasIntelligence ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Object.entries(intelligenceByCategory).map(([category, items]) => (
                <div key={category} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="flex items-center gap-2">
                    <Brain className="w-3.5 h-3.5" style={{ color: colors.text.muted }} />
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 9,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: colors.text.muted,
                        fontWeight: 500,
                      }}
                    >
                      {category.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} ({(items as any[]).length})
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 20 }}>
                    {(items as any[]).map((item: any) => {
                      const conf = item.normalizationConfidence ?? item.confidence ?? 0;
                      const level = getConfidenceLevel(conf);
                      return (
                        <div
                          key={item._id}
                          style={{
                            padding: 8,
                            borderRadius: 4,
                            background: colors.bg.light,
                            border: `1px solid ${colors.border.light}`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex-1 min-w-0">
                              <div style={{ fontSize: 11, fontWeight: 500, color: colors.text.secondary }}>
                                {item.label || item.fieldPath}
                              </div>
                              <div style={{ fontSize: 12, color: colors.text.primary, marginTop: 2, wordBreak: 'break-word' }}>
                                {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                              </div>
                            </div>
                            <StatusPill label={`${Math.round(conf * 100)}%`} tone={confidenceTone(level)} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Brain className="w-6 h-6" />} title="No intelligence extracted yet" />
          )}
        </Section>

        {/* Notes Section */}
        <Section title={notes && notes.length > 0 ? `Notes · ${notes.length}` : 'Notes'}>
          {/* Add Note Form */}
          <DocumentNoteForm
            documentId={documentId}
            clientId={document.clientId}
            projectId={document.projectId}
          />

          {/* Existing Notes */}
          {notes && notes.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {notes.map((note) => (
                <DocumentNoteCard key={note._id} note={note} />
              ))}
            </div>
          )}

          {notes && notes.length === 0 && (
            <p style={{ fontSize: 11, color: colors.text.dim, marginTop: 12, textAlign: 'center' }}>
              No notes yet. Add a note above.
            </p>
          )}
        </Section>
      </div>
    </ScrollArea>
  );
}
