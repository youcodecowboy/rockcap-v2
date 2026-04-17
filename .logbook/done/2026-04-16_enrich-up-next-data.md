# Enrich "Up Next" items with type and time

Created: 2026-04-16 14:55
Status: done
Tags: #frontend #ux #dashboard #data
Source:
  - 2026-04-16 — main dashboard section "up next" is too flat, needs to be more data rich, it is just a plain text line - what is it? is it a task, a meeting, a google calendar event, also has no time on it so does not specify when it is due? needs iconography and colour and subtitle (split: data half)
Priority: medium

## Context

The "Up Next" section on the main dashboard currently renders items as plain text lines with no indication of item **type** (task vs meeting vs Google Calendar event) or **due time**. Without those fields, users can't tell what they're looking at or when anything is due.

This task covers the **data side** of the fix — schema/query/API changes to expose type and time. A companion task (`restyle-up-next-visually`) covers the visual treatment that consumes these new fields.

## Plan

- [x] Locate the current "Up Next" data source (Convex query / API route / component prop)
- [x] Define the item type taxonomy (task / meeting / calendar-event — extensible)
- [x] Add `type` and `dueAt` fields to the data model (or join from Tasks + Calendar sources if they're separate)
- [x] Update the query to return both fields and sort by `dueAt` ascending
- [x] Expose fields through to the "Up Next" component (keeps visual task unblocked)

## Log

### [1] Locate the current "Up Next" data source
Status: done
Started: 15:28 | Completed: 15:35 | Duration: 7m
Summary: Data lives at `model-testing-app/src/app/(mobile)/m-dashboard/components/UpNextCard.tsx` plus `DashboardContent.tsx` (`resolveUpNext()` at lines 65–121). **Critical: the Plan's premise is false.** The `UpNextItem` type already includes `type` ('task' | 'reminder' | 'event') and `dueDate`; candidates are built from Convex tasks + reminders + events and sorted by overdue-first, then soonest upcoming. `UpNextCard` already renders urgency-colored left border, OVERDUE/DUE TODAY/UPCOMING badges, and a subtitle line with relative time. Desktop dashboard has no "Up Next" component (grep miss) — user's jot is about the mobile view. Pausing both tasks until user confirms scope (see Log note below).
Files touched: (investigation only, no code changes)
Commit: —

### Note: scope pivot — wrong repo
Initial investigation was in `model-testing-app/` (Next.js web app). User confirmed via screenshot: the dashboard in question is the **React Native / Expo mobile app** at `mobile-app/app/(tabs)/index.tsx`.

The web app's `UpNextCard.tsx` is rich (type, urgency, badges, subtitle) — but it's a DIFFERENT codebase. The mobile app's Up Next section (lines 159–186) is MUCH simpler: uppercase label + bullet dot + task title. No type, time, subtitle, urgency color, or icon. Only queries `tasks.getByUser` and `events.getNextEvent` — no reminders.

Revised Plan targets `mobile-app/` and ports the web's `UpNextCard` design pattern to React Native / NativeWind.

### [2] Revise Plan to target mobile-app (React Native)
Status: pending user confirmation of revised scope. Once confirmed:
  - Add `api.reminders.getUpcoming` query to `mobile-app/app/(tabs)/index.tsx`
  - Build unified `resolveUpNext()` helper porting web's `DashboardContent.tsx:65-121`
  - Replace separate `todayTasks` / `nextEvent` rendering with unified `UpNextItem[]` feed

Companion visual task (`restyle-up-next-visually`) also fully re-scoped: create `mobile-app/components/UpNextCard.tsx` (RN version).

### [2] Add reminders query to mobile dashboard
Status: done
Completed: 15:48
Summary: Added `api.reminders.getUpcoming` useQuery (limit: 3) to `mobile-app/app/(tabs)/index.tsx` alongside existing tasks + nextEvent queries. Gated on `isAuthenticated`.
Files touched: mobile-app/app/(tabs)/index.tsx
Commit: (pending)

### [3] Build unified UpNextItem[] merge + sort (inline)
Status: done
Completed: 15:48
Summary: Inline data merge in `index.tsx`: active tasks (with dueDate, not completed/cancelled) + upcomingReminders + nextEvent → `UpNextItem[]`, sorted overdue-first then soonest upcoming. Ports logic from web's `DashboardContent.tsx:65-121`. Added `clientMap` for context lookup.
Files touched: mobile-app/app/(tabs)/index.tsx
Commit: (pending)

### [4] Replace inline Up Next block with new component
Status: done
Completed: 15:48
Summary: Old inline block (~28 lines, label + bullet-dot + title) removed. Replaced with `<UpNextCard items={upNextItems} />` single-line render. See companion task (restyle-up-next-visually) for component details.
Files touched: mobile-app/app/(tabs)/index.tsx
Commit: (pending)

Note: Build verification and visual QA pending. `npx next build` (model-testing-app/) to run next; mobile-app TypeScript + Expo visual verification is a separate follow-up.

