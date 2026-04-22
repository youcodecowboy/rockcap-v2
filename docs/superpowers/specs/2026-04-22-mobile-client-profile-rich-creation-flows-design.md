# Mobile Client Profile — Rich Creation Flows (Design)

Created: 2026-04-22
Status: approved (brainstorming → plan next)
Related logbook task: `.logbook/queued/2026-04-18_mobile-client-profile-rich-creation-flows.md`

## Goal

Replace four rudimentary creation flows on the mobile client profile page with richer experiences that match the desktop or surface existing mobile components that were never wired here. The four tabs and their gaps:

| Tab | Today | Target |
|---|---|---|
| **Notes** | Plain multi-line `TextInput` form inside the tab | Tap "Add Note" to open the existing full-screen Tiptap editor at `/notes/editor`, pre-scoped to this client |
| **Tasks** | Inline form with `title` + string-typed `"Due date (YYYY-MM-DD)"` | Button launches the existing `TaskCreationFlow` modal with `prefilledClientId` |
| **Projects** | No creation entry point exists on mobile | New `ProjectCreationSheet` slide-up modal matching desktop's minimal `name` + `shortcode` form |
| **Flags** | Tiny inline `TextInput` + priority toggle | New `FlagCreationSheet` slide-up modal with room to write, priority toggle, assignee (`PeoplePicker`), optional linked project |

## Context

- Mobile client profile lives in a single large file: [mobile-app/app/(tabs)/clients/[clientId]/index.tsx](/mobile-app/app/(tabs)/clients/[clientId]/index.tsx) (~3200 lines). All four tabs we're editing are inside it (Notes: lines 2730-2835, Tasks: 2840-2957, Projects: 2471-2486, Flags: 3109-3201).
- The "real Notion-style rich editor" referenced in the task file already exists at [mobile-app/app/notes/editor.tsx](/mobile-app/app/notes/editor.tsx). It uses [mobile-app/components/RichTextEditor.tsx](/mobile-app/components/RichTextEditor.tsx) (a WebView wrapper around `assets/tiptap-editor.html`) and is already invoked from the home screen, dashboard quick actions, and global notes list. It accepts `noteId` via `useLocalSearchParams` to edit an existing note; omitting it creates a new one. It may or may not already accept a `clientId` param for pre-scoping — to verify during implementation.
- The "same full task creation experience (including AI-assist) used elsewhere" also exists: [mobile-app/components/TaskCreationFlow.tsx](/mobile-app/components/TaskCreationFlow.tsx) — a full modal flow with AI parsing (`/api/mobile/tasks/parse`), date/priority/assignee fields, and attachment support. Currently used from `app/tasks/index.tsx`. Accepts `prefilledClientId`, `prefilledProjectId`, etc.
- The `PeoplePicker` at [mobile-app/components/PeoplePicker.tsx](/mobile-app/components/PeoplePicker.tsx) is a single/multi-select modal with search. Already used inside `TaskCreationFlow` for assignees and attendees.
- The desktop project creation dialog on the client profile is minimal — just **name + shortcode** — in [model-testing-app/src/app/(desktop)/clients/[clientId]/components/ClientProjectsTab.tsx:280-339](/model-testing-app/src/app/(desktop)/clients/[clientId]/components/ClientProjectsTab.tsx:280). It auto-populates `clientRoles: [{ clientId, role: 'primary' }]` and navigates to the project detail page on success.
- The shortcode generator is pure logic in [model-testing-app/src/lib/shortcodeUtils.ts](/model-testing-app/src/lib/shortcodeUtils.ts) (28 lines, no imports). Mobile needs its own copy since cross-app imports aren't set up.
- Convex mutation signatures (verified):
  - `notes.create` — exists, called from the editor route.
  - `tasks.create` — exists, called from `TaskCreationFlow`.
  - `flags.create` — args: `entityType`, `entityId`, `note: string`, `assignedTo?: Id<"users">` (single), `priority?: 'normal' | 'urgent'`, `clientId?`, `projectId?`. If `assignedTo` is omitted, backend defaults it to the creator ([model-testing-app/convex/flags.ts:594](/model-testing-app/convex/flags.ts:594)).
  - `projects.create` — 18 possible args but only `name` and `clientRoles` are required. Backend auto-generates `projectShortcode` if omitted, or validates the user-supplied one for uniqueness (appends counter on collision, throws after 99 retries — [model-testing-app/convex/projects.ts:156-172](/model-testing-app/convex/projects.ts:156)).

## Non-goals

- **No in-body `@mentions` in flags.** People-tagging in this task means the `assignedTo` structural field only. Full @mention support inside the rich editor (notifications, cross-entity linking, mention data source) is a separate, larger piece of work.
- **No new bottom-sheet library.** We use stock `<Modal animationType="slide" presentationStyle="pageSheet">` to match the existing `TaskCreationFlow` pattern. No `@gorhom/bottom-sheet` or similar.
- **No extraction of a shared `<SlideSheetModal>` wrapper up front.** Let the pattern emerge across `FlagCreationSheet` and `ProjectCreationSheet`; abstract only if a third use case lands.
- **No rich-text body in flags.** `flag.note` is a `string` in the schema; we use a tall multi-line `TextInput`, not Tiptap. "Feel like creating a note" is about ergonomics (room to breathe, bottom sheet, clear actions) not data format.
- **No shared workspace package for `shortcodeUtils`.** Duplicate the 28-line pure function into `mobile-app/lib/`. If it ever drifts and causes trouble, revisit then.
- **No schema changes.** All four mutations' existing signatures are sufficient.
- **No changes to how existing notes/tasks/flags/projects are *rendered*.** Only creation UX is in scope. List/card components stay untouched.
- **No redesign of the FlagCard, TaskItem, project card, or note card.** Only the "how to create" entry points change.

## Shipping plan

Two batches, two PRs, two logbook tasks. Batch A ships first and validates the infrastructure (especially the `/notes/editor` scoping param if it's missing). Batch B builds on the pattern with two new sheet components.

### Batch A — "wiring" PR (Notes + Tasks)

Small and mechanical. Deletes ~120 lines of inline form code and replaces with navigation / existing component invocation. Touches one file plus possibly a 3-line addition to the notes editor for `clientId` param support.

### Batch B — "design" PR (Flags + Projects)

Adds two new sheet components, one new utility, and wires them into the corresponding tabs. No schema changes, no new routes.

## Shared primitives

1. **Modal pattern** — `<Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={...}>`. Matches `TaskCreationFlow`. Gives the "slide up from the bottom" feel with no new library.
2. **`mobile-app/lib/shortcodeUtils.ts`** — verbatim port of [model-testing-app/src/lib/shortcodeUtils.ts](/model-testing-app/src/lib/shortcodeUtils.ts). Single export: `generateShortcodeSuggestion(name: string): string`.
3. **Reused existing components (no modifications):**
   - `RichTextEditor` — Tiptap WebView, used by the existing notes editor route
   - `TaskCreationFlow` — full task modal with AI-assist
   - `PeoplePicker` — user multi/single-select modal

## Batch A — Notes

**File edited:** [mobile-app/app/(tabs)/clients/[clientId]/index.tsx](/mobile-app/app/(tabs)/clients/[clientId]/index.tsx), lines 2730-2835.

**Delete:**
- Inline note form JSX (lines 2740-2774).
- Any state variables dedicated to the inline form (e.g. `showNoteForm`, `noteTitle`, `noteBody` — confirm exact names during implementation).
- The inline save handler (e.g. `handleSaveNote` — confirm exact name during implementation).

**Change:**
- "Add Note" button `onPress` → `router.push({ pathname: '/notes/editor', params: { clientId } })`.
- Wrap each note card (lines 2782-2828) in `<TouchableOpacity onPress={() => router.push({ pathname: '/notes/editor', params: { noteId: n._id } })}>`.

**Verify:** `/notes/editor` accepts a `clientId` param and passes it to `notes.create` as the client scope. If it already does, no changes there. If not, add:
- `clientId` to `useLocalSearchParams()` destructure
- Pass to the `notes.create` call (as `clientId: clientId as Id<"clients"> | undefined`)

**Keep unchanged:** note cards' content rendering (emoji, title, preview via `extractPlainText`, tags, date, wordCount), `EmptyState` fallback, the `notes` query.

## Batch A — Tasks

**File edited:** [mobile-app/app/(tabs)/clients/[clientId]/index.tsx](/mobile-app/app/(tabs)/clients/[clientId]/index.tsx), lines 2840-2957.

**Delete:**
- Inline task form JSX (lines 2850-2881).
- Any state variables dedicated to the inline form (e.g. `showTaskForm`, `taskTitle`, `taskDueDate` — confirm exact names during implementation).
- The inline save handler (e.g. `handleSaveTask` — confirm exact name during implementation).

**Add:**
- State: `showTaskCreation: boolean`.
- Import `TaskCreationFlow` from `@/components/TaskCreationFlow`.
- `TaskCreationFlow` component rendered conditionally:
  ```tsx
  <TaskCreationFlow
    visible={showTaskCreation}
    onClose={() => setShowTaskCreation(false)}
    prefilledClientId={clientId}
    onCreated={() => setShowTaskCreation(false)}
  />
  ```

**Change:**
- "New Task" button `onPress` → `setShowTaskCreation(true)`.

**Keep unchanged:** all task groupings (Overdue / Due Today / Upcoming / No Due Date / Completed), `TaskItem` rendering, completion toggle logic.

## Batch B — Flags

### New component: `mobile-app/components/FlagCreationSheet.tsx`

**Props:**
```ts
interface FlagCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  onCreated?: (flagId: Id<'flags'>) => void;
}
```

**Layout top-to-bottom (inside the slide-up modal):**

1. **Header bar** — title "New Flag", X close button. Matches the style of `app/notes/editor.tsx`'s header.
2. **Note body** — multi-line `TextInput`, `autoFocus`, `textAlignVertical="top"`, `minHeight: 160`, placeholder "Describe what needs attention…". Plain string (not Tiptap).
3. **Priority row** — segmented control `[Normal] [Urgent]`, default `Normal`. Same values as today's inline form, just styled as a clearer segment control.
4. **Assigned to row** — label "Assigned to" + tappable chip area. Default chip reads "Me (default)" to reflect that `flags.create` attributes to the creator when `assignedTo` is omitted. Tapping opens `PeoplePicker` in single-select mode (`maxSelection: 1`). Once the user picks someone, the chip shows that person's name with an X to revert to default.
5. **Linked project row** (optional field, per approved scope) — label + tappable chip. Taps open a small picker modal listing this client's projects (via `api.projects.listByClient` or equivalent; verify query name during implementation). Projects picker is keyed by `projectId` and can be cleared. Unselected by default.
6. **Footer** — Cancel (secondary button) + "Create Flag" (primary, disabled while note is empty or submission in flight).

**Mutation call:**
```ts
await createFlag({
  entityType: 'client',
  entityId: clientId,
  clientId,
  note: note.trim(),
  priority,                                // 'normal' | 'urgent'
  assignedTo: assigneeId || undefined,     // let backend default to creator
  projectId: linkedProjectId || undefined,
});
```

**Errors:**
- Empty note → button disabled.
- Mutation throws → keep sheet open, show inline error banner under the footer.

### Client profile Flags tab changes

**File edited:** [mobile-app/app/(tabs)/clients/[clientId]/index.tsx](/mobile-app/app/(tabs)/clients/[clientId]/index.tsx), lines 3109-3201.

**Delete:**
- Inline flag form JSX.
- Any state variables dedicated to the inline form (e.g. `showFlagForm`, `flagNote`, `flagPriority` — confirm exact names during implementation).
- The inline create handler (e.g. `handleCreateFlag` — confirm exact name during implementation).

**Change:**
- "New Flag" button `onPress` → `setShowFlagCreationSheet(true)`.
- Render `<FlagCreationSheet visible={showFlagCreationSheet} onClose={() => setShowFlagCreationSheet(false)} clientId={clientId} />` conditionally.

**Keep unchanged:** `FlagCard` list, filters, resolve/reopen logic.

## Batch B — Projects

### New utility: `mobile-app/lib/shortcodeUtils.ts`

Verbatim port of [model-testing-app/src/lib/shortcodeUtils.ts](/model-testing-app/src/lib/shortcodeUtils.ts). Exports `generateShortcodeSuggestion(name: string): string`. Zero dependencies, 28 lines. Duplication is acknowledged and accepted — if the two copies drift, we'll reconcile then.

### New component: `mobile-app/components/ProjectCreationSheet.tsx`

**Props:**
```ts
interface ProjectCreationSheetProps {
  visible: boolean;
  onClose: () => void;
  clientId: Id<'clients'>;
  onCreated?: (projectId: Id<'projects'>) => void;
}
```

**Layout top-to-bottom (inside the slide-up modal):**

1. **Header bar** — title "New Project" + X close button.
2. **Project Name** (required) — `TextInput`, `autoFocus`. Placeholder: "e.g., Wimbledon Development Phase 2".
3. **Project Shortcode** (optional) — `TextInput`, `maxLength={10}`, force-uppercase on change. Placeholder: "e.g., WIMBDEV2". Helper text below: "Max 10 characters. Used for document naming."
4. **Auto-suggest rule** — as the user types into Name, if they have not yet manually edited the Shortcode field (track a `userEditedShortcode` boolean), overwrite the Shortcode field with `generateShortcodeSuggestion(name)`. Once they type into Shortcode, stop auto-filling. Mirrors desktop's [NewProjectsPanel.tsx:53-58](/model-testing-app/src/components/NewProjectsPanel.tsx:53).
5. **Footer** — Cancel + "Create Project" (disabled while Name is empty or submission in flight).

**Mutation call + navigation:**
```ts
try {
  const projectId = await createProject({
    name: name.trim(),
    projectShortcode: shortcode.trim() || undefined,
    clientRoles: [{ clientId, role: 'primary' }],
  });
  onClose();
  onCreated?.(projectId);
  router.push(`/(tabs)/clients/${clientId}/projects/${projectId}`);
} catch (err) {
  // surface inline error, keep sheet open
}
```

`role: 'primary'` matches desktop's convention. Backend handles shortcode uniqueness; if it throws (e.g., >99 collisions or user-supplied collision), surface the thrown message under the shortcode field.

**Errors:**
- Empty name → button disabled.
- Backend shortcode collision → show "This shortcode is taken — try another" under the shortcode field; keep sheet open.
- Other mutation throw → generic "Could not create project. Try again." banner; keep sheet open.

### Client profile Projects tab changes

**File edited:** [mobile-app/app/(tabs)/clients/[clientId]/index.tsx](/mobile-app/app/(tabs)/clients/[clientId]/index.tsx), lines 2471-2486.

**Add:**
- State: `showProjectCreationSheet: boolean`.
- "New Project" button above `ProjectsList` (matches "Add Note" / "New Task" button styling).
- Empty-state CTA button ("Create first project") when `projects.length === 0`.
- `<ProjectCreationSheet ... />` rendered conditionally.

**Keep unchanged:** `ProjectsList` rendering, project count badge, etc.

## File manifest

**New files:**
- `mobile-app/components/FlagCreationSheet.tsx`
- `mobile-app/components/ProjectCreationSheet.tsx`
- `mobile-app/lib/shortcodeUtils.ts`

**Edited files:**
- `mobile-app/app/(tabs)/clients/[clientId]/index.tsx` (all four tabs)
- `mobile-app/app/notes/editor.tsx` (only if `clientId` param support is missing — 3-line addition)

**No schema changes. No new dependencies. No new routes.**

## Success criteria

**Batch A:**
- Tapping "Add Note" on a client profile opens the full-screen editor at `/notes/editor` with the client pre-scoped (saving the note attaches it to this client).
- Tapping an existing note card opens the editor in edit mode for that note.
- Tapping "New Task" on a client profile opens the full `TaskCreationFlow` modal with this client pre-selected.
- AI-assist, date picker, priority, assignees, attachments all work identically to the global Tasks screen.
- The two inline forms are gone; the state/handlers they used are removed.

**Batch B:**
- Tapping "New Flag" opens a bottom-sheet-style slide-up modal with room to write, a priority segmented control, an assignee picker (defaults to "me"), and an optional linked-project picker.
- Creating a flag calls `flags.create` with the correct `entityType: 'client'` scope and returns to the Flags tab showing the new flag.
- Tapping "New Project" on the Projects tab opens a slide-up modal with Name and Shortcode inputs.
- Typing into Name auto-suggests a shortcode until the user manually edits the shortcode field.
- Creating a project navigates to its detail page and shows it in the client's project list.
- Shortcode collisions surface a readable inline error, sheet stays open.

## Open items & risks

- **`/notes/editor` scoping param** — the route's current param handling hasn't been read end-to-end; the spec assumes it may need a 3-line addition for `clientId` support. Verify during implementation; scope the fix into Batch A.
- **`api.projects.listByClient` query name** — Flag creation sheet's optional project picker needs a query that returns this client's projects. The exact Convex query name has not been verified; expect to find it in `model-testing-app/convex/projects.ts` during implementation.
- **Navigation path syntax** — `router.push(\`/(tabs)/clients/${clientId}/projects/${projectId}\`)` assumes Expo Router's file-based route syntax. Verify against how existing code navigates to project detail in `app/(tabs)/clients/[clientId]/index.tsx` before committing.
- **Keyboard handling in sheets** — multi-line TextInputs on iOS can be obscured by the keyboard inside a pageSheet modal. Use `KeyboardAvoidingView` with `behavior="padding"` inside both sheet components. Matches the pattern in `TaskCreationFlow`.
- **Accessibility** — new buttons (New Project, Create first project, sheet primary/secondary actions) need `accessibilityLabel` and `accessibilityRole="button"`. Easy to add during implementation.

## Not addressed in this spec (deferred follow-ups)

- Rich `@mentions` in flag notes.
- Extracting a shared `<SlideSheetModal>` wrapper component.
- A shared workspace package for `shortcodeUtils`.
- Editing projects from mobile beyond what the detail screen already exposes.
- Bulk actions on flags, projects, notes, or tasks.
- True snap-point bottom sheet via `@gorhom/bottom-sheet`.
