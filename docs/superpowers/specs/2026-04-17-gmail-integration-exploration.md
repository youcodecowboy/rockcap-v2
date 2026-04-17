# Gmail Integration Exploration — Tagging Inbound Emails to HubSpot Contacts

**Status:** Exploration / research notes. Not an implementation plan.
**Date:** 2026-04-17
**Origin:** Logbook task `queued/2026-04-17_exploration-gmail-integration.md`

## The opportunity

HubSpot sync has given us ~4,275 contacts + ~2,654 companies, with ~46
already bound to Rockcap clients via `promotedToClientId`. Inbound email
is the dominant signal CRM users currently pay HubSpot to track — and
every email we see in a team inbox could answer:

- *"Who is talking to us, and which client/company is that?"*
- *"What's the state of each deal based on recent back-and-forth?"*
- *"Which client profile should this email attach to?"*

A Gmail integration closes the loop between the email stream and the
client profile, making the profile an actual 360° view of the relationship.

## What we already have that helps

- `contacts.email` — populated for ~all HubSpot contacts with an email.
  A straight lookup `email → contact` is O(1) via an index.
- `contacts.linkedCompanyIds` → `company.promotedToClientId` → `clients._id`.
  Two hops from email to client resolution.
- `activities` table — already supports `activityType: 'EMAIL' | 'INCOMING_EMAIL'`
  with `direction`, `fromEmail`, `toEmails`, `subject`, `bodyPreview`, `bodyHtml`,
  `ownerName`. The schema is Gmail-shaped already.
- `activities.companyId` + `activities.dealId` + `linkedContactIds/DealIds`
  — everything you need to attach an email to a client profile via already-
  existing queries (`listForClient`, `listRecentGlobal`, etc.).

## Implementation shapes to consider

### Shape A — Google API pull (via Cloud Function or scheduled Convex action)

- OAuth the user's Gmail via Google OAuth 2.0.
- Periodically (every 5–10 min) call `users.messages.list` with `q=newer_than:15m`
  and fetch message metadata + bodies via `users.messages.get`.
- For each message: look up all `From`/`To`/`Cc` addresses in `contacts.email`.
  If any hit, write a new row into the existing `activities` table with
  `activityType: 'EMAIL'`/`INCOMING_EMAIL`, `direction: 'inbound'`/`outbound`,
  `fromEmail`, `toEmails`, `subject`, `bodyPreview`, `bodyHtml`, owner info.
- Populate `companyId` by looking up `contact.linkedCompanyIds[0]`.
- Optionally kick a notification when the email hits a flagged deal stage.

**Pros:** stable, controllable, no HubSpot hop. Same schema we already use.
**Cons:** OAuth plumbing; Gmail API rate limits (~250 quota units / sec).
Risk of missing emails if the puller lags.

### Shape B — Gmail push notifications (Pub/Sub → webhook)

- Use Gmail API's `users.watch` to subscribe the inbox to a Google Cloud
  Pub/Sub topic.
- Pub/Sub pushes a notification to a Convex HTTP action when new mail arrives.
- Same attach-to-activity pipeline as Shape A.

**Pros:** real-time (typically <30s latency); no polling cost.
**Cons:** OAuth + Pub/Sub setup is heavier; watch subscriptions expire every
7 days and need re-subscription (cron job).

### Shape C — Ride on HubSpot's existing email sync

- HubSpot already syncs emails into engagements (we see this today in the
  `activities` table from the v1 engagements fetch).
- Instead of building new Gmail plumbing, tighten the incremental sync
  cadence (maybe switch the activities fetcher to also use search-by-
  modified-date) and trust HubSpot to be our email backbone.
- Add UI affordances that make inbound emails first-class: Gmail-style
  thread view on the client profile, reply-within-app via HubSpot API.

**Pros:** zero new infra. Uses existing sync.
**Cons:** HubSpot sync latency (whatever interval we run it at); depends on
users logging emails to HubSpot (which requires BCCing a magic address OR
installing the HubSpot Chrome plugin). Many users don't.

## Recommended incremental path

Split into three increments the team can ship independently:

1. **Read-side parity** (1–2 days). Improve the existing HubSpot engagements
   sync to pick up new emails faster (already landed as the `sinceISO`
   incremental work — just tune cadence). Add a rich thread view on the
   client profile grouping sequential emails by `fromEmail + subject` so
   they read like Gmail.

2. **Gmail connection (Shape A)** (3–5 days). Add a per-user OAuth flow,
   store the token encrypted in Convex, run a 5-min scheduled action that
   pulls new mail and writes into `activities`. This closes the "users who
   don't log to HubSpot" gap.

3. **Two-way (real-time + send)** (2+ weeks). Shape B push notifications +
   "send email from client profile" UX. Needs thoughtful inbox-zero UX,
   which is its own design problem.

## Open questions for the next design pass

- **Which inbox?** Per-user personal Gmail? Shared team inbox? Both?
- **Which direction matters most?** Users have flagged "inbound" as the
  primary value — tagging incoming from unknown senders to prospects, etc.
- **Dedupe with HubSpot's sync.** If a user has BOTH the HubSpot Chrome
  plugin AND our Gmail pull, we'll get duplicate `activities` rows. Need
  an idempotent-by-`gmailMessageId` check at write time.
- **Storage + compliance.** Are we OK storing email bodies at rest? Convex
  encryption + retention settings need a call.
- **Attachment handling.** Ignore at first (just reference); link to Drive?
  Extract into `documents`? Separate task.
- **Signature / reply stripping.** Beyond MVP but important for clean
  previews and future AI extractions.

## Next concrete step

Spike on **Shape A, read-only, for a single user (Kristian)**:
- Manual OAuth token (pasted into `.env.local`).
- Convex action that pulls last 24h of messages.
- Writes into `activities` with `activityType: 'EMAIL'`/`INCOMING_EMAIL`.
- Dedup against `hubspotActivityId` pattern: use `gmailMessageId` as a
  new optional field, unique-indexed.

Once that proves the pipeline works end-to-end, widen to OAuth flow + all
users + Pub/Sub.

## References

- Gmail API: https://developers.google.com/gmail/api
- Convex scheduled actions: https://docs.convex.dev/scheduling/scheduled-functions
- HubSpot email logging BCC address: `<user>@bcc.hubspot.com`
- Existing activity schema: `model-testing-app/convex/schema.ts` — `activities`
  table already supports everything we'd need.
