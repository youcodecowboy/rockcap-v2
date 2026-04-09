'use client';

import { useState, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';

type NoteView =
  | { view: 'list' }
  | { view: 'editor'; noteId: string };

export default function MobileNotes() {
  const [currentView, setCurrentView] = useState<NoteView>({ view: 'list' });
  const createNote = useMutation(api.notes.create);
  const removeNote = useMutation(api.notes.remove);

  const handleNewNote = useCallback(async () => {
    const noteId = await createNote({
      title: 'Untitled',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      isDraft: true,
    });
    setCurrentView({ view: 'editor', noteId: noteId as string });
  }, [createNote]);

  const handleOpenNote = useCallback((noteId: string) => {
    setCurrentView({ view: 'editor', noteId });
  }, []);

  const handleBackFromEditor = useCallback(async (noteId: string, isEmpty: boolean) => {
    if (isEmpty) {
      try {
        await removeNote({ id: noteId as Id<'notes'> });
      } catch {
        // Ignore — note may already be deleted
      }
    }
    setCurrentView({ view: 'list' });
  }, [removeNote]);

  if (currentView.view === 'editor') {
    return (
      <NoteEditor
        noteId={currentView.noteId}
        onBack={handleBackFromEditor}
      />
    );
  }

  return (
    <NotesList
      onOpenNote={handleOpenNote}
      onNewNote={handleNewNote}
    />
  );
}
