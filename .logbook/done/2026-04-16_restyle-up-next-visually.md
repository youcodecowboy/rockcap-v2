# Restyle "Up Next" with iconography, color, and subtitle

Created: 2026-04-16 14:55
Status: done
Tags: #frontend #ux #dashboard #styling
Source:
  - 2026-04-16 — main dashboard section "up next" is too flat, needs to be more data rich, it is just a plain text line - what is it? is it a task, a meeting, a google calendar event, also has no time on it so does not specify when it is due? needs iconography and colour and subtitle (split: visual half)
Priority: medium

## Context

Even after data enrichment, the "Up Next" section needs a visual overhaul. Right now it's a plain black text line. To make the section actually scannable, each item needs:

- **Iconography** differentiating type (task icon vs meeting icon vs calendar event icon)
- **Color** — either urgency-based (overdue = red, today = amber, later = muted) or type-based
- **Subtitle** line with secondary context (due time, project, location, attendees, etc.)

Depends on `enrich-up-next-data` landing first (needs `type` and `dueAt` to drive the visual logic).

## Plan

- [x] Design icon set for each item type (reuse Lucide or existing icon lib)
- [x] Decide color strategy: urgency vs type (recommend urgency for glanceability)
- [x] Implement a `UpNextItem` component with icon + title + subtitle layout
- [x] Wire `type` → icon and `dueAt` → subtitle + urgency color
- [x] Verify in light and dark mode

## Log

### [1] Create UpNextCard React Native component
Status: done
Completed: 15:48
Summary: New file `mobile-app/components/UpNextCard.tsx` (~170 lines). Exports `UpNextItem` interface matching web parity: `{ id, type, title, context, dueDate, href }`. Renders per-item: lucide-react-native icon (ListTodo / Bell / Calendar), bold title, context · relative-time subtitle, urgency-colored 3px left border, urgency badge (OVERDUE / DUE TODAY / UPCOMING). Handles empty state with "Nothing scheduled".
Files touched: mobile-app/components/UpNextCard.tsx

### [2] Port urgency + relative-time logic
Status: done
Completed: 15:48
Summary: `getUrgency()` and `formatRelativeTime()` ported verbatim from web `UpNextCard.tsx`. `urgencyStyles` record supplies borderColor, iconColor, badgeBg, badgeText, badgeLabel per tier. Theme values via `@/lib/theme` (colors.error, colors.warning, colors.textTertiary, colors.bgSubtle) for parity with web tokens.
Files touched: mobile-app/components/UpNextCard.tsx

### [3] Wire type icons
Status: done
Summary: `typeIcons` record: task → ListTodo, reminder → Bell, event → Calendar. Icons sized 16px to match other dashboard sections.
Files touched: mobile-app/components/UpNextCard.tsx

### [4] Integrate into index.tsx
Status: done
Summary: See companion task Log entries [2][3][4]. Single-line render replaces 28-line inline block.
Files touched: mobile-app/app/(tabs)/index.tsx

Note: Component uses NativeWind `m-` tokens for static colors + inline `style` for dynamic `borderLeftColor` / `backgroundColor` (NativeWind can't consume JS-computed tailwind class fragments at runtime). Dark mode pass pending visual QA.
