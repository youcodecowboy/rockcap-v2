import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Atomization-coverage audit (2026-07, post-12-client-campaign).
//
// The knowledge layer arrived long after the first ~30 clients' documents
// were uploaded and classified, so the graph's coverage is uneven: campaign
// clients are fully atomized, legacy clients mostly are not. This module
// answers, per client: how many live documents exist, how many are
// classified, and — the rerun backlog — how many classified documents have
// ZERO atomObservations (nothing in the knowledge graph cites them).
//
// Read-only. Paged (each page has its own read budget); observation
// existence is one indexed by_document lookup per doc.

const DOC_PAGE = 200;
const ATOM_PAGE = 1000;

type DocPage = {
  rows: Array<{
    clientId: string | null;
    unclassified: boolean;
    hasObservations: boolean;
    isSpreadsheet: boolean;
  }>;
  continueCursor: string;
  isDone: boolean;
};

export const pageDocs = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<DocPage> => {
    const page = await ctx.db
      .query("documents")
      .paginate({ cursor: args.cursor, numItems: DOC_PAGE });
    const rows: DocPage["rows"] = [];
    for (const doc of page.page) {
      const d = doc as any;
      // Skip soft-deleted rows and dedupe-archived duplicates — they are not
      // rerun candidates (their observations were moved to canonicals).
      if (d.isDeleted === true || d.duplicateOf) continue;
      const firstObs = await ctx.db
        .query("atomObservations")
        .withIndex("by_document", (q) => q.eq("documentId", doc._id))
        .first();
      const name: string = (d.fileName ?? "").toLowerCase();
      rows.push({
        clientId: d.clientId ? String(d.clientId) : null,
        unclassified:
          !d.fileTypeDetected || d.fileTypeDetected === "Unclassified",
        hasObservations: firstObs !== null,
        isSpreadsheet: /\.(xlsx?|xlsm|csv)$/.test(name),
      });
    }
    return { rows, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

type AtomPage = {
  counts: Array<{ clientId: string; atoms: number }>;
  continueCursor: string;
  isDone: boolean;
};

export const pageAtoms = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<AtomPage> => {
    const page = await ctx.db
      .query("atoms")
      .paginate({ cursor: args.cursor, numItems: ATOM_PAGE });
    const per = new Map<string, number>();
    for (const atom of page.page) {
      if (atom.status !== "active" && atom.status !== "contested") continue;
      const cid = atom.clientId ? String(atom.clientId) : "(unscoped)";
      per.set(cid, (per.get(cid) ?? 0) + 1);
    }
    return {
      counts: [...per].map(([clientId, atoms]) => ({ clientId, atoms })),
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const clientNames = internalQuery({
  args: { ids: v.array(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ id: string; name: string; status: string; type: string }>> => {
    const out: Array<{ id: string; name: string; status: string; type: string }> = [];
    for (const id of args.ids) {
      const nid = ctx.db.normalizeId("clients", id);
      const row = nid && (await ctx.db.get(nid));
      if (!row) continue;
      const r = row as any;
      out.push({
        id,
        name: r.name ?? r.companyName ?? "(unnamed)",
        status: r.status ?? "active",
        type: r.type ?? "",
      });
    }
    return out;
  },
});

/**
 * npx convex run knowledge/coverageAudit:run '{}'
 * Returns per-client rows sorted by rerun backlog (classified docs with no
 * observations), plus grand totals.
 */
export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    type Agg = {
      docs: number;
      unclassified: number;
      atomized: number;
      backlog: number; // classified but zero observations
      spreadsheets: number;
    };
    const perClient = new Map<string, Agg>();
    const get = (cid: string): Agg => {
      let a = perClient.get(cid);
      if (!a) {
        a = { docs: 0, unclassified: 0, atomized: 0, backlog: 0, spreadsheets: 0 };
        perClient.set(cid, a);
      }
      return a;
    };

    let cursor: string | null = null;
    for (;;) {
      const page: DocPage = await ctx.runQuery(
        internal.knowledge.coverageAudit.pageDocs,
        { cursor },
      );
      for (const r of page.rows) {
        const a = get(r.clientId ?? "(no client)");
        a.docs++;
        if (r.unclassified) a.unclassified++;
        if (r.hasObservations) a.atomized++;
        else if (!r.unclassified) a.backlog++;
        if (r.isSpreadsheet) a.spreadsheets++;
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const atomsByClient = new Map<string, number>();
    cursor = null;
    for (;;) {
      const page: AtomPage = await ctx.runQuery(
        internal.knowledge.coverageAudit.pageAtoms,
        { cursor },
      );
      for (const c of page.counts) {
        atomsByClient.set(c.clientId, (atomsByClient.get(c.clientId) ?? 0) + c.atoms);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const ids = [...perClient.keys()].filter((k) => !k.startsWith("("));
    const names = new Map<string, { name: string; status: string; type: string }>();
    for (let i = 0; i < ids.length; i += 100) {
      const batch: Array<{ id: string; name: string; status: string; type: string }> =
        await ctx.runQuery(internal.knowledge.coverageAudit.clientNames, {
          ids: ids.slice(i, i + 100),
        });
      for (const b of batch) names.set(b.id, b);
    }

    const rows = [...perClient.entries()]
      .map(([clientId, a]) => ({
        clientId,
        name: names.get(clientId)?.name ?? clientId,
        status: names.get(clientId)?.status ?? "",
        type: names.get(clientId)?.type ?? "",
        ...a,
        liveAtoms: atomsByClient.get(clientId) ?? 0,
      }))
      .sort((x, y) => y.backlog - x.backlog);

    const totals = rows.reduce(
      (t, r) => ({
        docs: t.docs + r.docs,
        unclassified: t.unclassified + r.unclassified,
        atomized: t.atomized + r.atomized,
        backlog: t.backlog + r.backlog,
        spreadsheets: t.spreadsheets + r.spreadsheets,
      }),
      { docs: 0, unclassified: 0, atomized: 0, backlog: 0, spreadsheets: 0 },
    );

    return { totals, clients: rows };
  },
});
