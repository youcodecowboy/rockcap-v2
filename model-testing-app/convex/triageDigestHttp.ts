import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { sha256HexForTokens } from "./mcpTokens";

// GET /triage-digest — compact outreach digest for the RockCap-MCP
// stage-workspace SessionStart hook (2026-07-14).
//
// Authenticated by the SAME per-user MCP bearer token that authenticates
// /mcp — the hook machine already has it in .mcp.json, so the digest needs
// ZERO additional credentials or setup. (This replaced a short-lived
// TRIAGE_DIGEST_KEY design: a second shared secret was redundant when every
// operator laptop already carries a revocable per-user token that grants
// strictly more access via the MCP tools.)
//
//   GET https://<deployment>.convex.site/triage-digest?stage=cold_outreach&days=7
//   Authorization: Bearer <mcp token>
//
// stage — optional pipelineStage; filters client-linked sections (items with
//         no resolvable stage are kept: a dead-end reply belongs in every
//         stage's digest until routed).
// days  — upcoming-sends horizon (default 7, max 90).

const TOP_N = 8; // per-section item cap — the full list is one MCP call away

type StagedItem = { client?: { pipelineStage?: string | null } | null };

function matchesStage(item: StagedItem, stage: string | null): boolean {
  if (!stage) return true;
  const s = item.client?.pipelineStage;
  return !s || s === stage;
}

export const triageDigestHandler = httpAction(async (ctx, request) => {
  const authHeader =
    request.headers.get("Authorization") ?? request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header. Expected: Bearer <mcp-token>" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }
  const tokenHash = await sha256HexForTokens(authHeader.slice(7).trim());
  const auth = await ctx.runQuery(internal.mcpTokens.validateTokenByHashInternal, {
    tokenHash,
  });
  if (!auth) {
    return new Response(JSON.stringify({ error: "invalid or revoked token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const stage = url.searchParams.get("stage");
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 7, 1), 90);

  const [triage, upcoming] = await Promise.all([
    ctx.runQuery(api.outreachTriage.triageQueue, {}),
    ctx.runQuery(api.outreachTriage.listUpcoming, { daysAhead: days }),
  ]);

  const pick = <T extends StagedItem>(items: T[]) => {
    const filtered = items.filter((i) => matchesStage(i, stage));
    return { count: filtered.length, top: filtered.slice(0, TOP_N) };
  };
  const touches = upcoming.touches.filter((t: StagedItem) => matchesStage(t, stage));

  const digest = {
    generatedAt: triage.generatedAt,
    stage: stage ?? "all",
    horizonDays: days,
    attention: {
      pendingPackages: pick(triage.pendingPackages),
      needsContact: pick(triage.needsContact),
      replyDrafts: pick(triage.replyDrafts),
      otherApprovals: pick(triage.otherApprovals),
      failedSends: pick(triage.failedSends),
      unroutedReplies: pick(triage.unroutedReplies),
      // Dead-end replies carry no client link, so no stage filter applies.
      deadEndReplies: {
        count: triage.deadEndReplies.length,
        top: triage.deadEndReplies.slice(0, TOP_N),
      },
      stalledCadences: pick(triage.stalledCadences),
      flaggedClients: {
        count: triage.flaggedClients.length,
        top: triage.flaggedClients.slice(0, TOP_N),
      },
      staleIntel: {
        count: triage.staleIntel.length,
        top: triage.staleIntel.slice(0, TOP_N),
      },
    },
    upcomingSends: {
      counts: {
        total: touches.length,
        willFire: touches.filter(
          (t: any) => t.fireStatus === "scheduled" || t.fireStatus === "due_now",
        ).length,
        blocked: touches.filter((t: any) => t.fireStatus.startsWith("blocked")).length,
        paused: touches.filter((t: any) => t.fireStatus === "paused").length,
      },
      next: touches.slice(0, TOP_N * 2),
    },
  };

  return new Response(JSON.stringify(digest), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
