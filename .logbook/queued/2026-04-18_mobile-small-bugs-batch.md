# Mobile small bugs batch (daily-brief count, LinkContactModal bg, add-to-tabs, Share attach)

Created: 2026-04-18
Status: queued
Tags: #bug #mobile
Source:
  - - 2026-04-18 — [bug] mobile app main dashboard — the Daily Brief CARD shows "50 open flags" but clicking through reveals only 3 — suspect hard-coded list cap (flags.getMyFlags returns 50) being treated as the true count; should use a count query, not the limited list length
  - - 2026-04-18 — [bug] mobile LinkContactModal has no solid background colour — content is see-through over the client profile underneath, making the modal UI unreadable; add an opaque bg-m-bg panel (the DealDetailSheet + ContactDetailModal pattern) inside the SafeAreaView
  - - 2026-04-18 — [bug] mobile "add to tabs" feature does nothing — tapping to add a client/page to the bottom tab bar doesn't surface a tab afterwards; investigate TabManager (mobile-app/components/TabManager.tsx) + the pin/tab state flow
  - - 2026-04-18 — [bug] doc preview "Share" button doesn't attach the doc to a message — expected: open a new message in the inbox/messaging side with the doc pre-attached; currently does not
Priority: medium

## Notes

