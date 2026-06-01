'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import EmojiPickerButton from './EmojiPicker';
import TagInput from './TagInput';
import { Select } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { useClients, useProjectsByClient } from '@/lib/clientStorage';
import { Calendar, Save, AlertCircle, FileText, X, ChevronDown, ChevronUp } from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface NoteHeaderProps {
  title: string;
  emoji?: string;
  tags: string[];
  clientId?: Id<"clients"> | null;
  projectId?: Id<"projects"> | null;
  linkedDocumentIds?: Id<"documents">[];
  createdAt: string;
  updatedAt: string;
  saveStatus: 'saving' | 'saved' | 'unsaved' | 'error';
  lastSavedAt?: string;
  onTitleChange: (title: string) => void;
  onEmojiChange: (emoji: string) => void;
  onTagsChange: (tags: string[]) => void;
  onClientChange: (clientId: Id<"clients"> | null) => void;
  onProjectChange: (projectId: Id<"projects"> | null) => void;
  onLinkedDocumentsChange?: (docIds: Id<"documents">[]) => void;
}

// Mono-uppercase field label per canon.
function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <label
      style={{
        display: 'block',
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.text.muted,
        fontWeight: 500,
        marginBottom: 5,
      }}
    >
      {children}
    </label>
  );
}

/** Small chip that resolves a document's name and links to the reader */
function LinkedDocumentChip({
  documentId,
  onRemove,
}: {
  documentId: Id<"documents">;
  onRemove: () => void;
}) {
  const colors = useColors();
  const doc = useQuery(api.documents.get, { id: documentId });
  const name = doc?.fileName || 'Loading...';

  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        padding: '3px 8px',
        borderRadius: 4,
        background: colors.bg.cardAlt,
        border: `1px solid ${colors.border.light}`,
        color: colors.text.secondary,
        fontSize: 12,
      }}
    >
      <a
        href={`/docs/reader/${documentId}`}
        className="flex items-center gap-1"
        style={{ color: 'inherit' }}
        onClick={(e) => e.stopPropagation()}
      >
        <FileText className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate max-w-[180px]">{name}</span>
      </a>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5"
        style={{ padding: 2, borderRadius: 3, lineHeight: 0, color: colors.text.muted, cursor: 'pointer' }}
        title="Remove linked document"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export default function NoteHeader({
  title,
  emoji,
  tags,
  clientId,
  projectId,
  createdAt,
  updatedAt,
  saveStatus,
  lastSavedAt,
  onTitleChange,
  onEmojiChange,
  onTagsChange,
  onClientChange,
  onProjectChange,
  linkedDocumentIds,
  onLinkedDocumentsChange,
}: NoteHeaderProps) {
  const colors = useColors();
  const clients = useClients() || [];
  const projects = useProjectsByClient(clientId || undefined) || [];
  const [isMinimized, setIsMinimized] = useState(false);
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [showDocSearch, setShowDocSearch] = useState(false);

  // Fetch documents for linking (scoped to client if set)
  const documents = useQuery(
    api.documents.getByClient,
    clientId ? { clientId: clientId as Id<"clients"> } : "skip"
  );
  // Filter documents by search query
  const filteredDocs = (documents || [])
    .filter((d: any) => d.fileName?.toLowerCase().includes(docSearchQuery.toLowerCase()))
    .filter((d: any) => !(linkedDocumentIds || []).includes(d._id))
    .slice(0, 8);

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const created = formatDateTime(createdAt);
  const updated = formatDateTime(updatedAt);
  const lastSaved = lastSavedAt ? formatDateTime(lastSavedAt) : null;

  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'saving':
        return { text: 'Saving...', color: colors.accent.blue, icon: Save };
      case 'saved':
        return { text: lastSaved ? `Saved ${lastSaved.time}` : 'Saved', color: colors.accent.green, icon: Save };
      case 'unsaved':
        return { text: 'Unsaved changes', color: colors.accent.orange, icon: AlertCircle };
      case 'error':
        return { text: 'Save failed', color: colors.accent.red, icon: AlertCircle };
      default:
        return { text: '', color: colors.text.muted, icon: Save };
    }
  };

  const saveStatusDisplay = getSaveStatusDisplay();
  const StatusIcon = saveStatusDisplay.icon;

  // Native select wrapped with a canon chevron (canon Select hides the native arrow).
  const SelectWrap = ({ children }: { children: React.ReactNode }) => (
    <div className="relative">
      {children}
      <ChevronDown
        size={14}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: colors.text.muted, pointerEvents: 'none' }}
      />
    </div>
  );

  return (
    <div style={{ borderBottom: `1px solid ${colors.border.default}`, background: colors.bg.card }}>
      {/* Top Row: Emoji + Title + Save Status + Minimize */}
      <div style={{ padding: '16px 24px' }}>
        <div className="flex items-start gap-3">
          <EmojiPickerButton
            onEmojiSelect={onEmojiChange}
            currentEmoji={emoji}
          />
          <div className="flex-1">
            <input
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full bg-transparent border-none outline-none"
              style={{ fontSize: 28, fontWeight: 700, color: colors.text.primary }}
              placeholder="Untitled Note"
            />
            {!isMinimized && (
              <div className="flex items-center gap-4" style={{ marginTop: 8, fontSize: 12, color: colors.text.muted }}>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Created {created.date} at {created.time}</span>
                </div>
                <span>•</span>
                <span>Last modified {updated.date} at {updated.time}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2" style={{ color: saveStatusDisplay.color }}>
              <StatusIcon className="w-4 h-4" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{saveStatusDisplay.text}</span>
            </div>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              style={{ padding: 4, borderRadius: 4, lineHeight: 0, color: colors.text.muted, cursor: 'pointer' }}
              title={isMinimized ? "Show details" : "Hide details"}
            >
              {isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </button>
          </div>
        </div>

        {/* Metadata Row: Tags, Client, Project, Mentions - Only show if not minimized */}
        {!isMinimized && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: 16 }}>
            {/* Tags */}
            <div>
              <FieldLabel>Tags</FieldLabel>
              <TagInput
                tags={tags}
                onChange={onTagsChange}
                suggestions={[]} // Could be populated from existing tags
                placeholder="Add tags..."
              />
            </div>

            {/* Client Selector */}
            <div>
              <FieldLabel>Client</FieldLabel>
              <SelectWrap>
                <Select
                  value={clientId || 'none'}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'none') {
                      onClientChange(null);
                      onProjectChange(null);
                    } else {
                      onClientChange(value as Id<"clients">);
                    }
                  }}
                >
                  <option value="none">No client (Internal)</option>
                  {clients.map((client) => {
                    const id = (client as any)._id || (client as any).id;
                    return (
                      <option key={id} value={id}>
                        {client.name}
                      </option>
                    );
                  })}
                </Select>
              </SelectWrap>
            </div>

            {/* Project Selector (only if client selected) */}
            {clientId && (
              <div>
                <FieldLabel>Project</FieldLabel>
                <SelectWrap>
                  <Select
                    value={projectId || 'none'}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'none') {
                        onProjectChange(null);
                      } else {
                        onProjectChange(value as Id<"projects">);
                      }
                    }}
                  >
                    <option value="none">No project</option>
                    {projects.map((project) => {
                      const id = (project as any)._id || (project as any).id;
                      return (
                        <option key={id} value={id}>
                          {project.name}
                        </option>
                      );
                    })}
                  </Select>
                </SelectWrap>
              </div>
            )}

            {/* Documents */}
            {onLinkedDocumentsChange && (
              <div className="md:col-span-2">
                <FieldLabel>Linked Documents</FieldLabel>
                {/* Linked document chips */}
                {(linkedDocumentIds || []).length > 0 && (
                  <div className="flex flex-wrap gap-2" style={{ marginBottom: 8 }}>
                    {(linkedDocumentIds || []).map((docId) => (
                      <LinkedDocumentChip
                        key={docId}
                        documentId={docId}
                        onRemove={() => {
                          onLinkedDocumentsChange(
                            (linkedDocumentIds || []).filter((id) => id !== docId)
                          );
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* Document search */}
                {clientId ? (
                  <div className="relative">
                    <div
                      className="flex items-center gap-2"
                      style={{ padding: 8, border: `1px solid ${colors.border.default}`, borderRadius: 4, background: colors.bg.card }}
                    >
                      <FileText className="w-4 h-4 shrink-0" style={{ color: colors.text.muted }} />
                      <input
                        type="text"
                        placeholder="Search documents to link..."
                        className="flex-1 border-none outline-none bg-transparent"
                        style={{ fontSize: 12, color: colors.text.primary }}
                        value={docSearchQuery}
                        onChange={(e) => {
                          setDocSearchQuery(e.target.value);
                          setShowDocSearch(true);
                        }}
                        onFocus={() => setShowDocSearch(true)}
                        onBlur={() => setTimeout(() => setShowDocSearch(false), 200)}
                      />
                    </div>
                    {showDocSearch && docSearchQuery && filteredDocs.length > 0 && (
                      <div
                        className="absolute z-10 w-full overflow-y-auto"
                        style={{
                          marginTop: 4,
                          background: colors.bg.card,
                          border: `1px solid ${colors.border.default}`,
                          borderRadius: 4,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                          maxHeight: 192,
                        }}
                      >
                        {filteredDocs.map((doc: any) => (
                          <button
                            key={doc._id}
                            className="w-full text-left flex items-center gap-2"
                            style={{ padding: '8px 12px', fontSize: 12, color: colors.text.primary, cursor: 'pointer' }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              onLinkedDocumentsChange([
                                ...(linkedDocumentIds || []),
                                doc._id as Id<"documents">,
                              ]);
                              setDocSearchQuery('');
                              setShowDocSearch(false);
                            }}
                          >
                            <FileText className="w-4 h-4 shrink-0" style={{ color: colors.text.muted }} />
                            <span className="truncate">{doc.fileName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: colors.text.dim }}>Select a client to link documents</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
