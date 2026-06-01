import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Gmail inbound ingest (polling).
//
// The Pub/Sub push path (gmailWatch.ts) requires an operator-provisioned
// Google Cloud topic. This module gets inbound mail flowing WITHOUT that
// setup by polling on a cron — the gmail.modify OAuth scope already grants
// read, so no re-consent is needed.
//
// Per tick: for each connected user, call Gmail's history.list since the
// stored historyId watermark (seed with a recent messages.list on first
// run), fetch each new INBOX message, and hand it to the SAME pipeline the
// push/HubSpot paths use (replyEventProcessor → contact-match → cadence
// cancel → classify → dispatch → approval). The replyEvents table is the
// unified inbound feed the inbox UI reads.
//
// Mirrors the cron-poll fallback pattern in googleCalendarSync.ts.

const MAX_MESSAGES_PER_TICK = 50;
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

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

// ── Gmail REST helper ────────────────────────────────────────
// Returns { ok, status, data }. Callers decide how to react to !ok (e.g.
// history.list 404 → reseed) rather than throwing on every non-200.
async function gmailGet(
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

// ── Parsing helpers ──────────────────────────────────────────
function decodeBase64Url(data: string): string {
  if (!data) return "";
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("utf-8");
    }
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

function getHeader(headers: any[], name: string): string | undefined {
  const lower = name.toLowerCase();
  const h = (headers ?? []).find(
    (x: any) => typeof x?.name === "string" && x.name.toLowerCase() === lower,
  );
  return h?.value;
}

// "Jane Doe <jane@acme.com>" → { name: "Jane Doe", email: "jane@acme.com" }
function parseFrom(value?: string): { name?: string; email?: string } {
  if (!value) return {};
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].replace(/^"|"$/g, "").trim();
    return { name: name || undefined, email: m[2].trim().toLowerCase() };
  }
  return { email: value.trim().toLowerCase() };
}

// Strip HTML to readable-ish plain text (last-resort when no text/plain part).
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Walk the MIME tree and collect BOTH the text/plain and text/html parts.
// We keep the raw HTML (rendered, sandboxed, in the inbox UI) AND a plain-
// text version (search, previews, the dashboard panel, fallback). `text` is
// the real text/plain part if present, else HTML stripped to text.
function extractBody(payload: any): { text: string; html?: string } {
  if (!payload) return { text: "" };
  const fromPart = (part: any): { plain?: string; html?: string } => {
    const mime = part?.mimeType ?? "";
    const out: { plain?: string; html?: string } = {};
    if (mime === "text/plain" && part?.body?.data) {
      out.plain = decodeBase64Url(part.body.data);
    } else if (mime === "text/html" && part?.body?.data) {
      out.html = decodeBase64Url(part.body.data);
    } else if (Array.isArray(part?.parts)) {
      for (const child of part.parts) {
        const r = fromPart(child);
        if (r.plain && !out.plain) out.plain = r.plain;
        if (r.html && !out.html) out.html = r.html;
      }
    }
    return out;
  };
  const r = fromPart(payload);
  const text = r.plain ? r.plain.trim() : r.html ? stripHtml(r.html) : "";
  return { text, html: r.html };
}

function epochOrHeaderToIso(internalDate?: string, dateHeader?: string): string {
  if (internalDate && /^\d+$/.test(internalDate)) {
    const ms = parseInt(internalDate, 10);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  if (dateHeader) {
    const t = Date.parse(dateHeader);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

// ── Per-user poll ────────────────────────────────────────────
export const pollUserInbound = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ status: string; processed: number }> => {
    const token: any = await ctx.runQuery(
      internal.gmailTokens.getForSyncInternal,
      { userId: args.userId },
    );
    if (!token) return { status: "no_token", processed: 0 };
    if (token.needsReconnect) return { status: "needs_reconnect", processed: 0 };

    // Refresh access token if expired / within 60s of expiry.
    let accessToken: string = token.accessToken;
    const expiresMs = new Date(token.expiresAt).getTime();
    if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
      try {
        const refreshed = await refreshAccessToken(token.refreshToken);
        accessToken = refreshed.access_token;
        await ctx.runMutation(internal.gmailSend.writeRefreshedToken, {
          userId: args.userId,
          accessToken,
          expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        });
      } catch (err) {
        // Refresh-token revoked → flag for reconnect, stop.
        await ctx.runMutation(internal.gmailTokens.flagNeedsReconnect, {
          userId: args.userId,
        });
        return { status: "refresh_failed", processed: 0 };
      }
    }

    // Resolve the set of new message ids.
    const messageIds: string[] = [];
    let reseed = !token.historyId;

    if (token.historyId) {
      let pageToken: string | undefined;
      let pages = 0;
      do {
        const qs = new URLSearchParams({
          startHistoryId: token.historyId,
          historyTypes: "messageAdded",
          labelId: "INBOX",
        });
        if (pageToken) qs.set("pageToken", pageToken);
        const r = await gmailGet(accessToken, `/history?${qs.toString()}`);
        if (r.status === 404) {
          // historyId too old / expired — fall back to a fresh seed.
          reseed = true;
          break;
        }
        if (!r.ok) {
          return { status: `history_error_${r.status}`, processed: 0 };
        }
        for (const h of r.data?.history ?? []) {
          for (const added of h?.messagesAdded ?? []) {
            const msg = added?.message;
            const labels: string[] = msg?.labelIds ?? [];
            if (!msg?.id) continue;
            if (labels.includes("SENT") || labels.includes("DRAFT")) continue;
            if (!messageIds.includes(msg.id)) messageIds.push(msg.id);
          }
        }
        pageToken = r.data?.nextPageToken;
        pages++;
      } while (pageToken && pages < 10 && messageIds.length < MAX_MESSAGES_PER_TICK);
    }

    if (reseed) {
      const qs = new URLSearchParams({
        q: "in:inbox newer_than:2d -from:me",
        maxResults: String(MAX_MESSAGES_PER_TICK),
      });
      const r = await gmailGet(accessToken, `/messages?${qs.toString()}`);
      if (!r.ok) return { status: `seed_error_${r.status}`, processed: 0 };
      for (const m of r.data?.messages ?? []) {
        if (m?.id && !messageIds.includes(m.id)) messageIds.push(m.id);
      }
    }

    // history.list returns newest-last; seed returns newest-first. Process
    // oldest → newest so creation order tracks received recency.
    const ordered = reseed ? [...messageIds].reverse() : messageIds;
    const capped = ordered.slice(0, MAX_MESSAGES_PER_TICK);

    let processed = 0;
    for (const id of capped) {
      const r = await gmailGet(accessToken, `/messages/${id}?format=full`);
      if (!r.ok) continue;
      const msg = r.data;
      const labels: string[] = msg?.labelIds ?? [];
      if (labels.includes("SENT") || labels.includes("DRAFT")) continue;

      const headers = msg?.payload?.headers ?? [];
      const from = parseFrom(getHeader(headers, "From"));
      // Skip our own outbound (shouldn't appear via INBOX, but be safe).
      if (from.email && from.email === token.connectedEmail?.toLowerCase()) continue;

      const subject = getHeader(headers, "Subject") ?? "(no subject)";
      const messageIdHeader = getHeader(headers, "Message-ID") ?? `gmail-msg:${id}`;
      const receivedAt = epochOrHeaderToIso(
        msg?.internalDate,
        getHeader(headers, "Date"),
      );
      const extracted = extractBody(msg?.payload);
      const body = extracted.text || (msg?.snippet ?? "");

      try {
        await ctx.runAction(internal.replyEventProcessor.ingestGmailMessage, {
          userId: args.userId,
          contactEmail: from.email,
          fromEmail: from.email,
          fromName: from.name,
          subject,
          body,
          bodyHtml: extracted.html,
          receivedAt,
          externalId: messageIdHeader,
          gmailThreadId: msg?.threadId,
          gmailMessageId: messageIdHeader,
          rawMessageRef: msg?.threadId
            ? `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`
            : undefined,
        });
        processed++;
      } catch (err) {
        console.error(`[gmailInbound] ingest failed for ${id}:`, err);
      }
    }

    // Advance the watermark to the current mailbox historyId.
    const profile = await gmailGet(accessToken, `/profile`);
    if (profile.ok && profile.data?.historyId) {
      await ctx.runMutation(internal.gmailTokens.updateHistoryId, {
        userId: args.userId,
        historyId: String(profile.data.historyId),
      });
    }

    return { status: "ok", processed };
  },
});

// ── Cron entry: poll every connected user ────────────────────
export const pollAllInbound = internalAction({
  args: {},
  handler: async (ctx): Promise<{ users: number; processed: number }> => {
    const users: Array<{ userId: any }> = await ctx.runQuery(
      internal.gmailTokens.listConnectedInternal,
      {},
    );
    let processed = 0;
    for (const u of users) {
      try {
        const r = await ctx.runAction(internal.gmailInbound.pollUserInbound, {
          userId: u.userId,
        });
        processed += r.processed ?? 0;
      } catch (err) {
        console.error(`[gmailInbound] poll failed for user ${u.userId}:`, err);
      }
    }
    return { users: users.length, processed };
  },
});
