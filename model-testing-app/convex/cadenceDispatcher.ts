import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  CADENCE_REVALIDATE_GAP_DAYS,
  INTEL_STALE_DAYS,
} from "./lib/pipelineStages";

// Trigger-B knobs. CADENCE_REVALIDATE_GAP_DAYS (30): a touch whose gap since the
// client's last outreach send exceeds this triggers an intel-revalidate before
// firing. INTEL_STALE_DAYS (7) doubles as the re-run guard — once we've
// revalidated within 7 days, don't revalidate again on every 5-min tick (so a
// held cadence doesn't hammer the route).
const DAY_MS = 86_400_000;

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

      // Phase 3 assertion: a contactless held draft (needs_contact) must never
      // reach here. findDueInternal already excludes it twice — its index
      // predicate requires isActive=true and held drafts are isActive=false,
      // and its filter only passes packageApprovalStatus approved/undefined
      // whereas held drafts are "needs_contact". This guard is belt-and-braces
      // (and narrows row.contactId to a non-optional id for getInternal below):
      // if a contactless row ever appears, skip it rather than fire.
      if (!row.contactId) {
        skipped++;
        continue;
      }

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

      // No deliverable address → record a failure rather than staging an
      // approval whose send can never succeed. (The gmail_send executor
      // requires a non-empty recipient array; a placeholder string would
      // just defer the failure to approve time, where it's invisible.)
      if (!contact?.email) {
        await ctx.runMutation(internal.cadences.recordFailureInternal, {
          cadenceId: row._id,
          step: "no_contact_email",
          message: "Contact has no email address on file; cannot stage send",
        });
        failed++;
        continue;
      }

      // ── Trigger B: 30-day cadence-gap intel re-validation ──────────────
      // Before firing a due touch, if the gap since this prospect's last
      // outreach send exceeds 30 days, run the cheap intel-revalidate pass.
      //   • still_valid (or revalidate errored — fail-open) → fire as normal.
      //   • materially_changed → HOLD the touch (deactivate but preserve
      //     nextDueAt) and DO NOT fire stale outreach; the held touch is
      //     re-draftable via cadences.clearIntelHoldInternal.
      // A 7-day guard on lastIntelRevalidateAt stops us re-running every tick
      // (e.g. while a touch sits held). First-ever touches have no
      // lastOutreachSendAt base, so Trigger B correctly never fires there.
      if (row.relatedClientId) {
        const fresh = await ctx.runQuery(
          internal.intelRevalidate.getTriggerBContextInternal,
          { clientId: row.relatedClientId },
        );
        if (fresh?.lastOutreachSendAt) {
          const gapMs = Date.parse(row.nextDueAt) - Date.parse(fresh.lastOutreachSendAt);
          const recentlyRevalidated =
            !!fresh.lastIntelRevalidateAt &&
            Date.now() - Date.parse(fresh.lastIntelRevalidateAt) < INTEL_STALE_DAYS * DAY_MS;
          if (
            isFinite(gapMs) &&
            gapMs > CADENCE_REVALIDATE_GAP_DAYS * DAY_MS &&
            !recentlyRevalidated
          ) {
            let verdict: { result: "still_valid" | "materially_changed" };
            try {
              verdict = await ctx.runAction(
                internal.intelRevalidate.runRevalidateInternal,
                {
                  clientId: row.relatedClientId,
                  companyNumber: fresh.companyNumber,
                  sinceIso: fresh.lastFullIntelAt,
                  reason: "cadence_gap_30d",
                  triggeredBy: "cadence_dispatcher",
                },
              );
            } catch {
              // Fail-open: a thrown revalidate must not block outreach. Fire.
              verdict = { result: "still_valid" };
            }
            if (verdict.result === "materially_changed") {
              await ctx.runMutation(internal.cadences.holdForIntelInternal, {
                cadenceId: row._id,
                reason: "intel_materially_changed",
              });
              skipped++;
              continue;
            }
            // still_valid → fall through to the normal fire path below.
          }
        }
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
              // MUST be an array: the gmail_send executor's composeRfc822
              // maps over payload.to (requestSend validates this shape, but
              // internalCreate's draftPayload is untyped — see #wiring bug
              // where a bare string crashed the send at approve time).
              to: [contact.email],
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
            // Single-gate: the operator's package approval covered this
            // exact pre-drafted touch, so don't park the send behind a
            // second pending gate — execute immediately (kill-switches
            // still enforced at execute time). Legacy/non-package rows
            // (packageApprovalStatus undefined) keep the pending gate.
            autoApprove: row.packageApprovalStatus === "approved",
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
              lastResult: "approval_staged",
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
        // Dynamic-compose (v1.1): fetch from /api/cadence-compose, then
        // create the approval row from the composed touch.
        const appUrl = process.env.NEXT_APP_URL;
        if (!appUrl) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "compose_no_app_url",
            message: "NEXT_APP_URL env var not set; cannot reach composer",
          });
          failed++;
          continue;
        }

        let composeResult:
          | { touch: { subject: string; bodyText: string; bodyHtml: string } }
          | { skip: true; reason: string }
          | { error: string }
          | null = null;
        try {
          const res = await fetch(`${appUrl}/api/cadence-compose`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "",
            },
            body: JSON.stringify({ cadenceId: row._id }),
          });
          if (!res.ok) {
            composeResult = { error: `composer returned ${res.status}` };
          } else {
            composeResult = await res.json();
          }
        } catch (err) {
          composeResult = {
            error: err instanceof Error ? err.message : String(err),
          };
        }

        if (composeResult && "error" in composeResult) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "compose_call",
            message: composeResult.error,
          });
          failed++;
          continue;
        }

        if (composeResult && "skip" in composeResult) {
          // Composer's evidence-or-skip rule: advance nextDueAt so the cadence
          // comes around again next interval, recording skipped_paused.
          await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
            cadenceId: row._id,
            fireKey,
            lastResult: "skipped_paused",
            nextDueAt: computeNextDueAt(row),
          });
          skipped++;
          continue;
        }

        if (!composeResult || !("touch" in composeResult)) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "compose_invalid_response",
            message: "composer returned an unexpected shape",
          });
          failed++;
          continue;
        }

        // Create approval + advance, using the same two-try pattern as the
        // pre-drafted branch. Approval creation and state advance are separate
        // try scopes so a failure to advance doesn't log a misleading error
        // for the already-created approval.
        let approvalCreated = false;
        try {
          await ctx.runMutation(internal.approvals.internalCreate, {
            entityType: "gmail_send",
            summary: composeResult.touch.subject.slice(0, 200),
            draftPayload: {
              // Array shape required by the gmail_send executor — see the
              // pre-drafted branch above.
              to: [contact.email],
              subject: composeResult.touch.subject,
              bodyText: composeResult.touch.bodyText,
              bodyHtml: composeResult.touch.bodyHtml,
            },
            requestedBy: row.createdBy,
            requestSource: "cadence",
            requestSourceName: "cadence-fire (composed)",
            relatedClientId: row.relatedClientId,
            relatedProjectId: row.relatedProjectId,
            relatedContactId: row.contactId,
            relatedCadenceId: row._id,
            // NOTE: composed touches are NOT auto-approved — unlike
            // pre-drafted package touches, the operator has never seen this
            // content (it was composed at fire time), so the pending
            // approval gate is the operator's first review of it.
          });
          approvalCreated = true;
        } catch (err) {
          await ctx.runMutation(internal.cadences.recordFailureInternal, {
            cadenceId: row._id,
            step: "create_approval_composed",
            message: err instanceof Error ? err.message : String(err),
          });
          failed++;
        }
        if (approvalCreated) {
          try {
            await ctx.runMutation(internal.cadences.advanceAfterFireInternal, {
              cadenceId: row._id,
              fireKey,
              lastResult: "approval_staged",
              nextDueAt: computeNextDueAt(row),
            });
            fired++;
          } catch (err) {
            console.error(
              `[cadence-fire] composed approval created but advanceAfterFire failed for cadence ${row._id}; next tick may duplicate`,
              err,
            );
            failed++;
          }
        }
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
