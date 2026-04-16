import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const scopeArg = v.optional(
  v.union(v.literal("personal"), v.literal("organization"))
);

// Records written before the `scope` field existed are treated as personal.
function matchesScope(row: { scope?: string }, wanted: "personal" | "organization") {
  return (row.scope ?? "personal") === wanted;
}

export const getToday = query({
  args: { scope: scopeArg },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const today = getTodayDateString();
    const wanted = args.scope ?? "personal";

    // We fetch all rows for this (userId, date) and pick the one matching the
    // requested scope. There will only ever be 1–2 rows here (one per scope),
    // so doing the scope filter in JS is cheaper than maintaining two indexes
    // and also handles the legacy records that have no scope field.
    const rows = await ctx.db
      .query("dailyBriefs")
      .withIndex("by_user_date", (q: any) => q.eq("userId", user._id).eq("date", today))
      .collect();

    return rows.find((r) => matchesScope(r, wanted)) ?? null;
  },
});

export const save = mutation({
  args: {
    date: v.string(),
    scope: scopeArg,
    content: v.any(),
    generatedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const wanted = args.scope ?? "personal";

    // Find existing row with the same (userId, date, scope) — replace it.
    const rows = await ctx.db
      .query("dailyBriefs")
      .withIndex("by_user_date", (q: any) => q.eq("userId", user._id).eq("date", args.date))
      .collect();

    const existing = rows.find((r) => matchesScope(r, wanted));
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    return ctx.db.insert("dailyBriefs", {
      userId: user._id,
      date: args.date,
      scope: wanted,
      content: args.content,
      generatedAt: args.generatedAt,
    });
  },
});

export const cronTrigger = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log(`[Daily Brief] Cron triggered at ${new Date().toISOString()}`);
  },
});
