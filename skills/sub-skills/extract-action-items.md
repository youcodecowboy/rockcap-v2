# extract-action-items

Pull action items from a meeting transcript or note, classify each by owner side and urgency. Used by meeting-capture (primary), deal-triage (to find outstanding actions), info-request-grader (when actions imply information requests).

## When to use

After a meeting transcript or operator-written note has been ingested and needs structured action capture.

## Inputs

Required (one of):

- `meetingId`: a `meetings` row with `actionItems` already populated by V4 extraction
- `transcriptText`: raw transcript or note text

Optional:

- `meetingContext`: `{ projectId?, clientId?, attendeeRoles? }` to help with ownership attribution
- `lookbackForOpenActions`: when true, also surface prior open action items from the same project for context

## Outputs

```ts
type ExtractedAction = {
  id: string;                            // local id from extraction
  description: string;                   // verbatim from the source
  ownerSide: "rockcap" | "client" | "lender" | "professional" | "unclear";
  ownerName?: string;                    // explicit name if one was said
  ownerContactId?: Id<"contacts">;       // resolved if possible
  dueDate?: string;
  urgency: "blocking" | "high" | "normal" | "low";
  category: "send_information" | "decision" | "meeting" | "document" | "introduction" | "other";
  relatedRequirementId?: Id<"knowledgeChecklistItems">;
  confidence: "high" | "medium" | "low";
};

type ExtractAction = {
  items: ExtractedAction[];
  notes: string[];
};
```

## Workflow

1. Get the action item strings. If `meetingId`, read existing `actionItems` from the meetings row. If `transcriptText`, run V4 extraction on the transcript.
2. For each item, classify ownership:
   - "RockCap will" / "We'll" / first-person plural with RockCap attendee → ownerSide `rockcap`.
   - "Sarah to" / second-person where Sarah is the client → ownerSide `client`.
   - Lender BDM named → ownerSide `lender`.
   - Solicitor / QS / valuer named → ownerSide `professional`.
   - Ambiguous → ownerSide `unclear`.
3. Resolve `ownerContactId` via `resolve-contact` where a name was named.
4. Classify category: send-information actions become checklist asks; document actions map to a document type from the canon; decisions stay as actions on the deal.
5. Score urgency: explicit deadlines ("by Friday") elevate; mentions of blocking conditions elevate to blocking; otherwise normal.
6. Where category is `send_information` and the action matches an existing `knowledgeChecklistItems` row, set `relatedRequirementId`.
7. Return the structured items.

## Style rules

CONVENTIONS apply. Two that matter most:

- **Verbatim descriptions.** Do not paraphrase. The exact wording matters for chasers and follow-up emails.
- **Conservative on owner attribution.** If unclear, `unclear` is the correct answer. Better than guessing and creating a task for the wrong person.

## Tool dependencies

- The V4 extraction primitive (when input is raw transcript text)
- `meeting.get` (for `meetingId` path)
- `resolve-contact`
- `knowledge.getChecklistByProject` (for related-requirement matching)

## What goes wrong

1. **Action with no clear owner**: skill assigns `unclear`. Meeting-capture surfaces unclear items for operator triage.
2. **Action that turns out to be a sub-task of a milestone**: skill captures both. The milestone's chase state can reference open action items in the next deal-triage run.
3. **Overlapping actions** ("I'll send the appraisal" said twice in the same meeting by different attendees): skill deduplicates by description similarity (Jaccard 0.7 threshold).
4. **Action that contradicts a prior commitment**: skill captures the new action; meeting-capture flags the contradiction.
