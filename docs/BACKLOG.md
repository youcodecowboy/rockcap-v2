# RockCap Build Backlog

This is the master backlog for the work the audit identified plus the explicit additions confirmed in the design conversation: real Fireflies API integration, Gmail integration, schema extensions for the missing target entities, V3 pipeline retirement onto V4 Claude-only, and the first skills (prospect-intel and beyond).

Source documents:
- `skills/inventory/` (the audit). Per-workstream "inputs" reference the relevant inventory doc.
- The project brief in the initial conversation.

## Non-negotiables (read first, every commit)

These are the safety practices that apply to every item in this backlog. They are not optional.

1. **Schema changes are additive only.** New tables, new optional fields, new indexes. No required-field additions to existing rows without a backfill plan. No field renames, no data type changes without an explicit migration + rollback procedure in the PR description.
2. **Convex migrations run in a preview deployment first.** Production schema mutations are gated on a manual approval after preview verification. The migration must be idempotent and rerunnable.
3. **Environment variables are never committed.** Every new env var is added to `skills/inventory/04-integrations.md` (the canonical list) with purpose and sensitivity grade. Secrets stay in Vercel / Convex env config, never in git.
4. **`.claude/settings.json`, `.claude/settings.local.json`, and `CLAUDE.md` are not auto-edited.** They are durable user intent. They change only through explicit user request, never as a side effect of another task.
5. **Each item has a rollback plan.** A PR for a risky change (anything beyond pure-additive schema or pure-additive route) includes a "Rollback" section. If the rollback is "revert the commit", say so explicitly so the next operator knows.
6. **No new integration ships without a kill switch.** Fireflies and Gmail sync each get an enable/disable flag stored on the user's row or in a settings table, the same shape `hubspotSyncConfig.isRecurringSyncEnabled` uses today. Default off.
7. **Tool name changes are deprecation, not rename.** If a 150-tool audit produces a better name, the new name is added, the old name stays as an alias for at least one release. No silent breakage of the chat assistant's tool calls.
8. **V3 retirement is coverage-gated.** A V3 route is deleted only after: V4 equivalent exists, every caller migrated, zero traffic for seven days verified in logs.

## Phase plan

Four phases, roughly twelve to fourteen weeks total at one engineer pace. Workstreams within a phase are parallelisable unless a dependency is called out.

| Phase | Window | Workstreams |
|---|---|---|
| **A. Foundations and architecture decisions** | weeks 1-2 | WS-0 (discipline), WS-1.0 (Deal/Project naming), WS-2.0 (V4 coverage audit), WS-3.0 + WS-4.0 (integration scoping) |
| **B. Additive build-out** | weeks 2-6 | WS-1 (schema extensions), WS-3 (Fireflies API), WS-4 (Gmail), WS-2 (V3-to-V4 caller migrations) |
| **C. Skills substrate** | weeks 6-8 | WS-5 (MCP + primitives), WS-7 (tool audit) |
| **D. First skills + V3 cleanup** | weeks 8-12 | WS-6 (prospect-intel + 2 more skills), WS-2 (V3 route deletions after coverage proof) |

Phase A is mostly decisions and audits. Phase B is the longest and is where most parallel work happens. Phases C and D are sequenced because skills cannot ship until the MCP layer and the schema extensions are in.

## Cross-stream dependencies

```
WS-1.0 (Deal/Project naming decision)
   ├─> WS-1.1..1.9 (schema extensions)
   └─> WS-7.2 (namespace tightening in tool audit)

WS-1.5 (InformationRequest extension)
   └─> WS-6.1 (prospect-intel skill needs the graded checklist)

WS-1.6 (Milestone table)
   └─> WS-5.4 (deal.get_full_context wants milestones)

WS-1.7 (Cadence table)
   └─> WS-5.8 (Cadence scheduling engine consumes it)

WS-1.9 (Approval table)
   └─> WS-4.4 (Gmail send approval), WS-5.7 (Approval queue UI surface)

WS-5.1 (MCP server)
   └─> WS-6 (every skill)

WS-2.0 (V4 coverage audit)
   └─> WS-2.1..2.11 (per-route migrations)
            └─> WS-2.12..2.15 (route deletions, sdk removal)

WS-3.x (Fireflies API)
   └─> WS-3.8 (delete pattern detector) only after stable
```

## Workstreams and items

### WS-0: Foundations and discipline

Inputs: `skills/inventory/06-monorepo-discipline.md`.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-0.1 | Add root `README.md` linking to `model-testing-app/README.md` and `skills/README.md` | low | S | Five-minute task. Documents the nested-app layout. |
| BL-0.2 | Adopt `[app]` / `[skills]` / `[both]` commit prefix convention | low | S | Document in root README. Optional commit-msg hook later. |
| BL-0.3 | Add a `docs/ENV_VARS.md` canonical list, with sensitivity grade per var | low | S | Sensitivity grades: public (NEXT_PUBLIC_*), secret (API keys), critical (CLERK_SECRET_KEY, CONVEX_DEPLOY_KEY). |
| BL-0.4 | Pre-commit guard: anything under `skills/` containing `import.*model-testing-app` or `import.*convex` or `import.*src/` fails the commit | low | S | Simple grep-based pre-commit hook. Becomes load-bearing once skills have TS content; today still worth installing. |
| BL-0.5 | Path-based CI: when CI is wired, app pipelines skip on pure-skills commits and vice versa | low | M | Deferred until CI exists. Add to .github/workflows/ when introduced. |
| BL-0.6 | Schema migration rollback playbook (`docs/SCHEMA_MIGRATIONS.md`) | low | S | One-pager: preview-first, idempotent, reversible. Referenced by every WS-1 item. |
| BL-0.7 | Document the "kill switch" pattern using `hubspotSyncConfig` as the template | low | S | Every new integration has an `is*Enabled` flag, default off. |

### WS-1: Schema extensions

Inputs: `skills/inventory/02-convex-schema.md` (gap analysis section).

#### Architectural decision first

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-1.0 | Decide Deal vs Project naming. Three options: (a) keep both, `projects` becomes the brief's "Deal" by extension; (b) rename `projects` to `deals` and `deals` to `hubspotDealProjections`; (c) keep `projects` as the operational name internally and surface as "Deal" in the UI/skills layer. | high | M | Decision document, not code. Most downstream schema work depends on this. Recommend (a) for minimum disruption: extend `projects` with the new fields, leave `deals` as the HubSpot projection. |

#### Schema additions (after BL-1.0)

All additive. All low-risk if the additive-only rule holds.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-1.1 | Add `predecessorProjectId` (optional v.id("projects")) to `projects` | low | S | Enables re-engagement on the same deal. Brief's `predecessor_deal_id`. |
| BL-1.2 | Add `Person` table OR extend `contacts` with `personId` foreign key | low | M | Two-step path: (a) introduce Person table; (b) backfill from contacts. Each contact becomes a Person with a default Role. Keep `contacts` working unchanged during transition. |
| BL-1.3 | Add `Role` join table (personId, organisationId, roleType, startDate, endDate, isActive) | low | M | Time-bounded Person↔Organisation linking. Models BDM mobility. |
| BL-1.4 | Add `LenderApproach` table (projectId, lenderClientId, approachedAt, status, indicativeTerms, finalTerms, internalScore) | low | M | Per-lender-per-deal child. Needed for terms comparison and behavioural intelligence. |
| BL-1.5 | Extend `knowledgeChecklistItems` for InformationRequest: add `priority` (required/preferred/optional), `isBlocking` (bool), `rockcapStatus` and `lenderStatus` (two-stage) | low | M | Field additions only; existing rows default to current semantics. |
| BL-1.6 | Add `Milestone` table (projectId, name, targetDate, dependencyMilestoneIds[], status, chaseState) | low | M | Brief's milestone with dependency graph. |
| BL-1.7 | Add `Cadence` table (personId, cadenceType, nextDueAt, lastFiredAt, isActive, scheduleConfig) | low | M | Foundation for the cadence engine in WS-5.8. |
| BL-1.8 | Add `AppetiteSignal` table (lenderClientId, fieldPath, value, sourceType, sourceRef, asOfDate, confidence) | low | M | Three-layer LenderProfile model: static fields on `clientIntelligence`, live appetite in `AppetiteSignal`, behavioural derived from `LenderApproach`. |
| BL-1.9 | Add `Approval` table (entityType, entityId, draftPayload, requestedBy, requestedAt, status, approvedBy, approvedAt, rejectedReason) | low | M | Cross-cutting approval queue. Consumed by WS-5.7 (UI surface) and WS-4.4 (Gmail send). |
| BL-1.10 | Extend `clientIntelligence.lenderProfile` to allow optional `staticLayer` versus referring to `AppetiteSignal` for live data | low | S | Backwards-compatible. Existing embedded data stays; new `staticLayer` field added. |
| BL-1.11 | Migration: backfill existing `contacts` to new Person rows (idempotent) | medium | M | Runs as Convex internalAction. Preview-first. |

### WS-2: AI pipeline consolidation (V3 retirement onto V4)

Inputs: `skills/inventory/05-in-app-claude-logic.md`. Strategy is coverage-gated retirement (audit first, migrate callers one route at a time, delete only after seven days of zero traffic).

#### Coverage audit first

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-2.0 | V4 coverage matrix: for each V3 route, does a V4 equivalent exist? If not, what is the V4 route to build? | medium | M | Output is a table: V3 route, current callers, V4 equivalent (existing or to-build), migration risk. Gates every other WS-2 item. |

#### Per-route migrations

Each item below: add V4 equivalent if missing, update callers, leave V3 in place. Mark route deprecated.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-2.1 | Migrate `/api/bulk-analyze` callers to V4 (`/api/v4-analyze`) | medium | M | Largest V3 surface. Bulk operations route. |
| BL-2.2 | Migrate `/api/reanalyze-document` callers to V4 (`/api/v4-deep-extract`) | medium | S | Likely thin wrapper migration. |
| BL-2.3 | Migrate `/api/analyze-file` callers to V4 | medium | S | Single-file analysis. |
| BL-2.4 | Migrate `/api/process-intelligence-queue` to V4 (`/api/intelligence-extract` or new batch endpoint) | medium | M | Background queue processor. Run V3 and V4 in parallel during cutover to compare outputs. |
| BL-2.5 | Migrate `/api/knowledge-parse` to V4 | low | S | Document requirement parsing, used during knowledge template seeding. |
| BL-2.6 | Migrate `/api/codify-extraction` to V4 (or merge into `/api/bulk-extract`) | medium | M | Financial codification. Touches financial data; verify output parity carefully. |
| BL-2.7 | Migrate `/api/generate-insights` to V4 (or merge into `/api/daily-brief/generate`) | low | S | Executive summary generation. |
| BL-2.8 | Migrate `/api/reminders/parse` to V4 (or just delete; `/api/reminders/enhance` covers most use cases) | low | S | Verify with the team whether anything still calls /parse. |
| BL-2.9 | Delete `/api/ai-assistant` (already marked deprecated in code) | low | S | Confirm zero callers, delete. |
| BL-2.10 | Move `critic-agent` logic to V4. Either: (a) port the critic to Claude Sonnet within the V4 pipeline, OR (b) extract the critic decision logic to a top-layer skill that calls V4 outputs and applies override rules. | medium | L | Carries judgement (override rules from learned corrections). Worth lifting to a skill (option b). See WS-6. |
| BL-2.11 | Decide: does `/api/process-extraction-queue` migrate to V4 or stay as Convex-only background job? | low | S | Pure plumbing today, no LLM. May not need V4 migration at all. |

#### After every route migrated, seven days zero traffic, then:

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-2.12 | Delete V3 route files | medium | S | One PR per route or one batched PR. Verify zero references first. |
| BL-2.13 | Remove `together-ai` from package.json + uninstall | low | S | Sole V3 LLM dependency for Llama 70B. |
| BL-2.14 | Remove `critic-agent` OpenAI HTTP call code (if BL-2.10 took option a, this is part of the migration; if option b, this is part of the skill build) | low | S | Removes the GPT-4o dependency. |
| BL-2.15 | Remove `TOGETHER_API_KEY` and `OPENAI_API_KEY` from env. Update `docs/ENV_VARS.md` and Vercel/Convex env config. | medium | S | Coordinate with operator. The vars stay set until the deploy that no longer references them. |
| BL-2.16 | Update `skills/inventory/05-in-app-claude-logic.md` to reflect V4-only state | low | S | Documentation hygiene. |

### WS-3: Fireflies API integration (real, replace pattern detector)

Inputs: `skills/inventory/04-integrations.md` (current Fireflies notes), Fireflies API docs.

#### Scoping first

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-3.0 | Fireflies API scoping: confirm OAuth model, available endpoints (transcripts, action items, recordings, meeting metadata), webhook availability, rate limits | low | S | Output: integration design doc. Mirrors the structure of the Google Calendar implementation where possible. |

#### Build

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-3.1 | Add `firefliesTokens` table (userId, accessToken, refreshToken, expiresAt, scope, needsReconnect) | low | S | Mirror `googleCalendarTokens`. |
| BL-3.2 | Add OAuth flow: `/api/fireflies/auth` and `/api/fireflies/callback` | low | M | Mirror `/api/google/auth` and `/api/google/callback`. |
| BL-3.3 | Add Fireflies sync action `firefliesSync.syncForUser` (incremental, watermarked) | medium | M | Pulls new transcripts since last sync. Stores in `meetings` with `sourceIntegration: 'fireflies'` + provenance. |
| BL-3.4 | Add cron entry: `fireflies-auto-sync` every 30min (or webhook-driven if available) | low | S | Mirror calendar cron. |
| BL-3.5 | Add webhook handler `/api/fireflies/webhook` IF Fireflies supports it | low | M | Skip if API does not support webhooks. |
| BL-3.6 | Disconnect flow `/api/fireflies/disconnect` | low | S | Revokes token + clears local state. |
| BL-3.7 | Settings UI: connect/disconnect Fireflies, show status, last-sync time, reconnect prompt | low | M | Web only initially; mobile can come later. |
| BL-3.8 | Backfill: re-source pattern-detected Fireflies meetings via API where possible | medium | M | One-off migration. Maps existing `meetings` rows with `sourceIntegration='fireflies'` to API-sourced records. Verify before overwriting. |
| BL-3.9 | Delete pattern detector code (`src/lib/hubspot/fireflies.ts`, related activity-sync calls) | low | S | Only after BL-3.3 stable AND BL-3.8 complete. |
| BL-3.10 | Update `skills/inventory/04-integrations.md` to reflect direct API status | low | S | |

### WS-4: Gmail integration

Inputs: existing Google Calendar implementation (`src/lib/google/oauth.ts`, `convex/googleCalendar.ts`), `skills/inventory/04-integrations.md`.

#### Scoping first

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-4.0 | Gmail scope decision: read-only, send-only, or both? Confirm OAuth scopes needed. Decide whether to extend existing Google Calendar token or hold separate tokens. Decide label-filtering strategy. | medium | M | Output: integration design doc. Sending email from skills (cadence outreach, IC chasers) likely requires send scope. Reading inbound replies for cadence state transitions requires read scope. |

#### Build

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-4.1 | OAuth extension: add Gmail scopes to existing Google OAuth flow, or set up separate `googleGmailTokens` table | medium | M | Adding scopes triggers re-consent for all currently-connected users. Plan the user-facing rollout. |
| BL-4.2 | Gmail send action `gmail.send(userId, payload)` | medium | M | Returns sent-message ID. Stores send record in `emails` table (or new `gmailSends` table). Approval-gated by default (see BL-4.4). |
| BL-4.3 | Gmail read sync: label-filtered, watermarked, incremental | medium | L | Mirrors calendar incremental sync pattern. Touchpoint capture: link inbound emails to `contacts`/`persons`/`projects` by email-address resolution. |
| BL-4.4 | Approval-gated send: all Gmail sends from skills route through the `Approval` table (BL-1.9). Direct send by users (not from skills) bypasses approval. | high | M | Hard rule, encoded in the gmail.send wrapper. Skills cannot bypass. |
| BL-4.5 | Webhook: Google Pub/Sub push for Gmail inbox changes | low | M | Optional but recommended for low-latency touchpoint capture. |
| BL-4.6 | Cron: `gmail-auto-sync` every 5-10 minutes (fallback for webhook gaps) | low | S | |
| BL-4.7 | Settings UI: Gmail connection status, scope visibility, disconnect | low | M | |
| BL-4.8 | Disconnect: revoke Gmail scope (or whole Google token if combined) | medium | S | If combined token, disconnecting Gmail disconnects calendar too. Surface this in the UI. |
| BL-4.9 | Touchpoint capture: write inbound and outbound Gmail messages to a `Touchpoint` table (new, related to `activities` but provider-agnostic) | low | M | The brief's Touchpoint entity. Activities table stays for HubSpot projection; Touchpoint is the unified ledger. |
| BL-4.10 | Update `skills/inventory/04-integrations.md` with Gmail entry | low | S | |

### WS-5: MCP server and cross-cutting primitives

The MCP server is the skills layer's connection point to the app. Without it, no skill can call a tool, so this gates WS-6.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-5.1 | Stand up MCP server inside `model-testing-app/` (Next.js route or separate Node service) | medium | L | Anthropic MCP spec. HTTPS endpoint, per-user auth, tool discovery, tool invocation. |
| BL-5.2 | Per-user MCP auth: Clerk JWT or signed token; sessions scoped to a single Clerk user | high | M | Identity proven by Clerk. The MCP server impersonates the authenticated user for Convex calls. |
| BL-5.3 | Tool exposure: every public tool in `src/lib/tools/domains/*.tools.ts` is callable via MCP | medium | M | Read tools immediate; write tools queue an `Approval` (per BL-1.9) before executing. |
| BL-5.4 | `deal.get_full_context(dealId)` coarse-grained primitive | low | M | Composes `projects.get` + `intelligence.getProjectIntelligence` + checklist + recent docs + recent touchpoints + milestones + lender approaches. One round trip. |
| BL-5.5 | `document.extract(targetSchema, sourceDocumentRef)` primitive | medium | L | Parameterised over a target schema. Unifies V4 deep extract, intelligence extract, meeting extract, term-sheet extract. Replaces five overlapping routes. |
| BL-5.6 | `template.populate(templateRef, dataObject) → fileStorageId` primitive | medium | L | Generalises the existing Excel template engine to XLSX, DOCX, PDF forms. Used by underwriting model, lender doc, IC paper, case study, lender forms. |
| BL-5.7 | Approval queue UI surface (web + mobile) reading `Approval` table | medium | L | Cross-cutting view. Approvers can see drafts from any source (skills, background jobs, Gmail sends). |
| BL-5.8 | Cadence scheduling engine: cron consumer of `Cadence` table, fires events at `nextDueAt`, dispatches per-cadence-type handler | medium | L | One scheduling engine, seven cadence types per the brief. Default 3-month re-touch, custom cadences, event-triggered nudges. |

### WS-6: First skills

Inputs: WS-5.1 (MCP server) must exist. WS-1.5 (graded checklist) preferred but not strictly required.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-6.0 | Author `skills/CONVENTIONS.md` (UK English, no em dashes, HTML hyperlinks, evidence-first, no fabrication, etc., per brief's style rules) | low | S | One-time. Becomes shared-references input for every skill. |
| BL-6.1 | Author `prospect-intel` SKILL.md + references + corpora (anonymised exemplars) | medium | L | The canonical pattern. Companies House charge-based Lender DNA analysis, bridging-vs-developer classification gate, template-mapped reachout. |
| BL-6.2 | End-to-end test prospect-intel against three real (anonymised) prospects | low | M | Operator-visible test pass. Verifies the MCP plumbing and the skill's outputs. |
| BL-6.3 | Author `qualify-and-draft` skill | medium | L | Step 2 of the deal lifecycle. Personalised first-touch outreach with gap flagging. Approval-gated send via Gmail (WS-4.4). |
| BL-6.4 | Author `cadence-fire` skill | medium | L | Reads from `Cadence` table (WS-5.8 fires the event, this skill handles each fire). 3-month re-touch, warm-parked check-ins, event-triggered nudges. |
| BL-6.5 | Move `critic-agent` decision logic from V4 pipeline to a `classification-critic` skill | medium | M | Per BL-2.10 option b. Keeps the learned-correction override logic accessible and tweakable by operators. |
| BL-6.6 | Set up `skills/sub-skills/`, `skills/corpora/`, `skills/templates/`, `skills/shared-references/` directories with placeholder structure | low | S | Scaffolding for future skills. |

### WS-7: Tool description audit

Inputs: `skills/inventory/01-atomic-tools.md`.

The catalogue is 150 tools. The audit is comparable in scope to writing two skills. Worth doing once, well, after the namespace decisions land.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-7.0 | Coverage check: which Convex public functions are not exposed as atomic tools but should be? Produce a delta list. | low | M | Driven by use-cases from WS-6 skills. Adds tools only where a skill needs one. |
| BL-7.1 | Verb consistency pass: `searchClients` versus `getNotes` patterns. Pick one verb per shape (list / search / get-one). | low | M | Mechanical refactor. Apply deprecation pattern (BL non-negotiable 7): add new name, alias old, deprecate. |
| BL-7.2 | Namespace tightening: introduce `deal.*` (post-BL-1.0), `person.*` (post-BL-1.2), `lender.*` (post-BL-1.4) | medium | L | Largest single change in this workstream. Apply deprecation pattern. |
| BL-7.3 | Description quality pass: each tool's description says when to use and when not to use | low | M | The chat assistant's tool-selection quality scales with description quality. High-leverage. |
| BL-7.4 | Parameter schema tightening: explicit enums, tight types, required-vs-optional clarity | low | M | |
| BL-7.5 | `requiresConfirmation` audit: which writes really need confirmation versus which are safe always-confirm-not-needed (e.g., `addClientUpdate`) | low | S | Document the rule. |
| BL-7.6 | Move `extractMeetingFromText`, `analyzeUploadedDocument`, `reclassify` (compose-plus-Convex-write tools) out of the atomic catalogue and into skills | medium | M | These three sit awkwardly today. Skills are the right home. |

### WS-8: Operational, post-MVP

Items the brief flags but explicitly defers, or that surface post-build. Tracked here so they do not get lost.

| ID | Item | Risk | Size | Notes |
|---|---|---|---|---|
| BL-8.1 | Full bidirectional HubSpot sync (v1 is read-heavy with thin write-back) | medium | L | Brief defers. |
| BL-8.2 | Automated event-trigger detection (Companies House charge filing sweeps to wake cadences) | low | M | Brief defers. |
| BL-8.3 | Bulk skills marketplace / cross-team skill sharing once skills repo exists | low | L | Post-split. |
| BL-8.4 | Skill registry / discovery improvements in the chat assistant | low | M | After several skills exist. |
| BL-8.5 | Repository split: extract `skills/` into its own repo via `git subtree split` | medium | M | Trigger conditions per `skills/inventory/06-monorepo-discipline.md`. Not urgent. |

## Open questions for the next design conversation

These are decisions the backlog cannot resolve. They sit in front of items that depend on them.

1. **Deal versus Project naming (BL-1.0).** Recommend keeping both: `projects` becomes the operational "Deal" by extension; `deals` stays as the HubSpot projection. Confirmation needed before BL-1.1 onwards.
2. **Person table promotion timing (BL-1.2).** Two-step is safer (add Person, backfill from contacts, keep contacts working) but doubles the work. Single-step (deprecate contacts, promote to Person+Role) is cleaner but riskier. Recommend two-step.
3. **Gmail OAuth combine versus separate (BL-4.1).** Combining with Google Calendar token means one consent screen but coupled disconnect. Separate is cleaner but means two consent screens for users. Recommend separate.
4. **Critic-agent destination (BL-2.10 / BL-6.5).** Port to V4 pipeline (stays in app, easier) versus lift to a skill (matches the brief's judgement-carrying rule, more flexible long-term). Recommend skill.
5. **MCP server hosting (BL-5.1).** Inside the Next.js app as a route, or separate Node service. Inside-the-app is simpler; separate is more scalable and isolates failure modes. Recommend in-app for v1.
6. **Approval queue scope (BL-5.7).** Just web, or web plus mobile from day one? Mobile is the brief's "every meaningful output persists across devices" rule. Recommend web first, mobile-fast-follow.
7. **prospect-intel skill source material.** The brief refers to an existing prospect-intel SKILL.md as canonical. This file is not in the repo. Either it lives elsewhere (point me to it) or BL-6.1 builds it from scratch using the brief's description.

## How to use this backlog

- Treat the workstream IDs (WS-N) and item IDs (BL-N.M) as stable references. Cite them in commit messages and PR titles.
- Items move through inbox → queued → active → done via the logbook plugin if desired. The backlog stays as the master view; logbook entries are the per-task running record.
- Update this file as decisions land. The "Non-negotiables" section is the only part that is intended to stay static.
- Phase windows are pace estimates at one engineer. Adjust to fit team capacity. The relative ordering matters more than the calendar.
