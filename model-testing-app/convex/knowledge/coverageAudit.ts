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

// ── Drive-vs-library overlap (no import needed) ──
// The Drive mirror carries every file's md5; library uploads now carry md5s
// too (harnessClassify backfill). So "how much of this Drive subtree is
// already in the client's library?" is a set intersection — computed here
// BEFORE paying for an import. Google-native files (no md5) are reported
// separately; trashed files excluded.

export const subtreeChildFolders = internalQuery({
  args: { parentIds: v.array(v.string()) },
  handler: async (ctx, args): Promise<string[]> => {
    const out: string[] = [];
    for (const pid of args.parentIds) {
      const children = await ctx.db
        .query("driveFolders")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", pid))
        .collect();
      for (const c of children) out.push((c as any).driveFolderId);
    }
    return out;
  },
});

export const filesForFolders = internalQuery({
  args: { folderIds: v.array(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{ name: string; md5: string | null; modifiedTime: string; size: number | null }>
  > => {
    const out: Array<{ name: string; md5: string | null; modifiedTime: string; size: number | null }> = [];
    for (const fid of args.folderIds) {
      const files = await ctx.db
        .query("driveFiles")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", fid))
        .collect();
      for (const f of files) {
        if ((f as any).trashed === true) continue;
        out.push({
          name: f.name,
          md5: (f as any).md5Checksum ?? null,
          modifiedTime: f.modifiedTime,
          size: (f as any).size ?? null,
        });
      }
    }
    return out;
  },
});

export const clientChecksums = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<string[]> => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const sums: string[] = [];
    for (const d of docs) {
      const c = (d as any).contentChecksum;
      if (typeof c === "string" && c) sums.push(c);
    }
    return sums;
  },
});

/**
 * npx convex run knowledge/coverageAudit:driveOverlap \
 *   '{"rootFolderId":"<drive folder id>","clientId":"<clients id>"}'
 */
export const driveOverlap = internalAction({
  args: { rootFolderId: v.string(), clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // BFS the subtree (batched child-folder lookups).
    const all: string[] = [args.rootFolderId];
    let frontier: string[] = [args.rootFolderId];
    while (frontier.length > 0) {
      const batch = frontier.slice(0, 100);
      frontier = frontier.slice(100);
      const children: string[] = await ctx.runQuery(
        internal.knowledge.coverageAudit.subtreeChildFolders,
        { parentIds: batch },
      );
      all.push(...children);
      frontier.push(...children);
    }

    const files: Array<{ name: string; md5: string | null; modifiedTime: string; size: number | null }> = [];
    for (let i = 0; i < all.length; i += 50) {
      files.push(
        ...(await ctx.runQuery(internal.knowledge.coverageAudit.filesForFolders, {
          folderIds: all.slice(i, i + 50),
        })),
      );
    }

    const known = new Set<string>(
      await ctx.runQuery(internal.knowledge.coverageAudit.clientChecksums, {
        clientId: args.clientId,
      }),
    );

    const fresh: typeof files = [];
    let matched = 0;
    let googleNative = 0;
    const seenMd5 = new Set<string>(); // in-Drive duplicate copies count once
    for (const f of files) {
      if (!f.md5) {
        googleNative++;
        continue;
      }
      if (known.has(f.md5)) {
        matched++;
        continue;
      }
      if (seenMd5.has(f.md5)) {
        matched++; // duplicate of another NEW file in the tree
        continue;
      }
      seenMd5.add(f.md5);
      fresh.push(f);
    }

    fresh.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
    const byMonth: Record<string, number> = {};
    for (const f of fresh) {
      const m = f.modifiedTime.slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + 1;
    }
    return {
      folders: all.length,
      driveFiles: files.length,
      matchedExistingOrDuplicate: matched,
      googleNativeNoMd5: googleNative,
      newUniqueFiles: fresh.length,
      newByMonth: byMonth,
      newestNew: fresh.slice(0, 25).map((f) => `${f.modifiedTime.slice(0, 10)}  ${f.name}`),
    };
  },
});

/** QA sampling: full observations (provenance) for a set of atoms. */
export const sampleObservations = internalQuery({
  args: { atomIds: v.array(v.id("atoms")) },
  handler: async (ctx, args) => {
    const out: Array<{
      atomId: string;
      statement: string;
      status: string;
      observations: Array<{
        sourceType: string;
        authorityTier: number | null;
        documentId: string | null;
        fileName: string | null;
        locator: unknown;
        sourceText: string | null;
      }>;
    }> = [];
    for (const id of args.atomIds) {
      const atom = await ctx.db.get(id);
      if (!atom) continue;
      const obs = await ctx.db
        .query("atomObservations")
        .withIndex("by_atom", (q) => q.eq("atomId", id))
        .collect();
      const rows = [];
      for (const o of obs) {
        const oo = o as any;
        let fileName: string | null = null;
        if (oo.documentId) {
          const doc = await ctx.db.get(oo.documentId);
          fileName = doc ? ((doc as any).fileName ?? null) : null;
        }
        rows.push({
          sourceType: oo.sourceType,
          authorityTier: oo.authorityTier ?? null,
          documentId: oo.documentId ? String(oo.documentId) : null,
          fileName,
          locator: oo.locator ?? null,
          sourceText: oo.sourceText ?? null,
        });
      }
      out.push({
        atomId: String(id),
        statement: atom.statement,
        status: atom.status,
        observations: rows,
      });
    }
    return out;
  },
});
