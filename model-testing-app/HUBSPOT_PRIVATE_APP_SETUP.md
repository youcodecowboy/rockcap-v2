# HubSpot Private App Setup Guide

## The Issue

You're seeing 401 errors because the key in "Private Keys" is a **legacy API key**, not a **Private App access token**. The HubSpot SDK v13+ requires Private App access tokens.

## Solution: Create a Private App

You don't need to run `hs project create` - that's for HubSpot CLI projects. You just need to create a **Private App** in HubSpot.

### Step 1: Create a Private App

1. Go to HubSpot → **Settings** (gear icon in top right)
2. Navigate to **Integrations** → **Private Apps**
3. Click **Create a private app**
4. Give it a name (e.g., "CRM Sync App")
5. Click **Create app**

### Step 2: Configure Scopes

In the Private App settings, go to the **Scopes** tab and enable these scopes:

**Required Scopes:**
- ✅ `crm.objects.companies.read`
- ✅ `crm.objects.companies.write`
- ✅ `crm.objects.contacts.read`
- ✅ `crm.objects.contacts.write`
- ✅ `crm.objects.deals.read`
- ✅ `crm.objects.deals.write`

**Optional but Recommended:**
- `crm.schemas.companies.read` (to read custom properties)
- `crm.schemas.contacts.read`
- `crm.schemas.deals.read`

### Step 3: Get the Access Token

1. Go to the **Auth** tab in your Private App
2. You'll see an **Access token** field
3. Click **Show token** (you may need to enter your password)
4. Copy the token - it should look like: `eu1-xxxx-xxxx-xxxx-xxxx-xxxx` or `pat-xxxx-xxxx-xxxx-xxxx-xxxx`

### Step 4: Update Your Environment Variable

1. Open `.env.local` in your project
2. Replace the old key with the new Private App access token:
   ```
   HUBSPOT_API_KEY=your-new-private-app-access-token-here
   ```
3. Save the file
4. **Restart your Next.js dev server** (important!)

### Step 5: Test

1. Visit: `http://localhost:3000/api/hubspot/test-auth`
2. You should see a successful response
3. Then try syncing from the settings page

## Difference Between Private Keys and Private Apps

- **Private Keys** (legacy): Old API key system, may not work with newer SDK versions
- **Private Apps** (current): Modern authentication with scopes, works with SDK v13+

## Troubleshooting

If you still get 401 errors after creating a Private App:

1. **Verify the token format**: Should start with `eu1-`, `us1-`, or `pat-`
2. **Check scopes**: Make sure all required scopes are enabled
3. **Check app status**: Make sure the Private App is active (not paused)
4. **Restart server**: Always restart Next.js after changing `.env.local`

## Note

You don't need a HubSpot "project" - that's for HubSpot CLI development. A Private App is sufficient for API access.

