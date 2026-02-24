'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Id } from '../../../convex/_generated/dataModel';
import NotesEditor from '@/components/NotesEditor';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, Trash2, X, Filter, File, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

function NotesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedNoteId, setSelectedNoteId] = useState<Id<"notes"> | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<Id<"documents"> | null>(null);
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    type: true,
    tags: true,
    client: true,
    project: true,
    date: true,
  });

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

  // Toggle section expansion
  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

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
    filterProjectIds.length > 0 || filterTags.length > 0 || filterDateStart || filterDateEnd;

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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50">
      {/* Development Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-600">🚧</span>
          <p className="text-sm text-amber-800">
            <span className="font-medium">In Development</span> — Not all features are fully functional. Document generation from templates coming soon.
          </p>
        </div>
      </div>

      {/* Header Bar */}
      <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'notes' | 'docs')}>
          <TabsList className="bg-white/20 border-white/30 [&>*]:text-white [&>*[data-state=active]]:bg-white [&>*[data-state=active]]:text-blue-600 [&>*[data-state=inactive]]:text-white/80">
            <TabsTrigger value="notes">
              <FileText className="w-4 h-4 mr-2" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="docs">
              <File className="w-4 h-4 mr-2" />
              Docs
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleNewDocument}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 bg-white text-blue-600 border-white hover:bg-white/90"
          >
            <Plus className="w-4 h-4" />
            New Document
          </Button>
          <Button
            onClick={handleCreateNote}
            size="sm"
            className="flex items-center gap-2 bg-white text-blue-600 hover:bg-white/90"
          >
            <Plus className="w-4 h-4" />
            New Note
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Notes/Documents List */}
        <div className={`${isSidebarMinimized ? 'w-16' : 'w-96'} bg-white border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out relative overflow-visible`}>
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
            <div className="p-4 border-b border-gray-200">
              {activeTab === 'notes' ? (
                <>
                  <div className="flex items-center justify-between mb-4">
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

                  {/* Search */}
                  <Input
                    type="text"
                    placeholder="Search notes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full mb-3"
                  />

                  {/* Collapsible Filters Section */}
                  <div className="mb-4">
                <button
                  onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                  className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    <span>Filters</span>
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="text-xs">
                        {[
                          filterType !== 'all' ? 1 : 0,
                          filterTags.length,
                          filterClientIds.length,
                          filterProjectIds.length,
                          filterDateStart || filterDateEnd ? 1 : 0
                        ].reduce((a, b) => a + b, 0)}
                      </Badge>
                    )}
                  </div>
                  {isFiltersExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {isFiltersExpanded && (
                  <div className="mt-3 space-y-3 max-h-[calc(100vh-20rem)] overflow-y-auto border-t border-gray-200 pt-3">
                    {/* Clear All Filters Button */}
                    {hasActiveFilters && (
                      <Button
                        onClick={clearAllFilters}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Clear All Filters
                      </Button>
                    )}

                    {/* Advanced Filters */}
                    {/* Type Filter Section */}
                    <div className="border-t border-gray-200 pt-3">
                      <button
                        onClick={() => toggleSection('type')}
                        className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                      >
                        <span>Type</span>
                        {expandedSections.type ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {expandedSections.type && (
                        <div className="space-y-1.5 pl-1">
                          <label className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                            <input
                              type="radio"
                              name="noteType"
                              checked={filterType === 'all'}
                              onChange={() => setFilterType('all')}
                              className="mr-2"
                            />
                            All Notes
                          </label>
                          <label className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                            <input
                              type="radio"
                              name="noteType"
                              checked={filterType === 'internal'}
                              onChange={() => setFilterType('internal')}
                              className="mr-2"
                            />
                            Internal Notes
                          </label>
                          <label className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                            <input
                              type="radio"
                              name="noteType"
                              checked={filterType === 'draft'}
                              onChange={() => setFilterType('draft')}
                              className="mr-2"
                            />
                            Drafts
                          </label>
                          <label className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                            <input
                              type="radio"
                              name="noteType"
                              checked={filterType === 'template'}
                              onChange={() => setFilterType('template')}
                              className="mr-2"
                            />
                            From Template
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Tags Filter Section */}
                    {allTags.length > 0 && (
                      <div className="border-t border-gray-200 pt-3">
                        <button
                          onClick={() => toggleSection('tags')}
                          className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                        >
                          <span>Tags {filterTags.length > 0 && `(${filterTags.length})`}</span>
                          {expandedSections.tags ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.tags && (
                          <div className="space-y-1.5 pl-1 max-h-40 overflow-y-auto">
                            {allTags.map(tag => (
                              <label key={tag} className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterTags.includes(tag)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFilterTags([...filterTags, tag]);
                                    } else {
                                      setFilterTags(filterTags.filter(t => t !== tag));
                                    }
                                  }}
                                  className="mr-2"
                                />
                                <span className="truncate">{tag}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Client Filter Section */}
                    {clients && clients.length > 0 && (
                      <div className="border-t border-gray-200 pt-3">
                        <button
                          onClick={() => toggleSection('client')}
                          className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                        >
                          <span>Client {filterClientIds.length > 0 && `(${filterClientIds.length})`}</span>
                          {expandedSections.client ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.client && (
                          <div className="space-y-1.5 pl-1 max-h-40 overflow-y-auto">
                            {clients.map(client => (
                              <label key={client._id} className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterClientIds.includes(client._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFilterClientIds([...filterClientIds, client._id]);
                                    } else {
                                      setFilterClientIds(filterClientIds.filter(id => id !== client._id));
                                    }
                                  }}
                                  className="mr-2"
                                />
                                <span className="truncate">{client.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Project Filter Section */}
                    {projects && projects.length > 0 && (
                      <div className="border-t border-gray-200 pt-3">
                        <button
                          onClick={() => toggleSection('project')}
                          className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                        >
                          <span>Project {filterProjectIds.length > 0 && `(${filterProjectIds.length})`}</span>
                          {expandedSections.project ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        {expandedSections.project && (
                          <div className="space-y-1.5 pl-1 max-h-40 overflow-y-auto">
                            {projects.map(project => (
                              <label key={project._id} className="flex items-center text-sm text-gray-600 hover:text-gray-900 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={filterProjectIds.includes(project._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFilterProjectIds([...filterProjectIds, project._id]);
                                    } else {
                                      setFilterProjectIds(filterProjectIds.filter(id => id !== project._id));
                                    }
                                  }}
                                  className="mr-2"
                                />
                                <span className="truncate">{project.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Date Range Filter Section */}
                    <div className="border-t border-gray-200 pt-3">
                      <button
                        onClick={() => toggleSection('date')}
                        className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2"
                      >
                        <span>Date Range</span>
                        {expandedSections.date ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      {expandedSections.date && (
                        <div className="space-y-2 pl-1">
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">From</label>
                            <Input
                              type="date"
                              value={filterDateStart}
                              onChange={(e) => setFilterDateStart(e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">To</label>
                            <Input
                              type="date"
                              value={filterDateEnd}
                              onChange={(e) => setFilterDateEnd(e.target.value)}
                              className="w-full text-sm"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                    </div>
                  </div>
                  
                </>
              )}
            </div>
          </>
        ) : (
          <div className="p-2 border-b border-gray-200 flex justify-center">
            {activeTab === 'notes' ? (
              <FileText className="w-5 h-5 text-gray-600" />
            ) : (
              <File className="w-5 h-5 text-gray-600" />
            )}
          </div>
        )}

        {/* Notes/Documents List */}
        {!isSidebarMinimized && (
          <div className="flex-1 overflow-y-auto overflow-x-visible">
            {activeTab === 'notes' ? (
              <>
                {notes === undefined ? (
                  <div className="p-4 text-sm text-gray-500">Loading...</div>
                ) : filteredNotes.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">
                    {hasActiveFilters || searchQuery
                      ? 'No notes match your filters.'
                      : 'No notes yet. Create your first note!'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredNotes.map((note) => (
                      <div key={note._id} className="group relative overflow-visible">
                        <button
                          onClick={() => setSelectedNoteId(note._id)}
                          className={`w-full text-left p-4 hover:bg-gray-50 transition-colors ${
                            selectedNoteId === note._id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {note.emoji && <span className="text-lg">{note.emoji}</span>}
                              <div className="font-medium text-gray-900 truncate">{note.title}</div>
                            </div>
                            {note.isDraft && (
                              <Badge variant="secondary" className="text-xs ml-2 shrink-0">
                                Draft
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mb-2">
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </div>
                          {note.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {note.tags.slice(0, 3).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                              {note.tags.length > 3 && (
                                <span className="px-2 py-0.5 text-xs text-gray-400">
                                  +{note.tags.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                          {(note.clientId || note.projectId) && (
                            <div className="text-xs text-gray-400 space-y-0.5">
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
                          className="absolute right-2 top-2 z-50 p-1 opacity-0 group-hover:opacity-100 bg-white rounded shadow-lg hover:bg-red-50 transition-all border border-gray-200"
                          title="Delete note"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Documents sidebar - empty for now (will show generated documents) */}
                <div className="p-4 text-sm text-gray-500">
                  <div className="text-center py-8">
                    <File className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="font-medium text-gray-900 mb-1">No generated documents</p>
                    <p className="text-xs text-gray-500">
                      Documents you create from templates will appear here
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
        
        {/* Minimized view - show note/document icons */}
        {isSidebarMinimized && (
          <div className="flex-1 overflow-y-auto py-2">
            {activeTab === 'notes' ? (
              <>
                {notes === undefined ? (
                  <div className="flex justify-center p-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                  </div>
                ) : filteredNotes.length === 0 ? (
                  <div className="flex justify-center p-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-1 px-2">
                    {filteredNotes.map((note) => (
                      <button
                        key={note._id}
                        onClick={() => {
                          setSelectedNoteId(note._id);
                          setIsSidebarMinimized(false);
                        }}
                        className={`w-full p-2 rounded-md transition-colors flex justify-center ${
                          selectedNoteId === note._id
                            ? 'bg-blue-100 text-blue-600'
                            : 'hover:bg-gray-100 text-gray-600'
                        }`}
                        title={note.title}
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Documents minimized view - empty for now */}
                <div className="flex justify-center p-2">
                  <File className="w-5 h-5 text-gray-400" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col bg-white">
          {activeTab === 'notes' ? (
            <>
              {selectedNoteId && selectedNote ? (
                <NotesEditor
                  noteId={selectedNoteId}
                  note={selectedNote}
                  clientId={selectedNote.clientId}
                  projectId={selectedNote.projectId}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <p className="text-lg mb-2">Select a note to edit</p>
                    <p className="text-sm">or create a new note</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center max-w-md">
                <File className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-xl font-semibold mb-2">Coming Soon</p>
                <p className="text-sm text-gray-600 mb-4">
                  Template-based document creation is coming soon. You'll be able to select from a variety of templates, 
                  such as lender's notes, and use AI to automatically populate them with information about your companies.
                </p>
                <p className="text-xs text-gray-500">
                  Documents will be saved to the documents library, client documents, and project documents.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<div className="flex h-[calc(100vh-4rem)] items-center justify-center">Loading...</div>}>
      <NotesPageContent />
    </Suspense>
  );
}
