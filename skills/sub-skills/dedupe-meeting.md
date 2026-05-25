# dedupe-meeting

Determine whether an incoming meeting (from Fireflies sync, calendar capture, or manual entry) is a duplicate of an existing `meetings` row. Used by Fireflies sync (BL-3.3), meeting-capture skill, and any future calendar-to-meeting bridge.

## When to use

Every time a meeting record is about to be inserted into `meetings`. Prevents duplicate rows when the same physical meeting reaches RockCap via more than one source (e.g., Fireflies API plus a HubSpot activity that mirrors the same call).

## Inputs

Required:

- `proposedMeeting`: `{ title, meetingDate (ISO), attendeeEmails[], firefliesId?, durationMs?, sourceIntegration }`

Optional:

- `clientIdHint`: if attribution has resolved a client, narrows search scope

## Outputs

```ts
type DedupResult =
  | { kind: "duplicate"; meetingId: Id<"meetings">; matchReason: string }
  | { kind: "likely_duplicate"; candidates: MeetingCandidate[]; reason: string }
  | { kind: "unique" };
```

## Workflow

1. **Hard match by firefliesId**: if `proposedMeeting.firefliesId` is set, look up `meetings.getByFirefliesId`. If hit → duplicate, return.
2. **Hard match by source + sourceRef**: same provider, same payload id. Duplicate.
3. **Soft match by date + attendees**:
   - Query `meetings.getByClientDate` if `clientIdHint` set, else broader.
   - Window: meetings within ±2 hours of `proposedMeeting.meetingDate`.
   - Compare attendee email sets. If the overlap is more than 50% of the smaller set, treat as a candidate match.
4. **Soft match by title fuzz**: titles often differ slightly between calendar and transcript ("Call with John Smith" vs "John Smith / RockCap"). Tokenise and compute Jaccard similarity. Threshold 0.5.
5. If any soft signal is strong enough alone (date within 30 minutes + at least one shared attendee), return `likely_duplicate` with the candidate. Otherwise `unique`.

## Style rules

CONVENTIONS apply. One that matters: skill prefers false-likely-duplicate over false-unique. A flagged candidate that turns out to be different is an operator click; a missed dupe is a long-term data quality bug.

## Tool dependencies

- `meeting.getByFirefliesId`
- `meeting.getByClientDate` (when `clientIdHint`), or `meeting.list` with a date filter
- No external services

## What goes wrong

1. **Recurring meeting with same attendees**: weekly check-in produces a meeting every Tuesday. Skill correctly identifies separate meetings by date.
2. **Meeting that ran longer than expected**: actual end pushed by hours. Skill matches on start; duration mismatch is informational only.
3. **Attendee list differs because Fireflies caught only the ones who spoke**: skill still matches via 50% overlap; flag for operator review if the difference is large.
4. **Re-sync of the same Fireflies transcript** (e.g., backfill running again): `firefliesId` hard-match catches this immediately.
