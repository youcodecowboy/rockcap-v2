'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
    <div className="flex h-full bg-gray-50 overflow-hidden">
      {/* Left Sidebar - Notes List */}
      <div className={`${isSidebarMinimized ? 'w-16' : 'w-80'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative overflow-visible`}>
        {/* Minimize Toggle Button */}
        <button
          onClick={() => setIsSidebarMinimized(!isSidebarMinimized)}
          className="absolute -right-3 top-4 z-10 p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 transition-colors"
          title={isSidebarMinimized ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          {isSidebarMinimized ? (
            <ChevronRight className="w-4 h-4 text-gray-600" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          )}
        </button>

        {!isSidebarMinimized ? (
          <>
            {/* Header with buttons */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Notes</h2>
                  {hasActiveFilters && (
                    <Badge variant="secondary" className="text-xs">
                      <Filter className="w-3 h-3 mr-1" />
                      {filteredNotes.length}
                    </Badge>
                  )}
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-2 mb-3">
                <Button
                  onClick={handleCreateNote}
                  size="sm"
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Note
                </Button>
                <Button
                  onClick={() => setShowUploadModal(true)}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Upload
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9"
                />
              </div>

              {/* Collapsible Filters */}
              <div className="mt-3">
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="text-[10px] px-1">
                        {filterTags.length + (filterType !== 'all' ? 1 : 0)}
                      </Badge>
                    )}
                  </div>
                  {isFiltersExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                {isFiltersExpanded && (
                  <div className="mt-2 space-y-2 border-t border-gray-100 pt-2">
                    {/* Clear Filters */}
                    {hasActiveFilters && (
                      <Button
                        onClick={clearAllFilters}
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear Filters
                      </Button>
                    )}

                    {/* Type Filter */}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setFilterType('all')}
                          className={`px-2 py-1 text-xs rounded ${
                            filterType === 'all'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          All
                        </button>
                        <button
                          onClick={() => setFilterType('draft')}
                          className={`px-2 py-1 text-xs rounded ${
                            filterType === 'draft'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Drafts
                        </button>
                      </div>
                    </div>

                    {/* Tags Filter */}
                    {allTags.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 mb-1 block">Tags</label>
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                          {allTags.map(tag => (
                            <button
                              key={tag}
                              onClick={() => {
                                if (filterTags.includes(tag)) {
                                  setFilterTags(filterTags.filter(t => t !== tag));
                                } else {
                                  setFilterTags([...filterTags, tag]);
                                }
                              }}
                              className={`px-2 py-0.5 text-xs rounded ${
                                filterTags.includes(tag)
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
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
                <div className="p-4 text-sm text-gray-500">Loading...</div>
              ) : filteredNotes.length === 0 ? (
                <div className="p-4 text-center">
                  <StickyNote className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    {hasActiveFilters || searchQuery
                      ? 'No notes match your filters.'
                      : 'No notes yet. Create your first note!'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredNotes.map((note: any) => (
                    <div key={note._id} className="group relative">
                      <button
                        onClick={() => setSelectedNoteId(note._id)}
                        className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                          selectedNoteId === note._id ? 'bg-purple-50 border-l-4 border-purple-600' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {note.emoji && <span className="text-base">{note.emoji}</span>}
                            <div className="font-medium text-gray-900 truncate text-sm">
                              {note.title || 'Untitled Note'}
                            </div>
                          </div>
                          {note.isDraft && (
                            <Badge variant="secondary" className="text-[10px] ml-1 shrink-0">
                              Draft
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {new Date(note.updatedAt).toLocaleDateString()}
                        </div>
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {note.tags.slice(0, 2).map((tag: string, idx: number) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {note.tags.length > 2 && (
                              <span className="text-[10px] text-gray-400">
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
                        className="absolute right-2 top-2 z-10 p-1 opacity-0 group-hover:opacity-100 bg-white rounded shadow hover:bg-red-50 transition-all border border-gray-200"
                        title="Delete note"
                      >
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Minimized sidebar view */
          <>
            <div className="p-2 border-b border-gray-200 flex flex-col items-center gap-2">
              <button
                onClick={handleCreateNote}
                className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                title="New Note"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                title="Upload Notes"
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {filteredNotes.map((note: any) => (
                <button
                  key={note._id}
                  onClick={() => {
                    setSelectedNoteId(note._id);
                    setIsSidebarMinimized(false);
                  }}
                  className={`w-full p-2 flex justify-center ${
                    selectedNoteId === note._id
                      ? 'bg-purple-100 text-purple-600'
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                  title={note.title || 'Untitled Note'}
                >
                  <FileText className="w-4 h-4" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {selectedNoteId && selectedNote ? (
          <NotesEditor
            noteId={selectedNoteId}
            note={selectedNote}
            projectId={projectId}
            clientId={clientId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center max-w-md">
              <StickyNote className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {notes.length === 0 ? 'No notes yet' : 'Select a note'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {notes.length === 0
                  ? `Create notes to keep track of important information about ${projectName}. You can also upload meeting transcripts and call notes.`
                  : 'Select a note from the sidebar to view and edit it, or create a new note.'}
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={handleCreateNote} className="gap-2 bg-purple-600 hover:bg-purple-700">
                  <Plus className="w-4 h-4" />
                  New Note
                </Button>
                <Button 
                  onClick={() => setShowUploadModal(true)} 
                  variant="outline"
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload Notes
                </Button>
              </div>
            </div>
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
