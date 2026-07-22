# intel-revalidate

The cheap, diff-focused freshness pass that runs *between* full prospect-intel reports. Full prospect-intel (mode 1) gathers the whole picture from scratch; intel-revalidate (mode 2) answers a single, much cheaper question: **has anything material changed since the last full intel?** — new/satisfied Companies House charges, a company-status change, new planning or scheme activity, or significant news.

It returns one of two verdicts:

- `still_valid` — nothing material has changed; existing intel and any in-flight outreach are safe to proceed.
- `materially_changed` — concrete new evidence exists; the prospect needs attention before the next touch, and any due cadence touch is **held** (not fired) until re-drafted.

## Runtime contract (event-driven, 2026-06-26)

intel-revalidate is primarily **event-driven**, not operator-invoked. It runs in three ways:

1. **Trigger A — meeting booked + stale intel** (no LLM call). When a meeting is booked and the last full prospect-intel completed more than `INTEL_STALE_DAYS` (7) days ago, `convex/intelRevalidate.ts → onMeetingBookedInternal` raises a client-level "refresh intel" attention flag (`intelAttentionAt` / `intelAttentionReason = 'meeting_booked_stale'`). This is a nudge surfaced in the requires-attention queue, not an autonomous re-check.

2. **Trigger B — 30-day cadence gap** (autonomous LLM call). Inside the 5-minute `cadenceDispatcher.tick`, before firing a due touch whose gap since the prospect's last outreach send exceeds `CADENCE_REVALIDATE_GAP_DAYS` (30) days, the dispatcher calls `runRevalidateInternal` synchronously. `still_valid` → fire as normal; `materially_changed` → hold the touch (`cadences.holdForIntelInternal`, preserving `nextDueAt`) and raise the attention flag. A 7-day guard on `lastIntelRevalidateAt` prevents re-running on every tick.

3. **Operator quick re-check** (this skill, Claude Code). An operator asks for a fast re-check on a prospect ("has anything changed on Acme since we last looked?"). Run the workflow below, persist the verdict, and surface it.

**No autonomous external action.** A `materially_changed` verdict only *flags* (attention) and *holds* (cadence). It never sends, never writes to HubSpot, never contacts anyone. Sends always route through the existing approvals gate (per CLAUDE.md event-driven-skills rule 4).

**Fail-open.** The autonomous route (`/api/intel-revalidate`) and `runRevalidateInternal` treat any error (CH lookup failure, Anthropic error, timeout) as `still_valid` so a flaky dependency never silently blocks outreach. The gap is recorded on the skillRun's `errors[]` for audit.

## Trigger

- Event: the cadence dispatcher (Trigger B) or the meeting-booked hook (Trigger A) — handled by Convex, not by this skill.
- Operator: "run a quick re-check / re-validate intel on `<prospect>`".

## Inputs

Required:

- `clientId` — the prospect (`clients` row) to re-validate.

Resolved if omitted:

- `companyNumber` — the prospect's `companiesHouseNumber` (used as the dedup key).
- `sinceIso` — the date of the last full intel (the `clients.lastFullIntelAt` client-row field, no MCP tool); the diff window base.

## Dedup

- `dedupKey` = Companies House number.
- `dedupWindowDays` = **1**. Revalidate is cheap and meant to run often, so the window is short. On a same-day duplicate, open and surface the prior verdict rather than re-running; allow a `force` flag on the manual MCP tool when the operator has genuinely new information (e.g. they just edited the prospect).

## Workflow

1. **Start the run.** `skillRun.start` with `skillName: "intel-revalidate"`, `dedupKey` = CH number, `dedupWindowDays: 1`. Honour a `duplicate_found` response (surface the prior verdict, ask before continuing).
2. **Load the baseline.** Read the prospect (`client.get`) and its captured knowledge graph-first: `prospect.getDeepContext` (its `graph` section — atom/contested counts, top edges, facilities) plus `atoms.search` for the specific captured facts — this is the "last known state" to diff against. If the graph section is empty (client not yet atomized), fall back to `intelligence.getClientIntelligence`.
3. **Pull the current state.** Look up current charge-holder / Companies House data for the company number. Note new charges, satisfied/released charges, and any company-status change versus the baseline.
4. **Light external check.** Search for new planning or scheme activity and significant news since `sinceIso`. Keep it light — this is a diff, not a full re-investigation.
5. **Decide the verdict.** Bias **hard** toward `still_valid`. Only return `materially_changed` when there is concrete, citable new evidence (a charge id, a planning reference, a status, a URL). When in doubt, `still_valid`.
6. **Persist.** `skillRun.complete` with `linkedClientId` + `revalidateResult` (the complete call itself stamps `lastIntelRevalidateAt` / `lastIntelResult` onto the client — `intel.recordRevalidateResult` was never built — no MCP tool), a one/two-sentence `brief`, and the evidence-cited `findings` in `intelMarkdown`.

## Outputs

Persisted to Convex:

1. A `skillRuns` row (`skillName: "intel-revalidate"`) carrying `revalidateResult` (`still_valid` | `materially_changed`), a short `brief`, and the diff narrative in `intelMarkdown` (rendered in the prospect's Intel tab as a lightweight diff entry, distinct from full prospect-intel reports).
2. Denormalised client freshness stamps: `lastIntelRevalidateAt`, `lastIntelResult`.
3. On `materially_changed`: the client attention flag (`intelAttentionAt`, `intelAttentionReason = 'revalidate_materially_changed'`). If the trigger was a cadence touch, that touch is held (`cadences.intelHoldAt`).

What it does NOT do:

- Does not gather full intel (that's prospect-intel / mode 1).
- Does not send, draft outreach, or write to HubSpot.
- Does not fire or advance cadences itself (the dispatcher owns that; this skill only returns the verdict).

## Findings shape

Each finding is evidence-cited so the operator can judge a hold at a glance:

```json
{ "kind": "new_charge" | "satisfied_charge" | "status_change" | "planning" | "news",
  "detail": "concise, specific (charge id / planning ref / status / headline)",
  "sourceUrl": "https://… (optional)" }
```

## Tool surface

- `client.get`, `prospect.getDeepContext` (graph section), `atoms.search` — baseline reads. Fallback only: `intelligence.getClientIntelligence` / `intelligence.queryIntelligence` when the graph section is empty (client not yet atomized).
- Companies House / charge-holder lookup for the current-state diff.
- `intel.revalidate` (operator-driven mode 2, returns verdict + findings), `skillRun.start` / `skillRun.complete` (completing with `linkedClientId` + `revalidateResult` persists the verdict + freshness stamps — no separate persist tool).

Known gap: live web-search and a direct Companies-House-sync atomic tool are not yet in the autonomous route's tool registry (see the route's `ALLOWED_TOOL_NAMES`). Until they land, the autonomous pass leans on captured `clientIntelligence` plus the charge-holder lookup; the operator-driven path (this skill, in Claude Code) has the full MCP surface and should be preferred when a thorough diff matters.
