# HubSpot Integration Setup

This guide will help you set up the HubSpot CRM integration for syncing contacts, companies, and deals.

## Prerequisites

- HubSpot account with API access
- HubSpot API key (you have: `eu1-4571-f136-45e4-8555-d1154712b07f`)

## Environment Variables

Create a `.env.local` file in the root of the project (if it doesn't exist) and add the following:

```bash
# HubSpot API Configuration
HUBSPOT_API_KEY=eu1-4571-f136-45e4-8555-d1154712b07f

# Optional: HubSpot Portal ID (will be auto-detected if not provided)
# HUBSPOT_PORTAL_ID=your_portal_id_here
```

## Getting Your HubSpot Portal ID (Optional)

The portal ID is automatically detected from the API, but you can also find it manually:

1. Log into your HubSpot account
2. Check the URL: `https://app.hubspot.com/contacts/{PORTAL_ID}/...`
3. Or go to Settings > Integrations > Private Apps and check your app details

## Usage

### Manual Sync

1. Navigate to `/settings/hubspot` in your application
2. Click the "Sync Now" button
3. The sync will import up to 100 records of each type (companies, contacts, deals)

### Recurring Sync

1. Navigate to `/settings/hubspot`
2. Toggle "Recurring Sync" to enable automatic syncing every 24 hours
3. Toggle again to disable

## Data Mapping

### Companies → Clients
- HubSpot companies are synced as clients
- Lifecycle stages are mapped:
  - `lead`, `marketingqualifiedlead`, `salesqualifiedlead`, `opportunity` → `prospect`
  - `customer`, `evangelist`, `other` → `active`

### Contacts → Contacts
- HubSpot contacts are synced as contacts
- Duplicate detection by HubSpot ID, email, or name

### Deals → Projects
- HubSpot deals are synced as projects
- Associated companies are linked via `clientRoles`
- Deal stages map to project statuses

## Deep Links

All synced records include deep links back to HubSpot. Look for the external link icon (🔗) next to client/contact/project names to open them directly in HubSpot.

## Custom Properties

All HubSpot custom properties are stored in the `metadata` field of synced records for future enrichment.

## Troubleshooting

### Sync Errors
- Check that `HUBSPOT_API_KEY` is set correctly in `.env.local`
- Verify your API key has the necessary permissions
- Check the sync status page for detailed error messages

### Missing Portal ID
- The portal ID is auto-detected, but if deep links don't work, add `HUBSPOT_PORTAL_ID` to `.env.local`

### Rate Limiting
- The integration respects HubSpot's rate limits (100 requests per 10 seconds)
- Large syncs may take time due to rate limiting delays

## API Endpoints

- `POST /api/hubspot/sync-all` - Sync all data types
- `POST /api/hubspot/sync-companies` - Sync companies only
- `POST /api/hubspot/sync-contacts` - Sync contacts only
- `POST /api/hubspot/sync-deals` - Sync deals only
- `GET /api/hubspot/recurring-sync` - Get recurring sync config
- `POST /api/hubspot/recurring-sync` - Update recurring sync config

