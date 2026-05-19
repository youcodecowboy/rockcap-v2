# Integrations Inventory

Eight integrations are referenced in the brief or visible in the code. Five are live, one is passive (read-through, no direct API), two are stubs or unused.

## Summary table

| Integration | Status | Direction | Trigger | Convex tables touched |
|---|---|---|---|---|
| HubSpot | Active | Bidirectional (read-heavy) | Webhook + 6h cron + manual | companies, contacts, deals, activities, hubspotSyncConfig, webhookEventLog |
| Google Calendar | Active | Read-only | Webhook + 30min cron + manual | googleCalendarTokens, googleCalendarChannels, googleCalendarSyncLog, events |
| Companies House | Active | Read-only | On-demand | companiesHouseCompanies, companiesHouseCharges, companiesHouseOfficers, companiesHousePSC, companyRelationships |
| Fireflies | Active (passive detector) | Read-only | Piggybacks HubSpot activity sync | activities, meetings |
| Anthropic Claude | Active | One-way (calls out) | On-demand | documents, knowledgeItems, notes, intelligence singletons |
| Beauhurst | Passive (display only) | Read-through via HubSpot | n/a | companies (metadata fields) |
| HM Land & Property Data | Stub | Read-only (planned) | n/a | propertyTitles, companyPropertyLinks (unwired) |
| Together AI / OpenAI | Legacy/partial | One-way (calls out) | On-demand (V3 pipeline) | documents, knowledgeItems via V3 routes |

## 1. HubSpot

**Wiring location.** `convex/hubspotSync/*.ts` (14 files), `convex/hubspotSync.ts` (re-export), `src/lib/hubspot/*.ts` (client library, normalisation, webhook verification, dedupe), API routes under `src/app/api/hubspot/` (webhook, webhook-process, sync-all, sync-companies, sync-contacts, sync-deals, sync-leads, sync-pipelines, recurring-sync, explore-leads, test-single-import, fix-data, fireflies-backfill).

**Direction.** Bidirectional but read-heavy. Reads company, contact, deal, activity, and pipeline data from HubSpot. Writes back linked IDs (via `hubspotSync/linking.ts`), archive timestamps, sync state.

**Invocation entry points.**

- Webhook-driven. POSTs from HubSpot land at `/api/hubspot/webhook`, signature-verified, dedup'd by eventId, enqueued via `enqueueWebhookEvent` mutation, processed by `processWebhookEvent` internalAction which calls back to `/api/hubspot/webhook-process` (the Convex-to-Next.js bridge).
- Cron-driven. `hubspot-recurring-sync` every 6h calls `runRecurringSync` internalAction. It runs four sequential phases (companies → contacts → deals → activities), each POSTing to `/api/hubspot/sync-all`. Each phase is its own 300s Vercel function to avoid HubSpot rate-limit timeouts on busy portals.
- Manual. Settings UI calls `updateSyncConfig` mutation. On-demand routes for individual phases: `sync-companies`, `sync-contacts`, `sync-deals`, `sync-leads`, `sync-pipelines`.

**Credential handling.**

- `HUBSPOT_API_KEY`: private app access token, in env.
- `HUBSPOT_PORTAL_ID`: optional, discoverable from `/integrations/v1/me`.
- `HUBSPOT_WEBHOOK_SECRET`: HMAC-SHA256 key for v3 signature verification.
- `HUBSPOT_WEBHOOK_TARGET_URI`: registered webhook URL.
- SDK: `@hubspot/api-client` v13.4.0.

**Sync model.** Webhook for real-time (property changes, object updates, deletions); cron for catch-up and missed events; on-demand routes for manual invocation. Incremental window driven by `hubspotSyncConfig.lastSyncAt`, updated when the activities phase completes (so a mid-cycle failure does not advance the watermark).

**Entities synced.**

- Writes to: `companies`, `contacts`, `deals`, `activities`, `webhookEventLog`, `hubspotSyncConfig`, `hubspotPipelines`.
- Reads from (for linking): `companies`, `contacts`, `deals` via `by_hubspot_id` indexes.
- Metadata storage: `companies.metadata` carries Beauhurst-prefixed custom property fields (see Beauhurst section) and other HubSpot custom properties.

**Notable quirks.**

- Two webhook formats: legacy (`subscriptionType` prefix like `deal.propertyChange`) and new platform (explicit `objectTypeId`). The code normalises both.
- Bridge pattern. Convex actions cannot import `src/` code due to bundler scope conflict. Webhook and sync logic split: Convex enqueues + dispatches, Next.js routes handle the actual HubSpot API calls.
- Rate limit handling. HubSpot allows 600 requests per 5min. Per-company engagement walks can choke; phased approach helps but does not eliminate.
- Archival handling. Deleted HubSpot objects are marked with `archivedAt` on next sync, not hard-deleted from Convex.
- The brief states "full read/write permissions". Actual writes back are thin (linked IDs, archive timestamps, sync state). Closer to "read-heavy with thin write-back".

## 2. Google Calendar

**Wiring location.** `convex/googleCalendar.ts` (23 exports: OAuth tokens, channel management), `convex/googleCalendarSync.ts` (sync runner), `convex/googleCalendarLog.ts` (sync log + prune), `src/lib/google/oauth.ts` and `src/lib/google/calendar.ts` (native fetch-based clients), `src/app/api/google/` (auth, callback, webhook, setup-sync, disconnect, events).

**Direction.** Read-only. RockCap reads Google Calendar events for connected users; writes local sync state.

**Invocation entry points.**

- OAuth flow: `/api/google/auth` → user redirects to Google → `/api/google/callback` (token exchange).
- Cron-driven: `google-calendar-auto-sync` every 30min calls `autoSyncAll`, which iterates connected users and runs `syncForUser` per user.
- Webhook-driven: Google push channels POST to `/api/google/webhook` on event changes.
- Manual disconnect: `/api/google/disconnect` revokes the token and clears local state.
- Setup/events: `/api/google/setup-sync`, `/api/google/events`.

**Credential handling.**

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` (env).
- Per-user tokens in `googleCalendarTokens` table (accessToken, refreshToken, expiresAt, scope).
- Auto-refresh within 5min of expiry. On `invalid_grant` the user's row is flagged `needsReconnect`.
- No `googleapis` SDK; uses native `fetch` and `URLSearchParams`. Scopes: calendar.events, calendar.events.readonly, userinfo.email.

**Sync model.** Incremental with `syncToken`. Falls back to 30-day window if syncToken invalid (HTTP 410). Push channels renewed within 24h of expiration to avoid silent delivery lapse. Cron is the fallback for webhook reliability.

**Entities synced.** Writes to `googleCalendarTokens`, `googleCalendarChannels`, `googleCalendarSyncLog`, and `events` (with `syncStatus` discriminator and `googleEventId` foreign key).

**Notable quirks.**

- `connectedEmail` stored on the token row for UX.
- Cancelled Google events arrive as `status="cancelled"`, marked locally as deleted.
- Attendees array parsed for email, name, responseStatus.
- Silent-lapse hazard: if both cron and webhook fail simultaneously, events can drift; the cron is the safety net.

## 3. Companies House

**Wiring location.** `convex/companiesHouse.ts` (19 exports: companies/charges/officers/PSC CRUD, search), `src/lib/companiesHouse/client.ts` (HTTP client with rate limiting), API routes under `src/app/api/companies-house/` (test-auth, test-simple, search-companies, sync-companies, get-company-charges).

**Direction.** Read-only.

**Invocation entry points.**

- Manual search via desktop UI → `/api/companies-house/search-companies`.
- Manual sync of a selected company → `/api/companies-house/sync-companies`.
- Charges fetch → `/api/companies-house/get-company-charges`.
- Test routes for debug.

**Credential handling.** `COMPANIES_HOUSE_API_KEY` in env. HTTP Basic auth (key as username, empty password). Base URL `https://api.company-information.service.gov.uk`.

**Sync model.** On-demand only. No cron, no webhook. Rate limit: 600 requests per 5min. Client-side throttling: delays at 500+ requests, longer delays at 580+, exponential backoff on 429 (up to 3 retries, max 30s wait).

**Entities synced.** Writes to `companiesHouseCompanies`, `companiesHouseCharges`, `companiesHouseOfficers`, `companiesHousePSC`, `companyRelationships`.

**Notable quirks.**

- Address normalisation: addresses hashed after lowercasing, removing punctuation, normalising whitespace, for cross-company link matching (shared address relationships).
- SIC codes stored as array, filtered client-side because Convex array indexes are limited.
- No watermark or incremental sync.
- Filing links to Companies House documents are stored on charge records.

## 4. Fireflies

**Wiring location.** `src/lib/hubspot/fireflies.ts` (detection and parser), `src/lib/hubspot/activities.ts` (calls the detector during activity sync), `convex/hubspotSync/migrations.ts` (backfill action), `src/app/api/hubspot/fireflies-backfill/route.ts` (bridge), `convex/meetings.ts` (surfaces Fireflies activities as meetings).

**Direction.** Read-only. RockCap does **not** call the Fireflies API. Fireflies transcripts arrive in HubSpot as note bodies (via HubSpot's own Fireflies integration). RockCap detects them by content pattern.

**Invocation entry points.**

- Automatic during HubSpot activity sync. Each activity body is checked by `isFirefliesTranscript()`. If matched, parsed and stored with `sourceIntegration: 'fireflies'`.
- Backfill migration: `runFirefliesBackfill` internalAction (one-off catch-up for activities synced before detection existed).

**Credential handling.** None. Detection is content-based.

**Sync model.** Piggybacks HubSpot activity sync (webhook + 6h cron).

**Entities synced.** Writes back to `activities` (sets `sourceIntegration: 'fireflies'`, extracts title, transcript URL, duration, participant emails). Surfaces in `meetings` queries with `source='fireflies'`.

**Notable quirks.**

- Two-signal detection: must match both the URL pattern `https://app.fireflies.ai/view/[A-Za-z0-9]+` AND the boilerplate phrase "Time markers in this document". Single-signal matches do not classify (guards against human notes that merely reference Fireflies).
- Fragile to Fireflies HTML template changes. If the boilerplate phrase or URL format changes, detection silently stops working.
- The brief lists Fireflies as an integration; in practice it is a content-format-recognition layer on top of HubSpot, not an integration. Treat it that way in any future refactor.

## 5. Anthropic Claude

**Wiring location.** `src/v4/lib/anthropic-client.ts` (V4 pipeline client), plus most `src/app/api/*/route.ts` files that perform AI work.

**Direction.** One-way (calls out).

**Invocation entry points.** On-demand by user actions or queue processing. Documented per-route in `05-in-app-claude-logic.md`.

**Credential handling.** `ANTHROPIC_API_KEY` in env. SDK: `@anthropic-ai/sdk` v0.39.0.

**Sync model.** Request-response. Prompt caching via `cache_control: { type: 'ephemeral', ttl: '1h' }` on system prompt blocks.

**Entities touched.** Writes (via downstream Convex mutations) to `documents`, `knowledgeItems`, `intelligenceConflicts`, `notes`, `meetings`, `chatActions`, `chatMessages`.

**Notable quirks.**

- Two-block prompt caching (stable system prompt + dynamic references) is the cost-saving lever.
- Streams responses because non-streaming requests hit a 10-min timeout that the V4 batch pipeline regularly exceeds.
- Repair logic in V4 client handles `max_tokens` truncation gracefully.

## 6. Beauhurst

**Wiring location.** Display-only in `src/app/(desktop)/clients/[clientId]/components/ClientBeauhurstCards.tsx`, `ClientHubSpotSection.tsx`, and mobile equivalent. Data lives in `companies.metadata` as `beauhurst_data_*` prefixed fields.

**Direction.** Read-through. No direct Beauhurst API integration exists.

**Invocation entry points.** None. Data arrives via HubSpot custom properties populated by an external Beauhurst ↔ HubSpot integration.

**Credential handling.** None.

**Sync model.** Passive. When HubSpot company sync runs, Beauhurst-prefixed custom properties are preserved in `metadata` and displayed on the client page.

**Fields expected in `companies.metadata`.**

- `beauhurst_data_companies_house_id`
- `beauhurst_data_linkedin_page`
- `beauhurst_data_beauhurst_url`
- `beauhurst_data_legal_form`
- `beauhurst_data_stage_of_evolution`
- `beauhurst_data_turnover`
- `beauhurst_data_ebitda`
- `beauhurst_data_headcount`
- `beauhurst_data_total_funding_received`
- `beauhurst_data_date_of_accounts`
- `beauhurst_data_growth_signals`
- `beauhurst_data_risk_signals`
- `beauhurst_data_innovation_signals`
- `beauhurst_data_environmental_signals`
- `beauhurst_data_social_governance_signals`

**Notable quirks.** Brief lists Beauhurst as an integrated source. Actually it is HubSpot-mediated and depends entirely on the upstream Beauhurst → HubSpot sync existing and being kept current. Data quality and freshness are not under RockCap's control. If direct Beauhurst integration is wanted, it would need to be built from scratch.

## 7. HM Land & Property Data API

**Wiring location.** `src/lib/landPropertyData/client.ts` (stub client). No API routes exposed.

**Direction.** Read-only (planned).

**Invocation entry points.** None currently wired. `getCorporateOwnedTitlesForCompany()` is stubbed with a TODO and returns empty array.

**Credential handling.** `LAND_PROPERTY_API_KEY` and `LAND_PROPERTY_API_RATE_LIMIT` referenced in env (defaults 60 req/min).

**Sync model.** Not implemented. The HM Land Registry datasets are delivered as CSV downloads (CCOD and OCOD), not as a queryable API. A real implementation would need to download, parse, and index those CSVs into the local database, then query the local index.

**Entities targeted.** Would write to `propertyTitles`, `companyPropertyLinks` (both already defined in schema, both currently empty in practice).

**Notable quirks.** Dataset license must be accepted before any queries work. Rate limit ceiling is low (60/min). The schema is ready; the wiring is not.

## 8. Together AI and OpenAI

**Wiring location.** `together-ai` v0.33.0 in `package.json`. Used by V3 pipeline agents (`src/lib/agents/summary-agent`, `classification-agent`, `verification-agent`, `checklist-agent` use Llama 70B via Together AI). `openai` SDK is not in dependencies but the OpenAI HTTP API is called by `src/lib/agents/critic-agent` (GPT-4o).

**Direction.** One-way.

**Invocation entry points.** V3 pipeline routes: `/api/bulk-analyze`, `/api/reanalyze-document`, `/api/analyze-file`, `/api/process-intelligence-queue`, `/api/knowledge-parse`, `/api/codify-extraction`, `/api/generate-insights`, `/api/reminders/parse`, `/api/ai-assistant`.

**Credential handling.** `TOGETHER_API_KEY`, `OPENAI_API_KEY` in env.

**Notable quirks.** These are legacy. The V4 pipeline (Anthropic-native) is the current path for new work. The V3 routes remain wired for backwards compatibility (bulk operations, queues) but are candidates for retirement once V4 covers all use cases. See `05-in-app-claude-logic.md` for the per-route V3/V4 classification.

## Third-party SDKs imported

From `model-testing-app/package.json`:

| SDK | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | 0.39.0 | Anthropic Claude |
| `@hubspot/api-client` | 13.4.0 | HubSpot CRM |
| `@clerk/nextjs` | 6.35.2 | Auth |
| `convex` | 1.29.3 | Backend |
| `convex-helpers` | 0.1.105 | Backend utilities |
| `together-ai` | 0.33.0 | Together.ai (V3 pipeline) |
| `@tiptap/*` | 3.10.6+ | Rich text editor |
| `@radix-ui/*` | 1.x | Component library |
| `@handsontable/react` | 16.1.1 | Spreadsheet UI |
| `react-big-calendar` | 1.19.4 | Calendar display |
| `mammoth` | 1.11.0 | Word doc parsing |
| `exceljs` | 4.4.0 | Excel write |
| `xlsx`, `xlsx-populate` | 0.18.5, 1.21.0 | Excel read/write |
| `pdf-parse`, `pdfjs-dist` | 1.1.1, 3.11.174 | PDF processing |
| `canvas` | 3.2.0 | Server-side canvas (PDF rendering) |
| `@hubspot/cli` | 7.9.0 (devDep) | HubSpot project deployment |

OpenAI is not in `dependencies` but is called via HTTP from `critic-agent`. Worth deciding whether to add the official SDK or retire the GPT-4o use entirely.

## Integration-related environment variables

| Variable | Service | Purpose |
|---|---|---|
| `HUBSPOT_API_KEY` | HubSpot | Private app access token |
| `HUBSPOT_PORTAL_ID` | HubSpot | Account portal ID (optional) |
| `HUBSPOT_WEBHOOK_SECRET` | HubSpot | HMAC-SHA256 webhook signature secret |
| `HUBSPOT_WEBHOOK_TARGET_URI` | HubSpot | Webhook registration URL |
| `GOOGLE_CLIENT_ID` | Google Calendar | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google Calendar | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Google Calendar | OAuth callback |
| `COMPANIES_HOUSE_API_KEY` | Companies House | API key |
| `LAND_PROPERTY_API_KEY` | Land & Property Data | API key (stub) |
| `LAND_PROPERTY_API_RATE_LIMIT` | Land & Property Data | Rate-limit threshold (default 60) |
| `ANTHROPIC_API_KEY` | Anthropic | Claude API key |
| `TOGETHER_API_KEY` | Together AI | Llama 70B (V3 pipeline) |
| `OPENAI_API_KEY` | OpenAI | GPT-4o critic (V3 pipeline) |
| `CRON_SECRET` | Convex → Next.js bridge | Shared secret for cron-triggered route calls |
| `NEXT_APP_URL` | Internal | Next.js origin for Convex-to-Next bridges |
| `NEXT_PUBLIC_APP_URL` | Client | Public app URL |
| `NEXT_PUBLIC_CONVEX_URL` | Convex | Convex deployment URL |
| `CONVEX_DEPLOY_KEY` | Convex | Convex deploy operations |
| `CONVEX_INTERNAL_SECRET` | Convex | Internal mutations/actions auth |

Plus Clerk-related env vars (`CLERK_*`, `NEXT_PUBLIC_CLERK_*`) for auth.

## Observations for the integration strategy step

1. **The bridge pattern (Convex → Next.js HTTP route) is well established and reused.** HubSpot webhook processor, HubSpot sync phases, Fireflies backfill, and likely any future scheduled-action that needs `src/lib/` code follow it. Document this pattern in the brief; any new integration will adopt it.
2. **Gmail is mentioned in the brief but not in the integrations list above.** The brief states "Gmail" as an integration. The code shows Google Calendar OAuth but **no Gmail-specific code paths**. Outbound email (`/api/hubspot/sync-leads`, prospecting emails) appears to flow through HubSpot rather than direct Gmail send. If direct Gmail send is needed (for example for cadence-driven outreach), it would be new work. Worth confirming the brief's expectation.
3. **HubSpot is currently bidirectional but write-shy.** If the brief's "v1 write-through only" model is the right intermediate step, that matches reality. If full write-through is wanted, the HubSpot write paths would need to expand (currently it writes archive timestamps, linked IDs, and sync state, not core property updates).
4. **Fireflies fragility.** The pattern-based detector is a known fragility. A direct Fireflies API integration would be more robust but is not currently wired.
5. **OAuth-based integration template exists for Google.** If future integrations need OAuth (e.g., LinkedIn, direct Beauhurst, direct Fireflies), the `googleCalendarTokens` table + auto-refresh + needsReconnect flag pattern is reusable. Worth documenting once a second OAuth integration is contemplated.
6. **Webhook log retention is 30 days.** `webhookEventLog` is pruned daily. Any compliance need beyond 30 days requires a longer retention policy or a separate archival store.
