import { v } from "convex/values";
import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthenticatedUserOrNull } from "./authHelpers";

// MCP token management (BL-5.9).
// Per-user opaque bearer tokens for Claude Code authentication against the
// MCP server. Token plaintext is shown to the user once at mint time and
// never persisted: only the SHA-256 hash and a display prefix are stored.

// ── Auth helper ──────────────────────────────────────────────
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

async function getAuthenticatedUserId(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user._id;
}

// ── Hashing and token generation ─────────────────────────────

const TOKEN_PREFIX = "rcp_";

// Convert a byte array to URL-safe base64 without padding.
function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  // btoa is available in the Convex action runtime.
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ── Mint a new token ─────────────────────────────────────────
//
// Runs as an action because mutations are deterministic; crypto.getRandomValues
// is not. The action generates the token, hashes it, and calls an internal
// mutation to store the hash. The plaintext is returned once.

export const mintToken = action({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<{ token: string; tokenPrefix: string; mcpTokenId: string }> => {
    // Resolve the authenticated user via an internal query (actions cannot
    // directly use ctx.db).
    const userId = await ctx.runQuery(internal.mcpTokens.getMyUserIdInternal, {});
    if (!userId) throw new Error("Unauthenticated");

    // 32 bytes of random data, URL-safe base64.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const random = toBase64Url(bytes);
    const token = `${TOKEN_PREFIX}${random}`;
    const tokenPrefix = token.slice(0, 12);
    const tokenHash = await sha256Hex(token);

    const mcpTokenId = await ctx.runMutation(internal.mcpTokens.storeTokenInternal, {
      userId,
      tokenHash,
      tokenPrefix,
      name: args.name,
    });

    return { token, tokenPrefix, mcpTokenId };
  },
});

// ── Public queries and mutations ─────────────────────────────

export const listMyTokens = query({
  args: {},
  handler: async (ctx) => {
    // Tolerate the cold-load pre-auth window (Clerk token not yet at
    // Convex): return an empty default instead of crashing useQuery callers.
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return [];
    return ctx.db
      .query("mcpTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const revokeToken = mutation({
  args: { tokenId: v.id("mcpTokens") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const row = await ctx.db.get(args.tokenId);
    if (!row) throw new Error("Token not found");
    if (row.userId !== user._id) {
      throw new Error("You can only revoke your own tokens");
    }
    if (row.revokedAt) return { alreadyRevoked: true };
    await ctx.db.patch(args.tokenId, {
      revokedAt: new Date().toISOString(),
    });
    return { revoked: true };
  },
});

export const deleteRevokedToken = mutation({
  args: { tokenId: v.id("mcpTokens") },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const row = await ctx.db.get(args.tokenId);
    if (!row) return { deleted: false };
    if (row.userId !== user._id) {
      throw new Error("You can only delete your own tokens");
    }
    if (!row.revokedAt) {
      throw new Error("Only revoked tokens can be deleted");
    }
    await ctx.db.delete(args.tokenId);
    return { deleted: true };
  },
});

// ── Internal helpers (used by the action and by the MCP handler) ─────

export const getMyUserIdInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    try {
      return await getAuthenticatedUserId(ctx);
    } catch {
      return null;
    }
  },
});

export const storeTokenInternal = internalMutation({
  args: {
    userId: v.id("users"),
    tokenHash: v.string(),
    tokenPrefix: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("mcpTokens", {
      userId: args.userId,
      tokenHash: args.tokenHash,
      tokenPrefix: args.tokenPrefix,
      name: args.name,
      createdAt: new Date().toISOString(),
    });
  },
});

// Validate a bearer token. Returns the userId if the token is valid and not
// revoked. The MCP HTTP action calls this on every request.
export const validateTokenByHashInternal = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mcpTokens")
      .withIndex("by_token_hash", (q: any) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!row) return null;
    if (row.revokedAt) return null;
    return { userId: row.userId, mcpTokenId: row._id };
  },
});

export const recordTokenUseInternal = internalMutation({
  args: { mcpTokenId: v.id("mcpTokens") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.mcpTokenId, {
      lastUsedAt: new Date().toISOString(),
    });
  },
});

// Hashing helper exposed for the MCP action so it can hash a plaintext bearer.
// Convex actions have crypto.subtle directly; this lives here so the hashing
// algorithm stays consistent across mint and validate.
export async function sha256HexForTokens(input: string): Promise<string> {
  return sha256Hex(input);
}
