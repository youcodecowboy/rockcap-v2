import { internalAction } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Recurring HubSpot sync — scheduled via a Convex cron in convex/crons.ts.
 *
 * Behaviour:
 *  1. Read the hubspotSyncConfig singleton. If `isRecurringSyncEnabled` is
 *     false (or no config row exists), skip. Operator controls this via
 *     the toggle on the desktop HubSpot settings page.
 *  2. Otherwise POST to `/api/hubspot/sync-all` FOUR TIMES in sequence —
 *     once per entity phase (companies → contacts → deals → activities).
 *     Each HTTP call is an independent Vercel function invocation with
 *     its own 300s budget, so the slow phase (activities, per-company
 *     engagement walk) can't starve the fast phases.
 *  3. The sync-all route reads `config.lastSyncAt` on each call, passes
 *     it as `since`, and updates lastSyncAt on the LAST successful phase
 *     (activities) — so the window advances once per full cycle.
 *
 * Why per-phase calls instead of one big call:
 *  - A single call that does all four phases has to fit inside Vercel's
 *    300s limit. Per-company engagement walks alone can chew 60–120s on
 *    a busy portal, leaving no safety margin. Four calls = 4×300s.
 *  - If activities times out, companies/contacts/deals already landed.
 *    We don't lose a whole cycle to one slow phase.
 *  - Convex mutations resolve cross-entity FKs via `by_hubspot_id`
 *    indexes — order doesn't matter for correctness. An activity that
 *    syncs before its contact just carries an empty `linkedContactIds`
 *    and self-heals on the next cycle.
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

type Phase = "companies" | "contacts" | "deals" | "activities";

const PHASES: Phase[] = ["companies", "contacts", "deals", "activities"];

function phaseFlags(phase: Phase) {
  return {
    syncCompanies: phase === "companies",
    syncContacts: phase === "contacts",
    syncDeals: phase === "deals",
    syncActivities: phase === "activities",
  };
}

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

    // Normalize NEXT_APP_URL:
    //   - auto-prepend https:// if the operator dropped the scheme
    //     (Node's fetch throws "Invalid URL" on scheme-less inputs)
    //   - strip trailing slash so template literal doesn't produce a //
    const normalized = apiBase.match(/^https?:\/\//)
      ? apiBase
      : `https://${apiBase}`;
    const url = `${normalized.replace(/\/$/, "")}/api/hubspot/sync-all`;

    const overallStartedAt = Date.now();
    const phaseResults: Record<
      Phase,
      { ok: boolean; status?: number; elapsedMs: number; stats?: any; error?: string }
    > = {} as any;

    for (const phase of PHASES) {
      const phaseStartedAt = Date.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Cron-Secret": secret,
          },
          body: JSON.stringify({
            mode: "incremental",
            ...phaseFlags(phase),
          }),
        });

        const elapsedMs = Date.now() - phaseStartedAt;
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.error(
            `[hubspot-recurring-sync] phase ${phase} failed: ` +
              `HTTP ${res.status} in ${elapsedMs}ms — ${body.slice(0, 500)}`,
          );
          phaseResults[phase] = {
            ok: false,
            status: res.status,
            elapsedMs,
            error: body.slice(0, 500),
          };
          // Don't abort the cycle — later phases may still succeed (e.g.
          // a transient 502 on companies shouldn't block activities).
          continue;
        }

        const json = await res.json().catch(() => ({}));
        console.log(
          `[hubspot-recurring-sync] phase ${phase} OK in ${elapsedMs}ms — stats:`,
          JSON.stringify(json.stats ?? json),
        );
        phaseResults[phase] = {
          ok: true,
          status: res.status,
          elapsedMs,
          stats: json.stats ?? null,
        };
      } catch (err: any) {
        const elapsedMs = Date.now() - phaseStartedAt;
        console.error(
          `[hubspot-recurring-sync] phase ${phase} threw in ${elapsedMs}ms: ${err?.message ?? err}`,
        );
        phaseResults[phase] = {
          ok: false,
          elapsedMs,
          error: err?.message ?? String(err),
        };
      }
    }

    const overallElapsedMs = Date.now() - overallStartedAt;
    const okCount = Object.values(phaseResults).filter((r) => r.ok).length;
    console.log(
      `[hubspot-recurring-sync] cycle finished in ${overallElapsedMs}ms — ` +
        `${okCount}/${PHASES.length} phases succeeded`,
    );

    return {
      success: okCount === PHASES.length,
      partial: okCount > 0 && okCount < PHASES.length,
      phases: phaseResults,
      elapsedMs: overallElapsedMs,
    };
  },
});
