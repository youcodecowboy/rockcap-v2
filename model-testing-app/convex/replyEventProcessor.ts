import { v } from "convex/values";
import { internalAction, internalQuery, action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// Reply event processor (cadence-fire v1).
//
// Called from two paths:
//  - ingestFromGmailPush: from the Gmail push webhook (real-time)
//  - ingestFromHubspot: from the HubSpot 6h sync sweep (safety net)
//
// Both paths converge on processReplyEvent which:
//  1. Idempotency check by (source, externalId)
//  2. Contact match by email
//  3. Cancel active cadences for the contact
//  4. Call the classifier (Next.js API route) to get intent label
//  5. Dispatch by intent
//  6. Mark replyEvent.processed

const CLASSIFIER_URL_ENV = "NEXT_APP_URL";
const CLASSIFIER_CONFIDENCE_THRESHOLD = 0.7;

type DispatchDestination =
  | "meeting-prep"
  | "long-term-monitor"
  | "qualify-and-draft"
  | "opt_out_marker"
  | "operator_review"
  | "restored_cadences"
  | "no_contact_match"
  | "unlinked_no_review"
  | "reply_drafted"
  | "flag_only";

type ClassifiedIntent =
  | "book_meeting"
  | "defer_long_term"
  | "not_interested"
  | "info_question"
  | "out_of_office"
  | "positive"
  | "unknown";

// ── Shared helpers ───────────────────────────────────────────────────

async function createOperatorReviewApproval(
  ctx: any,
  args: {
    intent: string;
    replyEventId: Id<"replyEvents">;
    contactId: Id<"contacts">;
    // Resolved client/prospect for this reply. Stamped onto the approval so it
    // surfaces on the prospect/client page (approvals.listPendingByClient
    // filters by relatedClientId) instead of sitting invisibly in /approvals.
    clientId?: Id<"clients">;
    userId: Id<"users">;
    replyBody?: string;
    replySubject?: string;
  },
  reason: string,
): Promise<void> {
  await ctx.runMutation(internal.approvals.internalCreate, {
    entityType: "client_communication",
    summary: `Reply needs operator review (intent: ${args.intent}, reason: ${reason})`,
    draftPayload: {
      intent: args.intent,
      reason,
      replyBody: args.replyBody ?? "(no body — HubSpot sweep path)",
      replySubject: args.replySubject ?? "",
      replyEventId: args.replyEventId,
    },
    requestedBy: args.userId,
    requestSource: "background_job",
    requestSourceName: "cadence-fire/reply-router",
    relatedContactId: args.contactId,
    relatedClientId: args.clientId,
    relatedReplyEventId: args.replyEventId,
  });
  // Ping the operator's bell — the approval row alone sits invisibly in the
  // /approvals queue; a reply that stopped a cadence needs an active nudge.
  await notifyOperator(ctx, {
    userId: args.userId,
    title: "Reply needs your review",
    message: `${await contactLabel(ctx, args.contactId)} replied${
      args.replySubject ? ` — "${args.replySubject}"` : ""
    } (intent: ${args.intent}). Their cadence is paused until you act.`,
    relatedId: args.replyEventId,
  });
}

// Resolve a human-readable label for notification copy.
async function contactLabel(ctx: any, contactId: Id<"contacts">): Promise<string> {
  try {
    const contact = await ctx.runQuery(internal.contacts.getInternal, { contactId });
    return contact?.name || contact?.email || "A contact";
  } catch {
    return "A contact";
  }
}

// Best-effort bell notification — never let a notification failure break
// reply processing itself.
async function notifyOperator(
  ctx: any,
  args: { userId: Id<"users">; title: string; message: string; relatedId?: string },
): Promise<void> {
  try {
    await ctx.runMutation(internal.notifications.internalCreate, {
      userId: args.userId,
      type: "flag" as const,
      title: args.title,
      message: args.message,
      relatedId: args.relatedId,
    });
  } catch (err) {
    console.error("[reply-router] notifyOperator failed:", err);
  }
}

// Best-effort denormalised needs-action flag onto the prospect (clients row).
// Mirrors notifyOperator's contract: a flag-write failure must never break
// reply processing. Upsert-by-kind lives in clients.raiseNeedsActionFlagInternal.
async function raiseNeedsActionFlag(
  ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> },
  args: {
    clientId: Id<"clients">;
    kind: string;
    reason: string;
    sourceReplyEventId?: Id<"replyEvents">;
    sourceApprovalId?: Id<"approvals">;
  },
): Promise<void> {
  try {
    await ctx.runMutation(internal.clients.raiseNeedsActionFlagInternal, {
      clientId: args.clientId,
      kind: args.kind,
      reason: args.reason,
      sourceReplyEventId: args.sourceReplyEventId,
      sourceApprovalId: args.sourceApprovalId,
    });
  } catch (err) {
    console.error("[reply-router] raiseNeedsActionFlag failed:", err);
  }
}

// ── Entry point: Gmail push ──────────────────────────────────────────
//
// Fired by the Pub/Sub webhook (gmailWatch.pushWebhook). Resolves the
// mailbox to its owning user and delegates to the SAME fetch+dispatch
// logic the polling cron uses (gmailInbound.pollUserInbound), which reads
// from the stored historyId watermark. We ignore the pushed historyId and
// trust the watermark so push and poll can't double-process.
export const ingestFromGmailPush = internalAction({
  args: { emailAddress: v.string(), historyId: v.string() },
  handler: async (ctx, args): Promise<{ status: string; processed: number }> => {
    const userId = await ctx.runQuery(
      internal.gmailTokens.getUserIdByEmailInternal,
      { email: args.emailAddress },
    );
    if (!userId) {
      return { status: "no_user_for_email", processed: 0 };
    }
    const result: any = await ctx.runAction(
      internal.gmailInbound.pollUserInbound,
      { userId },
    );
    return { status: result?.status ?? "ok", processed: result?.processed ?? 0 };
  },
});

// ── Entry point: Gmail inbound message (from the poller) ─────────────
//
// The gmailInbound poller has already fetched + parsed a single inbound
// message; this routes it through the shared processReplyEvent pipeline
// (idempotent on source+externalId, so re-polling the same message is a
// no-op). source is "gmail_push" — the same enum the real-time path uses.
export const ingestGmailMessage = internalAction({
  args: {
    userId: v.id("users"),
    contactEmail: v.optional(v.string()),
    fromEmail: v.optional(v.string()),
    fromName: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    bodyHtml: v.optional(v.string()),
    receivedAt: v.string(),
    externalId: v.string(),
    gmailThreadId: v.optional(v.string()),
    gmailMessageId: v.optional(v.string()),
    rawMessageRef: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await processReplyEvent(ctx, {
      source: "gmail_push",
      externalId: args.externalId,
      contactEmail: args.contactEmail,
      receivedAt: args.receivedAt,
      rawMessageRef: args.rawMessageRef,
      userId: args.userId,
      replyBody: args.body,
      replyBodyHtml: args.bodyHtml,
      replySubject: args.subject,
      fromEmail: args.fromEmail,
      fromName: args.fromName,
      gmailThreadId: args.gmailThreadId,
      gmailMessageId: args.gmailMessageId,
    });
  },
});

// ── Entry point: HubSpot sync sweep ──────────────────────────────────

export const ingestFromHubspot = internalAction({
  args: {
    engagementId: v.string(),
    contactEmail: v.optional(v.string()),
    receivedAt: v.string(),
    rawMessageRef: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await processReplyEvent(ctx, {
      source: "hubspot_sync",
      externalId: `hubspot:engagement:${args.engagementId}`,
      contactEmail: args.contactEmail,
      receivedAt: args.receivedAt,
      rawMessageRef: args.rawMessageRef,
      userId: args.userId,
      replyBody: undefined,
      replySubject: undefined,
    });
  },
});

// v1.3 manual ingest path — operator pastes a reply they received via
// channel that doesn't auto-sync (WhatsApp, text, forwarded email). Also
// the primary testing surface for the reply-handling backbone before the
// Gmail Pub/Sub topic is provisioned.
//
// Reuses processReplyEvent so manual replies go through the SAME flow as
// automated ones: cadence cancellation → intent classification → dispatch.
// The only difference: source is recorded as "hubspot_sync" (closest
// existing enum value; v1.4 could add "manual_paste" as a third source if
// we want to distinguish them in analytics).
export const ingestManualInternal = internalAction({
  args: {
    contactEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    receivedAt: v.optional(v.string()), // ISO; defaults to now
    rawMessageRef: v.optional(v.string()), // e.g., WhatsApp screenshot URL or forwarded-email subject
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<any> => {
    const now = new Date().toISOString();
    // Synthesise an externalId that's unique-enough for idempotency.
    // Format: manual:<email>:<receivedAt>:<bodyHash>. If operator pastes
    // the same reply twice with the same receivedAt, the second one
    // dedups via processReplyEvent's source+externalId check.
    const bodyHash = simpleHash(args.body).toString(16);
    const receivedAt = args.receivedAt ?? now;
    const externalId = `manual:${args.contactEmail}:${receivedAt}:${bodyHash}`;

    const result: any = await processReplyEvent(ctx, {
      source: "hubspot_sync" as const, // closest existing enum; v1.4 may add "manual_paste"
      externalId,
      contactEmail: args.contactEmail,
      receivedAt,
      rawMessageRef: args.rawMessageRef ?? `manual paste @ ${now}`,
      userId: args.userId,
      replyBody: args.body,
      replySubject: args.subject,
    });

    // Mark the manual-ingest provenance on the row (above call already created it)
    if (result.replyEventId) {
      await ctx.runMutation(internal.replyEvents.patchManualIngestInternal, {
        replyEventId: result.replyEventId,
        ingestedManuallyByUserId: args.userId,
        ingestedManuallyAt: now,
      });
    }

    return result;
  },
});

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Shared processing logic ──────────────────────────────────────────

async function processReplyEvent(
  ctx: {
    runQuery: (ref: unknown, args: unknown) => Promise<unknown>;
    runMutation: (ref: unknown, args: unknown) => Promise<unknown>;
  },
  args: {
    source: "gmail_push" | "hubspot_sync";
    externalId: string;
    contactEmail?: string;
    receivedAt: string;
    rawMessageRef?: string;
    userId: Id<"users">;
    replyBody?: string;
    replyBodyHtml?: string;
    replySubject?: string;
    fromEmail?: string;
    fromName?: string;
    gmailThreadId?: string;
    gmailMessageId?: string;
  },
) {
  // Step 1: Idempotency
  const existing = await ctx.runQuery(
    internal.replyEvents.findBySourceExternalIdInternal,
    { source: args.source, externalId: args.externalId },
  ) as Doc<"replyEvents"> | null;
  if (existing) {
    return { status: "duplicate" as const, replyEventId: existing._id };
  }

  // Step 2: Contact match + client denormalisation
  // resolveByEmailInternal prefers a contact with a direct clientId among
  // duplicates and bridges linkedCompanyIds → company.promotedToClientId
  // when the contact itself carries no clientId (HubSpot-synced contacts
  // imported before their company was promoted to a client).
  let contactId: Id<"contacts"> | undefined = undefined;
  let linkedClientId: Id<"clients"> | undefined = undefined;
  if (args.contactEmail) {
    const resolved = await ctx.runQuery(
      internal.contacts.resolveByEmailInternal,
      { email: args.contactEmail },
    ) as { contactId: Id<"contacts">; clientId?: Id<"clients"> } | null;
    contactId = resolved?.contactId;
    // v1.3: denormalise the resolved clientId onto the replyEvent so the
    // by_linked_client index serves prospect-detail-page reads without
    // requiring a contact->client JOIN.
    linkedClientId = resolved?.clientId;
  }

  // Step 2.5: HubSpot-sweep dedupe against Gmail capture. The Gmail OAuth
  // poller (5-min) records the same inbound mail with full body/subject
  // long before the 6h HubSpot engagement sweep, so a contentless sweep row
  // (no replyBody — distinguishes the sweep from manual paste, which always
  // carries a body) for a contact whose mail we already captured via Gmail
  // is pure duplication on the Replies tab. Skip it; the Gmail row is
  // canonical. Sweep rows still ingest when no Gmail twin exists — e.g.
  // mail logged to HubSpot from a teammate's unconnected mailbox.
  if (args.source === "hubspot_sync" && !args.replyBody && contactId) {
    const twin = await ctx.runQuery(
      internal.replyEvents.findGmailTwinInternal,
      { contactId, receivedAt: args.receivedAt, windowMs: 6 * 60 * 60 * 1000 },
    ) as Doc<"replyEvents"> | null;
    if (twin) {
      return { status: "duplicate_of_gmail" as const, replyEventId: twin._id };
    }
  }

  // Step 3: Create the event row
  const replyEventId = await ctx.runMutation(
    internal.replyEvents.createInternal,
    {
      source: args.source,
      externalId: args.externalId,
      contactId,
      receivedAt: args.receivedAt,
      rawMessageRef: args.rawMessageRef,
      userId: args.userId,
      // v1.3 — persist body + subject + client link at insert time
      replyBodyText: args.replyBody,
      replyBodyHtml: args.replyBodyHtml,
      replySubject: args.replySubject,
      linkedClientId,
      // Gmail inbound capture — sender (for inbox display when no contact
      // matches) + thread/message ids (for threaded replies).
      fromEmail: args.fromEmail,
      fromName: args.fromName,
      gmailThreadId: args.gmailThreadId,
      gmailMessageId: args.gmailMessageId,
    },
  ) as Id<"replyEvents">;

  // If no contact matched, record but do not act
  if (!contactId) {
    await ctx.runMutation(internal.replyEvents.markProcessedInternal, {
      replyEventId,
      dispatchedTo: "no_contact_match" as const,
    });
    return { status: "no_contact_match" as const, replyEventId };
  }

  // Step 4: Cancel active cadences
  const activeCadences = await ctx.runQuery(
    internal.cadences.findActiveByContactInternal,
    { contactId },
  ) as Doc<"cadences">[];
  const cancelledIds: Id<"cadences">[] = [];
  for (const cad of activeCadences) {
    await ctx.runMutation(internal.cadences.cancelInternal, {
      cadenceId: cad._id,
      reason: "inbound_received",
      replyEventId,
    });
    cancelledIds.push(cad._id);
  }
  if (cancelledIds.length > 0) {
    await ctx.runMutation(internal.replyEvents.patchCancelledInternal, {
      replyEventId,
      cadencesCancelled: cancelledIds,
    });
  }

  // Gate (v1.4): only classify + review replies from a contact tied to a
  // client or prospect. A matched-but-unlinked contact (internal @rockcap
  // addresses, lenders, generic HubSpot contacts) previously fell through to
  // the classifier and an operator-review approval that never attached to any
  // prospect — pure noise. We keep the replyEvent (audit + inbox) and the
  // cadence cancellation above (defensive), but stop here. Genuinely-unknown
  // senders are handled by the no_contact_match branch above.
  if (!linkedClientId) {
    await ctx.runMutation(internal.replyEvents.markProcessedInternal, {
      replyEventId,
      dispatchedTo: "unlinked_no_review" as const,
    });
    return { status: "unlinked_no_review" as const, replyEventId };
  }

  // Step 5: Call classifier (Next.js API)
  let intent: ClassifiedIntent = "unknown";
  let confidence = 0.0;
  let evidence: string | undefined = undefined;
  try {
    const rawAppUrl = process.env[CLASSIFIER_URL_ENV];
    // v1.3: env may carry the URL without protocol (e.g.,
    // "rockcap-v2.vercel.app"). Normalise to https:// scheme so the
    // fetch URL is well-formed regardless of how the env was set.
    const appUrl = rawAppUrl
      ? (rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`)
      : undefined;
    if (appUrl && args.replyBody) {
      const res = await fetch(`${appUrl}/api/classify-reply-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Route self-authenticates (it's on the Clerk public list so the
          // cookie-less server-to-server POST isn't 404'd by middleware).
          "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "",
        },
        body: JSON.stringify({
          replyBody: args.replyBody,
          replySubject: args.replySubject ?? "",
          contactId,
          cancelledCadenceIds: cancelledIds,
        }),
      });
      if (!res.ok) {
        // Surface non-2xx responses — these were previously swallowed
        // silently, which masked the middleware-404 breakage for weeks.
        await ctx.runMutation(internal.replyEvents.appendErrorInternal, {
          replyEventId,
          message: `classifier returned HTTP ${res.status}`,
        });
      }
      if (res.ok) {
        const data = await res.json() as {
          intent?: ClassifiedIntent;
          confidence?: number;
          evidence?: string;
        };
        intent = data.intent ?? "unknown";
        confidence = data.confidence ?? 0;
        evidence = data.evidence;
      }
    }
  } catch (err) {
    await ctx.runMutation(internal.replyEvents.appendErrorInternal, {
      replyEventId,
      message: `classifier call failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // Force unknown if low confidence
  if (confidence < CLASSIFIER_CONFIDENCE_THRESHOLD) {
    intent = "unknown";
  }

  await ctx.runMutation(internal.replyEvents.patchClassificationInternal, {
    replyEventId,
    classifiedIntent: intent,
    classifiedConfidence: confidence,
    classifierEvidence: evidence,
  });

  // Step 6: Dispatch by intent
  const dispatch = await dispatchByIntent(ctx, {
    intent,
    replyEventId,
    contactId,
    clientId: linkedClientId,
    cancelledCadences: activeCadences,
    userId: args.userId,
    replyBody: args.replyBody,
    replySubject: args.replySubject,
    gmailThreadId: args.gmailThreadId,
    gmailMessageId: args.gmailMessageId,
  });

  await ctx.runMutation(internal.replyEvents.markProcessedInternal, {
    replyEventId,
    dispatchedTo: dispatch.destination,
  });

  return { status: "processed" as const, replyEventId, intent, dispatch };
}

// Stage a client_communication/email_reply approval. This is the canonical
// auto-draft shape (matches outreach.draftReply), so executeClientCommunication
// resolves the recipient + threads the send, and the shared InlineDraftEditor +
// listActionableDrafts render/act on it uniformly. Returns the approval id so
// the caller can link the needs-action flag to it.
async function stageReplyDraft(
  ctx: { runMutation: (ref: unknown, args: unknown) => Promise<unknown> },
  args: {
    intent: ClassifiedIntent;
    replyEventId: Id<"replyEvents">;
    contactId: Id<"contacts">;
    clientId: Id<"clients">;
    userId: Id<"users">;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    reasoning?: string;
    threadId?: string;
    inReplyTo?: string;
    requestSourceName: string;
  },
): Promise<Id<"approvals">> {
  const approvalId = (await ctx.runMutation(internal.approvals.internalCreate, {
    entityType: "client_communication",
    summary: `Drafted reply (${args.intent}): ${args.subject.slice(0, 150)}`,
    draftPayload: {
      kind: "email_reply",
      subject: args.subject,
      bodyText: args.bodyText,
      bodyHtml: args.bodyHtml,
      contactId: args.contactId,
      threadId: args.threadId,
      inReplyTo: args.inReplyTo,
      replyEventId: args.replyEventId,
      intent: args.intent,
      reasoning: args.reasoning,
    },
    requestedBy: args.userId,
    requestSource: "background_job",
    requestSourceName: args.requestSourceName,
    relatedContactId: args.contactId,
    relatedClientId: args.clientId,
    relatedReplyEventId: args.replyEventId,
  })) as Id<"approvals">;
  return approvalId;
}

// Resolve the configured app URL (normalising a scheme-less env value) + the
// internal secret. Returns null when either is missing so callers fall back to
// an operator-review approval instead of a hard failure.
function getRouteCreds(): { appUrl: string; internalSecret: string } | null {
  const raw = process.env.NEXT_APP_URL;
  const appUrl = raw ? (raw.startsWith("http") ? raw : `https://${raw}`) : undefined;
  const internalSecret = process.env.CONVEX_INTERNAL_SECRET;
  if (!appUrl || !internalSecret) return null;
  return { appUrl, internalSecret };
}

async function dispatchByIntent(
  ctx: {
    runMutation: (ref: unknown, args: unknown) => Promise<unknown>;
  },
  args: {
    intent: ClassifiedIntent;
    replyEventId: Id<"replyEvents">;
    contactId: Id<"contacts">;
    // Always set: the ingest path gates dispatch on a resolved client/prospect
    // link, so every review/draft approval below can attach to its client.
    clientId: Id<"clients">;
    cancelledCadences: Doc<"cadences">[];
    userId: Id<"users">;
    replyBody?: string;
    replySubject?: string;
    // Threading: stamped onto the email_reply draft so the approved send
    // threads back onto the original Gmail conversation.
    gmailThreadId?: string;
    gmailMessageId?: string;
  },
): Promise<{ destination: DispatchDestination }> {
  switch (args.intent) {
    case "not_interested": {
      // KEEP the opt-out marker as HubSpot/lifecycle plumbing, but no longer
      // auto-finalise: flag for an operator lost/keep decision instead.
      await ctx.runMutation(internal.contacts.markOptedOutInternal, {
        contactId: args.contactId,
        replyEventId: args.replyEventId,
      });
      await raiseNeedsActionFlag(ctx, {
        clientId: args.clientId,
        kind: "reply_flag_only",
        reason: "Replied: not interested — keep or mark lost?",
        sourceReplyEventId: args.replyEventId,
      });
      return { destination: "flag_only" };
    }
    case "defer_long_term": {
      // Queue 3-month and 6-month wakeup cadences
      const now = Date.now();
      const threeMonths = new Date(now + 90 * 86_400_000).toISOString();
      const sixMonths = new Date(now + 180 * 86_400_000).toISOString();
      const packageId = `longterm-${args.replyEventId}`;
      const dueAts = [threeMonths, sixMonths];
      for (let idx = 0; idx < dueAts.length; idx++) {
        await ctx.runMutation(internal.cadences.createInternal, {
          contactId: args.contactId,
          cadenceType: "post_lost_re_engagement",
          scheduleConfig: {},
          nextDueAt: dueAts[idx],
          isActive: true,
          packageId,
          packageOrder: idx + 1,
          createdBy: args.userId,
        });
      }
      return { destination: "long-term-monitor" };
    }
    case "out_of_office": {
      // KEEP the cadence restore (7-day pause) as plumbing, but flag for the
      // operator so an OOO doesn't silently disappear from the queue.
      const pauseUntil = new Date(Date.now() + 7 * 86_400_000).toISOString();
      for (const cad of args.cancelledCadences) {
        await ctx.runMutation(internal.cadences.restoreInternal, {
          cadenceId: cad._id,
          pauseUntil,
        });
      }
      await raiseNeedsActionFlag(ctx, {
        clientId: args.clientId,
        kind: "reply_flag_only",
        reason: "Out of office auto-reply — cadence paused 7 days",
        sourceReplyEventId: args.replyEventId,
      });
      return { destination: "flag_only" };
    }
    case "book_meeting": {
      // v3.1: drafting is operator-launched in Claude Code (the harness), NOT the
      // app's API (cost + worse than Claude with full MCP context). Flag the
      // prospect; the Action-required queue offers a "Book the meeting" launcher.
      // Meeting-booked → warm_pre_meeting is owned by the meeting workstream
      // (meeting.create), not here.
      await raiseNeedsActionFlag(ctx, {
        clientId: args.clientId,
        kind: "reply_meeting_request",
        reason: "Meeting request — book it / draft a reply",
        sourceReplyEventId: args.replyEventId,
      });
      await notifyOperator(ctx, {
        userId: args.userId,
        title: "Meeting request — needs action",
        message: `${await contactLabel(ctx, args.contactId)} wants to meet. Open the Action required queue to book it.`,
        relatedId: args.replyEventId,
      });
      return { destination: "operator_review" };
    }

    case "info_question":
    case "positive": {
      // v3.1: drafting is operator-launched in Claude Code, NOT the app's API.
      // Flag the prospect; the Action-required queue offers a "Draft a reply"
      // launcher that hands Claude a context-filled prompt.
      await raiseNeedsActionFlag(ctx, {
        clientId: args.clientId,
        kind: "reply_received",
        reason:
          args.intent === "positive"
            ? "Positive reply — draft a response"
            : "Question to answer — draft a reply",
        sourceReplyEventId: args.replyEventId,
      });
      await notifyOperator(ctx, {
        userId: args.userId,
        title: "Reply needs a response",
        message: `${await contactLabel(ctx, args.contactId)} replied${
          args.replySubject ? ` — "${args.replySubject}"` : ""
        }. Open the Action required queue to draft a reply.`,
        relatedId: args.replyEventId,
      });
      return { destination: "operator_review" };
    }

    case "unknown":
    default: {
      // Operator-review approval (existing fallback for not-yet-hardened skills).
      await createOperatorReviewApproval(ctx, args, args.intent);
      await raiseNeedsActionFlag(ctx, {
        clientId: args.clientId,
        kind: "reply_received",
        reason: "Reply needs your review",
        sourceReplyEventId: args.replyEventId,
      });
      return { destination: "operator_review" };
    }
  }
}

// ── On-demand reply draft (prospecting v3) ───────────────────────────────────
// The auto-draft path only fires for book_meeting / info_question / positive.
// For any other reply (e.g. an UNKNOWN routed to operator review) the operator
// can request an AI draft from the Replies tab. Reuses the same /api/reply-draft
// route + stageReplyDraft staging, so the result lands as a pending email_reply
// approval the operator edits / approves / sends inline.

const replyDraftFields = internalQuery({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args) => {
    const r = (await ctx.db.get(args.replyEventId)) as Doc<"replyEvents"> | null;
    if (!r) return null;
    return {
      contactId: r.contactId ?? null,
      linkedClientId: r.linkedClientId ?? null,
      userId: r.userId,
      gmailThreadId: r.gmailThreadId ?? null,
      gmailMessageId: r.gmailMessageId ?? null,
      replySubject: r.replySubject ?? null,
      classifiedIntent: r.classifiedIntent ?? "unknown",
    };
  },
});

export const requestDraftForReply = action({
  args: { replyEventId: v.id("replyEvents") },
  handler: async (ctx, args): Promise<{ ok: boolean; approvalId?: Id<"approvals">; error?: string }> => {
    const fields = (await ctx.runQuery(internal.replyEventProcessor.replyDraftFields, {
      replyEventId: args.replyEventId,
    })) as {
      contactId: Id<"contacts"> | null;
      linkedClientId: Id<"clients"> | null;
      userId: Id<"users">;
      gmailThreadId: string | null;
      gmailMessageId: string | null;
      replySubject: string | null;
      classifiedIntent: ClassifiedIntent;
    } | null;

    if (!fields) return { ok: false, error: "Reply not found" };
    if (!fields.contactId || !fields.linkedClientId) {
      return { ok: false, error: "Reply is not linked to a contact + client — can't draft." };
    }
    const creds = getRouteCreds();
    if (!creds) return { ok: false, error: "Drafting not configured (NEXT_APP_URL / CONVEX_INTERNAL_SECRET)." };

    let draft: { draftReplySubject?: string; draftReplyBody?: string; draftReplyBodyHtml?: string; reasoning?: string; escalate?: boolean; reason?: string } = {};
    try {
      const res = await fetch(`${creds.appUrl}/api/reply-draft`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-convex-internal-secret": creds.internalSecret },
        body: JSON.stringify({ replyEventId: args.replyEventId }),
      });
      if (!res.ok) return { ok: false, error: `reply-draft returned ${res.status}` };
      draft = await res.json();
    } catch (err) {
      return { ok: false, error: `reply-draft call failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (draft.escalate || !draft.draftReplySubject || !draft.draftReplyBody) {
      return { ok: false, error: draft.reason || "The drafter couldn't compose a confident reply — handle manually." };
    }

    const approvalId = await stageReplyDraft(ctx, {
      intent: fields.classifiedIntent,
      replyEventId: args.replyEventId,
      contactId: fields.contactId,
      clientId: fields.linkedClientId,
      userId: fields.userId,
      subject: draft.draftReplySubject,
      bodyText: draft.draftReplyBody,
      bodyHtml: draft.draftReplyBodyHtml ?? `<p>${draft.draftReplyBody}</p>`,
      reasoning: draft.reasoning,
      threadId: fields.gmailThreadId ?? undefined,
      inReplyTo: fields.gmailMessageId ?? undefined,
      requestSourceName: "reply-draft (on demand)",
    });
    return { ok: true, approvalId };
  },
});
