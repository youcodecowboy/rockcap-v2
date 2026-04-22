# RockCap Webhooks — HubSpot Project-Based App

This directory is a [HubSpot project-based app](https://developers.hubspot.com/docs/apps/developer-platform) whose **only job is to own webhook subscriptions**. It does not make API calls. API calls are handled by a separate HubSpot Service Key used by the Next.js app in `../model-testing-app/`.

## Why a separate app?

HubSpot Service Keys (the token type the Next.js app uses for outbound API calls) do **not** support webhook subscriptions — HubSpot requires a Private App, Public App, or project-based app to own subscriptions. This project is the lightest-weight way to satisfy that requirement without migrating the working Service Key.

## Structure

```
hubspot-webhook-app/
├── hsproject.json                          # project manifest (platformVersion, srcDir)
└── src/app/
    ├── app-hsmeta.json                     # app component — private / static auth / CRM read scopes
    └── webhooks/
        └── webhooks-hsmeta.json            # webhook subscriptions (all 9 CRM events)
```

## Deploy flow

Prereqs:
- HubSpot CLI installed: `npm install -g @hubspot/cli`
- Authenticated to the target HubSpot account: `hs account auth` (creates `~/.hscli/config.yml`)

From this directory:

```bash
# Validate config before uploading
hs project validate

# Upload + build (creates a "build" in HubSpot)
hs project upload

# Deploy the latest build so subscriptions go live
hs project deploy

# Jump to the app's Auth tab to copy the Client Secret
hs project open
```

## What to do after deploy

1. On the app's Auth tab in HubSpot, copy the **Client Secret** (under the access token / "Show secret" button)
2. Vercel dashboard → Settings → Environment Variables → add:
   - Name: `HUBSPOT_WEBHOOK_SECRET`
   - Value: (pasted secret)
   - Environments: Production only
3. Redeploy the Next.js app (env var changes take effect on the next deploy)
4. Smoke test: log a note on a test company in HubSpot, verify it lands in Convex within ~30s

## Related

- Design spec: `../docs/superpowers/specs/2026-04-22-hubspot-webhooks-design.md`
- Handler implementation: `../model-testing-app/src/app/api/hubspot/webhook/route.ts`
- HMAC verification: `../model-testing-app/src/lib/hubspot/webhook-verify.ts`
- HubSpot CLI docs: https://developers.hubspot.com/docs/cli
