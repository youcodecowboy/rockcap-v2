# Task System Rework — Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Backend schema changes, new task agent endpoint, shared UI components, mobile `/m-tasks` page, desktop `/tasks` rework, notification triggers

---

## Overview

Rework the task system across both mobile and desktop platforms. Introduce AI-powered natural language task creation via a dedicated lightweight agent, multi-assignee support, real-time notifications on meaningful changes, and a consistent UI with a 7-day planning strip and structured detail views.

---

## Section 1: Backend — Schema & Convex Changes

### Schema migration

**`tasks` table — `assignedTo` field:**

```
assignedTo: v.optional(v.id("users"))
→ assignedTo: v.optional(v.array(v.id("users")))
```

**New status value added to union:**

```
status: "todo" | "in_progress" | "completed" | "cancelled" | "paused"
```

### Convex mutation/query updates

- **`tasks.create`** — accepts `assignedTo` as array. Creates a notification for each assignee that isn't the creator.
- **`tasks.update`** — compares old vs new `assignedTo` to notify newly added users. On status/dueDate/notes change, notifies all other stakeholders (see Section 6 notification rules).
- **`tasks.assign`** — updated to accept array of user IDs.
- **`tasks.complete`** — notifies all stakeholders.
- **`tasks.getByUser`** — updated to check if user's ID is `in` the `assignedTo` array (not just equality check).
- **`tasks.getMetrics`** — updated for array-based filtering. Adds new counts: `dueToday`, `overdue`, `paused`.

### New query — `tasks.getByDateRange`

Returns task counts grouped by date for the 7-day strip.

- Takes `startDate` and `endDate` (ISO strings)
- Returns `{ [date: string]: number }` count map

### Chat tool updates

- `task.tools.ts` — update `createTask` and `updateTask` tool schemas for array-based `assignedTo`
- `executor.ts` — update task handlers to pass arrays
- `validators.ts` — `parseAndValidateTaskParams` updated for array assignee resolution. When given a single user reference, wraps in array. Fuzzy matching extended for user name resolution (same pattern as client matching).

---

## Section 2: Task Agent Endpoint

### New route: `/api/tasks/agent`

A lightweight, multi-turn conversational endpoint purpose-built for task creation. Separate from the main chat assistant.

**Model:** Claude Haiku 4.5 (fast, cheap, sufficient for structured extraction)

### System prompt focus

- "You are a task creation assistant for a property finance team"
- Has access to the user's clients, projects, and team members as context
- Goal: extract title, description, assignees, due date, priority, client/project link
- If confident in all fields from first message → return structured task immediately
- If gaps → ask ONE targeted follow-up at a time (max 2-3 rounds)

### Request shape

```typescript
POST /api/tasks/agent
{
  messages: [{ role: "user" | "assistant", content: string }],
  context: {
    userId: string,
    clients: { id, name }[],
    projects: { id, name, clientId }[],
    users: { id, name }[]
  }
}
```

### Response shape — two modes

```typescript
// Agent needs more info:
{ type: "message", content: "Is this for Bayfield Homes the client?" }

// Agent has everything, ready for confirmation:
{
  type: "task",
  task: {
    title: string,
    description?: string,
    dueDate?: string,       // ISO
    priority: "low" | "medium" | "high",
    assignedTo: string[],   // user IDs
    clientId?: string,
    projectId?: string
  }
}
```

### Key design decisions

- No tool registry (107 tools) — just structured output
- No confirmation flow in the API — the frontend handles confirmation
- No conversation persistence — ephemeral, task-scoped sessions
- No caching strategy needed — conversations are 2-4 messages max
- System prompt ~500 tokens vs ~4000+ for main chat
- Context loading: frontend preloads clients/projects/users via existing Convex queries before the first API call, passes them in the request

---

## Section 3: Shared UI Components

All components live in `src/components/tasks/` and are consumed by both mobile and desktop.

### `TaskSummaryPills`

- Row of stat pills: Active, Completed, Paused, Due Today, Overdue
- Props: `metrics: TaskMetrics` (from `tasks.getMetrics`)
- Responsive: horizontal scroll on mobile, single row on desktop

### `TaskDayStrip`

- Horizontal 7-day view starting from today
- Each day shows: day name, date number, task count
- Selected day highlighted with accent background
- Props: `dateCounts: Record<string, number>`, `selectedDate`, `onSelectDate`
- Tapping a day calls `onSelectDate` → parent filters the task list
- Tapping the already-selected day deselects it (shows all tasks)
- On mobile: compact single-letter day names. On desktop: wider cells with full day names.

### `TaskListItem`

- Single task row: checkbox border (color-coded by priority), title, subtitle (client + due info), priority badge
- Props: `task: Task`, `onTap`, `onToggleComplete`
- Checkbox border colors: red = high/overdue, amber = medium, blue = low
- Overdue tasks show "Overdue 2d" in red subtitle text
- Tapping checkbox area completes the task, tapping anywhere else opens detail

### `TaskDetailSheet`

The structured detail view with:

- Drag handle (sheet mode only)
- Title + overflow menu (`···`)
- **Status bar**: tappable pills (To Do, In Progress, Done) for forward progression
- **Action row below status**: Pause, Edit, Delete buttons — secondary style
- Structured key-value fields: Client, Project, Due, Priority, Assigned (with avatar initials)
- Description section
- Notes section with "+ Add note" button and inline editing

**Edit mode behavior:** Tapping "Edit" toggles the detail sheet into edit mode — key-value fields become tappable/editable inline (date picker for due date, dropdown for priority, user picker for assignees, text input for title/description). A "Save" button replaces "Edit". No separate edit page or modal.

Props: `task: Task`, `isOpen`, `onClose`, `onUpdate`, `onComplete`, `onDelete`, `variant: "sheet" | "panel"`

- **Sheet mode** (mobile): slides up from bottom, ~70vh, with drag handle
- **Panel mode** (desktop): renders inline in right side panel, 400px wide, no drag handle or slide animation

### `TaskCreationFlow`

The AI-powered creation screen with three stages:

**Stage 1 — Input:**
- Guidance text: "Tell me what you need to do, when you need to do it, and who you need to do it with"
- Auto-growing textarea with send button
- Centered illustration/icon above the guidance

**Stage 2 — Follow-up (if needed):**
- Mini chat thread showing user message and agent response
- Agent asks targeted follow-ups for missing info
- Max 2-3 exchanges before confirmation

**Stage 3 — Confirmation:**
- Structured task preview card slides up from bottom
- Shows: title, description, client, project, due date, priority, assignees
- "Edit" button (lets user tweak fields) and "Create Task" button
- On success: closes creation flow, returns to list

Props: `onTaskCreated`, `onClose`

- Manages own state: messages array, loading state
- Calls `/api/tasks/agent` endpoint
- Preloads context (clients/projects/users) on mount via Convex queries

### `TaskConfirmationCard`

- Extracted from `TaskCreationFlow` for reuse
- Shows the structured task the agent produced
- User can tap any field to quick-edit before confirming
- "Create Task" button calls `tasks.create` mutation directly

---

## Section 4: Mobile `/m-tasks` Page

### Screen structure (top to bottom)

1. Standard mobile header (inherited from `MobileShell`)
2. `TaskSummaryPills` — horizontal scrollable stat pills
3. `TaskDayStrip` — 7-day strip, today selected by default
4. Divider
5. Section header — "Due Today" / "All Tasks" / date label (dynamic based on day strip selection)
6. `TaskListItem[]` — scrollable list, sorted: overdue first → by due date → by priority
7. FAB button — bottom-right floating `+` button

### Interaction flows

- **Day strip tap** → filters list to that day, section header updates. Tap again to deselect (show all).
- **Task tap** → opens `TaskDetailSheet` as bottom sheet (~70vh)
- **Task checkbox tap** → optimistic completion with undo toast ("Task completed. Undo")
- **FAB tap** → navigates to creation screen (full page)
- **Pull to refresh** → re-fetches task data (UX comfort — Convex is real-time)

### Data loading

- `tasks.getByUser({ includeCreated: true, includeAssigned: true })` — all user's tasks
- `tasks.getMetrics()` — for summary pills
- `tasks.getByDateRange({ startDate, endDate })` — for day strip counts
- All via Convex `useQuery` hooks — real-time updates

### Empty state

Centered illustration with "No tasks yet" and a prominent "Create your first task" button.

### Filtered empty state

When a day is selected with no tasks: "No tasks due on {day name}" with a subtle "Create task" link.

---

## Section 5: Desktop `/tasks` Rework

### Two-panel layout

```
┌─────────────────────────────────────────────────────────────┐
│  TaskSummaryPills (full width)                              │
├─────────────────────────────────────────────────────────────┤
│  TaskDayStrip (full width, wider cells, full day names)     │
├──────────────────────────────────┬──────────────────────────┤
│  Task List (left, ~60%)          │  Detail Panel (right)    │
│                                  │                          │
│  Tab bar: Tasks | Reminders      │  TaskDetailSheet         │
│                                  │  (variant: "panel")      │
│  Section-grouped task list       │                          │
│  (same TaskListItem component)   │  Or empty state:         │
│                                  │  "Select a task"         │
├──────────────────────────────────┴──────────────────────────┤
│                                              [+ New Task]   │
└─────────────────────────────────────────────────────────────┘
```

### Key differences from mobile

| Element | Mobile | Desktop |
|---|---|---|
| TaskDetailSheet | Bottom sheet (70vh) | Right side panel (400px), `variant: "panel"` |
| TaskCreationFlow | Full page navigation | Centered modal dialog (500px wide) |
| TaskSummaryPills | Horizontal scroll | Full row, no scroll |
| TaskDayStrip | Compact single-letter days | Wider cells with full day names |
| New task button | Floating FAB (bottom-right) | "New Task" button in top-right area |
| Task list | Full width | Left panel (~60%) |

### Detail panel behavior

- No task selected → light empty state: "Select a task to view details"
- Task selected → `TaskDetailSheet` in panel mode (no drag handle, renders inline)

### Reminders tab

Small tab bar above the task list: **Tasks | Reminders**. "Tasks" is default. "Reminders" shows the existing reminders list with minimal changes.

---

## Section 6: Notifications & Task Tool Updates

### Notification triggers

| Event | Who gets notified | Notification title |
|---|---|---|
| Task created with assignees | All assignees except creator | "New task assigned: {title}" |
| New user added to assignedTo | Only newly added user(s) | "You've been assigned: {title}" |
| Status changed | All other stakeholders | "{user} marked {title} as {status}" |
| Due date changed | All other stakeholders | "{user} moved deadline for {title} to {date}" |
| Note added | All other stakeholders | "{user} added a note to {title}" |
| Task completed | All other stakeholders | "{user} completed {title}" |
| Task paused | All other stakeholders | "{user} paused {title}" |
| Task deleted | All other stakeholders | "{user} deleted {title}" |

**"Other stakeholders"** = everyone in the `assignedTo` array plus the `createdBy` user, minus the person who performed the action. You never notify yourself.

### Helper function

```typescript
// convex/tasks.ts
async function notifyTaskStakeholders(
  ctx, taskId, actorId, title, message,
  { excludeIds?: Id<"users">[] }
)
```

Gathers `createdBy` + `assignedTo[]`, removes actor + excludeIds, creates one notification per recipient. Called within each mutation — no separate scheduled function needed. Convex mutations are transactional.

---

## Implementation Order

1. **Backend** — schema migration, Convex mutation/query updates, notification helper
2. **Task agent endpoint** — `/api/tasks/agent` with Haiku 4.5
3. **Shared components** — `TaskSummaryPills`, `TaskDayStrip`, `TaskListItem`, `TaskDetailSheet`, `TaskCreationFlow`, `TaskConfirmationCard`
4. **Mobile `/m-tasks`** — wire up full mobile experience
5. **Desktop `/tasks` rework** — rebuild using shared components with panel layout
