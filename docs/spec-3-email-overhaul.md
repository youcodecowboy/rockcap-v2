# Spec 3 — Email System Overhaul (send · receive · associate · monitor · atomize)

**Status:** Draft for build session (recon-grounded 2026-07-07; builder expands)
**Owner:** RockCap
**Depends on:** existing Gmail integration, replyEvents pipeline, approvals gate, contacts model
**Coordinates with:** [Spec 2 — Knowledge Layer](./spec-2-knowledge-layer.md) §14c (email→atom lane rides THIS spec's unified ingest)
**Recon:** full current-state map with file:line evidence lives in the 2026-07-07 session recon (summarized in §2; verify lines before editing — they drift).

---

## 1. Verdict on transport: KEEP GMAIL. Do not move to Resend/ESP.

Cold-outreach deliverability is sender-reputation dominated. A real Google Workspace mailbox on an established domain sending low-volume 1:1 plain-text mail is the strongest deliverability profile that exists. ESP APIs (Resend/SendGrid/SES) are transactional/marketing infrastructure: marketing fingerprints, return-path domains, IP warm-up — spam filters treat them with MORE suspicion for cold 1:1 mail, not less. Replies threading into a real mailbox humans also read is the safety net. **None of the reported failures are transport failures** (see §2) — they would all follow to any provider. Narrow future exception: system/transactional notifications (non-prospect) may use an ESP; outreach never.

---

## 2. Current state — verified failure modes (each is a work item)

| # | Symptom | Root cause | Evidence |
|---|---|---|---|
| F1 | Approved fresh-outreach emails never send, show "executed" | `draftPayload.kind: "email_fresh"` (outreach.draftFreshEmail, mcp.ts ~1620) has NO executor: `executeApproval`'s client_communication branch only sends `kind === "email_reply"`, else silently stubs + marks executed | approvals.ts ~628-643 |
| F2 | Nothing sends at all (current live state) | Only ONE mailbox connected (rayns@rockcap.uk) and its per-user `sendEnabled` is OFF (global switch ON). Execute-time re-check fails every send | gmailTokens.ts 44-45; live isUserSendReady = user_send_disabled |
| F3 | Replies arrive "via HubSpot", unformatted, duplicated | Race: HubSpot's notes_last_updated webhook fires < the 5-min Gmail poll; a CONTENT-LESS replyEvent (`replyBody: undefined`) is created first, escapes classification (intent unknown, confidence 0), fires an operator_review approval + bell; the real Gmail twin lands minutes later as a SECOND row. Dedup only suppresses HubSpot-after-Gmail, never Gmail-after-HubSpot merge | replyEventProcessor.ts ~347-363, ~229-231; RepliesTab.tsx ~344 ("Body not captured — HubSpot sweep") |
| F4 | Replies mis-associated / silently lost | contacts.email is a SINGLE string; no write-time normalization (only a read-time lowercase fallback); no alias/assistant addresses; no domain→company fallback; duplicate contact rows never merged; `no_contact_match` rows are recorded but surfaced NOWHERE | contacts.ts ~309-345 (resolver), schema.ts ~569-629 |
| F5 | Triage badge broken in production | `replyEvents.countUnrouted` does `.collect()` over operator_review rows → exceeds Convex 16MB read limit live. Backlog re-accumulated (precedent: 227 stale approvals bulk-rejected 2026-06-06) | replyEvents.ts; migrations.ts 1-46 |
| F6 | Approvals never expire | `"expired"` status + `expiresAt` field exist; zero code sets/enforces them | approvals.ts ~94 |
| F7 | Cadence follow-ups never thread | cadenceDispatcher + draftFreshEmail never set threadId/In-Reply-To (only draftReply threads); every touch is a new top-level conversation | gmailSend.ts composeRfc822; mcp.ts draftReply ~1791-1806 |
| F8 | Global send switch untogglable in-app | updateSendConfig mutation has zero UI callers; settings page renders it read-only | settings/gmail page ~320 |
| F9 | Team can't send | No multi-mailbox story beyond "each user connects" — only one ever connected; approvals requestedBy others fail "Gmail token not found" | gmailSend.ts ~485 |
| F10 | Cadence auto-approve sends stale content | Package approval pre-approves ALL future touches (autoApprove); only kill-switches re-checked at fire time, never content freshness | cadenceDispatcher.ts ~190-196 |
| F11 | Failure states invisible | execution_failed approvals need a manual Retry click; errors live on the row only; no funnel/failure surface | approvals.ts ~457-482 |
| F12 | Manual pastes masquerade as HubSpot | ingestManualInternal writes source "hubspot_sync" | replyEventProcessor.ts ~265 |

Also verified working & keep: RFC822 composer (threading-capable, attachments, HUBSPOT_LOG_BCC), the 5-min poller + watermark, the resolver's direct-then-company-bridge logic, intent classifier + dispatch table, reply→cadence-cancel, /inbox UI (gmail-only by design), kill-switch double-check pattern.

---

## 3. The overhaul — five workstreams (build in this order)

### W0 — Same-day fixes (hours, do first)
1. Flip per-user `sendEnabled` ON for rayns@rockcap.uk (operator, /settings/gmail) — unblocks all sending today.
2. **Wire the `email_fresh` executor** (F1): add the case beside email_reply in executeApproval's client_communication dispatch → performApprovedSend. Audit past "executed" email_fresh approvals; surface a list for optional re-send.
3. Global-switch toggle UI on /settings/gmail (F8, mutation exists).
4. Fix `countUnrouted` (F5): maintain a counter or use a paginated/limited count.
5. Approval expiry sweep (F6): nightly cron marks pending approvals past `expiresAt` (default 14d) as expired; triage surfaces count.

### W1 — One reply feed (F3, F12)
Principle: **Gmail is the reply CONTENT feed; HubSpot is a CRM mirror, never an operator-facing reply.**
- HubSpot-sourced INCOMING_EMAIL events no longer create operator-facing replyEvents: hold as shadow rows (or activities-only) for ≤30 min awaiting the Gmail twin; on twin arrival, merge (attach hubspot engagement id as enrichment). Only if NO Gmail twin appears (mail to an unconnected mailbox) does it surface — flagged "content unavailable — connect mailbox X", with the mailbox identified.
- Kill the contentless operator_review approvals + bell from the sweep path entirely.
- `source: "manual"` for ingestManualInternal (new enum literal; migrate existing via ingestedManuallyAt presence).
- Formatting: replace regex stripHtml with a proper HTML→text pass (quoted-reply trimming: strip "On ... wrote:" tails for the text view; keep full HTML for the sandboxed view).

### W2 — Contact identity (F4)
- **Normalize at write** (lowercase+trim) in contacts.create/update, HubSpot sync, Apollo — plus one-off backfill migration of existing rows.
- **Alias support**: `contactEmails` table {contactId, email (normalized), source, addedAt, isPrimary} OR array field — builder decides (table indexes better: by_email global lookup). Resolver checks primary + aliases.
- **Capture-on-reply**: when a reply matches NO contact but its domain matches a company/client with exactly one plausible contact-set, surface a one-click "link this address to <contact>" triage action (never auto-link silently); linking writes an alias.
- **Domain fallback**: no address match → match sending domain against clients/companies (companiesHouse websites, client domains) → route to that client scope as `domain_matched` (classified, flagged for confirmation) instead of `no_contact_match` oblivion.
- **Surface the dead-letter queue**: no_contact_match + unlinked_no_review rows get a triage tab w/ one-click link/dismiss.
- Merge tool: `contact.merge` MCP tool + UI action (re-points replyEvents/touchpoints/cadences/atoms — coordinate with knowledge-layer atom re-pointing).

### W3 — Send robustness (F7, F9, F10, F11)
- **Thread cadence follow-ups**: store gmailThreadId/messageId per sent touch (touchpoints already exist); subsequent touches in the same cadence set In-Reply-To/References + threadId.
- **Multi-mailbox**: connect each operator's mailbox (flow exists); sender resolution = requestedBy's token; add a "send-as" fallback rule (route to a connected default sender when requester has no token) — decide policy with operator.
- **Staleness gate on auto-approved touches** (F10): at fire time, if the touch was drafted > N days ago OR a reply/materially-new intel arrived since package approval → downgrade to pending for re-review instead of auto-send.
- **Funnel/failure surface**: an Outreach Health panel — drafted→pending→approved→sent→failed→replied counts, execution_failed list w/ one-click retry, dead-letter counts, per-mailbox connection/kill-switch state.

### W4 — Email→atoms (Spec 2 §14c — build LAST, on the unified feed)
- Hook: after W1's merge point, post-classification, knowledge-enabled clients only. sourceType `email`, tier 0–1, externalRef = replyEvent id.
- Gate (tightest in the system): commitments, figures, stated facts, appetite ONLY — never sentiment/logistics; most emails yield zero atoms by design.
- Provenance-gated citation rules already in outreach-draft apply downstream.
- Sample-review before wide enablement: run on ~50 historical replies, operator reviews the atom yield, then enable.

---

## 4. Success criteria
- An approved fresh-outreach email SENDS (F1) and the operator can see send state truthfully end-to-end.
- One inbound reply = exactly ONE operator-facing artifact, with body, correctly classified, associated to the right contact+client — including replies from new aliases (via domain fallback + one-click link).
- Zero contentless "via HubSpot" reply rows.
- Triage badge accurate; pending approvals expire; failures visible with retry.
- Cadence follow-ups thread; every operator can send from their own mailbox.
- Email-derived atoms appear for knowledge-enabled clients with email-tier provenance, superseded naturally by documentary tiers.

## 5. Non-goals
- No transport migration (§1). No marketing-automation features. No auto-linking of unknown addresses without operator confirmation. No email content editing in-app beyond existing draft flows.
