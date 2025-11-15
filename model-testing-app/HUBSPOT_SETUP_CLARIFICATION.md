# HubSpot Setup: CLI Project vs Private App

## Two Different Approaches

There are **two ways** to authenticate with HubSpot:

### Option 1: Private App (Simpler - Recommended for API Access)

**What it is:** A Private App gives you an access token to use HubSpot's APIs directly.

**When to use:** When you just need to sync data (contacts, companies, deals) via API calls.

**Steps:**
1. Go to HubSpot → Settings → Integrations → Private Apps
2. Create a new Private App
3. Enable required scopes (crm.objects.companies.read, etc.)
4. Copy the access token from the Auth tab
5. Add to `.env.local` as `HUBSPOT_API_KEY`

**Pros:**
- ✅ Simple and quick
- ✅ Perfect for API data syncing
- ✅ No CLI needed
- ✅ Works with our current code

**Cons:**
- ❌ Not for building HubSpot Apps (marketplace apps)

### Option 2: HubSpot CLI Project (For Building Apps)

**What it is:** Creates a HubSpot App project structure for building marketplace apps or custom HubSpot integrations.

**When to use:** When building HubSpot Apps that will be installed in HubSpot accounts (like marketplace apps).

**Steps:**
1. Install HubSpot CLI: `npm install -g @hubspot/cli` (or locally: `npm install --save-dev @hubspot/cli`)
2. Authenticate: `npx hs account auth`
3. Create project: `npx hs project create`
4. Follow prompts to set up the app

**Pros:**
- ✅ Full HubSpot App development
- ✅ Can be published to marketplace
- ✅ Includes OAuth flow setup

**Cons:**
- ❌ More complex than needed for simple API syncing
- ❌ Requires CLI setup
- ❌ Overkill for our use case

## For Our Integration

**We recommend Option 1 (Private App)** because:
- We're just syncing CRM data via API
- We don't need to build a HubSpot App
- It's simpler and faster
- Our code already works with Private App tokens

## If You Want to Use CLI Anyway

If you prefer to follow the HubSpot docs exactly:

1. **Install CLI locally** (already done):
   ```bash
   npm install --save-dev @hubspot/cli
   ```

2. **Authenticate**:
   ```bash
   npx hs account auth
   ```
   This will prompt you to create a Personal Access Key in HubSpot.

3. **Create project** (optional - not needed for API access):
   ```bash
   npx hs project create
   ```

4. **Get your access token**:
   - Even with CLI, you'll still need a Private App access token for API calls
   - The CLI project might create one, or you can create a Private App separately

## Recommendation

**For our CRM sync integration, use Option 1 (Private App).** The CLI project is for building HubSpot Apps, which we don't need. A Private App access token is sufficient and simpler.

