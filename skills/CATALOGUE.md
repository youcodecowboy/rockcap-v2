# MCP tool catalogue

The complete, canonical list of MCP tools exposed by the RockCap Convex backend (`https://incredible-kudu-562.convex.site/mcp`). 68 tools across 18 domains as of v1.3 Sprint F.

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
| "Sync {CH number} from Companies House" | `companies.syncCompaniesHouse` |
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
- `transitionState` — moves a prospect through the 8-state machine
- `applyPresetSchedule` — bulk reschedules cadence touches by preset (Light/Moderate/Aggressive)

## Tools by domain

### `prospect.*` — Prospect workflows (2)

| Tool | Purpose |
|---|---|
| `prospect.getDeepContext({clientId})` | **HEADLINE.** Comprehensive snapshot: prospect + contacts + cadences (split active/fired/queued) + replies + intel run + meetings + CH profile + clientIntelligence + touchpoints + deals + projects + pending approvals + summary block with 22 at-a-glance counts. FIRST tool call for any prospect-scoped question. |
| `prospect.transitionState({clientId, newState})` | Move a prospect through the 8-state machine: drafted / needs_revision / active / replied / engaged / promoted / parked / lost. Side effect: schedules HubSpot push-back via existing sync. |

### `client.*` — Client workflows (alias of prospect; for active clients) (4)

| Tool | Purpose |
|---|---|
| `client.getDeepContext({clientId})` | **HEADLINE.** Alias of `prospect.getDeepContext` — same query, surfaced under `client.*` namespace for clarity when working with active clients. `summary.entityFocus` field tells you whether the entity is currently a prospect or active client. |
| `client.get({id})` | Single client by id (raw row, no aggregations). Use when you just need the contact details + don't need the deep context overhead. |
| `client.list({filters?})` | List clients with optional filters. Use sparingly — `prospect.getDeepContext` is the recommended path for any specific entity. |
| `client.getStats({clientId})` | Aggregate counts for a client. Subsumed by `getDeepContext.summary`; use only if you don't need the full context. |

### `clients.*` — Bulk client field patching (1)

| Tool | Purpose |
|---|---|
| `clients.setProspectFacts({clientId, companiesHouseNumber?, website?, primaryDirectorName?, primaryContactId?})` | Bulk-patch the structured prospect facts on a clients row. Used by `prospect-intel` skill workflow step 10 to promote facts out of intelMarkdown text. |

### `project.*` — Project (scheme/deal) workflows (4)

| Tool | Purpose |
|---|---|
| `project.getDeepContext({projectId})` | **HEADLINE.** Comprehensive snapshot: project + projectIntelligence + linked clients via clientRoles (with role labels) + meetings + documents + checklist (split by status: missing/pending_review/fulfilled) + cadences + skillRuns + deals + touchpoints + pending approvals. FIRST tool call for any project-scoped question. |
| `project.get({id})` | Single project by id. |
| `project.getByClient({clientId})` | All projects a client appears in (via `clientRoles` array — any role). |
| `project.getStats({projectId})` | Aggregate counts (subsumed by `getDeepContext.summary`). |

### `lender.*` — Lender intelligence + matching (7)

| Tool | Purpose |
|---|---|
| `lender.getDeepContext({lenderClientId})` | **HEADLINE.** Comprehensive snapshot for a lender: identity + current appetite as fieldPath→value map + recent appetite changes (90d) + BDM contacts + linked projects (via clientRoles) + meetings + cadences + pending approvals. |
| `lender.matchForDeal({criteria, limit?})` | **THE MATCHING TOOL.** Given criteria `{dealSize, dealType, assetClass, geography, ltv, ltgdv, timelineWeeks}` (all optional individually), returns ranked lenders with per-lender matchScore + matchReasons + fitConcerns + currentSignalsCount. Use after prospect-intel produces Recommended Approach to compose "Optimal lenders for this £X deal: A, B, C" answers. |
| `lender.list({nameQuery?, limit?})` | Filter clients by type=lender + optional name substring. |
| `lender.create({name, companyName?, ...})` | Create a new lender (wraps `clients.create` with `type: "lender"`). Common pattern after a first BDM meeting: `lender.create` → `lender.recordAppetite × N` from the meeting notes. |
| `lender.recordAppetite({lenderClientId, fieldPath, value, valueType, sourceType, ...})` | Write an appetite signal. Auto-supersedes prior signal at the same fieldPath. Standard fieldPaths drive matching: `dealSize.min/max`, `products.offered`, `propertyType.allowed`, `geography.regions`, `ltv.maximum`, `ltgdv.maximum`, `timeline.typicalWeeksToOffer`. See `skills/skills/lender-intel/references/appetite-signal-catalogue.md` for the full catalogue. |
| `lender.getAppetite({lenderClientId, asMap?})` | Current appetite (isCurrent=true signals). asMap=true (default) returns convenient `{fieldPath: {value, ...}}` shape. |
| `lender.getAppetiteHistory({lenderClientId, fieldPath?, limit?})` | Full appetite history including superseded. Optional fieldPath filter for single-dimension timelines. |

### `cadence.*` — Outreach cadence flow (9)

| Tool | Purpose |
|---|---|
| `cadence.create({contactId, cadenceType, nextDueAt, scheduleConfig, isActive, packageId?, packageOrder?, preDraftedTouch?, ...})` | Create a cadence row. For prospect-intel-style packages: set `packageId` + `packageOrder` (1-4) + `preDraftedTouch`. |
| `cadence.cancel({cadenceId, reason})` | Set isActive=false with a reason. |
| `cadence.update({cadenceId, preDraftedTouch?, nextDueAt?})` | Edit a single touch's content or scheduled date. Sets `editedByOperator` audit fields. |
| `cadence.requestRevision({packageId, revisionNote})` | Mark all cadences in a package for revision with operator note. Skill re-runs and re-drafts. |
| `cadence.pause({cadenceId, untilDate?})` | Soft-pause via `pauseUntil` (default 14 days). Dispatcher skips while pauseUntil > now. |
| `cadence.resume({cadenceId, newNextDueAt?})` | Clear pauseUntil. Optionally reschedule nextDueAt. |
| `cadence.snooze({cadenceId, byDays})` | Push nextDueAt forward by N days. Different from pause (hard reschedule vs soft hold). |
| `cadence.get({cadenceId})` | Single cadence row. |
| `cadence.listByPackage({packageId})` | All cadences in a package (typically the 4-touch prospect package). |

### `outreach.*` — Email draft staging (3)

All three create `approvals` rows that surface on the Overview Pending Approvals card AND in `/approvals`. Approval execution wires the actual send.

| Tool | Purpose |
|---|---|
| `outreach.draftReply({contactId, clientId, subject, bodyText, bodyHtml, replyToReplyEventId?, ...})` | Reply draft. Use when responding to a tracked reply event. Sets `relatedReplyEventId` so the Replies tab badge updates to "draft pending". |
| `outreach.draftFreshEmail({contactId, clientId, subject, bodyText, bodyHtml, ...})` | NEW outreach. Use when operator initiates an email outside the cadence package + outside a reply. Examples: "send Mccarthy an email asking for the appraisal". |
| `outreach.draftToLender({lenderClientId, contactId, subject, bodyText, bodyHtml, projectId?, attachedDocumentIds?, ...})` | Lender-bound email. entityType=lender_outreach. Use for indicative terms requests, BDM follow-ups, term sheet acceptance. Supports document attachments. |

### `reply.*` — Inbound reply visibility + classification (4)

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

### `document.*` — Document discovery + linkage (5)

| Tool | Purpose |
|---|---|
| `document.listByClient({clientId})` | All documents for a client (Base Documents + project-linked). |
| `document.listByProject({projectId})` | Documents linked to a specific project. |
| `document.get({documentId})` | Full document metadata (summary, classification, fileStorageId for download). |
| `document.search({query, clientId?})` | Substring search by fileName / summary / fileTypeDetected. |
| `document.linkToProject({documentId, projectId?})` | Re-file a document: assign to a project (sets isBaseDocument=false) or unlink (pass projectId=null). |

### `checklist.*` — Requirements tracking (4)

| Tool | Purpose |
|---|---|
| `checklist.getByClient({clientId})` | All checklist items for a client (both client-level and project-level). |
| `checklist.getByProject({projectId})` | Project-scoped checklist items. |
| `checklist.updateStatus({checklistItemId, status})` | Flip status: missing / pending_review / fulfilled. |
| `checklist.createCustomItem({clientId, projectId?, name, category, ...})` | Add a one-off custom item (non-template). Defaults: phaseRequired=indicative_terms, priority=required, status=missing. |

### `approval.*` — Operator approval queue (4)

| Tool | Purpose |
|---|---|
| `approval.listPendingByClient({clientId, limit?})` | Pending approvals related to a client. Used by Overview Pending Approvals card. |
| `approval.listByReplyEvent({replyEventId})` | Approvals linked to a specific reply (typically 0 or 1 — the qualify-and-draft or meeting-prep-respond output). |
| `approval.get({approvalId})` | Full approval row including draftPayload. |
| `approval.create({entityType, summary, draftPayload, ...})` | Create an approval directly. Skills typically use the higher-level `outreach.draft*` tools instead. |

### `contact.*` — Contact lookups (2)

| Tool | Purpose |
|---|---|
| `contact.get({contactId})` | Single contact row. |
| `contact.getByClient({clientId})` | All contacts linked to a client. |

### `intelligence.*` — Structured intelligence reads (3)

| Tool | Purpose |
|---|---|
| `intelligence.getClientIntelligence({clientId})` | The clientIntelligence row for a client. Subsumed by `client.getDeepContext.clientIntelligence`. |
| `intelligence.getProjectIntelligence({projectId})` | The projectIntelligence row for a project. Subsumed by `project.getDeepContext.projectIntelligence`. |
| `intelligence.searchLenders({...})` | Search lender intelligence. (May overlap with `lender.matchForDeal` — prefer matchForDeal for criteria-based matching.) |

### `touchpoint.*` — Outreach activity log reads (3)

| Tool | Purpose |
|---|---|
| `touchpoint.getByClient({clientId})` | Touchpoints for a client (subsumed by getDeepContext). |
| `touchpoint.getByContact({contactId})` | Touchpoints for a contact. |
| `touchpoint.getByProject({projectId})` | Touchpoints for a project (subsumed by project.getDeepContext). |

### `companies.*` — External company sync (2)

| Tool | Purpose |
|---|---|
| `companies.listUnprocessed({limit?, sinceDays?, states?, ...})` | HubSpot-synced companies without prospect-intel runs. State per row: new / running / stuck. Used by Claude Code to find prospecting candidates. |
| `companies.syncCompaniesHouse({chNumber})` | Fetch CH profile + charges via CH API directly + persist into Convex. Idempotent. Officers + PSCs deferred (workaround: WebFetch the CH pages directly per prospect-intel SKILL.md). |

### `apollo.*` — Email discovery (1)

| Tool | Purpose |
|---|---|
| `apollo.findEmail({firstName, lastName, companyName?, companyDomain?})` | Apollo people-match API. Returns `{found, email, emailStatus, title, linkedinUrl, photoUrl, organization}`. emailStatus: verified (safe) / unverified (manual check needed) / questionable / spam_trap (don't use) / unavailable. Cached 30 days on (firstName, lastName, companyName) key. **Requires** `APOLLO_API_KEY` in Convex env. |

### `skillRun.*` — Skill execution envelope (2)

| Tool | Purpose |
|---|---|
| `skillRun.start({skillName, input, trigger?, dedupKey?, dedupWindowDays?})` | Begin a skill execution. If dedupKey + dedupWindowDays provided, checks for prior runs; returns `status: "duplicate_found"` or `"already_running"` with prior run info. |
| `skillRun.complete({runId, status, brief?, intelMarkdown?, linkedClientId?, linkedProjectId?, linkedApprovalIds?, gaps?, errors?})` | Close a skill execution. Sets status (complete / complete_with_gaps / failed / cancelled), persists brief + intelMarkdown, records linked entities + gaps + errors arrays. |

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
6. skillRun.complete with linkedApprovalIds set
```

### Pattern: Match lenders for a deal

```
1. project.getDeepContext({projectId}) — derive criteria from projectIntelligence
   (OR operator passes criteria directly)
2. lender.matchForDeal({criteria, limit: 10})
3. Format result into tiers: optimal (score ≥8) / viable (3-7) / stretch (0-2) / uninformed / incompatible
4. Operator picks shortlist
5. Per chosen lender: outreach.draftToLender({lenderClientId, contactId, subject, body, projectId, attachedDocumentIds?})
```

### Pattern: Capture a meeting

```
1. meeting.get({meetingId}) — load the pre-scheduled record
2. prospect.getDeepContext({clientId}) — load relationship context
3. (skill: meeting-capture) — extract summary + keyPoints + decisions + actionItems per references/capture-extraction-template.md
4. For each client-side action item: checklist.createCustomItem
5. For each follow-up email: outreach.draftFreshEmail OR outreach.draftToLender
6. meeting.update({meetingId, summary, keyPoints, decisions, actionItems, attendees, verified: true})
7. skillRun.complete
```

### Pattern: Pause a cadence + resume later

```
1. cadence.pause({cadenceId, untilDate}) — soft hold via pauseUntil
2. ... time passes ...
3. cadence.resume({cadenceId, newNextDueAt?}) — clear pauseUntil; optionally bump nextDueAt forward
```

### Pattern: Add a new lender + record BDM appetite

```
1. lender.create({name, companyName?, website?, ...}) — creates clients row with type=lender
2. lender.recordAppetite × N — one per appetite dimension from the BDM call
   Standard fieldPaths per references/appetite-signal-catalogue.md
3. lender.getDeepContext({lenderClientId}) — verify the appetite picture is recorded
```

## What's NOT yet MCP-exposed (deferred)

Skills currently reference these in their workflows; today they fall back to gaps in `skillRun.complete`:

- `intelligence.addKnowledgeItem` / `updateClientIntelligence` / `updateLenderProfile` — intelligence write surface
- `knowledge.recordMatchOutcome` — matching audit trail
- `task.create` — RockCap-side action items
- `lender.recordAppetiteSignal` (the meeting-capture variant — `lender.recordAppetite` exists for the lender-intel skill path)
- `document.createFromGeneration` — for skills that produce documents (lender brief packages, IC papers, terms comparison memos)
- `project.addLenderRole` — workaround via `project.update` with extended clientRoles array

When any of these is added: update this catalogue in the same commit.

## Tool versioning conventions

- New tools land via Sprint commits — see `git log skills/CATALOGUE.md` for the timeline
- Renames are NOT done lightly — existing MCP tools may be referenced by skills, SKILL.md files, and Claude Code sessions in operator workflows. When a rename is necessary, leave the old name as an alias for at least one Sprint commit before removing.
- Deprecation: mark `[DEPRECATED]` in the description; remove in a follow-up commit only after confirming no skill / app code / SKILL.md references the old name.
