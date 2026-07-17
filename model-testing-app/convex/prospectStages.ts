// ─────────────────────────────────────────────────────────────────────────────
// Prospect PIPELINE STAGE dashboards (v2) — server aggregation.
//
//   pipelineOverview  → per-stage counts + pipeline value + action-item counts
//                       + the curated cross-pipeline KPI strip (summary page)
//   stageDashboard    → bespoke KPI set + ladder + action-items for ONE stage
//   promoteStage      → operator moves a prospect between the 5 manual stages
//   setQualSubStage   → operator advances a prospect's pre-qual / qualified step
//
// Stage derivation + the ladder keys + targets are duplicated here from
// src/lib/prospects/stages.ts because importing app code across the Convex
// bundle boundary is fragile. KEEP THE TWO IN SYNC.
// ─────────────────────────────────────────────────────────────────────────────

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { resolveProspectDealSizeGBP, median } from "./lib/dealSizeParse";
import {
  STAGE_KEYS,
  PRE_QUAL_KEYS,
  QUALIFIED_KEYS,
  SUBSTAGE_LABELS,
  PIPELINE_TARGETS,
  MANUAL_MOVE_STALE_DAYS,
  derivePipelineStage,
  deriveProspectFlags,
  isForwardStage,
  stageFor,
  type PipelineStage,
  type PipelineStageReason,
  type PipelineTargets,
} from "./lib/pipelineStages";

// v3: the pipeline taxonomy, ladders, and targets now live in the canonical
// pure module convex/lib/pipelineStages.ts (imported above) — no more local
// duplication. These aliases keep the rest of this file unchanged.
type Stage = PipelineStage;
type Targets = PipelineTargets;
const DEFAULT_TARGETS: Targets = PIPELINE_TARGETS;

async function loadTargets(ctx: any): Promise<Targets> {
  const row = await ctx.db.query("pipelineTargets").first();
  if (!row) return DEFAULT_TARGETS;
  return {
    weeklyReachOut: row.weeklyReachOut,
    weeklyFollowUp: row.weeklyFollowUp,
    monthlyMeetings: row.monthlyMeetings,
    monthlyTermsRequested: row.monthlyTermsRequested,
  };
}

// effectiveStage = canonical derive (a stored pipelineStage always wins; the
// legacy fallback derives from prospectState for rows that predate explicit
// stage writes). pipelineStage is authoritative in v3.
const effectiveStage = (c: any): Stage | null => derivePipelineStage(c);

// ── Value parsing ────────────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}k`;
  return `£${Math.round(n)}`;
}

function pct(numer: number, denom: number): string {
  if (denom <= 0) return "—";
  return `${Math.round((numer / denom) * 100)}%`;
}

// ── Time-window engine ───────────────────────────────────────────────────────
// All KPIs that say "this week / this month / rolling average" reduce to
// bucketing a list of ISO timestamps. "This X" uses the calendar period (so a
// weekly target resets Monday); rolling averages use trailing windows.

const DAY = 86_400_000;

function startOfWeekUTC(now: number): number {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY;
}
function startOfMonthUTC(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

const since = (ts: number[], from: number, to: number) =>
  ts.filter((t) => t >= from && t <= to).length;
const perWeek = (ts: number[], now: number, weeks = 8) =>
  since(ts, now - weeks * 7 * DAY, now) / weeks;
const perMonth = (ts: number[], now: number, months = 6) =>
  since(ts, now - Math.round(months * 30.44) * DAY, now) / months;
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

// ── KPI shape ────────────────────────────────────────────────────────────────

type Kpi = {
  label: string;
  value: string;
  meta?: string;
  accentKey?: string;
  /** When present, the tile renders value vs. this house target. */
  target?: number;
};

// ── Gather the "requires action" signals once, keyed by clientId ─────────────

// Caps keep the per-query byte budget bounded (Convex limits one execution to
// 16MB read). These are triage surfaces — the queue shows the most recent items
// and the per-stage counts; capping the tail is acceptable. skillRuns are read
// scoped to prospect-intel via a compound index AND ordered desc + capped tight,
// because their brief / intelMarkdown / structureGraph fields are heavy.
// Per-source caps. cadences (preDraftedTouch.bodyHtml) and approvals (draft
// payloads) carry the heaviest bodies, so they get tighter caps. skillRuns are
// tightest — brief / intelMarkdown / structureGraph are the heaviest of all.
const APPROVAL_CAP = 75;
const CADENCE_CAP = 75;
const INTEL_RUN_CAP = 6;

async function gatherActionSignals(ctx: any) {
  // Pending approvals — split into the auto-drafted REPLY approvals (rendered as
  // an inline editor / reply_draft action) vs everything else (plain approval).
  // A reply draft is a pending client_communication approval whose draftPayload
  // is an email_reply tied to a reply event (matches replyEvents.listActionableDrafts).
  const pendingRaw = (await ctx.db
    .query("approvals")
    .withIndex("by_status", (q: any) => q.eq("status", "pending"))
    .order("desc")
    .take(APPROVAL_CAP)) as any[];
  const draftedReplies: any[] = [];
  const pendingApprovals: any[] = [];
  for (const a of pendingRaw) {
    const p: any = a.draftPayload ?? {};
    const isReplyDraft =
      !!a.relatedReplyEventId &&
      (p.kind === "email_reply" ||
        (a.entityType === "client_communication" && p.kind === "email_reply") ||
        a.entityType === "gmail_send");
    if (isReplyDraft) draftedReplies.push(a);
    else pendingApprovals.push(a);
  }

  const pendingCadences = (await ctx.db
    .query("cadences")
    .withIndex("by_approval_status", (q: any) => q.eq("packageApprovalStatus", "pending"))
    .order("desc")
    .take(CADENCE_CAP)) as any[];

  const failedRuns = (await ctx.db
    .query("skillRuns")
    .withIndex("by_skill_and_status", (q: any) =>
      q.eq("skillName", "prospect-intel").eq("status", "failed"),
    )
    .order("desc")
    .take(INTEL_RUN_CAP)) as any[];
  const gappyRuns = (await ctx.db
    .query("skillRuns")
    .withIndex("by_skill_and_status", (q: any) =>
      q.eq("skillName", "prospect-intel").eq("status", "complete_with_gaps"),
    )
    .order("desc")
    .take(INTEL_RUN_CAP)) as any[];
  // Note: counts above are capped (triage surface). The summary badge can read
  // "N+" when a source hits its cap; exhaustive ledgers live on their own pages.
  const intelRuns = [...failedRuns, ...gappyRuns].filter((r: any) => r.linkedClientId);

  // NB: the needs-action reply / flag-only triage signals are NOT read here —
  // they live denormalised on the prospect doc (needsActionFlags + needsActionAt,
  // raised by the reply lifecycle) and the intel-attention nudge on
  // intelAttentionAt. buildActionGroups derives those per-prospect with no extra
  // query, so the surface stays needsActionAt-driven and within the byte budget.
  return { draftedReplies, pendingApprovals, pendingCadences, intelRuns };
}

// ── Action model + grouping (shared by stageDashboard + requiresAttention) ────
// The full v3 action union. Beyond the original cadence/approval/intel signals
// it carries the reply_draft (inline editor), flag (needs-action dismiss),
// intel_attention (re-validate) and manual_move (stage decision) kinds. Each row
// ships only what the matching inline control needs to fire its mutation.
export type ProspectActionType =
  | "reply"
  | "reply_draft"
  | "flag"
  | "approval"
  | "cadence"
  | "intel"
  | "intel_attention"
  | "manual_move";

type ProspectAction = {
  id: string;
  type: ProspectActionType;
  title: string;
  subtitle: string;
  when: string;
  severity: "warn" | "info" | "ok";
  blocked: boolean;
  approve:
    | { kind: "cadence"; packageId: string }
    | { kind: "approval"; approvalId: string }
    | null;
  // Inline-control payloads (only set for the matching kind).
  replyDraft?: { approvalId: string; subject: string; bodyText: string; bodyHtml?: string; to?: string };
  flag?: { clientId: string; kind: string; sourceReplyEventId?: string };
  intelAttention?: { clientId: string; reason?: string };
  manualMove?: { clientId: string; stage: string; currentSubStage?: string };
};

type ProspectActionGroup = {
  clientId: string | null;
  clientName: string;
  stage?: string | null;
  stageLabel?: string;
  stageAccentKey?: string;
  blocking: { kind: "no_contact"; label: string } | null;
  actions: ProspectAction[];
  latestAt: string;
};

function flagTitle(kind: string): string {
  switch (kind) {
    case "reply_received":
      return "Reply received — review & route";
    case "reply_flag_only":
      return "Reply needs a decision";
    case "reply_not_interested":
      return "Replied: not interested";
    case "reply_out_of_office":
      return "Out-of-office auto-reply";
    default:
      return "Needs your attention";
  }
}

function intelAttentionLabel(reason?: string | null): string {
  if (reason === "meeting_booked_stale") return "Meeting booked — intel is stale, re-validate before the call";
  if (reason === "revalidate_materially_changed") return "Re-validation flagged material changes — review";
  return "Intel may be out of date — re-validate";
}

// Build per-prospect action groups from the gathered signals + the prospect docs
// already in hand (needsActionFlags / intelAttentionAt / qualSubStage are read
// straight off the doc — no extra query). `attachStage` adds the stage chip data
// per group for the cross-stage home table. Returns the FULL sorted group list
// + tallied counts; callers cap/slice as needed.
async function buildActionGroups(
  ctx: any,
  opts: {
    prospects: any[];
    signals: Awaited<ReturnType<typeof gatherActionSignals>>;
    nowMs: number;
    attachStage: boolean;
  },
): Promise<{
  groups: ProspectActionGroup[];
  counts: {
    flags: number;
    replyDrafts: number;
    approvals: number;
    cadences: number;
    intel: number;
    intelAttention: number;
    manualMoves: number;
  };
}> {
  const { prospects, signals, nowMs, attachStage } = opts;
  const prospectIds = new Set(prospects.map((p) => String(p._id)));
  const byId = new Map<string, any>(prospects.map((p) => [String(p._id), p]));
  const nameById = new Map<string, string>(
    prospects.map((p) => [String(p._id), p.name ?? p.companyName ?? "Unknown"]),
  );

  const draftedReplies = (signals.draftedReplies ?? []).filter((a: any) => prospectIds.has(String(a.relatedClientId)));
  const pendingApprovals = (signals.pendingApprovals ?? []).filter((a: any) => prospectIds.has(String(a.relatedClientId)));
  const pendingCadences = (signals.pendingCadences ?? []).filter((c: any) => prospectIds.has(String(c.relatedClientId)));
  const intelRuns = (signals.intelRuns ?? []).filter((r: any) => prospectIds.has(String(r.linkedClientId)));

  const byClient = new Map<string, ProspectAction[]>();
  const pushAction = (clientId: any, a: ProspectAction) => {
    const key = clientId ? String(clientId) : "_unlinked";
    const arr = byClient.get(key) ?? [];
    arr.push(a);
    byClient.set(key, arr);
  };

  const counts = { flags: 0, replyDrafts: 0, approvals: 0, cadences: 0, intel: 0, intelAttention: 0, manualMoves: 0 };

  // reply_draft — auto-drafted replies, accepted/edited inline.
  for (const a of draftedReplies) {
    const p: any = a.draftPayload ?? {};
    counts.replyDrafts += 1;
    pushAction(a.relatedClientId, {
      id: String(a._id),
      type: "reply_draft",
      title: "Drafted reply — review & send",
      subtitle: p.subject || (p.bodyText ? String(p.bodyText).slice(0, 90) : "Auto-drafted reply"),
      when: a.requestedAt ?? (a._creationTime ? new Date(a._creationTime).toISOString() : ""),
      severity: "warn",
      blocked: false,
      approve: null,
      replyDraft: {
        approvalId: String(a._id),
        subject: p.subject ?? "",
        bodyText: p.bodyText ?? "",
        bodyHtml: p.bodyHtml ?? undefined,
        to: p.to ?? undefined,
      },
    });
  }

  // approval — generic pending approvals.
  for (const a of pendingApprovals) {
    counts.approvals += 1;
    pushAction(a.relatedClientId, {
      id: String(a._id),
      type: "approval",
      title: a.summary || "Approval pending",
      subtitle: `${String(a.entityType).replace(/_/g, " ")}${a.requestSourceName ? ` · ${a.requestSourceName}` : ""}`,
      when: a.requestedAt ?? "",
      severity: "info",
      blocked: false,
      approve: { kind: "approval", approvalId: String(a._id) },
    });
  }

  // cadence — collapse per-touch rows to one approve-package action.
  const seenPackages = new Set<string>();
  for (const c of pendingCadences) {
    const pkg = c.packageId ? String(c.packageId) : `cadence:${String(c._id)}`;
    if (seenPackages.has(pkg)) continue;
    seenPackages.add(pkg);
    counts.cadences += 1;
    pushAction(c.relatedClientId, {
      id: pkg,
      type: "cadence",
      title: "Cadence package awaiting approval",
      subtitle: c.cadenceType ? String(c.cadenceType).replace(/_/g, " ") : "Outreach cadence",
      when: c.createdAt ?? (c._creationTime ? new Date(c._creationTime).toISOString() : ""),
      severity: "info",
      blocked: false,
      approve: c.packageId ? { kind: "cadence", packageId: String(c.packageId) } : null,
    });
  }

  // intel — failed / gappy intel runs needing a rerun.
  for (const r of intelRuns) {
    counts.intel += 1;
    const gap = r.gaps?.[0]?.description;
    pushAction(r.linkedClientId, {
      id: String(r._id),
      type: "intel",
      title: "Intelligence needs rerun",
      subtitle: gap ? String(gap).slice(0, 90) : r.status === "failed" ? "Run failed" : "Completed with gaps",
      when: r.completedAt ?? "",
      severity: "warn",
      blocked: false,
      approve: null,
    });
  }

  // Derived, per-prospect (no extra query): flags, intel-attention, manual move.
  for (const p of prospects) {
    const flags = Array.isArray(p.needsActionFlags) ? p.needsActionFlags : [];
    for (const f of flags) {
      counts.flags += 1;
      pushAction(p._id, {
        id: `flag:${String(p._id)}:${f.kind}:${f.sourceReplyEventId ? String(f.sourceReplyEventId) : ""}`,
        type: "flag",
        title: flagTitle(f.kind),
        subtitle: f.reason || "Needs your decision",
        when: f.raisedAt ?? p.needsActionAt ?? "",
        severity: "warn",
        blocked: false,
        approve: null,
        flag: {
          clientId: String(p._id),
          kind: f.kind,
          sourceReplyEventId: f.sourceReplyEventId ? String(f.sourceReplyEventId) : undefined,
        },
      });
    }

    if (p.intelAttentionAt) {
      counts.intelAttention += 1;
      pushAction(p._id, {
        id: `intel_att:${String(p._id)}`,
        type: "intel_attention",
        title: "Intel needs re-validation",
        subtitle: intelAttentionLabel(p.intelAttentionReason),
        when: p.intelAttentionAt ?? "",
        severity: "warn",
        blocked: false,
        approve: null,
        intelAttention: { clientId: String(p._id), reason: p.intelAttentionReason ?? undefined },
      });
    }

    const derived = deriveProspectFlags(p, nowMs);
    if (derived.manualMoveReady) {
      counts.manualMoves += 1;
      const stage = effectiveStage(p);
      const def = stageFor(stage);
      pushAction(p._id, {
        id: `manual:${String(p._id)}`,
        type: "manual_move",
        title: "Stage decision needed",
        subtitle: `In ${def?.label ?? "this stage"} ${MANUAL_MOVE_STALE_DAYS}+ days — set the next step`,
        when: p.pipelineStageChangedAt ?? "",
        severity: "info",
        blocked: false,
        approve: null,
        manualMove: {
          clientId: String(p._id),
          stage: stage ?? "",
          currentSubStage: p.qualSubStage ?? undefined,
        },
      });
    }
  }

  // ── Blocking signal per prospect: no sendable contact ────────────────────
  // Only matters for groups carrying an OUTBOUND action (cadence/approval/reply
  // draft) — those can't usefully fire without a verified contact email.
  const OUTBOUND: ProspectActionType[] = ["cadence", "approval", "reply_draft"];
  const groupClientIds = [...byClient.keys()].filter((k) => k !== "_unlinked");
  const sendableByClient = new Map<string, boolean>();
  await Promise.all(
    groupClientIds.map(async (cid) => {
      const actions = byClient.get(cid) ?? [];
      if (!actions.some((a) => OUTBOUND.includes(a.type))) return; // skip contact read when not needed
      const contacts = await ctx.db
        .query("contacts")
        .withIndex("by_client", (q: any) => q.eq("clientId", cid as any))
        .collect();
      const sendable = contacts.some(
        (ct: any) => ct.email && (ct.emailStatus == null || ct.emailStatus === "verified"),
      );
      sendableByClient.set(cid, sendable);
    }),
  );

  const groups: ProspectActionGroup[] = [];
  for (const [key, actions] of byClient.entries()) {
    const clientId = key === "_unlinked" ? null : key;
    const hasOutbound = actions.some((a) => OUTBOUND.includes(a.type));
    const sendable = clientId ? sendableByClient.get(clientId) ?? true : true;
    const blocking =
      clientId && hasOutbound && !sendable
        ? { kind: "no_contact" as const, label: "No verified contact — add an email to unblock sends" }
        : null;
    if (blocking) {
      for (const a of actions) if (OUTBOUND.includes(a.type)) a.blocked = true;
    }
    actions.sort((a, b) => (b.when || "").localeCompare(a.when || ""));
    const latestAt = actions.reduce((m, a) => (a.when > m ? a.when : m), "");

    const group: ProspectActionGroup = {
      clientId,
      clientName: clientId ? nameById.get(clientId) ?? "Unknown" : "Unlinked",
      blocking,
      actions,
      latestAt,
    };
    if (attachStage && clientId) {
      const doc = byId.get(clientId);
      const stage = doc ? effectiveStage(doc) : null;
      const def = stageFor(stage);
      group.stage = stage;
      group.stageLabel = def?.label;
      group.stageAccentKey = def?.accentKey;
    }
    groups.push(group);
  }

  // Sort: blocked first (need a decision before anything moves), then groups with
  // a decision nudge (manual_move / intel_attention) bubble up, then most recent.
  const decisionRank = (g: ProspectActionGroup) =>
    g.actions.some((a) => a.type === "manual_move" || a.type === "intel_attention") ? 0 : 1;
  groups.sort((a, b) => {
    if (!!a.blocking !== !!b.blocking) return a.blocking ? -1 : 1;
    const da = decisionRank(a);
    const db = decisionRank(b);
    if (da !== db) return da - db;
    return (b.latestAt || "").localeCompare(a.latestAt || "");
  });

  return { groups, counts };
}

// ── Per-prospect activity rollup for a stage ─────────────────────────────────
// Collects every timestamped event stream the KPIs draw on, once, so the
// window math is pure array work afterwards.

async function gatherStageActivity(ctx: any, prospects: any[]) {
  const reachOutTs: number[] = []; // first outbound email per prospect
  const followUpTs: number[] = []; // subsequent outbound emails
  const replyTs: number[] = [];
  const meetingHeldTs: number[] = []; // meetingDate in the past
  const meetingBookedTs: number[] = []; // createdAt (when it was scheduled)
  const callTs: number[] = []; // meetingType === call, by meetingDate
  const f2fTs: number[] = []; // other meeting types, by meetingDate
  const schemeTs: number[] = []; // prospectSchemes createdAt
  const liveSchemeTs: number[] = []; // createdAt of status === live schemes
  // qual sub-stage transition timestamps, keyed by destination step
  const subStageEnteredTs: Record<string, number[]> = {};

  let contacted = 0;
  let replied = 0;
  let meetingsBookedProspects = 0;
  let arranging = 0; // replied but no meeting yet
  let liveSchemes = 0;
  let pipelineValueGBP = 0;
  let pricedCount = 0; // prospects with an operator-entered deal value
  const now = Date.now();

  // Read every prospect's event streams in parallel (5 queries per prospect, all
  // prospects concurrent) — the sequential version was the dashboard's main
  // latency sink (84 prospects × 5 round-trips in series).
  const perProspect = await Promise.all(
    prospects.map(async (p) => {
      const [touchpoints, replies, meetings, schemes, events] = await Promise.all([
        ctx.db.query("touchpoints").withIndex("by_related_client", (q: any) => q.eq("relatedClientId", p._id)).collect(),
        ctx.db.query("replyEvents").withIndex("by_linked_client", (q: any) => q.eq("linkedClientId", p._id)).collect(),
        ctx.db.query("meetings").withIndex("by_client", (q: any) => q.eq("clientId", p._id)).collect(),
        ctx.db.query("prospectSchemes").withIndex("by_client", (q: any) => q.eq("clientId", p._id)).collect(),
        ctx.db.query("prospectStageEvents").withIndex("by_client", (q: any) => q.eq("clientId", p._id)).collect(),
      ]);
      return { p, touchpoints, replies, meetings, schemes, events };
    }),
  );

  for (const { p, touchpoints, replies, meetings, schemes, events } of perProspect) {
    const outbound = touchpoints
      .filter((t: any) => t.direction === "outbound" && t.kind === "email")
      .map((t: any) => Date.parse(t.occurredAt))
      .filter((n: number) => isFinite(n))
      .sort((a: number, b: number) => a - b);
    if (outbound.length > 0) {
      contacted += 1;
      reachOutTs.push(outbound[0]);
      for (let i = 1; i < outbound.length; i++) followUpTs.push(outbound[i]);
    }

    let hasReply = false;
    for (const r of replies) {
      const t = Date.parse(r.receivedAt);
      if (isFinite(t)) {
        replyTs.push(t);
        hasReply = true;
      }
    }
    if (hasReply) replied += 1;

    const realMeetings = meetings.filter((m: any) => m.reviewState !== "confirmed_remove");
    if (realMeetings.length > 0) meetingsBookedProspects += 1;
    if (hasReply && realMeetings.length === 0) arranging += 1;
    for (const m of realMeetings) {
      const md = Date.parse(m.meetingDate);
      if (isFinite(md) && md <= now) meetingHeldTs.push(md);
      const created = Date.parse(m.createdAt ?? m.meetingDate);
      if (isFinite(created)) meetingBookedTs.push(created);
      if (isFinite(md)) (m.meetingType === "call" ? callTs : f2fTs).push(md);
    }

    for (const s of schemes) {
      const t = Date.parse(s.createdAt);
      if (isFinite(t)) {
        schemeTs.push(t);
        if (s.status === "live") {
          liveSchemeTs.push(t);
          liveSchemes += 1;
        }
      }
    }

    for (const e of events) {
      if (e.kind !== "qual_substage") continue;
      const t = Date.parse(e.at);
      if (!isFinite(t)) continue;
      (subStageEnteredTs[e.toValue] ??= []).push(t);
    }

    // Operator-entered deal value only — never the AI dealSizeRange estimate.
    if (typeof p.dealValueGBP === "number" && p.dealValueGBP > 0) {
      pipelineValueGBP += p.dealValueGBP;
      pricedCount += 1;
    }
  }

  // current sub-stage tallies (where prospects sit right now)
  const subStageNow: Record<string, number> = {};
  for (const p of prospects) {
    if (p.qualSubStage) subStageNow[p.qualSubStage] = (subStageNow[p.qualSubStage] ?? 0) + 1;
  }

  return {
    now,
    reachOutTs, followUpTs, replyTs,
    meetingHeldTs, meetingBookedTs, callTs, f2fTs,
    schemeTs, liveSchemeTs,
    subStageEnteredTs, subStageNow,
    contacted, replied, meetingsBookedProspects, arranging, liveSchemes,
    pipelineValueGBP, pricedCount,
  };
}

type Activity = Awaited<ReturnType<typeof gatherStageActivity>>;
type MetricGroup = { title: string; kpis: Kpi[] };

// ── Per-stage KPI builders ───────────────────────────────────────────────────
// Each returns { headline (top KpiRow), groups (panels of tiles) }. Bespoke per
// the client's KPI spec.

function coldKpis(a: Activity, count: number, t: Targets) {
  const { now } = a;
  const w0 = startOfWeekUTC(now);
  const m0 = startOfMonthUTC(now);
  const reachThisWeek = since(a.reachOutTs, w0, now);
  const followThisWeek = since(a.followUpTs, w0, now);
  const repliesThisMonth = since(a.replyTs, m0, now);

  const headline: Kpi[] = [
    { label: "Prospects", value: String(count), accentKey: "blue" },
    { label: "Reach-outs · wk", value: String(reachThisWeek), target: t.weeklyReachOut, accentKey: "blue" },
    { label: "Follow-ups · wk", value: String(followThisWeek), target: t.weeklyFollowUp },
    { label: "Replies · mo", value: String(repliesThisMonth), accentKey: "green" },
  ];
  const groups: MetricGroup[] = [
    {
      title: "Reach-outs",
      kpis: [
        { label: "This week", value: String(reachThisWeek), target: t.weeklyReachOut },
        { label: "Rolling avg / wk", value: f1(perWeek(a.reachOutTs, now)), meta: "8-wk trailing" },
        { label: "Rolling avg / mo", value: f1(perMonth(a.reachOutTs, now)), meta: "6-mo trailing" },
      ],
    },
    {
      title: "Follow-ups",
      kpis: [
        { label: "This week", value: String(followThisWeek), target: t.weeklyFollowUp },
        { label: "Rolling avg / wk", value: f1(perWeek(a.followUpTs, now)), meta: "8-wk trailing" },
        { label: "Rolling avg / mo", value: f1(perMonth(a.followUpTs, now)), meta: "6-mo trailing" },
      ],
    },
    {
      title: "Replies",
      kpis: [
        { label: "This month", value: String(repliesThisMonth), accentKey: "green" },
        { label: "Rolling avg / mo", value: f1(perMonth(a.replyTs, now)), meta: "6-mo trailing" },
        { label: "Response rate", value: pct(a.replied, a.contacted), meta: `${a.replied}/${a.contacted} contacted`, accentKey: "green" },
        { label: "Per template", value: "—", meta: "needs template attribution" },
      ],
    },
  ];
  return { headline, groups, ladder: null };
}

function warmPreKpis(a: Activity, count: number, t: Targets) {
  const { now } = a;
  const m0 = startOfMonthUTC(now);
  const meetingsThisMonth = since(a.meetingHeldTs, m0, now);
  const bookedThisMonth = since(a.meetingBookedTs, m0, now);
  const callsThisMonth = since(a.callTs, m0, now);
  const f2fThisMonth = since(a.f2fTs, m0, now);

  const headline: Kpi[] = [
    { label: "Prospects", value: String(count), accentKey: "purple" },
    { label: "Meetings · mo", value: String(meetingsThisMonth), target: t.monthlyMeetings, accentKey: "cyan" },
    { label: "Arranging", value: String(a.arranging), accentKey: a.arranging > 0 ? "orange" : undefined, meta: "replied, no meeting" },
    { label: "Booked · mo", value: String(bookedThisMonth) },
  ];
  const groups: MetricGroup[] = [
    {
      title: "Meetings",
      kpis: [
        { label: "Held this month", value: String(meetingsThisMonth), target: t.monthlyMeetings },
        { label: "Rolling held / mo", value: f1(perMonth(a.meetingHeldTs, now)), meta: "6-mo trailing" },
        { label: "Booked this month", value: String(bookedThisMonth) },
        { label: "Rolling booked / mo", value: f1(perMonth(a.meetingBookedTs, now)), meta: "6-mo trailing" },
      ],
    },
    {
      title: "Format (this month)",
      kpis: [
        { label: "Calls", value: String(callsThisMonth), accentKey: "blue" },
        { label: "Face-to-face", value: String(f2fThisMonth), accentKey: "purple" },
        { label: "→ deals", value: "—", meta: "outcome link pending" },
      ],
    },
    {
      title: "Pipeline",
      kpis: [
        { label: "Arranging now", value: String(a.arranging), accentKey: a.arranging > 0 ? "orange" : undefined },
        { label: "Pipeline value", value: a.pipelineValueGBP > 0 ? fmtGBP(a.pipelineValueGBP) : "—", meta: `${a.pricedCount}/${count} priced`, accentKey: "green" },
      ],
    },
  ];
  return { headline, groups, ladder: null };
}

function warmPostKpis(a: Activity, count: number, t: Targets) {
  const { now } = a;
  const m0 = startOfMonthUTC(now);
  const schemesThisMonth = since(a.schemeTs, m0, now);
  const followThisMonth = since(a.followUpTs, m0, now);
  const bookedThisMonth = since(a.meetingBookedTs, m0, now);

  const headline: Kpi[] = [
    { label: "Prospects", value: String(count), accentKey: "cyan" },
    { label: "Schemes · mo", value: String(schemesThisMonth), accentKey: "cyan" },
    { label: "Follow-ups · mo", value: String(followThisMonth) },
    { label: "Live schemes", value: String(a.liveSchemes), accentKey: "green" },
  ];
  const groups: MetricGroup[] = [
    {
      title: "Schemes",
      kpis: [
        { label: "Received this month", value: String(schemesThisMonth) },
        { label: "Rolling received / mo", value: f1(perMonth(a.schemeTs, now)), meta: "6-mo trailing" },
        { label: "Live discussed", value: String(a.liveSchemes), accentKey: "green" },
        { label: "Rolling live / mo", value: f1(perMonth(a.liveSchemeTs, now)), meta: "6-mo trailing" },
      ],
    },
    {
      title: "Follow-up",
      kpis: [
        { label: "Emails this month", value: String(followThisMonth) },
        { label: "Rolling emails / mo", value: f1(perMonth(a.followUpTs, now)), meta: "6-mo trailing" },
        { label: "Meetings booked / mo", value: String(bookedThisMonth) },
        { label: "Rolling booked / mo", value: f1(perMonth(a.meetingBookedTs, now)), meta: "6-mo trailing" },
      ],
    },
  ];
  return { headline, groups, ladder: null };
}

function ladderData(a: Activity, keys: readonly string[]) {
  return keys.map((k) => ({
    key: k,
    label: SUBSTAGE_LABELS[k] ?? k,
    count: a.subStageNow[k] ?? 0,
  }));
}

function preQualKpis(a: Activity, count: number, t: Targets) {
  const { now } = a;
  const m0 = startOfMonthUTC(now);
  const given = a.subStageEnteredTs["feedback_given"] ?? [];
  const discussed = a.subStageEnteredTs["feedback_discussed"] ?? [];
  const awaiting =
    (a.subStageNow["modelling_required"] ?? 0) +
    (a.subStageNow["modelling_review_required"] ?? 0) +
    (a.subStageNow["qualitative_feedback_required"] ?? 0);

  const headline: Kpi[] = [
    { label: "Prospects", value: String(count), accentKey: "orange" },
    { label: "Feedback given · mo", value: String(since(given, m0, now)), accentKey: "green" },
    { label: "Discussed · mo", value: String(since(discussed, m0, now)) },
    { label: "Awaiting feedback", value: String(awaiting), accentKey: awaiting > 0 ? "orange" : undefined },
  ];
  const groups: MetricGroup[] = [
    {
      title: "Throughput",
      kpis: [
        { label: "Feedback given · mo", value: String(since(given, m0, now)), accentKey: "green" },
        { label: "Rolling given / mo", value: f1(perMonth(given, now)), meta: "6-mo trailing" },
        { label: "Feedback discussed · mo", value: String(since(discussed, m0, now)) },
        { label: "Rolling discussed / mo", value: f1(perMonth(discussed, now)), meta: "6-mo trailing" },
      ],
    },
  ];
  return { headline, groups, ladder: { title: "Pre-qualification ladder", steps: ladderData(a, PRE_QUAL_KEYS) } };
}

function qualifiedKpis(a: Activity, count: number, t: Targets) {
  const { now } = a;
  const m0 = startOfMonthUTC(now);
  const requested = a.subStageEnteredTs["terms_requested"] ?? [];
  const requestedThisMonth = since(requested, m0, now);

  const headline: Kpi[] = [
    { label: "Prospects", value: String(count), accentKey: "green" },
    { label: "Terms req. · mo", value: String(requestedThisMonth), target: t.monthlyTermsRequested, accentKey: "green" },
    { label: "To credit", value: String(a.subStageNow["progression_to_credit"] ?? 0), accentKey: "cyan" },
    { label: "Credit approved", value: String(a.subStageNow["credit_approved"] ?? 0), accentKey: "green" },
  ];
  const groups: MetricGroup[] = [
    {
      title: "Terms",
      kpis: [
        { label: "Requested this month", value: String(requestedThisMonth), target: t.monthlyTermsRequested },
        { label: "Rolling requested / mo", value: f1(perMonth(requested, now)), meta: "6-mo trailing" },
        { label: "Presented (now)", value: String(a.subStageNow["terms_presented"] ?? 0) },
        { label: "Monthly target", value: String(t.monthlyTermsRequested), meta: "terms requested" },
      ],
    },
    {
      title: "Credit",
      kpis: [
        { label: "Progression to credit", value: String(a.subStageNow["progression_to_credit"] ?? 0), accentKey: "cyan" },
        { label: "Formal DD", value: String(a.subStageNow["formal_dd"] ?? 0), accentKey: "orange" },
        { label: "Credit approved", value: String(a.subStageNow["credit_approved"] ?? 0), accentKey: "green" },
      ],
    },
  ];
  return { headline, groups, ladder: { title: "Qualified ladder", steps: ladderData(a, QUALIFIED_KEYS) } };
}

const STAGE_BUILDERS: Record<Stage, (a: Activity, count: number, t: Targets) => { headline: Kpi[]; groups: MetricGroup[]; ladder: { title: string; steps: { key: string; label: string; count: number }[] } | null }> = {
  cold_outreach: coldKpis,
  warm_pre_meeting: warmPreKpis,
  warm_post_meeting: warmPostKpis,
  pre_qualification: preQualKpis,
  qualified: qualifiedKpis,
};

// ── Pipeline overview — summary page ─────────────────────────────────────────

export const pipelineOverview = query({
  args: {},
  handler: async (ctx) => {
    // Read only prospect rows (not every active/archived client) — the full
    // clients table carries heavy metadata blobs and dwarfs the per-query byte
    // budget once the book grows.
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_status", (q: any) => q.eq("status", "prospect"))
      .collect();
    // Include prospects filed into a stage by pipelineStage even if no
    // prospectState is set yet — a sourcing-promoted candidate sits in Cold
    // before its first intel run writes a prospectState.
    const prospects = (clients as any[]).filter(
      (c) => c.prospectState || c.pipelineStage,
    );

    const nowMs = Date.now();
    const { draftedReplies, pendingApprovals, pendingCadences, intelRuns } =
      await gatherActionSignals(ctx);

    // Per-client signal counts (signals that come off side tables). The derived
    // per-prospect flags (needs-action / intel-attention / manual-move) are added
    // inside the prospect loop below where the client doc is already in hand.
    const actionByClient = new Map<string, number>();
    const bump = (id: any) => {
      if (!id) return;
      actionByClient.set(String(id), (actionByClient.get(String(id)) ?? 0) + 1);
    };
    draftedReplies.forEach((a: any) => bump(a.relatedClientId));
    pendingApprovals.forEach((a: any) => bump(a.relatedClientId));
    // Collapse cadence touches to one count per package so a multi-touch package
    // is one action, matching the grouped queue.
    const seenCadencePkgs = new Set<string>();
    pendingCadences.forEach((c: any) => {
      const pkg = c.packageId ? String(c.packageId) : `cadence:${String(c._id)}`;
      if (seenCadencePkgs.has(pkg)) return;
      seenCadencePkgs.add(pkg);
      bump(c.relatedClientId);
    });
    intelRuns.forEach((r: any) => bump(r.linkedClientId));

    // Per-prospect derived action contribution (no extra reads).
    const derivedActionCount = (p: any): number => {
      const flags = Array.isArray(p.needsActionFlags) ? p.needsActionFlags.length : 0;
      const intelAtt = p.intelAttentionAt ? 1 : 0;
      const manual = deriveProspectFlags(p, nowMs).manualMoveReady ? 1 : 0;
      return flags + intelAtt + manual;
    };
    let totalActionItems = 0;

    const stages: Record<
      Stage,
      {
        key: Stage;
        count: number;
        pipelineValueGBP: number;
        pipelineValueLabel: string;
        pricedCount: number;
        actionItems: number;
        // Estimated value: operator dealValueGBP where set, else the AI
        // dealSizeRange midpoint. estCount = prospects in this stage with any
        // estimate (the basis for the value label).
        estValueGBP: number;
        estValueLabel: string;
        estCount: number;
      }
    > = Object.fromEntries(
      STAGE_KEYS.map((k) => [
        k,
        {
          key: k,
          count: 0,
          pipelineValueGBP: 0,
          pipelineValueLabel: "—",
          pricedCount: 0,
          actionItems: 0,
          estValueGBP: 0,
          estValueLabel: "—",
          estCount: 0,
        },
      ]),
    ) as any;

    let holding = 0;
    let pricedTotal = 0;
    // Per-prospect estimated deal sizes across the live pipeline (in-stage only;
    // holding/lost/promoted are excluded). Feeds the mean/median/total headline.
    const estDealSizes: number[] = [];
    for (const p of prospects) {
      const actionCount = (actionByClient.get(String(p._id)) ?? 0) + derivedActionCount(p);
      totalActionItems += actionCount;
      const stage = effectiveStage(p);
      if (!stage) {
        holding += 1;
        continue;
      }
      const bucket = stages[stage];
      bucket.count += 1;
      // Operator-entered deal value only — kept as the authoritative figure.
      if (typeof p.dealValueGBP === "number" && p.dealValueGBP > 0) {
        bucket.pipelineValueGBP += p.dealValueGBP;
        bucket.pricedCount += 1;
        pricedTotal += 1;
      }
      // Estimated value — operator figure if present, else AI midpoint. This is
      // what surfaces while operators have not yet priced deals by hand.
      const est = resolveProspectDealSizeGBP(p);
      if (est != null && est > 0) {
        bucket.estValueGBP += est;
        bucket.estCount += 1;
        estDealSizes.push(est);
      }
      bucket.actionItems += actionCount;
    }
    for (const k of STAGE_KEYS) {
      stages[k].pipelineValueLabel =
        stages[k].pipelineValueGBP > 0 ? fmtGBP(stages[k].pipelineValueGBP) : "—";
      stages[k].estValueLabel =
        stages[k].estValueGBP > 0 ? fmtGBP(stages[k].estValueGBP) : "—";
    }

    // Whole-pipeline estimate rollup. Total is mean-based (Σ midpoints) so the
    // big schemes count toward expected value; median is the robust "typical
    // deal" that the outliers don't distort. Both are returned so the UI can
    // show them side by side.
    const estTotalGBP = estDealSizes.reduce((s, v) => s + v, 0);
    const estCount = estDealSizes.length;
    const estMeanGBP = estCount > 0 ? estTotalGBP / estCount : 0;
    const estMedianGBP = median(estDealSizes);

    // Curated cross-pipeline KPI strip (the client's "Summary" spec). These are
    // whole-pipeline rollups, so we gather activity across every prospect once.
    const now = Date.now();
    const w0 = startOfWeekUTC(now);
    const m0 = startOfMonthUTC(now);
    const act = await gatherStageActivity(ctx, prospects);
    const t = await loadTargets(ctx);
    const summaryKpis: Kpi[] = [
      { label: "Reach-outs · wk", value: String(since(act.reachOutTs, w0, now)), target: t.weeklyReachOut, accentKey: "blue" },
      { label: "Follow-ups · wk", value: String(since(act.followUpTs, w0, now)), target: t.weeklyFollowUp },
      { label: "Replies · mo", value: String(since(act.replyTs, m0, now)), accentKey: "purple" },
      { label: "Meetings · mo", value: String(since(act.meetingHeldTs, m0, now)), target: t.monthlyMeetings, accentKey: "cyan" },
      { label: "Schemes · mo", value: String(since(act.schemeTs, m0, now)), accentKey: "cyan" },
      { label: "Terms req. · mo", value: String(since(act.subStageEnteredTs["terms_requested"] ?? [], m0, now)), target: t.monthlyTermsRequested, accentKey: "green" },
      { label: "To credit", value: String(act.subStageNow["progression_to_credit"] ?? 0), accentKey: "cyan" },
      { label: "Formal DD", value: String(act.subStageNow["formal_dd"] ?? 0), accentKey: "orange" },
    ];

    return {
      stages: STAGE_KEYS.map((k) => stages[k]),
      totalProspects: prospects.length,
      holding,
      totalActionItems,
      pricedTotal,
      // Estimated pipeline value (AI dealSizeRange + operator overrides).
      estTotalGBP,
      estMeanGBP,
      estMedianGBP,
      estCount,
      summaryKpis,
    };
  },
});

// ── Stage dashboard — bespoke KPIs + ladder + action items for one stage ─────

export const stageDashboard = query({
  args: { stage: v.string() },
  handler: async (ctx, args) => {
    if (!(STAGE_KEYS as readonly string[]).includes(args.stage)) {
      return null;
    }
    const stage = args.stage as Stage;

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_status", (q: any) => q.eq("status", "prospect"))
      .collect();
    // effectiveStage already encodes "has a stage" (stored pipelineStage or a
    // derivable prospectState), so it alone is the membership test — this also
    // picks up sourcing-promoted prospects filed by pipelineStage pre-intel.
    const prospects = (clients as any[]).filter(
      (c) => effectiveStage(c) === stage,
    );
    const count = prospects.length;

    const activity = await gatherStageActivity(ctx, prospects);
    const t = await loadTargets(ctx);
    const built = STAGE_BUILDERS[stage](activity, count, t);

    const signals = await gatherActionSignals(ctx);
    // Reuse the shared grouping: scope to THIS stage's prospects, no stage chip
    // (the dashboard is already a single-stage view). The derived flag /
    // intel_attention / manual_move actions surface here too, so per-stage queues
    // match the unified home table.
    const { groups, counts } = await buildActionGroups(ctx, {
      prospects,
      signals,
      nowMs: Date.now(),
      attachStage: false,
    });

    // Backward-compat: keep the old flat `actionItems` shape so a frontend
    // bundle deployed BEFORE the grouped queue (Vercel lags the Convex deploy,
    // which is live immediately) doesn't crash on `actionItems.length`. Safe to
    // drop once the matching frontend is fully rolled out.
    const actionItems = groups
      .flatMap((g) =>
        g.actions.map((a) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          subtitle: a.subtitle,
          clientId: g.clientId,
          clientName: g.clientName,
          occurredAt: a.when,
          severity: a.severity,
        })),
      )
      .slice(0, 50);

    return {
      stage,
      count,
      headline: built.headline,
      metricGroups: built.groups,
      ladder: built.ladder,
      actionItems,
      actionGroups: groups.slice(0, 40),
      actionGroupTotal: groups.length,
      actionCounts: {
        // `replies` kept for back-compat — now the needs-action triage (flag) count.
        replies: counts.flags,
        approvals: counts.approvals,
        cadences: counts.cadences,
        intel: counts.intel,
        replyDrafts: counts.replyDrafts,
        intelAttention: counts.intelAttention,
        manualMoves: counts.manualMoves,
      },
    };
  },
});

// ── Requires attention — unified cross-stage action GROUPS for the home page ──
// Runs the same signal gather + grouping as the per-stage dashboards but across
// EVERY prospect, tagging each group with its pipeline stage. This is the single
// canonical "what needs me now" surface on /prospects. Defensive throughout:
// every sibling-owned field (needsActionFlags / intelAttentionAt / draftPayload)
// is read optionally so a deploy-skew (Convex live before Vercel) never crashes.
const REQ_ATTENTION_GROUP_CAP = 60;

export const requiresAttention = query({
  args: { reasonFilter: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_status", (q: any) => q.eq("status", "prospect"))
      .collect();
    const prospects = (clients as any[]).filter((c) => c.prospectState || c.pipelineStage);

    const signals = await gatherActionSignals(ctx);
    const { groups, counts } = await buildActionGroups(ctx, {
      prospects,
      signals,
      nowMs: Date.now(),
      attachStage: true,
    });

    // Optional type filter — keep groups that have at least one action of a
    // requested type, dropping the rest of that group's non-matching actions.
    let filtered = groups;
    const filter = Array.isArray(args.reasonFilter) ? args.reasonFilter.filter(Boolean) : [];
    if (filter.length > 0) {
      const wanted = new Set(filter);
      filtered = groups
        .map((g) => ({ ...g, actions: g.actions.filter((a) => wanted.has(a.type)) }))
        .filter((g) => g.actions.length > 0);
    }

    const blockedCount = filtered.filter((g) => g.blocking).length;

    return {
      groups: filtered.slice(0, REQ_ATTENTION_GROUP_CAP),
      total: filtered.length,
      blockedCount,
      counts,
    };
  },
});

// ── Resolve the acting user from Clerk identity ──────────────────────────────

async function resolveUserId(ctx: any): Promise<Id<"users"> | undefined> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  return user?._id;
}

// ── Canonical pipeline-stage write (v3) ──────────────────────────────────────
// THE single place pipelineStage is written. Every event path (sourcing promote,
// cadence approve, meeting booked/completed, reply, manual move) routes through
// here so the stage is authoritative + every move is logged with provenance.
//
//   mode: "forward_only" → no-op if `toStage` is not strictly ahead of the
//          prospect's current effective stage (event-driven moves never demote,
//          e.g. approving a re-engagement cadence on a warm prospect).
//   mode: "force"        → always set (manual operator moves can go any direction).
//
// Does NOT touch prospectState (kept as internal plumbing) or clients.status.
// `ctx` is a mutation ctx; same-transaction callers import + await this directly.
const STAGE_LITERALS = v.union(
  v.literal("cold_outreach"),
  v.literal("warm_pre_meeting"),
  v.literal("warm_post_meeting"),
  v.literal("pre_qualification"),
  v.literal("qualified"),
);

export async function applyPipelineStage(
  ctx: any,
  args: {
    clientId: Id<"clients">;
    toStage: Stage;
    reason: PipelineStageReason;
    userId?: Id<"users">;
    mode?: "forward_only" | "force";
  },
): Promise<{ ok: boolean; stage: Stage; changedAt: string; skipped: boolean }> {
  const mode = args.mode ?? "force";
  const client = await ctx.db.get(args.clientId);
  if (!client) throw new Error("Prospect not found");

  const fromValue = effectiveStage(client) ?? undefined;

  if (mode === "forward_only" && !isForwardStage(fromValue ?? null, args.toStage)) {
    // The prospect is already at or ahead of the requested stage — leave them.
    return { ok: true, stage: (fromValue ?? args.toStage) as Stage, changedAt: client.pipelineStageChangedAt ?? "", skipped: true };
  }

  const now = new Date().toISOString();
  await ctx.db.patch(args.clientId, {
    pipelineStage: args.toStage,
    pipelineStageChangedAt: now,
    pipelineStageChangedBy: args.userId,
  });
  if (fromValue !== args.toStage) {
    await ctx.db.insert("prospectStageEvents", {
      clientId: args.clientId,
      kind: "pipeline_stage",
      fromValue,
      toValue: args.toStage,
      at: now,
      byUserId: args.userId,
      reason: args.reason,
    });
  }
  return { ok: true, stage: args.toStage, changedAt: now, skipped: false };
}

// Internal wrapper for scheduler / action callers (no same-tx ctx). Resolves
// nothing about identity — pass userId explicitly when known.
export const setPipelineStageInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    toStage: STAGE_LITERALS,
    reason: v.string(),
    userId: v.optional(v.id("users")),
    mode: v.optional(v.union(v.literal("forward_only"), v.literal("force"))),
  },
  handler: async (ctx, args) =>
    applyPipelineStage(ctx, {
      clientId: args.clientId,
      toStage: args.toStage as Stage,
      reason: args.reason as PipelineStageReason,
      userId: args.userId,
      mode: args.mode,
    }),
});

// ── Manual stage promotion ───────────────────────────────────────────────────
// Operator moves a prospect between the 5 manual pipeline stages (any direction).
// Delegates to applyPipelineStage (reason: "manual", mode: "force").

export const promoteStage = mutation({
  args: {
    clientId: v.id("clients"),
    toStage: STAGE_LITERALS,
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    return applyPipelineStage(ctx, {
      clientId: args.clientId,
      toStage: args.toStage as Stage,
      reason: "manual",
      userId,
      mode: "force",
    });
  },
});

// ── Sub-stage advance (pre-qualification / qualified ladders) ─────────────────
// Sets the prospect's current ladder step and logs the transition so rolling
// "entered-this-month" KPIs stay exact.

const QUAL_SUBSTAGE_LITERALS = v.union(
  v.literal("modelling_required"),
  v.literal("modelling_review_required"),
  v.literal("qualitative_feedback_required"),
  v.literal("feedback_given"),
  v.literal("feedback_discussed"),
  v.literal("terms_requested"),
  v.literal("terms_presented"),
  v.literal("progression_to_credit"),
  v.literal("formal_dd"),
  v.literal("credit_approved"),
);

async function applyQualSubStage(
  ctx: any,
  args: { clientId: Id<"clients">; subStage: string; userId?: Id<"users"> },
): Promise<{ ok: boolean; subStage: string; changedAt: string }> {
  const client = (await ctx.db.get(args.clientId)) as any;
  if (!client) throw new Error("Prospect not found");

  const now = new Date().toISOString();
  const fromValue = client.qualSubStage as string | undefined;
  await ctx.db.patch(args.clientId, {
    qualSubStage: args.subStage,
    qualSubStageChangedAt: now,
    qualSubStageChangedBy: args.userId,
  });
  if (fromValue !== args.subStage) {
    await ctx.db.insert("prospectStageEvents", {
      clientId: args.clientId,
      kind: "qual_substage",
      fromValue,
      toValue: args.subStage,
      at: now,
      byUserId: args.userId,
    });
  }
  return { ok: true, subStage: args.subStage, changedAt: now };
}

export const setQualSubStage = mutation({
  args: {
    clientId: v.id("clients"),
    subStage: QUAL_SUBSTAGE_LITERALS,
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    return applyQualSubStage(ctx, { ...args, userId });
  },
});

// Internal wrapper for the MCP server (no Clerk auth on those requests —
// userId arrives resolved from the bearer token).
export const setQualSubStageInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    subStage: QUAL_SUBSTAGE_LITERALS,
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => applyQualSubStage(ctx, args),
});

// ── Operator-entered deal value ──────────────────────────────────────────────
// The single source of truth for the pipeline-value metric. Pass valueGBP: null
// to clear it (back to "not priced"). Never derived — the operator owns it.

export const setDealValue = mutation({
  args: {
    clientId: v.id("clients"),
    valueGBP: v.union(v.number(), v.null()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Prospect not found");

    const now = new Date().toISOString();
    if (args.valueGBP == null) {
      await ctx.db.patch(args.clientId, {
        dealValueGBP: undefined,
        dealValueNote: undefined,
        dealValueSetAt: now,
        dealValueSetBy: userId,
      });
      return { ok: true, valueGBP: null, changedAt: now };
    }
    const clean = Math.max(0, Math.round(args.valueGBP));
    await ctx.db.patch(args.clientId, {
      dealValueGBP: clean,
      dealValueNote: args.note?.trim() || undefined,
      dealValueSetAt: now,
      dealValueSetBy: userId,
    });
    return { ok: true, valueGBP: clean, changedAt: now };
  },
});

// ── Targets (editable house weekly/monthly KPI targets) ──────────────────────

export const getTargets = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("pipelineTargets").first();
    if (!row) return { ...DEFAULT_TARGETS, isDefault: true, updatedAt: null as string | null };
    return {
      weeklyReachOut: row.weeklyReachOut,
      weeklyFollowUp: row.weeklyFollowUp,
      monthlyMeetings: row.monthlyMeetings,
      monthlyTermsRequested: row.monthlyTermsRequested,
      isDefault: false,
      updatedAt: row.updatedAt,
    };
  },
});

export const updateTargets = mutation({
  args: {
    weeklyReachOut: v.number(),
    weeklyFollowUp: v.number(),
    monthlyMeetings: v.number(),
    monthlyTermsRequested: v.number(),
  },
  handler: async (ctx, args) => {
    // Clamp to non-negative integers — a target is a count, never below zero.
    const clean = {
      weeklyReachOut: Math.max(0, Math.round(args.weeklyReachOut)),
      weeklyFollowUp: Math.max(0, Math.round(args.weeklyFollowUp)),
      monthlyMeetings: Math.max(0, Math.round(args.monthlyMeetings)),
      monthlyTermsRequested: Math.max(0, Math.round(args.monthlyTermsRequested)),
    };
    const userId = await resolveUserId(ctx);
    const now = new Date().toISOString();
    const existing = await ctx.db.query("pipelineTargets").first();
    if (existing) {
      await ctx.db.patch(existing._id, { ...clean, updatedAt: now, updatedBy: userId });
    } else {
      await ctx.db.insert("pipelineTargets", { ...clean, updatedAt: now, updatedBy: userId });
    }
    return { ok: true, ...clean, updatedAt: now };
  },
});
