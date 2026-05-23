import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

// Cadence dispatcher (cadence-fire v1).
//
// Runs every 5 minutes via crons.ts. Polls due cadences (isActive + nextDueAt
// past), runs skip checks, and either creates an approval directly for
// pre-drafted touches OR (v1.1) calls out to the composer for dynamic types.
//
// v1 scope: pre-drafted only. If preDraftedTouch is absent, log an error
// and mark the row failed (v1.1 will route to the composer).
//
// findDueInternal does not pre-filter on pauseUntil; the dispatcher checks
// it in-process and skips. Cheap given the 100-row cap.

const MAX_ROWS_PER_TICK = 100;

export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const nowIso = new Date().toISOString();

    const dueRows = await ctx.runQuery(internal.cadences.findDueInternal, {
      nowIso,
      limit: MAX_ROWS_PER_TICK,
    });

    let fired = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of dueRows) {
      const fireKey = `${row._id}:${row.nextDueAt}`;

      // Idempotency: already fired this nextDueAt window
      if (row.lastFireKey === fireKey) {
        skipped++;
        continue;
      }

      // Skip: paused
      if (row.pauseUntil && nowIso < row.pauseUntil) {
        await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
          cadenceId: row._id,
          fireKey,
          lastResult: "skipped_paused",
          nextDueAt: computeNextDueAt(row),
        });
        skipped++;
        continue;
      }

      // Skip: contact opted out
      const contact = await ctx.runQuery(internal.contacts.getInternal, {
        contactId: row.contactId,
      });
      if (contact?.optedOutAt) {
        await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
          cadenceId: row._id,
          fireKey,
          lastResult: "skipped_user_opted_out",
          nextDueAt: undefined,  // deactivate
        });
        skipped++;
        continue;
      }

      // Branch on drafting mode
      if (row.preDraftedTouch) {
        // Pre-drafted: create the approval row directly
        try {
          await ctx.runMutation(internal.approvals.internalCreate, {
            entityType: "gmail_send",
            summary: row.preDraftedTouch.subject.slice(0, 200),
            draftPayload: {
              to: contact?.email ?? "(no email on contact)",
              subject: row.preDraftedTouch.subject,
              bodyText: row.preDraftedTouch.bodyText,
              bodyHtml: row.preDraftedTouch.bodyHtml,
            },
            requestedBy: row.createdBy,
            requestSource: "cadence",
            requestSourceName: "cadence-fire",
            relatedClientId: row.relatedClientId,
            relatedProjectId: row.relatedProjectId,
            relatedContactId: row.contactId,
            relatedCadenceId: row._id,
          });
          await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
            cadenceId: row._id,
            fireKey,
            lastResult: "sent",
            nextDueAt: computeNextDueAt(row),
          });
          fired++;
        } catch (err) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "create_approval",
            message: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
      } else {
        // Dynamic-compose: v1.1 will route here. v1 marks failed.
        await ctx.runMutation(internal.cadences.recordFailureInternal, {
          cadenceId: row._id,
          step: "dynamic_compose_unavailable",
          message:
            "v1 ships pre-drafted only; dynamic compose deferred to v1.1. Add preDraftedTouch to cadence row or wait for v1.1 composer.",
        });
        failed++;
      }
    }

    return { fired, skipped, failed, polled: dueRows.length };
  },
});

// Helper: compute the next due-at for a cadence after a successful fire.
// Returns undefined for one-shot package members (which deactivates).
function computeNextDueAt(row: {
  scheduleConfig: { intervalDays?: number };
  packageId?: string;
  packageOrder?: number;
}): string | undefined {
  // Package members are one-shots; they don't recur themselves.
  // (The package as a whole is a sequence of multiple cadence rows
  // each with its own nextDueAt; once a member fires, it's done.)
  if (row.packageId) {
    return undefined;
  }
  // Recurring (no package): advance by intervalDays
  const intervalDays = row.scheduleConfig.intervalDays;
  if (!intervalDays) {
    return undefined;  // one-shot non-package
  }
  const next = new Date(Date.now() + intervalDays * 86_400_000);
  return next.toISOString();
}
