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

// Gmail inbound poll. Every 5 minutes, pull new INBOX mail for every
// connected user via Gmail's history.list (gmail.modify scope grants read,
// so no Pub/Sub topic needed) and route each message through the shared
// reply pipeline. This is the live ingest that populates the inbox + the
// reply.* MCP reads; the Pub/Sub push path (gmailWatch) layers real-time
// delivery on top once a topic is provisioned, sharing the same watermark.
crons.interval(
  "gmail-inbound-poll",
  { minutes: 5 },
  internal.gmailInbound.pollAllInbound,
);

// Meeting auto-complete (prospecting v3). Every hour. Marks scheduled meetings
// whose meetingDate has passed as completed (completionSource 'date_passed'),
// which advances the prospect to warm_post_meeting and pulls any transcript
// into intel. The internal mutation caps rows per run so a legacy backlog of
// past undated-status meetings drains gradually instead of mass-firing.
crons.interval(
  "meeting-auto-complete",
  { hours: 1 },
  internal.meetings.autoCompleteDueMeetings,
  {},
);

// Google Drive changes poll. Every 2 minutes, page Drive's changes.list
// from the stored startPageToken watermark and apply each change to the
// metadata mirror (driveFolders/driveFiles). Self-skips when there is no
// connection, the connection needs re-consent, or the initial backfill
// hasn't seeded a watermark yet; a 90s overlap lease stops a slow tick
// being overlapped by the next fire.
crons.interval(
  "drive-changes-poll",
  { minutes: 2 },
  internal.driveSync.pollChanges,
);

// Google Drive nightly reconcile. Re-walks the whole tree under the root
// folder and trashes any live mirror row the walk didn't see — the safety
// net for per-user changes-feed gaps on shared-with-me content. 2:30 UTC
// sits clear of the other daily jobs (3:15 / 3:30 / 3:45 / 4:00 / 5:00).
crons.daily(
  "drive-reconcile",
  { hourUTC: 2, minuteUTC: 30 },
  internal.driveSync.reconcileWalk,
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
