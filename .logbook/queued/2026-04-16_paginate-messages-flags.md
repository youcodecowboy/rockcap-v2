# Paginate messages and flags list (cap at 5 most recent)

Created: 2026-04-16 14:55
Status: queued
Tags: #frontend #ux #pagination #debt
Source:
  - 2026-04-16 — Also seems like messages and flags missing pagination, long list right now and needs to cap at maybe 5 most recent only
Priority: medium

## Context

The messages/flags list currently renders every item, so the section grows unboundedly. Cap at 5 most recent (sorted by timestamp descending) with a "show more" affordance or dedicated pagination control to reach older items.

## Plan

- [ ] Locate the messages + flags list component(s)
- [ ] Sort by timestamp descending, slice to 5
- [ ] Add "Show more" CTA (or proper pagination if the full list is large)
- [ ] Handle empty state (< 5 items or zero) cleanly
- [ ] Confirm the cap doesn't break search/filter flows if those exist

## Log

