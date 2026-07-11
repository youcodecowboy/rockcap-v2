# meeting-prep

Step 5 of the deal lifecycle (pre-call half). Loads a complete picture of the relationship and the deal just before a meeting so the operator walks in informed.

**v2 hardening (2026-05-25):** retargeted at the v1.3 substrate. `prospect.getDeepContext` / `client.getDeepContext` replaces 5-7 prior individual reads (contact, client, project, touchpoints, meetings, intelligence, CH profile). `meeting.get` reads a specific scheduled meeting. `meeting.listUpcoming` powers "what calls do I have today". The responder mode for `book_meeting` replies (v1.1) stays unchanged in shape — both modes now use the deep-context primitive for the relationship-snapshot phase.

## Trigger

Two invocation modes:

1. **Pre-call brief mode** (interactive, the original): operator invokes before a meeting wanting context. Examples:
   - "Prep me for the call with Sarah at Borrower Co. tomorrow morning"
   - "Brief for the Lender BDM catch-up at 11"
   - "What do I need to know before the Comberton site visit"
   The skill resolves to a calendar event or a person + datetime + returns an inline brief.

2. **Responder mode** (event-driven, v1.1+): the reply event processor invokes `/api/meeting-prep-respond` when a reply intent classifies as `book_meeting`. Input is a `replyEventId`. Output is a structured JSON with a drafted availability email + 3 suggested slots, which the route then stages as an approval via `outreach.draftReply`.

Both modes use the deep-context primitive for relationship loading; they diverge on what they produce (inline brief vs JSON availability draft).

## Inputs

### Pre-call brief mode

Required (one of):
- `meetingId`: id of a `meetings` row (an already-scheduled meeting)
- `clientId` + `meetingDate`: client plus when (the meeting may not be in `meetings` table yet)
- `contactId` + `meetingDate`: contact-based path (resolves client via contact.clientId)

Optional:
- `meetingTitle`: helpful if the meeting title is generic ("Call")
- `meetingType`: progress / kickoff / review / site_visit / call / other — colours the brief's emphasis
- `extraContext`: anything the operator wants to feed in

### Responder mode

Required:
- `replyEventId`: id of the `replyEvents` row classified as `book_meeting`

The route reads `reply.get` to load body + subject + linkedClientId + linkedContactId.

## Dedup

- **dedupKey (pre-call brief mode)**: `prep:${meetingId}` if meetingId given, else `prep:${clientId}:${meetingDate}`.
- **dedupKey (responder mode)**: `respond:${replyEventId}`.
- **dedupWindowDays**: 1 (one prep per meeting per day; one response per reply event).
- **On `duplicate_found`**: return the prior brief / draft. Operator decides whether to refresh.

## Cadence package

This skill **does not** produce a cadence package. A meeting-prep brief is read-once; the responder mode produces a single email reply, not a sequence.

## Outputs

### Pre-call brief mode

Returns the brief inline to the operator (no Convex writes). Brief shape per `references/brief-template.md`:

1. **Header**: who, when, where (in-person / phone / video), meeting type
2. **Relationship snapshot**: how long we've known them, last touch, who else at the firm has touched them
3. **Active context**: live deals + projects with this client, current state, outstanding asks
4. **Recent activity (last 60 days)**: touchpoints + replies + cadence touches in chronological order, most recent first
5. **What likely needs addressing**: action items from prior meetings not yet closed, outstanding info requests, milestones approaching
6. **Suggested talking points**: 3-5 bullet points grounded in evidence above
7. **Pre-meeting actions**: any sends/approvals to handle before the call

If the operator wants the brief persisted (e.g., to share with a colleague), the skill creates a `skillRun.complete` with `intelMarkdown` set to the brief content. By default it's ephemeral.

### Responder mode

Returns the structured JSON output contract documented below. The route's caller (`/api/meeting-prep-respond` in the Next app) is responsible for staging the approval via `outreach.draftReply`.

## High-level workflow — pre-call brief mode

1. **Resolve the trigger.** Convert any of the input shapes (meetingId / clientId+date / contactId+date) into `clientId` + `meetingDate` + `contactId` (best-effort).

2. **Call `skillRun.start`** with `skillName: "meeting-prep"`, the appropriate `dedupKey`, `dedupWindowDays: 1`.

3. **Load full context — single call.** Call `prospect.getDeepContext({clientId})` (or `client.getDeepContext` — same query). One round-trip returns: identity, contacts, cadences (history of what we've sent), reply events (any inbound), meetings (upcoming + past), intel run, CH profile + charges, the knowledge-graph `graph` section (atom/contested counts, top edges, facilities), clientIntelligence, recent touchpoints, deals, projects, pending approvals. For counterparty specifics beyond the payload, follow up with `atoms.search` (facts + cited quotes) and `graph.expandEntity` on the counterparty (relationships, track record). The `clientIntelligence` payload is the fallback source only when the graph section is empty — client not yet atomized.

4. **Identify the specific meeting context.** If `meetingId` was given, find it in `getDeepContext.meetings.upcoming` for full attendee + type data. If `meetingDate` only, find the nearest upcoming meeting on or near that date. If no meeting record exists yet, infer from the input.

5. **Pull lender-specific context if applicable.** If the meeting is with a lender BDM (contact's company is a lender), call `intelligence.searchLenders` for that lender's recent appetite signals. Per CONVENTIONS, recent BDM signals lead the brief.

6. **Compose the brief.** Load `references/brief-template.md`. Fill each section using evidence from the deep-context payload. Cite specific touchpoint dates, meeting decisions, cadence sends. Stop at one screen of content; longer briefs go unread.

7. **Surface pre-meeting actions.** Pull `getDeepContext.pendingApprovals` — anything related to this client that's awaiting operator review. If a relevant approval is pending (e.g., qualify-and-draft reply not yet sent), flag it in section 7 of the brief.

8. **Call `skillRun.complete`** with `status: "complete"`, `brief` (one paragraph summarising what's in the brief), `linkedClientId`, optionally `intelMarkdown` (the full brief text, if operator wants it persisted).

## High-level workflow — responder mode (v1.1, unchanged shape)

When invoked via `/api/meeting-prep-respond`:

1. **Load the reply event** via `reply.get({replyEventId})` — yields subject, body, linkedContactId, linkedClientId, cadencesCancelled.

2. **Load deep context** via `prospect.getDeepContext({clientId: reply.linkedClientId})` — one call gets everything needed for tone matching + relationship history.

3. **Optionally load the cancelled cadences** from `getDeepContext.cadences.all` to find the original outreach this reply chained from. Quote the original briefly to confirm thread context.

4. **Propose 3 availability slots.** v1.1 uses operator-judgement defaults (next 3 business days at 10am UK time, OR a pattern documented in the operator's profile when available). v1.2 deferral: real Google Calendar `getAvailability` lookup. The skill marks the v1.2 gap in `gaps` array if defaults are used.

5. **Compose a short, warm reply.** Thank for the response, confirm interest, propose the 3 slots, ask which works best. ≤120 words. NO marketing, NO qualification questions (qualify-and-draft handles those for non-book_meeting intents).

6. **Return the JSON output contract** (below) to the route. The route then stages the approval via `outreach.draftReply`.

### Responder mode output contract (unchanged from v1.1)

Return ONLY a JSON object — no prose, no code fence:

```json
{
  "draftReplySubject": "Re: <original subject>",
  "draftReplyBody": "Plain-text reply body, no signature (the operator's email client adds it).",
  "draftReplyBodyHtml": "HTML version of the body for the approval payload.",
  "suggestedSlots": [
    { "iso": "2026-05-26T09:00:00Z", "display": "Tuesday 26 May, 10:00 UK time" },
    { "iso": "2026-05-27T13:00:00Z", "display": "Wednesday 27 May, 14:00 UK time" },
    { "iso": "2026-05-28T09:00:00Z", "display": "Thursday 28 May, 10:00 UK time" }
  ]
}
```

Or if a meeting reply is not appropriate (reply was misclassified):

```json
{
  "escalate": true,
  "reason": "reply does not actually accept a meeting; recommend operator review"
}
```

### Responder mode style

Same `## Style rules` as pre-call brief mode, plus:

- **Tone match.** Read the reply's tone; mirror it. Formal "happy to discuss" → formal response; casual "sure let's chat" → warm.
- **Don't over-pitch.** The prospect already said yes; the response confirms and proposes times. No marketing, no qualification.
- **Single ask.** One question: which time works? Don't add multiple questions about agenda, attendees, video link.

## Style rules

All `../../CONVENTIONS.md` rules apply. Three that matter most:

- **Scannable, not narrative.** Operator may read this in the lift on the way to the meeting. Bullet points over paragraphs.
- **Evidence over opinion.** Cite specific touchpoints and dates. If brief suggests a talking point, ground it in a concrete prior signal, not a vibes-based hunch.
- **Report-as-standalone-artefact.** Don't reference other prospects/clients in the brief body (same rule as prospect-intel + qualify-and-draft). Each brief stands on its own.

## Tool dependencies

This skill calls these MCP-exposed tools (v1.3):

- `prospect.getDeepContext` / `client.getDeepContext` — one-shot context load (replaces 5-7 individual reads; includes the `graph` section)
- `atoms.search` / `graph.expandEntity` — counterparty facts + relationships beyond the deep-context payload
- `meeting.get` — single meeting detail when meetingId given
- `meeting.listUpcoming` — for "what calls do I have today" inventory
- `reply.get` — responder mode entry
- `intelligence.searchLenders` — lender BDM contexts
- `skillRun.start` + `skillRun.complete` — standard wrapper
- `outreach.draftReply` (responder mode only) — staging the availability draft as an approval

The legacy tool list (`touchpoint.getByContact`, `meeting.getByClient`, `event.get` etc.) is subsumed by `getDeepContext`. Skills authored against v1.3 should NOT call those individually — one round-trip beats six.

## What goes wrong

1. **No history**: brand new contact. Brief says so explicitly, suggests qualification questions instead of follow-up points. The brief routes the operator to qualify-and-draft for the post-meeting follow-up.
2. **Ambiguous attendees**: meeting record has unfamiliar names not in our contacts table. Brief flags the unknowns and asks operator to clarify or create contacts (via `contact.create` MCP when available).
3. **Stale data**: last touch was over six months ago. Brief surfaces the gap; the meeting may be re-introduction territory. Suggest reading prospect-intel report (linked via `latestIntelRun`) for full refresh.
4. **Conflict in intelligence**: prior touchpoints disagree on a key fact (e.g., GDV). Brief surfaces the conflict; do not pick a winner.
5. **Responder mode: reply misclassified**: the reply was tagged book_meeting but actually isn't accepting a meeting. Return the `{escalate: true, reason: ...}` JSON shape; the route stages an operator-review approval instead of an availability draft.
6. **Responder mode: no Calendar availability available**: v1.1 ships with operator-default slots; mark a `v1.2_calendar_integration` gap in skillRun.complete.gaps when defaults are used.
7. **Pending approvals on the client that overlap with this meeting**: e.g., a qualify-and-draft reply still awaiting operator approval. The brief should flag "approve the pending draft BEFORE the call so the meeting can reference it as already-sent" in section 7.

## References

- `references/brief-template.md` — the canonical brief shape (v2 hardening)
- `../../shared-references/uk-property-finance-glossary.md` — vocabulary checks
- `../../sub-skills/resolve-company.md` — for attendee resolution when contact records aren't found
- This skill's own references to be authored as patterns emerge (e.g., lender-BDM-brief-template.md as the lender pattern stabilises)
