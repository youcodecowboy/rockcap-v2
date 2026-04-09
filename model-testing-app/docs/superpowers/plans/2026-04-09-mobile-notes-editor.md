# Mobile Notes Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic mobile notes page with a Notion-style experience — a searchable list that opens into a full-page TipTap rich-text editor with formatting toolbar, metadata chips, auto-save with error handling, and draft/discard semantics.

**Architecture:** Single-route view state machine (`list` | `editor`) following the established mobile navigation pattern. The editor wraps TipTap's `useEditor` hook with the same ProseMirror JSON format as desktop, a fixed formatting toolbar above the keyboard, and debounced auto-save with offline resilience. The global StickyFooter is hidden while editing via a new context flag.

**Tech Stack:** TipTap (`@tiptap/react` + extensions, all already installed), Convex (`useQuery`/`useMutation`), `visualViewport` API for keyboard tracking, `--m-` design tokens.

**Spec:** `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md`

---

## File Structure

```
src/app/(mobile)/m-notes/
├── page.tsx                     ← REWRITE: view state machine (list | editor) + footer hiding
└── components/
    ├── NotesList.tsx            ← NEW: searchable notes list with scope tabs
    ├── NoteEditor.tsx           ← NEW: full-page TipTap editor with auto-save
    ├── EditorToolbar.tsx        ← NEW: 12-button formatting bar, keyboard-aware
    └── MetadataChips.tsx        ← NEW: client/project/tag chips + bottom sheet pickers

src/contexts/MobileLayoutContext.tsx  ← NEW: hideFooter flag for immersive views
src/components/mobile/MobileShell.tsx ← MODIFY: conditionally hide StickyFooter
```

---

### Task 1: MobileLayoutContext + StickyFooter Hiding

**Files:**
- Create: `src/contexts/MobileLayoutContext.tsx`
- Modify: `src/components/mobile/MobileShell.tsx`
- Modify: `src/app/(mobile)/layout.tsx`

- [ ] **Step 1: Create the MobileLayoutContext**

```tsx
// src/contexts/MobileLayoutContext.tsx
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface MobileLayoutContextType {
  hideFooter: boolean;
  setHideFooter: (hide: boolean) => void;
}

const MobileLayoutContext = createContext<MobileLayoutContextType>({
  hideFooter: false,
  setHideFooter: () => {},
});

export function MobileLayoutProvider({ children }: { children: ReactNode }) {
  const [hideFooter, setHideFooter] = useState(false);
  return (
    <MobileLayoutContext.Provider value={{ hideFooter, setHideFooter }}>
      {children}
    </MobileLayoutContext.Provider>
  );
}

export function useMobileLayout() {
  return useContext(MobileLayoutContext);
}
```

- [ ] **Step 2: Wrap mobile layout with the provider**

In `src/app/(mobile)/layout.tsx`, import `MobileLayoutProvider` and wrap the children:
```tsx
import { MobileLayoutProvider } from '@/contexts/MobileLayoutContext';
// Inside the layout component's return, wrap MobileShell:
<MobileLayoutProvider>
  <MobileShell>{children}</MobileShell>
</MobileLayoutProvider>
```

- [ ] **Step 3: Conditionally hide StickyFooter in MobileShell**

In `src/components/mobile/MobileShell.tsx`, import `useMobileLayout` and conditionally render:
```tsx
import { useMobileLayout } from '@/contexts/MobileLayoutContext';

// Inside the component:
const { hideFooter } = useMobileLayout();

// In the return JSX, replace <StickyFooter /> with:
{!hideFooter && <StickyFooter />}

// Also conditionally adjust main paddingBottom:
<main style={{
  paddingBottom: hideFooter
    ? 'env(safe-area-inset-bottom, 0px)'
    : 'calc(var(--m-footer-h) + env(safe-area-inset-bottom) + 0.5rem)'
}}>
```

- [ ] **Step 4: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): add MobileLayoutContext for hiding footer in immersive views"
```

---

### Task 2: Page Shell + NotesList (View State Machine)

**Files:**
- Rewrite: `src/app/(mobile)/m-notes/page.tsx`
- Create: `src/app/(mobile)/m-notes/components/NotesList.tsx`

- [ ] **Step 1: Rewrite page.tsx as a thin view router**

```tsx
// src/app/(mobile)/m-notes/page.tsx
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
    // Discard orphan: if note is still empty + untitled, delete it
    if (isEmpty) {
      try {
        await removeNote({ id: noteId as Id<'notes'> });
      } catch {
        // Ignore deletion errors (note may already be deleted)
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
```

- [ ] **Step 2: Create NotesList component**

Extract and improve the existing notes list logic into `src/app/(mobile)/m-notes/components/NotesList.tsx`.

Props: `{ onOpenNote: (noteId: string) => void; onNewNote: () => void }`

Key changes from the current page.tsx:
- Fix `extractPlainText` to walk ProseMirror JSON (recursive `node.content[]` walk, not Slate `node.children[]`)
- Notes are tappable rows (tap → `onOpenNote(note._id)`)
- "New Note" button calls `onNewNote()`
- Keep scope tabs (All/Personal/Filed), search, delete functionality
- Remove the inline composer (replaced by the full-page editor)
- Remove the accordion expand (notes open in the editor now)

Queries: `api.notes.getAll({})`, `api.clients.list({})`, `api.projects.list({})`.
Mutation: `api.notes.remove({ id })` for delete.

The `extractPlainText` fix:
```typescript
function extractPlainText(content: unknown): string {
  if (!content) return '';
  try {
    const doc = typeof content === 'string' ? JSON.parse(content) : content;
    if (typeof doc !== 'object') return String(doc);
    const texts: string[] = [];
    function walk(node: any) {
      if (node.text) texts.push(node.text);
      if (node.content) node.content.forEach(walk);
    }
    walk(doc);
    return texts.join(' ').trim();
  } catch {
    return typeof content === 'string' ? content : '';
  }
}
```

Each note row: emoji (if set), title (13px font-medium), content preview (12px secondary, truncated 80 chars), date (10px tertiary), client/project labels with Building2/FolderKanban icons, draft badge (amber). Tap the row → `onOpenNote`. Long-press or trailing delete button for delete with confirm.

- [ ] **Step 3: Create a stub NoteEditor**

```tsx
// src/app/(mobile)/m-notes/components/NoteEditor.tsx
'use client';
export default function NoteEditor({ noteId, onBack }: { noteId: string; onBack: (noteId: string, isEmpty: boolean) => void }) {
  return (
    <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
      Editor for {noteId}
      <button onClick={() => onBack(noteId, true)} className="block mx-auto mt-4 text-[var(--m-accent-indicator)]">Back</button>
    </div>
  );
}
```

- [ ] **Step 4: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): notes page view router + searchable list with ProseMirror text fix"
```

---

### Task 3: EditorToolbar (Formatting Bar)

**Files:**
- Create: `src/app/(mobile)/m-notes/components/EditorToolbar.tsx`

- [ ] **Step 1: Implement the formatting toolbar**

Props:
```typescript
interface EditorToolbarProps {
  editor: Editor | null;  // from @tiptap/react
}
```

Import `Editor` type from `@tiptap/react`.

12 buttons in a horizontally scrollable row. Each button:
- Calls the appropriate TipTap command on tap
- Shows active state via `editor.isActive(...)` check
- 44px minimum touch target

The Link button (#12) needs special handling: tap opens a small absolute-positioned popover above the toolbar with a URL input + Set/Remove buttons. Use `useState<boolean>(false)` for popover visibility. When active on a link, pre-fill the URL from `editor.getAttributes('link').href`.

**Keyboard-aware positioning:**
```typescript
const [keyboardHeight, setKeyboardHeight] = useState(0);

useEffect(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const handler = () => {
    const kbHeight = window.innerHeight - vv.height;
    setKeyboardHeight(Math.max(0, kbHeight));
  };
  vv.addEventListener('resize', handler);
  vv.addEventListener('scroll', handler);
  return () => {
    vv.removeEventListener('resize', handler);
    vv.removeEventListener('scroll', handler);
  };
}, []);
```

Toolbar container:
```tsx
<div
  className="fixed left-0 right-0 z-50 bg-black border-t border-[var(--m-border)]"
  style={{ bottom: keyboardHeight || 'env(safe-area-inset-bottom, 0px)' }}
>
  <div className="flex overflow-x-auto scrollbar-none px-1">
    {/* 12 button elements */}
  </div>
</div>
```

Each button:
```tsx
<button
  onClick={() => editor?.chain().focus().toggleBold().run()}
  className={`flex-shrink-0 w-[44px] h-[44px] flex items-center justify-center text-[14px] font-medium ${
    editor?.isActive('bold') ? 'bg-white text-black rounded-md' : 'text-white'
  }`}
>
  B
</button>
```

- [ ] **Step 2: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): editor formatting toolbar with keyboard-aware positioning"
```

---

### Task 4: NoteEditor (Full-Page TipTap Editor with Auto-Save)

**Files:**
- Rewrite: `src/app/(mobile)/m-notes/components/NoteEditor.tsx`

- [ ] **Step 1: Implement the full editor**

This is the largest component (~350-400 lines). It wraps TipTap, manages auto-save, and renders the full layout.

Props:
```typescript
interface NoteEditorProps {
  noteId: string;
  onBack: (noteId: string, isEmpty: boolean) => void;
}
```

**TipTap setup (subset of desktop extensions):**
```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      strike: false, // Use standalone Strike extension
    }),
    Underline,
    Strike,
    Link.configure({ openOnClick: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: 'Start writing...' }),
  ],
  content: noteContent, // loaded from Convex
  immediatelyRender: false,
  onUpdate: ({ editor }) => {
    setSaveStatus('unsaved');
    debouncedSave(editor.getJSON());
  },
});
```

**Content loading + legacy normalization:**
```typescript
import { ensureTipTapContent } from '@/lib/notes/markdownToTiptap';

const note = useQuery(api.notes.get, { id: noteId as Id<'notes'> });

// Normalize content on load
const noteContent = useMemo(() => {
  if (!note?.content) return { type: 'doc', content: [{ type: 'paragraph' }] };
  try {
    return ensureTipTapContent(note.content);
  } catch {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
}, [note?.content]);
```

**Auto-save with error/retry/offline** — port the desktop pattern:

State:
```typescript
const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'unsaved' | 'error'>('saved');
const [title, setTitle] = useState(note?.title ?? 'Untitled');
```

Constants: `debounceDelay = 1500`, `minSaveInterval = 2000`, `maxRetries = 3`.

Save function:
```typescript
const handleSave = useCallback(async (content?: any, retryAttempt = 0) => {
  if (isSavingRef.current) return;
  isSavingRef.current = true;
  setSaveStatus('saving');

  // Check if note should be promoted from draft
  const hasContent = /* walk content to check for text nodes */;
  const shouldPromote = note?.isDraft && (title !== 'Untitled' || hasContent);

  try {
    await updateNote({
      id: noteId as Id<'notes'>,
      title,
      content: content ?? editor?.getJSON(),
      ...(shouldPromote ? { isDraft: false } : {}),
    });
    lastSaveTimeRef.current = Date.now();
    setSaveStatus('saved');
  } catch (err) {
    if (retryAttempt < maxRetries) {
      const delay = Math.pow(2, retryAttempt) * 1000;
      setTimeout(() => handleSave(content, retryAttempt + 1), delay);
    } else {
      setSaveStatus('error');
    }
  } finally {
    isSavingRef.current = false;
  }
}, [noteId, title, editor, note?.isDraft, updateNote]);
```

Online/offline listeners:
```typescript
useEffect(() => {
  const onOnline = () => { /* flush save queue */ };
  window.addEventListener('online', onOnline);
  return () => window.removeEventListener('online', onOnline);
}, []);
```

**Footer hiding:** On mount set `setHideFooter(true)`, on unmount set `setHideFooter(false)`:
```typescript
const { setHideFooter } = useMobileLayout();
useEffect(() => {
  setHideFooter(true);
  return () => setHideFooter(false);
}, [setHideFooter]);
```

**Back navigation safety:**
```typescript
const handleBack = useCallback(async () => {
  if (saveStatus === 'unsaved' || saveStatus === 'error') {
    try {
      await handleSave();
    } catch {
      const discard = confirm('You have unsaved changes. Discard?');
      if (!discard) return;
    }
  }
  const isEmpty = title === 'Untitled' && !hasContentText(editor?.getJSON());
  onBack(noteId, isEmpty);
}, [saveStatus, handleSave, title, editor, noteId, onBack]);
```

**Layout JSX:**
```tsx
<div className="flex flex-col h-[calc(100vh-var(--m-header-h))]">
  {/* Nav bar */}
  <div className="flex items-center justify-between px-[var(--m-page-px)] py-2 border-b border-[var(--m-border)] flex-shrink-0">
    <button onClick={handleBack}>← Notes</button>
    <SaveStatusIndicator status={saveStatus} onRetry={() => handleSave()} />
  </div>

  {/* Metadata chips (Task 5) */}
  <MetadataChips noteId={noteId} note={note} onSave={handleSave} />

  {/* Title */}
  <input
    value={title}
    onChange={e => { setTitle(e.target.value); setSaveStatus('unsaved'); debouncedSave(); }}
    placeholder="Untitled"
    style={{ fontSize: '18px' }}
    className="px-[var(--m-page-px)] py-2 text-[18px] font-semibold outline-none bg-transparent"
  />

  {/* Editor content area — scrollable, fills remaining space */}
  <div className="flex-1 min-h-0 overflow-y-auto px-[var(--m-page-px)] pb-[60px]">
    <EditorContent editor={editor} className="prose prose-sm max-w-none" />
  </div>

  {/* Toolbar */}
  <EditorToolbar editor={editor} />
</div>
```

The `pb-[60px]` on the content area prevents the last lines of text from being hidden behind the fixed toolbar.

- [ ] **Step 2: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mobile): full-page note editor with TipTap + auto-save + error handling"
```

---

### Task 5: MetadataChips (Client/Project/Tag Pickers)

**Files:**
- Create: `src/app/(mobile)/m-notes/components/MetadataChips.tsx`

- [ ] **Step 1: Implement metadata chips with bottom sheet pickers**

Props:
```typescript
interface MetadataChipsProps {
  noteId: string;
  note: any; // note record from Convex
  onSave: () => void; // trigger auto-save after metadata change
}
```

State:
```typescript
const [showClientPicker, setShowClientPicker] = useState(false);
const [showProjectPicker, setShowProjectPicker] = useState(false);
const [showTagInput, setShowTagInput] = useState(false);
const [newTag, setNewTag] = useState('');
```

Mutations: `api.notes.update({ id, clientId?, projectId?, tags? })`.

Queries:
- `api.clients.list({})` — for client picker list
- `api.projects.getByClient({ clientId })` — for project picker, only when client is set

**Chips row:**
```tsx
<div className="flex gap-1.5 overflow-x-auto px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] scrollbar-none flex-shrink-0">
  {/* Client chip */}
  {note?.clientId ? (
    <Chip label={clientName} onRemove={handleRemoveClient} onTap={() => setShowClientPicker(true)} />
  ) : (
    <AddChip label="Client" onTap={() => setShowClientPicker(true)} />
  )}

  {/* Project chip — only show when client is set */}
  {note?.clientId && (note?.projectId ? (
    <Chip label={projectName} onRemove={handleRemoveProject} onTap={() => setShowProjectPicker(true)} />
  ) : (
    <AddChip label="Project" onTap={() => setShowProjectPicker(true)} />
  ))}

  {/* Tag chips */}
  {(note?.tags ?? []).map(tag => (
    <Chip key={tag} label={tag} onRemove={() => handleRemoveTag(tag)} />
  ))}
  <AddChip label="Tag" onTap={() => setShowTagInput(true)} />
</div>
```

**Chip components** (inline, not separate files):
- `Chip`: `{ label, onRemove?, onTap? }` — rounded pill with text + optional × button
- `AddChip`: `{ label, onTap }` — dashed-border pill with + icon

**Client-clear cascades to project:**
```typescript
const handleRemoveClient = async () => {
  await updateNote({ id: noteId as Id<'notes'>, clientId: undefined, projectId: undefined });
  onSave();
};
```

**Bottom sheet pickers:** Same visual pattern as `MoveFileSheet.tsx`:
- Fixed backdrop (bg-black/30, tap to close)
- Bottom-anchored card with rounded top, max-height 60vh
- Search input at top (16px font for iOS)
- Scrollable list of options
- Tap to select → update note → close sheet

- [ ] **Step 2: Wire MetadataChips into NoteEditor**

In `NoteEditor.tsx`, import and render `<MetadataChips>` between the nav bar and the title input.

- [ ] **Step 3: Build and verify**

Run: `npx next build 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): metadata chips with client/project/tag pickers"
```

---

### Task 6: Emoji Picker + Polish + Final Build

**Files:**
- Modify: `src/app/(mobile)/m-notes/components/NoteEditor.tsx`

- [ ] **Step 1: Add emoji picker to the title area**

A small button to the left of the title input showing the current emoji (or a default icon). Tap opens a popover grid of 24 common emojis:

```typescript
const EMOJI_PRESETS = ['📝', '📋', '📊', '💡', '🏗️', '🏠', '💰', '📞', '✅', '⚠️', '🔑', '📎',
  '🎯', '📌', '🗓️', '💼', '📁', '🔍', '⭐', '🚀', '💬', '📈', '🛠️', '❓'];
```

Popover: absolute-positioned below the emoji button, grid of 6×4 buttons, each 40px. Tap selects → updates note emoji → close popover. Tap outside closes.

- [ ] **Step 2: TipTap editor styling for mobile**

Add mobile-appropriate prose styling. The TipTap `EditorContent` needs CSS to make the editing area look clean on mobile:

```css
/* In the component via style jsx or a className */
.ProseMirror {
  outline: none;
  min-height: 200px;
  font-size: 15px;
  line-height: 1.6;
  color: var(--m-text-primary);
}
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--m-text-placeholder);
  pointer-events: none;
  float: left;
  height: 0;
}
.ProseMirror h1 { font-size: 24px; font-weight: 700; margin: 16px 0 8px; }
.ProseMirror h2 { font-size: 20px; font-weight: 600; margin: 14px 0 6px; }
.ProseMirror h3 { font-size: 17px; font-weight: 600; margin: 12px 0 4px; }
.ProseMirror ul, .ProseMirror ol { padding-left: 20px; }
.ProseMirror blockquote { border-left: 3px solid var(--m-border); padding-left: 12px; color: var(--m-text-secondary); }
.ProseMirror hr { border: none; border-top: 1px solid var(--m-border); margin: 16px 0; }
.ProseMirror code { background: var(--m-bg-inset); padding: 2px 4px; border-radius: 3px; font-size: 13px; }
.ProseMirror pre { background: var(--m-bg-inset); padding: 12px; border-radius: 6px; overflow-x: auto; }
.ProseMirror a { color: var(--m-accent-indicator); text-decoration: underline; }
.ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; }
.ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
```

- [ ] **Step 3: Also fix extractPlainText in the client-level notes tabs**

The same `[object Object]` bug exists in:
- `src/app/(mobile)/m-clients/components/tabs/ClientNotesTab.tsx`
- `src/app/(mobile)/m-clients/components/tabs/ProjectNotesTab.tsx`

Update both to use the recursive ProseMirror walker instead of the Slate-style extractor.

- [ ] **Step 4: Final build verification**

Run: `npx next build 2>&1 | tail -5`
Run: `npx next build 2>&1 | grep -iE "error|warning" | head -10`

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mobile): emoji picker, editor styling, fix [object Object] in all notes tabs"
```

---

## Task Summary

| Task | Component | Description | Dependencies |
|------|-----------|-------------|--------------|
| 1 | MobileLayoutContext | Footer hiding context + MobileShell integration | None |
| 2 | Page Shell + NotesList | View router + searchable list | Task 1 |
| 3 | EditorToolbar | 12-button toolbar + keyboard positioning | None |
| 4 | NoteEditor | Full TipTap editor + auto-save + error handling | Tasks 1, 3 |
| 5 | MetadataChips | Client/project/tag pickers + bottom sheets | Task 4 |
| 6 | Emoji + Polish | Emoji picker, editor CSS, fix [object Object] everywhere | Tasks 4, 5 |

**Parallelization:** Tasks 1 and 3 are independent. After both, Tasks 2 and 4 can proceed (2 depends on 1, 4 depends on 1+3). Tasks 5 and 6 are sequential after 4.

**Critical path:** 1 → 4 → 5 → 6 (with 2 and 3 parallelizable on the side).
