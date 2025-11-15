# HubSpot Project Setup Guide

Since you don't see "Private Apps" in Settings, you likely have an **App Developer Account**. Here's how to set up a project and get your access token:

## Option 1: Create Project via HubSpot Web Interface

1. **Go to HubSpot Developer Portal:**
   - Visit: https://developers.hubspot.com/
   - Log in with your HubSpot account

2. **Create a New App:**
   - Click "Create app" or go to "My apps"
   - Choose "Private app" when prompted
   - Give it a name (e.g., "CRM Sync")
   - Click "Create app"

3. **Configure Scopes:**
   - Go to the "Scopes" tab
   - Enable these scopes:
     - `crm.objects.companies.read`
     - `crm.objects.companies.write`
     - `crm.objects.contacts.read`
     - `crm.objects.contacts.write`
     - `crm.objects.deals.read`
     - `crm.objects.deals.write`

4. **Get Your Access Token:**
   - Go to the "Auth" tab
   - You'll see an "Access token" field
   - Click "Show token" and copy it
   - The token will look like: `eu1-xxxx-xxxx-xxxx-xxxx-xxxx` or `pat-xxxx-xxxx-xxxx-xxxx-xxxx`

5. **Update `.env.local`:**
   ```bash
   HUBSPOT_API_KEY=your-access-token-here
   ```

6. **Restart your Next.js server**

## Option 2: Use HubSpot CLI (If Available)

If the CLI works for you:

1. **Authenticate:**
   ```bash
   npx hs account auth
   ```
   This will open a browser to create a Personal Access Key.

2. **Create Project:**
   ```bash
   npx hs project create
   ```
   - Choose "Private" when asked about distribution
   - Choose "Static Token" for authentication
   - The project will be created and you'll get an access token

3. **Get Token from Project:**
   - After creating the project, check the project settings
   - The access token should be displayed there

## Option 3: Check Your Account Type

If you have an **App Developer Account**, you might need to:

1. **Create a Developer Test Account:**
   - In your HubSpot account, go to the "Testing" tab
   - Click "Create app test account"
   - This creates a test account where you can create private apps

2. **Then create a Private App in the test account:**
   - Log into the test account
   - Go to Settings → Integrations → Private Apps
   - Create your private app there

## Quick Check: What Type of Account Do You Have?

- **App Developer Account:** For building marketplace apps, may not show Private Apps
- **Regular HubSpot Account:** Should show Private Apps in Settings → Integrations
- **Developer Test Account:** Created from App Developer Account, supports Private Apps

## After Getting Your Token

Once you have the access token:

1. Add it to `.env.local`:
   ```bash
   HUBSPOT_API_KEY=your-token-here
   ```

2. Restart your Next.js dev server

3. Test the connection:
   - Visit: `http://localhost:3000/api/hubspot/test-auth`
   - Should return success if token is valid

4. Try syncing:
   - Go to `/settings/hubspot`
   - Click "Sync Now"

## Troubleshooting

If you still can't find Private Apps:
- Check if you're in an App Developer Account
- Try creating a Developer Test Account
- Or use the HubSpot Developer Portal to create an app directly

