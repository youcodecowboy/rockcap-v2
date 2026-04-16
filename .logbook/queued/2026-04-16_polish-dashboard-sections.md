# Polish dashboard sections — daily brief and task summary

Created: 2026-04-16 14:55
Status: queued
Tags: #frontend #ux #dashboard #styling
Source:
  - 2026-04-16 — daily brief section on dashboard could also use better styling
  - 2026-04-16 — home dash top section with task summary could use some seperation/styling as well, all black and plain text, not as nice
Priority: low

## Context

Two home-dashboard sections (**daily brief** and **task summary**) currently render as flat, all-black plain text with no visual separation. Needs a cohesive styling pass to establish hierarchy without restructuring content.

Grouped together because both are pure visual treatment on adjacent home-dashboard sections — same file(s) likely, same PR.

## Plan

- [ ] Audit current markup + styles for both sections
- [ ] Define a shared "dashboard section" visual pattern (separation, padding, heading weight, body color)
- [ ] Apply to daily brief
- [ ] Apply to task summary
- [ ] Verify across breakpoints and both color modes

## Log

