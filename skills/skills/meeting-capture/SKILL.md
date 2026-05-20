# meeting-capture

Step 5 of the deal lifecycle (post-call half). Takes a Fireflies transcript or pasted meeting notes and turns them into structured intelligence: meeting record, action items, decisions, deal-status updates.

## Trigger

Invoke after a meeting has happened and a transcript or note is available. Common forms:

- Automatic, on Fireflies sync (a new transcript appears for an attributable meeting)
- "Capture the {Borrower MD} call from this morning, here's my note: ..."
- "Process the transcript on meeting {id}"

## Inputs

Required (one of):

- `meetingId`: id of an existing `meetings` row (Fireflies-synced or manually created)
- `transcriptText` plus `meetingDate` plus `attendees`: for paste-in flows

Optional:

- `projectId` and `clientId`: override the automatic attribution
- `extraContext`: anything the operator wants to feed in

## Outputs

Persisted to Convex:

1. **Updated `meetings` row** with summary, keyPoints, decisions, actionItems. If the row was Fireflies-synced with `verified: false`, this skill verifies it.
2. **`knowledgeItems` rows** for any concrete intelligence the transcript revealed (e.g., a new GDV estimate, a lender preference, a scheme detail).
3. **`tasks` rows** for action items that have a clear RockCap-side owner. Action items on the client side become checklist asks instead.
4. **`approvals` rows** for any agreed follow-ups that need outbound communication (a thank-you note, a confirmation of next steps, a doc share).
5. **`appetiteSignals`** rows if the meeting was with a lender BDM and they shared appetite information.

## Workflow

1. Load the meeting and its transcript. If the transcript is large (typical Fireflies: 30 to 200KB), load the segments lazily and process in chunks.
2. Extract the summary, keyPoints, decisions, and action items if they are not already populated. Use the V4 pipeline's existing extraction route as the primitive.
3. Re-verify or fill the attendees with resolved contactIds where possible.
4. For each action item, classify by owner side (RockCap, client, lender, professional). RockCap-side items become `tasks`; other-side items become checklist asks or chasers.
5. Mine the transcript for intelligence updates: new figures, asset details, sponsor preferences, lender constraints. Write each as a `knowledgeItems` row with `sourceType: "call_transcript"` and `sourceRef: <meetingId>`.
6. If meeting was with a lender BDM, capture appetite signals separately into `appetiteSignals` with `sourceType: "bdm_meeting"`.
7. If any agreed next step requires outbound communication (a draft email confirming next steps, a calendar invite for the next meeting), stage it as an `approvals` row.
8. Mark the meeting `verified: true`.
9. Return a brief summary to the operator: what was captured, what was queued, what needs review.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Faithful to the source.** Do not paraphrase decisions into something punchier. The exact wording matters for downstream skills.
- **Conservative on intelligence writes.** If the transcript implies but does not state a figure, do not write it as a `knowledgeItems` row. Flag for operator review instead.

## Tool dependencies

- `meeting.get`, `meeting.update`, `meeting.verify`
- `meetingTranscript.getByMeeting` (or the transcript file directly)
- `task.create` for RockCap-side action items
- `knowledge.addItem` for intelligence extracted
- `appetite.create` for BDM-meeting outputs
- `approval.create` for follow-up communications
- `intelligence.queryIntelligence` (for conflict detection against existing data)

## What goes wrong

1. **Transcript is too sparse**: meeting was short, mostly small talk, or Fireflies failed to capture audio. Skill produces a minimal record and flags for operator amendment.
2. **Attendee attribution failed**: participant emails do not resolve to contacts. Skill records the meeting against the resolved subset and flags the unresolved emails.
3. **Multiple deals could be the subject**: contact has more than one active project. Skill picks the most recently active and surfaces the choice for confirmation.
4. **Conflict with existing intelligence**: transcript states GDV £18m, `knowledgeItems` has GDV £16m. Skill writes the new value with `status: "pending_review"` and an `intelligenceConflicts` row referencing both.
5. **Sensitive content**: legal advice, off-record commentary, personal information. Skill captures structurally but flags such segments with `confidentiality: "sensitive"` so they do not feed downstream skills without a higher-trust gate.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../shared-references/document-checklist-canon.md` (for action-item-to-checklist mapping)
- References for this skill to be authored: `action-item-ownership-rules.md`, `intelligence-extraction-from-transcript.md`.
