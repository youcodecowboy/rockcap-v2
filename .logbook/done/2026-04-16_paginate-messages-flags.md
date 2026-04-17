# Paginate messages and flags list (cap at 5 most recent)

Created: 2026-04-16 14:55
Status: done
Started: 2026-04-16 19:17
Tags: #frontend #ux #pagination #debt
Source:
  - 2026-04-16 — Also seems like messages and flags missing pagination, long list right now and needs to cap at maybe 5 most recent only
Priority: medium

## Context

The messages/flags list currently renders every item, so the section grows unboundedly. Cap at 5 most recent (sorted by timestamp descending) with a "show more" affordance or dedicated pagination control to reach older items.

## Plan

- [x] Locate the messages + flags list component(s)
- [x] Sort by timestamp descending, slice to 5
- [x] Add "Show more" CTA (or proper pagination if the full list is large) — existing "View all" link routes to /inbox; FlatList there already virtualizes.
- [x] Handle empty state (< 5 items or zero) cleanly
- [x] Confirm the cap doesn't break search/filter flows if those exist — dashboard widget only; full inbox screen untouched, flag open/resolved filter preserved.

## Log

2026-04-16 19:25 — Done.
Touched: mobile-app/app/(tabs)/index.tsx.

Before: dashboard "Messages & Flags" card rendered `conversations.slice(0, 2)` then `flags.slice(0, 3)`, in separate blocks, in natural API order. This wasn't "5 most recent" — it was "2 most recent convs + 3 most recent flags, convs always on top."

After: single merged feed typed as `MessagesFlagsItem = { kind: 'conversation' | 'flag'; item; timestamp }`, sorted by `timestamp` desc (lastMessageAt / createdAt / _creationTime fallback), sliced to 5. Rendered in sorted order, so a fresh flag can now appear above a stale conversation.

Empty state: the whole card is conditionally rendered only when `recentMessagesAndFlags.length > 0`, so 0-item dashboards don't show an empty card. "View all" link still routes to /inbox for the full list (FlatList-backed and already virtualized — no further pagination work needed there).
