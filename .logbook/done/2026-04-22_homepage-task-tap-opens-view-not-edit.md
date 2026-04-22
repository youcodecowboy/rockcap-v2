# Homepage task tap opens edit modal — should default to view

Created: 2026-04-22
Status: done
Tags: #bug #mobile #ux
Source:
  - 2026-04-18 — [bug] new homepage: clicking a task opens the edit modal instead of the view/detail modal — tap should default to view, with edit as a secondary action (Pencil/MoreVertical)
Priority: medium

## Notes

Shipped 2026-04-22 in commit d6858c2 — `mobile-app/components/TaskDetailSheet.tsx`.

Root cause: the "detail" sheet was structurally an edit form (every
field a TextInput, "Edit Task" header, Delete button at the bottom).
Every tap from the homepage (or the tasks screen) opened the same
edit surface, making read traffic near-destructive.

Fix: added internal `isEditMode` state defaulting to `false`. Render
branches per-mode:

- View mode: Text blocks for title/description/notes, single active
  chip for status/priority, formatted due date, read-only attachment
  list, footer "Edit Task" CTA. Empty sections hidden.
- Edit mode: previous layout (TextInputs, all chips, Save + Delete).

Header swaps right-side action: Pencil in view (promote to edit),
Trash in edit (delete) — keeps destructive action out of plain read
traffic. Post-save snaps back to view mode so the user sees their
edits reflected.

All existing call sites (homepage ?taskId deep-link + tasks-screen
tap) land in view mode; no external API change required.
