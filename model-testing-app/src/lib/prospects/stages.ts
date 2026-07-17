// ─────────────────────────────────────────────────────────────────────────────
// Prospect PIPELINE STAGES — re-export shim (prospecting v3).
//
// The canonical definitions now live in convex/lib/pipelineStages.ts (a pure,
// dependency-free module that BOTH the Convex backend and the Next.js client
// import natively — killing the old "duplicated, KEEP IN SYNC" fragility).
// This file re-exports everything so existing `@/lib/prospects/stages` imports
// keep working unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export * from "../../../convex/lib/pipelineStages";
