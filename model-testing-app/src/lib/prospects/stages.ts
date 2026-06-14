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
