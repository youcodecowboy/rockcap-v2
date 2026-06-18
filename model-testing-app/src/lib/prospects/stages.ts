// ─────────────────────────────────────────────────────────────────────────────
// Prospect PIPELINE STAGES (v2 — stage-by-stage dashboards)
//
// The operator's manual pipeline has 5 stages. This is a SEPARATE axis from
// `prospectState` (researched → drafted → active → replied → engaged …), which
// the outreach engine owns and moves automatically. A prospect's pipeline stage
// is operator-controlled (manual promotion); its prospectState keeps tracking
// the cadence mechanics underneath.
//
// This module is intentionally dependency-free (no React, no colors import) so
// it can be imported by BOTH the Next.js client and Convex server functions.
// Components resolve `accentKey` against `useColors().accent[...]`.
// ─────────────────────────────────────────────────────────────────────────────

export type PipelineStage =
  | "cold_outreach"
  | "warm_pre_meeting"
  | "warm_post_meeting"
  | "pre_qualification"
  | "qualified";

// prospectState values, kept in sync with convex/schema.ts + lib/prospects/ladder.ts.
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
   * stored pipelineStage yet (i.e. existing rows pre-migration). Manual
   * promotion overrides this. Stages with an empty list are manual-only
   * destinations (no automatic entry).
   */
  derivesFrom: ProspectStateValue[];
}

export const PIPELINE_STAGES: StageDef[] = [
  {
    key: "cold_outreach",
    label: "Cold outreach",
    shortLabel: "Cold",
    description: "Researched, drafted and actively cold-emailing — no reply yet.",
    accentKey: "blue",
    order: 1,
    derivesFrom: ["researched", "drafted", "needs_revision", "active"],
  },
  {
    key: "warm_pre_meeting",
    label: "Warm · pre-meeting",
    shortLabel: "Pre-meeting",
    description: "Replied and engaging — working towards a booked meeting.",
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

const DERIVE_MAP: Partial<Record<ProspectStateValue, PipelineStage>> = (() => {
  const m: Partial<Record<ProspectStateValue, PipelineStage>> = {};
  for (const s of PIPELINE_STAGES) {
    for (const st of s.derivesFrom) m[st] = s.key;
  }
  return m;
})();

/**
 * Effective pipeline stage for a prospect client row.
 *  - A stored `pipelineStage` always wins (operator has manually filed them).
 *  - Otherwise derive from `prospectState` so existing prospects appear on a
 *    dashboard immediately, with no migration.
 *  - Returns null for off-pipeline holding (parked / lost / promoted) — these
 *    are not one of the 5 stage dashboards.
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-stage ladders (pre-qualification + qualified)
//
// The first three pipeline stages (cold / warm-pre / warm-post) are measured by
// activity KPIs. The last two have an internal ladder of discrete workflow steps
// the operator advances manually. A prospect sits at exactly ONE step and moves
// forward; every advance is logged to prospectStageEvents so rolling/this-month
// counts ("terms requested this month") are exact. KEEP IN SYNC with the
// qualSubStage union in convex/schema.ts.
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

// ─────────────────────────────────────────────────────────────────────────────
// Weekly / monthly targets for the "out of N" KPIs.
//
// These are house targets, not per-prospect data. Defaults below; change them
// here (single source of truth, read by the server aggregation). A future
// settings UI can override per team without touching the dashboards.
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
