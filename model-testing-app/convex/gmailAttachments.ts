import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Gmail attachment access.
//
// Inbound ingest (gmailInbound.ts) captures attachment METADATA only —
// filename/mimeType/size/partId on the replyEvents row. The bytes stay in
// Gmail until an operator-approved drive_write copies one into Drive
// (driveWriteback.ts, op "upload_email_attachment"); the app never stores
// attachment content itself.
//
// Two anchors matter here:
//   - gmailApiId: the Gmail REST message id (NOT the RFC822 Message-ID header
//     that replyEvents.gmailMessageId/externalId carry). Rows ingested before
//     capture existed lack it — resolveGmailApiId falls back to Gmail's
//     rfc822msgid: search, the same trick gmailInbound.backfillHtml uses.
//   - partId: attachmentIds are EPHEMERAL (Gmail may rotate them between
//     fetches), so the executor re-fetches the message at fire time and
//     matches the part by partId/filename to get a fresh attachmentId.

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailAttachmentMeta {
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  partId?: string;
  inline?: boolean;
}

// ── Token refresh (local copy of gmailSend's helper; same OAuth client) ──
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET not set");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

// Usable from any action ctx (runQuery/runMutation). Returns null when the
// user has no Gmail connection or it needs reconnect — callers turn that
// into their own error message.
export async function gmailAccessTokenForUser(
  ctx: {
    runQuery: (ref: any, args: any) => Promise<any>;
    runMutation: (ref: any, args: any) => Promise<any>;
  },
  userId: Id<"users">,
): Promise<string | null> {
  const token: any = await ctx.runQuery(internal.gmailTokens.getForSyncInternal, {
    userId,
  });
  if (!token || token.needsReconnect) return null;
  let accessToken: string = token.accessToken;
  const expiresMs = new Date(token.expiresAt).getTime();
  if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      accessToken = refreshed.access_token;
      await ctx.runMutation(internal.gmailSend.writeRefreshedToken, {
        userId,
        accessToken,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    } catch {
      await ctx.runMutation(internal.gmailTokens.flagNeedsReconnect, { userId });
      return null;
    }
  }
  return accessToken;
}

export async function gmailGet(
  accessToken: string,
  path: string,
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

function getHeader(headers: any[], name: string): string | undefined {
  const lower = name.toLowerCase();
  const h = (headers ?? []).find(
    (x: any) => typeof x?.name === "string" && x.name.toLowerCase() === lower,
  );
  return h?.value;
}

// Walk the MIME tree collecting attachment parts: anything with a filename
// and a body (attachmentId for real attachments, inline data for tiny ones).
// inline=true flags signature images / embedded logos (Content-ID or an
// inline Content-Disposition) so callers can skip them when filing.
export function collectAttachments(payload: any): GmailAttachmentMeta[] {
  const out: GmailAttachmentMeta[] = [];
  const walk = (part: any) => {
    if (!part) return;
    const filename = typeof part.filename === "string" ? part.filename.trim() : "";
    if (filename && (part.body?.attachmentId || part.body?.data)) {
      const disposition = getHeader(part.headers ?? [], "Content-Disposition") ?? "";
      const contentId = getHeader(part.headers ?? [], "Content-ID");
      const inline = /^\s*inline/i.test(disposition) || Boolean(contentId);
      out.push({
        filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        sizeBytes: typeof part.body?.size === "number" ? part.body.size : undefined,
        partId: typeof part.partId === "string" ? part.partId : undefined,
        inline: inline || undefined,
      });
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

// Resolve a Gmail REST message id from whatever anchor a replyEvents row (or
// a caller-supplied reference) carries. Precedence: stored gmailApiId → the
// gmail-msg:<id> externalId fallback → rfc822msgid: search (needs the
// mailbox owner's token; the header id survives forwarding between systems).
export async function resolveGmailApiId(
  accessToken: string,
  ref: { gmailApiId?: string; rfcOrApiId?: string },
): Promise<string | null> {
  if (ref.gmailApiId) return ref.gmailApiId;
  const raw = ref.rfcOrApiId?.trim();
  if (!raw) return null;
  if (raw.startsWith("gmail-msg:")) return raw.slice("gmail-msg:".length);
  // RFC822 Message-IDs contain "@" (usually wrapped in <>); Gmail API ids
  // are bare hex-ish tokens. Try the cheap direct GET for the latter.
  if (!raw.includes("@")) {
    const direct = await gmailGet(
      accessToken,
      `/messages/${encodeURIComponent(raw)}?format=minimal`,
    );
    if (direct.ok && direct.data?.id) return direct.data.id;
  }
  const rfcId = raw.replace(/^<|>$/g, "");
  const search = await gmailGet(
    accessToken,
    `/messages?q=${encodeURIComponent(`rfc822msgid:${rfcId}`)}`,
  );
  return search.ok ? (search.data?.messages?.[0]?.id ?? null) : null;
}

// Base64url → bytes (no Buffer in the default Convex runtime).
export function decodeBase64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Locate a part on a fetched message and return its FRESH attachment handle
// plus resolved metadata. Match by partId when given (exact), else by
// filename (exact, then case-insensitive).
export function findAttachmentPart(
  payload: any,
  filename: string,
  partId?: string,
): {
  filename: string;
  mimeType: string;
  partId?: string;
  attachmentId?: string;
  inlineData?: string;
  sizeBytes?: number;
} | null {
  const parts: any[] = [];
  const walk = (part: any) => {
    if (!part) return;
    const name = typeof part.filename === "string" ? part.filename.trim() : "";
    if (name && (part.body?.attachmentId || part.body?.data)) parts.push(part);
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  let match =
    (partId && parts.find((p) => p.partId === partId)) ||
    parts.find((p) => p.filename.trim() === filename) ||
    parts.find((p) => p.filename.trim().toLowerCase() === filename.toLowerCase());
  if (!match) return null;
  return {
    filename: match.filename.trim(),
    mimeType: match.mimeType ?? "application/octet-stream",
    partId: match.partId,
    attachmentId: match.body?.attachmentId,
    inlineData: match.body?.data,
    sizeBytes: typeof match.body?.size === "number" ? match.body.size : undefined,
  };
}

// ── MCP read surface: list a message's attachments LIVE from Gmail ──────
//
// Works for rows ingested before attachment capture existed (no stored
// metadata needed) and for raw Gmail references that never became
// replyEvents rows. Reads the mailbox of the reply's OWNING user (Gmail
// tokens are per-user); a caller-supplied gmailMessageId reads the CALLING
// user's mailbox.
export const listForReply = internalAction({
  args: {
    userId: v.id("users"),
    replyEventId: v.optional(v.id("replyEvents")),
    gmailMessageId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { error: string; detail?: string }
    | {
        gmailApiId: string;
        subject?: string;
        fromEmail?: string;
        receivedAt?: string;
        attachments: GmailAttachmentMeta[];
      }
  > => {
    let mailboxUserId = args.userId;
    let ref: { gmailApiId?: string; rfcOrApiId?: string } = {
      rfcOrApiId: args.gmailMessageId,
    };
    let row: any = null;
    if (args.replyEventId) {
      row = await ctx.runQuery(internal.replyEvents.getInternal, {
        replyEventId: args.replyEventId,
      });
      if (!row) return { error: "reply_event_not_found" };
      mailboxUserId = row.userId;
      ref = { gmailApiId: row.gmailApiId, rfcOrApiId: row.externalId };
    } else if (!args.gmailMessageId) {
      return { error: "missing_ref", detail: "Pass replyEventId or gmailMessageId" };
    }

    const accessToken = await gmailAccessTokenForUser(ctx, mailboxUserId);
    if (!accessToken) {
      return {
        error: "gmail_not_connected",
        detail: "The mailbox owner's Gmail is not connected (or needs reconnect at /settings/gmail)",
      };
    }
    const apiId = await resolveGmailApiId(accessToken, ref);
    if (!apiId) {
      return {
        error: "message_not_found",
        detail: "Could not resolve the Gmail message (deleted, or not in this mailbox)",
      };
    }
    const full = await gmailGet(accessToken, `/messages/${apiId}?format=full`);
    if (!full.ok) {
      return { error: `gmail_fetch_${full.status}` };
    }
    const headers = full.data?.payload?.headers ?? [];
    return {
      gmailApiId: apiId,
      subject: row?.replySubject ?? getHeader(headers, "Subject"),
      fromEmail: row?.fromEmail ?? getHeader(headers, "From"),
      receivedAt: row?.receivedAt,
      attachments: collectAttachments(full.data?.payload),
    };
  },
});

// ── Inbox download: fetch one attachment's bytes for the web UI ─────────
//
// Auth mirrors listInboundPaginated's privacy model: the inbox is scoped to
// the operator's OWN Gmail account, so only the row's owning user may pull
// bytes (another operator files it to Drive via the approval lane instead).
// Base64 inflates the payload ~33% and Convex caps function results, so
// downloads are capped at DOWNLOAD_MAX_BYTES — larger files return
// {tooLarge:true} and the UI falls back to the Gmail thread link.
const DOWNLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const download = action({
  args: {
    replyEventId: v.id("replyEvents"),
    filename: v.string(),
    partId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { tooLarge: true; filename: string; mimeType: string; sizeBytes?: number }
    | { tooLarge: false; filename: string; mimeType: string; dataBase64: string }
  > => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user: any = await ctx.runQuery(api.users.getByClerkId, {
      clerkId: identity.subject,
    });
    if (!user) throw new Error("User not found");

    const row: any = await ctx.runQuery(internal.replyEvents.getInternal, {
      replyEventId: args.replyEventId,
    });
    if (!row) throw new Error("Email not found");
    if (String(row.userId) !== String(user._id)) {
      throw new Error("This email belongs to another operator's mailbox");
    }

    const accessToken = await gmailAccessTokenForUser(ctx, row.userId);
    if (!accessToken) {
      throw new Error("Gmail is not connected (or needs reconnect at /settings/gmail)");
    }
    const apiId = await resolveGmailApiId(accessToken, {
      gmailApiId: row.gmailApiId,
      rfcOrApiId: row.externalId,
    });
    if (!apiId) throw new Error("Could not resolve the Gmail message");
    const full = await gmailGet(accessToken, `/messages/${apiId}?format=full`);
    if (!full.ok) throw new Error(`Gmail fetch failed: ${full.status}`);
    const part = findAttachmentPart(full.data?.payload, args.filename, args.partId);
    if (!part) throw new Error(`Attachment "${args.filename}" not found on the message`);

    if ((part.sizeBytes ?? 0) > DOWNLOAD_MAX_BYTES) {
      return {
        tooLarge: true as const,
        filename: part.filename,
        mimeType: part.mimeType,
        sizeBytes: part.sizeBytes,
      };
    }

    let b64 = part.inlineData;
    if (!b64 && part.attachmentId) {
      const att = await gmailGet(
        accessToken,
        `/messages/${apiId}/attachments/${encodeURIComponent(part.attachmentId)}`,
      );
      if (!att.ok) throw new Error(`Gmail attachment fetch failed: ${att.status}`);
      b64 = att.data?.data;
    }
    if (!b64) throw new Error("Gmail returned no attachment data");

    // Gmail returns base64url; hand the browser standard base64 (atob-ready).
    let std = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (std.length % 4 !== 0) std += "=";
    return {
      tooLarge: false as const,
      filename: part.filename,
      mimeType: part.mimeType,
      dataBase64: std,
    };
  },
});

// ── One-time backfill: stamp attachment metadata on rows ingested before
// capture existed, so the inbox shows paperclips on historical mail too.
// Mirrors gmailInbound.backfillHtml. undefined = unchecked; [] = checked,
// none (also stamped when the message is gone, so dead rows stop rescanning).
// Run via: npx convex run gmailAttachments:backfillAttachments '{"limit":100}'
export const backfillAttachments = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ scanned: number; stamped: number; withAttachments: number; failed: number }> => {
    // Page the feed with a receivedAt cursor (small batches — rows carry
    // full HTML bodies), collecting up to `limit` unstamped candidates.
    const max = args.limit ?? 100;
    const rows: any[] = [];
    let cursor: string | null = null;
    while (rows.length < max) {
      const batch: { candidates: any[]; nextCursor: string | null } =
        await ctx.runQuery(internal.replyEvents.listMissingAttachmentsInternal, {
          beforeReceivedAt: cursor ?? undefined,
        });
      rows.push(...batch.candidates.slice(0, max - rows.length));
      if (!batch.nextCursor) break;
      cursor = batch.nextCursor;
    }

    const tokenCache = new Map<string, string | null>();
    const tokenFor = async (userId: string): Promise<string | null> => {
      if (!tokenCache.has(userId)) {
        tokenCache.set(userId, await gmailAccessTokenForUser(ctx, userId as any));
      }
      return tokenCache.get(userId) ?? null;
    };

    let stamped = 0;
    let withAttachments = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const accessToken = await tokenFor(String(row.userId));
        if (!accessToken) {
          failed++;
          continue;
        }
        const apiId = await resolveGmailApiId(accessToken, {
          gmailApiId: row.gmailApiId,
          rfcOrApiId: row.externalId,
        });
        if (!apiId) {
          // Message gone from the mailbox — stamp empty so it stops rescanning.
          await ctx.runMutation(internal.replyEvents.patchAttachmentsInternal, {
            replyEventId: row._id,
            attachments: [],
          });
          stamped++;
          continue;
        }
        const full = await gmailGet(accessToken, `/messages/${apiId}?format=full`);
        if (!full.ok) {
          failed++;
          continue;
        }
        const attachments = collectAttachments(full.data?.payload);
        await ctx.runMutation(internal.replyEvents.patchAttachmentsInternal, {
          replyEventId: row._id,
          attachments,
          gmailApiId: apiId,
        });
        stamped++;
        if (attachments.length > 0) withAttachments++;
      } catch (err) {
        console.error(`[gmailAttachments] backfill failed for ${row._id}:`, err);
        failed++;
      }
    }
    return { scanned: rows.length, stamped, withAttachments, failed };
  },
});
