// ─────────────────────────────────────────────────────────────────────────────
// Prospect PIPELINE STAGE dashboards (v2) — server aggregation.
//
//   pipelineOverview  → per-stage counts + pipeline value + action-item counts
//                       (powers the /prospects summary page)
//   stageDashboard    → full KPI set + normalized action-items list for ONE
//                       stage (powers /prospects/[stage])
//   promoteStage      → operator moves a prospect between the 5 manual stages
//
// Stage derivation is duplicated here from src/lib/prospects/stages.ts because
// importing app code across the Convex bundle boundary is fragile. KEEP THE TWO
// IN SYNC: the stage keys + derivesFrom mapping must match.
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
// Mirrors derivesFrom in src/lib/prospects/stages.ts.
const DERIVE: Record<string, Stage> = {
  researched: "cold_outreach",
  drafted: "cold_outreach",
  needs_revision: "cold_outreach",
  active: "cold_outreach",
  replied: "warm_pre_meeting",
  engaged: "warm_post_meeting",
};

function effectiveStage(c: any): Stage | null {
  if (c.pipelineStage && (STAGE_KEYS as readonly string[]).includes(c.pipelineStage)) {
    return c.pipelineStage as Stage;
  }
  if (!c.prospectState) return null;
  return DERIVE[c.prospectState as string] ?? null;
}

// Best-effort numeric value (GBP) parsed from the dealSizeRange display string
// (e.g. "£2-5m, medium confidence …" → 3_500_000). Returns null when absent /
// unparseable so callers can treat value as unknown rather than zero.
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

// ── Gather the "requires action" signals once, keyed by clientId ─────────────
// Returns maps so per-stage / per-prospect rollups are O(1) lookups.

async function gatherActionSignals(ctx: any) {
  // Unrouted inbound replies awaiting operator triage.
  const unrouted = await ctx.db
    .query("replyEvents")
    .withIndex("by_dispatched_to", (q: any) => q.eq("dispatchedTo", "operator_review"))
    .collect();
  const replies = unrouted.filter((r: any) => !r.processed && r.linkedClientId);

  // Pending approvals (overnight drafts / sends awaiting review).
  const pendingApprovals = (await ctx.db
    .query("approvals")
    .withIndex("by_status", (q: any) => q.eq("status", "pending"))
    .collect()) as any[];

  // Cadence packages awaiting approval ("overnight templates to review").
  const pendingCadences = (await ctx.db
    .query("cadences")
    .withIndex("by_package_approval_status", (q: any) => q.eq("packageApprovalStatus", "pending"))
    .collect()) as any[];

  // Intel runs that failed or completed with gaps → "intelligence to rerun".
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

// ── Pipeline overview — one card per stage for the summary page ──────────────

export const pipelineOverview = query({
  args: {},
  handler: async (ctx) => {
    const clients = await ctx.db.query("clients").collect();
    const prospects = (clients as any[]).filter(
      (c) => c.status === "prospect" && c.prospectState,
    );

    const { replies, pendingApprovals, pendingCadences, intelRuns } =
      await gatherActionSignals(ctx);

    // action-item count per clientId
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

    const totalActionItems =
      replies.length + pendingApprovals.length + pendingCadences.length + intelRuns.length;

    return {
      stages: STAGE_KEYS.map((k) => stages[k]),
      totalProspects: prospects.length,
      holding,
      totalActionItems,
    };
  },
});

// ── Stage dashboard — KPIs + action items for one stage ──────────────────────

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

    const { replies, pendingApprovals, pendingCadences, intelRuns } =
      await gatherActionSignals(ctx);

    // Per-prospect outreach + meeting rollups (scoped to this stage's prospects).
    let emailsSent = 0;
    let contacted = 0;
    let replied = 0;
    let meetingsHeld = 0;
    let meetingsBooked = 0;
    let pipelineValueGBP = 0;
    const daysSinceReply: number[] = [];
    const now = Date.now();

    for (const p of prospects) {
      const touchpoints = await ctx.db
        .query("touchpoints")
        .withIndex("by_related_client", (q: any) => q.eq("relatedClientId", p._id))
        .collect();
      const outbound = touchpoints.filter(
        (t: any) => t.direction === "outbound" && t.kind === "email",
      );
      emailsSent += outbound.length;
      if (outbound.length > 0) contacted += 1;

      const lastReply = await ctx.db
        .query("replyEvents")
        .withIndex("by_linked_client", (q: any) => q.eq("linkedClientId", p._id))
        .order("desc")
        .first();
      if (lastReply) {
        replied += 1;
        const t = Date.parse((lastReply as any).receivedAt);
        if (isFinite(t)) daysSinceReply.push(Math.max(0, (now - t) / 86_400_000));
      }

      const meetings = await ctx.db
        .query("meetings")
        .withIndex("by_client", (q: any) => q.eq("clientId", p._id))
        .collect();
      if (meetings.length > 0) meetingsBooked += 1;
      meetingsHeld += meetings.filter((m: any) => m.reviewState !== "confirmed_remove").length;

      const val = parseDealValueGBP(p.dealSizeRange);
      if (val) pipelineValueGBP += val;
    }

    const awaitingFirstSend = prospects.length - contacted;
    const avgDaysReply =
      daysSinceReply.length > 0
        ? daysSinceReply.reduce((a, b) => a + b, 0) / daysSinceReply.length
        : null;

    // Per-stage action counts (scoped to this stage's prospects).
    const stageReplies = replies.filter((r: any) => prospectIds.has(String(r.linkedClientId)));
    const stageApprovals = pendingApprovals.filter((a: any) =>
      prospectIds.has(String(a.relatedClientId)),
    );
    const stageCadences = pendingCadences.filter((c: any) =>
      prospectIds.has(String(c.relatedClientId)),
    );
    const stageIntel = intelRuns.filter((r: any) => prospectIds.has(String(r.linkedClientId)));

    // ── KPI sets ──
    // headline → top metrics bar (volume / pipeline position)
    // performance → right-hand KPI cards (how the stage is performing)
    const count = prospects.length;
    type Kpi = { label: string; value: string; meta?: string; accentKey?: string };
    const totalActions =
      stageReplies.length + stageApprovals.length + stageCadences.length + stageIntel.length;
    const valueLabel = pipelineValueGBP > 0 ? fmtGBP(pipelineValueGBP) : "—";

    const STAGE_ACCENT: Record<Stage, string> = {
      cold_outreach: "blue",
      warm_pre_meeting: "purple",
      warm_post_meeting: "cyan",
      pre_qualification: "orange",
      qualified: "green",
    };
    const extra: Record<Stage, Kpi> = {
      cold_outreach: { label: "Awaiting first send", value: String(awaitingFirstSend), accentKey: awaitingFirstSend > 0 ? "orange" : undefined },
      warm_pre_meeting: { label: "Replies to action", value: String(stageReplies.length), accentKey: stageReplies.length > 0 ? "orange" : undefined },
      warm_post_meeting: { label: "Meetings held", value: String(meetingsHeld), accentKey: "green" },
      pre_qualification: { label: "Approvals pending", value: String(stageApprovals.length), accentKey: stageApprovals.length > 0 ? "orange" : undefined },
      qualified: { label: "Ready to promote", value: String(count), accentKey: count > 0 ? "green" : undefined },
    };

    const headline: Kpi[] = [
      { label: "Prospects", value: String(count), accentKey: STAGE_ACCENT[stage] },
      { label: "Action items", value: String(totalActions), accentKey: totalActions > 0 ? "orange" : undefined },
      { label: "Pipeline value", value: valueLabel, accentKey: "green" },
      extra[stage],
    ];

    const performance: Kpi[] = [
      { label: "Emails sent", value: String(emailsSent), meta: `${contacted} contacted` },
      { label: "Response rate", value: pct(replied, contacted), meta: `${replied} replied`, accentKey: "green" },
      { label: "Meetings booked", value: String(meetingsBooked), accentKey: "cyan" },
      { label: "Avg days since reply", value: avgDaysReply == null ? "—" : avgDaysReply.toFixed(1), meta: "lower is better" },
    ];

    // ── Normalized action-items list ──
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
      headline,
      performance,
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

// ── Manual stage promotion ───────────────────────────────────────────────────
// Moves a prospect between the 5 manual pipeline stages. Does NOT touch
// prospectState (the outreach engine owns that) or clients.status. Turning a
// prospect into a client is a separate, deliberate action (clients.activate),
// surfaced from the "qualified" stage.

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
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Prospect not found");

    const now = new Date().toISOString();
    await ctx.db.patch(args.clientId, {
      pipelineStage: args.toStage,
      pipelineStageChangedAt: now,
      pipelineStageChangedBy: userId,
    });
    return { ok: true, stage: args.toStage, changedAt: now };
  },
});
