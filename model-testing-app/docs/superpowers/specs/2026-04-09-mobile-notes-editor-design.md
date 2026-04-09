# Mobile Notes Editor — Design Spec

**Date:** 2026-04-09
**Branch:** mobile
**Status:** Approved (revised post-Codex review)

## Purpose

Replace the basic notes list with a Notion-style mobile notes experience: a searchable list page that opens into a full-page rich-text editor with inline formatting, metadata management, and auto-save. Notes created on mobile use the same ProseMirror JSON format as desktop — full cross-platform compatibility.

## Navigation

Single route (`/m-notes`), view state managed in-component:

```typescript
type NoteView =
  | { view: 'list' }
  | { view: 'editor'; noteId: string };
```

- **List view:** scope tabs, search, notes list, "New Note" button
- **Editor view:** full-page TipTap editor with metadata header and formatting toolbar. **The global StickyFooter is hidden** while the editor is active (the editor is a full-page immersive experience).
- "New Note" creates a blank draft note in Convex immediately (so it has an ID for auto-save), then pushes editor view
- Back button saves and returns to list. List stays mounted so scroll position is preserved.

## Draft & Discard Semantics

New notes are created as explicit drafts (`isDraft: true`) to prevent half-written content from becoming team-visible when filed to a client/project.

**Draft → published promotion:** A note is promoted from draft to non-draft (`isDraft: false`) on the first save where EITHER:
- The title has been changed from "Untitled", OR
- The content contains at least one text node (not just an empty paragraph)

**Orphan discard:** When the user navigates back from the editor, if the note:
- Still has title "Untitled" AND
- Content is empty (just `{ type: 'doc', content: [{ type: 'paragraph' }] }`)
- → Auto-delete the orphan via `api.notes.remove({ id })`

This prevents accumulation of blank "Untitled" notes from users who tap "New Note" then immediately back out.

## List View (NotesList)

Improved version of the current page, with the `[object Object]` bug fixed.

### Features
- **Scope tabs:** All Notes / Personal / Filed
- **Search bar:** filters by title and content text
- **Notes list:** sorted by updatedAt descending
  - Per note: emoji (if set), title, content preview (truncated 80 chars), date, client/project labels with icons, draft badge
  - Tap → pushes editor view with note ID
- **"New Note" button:** creates blank draft note via `api.notes.create({ title: 'Untitled', content: { type: 'doc', content: [{ type: 'paragraph' }] }, isDraft: true })`, then pushes editor

### The [object Object] Fix

The current `extractPlainText` helper assumes Slate JSON (`node.children[].text`). TipTap uses ProseMirror JSON which nests text in `node.content[]` recursively. Corrected extractor:

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

### Queries
- `api.notes.getAll({})` — all user-visible notes
- `api.clients.list({})` — for client name resolution
- `api.projects.list({})` — for project name resolution

## Editor View (NoteEditor)

Full-page editor that fills the viewport below the mobile header. **The global StickyFooter is hidden** while this view is active to maximize editing space and avoid toolbar/footer collision.

### Layout

```
┌──────────────────────────────────────┐
│ ← Notes              Saving...      │  ← nav bar: back + save status
├──────────────────────────────────────┤
│ [Bayfield Homes] [Comberton] [+]    │  ← metadata chips row (scrollable)
├──────────────────────────────────────┤
│ 📝 Meeting with site team            │  ← emoji picker + inline title
├──────────────────────────────────────┤
│                                      │
│  Rich text content area              │  ← TipTap EditorContent
│  filling remaining vertical space    │
│                                      │
├──────────────────────────────────────┤
│ B I U S H1 H2 • 1. ☐ "" — 🔗       │  ← fixed toolbar above keyboard
├──────────────────────────────────────┤
│      [ iOS keyboard if active ]      │
└──────────────────────────────────────┘
```

### TipTap Extensions (Tier 2 — Notion mobile level)

Included:
- `StarterKit` — bold, italic, history, headings (H1-H3), paragraphs, blockquote, code block, bullet list, ordered list, horizontal rule
- `Underline` — underline formatting
- `Strike` — strikethrough (included in StarterKit but listed for clarity)
- `Link` — clickable links with URL editing via toolbar button
- `TaskList` + `TaskItem` — checkbox lists
- `Placeholder` — "Start writing..." ghost text

Excluded (deferred):
- `Highlight` — multicolor highlighting (no toolbar control; add when slash commands come)
- `TextStyle` — only needed for Highlight, deferred with it
- `Table` + row/header/cell — complex touch UX
- `Image` — base64 inline images
- `Mention` — @user mentions
- `Commands` — slash command extension (replaced by toolbar)

### Content Format

ProseMirror JSON — same as desktop. The canonical empty document shape (used everywhere):
```json
{ "type": "doc", "content": [{ "type": "paragraph" }] }
```

This is passed as a **real JSON object** to `notes.create`, never as a stringified string. The `notes.create` mutation stores content as-is, so the shape must be valid TipTap JSON from the start.

Notes created on mobile are fully editable on desktop and vice versa.

### Legacy Content Normalization

Some older or tool-created notes may not be valid TipTap JSON. On editor load, wrap the content initialization in a try/catch:

1. Try to load content directly into TipTap's `useEditor`
2. If the editor fails to parse it, run the content through the existing `markdownToTiptap` utility at `src/lib/notes/markdownToTiptap.ts`
3. If that also fails, fall back to wrapping the raw string in a paragraph node: `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: String(content) }] }] }`

### Auto-Save Mechanism

Ported from desktop `NotesEditor.tsx`, including error handling and offline resilience:

- **Debounced:** 1500ms after last edit
- **Minimum interval:** 2000ms between saves
- **Mutation:** `api.notes.update({ id, content, title, isDraft? })`
- **Save states:** `saving` | `saved` | `unsaved` | `error`
- **Additional triggers:** blur, visibility change, back navigation
- **Keyboard shortcut:** Cmd+S / Ctrl+S (for external keyboards)
- Content changes tracked via TipTap's `onUpdate` callback

**Error handling:**
- On save failure: set state to `error`, show persistent red indicator ("Save failed — tap to retry")
- Tap the error indicator to manually retry the save
- Retry with exponential backoff: 1s, 2s, 4s — max 3 retries before giving up and showing the error
- Online/offline detection: listen to `navigator.onLine` and `window.addEventListener('online'/'offline')`. When offline, queue saves and flush when back online.

**Back-navigation safety:** When the user taps "← Notes" and there are unsaved changes (state is `unsaved` or `error`):
- Attempt one final save
- If save succeeds, navigate back
- If save fails, show a confirmation: "You have unsaved changes. Discard?" with Cancel/Discard buttons

### Nav Bar

- Left: back button (← Notes) — triggers save-then-navigate flow
- Right: save status indicator
  - "Saved" — green dot + text (fades after 2s)
  - "Saving..." — small spinner
  - "Unsaved" — amber dot (shown when edits pending)
  - "Save failed" — red dot + text + tap-to-retry

### Title Field

- Large inline-editable `<input>` (18px, font-semibold)
- Placeholder: "Untitled"
- Sits above the TipTap editor, outside of it (separate from ProseMirror content)
- Changes trigger the same auto-save debounce
- Emoji button to the left — tap opens a small preset grid (20-30 common emojis in a popover)

## Formatting Toolbar (EditorToolbar)

Fixed row above the keyboard, horizontally scrollable.

### Buttons (12)

| Icon | Action | TipTap Command | Active Check |
|------|--------|----------------|--------------|
| **B** | Bold | `toggleBold()` | `editor.isActive('bold')` |
| *I* | Italic | `toggleItalic()` | `editor.isActive('italic')` |
| U̲ | Underline | `toggleUnderline()` | `editor.isActive('underline')` |
| ~~S~~ | Strikethrough | `toggleStrike()` | `editor.isActive('strike')` |
| H1 | Heading 1 | `toggleHeading({ level: 1 })` | `editor.isActive('heading', { level: 1 })` |
| H2 | Heading 2 | `toggleHeading({ level: 2 })` | `editor.isActive('heading', { level: 2 })` |
| • | Bullet list | `toggleBulletList()` | `editor.isActive('bulletList')` |
| 1. | Numbered list | `toggleOrderedList()` | `editor.isActive('orderedList')` |
| ☐ | Task list | `toggleTaskList()` | `editor.isActive('taskList')` |
| " | Blockquote | `toggleBlockquote()` | `editor.isActive('blockquote')` |
| — | Divider | `setHorizontalRule()` | N/A (insert action) |
| 🔗 | Link | Opens URL input popover | `editor.isActive('link')` |

**Link button behavior:** Tap opens a small popover above the toolbar with a URL text input + "Set" button. If cursor is on existing link, popover pre-fills the URL and shows a "Remove" option. Uses TipTap's `setLink({ href })` and `unsetLink()`.

### Styling
- Background: `bg-black` (matches mobile design system action buttons)
- Button text/icons: white, with inverse highlight (white bg, black text) when format is active
- Minimum touch target: 44px per button (Apple HIG)
- Horizontal scroll: `overflow-x-auto scrollbar-none`
- Border-top: `1px solid var(--m-border)` for visual separation

### Keyboard-Aware Positioning

The toolbar must sit directly above the iOS/Android keyboard when it's open. The global StickyFooter is hidden while the editor is active, so there is no footer collision.

**When keyboard is open:** Listen to `window.visualViewport` resize events:
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
  return () => vv.removeEventListener('resize', handler);
}, []);
```

Toolbar positioned: `position: fixed; bottom: ${keyboardHeight}px`.

**When keyboard is closed:** Toolbar sits at `bottom: calc(env(safe-area-inset-bottom, 0px))` since the StickyFooter is hidden.

**Fallback:** If `visualViewport` is unavailable, use `position: sticky; bottom: 0`.

## Metadata Chips (MetadataChips)

Horizontally scrollable row of tappable chips below the nav bar.

### Chip Types
- **Client chip:** shows client name if attached. Tap opens a bottom sheet with searchable client list. "×" to remove. **Removing the client also clears the project** (same behavior as desktop).
- **Project chip:** shows project name if attached (filters to selected client's projects). Tap opens bottom sheet. "×" to remove. Only shown when a client is selected.
- **Tag chips:** each tag as a pill. "[+]" button to add — opens a small text input inline.
- All metadata changes trigger auto-save via the same debounce.

### Bottom Sheet Pattern
Same visual structure as `MoveFileSheet.tsx`:
- Backdrop (bg-black/30, tap to close)
- Bottom-anchored card with rounded top corners
- Search input at top
- Scrollable list of options
- Tap to select → updates note, closes sheet

### Queries
- `api.clients.list({})` — for client picker
- `api.projects.getByClient({ clientId })` — for project picker (only shown when client is selected)

### What's NOT on Mobile
- Template selection (desktop-only)
- Linked documents picker (deferred)
- @mentions display (deferred)
- Word count (not useful on mobile)

## Component Structure

```
src/app/(mobile)/m-notes/
├── page.tsx                     ← view state machine (list | editor)
└── components/
    ├── NotesList.tsx            ← search + scope tabs + notes list
    ├── NoteEditor.tsx           ← full-page editor (header + title + TipTap + toolbar)
    ├── EditorToolbar.tsx        ← fixed formatting bar (12 buttons, keyboard-aware)
    └── MetadataChips.tsx        ← client/project/tag chips + bottom sheet pickers
```

### Responsibilities
- **page.tsx** — thin view router (list vs editor), owns noteId state, handles create-and-open flow, handles orphan discard on back
- **NotesList.tsx** — extracted from current page, fixes ProseMirror text extraction, adds tap-to-open
- **NoteEditor.tsx** — wraps TipTap `useEditor` hook + `EditorContent`, manages auto-save lifecycle with error/retry/offline handling, renders header/title/content layout, normalizes legacy content on load. Estimated ~350-450 lines.
- **EditorToolbar.tsx** — the 12 formatting buttons + link popover + keyboard-aware positioning via visualViewport API. Estimated ~100-130 lines.
- **MetadataChips.tsx** — chips row + bottom sheet pickers for client/project/tags, client-clear-cascades-to-project logic. Estimated ~150-200 lines.

### StickyFooter Hiding

The NoteEditor view needs to hide the global StickyFooter while active. Two approaches:

**Preferred:** Add a context value or prop to the mobile shell that the editor can set. The `MobileShell` conditionally renders the footer based on this flag. This avoids direct DOM manipulation.

**Alternative:** The page.tsx can pass a `hideFooter` flag up to the layout via a shared context (e.g., extend `MessengerContext` or create a small `MobileLayoutContext`).

## Convex Queries & Mutations Used

All existing — no backend changes:

| API | Used By | Purpose |
|-----|---------|---------|
| `notes.getAll({})` | NotesList | List all user-visible notes |
| `notes.get({ id })` | NoteEditor | Load note for editing |
| `notes.create({ title, content, isDraft })` | page.tsx | Create blank draft note on "New Note" |
| `notes.update({ id, title?, content?, clientId?, projectId?, tags?, isDraft? })` | NoteEditor | Auto-save + draft promotion |
| `notes.remove({ id })` | NotesList, page.tsx | Delete note / discard orphan |
| `clients.list({})` | NotesList, MetadataChips | Client name resolution + picker |
| `projects.list({})` | NotesList | Project name resolution |
| `projects.getByClient({ clientId })` | MetadataChips | Project picker (filtered) |

## What's NOT Being Built

- Desktop editor changes (unchanged)
- New Convex backend queries/mutations
- Table editing on mobile
- Image insertion on mobile
- @mention support in editor
- Highlight / TextStyle extensions (no toolbar control, deferred)
- Slash command extension (replaced by toolbar)
- AI cleanup bubble menu (deferred — add when AI features expand)
- Note templates on mobile
- Linked documents picker
- Full emoji picker (using a simple 20-30 preset grid instead)
