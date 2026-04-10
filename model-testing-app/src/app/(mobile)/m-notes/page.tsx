'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import NotesList from './components/NotesList';
import NoteEditor from './components/NoteEditor';

type NoteView =
  | { view: 'list' }
  | { view: 'editor'; noteId: string };

export default function MobileNotes() {
  const searchParams = useSearchParams();
  const noteParam = searchParams.get('note');

  const [currentView, setCurrentView] = useState<NoteView>(
    noteParam ? { view: 'editor', noteId: noteParam } : { view: 'list' }
  );
  const createNote = useMutation(api.notes.create);
  const removeNote = useMutation(api.notes.remove);

  // Handle deep-link from query param (e.g. navigating from chat)
  useEffect(() => {
    if (noteParam) {
      setCurrentView({ view: 'editor', noteId: noteParam });
    }
  }, [noteParam]);

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
