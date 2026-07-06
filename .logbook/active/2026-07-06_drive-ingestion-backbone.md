# Drive Ingestion Backbone (Spec 1) + Knowledge Layer spec lock (Spec 2 Phase 0)

Created: 2026-07-06
Status: active
Tags: #drive #ingestion #knowledge-layer #graphrag
Source: specs docs/spec-1-drive-ingestion-backbone.md + docs/spec-2-knowledge-layer.md
Priority: high

## Plan

Approved plan: `~/.claude/plans/sunny-conjuring-lark.md` (recon-grounded, adversarially reviewed). Branch: `drive-ingestion`.

- [ ] Phase 0 — rewrite `docs/spec-2-knowledge-layer.md` from locked 3-fork design (atoms/observations/facilities/chunks/candidates, federation principle, 3 extraction gates, predicate vocabulary, MCP graph tools)
- [ ] Phase 1 — Drive OAuth + `googleDriveTokens` + `/settings/drive` (Gmail-pattern port; fix porter traps: lossless watermark, patch-on-reconnect, refresh writer in tokens module)
- [ ] Phase 2 — schema (driveFolders/driveFiles/ingestionEvents/documents fields) + `convex/driveSync.ts` poll cron + backfill + scope filter + nightly reconcile
- [ ] Phase 3 — hydration pipeline: settle-window sweep, `/api/drive/ingest` (stateless, returns v4 JSON), `applyExtraction` mutation, ingestionEvents hook, side-effect parity
- [ ] Phase 4 — UI: DriveFileList + Drive scope tab + preview iframe + folder→client mapping + reconnect banner
- [ ] Phase 5 — MCP read tools (drive.status/listFiles/getFile/mapFolderToClient) + both CATALOGUEs same commit
- [ ] Phase 6 — write-back fast-follow: `drive_write` approvals entityType + REAL executor case + kill-switch + MCP write tools

Every phase: `npx next build` from model-testing-app/ + commit. Schema additive-only (Convex dev IS prod).

## Progress

- 2026-07-06 — Plan approved after 3-agent recon + Fable adversarial review (1 blocker fixed: /api/drive/ingest data-flow inversion) + 3-agent Spec 2 design session (schema core / graph semantics / signal quality) with 2 reconciliations (canonical atom + observations table; layered contradiction resolution).
