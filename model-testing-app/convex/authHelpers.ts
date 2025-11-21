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

