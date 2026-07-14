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
- 2026-07-14 — Per-stage slash commands shipped (/reach-out-cold /follow-up-cold
  /warm-pre-meeting /warm-post-meeting /pre-qual /qualified, plus /outreach cwd inference)
  — RockCap-MCP e1dc804.
- 2026-07-14 — TRIAGE_DIGEST_KEY design REPLACED before ever going live (operator asked the
  right question: why a second credential when every laptop already has an MCP bearer token?).
  Digest moved to a Convex HTTP route GET /triage-digest (convex/triageDigestHttp.ts, wired in
  http.ts) authenticated by the SAME per-user mcpTokens as /mcp; the hook derives URL + token
  from .mcp.json — ZERO per-machine setup, colleague onboarding = clone repo, nothing else.
  Deleted: /api/triage-digest Next route + middleware entry, tools/setup-triage-env.sh.
  CLEANUP TODO: two orphaned TRIAGE_DIGEST_KEY env vars (Production/Preview) remain on Vercel —
  inert, delete via dashboard (CLI env rm + raw API both fail on this machine: stale project
  link / 403 with the CLI token — multi-account quirk, also why operator's env pull failed).
  PRE-EXISTING WART noted: .mcp.json commits a literal fallback bearer token to the repo.
- 2026-07-14 — LIVE. Convex deployed to incredible-kudu-562 (--typecheck=disable, the standing
  workaround for the 6 pre-existing knowledge/* TS errors). /triage-digest verified: 200 with
  MCP token, 401 without. First real read: 56 pending packages, 50+ unrouted replies, 50+
  dead-end replies, 3 failed sends, 63 touches due in 7 days — ALL 63 blocked (the reported
  "cadences not firing" symptom, now measurable). PR #96 opened (knowledge-cutover → main).
  Next session: run /outreach and work that backlog down.
- 2026-07-14 — Backlog-reset build (operator reported colleague has been sending manually via a
  generic Gmail MCP → system state stale; bulk-approving the 56 packages would DOUBLE-EMAIL).
  4 zero-out primitives: reply.resolveBatch (resolvedAt/By/note on replyEvents, filtered out of
  listUnrouted/countUnrouted/triageQueue/digest), cadence.denyPackageBatch, approval.rejectBatch,
  client.dismissNeedsActionFlag (MCP over existing internal). App side: "Mark handled" button +
  "handled by <user> · date" pill on RepliesTab (multi-operator attribution; resolvedByName joined
  in replyEvents.listByClient; public replyEvents.resolve mutation). Skill: "Operator hand-holding"
  contract (non-technical colleague — plain English, no jargon/JSON, one decision at a time, yes
  means X before asking, skip always offered) + "Backlog reset" mode (/outreach reset): golden rule
  NOTHING SENDS during reset; reconcile packages against Gmail sent-mail where a Gmail MCP is
  available; deny/resolve/park to zero; going-forward rules to prevent rebuild. Deployed + pushed.
  177 tools. Colleague onboarding suggestion recorded: connect his Gmail at /settings/gmail +
  mint his own MCP token at /settings/mcp-token (ROCKCAP_MCP_TOKEN env) for attribution.
- 2026-07-14 — Reconciliation WRITE side (operator: "reconciliation must look through his sent
  and mark it off; if touch 1 was sent it should queue the rest of the cadence back up").
  cadence.adoptManualSend = the autofit: touch 1 marked fired-externally at the real Gmail date
  (isActive false, lastResult 'sent' — never re-sends), unfired T2-4 refit onto preset offsets
  from that date (past dates pushed fwd: ≥2d out, ≥2d apart), touchpoint logged (idempotent on
  gmailMessageId), lastOutreachSendAt + markOutreachInFlight. Approval status preserved — pending
  still gates; already-approved auto-sends on new dates (skill must warn). touchpoint.logManualSend
  = batch backfill (≤50) for manual sends with no package to continue. Reset step 2 rewritten
  evidence-driven: Gmail Sent search per contact → adopt / deny+log / park. 179 tools. Deployed.

## Alex's slash-command pack (docs/00-04 in RockCap-MCP) — responded
- 2026-07-14 — Alex delivered draft specs for numbered action commands (/cold-reachout N etc.)
  + triage renames. Our response + phased plan written back as docs/05-response-and-build-plan.md
  (RockCap-MCP main). Phase 0 decisions pending with Alex: D1 ladder home (proposal: HubSpot keeps
  fine ladders, mirror-read now, approval-gated write-back Phase 3), D2 template canon, D3 cadence
  numbers, D4 backcheck build, D5 Rayn hand-off contract. Corrections sent: HubSpot state push is
  a stub; backcheck skill doesn't exist; dedupe must be explicit. Build waits on Phase 0.

## Later phases (agreed, not started)
- Web quick wins: EmailViewer in RepliesTab, dead-end replies into triage UI, operator flags
- Web inbox + outbox panes over the same read-model
- Legacy demolition: prospectingEmails system, orphan companies/contacts/deals pages,
  cadence_fire approval type, prospectState demotion, gates doc rewrite
