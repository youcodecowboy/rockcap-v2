import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Knowledge-layer API lane — Spec 2 §11 + §14b.1 (incremental atomization).
// (docs/spec-2-knowledge-layer.md)
//
// This is the CHEAP incremental path. The `ingestionEvents` feed (Spec 1)
// appends one row per document that enters/changes in the corpus; this
// consumer tails it and re-atomizes changed documents at API cost (a couple
// of cents each). Bulk work — onboarding, backfills, the pre-Drive migration
// — runs through the Claude Code harness lane (the atomize-document skill +
// atoms.* MCP tools) at subscription cost, never here.
//
// ── Watermark decision (schema is FROZEN this phase) ──
// A `knowledgeConfig` singleton table is NOT allowed. Instead of storing a
// watermark, `sweep` derives "is this event already handled?" from the
// atomObservations table itself: an ingestionEvent is PENDING when NO
// atomObservations exist for its (documentId, contentChecksum) pair. This is
// idempotent for free — a re-run never double-atomizes a doc whose
// observations already landed.
//
// ── The cost wall (§14b.1) ──
// The API lane only atomizes documents whose client is ALREADY
// knowledge-enabled — i.e. the client has at least one atom (seeded by the
// harness lane during onboarding). A client that was never onboarded via the
// harness lane has zero atoms, so the API lane skips its documents entirely.
// This prevents the incremental path from silently atomizing the whole
// corpus one Drive edit at a time.

const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_PER_TICK = 3;

/** Ingestion events in the last 48h (by_at index; `at` is an ISO string, so
 * lexicographic >= is chronological). */
export const recentIngestionEvents = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
    return await ctx.db
      .query("ingestionEvents")
      .withIndex("by_at", (q) => q.gte("at", cutoff))
      .collect();
  },
});

/** Minimal document meta for routing + gating. */
export const docForEvent = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;
    const d = doc as any;
    return {
      _id: doc._id,
      clientId: (d.clientId ?? null) as Id<"clients"> | null,
      projectId: (d.projectId ?? null) as Id<"projects"> | null,
      contentChecksum: (d.contentChecksum ?? null) as string | null,
      textContent: (d.textContent ?? null) as string | null,
      fileName: (d.fileName ?? null) as string | null,
      category: (d.category ?? null) as string | null,
      fileTypeDetected: (d.fileTypeDetected ?? null) as string | null,
    };
  },
});

/** True when this (document, checksum) already has provenance — the event is
 * already handled and must not be re-atomized. */
export const hasObservationsForDoc = internalQuery({
  args: {
    documentId: v.id("documents"),
    contentChecksum: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const obs = await ctx.db
      .query("atomObservations")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    if (args.contentChecksum) {
      return obs.some((o) => o.contentChecksum === args.contentChecksum);
    }
    return obs.length > 0;
  },
});

/** The §14b.1 cost wall: does this client have ANY atoms (knowledge-enabled)? */
export const clientHasAtoms = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const first = await ctx.db
      .query("atoms")
      .withIndex("by_client_status", (q) => q.eq("clientId", args.clientId))
      .first();
    return first !== null;
  },
});

/** TIGHTENED cost wall (operator decision 2026-07-07): the API lane only
 * re-atomizes documents that were ALREADY atomized once (observations exist
 * for this documentId under some PRIOR checksum). A never-atomized document —
 * even for a knowledge-enabled client — is harness-lane work (bulk import
 * batches must never ride the API meter). "Automate ingestion on CHANGES to
 * files, not on first import." */
export const docHasPriorAtoms = internalQuery({
  args: {
    documentId: v.id("documents"),
    excludeChecksum: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const obs = await ctx.db
      .query("atomObservations")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    return obs.some(
      (o) =>
        !args.excludeChecksum || o.contentChecksum !== args.excludeChecksum,
    );
  },
});

/** The 10-minute sweep. Finds recent ingestion events with no observations
 * for a knowledge-enabled client, caps at 3/tick, and routes each through the
 * Next atomizer route → reatomizeDiff. Error-tolerant per event; logs loudly. */
export const sweep = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiBase = process.env.NEXT_APP_URL;
    const secret = process.env.CRON_SECRET;

    const events = await ctx.runQuery(
      internal.knowledge.atomizerLane.recentIngestionEvents,
      {},
    );
    // Newest first — recent edits get the tick's budget before older backlog.
    events.sort((a, b) => b.at.localeCompare(a.at));

    type DocMeta = {
      _id: Id<"documents">;
      clientId: Id<"clients"> | null;
      projectId: Id<"projects"> | null;
      contentChecksum: string | null;
      textContent: string | null;
      fileName: string | null;
      category: string | null;
      fileTypeDetected: string | null;
    };
    type Selected = {
      documentId: Id<"documents">;
      contentChecksum: string;
      doc: DocMeta;
    };

    const selected: Selected[] = [];
    const seen = new Set<string>();
    for (const ev of events) {
      if (selected.length >= MAX_PER_TICK) break;
      const documentId = ev.documentId;
      const doc = await ctx.runQuery(
        internal.knowledge.atomizerLane.docForEvent,
        { documentId },
      );
      if (!doc || !doc.clientId) continue; // no scope → can't gate → skip
      const checksum = ev.checksum ?? doc.contentChecksum ?? undefined;
      const key = `${documentId}::${checksum ?? ""}`;
      if (seen.has(key)) continue;
      // reatomizeDiff requires a concrete checksum (same-lineage diff key).
      if (!checksum) continue;
      const already = await ctx.runQuery(
        internal.knowledge.atomizerLane.hasObservationsForDoc,
        { documentId, contentChecksum: checksum },
      );
      if (already) continue; // event already handled
      const isChange = await ctx.runQuery(
        internal.knowledge.atomizerLane.docHasPriorAtoms,
        { documentId, excludeChecksum: checksum },
      );
      if (!isChange) continue; // tightened cost wall — first-time atomization is harness-lane only
      seen.add(key);
      selected.push({ documentId, contentChecksum: checksum, doc });
    }

    let processed = 0;
    let failed = 0;
    for (const item of selected) {
      try {
        if (!apiBase || !secret) {
          throw new Error(
            "NEXT_APP_URL / CRON_SECRET not configured on the Convex deployment",
          );
        }
        const clientId = item.doc.clientId!;
        // Roster assembled from the operational tables (§4): the client, its
        // projects + contacts, and ALL lenders (global, high-value). Mentions
        // in the document resolve against these ids.
        const [client, projects, contacts, lenders] = await Promise.all([
          ctx.runQuery(api.clients.get, { id: clientId }),
          ctx.runQuery(api.projects.getByClient, { clientId }),
          ctx.runQuery(api.contacts.getByClient, { clientId }),
          ctx.runQuery(api.appetiteSignals.listLenders, { limit: 200 }),
        ]);
        const roster = {
          client: client
            ? {
                id: (client as any)._id,
                name: (client as any).name ?? null,
                companyName: (client as any).companyName ?? null,
                companiesHouseNumber:
                  (client as any).companiesHouseNumber ?? null,
              }
            : null,
          projects: (projects as any[]).map((p) => ({
            id: p._id,
            name: p.name ?? null,
            shortcode: p.projectShortcode ?? null,
          })),
          contacts: (contacts as any[]).map((c) => ({
            id: c._id,
            name: c.name ?? null,
            role: c.role ?? null,
            email: c.email ?? null,
          })),
          lenders: (lenders as any[]).map((l) => ({
            id: l._id,
            name: l.name ?? l.companyName ?? null,
          })),
        };

        const normalized = apiBase.match(/^https?:\/\//)
          ? apiBase
          : `https://${apiBase}`;
        const resp = await fetch(
          `${normalized.replace(/\/$/, "")}/api/knowledge/atomize`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": secret,
            },
            body: JSON.stringify({
              documentId: item.documentId,
              contentChecksum: item.contentChecksum,
              textContent: item.doc.textContent ?? null,
              meta: {
                clientId,
                projectId: item.doc.projectId,
                category: item.doc.category,
                fileTypeDetected: item.doc.fileTypeDetected,
                fileName: item.doc.fileName,
                roster,
              },
            }),
          },
        );
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          throw new Error(
            `atomize route ${resp.status}: ${text.slice(0, 300)}`,
          );
        }
        const payload: any = await resp.json().catch(() => null);
        if (!payload?.ok) {
          throw new Error(
            `atomize route error: ${String(payload?.error ?? "unknown").slice(0, 300)}`,
          );
        }
        const candidates = Array.isArray(payload.candidates)
          ? payload.candidates
          : [];
        const result: any = await ctx.runMutation(
          internal.knowledge.atomsCore.reatomizeDiff,
          {
            documentId: item.documentId,
            contentChecksum: item.contentChecksum,
            candidates,
          },
        );
        // Re-atomization refreshes atoms; refresh the prose chunks for the
        // same revision too (delete-and-recreate makes this safe). The policy
        // layer gates on isProseDocument, so non-prose docs no-op.
        await ctx.scheduler.runAfter(
          0,
          internal.knowledge.chunks.chunkDocument,
          { documentId: item.documentId },
        );
        processed++;
        console.log(
          `[knowledge-atomize] ${item.documentId} (${item.doc.fileName ?? "?"}) → ` +
            `candidates=${candidates.length} created=${result.created?.length ?? 0} ` +
            `kept=${result.kept?.length ?? 0} changed=${result.changed?.length ?? 0} ` +
            `rejected=${result.rejected?.length ?? 0}${
              payload.isMock ? " [MOCK]" : ""
            }`,
        );
      } catch (err) {
        failed++;
        console.error(
          `[knowledge-atomize] ${item.documentId} failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return {
      status: "ok" as const,
      scanned: events.length,
      selected: selected.length,
      processed,
      failed,
    };
  },
});
