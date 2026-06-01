# deal-triage

> **⚠ v1 SKELETON — not yet operational.** This skill documents *intended* behaviour for a future version. Some tools it references are **not yet in the MCP surface** (see `../../CATALOGUE.md` → "What's NOT yet MCP-exposed"). If a user triggers this skill: tell them this workflow isn't built yet, do only what the **live** tools (in `tools-manifest.json`) allow, and **never call a tool that isn't in the manifest** — log the rest as gaps via `skillRun.complete`.

Step 12 of the deal lifecycle. Daily (or operator-invoked) sweep across all active deals to surface what's at risk, what needs a chaser, and what the operator should look at first this morning.

## Trigger

Invoke daily by cron at 07:30 UTC (proposed; aligns with operator routine of reviewing pipeline at start of day) or by operator request:

- "Triage my deals"
- "What's at risk today"
- "What needs my attention on the live pipeline"

## Inputs

Optional:

- `projectFilter`: restrict to a specific project or set; defaults to all active projects assigned to or watched by the invoking user
- `lookaheadDays`: how far forward to look for upcoming milestones; default 14
- `chaseDrafts`: when true, the skill also drafts chasers for items it surfaces; when false, just reports

## Outputs

Returned inline to the operator as a triage brief; some items persist to Convex:

1. **A prioritised triage list**: each item is a `(project, finding, recommendedAction)` tuple sorted by urgency.
2. **`milestones` updates**: `chaseState` is set to `at_risk` or `blocked` for items the triage identifies.
3. **Staged chasers**: if `chaseDrafts` is true, the skill stages `gmail_send` approvals or `cadence` rows for each finding that has a clear next-step communication.
4. **A daily-triage `knowledgeBankEntries` row** of `entryType: "deal_update"` summarising the morning's findings (one per invocation).

## Workflow

1. Load the project filter. Default to all projects where `lifecycleStage in ('active', 'prospective')` and where the invoking user is on `clientRoles` or has the project in their personal watch list.
2. For each project, run the per-project triage rules below.
3. Aggregate findings across projects. Sort by urgency:
   - **Blocking**: a milestone has `chaseState: "blocked"` or a blocking info request is unresolved with a deadline today or earlier.
   - **At-risk**: a milestone targetDate is within lookahead and status is still `upcoming` or `in_progress` without progress evidence.
   - **Awaiting reply**: an approval was approved and executed more than 5 business days ago and no response touchpoint exists.
   - **Stale**: cadence fired with no inbound for more than the cadence interval.
4. For findings with a clear next step (e.g., chase the lender BDM for the IC decision), compose a chaser draft if `chaseDrafts`.
5. Return the brief; persist updates.

## Per-project triage rules

Run each rule against every project in scope. The rule output is a finding or nothing.

1. **Milestone approaching with no progress evidence**: the project has a milestone with `targetDate within lookahead`, `status in ('upcoming', 'in_progress')`, and no recent touchpoint that references this milestone. Output: "at-risk", finding "chase {chaseDirection} on {milestone}".
2. **Blocking info request unresolved past deadline**: a `knowledgeChecklistItems` row has `isBlocking: true` and an effective deadline (from related milestone) that has passed, and `rockcapStatus !== "complete"`. Output: "blocking", finding "{requirement name} is blocking, expected by {date}".
3. **Approval executed without response**: an `approvals` row in status `executed` with `entityType: "gmail_send"`, executed more than 5 business days ago, no inbound touchpoint from the same recipient since. Output: "awaiting reply", finding "{recipient} has not responded to {summary}".
4. **Lender approach stale at indicative stage**: a `lenderApproaches` row at `status: "indicative_received"` for more than 14 days while peers have moved. Output: "at-risk", finding "{lender} indicative stale; pursue or close".
5. **Cadence overdue**: a `cadences` row with `nextDueAt < now` and `lastFiredAt` more than 24 hours ago. Output: "stale", finding "{cadence type} due for {contact}". (The cadence-fire skill should handle most of these; deal-triage surfaces the ones cadence-fire skipped or failed on.)
6. **Monitoring document overdue**: a project in `post_credit` phase with no `monitoring report` document filed in the last 35 days. Output: "at-risk", finding "monitoring period overdue; chase {client}".
7. **Inconsistent intelligence**: an `intelligenceConflicts` row with `status: "pending"` for more than 7 days. Output: "needs review", finding "intelligence conflict on {fieldPath} unresolved".
8. **Deal idle**: no touchpoint, no document, no checklist update in 30 days for an active project. Output: "stale", finding "{project} idle for 30 days; confirm still live".

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Prioritise ruthlessly.** A triage with 40 findings is unusable. If the list is long, surface the top 10 and link to the full list. The brief is for action, not completeness.
- **Specific actions.** "Chase Sarah for the floorplans" not "Follow up on missing documents". Recommended action names the person, the artefact, and the channel.

## Tool dependencies

- `project.list`, `project.get`
- `milestone.listByProject`, `milestone.update`
- `checklist.getByProject`
- a list-all-pending-approvals sweep *(planned — no MCP tool yet; `approval.listPendingByClient` is per-client only)*
- `lenderApproach.listByProject`
- a list-all-active-cadences sweep *(planned — no MCP tool yet; `cadence.listByPackage` is per-package only)*
- `touchpoint.getByContact`, `touchpoint.getByProject`
- `document.listByProject` (for monitoring document recency)
- `intelligenceConflicts.list`
- `gmail.requestSend` for staged chasers
- `cadence.create` for cadence-driven follow-ups
- `knowledge.addEntry` for the daily summary

## What goes wrong

1. **No findings**: the pipeline is genuinely clean. Brief says so; cron triage still records the run so the audit trail is continuous.
2. **Too many findings**: triage covers many projects and surfaces dozens of issues. Skill caps the displayed list at 10 plus a "show all" indicator.
3. **Operator scope ambiguous**: the invoking user is on every deal as a watcher. Skill applies a sensible filter (deals where they are the primary owner) and notes the filter.
4. **Stale findings repeat day after day**: an issue is real but cannot be resolved (e.g., a lender is genuinely slow on credit, no chase will help). Skill detects repeats and demotes to "noted, recurring" so it does not dominate every morning.
5. **Chasers conflict**: two recent chasers to the same person stack up. Skill detects and consolidates into a single combined chaser.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/document-checklist-canon.md`
- This skill's own references to be authored: `triage-rule-catalogue.md`, `urgency-scoring.md`.
