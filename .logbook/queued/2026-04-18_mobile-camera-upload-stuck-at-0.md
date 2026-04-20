# Mobile camera upload stuck at 0% — photos never process

Created: 2026-04-18
Status: queued
Tags: #bug #mobile #perf
Source:
  - - 2026-04-18 — [bug] camera upload (mobile) stuck at 0% — photos taken via the camera remain in the queued state, never move through processing; suspect the bulk-upload process route isn't being kicked off (or the job is stalling). Investigate src/app/api/mobile/bulk-upload/process + mobile-app/app/upload flow.
Priority: high

## Notes

