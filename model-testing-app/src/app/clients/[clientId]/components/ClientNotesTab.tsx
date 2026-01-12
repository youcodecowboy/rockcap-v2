'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  StickyNote,
  Plus,
  Search,
  Calendar,
  Trash2,
  Edit,
  Save,
} from 'lucide-react';

interface ClientNotesTabProps {
  clientId: Id<"clients">;
  clientName: string;
}

export default function ClientNotesTab({
  clientId,
  clientName,
}: ClientNotesTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<Id<"notes"> | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Query notes for this client
  const notes = useQuery(api.notes.getByClient, { clientId }) || [];

  // Mutations
  const createNote = useMutation(api.notes.create);
  const updateNote = useMutation(api.notes.update);
  const deleteNote = useMutation(api.notes.remove);

  // Filter notes by search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes;
    const query = searchQuery.toLowerCase();
    return notes.filter((note: any) =>
      note.title?.toLowerCase().includes(query) ||
      note.content?.toLowerCase().includes(query)
    );
  }, [notes, searchQuery]);

  const handleCreateNote = async () => {
    if (!noteTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await createNote({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        clientId,
      });
      setShowCreateDialog(false);
      resetForm();
    } catch (error) {
      console.error('Error creating note:', error);
      alert('Failed to create note. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateNote = async () => {
    if (!editingNoteId || !noteTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await updateNote({
        id: editingNoteId,
        title: noteTitle.trim(),
        content: noteContent.trim(),
      });
      setEditingNoteId(null);
      resetForm();
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Failed to update note. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteNote = async (noteId: Id<"notes">) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await deleteNote({ id: noteId });
    } catch (error) {
      console.error('Error deleting note:', error);
      alert('Failed to delete note. Please try again.');
    }
  };

  const startEdit = (note: any) => {
    setEditingNoteId(note._id);
    setNoteTitle(note.title);
    setNoteContent(note.content || '');
  };

  const resetForm = () => {
    setNoteTitle('');
    setNoteContent('');
    setEditingNoteId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Note
        </Button>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <StickyNote className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery ? 'No notes found' : 'No notes yet'}
          </h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {searchQuery
              ? 'Try adjusting your search terms'
              : `Create notes to keep track of important information about ${clientName}.`}
          </p>
          {!searchQuery && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Note
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note: any) => (
            <div
              key={note._id}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              {editingNoteId === note._id ? (
                // Edit mode
                <div className="space-y-3">
                  <Input
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title"
                    className="font-semibold"
                  />
                  <Textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Write your note..."
                    rows={4}
                    className="resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetForm}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleUpdateNote}
                      disabled={!noteTitle.trim() || isSubmitting}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-gray-900 line-clamp-1">
                      {note.title}
                    </h4>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(note)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        <Edit className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note._id)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-600" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-4 mb-3 whitespace-pre-wrap">
                    {note.content || 'No content'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Calendar className="w-3 h-3" />
                    {new Date(note.createdAt).toLocaleDateString()}
                    {note.updatedAt && note.updatedAt !== note.createdAt && (
                      <Badge variant="outline" className="text-[10px]">
                        Edited
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Note Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="w-5 h-5" />
              Create New Note
            </DialogTitle>
            <DialogDescription>
              Add a note for {clientName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Title <span className="text-red-500">*</span>
              </label>
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Enter note title..."
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                Content
              </label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your note..."
                rows={6}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetForm();
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateNote}
              disabled={!noteTitle.trim() || isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
