# outreach-triage

The operator's outreach control loop, invoked as `/outreach`. One pass over
**every** open prospecting action — replies awaiting a decision, drafted replies
awaiting accept, cadence packages awaiting approval, failed sends, silently
stalled cadences, dead-end replies, stale intel — presented as a ranked
checklist and then worked in **operator-confirmed batches**. Ends with the
outbox: what will actually fire in the coming days, and what claims it will
fire but is blocked.

This skill exists because the actionable state used to be scattered across
per-prospect surfaces: an operator had to open profile after profile to learn
what needed them, and a cadence could stop silently (intel hold, 3-strike
failure deactivation, pause) with no surface showing it. `outreach.triageQueue`
is the one read that sees all of it.

**v1 (2026-07-14):** built alongside the outreach-triage backbone
(`outreach.triageQueue`, `cadence.listUpcoming`, `approval.approveBatch`,
`cadence.approvePackageBatch`, `approval.retry`, `cadence.reactivate`).
**v1.1 (same day):** backlog-reset mode + the zero-out primitives
(`reply.resolveBatch`, `cadence.denyPackageBatch`, `approval.rejectBatch`,
`client.dismissNeedsActionFlag`) + the operator hand-holding contract below.

## Operator hand-holding (non-negotiable)

The operators using this skill are **not technical**. Every run follows these
rules, no exceptions:

- **Plain English only.** Never surface field names, ids, or system jargon in
  prose. Not "packageApprovalStatus: pending" — say "this outreach sequence is
  waiting for your go-ahead". Not "dispatchedTo: operator_review" — say "this
  reply is waiting for you to decide what to do". Ids may appear only in
  parentheses when the operator needs to reference an item, never as the
  subject of a sentence. Never paste raw JSON.
- **Explain the queue before working it.** First run (or whenever the operator
  seems unsure), open with 2-3 sentences on what this is: "This is a list of
  everything in the outreach system waiting on you — replies from prospects,
  emails drafted but not yet approved, and sequences that stopped. We'll go
  through it together, one group at a time. Nothing is ever sent without your
  yes."
- **One group at a time, small chunks.** Work sections in chunks of ~10 items.
  Number every item. Each line: company / person, what it is, when it
  happened, and the decision being asked — e.g.
  `3. Alden Group — replied 4 days ago asking about rates. Options: (a) I draft a reply for you to approve, (b) you already answered them yourself → mark handled, (c) skip for now.`
- **Say exactly what a yes does — before asking for it.** Before any batch:
  "If you say yes: 4 emails send immediately (to X, Y, Z, W). Nothing else
  goes out." Before a deny/resolve batch: "Nothing sends — this just clears
  these 12 from your to-do list; the drafts are discarded but the history
  stays." Then ask.
- **"Not sure" is always an option.** Offer skip on every decision; collect
  skipped items and list them at the end so nothing silently disappears.
- **Confirm after acting.** After every batch, one plain sentence on what
  actually happened, including anything that didn't work ("2 of the 12
  couldn't be cleared because they were already handled — that's fine").
- **End with a recap** in three short parts: what we did, what's parked for
  next time, and what the system will now do on its own ("the 3 approved
  sequences will send their follow-ups automatically on the dates shown —
  you don't need to do anything").

## Backlog reset — "get back to zero" (first-run cleanup)

Run this mode when the operator says the queue is stale, asks to "clear the
blocked ones", or — the common case — outreach has been happening **outside**
the system (e.g. emails sent manually with a generic Gmail tool), so drafted
sequences and queued replies no longer match reality.

**Golden rule of a reset: nothing sends.** A reset clears and reconciles; it
never approves outreach. If the operator wants something sent, that's a
normal `/outreach` pass afterwards, decided fresh. This rule exists because
the biggest reset risk is double-emailing a prospect the operator already
contacted manually.

Order of work (each step follows the hand-holding rules above):

1. **Snapshot + plan.** `outreach.triageQueue` + `cadence.listUpcoming`.
   Tell the operator the totals in plain language and the plan: "56 drafted
   sequences waiting, 50+ replies to sort, 3 failed sends, 7 with no contact.
   We'll sort each pile: keep, clear, or fix. Nothing sends today."
2. **Drafted sequences (pending packages)**, chunks of ~10. This is the heart
   of the reconciliation, and it is EVIDENCE-DRIVEN: for each package, take
   the contact's email address and **search the operator's Gmail Sent mail**
   (query `to:<address>`, via whatever Gmail search tool this session has).
   Capture what you find: sent date, subject, and the Gmail message id when
   the tool returns one. Then present the evidence and offer THREE outcomes,
   in plain language:

   - **(a) Adopt — "you sent this yourself, let the follow-ups continue".**
     The manual send WAS effectively touch 1. → `cadence.adoptManualSend`
     (`packageId`, `sentAt` = the real Gmail date, `gmailMessageId`). This
     marks touch 1 as already-sent (it can never re-send — no double-email),
     reschedules the drafted follow-ups from the REAL send date, and records
     the send in the prospect's history. Tell the operator exactly what the
     new follow-up dates are, and that the follow-ups still wait for their
     normal approval before anything sends (or, if the package was already
     approved, that they WILL now auto-send on those dates — say so
     explicitly).
   - **(b) Deny — "we contacted them / this is stale, don't continue".**
     → `cadence.denyPackageBatch` (reason
     `stale_draft_manual_outreach_took_over`). If Gmail showed a manual send,
     ALSO record it with `touchpoint.logManualSend` (email, date, subject,
     message id) so the prospect's history and last-contacted date are
     truthful even though the sequence dies. Remind: "denying doesn't lose
     the prospect — we can draft fresh outreach any time."
   - **(c) Park — "never contacted, keep for a proper look".** No Gmail
     evidence, content still good → leave pending for a later approve pass.

   If NO Gmail search tool is available in the session, say so, and fall back
   to asking the operator per chunk ("do you remember emailing any of these
   ten?") — record what they confirm with `touchpoint.logManualSend` (their
   remembered date is fine; note `operator_recalled`).
3. **Replies waiting on you (unrouted)**, chunks of ~10. Show sender, subject,
   date, and what the reply seems to say. Three buckets: (a) "I already
   answered this myself" → `reply.resolveBatch` (note: `answered manually via
   Gmail pre-system`); (b) "this needs an answer" → draft it with
   `outreach.draftReply` (it waits in approvals — approved at the end, the one
   allowed send-adjacent step, still behind an explicit yes); (c) "not really
   actionable" → `reply.resolveBatch` (note: `not actionable`).
4. **Dead-end replies** (senders the system couldn't match): skim-list them —
   usually newsletters and noise → `reply.resolveBatch`. If one is a real
   prospect contact, offer to add the person (`contact.create`) and re-route
   the reply (`reply.ingestManual`).
5. **Failed sends**: read each error in plain terms. Stale content →
   `approval.rejectBatch`; still wanted → `approval.retry`.
6. **Sequences with no contact person**: find the right person
   (`companies.getOfficers` → `apollo.findEmail` → `contact.create`) or deny
   the package.
7. **Flags on prospects**: state, per flag, the question it's asking ("Alden
   said not interested — keep them for later or mark lost?"). Operator
   decides → `client.dismissNeedsActionFlag` (plus any stage move they ask
   for).
8. **Re-read and report the score.** `outreach.triageQueue` again: "We started
   with 120 open items; we're at 6, all parked on purpose: …". Repeat on the
   next session until zero.
9. **Close with the going-forward rules** (see "After the reset" below) so the
   backlog doesn't rebuild.

### After the reset — keeping it at zero

Tell the operator, in plain words, at the end of every reset session:

- **Send prospect emails through this system from now on** — ask Claude to
  draft, then approve. It threads, it logs, and replies route back
  automatically. Sending from the plain Gmail tool is invisible to the
  system, and the queues drift out of sync again (that's what caused this
  backlog).
- Replies arrive on their own (checked every 5 minutes) — nothing to do.
- Approved sequences send future touches automatically on their dates; the
  digest at the top of each chat shows what's coming.
- A few minutes of `/outreach` daily beats a monthly reset.

## Trigger

1. **`/outreach`** (primary): the operator runs the slash command, optionally
   scoped — `/outreach cold_outreach` limits the pass to one pipeline stage.
2. **Session digest follow-up**: a stage-workspace chat booted with a triage
   digest (see `prospecting/CLAUDE.md`) and the operator says "work the queue"
   / "let's clear these".
3. **Ad-hoc**: "what needs me on the prospecting side?", "anything stuck?",
   "will anything send this week?" — any cross-prospect outreach-state
   question. For a SINGLE prospect's state, use `prospect.getDeepContext`
   instead; this skill is the cross-prospect pass.

## Inputs

All optional:

- `stage`: a `pipelineStage` value (`cold_outreach` / `warm_pre_meeting` /
  `warm_post_meeting` / `pre_qualification` / `qualified`). Filters the
  presentation to prospects at that stage; items with no resolvable stage
  (dead-end replies) are always shown.
- `daysAhead`: outbox horizon for `cadence.listUpcoming` (default 7).
- `focus`: one section only (`replies` / `approvals` / `stalls` / `outbox`)
  when the operator asks a narrow question.

## Dedup

None. Triage is an idempotent read followed by operator-confirmed writes; a
re-run minutes later is legitimate (the queue shrinks as it's worked). Do not
pass a dedupKey to `skillRun.start`.

## Outputs

1. **A `skillRun` row** (`skillName: "outreach-triage"`) — start before the
   first read, complete at the end with a brief summarising: counts found,
   batches approved (with ids), items deferred, and gaps.
2. **Approval/cadence writes** — only the ones the operator explicitly
   confirmed: `approval.approveBatch` / `cadence.approvePackageBatch` /
   `approval.retry` / `approval.reject` / `cadence.reactivate` /
   `cadence.denyPackage`, plus `outreach.draftReply` for replies the operator
   chooses to answer.
3. **Gaps** logged on `skillRun.complete` (and `/jot`'d) — e.g. a dead-end
   reply whose sender should become a contact, a stall the tools can't clear.

What it does not do:

- **Never sends or approves anything without an explicit operator yes for the
  itemised batch.** Batch tools are a convenience over per-item clicking, not
  autonomy. This does not change as trust increases.
- Does not draft cold outreach (that's `outreach-draft`) or run intel
  (`prospect-intel`). It routes INTO those skills.
- Does not promote pipeline stages autonomously (operator say-so only, per
  `prospecting/CLAUDE.md`).

## High-level workflow

1. **`skillRun.start`** — `skillName: "outreach-triage"`, `input: {stage?,
   daysAhead?, focus?}`, no dedup.

2. **Read everything — two calls.** `outreach.triageQueue({})` then
   `cadence.listUpcoming({daysAhead})`. Do NOT stitch per-prospect reads for
   the overview; drill into single items later with `approval.get` /
   `reply.get` / `cadence.get` / `prospect.getDeepContext` only where the
   operator engages.

3. **Present the ranked checklist.** Order by decision-urgency, one compact
   line per item (company · what it is · when · the one fact needed to
   decide):
   1. `unroutedReplies` + `flaggedClients` — humans wrote to us; they wait
      longest and cost the most goodwill.
   2. `replyDrafts` — a draft is staged; one accept sends it.
   3. `failedSends` — already approved, silently not sent. Show the
      `executionError`.
   4. `pendingPackages` — outreach waiting to start. Include touch count +
      first send date.
   5. `stalledCadences` — the machine stopped quietly. Show the stall reason.
   6. `needsContact` + `deadEndReplies` — data fixes (attach a contact, link
      a sender).
   7. `staleIntel` — re-validate before the next touch fires on old facts.
   Close with the outbox summary: `N will fire in the next X days, M blocked
   (reasons), K paused` — and flag any `due_now`-but-blocked rows explicitly.

4. **Work batches, one section at a time, operator confirms each.**
   - **Reply drafts / other approvals:** itemise (recipient, subject, what
     fires on approve). Operator excludes items or edits drafts (inline in the
     app, or reject + re-draft here), then one `approval.approveBatch` for the
     confirmed ids. Rejections via `approval.reject`.
   - **Packages:** itemise (company, touches, first send, cadence preset).
     Confirmed set → `cadence.approvePackageBatch`. A returned `ok:false`
     no-contact guard failure moves that package to the data-fix list.
   - **Failed sends:** read the error; transient/kill-switch → `approval.retry`;
     content-stale → `approval.reject` + optionally re-draft.
   - **Unrouted replies:** per reply, `reply.get` for the full body, then the
     operator decides — draft an answer (`outreach.draftReply`, then it joins
     the next approve batch), book a meeting (meeting-prep flow), park, or
     mark not-interested (flag decision).
   - **Stalls:** `intel_hold` → offer `intel.revalidate` first, then
     `cadence.reactivate`; `auto_deactivated_failures` → diagnose the error
     (often a missing email → fix contact first); `paused` → reactivate only
     if the operator says the wait is over.
   - **Data fixes:** `needsContact` → find the person (`companies.getOfficers`
     / `apollo.findEmail` → `contact.create`) then
     `cadence.setPackageContact` via the app or log a gap; `deadEndReplies` →
     if the sender matters, `contact.create` + `reply.ingestManual` to re-route
     the content, else acknowledge and move on.

5. **Re-read and confirm.** After the batches, call `outreach.triageQueue`
   again and report the delta ("12 actions → 3 remaining: …"). Anything the
   operator deferred is listed explicitly so it isn't silently dropped.

5b. **Metrics + change detection** *(the cold `-triage` commands run this
   every time; other scopes on request)*:
   - **Outcomes:** `outreach.metrics({sinceDays: 90})` → report in plain
     language: sends, substantive replies, contact-level response rate,
     **touches-per-earned-reply** (the number the operator cares most
     about), and the by-template table — best and worst performer called out.
     If `capped` is set, say the numbers are floors. If most sends are
     "untagged", say why (pre-tagging history) rather than presenting it as
     signal.
   - **Change detection (the learning loop):** for touches/drafts that fired
     since the last run, compare the original against what actually went out
     — `cadence.get` → `originalPreDraftedTouch` vs `preDraftedTouch`, and
     `approval.get` → `originalDraftPayload` vs `draftPayload`. Absent
     original = sent as drafted (say so; that's signal too). Where edits
     exist, summarise them as style observations ("you consistently shorten
     the second paragraph and cut the second question"), not raw diffs —
     these observations are what feed template improvements.

6. **`skillRun.complete`** — brief with counts before/after, approval ids
   fired, deferrals, and `gaps[]` for anything the tool surface couldn't do.

## Tool dependencies

Core reads (every run):

- `outreach.triageQueue` — the cross-prospect action read. First call, and
  again at step 5 for the delta.
- `cadence.listUpcoming` — the outbox with per-touch `fireStatus`.

Writes (only on explicit operator confirmation):

- `approval.approveBatch` / `approval.reject` / `approval.rejectBatch` / `approval.retry`
- `cadence.approvePackageBatch` / `cadence.denyPackage` / `cadence.denyPackageBatch` / `cadence.reactivate`
- `reply.resolveBatch` / `client.dismissNeedsActionFlag` (backlog reset)
- `cadence.adoptManualSend` (autofit a package onto a manual send) /
  `touchpoint.logManualSend` (backfill manual sends into history) — the
  reconciliation writes; both idempotent on gmailMessageId

Drill-down + routing (as engaged): `approval.get`, `reply.get`, `cadence.get`,
`prospect.getDeepContext`, `outreach.draftReply`, `intel.revalidate`,
`reply.ingestManual`, `contact.create`, `companies.getOfficers`,
`apollo.findEmail`. Envelope: `skillRun.start` / `skillRun.complete`.

## What goes wrong

- **Approving during a reset.** A reset run must not send anything — stale
  packages likely duplicate outreach the operator already did manually via
  Gmail, and approving them double-emails real prospects. Adopt/deny/
  resolve/park only; sends happen in a fresh pass afterwards.
- **Clearing without recording.** Denying a package or resolving a reply
  answers "what should the queue do" but not "what actually happened". Every
  manual send discovered during reconciliation must land in history —
  `cadence.adoptManualSend` for the adopt path, `touchpoint.logManualSend`
  for the deny path — or the prospect's last-contacted date stays wrong and
  the same confusion rebuilds.
- **Adopting onto an already-approved package without warning.** Adoption
  keeps the package's approval status; if it was already approved, the refit
  follow-ups will AUTO-SEND on their new dates. Say that in the itemised line
  and get the yes with that knowledge.
- **Jargon leaking to the operator.** If a sentence contains a field name, an
  id as its subject, or raw JSON, rewrite it. The operator is not technical;
  confusion here erodes trust in the whole system.
- **Batch approval without itemising.** The single biggest failure mode. A
  batch tool call must always be preceded by the itemised list AND the
  operator's explicit yes for THAT list. If the operator says "approve all"
  before seeing items, show the items first anyway.
- **Treating capped sections as complete.** `triageQueue` sections are capped
  (`capped` flags in the response). If a flag is set, say "50+" and offer to
  page through — never report a capped count as the total.
- **`approveBatch` partial results ignored.** `skipped[]` / `results[].ok:false`
  entries (already-approved rows, no-contact guards) must be reported back,
  not swallowed — the operator believes everything they confirmed went out.
- **Reactivating an intel_hold blindly.** The hold exists because the intel
  looked stale. Offer `intel.revalidate` first; reactivate on its verdict or
  the operator's explicit "send anyway".
- **Double-drafting an unrouted reply.** Before `outreach.draftReply`, check
  `approval.listByReplyEvent` — a draft may already exist from an earlier
  session; surface it instead.
- **Stage filter hiding stageless items.** When scoped to a stage, dead-end
  replies and unlinked items carry no stage — always show them regardless of
  scope, flagged as unscoped.
- **Skill run left open.** If the operator abandons mid-triage, still call
  `skillRun.complete` (status `complete_with_gaps` if batches were presented
  but unconfirmed) — never leave `running`.

## Voice

Per `CONVENTIONS.md`: terse, factual, no cheerleading. The checklist is a
briefing, not a dashboard readout — every line should end in an implied
decision. Say "3 replies waiting, oldest 4 days" not "You have some replies!".
