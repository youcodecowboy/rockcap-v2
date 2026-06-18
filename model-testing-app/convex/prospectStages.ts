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

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const STAGE_KEYS = [
  "cold_outreach",
  "warm_pre_meeting",
  "warm_post_meeting",
  "pre_qualification",
  "qualified",
] as const;
type Stage = (typeof STAGE_KEYS)[number];

// prospectState → default stage (only when no pipelineStage is stored).
const DERIVE: Record<string, Stage> = {
  researched: "cold_outreach",
  drafted: "cold_outreach",
  needs_revision: "cold_outreach",
  active: "cold_outreach",
  replied: "warm_pre_meeting",
  engaged: "warm_post_meeting",
};

// Ladder step keys — KEEP IN SYNC with PRE_QUAL_STEPS / QUALIFIED_STEPS.
const PRE_QUAL_KEYS = [
  "modelling_required",
  "modelling_review_required",
  "qualitative_feedback_required",
  "feedback_given",
  "feedback_discussed",
] as const;
const QUALIFIED_KEYS = [
  "terms_requested",
  "terms_presented",
  "progression_to_credit",
  "formal_dd",
  "credit_approved",
] as const;
const SUBSTAGE_LABELS: Record<string, string> = {
  modelling_required: "Modelling required",
  modelling_review_required: "Modelling review required",
  qualitative_feedback_required: "Qualitative feedback required",
  feedback_given: "Feedback given",
  feedback_discussed: "Feedback discussed",
  terms_requested: "Terms requested",
  terms_presented: "Terms presented",
  progression_to_credit: "Progression to credit",
  formal_dd: "Formal due diligence",
  credit_approved: "Credit approved",
};

// Default house targets — KEEP IN SYNC with PIPELINE_TARGETS in
// src/lib/prospects/stages.ts. These seed the editable pipelineTargets
// singleton; loadTargets() returns the stored row when one exists.
type Targets = {
  weeklyReachOut: number;
  weeklyFollowUp: number;
  monthlyMeetings: number;
  monthlyTermsRequested: number;
};
const DEFAULT_TARGETS: Targets = {
  weeklyReachOut: 10,
  weeklyFollowUp: 10,
  monthlyMeetings: 8,
  monthlyTermsRequested: 5,
};

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

function effectiveStage(c: any): Stage | null {
  if (c.pipelineStage && (STAGE_KEYS as readonly string[]).includes(c.pipelineStage)) {
    return c.pipelineStage as Stage;
  }
  if (!c.prospectState) return null;
  return DERIVE[c.prospectState as string] ?? null;
}

// ── Value parsing ────────────────────────────────────────────────────────────

function parseDealValueGBP(s?: string | null): number | null {
  if (!s) return null;
  const m = s.match(/£\s*([\d.]+)\s*(?:[-–—]|to)?\s*([\d.]+)?\s*(m|k|bn)?/i);
  if (!m) return null;
  const lo = parseFloat(m[1]);
  if (!isFinite(lo)) return null;
  const hi = m[2] ? parseFloat(m[2]) : lo;
  const unit = (m[3] ?? "m").toLowerCase();
  const mult = unit === "bn" ? 1_000_000_000 : unit === "k" ? 1_000 : 1_000_000;
  const mid = ((lo + (isFinite(hi) ? hi : lo)) / 2) * mult;
  return isFinite(mid) ? mid : null;
}

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

async function gatherActionSignals(ctx: any) {
  const unrouted = await ctx.db
    .query("replyEvents")
    .withIndex("by_dispatched_to", (q: any) => q.eq("dispatchedTo", "operator_review"))
    .collect();
  const replies = unrouted.filter((r: any) => !r.processed && r.linkedClientId);

  const pendingApprovals = (await ctx.db
    .query("approvals")
    .withIndex("by_status", (q: any) => q.eq("status", "pending"))
    .collect()) as any[];

  const pendingCadences = (await ctx.db
    .query("cadences")
    .withIndex("by_package_approval_status", (q: any) => q.eq("packageApprovalStatus", "pending"))
    .collect()) as any[];

  const failedRuns = (await ctx.db
    .query("skillRuns")
    .withIndex("by_status", (q: any) => q.eq("status", "failed"))
    .collect()) as any[];
  const gappyRuns = (await ctx.db
    .query("skillRuns")
    .withIndex("by_status", (q: any) => q.eq("status", "complete_with_gaps"))
    .collect()) as any[];
  const intelRuns = [...failedRuns, ...gappyRuns].filter(
    (r: any) => r.skillName === "prospect-intel" && r.linkedClientId,
  );

  return { replies, pendingApprovals, pendingCadences, intelRuns };
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
  const now = Date.now();

  for (const p of prospects) {
    const touchpoints = await ctx.db
      .query("touchpoints")
      .withIndex("by_related_client", (q: any) => q.eq("relatedClientId", p._id))
      .collect();
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

    const replies = await ctx.db
      .query("replyEvents")
      .withIndex("by_linked_client", (q: any) => q.eq("linkedClientId", p._id))
      .collect();
    let hasReply = false;
    for (const r of replies) {
      const t = Date.parse(r.receivedAt);
      if (isFinite(t)) {
        replyTs.push(t);
        hasReply = true;
      }
    }
    if (hasReply) replied += 1;

    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_client", (q: any) => q.eq("clientId", p._id))
      .collect();
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

    const schemes = await ctx.db
      .query("prospectSchemes")
      .withIndex("by_client", (q: any) => q.eq("clientId", p._id))
      .collect();
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

    const events = await ctx.db
      .query("prospectStageEvents")
      .withIndex("by_client", (q: any) => q.eq("clientId", p._id))
      .collect();
    for (const e of events) {
      if (e.kind !== "qual_substage") continue;
      const t = Date.parse(e.at);
      if (!isFinite(t)) continue;
      (subStageEnteredTs[e.toValue] ??= []).push(t);
    }

    const val = parseDealValueGBP(p.dealSizeRange);
    if (val) pipelineValueGBP += val;
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
    pipelineValueGBP,
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
        { label: "Pipeline value", value: a.pipelineValueGBP > 0 ? fmtGBP(a.pipelineValueGBP) : "—", accentKey: "green" },
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
    const clients = await ctx.db.query("clients").collect();
    const prospects = (clients as any[]).filter(
      (c) => c.status === "prospect" && c.prospectState,
    );

    const { replies, pendingApprovals, pendingCadences, intelRuns } =
      await gatherActionSignals(ctx);

    const actionByClient = new Map<string, number>();
    const bump = (id: any) => {
      if (!id) return;
      actionByClient.set(String(id), (actionByClient.get(String(id)) ?? 0) + 1);
    };
    replies.forEach((r: any) => bump(r.linkedClientId));
    pendingApprovals.forEach((a: any) => bump(a.relatedClientId));
    pendingCadences.forEach((c: any) => bump(c.relatedClientId));
    intelRuns.forEach((r: any) => bump(r.linkedClientId));

    const stages: Record<
      Stage,
      { key: Stage; count: number; pipelineValueGBP: number; pipelineValueLabel: string; actionItems: number }
    > = Object.fromEntries(
      STAGE_KEYS.map((k) => [
        k,
        { key: k, count: 0, pipelineValueGBP: 0, pipelineValueLabel: "—", actionItems: 0 },
      ]),
    ) as any;

    let holding = 0;
    for (const p of prospects) {
      const stage = effectiveStage(p);
      if (!stage) {
        holding += 1;
        continue;
      }
      const bucket = stages[stage];
      bucket.count += 1;
      const val = parseDealValueGBP(p.dealSizeRange);
      if (val) bucket.pipelineValueGBP += val;
      bucket.actionItems += actionByClient.get(String(p._id)) ?? 0;
    }
    for (const k of STAGE_KEYS) {
      stages[k].pipelineValueLabel =
        stages[k].pipelineValueGBP > 0 ? fmtGBP(stages[k].pipelineValueGBP) : "—";
    }

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

    const totalActionItems =
      replies.length + pendingApprovals.length + pendingCadences.length + intelRuns.length;

    return {
      stages: STAGE_KEYS.map((k) => stages[k]),
      totalProspects: prospects.length,
      holding,
      totalActionItems,
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

    const clients = await ctx.db.query("clients").collect();
    const prospects = (clients as any[]).filter(
      (c) => c.status === "prospect" && c.prospectState && effectiveStage(c) === stage,
    );
    const prospectIds = new Set(prospects.map((p) => String(p._id)));
    const nameById = new Map<string, string>(
      prospects.map((p) => [String(p._id), p.name ?? p.companyName ?? "Unknown"]),
    );
    const count = prospects.length;

    const activity = await gatherStageActivity(ctx, prospects);
    const t = await loadTargets(ctx);
    const built = STAGE_BUILDERS[stage](activity, count, t);

    const { replies, pendingApprovals, pendingCadences, intelRuns } =
      await gatherActionSignals(ctx);
    const stageReplies = replies.filter((r: any) => prospectIds.has(String(r.linkedClientId)));
    const stageApprovals = pendingApprovals.filter((a: any) => prospectIds.has(String(a.relatedClientId)));
    const stageCadences = pendingCadences.filter((c: any) => prospectIds.has(String(c.relatedClientId)));
    const stageIntel = intelRuns.filter((r: any) => prospectIds.has(String(r.linkedClientId)));

    type Item = {
      id: string;
      type: "reply" | "approval" | "cadence" | "intel";
      title: string;
      subtitle: string;
      clientId: string | null;
      clientName: string;
      occurredAt: string;
      severity: "warn" | "info" | "ok";
    };
    const items: Item[] = [];
    for (const r of stageReplies) {
      items.push({
        id: String(r._id),
        type: "reply",
        title: nameById.get(String(r.linkedClientId)) ?? "Reply",
        subtitle: r.replySubject || (r.replyBodyText ? String(r.replyBodyText).slice(0, 80) : "Inbound reply awaiting triage"),
        clientId: r.linkedClientId ? String(r.linkedClientId) : null,
        clientName: nameById.get(String(r.linkedClientId)) ?? "Unknown",
        occurredAt: r.receivedAt ?? "",
        severity: "warn",
      });
    }
    for (const a of stageApprovals) {
      items.push({
        id: String(a._id),
        type: "approval",
        title: a.summary || "Approval pending",
        subtitle: `${String(a.entityType).replace(/_/g, " ")}${a.requestSourceName ? ` · ${a.requestSourceName}` : ""}`,
        clientId: a.relatedClientId ? String(a.relatedClientId) : null,
        clientName: nameById.get(String(a.relatedClientId)) ?? "Unknown",
        occurredAt: a.requestedAt ?? "",
        severity: "info",
      });
    }
    for (const c of stageCadences) {
      items.push({
        id: String(c._id),
        type: "cadence",
        title: "Cadence package awaiting approval",
        subtitle: nameById.get(String(c.relatedClientId)) ?? c.cadenceType ?? "Outreach cadence",
        clientId: c.relatedClientId ? String(c.relatedClientId) : null,
        clientName: nameById.get(String(c.relatedClientId)) ?? "Unknown",
        occurredAt: c.createdAt ?? (c._creationTime ? new Date(c._creationTime).toISOString() : ""),
        severity: "info",
      });
    }
    for (const r of stageIntel) {
      const gap = r.gaps?.[0]?.description;
      items.push({
        id: String(r._id),
        type: "intel",
        title: "Intelligence needs rerun",
        subtitle: `${nameById.get(String(r.linkedClientId)) ?? "Prospect"}${gap ? ` · ${gap}` : r.status === "failed" ? " · run failed" : ""}`,
        clientId: r.linkedClientId ? String(r.linkedClientId) : null,
        clientName: nameById.get(String(r.linkedClientId)) ?? "Unknown",
        occurredAt: r.completedAt ?? "",
        severity: "warn",
      });
    }
    items.sort((a, b) => (b.occurredAt || "").localeCompare(a.occurredAt || ""));

    return {
      stage,
      count,
      headline: built.headline,
      metricGroups: built.groups,
      ladder: built.ladder,
      actionItems: items.slice(0, 50),
      actionCounts: {
        replies: stageReplies.length,
        approvals: stageApprovals.length,
        cadences: stageCadences.length,
        intel: stageIntel.length,
      },
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

// ── Manual stage promotion ───────────────────────────────────────────────────
// Moves a prospect between the 5 manual pipeline stages and logs the transition.
// Does NOT touch prospectState (the outreach engine owns that) or clients.status.

export const promoteStage = mutation({
  args: {
    clientId: v.id("clients"),
    toStage: v.union(
      v.literal("cold_outreach"),
      v.literal("warm_pre_meeting"),
      v.literal("warm_post_meeting"),
      v.literal("pre_qualification"),
      v.literal("qualified"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Prospect not found");

    const now = new Date().toISOString();
    const fromValue = effectiveStage(client) ?? undefined;
    await ctx.db.patch(args.clientId, {
      pipelineStage: args.toStage,
      pipelineStageChangedAt: now,
      pipelineStageChangedBy: userId,
    });
    if (fromValue !== args.toStage) {
      await ctx.db.insert("prospectStageEvents", {
        clientId: args.clientId,
        kind: "pipeline_stage",
        fromValue,
        toValue: args.toStage,
        at: now,
        byUserId: userId,
      });
    }
    return { ok: true, stage: args.toStage, changedAt: now };
  },
});

// ── Sub-stage advance (pre-qualification / qualified ladders) ─────────────────
// Sets the prospect's current ladder step and logs the transition so rolling
// "entered-this-month" KPIs stay exact.

export const setQualSubStage = mutation({
  args: {
    clientId: v.id("clients"),
    subStage: v.union(
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
    ),
  },
  handler: async (ctx, args) => {
    const userId = await resolveUserId(ctx);
    const client = (await ctx.db.get(args.clientId)) as any;
    if (!client) throw new Error("Prospect not found");

    const now = new Date().toISOString();
    const fromValue = client.qualSubStage as string | undefined;
    await ctx.db.patch(args.clientId, {
      qualSubStage: args.subStage,
      qualSubStageChangedAt: now,
      qualSubStageChangedBy: userId,
    });
    if (fromValue !== args.subStage) {
      await ctx.db.insert("prospectStageEvents", {
        clientId: args.clientId,
        kind: "qual_substage",
        fromValue,
        toValue: args.subStage,
        at: now,
        byUserId: userId,
      });
    }
    return { ok: true, subStage: args.subStage, changedAt: now };
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
