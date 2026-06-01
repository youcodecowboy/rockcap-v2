/**
 * Shared authentication helpers for Convex functions
 */

import { QueryCtx, MutationCtx } from "./_generated/server";

/**
 * Get authenticated user from context
 * Throws error if user is not authenticated
 */
export async function getAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthenticated");
  }

  // Get user ID from identity using Clerk ID
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  
  if (!user) {
    throw new Error("User not found");
  }

  return user;
}

/**
 * Get the authenticated user, or null if the request has no identity yet.
 *
 * Use this in READ queries that power always-on UI (e.g. the inbox), where
 * the query can fire before Clerk's token has reached Convex on a cold page
 * load. The throwing variant turns that brief pre-auth window into an
 * uncaught error that crashes the page via useQuery; returning null lets the
 * caller render an empty/loading state and recover automatically when the
 * query re-runs with identity present. Do NOT use in mutations or anywhere a
 * missing user should be a hard failure.
 */
export async function getAuthenticatedUserOrNull(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  return user ?? null;
}

