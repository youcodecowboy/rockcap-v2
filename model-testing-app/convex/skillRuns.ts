import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
    if (!args.dedupKey) return null;
    // take(100) is a safety cap; in practice the (skillName, dedupKey) pair
    // limits how many rows can exist. If a single key ever accumulates 100+
    // non-terminal runs in the window, dedup will fail open and a fresh run
    // is created. Acceptable at current scale; revisit if batch-10 lands.
    const rows = await ctx.db
      .query("skillRuns")
      .withIndex("by_skill_and_dedup_key", (q) =>
        q.eq("skillName", args.skillName).eq("dedupKey", args.dedupKey),
      )
      .filter((q) => q.gte(q.field("_creationTime"), args.cutoffMs))
      .order("desc")
      .take(100);
    // Successful-terminal statuses; keep in sync with the skillRuns schema's
    // status union and with completeInternal's allowed input statuses.
    for (const row of rows) {
      if (row.status === "complete" || row.status === "complete_with_gaps") {
        return row;
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
