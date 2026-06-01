# meeting-capture

Step 5 of the deal lifecycle (post-call half). Takes a Fireflies transcript OR pasted meeting notes and turns them into structured intelligence: meeting record content (decisions + action items + key points), knowledge items, appetite signals (for lender BDM calls), and any follow-up communication drafts.

**v2 hardening (2026-05-25):** retargeted at the v1.3 substrate. `meeting.get` reads the scheduled meeting; `meeting.update` fills in the post-call content (Sprint E adds the MCP wrapper). `prospect.getDeepContext` provides the relationship context for action-item ownership classification. `outreach.draftFreshEmail` / `outreach.draftToLender` stage any follow-up emails the meeting agreed.

## Trigger

Three invocation paths:

1. **Operator-paste (most common today)**: operator says "capture the Mccarthy call: {pasted notes}" with content following a meeting they hosted. Skill processes the notes against the pre-scheduled meeting record.

2. **Fireflies auto-sync (future, when Pub/Sub provisioned)**: Fireflies posts a new transcript via webhook; the meeting record was pre-scheduled (matched by date + attendee email); skill processes automatically.

3. **Operator-initiated retrospective**: operator says "capture last Wednesday's Bayfield call — here's what I remember: ..." with no Fireflies transcript. Skill creates a less-formal record marked `verified: false` pending operator review.

## Inputs

Required (one of):

- `meetingId`: id of an existing `meetings` row (scheduled but content empty). PRIMARY path post-Sprint C: meeting was created when the call was scheduled; capture fills in the content.
- `transcriptText` + `meetingDate` + `attendees` + `clientId`: paste-in flow with no pre-existing meeting record. Skill calls `meeting.create` first, then proceeds.

Optional:

- `projectId`: override the auto-attribution if the client has multiple active projects
- `extraContext`: anything the operator wants to feed in (a side conversation, a note about a participant who was missing)
- `source`: `"fireflies"` | `"operator_paste"` | `"operator_retrospective"` — used in the meeting's `sourceDocumentName` field for audit

## Dedup

- **dedupKey**: `capture:${meetingId}` (one capture per meeting). For paste-in flows without a meetingId yet, use `capture:${clientId}:${meetingDate}`.
- **dedupWindowDays**: 30 (operators occasionally re-capture with corrections; allow refresh within the month).
- **On `duplicate_found`**: return the prior capture's brief. Operator decides: open prior, refresh (means re-extracting from the transcript — preserves the meeting row but overwrites summary/keyPoints/decisions/actionItems).

## Cadence package

This skill **does not** produce a cadence package by default. Captures are one-off events.

**Exception — `client_checkin`:** if the meeting decides a deliberate next-meeting cadence (e.g., "let's check in monthly until completion"), the skill MAY queue a single `cadences` row of type `client_checkin` with the agreed interval. Created `isActive: false` until operator approval (same pattern as qualify-and-draft's warm_lead_chase exception). Implementation: include the cadence in an approval row's `draftPayload.recurringCadence` rather than as a separate cadence row.

## Outputs

Persisted to Convex via the v1.3 MCP tool surface:

1. **Updated `meetings` row** via `meeting.update` with summary, keyPoints, decisions, actionItems, refined attendees (with resolved contactIds where possible). Sets `verified: true` for Fireflies/transcript-sourced captures; `verified: false` for retrospectives.
2. **`knowledgeItems` rows** for any concrete intelligence the transcript revealed (e.g., a new GDV estimate, a lender preference, a scheme detail). Via `intelligence.addKnowledgeItem`. Use `sourceType: "ai_extraction"`, `context: "captured from meeting transcript <meetingId>"`. Each fact becomes a single tool call.
3. **`tasks` rows** for action items with a clear RockCap-side owner. Client-side action items become checklist items via `checklist.createCustomItem` instead.
4. **`approvals` rows** for any agreed follow-ups requiring outbound communication:
   - Client thank-you / next-steps note: `outreach.draftFreshEmail`
   - Doc-share to lender / BDM follow-up: `outreach.draftToLender`
   - Calendar invite for next meeting: TBD (Sprint F / calendar integration)
5. **`appetiteSignals`** rows if the meeting was with a lender BDM and they shared appetite info — record each signal via `lender.recordAppetite` (see the BDM special path in the workflow).
6. **A `skillRun`** via `skillRun.start` / `skillRun.complete`. `linkedClientId` set. `linkedApprovalIds` set if any follow-ups staged. Brief summarises what was captured + what's flagged for review.

## High-level workflow

1. **Resolve the trigger.** If `meetingId`: call `meeting.get` to load the existing record (verify summary is empty — if not, this is a re-capture path; dedup applies). If `transcriptText`+`meetingDate`+`clientId`: call `meeting.create` first with placeholder content (`summary: ""`, etc.), then proceed using the returned id.

2. **Call `skillRun.start`** with `skillName: "meeting-capture"`, the appropriate `dedupKey`, `dedupWindowDays: 30`.

3. **Load relationship context.** Call `prospect.getDeepContext` (or `client.getDeepContext`) for the meeting's clientId. Returns: contacts, prior meetings (action items still pending = candidate for closing), pending approvals (anything the meeting may have addressed), recent reply events.

4. **Extract the structured content from the transcript:**
   - **Summary**: 2-3 sentence narrative — what was discussed, what was decided, what's next.
   - **Key points**: 5-8 bullets of substantive content.
   - **Decisions**: explicit verbatim decisions (e.g., "Bayfield will provide the appraisal by Friday"). Faithful to source — don't paraphrase punchier.
   - **Action items**: per-action {description, assignee, dueDate, status: "pending"}. Each item gets classified by owner side (RockCap / client / lender / professional) — see Action item ownership rules below.

5. **Resolve attendees.** For each attendee with an email or full name, attempt to resolve to a `contactId` via the client's contacts list (in scope from getDeepContext). Unmatched attendees keep just name + role; flag in `skillRun.complete.gaps` so operator can create contacts via `contact.create` for known returning unrecognised attendees.

6. **Classify action items by owner:**
   - **RockCap-side** (we owe them something): create a `tasks` row via `task.create({title: <action text>, clientId, projectId?, priority, dueDate?, tags: ["meeting-followup"]})`. Lands in the operator's task inbox + the linked client/project page.
   - **Client-side** (they owe us something): create a checklist item via `checklist.createCustomItem({clientId, projectId?, name, category: "Action from meeting", description: <action text>, phaseRequired: <derived from project state>})`. Adds to the standard checklist; status: "missing".
   - **Lender / professional adviser side**: capture in action item description with assignee=name; no separate tasks/checklist record (handled in the relevant project's external coordination).

7. **Mine for intelligence updates:** new figures (GDV / TDC / units), asset details (postcode / planning ref / type), sponsor preferences, lender constraints (if BDM call). Each becomes one `intelligence.addKnowledgeItem` call with `sourceType: "ai_extraction"`, `context: "from meeting transcript <meetingId>"`, `valueType` matching the data (currency/number/string/array/etc.), `isCanonical: true` when the transcript states the figure unambiguously; `false` when it's an estimate or in-passing reference (operator can promote to canonical via the UI).

8. **Lender BDM call special path:** if the meeting was with a lender BDM (client.type === "lender"), capture appetite signals separately. For each signal call `lender.recordAppetite` with `{fieldPath, value, valueType, sourceType: "bdm_meeting", asOfDate: meeting date, confidence}` — one call per signal inferred from the transcript.

9. **Stage follow-up communications.** For each decision/action item that requires outbound communication:
   - Client thank-you or confirmation: `outreach.draftFreshEmail({contactId, clientId, subject: "Re: <meeting title>", body, reasoning: "Meeting follow-up agreed in <meeting title>"})`.
   - Lender-bound (rare from meeting-capture): `outreach.draftToLender({lenderClientId, contactId, subject, body, reasoning: "Captured from BDM meeting on <date>"})`.

10. **Update the meeting** via `meeting.update({meetingId, summary, keyPoints, decisions, actionItems, attendees, verified: true})`. Marks the record as fully captured.

11. **Optional recurring cadence** (per Cadence package section): if the meeting decides a future check-in interval, add `recurringCadence: {type: "client_checkin", intervalDays, anchorDate}` to a separate approval row's draftPayload. Cadence only persists on operator approval.

12. **Call `skillRun.complete`** with `status: "complete"` (or `complete_with_gaps` if MCP tools were missing or intelligence wasn't captured structurally), `brief` (one paragraph: what was captured + what's queued + what needs review), `linkedClientId`, `linkedProjectId` if a project context, `linkedApprovalIds` for staged follow-ups, `gaps` for everything that couldn't be structurally persisted.

## Action item ownership rules

Each action item from the transcript gets classified by owner side. Use this rubric:

| Pattern in transcript | Owner | Persist as |
|---|---|---|
| "I'll send you X" (operator speaking) | RockCap | `task.create` |
| "We'll send you X" (operator speaking) | RockCap | `task.create` |
| "You'll get me X by date" / "Can you send X" (client side gives owner) | Client | `checklist.createCustomItem` |
| "{Client name} will send X" (third-person attribution) | Client | `checklist.createCustomItem` |
| "{Lender BDM name} will check internally" | Lender | Action item with assignee=BDM name; no separate task/checklist |
| "{Architect/QS name} will provide X" | Professional | Action item with assignee; no separate task/checklist |
| "We need to find out X" (open question, no owner) | RockCap | `task.create` (no `assignedTo`; defaults to caller; flag as TBD in description) |

If the transcript is genuinely ambiguous about the owner (common in informal discussions), default to RockCap (we'd rather over-attribute to ourselves than miss an action). Flag as low-confidence in the action item description.

## Style rules

All `../../CONVENTIONS.md` rules apply. Three that matter most:

- **Faithful to the source.** Don't paraphrase decisions into punchier wording. The exact wording matters because downstream skills (qualify-and-draft, terms-package-build) may quote these decisions. If a decision is unclear in the transcript, capture both the stated wording AND a one-line clarification of the operator's likely intent — flag the latter as `[interpretation, verify]`.
- **Conservative on intelligence writes.** If the transcript implies but does not state a figure, do NOT write it as a `knowledgeItems` row. Flag for operator review in the brief instead. Better an "unwritten" finding than a wrong one persisted as ground-truth.
- **Report-as-standalone-artefact.** No cross-meeting comparisons in the brief or summary (same rule as prospect-intel + qualify-and-draft + meeting-prep). Each meeting capture stands on its own.

## Tool dependencies

This skill calls these MCP-exposed tools (v1.3):

- `meeting.get` — load the scheduled record (Sprint C)
- `meeting.update` — fill in content (Sprint E)
- `meeting.create` — if no pre-scheduled record exists (paste-in flow; Sprint C)
- `prospect.getDeepContext` / `client.getDeepContext` — load relationship + project context (Sprint A + v1.3.1)
- `checklist.createCustomItem` — for client-side action items (Sprint D)
- `outreach.draftFreshEmail` / `outreach.draftToLender` — for follow-up communications (Sprint B + E)
- `intelligence.addKnowledgeItem` — for transcript-mined intel (Sprint G)
- `task.create` — for RockCap-side action items (Sprint G)
- `skillRun.start` + `skillRun.complete` — workflow envelope

Tools NOT yet MCP-exposed (capture in gaps):
- `lender.recordAppetite` — for BDM meeting outputs (one call per appetite signal inferred from the transcript). Same tool the lender-intel skill uses for structured intake.

## What goes wrong

1. **Transcript is too sparse**: meeting was short, mostly small talk, or Fireflies failed to capture audio. Skill produces a minimal record with just attendees + summary "no substantive content captured" and flags `transcript_too_sparse` for operator amendment.
2. **Attendee attribution failed**: participant emails do not resolve to any contacts. Skill records the meeting against the resolved subset; unresolved entries keep name only with `contactId: undefined`. Flag for operator to create contacts.
3. **Multiple deals could be the subject**: the client has more than one active project. Skill picks the most-recently-active project (per `client.getDeepContext.projects.active[0]`) and surfaces the choice for confirmation. Operator can re-run with explicit `projectId`.
4. **Conflict with existing intelligence**: transcript states GDV £18m, an existing `knowledgeItems` row has GDV £16m. Both values persist (the older one auto-supersedes when `intelligence.addKnowledgeItem` is called for the same `(scope, fieldPath, qualifier)` tuple). The skill records the new value as canonical only if the transcript is unambiguous (`isCanonical: true`); otherwise writes `isCanonical: false` AND flags the conflict in `skillRun.complete.gaps` (kind: `intelligence_conflict`) for operator promotion.
5. **Sensitive content**: legal advice, off-record commentary, personal information. Skill captures structurally but flags such segments with `confidentiality: "sensitive"` in the keyPoint/decision so they do not feed downstream skills without a higher-trust gate. Don't strip — just mark.
6. **Operator-paste with no transcript structure**: notes are prose, not a transcript. Skill works the same way (extract decisions / actions / key points / summary) but `verified: false` since there's no source-of-truth to verify against. Brief recommends operator review the meeting record.
7. **Action item with no clear owner**: per ownership rules above, default RockCap + flag low-confidence. Operator can reassign in the meeting record.

## References

- `references/capture-extraction-template.md` — the canonical extraction shape (v2 hardening: authored alongside this rewrite)
- `../../shared-references/uk-property-finance-glossary.md` — vocabulary checks
- `../../shared-references/document-checklist-canon.md` — for action-item-to-checklist category mapping
- This skill's own references to add as patterns emerge: `lender-bdm-appetite-extraction.md` (when lender intel substrate lands)
