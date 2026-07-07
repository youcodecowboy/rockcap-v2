# MCP tool catalogue

The complete, canonical list of MCP tools exposed by the RockCap Convex backend (`https://incredible-kudu-562.convex.site/mcp`). 154 tools across 29 domains. Latest pass (Drive wide-net auto-import + classification identity, 2026-07-07): adds `drive.setAutoImport({driveFolderId, enabled})` — a STANDING AUTHORIZATION on a folder subtree: NEW files dropped there auto-import on the poll tick that mirrors them (metadata-first document immediately, then v4 API classification at a few cents per file). The flag inherits like the project mapping (nearest ancestor-or-self with it EXPLICITLY set wins; `enabled:false` carves a subfolder out of a flagged parent) and is inert outside a client-mapped scope. Guard rails: capped at 20 auto-imports/day per flagged folder — beyond the cap files stay mirrored but UNIMPORTED, the folder is badged (`autoImportCapHit`) in the `/settings/drive` tree and on `drive.listFolders`, and cap-skipped files do NOT retro-import the next day (they are no longer 'new' to the mirror) — run `drive.importFolder` / a harness classification wave for the remainder; atomization stays harness-lane regardless. `drive.listFolders` now also returns `effectiveAutoImport`/`isExplicitAutoImport`/`autoImportCapHit`. Same pass: CLASSIFICATION IDENTITY IS NOW IMMUTABLE — both persistence lanes (API re-extraction via `driveHydration.applyExtraction` and harness `document.applyClassification`) refresh CONTENTS only (summary/textContent/documentAnalysis/extracted figures/checksum) on an already-classified document and never overwrite a real fileTypeDetected/category ('an appraisal never stops being an appraisal; edits change contents, never identity'); `document.applyClassification` returns `identityLocked:true` when it kept the original identity, and reclassification is a future explicit operator tool (`document.reclassify` — not built yet). Prior pass (Harness classification, 2026-07-07): adds `document.extractText` + `document.applyClassification` — the split-open middle of the v4 pipeline, so bulk document classification runs through Claude Code at SUBSCRIPTION cost instead of the Haiku API. `extractText` is server-side parse only (zero LLM — pdf-parse/xlsx/mammoth via the thin `/api/knowledge/extract-text` route; for a pending Drive doc it fetches the bytes and CLAIMS the mirror row so the hydration cron doesn't race the agent), the AGENT classifies, and `applyClassification` persists with the pipeline's exact semantics: server-side deterministic filing via the placement-rules table on FIRST classification only (agents never choose folders, filed docs never move), side-effect parity (KB entry create-only, meeting-job heuristics, context-cache invalidation, ingestionEvents row) and drift-aware completion of the driveFiles row (file edited mid-classification → re-arms settling, the automatic pipeline re-extracts). Cost model: the harness lane owns bulk/onboarding classification (no API spend — the operator's subscription does the classifying); the API pipeline (driveHydration cron → `/api/drive/ingest`) remains ONLY for automatic re-processing when a Drive file changes. Fused classify+atomize procedure in the `atomize-document` skill's "Full onboarding" section. Prior pass (Knowledge Layer 2a.4, 2026-07-06): adds the graph READ side (4 tools) — `atoms.search` (full-text over atom statements; the entity-resolution entry point of a graph walk — vector+RRF hybrid arrives with 2a.2) + `graph.expandEntity` (ONE federated hop: atom edges + native structural edges synthesized live from clientRoles / contacts / group SPVs / CH officers+PSC (exact-name matches only) / facility columns; when both lanes assert the same edge the atom wins with `nativeCorroboration` noted; fan-out ranked contested→confidence→recency and truncated to `limit` with full counts) + `graph.sharedNeighbors` (intersect neighborhoods — "what connects these?") + `graph.findPaths` (bounded ≤3-hop BFS, ≤5 provenance-per-hop paths). Claude is the query planner — a hop is one call, multi-hop reasoning is a sequence of calls with pruning between hops; no retrieval router. `prospect.`/`client.getDeepContext` now returns a bounded `graph` section ({atoms: 0} for knowledge-empty clients; else atom/contested counts + top-10 federated edges + facilities). Prior pass (Knowledge Layer 2a.3, 2026-07-06): adds the `atoms.*` domain (5 tools) — the harness-lane write surface for the atomic-fact knowledge graph (Spec 2). `atoms.vocabulary` (legal predicates) → `atoms.getForSubject` (existing coverage) → `atoms.createBatch` (persist ≤100 candidates through the anchored/discriminating/material gates; READ + repair the `rejected` array) → `atoms.upsertChunks` (narrative dual index) → `atoms.supersede` / `atoms.retire` (operator hygiene). The harness lane (Claude Code + `atomize-document` skill) does bulk/backfill atomization at subscription cost; the API-lane cron handles cheap incremental re-atomization of changed docs, gated by a cost wall. Prior pass (Drive project mapping, 2026-07-06): adds `drive.mapFolderToProject` — map a Drive subfolder (inside a client-mapped subtree) to an in-app project so imports from that subtree stamp `projectId`/`projectName` and file into the PROJECT folder taxonomy instead of polluting the client library. Scope-only, exactly like the client mapping (imports/extracts nothing); the project must belong to the folder's effective client (rejected otherwise). `drive.listFolders` now also returns `effectiveProjectId`/`effectiveProjectName`/`isExplicitProjectMapping`. Onboarding order: map the client folder → map project subfolders → import per project. Prior pass (Drive write-back, 2026-07-06): adds `drive.createFolder` / `drive.moveFile` / `drive.rename` — the ONLY writes the app ever makes back to Drive (organizational: create folder / move file / rename; never file contents — Drive stays the source of truth for bytes). Each call stages a PENDING `approvals` row (entityType `drive_write`); NOTHING touches Drive until the operator approves at `/approvals`. On top of the approval sits the write-back kill switch at `/settings/drive` (default off, no row = disabled) — checked at queue time (nothing staged if off) AND re-checked at execute time (an approval whose switch was flipped off while pending lands as `execution_failed`, Drive untouched). On success the executor echoes the change into the mirror immediately, so the next poll tick's change event is an idempotent no-op. Prior pass (Drive ingestion, 2026-07-06): adds the `drive.*` domain (7 tools) — the MCP surface over the one org-wide Google Drive connection (mirrored every 2 min). `drive.status` → `drive.listFolders` / `drive.listFiles` / `drive.getFile` (read the mirror) → `drive.mapFolderToClient` (scope only — imports/extracts nothing) → `drive.importFiles` / `drive.importFolder` (the purposeful act: metadata-first `documents` row now, v4 extraction within the settle window). Folder imports **dry-run first** (a cost barrier — every imported file is later extracted through the Claude v4 pipeline); the agent presents the count and re-calls with `confirm:true` only after operator approval. Prior pass (prospecting v3 action layer, 2026-06-26): adds `intel.revalidate({clientId, companyNumber?, reason?})` — the cheap mode-2 intel-freshness diff (returns still_valid | materially_changed; full `prospect-intel` is mode 1). Also threads `revalidateResult` through `skillRun.complete` (denormalised onto `clients.lastIntelResult`). Prior pass (onboard-at-stage, 2026-06-08): adds `prospect.import` — one-call onboard of an EXISTING, manually-worked prospect directly at any pipeline stage (back-fills companies with prior outreach without the top-of-funnel `prospect-intel` assumption baked into `client.create`). Prior pass (charge sourcing, 2026-06-02): adds the `sourcing.*` domain (5 tools) — prospect candidates sourced from the Companies House mortgage/charges register (Product 199) via the new `charges-service`. Flow: `sourcing.searchLenders` (disambiguate a known lender) → `sourcing.fromLender` (the companies that lender has charged, CH-enriched + deduped vs the book) → triage via `sourcing.list` / `sourcing.setState` → `sourcing.promote` into the prospect pipeline. Candidates live in `sourcedCompanies`, NOT clients. Prior pass (knowledge surface, 2026-05-31): adds `intelligence.getKnowledgeItemsByClient` (read structured facts back) + `intelligence.updateClientIntelligence` (bulk-patch the clientIntelligence doc — prospect-intel uses it for Output #2: identity + key people + summary), and `prospect.getDeepContext` now returns `knowledgeItems` (the AI/operator facts were previously write-only, invisible to the read path). Prior pass (client context capture, 2026-05-31): adds `intelligence.appendContext` (operator running-context md) + `note.create` / `note.update` / `note.listByClient` / `note.listByProject` (the notes lane, previously unexposed) — the agent surface for the `client-context-capture` skill (operator primary-knowledge input). Prior pass (outreach gating, 2026-05-30): adds `client.markOutreachReady` / `client.clearOutreachReady` / `client.listOutreachReady` — the operator "accept → ready for outreach" gate between intel-only `prospect-intel` and the new `outreach-draft` skill (see [`skills/prospect-pipeline-gates.md`](./skills/prospect-pipeline-gates.md)). Prior pass (corporate-structure): adds structure.renderChart (render a StructureGraph to a styled ownership-only SVG + data-URI + high/med/low verdict) + companies.mapGroup (one-call group map: CH numbers + directors + appointmentsLinks — the starting point for the corporate-structure walk). Prior pass (P4 docgen): adds document.generate. Prior pass (lender-tier-conflict): adds companies.getLenderTierConflict. Prior pass (prospect-schemes): adds companies.getProspectSchemes + upsertProspectScheme. Prior pass (corporate-group charges): adds companies.getGroupCharges. Prior pass (post-v1.4 Sprint K): contact.create/update, companies.searchCompaniesHouse, companies.getOfficerAppointments.

**This document is the source of truth.** When adding or removing an MCP tool, update this file in the same commit (see `CLAUDE.md` rules). Drift between the live tool list and this catalogue silently degrades Claude Code's ability to make good tool choices.

## How to use this catalogue

You're an operator-agent (Claude Code) being asked something. The decision flow:

1. **Identify the entity scope.** Is the question about a prospect / active client / project / lender / meeting / reply / cadence / etc.? Each domain has its own root tool.
2. **Start with the deep-context tool for that domain** if available. One MCP call, comprehensive snapshot, no need for 6 round-trips.
3. **Drill in with narrower tools** only if the deep-context return doesn't have what you need.
4. **Use the action verbs** (`record`, `create`, `update`, `pause`, `snooze`, etc.) when actually changing state.

The deep-context tools are the spine:

- `prospect.getDeepContext({clientId})` — for prospects (clients with `prospectState` set)
- `client.getDeepContext({clientId})` — alias of the above; use this name when the entity is an active client
- `project.getDeepContext({projectId})` — for projects/schemes
- `lender.getDeepContext({lenderClientId})` — for lenders (clients with `type: "lender"`)

## Quick decision tree

| Operator says | Start with |
|---|---|
| "Where are we at with {prospect or client}?" | `prospect.getDeepContext` |
| "Tell me about {client name}" | `client.getDeepContext` |
| "What's outstanding on {project}?" | `project.getDeepContext` → `summary.checklistMissing` |
| "What documents do we have for {client}?" | `document.listByClient` |
| "Which lenders for this {dealType} {dealSize} deal?" | `lender.matchForDeal` |
| "Show me lender {name}" | `lender.getDeepContext` |
| "What replies came in overnight?" | `reply.listUnrouted` |
| "Draft a reply to {prospect}'s last inbound" | `outreach.draftReply` (after reading via `reply.get`) |
| "Send {prospect} an email about X" | `outreach.draftFreshEmail` |
| "Send lender {X} the brief for {project}" | `outreach.draftToLender` |
| "Prep me for the {client} call tomorrow" | (skill: meeting-prep) → reads `prospect.getDeepContext` + `meeting.get` |
| "Capture the {client} call: {pasted notes}" | (skill: meeting-capture) → uses `meeting.get` + `meeting.update` |
| "What's on my calendar today?" | `meeting.listUpcoming` |
| "Pause {prospect}'s cadence for 2 weeks" | `cadence.pause` |
| "Mark {checklist item} as received" | `checklist.updateStatus` |
| "Add {custom item} to {client}'s checklist" | `checklist.createCustomItem` |
| "Find email for {director name} at {company}" | `apollo.findEmail` |
| "Find {company name} on Companies House" | `companies.searchCompaniesHouse` |
| "Sync {CH number} from Companies House" | `companies.syncCompaniesHouse` |
| "What other companies does {director} control?" / "Map the corporate group / sibling SPVs" | `companies.getOfficerAppointments` (via the resolve-related-entities sub-skill) |
| "Which HubSpot companies need prospecting?" | `companies.listUnprocessed` |
| "Approve {approval}" / "What's pending?" | `approval.listPendingByClient` then `approval.get` |
| "Record that {lender} said X about appetite" | `lender.recordAppetite` |

## Naming conventions

**Read conventions** (some legacy inconsistency — being unified over time):
- `get` — single entity by id (`client.get`, `project.get`, `meeting.get`)
- `getDeepContext` — comprehensive snapshot of an entity + all related data (the headline read tool per domain)
- `getByClient` / `getByProject` — older list pattern (`meeting.getByClient`, `checklist.getByClient`, `touchpoint.getByClient`)
- `listByX` — newer list pattern (`reply.listByClient`, `cadence.listByPackage`, `lender.list`)
- `getCurrentForX` — current-state read (`lender.getAppetite` via getCurrentForLender)

**Write conventions:**
- `create` / `createCustomItem` — new entity
- `update` — patch existing fields
- `record` — append-only signal (used for `lender.recordAppetite`)
- Verbs for cadence state: `pause` / `resume` / `snooze` / `cancel` / `requestRevision`

**Special:**
- `setProspectFacts` — bulk-patches structured prospect fields on the clients row
- `transitionState` — moves a prospect through the 9-state machine
- `applyPresetSchedule` — bulk reschedules cadence touches by preset (Light/Moderate/Aggressive)

## Tools by domain

### `prospect.*` — Prospect workflows (2)

| Tool | Purpose |
|---|---|
| `prospect.getDeepContext({clientId})` | **HEADLINE.** Comprehensive snapshot: prospect + contacts + cadences (split active/fired/queued) + replies + intel run + meetings + CH profile + clientIntelligence + touchpoints + deals + projects + pending approvals + summary block with 22 at-a-glance counts. FIRST tool call for any prospect-scoped question. |
| `prospect.transitionState({clientId, newState})` | Move a prospect through the 9-state machine: researched / drafted / needs_revision / active / replied / engaged / promoted / parked / lost. `researched` is set by prospect-intel on completion (intel exists, no outreach drafted yet); later states are operator-driven. Side effect: schedules HubSpot push-back via existing sync. |

### `client.*` — Client workflows (alias of prospect; for active clients) (10)

| Tool | Purpose |
|---|---|
| `client.getDeepContext({clientId})` | **HEADLINE.** Alias of `prospect.getDeepContext` — same query, surfaced under `client.*` namespace for clarity when working with active clients. `summary.entityFocus` field tells you whether the entity is currently a prospect or active client. |
| `client.get({id})` | Single client by id (raw row, no aggregations). Use when you just need the contact details + don't need the deep context overhead. |
| `client.list({filters?})` | List clients with optional filters. Use sparingly — `prospect.getDeepContext` is the recommended path for any specific entity. |
| `client.create({name?, type?, status?, promoteFromCompanyId?, hubspotCompanyId?, ...})` | **Close-the-loop (2026-06-01).** Create a borrower/developer client row (defaults `type='borrower'`, `status='prospect'`) — the borrower-side counterpart to `lender.create`. Three modes: promote a Convex company (`promoteFromCompanyId`), resolve+promote a HubSpot company (`hubspotCompanyId`), or naked create (`name` only). Closes the gap where a net-new prospect could only be seeded via CLI. After create, populate via `clients.setProspectFacts` / `intelligence.*` / `contact.create`, then run prospect-intel. |
| `prospect.import({prospectState, name?, type?, promoteFromCompanyId?, companiesHouseNumber?, website?, primaryDirectorName?, dealType?, dealSizeRange?, contacts?, outreachHistoryNote?})` | **Onboard-at-stage (2026-06-08).** One-call import of an EXISTING prospect you've worked manually, landing it directly at a chosen `prospectState` (required) instead of pre-funnel. Composes create → transitionState → optional setProspectFacts → optional contacts (first = primary) → optional outreach-history note. Use to back-fill companies with prior manual outreach (e.g. "add Acme at active, emailed since Jan"); call once per company, map over a list to bulk-import. `prospectState='promoted'` also flips `clients.status='active'`; all other states keep `'prospect'`. For a genuinely net-new prospect that should start top-of-funnel, use `client.create` + prospect-intel instead. |
| `client.getStats({clientId})` | Aggregate counts for a client. Subsumed by `getDeepContext.summary`; use only if you don't need the full context. |
| `client.activate({clientId})` | **Sprint I.** Promote a prospect to active client. Atomic: patches `clients.status: "active"`, transitions `prospectState: "promoted"` (with audit fields), schedules HubSpot lifecycleStage push. Idempotent — returns `idempotent: true` if already active. The natural firing point is deal-intake: the moment a borrower's first meaningful doc batch arrives + a project is created. Distinct from `prospect.transitionState` (which only flips prospectState; doesn't touch client.status). |
| `client.markOutreachReady({clientId})` | **Outreach gate (2026-05-30).** Accept a prospect's intel and mark it ready for outreach (sets `outreachReadyAt`/`outreachReadyBy`). The gate between `prospect-intel` (intel-only) and `outreach-draft` (drafts the package). Rejects (`no_completed_intel_run`) if no completed prospect-intel run exists. Idempotent. Does NOT draft, change `prospectState`, or touch HubSpot. Normally driven by the UI accept button; use the tool only when explicitly asked. See [`skills/prospect-pipeline-gates.md`](./skills/prospect-pipeline-gates.md). |
| `client.clearOutreachReady({clientId})` | Clear the ready flag (the "unmark" action). Meaningful only pre-draft. Idempotent. |
| `client.listOutreachReady()` | List prospects that are ready for outreach but NOT yet drafted (`outreachReadyAt` set AND `prospectState` still `researched`). Exactly the pool `outreach-draft` enumerates for "draft all outreach for ready companies"; drafted prospects drop out automatically (no double-draft). |

### `clients.*` — Bulk client field patching (1)

| Tool | Purpose |
|---|---|
| `clients.setProspectFacts({clientId, companiesHouseNumber?, relatedCompaniesHouseNumbers?, website?, primaryDirectorName?, primaryContactId?, dealType?, dealSizeRange?})` | Bulk-patch the structured prospect facts on a clients row. Used by `prospect-intel` skill workflow step 10 to promote facts out of intelMarkdown text. `dealType` is the canonical deal-type code (new_development / bridging / existing_asset / unclassifiable); `dealSizeRange` is the indicative-size display string (range + confidence + basis). `relatedCompaniesHouseNumbers` is the array of corporate-group sibling-SPV CH numbers (excl. the parent) discovered by the `resolve-related-entities` sub-skill — it powers the CH-tab group-charges rollup (`companies.getGroupCharges`). |

### `project.*` — Project (scheme/deal) workflows (8)

| Tool | Purpose |
|---|---|
| `project.getDeepContext({projectId})` | **HEADLINE.** Comprehensive snapshot: project + projectIntelligence + linked clients via clientRoles (with role labels) + meetings + documents + checklist (split by status: missing/pending_review/fulfilled) + cadences + skillRuns + deals + touchpoints + pending approvals. FIRST tool call for any project-scoped question. |
| `project.get({id})` | Single project by id. |
| `project.list({clientId?, status?})` | List projects with optional client + status filters. Each project is one transaction attempt. Use when looking for active deals across the book. |
| `project.getByClient({clientId})` | All projects a client appears in (via `clientRoles` array — any role). |
| `project.listByClient({clientId})` | All projects where a client appears in any `clientRoles` entry. Use to enumerate the full project list when `client.getDeepContext` returned only project counts. |
| `project.getStats({projectId})` | Aggregate counts (subsumed by `getDeepContext.summary`). |
| `project.addLenderRole({projectId, clientId, role?})` | Idempotently attach a lender (type=lender client) to a project's clientRoles. Defaults role='lender'; supports co-lender / syndicate-lead. Refuses non-lender clients with error='not_a_lender'. Used by terms-package-build after `lender.matchForDeal` picks a shortlist. |
| `project.create({name, clientId?, clientRoles?, projectShortcode?, address?, ...})` | **Sprint I.** Create a new project (deal record). Auto-generates 10-char shortcode if not provided; auto-seeds folder structure based on primary client's type. Status defaults to 'active', country to 'United Kingdom'. Returns `{ok:true, projectId}`. Used by deal-intake when standing up a new deal from the first meaningful doc batch. |

### `lender.*` — Lender intelligence + matching + submission requirements (9)

| Tool | Purpose |
|---|---|
| `lender.getDeepContext({lenderClientId})` | **HEADLINE.** Comprehensive snapshot for a lender: identity + current appetite as fieldPath→value map + recent appetite changes (90d) + BDM contacts + linked projects (via clientRoles) + meetings + cadences + pending approvals. |
| `lender.matchForDeal({criteria, limit?})` | **THE MATCHING TOOL.** Given criteria `{dealSize, dealType, assetClass, geography, ltv, ltgdv, timelineWeeks}` (all optional individually), returns ranked lenders with per-lender matchScore + matchReasons + fitConcerns + currentSignalsCount. `dealType` accepts a prospect canonical code (`new_development`/`bridging`/`existing_asset`/`unclassifiable`) OR a lender product code — prospect codes auto-map onto the lender `products.offered` vocabulary (`new_development`→`development_finance`, `existing_asset`→`term`; `unclassifiable`→no match). Use after prospect-intel produces Recommended Approach to compose "Optimal lenders for this £X deal: A, B, C" answers. |
| `lender.list({nameQuery?, limit?})` | Filter clients by type=lender + optional name substring. |
| `lender.create({name?, promoteFromCompanyId?, hubspotCompanyId?, ...})` | **3 modes** (Sprint K): (1) `promoteFromCompanyId` (Convex id) promotes an existing companies-table row into a lender — auto-inherits metadata + links synced contacts; (2) `hubspotCompanyId` (string) when you only have the HubSpot id from `contact.hubspotCompanyIds[0]` — resolves + promotes; (3) `name` alone for naked creation when no HubSpot link exists. Most lenders are already in HubSpot via contact sync — prefer modes 1/2 when possible. |
| `lender.recordAppetite({lenderClientId, fieldPath, value, valueType, sourceType, ...})` | Write an appetite signal. Auto-supersedes prior signal at the same fieldPath. Standard fieldPaths drive matching: `dealSize.min/max`, `products.offered`, `propertyType.allowed`, `geography.regions`, `ltv.maximum`, `ltgdv.maximum`, `timeline.typicalWeeksToOffer`. See `skills/skills/lender-intel/references/appetite-signal-catalogue.md` for the full catalogue. |
| `lender.getAppetite({lenderClientId, asMap?})` | Current appetite (isCurrent=true signals). asMap=true (default) returns convenient `{fieldPath: {value, ...}}` shape. |
| `lender.getAppetiteHistory({lenderClientId, fieldPath?, limit?})` | Full appetite history including superseded. Optional fieldPath filter for single-dimension timelines. |
| `lender.setSubmissionRequirements({lenderClientId, requirementsMarkdown, sourceContext?})` | **Sprint K.** Set / update Submission Requirements doc for a lender. Wraps `document.createFromGeneration` with standard shape (clientId=lender, fileTypeDetected='Submission Requirements', category='Lender outreach', isBaseDocument=true). Creates NEW doc version each call (auto-supersede via most-recent-wins on read). Follow canon at `shared-references/lender-submission-requirements-canon.md`. |
| `lender.getSubmissionRequirements({lenderClientId})` | **Sprint K.** Fetch the most recent Submission Requirements doc for a lender. Returns `{found, content, documentId, ...}` or `{found:false}` if none exist yet. Used by terms-package-build to tailor each pack. |

### `cadence.*` — Outreach cadence flow (14)

| Tool | Purpose |
|---|---|
| `cadence.create({contactId, cadenceType, nextDueAt, scheduleConfig, isActive, packageId?, packageOrder?, preDraftedTouch?, ...})` | Create a cadence row. For prospect-intel-style packages: set `packageId` + `packageOrder` (1-4) + `preDraftedTouch`. |
| `cadence.cancel({cadenceId, reason})` | Set isActive=false with a reason. |
| `cadence.update({cadenceId, preDraftedTouch?, nextDueAt?, cadenceType?, scheduleConfig?})` | **Full edit of a cadence row (2026-06-01).** Change drafted content, the next-send date, the recurrence config (`scheduleConfig`: intervalDays / anchorDate / customSchedule), and/or the `cadenceType`. All optional. Sets `editedByOperator` audit fields. E.g. switch a quarterly follow-up to monthly, or retype it. |
| `cadence.requestRevision({packageId, revisionNote})` | Mark all cadences in a package for revision with operator note. Skill re-runs and re-drafts. |
| `cadence.approvePackage({packageId})` | **Close-the-loop (2026-06-01).** Approve a whole cadence package so the dispatcher will fire its touches. A freshly-created package is queued `packageApprovalStatus='pending'` and never fires until approved — this is that gate. |
| `cadence.denyPackage({packageId})` | Deny a package: marks every touch denied + inactive (`cancelledReason='operator_denied_package'`) so none fire. |
| `cadence.pause({cadenceId, untilDate?})` | Soft-pause via `pauseUntil` (default 14 days). Dispatcher skips while pauseUntil > now. |
| `cadence.resume({cadenceId, newNextDueAt?})` | Clear pauseUntil. Optionally reschedule nextDueAt. |
| `cadence.snooze({cadenceId, byDays})` | Push nextDueAt forward by N days. Different from pause (hard reschedule vs soft hold). |
| `cadence.get({cadenceId})` | Single cadence row. |
| `cadence.listByPackage({packageId})` | All cadences in a package (typically the 4-touch prospect package). |
| `cadence.listByClient({clientId})` | **(2026-06-01)** All cadences attached to a client. See + manage everything in flight before editing/pausing/rescheduling. |
| `cadence.listByContact({contactId})` | **(2026-06-01)** All cadences targeting a specific contact. |
| `cadence.applyPresetSchedule({packageId, preset})` | **(2026-06-01)** Reconfigure a package's timing by intensity — `light` / `moderate` / `aggressive` — rescheduling every unfired touch off touch 1's anchor (fired touches untouched). Fastest way to make a sequence more/less aggressive. |

### `outreach.*` — Email draft staging (3)

All three create `approvals` rows that surface on the Overview Pending Approvals card AND in `/approvals`. Approval execution sends the actual email (Gmail), threaded where applicable, behind the per-user + global send kill-switches. `draftToLender`'s `attachedDocumentIds` are fetched from storage and sent as real `multipart/mixed` attachments (≤18MB total; oversized/missing docs are skipped and reported in the approval's executionResult, not failed).

| Tool | Purpose |
|---|---|
| `outreach.draftReply({contactId, clientId, subject, bodyText, bodyHtml, replyToReplyEventId?, ...})` | Reply draft. Use when responding to a tracked reply event. Sets `relatedReplyEventId` so the Replies tab badge updates to "draft pending". |
| `outreach.draftFreshEmail({contactId, clientId, subject, bodyText, bodyHtml, ...})` | NEW outreach. Use when operator initiates an email outside the cadence package + outside a reply. Examples: "send Mccarthy an email asking for the appraisal". |
| `outreach.draftToLender({lenderClientId, contactId, subject, bodyText, bodyHtml, projectId?, attachedDocumentIds?, ...})` | Lender-bound email. entityType=lender_outreach. Use for indicative terms requests, BDM follow-ups, term sheet acceptance. Supports document attachments. |

### `reply.*` — Inbound reply visibility + classification (4)

> **Live ingest (2026-06-01):** Gmail inbound is now pulled automatically by the `gmail-inbound-poll` cron (every 5 min, via the `gmail.modify` read scope — no Pub/Sub topic required), so `reply.*` reflects real inbound email, not just manual paste. "Did we get anything from {client}?" → `reply.listByClient`. The poller captures Gmail thread + Message-ID on each `replyEvent`, so `outreach.draftReply({replyToReplyEventId})` now auto-threads, and approving the drafted reply (a `client_communication` / `kind:email_reply` approval) actually sends + threads. Sends still pass the per-user + global Gmail send kill-switches.

| Tool | Purpose |
|---|---|
| `reply.listByClient({clientId, limit?})` | List replies linked to a client (newest first). Each row carries classifiedIntent + confidence + dispatch destination + body. |
| `reply.listUnrouted({limit?})` | Operator-review queue: replies where classifier dispatched to `operator_review`. Morning triage queue. |
| `reply.get({replyEventId})` | Single reply with full body + classification + cancelledCadences. |
| `reply.ingestManual({contactEmail, subject, body, receivedAt?, rawMessageRef?})` | Manual paste path for replies received via WhatsApp/text/forwarded email. Same flow as automated ingest: cancel cadences → classify → dispatch. Also the primary testing surface before Gmail Pub/Sub is provisioned. |

### `meeting.*` — Pre + post meeting (7)

| Tool | Purpose |
|---|---|
| `meeting.create({clientId, title, meetingDate, attendees, ...})` | Create a meeting record. Used by meeting-prep responder after operator approves a slot. For scheduled-but-not-yet-held meetings, pass `summary: ""`. |
| `meeting.update({meetingId, summary?, keyPoints?, decisions?, actionItems?, attendees?, verified?})` | Fill in captured content post-meeting. Used by meeting-capture skill. |
| `meeting.get({meetingId})` | Full meeting record with attendees + decisions + action items + summary. |
| `meeting.getByClient({clientId, limit?})` | All meetings for a client (newest first). |
| `meeting.getByProject({projectId, limit?})` | All meetings for a project. |
| `meeting.listUpcoming({limit?})` | Upcoming meetings across all clients, soonest first. Operator's "what calls do I have" surface. |
| (`meeting.listByClient` removed in catalogue cleanup — use `meeting.getByClient`) | — |

### `document.*` — Document ingestion + extraction + discovery + linkage + classification fixes + generation (16)

| Tool | Purpose |
|---|---|
| `document.listByClient({clientId})` | All documents for a client (Base Documents + project-linked). |
| `document.listByProject({projectId})` | Documents linked to a specific project. |
| `document.get({documentId})` | Full document metadata (summary, classification, fileStorageId for download). |
| `document.search({query, clientId?})` | Substring search by fileName / summary / fileTypeDetected. |
| `document.linkToProject({documentId, projectId?})` | Re-file a document: assign to a project (sets isBaseDocument=false) or unlink (pass projectId=null). |
| `document.createFromGeneration({fileName, fileTypeDetected, category, summary, clientId?, projectId?, ...})` | Persist a skill-generated artefact (lender brief, client brief, IC paper, terms comparison, meeting notes) into documents. Content lives inline in `summary` as markdown — no file storage needed. Appears in the standard documents UI. For file UPLOADS use the regular `documents.create` flow. |
| `document.updateClassification({documentId, category?, fileTypeDetected?, summary?, reasoning?})` | Patch a document's classification fields — for correcting V4 ingestion classifier mistakes. Does NOT re-run V4, strictly a metadata patch. All fields optional; pass only what to change. Recommend always passing `reasoning` for audit trail. |
| `document.requestUpload()` | **Ingestion step 1 (2026-06-01).** Returns a short-lived pre-signed Convex storage upload URL. Claude Code curls the local file straight to it (`curl -X POST '<url>' --data-binary @file`) → response JSON `{ storageId }`. Bytes go machine→Convex directly (never through model context), so large files are fine; the signed URL is self-authorizing (no extra creds). |
| `document.analyze({storageId, fileName, fileType?, fileSize?, clientId?, projectId?})` | **Ingestion step 2 (2026-06-01).** Runs the uploaded file through the V4 classifier and files it as a documents row under the client/project — AI category + summary + auto document code. Since the taxonomy rebuild the classifier also emits the two placement axes (`producer` / `audience`, content-derived) and files into the Dark Mills folder taxonomy (subfolder keys like client_appraisals / rockcap_appraisals / comps_appendix; lender_pack never a target). The "drop docs → analyzed → filed" path for MCP-only operators. Returns `{documentId, category, summary, confidence}`. Refine after with `document.updateClassification` / `document.linkToProject`. |
| `document.extractText({documentId})` | **Harness classification step 1 (2026-07-07).** Server-side PARSE ONLY, zero LLM — returns `{text (≤120K, truncation noted), fileName, mimeType, contentChecksum, source, alreadyClassified, alreadyAtomized}` so YOU classify. For a pending Drive doc it fetches the bytes from Drive, caches them, and CLAIMS the mirror row (`processing`) so the automatic pipeline doesn't race you — finish step 2 within ~30 min or the claim reclaims and the API lane takes over. Keep `contentChecksum` for step 2. `alreadyClassified: true` → skip in bulk passes. This is the SUBSCRIPTION-COST lane for bulk/onboarding classification; changed-file re-processing stays on the API pipeline. |
| `document.applyClassification({documentId, contentChecksum, fileTypeDetected, category, producer?, audience?, summary, confidence, reasoning?, keyDates?, keyAmounts?, keyEntities?, textContent?})` | **Harness classification step 2 (2026-07-07; axis-aware since the taxonomy rebuild).** Persist YOUR classification with the v4 pipeline's exact persistence semantics: server-side deterministic filing from (fileTypeDetected, category, **producer, audience**) via the code placement rules (project taxonomy when the doc has a projectId, client taxonomy else; resolves NESTED folder keys — client_appraisals / rockcap_appraisals / comps_appendix — with parent-key fallback on older projects; `lender_pack` is NEVER a target) on FIRST classification only — filed docs never move; side-effect parity (KB entry create-only, meeting-job heuristics, context-cache invalidation, ingestionEvents row); drift-aware completion of the Drive mirror row (`contentChecksum` from step 1 is REQUIRED for Drive docs — a mid-classification Drive edit re-arms settling and the automatic lane re-extracts). **The two axes are content-derived** (never Drive metadata): `producer` ∈ client\|rockcap\|lender\|third_party_professional\|statutory_authority (developer-ops DNA vs debt-structuring DNA; broker-as-fee-line = lender; HEREBY PERMITS = statutory), `audience` ∈ internal\|external\|neutral (body name-stamp + register beat filename tokens). They persist in `extractedData.classificationAxes` and are frozen with the rest of the classification identity (`identityLocked` — the hook the future re-atomization migration uses). `category` MUST be one of the 13 canonical categories (Appraisals, Plans, Inspections, Professional Reports, KYC, Loan Terms, Legal Documents, Project Documents, Financial Documents, Insurance, Communications, Warranties, Photographs); `fileTypeDetected` uses existing vocabulary. Pass `textContent` (≤900K) so re-analysis/atomization has the text. |
| `document.getSheetData({documentId? / storageId?, maxRows?})` | **Spreadsheet extraction step 1 (2026-06-01).** Returns a stored xlsx/csv as STRUCTURED CELLS (`{sheets:[{name, rows:[[cell,…]]}]}`) so YOU extract the figures. Server only parses cells — you reason out GDV/TDC/units/peak debt/LTGDV with provenance, then persist via `document.saveIntelligence`. The Claude-side answer to deep appraisal extraction (no rigid server pipeline). |
| `document.saveIntelligence({documentId, fields[], projectId?, clientId?})` | **Spreadsheet extraction step 2 (2026-06-01).** Write structured extracted fields onto the document + knowledge library. Each field `{fieldPath, label, value, valueType, confidence, scope, isCanonical, category, templateTags?, sourceText?}`. `templateTags` tag figures for re-populating appraisal templates; `sourceText` carries the sheet!cell provenance. Supersedes prior facts at the same fieldPath from this doc. |
| `document.generate({contentHtml, title, docType, category?, summary?, formats?, clientId?, projectId?})` | **P4 — ad-hoc document generation from Claude Code.** Compose the body as semantic HTML (h1/h2/p/table; NO html/head/style wrappers — house styling applied automatically), render to PDF + DOCX via the Next `/api/documents/generate` route, and stage a `document_publish` approval. On approval the files are filed to the client's Documents library. Ground every figure in real data; never fabricate. Use for one-pagers, IC papers, company summaries etc. See the `document-author` skill + `skills/shared-references/document-house-style.md` for voice and structure. |
| `document.generateBrief({layout, briefData, title, docType?, category?, summary?, formats?, clientId?, projectId?})` | **P4 — branded multi-page BRIEF generation.** Render a RockCap **lender brief** (`layout:"lender-brief"`) or **client brief** (`layout:"client-brief"`) from structured `briefData` (variant, confidentiality, title, meta, keyFacts[], numbered sections[] with semantic-HTML bodies, signOff) and stage a `document_publish` approval. Same render route + approval flow as `document.generate`, but assembled into the branded brief frame (masthead, key-facts block, black footer, RM sign-off). Use for "make me a client brief for {scheme}" / "draft a lender brief on {borrower}". Section set per layout in `skills/shared-references/doc-type-client-brief.md` / `doc-type-lender-brief.md`. Read the deal's documents + intel first; never fabricate figures. |
| `document.generateComps({title, compsData, docType?, category?, summary?, formats?, clientId?, projectId?})` | **P4 — comps appendix (Master Comparable Schedule).** Render a comparable-evidence schedule that justifies a scheme's GDV pricing, as a **spreadsheet (xlsx, default)** or Word table (docx), and stage a `document_publish` approval. `compsData` = title/subtitle/preparedBy + `sheets[]` (tabs), each with `columns[]` (set roles `price`/`sqft`/`psf` to auto-compute £psf) and `tiers[]` (banded groups of comparable rows, optional per-tier auto-average). Use for "make me a comps appendix / comparable schedule for {scheme}". Single tiered schedule = one sheet; hero/second-hand/new-build pack = several. Ground every comp in real evidence (Land Registry / agent listings); flag asking rows `excludeFromAverage`. Structure in `skills/shared-references/doc-type-comps-appendix.md`. PDF not supported. |

### `checklist.*` — Requirements tracking + link fixes (7)

| Tool | Purpose |
|---|---|
| `checklist.getByClient({clientId})` | All checklist items for a client (both client-level and project-level). |
| `checklist.getByProject({projectId})` | Project-scoped checklist items. |
| `checklist.updateStatus({checklistItemId, status})` | Flip status: missing / pending_review / fulfilled. |
| `checklist.createCustomItem({clientId, projectId?, name, category, ...})` | Add a one-off custom item (non-template). Defaults: phaseRequired=indicative_terms, priority=required, status=missing. |
| `checklist.linkDocument({checklistItemId, documentId})` | Attach a document to a checklist item. First link becomes primary + sets status=fulfilled. Subsequent links are non-primary supporting docs. Idempotent. Use when V4 failed to auto-link an obviously-fulfilling doc. |
| `checklist.unlinkDocument({checklistItemId, documentId})` | Remove a document link. If the unlinked doc was primary AND other links remain, oldest remaining is promoted. If no links remain, status reverts to 'missing'. Use when V4 wrongly linked a non-matching doc. |
| `checklist.initializeForProject({clientId, projectId, clientType})` | Seed the 15-item standard checklist from the client-type template. Idempotent. Note: `project.create` already auto-seeds this — use only to re-init a legacy project missing one. |

### `approval.*` — Operator approval queue (6)

| Tool | Purpose |
|---|---|
| `approval.listPendingByClient({clientId, limit?})` | Pending approvals related to a client. Used by Overview Pending Approvals card. |
| `approval.listByReplyEvent({replyEventId})` | Approvals linked to a specific reply (typically 0 or 1 — the qualify-and-draft or meeting-prep-respond output). |
| `approval.get({approvalId})` | Full approval row including draftPayload. |
| `approval.create({entityType, summary, draftPayload, ...})` | Create an approval directly. Skills typically use the higher-level `outreach.draft*` tools instead. |
| `approval.approve({approvalId})` | **Close-the-loop (2026-06-01).** Approve a pending approval and FIRE its action — really sends the `gmail_send` / publishes the document (the executor runs server-side via the scheduler). The trust gate that turns a staged draft into a real outbound action. No-op-safe: `{ok:false, reason:'not_pending_*'}` if not pending. |
| `approval.reject({approvalId, reason?})` | Reject a pending approval so it does NOT fire; the draft is discarded. Optional reason recorded for the audit trail. No-op-safe on non-pending rows. |

### `contact.*` — Contact lookups + writes (4)

| Tool | Purpose |
|---|---|
| `contact.get({id})` | Single contact row (with linked companies + deals). |
| `contact.getByClient({clientId})` | All contacts linked to a client (direct + via promoted companies). |
| `contact.create({name, role?, email?, emailStatus?, emailSource?, phone?, company?, notes?, clientId?, projectId?, linkedCompanyIds?})` | Create a contact. Use when prospect-intel / qualify-and-draft discovers a new person. Link via clientId/projectId/linkedCompanyIds. For Apollo-sourced emails pass emailStatus + emailSource='apollo'; leave undefined for manual entry. Returns `contactId`. |
| `contact.update({id, name?, role?, email?, phone?, company?, notes?, clientId?})` | Patch a contact (omitted fields unchanged). `clientId=null` unlinks from any client. Common use: persist an Apollo-discovered email so a later `cadence.create` passes the email guard. |

### `intelligence.*` — Structured intelligence reads + single-fact writes (7)

| Tool | Purpose |
|---|---|
| `intelligence.getClientIntelligence({clientId})` | The clientIntelligence row for a client. Subsumed by `client.getDeepContext.clientIntelligence`. |
| `intelligence.getProjectIntelligence({projectId})` | The projectIntelligence row for a project. Subsumed by `project.getDeepContext.projectIntelligence`. |
| `intelligence.searchLenders({...})` | Search lender intelligence. (May overlap with `lender.matchForDeal` — prefer matchForDeal for criteria-based matching.) |
| `intelligence.addKnowledgeItem({fieldPath, value, valueType, sourceType, category, label, isCanonical, clientId?, projectId?, ...})` | Write a single canonical or non-canonical fact into the knowledge library. Supersedes any prior active item at the same `(scope, fieldPath, qualifier)` tuple. Used by qualify-and-draft / meeting-capture / deal-intake / **client-context-capture** (with `sourceType:"manual"`) to promote facts from replies / transcripts / docs / **operator input** into the structured intelligence layer that `*.getDeepContext` reads from. fieldPath examples: `borrower.experienceYears`, `project.gdv`, `lender.appetiteMaxLtv`. |
| `intelligence.getKnowledgeItemsByClient({clientId, category?, status?})` | **Read structured facts back (2026-05-31).** List the knowledge items (`addKnowledgeItem` writes) for a client — AI-extracted (prospect-intel: lender DNA, classification, related entities) + operator-entered facts. Active only by default, sorted by category then fieldPath. The reader that was missing (there was a writer, no reader); also now folded into `prospect.getDeepContext.knowledgeItems`. |
| `intelligence.updateClientIntelligence({clientId, identity?, primaryContact?, addresses?, keyPeople?, borrowerProfile?, aiSummary?, updatedBy?})` | **Bulk-patch the clientIntelligence DOC (2026-05-31).** Partial merge (objects merge, arrays/primitives replace; row created if absent). The canonical structured layer the deep-context tools read. prospect-intel calls it (Output #2) to promote identity + key people + executive summary off the report into queryable fields. `lenderProfile` here is for a client that IS a lender — leave unset for borrowers; for discrete supersedable facts prefer `addKnowledgeItem`. |
| `intelligence.appendContext({clientId?|projectId?, markdownBlock, addedBy?})` | **Operator context (2026-05-31).** Append a dated, operator-attributed markdown block to a client's OR a deal's running `contextMarkdown` reference — the home for OPERATOR-STATED primary knowledge (meetings, calls, personal knowledge), as opposed to doc/web-derived intel. Exactly one of clientId/projectId. Row created if absent; block prepended (reverse-chronological). Writes ONLY contextMarkdown — never the activity feed or the legacy recentUpdates field. The write primitive behind the `client-context-capture` skill. |

### `note.*` — Freeform notes (separate lane from intelligence) (4)

| Tool | Purpose |
|---|---|
| `note.create({title, markdown, clientId?, projectId?, tags?, emoji?})` | Create a freeform note on a client/project. Author in markdown (headings/bullets/quotes); converted to the notes editor format. Notes are a SEPARATE lane from intelligence — use for a reminder / to-do / "draft this" prompt; use `intelligence.appendContext` / `addKnowledgeItem` for actual entity knowledge. Filed notes (with clientId/projectId) are shared; unfiled belong to the operator. |
| `note.update({noteId, title?, markdown?, tags?})` | Update a note's title/body/tags. `markdown` replaces the whole body. |
| `note.listByClient({clientId})` | List notes filed under a client (read before adding to avoid duplicates). |
| `note.listByProject({projectId})` | List notes filed under a project/deal. |

### `task.*` — Operator task CRUD (6)

| Tool | Purpose |
|---|---|
| `task.create({title, clientId?, projectId?, priority?, dueDate?, assignedTo?, ...})` | Create an operator-facing task. Used by skills to surface follow-up work (meeting-capture → 'Schedule follow-up call'; qualify-and-draft → 'Manual review of low-confidence reply'; deal-intake → 'Request missing KYC items'). Defaults: status='todo', priority='medium', assignedTo=[calling operator]. |
| `task.get({id})` | Fetch one task by id. Returns null if it doesn't exist or the caller isn't creator/assignee. |
| `task.list({status?, clientId?, projectId?, tags?, includeCreated?, includeAssigned?})` | List the caller's tasks (created/assigned), most-recently-updated first. Use for 'what's on my plate', a client's open follow-ups, or a dup-check before `task.create`. |
| `task.update({id, title?, status?, priority?, dueDate?, notes?, assignedTo?, clientId?, projectId?, ...})` | Edit a task (retitle, reschedule, reassign, relink). Creator or assignee only; notifies stakeholders on status/dueDate/notes/assignee changes. Pass null to clear an optional field. |
| `task.complete({id})` | Mark a task completed — notifies stakeholders + logs to any open flag thread. Prefer over `task.update status='completed'`. |
| `task.delete({id})` | Permanently delete a task (creator only). Irreversible — prefer `task.update status='cancelled'` to keep an audit trail. |

### `touchpoint.*` — Outreach activity log reads (3)

| Tool | Purpose |
|---|---|
| `touchpoint.getByClient({clientId})` | Touchpoints for a client (subsumed by getDeepContext). |
| `touchpoint.getByContact({contactId})` | Touchpoints for a contact. |
| `touchpoint.getByProject({projectId})` | Touchpoints for a project (subsumed by project.getDeepContext). |

### `companies.*` — External company sync (9)

| Tool | Purpose |
|---|---|
| `companies.listUnprocessed({limit?, sinceDays?, states?, ...})` | HubSpot-synced companies without prospect-intel runs. State per row: new / running / stuck. Used by Claude Code to find prospecting candidates. |
| `companies.getGroupCharges({clientId})` | Aggregate the Companies House charge book across a prospect's whole corporate group — the parent (`clients.companiesHouseNumber`) + sibling SPVs (`clients.relatedCompaniesHouseNumbers`, set by `resolve-related-entities`). Read-only. Returns `{companyCount, totalCharges, activeCharges, satisfiedCharges, distinctLenders, lendersByCount[], byCompany[], charges[]}`; `charges` is a per-charge array (`companyNumber, companyName, companyStatus?, chargeId, lender, date?, status?, description?`), newest-first. Empty shape (companyCount 0, charges []) when no related numbers. Unsynced CH numbers are skipped. Powers the prospect CH-tab "Group charges" rollup. |
| `companies.mapGroup({clientId})` | Start the corporate-structure walk: get the group's CH numbers + distinct directors + each director's `appointmentsLink` in one call. Returns `{ ok, companyNumbers[], controllers[{name, appointmentsLink?, companyNumber}] }`. Feed each `appointmentsLink` to `companies.getOfficerAppointments`; also search CH by scheme name (name-search misses scheme-named SPVs). Director ≠ owner — confirm ownership via PSC before crediting a company to the prospect. Read-only; aggregates already-synced rows. |
| `companies.getLenderTierConflict({clientId})` | Check a prospect's group lenders against RockCap's protected lender tiers. Returns `{ action: 'park'|'soften'|'none', tier1: string[], tier2: string[] }`. Tier 1 (e.g. Quantum Development Finance) = park — do not pitch cold; Tier 2 (e.g. Yellow Tree) = soften — broad-brush hook only. Consult before drafting cold outreach. Source of truth: `skills/shared-references/lender-tiers.md`. |
| `companies.getProspectSchemes({clientId})` | Per-scheme view of a prospect's corporate group: one row per charge-bearing SPV, split into `live[]` and `past[]` (live = active company with an outstanding charge), each ranked by most-recent charge date. Merges SPV charges (lender(s), dates) with any prospectSchemes enrichment (address, what they're building, confidence). Read-only. Powers the Track Record tab. |
| `companies.upsertProspectScheme({clientId, companyNumber, companyName, schemeName?, address?, planningRefs?, estimatedUnits?, schemeType?, whatBuilding?, gdvEstimate?, confidence?, status?, sourceUrls?, operatorConfirmed?})` | Upsert per-scheme enrichment for a prospect (keyed by `clientId` + `companyNumber`). The prospect-intel skill writes draft estimates (`operatorConfirmed` defaults false); operator edits in the Track Record tab set `operatorConfirmed` true and are not clobbered by skill re-runs. Surface-only: does not create clients/companies rows. |
| `companies.searchCompaniesHouse({query, limit?})` | Search Companies House by **name** → ranked matches (company_number, title, company_status, date_of_creation, address_snippet, sic_codes when present). Read-only. Use FIRST when you have a name but not a CH number, then feed the chosen company_number to `companies.syncCompaniesHouse`. |
| `companies.syncCompaniesHouse({chNumber})` | Fetch CH profile + charges + **officers + PSCs** via CH API directly + persist into Convex (companiesHouseCompanies / Charges / Officers / PSC). Idempotent (upserts on natural keys). Each officer row stores its `links.officer.appointments` URL as a future cross-company join key. Returns counts: chargesCount, officersCount, pscCount. |
| `companies.getOfficerAppointments({appointmentsLink})` | Fetch an **individual's** other CH appointments via the link stored on each officer row (`links.officer.appointments`, e.g. `/officers/{id}/appointments`). Read-only. Per appointment: company_number, company_name, company_status, officer_role, appointed_on, resigned_on + the person's name + date_of_birth (disambiguation). Maps the **corporate group** — a majority PSC/director who controls the prospect usually controls the sibling SPVs too, so their other active appointments reveal likely scheme vehicles vs the trading parent. Consumed by the `resolve-related-entities` sub-skill (prospect-intel). Heuristic, not proof of ownership. |

### `sourcing.*` — Prospect candidates from the charges register (5)

Sourcing turns a **known lender** into a list of prospect CANDIDATES — the companies that lender has charged (UK mortgage/charges register, Companies House Product 199, served by the separate `charges-service`). Candidates are NOT prospects: they live in the `sourcedCompanies` table, get triaged, and only the few that fit are **promoted** into the client/prospect pipeline (where the full intel/Apollo gauntlet runs). Deal-size fit is gauged from the lender's known appetite (`lender.getAppetite`), not the charge amount. Requires `CHARGES_SERVICE_URL` + `CHARGES_API_KEY` Convex env.

| Tool | Purpose |
|---|---|
| `sourcing.searchLenders({query, limit?})` | Disambiguate a lender name against the charges dataset → distinct canonical lenders + charge/company counts (e.g. 'PARAGON' → PARAGON BANK PLC vs PARAGON DEVELOPMENT FINANCE LIMITED). Call FIRST to get the exact canonical name for `sourcing.fromLender`. Read-only. |
| `sourcing.fromLender({lender, status?, registeredSince?, registeredUntil?, jurisdiction?, entityType?, propertyContains?, limit?})` | Source candidates from a known lender: pull the companies it has charged, enrich each with ONE Companies House profile call (name/status/SIC/town), dedup vs the client book, store as `sourcedCompanies` (state `new`). Pass the EXACT canonical lender name from `sourcing.searchLenders`. Capped at 500 — narrow big lenders with `registeredSince`. Returns `{batch, totalCandidates, enriched, inserted, updated, alreadyInBook, truncated, dataAsOf}`. |
| `sourcing.list({state?, lender?, batch?, includeInBook?, limit?})` | List sourced candidates for triage (filter by state new/reviewed/promoted/dismissed, lender, or batch). `includeInBook:false` hides companies already in the book. Newest charge first. Read-only. |
| `sourcing.promote({id})` | Promote a candidate into the prospect pipeline: creates a borrower client (status=prospect) linked to the CH number + schedules the full CH sync. Apollo / deep intel is a separate operator-driven step after. Returns the new clientId. |
| `sourcing.setState({id, state, notes?})` | Triage a candidate: set state reviewed / dismissed / new (+ optional notes) without promoting. |

### `structure.*` — Corporate structure chart (1)

| Tool | Purpose |
|---|---|
| `structure.renderChart({graph})` | Render a corporate `StructureGraph` (shape per `model-testing-app/src/lib/structure/types.ts`) to a styled **ownership-only** SVG + a `data:image/svg+xml` URI + the high/med/low verdict. Returns `{ svg, dataUri, verdict }`. The renderer omits any entity not in the ownership tree (a directed-but-not-owned company belongs in Track Record, not the chart) and recomputes the verdict via `gradeStructure`. Used at the end of the corporate-structure walk: embed `dataUri` in `intelMarkdown` and persist the graph via `skillRun.complete({structureGraph})`. Read-only (does not persist). |

### `apollo.*` — Email discovery (1)

| Tool | Purpose |
|---|---|
| `apollo.findEmail({firstName, lastName, companyName?, companyDomain?})` | Apollo people-match API. Returns `{found, email, emailStatus, title, linkedinUrl, photoUrl, organization}`. emailStatus: verified (safe) / unverified (manual check needed) / questionable / spam_trap (don't use) / unavailable. Cached 30 days on (firstName, lastName, companyName) key. **Requires** `APOLLO_API_KEY` in Convex env. |

### `skillRun.*` — Skill execution envelope (2)

| Tool | Purpose |
|---|---|
| `skillRun.start({skillName, input, trigger?, dedupKey?, dedupWindowDays?})` | Begin a skill execution. If dedupKey + dedupWindowDays provided, checks for prior runs; returns `status: "duplicate_found"` or `"already_running"` with prior run info. |
| `skillRun.complete({runId, status, brief?, intelMarkdown?, structureGraph?, linkedClientId?, linkedProjectId?, linkedApprovalIds?, gaps?, errors?})` | Close a skill execution. Sets status (complete / complete_with_gaps / failed / cancelled), persists brief + intelMarkdown + structureGraph (the corporate `StructureGraph` rendered in the prospect Intel tab), records linked entities + gaps + errors arrays. |

### `projectData.*` — Project data library / Data tab (1)

| Tool | Purpose |
|---|---|
| `projectData.upsertItem({projectId, itemCode, category, originalName, value, dataType, documentId?, note?})` | **(2026-06-01)** Write a figure into the project data library — the **Data tab**. Upsert by `(projectId, itemCode)` (e.g. `FIN.GDV`); re-running updates + appends history. Pass `documentId` so it files under the source document, `note` for sheet!cell provenance. Library normalizes the value + computes category totals. The persist target for `deal-appraisal-extraction`. |

### `bulkUpload.*` — Bulk-upload batches (1)

| Tool | Purpose |
|---|---|
| `bulkUpload.getBatchItems({batchId})` | List the per-file items in a bulk-upload batch (with classification/status). Use when a deal-intake / doc workflow is driven from a `bulkUploadBatchId`. |

### `drive.*` — Google Drive ingestion + write-back (12)

One org-wide Google Drive connection, mirrored every 2 min into `driveFolders`/`driveFiles`. Two distinct acts: **mapping** a folder to a client sets OWNERSHIP SCOPE ONLY (inherited by descendants, nearest-ancestor wins) — it creates nothing and costs nothing; **import** is the purposeful act that creates a metadata-first `documents` row (visible in the library at once) and turns the live extraction link on (v4 pipeline runs within the ~5–20 min settle window; thereafter Drive edits auto-update the document). A second mapping layer, `drive.mapFolderToProject`, marks a subfolder INSIDE a client-mapped subtree as one in-app project: imports from it stamp `projectId`/`projectName` and file into the PROJECT folder taxonomy instead of the client library — map project subfolders BEFORE importing. Folder imports **dry-run first** — a deliberate cost barrier, because every imported file is later extracted through the Claude-powered v4 pipeline. Imported documents surface through `client.getDeepContext` / `document.listByClient` like any other. When to use: driving ingestion from Claude Code — "connect / import this client's Drive documents into the app". Phase 6 adds the ONLY writes back to Drive — organizational operations (`drive.createFolder` / `drive.moveFile` / `drive.rename`; never file contents): each stages a pending `approvals` row (operator approves before anything executes) and is double-gated by the write-back kill switch at `/settings/drive` (queue-time AND execute-time), with the result echoed into the mirror on success. A third layer, `drive.setAutoImport`, is the WIDE NET: a standing authorization on a subtree so NEW files auto-import as they arrive (20/day cap per flagged folder; overflow stays mirrored-only and is badged for a manual import / harness wave).

| Tool | Purpose |
|---|---|
| `drive.status()` | **START HERE.** Connection status (connected email, root folder, `lastSyncAt`, `needsReconnect`) + mirror stats (folder/file/mapped/trashed/imported counts + files by `extractionStatus`) in one read-only call. Confirms Drive is connected and synced before you list or import. |
| `drive.listFolders({parentFolderId?})` | Navigate the Drive tree: child folders of a folder (omit `parentFolderId` for the connection root) + root→here breadcrumb. Each folder carries its effective client mapping (`effectiveClientId`/`effectiveClientName`, `isExplicitMapping`) AND its effective project mapping (`effectiveProjectId`/`effectiveProjectName`, `isExplicitProjectMapping` — same nearest-ancestor semantics). Read-only — the way to find the folder to map or import. |
| `drive.listFiles({folderId, subtree?})` | Files in a folder from the mirror: `name`, `mimeType`, `size`, `modifiedTime`, `driveFileId`, `imported` (documentId set?), `extractionStatus`, `documentId?`. `subtree:true` lists the whole descendant subtree (capped at 500 with a `truncated` flag). Read-only — see what's importable vs already imported before importing. |
| `drive.getFile({driveFileId})` | Full mirror detail for one file + linked `documentId` + `webViewLink` + effective client scope (`inScope`/`clientId`/`clientName`/`mappedFolderId`). Read-only. Confirm one file's import + extraction state and which client it would import under. |
| `drive.mapFolderToClient({driveFolderId, clientId?})` | Map a Drive folder to a client — omit `clientId` to clear. Sets OWNERSHIP SCOPE ONLY: imports/extracts NOTHING, creates no documents, queues no work (so mapping a 10k-file historical folder costs nothing). The mapping determines which client a later import files under. To bring files in, use `drive.importFolder` / `drive.importFiles`. Idempotent. |
| `drive.mapFolderToProject({driveFolderId, projectId?})` | Map a Drive subfolder to an in-app project — omit `projectId` to clear. Imports from that subtree then file at PROJECT level (documents stamped `projectId`/`projectName`, placed in the project folder taxonomy) instead of polluting the client library. Must be INSIDE a client-mapped subtree, and the project must belong to that client — rejected otherwise. Scope-only like the client mapping (no import, no extraction, no cost); inherited by descendants, nearest wins. Idempotent. |
| `drive.setAutoImport({driveFolderId, enabled})` | **Standing authorization — the wide net.** Arm auto-import on a folder subtree: NEW files dropped there auto-import on the poll tick that mirrors them (metadata-first document, then v4 API classification at a few cents each). Requires an effective client mapping (the flag is inert otherwise). Inherits like the project mapping — nearest ancestor-or-self with the flag EXPLICITLY set wins; `enabled:false` carves a subfolder out of a flagged parent. Capped at 20 auto-imports/day per flagged folder: beyond the cap files stay mirrored but UNIMPORTED, the folder is badged (`autoImportCapHit` — shown in `/settings/drive`), and cap-skipped files do NOT retro-import the next day (no longer 'new') — run `drive.importFolder` / a harness wave for the remainder. Arms future drops only; imports nothing retroactively. |
| `drive.importFiles({driveFileIds})` | Import specific files (≤200 ids) into the library. Each becomes a metadata-first document immediately; extraction follows automatically. Files under a project-mapped folder are stamped `projectId`/`projectName` and file into the PROJECT taxonomy. Returns `{imported, skipped:[{driveFileId, reason}]}` (skip reasons: trashed / already_imported / not_found / no_client_mapping). Use for a targeted handful; for a whole folder use `drive.importFolder`. Dup signature: createdTime clustered across files (seconds apart) + createdTime > modifiedTime = copied-in pack files — classify to the canonical folder, tag as probable duplicates. |
| `drive.importFolder({driveFolderId, confirm?})` | Import a folder subtree. **WITHOUT `confirm`: DRY RUN** — zero writes — returns `{dryRun:true, fileCount, alreadyImported, folders}`. Cost barrier: present `fileCount` to the operator and only call again with `confirm:true` after EXPLICIT approval (each file is extracted through the Claude v4 pipeline). **WITH `confirm:true`:** imports the subtree, returns the first slice's counts and continues the rest in the background. Files under a project-mapped folder file at PROJECT level — map project subfolders (`drive.mapFolderToProject`) BEFORE importing. Unmapped files are skipped — map the client folder first. Dup signature: createdTime clustered across files (seconds apart) + createdTime > modifiedTime = copied-in pack bundle (e.g. a curated Lender Pack) — classify to the canonical folder, tag as probable duplicates. |
| `drive.createFolder({name, parentFolderId})` | **Write — approval-gated.** Stage creating a new Drive folder as a PENDING approval — nothing is written until the operator approves at `/approvals`. Requires the write-back kill switch ON at `/settings/drive` (throws — nothing staged — if off; the executor re-checks the switch at fire time). The parent folder must exist in the mirror and not be trashed. Returns `{approvalId, description}`. |
| `drive.moveFile({driveFileId, newParentFolderId})` | **Write — approval-gated.** Stage re-parenting a file as a PENDING approval. Same double gate (operator approval + `/settings/drive` kill switch, re-checked at execute time). At execution the file's CURRENT parents are fetched LIVE from Drive — a file moved in Drive between staging and approval is handled correctly — then the mirror is updated immediately; no re-extraction is queued (contents unchanged). |
| `drive.rename({driveId, newName, kind})` | **Write — approval-gated.** Stage renaming a file or folder (`kind: "file"` or `"folder"`) as a PENDING approval. Same double gate. Folder renames recompute descendant materialized paths in the mirror; imported-file renames update the library's `fileName` live. The connection root folder cannot be renamed. |

### `atoms.*` / `graph.*` — Knowledge Layer (Spec 2) (11)

The write surface for the atomic-fact knowledge graph (Spec 2 §11 / §14b.1). **Two lanes, one engine.** The HARNESS lane (Claude Code + the `atomize-document` skill) does bulk/backfill atomization at subscription cost via these tools; the API lane (a Convex cron → `/api/knowledge/atomize` route) handles cheap incremental re-atomization of changed documents at API cost (a couple of cents each), gated by a cost wall so it only touches already-onboarded clients. Both lanes persist through the same server-side engine, so the three persistence gates (anchored / discriminating / material) are machine-checked and cannot be bypassed. **Cost note:** use the harness lane (this domain) for onboarding a client's corpus or a backfill; let the API lane handle single changed documents automatically — don't hand-atomize incremental edits.

**Read side (2a.4 — agentic traversal, spec §9).** `atoms.search` + the `graph.*` trio federate ATOM edges (document/CH/Apollo/operator provenance) with NATIVE structural edges synthesized live at read time from `projects.clientRoles`, `contacts`, `clients.relatedCompaniesHouseNumbers`, CH officers/PSC (exact-name matches only, flagged `matchQuality`) and `facilities` columns — never stored twice; same edge from both lanes → atom wins, `nativeCorroboration` noted. **Claude is the query planner:** a hop is ONE tool call; multi-hop reasoning is a sequence of calls with pruning between hops (no retrieval router). Fan-out obeys the hub rule (spec §14b.3): top-K by contested→confidence→recency + full counts and a `truncated` flag — surface "N more — expand?" instead of re-fetching blindly. Provenance rides inline on every edge.

| Tool | Purpose |
|---|---|
| `atoms.vocabulary()` | Return the legal predicate vocabulary `{name → {kind, family, direction?, description, store}}`. Call FIRST so you never guess a predicate. `kind` edge→objectEntityId, attribute→objectLiteral; `store:"native"` predicates are rejected (they live in structural tables). Families: financing / people / structure / property / meta. |
| `atoms.createBatch({atoms})` | Persist ≤100 candidate atoms through the three gates. Each atom: statement, subjectType/subjectId (a real row), a vocabulary predicate, EXACTLY ONE of objectEntityId (edge) or objectLiteral (attribute), confidence, and an observation (sourceType, authorityTier, locator?, sourceText?). Returns `{created, corroborated, superseded, contested, rejected, facilities}` verbatim. **READ `rejected[]`** ({index, statement, reason}) and repair+resubmit — don't drop facts silently. Corroboration / contradiction / supersession + facility minting are automatic. |
| `atoms.getForSubject({subjectType, subjectId, status?})` | Atoms already stored for a subject (with observation counts) — the coverage / idempotency check before atomizing. |
| `atoms.supersede({atomId, reason})` | Operator/hygiene: mark an atom superseded (kept for provenance; reason is an audit note, lifecycle reason recorded as 'operator'). |
| `atoms.retire({atomId, reason})` | Operator/hygiene: retire an atom (removed from the live graph, kept for provenance). Use for misextractions. |
| `atoms.resolveContested({winnerAtomId})` | Operator adjudication of a contest: the winner returns to `active`; every other member of its contested identity group (same subject/predicate/qualifier/object-kind) is archived as `superseded` (supersededBy=winner, reason `operator`). Full history survives — nothing deleted. Errors if the atom isn't currently contested. No approvals (operator hygiene, reversible). Returns `{resolved, archived}`. |
| `atoms.upsertChunks({documentId, contentChecksum, chunks, clientId?, projectId?})` | Persist the narrative dual index (spec §3.4) — chunk ~800-token sections of prose-heavy docs; delete+recreate per revision. SKIP fact-dense spreadsheets (atoms win). |
| `atoms.search({query, clientId?, subjectType?, status?, limit?, includeProspectScoped?})` | HYBRID search over atom statements: full-text (Convex search index) + semantic vector similarity (Voyage `voyage-finance-2` embeddings), fused with reciprocal-rank fusion (RRF) — matches on MEANING as well as exact terms (e.g. "how leveraged is the scheme" surfaces LTGDV/loan atoms with zero shared words), and each hit carries a `lane` marker (text / vector / both) with `counts.{textLane, vectorLane, merged}`. Default returns LIVE atoms only (active + contested). Hits carry resolved subject/object entity names, objectLiteral, confidence, primarySourceType + observation count; the atomId is the drill-down handle. START a graph walk here: resolve the entity off the top hit, then `graph.expandEntity`. Contested hits: present BOTH values, never pick silently. `includeProspectScoped` defaults true (the agent lane sees everything — spec §14b.6a); `false` hides hits whose owning clientId is a prospect-status row, `counts.prospectScopedHidden` reports how many. Degrades to the text lane alone (`vectorLaneDisabled:true`) if embeddings are unavailable. |
| `graph.expandEntity({entityType, entityId, predicates?, direction?, includeAttributes?, limit?, includeProspectScoped?})` | ONE federated hop: `{entity, edges, nativeEdges, attributes, counts}`. Atom edges carry provenance `{sourceType, ref: atomId, observationCount}`; native edges carry `{sourceType: "native", ref: <table.field>}` (synthetic facility-hub predicates: `funds` lender→facility, `lends_to` facility→borrower, `secured_on` facility→project). Each list is ranked (contested first → confidence → asOf recency) and truncated to `limit` (default 30, cap 100); `counts` always holds full totals + `truncated`. Lender clients also get current appetiteSignals federated in as `has_appetite_for` attributes. Pivoting = calling this again on a neighbor. `includeProspectScoped` defaults true (the agent lane sees everything — spec §14b.6a); `false` hides ATOM-lane items owned by prospect-status clients (native edges are public record, always exempt), `counts.prospectScopedHidden` reports how many. |
| `graph.sharedNeighbors({entities, via?})` | The "what connects these?" primitive: intersect 2–5 entities' one-hop federated neighborhoods → nodes connected to ALL inputs, each with per-input connections `{fromInput, predicate, direction, provenance}`. `via`: people / companies / lenders / any. Run as the prospect-connection check ("shares a director with client X?") after prospect-intel creates entities (spec §14b.4). |
| `graph.findPaths({from, to, maxHops?})` | Bounded BFS over the federated edge function: ≤3 hops, ~200-node expansion budget, per-node fan-out capped by the same ranking. Returns ≤5 paths ranked shortest-first then weakest-link confidence, each a provenance-per-hop edge chain. Use when sharedNeighbors comes back empty and you suspect an indirect route. `counts.budgetExhausted=true` ⇒ absence of a path is NOT proof of disconnection. |

### `meta.*` — Introspection (1)

| Tool | Purpose |
|---|---|
| `meta.listTools({domain?})` | Return this server's full tool catalogue as structured JSON — `{toolCount, domainCount, domains, tools:[{name, domain, description, inputSchema}]}`. Source of truth IS the server's tool array, so it cannot drift. Used by `skill-forge` to refresh the skills repo's `tools-manifest.json` and validate that skills only reference tools that exist. Read-only. |

## Common patterns (cookbook)

### Pattern: "Where are we at with X?"

```
1. Identify entity type. Prospect / client / project / lender.
2. Call <entity>.getDeepContext({clientId or projectId})
3. Read summary.* counts to compose a headline answer.
4. Optionally drill into reply / cadence / meeting / document arrays as the question requires.
```

### Pattern: Reply lands → draft response

```
1. reply.listUnrouted (or operator points at a specific replyEventId)
2. reply.get({replyEventId}) — read body + classification
3. prospect.getDeepContext({clientId: reply.linkedClientId}) — load full context
4. (skill: qualify-and-draft) — compose reply per references/qualifying-draft-playbook.md
5. outreach.draftReply({contactId, clientId, subject, bodyText, bodyHtml, replyToReplyEventId})
6. intelligence.addKnowledgeItem({clientId, fieldPath: "qualification.open_questions",
   value: <list of gaps the reply asks about>, ...}) — so the next inbound's run
   can check which gaps closed
7. skillRun.complete with linkedApprovalIds set
```

### Pattern: Match lenders for a deal

```
1. project.getDeepContext({projectId}) — derive criteria from projectIntelligence
   (OR operator passes criteria directly)
2. lender.matchForDeal({criteria, limit: 10})
3. Format result into tiers: optimal (score ≥8) / viable (3-7) / stretch (0-2) / uninformed / incompatible
4. Operator picks shortlist
5. Per chosen lender: project.addLenderRole({projectId, clientId: lenderId})
   — attach to project's clientRoles (idempotent)
6. (skill: terms-package-build) — generate the brief artefact
7. document.createFromGeneration({fileName, fileTypeDetected: "Lender Brief Package",
   category: "Lender outreach", summary: <markdown>, projectId, sourceSkillRunId})
8. Per chosen lender: outreach.draftToLender({lenderClientId, contactId, subject, body,
   projectId, attachedDocumentIds: [briefDocId]})
```

### Pattern: Capture a meeting

```
1. meeting.get({meetingId}) — load the pre-scheduled record
2. prospect.getDeepContext({clientId}) — load relationship context
3. (skill: meeting-capture) — extract summary + keyPoints + decisions + actionItems per references/capture-extraction-template.md
4. For each client-side action item: checklist.createCustomItem
5. For each RockCap-side action item: task.create({title, clientId, projectId?,
   priority, tags: ["meeting-followup"]})
6. For each fact mined from transcript (GDV / TDC / units / preferences):
   intelligence.addKnowledgeItem({clientId or projectId, fieldPath, value,
   valueType, sourceType: "ai_extraction", context: "from transcript <meetingId>"})
7. For each follow-up email: outreach.draftFreshEmail OR outreach.draftToLender
8. meeting.update({meetingId, summary, keyPoints, decisions, actionItems, attendees, verified: true})
9. skillRun.complete
```

### Pattern: Pause a cadence + resume later

```
1. cadence.pause({cadenceId, untilDate}) — soft hold via pauseUntil
2. ... time passes ...
3. cadence.resume({cadenceId, newNextDueAt?}) — clear pauseUntil; optionally bump nextDueAt forward
```

### Pattern: Add a new lender + record BDM appetite

```
# Common case — lender already in HubSpot (you have BDM contact data)
1. contacts.getAll → filter for the lender's email domain (e.g., @shawbrook.co.uk)
2. Read contact.hubspotCompanyIds[0] OR contact.linkedCompanyIds[0]
3. lender.create({hubspotCompanyId: "..." }) OR lender.create({promoteFromCompanyId: "m17..."})
   — promotes the existing companies row + auto-links synced contacts
4. lender.recordAppetite × N — one per appetite dimension from BDM call
5. lender.setSubmissionRequirements({lenderClientId, requirementsMarkdown})
   — author per shared-references/lender-submission-requirements-canon.md
6. lender.getDeepContext({lenderClientId}) — verify identity + appetite + requirements

# Cold-add — lender never in HubSpot (rare)
1. lender.create({name: "..."}) — naked creation, no HubSpot link
2-6. Same as above
```

### Pattern: Fix a misclassified document

```
1. project.getDeepContext({projectId}) — surfaces checklist with linked docs
2. Spot a mis-link: checklist item X shows primaryDocument that doesn't match the
   requirement (e.g., "Planning Decision Notice" linked to a HoTs Comparison xlsx)
3. checklist.unlinkDocument({checklistItemId, documentId}) — clears the bad link;
   status reverts to 'missing' (or promotes the next link if any)
4. (optional) document.updateClassification({documentId, category, fileTypeDetected,
   reasoning}) — fix the doc itself so it doesn't keep getting auto-linked to the
   wrong requirement
5. (optional) checklist.linkDocument({checklistItemId, documentId: <correct doc>}) —
   if you find the right doc that SHOULD fulfill this requirement, link it explicitly
```

### Pattern: Stand up a fresh deal (the deal-intake skill flow)

```
1. client.getDeepContext({clientId: <prospect>}) — confirm prospect state + current status
2. client.activate({clientId}) — promote: status="active", prospectState="promoted",
   HubSpot lifecycleStage updated (Sprint I)
3. project.create({name, clientId, address?, ...}) — auto-shortcode, auto-folders (Sprint I)
4. (per-doc) document.get({documentId}) — verify input batch docs exist
5. (skill: deal-intake) — run filename pre-classification, wait for V4, detect type+phase,
   seed checklist, run 6-check audit pass (per references/misclassification-audit-playbook.md)
6. checklist.linkDocument × N — auto-link correctly-classified docs to checklist requirements
7. intelligence.addKnowledgeItem × N — persist mined intelligence (deal type, phase, GDV,
   SPV structure per shared-references/spv-structure-canon.md, sponsor directors, scheme address)
8. approval.create({entityType: "document_classification_audit"}) — stage the audit
   corrections batch for operator review (always-ask-operator rule)
9. task.create × N — for required items missing without candidate docs (e.g., "Request appraisal")
10. skillRun.complete with brief leading on "Promoted {Client}; stood up {Project};
    type=X, phase=Y; audit produced N corrections; M intelligence items mined"
```

### Pattern: Onboard a client's Drive corpus

```
1. drive.status() — confirm Drive is connected + synced (lastSyncAt fresh, not needsReconnect)
2. drive.listFolders({parentFolderId?}) — navigate to the client's top folder
   (repeat, following driveFolderId, to drill in; breadcrumb shows where you are)
3. drive.mapFolderToClient({driveFolderId, clientId}) — set ownership scope
   (mapping ONLY; nothing imported, nothing extracted, zero cost)
4. drive.mapFolderToProject({driveFolderId, projectId}) — for EACH subfolder that is really
   one in-app project (scheme/deal), map it BEFORE importing. Imports from that subtree then
   stamp projectId/projectName and file into the PROJECT folder taxonomy instead of the
   client library. (project.getByClient / project.listByClient finds the projectId.)
5. drive.importFolder({driveFolderId}) — DRY RUN: returns {fileCount, alreadyImported, folders}
   — import per project subfolder (or the whole client folder once projects are mapped)
6. Present fileCount to the operator: "N files will import + extract (Claude v4 pipeline). Proceed?"
7. On explicit approval → drive.importFolder({driveFolderId, confirm: true})
   — first slice imports now; the rest continues in the background
8. Documents appear metadata-first immediately; extraction fills them in within ~5–20 min.
   Verify later via client.getDeepContext({clientId}) / project.getDeepContext({projectId}) /
   document.listByClient / document.listByProject — the imported Drive files surface there
   like any other document.
```

### Pattern: Multi-hop graph question ("which clients have exposure to lender X?")

```
1. atoms.search({query: "Hampshire Trust Bank"}) — resolve the lender entity from any
   statement mentioning it (read the subject ref off the top hit)
2. graph.expandEntity({entityType: "client", entityId: <HTB>, direction: "out"})
   → nativeEdges: funds_project → Comberton (projects.clientRoles),
                  funds → "Facility · £3.2M" (facilities.lenderClientId)
   → edges:       lends_to → Fireside Capital (facility letter, 2 observations),
                  holds_charge_over → Bayfield SPV Ltd (CH charge ref)
3. Per project/facility neighbor: graph.expandEntity on it to map to the borrower
   client — a hop = one call; YOU are the query planner, prune branches between hops
4. Answer with one line per exposure, each citing the inline provenance
   (atomId + observation count, or the native table)

Variants:
- "What connects prospect P to our book?" → graph.sharedNeighbors({entities: [P, X], via: "any"})
  — the prospect-connection check; expect the shared facility/project/person with
  per-input connections you can cite
- Nothing shared? → graph.findPaths({from: P, to: X, maxHops: 3}) for indirect routes
- counts.truncated=true anywhere → tell the operator "N more edges — expand?" rather
  than dumping the full neighborhood (hub fan-out rule)
```

## What's NOT yet MCP-exposed (deferred)

Skills currently reference these in their workflows; today they fall back to gaps in `skillRun.complete`:

- `intelligence.updateLenderProfile` — bulk patch of a lender's intelligence object (the client-side twin `intelligence.updateClientIntelligence` is now exposed; single-fact writes are covered by `intelligence.addKnowledgeItem`)
- `knowledge.recordMatchOutcome` — matching audit trail (record which lender was picked + outcome, to refine match scoring over time)
- `lender.recordAppetiteSignal` (the meeting-capture variant — `lender.recordAppetite` exists for the lender-intel skill path)

When any of these is added: update this catalogue in the same commit.

## Tool versioning conventions

- New tools land via Sprint commits — see `git log skills/CATALOGUE.md` for the timeline
- Renames are NOT done lightly — existing MCP tools may be referenced by skills, SKILL.md files, and Claude Code sessions in operator workflows. When a rename is necessary, leave the old name as an alias for at least one Sprint commit before removing.
- Deprecation: mark `[DEPRECATED]` in the description; remove in a follow-up commit only after confirming no skill / app code / SKILL.md references the old name.
