// ─────────────────────────────────────────────────────────────────────────────
// Prospect PIPELINE STAGES — CANONICAL pure module (prospecting v3).
//
// This is the SINGLE source of truth for the 5-stage pipeline taxonomy, the
// sub-stage ladders, house targets, and the pure derivation/ordering helpers.
// It is intentionally dependency-free (no React, no colors, no convex server
// imports) so BOTH the Convex backend (convex/prospectStages.ts et al.) and the
// Next.js client can import it natively. src/lib/prospects/stages.ts re-exports
// from here so existing `@/lib/prospects/stages` imports keep working.
//
// pipelineStage is the AUTHORITATIVE axis in v3 — it is written explicitly on
// events via applyPipelineStage (see convex/prospectStages.ts). derivePipelineStage
// below is a LEGACY-ONLY fallback for rows that have no stored pipelineStage yet.
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "cold_outreach"
  | "warm_pre_meeting"
  | "warm_post_meeting"
  | "pre_qualification"
  | "qualified";

// prospectState values, kept as internal plumbing (HubSpot lifecycle mapping +
// cadence mechanics). NOT shown in the v3 UI as a competing axis.
export type ProspectStateValue =
  | "researched" | "drafted" | "needs_revision" | "active"
  | "replied" | "engaged" | "promoted" | "parked" | "lost";

export interface StageDef {
  key: PipelineStage;
  /** Full operator-facing label. */
  label: string;
  /** Compact label for chips / tabs. */
  shortLabel: string;
  /** One-line description of what "lives" here. */
  description: string;
  /** Key into colors.accent (resolved by components via useColors). */
  accentKey: "blue" | "purple" | "cyan" | "orange" | "green" | "teal" | "indigo";
  /** Display order along the pipeline. */
  order: number;
  /**
   * prospectState values that DERIVE into this stage when a prospect has no
   * stored pipelineStage yet (LEGACY fallback only — v3 writes pipelineStage
   * explicitly). Stages with an empty list are manual-only destinations.
   */
  derivesFrom: ProspectStateValue[];
}

export const PIPELINE_STAGES: StageDef[] = [
  {
    key: "cold_outreach",
    label: "Cold outreach",
    shortLabel: "Cold",
    description: "Approved and actively cold-emailing — no reply yet.",
    accentKey: "blue",
    order: 1,
    derivesFrom: ["researched", "drafted", "needs_revision", "active"],
  },
  {
    key: "warm_pre_meeting",
    label: "Warm · pre-meeting",
    shortLabel: "Pre-meeting",
    description: "Meeting booked — preparing, working towards the meeting.",
    accentKey: "purple",
    order: 2,
    derivesFrom: ["replied"],
  },
  {
    key: "warm_post_meeting",
    label: "Warm · post-meeting",
    shortLabel: "Post-meeting",
    description: "Meeting held — nurturing towards qualification.",
    accentKey: "cyan",
    order: 3,
    derivesFrom: ["engaged"],
  },
  {
    key: "pre_qualification",
    label: "Pre-qualification",
    shortLabel: "Pre-qual",
    description: "Assessing fit, deal size and appetite before qualifying.",
    accentKey: "orange",
    order: 4,
    derivesFrom: [],
  },
  {
    key: "qualified",
    label: "Qualified",
    shortLabel: "Qualified",
    description: "Qualified — awaiting manual promotion to a client.",
    accentKey: "green",
    order: 5,
    derivesFrom: [],
  },
];

export const STAGE_KEYS: PipelineStage[] = PIPELINE_STAGES.map((s) => s.key);

const STAGE_BY_KEY: Record<string, StageDef> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s]),
);

export function stageFor(key: string | undefined | null): StageDef | null {
  if (!key) return null;
  return STAGE_BY_KEY[key] ?? null;
}

export function isPipelineStage(key: unknown): key is PipelineStage {
  return typeof key === "string" && key in STAGE_BY_KEY;
}

// ── Ordering helpers (v3) ─────────────────────────────────────────────────────
// Back the forward-only guard in applyPipelineStage so an event-driven move
// never demotes a prospect (e.g. approving a re-engagement cadence on a warm
// prospect must not drag them back to Cold).

export const STAGE_ORDER: Record<PipelineStage, number> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.key, s.order]),
) as Record<PipelineStage, number>;

/** Negative if a is earlier, positive if later, 0 if same/unknown. */
export function compareStages(
  a: PipelineStage | null | undefined,
  b: PipelineStage | null | undefined,
): number {
  const oa = a ? STAGE_ORDER[a] ?? 0 : 0;
  const ob = b ? STAGE_ORDER[b] ?? 0 : 0;
  return oa - ob;
}

/** True when `to` is strictly ahead of `from` (or `from` is unset). */
export function isForwardStage(
  from: PipelineStage | null | undefined,
  to: PipelineStage,
): boolean {
  if (!from) return true;
  return compareStages(from, to) < 0;
}

const DERIVE_MAP: Partial<Record<ProspectStateValue, PipelineStage>> = (() => {
  const m: Partial<Record<ProspectStateValue, PipelineStage>> = {};
  for (const s of PIPELINE_STAGES) {
    for (const st of s.derivesFrom) m[st] = s.key;
  }
  return m;
})();

/**
 * LEGACY-ONLY fallback. A stored `pipelineStage` always wins. Used only to place
 * rows that predate explicit stage writes; v3 events call applyPipelineStage.
 * Returns null for off-pipeline holding (parked / lost / promoted).
 */
export function derivePipelineStage(client: {
  pipelineStage?: string | null;
  prospectState?: string | null;
}): PipelineStage | null {
  if (client.pipelineStage && isPipelineStage(client.pipelineStage)) {
    return client.pipelineStage;
  }
  const st = client.prospectState as ProspectStateValue | undefined | null;
  if (!st) return null;
  return DERIVE_MAP[st] ?? null;
}

// prospectState values that are off-pipeline holding (not on any stage board).
export const HOLDING_STATES: ProspectStateValue[] = ["parked", "lost", "promoted"];

export function isHoldingState(state: string | undefined | null): boolean {
  return !!state && (HOLDING_STATES as string[]).includes(state);
}

// ── Transition provenance + attention reasons (v3) ───────────────────────────

export type PipelineStageReason =
  | "manual"
  | "meeting_booked"
  | "meeting_completed"
  | "cadence_approved"
  | "reply"
  | "sourcing_promote"
  | "legacy_migration";

export type AttentionReason =
  | "meeting_booked_stale"
  | "revalidate_materially_changed";

/** Days a prospect can sit in a manual stage (pre-qual/qualified) before the
 *  requires-attention surface nudges the operator for a decision. */
export const MANUAL_MOVE_STALE_DAYS = 14;

/** Intel is considered stale (for the meeting-booked Trigger A flag) after 7 days. */
export const INTEL_STALE_DAYS = 7;

/** Cadence gap (since last send) that triggers an intel-revalidate before the
 *  next touch fires (Trigger B). */
export const CADENCE_REVALIDATE_GAP_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Pure derivation of the operator-facing flags for a prospect row, used by the
 * requires-attention surface + detail chips. Reads only denormalised client
 * fields (no DB access) so it is safe in both client and server.
 */
export function deriveProspectFlags(
  client: {
    pipelineStage?: string | null;
    prospectState?: string | null;
    needsActionFlags?: Array<{ kind: string; reason: string; raisedAt: string }> | null;
    needsActionAt?: string | null;
    intelAttentionAt?: string | null;
    intelAttentionReason?: string | null;
    pipelineStageChangedAt?: string | null;
  },
  nowMs: number,
): {
  needsAction: boolean;
  needsActionKinds: string[];
  intelAttention: boolean;
  intelAttentionReason?: string;
  manualMoveReady: boolean;
} {
  const flags = Array.isArray(client.needsActionFlags) ? client.needsActionFlags : [];
  const needsAction = !!client.needsActionAt || flags.length > 0;
  const needsActionKinds = flags.map((f) => f.kind);

  const intelAttention = !!client.intelAttentionAt;

  // Manual-move nudge: a prospect parked in a manual stage (pre-qual/qualified)
  // for longer than the staleness window is surfaced for an operator decision.
  const stage = derivePipelineStage(client);
  let manualMoveReady = false;
  if (stage === "pre_qualification" || stage === "qualified") {
    const changed = client.pipelineStageChangedAt
      ? Date.parse(client.pipelineStageChangedAt)
      : NaN;
    if (isFinite(changed)) {
      manualMoveReady = nowMs - changed > MANUAL_MOVE_STALE_DAYS * DAY_MS;
    }
  }

  return {
    needsAction,
    needsActionKinds,
    intelAttention,
    intelAttentionReason: client.intelAttentionReason ?? undefined,
    manualMoveReady,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-stage ladders (pre-qualification + qualified)
// ─────────────────────────────────────────────────────────────────────────────

export interface SubStageDef {
  key: string;
  label: string;
  /** Display order within the ladder. */
  order: number;
}

export const PRE_QUAL_STEPS: SubStageDef[] = [
  { key: "modelling_required", label: "Modelling required", order: 1 },
  { key: "modelling_review_required", label: "Modelling review required", order: 2 },
  { key: "qualitative_feedback_required", label: "Qualitative feedback required", order: 3 },
  { key: "feedback_given", label: "Feedback given", order: 4 },
  { key: "feedback_discussed", label: "Feedback discussed", order: 5 },
];

export const QUALIFIED_STEPS: SubStageDef[] = [
  { key: "terms_requested", label: "Terms requested", order: 1 },
  { key: "terms_presented", label: "Terms presented", order: 2 },
  { key: "progression_to_credit", label: "Progression to credit", order: 3 },
  { key: "formal_dd", label: "Formal due diligence", order: 4 },
  { key: "credit_approved", label: "Credit approved", order: 5 },
];

export type QualSubStage =
  | "modelling_required" | "modelling_review_required" | "qualitative_feedback_required"
  | "feedback_given" | "feedback_discussed"
  | "terms_requested" | "terms_presented" | "progression_to_credit"
  | "formal_dd" | "credit_approved";

const ALL_SUBSTAGE_DEFS: SubStageDef[] = [...PRE_QUAL_STEPS, ...QUALIFIED_STEPS];

/** The ladder for a stage, or null for the activity-measured stages. */
export function ladderForStage(stage: PipelineStage): SubStageDef[] | null {
  if (stage === "pre_qualification") return PRE_QUAL_STEPS;
  if (stage === "qualified") return QUALIFIED_STEPS;
  return null;
}

export function subStageLabel(key: string | undefined | null): string {
  if (!key) return "—";
  return ALL_SUBSTAGE_DEFS.find((s) => s.key === key)?.label ?? key;
}

export function isQualSubStage(key: unknown): key is QualSubStage {
  return typeof key === "string" && ALL_SUBSTAGE_DEFS.some((s) => s.key === key);
}

/** Ladder step keys for backend KPI math (mirror of PRE_QUAL_STEPS / QUALIFIED_STEPS). */
export const PRE_QUAL_KEYS = PRE_QUAL_STEPS.map((s) => s.key);
export const QUALIFIED_KEYS = QUALIFIED_STEPS.map((s) => s.key);
export const SUBSTAGE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_SUBSTAGE_DEFS.map((s) => [s.key, s.label]),
);

// ─────────────────────────────────────────────────────────────────────────────
// Weekly / monthly targets for the "out of N" KPIs (defaults that seed the
// editable pipelineTargets singleton).
// ─────────────────────────────────────────────────────────────────────────────

export interface PipelineTargets {
  /** New cold reach-outs to start per week. */
  weeklyReachOut: number;
  /** Follow-up touches to send per week. */
  weeklyFollowUp: number;
  /** Meetings to hold per month. */
  monthlyMeetings: number;
  /** Terms to request per month (qualified stage). */
  monthlyTermsRequested: number;
}

export const PIPELINE_TARGETS: PipelineTargets = {
  weeklyReachOut: 10,
  weeklyFollowUp: 10,
  monthlyMeetings: 8,
  monthlyTermsRequested: 5,
};
