# HubSpot Project-Based App for Webhooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute file-authoring tasks (Phase A). Phases B–D involve HubSpot CLI + HubSpot web UI + Vercel dashboard steps the user must perform directly.

**Goal:** Stand up a HubSpot project-based app that owns webhook subscriptions for the RockCap integration, exposing a Client Secret for the v3 HMAC signature verification we already shipped. Fills the gap left when the legacy Private App was deleted and the account moved to a Service Key (which doesn't support webhooks).

**Architecture:** Separate HubSpot integration dedicated to webhooks. One `hsproject.json` + one `app-hsmeta.json` (private / static auth) + one `webhooks-hsmeta.json` with all 9 subscriptions. Deploy via `hs project upload` to the same HubSpot account that has the existing Service Key. Webhook verification code we already shipped is scheme-compatible — just needs `HUBSPOT_WEBHOOK_SECRET` pointed at the new app's Client Secret.

**Tech Stack:** HubSpot CLI (`@hubspot/cli` ≥ 7.9.0), platform version `2025.2`, `hsproject.json` / `*-hsmeta.json` JSON config. Existing TypeScript webhook verify + Convex handlers unchanged.

**Prior plan + spec:**
- Design: `docs/superpowers/specs/2026-04-22-hubspot-webhooks-design.md`
- Handler implementation plan: `docs/superpowers/plans/2026-04-22-hubspot-webhooks.md` (shipped in commits 4cbf284 → a106206 earlier today)

**Known coexistence:** the existing `hubspot-cli-temp/crm-sync/` project directory is unrelated scratch (marketplace-distribution demo). Don't repurpose it. New project gets a new top-level directory.

---

## Known unknowns (verify-at-setup items)

Four things the docs don't pin down definitively. Flag them so the engineer is alert during execution rather than surprised:

1. **Whether `distribution: "private"` + `auth.type: "static"` fully supports webhook subscriptions.** The [official configure-webhooks doc](https://developers.hubspot.com/docs/apps/developer-platform/add-features/configure-webhooks) documents it with no caveats. A [community thread](https://community.hubspot.com/t5/APIs-Integrations/Client-secret-for-webhook-authentication/m-p/633969) claims it's blocked. The thread is older than the new platform launch — likely stale. Plan assumes the docs are correct; if upload fails with a webhook-not-allowed error, fallback is Task 9 (switch to `distribution: "marketplace"` + `auth.type: "oauth"`).

2. **Exact retrieval path for the Client Secret after deploy.** Docs say Client Secret lives in the app's Auth tab in the HubSpot UI. The CLI has no known command to dump it. Task 7 confirms the path.

3. **Whether all ~22 subscription entries fit in one `webhooks-hsmeta.json` under `crmObjects[]`.** One subscription example is published; combining all of ours into one file is inferred but not explicitly shown. Task 3 is structured so you can incrementally pare down if upload rejects the shape.

4. **Webhook payload `subscriptionType` format — new vs legacy.** The new platform's subscription *config* uses `"subscriptionType": "object.propertyChange"` + a separate `objectType` field. But HubSpot might still send *payload* events in the legacy `"subscriptionType": "company.propertyChange"` form (without a separate `objectType`). Our existing dispatcher (shipped in `convex/hubspotSync/webhook.ts` commit `9b07680`) expects the legacy form. If the real payload uses the new form, engagement events won't route correctly — they'd fall through to the object-fetch path instead of the engagement-fetch path. **Task 8 Step 5 diagnoses this and provides a 3-line fix if needed.**

---

## File Structure

### New files (at repo root)

| Path | Purpose |
|---|---|
| `hubspot-webhook-app/hsproject.json` | Project manifest: name, srcDir, platformVersion |
| `hubspot-webhook-app/src/app/app-hsmeta.json` | App component: private distribution, static auth, required scopes |
| `hubspot-webhook-app/src/app/webhooks/webhooks-hsmeta.json` | Webhooks component: all 9 subscriptions, target URL, throttle |
| `hubspot-webhook-app/.gitignore` | Ignore `node_modules/`, `.hs-cache/`, `.hs-builds/` |
| `hubspot-webhook-app/README.md` | One-page orientation: what this is, how to deploy, how it connects to the Next.js app |

### Modified files (repo)

None. The existing `src/app/api/hubspot/webhook/route.ts` and `src/lib/hubspot/webhook-verify.ts` consume `HUBSPOT_WEBHOOK_SECRET` via env — the secret source changes, the code does not.

### Env var changes (Vercel Production only)

- **Add:** `HUBSPOT_WEBHOOK_SECRET` — Client Secret from the deployed app (retrieved in Task 7)
- **No change to:** `HUBSPOT_API_KEY` (keeps using the Service Key)

---

## Phase A — Author the project files (repo work)

These tasks run via the subagent-driven flow — they're pure file authoring.

### Task 1: Create the project directory + `hsproject.json`

**Files:**
- Create: `hubspot-webhook-app/hsproject.json`
- Create: `hubspot-webhook-app/.gitignore`

- [ ] **Step 1: Create directory + hsproject.json**

From the repo root `/Users/cowboy/rockcap/rockcap-v2`:

```bash
mkdir -p hubspot-webhook-app/src/app/webhooks
```

Then write `hubspot-webhook-app/hsproject.json`:

```json
{
  "name": "rockcap-webhooks",
  "srcDir": "src",
  "platformVersion": "2025.2"
}
```

- [ ] **Step 2: Write .gitignore**

Create `hubspot-webhook-app/.gitignore`:

```
# HubSpot CLI transient state
.hs-cache/
.hs-builds/
node_modules/
*.log

# Local dev config — don't commit if added later
local.json
```

- [ ] **Step 3: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add hubspot-webhook-app/hsproject.json hubspot-webhook-app/.gitignore
git commit -m "feat(hubspot-project): scaffold rockcap-webhooks project manifest"
```

---

### Task 2: Create the `app-hsmeta.json` (app component)

**Files:**
- Create: `hubspot-webhook-app/src/app/app-hsmeta.json`

- [ ] **Step 1: Write app-hsmeta.json**

```json
{
  "uid": "rockcap-webhooks-app",
  "type": "app",
  "config": {
    "name": "RockCap Webhooks",
    "description": "Owns webhook subscriptions that power real-time CRM + activity sync into the RockCap Next.js app. API calls are handled by a separate Service Key — this app only receives events.",
    "distribution": "private",
    "auth": {
      "type": "static",
      "requiredScopes": [
        "crm.objects.companies.read",
        "crm.objects.contacts.read",
        "crm.objects.deals.read"
      ],
      "optionalScopes": [],
      "conditionallyRequiredScopes": []
    },
    "permittedUrls": {
      "fetch": [],
      "iframe": [],
      "img": []
    }
  }
}
```

**Note on scopes:** webhook subscriptions require read scope on each object type being subscribed to. Minimum-necessary: three CRM read scopes. We do NOT add `sales-email-read` here because this app never fetches email bodies — that stays on the Service Key used by `HUBSPOT_API_KEY`.

**Note on `distribution: "private"`:** per the `hubspot-cli-temp/crm-sync/CLAUDE.md` reference: "If the `config.distribution` field is set to `marketplace`, the only valid `config.auth.type` value is `oauth`." We want `static` auth (which gives a Client Secret we can use for webhook HMAC), so distribution must be `private`. If Task 6's upload fails specifically because webhooks + private-static isn't allowed, Task 10 provides the fallback.

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add hubspot-webhook-app/src/app/app-hsmeta.json
git commit -m "feat(hubspot-project): app component — private / static auth / CRM read scopes"
```

---

### Task 3: Create the `webhooks-hsmeta.json`

**Files:**
- Create: `hubspot-webhook-app/src/app/webhooks/webhooks-hsmeta.json`

- [ ] **Step 1: Write the webhooks config with all 9 subscriptions**

```json
{
  "uid": "rockcap-webhooks",
  "type": "webhooks",
  "config": {
    "settings": {
      "targetUrl": "https://rockcap-v2.vercel.app/api/hubspot/webhook",
      "maxConcurrentRequests": 10
    },
    "subscriptions": {
      "crmObjects": [
        { "subscriptionType": "object.creation", "objectType": "company", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "company", "propertyName": "notes_last_updated", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "company", "propertyName": "name", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "company", "propertyName": "lifecyclestage", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "company", "propertyName": "hs_pipeline", "active": true },
        { "subscriptionType": "object.deletion", "objectType": "company", "active": true },

        { "subscriptionType": "object.creation", "objectType": "contact", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "contact", "propertyName": "email", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "contact", "propertyName": "firstname", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "contact", "propertyName": "lastname", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "contact", "propertyName": "lifecyclestage", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "contact", "propertyName": "jobtitle", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "contact", "propertyName": "hubspot_owner_id", "active": true },
        { "subscriptionType": "object.deletion", "objectType": "contact", "active": true },

        { "subscriptionType": "object.creation", "objectType": "deal", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "deal", "propertyName": "dealstage", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "deal", "propertyName": "amount", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "deal", "propertyName": "closedate", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "deal", "propertyName": "dealname", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "deal", "propertyName": "pipeline", "active": true },
        { "subscriptionType": "object.propertyChange", "objectType": "deal", "propertyName": "hubspot_owner_id", "active": true },
        { "subscriptionType": "object.deletion", "objectType": "deal", "active": true }
      ],
      "legacyCrmObjects": [],
      "hubEvents": []
    }
  }
}
```

**Note on shape:** the new platform uses `subscriptionType: "object.creation"` (singular `object`) instead of the legacy `contact.creation` / `company.propertyChange` format. The `objectType` field specifies which CRM object. This is the **new** style; if upload fails with "unknown subscription type," fallback is to move these to `legacyCrmObjects` with the old string format.

**Note on targetUrl:** hardcoded to the Vercel production URL. Our webhook handler uses `HUBSPOT_WEBHOOK_TARGET_URI` env override that defaults to this same URL — they MUST match byte-for-byte or HMAC verification fails. If you move to a custom domain later, update both places.

**Note on `maxConcurrentRequests: 10`:** HubSpot throttles deliveries to 10 parallel requests. Reasonable for a Vercel function that handles each in <500ms; can raise later if bursts back up.

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add hubspot-webhook-app/src/app/webhooks/webhooks-hsmeta.json
git commit -m "feat(hubspot-project): webhooks component — all 9 CRM subscriptions"
```

---

### Task 4: Write the README

**Files:**
- Create: `hubspot-webhook-app/README.md`

- [ ] **Step 1: Write README**

Create `hubspot-webhook-app/README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add hubspot-webhook-app/README.md
git commit -m "docs(hubspot-project): README for the webhooks project"
```

---

## Phase B — HubSpot CLI setup (user runs)

These tasks require HubSpot account credentials + CLI interactive auth. Claude can't run them; they're user actions. The plan here is a precise checklist so the user doesn't have to guess.

### Task 5: Install HubSpot CLI + authenticate

- [ ] **Step 1: Install CLI globally** (skip if already installed)

```bash
npm install -g @hubspot/cli
hs --version   # confirm ≥ 7.9.0
```

- [ ] **Step 2: Authenticate to HubSpot**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/hubspot-webhook-app
hs account auth
```

This opens a browser. Choose the account that has the existing Service Key (account ID 146182077 based on `hubspot-cli-temp/hubspot.config.yml`). It'll prompt for a Personal Access Key — generate one at HubSpot → Settings → Integrations → Personal Access Keys (NOT Service Keys).

The CLI will write auth info to `~/.hscli/config.yml` (or similar).

- [ ] **Step 3: Validate the project**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/hubspot-webhook-app
hs project validate
```

Expected: config passes validation. If it fails, read the error — common causes are JSON syntax errors or missing required fields. Fix and re-run.

---

### Task 6: Upload + deploy the project

- [ ] **Step 1: Upload**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/hubspot-webhook-app
hs project upload
```

This creates a new project named `rockcap-webhooks` in HubSpot and builds it. Watch for errors:

- "Webhooks not allowed for this distribution/auth combination" → see **Task 10 fallback** (switch to oauth).
- "Unknown subscription type" → the new `object.creation` format may not work; change entries to `legacyCrmObjects` format (e.g. `"subscriptionType": "company.creation"` with no `objectType` field) and re-upload.
- "Scope required" → `requiredScopes` in `app-hsmeta.json` is missing an entry; cross-reference the error with the subscription that failed.

- [ ] **Step 2: Deploy**

If `hs project upload` doesn't auto-deploy (CLI behavior varies), run:

```bash
hs project deploy
```

- [ ] **Step 3: Confirm deployment in HubSpot UI**

```bash
hs project open
```

This opens the HubSpot web UI to the project's overview page. Verify:
- Project status shows "Active" / "Deployed"
- Webhooks component shows subscriptions are active

---

### Task 7: Retrieve Client Secret + wire Vercel

- [ ] **Step 1: Find the Client Secret in HubSpot UI**

From the `hs project open` page:
1. Navigate to the app's **Auth** tab (next to Overview)
2. Look for "Client secret" (separate from Personal Access Key / access token)
3. Click **Show secret** → copy to clipboard

**If there's no Client Secret field:** that means HubSpot's UI for private+static apps doesn't expose one, and we need Task 10 fallback. Unlikely, but the one real "unknown" in this plan.

- [ ] **Step 2: Add env var to Vercel**

Vercel dashboard → this project → Settings → Environment Variables → **Add New**:
- Name: `HUBSPOT_WEBHOOK_SECRET`
- Value: *(paste the Client Secret)*
- Environments: **Production only** (uncheck Preview + Development)
- Click Save

- [ ] **Step 3: Redeploy Vercel to pick up the env var**

Vercel dashboard → Deployments → latest production deployment → ⋯ menu → **Redeploy** (uncheck "Use existing build cache").

Wait ~60s for redeploy to finish.

---

## Phase C — Smoke test (user runs)

### Task 8: End-to-end smoke test

- [ ] **Step 1: Trigger a webhook from HubSpot**

In HubSpot, pick any test company (or one you don't mind leaving a note on). Click into the company record → Activity → **Add note**. Enter any text, save.

- [ ] **Step 2: Watch Vercel logs**

Vercel dashboard → Functions → Logs, filter for `[hubspot-webhook]`. Within 30 seconds you should see:

```
[hubspot-webhook] received=1 unique=1 enqueued=1 errors=0 duration_ms=<500
```

If you see `signature verify failed` → the `HUBSPOT_WEBHOOK_SECRET` doesn't match the app's Client Secret, or `HUBSPOT_WEBHOOK_TARGET_URI` needs to be set (defaults to `https://rockcap-v2.vercel.app/api/hubspot/webhook` — match the `targetUrl` in webhooks-hsmeta.json exactly).

- [ ] **Step 3: Check Convex**

Convex dashboard → Functions → filter for `processWebhookEvent` — should show one successful run. Then Data → `webhookEventLog` → one row with `status: 'completed'`.

- [ ] **Step 4: Check the RockCap activity stream**

Open the mobile app or desktop view for the company you added the note to. The note should appear in the activity stream with a real owner name (not "Someone") and real content (not "[redacted]").

- [ ] **Step 5: Diagnose dispatcher format (the "known unknown" #4)**

In the Convex dashboard, open one of the `webhookEventLog` rows from the smoke test. Check the `subscriptionType` field:

- **If it reads `company.propertyChange`** (legacy format) → the existing dispatcher works as-is. Done.
- **If it reads `object.propertyChange`** (new format) → engagements won't route correctly yet. Apply this 3-line fix to `model-testing-app/convex/hubspotSync/webhook.ts`:

```diff
 function dispatchFor(
   subscriptionType: string,
+  objectType: string,
   propertyName: string | undefined,
 ): Dispatch {
   if (subscriptionType.endsWith('.deletion')) return 'delete';
-  if (
-    subscriptionType === 'company.propertyChange' &&
-    propertyName === 'notes_last_updated'
-  ) {
+  // Match both the legacy `company.propertyChange` format and the new
+  // `object.propertyChange` + objectType='0-2' format. HubSpot may send
+  // either depending on how the subscription was declared.
+  const isCompanyPropertyChange =
+    subscriptionType === 'company.propertyChange' ||
+    (subscriptionType === 'object.propertyChange' && objectType === '0-2');
+  if (isCompanyPropertyChange && propertyName === 'notes_last_updated') {
     return 'engagement';
   }
   return 'object';
 }
```

And update the call site (same file, in `processWebhookEvent`): `dispatchFor(subscriptionType, objectType, propertyName)`.

Redeploy, trigger another test note. Confirm the Convex action log for the new event shows `action: 'engagement'` instead of `action: 'object'`.

Commit the change:

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add model-testing-app/convex/hubspotSync/webhook.ts
git commit -m "fix(hubspot-webhook): dispatcher handles both legacy and new propertyChange formats"
git push
```

---

## Phase D — Fallback (only if Phase B fails)

### Task 10: OAuth fallback (only if private+static doesn't support webhooks)

- [ ] **Step 1: Change app-hsmeta.json to oauth distribution**

Replace `hubspot-webhook-app/src/app/app-hsmeta.json` with:

```json
{
  "uid": "rockcap-webhooks-app",
  "type": "app",
  "config": {
    "name": "RockCap Webhooks",
    "description": "Owns webhook subscriptions that power real-time CRM + activity sync into the RockCap Next.js app. API calls are handled by a separate Service Key — this app only receives events.",
    "distribution": "marketplace",
    "auth": {
      "type": "oauth",
      "requiredScopes": [
        "crm.objects.companies.read",
        "crm.objects.contacts.read",
        "crm.objects.deals.read"
      ],
      "redirectUrls": [
        "https://rockcap-v2.vercel.app/api/hubspot/oauth-callback"
      ]
    },
    "permittedUrls": {
      "fetch": [],
      "iframe": [],
      "img": []
    }
  }
}
```

This changes `distribution: "private"` → `"marketplace"` and `auth.type: "static"` → `"oauth"`. OAuth apps have a Client Secret exposed in the Developer Portal after upload.

- [ ] **Step 2: Implement the OAuth callback route**

The OAuth-distribution flow requires a `redirectUrls` entry that can accept HubSpot's authorization callback. For a single-account webhook-only setup this is basically ceremony — we won't actually exchange tokens since the app uses OAuth just to satisfy HubSpot's distribution requirement. Stub route at `model-testing-app/src/app/api/hubspot/oauth-callback/route.ts`:

```typescript
import { NextResponse } from 'next/server';

// HubSpot requires a redirect URL on OAuth apps — but for this webhook-only
// app we never actually consume the callback. Returns 200 to satisfy any
// probing during HubSpot's app review.
export async function GET() {
  return NextResponse.json({ ok: true, note: 'webhook-only app; no token exchange' });
}
```

- [ ] **Step 3: Re-upload + deploy**

```bash
cd /Users/cowboy/rockcap/rockcap-v2/hubspot-webhook-app
hs project upload
hs project deploy
hs project open
```

Proceed with Task 7 onwards using the OAuth app's Client Secret.

- [ ] **Step 4: Commit the fallback**

```bash
cd /Users/cowboy/rockcap/rockcap-v2
git add hubspot-webhook-app/src/app/app-hsmeta.json \
        model-testing-app/src/app/api/hubspot/oauth-callback/route.ts
git commit -m "feat(hubspot-project): fallback to oauth distribution + stub callback"
```

---

## Success metric

Within 30 seconds of the smoke test note being logged in HubSpot:
- Vercel logs show the webhook arrived and was verified
- Convex `webhookEventLog` has one `completed` row
- RockCap UI shows the note with real owner + real content

After 24h of normal HubSpot usage:
- Webhook log shows >90% of events complete successfully
- No `signature verify failed` warnings in Vercel logs
- Cron (1h sweep) is catching 0 missed events (webhook coverage is complete)

---

## Out of scope (deferred follow-ups)

- **Migration of `HUBSPOT_API_KEY` from Service Key to this project's token.** Current Service Key is better-scoped than this app would be (the Service Key has `sales-email-read` which this app doesn't need and shouldn't have). Keep them separate.
- **Project-based app for the API calls.** Don't mix concerns. Service Key does API; this project does webhooks.
- **Multi-environment (dev/staging/prod).** HubSpot projects deploy to one account at a time. If you later need a preview-deploy webhook path, duplicate the project with a different `targetUrl`.
- **HubSpot CLI as a committed dev dependency.** The CLI is installed globally, not in the repo. The existing `hubspot-cli-temp/package.json` is scratch and can be deleted separately.
