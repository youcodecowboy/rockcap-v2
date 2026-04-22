import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily-brief-trigger",
  { hourUTC: 5, minuteUTC: 0 },
  internal.dailyBriefs.cronTrigger,
);

// HubSpot recurring sync — every 6h, incremental only. The account has
// ~20K entries across companies / contacts / deals / engagements; a full
// sync on every tick would torch the HubSpot rate-limit budget. The
// internal action reads config, skips if the toggle is off, and windows
// the sync against `config.lastSyncAt` so each tick only pulls changes
// since the previous successful run. See recurringSync.ts for env vars.
crons.interval(
  "hubspot-recurring-sync",
  { hours: 6 },
  internal.hubspotSync.recurringSync.runRecurringSync,
);

crons.daily(
  "hubspot-webhook-log-prune",
  { hourUTC: 3, minuteUTC: 15 },  // quiet hour
  internal.hubspotSync.webhook.pruneWebhookEventLog,
);

// Google Calendar auto-sync — every 30 minutes. Iterates connected users
// serially, falls back to cron-delivery when push webhooks are unreachable
// (localhost dev, brief outages) and renews push channels within 24h of
// expiration so push delivery never silently lapses.
crons.interval(
  "google-calendar-auto-sync",
  { minutes: 30 },
  internal.googleCalendarSync.autoSyncAll,
);

crons.daily(
  "google-calendar-sync-log-prune",
  { hourUTC: 3, minuteUTC: 30 },  // after HubSpot's prune at 3:15
  internal.googleCalendarLog.pruneSyncLog,
);

export default crons;
