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

      // Skip: paused.
      // Don't advance state — leave nextDueAt and lastFireKey unchanged so the
      // next tick re-polls and re-evaluates against pauseUntil. The pauseUntil
      // field itself is the audit trail; we lose the "skipped_paused" history
      // value here in exchange for correct package-member behaviour (a paused
      // package member would otherwise deactivate, since computeNextDueAt
      // returns undefined for package members).
      if (row.pauseUntil && nowIso < row.pauseUntil) {
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
        // Pre-drafted: create the approval row first. If that fails, record
        // a failure and move on. If it succeeds, advance state in a separate
        // try so a failure to advance doesn't trigger another failure handler
        // (which would log a misleading error message; we already created
        // the approval). A failure to advance leaves lastFireKey unset, so
        // the next tick would re-fire and create a duplicate — log the
        // condition so it's visible if it happens.
        let approvalCreated = false;
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
          approvalCreated = true;
        } catch (err) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "create_approval",
            message: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
        if (approvalCreated) {
          try {
            await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
              cadenceId: row._id,
              fireKey,
              lastResult: "sent",
              nextDueAt: computeNextDueAt(row),
            });
            fired++;
          } catch (err) {
            // Approval was created but state advance failed. The lastFireKey
            // was not written, so the next tick may re-fire and create a
            // duplicate. Log so it's visible. Worth alerting on if this
            // ever appears in production logs.
            console.error(
              `[cadence-fire] approval created but advanceAfterFire failed for cadence ${row._id}; next tick may duplicate`,
              err,
            );
            failed++;
          }
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
