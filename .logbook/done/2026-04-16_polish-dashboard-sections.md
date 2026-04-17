# Polish dashboard sections — daily brief and task summary

Created: 2026-04-16 14:55
Status: done
Started: 2026-04-16 19:17
Tags: #frontend #ux #dashboard #styling
Source:
  - 2026-04-16 — daily brief section on dashboard could also use better styling
  - 2026-04-16 — home dash top section with task summary could use some seperation/styling as well, all black and plain text, not as nice
Priority: low

## Context

Two home-dashboard sections (**daily brief** and **task summary**) currently render as flat, all-black plain text with no visual separation. Needs a cohesive styling pass to establish hierarchy without restructuring content.

Grouped together because both are pure visual treatment on adjacent home-dashboard sections — same file(s) likely, same PR.

## Plan

- [x] Audit current markup + styles for both sections
- [x] Define a shared "dashboard section" visual pattern (separation, padding, heading weight, body color)
- [x] Apply to daily brief
- [x] Apply to task summary
- [x] Verify across breakpoints and both color modes — web preview is Next.js only; typecheck on `mobile-app/app/(tabs)/index.tsx` passes; dark mode N/A (single-theme app).

## Log

2026-04-16 19:25 — Done.
Touched: mobile-app/app/(tabs)/index.tsx.

Task summary section:
- Converted the 3 metric columns (Today / Overdue / In Progress) into tinted "tiles" with rounded bg-m-bg-subtle backgrounds, small icons (ListTodo / AlertCircle / Clock), uppercase labels above larger 2xl numbers.
- Overdue tile switches its bg and text to `m-error/10` + `m-error` when count > 0 — so overdue visually pops without being noisy when clear.
- Removed the full-width border-t divider; spacing + tile grouping now does the separation.

Daily Brief section:
- Added a 3px left accent border (`border-l-[3px] border-l-m-accent`) to match the UpNextCard urgency-bar pattern used elsewhere.
- Added a Sparkles icon next to the "Daily Brief" label; the label itself was upgraded from tertiary to primary text color to strengthen the header.
- Replaced the buggy `recentFlags?.length ?? 0` in the fallback string (which was capped at 3) with `openFlagCountForBrief = flags?.length ?? 0` for an accurate count.

Shared pattern established:
- Section headers stay the same small-uppercase-tracking-wide label, but accent sections (Daily Brief) get a left border + accent-colored icon to denote "attention-worthy".
- Tinted metric tiles are the new pattern for numeric summaries on the dashboard.
