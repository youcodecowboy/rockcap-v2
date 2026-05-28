# RockCap Build Backlog

This is the master backlog for the work the audit identified plus the explicit additions confirmed in the design conversation: real Fireflies API integration, Gmail integration, schema extensions for the missing target entities, V3 pipeline retirement onto V4 Claude-only, and the skills tree.

Source documents:
- `skills/inventory/` (the audit). Per-workstream "inputs" reference the relevant inventory doc.
- The project brief in the initial conversation.

## Non-negotiables (read first, every commit)

These are the safety practices that apply to every item in this backlog. They are not optional.

1. **Schema changes are additive only.** New tables, new optional fields, new indexes. No required-field additions to existing rows without a backfill plan. No field renames, no data type changes without an explicit migration + rollback procedure in the PR description.
2. **Convex migrations run in a preview deployment first.** Production schema mutations are gated on a manual approval after preview verification. The migration must be idempotent and rerunnable.
3. **Environment variables are never committed.** Every new env var is added to `docs/ENV_VARS.md` (the canonical list) with purpose and sensitivity grade. Secrets stay in Vercel / Convex env config, never in git.
4. **`.claude/settings.json`, `.claude/settings.local.json`, and `CLAUDE.md` are not auto-edited.** They are durable user intent. They change only through explicit user request, never as a side effect of another task.
5. **Each item has a rollback plan.** A PR for a risky change (anything beyond pure-additive schema or pure-additive route) includes a "Rollback" section. If the rollback is "revert the commit", say so explicitly so the next operator knows.
6. **No new integration ships without a kill switch.** Fireflies and Gmail sync each get an enable/disable flag stored on the user's row or in a settings table, the same shape `hubspotSyncConfig.isRecurringSyncEnabled` uses today. Default off.
7. **Tool name changes are deprecation, not rename.** If a 150-tool audit produces a better name, the new name is added, the old name stays as an alias for at least one release. No silent breakage of the chat assistant's tool calls.
8. **V3 retirement is coverage-gated.** A V3 route is deleted only after: V4 equivalent exists, every caller migrated, zero traffic for seven days verified in logs.

## Status snapshot (as of 2026-05-28)

**Completed**: 52 backlog items shipped across foundations, schema, integrations (substrate + UI), the MCP server, and skills.
**In progress / planned**: 32 items remain, dominated by WS-2 V3 retirement and WS-7 tool description audit; the remaining WS-5 work is the `document.extract` / `template.populate` primitives.
**Deferred**: 5 items explicitly held (Person/Role tables, CI gating, Fireflies webhook, LenderProfile staticLayer refactor).

### What's actually done by workstream

| Workstream | Done / Total | Headline |
|---|---|---|
| WS-0 Foundations | 6 / 7 | Root README, CONTRIBUTING, ENV_VARS, SCHEMA_MIGRATIONS, INTEGRATION_PATTERNS, pre-commit hook. CI gating deferred until CI exists. |
| WS-1 Schema | 8 / 11 | 5 new tables + InformationRequest extension + predecessorProjectId. Person/Role two-step deferred. |
| WS-2 V3 retirement | 1 / 16 | Coverage matrix authored. All migrations and deletions still ahead. Three new V4-build items added (BL-2.0a/b/c). |
| WS-3 Fireflies | 7 / 10 | Token-paste connect end-to-end + sync action + cron. Backfill, pattern-detector delete, webhook still ahead. |
| WS-4 Gmail | 7 / 10 | OAuth + token storage + settings UI + send wrapper with three-switch gate + Touchpoint table. Read sync, Pub/Sub webhook, cron still ahead. |
| WS-5 MCP + primitives | 5 / 9 | MCP server live (Convex HTTP actions, 79 tools, per-user token auth + `/settings/mcp-token` mint/revoke UI). `*.getDeepContext` composers ship the coarse-grained primitive. Remaining: `document.extract` + `template.populate` primitives; full tool exposure (79 of 150 atomic tools); cadence cron. |
| WS-6 Skills | 22 / 23 | CONVENTIONS, SETUP, 14 SKILL.md, 18 sub-skill .md, 4 shared references, scaffolding for corpora and templates. E2E testing deferred until MCP server lives. |
| WS-7 Tool description audit | 0 / 7 | Not started; sequenced after WS-1.0 (done) and WS-1.2 (deferred). |
| WS-8 Post-MVP | 0 / 5 | All deferred by design. |

### Most consequential items still ahead

1. **BL-2.0a/b/c new V4 routes**: gates the V3 retirement chain.
2. **BL-5.5 `document.extract`** and **BL-5.6 `template.populate`**: the remaining cross-cutting MCP primitives; used by deal-intake and terms-package-build.
3. **BL-1.2 Person table**: deferred but blocks BL-1.3 (Role) and any meaningful BDM-mobility tracking.
4. **BL-3.8 Fireflies backfill** and **BL-4.3 Gmail read sync**: unlock real touchpoint flow from both integrations.
5. **Hardening the next skill skeletons**: terms-package-build (step 8) is first on the critical path after the live set.

## Phase plan

Four phases. Phase C's headline item (the MCP server, BL-5.1) has shipped, along with per-user token auth (BL-5.2) and the token-issuance UI (BL-5.9); the remaining Phase C work is the `document.extract` / `template.populate` primitives and the WS-7 tool audit. Phase D skills are now executable against the live server (6 of 16 hardened).

| Phase | Window | Workstreams | Status |
|---|---|---|---|
| **A. Foundations and architecture decisions** | weeks 1-2 | WS-0, BL-1.0, BL-2.0, BL-3.0, BL-4.0 | **complete** |
| **B. Additive build-out** | weeks 2-6 | WS-1, WS-3, WS-4, WS-2 caller migrations | **schema mostly complete; integration substrate complete; V3 retirement not started** |
| **C. Skills substrate** | weeks 6-8 | WS-5 (MCP + primitives), WS-7 (tool audit) | **MCP server + per-user token auth + token-issuance UI + `getDeepContext` composers shipped; `document.extract` / `template.populate` primitives + WS-7 tool audit remain** |
| **D. First skills + V3 cleanup** | weeks 8-12 | WS-6 first skills, WS-2 deletions after coverage proof | **WS-6 content authored ahead of schedule; WS-2 deletions await retirement chain** |

## Cross-stream dependencies

```
WS-1.0 (Deal/Project naming decision) ✓
   ├─> WS-1.1..1.9 (schema extensions) ✓ mostly
   └─> WS-7.2 (namespace tightening in tool audit)

WS-1.5 (InformationRequest extension) ✓
   └─> WS-6.1 (prospect-intel skill) ✓

WS-1.6 (Milestone table) ✓
   └─> WS-5.4 (deal.get_full_context primitive)

WS-1.7 (Cadence table) ✓
   └─> WS-5.8 (Cadence scheduling engine)

WS-1.9 (Approval table) ✓
   ├─> WS-4.4 (Gmail send approval) ✓
   └─> WS-5.7 (Approval queue UI surface) ✓

WS-5.1 (MCP server)
   └─> all of WS-6 actually runnable

WS-2.0 (V4 coverage audit) ✓
   └─> WS-2.0a/b/c (new V4 routes)
            └─> WS-2.1..2.11 (per-route migrations)
                     └─> WS-2.12..2.16 (route deletions, sdk removal)

WS-3.x (Fireflies API) ✓ partial
   └─> WS-3.8 (delete pattern detector) only after stable
```

## Status legend

| Marker | Meaning |
|---|---|
| ✓ | Completed and committed |
| ◐ | Partial; some components shipped, more to do |
| ⏸ | Deferred; held by an explicit decision |
| (blank) | Planned; not started |

## Workstreams and items

### WS-0: Foundations and discipline

Inputs: `skills/inventory/06-monorepo-discipline.md`.

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-0.1 | Add root `README.md` linking to `model-testing-app/README.md` and `skills/README.md` | low | S | Done in Phase A foundations commit. |
| ✓ | BL-0.2 | Adopt `[app]` / `[skills]` / `[both]` commit prefix convention | low | S | Documented in `docs/CONTRIBUTING.md`. All commits since adoption follow. |
| ✓ | BL-0.3 | Add `docs/ENV_VARS.md` canonical list, with sensitivity grade per var | low | S | Three grades: public, secret, critical. Includes exposure-handling procedure. |
| ✓ | BL-0.4 | Pre-commit guard for the skills/ boundary and env files | low | S | `.githooks/pre-commit` installed via `git config core.hooksPath .githooks`. |
| | BL-0.5 | Path-based CI: when CI is wired, app pipelines skip on pure-skills commits and vice versa | low | M | Deferred until CI exists. |
| ✓ | BL-0.6 | Schema migration rollback playbook (`docs/SCHEMA_MIGRATIONS.md`) | low | S | Five migration shapes documented. |
| ✓ | BL-0.7 | Kill-switch pattern doc | low | S | Captured in `docs/INTEGRATION_PATTERNS.md`. |

### WS-1: Schema extensions

Inputs: `skills/inventory/02-convex-schema.md` (gap analysis section).

#### Architectural decision

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-1.0 | Decide Deal vs Project naming | high | M | ADR-0001: keep both. `projects` is the operational Deal; `deals` stays as HubSpot projection. |

#### Schema additions

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-1.1 | Add `predecessorProjectId` to `projects` | low | S | Field + `by_predecessor` index. |
| ⏸ | BL-1.2 | Add `Person` table (two-step promotion) | low | M | Deferred. Adds substantial migration surface; contacts table works today. |
| ⏸ | BL-1.3 | Add `Role` join table | low | M | Paired with BL-1.2. |
| ✓ | BL-1.4 | Add `lenderApproaches` table | low | M | Per-lender per-deal child of projects. Indexed by_project, by_lender, by_status, by_project_status. |
| ✓ | BL-1.5 | Extend `knowledgeChecklistItems` for graded InformationRequest | low | M | Added isBlocking, rockcapStatus, lenderStatus. Existing rows fall back to the simpler status field. |
| ✓ | BL-1.6 | Add `milestones` table | low | M | With dependency graph, chase state, chase direction, chase assignee. |
| ✓ | BL-1.7 | Add `cadences` table | low | M | Seven cadence types + custom. Indexed by_next_due for cron scanning. |
| ✓ | BL-1.8 | Add `appetiteSignals` table | low | M | Three-layer LenderProfile model. Provenance, asOfDate, isCurrent + supersededBy. |
| ✓ | BL-1.9 | Add `approvals` table | low | M | Eight entity types, seven status values, full audit trail. |
| ⏸ | BL-1.10 | Extend `clientIntelligence.lenderProfile` with explicit staticLayer | low | S | Deferred. `appetiteSignals` supersedes the live-data portion; static-layer restructuring can wait. |
| ⏸ | BL-1.11 | Person backfill from contacts | medium | M | Paired with BL-1.2. |

### WS-2: AI pipeline consolidation (V3 retirement onto V4)

Inputs: `skills/inventory/05-in-app-claude-logic.md`. Strategy: coverage-gated retirement.

#### Coverage audit

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-2.0 | V4 coverage matrix | medium | M | `docs/V4_COVERAGE_MATRIX.md`. 9 V3 routes audited; design calls resolved. |

#### New V4 builds required first (gated by the matrix)

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| | BL-2.0a | Build `/api/v4-analyze-file` single-document V4 route | medium | M | Three current callers (DirectUploadButton, AddKnowledgeEntryModal, fileQueueProcessor). |
| | BL-2.0b | Build `/api/v4-parse-requirements` or extend `/api/intelligence-extract` with target schema | medium | M | Used by knowledge-parse callers (NoteUploadModal, DynamicChecklistInput). Aligns with BL-5.5 unified extract. |
| | BL-2.0c | Build NL-to-reminder V4 coverage (extend `/api/reminders/enhance`) | low | S | One current caller (TaskNaturalLanguageInput, mode='reminder'). |

#### Per-route migrations

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ◐ | BL-2.1 | Migrate `/api/bulk-analyze` callers to V4 (`/api/v4-analyze`) | medium | M | Already done in code; verify by traffic check before delete. |
| | BL-2.2 | Migrate `/api/reanalyze-document` callers; delete | low | S | No callers found; safe to delete immediately after observation window. |
| | BL-2.3 | Migrate `/api/analyze-file` callers (after BL-2.0a) | medium | S | |
| | BL-2.4 | Convert `/api/process-intelligence-queue` to Convex scheduled internal action; drop HTTP route | medium | M | Decision locked. |
| | BL-2.5 | Migrate `/api/knowledge-parse` callers (after BL-2.0b) | low | S | |
| | BL-2.6 | Rebuild `/api/codify-extraction` on V4 (Fast Pass unchanged, Smart Pass switches to Claude) | medium | M | Six callers; preserves contracts. |
| | BL-2.7 | Delete `/api/generate-insights` | low | S | No callers found. |
| | BL-2.8 | Migrate `/api/reminders/parse` callers to V4 path (after BL-2.0c) | low | S | One caller. |
| | BL-2.9 | Migrate `/api/ai-assistant` caller in `AIAssistantBlock.tsx` to `/api/chat-assistant`; delete V3 | low | S | One caller; simple rename. |
| ✓ | BL-2.10 | Move `critic-agent` decision logic to a skill (option b) | medium | L | `skills/skills/classification-critic/SKILL.md` authored. V3 code deletion follows actual operational adoption. |
| | BL-2.11 | Decide on `/api/process-extraction-queue` (V4 migrate vs stay Convex-only) | low | S | Pure plumbing today. |

#### After 7 days zero traffic per route, then:

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| | BL-2.12 | Delete V3 route files | medium | S | One PR per route or batched. |
| | BL-2.13 | Remove `together-ai` from package.json | low | S | After every V3 route deleted. |
| | BL-2.14 | Remove `critic-agent` OpenAI HTTP call code | low | S | When the classification-critic skill is operationally proven. |
| | BL-2.15 | Remove `TOGETHER_API_KEY` and `OPENAI_API_KEY` from env config | medium | S | Coordinate with operator. |
| | BL-2.16 | Update `skills/inventory/05-in-app-claude-logic.md` to reflect V4-only state | low | S | Documentation hygiene. |

### WS-3: Fireflies API integration

Inputs: `skills/inventory/04-integrations.md`, `docs/INTEGRATIONS/fireflies-scoping.md`.

#### Scoping

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-3.0 | Fireflies API scoping document | low | S | `docs/INTEGRATIONS/fireflies-scoping.md`. Five decisions locked: token paste (no OAuth), per-user, 365-day backfill, flag-unmatched, full transcript ingestion. |

#### Build

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-3.1 | Add `firefliesTokens` table (per-user token paste model) | low | S | Plus `firefliesSyncConfig` kill-switch table and `meetingTranscripts` table. |
| ✓ | BL-3.2 | Connect-token route + Convex mutations | low | M | `POST /api/fireflies/connect-token`. Validates token against Fireflies before storing. |
| ✓ | BL-3.3 | Sync action `firefliesSync.syncForUser` (incremental, watermarked) | medium | M | Self-contained Convex internalAction. Paginates up to 1500 meetings per run. |
| ✓ | BL-3.4 | Cron entry `fireflies-auto-sync` every 30min | low | S | Self-skips when global kill-switch is off. |
| ⏸ | BL-3.5 | Webhook handler `/api/fireflies/webhook` IF Fireflies supports it | low | M | Deferred pending confirmation of webhook availability. |
| ✓ | BL-3.6 | Disconnect flow `/api/fireflies/disconnect` | low | S | Idempotent Convex mutation. |
| ✓ | BL-3.7 | Settings UI at `/settings/fireflies` | low | M | Web UI for connect, disconnect, status, sync config display. |
| | BL-3.8 | Backfill: re-source pattern-detected Fireflies meetings via API | medium | M | One-off migration. Sets reviewState='needs_review' on unmatched. |
| | BL-3.9 | Delete pattern detector code | low | S | Only after BL-3.8 complete and stability proven. |
| ✓ | BL-3.10 | Update `skills/inventory/04-integrations.md` | low | S | Documentation hygiene. |

### WS-4: Gmail integration

Inputs: `docs/INTEGRATIONS/gmail-scoping.md`, existing Google Calendar code as pattern reference.

#### Scoping

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-4.0 | Gmail scoping document | medium | M | `docs/INTEGRATIONS/gmail-scoping.md`. Five decisions locked: send+modify, all-inbound, per-user identity, thread-based attribution, separate-token from Calendar. |

#### Build

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-4.1 | Separate OAuth client with `googleGmailTokens` table | medium | M | Independent from Calendar token. Schema + tokens module + OAuth lib + auth/callback/disconnect routes. |
| ✓ | BL-4.2 | Gmail send wrapper `gmailSend.requestSend` | medium | M | Three-switch gate enforced (global config + user enable + connection healthy). Creates approval; no direct API call. |
| | BL-4.3 | Gmail read sync (label-filtered, watermarked, incremental) | medium | L | Mirrors calendar pattern. Writes touchpoints with thread-based attribution. |
| ✓ | BL-4.4 | Approval-gated send | high | M | Hard rule. `gmailSend.executeApprovedSend` runs only on approval, refreshes token, composes RFC822, sends, captures touchpoint. |
| | BL-4.5 | Webhook: Google Pub/Sub push for Gmail inbox changes | low | M | Optional but recommended for low-latency capture. |
| | BL-4.6 | Cron `gmail-auto-sync` every 5-10 minutes (webhook fallback) | low | S | |
| ✓ | BL-4.7 | Settings UI at `/settings/gmail` | low | M | Connection status, scope display, reconnect, disconnect, outbound-send three-switch UI. |
| ✓ | BL-4.8 | Disconnect flow | medium | S | Local disconnect (Google-side revoke deferred to a future hardening pass per inline TODO). |
| ✓ | BL-4.9 | Touchpoint table + helpers | low | M | Unified exchange ledger. Eight indexes including by_provider_payload for dedup. |
| ✓ | BL-4.10 | Update `skills/inventory/04-integrations.md` with Gmail entry | low | S | |

### WS-5: MCP server and cross-cutting primitives

The MCP server is the connection point between Claude Code on operator laptops and the app. Without it, no skill can call a tool.

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-5.1 | Stand up MCP server as Convex HTTP actions | medium | L | **Shipped.** Served at `incredible-kudu-562.convex.site/mcp`; 79 tools across 19 domains. No Next.js bridge. |
| ✓ | BL-5.2 | Per-user MCP auth via Clerk-issued token | high | M | **Shipped.** `mcpTokens` table; bearer stored as SHA-256 hash + display prefix; validated per request, 401 on invalid/revoked. Minted via Clerk-authed session. |
| ◐ | BL-5.3 | Tool exposure: every public tool callable via MCP | medium | M | Partial: 79 of 150 atomic tools exposed. Read tools immediate; writes stage an approval via `outreach.draft*`. |
| ✓ | BL-5.4 | `deal.get_full_context(dealId)` coarse-grained primitive | low | M | **Shipped** as per-domain `*.getDeepContext` composers (prospect/client/project/lender): each composes intelligence + checklist + cadences + meetings + docs + touchpoints + approvals in one call. |
| | BL-5.5 | `document.extract(targetSchema, sourceDocumentRef)` primitive | medium | L | Unifies V4 deep extract, intelligence extract, meeting extract, term-sheet extract. |
| | BL-5.6 | `template.populate(templateRef, dataObject) → fileStorageId` primitive | medium | L | Generalises the Excel engine to XLSX, DOCX, PDF forms. |
| ✓ | BL-5.7 | Approval queue UI surface (web) | medium | L | `/approvals` page with status tabs, expandable cards, Gmail-specific preview, approve/reject/cancel flows. |
| ◐ | BL-5.8 | Cadence scheduling engine | medium | L | Partial: `cadence.*` tool surface live + cadence-fire runtime contract defined (v1.1, pre-drafted touches). Autonomous cron dispatch unverified. |
| ✓ | BL-5.9 | Per-user MCP token issuance flow | high | M | **Shipped.** `/settings/mcp-token` page; mint, rotate, revoke; tokens stored hashed. |

### WS-6: First skills

Inputs: WS-5.1 (MCP server) for runtime; WS-1.5 (graded checklist) ✓ for prospect-intel.

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| ✓ | BL-6.0 | Author `skills/CONVENTIONS.md` | low | S | Voice rules, output shape rules, file structure, tool invocation, error handling, anti-patterns. |
| ✓ | BL-6.1 | Author `prospect-intel` SKILL.md plus references | medium | L | SKILL.md + three references (lender-dna-from-charges, bridging-vs-developer, template-mapped-reachout). |
| | BL-6.2 | End-to-end test prospect-intel against three real prospects | low | M | Awaits MCP server. |
| ✓ | BL-6.3 | Author `qualify-and-draft` SKILL.md | medium | L | Step 2. Pairs with Gmail send wrapper. |
| ✓ | BL-6.4 | Author `cadence-fire` SKILL.md | medium | L | Consumer for the cadence engine. All seven cadence types. |
| ✓ | BL-6.5 | Author `classification-critic` SKILL.md (lift V3 critic decision logic) | medium | M | Includes migration plan from `src/lib/agents/critic-agent/`. |
| ✓ | BL-6.6 | Scaffolding for `sub-skills/`, `corpora/`, `templates/`, `shared-references/` | low | S | Plus initial sub-skills authored. |
| ✓ | BL-6.7 | Author `skills/SETUP.md` operator onboarding | low | S | Clone, configure Claude Code, mint MCP token, test, troubleshoot. |
| ✓ | BL-6.8 | Skills repo distribution mechanics | low | S | In `skills/README.md` + SETUP. |

#### Additional skills authored (out of original sequence; closes the 15-step lifecycle coverage)

| Status | ID | Item | Notes |
|---|---|---|---|
| ✓ | BL-6.9 | `meeting-prep` SKILL.md (step 5 pre-call) | Loads relationship snapshot, active context, suggested talking points. |
| ✓ | BL-6.10 | `meeting-capture` SKILL.md (step 5 post-call) | Reads Fireflies transcript or pasted notes; extracts actions, decisions, intelligence. |
| ✓ | BL-6.11 | `deal-intake` SKILL.md (step 7) | Spins up a project, populates underwriting model, files inbound docs. |
| ✓ | BL-6.12 | `terms-package-build` SKILL.md (step 8) | Produces client-facing indicative terms + lender submission pack. |
| ✓ | BL-6.13 | `terms-comparison` SKILL.md (step 9) | Normalises heterogeneous term sheets; runs sensitivities; drafts recommendation. |
| ✓ | BL-6.14 | `client-decision-capture` SKILL.md (step 10) | Four decision kinds (selected, loop_back, pause, dropped). Advances state. |
| ✓ | BL-6.15 | `ic-paper-drafter` SKILL.md (step 11) | Composes IC paper from full deal context. |
| ✓ | BL-6.16 | `info-request-grader` SKILL.md (step 11) | Ingests lender info-request lists; grades each item. |
| ✓ | BL-6.17 | `deal-triage` SKILL.md (step 12) | Daily sweep of active deals. Eight triage rules. |
| ✓ | BL-6.18 | `case-study-author` SKILL.md (step 13) | On deal close. Assembles timeline, extracts learnings, seeds precedent library. |
| ✓ | BL-6.19 | `monitoring-watcher` SKILL.md (step 14) | Variance analysis against underwriting baseline. Internal and client-facing outputs. |
| ✓ | BL-6.20 | `lender-intel` SKILL.md (parallel) | Three modes: capture, matching, behavioural recompute. |

#### Sub-skills (reusable primitives across SKILL.md files)

| Status | ID | Item | Notes |
|---|---|---|---|
| ✓ | BL-6.21 | Eighteen sub-skills authored | resolve-company, resolve-contact, attribute-touchpoint, dedupe-meeting, address-normalizer, extract-term-sheet, extract-appraisal-figures, extract-action-items, extract-monitoring-variance, compose-approval, populate-template, match-register, score-lender-match, grade-information-request, compute-deal-phase-transition, detect-intelligence-conflict, summarise-deal-context, holiday-calendar. |

#### Shared references

| Status | ID | Item | Notes |
|---|---|---|---|
| ✓ | BL-6.22 | Four shared references authored | uk-property-finance-glossary, document-checklist-canon, approval-payload-shapes, voice-cheat-sheet. |

### WS-7: Tool description audit

Inputs: `skills/inventory/01-atomic-tools.md`.

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| | BL-7.0 | Coverage check: Convex public functions not yet exposed as atomic tools | low | M | Driven by use-cases from WS-6 skills. |
| | BL-7.1 | Verb consistency pass: `searchClients` versus `getNotes` | low | M | Mechanical refactor with deprecation pattern. |
| | BL-7.2 | Namespace tightening: `deal.*`, `person.*`, `lender.*` | medium | L | Largest single change in this workstream. |
| | BL-7.3 | Description quality pass | low | M | Each tool description says when to use and when not. |
| | BL-7.4 | Parameter schema tightening | low | M | Explicit enums, tight types. |
| | BL-7.5 | `requiresConfirmation` audit | low | S | Codify the rule. |
| | BL-7.6 | Move `extractMeetingFromText`, `analyzeUploadedDocument`, `reclassify` out of the atomic catalogue | medium | M | These three sit awkwardly; skills are the right home. |

### WS-8: Operational, post-MVP

Items the brief flags but explicitly defers, or that surface post-build.

| Status | ID | Item | Risk | Size | Notes |
|---|---|---|---|---|---|
| | BL-8.1 | Full bidirectional HubSpot sync | medium | L | Brief defers; v1 is read-heavy with thin write-back. |
| | BL-8.2 | Automated event-trigger detection (Companies House charge filing sweeps) | low | M | Brief defers. |
| | BL-8.3 | Bulk skills marketplace / cross-team skill sharing | low | L | Post-split. |
| | BL-8.4 | Skill registry / discovery improvements in the chat assistant | low | M | After several skills exist. |
| | BL-8.5 | Repository split: extract `skills/` into its own repo | medium | M | Trigger conditions per `skills/inventory/06-monorepo-discipline.md`. Not urgent. |

## Confirmed decisions

These were the open questions from the first backlog draft. Locked in here so downstream items can proceed.

1. **Deal versus Project naming (BL-1.0): keep both.** `projects` is the operational "Deal" by extension; `deals` stays as the HubSpot projection.
2. **Person table promotion (BL-1.2): two-step.** Currently deferred until the contacts table proves limiting.
3. **Gmail OAuth (BL-4.1): separate from Calendar token.** Two consent screens, cleaner disconnect.
4. **Critic-agent destination (BL-2.10 / BL-6.5): lift to a skill.** Authored; V3 code deletion follows operational adoption.
5. **MCP server hosting (BL-5.1): Convex HTTP actions.** No Next.js bridge.
6. **Approval queue scope (BL-5.7): web first.** Web UI shipped; mobile is fast-follow before any cadence-driven send goes live.
7. **prospect-intel skill source (BL-6.1): built from scratch.** Three references authored.
8. **Fireflies auth model (BL-3.1): per-user API token paste.** No OAuth dance.
9. **Fireflies transcript ingestion (BL-3.5): full text into Convex file storage.** Speaker-coalesced segments captured.
10. **Gmail scope (BL-4.1): send + modify.** Modify is broader than readonly; consent screen explains scope.
11. **Gmail inbound (BL-4.3): all-inbound sync.** No contact-based filter at sync time.
12. **Gmail send-from identity: per-user.** Each user sends from their own Gmail address.
13. **codify-extraction (BL-2.6): keep, rebuild on V4.** Fast Pass unchanged; Smart Pass switches to Claude.
14. **process-intelligence-queue (BL-2.4): convert to Convex scheduled action.** Drop the HTTP route.

## How to use this backlog

- Treat the workstream IDs (WS-N) and item IDs (BL-N.M) as stable references. Cite them in commit messages and PR titles.
- The Status column is the source of truth for what's done. The git history is the supporting record.
- Update this file as items ship or get re-prioritised. The "Non-negotiables" section is the only part that is intended to stay static.
- Phase windows are pace estimates at one engineer. The relative ordering matters more than the calendar.

## What to take on next

In order of leverage given the current state:

1. **BL-2.0a/b/c new V4 routes**: unblocks the V3 retirement chain.
2. **BL-5.5 `document.extract`** plus **BL-5.6 `template.populate`**: the remaining cross-cutting MCP primitives; pure backend, used by deal-intake and the terms skills.
3. **BL-3.8 Fireflies backfill** plus **BL-4.3 Gmail read sync**: unblock real touchpoint flow once you have the API credentials.
4. **Harden the next skill skeleton**: terms-package-build (step 8), first on the critical path after the live set.
5. **BL-1.2 Person table**: deferred but blocks Role + BDM-mobility tracking.
