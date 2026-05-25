# Capture extraction template

Loaded by `../SKILL.md` step 4. The canonical shape for what gets extracted from a transcript (or pasted notes) into the meeting record fields.

## Format

The output is FOUR distinct artefacts (not one prose blob), each with a clear shape. Each maps directly to a field on the `meetings` row populated via `meeting.update`.

```typescript
{
  summary: string,           // 2-3 sentence narrative
  keyPoints: string[],       // 5-8 substantive bullets
  decisions: string[],       // explicit decisions, faithful wording
  actionItems: Array<{
    id: string,              // generate UUID at capture time
    description: string,     // verbatim from transcript where possible
    assignee: string,        // person name; default "TBD" if unclear
    dueDate?: string,        // ISO date if stated in transcript
    status: "pending",       // always pending at capture time
    createdAt: string,       // ISO timestamp of capture
  }>
}
```

## Field-by-field rules

### `summary` (2-3 sentences)

Narrative of what happened in the meeting. Open with the purpose, close with the next step. Examples:

✅ "Bayfield walked us through the Comberton scheme: 18 units, GDV £8.5m, planning approved, on-site Q3 2026. They asked us to source a £6m senior facility with bridging while planning conditions discharge. Next step: send the lender brief by Friday."

❌ "Had a great call with Bayfield today. They're really excited about Comberton. Great team. Looking forward to working together on this one!" (No substance, no specific next step, vibes-based)

❌ "Discussed financing for Bayfield's project." (Too vague; no scheme name, no figures, no next step)

### `keyPoints` (5-8 bullets)

Substantive content from the meeting that isn't a decision or action item. Each bullet should be capable of standing alone. Examples:

✅
- "Bayfield team has delivered 4 schemes in the last 5 years, all in Cambridgeshire"
- "GDV on Comberton is £8.5m; they need £6m senior + £750k mezz"
- "Planning approved March 2026 with 14 conditions; 6 still to discharge before commencement"
- "Sponsor equity is £2m cash; they've ruled out land-as-equity"
- "Started conversations with Octopus + Pluto; both indicated 3-4 week turnaround on bridging"

❌
- "Discussed planning" (too vague)
- "Talked about other deals" (irrelevant to record)
- "Sponsor seems experienced" (opinion, not fact)

### `decisions` (explicit + verbatim where possible)

Explicit decisions the meeting reached. Faithful to source wording. Examples:

✅
- "Bayfield will provide the appraisal by Friday 30 May"
- "RockCap will send the lender brief to Octopus + Pluto + Together by end of next week"
- "We will NOT include Allica in this round (too small for their sweet spot)"
- "Next check-in scheduled for 12 June, 10am — Stephen to send invite"

❌
- "Bayfield said they'd send the appraisal soon" (paraphrased; loses commitment)
- "Decided to send the brief" (no who-to-whom, no when)

### `actionItems` (per-action with owner attribution)

Owner classification per `../SKILL.md` rules. Each action item should be capable of being followed up on independently. Examples:

✅
```json
[
  {
    "id": "ai-001-uuid",
    "description": "Send appraisal for Comberton",
    "assignee": "Bayfield (James)",
    "dueDate": "2026-05-30",
    "status": "pending",
    "createdAt": "2026-05-25T16:45:00Z"
  },
  {
    "id": "ai-002-uuid",
    "description": "Draft lender brief and circulate to Octopus + Pluto + Together",
    "assignee": "RockCap (Kristian)",
    "dueDate": "2026-06-06",
    "status": "pending",
    "createdAt": "2026-05-25T16:45:00Z"
  },
  {
    "id": "ai-003-uuid",
    "description": "Follow up with Bayfield on planning conditions schedule",
    "assignee": "RockCap (TBD)",
    "status": "pending",
    "createdAt": "2026-05-25T16:45:00Z"
  }
]
```

❌
- Action items without an assignee → default to "TBD" + flag low-confidence in description
- Action items without dueDate → omit the field (don't fabricate a date)
- Action items that paraphrase the decision rather than add a follow-up step

## Intelligence extraction (separate from meeting fields)

Beyond the 4 meeting fields, the capture skill ALSO mines the transcript for `knowledgeItems` row creation. These are NOT part of the meeting record itself; they go to clientIntelligence / projectIntelligence via `intelligence.addKnowledgeItem` (when MCP tool exists; fallback: list in skillRun.complete.gaps).

Intelligence findings shape:

```typescript
{
  clientId: Id<"clients">,
  projectId?: Id<"projects">,
  fieldPath: string,        // e.g., "gdv", "tdc", "planning.conditions.outstanding"
  value: any,
  valueType: "number" | "currency" | "string" | "array" | "boolean" | "date",
  sourceType: "call_transcript",
  sourceRef: string,        // the meetingId
  confidence: number,       // 0-1 based on transcript explicitness
  asOfDate: string,         // meeting date
}
```

**Confidence calibration:**

- `1.0` — value stated explicitly by an authoritative party (sponsor said "GDV is £8.5m")
- `0.8` — value stated by an attendee but qualified ("we're targeting GDV of about £8.5m")
- `0.6` — value derived from a calculation in the meeting ("at £475/sqft on 18,000 sqft, GDV is about £8.5m")
- `0.4` — value implied but not stated (the transcript references "the £8m+ deal" without confirming)
- `<0.4` — don't extract; flag for operator review instead

## Field path catalogue (common ones)

Use these standardised paths so downstream skills can query consistently:

| Field | Path |
|---|---|
| GDV | `gdv` |
| TDC | `tdc` |
| Build cost per sqft | `buildCost.perSqft` |
| Units count | `units.total` |
| Units mix | `units.mix` |
| Scheme address | `address.street` |
| Postcode | `address.postcode` |
| Planning status | `planning.status` |
| Planning ref | `planning.ref` |
| Planning conditions outstanding | `planning.conditions.outstanding` |
| Equity in deal | `equity.amount` |
| Equity type | `equity.type` (cash / land / mix) |
| Timeline to drawdown | `timeline.targetDrawdown` |
| Exit strategy | `exit.strategy` (sell / refi-btl / hold-let) |
| Sponsor track record | `sponsor.unitsCompleted5yr` |

Custom paths: free-form `<area>.<thing>` is fine for one-off findings; use camelCase.

## Decisions vs action items vs key points

A common confusion. The rule:

- **Decision**: a thing the meeting CONCLUDED. ("We will send the brief to Octopus + Pluto + Together.")
- **Action item**: WHO does WHAT by WHEN to execute on a decision (or to gather info needed for the next decision). ("Kristian to draft and send brief by Friday.")
- **Key point**: a substantive piece of information shared in the meeting that informed (or could inform) decisions. ("Bayfield has delivered 4 schemes in 5 years.")

If a thing is "we decided X AND Kristian will do X", it's both — capture once as a decision AND once as an action item.

If a thing is "we'd like to do X" without explicit agreement, it's a key point, not a decision. Decisions require explicit commitment.

## Format of the call to meeting.update

After extraction, the skill calls:

```typescript
meeting.update({
  meetingId: <id>,
  summary: <2-3 sentence narrative>,
  keyPoints: [<5-8 strings>],
  decisions: [<explicit decisions, faithful>],
  actionItems: [<structured per above>],
  attendees: [<refined with contactIds resolved where possible>],
  verified: true,  // for transcript / Fireflies; false for retrospective recall
})
```

## When extraction underdelivers

If the transcript is genuinely sparse (15-minute call, mostly intro, no decisions, no action items):

- `summary` is still 2-3 sentences but says so: "Brief intro call. Bayfield confirmed they're working on Comberton; no specifics discussed. Follow-up call scheduled for next week."
- `keyPoints` may be 2-3 bullets instead of 5-8
- `decisions` may be empty `[]` — that's correct
- `actionItems` may be a single "schedule the next call" item

Don't pad. A short capture for a short meeting is correct. Mark `verified: true` if the transcript was the source of truth; `verified: false` if it was a retrospective recall (operator may have missed details).
