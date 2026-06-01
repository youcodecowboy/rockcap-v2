# monitoring-watcher

> **⚠ v1 SKELETON — not yet operational.** This skill documents *intended* behaviour for a future version. Some tools it references are **not yet in the MCP surface** (see `../../CATALOGUE.md` → "What's NOT yet MCP-exposed"). If a user triggers this skill: tell them this workflow isn't built yet, do only what the **live** tools (in `tools-manifest.json`) allow, and **never call a tool that isn't in the manifest** — log the rest as gaps via `skillRun.complete`.

Step 14 of the deal lifecycle. The deal is in `post_credit` phase; monitoring documents (reports, drawdown statements, sales updates) flow in periodically. This skill watches them, runs variance analysis against the underwriting baseline, flags anomalies, and surfaces them to both the team and the client.

## Trigger

Invoke automatically on the arrival of a monitoring document (via Gmail attachment ingest, manual upload, or HubSpot activity capture). Also invoke periodically (monthly cron) against every active monitoring deal to catch missed reports.

Operator forms:

- "Run monitoring on {Project} for this month"
- "Check the latest drawdown report for {Project}"

## Inputs

Required (one of):

- `documentId`: a newly arrived monitoring document
- `projectId`: a project to check; the skill finds the latest monitoring period's documents itself
- `period`: a specific reporting period to assess (e.g., "2026-Q1" or "2026-05")

## Outputs

Persisted to Convex:

1. **A `modelRuns` row** comparing the latest monitoring data against the underwriting baseline. Inputs: from the latest monitoring report. Outputs: variances on each tracked dimension (build cost vs budget, programme vs target, sales pace vs plan, drawdown vs forecast).
2. **`knowledgeItems` rows** for each significant variance (over 5% on cost, over 4 weeks on programme, over 15% on sales pace).
3. **Anomaly flags** as `flags` rows when a variance crosses a threshold defined in the underwriting model assumptions.
4. **A monitoring summary document** staged as `approvals` of type `document_publish` (and as `client_communication` for the client-facing version).
5. **A `knowledgeBankEntries` row** of `entryType: "deal_update"` capturing the monitoring period.

## Workflow

1. Identify the monitoring period. If `documentId` was given, infer the period from the document. If `projectId` + `period`, use that. If `projectId` alone, find the latest monitoring period (the most recent calendar month with at least one monitoring doc).
2. Load the underwriting baseline: the `modelRuns` row that was current at drawdown.
3. Load the monitoring inputs: extract from the document(s). Use the V4 extraction primitive with a monitoring-data schema. Standard fields: build cost to date, build cost forecast at completion, weeks ahead/behind programme, units sold/reserved, sales values vs target.
4. Compute variances. Each dimension produces a variance figure and a direction (ahead / behind / on track).
5. Apply thresholds. Build cost variance over 5% triggers a flag. Programme delay over 4 weeks triggers a flag. Sales pace 15% behind triggers a flag. Lender-side covenant approach triggers a higher-urgency flag.
6. Compose the monitoring summary. Two versions:
   - **Internal**: full variance table, raw figures, anomaly explanations, recommended actions (e.g., "request explanation from QS on the labour cost overrun").
   - **Client-facing**: concise, positive on what's on track, factual on what's not, no internal speculation.
7. Stage the internal version as a `document_publish` approval (for the internal monitoring file). Stage the client-facing version as a `gmail_send` approval if the team's pattern is to forward monitoring summaries to the borrower.
8. Write the variances and the period summary.
9. Return a brief: variances found, anomalies flagged, summary staged.

## Style rules

All CONVENTIONS apply. Three that matter most:

- **Numbers, then narrative.** Lead with the variance figure; explain after. "Build cost is 7% over budget at this stage" then "driven primarily by the M&E package re-tendering during week 14".
- **No alarmism.** A variance is information until it's a problem. Skill states the figure; flags become "noted" until they cross a hard threshold or worsen across periods.
- **Client-facing is friendlier than internal.** Same facts, less interpretation. The client gets the dashboard; the internal team gets the analysis.

## Tool dependencies

- `project.get`, `modelRuns.getLatest`, `modelRuns.create`
- `documents.getByProject` (for monitoring reports)
- The V4 extraction primitive (currently `/api/intelligence-extract` for ad-hoc; future the unified `document.extract` with a monitoring schema)
- `knowledge.addItem`, `knowledge.addEntry`
- `flags.create` for anomalies
- `template.populate` (BL-5.6) for the monitoring summary document
- `approval.create` of type `document_publish` and `gmail_send`

## What goes wrong

1. **Monitoring document is in a non-standard format**: an interim report from a non-traditional monitoring surveyor. Skill extracts what it can; flags missing dimensions for operator review.
2. **No underwriting baseline on file**: the deal's modelRuns history is incomplete. Skill builds a partial picture and flags the missing baseline.
3. **Inconsistencies between documents in the same period**: the QS report and the cashflow statement disagree on build cost to date. Skill records both, flags the conflict.
4. **Trend deteriorating**: the same variance has worsened across three consecutive periods. Skill upgrades the flag severity and recommends a specific next-step conversation with the borrower.
5. **Lender requires direct copies of monitoring reports**: skill flags that the report has not yet been shared with the lender via the standard channel and stages a `gmail_send` approval to do so.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/document-checklist-canon.md` (monitoring report types)
- `../../shared-references/approval-payload-shapes.md`
- `../../templates/README.md` (monitoring-report.docx template)
- This skill's own references to be authored: `variance-thresholds.md`, `anomaly-escalation-rules.md`.
