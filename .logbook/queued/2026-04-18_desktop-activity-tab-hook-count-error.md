# Desktop client profile Activity tab — fix "Rendered more hooks" runtime error

Created: 2026-04-18
Status: queued
Tags: #bug #web #frontend
Source:
  - - 2026-04-18 — [bug] Runtime error on desktop client profile Activity tab: "Rendered more hooks than during the previous render." (Next 16.0.7 / Webpack) — likely a conditional useQuery in ClientActivityTab (filter==='EMAIL' branches call different hook counts). Fix: lift both useQuery calls to always run unconditionally, gate with 'skip' instead.
Priority: high

## Notes

