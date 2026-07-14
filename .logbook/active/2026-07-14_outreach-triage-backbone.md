# Outreach triage backbone (Claude-Code-driven prospecting)

**Started:** 2026-07-14
**Branch:** knowledge-cutover (model-testing-app) + RockCap-MCP main
**Context:** Prospecting audit (2026-07-14 session) found: no cross-prospect view of open
actions, cadences stall silently (intelHold / needs_contact / 3-strike / paused) with zero
surface, approvals split across two mechanisms, replies dead-end unrouted. Decision:
Claude Code is the action surface, web app is the glass. Build the shared read-model +
MCP tools first, then /outreach skill + stage-folder session digest hook.

## Plan

### Phase 1 — read-model + MCP tools (model-testing-app)
- [x] `convex/outreachTriage.ts` — `triageQueue` query (pending packages, needs_contact,
      pending approvals split reply-drafts/other, failed sends, unrouted + dead-end replies,
      stalled cadences: intel-hold / auto-deactivated / paused, needs-action + stale-intel clients)
- [x] `convex/outreachTriage.ts` — `listUpcoming` query (next-N-days sends with per-touch
      fire-status: scheduled / due-now / blocked_pending_package / paused / no_contact_email)
- [x] `convex/approvals.ts` — `approveBatchInternal` (per-item results, no-op-safe)
- [x] `convex/cadences.ts` — `approvePackageBatchInternal` (single dispatcher kick at end)
- [x] `convex/mcp.ts` — register `outreach.triageQueue`, `cadence.listUpcoming`,
      `approval.approveBatch`, `cadence.approvePackageBatch`
- [x] `src/app/api/triage-digest/route.ts` — GET, bearer TRIAGE_DIGEST_KEY, compact digest
      for the session-start hook; add to middleware public list
- [x] Update `skills/CATALOGUE.md` (same-commit rule)

### Phase 2 — operator surface (RockCap-MCP repo)
- [x] `skills/outreach-triage/SKILL.md` + `.claude/commands/outreach.md` (/outreach)
- [x] `tools/hook-session-start.sh` — stage-folder detection + digest curl (graceful skip)
- [x] `prospecting/CLAUDE.md` — digest interpretation + /outreach section
- [x] `CATALOGUE.md` + `tools-manifest.json` — 4 new tools
- [x] `skills/README.md` status table

### Wrap-up
- [x] `npx next build` in model-testing-app; fix errors
- [x] Commit + push both repos

## Log
- 2026-07-14 — audit complete (4 explore agents); plan agreed with operator; started Phase 1.
- 2026-07-14 — Phases 1+2 built. Scope grew by two tools mid-build: `approval.retry` (failed
  sends were only recoverable in the web UI) and `cadence.reactivate` (resume only cleared
  pauseUntil — intel-hold / 3-strike deactivated rows were unrecoverable via MCP). 6 MCP tools
  total. tools-manifest.json was stale (135 vs 167 live) — refreshed from meta.listTools, which
  also cleared 3 pre-existing dangerous phantom refs in other skills. next build ✓, convex tsc ✓
  (6 pre-existing knowledge/* errors untouched), validate-skills ✓, audit-tool-refs ✓.
  NOT YET DONE: deploy Convex + get knowledge-cutover into production (the digest route 404s
  on prod until then) + export ROCKCAP_APP_URL / ROCKCAP_TRIAGE_KEY on operator laptops
  (hook is a silent no-op until then).
- 2026-07-14 — TRIAGE_DIGEST_KEY generated + set on Vercel (Production + Preview, encrypted,
  never printed to transcript). App URL = https://rockcap-v2.vercel.app (operator confirmed the
  custom domain is not in use). Laptop retrieval path:
  `vercel env pull` from the linked model-testing-app dir (needs Vercel team access) or share
  from the Vercel dashboard via password manager. Per-stage slash commands shipped
  (/reach-out-cold /follow-up-cold /warm-pre-meeting /warm-post-meeting /pre-qual /qualified,
  plus /outreach cwd inference) — RockCap-MCP e1dc804.

## Later phases (agreed, not started)
- Web quick wins: EmailViewer in RepliesTab, dead-end replies into triage UI, operator flags
- Web inbox + outbox panes over the same read-model
- Legacy demolition: prospectingEmails system, orphan companies/contacts/deals pages,
  cadence_fire approval type, prospectState demotion, gates doc rewrite
