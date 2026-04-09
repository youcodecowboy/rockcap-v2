# Review: Mobile Notes Editor Design

**Reviewed spec:** `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md`

## Findings

### High: The spec still creates blank notes with the wrong content shape

The spec says mobile notes use the same ProseMirror JSON format as desktop, but the example create payload still passes a stringified document. It also conflicts with the spec's own "new empty document" example.

Relevant references:
- Spec create payload: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:36`
- Spec empty document shape: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:109`
- Current broken mobile create path: `src/app/(mobile)/m-notes/page.tsx:98`
- Canonical desktop create path: `src/app/(desktop)/notes/page.tsx:144`
- `notes.create` stores content as-is: `convex/notes.ts:44`
- Desktop editor expects TipTap JSON objects: `src/components/NotesEditor.tsx:265`
- Tool-created notes are normalized separately, not in the mutation: `src/lib/tools/executor.ts:476`

Impact:
- A literal implementation can reintroduce the same class of compatibility bug the spec is trying to fix.
- Direct mobile creates would bypass the normalization utility and may not load consistently in the editor.

Recommendation:
- Change the create payload to a real JSON object, not a string.
- Use one canonical empty shape everywhere in the spec, ideally `{ type: 'doc', content: [{ type: 'paragraph' }] }`.

### High: Immediate blank-note creation is unsafe without draft and discard semantics

The spec creates a blank note in Convex immediately, then opens the editor. That is reasonable for auto-save, but the spec does not define draft behavior even though the list UI includes a draft badge. Under the current backend rules, once a note is filed to a client or project it becomes shared, and filed notes are visible to all users.

Relevant references:
- Spec immediate create: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:23`
- Spec draft badge in list rows: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:34`
- `notes.create` defaults `isDraft` to false: `convex/notes.ts:57`
- Filed/unfiled ownership logic in create: `convex/notes.ts:40`
- Filing clears user ownership and makes note shared: `convex/notes.ts:127`
- `notes.getAll` shows all filed notes to everyone: `convex/notes.ts:365`
- Filed notes can be deleted by anyone: `convex/notes.ts:239`

Impact:
- Blank or half-written filed notes can become team-visible as soon as metadata is attached.
- Users can accumulate orphan "Untitled" notes if they back out after creation.
- The spec displays a draft state but does not define how a note becomes or stops being a draft.

Recommendation:
- Make blank mobile-created notes explicit drafts via `isDraft: true`.
- Define when drafts are promoted to non-draft.
- Define discard behavior for a newly created note that remains empty.

### High: The spec omits save-failure and offline behavior while claiming to port desktop auto-save

The spec says auto-save is ported from desktop and lists `saving | saved | unsaved`, but the actual desktop editor already has an `error` state, offline detection, queued retries, and retry backoff. Those behaviors matter on mobile more, not less.

Relevant references:
- Spec auto-save section: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:118`
- Spec nav-bar save states: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:129`
- Desktop save states include `error`: `src/components/NotesEditor.tsx:94`
- Offline/error handling: `src/components/NotesEditor.tsx:313`
- Retry behavior: `src/components/NotesEditor.tsx:368`
- Online/offline listeners: `src/components/NotesEditor.tsx:381`

Impact:
- The current spec has no UX for failed saves.
- A mobile user can hit Back, leave the editor, and believe content is saved when a mutation actually failed.

Recommendation:
- Add `error` to the save-state model.
- Define the mobile behavior for offline edits and failed saves before navigating back.
- If mobile intentionally drops desktop retry/offline behavior, call that out as a deliberate reduction in reliability.

### Medium: The keyboard toolbar positioning ignores the fixed mobile footer

The spec positions the toolbar with `bottom: keyboardHeight` or `bottom: 0`, but the mobile shell already has a fixed bottom footer. Existing mobile fixed footers explicitly offset themselves above `var(--m-footer-h)` and safe-area insets.

Relevant references:
- Spec keyboard positioning: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:172`
- Mobile shell bottom padding: `src/components/mobile/MobileShell.tsx:14`
- Fixed global footer: `src/components/mobile/StickyFooter.tsx:34`
- Existing mobile viewer footer offset pattern: `src/app/(mobile)/m-docs/components/DocumentViewer.tsx:168`

Impact:
- When the keyboard is closed, `bottom: 0` will place the toolbar into the same space as the fixed footer.
- Even with the keyboard open, the spec does not define how the editor content and toolbar avoid the footer/chat affordances already in the shell.

Recommendation:
- Amend the spec to define toolbar placement relative to `var(--m-footer-h)` and safe-area insets.
- Alternatively, explicitly hide the global footer while in the editor view.

### Medium: Link and highlight are marked as included, but the toolbar provides no way to use them

The spec includes `Highlight` and `Link` in the extension set, but the toolbar only defines 11 buttons and does not include controls for either action. Since slash commands are also deferred, those features would be present in code but inaccessible in the UI.

Relevant references:
- Included extensions: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:91`
- Toolbar buttons list: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:145`
- Desktop editor includes both extensions: `src/components/NotesEditor.tsx:167`
- Installed dependencies exist: `package.json:38`

Impact:
- The spec overstates mobile editing capabilities.
- Implementation will either ship dead code or silently omit features the spec says are included.

Recommendation:
- Either add controls for link and highlight, or move them to the deferred list.

## Open Questions

### Should clearing the client also clear the selected project?

The spec says the project picker is filtered to the selected client's projects, but it does not define what happens when a user removes the client chip while a project is set. The desktop header explicitly clears project when client is cleared.

Relevant references:
- Spec metadata chips: `docs/superpowers/specs/2026-04-09-mobile-notes-editor-design.md:196`
- Desktop client-clear behavior: `src/components/NoteHeader.tsx:203`

### Does the mobile editor need to normalize legacy note content before loading?

The repo now has a `markdownToTiptap` utility and tool/upload paths use it, but the core note mutation still accepts arbitrary content. A mobile editor that assumes every note is already valid TipTap JSON may still hit older or malformed notes.

Relevant references:
- Normalization utility: `src/lib/notes/markdownToTiptap.ts:364`
- Tool path uses normalization: `src/lib/tools/executor.ts:476`
- Upload path uses normalization: `src/app/(desktop)/clients/[clientId]/components/NoteUploadModal.tsx:240`
- Core note mutation does not normalize: `convex/notes.ts:44`

## Summary

The strongest issues are around data contract and reliability rather than surface UI:

- the create payload should use real TipTap JSON objects
- immediate blank-note creation needs explicit draft/discard rules
- mobile save UX needs an error/offline model, not just saved/saving/unsaved
- the fixed toolbar must account for the existing mobile footer
- the listed extension set should match the actual controls mobile exposes
