import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Prospecting inbox (2026-07-17) — the org-wide, client-linked view over
// BOTH mail directions, plus the KPI counts the prospecting section runs on.
//
// The split from /inbox is deliberate:
//   /inbox            = the operator's PRIVATE mailbox mirror (per-user).
//   Prospecting inbox = business correspondence: every email exchange with
//     a client-linked contact, both directions, org-visible (same exposure
//     model as the Replies tab).
//
// Both queries read ONLY the touchpoints ledger — slim rows (subject +
// short excerpt, never bodies). Inbound replies mirror into touchpoints at
// ingest (replyEvents.createInternal) with payloadRef = the replyEvents id;
// outbound rows come from in-app approved sends AND the SENT poller. Full
// reply detail (intent, attachments, resolution) joins back through the
// payloadRef for just the returned page — never in bulk, because reply rows
// carry full bodies and bulk scans trip the 16MiB query read limit (that is
// exactly why this module does NOT query replyEvents directly).

const WINDOW_DAYS_DEFAULT = 45;
const SCAN_CAP = 400;

export type ProspectingInboxRow = {
  kind: "inbound" | "outbound";
  occurredAt: string;
  subject?: string;
  snippet?: string;
  clientId: string;
  clientName: string;
  clientStatus?: string;
  pipelineStage?: string;
  contactId?: string;
  contactName?: string;
  counterpartyEmail?: string;
  replyEventId?: string;
  touchpointId: string;
  classifiedIntent?: string;
  resolvedAt?: string;
  hasAttachments?: boolean;
};

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function loadClientMeta(
  ctx: any,
  ids: Set<string>,
): Promise<Map<string, { name: string; status?: string; pipelineStage?: string }>> {
  const map = new Map<string, { name: string; status?: string; pipelineStage?: string }>();
  for (const id of ids) {
    const c = await ctx.db.get(id as Id<"clients">);
    if (c) {
      map.set(id, {
        name: (c as any).name ?? (c as any).companyName ?? "(unnamed)",
        status: (c as any).status,
        pipelineStage: (c as any).pipelineStage,
      });
    }
  }
  return map;
}

export const list = query({
  args: {
    stage: v.optional(v.string()),          // pipelineStage filter
    direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
    includeNonProspects: v.optional(v.boolean()), // default: prospects only
    windowDays: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ rows: ProspectingInboxRow[]; windowDays: number }> => {
    const limit = Math.min(args.limit ?? 50, 100);
    const windowDays = Math.min(args.windowDays ?? WINDOW_DAYS_DEFAULT, 120);
    const cutoff = isoDaysAgo(windowDays);

    const tps = await ctx.db
      .query("touchpoints")
      .withIndex("by_occurred_at", (q: any) => q.gte("occurredAt", cutoff))
      .order("desc")
      .filter((q: any) =>
        q.and(
          q.eq(q.field("kind"), "email"),
          q.neq(q.field("relatedClientId"), undefined),
          q.neq(q.field("direction"), "internal"),
          ...(args.direction ? [q.eq(q.field("direction"), args.direction)] : []),
        ),
      )
      .take(SCAN_CAP);

    // Client join + prospect/stage filters.
    const meta = await loadClientMeta(
      ctx,
      new Set(tps.map((t: any) => String(t.relatedClientId))),
    );
    const filtered = tps.filter((t: any) => {
      const m = meta.get(String(t.relatedClientId));
      if (!m) return false;
      if (!args.includeNonProspects && m.status !== "prospect") return false;
      if (args.stage && m.pipelineStage !== args.stage) return false;
      return true;
    });

    const page = filtered.slice(0, limit);

    // Per-row enrichment for the PAGE only: reply detail via payloadRef,
    // contact names. Bounded reads (≤limit fat rows).
    const contactNames = new Map<string, string>();
    const rows: ProspectingInboxRow[] = [];
    for (const t of page) {
      const m = meta.get(String(t.relatedClientId))!;
      const row: ProspectingInboxRow = {
        kind: t.direction === "inbound" ? "inbound" : "outbound",
        occurredAt: t.occurredAt,
        subject: t.subject,
        snippet: (t.bodyExcerpt ?? "").slice(0, 160) || undefined,
        clientId: String(t.relatedClientId),
        clientName: m.name,
        clientStatus: m.status,
        pipelineStage: m.pipelineStage,
        contactId: t.contactId ? String(t.contactId) : undefined,
        counterpartyEmail:
          t.direction === "inbound"
            ? (t.participantEmails ?? [])[0]
            : (t.participantEmails ?? [])[1],
        touchpointId: String(t._id),
      };
      if (t.payloadType === "replyEvent" && t.payloadRef) {
        row.replyEventId = t.payloadRef;
        const reply: any = await ctx.db.get(t.payloadRef as Id<"replyEvents">);
        if (reply) {
          row.classifiedIntent = reply.classifiedIntent;
          row.resolvedAt = reply.resolvedAt;
          row.hasAttachments =
            (reply.attachments ?? []).some((a: any) => !a.inline) || undefined;
        }
      }
      if (row.contactId && !contactNames.has(row.contactId)) {
        const c = await ctx.db.get(row.contactId as Id<"contacts">);
        contactNames.set(row.contactId, (c as any)?.name ?? "");
      }
      if (row.contactId) row.contactName = contactNames.get(row.contactId) || undefined;
      rows.push(row);
    }

    return { rows, windowDays };
  },
});

// KPI counts over the same window. byStage keys are the 5 manual pipeline
// stages (plus "unstaged" for prospect rows without one). meetingsHeld =
// linked calendar events whose start already passed inside the window;
// meetingsUpcoming = linked events starting from now (≤90d out) — booked
// forward visibility. Both exclude cancelled events and internal-only
// meetings (the attendee matcher never links those).
export const kpis = query({
  args: {
    sinceDays: v.optional(v.number()),
    includeNonProspects: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const sinceDays = Math.min(args.sinceDays ?? 30, 120);
    const cutoff = isoDaysAgo(sinceDays);
    const nowIso = new Date().toISOString();
    const horizon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    type Bucket = {
      outboundSent: number;
      inboundReceived: number;
      meetingsHeld: number;
      meetingsUpcoming: number;
    };
    const emptyBucket = (): Bucket => ({
      outboundSent: 0,
      inboundReceived: 0,
      meetingsHeld: 0,
      meetingsUpcoming: 0,
    });

    // Collect raw (clientId, field) increments, then join clients once.
    const incs: Array<{ clientId: string; field: keyof Bucket }> = [];
    const touchedProspects = new Set<string>();
    const repliedProspects = new Set<string>();

    const tps = await ctx.db
      .query("touchpoints")
      .withIndex("by_occurred_at", (q: any) => q.gte("occurredAt", cutoff))
      .filter((q: any) =>
        q.and(
          q.eq(q.field("kind"), "email"),
          q.neq(q.field("relatedClientId"), undefined),
        ),
      )
      .collect();
    for (const t of tps) {
      if (t.direction === "outbound") {
        incs.push({ clientId: String(t.relatedClientId), field: "outboundSent" });
      } else if (t.direction === "inbound") {
        incs.push({ clientId: String(t.relatedClientId), field: "inboundReceived" });
      }
    }

    const events = await ctx.db
      .query("events")
      .withIndex("by_start_time", (q: any) => q.gte("startTime", cutoff).lt("startTime", horizon))
      .filter((q: any) =>
        q.and(
          q.neq(q.field("clientId"), undefined),
          q.neq(q.field("status"), "cancelled"),
        ),
      )
      .collect();
    for (const e of events) {
      // Only matcher-linked events count as prospect meetings; a manually
      // client-tagged internal event (no matched contacts) does not.
      if (!e.linkedContactIds || e.linkedContactIds.length === 0) continue;
      incs.push({
        clientId: String(e.clientId),
        field: e.startTime <= nowIso ? "meetingsHeld" : "meetingsUpcoming",
      });
    }

    const meta = await loadClientMeta(ctx, new Set(incs.map((i) => i.clientId)));
    const totals = emptyBucket();
    const byStage: Record<string, Bucket> = {};
    for (const inc of incs) {
      const m = meta.get(inc.clientId);
      if (!m) continue;
      if (!args.includeNonProspects && m.status !== "prospect") continue;
      const stage = m.pipelineStage ?? "unstaged";
      byStage[stage] = byStage[stage] ?? emptyBucket();
      byStage[stage][inc.field]++;
      totals[inc.field]++;
      if (inc.field === "outboundSent") touchedProspects.add(inc.clientId);
      if (inc.field === "inboundReceived") repliedProspects.add(inc.clientId);
    }

    return {
      sinceDays,
      totals: {
        ...totals,
        uniqueProspectsContacted: touchedProspects.size,
        uniqueProspectsReplied: repliedProspects.size,
      },
      byStage,
    };
  },
});
