import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Knowledge-layer embeddings + hybrid retrieval — Spec 2 Phase 2a.2
// (docs/spec-2-knowledge-layer.md §9, §13).
//
// Two lanes wired here:
//   1. WRITE PATH — atomsCore schedules embedAtoms / embedChunks after it
//      persists NEW or value-CHANGED atoms (never superseded/retired) and
//      re-chunked documents. Voyage `voyage-finance-2` (1024-dim) embeds the
//      atom `statement` / chunk `text` (input_type "document"); the vectors
//      land in atoms.embedding / documentChunks.embedding, which is exactly
//      what the `by_embedding` vector indexes read.
//   2. READ PATH — atomsSearchHybrid runs the existing full-text lane AND a
//      vector lane over the SAME query (input_type "query"), then fuses the
//      two ranked lists with reciprocal-rank fusion (RRF, k=60). An atom that
//      surfaces in BOTH lanes ranks above single-lane hits; an atom the vector
//      lane finds by MEANING (zero term overlap with the query) still surfaces.
//
// ── Platform facts baked in ──
//   • ctx.vectorSearch is available in ACTIONS ONLY (never queries/mutations),
//     so the hybrid search is an action; row loads/enrichment route back
//     through internal queries, and patches through internal mutations.
//   • Convex vector-search filters support ONLY q.eq / q.or over ONE filter
//     field — there is NO cross-field AND (see buildAtomVectorFilter).
//   • Graceful degradation: if VOYAGE_API_KEY is unset the vector lane is
//     DISABLED, never fatal — write hooks no-op, search returns the text lane
//     with `vectorLaneDisabled: true`, backfill halts cleanly.
//
// ── Idempotency ──
// The atom `statement` is immutable per identity, so a row that already has an
// embedding is never re-embedded (an `embedding !== undefined` skip). Backfill
// is a paginated re-scan of the same predicate (active|contested lacking an
// embedding), safe to re-run to convergence.

// ── Voyage client (module-level fetch helper) ──

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-finance-2";
const VOYAGE_BATCH = 128; // Voyage caps `input` at 128 texts per call
const BACKFILL_PAGE = 128;
const PATCH_CHUNK = 50; // ≤50 patches per mutation (write-limit headroom)
const RRF_K = 60; // reciprocal-rank fusion constant (standard)
// Salience fold (spec §6.2, Phase 2c): multiply the fused RRF score by
// (1 + SALIENCE_WEIGHT·(salience − SALIENCE_NEUTRAL)) — a ±0.25 swing at the
// extremes, no swing at neutral. Undefined salience → neutral, so the order is
// byte-for-byte the pre-2c RRF order until refreshSalience has run.
const SALIENCE_NEUTRAL = 0.5;
const SALIENCE_WEIGHT = 0.5;

/** Thrown when VOYAGE_API_KEY is unset. Callers catch this specific error and
 * treat the embeddings lane as disabled (never crash a pipeline). */
export class VoyageKeyMissingError extends Error {
  constructor() {
    super("VOYAGE_API_KEY unset — embeddings lane disabled");
    this.name = "VoyageKeyMissingError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One Voyage call for ≤128 texts. Retries twice (short backoff) on 429 / 5xx;
 * returns vectors aligned to the INPUT order (Voyage echoes an `index`). */
async function voyageEmbedBatch(
  texts: string[],
  inputType: "document" | "query",
  key: string,
): Promise<number[][]> {
  const maxAttempts = 3; // initial + 2 retries
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(VOYAGE_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: texts,
          input_type: inputType,
        }),
      });
    } catch (networkErr) {
      if (attempt < maxAttempts) {
        await sleep(400 * attempt);
        continue;
      }
      throw new Error(`voyage_network_error: ${(networkErr as Error).message}`);
    }
    if (resp.ok) {
      const json = (await resp.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };
      const out = new Array<number[]>(texts.length);
      for (const d of json.data) out[d.index] = d.embedding;
      return out;
    }
    // Transient (rate-limit / server) → back off and retry.
    if ((resp.status === 429 || resp.status >= 500) && attempt < maxAttempts) {
      await sleep(500 * attempt);
      continue;
    }
    const body = await resp.text().catch(() => "");
    throw new Error(`voyage_error ${resp.status}: ${body.slice(0, 300)}`);
  }
  throw new Error("voyage_unreachable");
}

/** Embed an arbitrary-length list of texts, batching at ≤128 per Voyage call.
 * Throws VoyageKeyMissingError when the key is unset (lane-disabled signal). */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new VoyageKeyMissingError();
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const vecs = await voyageEmbedBatch(
      texts.slice(i, i + VOYAGE_BATCH),
      inputType,
      key,
    );
    out.push(...vecs);
  }
  return out;
}

// ── Patch mutations (the only db writes; ≤50 rows each) ──

export const patchAtomEmbeddings = internalMutation({
  args: {
    items: v.array(
      v.object({ atomId: v.id("atoms"), embedding: v.array(v.float64()) }),
    ),
  },
  handler: async (ctx, args) => {
    for (const it of args.items) {
      await ctx.db.patch(it.atomId, { embedding: it.embedding });
    }
    return { patched: args.items.length };
  },
});

export const patchChunkEmbeddings = internalMutation({
  args: {
    items: v.array(
      v.object({
        chunkId: v.id("documentChunks"),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const it of args.items) {
      await ctx.db.patch(it.chunkId, { embedding: it.embedding });
    }
    return { patched: args.items.length };
  },
});

// ── Row-load queries (actions have no db access) ──

export const getAtomsForEmbedding = internalQuery({
  args: { atomIds: v.array(v.id("atoms")) },
  handler: async (ctx, args) => {
    const out: Array<{
      _id: Id<"atoms">;
      statement: string;
      hasEmbedding: boolean;
    }> = [];
    for (const id of args.atomIds) {
      const a = await ctx.db.get(id);
      if (!a) continue;
      out.push({
        _id: a._id,
        statement: a.statement,
        hasEmbedding: a.embedding !== undefined,
      });
    }
    return out;
  },
});

export const getChunksForEmbedding = internalQuery({
  args: { documentId: v.id("documents"), contentChecksum: v.string() },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    return chunks
      .filter(
        (c) =>
          c.contentChecksum === args.contentChecksum &&
          c.embedding === undefined,
      )
      .map((c) => ({ _id: c._id, text: c.text }));
  },
});

// Backfill pagination — paginate the default index so each page is bounded
// (embeddings are ~8KB/row; a 128-row page stays well inside read limits) and
// filter the missing-embedding rows within the page. No status-only index
// exists, so status is filtered post-page (the corpus is small; Phase 2c can
// index if needed).
export const pageAtomsMissingEmbedding = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const res = await ctx.db
      .query("atoms")
      .paginate({ cursor: args.cursor, numItems: args.limit });
    const todo = res.page
      .filter(
        (a) =>
          (a.status === "active" || a.status === "contested") &&
          a.embedding === undefined,
      )
      .map((a) => ({ _id: a._id, statement: a.statement }));
    return { todo, continueCursor: res.continueCursor, isDone: res.isDone };
  },
});

export const pageChunksMissingEmbedding = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), limit: v.number() },
  handler: async (ctx, args) => {
    const res = await ctx.db
      .query("documentChunks")
      .paginate({ cursor: args.cursor, numItems: args.limit });
    const todo = res.page
      .filter((c) => c.embedding === undefined)
      .map((c) => ({ _id: c._id, text: c.text }));
    return { todo, continueCursor: res.continueCursor, isDone: res.isDone };
  },
});

// Explicit return types — these actions call functions in their OWN module
// (embedAtoms → getAtomsForEmbedding, backfillAll → itself, etc.), which makes
// TypeScript's inference of the generated `internal` api type self-referential.
// Annotating the handler return types breaks the cycle (the standard Convex fix
// for self-referencing / recursively-scheduled functions).
type EmbedAtomsResult = { embedded: number; skipped: number; disabled?: boolean };
type EmbedChunksResult = { embedded: number; disabled?: boolean };
type BackfillResult = {
  phase?: "atoms" | "chunks";
  done?: boolean;
  page?: number;
  embeddedSoFar?: number;
  atomsEmbedded?: number;
  chunksEmbedded?: number;
  next?: "chunks";
  halted?: boolean;
  reason?: string;
};
type HybridResult = {
  query: string;
  results: Array<Record<string, unknown>>;
  counts: {
    textLane: number;
    vectorLane: number;
    merged: number;
    prospectScopedHidden: number;
  };
  vectorLaneDisabled: boolean;
};

// ── Write-path embed actions (scheduled from atomsCore) ──

/** Embed the given atoms' statements (input_type "document") and patch the
 * vectors in. Skips any already-embedded (statement is immutable per identity,
 * so a present embedding is current). Voyage key missing → clean no-op. */
export const embedAtoms = internalAction({
  args: { atomIds: v.array(v.id("atoms")) },
  handler: async (ctx, args): Promise<EmbedAtomsResult> => {
    if (args.atomIds.length === 0) return { embedded: 0, skipped: 0 };
    const rows = await ctx.runQuery(
      internal.knowledge.embeddings.getAtomsForEmbedding,
      { atomIds: args.atomIds },
    );
    const todo = rows.filter((r) => !r.hasEmbedding);
    if (todo.length === 0) {
      return { embedded: 0, skipped: rows.length };
    }
    let vecs: number[][];
    try {
      vecs = await embedTexts(
        todo.map((r) => r.statement),
        "document",
      );
    } catch (e) {
      if (e instanceof VoyageKeyMissingError) {
        console.warn("[embeddings] embedAtoms no-op — VOYAGE_API_KEY unset");
        return { embedded: 0, skipped: rows.length, disabled: true };
      }
      throw e;
    }
    const items = todo.map((r, i) => ({ atomId: r._id, embedding: vecs[i] }));
    for (let i = 0; i < items.length; i += PATCH_CHUNK) {
      await ctx.runMutation(internal.knowledge.embeddings.patchAtomEmbeddings, {
        items: items.slice(i, i + PATCH_CHUNK),
      });
    }
    return { embedded: items.length, skipped: rows.length - todo.length };
  },
});

/** Embed a document's freshly (re)chunked narrative rows for one revision. */
export const embedChunks = internalAction({
  args: { documentId: v.id("documents"), contentChecksum: v.string() },
  handler: async (ctx, args): Promise<EmbedChunksResult> => {
    const todo = await ctx.runQuery(
      internal.knowledge.embeddings.getChunksForEmbedding,
      { documentId: args.documentId, contentChecksum: args.contentChecksum },
    );
    if (todo.length === 0) return { embedded: 0 };
    let vecs: number[][];
    try {
      vecs = await embedTexts(
        todo.map((c) => c.text),
        "document",
      );
    } catch (e) {
      if (e instanceof VoyageKeyMissingError) {
        console.warn("[embeddings] embedChunks no-op — VOYAGE_API_KEY unset");
        return { embedded: 0, disabled: true };
      }
      throw e;
    }
    const items = todo.map((c, i) => ({ chunkId: c._id, embedding: vecs[i] }));
    for (let i = 0; i < items.length; i += PATCH_CHUNK) {
      await ctx.runMutation(
        internal.knowledge.embeddings.patchChunkEmbeddings,
        { items: items.slice(i, i + PATCH_CHUNK) },
      );
    }
    return { embedded: items.length };
  },
});

// ── Backfill (scheduler-chained; idempotent, safe to re-run) ──
//
// Phase "atoms" first (all active|contested lacking an embedding), then phase
// "chunks" (all documentChunks lacking one). Each hop embeds one ≤128 page and
// schedules the next until the scan is done. On ~135 atoms + a handful of
// chunk pages this is ~2 Voyage calls total.

export const backfillAll = internalAction({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    phase: v.optional(v.union(v.literal("atoms"), v.literal("chunks"))),
    embeddedSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BackfillResult> => {
    const phase = args.phase ?? "atoms";
    const cursor = args.cursor ?? null;
    let embeddedSoFar = args.embeddedSoFar ?? 0;

    if (phase === "atoms") {
      const { todo, continueCursor, isDone } = await ctx.runQuery(
        internal.knowledge.embeddings.pageAtomsMissingEmbedding,
        { cursor, limit: BACKFILL_PAGE },
      );
      if (todo.length > 0) {
        let vecs: number[][];
        try {
          vecs = await embedTexts(
            todo.map((t) => t.statement),
            "document",
          );
        } catch (e) {
          if (e instanceof VoyageKeyMissingError) {
            console.warn(
              "[embeddings] backfill halted — VOYAGE_API_KEY unset",
            );
            return { halted: true, reason: "voyage_key_missing", embeddedSoFar };
          }
          throw e;
        }
        const items = todo.map((t, i) => ({
          atomId: t._id,
          embedding: vecs[i],
        }));
        for (let i = 0; i < items.length; i += PATCH_CHUNK) {
          await ctx.runMutation(
            internal.knowledge.embeddings.patchAtomEmbeddings,
            { items: items.slice(i, i + PATCH_CHUNK) },
          );
        }
        embeddedSoFar += items.length;
      }
      console.log(
        `[embeddings] backfill atoms: +${todo.length} this page, ${embeddedSoFar} total, isDone=${isDone}`,
      );
      if (!isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.knowledge.embeddings.backfillAll,
          { cursor: continueCursor, phase: "atoms", embeddedSoFar },
        );
        return { phase, page: todo.length, embeddedSoFar, done: false };
      }
      // Atoms done → hand off to the chunks phase.
      await ctx.scheduler.runAfter(
        0,
        internal.knowledge.embeddings.backfillAll,
        { cursor: null, phase: "chunks", embeddedSoFar: 0 },
      );
      return { phase, atomsEmbedded: embeddedSoFar, done: false, next: "chunks" };
    }

    // phase === "chunks"
    const { todo, continueCursor, isDone } = await ctx.runQuery(
      internal.knowledge.embeddings.pageChunksMissingEmbedding,
      { cursor, limit: BACKFILL_PAGE },
    );
    if (todo.length > 0) {
      let vecs: number[][];
      try {
        vecs = await embedTexts(
          todo.map((t) => t.text),
          "document",
        );
      } catch (e) {
        if (e instanceof VoyageKeyMissingError) {
          console.warn("[embeddings] backfill halted — VOYAGE_API_KEY unset");
          return { halted: true, reason: "voyage_key_missing", embeddedSoFar };
        }
        throw e;
      }
      const items = todo.map((t, i) => ({ chunkId: t._id, embedding: vecs[i] }));
      for (let i = 0; i < items.length; i += PATCH_CHUNK) {
        await ctx.runMutation(
          internal.knowledge.embeddings.patchChunkEmbeddings,
          { items: items.slice(i, i + PATCH_CHUNK) },
        );
      }
      embeddedSoFar += items.length;
    }
    console.log(
      `[embeddings] backfill chunks: +${todo.length} this page, ${embeddedSoFar} total, isDone=${isDone}`,
    );
    if (!isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.knowledge.embeddings.backfillAll,
        { cursor: continueCursor, phase: "chunks", embeddedSoFar },
      );
      return { phase, page: todo.length, embeddedSoFar, done: false };
    }
    console.log("[embeddings] backfill COMPLETE (atoms + chunks)");
    return { phase, chunksEmbedded: embeddedSoFar, done: true };
  },
});

// ── Hybrid search (text + vector, RRF-merged) ──

const entityTypeValidator = v.union(
  v.literal("client"),
  v.literal("project"),
  v.literal("contact"),
  v.literal("company"),
  v.literal("facility"),
  v.literal("candidate"),
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("contested"),
  v.literal("superseded"),
  v.literal("retired"),
);

const hybridSearchArgs = {
  query: v.string(),
  clientId: v.optional(v.string()),
  subjectType: v.optional(entityTypeValidator),
  status: v.optional(statusValidator),
  limit: v.optional(v.number()),
  includeProspectScoped: v.optional(v.boolean()),
};

type HybridArgs = {
  query: string;
  clientId?: string;
  subjectType?: "client" | "project" | "contact" | "company" | "facility" | "candidate";
  status?: "active" | "contested" | "superseded" | "retired";
  limit?: number;
  includeProspectScoped?: boolean;
};

/**
 * Build the single-field equality filter for the atoms `by_embedding` vector
 * search.
 *
 * ── The Convex constraint (documented decision) ──
 * Vector-search filters support ONLY `q.eq` and `q.or` over the index's filter
 * fields — there is NO cross-field `and` (verified against
 * node_modules/convex .../vector_search.d.ts: VectorFilterBuilder exposes only
 * `eq` and `or`). So `clientId AND status` cannot be expressed in one filter.
 *
 * ── The choice ──
 * We pass the SINGLE most useful equality and re-apply every remaining
 * constraint post-hoc in atomsVectorEnrich, which mirrors the text lane's
 * status + subjectType + clientId + prospect-scope semantics EXACTLY — so the
 * filter choice affects only recall/efficiency, never correctness. Priority:
 *   1. clientId  — when scoped to a client, recall WITHIN that client matters
 *      most (a global top-24 might contain none of the client's atoms).
 *   2. explicit status — an equality on the requested status.
 *   3. default (no clientId, no status): `active OR contested` — an `or` over
 *      the SAME status field IS supported, and it keeps once-active-now-
 *      superseded atoms (which retain their embedding) out of the top-24.
 * subjectType is always post-hoc (only one field fits the filter).
 */
function buildAtomVectorFilter(args: HybridArgs) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (q: any) => {
    if (args.clientId) {
      return q.eq("clientId", args.clientId as Id<"clients">);
    }
    if (args.status) {
      return q.eq("status", args.status);
    }
    return q.or(q.eq("status", "active"), q.eq("status", "contested"));
  };
}

type EnrichedRow = Record<string, unknown> & { atomId: Id<"atoms"> };

/** Internal action — the hybrid retrieval core the MCP tool calls. */
export const atomsSearchHybrid = internalAction({
  args: hybridSearchArgs,
  handler: async (ctx, args): Promise<HybridResult> => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);

    // (a) Text lane — the existing full-text search, kept exactly as-is.
    const text = await ctx.runQuery(
      internal.knowledge.graphQueries.atomsSearchInternal,
      {
        query: args.query,
        clientId: args.clientId,
        subjectType: args.subjectType,
        status: args.status,
        limit: args.limit,
        includeProspectScoped: args.includeProspectScoped,
      },
    );
    const textResults = text.results as EnrichedRow[];

    // (b) Embed the query (input_type "query"). Key missing / Voyage down →
    //     graceful degradation to the text lane alone.
    let queryVec: number[] | null = null;
    try {
      const [vec] = await embedTexts([args.query], "query");
      queryVec = vec ?? null;
    } catch (e) {
      if (!(e instanceof VoyageKeyMissingError)) {
        console.warn(
          "[embeddings] hybrid vector lane error:",
          (e as Error).message,
        );
      }
      queryVec = null;
    }
    if (!queryVec) {
      return {
        query: args.query,
        results: textResults.map((r) => ({ ...r, lane: "text" as const })),
        counts: {
          textLane: textResults.length,
          vectorLane: 0,
          merged: textResults.length,
          prospectScopedHidden: text.counts.prospectScopedHidden,
        },
        vectorLaneDisabled: true as const,
      };
    }

    // (c) Vector lane. Over-fetch (24) then (d) re-apply the full text-lane
    //     semantics + enrich in a query (vectorSearch can't touch the db).
    const hits = await ctx.vectorSearch("atoms", "by_embedding", {
      vector: queryVec,
      limit: 24,
      filter: buildAtomVectorFilter(args),
    });
    const vectorResults = (await ctx.runQuery(
      internal.knowledge.graphQueries.atomsVectorEnrich,
      {
        atomIds: hits.map((h) => h._id),
        clientId: args.clientId,
        subjectType: args.subjectType,
        status: args.status,
        includeProspectScoped: args.includeProspectScoped,
      },
    )) as EnrichedRow[];

    // (e) RRF merge (k=60): score = Σ 1/(k + rank) across the two ranked lists;
    //     dedupe by atomId; an atom present in BOTH lanes sums both terms and
    //     therefore outranks any single-lane hit at a comparable rank.
    type Acc = {
      row: EnrichedRow;
      score: number;
      inText: boolean;
      inVec: boolean;
    };
    const acc = new Map<string, Acc>();
    textResults.forEach((r, i) => {
      const id = r.atomId as string;
      const e = acc.get(id) ?? { row: r, score: 0, inText: false, inVec: false };
      e.score += 1 / (RRF_K + i + 1);
      e.inText = true;
      e.row = r;
      acc.set(id, e);
    });
    vectorResults.forEach((r, i) => {
      const id = r.atomId as string;
      const e = acc.get(id) ?? { row: r, score: 0, inText: false, inVec: false };
      e.score += 1 / (RRF_K + i + 1);
      e.inVec = true;
      if (!e.inText) e.row = r; // enrichment is identical either way
      acc.set(id, e);
    });
    // (f) Salience fold — reweight the fused RRF score by the atom's IDF·usage
    //     salience, then re-sort. `fusedScore` is the value the page is ranked
    //     by; `rrfScore` is preserved for transparency.
    const merged = [...acc.values()]
      .map((e) => {
        const salience =
          typeof e.row.salience === "number"
            ? (e.row.salience as number)
            : SALIENCE_NEUTRAL;
        const fusedScore =
          e.score * (1 + SALIENCE_WEIGHT * (salience - SALIENCE_NEUTRAL));
        return { e, fusedScore };
      })
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .slice(0, limit)
      .map(({ e, fusedScore }) => ({
        ...e.row,
        lane: e.inText && e.inVec ? "both" : e.inText ? "text" : "vector",
        rrfScore: e.score,
        fusedScore,
      }));

    return {
      query: args.query,
      results: merged,
      counts: {
        textLane: textResults.length,
        vectorLane: vectorResults.length,
        merged: merged.length,
        prospectScopedHidden: text.counts.prospectScopedHidden,
      },
      vectorLaneDisabled: false as const,
    };
  },
});

/** Public Clerk-authed wrapper (the Phase 2b drawer surface). */
export const atomsSearchHybridPublic = action({
  args: hybridSearchArgs,
  handler: async (ctx, args): Promise<HybridResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return await ctx.runAction(
      internal.knowledge.embeddings.atomsSearchHybrid,
      args,
    );
  },
});
