import { v } from "convex/values";
import { mutation, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";
import { Id } from "./_generated/dataModel";

// String ref (TS2589/TS7022 self-reference workaround — same pattern as
// approvals.ts): calling internal.touchpoints.saveBodyInternal directly
// creates a circular type inference through the generated api types.
const saveBodyRef = makeFunctionReference<
  "mutation",
  { touchpointId: Id<"touchpoints">; bodyText?: string; bodyHtml?: string }
>("touchpoints:saveBodyInternal");

// Gmail send wrapper (BL-4.2).
// Skill-facing surface: requestSend creates an approval row, returns
// the approvalId. The actual Gmail API call only happens when a human
// approves through the approval queue (BL-5.7), which dispatches
// executeApprovedSend below.
//
// Two-switch gate enforced inside requestSend:
//   1. global gmailSendConfig.isEnabled
//   2. per-user googleGmailTokens.sendEnabled
//   3. connection healthy (no needsReconnect)
// If any of the three is off, requestSend throws before any approval
// is created. Skills cannot bypass.
//
// On approval, the executor:
//   1. Reads the approval payload
//   2. Refreshes the access token if expired
//   3. Composes an RFC822 message and base64url-encodes it
//   4. POSTs to gmail.users.messages.send
//   5. Writes a touchpoint with provider='gmail' direction='outbound'
//   6. Returns the Gmail message id

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

// ── Request to send (skill / wrapper entry point) ────────────

const SEND_PAYLOAD = v.object({
  to: v.array(v.string()),
  cc: v.optional(v.array(v.string())),
  bcc: v.optional(v.array(v.string())),
  subject: v.string(),
  bodyHtml: v.optional(v.string()),
  bodyText: v.optional(v.string()),
  // For replies: include the original Gmail thread id and message id.
  threadId: v.optional(v.string()),
  inReplyTo: v.optional(v.string()),     // RFC822 Message-Id header value
  references: v.optional(v.array(v.string())),
});

export const requestSend = mutation({
  args: {
    payload: SEND_PAYLOAD,
    summary: v.string(),
    requestSource: v.union(
      v.literal("skill"),
      v.literal("background_job"),
      v.literal("cadence"),
      v.literal("manual"),
    ),
    requestSourceName: v.optional(v.string()),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    relatedContactId: v.optional(v.id("contacts")),
    relatedCadenceId: v.optional(v.id("cadences")),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);

    // Validate the two-switch gate. We do not bypass: even a manual
    // operator-triggered send must pass the gate when routed through
    // this wrapper. Direct admin-initiated sends from a compose UI
    // (not yet built) would have their own path.
    const userTokens = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .first();
    if (!userTokens) {
      throw new Error("Gmail is not connected for this user");
    }
    if (userTokens.needsReconnect === true) {
      throw new Error("Gmail token needs reconnect");
    }
    if (userTokens.sendEnabled !== true) {
      throw new Error("Per-user Gmail send is disabled");
    }
    const sendConfig = await ctx.db
      .query("gmailSendConfig")
      .withIndex("by_enabled")
      .first();
    if (!sendConfig || sendConfig.isEnabled !== true) {
      throw new Error("Global Gmail send is disabled");
    }

    // Basic payload sanity checks. Reject empty recipient lists; reject
    // both body fields empty. The detailed RFC822 composition happens
    // at execution time.
    if (args.payload.to.length === 0) {
      throw new Error("Send requires at least one recipient");
    }
    if (!args.payload.bodyHtml && !args.payload.bodyText) {
      throw new Error("Send requires either bodyHtml or bodyText");
    }
    if (!args.payload.subject.trim()) {
      throw new Error("Send requires a non-empty subject");
    }

    // Create the approval row. The Gmail send only happens on approve.
    const approvalId = await ctx.runMutation(internal.approvals.internalCreate, {
      entityType: "gmail_send",
      summary: args.summary,
      draftPayload: args.payload,
      requestedBy: user._id,
      requestSource: args.requestSource,
      requestSourceName: args.requestSourceName,
      relatedClientId: args.relatedClientId,
      relatedProjectId: args.relatedProjectId,
      relatedContactId: args.relatedContactId,
      relatedCadenceId: args.relatedCadenceId,
      expiresAt: args.expiresAt,
    });

    return { approvalId };
  },
});

// ── Token plumbing for the executor ──────────────────────────

export const getTokenForSend = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return null;
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      connectedEmail: row.connectedEmail,
      sendEnabled: row.sendEnabled === true,
      needsReconnect: row.needsReconnect === true,
    };
  },
});

// Global send kill-switch read for the executor's defense-in-depth check.
// requestSend gates at queue time, but the cadence dispatcher stages
// gmail_send approvals via approvals.internalCreate DIRECTLY, bypassing that
// gate (see cadenceDispatcher.ts). So the executor MUST re-check the kill
// switches at fire time — otherwise an operator approving a cadence-staged
// draft would send even with the global switch off. Mirrors the global flag
// read in gmailTokens.getSendConfig.
export const getGlobalSendEnabled = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("gmailSendConfig")
      .withIndex("by_enabled")
      .first();
    return config?.isEnabled === true;
  },
});

export const writeRefreshedToken = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleGmailTokens")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .first();
    if (!row) return;
    await ctx.db.patch(row._id, {
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
    });
  },
});

// ── RFC822 composition + base64url encoding ──────────────────

function base64Url(input: string): string {
  // Convex's runtime supports Buffer-style btoa via TextEncoder. We use
  // a manual base64url to avoid any environment quirks.
  let b64: string;
  if (typeof Buffer !== "undefined") {
    b64 = Buffer.from(input, "utf-8").toString("base64");
  } else {
    // Fallback path; should not be hit in the Convex Node runtime.
    b64 = btoa(unescape(encodeURIComponent(input)));
  }
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function quoteHeaderAddresses(addresses: string[]): string {
  return addresses.map((a) => a.trim()).filter(Boolean).join(", ");
}

// Standard (non-url) base64 of a UTF-8 string — for RFC 2047 header words.
function utf8ToBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(input)));
}

// RFC 2047 encode a header value when it contains non-ASCII characters.
// Message headers are ASCII-only by spec; raw UTF-8 in Subject (e.g. an
// em-dash) reaches recipients as mojibake ("Ã¢Â€Â”"). Pure-ASCII values
// pass through untouched. Non-ASCII values become one or more
// =?UTF-8?B?...?= encoded-words, chunked at ≤45 UTF-8 bytes per word so
// each encoded-word stays under the 75-char RFC limit, split on code
// points so multibyte characters never straddle a chunk boundary.
function encodeMimeHeaderValue(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const utf8Len = (s: string): number =>
    typeof Buffer !== "undefined"
      ? Buffer.byteLength(s, "utf-8")
      : new TextEncoder().encode(s).length;
  const words: string[] = [];
  let chunk = "";
  for (const cp of Array.from(value)) {
    if (chunk && utf8Len(chunk + cp) > 45) {
      words.push(chunk);
      chunk = cp;
    } else {
      chunk += cp;
    }
  }
  if (chunk) words.push(chunk);
  // Continuation words fold onto new lines (CRLF + space) per RFC 2047 §2.
  return words.map((w) => `=?UTF-8?B?${utf8ToBase64(w)}?=`).join("\r\n ");
}

interface Attachment {
  filename: string;
  mimeType: string;
  base64: string; // STANDARD base64 (Buffer.toString("base64")), not url-safe
}

interface ComposeArgs {
  fromEmail: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Attachment[];
}

// Binary → standard base64, runtime-safe. This file runs in the Convex
// default runtime (it holds queries/mutations, so it can't be "use node"),
// where Buffer isn't guaranteed — mirror base64Url's Buffer/btoa fallback.
function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

// RFC 2045 requires base64 bodies wrapped at <=76 chars per line.
function wrapBase64(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

function sanitizeFilename(name: string): string {
  return (name || "attachment").replace(/["\r\n]/g, "_");
}

// Build the MIME entity for the message body (text / html / both). Returns
// its own Content-Type header line(s) + the body content, WITHOUT the
// top-level message headers — so it can serve either as the whole single-
// part message body OR as the first part inside a multipart/mixed wrapper
// when attachments are present.
function buildBodyEntity(bodyHtml?: string, bodyText?: string): {
  contentTypeLines: string[];
  content: string;
} {
  const hasHtml = !!bodyHtml;
  const hasText = !!bodyText;

  if (hasHtml && hasText) {
    const altB = `rockcap-alt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return {
      contentTypeLines: [`Content-Type: multipart/alternative; boundary="${altB}"`],
      content: [
        `--${altB}`,
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        bodyText,
        `--${altB}`,
        "Content-Type: text/html; charset=UTF-8",
        "Content-Transfer-Encoding: 7bit",
        "",
        bodyHtml,
        `--${altB}--`,
      ].join("\r\n"),
    };
  }
  if (hasHtml) {
    return {
      contentTypeLines: ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 7bit"],
      content: bodyHtml as string,
    };
  }
  return {
    contentTypeLines: ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 7bit"],
    content: bodyText ?? "",
  };
}

function composeRfc822(args: ComposeArgs): string {
  const headers: string[] = [];
  headers.push(`From: ${args.fromEmail}`);
  headers.push(`To: ${quoteHeaderAddresses(args.to)}`);
  if (args.cc && args.cc.length) headers.push(`Cc: ${quoteHeaderAddresses(args.cc)}`);
  if (args.bcc && args.bcc.length) headers.push(`Bcc: ${quoteHeaderAddresses(args.bcc)}`);
  headers.push(`Subject: ${encodeMimeHeaderValue(args.subject)}`);
  headers.push(`MIME-Version: 1.0`);
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`);
  if (args.references && args.references.length) {
    headers.push(`References: ${args.references.join(" ")}`);
  }

  const bodyEntity = buildBodyEntity(args.bodyHtml, args.bodyText);
  const attachments = args.attachments ?? [];

  // No attachments → the body entity's Content-Type is a top-level header.
  if (attachments.length === 0) {
    return [
      ...headers,
      ...bodyEntity.contentTypeLines,
      "",
      bodyEntity.content,
    ].join("\r\n");
  }

  // Attachments → wrap body + each file in multipart/mixed.
  const mixedB = `rockcap-mixed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedB}"`,
    "",
    `--${mixedB}`,
    ...bodyEntity.contentTypeLines,
    "",
    bodyEntity.content,
  ];
  for (const att of attachments) {
    const filename = sanitizeFilename(att.filename);
    lines.push(
      `--${mixedB}`,
      `Content-Type: ${att.mimeType || "application/octet-stream"}; name="${filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${filename}"`,
      "",
      wrapBase64(att.base64),
    );
  }
  lines.push(`--${mixedB}--`, "");
  return lines.join("\r\n");
}

// ── OAuth refresh + Gmail send ───────────────────────────────

async function refreshGmailAccessToken(refreshToken: string): Promise<{
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

async function sendViaGmailApi(accessToken: string, raw: string, threadId?: string): Promise<{
  id: string;
  threadId: string;
}> {
  const body: any = { raw };
  if (threadId) body.threadId = threadId;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail send failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ── Executor (called by approvals.executeApproval) ───────────

// Normalised send shape. Both executors below resolve their entity-specific
// payload into this, then call performApprovedSend so the kill-switch gate,
// token refresh, HubSpot BCC, RFC822 composition, send, and touchpoint
// logging live in exactly one place.
interface NormalizedSend {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Attachment[];
}

// Coerce a recipient field to a clean string[]. Approval payloads staged via
// approvals.internalCreate bypass requestSend's validator, and at least one
// producer (the cadence dispatcher, pre-fix) wrote `to` as a bare string —
// which passed the length check but crashed composeRfc822's .map at send
// time. Accept both shapes here so legacy staged rows still send.
function toAddressArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((a): a is string => typeof a === "string" && !!a.trim());
  }
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

async function performApprovedSend(
  ctx: any,
  approval: any,
  payload: NormalizedSend,
): Promise<{ gmailMessageId: string; gmailThreadId: string; touchpointId?: string }> {
  payload = {
    ...payload,
    to: toAddressArray(payload.to),
    cc: payload.cc !== undefined ? toAddressArray(payload.cc) : undefined,
    bcc: payload.bcc !== undefined ? toAddressArray(payload.bcc) : undefined,
  };
  if (payload.to.length === 0) {
    throw new Error("Send requires at least one recipient");
  }

  const token: any = await ctx.runQuery(internal.gmailSend.getTokenForSend, {
    userId: approval.requestedBy,
  });
  if (!token) throw new Error("Gmail token not found for requester");
  if (token.needsReconnect) throw new Error("Gmail token needs reconnect");

  // Defense-in-depth kill switch. The gate is enforced at queue time in
  // requestSend, but the cadence dispatcher + reply router bypass that path
  // (they call approvals.internalCreate directly), so an approved staged
  // draft would otherwise fire regardless of the switches. Re-check BOTH
  // switches here so no approved send — whatever its origin — can leave the
  // building while send is disabled. On throw, executeApproval marks the row
  // execution_failed (not sent), which is the honest outcome.
  if (token.sendEnabled !== true) {
    throw new Error("Per-user Gmail send is disabled (kill switch)");
  }
  const globalSendEnabled: boolean = await ctx.runQuery(
    internal.gmailSend.getGlobalSendEnabled,
    {},
  );
  if (!globalSendEnabled) {
    throw new Error("Global Gmail send is disabled (kill switch)");
  }

  // Refresh if within 60 seconds of expiry, or if expired.
  let accessToken: string = token.accessToken;
  const expiresMs = new Date(token.expiresAt).getTime();
  if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
    const refreshed = await refreshGmailAccessToken(token.refreshToken);
    accessToken = refreshed.access_token;
    const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
    await ctx.runMutation(internal.gmailSend.writeRefreshedToken, {
      userId: approval.requestedBy,
      accessToken,
      expiresAt: newExpiresAt,
    });
  }

  // Append the HubSpot logging BCC so the sent email auto-logs to the
  // client's HubSpot timeline (and thus the mobile activity feed). Set via
  // Convex env HUBSPOT_LOG_BCC (the portal's bcc.<region>.hubspot.com
  // address). If unset, the send still goes out — it just isn't logged. BCC
  // is invisible to the recipient. This is the single send-time chokepoint,
  // so every send (cadence, qualify-and-draft reply, manual) logs.
  const hubspotLogBcc = process.env.HUBSPOT_LOG_BCC;
  const bcc = [
    ...(payload.bcc ?? []),
    ...(hubspotLogBcc ? [hubspotLogBcc] : []),
  ].filter((val, i, arr) => !!val && arr.indexOf(val) === i);

  const raw = base64Url(
    composeRfc822({
      fromEmail: token.connectedEmail,
      to: payload.to,
      cc: payload.cc,
      bcc,
      subject: payload.subject,
      bodyHtml: payload.bodyHtml,
      bodyText: payload.bodyText,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
      attachments: payload.attachments,
    }),
  );

  const sent = await sendViaGmailApi(accessToken, raw, payload.threadId);

  // Capture as a touchpoint. Direction outbound, provider gmail.
  // We do not block on this; if it fails, the send itself succeeded
  // and the approval is still marked executed via the result.
  let touchpointId: string | undefined;
  try {
    const id: any = await ctx.runMutation(internal.touchpoints.internalCreate, {
      provider: "gmail",
      direction: "outbound",
      kind: "email",
      contactId: approval.relatedContactId,
      participantEmails: [
        token.connectedEmail,
        ...payload.to,
        ...(payload.cc ?? []),
      ],
      relatedClientId: approval.relatedClientId,
      relatedProjectId: approval.relatedProjectId,
      occurredAt: new Date().toISOString(),
      payloadRef: sent.id,
      payloadType: "gmail.message",
      subject: payload.subject,
      summary: approval.summary,
      bodyExcerpt: (payload.bodyText ?? payload.bodyHtml ?? "").slice(0, 500),
      threadId: sent.threadId,
      capturedBy: approval.requestedBy,
    });
    touchpointId = id;
    // Full body → sidecar (drawer reading pane); ledger row stays slim.
    await ctx.runMutation(saveBodyRef, {
      touchpointId: id,
      bodyText: payload.bodyText,
      bodyHtml: payload.bodyHtml,
    });
  } catch (err) {
    // Swallow; the send succeeded. Future hardening: surface this in
    // the approval's executionResult.
    console.error("[gmailSend] touchpoint write failed:", err);
  }

  // Prospect lifecycle: a successful outbound send to a pre-outreach prospect
  // (researched / drafted / needs_revision) flips it to "active" — outreach is
  // now genuinely in flight. The mutation is a guarded upgrade (it never
  // downgrades replied/engaged/etc. and ignores non-prospect clients), and
  // this chokepoint covers every send path (cadence, reply, lender outreach).
  // Non-blocking, same as the touchpoint: the send already succeeded.
  if (approval.relatedClientId) {
    try {
      await ctx.runMutation(internal.prospects.markOutreachInFlightInternal, {
        clientId: approval.relatedClientId,
        userId: approval.requestedBy,
      });
    } catch (err) {
      console.error("[gmailSend] prospect state auto-advance failed:", err);
    }
  }

  return {
    gmailMessageId: sent.id,
    gmailThreadId: sent.threadId,
    touchpointId,
  };
}

// gmail_send approvals (requestSend, cadence dispatcher, meeting-prep
// responder) — the payload already carries a recipient list.
export const executeApprovedSend = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args): Promise<{
    gmailMessageId: string;
    gmailThreadId: string;
    touchpointId?: string;
  }> => {
    const approval: any = await ctx.runQuery(
      internal.approvals.getApprovalForExecution,
      { approvalId: args.approvalId },
    );
    if (!approval) throw new Error("Approval not found");
    if (approval.entityType !== "gmail_send") {
      throw new Error(`Expected gmail_send approval, got ${approval.entityType}`);
    }
    return await performApprovedSend(ctx, approval, approval.draftPayload as NormalizedSend);
  },
});

// client_communication approvals with kind === "email_reply" (the drafted
// reply staged by outreach.draftReply / the web inbox composer) or
// kind === "email_fresh" (operator-initiated new outreach staged by
// outreach.draftFreshEmail). The recipient isn't in the payload; resolve it
// from the related contact's email. Replies thread via the stored Gmail
// thread/message ids; fresh outreach starts a new conversation.
export const executeClientCommunication = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args): Promise<{
    gmailMessageId: string;
    gmailThreadId: string;
    touchpointId?: string;
  }> => {
    const approval: any = await ctx.runQuery(
      internal.approvals.getApprovalForExecution,
      { approvalId: args.approvalId },
    );
    if (!approval) throw new Error("Approval not found");
    if (approval.entityType !== "client_communication") {
      throw new Error(`Expected client_communication approval, got ${approval.entityType}`);
    }
    const p: any = approval.draftPayload ?? {};
    if (p.kind !== "email_reply" && p.kind !== "email_fresh") {
      throw new Error("client_communication payload is not a sendable email (email_reply | email_fresh)");
    }

    // Resolve the recipient: explicit payload.to wins, else the related
    // contact's email.
    let to: string[] = Array.isArray(p.to) ? p.to.filter(Boolean) : [];
    if (to.length === 0) {
      const contactId = p.contactId ?? approval.relatedContactId;
      if (!contactId) throw new Error("No recipient: missing payload.to and relatedContactId");
      const contact: any = await ctx.runQuery(internal.contacts.getInternal, {
        contactId,
      });
      if (!contact?.email) {
        throw new Error("Related contact has no email address on file");
      }
      to = [contact.email];
    }

    const normalized: NormalizedSend = {
      to,
      cc: p.cc,
      subject: p.subject,
      bodyHtml: p.bodyHtml,
      bodyText: p.bodyText,
      threadId: p.threadId,
      inReplyTo: p.inReplyTo,
      // Seed References from the message we're replying to if not provided.
      references: p.references ?? (p.inReplyTo ? [p.inReplyTo] : undefined),
    };
    const sent = await performApprovedSend(ctx, approval, normalized);

    // Reply lifecycle: a successful outbound reply send clears the prospect's
    // "reply needs response" needs-action flag. Tied to the actual send (not the
    // UI handler) so both MCP-approve and UI-approve paths clear it. Best-effort:
    // the send already succeeded, so never throw on a flag-clear failure.
    // Fresh outreach isn't answering a reply, so it has no flag to clear.
    if (p.kind === "email_reply" && approval.relatedClientId) {
      try {
        await ctx.runMutation(internal.clients.clearNeedsActionFlagInternal, {
          clientId: approval.relatedClientId,
          kind: "reply_received",
          sourceReplyEventId: p.replyEventId,
        });
      } catch (err) {
        console.error("[gmailSend] needs-action flag clear failed:", err);
      }
    }
    return sent;
  },
});

// Gmail's hard cap is 25MB for a message including attachments; base64
// inflates ~33%, so we cap the combined RAW (pre-encode) attachment bytes
// well under that to leave room for the body + encoding overhead.
const MAX_ATTACHMENT_BYTES_TOTAL = 18 * 1024 * 1024;

// lender_outreach approvals (outreach.draftToLender). Same send core as the
// reply path, plus attachment support: the payload carries attachedDocumentIds
// (term sheets, briefs), which we fetch from Convex storage and encode as
// multipart/mixed parts. Recipient resolves from the related BDM contact.
export const executeLenderOutreach = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args): Promise<{
    gmailMessageId: string;
    gmailThreadId: string;
    touchpointId?: string;
    attachmentsSent?: number;
    attachmentsSkipped?: string[];
  }> => {
    const approval: any = await ctx.runQuery(
      internal.approvals.getApprovalForExecution,
      { approvalId: args.approvalId },
    );
    if (!approval) throw new Error("Approval not found");
    if (approval.entityType !== "lender_outreach") {
      throw new Error(`Expected lender_outreach approval, got ${approval.entityType}`);
    }
    const p: any = approval.draftPayload ?? {};

    // Recipient: explicit payload.to wins, else the related BDM contact.
    let to: string[] = Array.isArray(p.to) ? p.to.filter(Boolean) : [];
    if (to.length === 0) {
      const contactId = p.contactId ?? approval.relatedContactId;
      if (!contactId) throw new Error("No recipient: missing payload.to and relatedContactId");
      const contact: any = await ctx.runQuery(internal.contacts.getInternal, {
        contactId,
      });
      if (!contact?.email) {
        throw new Error("Related lender contact has no email address on file");
      }
      to = [contact.email];
    }

    // Resolve attachments from storage. Skip (don't fail the whole send) any
    // doc that's missing/deleted or has no stored file; track skips so the
    // executionResult is honest about what actually went out.
    const attachments: Attachment[] = [];
    const attachmentsSkipped: string[] = [];
    let totalBytes = 0;
    const docIds: any[] = Array.isArray(p.attachedDocumentIds) ? p.attachedDocumentIds : [];
    for (const docId of docIds) {
      const meta: any = await ctx.runQuery(internal.documents.getAttachmentMetaInternal, {
        id: docId,
      });
      if (!meta) {
        attachmentsSkipped.push(`${docId} (missing or no file)`);
        continue;
      }
      totalBytes += meta.fileSize ?? 0;
      if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
        attachmentsSkipped.push(`${meta.fileName} (would exceed size limit)`);
        continue;
      }
      const blob = await ctx.storage.get(meta.fileStorageId);
      if (!blob) {
        attachmentsSkipped.push(`${meta.fileName} (storage read failed)`);
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      attachments.push({
        filename: meta.fileName,
        mimeType: meta.fileType,
        base64: bytesToBase64(bytes),
      });
    }

    const normalized: NormalizedSend = {
      to,
      cc: p.cc,
      subject: p.subject,
      bodyHtml: p.bodyHtml,
      bodyText: p.bodyText,
      threadId: p.threadId,
      inReplyTo: p.inReplyTo,
      references: p.references ?? (p.inReplyTo ? [p.inReplyTo] : undefined),
      attachments,
    };
    const sent = await performApprovedSend(ctx, approval, normalized);
    return {
      ...sent,
      attachmentsSent: attachments.length,
      attachmentsSkipped: attachmentsSkipped.length ? attachmentsSkipped : undefined,
    };
  },
});
