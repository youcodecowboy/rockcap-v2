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

// Fireflies auto-sync (BL-3.4). Every 30 minutes. Iterates connected
// users serially. The internal action self-skips when the global
// firefliesSyncConfig.isEnabled flag is off (default), so this cron
// is safe to enable from day one; it does nothing until the operator
// flips the switch.
crons.interval(
  "fireflies-auto-sync",
  { minutes: 30 },
  internal.firefliesSync.autoSyncAll,
);

// Cadence dispatcher (cadence-fire v1). Every 5 minutes. Polls due
// cadences (isActive + nextDueAt past), fires pre-drafted touches into
// the approval queue, advances state. Dynamic-compose types defer to
// v1.1 (composer not yet built). Cap of 100 rows per tick prevents
// runaway under backlog conditions.
crons.interval(
  "cadence-dispatcher",
  { minutes: 5 },
  internal.cadenceDispatcher.tick,
);

// Gmail watch renewal (cadence-fire v1). Daily. Re-issues users.watch
// API call for any user whose watch expires within 2 days. Same pattern
// as Calendar push channel renewal. Stub until Pub/Sub topic is
// configured; the cron runs harmlessly today.
crons.daily(
  "gmail-watch-renewal",
  { hourUTC: 4, minuteUTC: 0 },  // before daily-brief-trigger at 5:00
  internal.gmailWatch.renewWatchesInternal,
);

// v1.2: stale skillRun sweep. Once daily, mark any skillRun with
// status=running AND _creationTime > 6h as failed. Prevents stuck runs
// from blocking future dedup checks.
crons.daily(
  "skillrun-staleness-sweep",
  { hourUTC: 3, minuteUTC: 45 },
  internal.skillRuns.sweepStaleRunningRunsInternal,
);

export default crons;
