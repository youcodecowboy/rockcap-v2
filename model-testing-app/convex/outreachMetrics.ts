import { v } from "convex/values";
import { query } from "./_generated/server";

// Outreach metrics read-model (Phase 2, 2026-07-15).
//
// The outcome layer the triage commands were missing: triage checks STATE
// (unsent, stalled, failed); this reports RESULTS — sends, replies, response
// rate, all attributable by template, plus the operator's priority number:
// how many touches it takes to earn a reply.
//
// Sources (all existing tables, no new writes):
//   sends    → touchpoints (direction outbound, kind email) via by_occurred_at
//              — includes reconciliation-backfilled manual sends, so run the
//              backlog reset before trusting a baseline.
//   replies  → replyEvents via by_received_at.
//   template → the fired cadence touch's preDraftedTouch.dynamicVars
//              .templateKey (stamped by the drafting skills since Phase 1).
//              A reply is attributed to the LATEST fired touch to that
//              contact at or before the reply's receivedAt. Untagged/legacy
//              sends land in the "untagged" bucket rather than being dropped.
//
// Everything is windowed + capped (this is a reporting surface, not a
// ledger); `capped` flags say when a number is a floor, not a total.

const SEND_CAP = 1500;
const PER_CONTACT_TOUCH_CAP = 50;

const UNTAGGED = "untagged";

export const summary = query({
  args: {
    sinceDays: v.optional(v.number()), // window; default 90, max 365
  },
  handler: async (ctx, args) => {
    const days = Math.min(Math.max(args.sinceDays ?? 90, 1), 365);
    const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // ── Sends: outbound email touchpoints in the window ──
    const touchpointRows = await ctx.db
      .query("touchpoints")
      .withIndex("by_occurred_at", (q: any) => q.gte("occurredAt", sinceIso))
      .take(SEND_CAP);
    const sends = touchpointRows.filter(
      (t: any) => t.direction === "outbound" && t.kind === "email",
    );
    const sendsByContact = new Map<string, number>();
    for (const s of sends) {
      if (!s.contactId) continue;
      const k = String(s.contactId);
      sendsByContact.set(k, (sendsByContact.get(k) ?? 0) + 1);
    }

    // ── Template tags per fired touch, per contact (for attribution) ──
    // Sends-by-template counts fired cadence touches in the window (the
    // tagged subset of total sends — manual/reply sends have no template).
    const sendsByTemplate = new Map<string, number>();
    const firedByContact = new Map<
      string,
      Array<{ firedAt: string; templateKey: string }>
    >();
    // Walk each contact that received sends; per-contact cadence reads are
    // indexed (by_contact) and bounded.
    for (const contactKey of sendsByContact.keys()) {
      const rows = await ctx.db
        .query("cadences")
        .withIndex("by_contact", (q: any) => q.eq("contactId", contactKey as any))
        .take(PER_CONTACT_TOUCH_CAP);
      const fired = [];
      for (const row of rows) {
        if (!row.lastFiredAt || row.lastFiredAt < sinceIso) continue;
        const key: string =
          row.preDraftedTouch?.dynamicVars?.templateKey ?? UNTAGGED;
        sendsByTemplate.set(key, (sendsByTemplate.get(key) ?? 0) + 1);
        fired.push({ firedAt: row.lastFiredAt, templateKey: key });
      }
      fired.sort((a, b) => (a.firedAt < b.firedAt ? -1 : 1));
      if (fired.length) firedByContact.set(contactKey, fired);
    }

    // ── Replies: COHORT-SCOPED, per-contact reads ──
    // Two hard-won rules baked in here:
    //  1. COHORT DISCIPLINE — response-rate math counts ONLY replies from
    //     contacts we actually emailed inside the window. The inbox also
    //     ingests newsletters, unmatched senders and replies to long-ago
    //     sends; counting those produced a 2700% "response rate" on the
    //     first live run. (Total inbox volume lives on the triage queue,
    //     not here.)
    //  2. PER-CONTACT READS — reply rows carry full email bodies, so a
    //     global windowed scan blows the 16MB read limit on a busy inbox.
    //     Reading via by_contact for emailed contacts only means bytes
    //     scale with actual cohort replies (usually tens), not inbox size.
    const cohortReplies: Array<{
      contactId: string;
      receivedAt: string;
      classifiedIntent?: string;
    }> = [];
    let cohortOutOfOffice = 0;
    for (const contactKey of sendsByContact.keys()) {
      const rows = await ctx.db
        .query("replyEvents")
        .withIndex("by_contact", (q: any) => q.eq("contactId", contactKey as any))
        .order("desc")
        .take(12);
      for (const r of rows) {
        if (r.receivedAt < sinceIso) continue;
        if (r.classifiedIntent === "out_of_office") {
          cohortOutOfOffice++;
          continue;
        }
        cohortReplies.push({
          contactId: contactKey,
          receivedAt: r.receivedAt,
          classifiedIntent: r.classifiedIntent,
        });
      }
    }
    cohortReplies.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));

    const repliesByTemplate = new Map<string, number>();
    const repliedContacts = new Set<string>();
    const touchesBeforeReply: number[] = [];
    for (const r of cohortReplies) {
      const k = String(r.contactId);
      // Attribute to the latest fired touch at/before the reply.
      const fired = firedByContact.get(k) ?? [];
      let attributed = UNTAGGED;
      for (const f of fired) {
        if (f.firedAt <= r.receivedAt) attributed = f.templateKey;
        else break;
      }
      repliesByTemplate.set(
        attributed,
        (repliesByTemplate.get(attributed) ?? 0) + 1,
      );
      // Touches-to-earn-a-reply: only the FIRST substantive reply per
      // contact in the window counts, measured as sends to that contact.
      if (!repliedContacts.has(k)) {
        repliedContacts.add(k);
        touchesBeforeReply.push(sendsByContact.get(k) ?? 0);
      }
    }

    const byTemplate = [];
    const templateKeys = new Set([
      ...sendsByTemplate.keys(),
      ...repliesByTemplate.keys(),
    ]);
    for (const key of templateKeys) {
      const s = sendsByTemplate.get(key) ?? 0;
      const r = repliesByTemplate.get(key) ?? 0;
      byTemplate.push({
        templateKey: key,
        sends: s,
        replies: r,
        responseRate: s > 0 ? Math.round((r / s) * 1000) / 10 : null, // %
      });
    }
    byTemplate.sort((a, b) => b.sends - a.sends);

    const contactsTouched = sendsByContact.size;
    const meanTouches =
      touchesBeforeReply.length > 0
        ? Math.round(
            (touchesBeforeReply.reduce((a, b) => a + b, 0) /
              touchesBeforeReply.length) *
              10,
          ) / 10
        : null;

    return {
      windowDays: days,
      since: sinceIso,
      capped: {
        sends: touchpointRows.length >= SEND_CAP,
        // Cohort replies are per-contact reads (12 most recent each);
        // a hyper-active contact could exceed that — flagged as unlikely.
        replies: false,
      },
      sends: {
        total: sends.length,
        contactsTouched,
        taggedCadenceTouches: [...sendsByTemplate.values()].reduce((a, b) => a + b, 0),
      },
      replies: {
        // Cohort only: substantive replies from contacts we emailed
        // in-window. Total inbox volume is a triage-queue concern, not an
        // outreach outcome.
        fromEmailedCohort: cohortReplies.length,
        contactsReplied: repliedContacts.size,
        cohortOutOfOffice,
      },
      responseRate: {
        // Contact-level: of the people we emailed in the window, what share
        // sent back a substantive reply. The honest headline number.
        contactLevel:
          contactsTouched > 0
            ? Math.round((repliedContacts.size / contactsTouched) * 1000) / 10
            : null,
        // Send-level: cohort replies per send. Crude but comparable across
        // windows.
        sendLevel:
          sends.length > 0
            ? Math.round((cohortReplies.length / sends.length) * 1000) / 10
            : null,
      },
      // The operator's priority number: among contacts who replied, how many
      // touches (sends to them in the window) it took on average.
      touchesPerEarnedReply: meanTouches,
      byTemplate,
    };
  },
});
