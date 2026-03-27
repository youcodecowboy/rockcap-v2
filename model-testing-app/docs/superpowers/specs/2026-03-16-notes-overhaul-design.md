# Notes Overhaul — Design Spec

## Context

The notes system has solid infrastructure (TipTap editor with 20+ extensions, slash commands, auto-save, client/project filing) but several gaps prevent it from being the collaborative workspace the user needs:

1. **Chat agent creates notes as raw markdown strings** that render unformatted in the TipTap editor
2. **Slash commands are broken** due to a `deleteRange()` API mismatch across 23 command handlers (22 commands)
3. **No @mentions** in the editor — infrastructure exists (parser, autocomplete component) but isn't wired into TipTap
4. **No document linking** — notes and documents are disconnected
5. **Knowledge bank references** linger in UI labels despite migration to client intelligence
6. **Dev banner** still showing on the main notes page

The user's primary workflow: ask the chat agent to summarize documents into notes, then annotate/organize manually. This requires both high-quality agent output and a polished editor experience.

---

## Workstream A: Chat Agent Note Quality

### A1. Markdown → TipTap Converter

**New file:** `src/lib/notes/markdownToTiptap.ts`

A pure function `markdownToTiptap(markdown: string): TipTapDocument` that converts markdown to TipTap JSON. Handles:

- Headings (H1-H3) → `heading` nodes with `level` attribute
- Bold/italic/strikethrough → `marks` on `text` nodes
- Bullet/numbered lists → `bulletList`/`orderedList` nodes with `listItem` children
- Tables (pipe syntax) → `table`/`tableRow`/`tableCell` nodes
- Code blocks → `codeBlock` nodes
- Links → `link` mark with `href`
- Horizontal rules → `horizontalRule` nodes
- Blockquotes → `blockquote` nodes
- Task lists (- [ ] / - [x]) → `taskList`/`taskItem` nodes

**Integration point:** The `notes.create` Convex mutation (or the executor handler in `src/lib/tools/executor.ts`) checks if `content` is a string vs. TipTap JSON object. If string, runs `markdownToTiptap()` before storing. Manual editor saves pass TipTap JSON directly — no double conversion.

**Decision:** Where to run the conversion — Convex mutations have limited npm access. Two options:
- Run in the executor handler (`executor.ts`) before calling the Convex mutation — keeps Convex clean
- Run in an API helper shared between executor and upload modal

**Recommendation:** Run in the executor handler for agent-created notes, and in the `NoteUploadModal` component (`src/components/NoteUploadModal.tsx`) for transcript imports. The converter is a pure function — hand-roll it for the limited set of TipTap nodes needed (no external markdown parser dependency). The node types are well-defined and finite.

### A2. Agent Instructions Update

**Files:**
- `src/lib/tools/domains/note.tools.ts` — update `content` parameter description
- `src/lib/chat/systemPrompt.ts` — add note-creation directive

**Tool description changes:**
- `content` description: "Note content in markdown format. Write detailed, well-structured content with headings (## Section), tables for tabular data, bullet points for lists. Produce comprehensive summaries, not brief blurbs. The system automatically converts markdown to rich text formatting."

**System prompt additions:**
- Default: clean up and lightly structure user-provided content (fix formatting, add headings where natural)
- Document summaries: produce thorough summaries with sections, key data in tables, clear structure
- Full restructure: when user explicitly asks, reorganize and rewrite entirely
- Always use markdown formatting — the system handles rich text conversion

---

## Workstream B: Notes Editor & UX Overhaul

### B1. @Mentions in TipTap

**Install:** `@tiptap/extension-mention@3.10.6` (free, MIT license — already have `@tiptap/suggestion` installed)

**Three mention types via a single `@` trigger:**
- **@user** — blue chip, stores userId, triggers notification on save
- **@client** — amber chip, clickable link to `/clients/[clientId]`
- **@project** — purple chip, clickable link to project page

**Suggestion popup:** Combined dropdown showing users, clients, and projects differentiated by icon + type label. Reuse filtering logic from existing `MentionAutocomplete` component (`src/components/MentionAutocomplete.tsx`). Keyboard navigable (up/down/enter/escape).

**Data sources for suggestion popup:**
- Users: query authenticated users via existing user queries in Convex
- Clients: reuse `api.clients.getAll` or similar existing client list query
- Projects: reuse existing project queries, filtered by note's client if set

**Data extraction on save:** Walk the TipTap JSON document tree to extract mention node attributes. Collect `mentionedUserIds` (user-type mentions only) for notification diffing.

**Files to modify:**
- `src/components/NotesEditor.tsx` — add Mention extension to editor config
- New: `src/components/NoteMentionList.tsx` — suggestion popup component for TipTap mention extension
- `src/components/NoteHeader.tsx` — remove non-functional "Mentions" placeholder input

**Rendering:** Custom mention node renderer with distinct styles per type. Client/project mentions render as `<a>` tags with proper href. User mentions render as styled `<span>` tags.

### B2. Document Linking

**Schema change** (`convex/schema.ts`):
- Add `linkedDocumentIds: v.optional(v.array(v.id("documents")))` to `notes` table

**NoteHeader UI** (`src/components/NoteHeader.tsx`):
- Add "Documents" section in metadata area (alongside Client/Project selectors)
- Document picker: search by filename using existing `api.documents.search` or `api.documents.getByClient` queries, filtered to note's client if set
- Linked documents render as small chips: document name + type icon
- Each chip links to `/docs/reader/[documentId]`

**Convex mutations** (`convex/notes.ts`):
- Update `create` and `update` args to accept `linkedDocumentIds`
- Add document name/type resolution for display (or resolve client-side via existing document queries)

**Chat agent** (`src/lib/tools/domains/note.tools.ts`, `src/lib/tools/executor.ts`):
- Add optional `documentIds` parameter to `createNote` tool
- Pass through to Convex mutation

### B3. Notification Integration

**Schema change** (`convex/schema.ts`):
- Add `"mention"` to the notification `type` union

**Mention detection** (`convex/notes.ts` — `update` mutation):
- After save, diff current `mentionedUserIds` against previous value
- For each **new** mention, create notification:
  - `type: "mention"`
  - `title: "{authorName} mentioned you in a note"`
  - `message: note.title` (first 100 chars)
  - `relatedId: noteId`

**NotificationDropdown** (`src/components/NotificationDropdown.tsx`):
- Add mention icon (AtSign, blue) for `"mention"` type
- Navigation on click: if note has `clientId`, navigate to `/clients/[clientId]?tab=notes&noteId=[noteId]`; otherwise navigate to `/notes?id=[noteId]`

**Inbox** (`convex/flags.ts` — `getInboxItems`):
- Mention-type notifications appear automatically via existing notification handling
- Update "Mentions" filter: change from `n.type === "flag"` to `n.type === "flag" || n.type === "mention"` so both flag assignments and note mentions appear under the Mentions tab

### B4. UI Polish & Cleanup

**Slash command fix** (`src/components/suggestion.ts`):
- Destructure `range` into `{ from, to }` in all 22 command handlers (23 `deleteRange` calls)
- Pattern: `const { from, to } = range;` then `.deleteRange({ from, to })`
- Add try/catch with `console.error` so failures surface
- Fix formatting commands (Bold, Italic, Underline, Strikethrough, Highlight, Link): these currently use hardcoded `editor.state.selection.from - 9` offsets to select inserted placeholder text. Replace with dynamic offset calculation based on the actual inserted text length, or remove the placeholder text insertion pattern entirely — just apply the mark toggle after deleting the slash command range
- Reference: AI Assistant command (line 43-49) already uses the correct `deleteRange({ from, to })` pattern

**Remove dev banner** (`src/app/notes/page.tsx`):
- Remove the amber "In Development" banner (lines 192-199)

**Knowledge bank → Intelligence** (UI labels only, scoped to notes-related files):
- `src/components/NoteHeader.tsx` — rename any "Knowledge Bank" labels
- `src/components/NotesEditor.tsx` — rename any "Knowledge Bank" labels
- `src/app/notes/page.tsx` — rename any "Knowledge Bank" labels
- `src/components/AIAssistantBlock.tsx` — rename if it references "Knowledge Bank" in notes context
- Out of scope: GlobalSearch, TemplateEditor, ChatAssistantDrawer, and other non-notes files (separate cleanup later)
- Leave backend schema fields untouched (soft deprecation)

**Remove mentions placeholder** (`src/components/NoteHeader.tsx`):
- Remove the non-functional "Mentions" input (lines 209-221)
- Inline mentions in the editor body are now the source of truth

**Audit filters** (`src/app/notes/page.tsx`):
- Smoke-test each filter (client, project, tag, date range, search) to confirm they pass correct args to `api.notes.getAll`
- If a filter is broken, fix it as part of this work. If the fix is non-trivial (e.g., requires Convex query changes), log it as a follow-up issue rather than expanding scope

**Client/project tab consistency:**
- `ClientNotesTab.tsx` and `ProjectNotesTab.tsx` use the same `NotesEditor` — they automatically benefit from slash command fixes, mentions, and document linking
- Verify no tab-specific issues

---

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `src/lib/notes/markdownToTiptap.ts` | **NEW** — markdown to TipTap JSON converter |
| `src/lib/tools/domains/note.tools.ts` | Update content description, add documentIds param |
| `src/lib/tools/executor.ts` | Convert string content via markdownToTiptap before mutation |
| `src/lib/chat/systemPrompt.ts` | Add note-creation directives |
| `src/components/NotesEditor.tsx` | Add Mention extension, mention extraction on save |
| `src/components/NoteMentionList.tsx` | **NEW** — mention suggestion popup for TipTap |
| `src/components/NoteHeader.tsx` | Add document linking UI, remove mentions placeholder |
| `src/components/suggestion.ts` | Fix deleteRange() in all commands, add error handling |
| `convex/schema.ts` | Add linkedDocumentIds to notes, "mention" to notification types |
| `convex/notes.ts` | Accept linkedDocumentIds, mention notification diffing |
| `src/components/NotificationDropdown.tsx` | Handle "mention" notification type |
| `src/app/clients/[clientId]/components/NoteUploadModal.tsx` | Replace `convertTextToTipTapContent()` with `markdownToTiptap()` |
| `src/app/notes/page.tsx` | Remove dev banner, audit filters |

---

## Verification

1. **Slash commands**: Open a note, type `/` → verify bullet list, numbered list, headings, formatting all work
2. **Chat agent notes**: Ask agent "summarize this document into a note" → verify rich formatted output in editor (headings, tables, proper structure — not raw markdown)
3. **@mentions**: Type `@` in editor → verify popup with users/clients/projects → select user → save → check notification appears in bell dropdown
4. **Document linking**: In note header, add a document → verify chip appears → click → opens document reader
5. **Notifications**: Get mentioned in a note → verify notification in dropdown and inbox → click → navigates to note
6. **Filters**: On /notes page, test each filter (client, project, tags, date range, search) individually and in combination
7. **Client notes tab**: Open a client profile → Notes tab → verify all editor features work (mentions, slash commands, document linking)
8. **Build**: `npx next build` passes with no errors
