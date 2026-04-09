'use client';
export default function NoteEditor({ noteId, onBack }: { noteId: string; onBack: (noteId: string, isEmpty: boolean) => void }) {
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Editor for {noteId}
      <button onClick={() => onBack(noteId, true)} className="block mx-auto mt-4 text-[var(--m-accent-indicator)]">&larr; Back</button>
    </div>
  );
}
