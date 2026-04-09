# Mobile Notes Editor — Design Spec

**Date:** 2026-04-09
**Branch:** mobile
**Status:** Approved

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
- **Editor view:** full-page TipTap editor with metadata header and formatting toolbar
- "New Note" creates a blank note in Convex immediately (so it has an ID for auto-save), then pushes editor view
- Back button saves and returns to list. List stays mounted so scroll position is preserved.

## List View (NotesList)

Improved version of the current page, with the `[object Object]` bug fixed.

### Features
- **Scope tabs:** All Notes / Personal / Filed
- **Search bar:** filters by title and content text
- **Notes list:** sorted by updatedAt descending
  - Per note: emoji (if set), title, content preview (truncated 80 chars), date, client/project labels with icons, draft badge
  - Tap → pushes editor view with note ID
- **"New Note" button:** creates blank note via `api.notes.create({ title: 'Untitled', content: '{"type":"doc","content":[]}' })`, then pushes editor

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

Full-page editor that fills the viewport below the mobile header.

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
│ B I U S H1 H2 • 1. ☐ "" —          │  ← fixed toolbar above keyboard
├──────────────────────────────────────┤
│      [ iOS keyboard if active ]      │
└──────────────────────────────────────┘
```

### TipTap Extensions (Tier 2 — Notion mobile level)

Included:
- `StarterKit` — bold, italic, history, headings (H1-H3), paragraphs, blockquote, code block, bullet list, ordered list, horizontal rule
- `Underline` — underline formatting
- `Strike` — strikethrough (included in StarterKit but listed for clarity)
- `Highlight` — multicolor text highlighting
- `Link` — clickable links
- `TaskList` + `TaskItem` — checkbox lists
- `Placeholder` — "Start writing..." ghost text
- `TextStyle` — required for Highlight

Excluded (deferred):
- `Table` + row/header/cell — complex touch UX
- `Image` — base64 inline images
- `Mention` — @user mentions
- `Commands` — slash command extension (replaced by toolbar)

### Content Format

ProseMirror JSON — same as desktop. A new empty document:
```json
{"type": "doc", "content": [{"type": "paragraph"}]}
```

Notes created on mobile are fully editable on desktop and vice versa.

### Auto-Save Mechanism

Ported from desktop `NotesEditor.tsx`:
- **Debounced:** 1500ms after last edit
- **Minimum interval:** 2000ms between saves
- **Mutation:** `api.notes.update({ id, content, title })`
- **Save states:** `saving` | `saved` | `unsaved`
- **Additional triggers:** blur, visibility change, back navigation
- **Keyboard shortcut:** Cmd+S / Ctrl+S (for external keyboards)
- Content changes tracked via TipTap's `onUpdate` callback

### Nav Bar

- Left: back button (← Notes) — triggers save before navigating back
- Right: save status indicator
  - "Saved" — green dot + text (fades after 2s)
  - "Saving..." — small spinner
  - "Unsaved" — amber dot (shown when edits pending)

### Title Field

- Large inline-editable `<input>` (18px, font-semibold)
- Placeholder: "Untitled"
- Sits above the TipTap editor, outside of it (separate from ProseMirror content)
- Changes trigger the same auto-save debounce
- Emoji button to the left — tap opens a small preset grid (20-30 common emojis in a popover)

## Formatting Toolbar (EditorToolbar)

Fixed row above the keyboard, horizontally scrollable.

### Buttons (11)

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

### Styling
- Background: `bg-black` (matches mobile design system action buttons)
- Button text/icons: white, with inverse highlight (white bg, black text) when format is active
- Minimum touch target: 44px per button (Apple HIG)
- Horizontal scroll: `overflow-x-auto scrollbar-none`
- Border-top: `1px solid var(--m-border)` for visual separation

### Keyboard-Aware Positioning

The toolbar must sit directly above the iOS/Android keyboard when it's open.

**Primary approach:** Listen to `window.visualViewport` resize events:
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

Toolbar positioned: `style={{ bottom: keyboardHeight }}` with `position: fixed`.

**Fallback:** If `visualViewport` is unavailable, use `position: sticky; bottom: 0` which works in most modern mobile browsers.

## Metadata Chips (MetadataChips)

Horizontally scrollable row of tappable chips below the nav bar.

### Chip Types
- **Client chip:** shows client name if attached. Tap opens a bottom sheet with searchable client list. "×" to remove.
- **Project chip:** shows project name if attached (filters to selected client's projects). Tap opens bottom sheet. "×" to remove.
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
    ├── EditorToolbar.tsx        ← fixed formatting bar (11 buttons, keyboard-aware)
    └── MetadataChips.tsx        ← client/project/tag chips + bottom sheet pickers
```

### Responsibilities
- **page.tsx** — thin view router (list vs editor), owns noteId state, handles create-and-open flow
- **NotesList.tsx** — extracted from current page, fixes ProseMirror text extraction, adds tap-to-open
- **NoteEditor.tsx** — wraps TipTap `useEditor` hook + `EditorContent`, manages auto-save lifecycle, renders header/title/content layout. Estimated ~300-400 lines.
- **EditorToolbar.tsx** — the 11 formatting buttons + keyboard-aware positioning via visualViewport API. Estimated ~80-100 lines.
- **MetadataChips.tsx** — chips row + bottom sheet pickers for client/project/tags. Estimated ~150-200 lines.

## Convex Queries & Mutations Used

All existing — no backend changes:

| API | Used By | Purpose |
|-----|---------|---------|
| `notes.getAll({})` | NotesList | List all user-visible notes |
| `notes.get({ id })` | NoteEditor | Load note for editing |
| `notes.create({ title, content })` | page.tsx | Create blank note on "New Note" |
| `notes.update({ id, title?, content?, clientId?, projectId?, tags? })` | NoteEditor | Auto-save |
| `notes.remove({ id })` | NotesList | Delete note |
| `clients.list({})` | NotesList, MetadataChips | Client name resolution + picker |
| `projects.list({})` | NotesList | Project name resolution |
| `projects.getByClient({ clientId })` | MetadataChips | Project picker (filtered) |

## What's NOT Being Built

- Desktop editor changes (unchanged)
- New Convex backend queries/mutations
- Table editing on mobile
- Image insertion on mobile
- @mention support in editor
- Slash command extension (replaced by toolbar)
- AI cleanup bubble menu (deferred — add when AI features expand)
- Note templates on mobile
- Linked documents picker
- Full emoji picker (using a simple 20-30 preset grid instead)
