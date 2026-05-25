# Cadence-Fire Autonomy Engine — Design

**Date**: 2026-05-23
**Status**: Approved, awaiting implementation plan
**Author**: Brainstormed in Claude Code session
**Related**: `docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md` (lands the `skillRuns` substrate this design builds on), `skills/skills/cadence-fire/SKILL.md`, `skills/skills/prospect-intel/SKILL.md`, `skills/sub-skills/compose-approval.md`

## Context

The RockCap skills tree has 16 SKILL.md files scaffolded; the in-flight prospect-intel Level A hardening session is the first to be driven end-to-end against real data. That session lands `skillRuns` (audit substrate) and validates the operator-driven, gap-tolerant pattern.

This spec covers the **second hardening session**: `cadence-fire`, the autonomy engine that turns drafted touches into scheduled, auto-fired outreach. It is structurally different from the prospect-intel session because `cadence-fire` cannot be operator-driven in the same way — it is a server-side, event-driven runtime that fires on its own triggers (time-due or reply-received) rather than on operator invocation. The substrate it sits on (a `cadences` table, a cron, a webhook, an intent classifier sub-skill) does not exist yet and must be designed before any meaningful hardening run can happen.

The session lands the autonomy substrate that the broader gauntlet vision rests on: prospect-intel produces a cadence package (initial outreach + N pre-drafted follow-ups); this engine fires those touches on schedule, detects inbound replies, cancels active cadences, classifies reply intent, and dispatches to the next lifecycle skill. Without this engine, every skill in the pipeline is a draft-producer that requires manual invocation per touch — capping autonomy at roughly 30%. With it, autonomy scales to the 75% target the client v1 commits to.

The session also forces the first commitment to **event-driven autonomous skills** as the architectural model. Standard skills are reactive (operator invokes); the gauntlet's skills are event-driven (each owns a phase, sleeps until its trigger, drafts → approves → executes → hands off). This spec sets the runtime contract that all subsequent gauntlet skills inherit.

---

## 1. Goal and Success Criteria

### Goal

Land the cadence engine substrate (`cadences` and `replyEvents` tables, polling cron, Gmail push webhook, HubSpot-sync safety-net sweep, dispatcher, intent classifier sub-skill) and harden `cadence-fire` to the point where prospect-intel's drafted package fires automatically on schedule, an inbound reply cancels the package within seconds, and the reply is classified and dispatched to the next skill (or to an operator-review approval for unhandled intents).

### Success Criteria

The session is complete when all of the following are true:

1. **A prospect-intel output triggers a real cadence package.** prospect-intel writes the cadence rows; the dispatcher fires the initial touch into the approval queue; operator approval sends via Gmail; the engine advances state and queues the next due touch.
2. **An inbound reply cancels active cadences within seconds.** Gmail push delivers the inbound; the webhook handler cancels matching cadences; the cancellation is reflected in the `cadences` table and a `replyEvents` row records the cause.
3. **The intent classifier dispatches correctly across all six buckets.** A test reply per intent (or as many as can be produced naturally) routes to the right downstream destination: skill, opted-out marking, or operator-review approval.
4. **HubSpot sync sweep catches webhooks Gmail push missed.** A simulated push miss (drop the webhook deliberately, then run the HubSpot sync) results in the same cancellation + dispatch outcome via the safety-net path. Idempotency holds.
5. **The Gmail watch renewal cron runs and refreshes the watch.** Manually rewind a watch expiry to within the renewal window; confirm the cron re-issues the watch without operator action.

### Explicitly NOT Success Criteria

- All seven cadence types fully composing. v1 ships pre-drafted dispatch; dynamic-compose types (BDM, execution chasers, monitoring asks, client check-ins) defer to v1.1.
- meeting-prep and qualify-and-draft fully hardened. v1 dispatches to them; they may still produce operator-review approvals rather than autonomous drafts until their own hardening sessions.
- The long-term-monitor skill exists as a full skill. v1 queues the wakeup cadences; the skill that handles the wakeups when they fire defers to v2.
- Holiday calendar handling. v1 fires touches every business day without UK-bank-holiday awareness; this defers to v1.1 once the `holiday-calendar` sub-skill is written.
- Multi-channel cadences. v1 is email-only; phone reminders and LinkedIn touches defer to v2.

### Done Condition

All five success criteria met against at least one real cadence package produced by prospect-intel, or each unmet criterion has a written reason in the commit message or as an entry in the run's `gaps[]` array.

---

## 2. Architecture

### 2.1 Roles and Runtimes

Five components, two distinct runtimes.

```
                  ┌─────────────────┐
                  │  cadences table │  (event stream)
                  └────────┬────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
   TIME EVENT                            REPLY EVENT
   (Convex cron, 5 min)                  (Gmail push webhook +
                                          HubSpot sync sweep)
        │                                     │
        ▼                                     ▼
  ┌──────────┐                         ┌──────────────────┐
  │dispatcher│                         │intent-classify   │
  │(Convex)  │                         │sub-skill         │
  └─────┬────┘                         │(Next.js API)     │
        │                              └──────┬───────────┘
   ┌────┴────┐                                │
   │         │                  ┌─────────────┼─────────────┬──────────┬─────────┐
 PRE-DRAFTED  DYNAMIC           ▼             ▼             ▼          ▼         ▼
   │         │             book_meeting  defer_long_term not_intrstd info_qstn unknown
   │    ┌────▼─────┐            │             │             │          │         │
   │    │ composer │       meeting-prep long-term-monitor mark      qualify-  escalate
   │    │(Next API)│                              (stub)   opted-out and-draft to operator
   │    └────┬─────┘
   │         │
   ▼         ▼
  ┌─────────────┐
  │approvals row│
  └─────────────┘
        │
   operator approves
        │
        ▼
   gmail.send
```

**Components and their runtimes:**

| Component | Runtime | LLM? | Notes |
|---|---|---|---|
| `cadences` table | Convex | no | Durable event stream; the polling key |
| `replyEvents` table | Convex | no | Inbound audit trail; idempotency key |
| Dispatcher | Convex action (5-min cron) | no | Polls due rows; fires pre-drafted directly; calls composer for dynamic |
| Composer | Next.js API route + Anthropic SDK | yes | Loads cadence-fire SKILL.md as system prompt; runs the per-type composition; returns a touch |
| Gmail push webhook | Convex HTTP action | no | Receives push; fetches message; writes `replyEvents`; calls cancellation + classifier |
| HubSpot sync sweep | Convex action (existing 6h cron) | no | Safety net for missed push events; idempotent via `replyEvents.by_source_externalId` |
| Intent classifier | Next.js API route + Anthropic SDK | yes | Loads `classify-reply-intent` sub-skill as system prompt; returns intent + confidence + evidence |
| Gmail watch renewer | Convex action (daily cron) | no | Refreshes per-user Gmail watches before 7-day expiry; same pattern as existing Calendar channel renewal |

The dispatcher and composer split is deliberate: most fires are pre-drafted (cheap, no LLM, no latency), only the dynamic-compose cadence types need an LLM call at fire time. This keeps cost and tail-latency low as cadence volume scales.

### 2.2 Data Model

Two new tables plus one field addition to an existing table.

**Existing table addition: `contacts.optedOutAt` (and `contacts.optedOutByReplyEventId`):**

```typescript
// Added to existing contacts table definition
optedOutAt: v.optional(v.string()),                          // ISO; set by reply handler on not_interested intent
optedOutByReplyEventId: v.optional(v.id("replyEvents")),     // audit trail back to the triggering reply
```

These two fields support the `not_interested` intent dispatch (Section 2.5) and the opt-out skip check in the dispatcher (Section 2.3 step 3). Without them, the cadence engine has no way to permanently mark a contact "do not contact" — relying on past touchpoint keyword search is unreliable.

**`cadences` table** (`convex/schema.ts`):

```typescript
cadences: defineTable({
  // Identity
  cadenceType: v.union(
    v.literal("prospect_followup"),
    v.literal("warm_lead_chase"),
    v.literal("execution_chaser"),
    v.literal("client_checkin"),
    v.literal("bdm_relationship"),
    v.literal("monitoring_ask"),
    v.literal("post_lost_re_engagement"),
  ),
  userId: v.id("users"),

  // Targeting
  contactId: v.id("contacts"),
  relatedClientId: v.optional(v.id("clients")),
  relatedProjectId: v.optional(v.id("projects")),

  // Packaging (groups linked touches drafted as one batch)
  packageId: v.optional(v.string()),
  packageOrder: v.optional(v.number()),

  // Drafting mode (gauntlet feature)
  preDraftedTouch: v.optional(v.object({
    subject: v.string(),
    bodyText: v.string(),
    bodyHtml: v.string(),
    dynamicVars: v.optional(v.any()),
  })),

  // Scheduling
  nextDueAt: v.string(),
  intervalDays: v.optional(v.number()),
  scheduleConfig: v.optional(v.any()),

  // State machine
  isActive: v.boolean(),
  pauseUntil: v.optional(v.string()),
  lastFiredAt: v.optional(v.string()),
  lastResult: v.optional(v.string()),
  cancelledReason: v.optional(v.string()),
  cancelledByEventId: v.optional(v.string()),

  // Idempotency
  lastFireKey: v.optional(v.string()),

  // Failure tracking (incremented on retryable errors; cleared on next success)
  consecutiveFailures: v.optional(v.number()),
  errors: v.optional(v.array(v.object({
    at: v.string(),
    step: v.string(),
    message: v.string(),
  }))),

  // Origin (which skill run drafted this cadence)
  sourceSkillRunId: v.optional(v.id("skillRuns")),
})
  .index("by_next_due_active", ["isActive", "nextDueAt"])
  .index("by_contact_active", ["contactId", "isActive"])
  .index("by_package", ["packageId"])
  .index("by_user", ["userId"]),
```

**`replyEvents` table** (`convex/schema.ts`):

```typescript
replyEvents: defineTable({
  source: v.union(v.literal("gmail_push"), v.literal("hubspot_sync")),
  externalId: v.string(),                  // Gmail Message-ID header or `hubspot:engagement:${id}`; unique within source
  contactId: v.optional(v.id("contacts")),
  receivedAt: v.string(),
  rawMessageRef: v.optional(v.string()),   // Gmail thread URL or HubSpot engagement URL for debugging
  classifiedIntent: v.optional(v.string()),
  classifiedConfidence: v.optional(v.number()),
  classifierEvidence: v.optional(v.string()),
  cadencesCancelled: v.optional(v.array(v.id("cadences"))),
  dispatchedTo: v.optional(v.string()),
  dispatchedSkillRunId: v.optional(v.id("skillRuns")),
  processed: v.boolean(),
  errors: v.optional(v.array(v.string())),
})
  .index("by_source_externalId", ["source", "externalId"])
  .index("by_contact", ["contactId"])
  .index("by_processed", ["processed"]),
```

Indexing rationale:

- `cadences.by_next_due_active` is the cron's hot path. Query: `isActive=true AND nextDueAt <= now()`. Without the composite index, every cron tick scans the whole table.
- `cadences.by_contact_active` is the reply handler's hot path for cancellation. Query: all `isActive=true` rows for a contact.
- `cadences.by_package` supports package-level operations (cancel-all-in-package on reply, or status views).
- `replyEvents.by_source_externalId` is the idempotency guard. Both Gmail push and HubSpot sync write to this table; the (source, externalId) pair must be globally unique to prevent double-processing.

### 2.3 Time-Driven Flow

The cron tick is the heartbeat. Frequency: every 5 minutes.

**Per tick:**

1. **Query due cadences.** `cadences.by_next_due_active` where `isActive=true AND nextDueAt <= now()`. Cap at 100 per tick to bound work; backlog drains on subsequent ticks.

2. **For each due row, compute fire-key** as `${cadenceId}:${nextDueAt}`. If `lastFireKey === computed`, skip — this row already fired in a prior tick window that hasn't yet been reflected. Prevents duplicates on cron overlap.

3. **Skip checks (cheap, no LLM):**
   - `pauseUntil` is set and `now() < pauseUntil` → skip with `lastResult: "skipped_paused"`
   - Today is a UK bank holiday and `scheduleConfig.respectHolidays` is true → skip with `lastResult: "skipped_holiday"` (deferred to v1.1 when `holiday-calendar` sub-skill ships; v1 always fires)
   - Recent inbound from `contactId` since `lastFiredAt` → skip with `lastResult: "skipped_inbound_received"` (defence in depth; the reply handler should have already cancelled, but this catches races)
   - Contact has opt-out marker → skip with `lastResult: "skipped_user_opted_out"` and set `isActive: false`

4. **Branch by drafting mode:**

   **Pre-drafted** (`preDraftedTouch` present):
   - Optionally refresh `dynamicVars` via a Convex query (e.g., latest charge count, days-since-last-touch).
   - Pass `preDraftedTouch` to `compose-approval` sub-skill (existing) → creates `approvals` row with `entityType: "gmail_send"`, `requestSource: "cadence"`, `relatedCadenceId`.
   - No LLM call. Fire latency target: < 1 second per row.

   **Dynamic-compose** (`preDraftedTouch` absent):
   - Dispatcher POSTs to `/api/cadence-compose` Next.js route with `{ cadenceId }`.
   - Route loads `skills/skills/cadence-fire/SKILL.md` as system prompt, fetches cadence row + context, invokes Anthropic SDK with the relevant atomic tools (intelligence.query, companies-house.getCharges, etc.), runs the per-type composition path from the SKILL.md.
   - Returns composed touch; dispatcher creates the approval.
   - Defers to v1.1; v1 ships pre-drafted only.

5. **Advance state.** Patch `lastFiredAt: now()`, `lastResult: "sent"`, `lastFireKey: <computed>`. Compute next `nextDueAt`:
   - One-shot (no `intervalDays`): set `isActive: false`.
   - Recurring: `nextDueAt = now() + intervalDays * 86400000`. (Skip-aware: if next fire would land on a holiday, push to next business day. Deferred to v1.1.)
   - Package member with successor: leave package successor untouched; it has its own `nextDueAt`.

6. **Error handling.** If approval creation fails, patch `lastResult: "failed"`, append the error to the row's `errors` array, increment `consecutiveFailures`, do not advance `nextDueAt` (retry on next tick). When `consecutiveFailures >= 3`, set `isActive: false` and surface the row to the operator via the daily brief. On any successful fire, reset `consecutiveFailures` to 0.

### 2.4 Reply-Driven Flow

Two parallel paths: Gmail push (real-time) and HubSpot sync (safety net).

**Gmail push path:**

1. **Watch setup (one-time per user).** On user OAuth completion, register a Gmail watch via `users.watch` API. Store `watchExpiry` and `historyId` per user. Watch covers INBOX label; expires after 7 days.

2. **Push delivery.** Gmail POSTs to `convex.site/webhooks/gmail-push` with a base64-encoded payload containing `emailAddress` and `historyId`. The Convex HTTP action acknowledges immediately (200 OK) to prevent Gmail retries, then processes asynchronously.

3. **Fetch new messages.** Using stored OAuth token for `emailAddress`, call `users.history.list` since the last-stored `historyId`. For each new message, fetch via `users.messages.get`. Extract `Message-ID` header, sender email, subject, body.

4. **Idempotency check.** For each message, query `replyEvents.by_source_externalId` with `(source: "gmail_push", externalId: <Message-ID>)`. If present, skip. Else create row with `processed: false`.

5. **Contact match.** Query `contacts` by sender email. If no match → leave row with `processed: false` and `contactId: undefined`; eventual HubSpot sync may resolve later as a known contact. If match found, proceed.

6. **Cancel active cadences.** Query `cadences.by_contact_active`. For each, patch `isActive: false`, `cancelledReason: "inbound_received"`, `cancelledByEventId: <replyEventId>`. Append cancelled cadence IDs to `replyEvents.cadencesCancelled`.

7. **Invoke intent classifier.** Call `/api/classify-reply-intent` Next.js route with `{ replyEventId, replyBody, contactId, cancelledCadenceContexts }`. Route loads `skills/sub-skills/classify-reply-intent.md` as system prompt, invokes Anthropic SDK, returns `{ intent, confidence, evidence }`. Patch fields onto `replyEvents` row.

8. **Dispatch by intent** (Section 2.5).

9. **Mark processed.** Patch `processed: true`.

**HubSpot sync sweep path:**

The existing 6-hour HubSpot sync gains a post-processing hook. After activities sync, for each new inbound activity (`email_in`, `incoming_call`, `meeting`), compute an external ID (e.g., `hubspot:engagement:${engagementId}`) and run steps 4-9 above with `source: "hubspot_sync"`.

The idempotency guard in step 4 prevents double-processing when Gmail push has already handled the same message (it will have its own `gmail_push` row; HubSpot's `hubspot_sync` row will be a separate idempotency key but the cadence cancellation is already `isActive: false` so the operation is a no-op).

**Gmail watch renewal cron:**

Runs daily. Queries users where `watchExpiry < now() + 2 days`. For each, re-issues `users.watch` and updates `watchExpiry`. Same pattern as existing Calendar push channel renewal (`googleCalendarSync.ts`).

### 2.5 Intent Classifier

A new sub-skill at `skills/sub-skills/classify-reply-intent.md`. Same shape as existing sub-skills (`attribute-touchpoint`, `compose-approval`). Used by the reply-driven flow above.

**Interface:**

Inputs (passed by the Next.js classifier route):
- `replyBody`: the message body text
- `replySubject`: the message subject line
- `contactContext`: name, last few touchpoints, current relationship state (prospect / active / closed)
- `cancelledCadenceContexts`: the cadences this reply cancelled, with their type and the last fired touch's content (so the classifier can interpret the reply relative to what we sent)

Output (JSON):
```json
{
  "intent": "book_meeting" | "defer_long_term" | "not_interested" | "info_question" | "out_of_office" | "unknown",
  "confidence": 0.0 - 1.0,
  "evidence": "one-sentence quote or paraphrase from the reply that drove the classification"
}
```

**Intent vocabulary (v1):**

| Intent | Triggering language | Dispatch destination |
|---|---|---|
| `book_meeting` | "let's chat", "happy to discuss", "what times work", explicit accept | meeting-prep skill (drafts availability reply, will become full meeting-creation flow in later session) |
| `defer_long_term` | "not right now", "circle back in {N} months", "maybe in Q3", "interested but timing is wrong" | long-term-monitor skill (queues 3-month and 6-month wakeup cadences; v1 stub creates the cadence rows directly without invoking a skill) |
| `not_interested` | "no thanks", "remove me", "not a fit", "please stop" | Mark contact `optedOutAt: now()`; create no further cadences for this contact; record in `replyEvents.dispatchedTo: "opt_out_marker"` |
| `info_question` | A substantive question that isn't a meeting acceptance or rejection ("what rates do you see?", "do you handle bridging in Scotland?") | qualify-and-draft skill (drafts substantive reply; same caveat as meeting-prep: full hardening later) |
| `out_of_office` | Auto-responder signatures, "I'm away until {date}", calendar bounces | Restore the cancelled cadences (set `isActive: true`); bump `pauseUntil` by return-date if detectable, else 7 days |
| `unknown` | Confidence < 0.7, or none of the above match cleanly | Create an approval row with `entityType: "operator_review"`, body containing the reply text and the suggested-but-rejected intents; operator manually routes |

**Confidence threshold: 0.7.** Below this, force `intent: "unknown"` even if a label was produced. The cost of misrouting a reply (e.g., marking a "let's chat" as opted-out) is high; the cost of operator review is low. Tune later from observed data.

---

## 3. v1 Scope and Phasing

The session ships a focused cut. The full design above is the target; v1 implements the load-bearing slice that lets prospect-intel's cadence package fire end-to-end with reply handling, and defers everything not strictly needed for that.

### 3.1 v1 (this session, 4-5 days to client demo Wed/Thu)

**Schema:**
- `cadences` table with all fields and indexes
- `replyEvents` table with all fields and indexes
- `contacts.optedOutAt` and `contacts.optedOutByReplyEventId` fields added to existing table

**Convex side:**
- Dispatcher cron (5-min) handling **pre-drafted touches only**
- Gmail push webhook + watch setup
- Gmail watch renewer (daily cron)
- HubSpot sync sweep hook (extends existing 6h cron)
- Cancellation logic (set `isActive: false` on inbound)
- MCP tool: `cadence.create` (so prospect-intel can write cadence rows from its skill workflow)
- MCP tool: `cadence.cancel` (operator-facing, for manual cancellation)

**Skills side:**
- New sub-skill: `skills/sub-skills/classify-reply-intent.md`
- Update `skills/skills/cadence-fire/SKILL.md` to describe the v1 contract (pre-drafted dispatch only; dynamic compose marked as "deferred to v1.1")
- Update `skills/skills/prospect-intel/SKILL.md` to specify how it writes cadence rows (the package shape) as part of its workflow
- Add `## Cadence package` section to prospect-intel/SKILL.md (analogous to the `## Dedup` section pattern from the sibling spec)
- Add `### Event-driven skills` subsection to root `CLAUDE.md`

**Next.js side:**
- `/api/classify-reply-intent` route (LLM + sub-skill prompt loading)

**Cadence types fully wired in v1:**
- `prospect_followup` (the type prospect-intel's package members carry)

**Intent dispatch destinations in v1:**
- `not_interested` → mark opted-out (no skill needed)
- `defer_long_term` → queue wakeup cadences directly (stub for long-term-monitor skill)
- `out_of_office` → restore cancelled cadences + bump pause
- `book_meeting`, `info_question`, `unknown` → operator-review approval (the destination skills are not yet hardened; operator handles for now)

### 3.2 v1.1 (1-2 weeks after v1 ships)

- Composer: `/api/cadence-compose` Next.js route with full cadence-fire SKILL.md prompting
- Dynamic-compose cadence types: `execution_chaser`, `bdm_relationship`, `monitoring_ask`, `client_checkin`, `warm_lead_chase`, `post_lost_re_engagement`
- `holiday-calendar` sub-skill (UK bank holidays + weekend rules)
- meeting-prep skill hardening (so `book_meeting` dispatches to a real skill, not an operator-review approval)
- qualify-and-draft skill hardening (same for `info_question`)
- `/skill-runs` UI page or `/cadences` UI page in the app (today is Convex-dashboard-only)

### 3.3 v2 (later)

- long-term-monitor as a full skill that fires the wakeup cadences (today the cadences just exist; the wakeup-time composition is operator-handled)
- Multi-channel cadences (LinkedIn, phone reminders, physical mail)
- Concurrency hardening (multiple operators editing the same contact's cadence stream)
- Token cost capture per fire (observability for trust-building)

---

## 4. Definition of Done and Out of Scope

### 4.1 Definition of Done (Session-level)

The session is done when all of the following are true (or each false item has a written reason in the commit message or as an entry in the run's `gaps[]` array):

1. The two tables (`cadences`, `replyEvents`) are deployed with all indexes.
2. The dispatcher cron runs every 5 minutes; firing a manually-inserted pre-drafted cadence row produces a real `approvals` row within the next tick.
3. The Gmail push webhook is registered for at least one user; sending a test inbound from a known contact triggers cancellation of an active cadence and a `replyEvents` row within seconds.
4. The intent classifier sub-skill exists and the `/api/classify-reply-intent` route returns a valid classification for at least one test reply per intent bucket.
5. The HubSpot sync sweep processes inbound activities and is idempotent against any Gmail-push-handled messages (verified by inducing a missed-push scenario).
6. The Gmail watch renewal cron has been run at least once (manually or via tick) and successfully refreshes a watch.
7. prospect-intel has been updated to write cadence rows via `cadence.create` MCP tool as part of its workflow.
8. `npx next build` from `model-testing-app/` passes.
9. Commits pushed with `[app]` / `[skills]` / `[both]` prefixes.

### 4.2 Out of Scope (This Session)

Explicitly NOT in this session. Log if encountered; do not act on:

- Composer (`/api/cadence-compose`) and dynamic-compose cadence types. Defer to v1.1.
- meeting-prep, qualify-and-draft, long-term-monitor full skill hardening. They are dispatch destinations in v1 only via operator-review approvals or direct cadence queueing.
- Holiday calendar. v1 fires every day regardless.
- Multi-channel cadences (non-email).
- Per-fire token cost capture.
- `/cadences` or `/skill-runs` UI page (Convex dashboard is sufficient for v1).
- Hardening of other lifecycle skills not on the gauntlet's critical path.
- Repo split (BL-8.5).

### 4.3 Anti-scope-creep Rules

| Temptation | Correct action |
|---|---|
| "I see the composer would be useful for X, let me add it" | Defer to v1.1. Pre-drafted is enough for the prospect_followup path the demo needs. |
| "Let me harden meeting-prep too while we're routing to it" | No. v1 routes meeting-prep replies to operator-review approvals. meeting-prep hardening is its own session. |
| "While I'm in the webhook handler, let me add Slack notifications" | Out of scope. Convex dashboard + dailyBrief is the surface for v1. |
| "Let me also add `/cadences` UI" | Defer to v1.1. The hardening surface is the Convex dashboard. |
| "The intent vocabulary feels incomplete, let me add 3 more" | Six is the v1 vocabulary. Expand only after observing real misclassifications. |
| "Let me autonomously send instead of staging approvals" | No. Approval-gate is load-bearing for trust. v2 may revisit specific cadence types (BDM relationship pings could plausibly auto-send) but v1 stages everything. |

### 4.4 Next-session Preview (Likely, in Priority Order)

After this session ships, the queue most likely looks like:

1. **Verify in production with prospect-intel.** Run prospect-intel against a real prospect (the Bayfield Homes smoke test from the prior session, or a new one), confirm the cadence package writes, fires, and a manual test reply cancels correctly.
2. **v1.1 composer.** Build the `/api/cadence-compose` route. Unblocks the four dynamic-compose cadence types and the rest of the lifecycle skills that need server-side LLM execution.
3. **meeting-prep hardening** (next-most-leverage destination). Once meeting-prep can autonomously draft availability replies and create Google Calendar invites on confirmation, the book-meeting intent stops requiring operator review.
4. **qualify-and-draft hardening.** Same logic for info-question replies.
5. **long-term-monitor as a real skill.** So the queued wakeup cadences fire with meaningful content, not just placeholders.
6. **batch ingest (XLSX → fan-out)** skill or operator interface. Makes prospect-intel batch-capable, completing the gauntlet's entry point.

These are previews, not commitments. Actual order is set by what this session surfaces.

---

## 5. Open Considerations (Acknowledged, Deferred)

These were raised and consciously deferred during the brainstorm:

- **Watch expiry race.** Gmail watches can expire mid-day if the renewal cron hasn't run yet. Mitigation: HubSpot sync sweep catches anything Gmail push misses. Long-term fix: renewer runs more aggressively when expiry is within 24h.
- **Contact-match ambiguity.** A reply from `john@example.com` may match multiple `contacts` rows if data is dirty. v1 picks the most recently updated; v1.1 may add a disambiguation gate via operator-review approval if multiple match.
- **Composer cost scaling.** When v1.1 ships dynamic-compose, every fire of those types costs an LLM call. Per-day budget alert is sensible but deferred.
- **Reply classification drift.** The classifier's accuracy depends on the sub-skill prompt's calibration. v1 ships with the threshold at 0.7; expect to tune from observed misroutes in the first two weeks of use.
- **Multi-operator concurrency.** If two operators each have their own user and both have cadences pointing at the same contact, an inbound reply cancels both their cadences. Probably correct, but worth confirming once the team is multi-operator.
- **GDPR / opt-out persistence.** When a contact is marked opted-out, that should propagate to future skill runs (prospect-intel should not start a new cadence on an opted-out contact). v1 needs a check in prospect-intel's workflow; documenting here as a downstream impact.
- **Idempotency window.** The fire-key is `cadenceId:nextDueAt`. If `nextDueAt` is patched to a slightly-different timestamp between ticks, the same row could fire twice. Mitigation: only patch `nextDueAt` *after* a successful fire, never before.

If any of these become urgent before the next session, they get their own spec.

---

## 6. References

- `skills/skills/cadence-fire/SKILL.md` — the skill being hardened; v1 work updates its contract
- `skills/skills/prospect-intel/SKILL.md` — the skill that produces cadence packages; v1 work adds the `cadence.create` calls to its workflow
- `skills/sub-skills/compose-approval.md` — existing sub-skill the dispatcher uses for approval creation
- `skills/sub-skills/attribute-touchpoint.md` — existing primitive; relevant to the reply-side audit trail
- `skills/CONVENTIONS.md` — voice and output rules for the new sub-skill content (UK English, no em-dashes, no rule-of-three)
- `model-testing-app/convex/schema.ts` — where the two new tables are added
- `model-testing-app/convex/crons.ts` — where the dispatcher and watch renewer crons are registered
- `model-testing-app/convex/mcp.ts` — where the `cadence.create` and `cadence.cancel` MCP tools are added
- `model-testing-app/convex/gmailSend.ts` — existing Gmail send infrastructure; webhook handler will share OAuth token reading patterns
- `model-testing-app/convex/googleCalendarSync.ts` — reference pattern for watch renewal cron
- `model-testing-app/convex/hubspotSync/` — where the sync sweep hook is added
- `docs/superpowers/specs/2026-05-23-prospect-intel-level-a-hardening-design.md` — sibling spec; lands the `skillRuns` substrate this design references via `sourceSkillRunId`
- Root `CLAUDE.md` — v1 session adds an `### Event-driven skills` subsection under `## Workflow Rules`, companion to the `### Skill execution` subsection from the sibling spec. Captures: (1) the dispatcher/composer split, (2) the reply-event flow, (3) the rule that any skill writing cadences must include a `## Cadence package` section in its SKILL.md analogous to the `## Dedup` section pattern
