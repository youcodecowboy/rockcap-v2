import { internalAction } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Recurring HubSpot sync — scheduled via a Convex cron in convex/crons.ts.
 *
 * Behaviour:
 *  1. Read the hubspotSyncConfig singleton. If `isRecurringSyncEnabled` is
 *     false (or no config row exists), skip. Operator controls this via
 *     the toggle on the desktop HubSpot settings page.
 *  2. Otherwise POST to the Next.js `/api/hubspot/sync-all` route in
 *     incremental mode, using `NEXT_APP_URL` + a `CRON_SECRET` header for
 *     operator-private auth bypass (the Next.js side checks the secret
 *     and short-circuits requireAuth when it matches).
 *  3. The route reads `config.lastSyncAt`, passes it as `since` to the
 *     companies / contacts / deals / activities fetchers, and updates
 *     lastSyncAt on success — so the next run windows from there.
 *
 * Why HTTP-round-trip to Next.js instead of inlining the sync here:
 *  - All the HubSpot orchestration (property discovery, owner resolution,
 *    rate-limit retry, sync-status tracking, per-entity mutation mapping)
 *    already lives in the sync-all route. Reimplementing in Convex would
 *    duplicate a thousand lines and drift.
 *  - Convex actions can fetch external URLs freely, so the round-trip is
 *    cheap and keeps the logic in one place.
 *
 * Required env vars (on the Convex deployment):
 *  - NEXT_APP_URL  — origin of the Next.js deployment (e.g.
 *                    https://rockcap.vercel.app)
 *  - CRON_SECRET   — shared secret, also set on Next.js env so sync-all
 *                    can verify the header
 */
export const runRecurringSync = internalAction({
  handler: async (ctx) => {
    const config: any = await ctx.runQuery(
      api.hubspotSync.getSyncConfig,
      {},
    );
    if (!config?.isRecurringSyncEnabled) {
      return { skipped: true, reason: "recurring sync disabled" };
    }

    const apiBase = process.env.NEXT_APP_URL;
    const secret = process.env.CRON_SECRET;
    if (!apiBase) {
      console.warn("[hubspot-recurring-sync] NEXT_APP_URL not set");
      return { error: "NEXT_APP_URL not configured on Convex deployment" };
    }
    if (!secret) {
      console.warn("[hubspot-recurring-sync] CRON_SECRET not set");
      return { error: "CRON_SECRET not configured on Convex deployment" };
    }

    const startedAt = Date.now();
    const url = `${apiBase.replace(/\/$/, "")}/api/hubspot/sync-all`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": secret,
      },
      body: JSON.stringify({
        mode: "incremental",
        syncCompanies: true,
        syncContacts: true,
        syncDeals: true,
        syncActivities: true,
      }),
    });

    const elapsedMs = Date.now() - startedAt;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[hubspot-recurring-sync] sync-all failed: HTTP ${res.status} in ${elapsedMs}ms — ${body.slice(0, 500)}`,
      );
      return {
        error: `HTTP ${res.status}`,
        body: body.slice(0, 500),
        elapsedMs,
      };
    }

    const json = await res.json().catch(() => ({}));
    console.log(
      `[hubspot-recurring-sync] OK in ${elapsedMs}ms — stats:`,
      JSON.stringify(json.stats ?? json),
    );
    return { success: true, elapsedMs, stats: json.stats ?? null };
  },
});
