# Drive Ingestion Backbone (Spec 1) + Knowledge Layer spec lock (Spec 2 Phase 0)

Created: 2026-07-06
Status: active
Tags: #drive #ingestion #knowledge-layer #graphrag
Source: specs docs/spec-1-drive-ingestion-backbone.md + docs/spec-2-knowledge-layer.md
Priority: high

## Plan

Approved plan: `~/.claude/plans/sunny-conjuring-lark.md` (recon-grounded, adversarially reviewed). Branch: `drive-ingestion`.

- [x] Phase 0 — rewrite `docs/spec-2-knowledge-layer.md` from locked 3-fork design (commit 21c023f)
- [x] Phase 1 — Drive OAuth + `googleDriveTokens` + `/settings/drive` (commit 12f71ff; Opus agent; convex codegen blocked — api.d.ts hand-synced, operator must re-auth Convex CLI)
- [x] Phase 2 — schema + `convex/driveSync.ts` poll cron + backfill + nightly reconcile (commit b2b30aa; Fable agent; lossless watermark verified; NO stored syncMode — scope = nearest mapped ancestor)
- [ ] Phase 3 — hydration pipeline: settle-window sweep, `/api/drive/ingest` (stateless, returns v4 JSON), `applyExtraction` mutation, ingestionEvents hook, side-effect parity
- [x] Phase 4a — unified-library import semantics (commit 2b3ebe6; Fable agent): mapping = scope only; import = purposeful metadata-first documents row + live link; poll gated on documentId; placement on first extraction only; trash↔soft-delete both ways
- [x] Phase 4b — unified library UI (commit f752589; Opus agent): Drive badge + iframe preview + webViewLink open, Updated=savedAt live, Import-from-Drive picker w/ dry-run confirm, sidebar wider+collapse rail, prospects filtered from Docs sidebar (clients.list no-default-filter bug), /settings/drive mapping tree + stats + errors, DriveReconnectBanner
- [x] Phase 5 — MCP tools: 7 drive.* read/import tools + both CATALOGUEs (commit 69c6899 + RockCap-MCP e2cce43 on docs/prospect-import branch)
- [x] Phase 6 — write-back: drive_write REAL executor + kill-switch + 3 MCP write tools (commit 3973f42 + RockCap-MCP e1807bc)

## Build complete 2026-07-06 — pushed to origin/drive-ingestion; final `npx next build` passes.
Remaining before live E2E (operator): (1) `npx convex login` / `npx convex dev --once` — CLI lost project auth; schema + functions NOT pushed to the live deployment yet, generated types were hand-synced; (2) Google Cloud: Internal OAuth client for Drive, enable Drive API, redirect URIs local+prod, DRIVE_CLIENT_ID/SECRET/OAUTH_REDIRECT_URI into .env.local + Vercel + Convex env; (3) confirm NEXT_APP_URL + CRON_SECRET in Convex env (hydration callback); (4) connect app@rockcap.uk at /settings/drive → set root folder (ROCKCAP Historic Drive) → Run initial sync → map a test client folder → import a few files → verify E2E per plan.

Every phase: `npx next build` from model-testing-app/ + commit. Schema additive-only (Convex dev IS prod).

## Progress

- 2026-07-06 — Plan approved after 3-agent recon + Fable adversarial review (1 blocker fixed: /api/drive/ingest data-flow inversion) + 3-agent Spec 2 design session (schema core / graph semantics / signal quality) with 2 reconciliations (canonical atom + observations table; layered contradiction resolution).
- 2026-07-06 — Phases 0–2 committed on `drive-ingestion` (21c023f, 12f71ff, b2b30aa). Phase 3 (hydration) in flight.
- BLOCKED (operator): Convex CLI lost project auth — `npx convex codegen` fails; generated types hand-synced; schema/functions NOT yet pushed live. Fix: `npx convex login` or `npx convex dev --once`, then real codegen.
- TODO (operator): Google Cloud console — new Internal OAuth client for Drive, enable Drive API, redirect URIs (localhost + prod), fill DRIVE_CLIENT_ID/SECRET/OAUTH_REDIRECT_URI in .env.local + Vercel + Convex env. Also confirm NEXT_APP_URL + CRON_SECRET are set in Convex env (hydration route callback needs them).
