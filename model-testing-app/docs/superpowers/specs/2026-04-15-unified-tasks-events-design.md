# Unified Tasks & Events — Design Spec

**Date:** 2026-04-15
**Branch:** mobile2
**Status:** Approved

## Overview

Merge tasks and events into a single chronological view on the mobile `/m-tasks` page. The AI creation flow gains a Task/Meeting mode toggle with full-featured meeting creation. All confirmation cards become editable before submission. Google-synced events appear read-only with contextual actions.

---

## 1. Unified List View

The `/m-tasks` page shows tasks and events interleaved in one chronological stream.

### Ordering
- Items sorted by their date: tasks use `dueDate`, events use `startTime`.
- Within the same time, events appear before tasks (time-bound takes priority).
- Tasks without a due date go to the bottom in a "No Date" section.

### Visual Distinction
- **Tasks**: Checkbox on the left, priority badge, status indicator (existing pattern).
- **Local events**: Calendar icon on the left (no checkbox), time range displayed (e.g. "10:00 – 11:00"), location shown if set.
- **Google-synced events**: Same as local events but with a small Google icon badge indicating external sync.
- Both types show client/project link if assigned.

### Day Strip & Summary Pills
- Day strip counts include both tasks and events for each day.
- Summary pills: keep Overdue, Due Today, In Progress for tasks. Add "Meetings Today" as a new pill.

### Detail Sheets
- Tapping a task opens the existing `TaskDetailSheet`.
- Tapping a local event opens a new `EventDetailSheet` (fully editable).
- Tapping a Google-synced event opens `EventDetailSheet` in read-only mode with action buttons.

---

## 2. Creation Flow — Task/Meeting Toggle + Editable Confirmation

### Mode Toggle
- Two buttons at the top of the creation flow: **"Task"** and **"Meeting"**.
- Defaults to "Task".
- The toggle changes the AI system prompt and the confirmation card fields.

### AI Parsing Per Mode
- **Task mode**: Extracts title, description, due date, priority, assignees, client/project (unchanged from current).
- **Meeting mode**: Extracts title, date/time, duration (defaults to 1 hour), location, description, attendees (matched from contacts), client/project, reminders, recurrence, video conferencing link.

### Editable Confirmation Card
All fields on the confirmation card are tappable/editable before the user hits "Create":

- **Title**: Tap to edit inline.
- **Date/Time**: Tap opens date/time picker.
- **Priority** (tasks only): Tap cycles through Low/Medium/High.
- **Duration** (events only): Tap to adjust.
- **Location** (events only): Tap to edit inline.
- **Client/Project**: Tap opens the existing client/project picker.
- **Assignees/Attendees**: Tap to add/remove from contacts.
- **Reminders** (events): Tap to configure.
- **Recurrence** (events): Tap to set pattern (daily, weekly, monthly, custom).
- **Description**: Expandable text area.

The user can also type follow-up messages to the AI to make changes conversationally — both paths work.

### Google Calendar Push
- For events: "Add to Google Calendar" toggle shown when connected. **On by default** for meetings.
- For tasks: Toggle shown when connected. Off by default (opt-in).

### Manual Creation Fallback
- A "Skip AI, create manually" link below the input area.
- Opens the editable confirmation card with all fields blank for direct manual entry.

---

## 3. Google-Synced Event Actions

### Read-Only Detail Sheet
Google-synced events display all details from Google (title, date/time, duration, location, description, attendees) but none are editable. A Google Calendar icon badge appears in the header. An "Open in Google Calendar" link is shown if `googleCalendarUrl` is set.

### Action Buttons
Three actions available at the bottom of the read-only sheet:

- **Link to Client/Project** — opens the client/project picker, saves the association on the local event record. Enriches the event for Daily Brief and intelligence features.
- **Add Notes** — opens a text area that saves to the event's `metadata` field. Personal notes not synced back to Google.
- **Create Task from This** — pre-fills the task creation flow with context: title becomes "Follow up: [event title]", due date set to the event date, client/project auto-linked if the event has one.

All actions modify local Convex data only — nothing pushes back to Google for synced events.

---

## 4. Component Changes

### New Components
| Component | Purpose |
|-----------|---------|
| `EventListItem.tsx` | List item for events — calendar icon, time range, location, Google badge |
| `EventDetailSheet.tsx` | Event detail view — editable for local, read-only with actions for Google-synced |
| `EditableConfirmationCard.tsx` | Replaces `TaskConfirmationCard` — all fields tappable, renders task or event fields based on mode |
| `CreationModeToggle.tsx` | Task/Meeting toggle buttons at top of creation flow |

### Modified Components
| Component | Change |
|-----------|--------|
| `TasksContent.tsx` | Fetch both tasks and events, merge and sort chronologically, pass unified items to list |
| `TaskCreationFlow.tsx` | Add mode toggle, route to different AI prompts per mode, add "Skip AI" manual creation link, use EditableConfirmationCard |
| `TaskDayStrip.tsx` | Accept combined task+event count data |
| `TaskSummaryPills.tsx` | Add "Meetings Today" pill, accept event metrics |
| `groupTasksByDate.ts` | Generalize to accept a `getDate` function param instead of hardcoding `dueDate` |

### AI Agent Route
- `/api/tasks/agent/route.ts` — accept a `mode` param ("task" or "meeting").
- Task mode: existing system prompt (unchanged).
- Meeting mode: new system prompt that extracts event-specific fields (duration, location, attendees, reminders, recurrence, video link).
- Meeting mode returns a parsed event object with `type: "event"` instead of `type: "task"`.

### Convex Changes
- No schema changes needed — events table already has all required fields.
- `events.create` mutation already exists — creation flow calls it when in meeting mode.
- After event creation, optionally push to Google Calendar via `POST /api/google/events`.

---

## 5. File Structure

```
src/components/tasks/
  TasksContent.tsx              — modified: fetch + merge tasks & events
  TaskCreationFlow.tsx          — modified: mode toggle, manual creation, editable card
  TaskListItem.tsx              — unchanged (tasks only)
  TaskDetailSheet.tsx           — unchanged (tasks only)
  TaskDayStrip.tsx              — modified: accept combined counts
  TaskSummaryPills.tsx          — modified: add meetings pill
  groupTasksByDate.ts           — modified: generalize date extraction
  TaskConfirmationCard.tsx      — deprecated, replaced by EditableConfirmationCard

  EventListItem.tsx             — new: event list rendering
  EventDetailSheet.tsx          — new: event detail/edit/read-only
  EditableConfirmationCard.tsx  — new: editable task or event confirmation
  CreationModeToggle.tsx        — new: Task/Meeting toggle

src/app/api/tasks/
  agent/route.ts                — modified: accept mode param, meeting system prompt
```

---

## 6. Out of Scope

- Renaming the route from `/m-tasks` to `/m-schedule` or similar (cosmetic, can do later).
- Desktop tasks page changes (mobile-first, desktop follows separately).
- Drag-and-drop reordering in the list.
- Recurring task support (only events support recurrence).
- Event creation from the desktop interface.
