# Activity card UX pass (mobile) — tap-to-expand + show date

Created: 2026-04-17
Status: done
Tags: #mobile #ux #bug
Source:
  - - 2026-04-17 — activity cards need tap-to-expand so you can open and read the full note/body
  - - 2026-04-17 — activity cards show only time, no date — items from months ago are indistinguishable from today's
Priority: medium

## Notes

Shipped 2026-04-17 — commit bc47e71: new formatDateTime (today → 'HH:MM', yesterday → 'Yesterday HH:MM', else date+time). Tap-to-expand cards when bodyHtml/body > preview — strips HTML to plain text, toggles 'Read more'/'Collapse'.
