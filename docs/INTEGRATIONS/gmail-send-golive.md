# Gmail send — go-live runbook

How to take outbound email from "wired but off" to "live and test-fired".
The send path is fully built (`convex/gmailSend.ts`); what remains is GCP
OAuth config + connecting an account + flipping the kill switches.

---

## The runtime path (no Claude Code / MCP session involved)

This is the important property: **nothing in the firing or sending path
depends on a Claude session or a user being online.** Claude/MCP is only the
*authoring* surface (skills compose the cadence + draft). Once cadence rows
exist, the rest runs server-side 24/7.

1. **`cadence-dispatcher` cron** (`convex/crons.ts`, every 5 min) — runs in the
   **Convex deployment**. Polls due cadences, and for each fires its touch by
   **staging a pending `gmail_send` approval** (`convex/cadenceDispatcher.ts`).
   It does **not** send. The cadence's `lastResult` becomes `approval_staged`.
2. **Operator approves** in the web app (`/approvals`). This is the **only**
   human step — the trust gate (authenticated, per `CLAUDE.md`: no autonomous
   external action).
3. **`approvals.approve`** patches status → `approved` and
   `scheduler.runAfter(0, executeApproval)` (Convex scheduler).
4. **`executeApproval` → `gmailSend.executeApprovedSend`** (Convex
   `internalAction`) refreshes the OAuth token, composes RFC822, and POSTs to
   `gmail.users.messages.send`. Writes an outbound `touchpoints` row. Marks the
   approval `executed`.

**Vercel** hosts the Next.js app: the approval UI, the OAuth connect/callback
routes, and the optional `/api/cadence-compose` endpoint (only used by
dynamic-compose cadences). Convex calls Vercel server-to-server for composed
touches — still no Claude session.

```
cadence cron (Convex)  ──stages──▶  gmail_send approval  ──operator approves (web)──▶
approvals.approve (Convex)  ──scheduler──▶  executeApprovedSend (Convex)  ──▶  Gmail API
```

---

## Kill switches (all default OFF — checked at queue time AND fire time)

| Switch | Field | Flip via |
|---|---|---|
| Global send | `gmailSendConfig.isEnabled` | `gmailTokens.updateSendConfig({ isEnabled: true })` |
| Per-user send | `googleGmailTokens.sendEnabled` | `gmailTokens.setMySendEnabled({ enabled: true })` (self) / `setSendEnabledForUser({ userId, enabled })` (admin) |
| Connection health | `googleGmailTokens.needsReconnect` must be `false` | set automatically on connect; cleared by reconnect |

`gmailSend.requestSend` enforces all three at **queue time**. The cadence
dispatcher bypasses `requestSend` (it calls `approvals.internalCreate`
directly), so as of the production-safety change `executeApprovedSend`
**re-checks all three at fire time too**. Net effect: flipping the global
switch off stops every send — including cadence-staged drafts — regardless of
origin. A blocked send is marked `execution_failed` (not silently dropped, not
falsely "sent").

---

## GCP / OAuth client setup

The app requests these scopes (`src/lib/gmail/oauth.ts`):

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.modify` (labels / archive / mark-read)
- `https://www.googleapis.com/auth/userinfo.email` (resolve connected address)

Steps in Google Cloud Console:

1. **OAuth consent screen** — add the three scopes above. While testing, add
   the operator(s) as **Test users** (or publish the app).
2. **Credentials → Create OAuth client ID → Web application.**
3. **Authorized redirect URI** — must match `GMAIL_OAUTH_REDIRECT_URI` exactly:
   - Production: `https://<app-domain>/api/gmail/callback`
   - Local dev: `http://localhost:3000/api/gmail/callback`
4. The connect flow uses `access_type=offline` + `prompt=consent`, so Google
   returns a **refresh token** (required — the Convex executor refreshes the
   access token at send time).

---

## Env vars

| Var | Vercel (app) | Convex (executor) | Used for |
|---|:---:|:---:|---|
| `GMAIL_CLIENT_ID` | ✅ | ✅ | OAuth exchange (app) + token refresh (Convex) |
| `GMAIL_CLIENT_SECRET` | ✅ | ✅ | same |
| `GMAIL_OAUTH_REDIRECT_URI` | ✅ | — | OAuth initiate + callback (app only) |

- Convex: `npx convex env set GMAIL_CLIENT_ID <value>` (repeat for secret).
- Vercel: project Settings → Environment Variables (or `vercel env add`).

> The client id/secret live in **both** places because the OAuth code-exchange
> happens in the Next.js app (Vercel) and the token **refresh** happens in the
> Convex action at send time. The redirect URI is only needed by the app.

---

## Connect + enable + test-fire

1. Deploy with env vars set (Vercel + Convex).
2. **Connect:** `/settings/gmail` → Connect Gmail → Google consent. A
   `googleGmailTokens` row is created (with refresh token, `connectedEmail`).
3. **Enable per-user:** `setMySendEnabled({ enabled: true })`.
4. **Enable global:** `updateSendConfig({ isEnabled: true })`.
5. **Test fire:**
   - Stage a `gmail_send` — either approve an existing cadence-staged draft, or
     call `gmailSend.requestSend(...)` with a test payload.
   - Approve it in `/approvals`.
   - Verify: the email arrives, a `touchpoints` row appears (provider `gmail`,
     direction `outbound`), and the approval status is `executed`.

---

## Rollback / kill

Flip `gmailSendConfig.isEnabled = false` (`updateSendConfig({ isEnabled: false })`).
Every subsequent approved send refuses at fire time (`execution_failed`) — no
code deploy needed. Per-user disable (`setMySendEnabled(false)`) scopes the kill
to one account.

---

## Outbound → HubSpot logging

So that sent email also lands on the client's HubSpot timeline (and the mobile
activity feed). **Pending the BCC-vs-executor decision — this section will be
filled in when that path is built.** Inbound email is already captured via the
HubSpot sync (`activities` table, keyed to client).
