import { v } from "convex/values";
import { httpAction, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Gmail push notifications (cadence-fire v1).
//
// Gmail's users.watch API delivers a Pub/Sub message to this webhook when
// new mail arrives in INBOX. The webhook acks immediately (200 OK to
// prevent Gmail retries) and dispatches async processing to
// replyEventProcessor.ingestFromGmailPush. Watches expire after 7 days
// and are renewed by the daily gmail-watch-renewal cron (registered in
// crons.ts in a separate commit).
//
// Pattern parallels googleCalendarSync.ts (push channel renewal). Shares
// the OAuth tokens stored on the users table (Calendar + Gmail use the
// same Google OAuth identity). Token fields live on googleGmailTokens
// (separate from googleCalendarTokens in schema.ts).

// ── HTTP action: webhook receiver ─────────────────────────────────────

export const pushWebhook = httpAction(async (ctx, request) => {
  // Acknowledge immediately so Gmail doesn't retry. Process async.
  let body: { message?: { data?: string }; subscription?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  // Gmail's push payload is base64(JSON({ emailAddress, historyId }))
  if (!body?.message?.data) {
    return new Response("ok", { status: 200 });
  }

  let decoded: { emailAddress?: string; historyId?: string };
  try {
    const dataStr = atob(body.message.data);
    decoded = JSON.parse(dataStr);
  } catch {
    return new Response("invalid payload", { status: 400 });
  }

  const { emailAddress, historyId } = decoded;
  if (!emailAddress || !historyId) {
    return new Response("missing fields", { status: 400 });
  }

  // Dispatch async; do not await.
  await ctx.scheduler.runAfter(
    0,
    internal.replyEventProcessor.ingestFromGmailPush,
    { emailAddress, historyId },
  );
  console.log(`[gmailWatch] push received emailAddress=${emailAddress} historyId=${historyId} — dispatched to replyEventProcessor`);

  return new Response("ok", { status: 200 });
});

// ── Internal action: register a Gmail watch for one user ─────────────

export const registerWatchInternal = internalAction({
  args: { userId: v.id("users") },
  handler: async (_ctx, _args) => {
    // STUB for v1: real implementation calls
    //   POST https://gmail.googleapis.com/gmail/v1/users/me/watch
    //   with body { topicName, labelIds: ["INBOX"], labelFilterAction: "include" }
    // and stores the resulting historyId + expiration on the user row.
    //
    // Pre-requisite: a Google Cloud Pub/Sub topic configured to push to
    // the pushWebhook above. Topic ARN comes from an env var.
    //
    // Returning a stub result here; full wiring is operator-driven setup
    // outside the autonomous build. The cron below calls this for users
    // due for renewal so the skeleton is in place when the operator
    // completes the Pub/Sub setup.
    return { status: "stub", note: "Gmail watch registration requires Pub/Sub topic setup (operator)" };
  },
});

// ── Internal action: renew Gmail watches due for refresh ─────────────

export const renewWatchesInternal = internalAction({
  args: {},
  handler: async (_ctx, _args) => {
    // STUB: iterate users with Gmail tokens, re-issue users.watch for those
    // whose watch expiry is within 2 days. Same body as register above.
    // Returning stub; lands operationally when Pub/Sub topic is configured.
    return { status: "stub", note: "Renewal loop runs but is no-op until registerWatchInternal is wired" };
  },
});
