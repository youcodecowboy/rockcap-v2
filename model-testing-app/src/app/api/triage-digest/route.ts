import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

// Triage digest (outreach triage backbone, 2026-07-14).
//
// Compact "state of play" JSON for the RockCap-MCP stage-workspace
// SessionStart hook: when the operator opens a Claude Code chat inside a
// prospecting stage folder, the hook curls this route and injects the digest
// into the chat's opening context — the session starts already knowing what
// is outstanding, what replies came in, and what fires next, without burning
// MCP round-trips on discovery.
//
// Auth: bearer TRIAGE_DIGEST_KEY (a dedicated read-only key for the operator's
// laptop — NOT CONVEX_INTERNAL_SECRET, which authorises server-to-server
// writes). The route is on the Clerk middleware public list (cookie-less
// caller), same pattern as /api/classify-reply-intent.
//
// GET /api/triage-digest?stage=cold_outreach&days=7
//   stage  optional pipelineStage — filters client-linked sections to that
//          stage (items with no resolvable stage are kept: a dead-end reply
//          belongs in every stage's digest until routed).
//   days   upcoming-sends horizon (default 7).

export const runtime = "nodejs";
export const maxDuration = 30;

const TOP_N = 8; // per-section item cap in the digest — full list via MCP

type StagedItem = { client?: { pipelineStage?: string | null } | null };

function matchesStage(item: StagedItem, stage: string | null): boolean {
  if (!stage) return true;
  const s = item.client?.pipelineStage;
  return !s || s === stage; // unknown-stage items stay visible everywhere
}

export async function GET(request: NextRequest) {
  const key = process.env.TRIAGE_DIGEST_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "TRIAGE_DIGEST_KEY not configured" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${key}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";
  if (!convexUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_CONVEX_URL not configured" },
      { status: 500 },
    );
  }
  const convex = new ConvexHttpClient(convexUrl);

  const { searchParams } = new URL(request.url);
  const stage = searchParams.get("stage");
  const days = Math.min(Math.max(Number(searchParams.get("days")) || 7, 1), 90);

  const [triage, upcoming] = await Promise.all([
    convex.query(api.outreachTriage.triageQueue, {}),
    convex.query(api.outreachTriage.listUpcoming, { daysAhead: days }),
  ]);

  const pick = <T extends StagedItem>(items: T[]) => {
    const filtered = items.filter((i) => matchesStage(i, stage));
    return { count: filtered.length, top: filtered.slice(0, TOP_N) };
  };

  const touches = upcoming.touches.filter((t: StagedItem) =>
    matchesStage(t, stage),
  );

  return NextResponse.json({
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
        blocked: touches.filter((t: any) => t.fireStatus.startsWith("blocked"))
          .length,
        paused: touches.filter((t: any) => t.fireStatus === "paused").length,
      },
      next: touches.slice(0, TOP_N * 2),
    },
  });
}
