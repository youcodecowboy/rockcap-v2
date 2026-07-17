# Prospecting v3 — funnel redesign (sourced → qualified)

Created: 2026-06-26
Status: queued
Branch: prospecting-v3
Tags: prospecting, funnel, automation, ux
Priority: high

## Goal

Make the whole prospecting funnel feel effortless end-to-end. One visible spine
(the 5 pipelineStage tables), automations that fire on events, prospects that
surface to a "requires attention" table when they need the operator, and every
action takeable on the prospecting pages themselves (not buried in detail).

## Target funnel (operator's mental model)

1. Sourced lead → **Promote to prospect** (one action)
2. Prospect → **Run intel** → produces intel + outreach + cadence, all staged
3. **Approve (one click) = begin outreach** → first email fires now, rest
   scheduled, prospect lands in **Cold**
4. **Cold**:
   - Reply received → prospect flagged **needs action** → reply auto-drafted →
     operator accepts or edits inline
   - Meeting booked → **Pre-meeting** table → draft pre-meeting notes + re-run
     intel if >7 days since last run
5. Meeting completed → **Post-meeting** table → pull Fireflies transcript, append
   to intel
6. **Pre-qual** / **Qualified** = manual operator moves, flagged accordingly

## The spine decision

- `pipelineStage` (5 values) becomes the single SOURCE OF TRUTH the operator sees
  and the tables key off. Written EXPLICITLY on each event (no more passive
  derivation as the authority).
- `prospectState` demoted to internal plumbing (HubSpot lifecycle mapping +
  cadence mechanics). Stop showing it as a competing "Stage" axis.
- `qualSubStage` kept only inside Pre-qual / Qualified as the manual ladder.
- `outreachReady` flag folded into the single "Approve & begin outreach" action.

## HAVE (working today)

- Sourcing intake + `sourcing.promote` → creates prospect at cold_outreach
- prospect-intel skill produces intel
- Cadence package + `approvePackage` → fires touch 1 now + schedules rest (dispatcher)
- Reply ingest: auto-cancel cadences, classify intent, dispatch
- book_meeting intent → auto-draft availability reply as approval
- Meeting create → transitions prospectState replied→engaged
- Fireflies sync (30-min cron) → transcripts stored in meetingTranscripts
- Intel 7-day dedup window primitive via skillRun.start (dedupKey/dedupWindowDays)
- Per-stage ActionQueue with inline approve (cadence + approval only)
- Requires-action signals: unrouted replies, pending approvals, pending cadences,
  failed/gappy intel runs; unified TOTAL count on summary

## MISSING (to build)

1. One-approve flow: intel run stages the cadence package too; single
   "Approve & begin outreach" replaces intel-accept → markOutreachReady →
   approvePackage (3 gates → 1).
2. Approve → explicit write pipelineStage=cold_outreach + record outreach started.
3. Reply lifecycle: auto-draft a reply for all meaningful intents (not just
   book_meeting); set needs-action flag; inline accept/EDIT (needs
   approval.updateDraft mutation + inline editor).
4. Meeting booked → pipelineStage=warm_pre_meeting (currently jumps to
   post-meeting); draft pre-meeting notes; stale-intel (>7d) re-run.
5. Meeting completion concept (meetings.completedAt / status); completed →
   warm_post_meeting; Fireflies transcript → append to intel.
6. Fireflies attribution (email→contact→client) + transcript→intel pipeline.
7. Manual pre-qual/qualified moves inline on the dashboard, with flags when a
   prospect is waiting on a manual decision.
8. Unified cross-stage "Requires attention" table on the prospecting home with
   inline actions (accept/edit reply, approve outreach, advance stage).
9. Vocabulary cleanup: one stage control + status chips (retire competing
   Stage/Pipeline/Step dropdowns); disambiguate the two "promote" verbs.

## Cadence + one-approval (refined 2026-06-26)

- Intel run stages intel + a drafted MULTI-TOUCH cadence together.
- One approval screen: whole sequence listed, each email EDITABLE INLINE,
  send-dates visible.
- Per-email custom content — each touch is its own draft, not one template.
- One "Approve & begin outreach" = first fires now, rest schedule, lands in Cold.
- Same inline editor + approval.updateDraft used for cadence touches AND reply
  drafts (no separate skill round-trip).

## Intel freshness — two modes (refined 2026-06-26)

Problem: a long-gap cadence email with stale assumptions ("hope scheme X is
progressing") fired months later makes us look out of touch.

- MODE 1 full `prospect-intel` run: initial + manual + meeting refresh.
- MODE 2 new `intel-revalidate` pass: cheap, diff-focused — checks only what
  would invalidate the cadence premise (new CH charges, status change, new
  planning/scheme activity, news). Output: still_valid | materially_changed.

Triggers:
- A. Meeting booked AND last full intel >7 days → raise "refresh intel"
  action-required flag (operator re-runs before meeting).
- B. >30-day gap before the next cadence touch fires → run intel-revalidate
  BEFORE the send. still_valid → send as planned; materially_changed → HOLD
  send, flag needs-action, surface next touch for quick re-draft/approve.

## Likely schema changes

- meetings: + status (scheduled|completed|cancelled) + completedAt
- approvals: updateDraft mutation; lean on draftPayload.kind to type reply drafts
- clients: needsAction flag (or derived); reduce prospectState to plumbing
- (pipelineStage already has the 5 stages — no new enum needed)

## Phasing

- P0 Vocabulary + spine: pipelineStage authoritative, one stage control, fix
  promote verbs, kill duplicate labels.
- P1 One-approve: intel→staged package→single Approve&begin→writes Cold+fires.
- P2 Reply lifecycle: auto-draft all intents, needs-action, inline accept/edit.
- P3 Meeting lifecycle: booked→pre-meeting (+notes, +stale re-run),
  completed→post-meeting (+transcript→intel).
- P4 Requires-attention surface + manual pre-qual/qualified moves on-page.
- P5 npx next build (from model-testing-app), commit, push.

## Reconciled build order (from prospecting-v3-spec workflow, 2026-06-26)

FOUNDATION (sequential, coherent core — build first):
- F1 schema: prospectStageEvents.reason; clients needsActionFlags[]+needsActionAt
  + intel-freshness (lastFullIntelAt, intelAttentionAt/Reason, lastOutreachSendAt,
  lastIntelRevalidateAt, lastIntelResult); meetings status/completedAt/
  completionSource/preMeetingNotesDraftedAt (+by_status,by_status_date); approvals
  draftEditedAt/By; replyEvents +positive/+reply_drafted/+flag_only; cadences
  intelHoldAt/Reason; skillRuns revalidateResult. → convex codegen (live, additive).
- F2 stage engine: NEW convex/lib/pipelineStages.ts canonical (STAGE consts +
  STAGE_ORDER/compareStages/isForwardStage/PipelineStageReason/deriveProspectFlags);
  src/lib/prospects/stages.ts re-exports; applyPipelineStage+setPipelineStageInternal
  in prospectStages.ts; promoteStage delegates. → codegen-verify.
- F3 shared mutations: clients raise/clearNeedsActionFlag + getIntelFreshness;
  approvals.updateDraft (generic subject/body/to); cadences.applyPackageApproval
  + holdForIntel/clearIntelHold + advanceAfterFire stamp lastOutreachSendAt;
  prospectStages gatherActionSignals+buildActionGroups extraction + full Action
  union (reply_draft/flag/intel_attention/meeting_completion/manual_move) +
  requiresAttention query + counts; skillRuns.completeInternal denormalize. → codegen.
- F4 shared UI: InlineDraftEditor.tsx, StageChip.tsx, meetingStatus.ts. → next build.

PARALLEL WAVE (after foundation, worktree-isolated):
- Spine-UI · Approve-flow · Reply-lifecycle · Meeting-lifecycle · Intel-freshness.
SEQUENTIAL-LAST:
- Requires-attention surface (owns ActionQueue.tsx all-kinds rendering +
  RequiresAttentionTable.tsx + prospects/page.tsx + PipelineSummary).
FINALISE: embed-skill-prompts (reply-draft + intel-revalidate), codegen,
npx next build (from model-testing-app/), CATALOGUE.md + README updates, commit/push.

Single-owner shared edit points (no parallel collision): meetings.create=Meeting;
cadences applyPackageApproval=Approve / hold+stamp=Intel; ActionQueue.tsx=Req-attn;
ProspectDetailAside=Spine owns, Reply+Intel append distinct sections; updateDraft=Approve.

## BUILD PROGRESS (2026-06-26)

Decisions confirmed (defaults): retire prospectState from UI; meeting completion
auto on transcript-arrival OR date-passed + manual override; auto-draft replies
for book_meeting/info_question/positive, flag-only for not_interested/OOO; keep
no-contact guard; 30-day case = cheap intel-revalidate (not full re-run).

Foundation contract: scratchpad/foundation-contract.md (authoritative signatures).

- [x] F1 schema — all additive fields live (convex codegen exit 0, pushed to live deployment).
- [x] F2 stage engine — convex/lib/pipelineStages.ts canonical (+STAGE_ORDER/
      isForwardStage/PipelineStageReason/deriveProspectFlags), src/lib/prospects/
      stages.ts re-exports, applyPipelineStage + setPipelineStageInternal added,
      promoteStage delegates. codegen exit 0, cross-bundle import verified.
- [x] F3+F4 — all 7 agents ok (clients helpers, approvals.updateDraft,
      cadences applyPackageApproval+hold+advanceAfterFire stamp, skillRuns
      denormalize [fixed numeric->ISO bug], meetingStatus, InlineDraftEditor,
      StageChip). codegen exit 0 + npx next build exit 0. Foundation GREEN.
- [x] Leaves wave (parallel) — all 5 ok: Spine-UI, Approve, Reply, Meeting, Intel.
      Fixed: replyEvents listActionableDrafts ctx.db.get union (cast any);
      skillRuns already fixed. codegen exit 0 after fixes.
      Integrated handoffs: middleware allowlist (/api/reply-draft + /api/intel-revalidate);
      embed sources QUALIFY_AND_DRAFT_SKILL_PROMPT(=reply-draft/SKILL.md) +
      INTEL_REVALIDATE_SKILL_PROMPT, ran embed (5 prompts); classify-reply-intent.md
      +positive intent (7 buckets); ProspectDetailAside status-chips + intel-freshness slots filled.
      STILL TODO at finalise: mcp.ts (cadence.approvePackage desc, skillRun.complete
      revalidateResult passthrough, intel.revalidate tool); HubSpot lifecycle plumbing
      dropped on meeting booking (acceptable — push was a stub; note only).
- [x] Build checkpoint after leaves+integration — exit 0.
- [x] Requires-attention surface (final leaf): prospectStages read-side refactor
      (gatherActionSignals split, buildActionGroups, ProspectActionType union,
      requiresAttention query, needsActionAt-driven counts) + ActionQueue all-kinds
      (reply_draft inline editor, flag dismiss, intel_attention re-validate,
      manual_move stage/substage selects) + RequiresAttentionTable.tsx on /prospects
      home + PipelineSummary anchor. mcp.ts: revalidateResult passthrough,
      approvePackage desc, intel.revalidate tool. Final codegen exit 0.
- [~] Final npx next build (running).
- [x] E2E verified live: DURKAN (BENGEO 2) sourcing→promote→prospect(cold_outreach,
      reason sourcing_promote)→client.activate→active. (Test client
      kn7db5w9j4gnt4hmsy7kyyszbx89dmf0 — pending user decision on cleanup.)
- [ ] Finalise: CATALOGUE.md + README discoverability (intel.revalidate tool,
      reply-draft + intel-revalidate skills); commit + push.

## Post-build fixes / QoL (2026-06-26)
- [x] SourcingTab: bulk "Add to pipeline (N)" button alongside bulk Dismiss
      (promoteSelected, skips already-promoted/in-book). Frontend only.
- [x] OverviewTab: retired /approvals links — pending approvals now approved/
      edited/rejected IN PLACE (approvals.approve/reject + InlineDraftEditor).
- [x] Backfill: clients.lastFullIntelAt for 85 prospects (was "Full intel: never"
      because the v3 field only stamped going forward). Migration
      convex/migrations/backfillIntelFreshness.ts (idempotent), ran via convex run.
- [~] Backlog: 54 prospects have intel but NO cadence (pre-unified-flow). Intel
      all fresh (Jun 11-24). Options offered: batch-draft workflow (recommended) /
      flag-only / organic. Awaiting user decision.
- [~] Build verifying OverviewTab + SourcingTab edits.
      Strict ownership; off-limits to all: clients/approvals/cadences/prospectStages/
      skillRuns/schema/mcp.ts + ProspectDetailAside/StatePill/InlineDraftEditor/StageChip.
      Pinned cross-name: internal.intelRevalidate.onMeetingBookedInternal (Intel defs, Meeting calls).
      HANDOFF to integrate after: mcp.ts tools, Clerk allowlist for /api/reply-draft +
      /api/intel-revalidate, Aside status-chips + intel-freshness snippets.
- [ ] Requires-attention (sequential last): prospectStages read-side refactor +
      ActionQueue all-kinds + RequiresAttentionTable + page.tsx + PipelineSummary.
- [ ] Finalise: embed-skill-prompts, codegen, next build, CATALOGUE/README, commit.

## Open decisions (confirm before building)

1. Retire prospectState from the UI entirely (keep as plumbing)? [recommend yes]
2. Meeting completion signal: transcript-arrival OR meetingDate-passed auto-marks
   completed, with manual override? [recommend yes]
3. Auto-draft replies for which intents — draft for book_meeting/info_question/
   positive, flag-only for not_interested/OOO? [recommend yes]
4. Keep the no-contact blocking guard before first send? [recommend yes]
