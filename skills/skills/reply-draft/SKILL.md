# reply-draft

Autonomous reply composer for the **reply lifecycle**. When an inbound reply is classified `info_question` or `positive`, the reply-event processor calls `/api/reply-draft`, which drafts a personalised, threaded reply and hands it back so the processor can stage an editable `client_communication`/`email_reply` approval. The operator accepts, edits, or rejects it inline in the requires-attention queue / Replies tab — no Claude Code session required.

This skill is the event-driven sibling of `qualify-and-draft`: it reuses that skill's compose workflow and style rules, but runs server-side, unattended, and pure-functionally (no Convex writes — the processor owns approval staging).

## Trigger

Event-driven only. Fired by `convex/replyEventProcessor.ts` → `dispatchByIntent` for these classified intents:

- `info_question` — a substantive question that needs a grounded answer.
- `positive` — a meaningful, forward-moving reply that is neither a meeting request nor a specific question (e.g. "this sounds interesting, tell me more", "good timing, we're looking at our next site"). This is the bucket between `book_meeting` (own path) and `defer_long_term` (parked).

`book_meeting` keeps its own path (`/api/meeting-prep-respond`) but the processor now stages its output as the same `email_reply` approval shape, so all three render and act identically.

`not_interested` and `out_of_office` are **flag-only** — no draft. They raise a needs-action flag for an operator keep/lost decision.

## Inputs

POST body to `/api/reply-draft` (server-to-server, `x-convex-internal-secret` auth):

- `replyEventId` (required): id of the `replyEvents` row to respond to. The route loads it via `api.replyEvents.getById` for subject, body, contactId, linkedClientId, classifiedIntent, classifierEvidence.

## Tool surface

Narrow, read-only atomic tools (no writes):

- `getContact` — who replied.
- `getClient` — the prospect/relationship.
- `getProject` — any associated project.
- `atoms.search` — grounded specifics for the "what we can do" sentence and to check which qualification gaps are already closed (graph-first: hybrid fact + prose-chunk retrieval). `getClientIntelligence` is the fallback when the client's graph is empty (not yet atomized).

## Output contract

Returns ONE JSON object, no prose, no code fence:

```json
{
  "draftReplySubject": "...",
  "draftReplyBody": "... (plain text)",
  "draftReplyBodyHtml": "... (html version)",
  "reasoning": "1-2 sentence summary for the operator's quick-review"
}
```

Or, when the inbound is misclassified / not answerable (a complaint, opt-out, or genuinely ambiguous):

```json
{ "escalate": true, "reason": "<brief reason>" }
```

On `escalate` (or any HTTP/parse failure), the processor falls back to an operator-review approval and raises a `reply_received` needs-action flag.

## Compose rules

Inherits the qualify-and-draft style rules (`../qualify-and-draft/SKILL.md` + `../../CONVENTIONS.md`). The five that matter:

- **Cite the inbound.** Open by acknowledging the specific thing they wrote.
- **Cite our intel.** Ground the "what we can do" sentence in real knowledge from `atoms.search` (falling back to `getClientIntelligence` for a not-yet-atomized client), not generic claims.
- **Three questions maximum** (info_question): ask only the highest-leverage qualification gaps; hold the rest for the call.
- **Match the register.** Mirror their length and warmth.
- **Propose the next step.** Close with a call (info_question) or the next concrete action (positive).

## What it does NOT do

- Does not send. The approval is the gate; the operator accepts.
- Does not write to Convex. The processor stages the `email_reply` approval (`draftPayload.kind = "email_reply"`, `threadId`/`inReplyTo` from the inbound), raises the `reply_received` needs-action flag, and notifies the operator.
- Does not change `pipelineStage`. Reply events never advance the pipeline (the meeting workstream owns meeting-booked → warm_pre_meeting).
- Does not re-classify. The classifier already routed the reply here.

## Flag lifecycle

The processor raises a `reply_received` needs-action flag (scoped by `sourceReplyEventId`) when the draft is staged. On a successful outbound send, `executeClientCommunication` clears that flag — so both MCP-approve and UI-approve paths clear it. Flag-only intents (`not_interested`/`out_of_office`) raise `reply_flag_only`, cleared by the operator's Dismiss action.

## Dependency — classify-reply-intent `positive`

This skill is inert unless the classifier can emit `positive`. The `classify-reply-intent` sub-skill's intent vocabulary + output enum must include `positive` (between `info_question` and `defer_long_term`), and the embedded `CLASSIFY_REPLY_INTENT_PROMPT` must be re-generated. Without it, these replies stay `unknown` → operator_review.
