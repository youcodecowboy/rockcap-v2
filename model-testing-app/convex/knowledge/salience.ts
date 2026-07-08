import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Salience / IDF ranking + retrievalLog — Spec 2 Phase 2c (§6.2, §10).
// (docs/spec-2-knowledge-layer.md)
//
// The "gets better with use" layer. Two feeds combine into atoms.salience,
// a stable [0,1] ranking weight the search + graph-fan-out paths fold in:
//
//   salience = clamp01( IDF_WEIGHT·idfNorm + USAGE_WEIGHT·usageNorm )
//     idfNorm   — predicate rarity: log(totalLive / atomsWithPredicate)
//                 normalized by log(totalLive). A predicate carried by nearly
//                 every atom → ~0 (a lender "everywhere" contributes little per
//                 edge); a singleton predicate → ~1. Downweight, never delete
//                 (the aggregate "everywhere" is itself portfolio signal, §6.2).
//     usageNorm — retrieval usage: u/(u+USAGE_SATURATION), u=log(1+retrievals)
//                 from retrievalLog by_atom counts. Bounded [0,1), half-
//                 saturating near ~10 retrievals so a few hot atoms can't
//                 dwarf the rest.
//
// salience stays OPTIONAL on the atom: an un-refreshed graph (salience
// undefined everywhere) ranks exactly as it did before this landed, because
// every consumer treats undefined as a neutral default (see graphQueries
// rankEdges/rankAttributes and embeddings atomsSearchHybrid).

// ── Retrieval logging (fire-and-forget from the MCP action layer) ──
//
// Queries cannot write, and atoms.search / graph.expandEntity are read paths.
// So the MCP handlers (which run as actions) schedule THIS mutation after they
// have the results — one batched insert, off the retrieval latency path. Atom
// ids are normalized here, so callers may pass raw provenance refs loosely:
// native-edge refs (table names) and stale ids simply fail normalization and
// are dropped.
export const logRetrieval = internalMutation({
  args: {
    atomIds: v.array(v.string()),
    source: v.union(v.literal("search"), v.literal("expand")),
    queryText: v.optional(v.string()),
    clientId: v.optional(v.string()),
    subjectType: v.optional(v.string()),
    subjectId: v.optional(v.string()),
    retrievedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const clientId = args.clientId
      ? ctx.db.normalizeId("clients", args.clientId) ?? undefined
      : undefined;
    const queryText = args.queryText?.slice(0, 200);
    const seen = new Set<string>();
    let written = 0;
    for (const raw of args.atomIds) {
      const atomId = ctx.db.normalizeId("atoms", raw);
      if (!atomId || seen.has(atomId)) continue;
      seen.add(atomId);
      await ctx.db.insert("retrievalLog", {
        atomId,
        source: args.source,
        queryText,
        clientId,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        retrievedAt: args.retrievedAt,
      });
      written++;
    }
    return { written };
  },
});

// ── Salience recomputation ──

const IDF_WEIGHT = 0.7;
const USAGE_WEIGHT = 0.3;
// Half-saturation of the usage curve: at ~10 retrievals usageNorm ≈ 0.5.
const USAGE_SATURATION = Math.log(1 + 10);
const GATHER_PAGE = 500;
// salienceApplyPage reads, in ONE mutation, up to APPLY_PAGE atoms plus
// APPLY_PAGE × RETRIEVAL_COUNT_CAP retrievalLog rows (countRetrievals per atom).
// Convex caps a single transaction at ~16,384 document reads, so this product
// MUST stay comfortably under that ceiling. 50 × 200 = 10,000 (+50 atoms) leaves
// headroom; the per-atom cap barely affects salience (log(1+n) has flattened by
// n≈200), and the smaller page just means more — still bounded — apply pages.
const APPLY_PAGE = 50;
// Bounds the per-atom retrievalLog read; log(1+n) has already flattened well
// before this, so counting past the cap changes salience imperceptibly. Kept
// low enough that APPLY_PAGE × RETRIEVAL_COUNT_CAP stays under the per-txn cap.
const RETRIEVAL_COUNT_CAP = 200;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function isLive(status: string): boolean {
  return status === "active" || status === "contested";
}

async function countRetrievals(
  ctx: QueryCtx | MutationCtx,
  atomId: Id<"atoms">,
): Promise<number> {
  const rows = await ctx.db
    .query("retrievalLog")
    .withIndex("by_atom", (q) => q.eq("atomId", atomId))
    .take(RETRIEVAL_COUNT_CAP);
  return rows.length;
}

/** Phase 1 page — accumulate predicate frequencies + live-atom total over one
 * page. The orchestrator sums these across pages; the map is bounded by the
 * predicate vocabulary (a few dozen keys), so it rides in memory / args fine. */
export const salienceGatherPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("atoms")
      .paginate({ cursor: args.cursor, numItems: GATHER_PAGE });
    const counts: Record<string, number> = {};
    let liveTotal = 0;
    for (const atom of page.page) {
      if (!isLive(atom.status)) continue;
      liveTotal++;
      counts[atom.predicate] = (counts[atom.predicate] ?? 0) + 1;
    }
    return {
      predicateCounts: Object.entries(counts).map(([predicate, count]) => ({
        predicate,
        count,
      })),
      liveTotal,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/** Phase 2 page — compute + patch salience for one page of live atoms, given
 * the graph-wide stats gathered in phase 1. Skips non-live atoms and no-op
 * patches (salience unchanged within tolerance). */
export const salienceApplyPage = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    totalLive: v.number(),
    predicateCounts: v.array(
      v.object({ predicate: v.string(), count: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("atoms")
      .paginate({ cursor: args.cursor, numItems: APPLY_PAGE });
    const counts = new Map(
      args.predicateCounts.map((p) => [p.predicate, p.count] as const),
    );
    const logTotal = args.totalLive > 1 ? Math.log(args.totalLive) : 0;
    let patched = 0;
    for (const atom of page.page) {
      if (!isLive(atom.status)) continue;

      const withPredicate = Math.max(1, counts.get(atom.predicate) ?? 1);
      const idfRaw = Math.log(args.totalLive / withPredicate);
      const idfNorm = logTotal > 0 ? clamp01(idfRaw / logTotal) : 0;

      const retrievals = await countRetrievals(ctx, atom._id);
      const u = Math.log(1 + retrievals);
      const usageNorm = u / (u + USAGE_SATURATION);

      const salience = clamp01(IDF_WEIGHT * idfNorm + USAGE_WEIGHT * usageNorm);
      if (
        atom.salience === undefined ||
        Math.abs(atom.salience - salience) > 1e-4
      ) {
        await ctx.db.patch(atom._id, { salience });
        patched++;
      }
    }
    return {
      patched,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * refreshSalience — recompute atoms.salience across the whole graph.
 *
 * The nightly integrity sweep (§10) calls this. Two paginated passes,
 * orchestrated from an action so neither pass ever does an unbounded
 * .collect() in a single transaction:
 *   Phase 1 (salienceGatherPage): predicate frequencies + live-atom total.
 *   Phase 2 (salienceApplyPage):  IDF·usage blend patched per atom.
 *
 * Manual run: npx convex run knowledge/salience:refreshSalience
 */
export const refreshSalience = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    totalLive: number;
    predicates: number;
    patched: number;
    pages: number;
  }> => {
    // Phase 1 — gather.
    const counts = new Map<string, number>();
    let totalLive = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: {
        predicateCounts: Array<{ predicate: string; count: number }>;
        liveTotal: number;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.knowledge.salience.salienceGatherPage, {
        cursor,
      });
      totalLive += page.liveTotal;
      for (const { predicate, count } of page.predicateCounts) {
        counts.set(predicate, (counts.get(predicate) ?? 0) + count);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const predicateCounts = [...counts.entries()].map(([predicate, count]) => ({
      predicate,
      count,
    }));

    // Phase 2 — apply.
    let patched = 0;
    let pages = 0;
    cursor = null;
    for (;;) {
      const res: {
        patched: number;
        continueCursor: string;
        isDone: boolean;
      } = await ctx.runMutation(
        internal.knowledge.salience.salienceApplyPage,
        { cursor, totalLive, predicateCounts },
      );
      patched += res.patched;
      pages++;
      if (res.isDone) break;
      cursor = res.continueCursor;
    }

    console.log(
      `[salience] refreshed: totalLive=${totalLive} predicates=${predicateCounts.length} patched=${patched} pages=${pages}`,
    );
    return { totalLive, predicates: predicateCounts.length, patched, pages };
  },
});

/**
 * pruneRetrievalLog — delete retrievalLog rows older than N days (default 90),
 * paginated. retrievalLog is disposable telemetry (not provenance), so aging
 * it out keeps the table thin and the usage window rolling. Run repeatedly
 * with the returned continueCursor until isDone.
 *
 * Manual run: npx convex run knowledge/salience:pruneRetrievalLog '{"olderThanDays": 90}'
 */
export const pruneRetrievalLog = internalMutation({
  args: {
    olderThanDays: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.olderThanDays ?? 90;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const numItems = Math.max(1, Math.min(args.limit ?? 500, 2000));
    const page = await ctx.db
      .query("retrievalLog")
      .withIndex("by_retrievedAt", (q) => q.lt("retrievedAt", cutoff))
      .paginate({ cursor: args.cursor ?? null, numItems });
    let deleted = 0;
    for (const row of page.page) {
      await ctx.db.delete(row._id);
      deleted++;
    }
    return {
      deleted,
      cutoff,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});
