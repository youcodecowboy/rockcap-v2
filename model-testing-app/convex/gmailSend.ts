import { v } from "convex/values";
import { mutation, internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

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
}

function composeRfc822(args: ComposeArgs): string {
  const boundary = `rockcap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const headers: string[] = [];
  headers.push(`From: ${args.fromEmail}`);
  headers.push(`To: ${quoteHeaderAddresses(args.to)}`);
  if (args.cc && args.cc.length) headers.push(`Cc: ${quoteHeaderAddresses(args.cc)}`);
  if (args.bcc && args.bcc.length) headers.push(`Bcc: ${quoteHeaderAddresses(args.bcc)}`);
  headers.push(`Subject: ${args.subject}`);
  headers.push(`MIME-Version: 1.0`);
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`);
  if (args.references && args.references.length) {
    headers.push(`References: ${args.references.join(" ")}`);
  }

  const hasHtml = !!args.bodyHtml;
  const hasText = !!args.bodyText;

  if (hasHtml && hasText) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    const body = [
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      args.bodyText,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      args.bodyHtml,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    return `${headers.join("\r\n")}\r\n${body}`;
  }

  if (hasHtml) {
    headers.push(`Content-Type: text/html; charset=UTF-8`);
    return `${headers.join("\r\n")}\r\n\r\n${args.bodyHtml}`;
  }

  // text only
  headers.push(`Content-Type: text/plain; charset=UTF-8`);
  return `${headers.join("\r\n")}\r\n\r\n${args.bodyText ?? ""}`;
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
    const payload = approval.draftPayload as {
      to: string[];
      cc?: string[];
      bcc?: string[];
      subject: string;
      bodyHtml?: string;
      bodyText?: string;
      threadId?: string;
      inReplyTo?: string;
      references?: string[];
    };

    const token: any = await ctx.runQuery(internal.gmailSend.getTokenForSend, {
      userId: approval.requestedBy,
    });
    if (!token) throw new Error("Gmail token not found for requester");
    if (token.needsReconnect) throw new Error("Gmail token needs reconnect");

    // Defense-in-depth kill switch. The gate is enforced at queue time in
    // requestSend, but the cadence dispatcher bypasses that path (it calls
    // approvals.internalCreate directly), so an approved cadence-staged draft
    // would otherwise fire regardless of the switches. Re-check BOTH switches
    // here so no approved gmail_send — whatever its origin — can send while
    // send is disabled. On throw, executeApproval marks the row
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
    // so every gmail_send (cadence, qualify-and-draft reply, manual) logs.
    const hubspotLogBcc = process.env.HUBSPOT_LOG_BCC;
    const bcc = [
      ...(payload.bcc ?? []),
      ...(hubspotLogBcc ? [hubspotLogBcc] : []),
    ].filter((v, i, arr) => !!v && arr.indexOf(v) === i);

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
    } catch (err) {
      // Swallow; the send succeeded. Future hardening: surface this in
      // the approval's executionResult.
      console.error("[gmailSend] touchpoint write failed:", err);
    }

    return {
      gmailMessageId: sent.id,
      gmailThreadId: sent.threadId,
      touchpointId,
    };
  },
});
