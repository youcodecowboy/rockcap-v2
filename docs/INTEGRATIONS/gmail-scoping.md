# Gmail Integration: Scoping

- **Backlog item**: BL-4.0
- **Status**: Scoping draft, awaiting confirmation on scope and a few specifics
- **Related**: Google Calendar integration (existing, separate OAuth client per BL-4.1)

## Why Gmail and why now

The brief lists Gmail as an integration. The audit found Google Calendar wired but no Gmail-specific code. The skills layer needs two things from Gmail:

1. **Send**: outbound email composition for cadence-driven outreach (prospect first-touch, follow-ups, IC chasers, monitoring asks) approval-gated by default.
2. **Read**: inbound email capture for cadence state transitions ("reply received, advance prospect to qualified") and for unified touchpoint history.

Both are foundational. Send-only is not enough because reply handling drives state machines. Read-only is not enough because cadence skills are useless if they cannot fire outreach.

## Confirmed decisions (from earlier conversation)

- Separate OAuth client from Calendar (BL-4.1). Two consent screens for users but cleaner permission scoping and disconnect.
- Approval-gated send by default (BL-4.4). Hard rule: every Gmail send originating from a skill routes through the `Approval` table (BL-1.9). Direct user-initiated sends from a web UI compose box can bypass approval if the user is the sender; skills cannot.
- Touchpoint capture (BL-4.9). Inbound and outbound emails write to a unified `Touchpoint` table, not to the HubSpot-shaped `activities` table.

## Confirmed decisions

1. **Scope choice**: `send + modify`. Specifically `https://www.googleapis.com/auth/gmail.send` plus `https://www.googleapis.com/auth/gmail.modify`. Modify is broader than readonly; it lets us mark messages read, apply labels, archive, and move between mailboxes. The consent screen will warn users about these capabilities; user-facing copy in the connect flow should explain why we need them (label sent skills emails, mark replies as processed, archive after touchpoint capture).
2. **Inbox filtering**: sync all inbound. No contact-based filtering at sync time. Everything inbound enters the Touchpoint capture layer; contact resolution happens after the fact. This gives skills a richer base of context and surfaces new prospects automatically.
3. **Reply threading**: thread-based attribution. If the original outbound was tied to a project, the reply inherits the project link. Otherwise, the reply records as a touchpoint against the contact alone. This was already the recommended approach in the initial scoping and is confirmed.
4. **Send-from identity**: per-user Gmail address. Emails go out from the connected user's own Gmail. No shared `outreach@rockcap.co.uk` for v1. Authentic relationship-building outreach over administrative convenience.
5. **Calendar token coexistence**: separate. Disconnecting Gmail does not disconnect Calendar and vice versa. Per the earlier BL-4.1 decision, separate OAuth clients with separate tokens tables (`googleGmailTokens` vs `googleCalendarTokens`).

## Proposed shape

### Schema additions

```typescript
googleGmailTokens: defineTable({
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.string(),
  expiresAt: v.number(),
  scope: v.string(),
  connectedEmail: v.string(),
  needsReconnect: v.boolean(),
  lastSyncAt: v.optional(v.number()),
  historyId: v.optional(v.string()), // Gmail's incremental sync watermark
  createdAt: v.number(),
}).index("by_user", ["userId"]),
```

Note: `googleCalendarTokens` already exists with similar shape. We do not extend it; we keep tokens table-per-integration so disconnect semantics stay clean (decision BL-4.1).

### Touchpoint table (BL-4.9, may land first)

Provider-agnostic ledger. Schema sketched in `docs/INTEGRATION_PATTERNS.md` under "Touchpoint capture pattern". Gmail integration writes to it with `provider: "gmail"`.

### Routes

- `POST /api/gmail/auth` (initiates OAuth)
- `GET /api/gmail/callback` (OAuth callback)
- `POST /api/gmail/disconnect`
- `POST /api/gmail/webhook` (Pub/Sub push notifications)
- `POST /api/gmail/sync` (manual or cron-triggered)
- Tool/MCP exposed: `gmail.send`, `gmail.searchMessages`, `gmail.getMessage`, `gmail.markRead` (if modify scope chosen)

### Cron

`gmail-auto-sync` every 5-10 minutes. Tighter than the 30min calendar cadence because email replies drive cadence state transitions; latency matters.

### Webhook (Google Pub/Sub)

Gmail does not push directly; it publishes to a Google Cloud Pub/Sub topic, which then pushes to our webhook URL. Setup:

1. Create Pub/Sub topic in Google Cloud.
2. Grant Gmail service account publish permission.
3. Subscribe Gmail to push to the topic via `gmail.watch()`.
4. Configure Pub/Sub to push to `/api/gmail/webhook` with signature verification.
5. Renew the watch every 7 days (Gmail watches expire).

The renewal step needs a cron (`gmail-watch-renewal`, daily check, renew within 24h of expiry). Same pattern as Google Calendar push channel renewal.

### Approval-gated send flow

When a skill calls `gmail.send`:

1. The MCP-exposed tool wrapper does NOT call Gmail directly.
2. It creates an `Approval` row with `entityType: "gmail_send"`, the draft payload, the requesting skill identity, and status `pending`.
3. The approver (the RockCap user who owns the deal context or, by default, the operator who initiated the chat session) sees the draft in the approval queue (web + mobile).
4. On approval, a Convex internal action picks up the row, calls Gmail send for real, updates the row with the resulting message ID.
5. On rejection, the row is marked rejected with reason; the skill is notified through the chat assistant's response stream.

Users sending email manually (from a Gmail compose UI in the app, not from a skill) bypass approval. The boundary is "did a skill originate this draft?", which is signalled by the caller identity on the MCP request.

### Kill switch

Per-user `googleGmailTokens.needsReconnect` plus a global `gmailSendEnabled` flag in a settings table. Default: send disabled, read enabled (after first connection). Operator explicitly enables send per user.

This is stricter than Fireflies because outbound email has higher consequence. A bug that sends 1000 prospect emails because of a cadence misfire is much worse than a bug that reads transcripts twice.

### Inbound scope (all-inbound implication)

Per confirmed-decision 2, all inbound mail is synced; we do not filter to known contacts. This means:

- New prospects (people who reply to outreach but were not yet in the system) surface automatically.
- Personal email content (non-work-related) also enters the touchpoint layer. RockCap operators should connect a work-only Gmail account, not a personal one. Surface this clearly in the connect flow.
- The Touchpoint table will be larger than the contact-filtered alternative. Index plan: by `personEmail` (resolved string), by `dealId` (when threaded), by `occurredAt` (for time-range queries). The volume is the price of richer context.
- Skills that query touchpoints filter at read time, not sync time.

## Risks

- **Consent screen friction**: separate Gmail OAuth client means every existing Calendar-connected user has to re-consent for Gmail. Surface this in the UI clearly.
- **Pub/Sub setup overhead**: Gmail's webhook story is more involved than Calendar's push channels. Plan for a half-day spike on Pub/Sub plumbing.
- **Send blast radius**: the approval-gated default is the firewall. The risk is a bug that bypasses approval (e.g., a code path that calls the Gmail API directly instead of through the wrapper). Mitigate with an integration test that asserts every code path that imports the Gmail send function does so through the approval wrapper, never directly.
- **Inbound noise**: full inbox sync is a lot of data. Filtering at the sync level (only emails involving RockCap contacts, deals, or projects) keeps the touchpoint table useful and reduces storage.
- **Reply attribution**: deciding which deal a reply belongs to is ambiguous when a contact has multiple active deals. Heuristic: thread-based attribution (if the original outbound was on a specific deal, the reply inherits), fall back to most-recent-active-deal-with-this-person.

## Migration plan

Gmail is net-new; there is no existing implementation to migrate from. The phases are:

1. BL-4.1 OAuth client setup, scope decision confirmed.
2. BL-4.2 + BL-4.4 send action wired with approval gate.
3. BL-4.3 read sync with watermarked incremental fetch.
4. BL-4.5 + BL-4.6 Pub/Sub webhook plus cron fallback.
5. BL-4.7 settings UI.
6. BL-4.9 touchpoint integration (this may land first if the Touchpoint table is ready before Gmail; the order is flexible).

Cadence skills (BL-6.4) cannot ship before the send flow is approval-gated end-to-end. That dependency is what makes Gmail block more of the backlog than Fireflies.

## What we are not doing in v1

- Bidirectional sync of Gmail labels. Read-only labels are enough for v1.
- Gmail-driven cadence triggering ("user marked an email read"). Cadence state transitions trigger on reply received, not on read receipt.
- Server-side rules that auto-archive or auto-respond. Approval-gated send means there are no automatic responses without human review.
- Drafts in Gmail. Approval-pending drafts live in the `Approval` table, not as Gmail drafts. Once approved, they go straight to send, not via Gmail's draft mailbox.
