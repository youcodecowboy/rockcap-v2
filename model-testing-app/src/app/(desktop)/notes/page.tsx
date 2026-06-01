'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import NotesEditor from '@/components/NotesEditor';
import { useRouter, useSearchParams } from 'next/navigation';
import { useColors } from '@/lib/useColors';
import { Button, StatusPill, EmptyState, SkeletonText, Input } from '@/components/layouts';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Trash2,
  X,
  Filter,
  File,
  Plus,
  Search,
  Calendar,
  StickyNote,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

function NotesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const colors = useColors();
  const ACCENT = colors.accent.orange;

  const [selectedNoteId, setSelectedNoteId] = useState<Id<"notes"> | null>(null);
  const [, setSelectedDocumentId] = useState<Id<"documents"> | null>(null);
  const [activeTab, setActiveTab] = useState<'notes' | 'docs'>('notes');

  // Read note ID from URL params
  useEffect(() => {
    const noteParam = searchParams.get('note');
    if (noteParam) {
      setSelectedNoteId(noteParam as Id<"notes">);
      // Clean up URL
      router.replace('/notes', { scroll: false });
    }
  }, [searchParams, router]);
  const [filterClientIds, setFilterClientIds] = useState<Id<"clients">[]>([]);
  const [filterProjectIds, setFilterProjectIds] = useState<Id<"projects">[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'internal' | 'draft' | 'template'>('all');
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarMinimized, setIsSidebarMinimized] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  const createNote = useMutation(api.notes.create);
  const deleteNote = useMutation(api.notes.remove);
  const notes = useQuery(api.notes.getAll, {});
  // Documents will be generated documents (not library documents) - empty for now
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(api.projects.list, {});

  // Get all unique tags from notes
  const allTags = useMemo(() => {
    if (!notes) return [];
    const tagSet = new Set<string>();
    notes.forEach(note => {
      note.tags.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    if (!notes) return [];

    return notes.filter(note => {
      // Search filter (highest priority)
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const matchesSearch = (
          note.title.toLowerCase().includes(queryLower) ||
          note.tags.some(tag => tag.toLowerCase().includes(queryLower))
        );
        if (!matchesSearch) return false;
      }

      // Type filter
      if (filterType === 'internal' && (note.clientId || note.projectId)) return false;
      if (filterType === 'draft' && !note.isDraft) return false;
      if (filterType === 'template' && !note.templateId) return false;

      // Client filter
      if (filterClientIds.length > 0) {
        const hasMatchingClient = note.clientId && filterClientIds.includes(note.clientId);
        if (!hasMatchingClient) return false;
      }

      // Project filter
      if (filterProjectIds.length > 0) {
        const hasMatchingProject = note.projectId && filterProjectIds.includes(note.projectId);
        if (!hasMatchingProject) return false;
      }

      // Tag filter
      if (filterTags.length > 0) {
        const hasMatchingTag = filterTags.some(tag => note.tags.includes(tag));
        if (!hasMatchingTag) return false;
      }

      // Date range filter
      if (filterDateStart) {
        const noteDate = new Date(note.updatedAt);
        const startDate = new Date(filterDateStart);
        if (noteDate < startDate) return false;
      }

      if (filterDateEnd) {
        const noteDate = new Date(note.updatedAt);
        const endDate = new Date(filterDateEnd);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date
        if (noteDate > endDate) return false;
      }

      return true;
    });
  }, [notes, searchQuery, filterType, filterClientIds, filterProjectIds, filterTags, filterDateStart, filterDateEnd]);

  // Clear all filters
  const clearAllFilters = () => {
    setFilterType('all');
    setFilterClientIds([]);
    setFilterProjectIds([]);
    setFilterTags([]);
    setFilterDateStart('');
    setFilterDateEnd('');
    setSearchQuery('');
  };

  // Check if any filters are active
  const hasActiveFilters = filterType !== 'all' || filterClientIds.length > 0 ||
    filterProjectIds.length > 0 || filterTags.length > 0 || !!filterDateStart || !!filterDateEnd;

  const activeFilterCount = [
    filterType !== 'all' ? 1 : 0,
    filterTags.length,
    filterClientIds.length,
    filterProjectIds.length,
    filterDateStart || filterDateEnd ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const handleCreateNote = async () => {
    setActiveTab('notes');
    try {
      const noteId = await createNote({
        title: 'Untitled Note',
        content: { type: 'doc', content: [] },
        clientId: filterClientIds[0] || undefined,
        projectId: filterProjectIds[0] || undefined,
      });
      setSelectedNoteId(noteId);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleNewDocument = () => {
    setActiveTab('docs');
    setSelectedDocumentId(null);
    setSelectedNoteId(null); // Clear note selection when switching to docs
  };

  // Clear selections when switching tabs
  useEffect(() => {
    if (activeTab === 'notes') {
      setSelectedDocumentId(null);
    } else {
      setSelectedNoteId(null);
    }
  }, [activeTab]);

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

  const selectedNote = useQuery(
    api.notes.get,
    selectedNoteId ? { id: selectedNoteId } : "skip"
  );

  // Token-styled segmented control for the Notes / Docs switch.
  const segment = (label: string, icon: React.ReactNode, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5"
      style={{
        padding: '5px 12px',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 4,
        cursor: 'pointer',
        color: active ? colors.text.primary : colors.text.muted,
        background: active ? colors.bg.card : 'transparent',
        border: `1px solid ${active ? colors.border.default : 'transparent'}`,
        transition: 'background 100ms linear, color 100ms linear',
      }}
    >
      {icon}
      {label}
    </button>
  );

  // Small token-styled filter pill (type / tag / client / project toggles).
  const filterChip = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className="truncate"
      style={{
        maxWidth: '100%',
        padding: '3px 8px',
        fontSize: 10,
        borderRadius: 4,
        cursor: 'pointer',
        color: active ? ACCENT : colors.text.muted,
        background: active ? `${ACCENT}15` : colors.bg.cardAlt,
        border: `1px solid ${active ? `${ACCENT}40` : colors.border.light}`,
        transition: 'background 100ms linear',
      }}
    >
      {label}
    </button>
  );

  // Mono-uppercase section label inside the filter drawer.
  const filterLabel = (text: string) => (
    <label
      style={{
        fontFamily: MONO,
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: colors.text.muted,
        fontWeight: 500,
        marginBottom: 4,
        display: 'block',
      }}
    >
      {text}
    </label>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]" style={{ background: colors.bg.light }}>
      {/* Header Bar */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '10px 16px',
          background: colors.bg.cardAlt,
          borderBottom: `1px solid ${colors.border.default}`,
        }}
      >
        <div
          className="flex items-center gap-1"
          style={{ padding: 3, background: colors.bg.light, borderRadius: 6, border: `1px solid ${colors.border.light}` }}
        >
          {segment('Notes', <FileText size={14} />, activeTab === 'notes', () => setActiveTab('notes'))}
          {segment('Docs', <File size={14} />, activeTab === 'docs', () => setActiveTab('docs'))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleNewDocument}>
            <Plus size={14} />
            New Document
          </Button>
          <Button variant="primary" accent={ACCENT} size="sm" onClick={handleCreateNote}>
            <Plus size={14} />
            New Note
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Notes/Documents List */}
        <div
          className="flex flex-col relative overflow-visible"
          style={{
            width: isSidebarMinimized ? 64 : 360,
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
              <div style={{ padding: 16, borderBottom: `1px solid ${colors.border.default}` }}>
                {activeTab === 'notes' ? (
                  <>
                    <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                      <div className="flex items-center gap-2">
                        <h2 style={{ fontSize: 15, fontWeight: 500, color: colors.text.primary }}>Notes</h2>
                        {hasActiveFilters && (
                          <StatusPill label={String(filteredNotes.length)} tone={ACCENT} />
                        )}
                      </div>
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

                    {/* Collapsible Filters Section */}
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
                            <StatusPill label={String(activeFilterCount)} tone={ACCENT} />
                          )}
                        </div>
                        {isFiltersExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {isFiltersExpanded && (
                        <div
                          style={{
                            marginTop: 8,
                            borderTop: `1px solid ${colors.border.light}`,
                            paddingTop: 12,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            maxHeight: 'calc(100vh - 20rem)',
                            overflowY: 'auto',
                          }}
                        >
                          {/* Clear All Filters Button */}
                          {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                              <X size={12} />
                              Clear all filters
                            </Button>
                          )}

                          {/* Type Filter */}
                          <div>
                            {filterLabel('Type')}
                            <div className="flex flex-wrap gap-1">
                              {filterChip('All', filterType === 'all', () => setFilterType('all'))}
                              {filterChip('Internal', filterType === 'internal', () => setFilterType('internal'))}
                              {filterChip('Drafts', filterType === 'draft', () => setFilterType('draft'))}
                              {filterChip('Template', filterType === 'template', () => setFilterType('template'))}
                            </div>
                          </div>

                          {/* Tags Filter */}
                          {allTags.length > 0 && (
                            <div>
                              {filterLabel(`Tags${filterTags.length > 0 ? ` (${filterTags.length})` : ''}`)}
                              <div className="flex flex-wrap gap-1" style={{ maxHeight: 120, overflowY: 'auto' }}>
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

                          {/* Client Filter */}
                          {clients && clients.length > 0 && (
                            <div>
                              {filterLabel(`Client${filterClientIds.length > 0 ? ` (${filterClientIds.length})` : ''}`)}
                              <div className="flex flex-wrap gap-1" style={{ maxHeight: 120, overflowY: 'auto' }}>
                                {clients.map(client =>
                                  filterChip(client.name, filterClientIds.includes(client._id), () => {
                                    if (filterClientIds.includes(client._id)) {
                                      setFilterClientIds(filterClientIds.filter(id => id !== client._id));
                                    } else {
                                      setFilterClientIds([...filterClientIds, client._id]);
                                    }
                                  })
                                )}
                              </div>
                            </div>
                          )}

                          {/* Project Filter */}
                          {projects && projects.length > 0 && (
                            <div>
                              {filterLabel(`Project${filterProjectIds.length > 0 ? ` (${filterProjectIds.length})` : ''}`)}
                              <div className="flex flex-wrap gap-1" style={{ maxHeight: 120, overflowY: 'auto' }}>
                                {projects.map(project =>
                                  filterChip(project.name, filterProjectIds.includes(project._id), () => {
                                    if (filterProjectIds.includes(project._id)) {
                                      setFilterProjectIds(filterProjectIds.filter(id => id !== project._id));
                                    } else {
                                      setFilterProjectIds([...filterProjectIds, project._id]);
                                    }
                                  })
                                )}
                              </div>
                            </div>
                          )}

                          {/* Date Range Filter */}
                          <div>
                            {filterLabel('Date Range')}
                            <div className="flex flex-col gap-2">
                              <Input
                                type="date"
                                value={filterDateStart}
                                onChange={(e) => setFilterDateStart(e.target.value)}
                                aria-label="From date"
                              />
                              <Input
                                type="date"
                                value={filterDateEnd}
                                onChange={(e) => setFilterDateEnd(e.target.value)}
                                aria-label="To date"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <h2 style={{ fontSize: 15, fontWeight: 500, color: colors.text.primary }}>Documents</h2>
                  </div>
                )}
              </div>

              {/* Notes/Documents List */}
              <div className="flex-1 overflow-y-auto overflow-x-visible">
                {activeTab === 'notes' ? (
                  notes === undefined ? (
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
                      {filteredNotes.map((note) => {
                        const isSelected = selectedNoteId === note._id;
                        return (
                          <div key={note._id} className="group relative" style={{ borderBottom: `1px solid ${colors.border.light}` }}>
                            <button
                              onClick={() => setSelectedNoteId(note._id)}
                              className="w-full text-left"
                              style={{
                                padding: 12,
                                background: isSelected ? `${ACCENT}12` : 'transparent',
                                borderLeft: `2px solid ${isSelected ? ACCENT : 'transparent'}`,
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
                              {note.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1" style={{ marginTop: 6 }}>
                                  {note.tags.slice(0, 3).map((tag, idx) => (
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
                                  {note.tags.length > 3 && (
                                    <span style={{ fontSize: 9, color: colors.text.dim }}>
                                      +{note.tags.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                              {(note.clientId || note.projectId) && (
                                <div style={{ marginTop: 6, fontSize: 10, color: colors.text.dim }}>
                                  {note.clientId && (
                                    <div className="truncate">
                                      Client: {clients?.find(c => c._id === note.clientId)?.name || note.clientId}
                                    </div>
                                  )}
                                  {note.projectId && (
                                    <div className="truncate">
                                      Project: {projects?.find(p => p._id === note.projectId)?.name || note.projectId}
                                    </div>
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
                  )
                ) : (
                  /* Documents sidebar - empty for now (will show generated documents) */
                  <div style={{ padding: 16 }}>
                    <EmptyState
                      icon={<File size={32} />}
                      title="No generated documents"
                      body="Documents you create from templates will appear here"
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Minimized sidebar view */
            <>
              <div className="flex flex-col items-center" style={{ padding: 8, borderBottom: `1px solid ${colors.border.default}` }}>
                {activeTab === 'notes' ? (
                  <FileText size={18} style={{ color: colors.text.muted }} />
                ) : (
                  <File size={18} style={{ color: colors.text.muted }} />
                )}
              </div>
              <div className="flex-1 overflow-y-auto" style={{ padding: '8px 0' }}>
                {activeTab === 'notes' ? (
                  notes === undefined ? (
                    <div className="flex justify-center" style={{ padding: 8 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 999, background: colors.text.dim }} className="animate-pulse" />
                    </div>
                  ) : filteredNotes.length === 0 ? (
                    <div className="flex justify-center" style={{ padding: 8 }}>
                      <StickyNote size={18} style={{ color: colors.text.dim }} />
                    </div>
                  ) : (
                    filteredNotes.map((note) => {
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
                            background: isSelected ? `${ACCENT}15` : 'transparent',
                            color: isSelected ? ACCENT : colors.text.muted,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                          title={note.title || 'Untitled Note'}
                        >
                          <FileText size={16} />
                        </button>
                      );
                    })
                  )
                ) : (
                  <div className="flex justify-center" style={{ padding: 8 }}>
                    <File size={18} style={{ color: colors.text.dim }} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col" style={{ background: colors.bg.card }}>
          {activeTab === 'notes' ? (
            selectedNoteId && selectedNote ? (
              <NotesEditor
                noteId={selectedNoteId}
                note={selectedNote}
                clientId={selectedNote.clientId}
                projectId={selectedNote.projectId}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ padding: 24 }}>
                <EmptyState
                  icon={<StickyNote size={40} />}
                  title="Select a note to edit"
                  body="Choose a note from the sidebar, or create a new one to get started."
                  action={
                    <Button variant="primary" accent={ACCENT} onClick={handleCreateNote}>
                      <Plus size={14} />
                      New note
                    </Button>
                  }
                />
              </div>
            )
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ padding: 24 }}>
              <EmptyState
                icon={<File size={40} />}
                title="Coming soon"
                body="Template-based document creation is coming soon. You'll be able to select from a variety of templates, such as lender's notes, and use AI to automatically populate them with information about your companies. Documents will be saved to the documents library, client documents, and project documents."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-gray-500">
          Loading...
        </div>
      }
    >
      <NotesPageContent />
    </Suspense>
  );
}
