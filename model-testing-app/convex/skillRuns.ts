import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

// Internal API for the skillRuns table. Exposed via MCP through convex/mcp.ts
// (skillRun.start, skillRun.complete). Not directly callable by the chat
// assistant or other in-app code.

// ── Create a new run row (called by skillRun.start MCP tool) ─────────

export const createInternal = internalMutation({
  args: {
    skillName: v.string(),
    userId: v.id("users"),
    input: v.any(),
    trigger: v.optional(v.string()),
    dedupKey: v.optional(v.string()),
    dedupWindowDays: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("complete"),
      v.literal("complete_with_gaps"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("skillRuns", args);
  },
});

// ── Find a recent prior run for dedup check ──────────────────────────
//
// Returns the most recent complete or complete_with_gaps run for the given
// skill+dedupKey within the window, or null if none.

export const findRecentByDedupKeyInternal = internalQuery({
  args: {
    skillName: v.string(),
    dedupKey: v.string(),
    cutoffMs: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("skillRuns")
      .withIndex("by_skill_and_dedup_key", (q) =>
        q.eq("skillName", args.skillName).eq("dedupKey", args.dedupKey),
      )
      .order("desc")
      .take(20);
    // v1.2: detect both completed and in-flight runs. Caller (skillRun.start
    // MCP tool) decides what to do based on the status returned.
    for (const row of rows) {
      if (row._creationTime < args.cutoffMs) break;
      if (row.status === "complete" || row.status === "complete_with_gaps") {
        return { kind: "completed" as const, row };
      }
      if (row.status === "running") {
        // In-flight detection — race prevention
        return { kind: "in_flight" as const, row };
      }
    }
    return null;
  },
});

// ── Get one run by id ────────────────────────────────────────────────

export const getInternal = internalQuery({
  args: { runId: v.id("skillRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

// ── Complete a run (called by skillRun.complete MCP tool) ────────────

export const completeInternal = internalMutation({
  args: {
    runId: v.id("skillRuns"),
    userId: v.id("users"),
    status: v.union(
      v.literal("complete"),
      v.literal("complete_with_gaps"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    brief: v.optional(v.string()),
    // v1.2 hardened skills: full markdown intel report. Rendered by the
    // /prospects/[id] Intel tab. Separate from `brief` (which stays as the
    // 2-paragraph operator-facing summary).
    intelMarkdown: v.optional(v.string()),
    linkedClientId: v.optional(v.id("clients")),
    linkedProjectId: v.optional(v.id("projects")),
    linkedApprovalIds: v.optional(v.array(v.id("approvals"))),
    gaps: v.optional(v.array(v.object({
      kind: v.string(),
      description: v.string(),
      suggestedFix: v.optional(v.string()),
    }))),
    errors: v.optional(v.array(v.object({
      step: v.string(),
      message: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error(`skillRun not found: ${args.runId}`);
    if (run.userId !== args.userId) {
      throw new Error(`skillRun ${args.runId} does not belong to caller`);
    }
    const completedAtIso = new Date().toISOString();
    const durationMs = Date.now() - run._creationTime;
    await ctx.db.patch(args.runId, {
      status: args.status,
      brief: args.brief,
      intelMarkdown: args.intelMarkdown,
      linkedClientId: args.linkedClientId,
      linkedProjectId: args.linkedProjectId,
      linkedApprovalIds: args.linkedApprovalIds,
      gaps: args.gaps,
      errors: args.errors,
      completedAt: completedAtIso,
      durationMs,
    });
    return { ok: true, durationMs };
  },
});

// ── Public read for the prospect detail page Intel + Activity tabs ──

export const getById = query({
  args: { runId: v.id("skillRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

// ── Public query: latest run for a given dedup key (e.g., a CH number) ──
// Used by detail page when navigating directly to a prospect without a runId

export const latestByDedupKey = query({
  args: { skillName: v.string(), dedupKey: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("skillRuns")
      .withIndex("by_skill_and_dedup_key", (q) =>
        q.eq("skillName", args.skillName).eq("dedupKey", args.dedupKey),
      )
      .order("desc")
      .take(1);
    return rows[0] ?? null;
  },
});

// ── Stale-run sweep (called by the daily cron in Group 7) ──

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export const sweepStaleRunningRunsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - SIX_HOURS_MS;
    const stales = await ctx.db
      .query("skillRuns")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
    let swept = 0;
    for (const row of stales) {
      if (row._creationTime < cutoff) {
        const now = new Date().toISOString();
        await ctx.db.patch(row._id, {
          status: "failed" as const,
          completedAt: now,
          durationMs: Date.now() - row._creationTime,
          errors: [
            ...(row.errors ?? []),
            { step: "stale_runtime", message: "runtime exceeded 6h threshold; auto-marked failed by sweep" },
          ],
        });
        swept++;
      }
    }
    return { ok: true, swept, totalRunning: stales.length };
  },
});
