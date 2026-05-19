# Environment Variables

Canonical list of every env var referenced in the codebase, grouped by sensitivity grade. Updated whenever a new var is introduced.

## Sensitivity grades

- **public**: safe in client-side bundles, safe in logs, safe in source. The `NEXT_PUBLIC_*` prefix marks these in Next.js.
- **secret**: server-side credentials. Never in logs, never in client bundles, never in git. Redacted in error messages.
- **critical**: keys that grant broad access (production database, identity provider, deployment control). Treated as secret, plus: rotated immediately on suspected exposure, access to set them is restricted to operators, all uses are logged where feasible.

If you need to add a new var, add it here in the same PR. Set the value in Vercel and Convex env configs independently; "I set it once" does not mean it propagated.

## Authentication

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `CLERK_SECRET_KEY` | critical | model-testing-app | Server-side Clerk operations (user impersonation, session management). |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | public | model-testing-app, mobile-app | Client-side Clerk SDK init. |
| `CLERK_WEBHOOK_SECRET` | secret | model-testing-app | Verifying Clerk webhooks (user.created etc). Required if Clerk webhooks are wired. |

## Convex

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | public | model-testing-app, mobile-app | Convex deployment URL for client SDK. |
| `CONVEX_DEPLOY_KEY` | critical | CI / local dev | Convex CLI deploy operations. Grants schema mutation rights. |
| `CONVEX_INTERNAL_SECRET` | secret | model-testing-app | Auth for Convex `internalAction` / `internalMutation` calls from Next.js routes. |

## HubSpot

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `HUBSPOT_API_KEY` | critical | model-testing-app | HubSpot private app access token. Read+write on companies, contacts, deals, activities. |
| `HUBSPOT_PORTAL_ID` | secret | model-testing-app | Optional; discoverable via `/integrations/v1/me`. |
| `HUBSPOT_WEBHOOK_SECRET` | secret | model-testing-app | HMAC-SHA256 key for webhook signature verification. |
| `HUBSPOT_WEBHOOK_TARGET_URI` | secret | model-testing-app | Registered webhook URL; defaults to the Vercel deployment URL. |

## Google (Calendar today, Gmail planned)

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | secret | model-testing-app | OAuth client ID for Google integrations. |
| `GOOGLE_CLIENT_SECRET` | critical | model-testing-app | OAuth client secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | secret | model-testing-app | OAuth callback URL. |
| `GMAIL_CLIENT_ID` (planned, BL-4.1) | secret | model-testing-app | Separate OAuth client for Gmail per confirmed decision; if separate, this is its client ID. |
| `GMAIL_CLIENT_SECRET` (planned, BL-4.1) | critical | model-testing-app | Separate Gmail OAuth client secret. |
| `GMAIL_OAUTH_REDIRECT_URI` (planned, BL-4.1) | secret | model-testing-app | Gmail OAuth callback URL. |

## Companies House

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `COMPANIES_HOUSE_API_KEY` | secret | model-testing-app | UK Companies House Basic Auth API key. |

## HM Land & Property Data (stub)

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `LAND_PROPERTY_API_KEY` | secret | model-testing-app | UK Land Registry API key. Stub today; client code exists but not wired. |
| `LAND_PROPERTY_API_RATE_LIMIT` | public | model-testing-app | Rate limit ceiling override (default 60 req/min). |

## Fireflies (planned, BL-3.1)

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `FIREFLIES_CLIENT_ID` (planned) | secret | model-testing-app | OAuth client ID for Fireflies API. |
| `FIREFLIES_CLIENT_SECRET` (planned) | critical | model-testing-app | Fireflies OAuth client secret. |
| `FIREFLIES_WEBHOOK_SECRET` (planned, if webhooks supported) | secret | model-testing-app | Webhook signature verification. |

## LLM providers

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | critical | model-testing-app | Claude API. Sole LLM provider after V3 retirement. |
| `TOGETHER_API_KEY` | secret | model-testing-app (legacy) | Together AI Llama 70B for V3 pipeline. Removed at BL-2.15. |
| `OPENAI_API_KEY` | secret | model-testing-app (legacy) | OpenAI GPT-4o for V3 critic agent. Removed at BL-2.15. |

## Cross-service plumbing

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `CRON_SECRET` | secret | model-testing-app | Shared secret for Convex cron-to-Next.js API route bridge. Becomes obsolete once MCP server moves to Convex HTTP actions (BL-5.1) and bridge pattern is fully retired. |
| `NEXT_APP_URL` | secret | model-testing-app | Origin of Next.js deployment, used by Convex crons to call back into Next.js routes (legacy bridge pattern). |
| `NEXT_PUBLIC_APP_URL` | public | model-testing-app | Client-side app URL. |

## MCP server (planned, BL-5.1)

| Variable | Grade | Used by | Purpose |
|---|---|---|---|
| `MCP_TOKEN_SIGNING_SECRET` (planned, BL-5.9) | critical | model-testing-app / convex | Signs per-user MCP tokens issued via the CLI / settings flow. |
| `MCP_ALLOWED_ORIGINS` (planned) | public | convex | CORS allowlist for MCP HTTP endpoint. |

## Removal targets

The following are scheduled for removal as part of V3 retirement (BL-2.15):

- `TOGETHER_API_KEY`
- `OPENAI_API_KEY`

Coordinate with the operator before unsetting them: the keys stay set until the deploy that no longer references them, then are unset in Vercel and Convex env configs in the same window.

## How to handle exposure

If a `critical` or `secret` var is exposed (committed to git, posted in a chat, sent in a screenshot):

1. Rotate the key immediately at the provider.
2. Update the new value in Vercel and Convex env configs.
3. If the key was committed to git, also purge from history via `git filter-repo` and force-push; coordinate with all collaborators.
4. If the var was a `critical` grade, audit recent usage in the provider's logs for unexpected access.

This applies even if the exposure was "only briefly". Once a secret is anywhere outside Vercel/Convex env config, treat it as compromised.
