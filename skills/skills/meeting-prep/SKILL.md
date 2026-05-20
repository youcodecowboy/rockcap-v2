# meeting-prep

Step 5 of the deal lifecycle (pre-call half). Loads a complete picture of the relationship and the deal just before a meeting so the operator walks in informed.

## Trigger

Invoke before a scheduled meeting with a prospect, client, lender BDM, or professional adviser. Typical forms:

- "Prep me for the call with {Sarah at Borrower Co.} tomorrow morning"
- "Brief for the {Lender BDM} catch-up at 11"
- "What do I need to know before the {Scheme} site visit"

The skill needs to resolve to a calendar event or a person + datetime.

## Inputs

Required (one of):

- `calendarEventId`: id of an `events` row
- `contactId` and `meetingDate`: person plus when

Optional:

- `relatedProjectId`: if the meeting is about a specific deal
- `meetingTitle`: helpful if the calendar event title is generic ("Call")

## Outputs

Returns to the operator inline (no Convex writes):

1. **Header**: who, when, where (in-person / phone / video).
2. **Relationship snapshot**: how long we've known them, last touch, who else at the firm has touched them.
3. **Active context**: live deals with this contact, current dealPhase, outstanding asks in either direction.
4. **Recent activity** (last 60 days): touchpoints in chronological order, most recent first. Subject lines and one-line summaries.
5. **What likely needs addressing**: action items from prior meetings not yet closed, information requests pending, milestones approaching.
6. **Suggested talking points**: 3 to 5 bullet points grounded in the above.

## Workflow

1. Resolve to a `contactId` and `meetingDate`. If only `calendarEventId` given, read the event and resolve attendees.
2. Load the contact, the contact's organisation, any related project(s).
3. Pull `touchpoints.getByContact` for the last 60 days.
4. Pull `meetings.getByClient` for prior verified meeting summaries.
5. Check `knowledgeChecklistItems` for outstanding requirements relevant to the contact's deal phase.
6. Check `milestones` for upcoming or at-risk items on the relevant project.
7. If the contact is a lender BDM, pull `appetiteSignals` for that lender; recent signals lead the brief.
8. Compose the brief in the shape above. Stop at 1 page of content; longer briefs go unread.

## Style rules

All CONVENTIONS apply. Two that matter most:

- **Scannable, not narrative.** The operator may read this in the lift on the way to the meeting. Bullet points over paragraphs.
- **Evidence over opinion.** Cite specific touchpoints and dates. If the brief suggests a talking point, ground it in a concrete prior signal, not a vibes-based hunch.

## Tool dependencies

- `event.get`, `contact.get`, `client.get`, `project.get`
- `touchpoint.getByContact`, `meeting.getByClient`
- `knowledge.getChecklistByProject`
- `milestone.getByProject`
- `appetite.getCurrentForLender` (when contact is a BDM)
- `intelligence.queryIntelligence`

## What goes wrong

1. **No history**: brand new contact. Brief says so explicitly, suggests qualification questions instead of follow-up points.
2. **Ambiguous attendees**: calendar event has multiple unfamiliar names. Brief flags the unknowns and asks the operator to clarify.
3. **Stale data**: last touch was over six months ago. Brief surfaces the gap; the meeting may be re-introduction territory.
4. **Conflict in intelligence**: prior touchpoints disagree on a key fact (e.g., GDV). Brief surfaces the conflict; do not pick a winner.

## References

- `../../shared-references/uk-property-finance-glossary.md`
- `../../sub-skills/resolve-company.md` (for attendee resolution)
- This skill's own references to be authored when patterns emerge.
