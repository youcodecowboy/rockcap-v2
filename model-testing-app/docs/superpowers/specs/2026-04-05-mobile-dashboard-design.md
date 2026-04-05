# Mobile Dashboard — Design Spec

## Overview

The mobile dashboard is the landing page for the RockCap mobile companion app. It serves as a quick-glance command centre for property finance professionals in the field — surface what's urgent, provide fast navigation to recent work, and offer one-tap creation of common items.

**Layout model:** Segmented vertical scroll (Option B from brainstorming). Greeting and actions always visible above the fold; notifications condensed with badge count; recents consolidated behind a segmented tab control to save vertical space.

## Sections (top to bottom)

### 1. Greeting

- **Headline:** "Hello, {firstName}" using `user?.firstName` from Clerk's `useUser()` hook
- **Subtitle:** Dynamic summary of outstanding items: "{N} overdue tasks · {M} unread notifications"
  - Overdue count from `tasks.getMetrics()` — count tasks where `status !== 'completed'` and `dueDate < now`
  - Unread count from `notifications.getUnreadCount()`
  - If both are zero: "All caught up" (no counts shown)
  - If only one category has items, show only that (e.g., "2 unread notifications")

### 2. Quick Actions

2×2 grid of action buttons. Each button has an icon (Lucide, 14px, inside a 28px rounded container) and a label.

| Button | Icon | Action |
|--------|------|--------|
| New Note | `Pencil` | Navigate to `/m-notes` (later: open quick-create sheet) |
| New Task | `CheckSquare` | Navigate to `/m-tasks` (later: open quick-create sheet) |
| Upload | `Upload` | Navigate to `/m-docs` (later: trigger file picker) |
| New Contact | `UserPlus` | Navigate to `/m-contacts` (later: open quick-create sheet) |

**Styling:** `bg-[var(--m-bg-subtle)]` with `border border-[var(--m-border-subtle)]`, `rounded-lg`. Icon container `bg-[var(--m-bg-inset)]` rounded-[7px]. Label `text-[12px] font-medium text-[var(--m-text-primary)]`.

Quick actions navigate to the relevant mobile page for now. As individual pages are built out, these will open inline quick-create sheets (bottom drawer) instead — that's a per-page concern, not a dashboard concern.

### 3. Up Next Card

A single prominent card showing the most urgent upcoming item across tasks, reminders, and events.

**Data resolution:**
1. Fetch in parallel: `tasks.getByUser()` (filter to active, sort by dueDate), `reminders.getUpcoming(1)`, `events.getNextEvent()`
2. From each source, take the single most urgent item (soonest due or most overdue)
3. Pick the overall winner: most overdue first, then soonest due
4. If nothing is due/upcoming, hide the card entirely

**Display:**
- **Label:** "UP NEXT" — 9px uppercase, letter-spaced
- **Title:** Item name (task title, reminder title, or event title)
- **Subtitle:** Context line — "{client name} · Due {relative time}" or "{client name} · In {relative time}"
- **Badge:** Status indicator — "OVERDUE" (red), "DUE TODAY" (amber), "TOMORROW" (neutral)

**Styling by urgency:**
- Overdue: `bg-[#fef2f2] border border-[#fecaca]`, label/subtitle in red tones
- Due today/soon: `bg-[#fefce8] border border-[#fef08a]`, label/subtitle in amber tones
- Future (>24h): `bg-[var(--m-bg-subtle)] border border-[var(--m-border)]`, neutral tones

**Interaction:** Tapping the card navigates to the relevant page (task → `/m-tasks`, etc.). For now, since individual pages are placeholders, just navigate to the category page.

### 4. Notifications

Condensed notification list with a section header containing a count badge.

**Header row:**
- Left: "NOTIFICATIONS" label (9px uppercase, `--m-text-tertiary`) + red count badge showing unread count
- Right: "View all →" link (`text-[var(--m-accent-indicator)]`, 10px)

**Items:** Show up to 3 most recent unread notifications via `notifications.getRecent(3, false)`.

Each item:
- Dot indicator (6px circle): red (`--m-error`) for urgent types (overdue tasks, flags), blue (`--m-accent-indicator`) for informational (uploads, changelog)
- Title: 11px, `--m-text-primary`
- Timestamp: 10px, `--m-text-tertiary`, relative format ("2h ago", "Yesterday")

**Empty state:** If no unread notifications, show a single line: "No new notifications" in `--m-text-tertiary`, centered.

**Interaction:** Tapping a notification item marks it as read and navigates to the relevant context (client, project, task). "View all" navigates to a full notification list (future page).

### 5. Recents (Segmented Tabs)

A segmented tab control with three tabs: **Projects**, **Clients**, **Docs**.

**Tab bar:**
- Full-width, 3 equal segments
- Active tab: `text-[var(--m-text-primary)] font-medium` with 2px bottom border in `--m-accent-indicator`
- Inactive tabs: `text-[var(--m-text-tertiary)]`
- Background: `bg-[var(--m-bg-subtle)]`

**Tab content — Projects:**
- Source: `projects.list()` — sorted by most recent activity (use `_creationTime` or associated task/doc activity)
- Show 3 items
- Each row: project name (12px, font-medium, `--m-text-primary`), subtitle "{client name} · {N} tasks" (10px, `--m-text-tertiary`), chevron right icon (14px, `--m-text-placeholder`)
- Tap → navigate to project detail (when built, for now `/m-clients`)
- Footer: "View all projects →" link centered, navigates to projects list

**Tab content — Clients:**
- Source: `clients.list()` — sorted by recent activity
- Show 3 items
- Each row: client name (12px, font-medium), subtitle "{N} active projects · Last accessed {relative time}" (10px)
- Tap → navigate to `/m-clients` (later: client detail)
- Footer: "View all clients →"

**Tab content — Docs:**
- Source: `documents.getRecent(3)`
- Show 3 items
- Each row: file name (12px, font-medium), subtitle "{client name} · {category or file type} · {upload date}" (10px)
- Tap → navigate to `/m-docs` (later: document viewer)
- Footer: "View all documents →"

**Tab state:** Local component state (`useState`). Default tab: Projects. No persistence needed.

## Data Fetching Strategy

All queries fire in parallel on mount via Convex's `useQuery` hooks. Each section renders independently — no waterfall.

```
useUser()                      → greeting
useQuery(tasks.getMetrics)     → greeting subtitle + up next candidate
useQuery(tasks.getByUser)      → up next candidate (most urgent task)
useQuery(reminders.getUpcoming)→ up next candidate
useQuery(events.getNextEvent)  → up next candidate
useQuery(notifications.getRecent)    → notifications section
useQuery(notifications.getUnreadCount) → notification badge + greeting subtitle
useQuery(projects.list)        → recents: projects tab
useQuery(clients.list)         → recents: clients tab
useQuery(documents.getRecent)  → recents: docs tab
```

Convex queries are reactive — dashboard updates in real-time as data changes.

## Component Structure

```
src/app/(mobile)/m-dashboard/page.tsx
  └── MobileDashboard (server component wrapper)
        └── DashboardContent (client component — all hooks here)
              ├── DashboardGreeting
              ├── QuickActions
              ├── UpNextCard (conditionally rendered)
              ├── NotificationsSection
              └── RecentsSection
                    └── segmented tab state + tab content
```

All sub-components are local to the dashboard — defined in `src/app/(mobile)/m-dashboard/components/`. No shared components created until a second consumer exists.

## File Map

| File | Purpose |
|------|---------|
| `src/app/(mobile)/m-dashboard/page.tsx` | Server component shell, imports DashboardContent |
| `src/app/(mobile)/m-dashboard/components/DashboardContent.tsx` | Client component, all Convex queries + layout |
| `src/app/(mobile)/m-dashboard/components/DashboardGreeting.tsx` | Greeting + alert subtitle |
| `src/app/(mobile)/m-dashboard/components/QuickActions.tsx` | 2×2 action grid |
| `src/app/(mobile)/m-dashboard/components/UpNextCard.tsx` | Urgent item card with priority styling |
| `src/app/(mobile)/m-dashboard/components/NotificationsSection.tsx` | Notification list + header |
| `src/app/(mobile)/m-dashboard/components/RecentsSection.tsx` | Segmented tabs + tab content |

## Styling Rules

All components follow `MOBILE_DESIGN_SYSTEM.md` tokens. Specific to dashboard:

- Page uses no horizontal padding at the top level — sections manage their own padding (greeting/actions get `px-[var(--m-page-px)]`, list items get `px-[var(--m-page-px)]`, section headers are full-width with `bg-[var(--m-bg-subtle)]`)
- Section dividers: `border-t border-[var(--m-border)]` between major sections
- No card shadows — borders only
- Up Next is the only section with a colored background (urgency-dependent)
- All interactive rows use `active:bg-[var(--m-bg-subtle)]` for touch feedback

## Scope Boundaries

**In scope:**
- All 5 sections rendering with real Convex data
- Segmented tab switching for recents
- Navigation on tap (to mobile pages, even if placeholder)
- Real-time reactivity via Convex subscriptions
- Empty states for each section

**Out of scope (future per-page work):**
- Quick-create sheets (bottom drawers for note/task/contact creation)
- File picker for upload action
- Pull-to-refresh (Convex is already reactive)
- Notification read/dismiss actions (tap navigates, marking as read is future)
- Deep links to specific project/client/document detail pages (until those pages exist)
