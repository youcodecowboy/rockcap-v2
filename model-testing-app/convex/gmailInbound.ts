import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { collectAttachments } from "./gmailAttachments";

// Gmail inbound + outbound ingest (polling).
//
// The Pub/Sub push path (gmailWatch.ts) requires an operator-provisioned
// Google Cloud topic. This module gets mail flowing WITHOUT that setup by
// polling on a cron — the gmail.modify OAuth scope already grants read, so
// no re-consent is needed.
//
// Per tick: for each connected user, call Gmail's history.list since the
// stored historyId watermark (seed with a recent messages.list on first
// run) and partition new messages by label:
//   INBOX → the SAME pipeline the push/HubSpot paths use
//     (replyEventProcessor → contact-match → cadence cancel → classify →
//     dispatch → approval). The replyEvents table is the unified inbound
//     feed the inbox UI reads.
//   SENT  → outbound capture (2026-07-17): recipients are matched against
//     contacts and a `touchpoints` row (provider gmail, direction outbound)
//     is written — the same record an in-app approved send produces — so
//     mail sent MANUALLY from Gmail is tracked without reconciliation.
//     Dedupe rides touchpoints' (provider, payloadRef) index: in-app sends
//     already stamp payloadRef with the Gmail message id, so the poller
//     skips them. Sends matching NO contact are ignored (personal mail —
//     touchpoints are org-visible, the private lane is /inbox only).
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

// "a@x.com, Jane <b@y.com>" → ["a@x.com", "b@y.com"]. Display names with
// commas are quoted per RFC, but a naive comma split only ever cuts through
// a NAME, never an address — re-parsing each fragment for <addr> or a bare
// email keeps every address intact.
function parseRecipientList(value?: string): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const part of value.split(",")) {
    const m = part.match(/<([^>]+)>/);
    const email = (m ? m[1] : part).trim().toLowerCase();
    if (email.includes("@") && !out.includes(email)) out.push(email);
  }
  return out;
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

// ── Outbound (SENT) capture ──────────────────────────────────
// Metadata-only fetch (headers, no body walk) — the touchpoint stores
// subject + snippet, never full content. Dedupe by (provider=gmail,
// payloadRef=gmail message id): in-app approved sends already wrote their
// touchpoint with the same payloadRef, so only MANUAL Gmail sends create
// rows here. Contact-unmatched sends are skipped (personal mail —
// touchpoints are org-visible; the private lane is /inbox only).
async function captureSentMessage(
  ctx: { runQuery: (ref: any, args: any) => Promise<any>; runMutation: (ref: any, args: any) => Promise<any> },
  accessToken: string,
  connectedEmail: string | undefined,
  userId: any,
  id: string,
): Promise<boolean> {
  try {
    const existing = await ctx.runQuery(
      internal.touchpoints.findByProviderPayloadInternal,
      { provider: "gmail", payloadRef: id },
    );
    if (existing) return false;
    // format=full: we keep the full body in the emailBodies sidecar (the
    // ledger row itself stays slim — subject + excerpt).
    const r = await gmailGet(accessToken, `/messages/${id}?format=full`);
    if (!r.ok) return false;
    const msg = r.data;
    const headers = msg?.payload?.headers ?? [];
    const recipients = [
      ...parseRecipientList(getHeader(headers, "To")),
      ...parseRecipientList(getHeader(headers, "Cc")),
    ].filter((e) => e !== connectedEmail?.toLowerCase());
    if (recipients.length === 0) return false;

    // First recipient that resolves to a contact wins as the primary;
    // prefer one that also carries a client link.
    let primary: { contactId: any; clientId?: any } | null = null;
    for (const email of recipients) {
      const resolved: any = await ctx.runQuery(
        internal.contacts.resolveByEmailInternal,
        { email },
      );
      if (!resolved) continue;
      if (resolved.clientId) {
        primary = resolved;
        break;
      }
      if (!primary) primary = resolved;
    }
    if (!primary) return false; // no contact match → personal mail, not tracked

    const body = extractBody(msg?.payload);
    const touchpointId = await ctx.runMutation(internal.touchpoints.internalCreate, {
      provider: "gmail",
      direction: "outbound",
      kind: "email",
      contactId: primary.contactId,
      participantEmails: [connectedEmail, ...recipients].filter(
        (e): e is string => Boolean(e),
      ),
      relatedClientId: primary.clientId,
      occurredAt: epochOrHeaderToIso(msg?.internalDate, getHeader(headers, "Date")),
      payloadRef: id,
      payloadType: "gmail.message",
      subject: getHeader(headers, "Subject"),
      summary: "Sent from Gmail (captured by outbound poller)",
      bodyExcerpt: (body.text || msg?.snippet || "").slice(0, 500),
      threadId: msg?.threadId,
      capturedBy: userId,
    });
    if (body.text || body.html) {
      await ctx.runMutation(internal.touchpoints.saveBodyInternal, {
        touchpointId,
        bodyText: body.text || undefined,
        bodyHtml: body.html,
      });
    }
    return true;
  } catch (err) {
    console.error(`[gmailInbound] sent-capture failed for ${id}:`, err);
    return false;
  }
}

// One-shot: fetch + store full bodies for outbound touchpoints captured
// before the body sidecar existed. Idempotent (skips rows with a body).
//   npx convex run gmailInbound:backfillOutboundBodies '{"days":45}'
export const backfillOutboundBodies = internalAction({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scanned: number; saved: number; failed: number }> => {
    const cutoff = new Date(
      Date.now() - Math.min(args.days ?? 45, 120) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const tokenCache = new Map<string, string | null>();
    const tokenFor = async (userId: string): Promise<string | null> => {
      if (!tokenCache.has(userId)) {
        const token: any = await ctx.runQuery(internal.gmailTokens.getForSyncInternal, {
          userId: userId as any,
        });
        if (!token || token.needsReconnect) {
          tokenCache.set(userId, null);
        } else {
          let accessToken: string = token.accessToken;
          const expiresMs = new Date(token.expiresAt).getTime();
          if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
            try {
              const refreshed = await refreshAccessToken(token.refreshToken);
              accessToken = refreshed.access_token;
              await ctx.runMutation(internal.gmailSend.writeRefreshedToken, {
                userId: userId as any,
                accessToken,
                expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
              });
            } catch {
              accessToken = "";
            }
          }
          tokenCache.set(userId, accessToken || null);
        }
      }
      return tokenCache.get(userId) ?? null;
    };

    let scanned = 0;
    let saved = 0;
    let failed = 0;
    let cursor: string | null = null;
    while (true) {
      const batch: { candidates: any[]; nextCursor: string | null } = await ctx.runQuery(
        internal.touchpoints.listOutboundGmailInternal,
        { beforeOccurredAt: cursor ?? undefined },
      );
      for (const t of batch.candidates) {
        if (t.occurredAt < cutoff) continue;
        scanned++;
        try {
          const existing = await ctx.runQuery(internal.touchpoints.getBodyInternal, {
            touchpointId: t._id,
          });
          if (existing) continue;
          if (!t.capturedBy) {
            failed++;
            continue;
          }
          const accessToken = await tokenFor(String(t.capturedBy));
          if (!accessToken) {
            failed++;
            continue;
          }
          const r = await gmailGet(accessToken, `/messages/${t.payloadRef}?format=full`);
          if (!r.ok) {
            failed++;
            continue;
          }
          const body = extractBody(r.data?.payload);
          if (body.text || body.html) {
            await ctx.runMutation(internal.touchpoints.saveBodyInternal, {
              touchpointId: t._id,
              bodyText: body.text || undefined,
              bodyHtml: body.html,
            });
            saved++;
          }
        } catch (err) {
          console.error(`[gmailInbound] body backfill failed for ${t._id}:`, err);
          failed++;
        }
      }
      if (!batch.nextCursor || batch.nextCursor < cutoff) break;
      cursor = batch.nextCursor;
    }
    return { scanned, saved, failed };
  },
});

// One-shot historical backfill: capture SENT mail from the last `days`
// (default 45) for every connected user, through the same dedupe +
// contact-match as the live poller — so the prospecting KPIs' outbound
// counts don't start from zero. Idempotent (payloadRef dedupe). Run via:
//   npx convex run gmailInbound:backfillSentMail '{"days":45}'
export const backfillSentMail = internalAction({
  args: { days: v.optional(v.number()), maxPerUser: v.optional(v.number()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ users: number; scanned: number; captured: number }> => {
    const days = Math.min(args.days ?? 45, 120);
    const maxPerUser = Math.min(args.maxPerUser ?? 500, 1000);
    const users: Array<{ userId: any }> = await ctx.runQuery(
      internal.gmailTokens.listConnectedInternal,
      {},
    );
    let scanned = 0;
    let captured = 0;
    for (const u of users) {
      const token: any = await ctx.runQuery(internal.gmailTokens.getForSyncInternal, {
        userId: u.userId,
      });
      if (!token || token.needsReconnect) continue;
      let accessToken: string = token.accessToken;
      const expiresMs = new Date(token.expiresAt).getTime();
      if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
        try {
          const refreshed = await refreshAccessToken(token.refreshToken);
          accessToken = refreshed.access_token;
          await ctx.runMutation(internal.gmailSend.writeRefreshedToken, {
            userId: u.userId,
            accessToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          });
        } catch {
          continue;
        }
      }
      let pageToken: string | undefined;
      let fetched = 0;
      do {
        const qs = new URLSearchParams({
          q: `in:sent newer_than:${days}d`,
          maxResults: "100",
        });
        if (pageToken) qs.set("pageToken", pageToken);
        const r = await gmailGet(accessToken, `/messages?${qs.toString()}`);
        if (!r.ok) break;
        for (const m of r.data?.messages ?? []) {
          if (!m?.id) continue;
          scanned++;
          fetched++;
          if (await captureSentMessage(ctx, accessToken, token.connectedEmail, u.userId, m.id)) {
            captured++;
          }
          if (fetched >= maxPerUser) break;
        }
        pageToken = r.data?.nextPageToken;
      } while (pageToken && fetched < maxPerUser);
    }
    return { users: users.length, scanned, captured };
  },
});

// ── Per-user poll ────────────────────────────────────────────
export const pollUserInbound = internalAction({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: string; processed: number; sentCaptured?: number }> => {
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

    // Resolve the sets of new message ids, partitioned by direction.
    const messageIds: string[] = [];
    const sentIds: string[] = [];
    let reseed = !token.historyId;

    if (token.historyId) {
      let pageToken: string | undefined;
      let pages = 0;
      do {
        // No labelId filter — one history walk serves both directions;
        // messages partition by their labels below.
        const qs = new URLSearchParams({
          startHistoryId: token.historyId,
          historyTypes: "messageAdded",
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
            if (labels.includes("DRAFT")) continue;
            if (labels.includes("SENT")) {
              if (!sentIds.includes(msg.id)) sentIds.push(msg.id);
              continue;
            }
            if (!labels.includes("INBOX")) continue;
            if (!messageIds.includes(msg.id)) messageIds.push(msg.id);
          }
        }
        pageToken = r.data?.nextPageToken;
        pages++;
      } while (
        pageToken &&
        pages < 10 &&
        messageIds.length < MAX_MESSAGES_PER_TICK &&
        sentIds.length < MAX_MESSAGES_PER_TICK
      );
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
      const sentQs = new URLSearchParams({
        q: "in:sent newer_than:2d",
        maxResults: String(MAX_MESSAGES_PER_TICK),
      });
      const rs = await gmailGet(accessToken, `/messages?${sentQs.toString()}`);
      if (rs.ok) {
        for (const m of rs.data?.messages ?? []) {
          if (m?.id && !sentIds.includes(m.id)) sentIds.push(m.id);
        }
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
      const attachments = collectAttachments(msg?.payload);

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
          gmailApiId: id,
          attachments: attachments.length > 0 ? attachments : undefined,
          rawMessageRef: msg?.threadId
            ? `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`
            : undefined,
        });
        processed++;
      } catch (err) {
        console.error(`[gmailInbound] ingest failed for ${id}:`, err);
      }
    }

    // ── Outbound (SENT) capture ─────────────────────────────────
    let sentCaptured = 0;
    for (const id of sentIds.slice(0, MAX_MESSAGES_PER_TICK)) {
      if (await captureSentMessage(ctx, accessToken, token.connectedEmail, args.userId, id)) {
        sentCaptured++;
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

    return { status: "ok", processed, sentCaptured };
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

// ── One-time backfill: populate replyBodyHtml on rows ingested before HTML
// capture existed. Re-fetches each message's HTML from Gmail (by RFC822
// Message-ID, or the embedded Gmail id for the gmail-msg: fallback) and
// patches the row. Idempotent: only touches rows still missing HTML. Run via
//   npx convex run gmailInbound:backfillHtml '{"limit":80}'
export const backfillHtml = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ scanned: number; fixed: number; failed: number; samples: string[] }> => {
    const samples: string[] = [];
    const note = (s: string) => { if (samples.length < 5) samples.push(s); };
    const rows: any[] = await ctx.runQuery(internal.replyEvents.listMissingHtmlInternal, {
      limit: args.limit ?? 80,
    });

    // Per-user access token cache (refresh once per user).
    const tokenCache = new Map<string, string | null>();
    async function accessTokenFor(userId: string): Promise<string | null> {
      if (tokenCache.has(userId)) return tokenCache.get(userId) ?? null;
      const token: any = await ctx.runQuery(internal.gmailTokens.getForSyncInternal, {
        userId: userId as any,
      });
      if (!token || token.needsReconnect) {
        tokenCache.set(userId, null);
        return null;
      }
      let accessToken: string = token.accessToken;
      const expiresMs = new Date(token.expiresAt).getTime();
      if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
        try {
          const refreshed = await refreshAccessToken(token.refreshToken);
          accessToken = refreshed.access_token;
          await ctx.runMutation(internal.gmailSend.writeRefreshedToken, {
            userId: userId as any,
            accessToken,
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          });
        } catch {
          tokenCache.set(userId, null);
          return null;
        }
      }
      tokenCache.set(userId, accessToken);
      return accessToken;
    }

    let fixed = 0;
    let failed = 0;
    for (const row of rows) {
      const accessToken = await accessTokenFor(String(row.userId));
      if (!accessToken) {
        note(`no_token user=${row.userId}`);
        failed++;
        continue;
      }
      try {
        // Resolve the Gmail message id.
        let gmailId: string | undefined;
        if (typeof row.externalId === "string" && row.externalId.startsWith("gmail-msg:")) {
          gmailId = row.externalId.slice("gmail-msg:".length);
        } else if (typeof row.externalId === "string") {
          const rfcId = row.externalId.replace(/^<|>$/g, "");
          const r = await gmailGet(
            accessToken,
            `/messages?q=${encodeURIComponent(`rfc822msgid:${rfcId}`)}`,
          );
          if (!r.ok) note(`search_${r.status} id=${rfcId.slice(0, 40)}`);
          else if (!r.data?.messages?.[0]?.id) note(`search_empty id=${rfcId.slice(0, 40)}`);
          gmailId = r.ok ? r.data?.messages?.[0]?.id : undefined;
        }
        if (!gmailId) {
          failed++;
          continue;
        }
        const full = await gmailGet(accessToken, `/messages/${gmailId}?format=full`);
        if (!full.ok) {
          note(`fetch_${full.status}`);
          failed++;
          continue;
        }
        const extracted = extractBody(full.data?.payload);
        if (!extracted.html) {
          // No HTML part — leave as-is (plain-text path already renders it).
          continue;
        }
        await ctx.runMutation(internal.replyEvents.patchBodyHtmlInternal, {
          replyEventId: row._id,
          replyBodyHtml: extracted.html,
          replyBodyText: extracted.text || undefined,
        });
        fixed++;
      } catch (err) {
        console.error(`[gmailInbound] backfill failed for ${row._id}:`, err);
        failed++;
      }
    }

    return { scanned: rows.length, fixed, failed, samples };
  },
});
