'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button, StatusPill, EmptyState, SkeletonText } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import NotesEditor from '@/components/NotesEditor';
import NoteUploadModal from './NoteUploadModal';
import {
  StickyNote,
  Plus,
  Search,
  Calendar,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Upload,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface ClientNotesTabProps {
  clientId: Id<"clients">;
  clientName: string;
}

export default function ClientNotesTab({
  clientId,
  clientName,
}: ClientNotesTabProps) {
  const colors = useColors();
  const [selectedNoteId, setSelectedNoteId] = useState<Id<"notes"> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'draft'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Query notes for this client
  const notes = useQuery(api.notes.getByClient, { clientId }) || [];

  // Mutations
  const createNote = useMutation(api.notes.create);
  const deleteNote = useMutation(api.notes.remove);

  // Get selected note data
  const selectedNote = useQuery(
    api.notes.get,
    selectedNoteId ? { id: selectedNoteId } : "skip"
  );

  // Get all unique tags from notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach((note: any) => {
      if (note.tags) {
        note.tags.forEach((tag: string) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return notes.filter((note: any) => {
      // Search filter
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const matchesSearch = (
          note.title?.toLowerCase().includes(queryLower) ||
          note.tags?.some((tag: string) => tag.toLowerCase().includes(queryLower))
        );
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filterType === 'draft' && !note.isDraft) return false;

      // Tag filter
      if (filterTags.length > 0) {
        const hasMatchingTag = filterTags.some(tag => note.tags?.includes(tag));
        if (!hasMatchingTag) return false;
      }

      return true;
    });
  }, [notes, searchQuery, filterType, filterTags]);

  // Check if any filters are active
  const hasActiveFilters = filterType !== 'all' || filterTags.length > 0;

  const clearAllFilters = () => {
    setFilterType('all');
    setFilterTags([]);
    setSearchQuery('');
  };

  const handleCreateNote = useCallback(async () => {
    try {
      const noteId = await createNote({
        title: 'Untitled Note',
        content: { type: 'doc', content: [] },
        clientId,
      });
      setSelectedNoteId(noteId);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  }, [createNote, clientId]);

  const handleDeleteNote = async (noteId: Id<"notes">) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await deleteNote({ id: noteId });
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null);
      }
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleNoteUploaded = (noteId: Id<"notes">) => {
    setSelectedNoteId(noteId);
    setShowUploadModal(false);
  };

  // Small token-styled filter pill (type / tag toggles).
  const filterChip = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        fontSize: 10,
        borderRadius: 4,
        cursor: 'pointer',
        color: active ? colors.entityTypes.client : colors.text.muted,
        background: active ? `${colors.entityTypes.client}15` : colors.bg.cardAlt,
        border: `1px solid ${active ? `${colors.entityTypes.client}40` : colors.border.light}`,
        transition: 'background 100ms linear',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full overflow-hidden" style={{ background: colors.bg.light }}>
      {/* Left Sidebar - Notes List */}
      <div
        className="flex flex-col relative overflow-visible"
        style={{
          width: isSidebarMinimized ? 64 : 320,
          background: colors.bg.card,
          borderRight: `1px solid ${colors.border.default}`,
          transition: 'width 250ms ease-in-out',
        }}
      >
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          style={{
            position: 'absolute',
            right: -12,
            top: 16,
            zIndex: 10,
            padding: 4,
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 999,
            cursor: 'pointer',
            lineHeight: 0,
          }}
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isSidebarMinimized ? (
            <ChevronRight size={14} style={{ color: colors.text.muted }} />
          ) : (
            <ChevronLeft size={14} style={{ color: colors.text.muted }} />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header with buttons */}
            <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className="flex items-center gap-2">
                  <h2 style={{ fontSize: 15, fontWeight: 500, color: colors.text.primary }}>Notes</h2>
                  {hasActiveFilters && (
                    <StatusPill label={String(filteredNotes.length)} tone={colors.entityTypes.client} />
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2" style={{ marginBottom: 12 }}>
                <span className="flex-1">
                  <Button
                    variant="primary"
                    accent={colors.entityTypes.client}
                    size="sm"
                    onClick={handleCreateNote}
                  >
                    <Plus size={14} />
                    New note
                  </Button>
                </span>
                <Button variant="secondary" size="sm" onClick={() => setShowUploadModal(true)}>
                  <Upload size={14} />
                  Upload
                </Button>
              </div>

              {/* Search */}
              <div
                className="flex items-center gap-2"
                style={{
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  padding: '0 10px',
                }}
              >
                <Search size={14} style={{ color: colors.text.muted, flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    fontSize: 12,
                    color: colors.text.primary,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Collapsible Filters */}
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="flex items-center justify-between w-full"
                  style={{
                    padding: '6px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: colors.text.muted,
                    background: 'transparent',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Filter size={12} />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <StatusPill
                        label={String(filterTags.length + (filterType !== 'all' ? 1 : 0))}
                        tone={colors.entityTypes.client}
                      />
                    )}
                  </div>
                  {isFiltersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {isFiltersExpanded && (
                  <div style={{ marginTop: 8, borderTop: `1px solid ${colors.border.light}`, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                        <X size={12} />
                        Clear filters
                      </Button>
                    )}

                    {/* Type Filter */}
                    <div>
                      <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500, marginBottom: 4, display: 'block' }}>
                        Type
                      </label>
                      <div className="flex gap-1">
                        {filterChip('All', filterType === 'all', () => setFilterType('all'))}
                        {filterChip('Drafts', filterType === 'draft', () => setFilterType('draft'))}
                      </div>
                    </div>

                    {/* Tags Filter */}
                    {allTags.length > 0 && (
                      <div>
                        <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.text.muted, fontWeight: 500, marginBottom: 4, display: 'block' }}>
                          Tags
                        </label>
                        <div className="flex flex-wrap gap-1" style={{ maxHeight: 80, overflowY: 'auto' }}>
                          {allTags.map(tag =>
                            filterChip(tag, filterTags.includes(tag), () => {
                              if (filterTags.includes(tag)) {
                                setFilterTags(filterTags.filter(t => t !== tag));
                              } else {
                                setFilterTags([...filterTags, tag]);
                              }
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Notes List */}
            <div className="flex-1 overflow-y-auto">
              {notes === undefined ? (
                <div style={{ padding: 16 }}>
                  <SkeletonText lines={6} />
                </div>
              ) : filteredNotes.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    icon={<StickyNote size={32} />}
                    title={
                      hasActiveFilters || searchQuery
                        ? 'No notes match your filters'
                        : 'No notes yet'
                    }
                    body={hasActiveFilters || searchQuery ? undefined : 'Create your first note'}
                  />
                </div>
              ) : (
                <div>
                  {filteredNotes.map((note: any) => {
                    const isSelected = selectedNoteId === note._id;
                    return (
                      <div key={note._id} className="group relative" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                        <button
                          onClick={() => setSelectedNoteId(note._id)}
                          className="w-full text-left"
                          style={{
                            padding: 12,
                            background: isSelected ? `${colors.entityTypes.client}12` : 'transparent',
                            borderLeft: `2px solid ${isSelected ? colors.entityTypes.client : 'transparent'}`,
                            cursor: 'pointer',
                            transition: 'background 100ms linear',
                          }}
                        >
                          <div className="flex items-start justify-between" style={{ marginBottom: 4 }}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {note.emoji && <span style={{ fontSize: 14 }}>{note.emoji}</span>}
                              <div style={{ fontSize: 12, fontWeight: 500, color: colors.text.primary }} className="truncate">
                                {note.title || 'Untitled Note'}
                              </div>
                            </div>
                            {note.isDraft && (
                              <span style={{ marginLeft: 4, flexShrink: 0 }}>
                                <StatusPill label="Draft" tone={colors.accent.yellow} />
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1" style={{ fontSize: 10, color: colors.text.muted }}>
                            <Calendar size={11} />
                            <span style={{ fontFamily: MONO }}>{new Date(note.updatedAt).toLocaleDateString()}</span>
                          </div>
                          {note.tags && note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                              {note.tags.slice(0, 2).map((tag: string, idx: number) => (
                                <span
                                  key={idx}
                                  style={{
                                    padding: '1px 6px',
                                    fontSize: 9,
                                    background: colors.bg.cardAlt,
                                    color: colors.text.muted,
                                    border: `1px solid ${colors.border.light}`,
                                    borderRadius: 2,
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                              {note.tags.length > 2 && (
                                <span style={{ fontSize: 9, color: colors.text.muted }}>
                                  +{note.tags.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note._id);
                          }}
                          className="absolute opacity-0 group-hover:opacity-100"
                          style={{
                            right: 8,
                            top: 8,
                            zIndex: 10,
                            padding: 4,
                            background: colors.bg.card,
                            border: `1px solid ${colors.border.default}`,
                            borderRadius: 4,
                            cursor: 'pointer',
                            lineHeight: 0,
                            transition: 'opacity 100ms linear',
                          }}
                          title="Delete note"
                        >
                          <Trash2 size={12} style={{ color: colors.accent.red }} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Minimized sidebar view */
          <>
            <div className="flex flex-col items-center gap-2" style={{ padding: 8, borderBottom: `1px solid ${colors.border.default}` }}>
              <button
                onClick={handleCreateNote}
                style={{
                  padding: 8,
                  background: colors.entityTypes.client,
                  color: '#ffffff',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
                title="New Note"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                style={{
                  padding: 8,
                  background: colors.bg.cardAlt,
                  color: colors.text.muted,
                  borderRadius: 4,
                  border: `1px solid ${colors.border.default}`,
                  cursor: 'pointer',
                  lineHeight: 0,
                }}
                title="Upload Notes"
              >
                <Upload size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ padding: '8px 0' }}>
              {filteredNotes.map((note: any) => {
                const isSelected = selectedNoteId === note._id;
                return (
                  <button
                    key={note._id}
                    onClick={() => {
                      setSelectedNoteId(note._id);
                      setIsSidebarMinimized(false);
                    }}
                    className="w-full flex justify-center"
                    style={{
                      padding: 8,
                      background: isSelected ? `${colors.entityTypes.client}15` : 'transparent',
                      color: isSelected ? colors.entityTypes.client : colors.text.muted,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    title={note.title || 'Untitled Note'}
                  >
                    <FileText size={16} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: colors.bg.card }}>
        {selectedNoteId && selectedNote ? (
          <NotesEditor
            noteId={selectedNoteId}
            note={selectedNote}
            clientId={clientId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<StickyNote size={40} />}
              title={notes.length === 0 ? 'No notes yet' : 'Select a note'}
              body={
                notes.length === 0
                  ? `Create notes to keep track of important information about ${clientName}. You can also upload meeting transcripts and call notes.`
                  : 'Select a note from the sidebar to view and edit it, or create a new note.'
              }
              action={
                <div className="flex gap-3 justify-center">
                  <Button variant="primary" accent={colors.entityTypes.client} onClick={handleCreateNote}>
                    <Plus size={14} />
                    New note
                  </Button>
                  <Button variant="secondary" onClick={() => setShowUploadModal(true)}>
                    <Upload size={14} />
                    Upload notes
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <NoteUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        clientId={clientId}
        clientName={clientName}
        onNoteCreated={handleNoteUploaded}
      />
    </div>
  );
}
