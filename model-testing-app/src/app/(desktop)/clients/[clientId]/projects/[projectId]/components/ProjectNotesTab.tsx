'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../../convex/_generated/dataModel';
import { Button, IconButton, StatusPill, EmptyState, Skeleton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import NotesEditor from '@/components/NotesEditor';
import NoteUploadModal from '../../../components/NoteUploadModal';
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

interface ProjectNotesTabProps {
  projectId: Id<"projects">;
  projectName: string;
  clientId?: Id<"clients">;
}

export default function ProjectNotesTab({
  projectId,
  projectName,
  clientId,
}: ProjectNotesTabProps) {
  const colors = useColors();
  const [selectedNoteId, setSelectedNoteId] = useState<Id<"notes"> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'draft'>('all');
  const [showUploadModal, setShowUploadModal] = useState(false);

  // Query notes for this project
  const notes = useQuery(api.notes.getByProject, { projectId }) || [];

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
        projectId,
        clientId,
      });
      setSelectedNoteId(noteId);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  }, [createNote, projectId, clientId]);

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

  return (
    <div style={{ display: 'flex', height: '100%', background: colors.bg.base, overflow: 'hidden' }}>
      {/* Left Sidebar - Notes List */}
      <div
        style={{
          width: isSidebarMinimized ? 64 : 320,
          background: colors.bg.card,
          borderRight: `1px solid ${colors.border.default}`,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 300ms ease-in-out',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
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
            display: 'inline-flex',
          }}
        >
          {isSidebarMinimized ? (
            <ChevronRight size={16} color={colors.text.muted} />
          ) : (
            <ChevronLeft size={16} color={colors.text.muted} />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header with buttons */}
            <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: colors.text.primary,
                      fontWeight: 500,
                    }}
                  >
                    Notes
                  </span>
                  {hasActiveFilters && (
                    <StatusPill label={`${filteredNotes.length}`} tone={colors.entityTypes.project} />
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Button
                  variant="primary"
                  accent={colors.entityTypes.project}
                  size="sm"
                  onClick={handleCreateNote}
                  style={{ flex: 1 }}
                >
                  <Plus size={14} />
                  New Note
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowUploadModal(true)}
                  style={{ flex: 1 }}
                >
                  <Upload size={14} />
                  Upload
                </Button>
              </div>

              {/* Search */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0 10px',
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                }}
              >
                <Search size={14} color={colors.text.muted} style={{ flexShrink: 0 }} />
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: colors.text.muted,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Filter size={12} />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <StatusPill
                        label={`${filterTags.length + (filterType !== 'all' ? 1 : 0)}`}
                        tone={colors.entityTypes.project}
                      />
                    )}
                  </span>
                  {isFiltersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>

                {isFiltersExpanded && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${colors.border.default}`, paddingTop: 8 }}>
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                        <X size={12} />
                        Clear Filters
                      </Button>
                    )}

                    {/* Type Filter */}
                    <div>
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                          color: colors.text.muted,
                          fontWeight: 500,
                          marginBottom: 4,
                        }}
                      >
                        Type
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['all', 'draft'] as const).map((type) => {
                          const active = filterType === type;
                          return (
                            <button
                              key={type}
                              onClick={() => setFilterType(type)}
                              style={{
                                padding: '3px 8px',
                                fontSize: 11,
                                borderRadius: 3,
                                cursor: 'pointer',
                                border: `1px solid ${active ? colors.entityTypes.project : colors.border.default}`,
                                background: active ? `${colors.entityTypes.project}20` : colors.bg.card,
                                color: active ? colors.entityTypes.project : colors.text.secondary,
                              }}
                            >
                              {type === 'all' ? 'All' : 'Drafts'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tags Filter */}
                    {allTags.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontFamily: MONO,
                            fontSize: 9,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            color: colors.text.muted,
                            fontWeight: 500,
                            marginBottom: 4,
                          }}
                        >
                          Tags
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 80, overflowY: 'auto' }}>
                          {allTags.map(tag => {
                            const active = filterTags.includes(tag);
                            return (
                              <button
                                key={tag}
                                onClick={() => {
                                  if (filterTags.includes(tag)) {
                                    setFilterTags(filterTags.filter(t => t !== tag));
                                  } else {
                                    setFilterTags([...filterTags, tag]);
                                  }
                                }}
                                style={{
                                  padding: '2px 8px',
                                  fontSize: 11,
                                  borderRadius: 3,
                                  cursor: 'pointer',
                                  border: `1px solid ${active ? colors.entityTypes.project : colors.border.default}`,
                                  background: active ? `${colors.entityTypes.project}20` : colors.bg.card,
                                  color: active ? colors.entityTypes.project : colors.text.secondary,
                                }}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Notes List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {notes === undefined ? (
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} height={40} />
                  ))}
                </div>
              ) : filteredNotes.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState
                    icon={<StickyNote size={28} />}
                    title={hasActiveFilters || searchQuery ? 'No notes match your filters' : 'No notes yet'}
                    body={hasActiveFilters || searchQuery ? undefined : 'Create your first note.'}
                  />
                </div>
              ) : (
                <div>
                  {filteredNotes.map((note: any, i: number) => {
                    const selected = selectedNoteId === note._id;
                    return (
                      <div
                        key={note._id}
                        style={{
                          position: 'relative',
                          borderTop: i === 0 ? 'none' : `1px solid ${colors.border.light}`,
                        }}
                      >
                        <button
                          onClick={() => setSelectedNoteId(note._id)}
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: 12,
                            cursor: 'pointer',
                            background: selected ? `${colors.entityTypes.project}15` : 'transparent',
                            border: 'none',
                            borderLeft: selected ? `3px solid ${colors.entityTypes.project}` : '3px solid transparent',
                            transition: 'background 100ms linear',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                              {note.emoji && <span style={{ fontSize: 14 }}>{note.emoji}</span>}
                              <div
                                style={{
                                  fontWeight: 500,
                                  fontSize: 12,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: colors.text.primary,
                                }}
                              >
                                {note.title || 'Untitled Note'}
                              </div>
                            </div>
                            {note.isDraft && (
                              <span style={{ marginLeft: 4, flexShrink: 0 }}>
                                <StatusPill label="Draft" tone={colors.text.muted} />
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontFamily: MONO,
                              fontSize: 9,
                              color: colors.text.muted,
                            }}
                          >
                            <Calendar size={10} />
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </div>
                          {note.tags && note.tags.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {note.tags.slice(0, 2).map((tag: string, idx: number) => (
                                <span
                                  key={idx}
                                  style={{
                                    padding: '1px 6px',
                                    fontSize: 9,
                                    borderRadius: 3,
                                    background: colors.bg.light,
                                    color: colors.text.muted,
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
                        <div
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                            zIndex: 10,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note._id);
                          }}
                        >
                          <IconButton label="Delete note">
                            <Trash2 size={12} color={colors.accent.red} />
                          </IconButton>
                        </div>
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
            <div style={{ padding: 8, borderBottom: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button
                onClick={handleCreateNote}
                title="New Note"
                style={{
                  padding: 8,
                  background: colors.entityTypes.project,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'inline-flex',
                }}
              >
                <Plus size={16} />
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                title="Upload Notes"
                style={{
                  padding: 8,
                  background: colors.bg.light,
                  color: colors.text.muted,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'inline-flex',
                }}
              >
                <Upload size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {filteredNotes.map((note: any) => {
                const selected = selectedNoteId === note._id;
                return (
                  <button
                    key={note._id}
                    onClick={() => {
                      setSelectedNoteId(note._id);
                      setIsSidebarMinimized(false);
                    }}
                    title={note.title || 'Untitled Note'}
                    style={{
                      width: '100%',
                      padding: 8,
                      display: 'flex',
                      justifyContent: 'center',
                      background: selected ? `${colors.entityTypes.project}20` : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: selected ? colors.entityTypes.project : colors.text.muted,
                    }}
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
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: colors.bg.card, overflow: 'hidden' }}>
        {selectedNoteId && selectedNote ? (
          <NotesEditor
            noteId={selectedNoteId}
            note={selectedNote}
            projectId={projectId}
            clientId={clientId}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <EmptyState
              icon={<StickyNote size={40} />}
              title={notes.length === 0 ? 'No notes yet' : 'Select a note'}
              body={
                notes.length === 0
                  ? `Create notes to keep track of important information about ${projectName}. You can also upload meeting transcripts and call notes.`
                  : 'Select a note from the sidebar to view and edit it, or create a new note.'
              }
              action={
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <Button variant="primary" accent={colors.entityTypes.project} onClick={handleCreateNote}>
                    <Plus size={14} />
                    New Note
                  </Button>
                  <Button variant="secondary" onClick={() => setShowUploadModal(true)}>
                    <Upload size={14} />
                    Upload Notes
                  </Button>
                </div>
              }
            />
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {clientId && (
        <NoteUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          clientId={clientId}
          clientName={projectName}
          projectId={projectId}
          onNoteCreated={handleNoteUploaded}
        />
      )}
    </div>
  );
}
