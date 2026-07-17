import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { INTEL_STALE_DAYS } from "./lib/pipelineStages";

// ─────────────────────────────────────────────────────────────────────────
// Intel-revalidate (mode 2) — the cheap, diff-focused freshness pass.
//
// Full prospect-intel (mode 1) is unchanged and lives in the prospect-intel
// skill. This module owns the *lightweight* re-check: given a prospect that
// already has a full intel report, ask "has anything materially changed since
// then?" (new/satisfied CH charges, company-status change, new planning /
// scheme activity, news) and return still_valid | materially_changed.
//
// Split (matching the cadence-compose pattern):
//   • /api/intel-revalidate  — the pure-functional LLM diff engine (no writes).
//   • this module            — orchestration: opens a skillRuns row, calls the
//                              route, records the verdict, stamps client
//                              freshness, and raises the attention flag.
//
// Two triggers feed this:
//   A. Meeting booked + last full intel >7d old  → onMeetingBookedInternal
//      raises a "refresh intel" attention flag (no LLM call — just a nudge).
//   B. Cadence gap >30d before a touch fires      → cadenceDispatcher calls
//      runRevalidateInternal synchronously; materially_changed holds the send.
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

// ── Shared helper: raise the intel-attention flag on a client ────────────
// Patches clients directly (allowed from this module; clients.ts is not edited).
// Sets the attention timestamp + reason and clears any prior "cleared" marker
// so the requires-attention surface re-shows it.
async function applySetAttention(
  ctx: { db: { patch: (id: Id<"clients">, patch: Record<string, unknown>) => Promise<void> } },
  clientId: Id<"clients">,
  reason: "meeting_booked_stale" | "revalidate_materially_changed",
) {
  await ctx.db.patch(clientId, {
    intelAttentionAt: new Date().toISOString(),
    intelAttentionReason: reason,
    intelAttentionClearedAt: undefined,
  });
}

// ── Run-context resolver for the system-initiated (cron/dispatcher) path ──
// skillRuns require a real userId (audit / by_user reads). There is no auth
// identity in an action/cron context, so resolve a stable one: the first user
// in the table. Also returns the client's CH number + last full-intel date so
// runRevalidateInternal can fill in missing args.
export const resolveRunContextInternal = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    const firstUser = await ctx.db.query("users").first();
    if (!firstUser) throw new Error("no_user_for_system_skillrun");

    // Prefer the denormalised lastFullIntelAt; fall back to the latest
    // prospect-intel run's completedAt for legacy prospects whose stamp predates
    // the denormalisation.
    let lastFullIntelAt: string | undefined = (client as any)?.lastFullIntelAt;
    if (!lastFullIntelAt) {
      const runs = await ctx.db.query("skillRuns").order("desc").collect();
      const latestFull = runs.find(
        (r) => r.linkedClientId === args.clientId && r.skillName === "prospect-intel",
      );
      lastFullIntelAt = latestFull?.completedAt;
    }

    return {
      userId: firstUser._id,
      companyNumber: (client as any)?.companiesHouseNumber as string | undefined,
      lastFullIntelAt,
    };
  },
});

// ── Trigger-B context for the cadence dispatcher ─────────────────────────
// Single read that gives the dispatcher everything it needs to decide whether
// to revalidate before firing: the gap base (lastOutreachSendAt), the 7-day
// re-run guard base (lastIntelRevalidateAt), and the args runRevalidateInternal
// needs (companyNumber, lastFullIntelAt = sinceIso).
export const getTriggerBContextInternal = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return null;
    return {
      lastOutreachSendAt: (client as any).lastOutreachSendAt as string | undefined,
      lastIntelRevalidateAt: (client as any).lastIntelRevalidateAt as string | undefined,
      lastFullIntelAt: (client as any).lastFullIntelAt as string | undefined,
      companyNumber: (client as any).companiesHouseNumber as string | undefined,
    };
  },
});

// ── Internal mutation: raise the attention flag (action → mutation path) ──
export const setAttentionInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    reason: v.union(
      v.literal("meeting_booked_stale"),
      v.literal("revalidate_materially_changed"),
    ),
  },
  handler: async (ctx, args) => {
    await applySetAttention(ctx, args.clientId, args.reason);
    return { ok: true };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Trigger A — meeting booked + stale full intel.
//
// PINNED cross-leaf name: convex/meetings.ts schedules this via
//   ctx.scheduler.runAfter(0, internal.intelRevalidate.onMeetingBookedInternal,
//                          { clientId, meetingId })
// Do NOT rename. The staleness decision lives here (one line at the call site).
// ─────────────────────────────────────────────────────────────────────────
export const onMeetingBookedInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    meetingId: v.optional(v.id("meetings")),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return { ok: false, reason: "client_not_found" as const };

    let lastFullIntelAt: string | undefined = (client as any).lastFullIntelAt;
    if (!lastFullIntelAt) {
      // Legacy fallback: walk skillRuns for the most recent full-intel run.
      const runs = await ctx.db.query("skillRuns").order("desc").collect();
      const latestFull = runs.find(
        (r) => r.linkedClientId === args.clientId && r.skillName === "prospect-intel",
      );
      lastFullIntelAt = latestFull?.completedAt;
    }

    const ageMs = lastFullIntelAt ? Date.now() - Date.parse(lastFullIntelAt) : undefined;
    const ageDays = ageMs !== undefined && isFinite(ageMs) ? ageMs / DAY_MS : undefined;
    // Missing intel OR older than the staleness window → nudge the operator.
    const stale = ageDays === undefined || ageDays >= INTEL_STALE_DAYS;

    if (stale) {
      await applySetAttention(ctx, args.clientId, "meeting_booked_stale");
      return { ok: true, raised: true, ageDays: ageDays ?? null };
    }
    return { ok: true, raised: false, ageDays };
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Mode-2 engine orchestration — opens a skillRuns row, calls the diff route,
// records the verdict + freshness stamps, and (on materially_changed) raises
// the attention flag. Returns the verdict so the dispatcher (Trigger B) can
// decide to fire or hold. FAIL-OPEN: any route/transport error resolves to
// still_valid so a flaky CH/LLM call never silently blocks outreach.
// ─────────────────────────────────────────────────────────────────────────
export const runRevalidateInternal = internalAction({
  args: {
    clientId: v.id("clients"),
    companyNumber: v.optional(v.string()),
    sinceIso: v.optional(v.string()),
    reason: v.optional(v.string()),
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ result: "still_valid" | "materially_changed"; error?: string }> => {
    const reason = args.reason ?? "manual_recheck";

    const context = await ctx.runQuery(
      internal.intelRevalidate.resolveRunContextInternal,
      { clientId: args.clientId },
    );
    const userId = context.userId;
    const companyNumber = args.companyNumber ?? context.companyNumber;
    const sinceIso = args.sinceIso ?? context.lastFullIntelAt;

    // Open a system-context skillRuns row. dedupKey = CH number (short window;
    // revalidate is cheap and meant to run often).
    const runId = await ctx.runMutation(internal.skillRuns.createInternal, {
      skillName: "intel-revalidate",
      userId,
      input: {
        clientId: args.clientId,
        companyNumber,
        sinceIso,
        reason,
        triggeredBy: args.triggeredBy ?? "system",
      },
      trigger: reason,
      dedupKey: companyNumber,
      dedupWindowDays: 1,
      status: "running",
    });

    // Call the pure-functional diff route. FAIL-OPEN on any error.
    let result: "still_valid" | "materially_changed" = "still_valid";
    let summary = "";
    let findings: Array<{ kind: string; detail: string; sourceUrl?: string }> = [];
    let routeError: string | undefined;

    const appUrl = process.env.NEXT_APP_URL;
    if (!appUrl) {
      routeError = "NEXT_APP_URL not set";
    } else {
      try {
        const res = await fetch(`${appUrl}/api/intel-revalidate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "",
          },
          body: JSON.stringify({
            clientId: args.clientId,
            companyNumber,
            sinceIso,
            reason,
          }),
        });
        if (!res.ok) {
          routeError = `revalidate route returned ${res.status}`;
        } else {
          const data = await res.json();
          if (data?.result === "materially_changed" || data?.result === "still_valid") {
            result = data.result;
            summary = typeof data.summary === "string" ? data.summary : "";
            findings = Array.isArray(data.findings) ? data.findings : [];
          } else {
            routeError = "revalidate route returned an unexpected shape";
          }
        }
      } catch (err) {
        routeError = err instanceof Error ? err.message : String(err);
      }
    }

    const intelMarkdown = renderFindings(result, summary, findings, routeError);

    // Complete the run. completeInternal denormalises lastIntelRevalidateAt +
    // lastIntelResult onto the linked client. Even fail-open runs are recorded
    // as complete (the gap is captured in the errors[] array) so the freshness
    // clock advances and Trigger B's 7-day guard doesn't re-run every tick.
    await ctx.runMutation(internal.skillRuns.completeInternal, {
      runId,
      userId,
      status: "complete",
      brief: summary || (routeError ? `Revalidate unavailable (${routeError}); treated as still_valid.` : "No material change since last full intel."),
      intelMarkdown,
      revalidateResult: result,
      linkedClientId: args.clientId,
      errors: routeError ? [{ step: "revalidate_route", message: routeError }] : undefined,
    });

    if (result === "materially_changed") {
      await ctx.runMutation(internal.intelRevalidate.setAttentionInternal, {
        clientId: args.clientId,
        reason: "revalidate_materially_changed",
      });
    }

    return routeError ? { result, error: routeError } : { result };
  },
});

// Render the verdict + findings into the intelMarkdown surface the Intel tab
// reads. Kept lightweight and visually distinct from a full prospect-intel report.
function renderFindings(
  result: "still_valid" | "materially_changed",
  summary: string,
  findings: Array<{ kind: string; detail: string; sourceUrl?: string }>,
  routeError?: string,
): string {
  const lines: string[] = [];
  lines.push(`# Intel re-validation — ${result === "materially_changed" ? "Materially changed" : "Still valid"}`);
  lines.push("");
  if (summary) {
    lines.push(summary);
    lines.push("");
  }
  if (findings.length > 0) {
    lines.push("## Findings");
    for (const f of findings) {
      const src = f.sourceUrl ? ` ([source](${f.sourceUrl}))` : "";
      lines.push(`- **${f.kind}** — ${f.detail}${src}`);
    }
    lines.push("");
  } else if (result === "still_valid") {
    lines.push("_No material change detected against the last full intel report._");
    lines.push("");
  }
  if (routeError) {
    lines.push(`> Re-validation engine was unavailable (${routeError}); fail-open verdict recorded as still_valid.`);
  }
  return lines.join("\n");
}

// ── Clear the intel-attention flag (operator dismiss / fresh full intel) ──
export const clearIntelAttentionInternal = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.clientId, {
      intelAttentionAt: undefined,
      intelAttentionReason: undefined,
      intelAttentionClearedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

export const clearIntelAttention = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Parity with the other public dismiss mutations: resolve the acting user
    // for audit (no audit column today; clearing carries no extra metadata).
    await ctx.auth.getUserIdentity();
    await ctx.db.patch(args.clientId, {
      intelAttentionAt: undefined,
      intelAttentionReason: undefined,
      intelAttentionClearedAt: new Date().toISOString(),
    });
    return { ok: true };
  },
});

// ── Public trigger for the Intel-tab "Run quick re-check" button ─────────
// Schedules the mode-2 pass off the request path so the UI doesn't block on the
// LLM round-trip. The verdict lands as a new intel-revalidate skillRun + the
// client freshness stamps (read back live via the Intel tab queries).
export const requestRevalidate = mutation({
  args: {
    clientId: v.id("clients"),
    companyNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.intelRevalidate.runRevalidateInternal, {
      clientId: args.clientId,
      companyNumber: args.companyNumber,
      reason: "manual_recheck",
      triggeredBy: "operator",
    });
    return { ok: true, scheduled: true };
  },
});
