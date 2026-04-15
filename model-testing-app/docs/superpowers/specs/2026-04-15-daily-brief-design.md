# Daily Brief — Design Spec

**Date:** 2026-04-15
**Branch:** mobile2
**Status:** Approved

## Overview

AI-generated daily briefing for loan officers. Pre-built at 5am via Claude Haiku, with on-demand fallback. Four sections: Attention Needed, Today's Schedule, Activity Recap, and Looking Ahead. Stored per-user per-day in Convex. Accessible via a full page at `/m-brief` and a preview widget on the dashboard.

---

## 1. Data Aggregation

An API route `/api/daily-brief/generate` collects data from Convex for the authenticated user:

| Source | Query | Data |
|--------|-------|------|
| Tasks | `tasks.getByUser` + `tasks.getMetrics` | Overdue tasks, due today, in progress, recently completed |
| Events | `events.getUpcoming` + `events.getByUser` | Today's calendar events (including Google-synced) |
| Flags | `flags.getMyFlags` | Open flags needing attention |
| Notifications | `notifications.getRecent` | Last 24 hours of notifications |
| Documents | `documents.getRecent` | Recently filed documents |
| Clients | `clients.list` | Recently created clients |
| Projects | `projects.list` | Recently created projects |
| Conversations | `conversations.getMyConversations` | Unread messages |

The route gathers all data, builds a structured context payload, and passes it to Claude.

---

## 2. AI Summarization

**Model:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)

**System prompt** instructs Claude to produce a JSON response with four sections:

```json
{
  "summary": {
    "overdue": 2,
    "dueToday": 4,
    "meetings": 3,
    "openFlags": 2
  },
  "attentionNeeded": {
    "items": [
      {
        "type": "task" | "flag",
        "title": "Chase solicitor re: Henderson completion",
        "context": "Meridian Capital · Overdue by 3 days",
        "urgency": "high" | "medium"
      }
    ],
    "insight": "AI-generated observation connecting dots across items"
  },
  "todaySchedule": {
    "items": [
      {
        "type": "event" | "task",
        "time": "09:00",
        "title": "Site visit — 42 High St",
        "context": "Meridian Capital · 1 hour"
      }
    ],
    "insight": "AI-generated observation about the day"
  },
  "activityRecap": {
    "items": [
      {
        "type": "documents" | "clients" | "projects" | "messages" | "flags" | "tasks",
        "count": 3,
        "summary": "3 new documents — Insurance cert (Crown Dev), Valuation report (42 High St), KYC form (Apex)"
      }
    ],
    "insight": "AI-generated observation about recent activity patterns"
  },
  "lookingAhead": {
    "items": [
      {
        "title": "Riverside Phase 2 drawdown — Friday",
        "context": "3 documents still outstanding",
        "urgency": "high" | "medium" | "low"
      }
    ],
    "insight": "AI-generated observation about upcoming priorities"
  }
}
```

The AI insights are the differentiator — they connect information across sections (e.g. "You have a site visit at the property where the valuation is overdue — worth raising on site").

---

## 3. Storage

**New Convex table: `dailyBriefs`**

```
dailyBriefs: defineTable({
  userId: v.id("users"),
  date: v.string(),           // "2026-04-15" — one per user per day
  content: v.any(),            // The full JSON brief structure
  generatedAt: v.string(),     // ISO timestamp of generation
}).index("by_user_date", ["userId", "date"])
```

**Mutations/queries:**
- `dailyBriefs.getToday` — query: get brief for current user + today's date
- `dailyBriefs.save` — mutation: upsert brief (overwrite if regenerated)

---

## 4. Scheduling

**Convex cron (`convex/crons.ts`):**
- Daily at 5:00 AM UTC
- Calls an internal function that identifies active users (logged in within last 30 days)
- For each user, triggers brief generation via an HTTP action or internal function
- Note: Convex crons run internal functions, not API routes. The generation logic needs to be callable both ways.

**On-demand fallback:**
- `/m-brief` page queries `dailyBriefs.getToday`
- If no brief exists for today, shows loading state and triggers `POST /api/daily-brief/generate`
- Once generated, reactively updates via Convex subscription

**Manual refresh:**
- "Refresh" button on the brief page triggers regeneration
- Overwrites existing brief for today

---

## 5. The Brief Page (`/m-brief`)

**Route:** `/m-brief` added to the mobile nav drawer (between Dashboard and Clients)

**Page structure:**
1. **Header** — "Daily Brief" title, back arrow, Refresh button
2. **Date + meta** — "Wednesday, 15 April" with generation time and attention count
3. **Quick stats bar** — 4 pills: Overdue, Due Today, Meetings, Open Flags
4. **Section 1: Attention Needed** — red accent, overdue tasks and urgent flags with context. AI insight at bottom.
5. **Section 2: Today's Schedule** — indigo accent, chronological timeline mixing events (indigo dots) and tasks (black dots) with times. AI insight at bottom.
6. **Section 3: Activity Recap** — blue accent, counts of new documents, clients, projects, messages, flags, completions since last brief. AI insight about patterns.
7. **Section 4: Looking Ahead** — green accent, upcoming deadlines this week, dormant clients, items trending toward overdue. AI insight about priorities.

**States:**
- **Loading** — "Preparing your daily brief..." with spinner (first load or refresh)
- **Empty** — "No brief available yet" with Generate button
- **Loaded** — full brief rendered from stored JSON
- **Google Calendar prompt** — if not connected, show inline card at top: "Connect Google Calendar to see your schedule in your daily brief"

---

## 6. Dashboard Widget Enhancement

The existing `DailyBriefWidget` gets enhanced:
- Shows the top 2 attention items from the brief as a preview
- Displays the quick stats (overdue count, meetings count) inline
- "View full brief →" link navigates to `/m-brief`
- If no brief exists yet, shows the current placeholder style with "Tap to generate"

---

## 7. File Structure

```
convex/
  dailyBriefs.ts              — getToday, save mutations/queries
  crons.ts                    — 5am daily brief generation trigger

src/app/api/daily-brief/
  generate/route.ts           — POST: aggregate data, call Claude, store result

src/app/(mobile)/
  m-brief/page.tsx            — Brief page wrapper
  m-brief/components/
    BriefContent.tsx           — Main content renderer
    BriefSection.tsx           — Reusable section card (title, items, insight)
    BriefScheduleTimeline.tsx  — Timeline view for today's schedule
    BriefStatsBar.tsx          — Quick stats pills
    BriefLoadingState.tsx      — Loading/generating state

src/app/(mobile)/m-dashboard/components/
  DailyBriefWidget.tsx         — Enhanced with brief preview data
```

---

## 8. Out of Scope

- Brief history (viewing past days' briefs)
- Brief customization (choosing which sections to show)
- Push notifications when brief is ready
- Brief sharing or export
- Desktop brief page (mobile-first, desktop follows separately)
