# Pipe daily HubSpot updates into the org-wide daily brief

Created: 2026-04-17
Status: done
Tags: #feature #hubspot
Source:
  - - 2026-04-17 — pipe daily HubSpot updates (activities, new contacts, new deals, etc) into the org-wide daily brief
Priority: medium

## Notes

Shipped 2026-04-17 — commit dcf094e: new hubspotSync.dailyBriefSummary(sinceISO) query. Both desktop and mobile daily-brief routes include a 'HUBSPOT ACTIVITY (last 24h)' block with activity counts by type, new contact/deal names, and notable engagement subjects. System prompt allows activityRecap items of type hubspot_activity / hubspot_contacts / hubspot_deals.
