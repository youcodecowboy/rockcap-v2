# Mobile notes broken — can't save AND can't type (merged)

Created: 2026-04-18
Status: queued
Tags: #bug #mobile #data
Source:
  - - 2026-04-18 — [bug] mobile app errors trying to save/create notes — Convex error suspected auth-related (possibly stale/expired Clerk session local to mobile); investigate ConvexProvider + Clerk token refresh on mobile, and check if notes.create runs requireAuth
  - - 2026-04-18 — [bug] mobile app: cannot type in the main notes body/editor area — keyboard may dismiss instantly or input is disabled; likely related to the preceding Convex/notes-save autosave failure (autosave mutation erroring → editor forcing read-only?)
Priority: high

## Notes

