import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Nightly knowledge-graph integrity sweep — Spec 2 §10 (docs/spec-2-knowledge-
// layer.md:377: "piggybacks Spec 1's reconcile cron pattern: re-point atoms
// after entity merges, flag dangling refs, age out stale contests, refresh IDF
// stats"). The cron (convex/crons.ts) fires `nightlyIntegritySweep`, a driver
// internalAction that chains PAGINATED sub-jobs — every table walk runs as a
// sequence of bounded mutations/queries so no single Convex transaction is
// unbounded, mirroring salience.refreshSalience's page-loop idiom.
//
// Sub-jobs, in order:
//   1. Retro version-precedence pass — closes the "contested groups accumulate
//      until someone reruns retro" gap by running it nightly over contested
//      atoms (reuses versionPrecedence.applyVersionPrecedenceRetro verbatim).
//   2. Stale-contest ageing — contested atoms past the window (default 14d)
//      that the retro pass did NOT resolve get flagged (atoms.contestFlaggedAt
//      + an auditLog row) so operators can triage them. Never auto-picks a
//      winner outside version precedence.
//   3. Orphan / dangling detection — atoms whose subject or object entity row
//      no longer resolves are retired (reason "dangling_entity"); a
//      supersededBy pointer at a missing atom is logged and cleared; resolved
//      entityCandidate tombstones whose target entity is gone are logged.
//   4. Salience / IDF refresh — salience.refreshSalience graph-wide.
//   5. retrievalLog pruning + a chunk-backfill tick.
//
// Every sub-job returns counts; the driver logs a per-sub-job summary and
// writes one auditLog row so the sweep is observable.

// ── Policy constants ──

/** A contested atom older than this (by _creationTime) that version precedence
 * did not resolve is flagged for operator triage. */
const STALE_CONTEST_DAYS = 14;

/** Page sizes — kept well inside Convex per-transaction write limits. */
const ORPHAN_PAGE = 200;
const CONTEST_PAGE = 100;
const RETRO_PAGE = 50;
const TOMBSTONE_PAGE = 200;
const RETRIEVAL_PRUNE_PAGE = 500;

/** Per-sub-job page ceilings — safety rails so one pathological night can't run
 * an action unboundedly. At current corpus scale none of these caps is reached;
 * the driver logs `capped: true` if one ever is, as a signal to raise it or
 * shard the sweep across nights. */
const RETRO_MAX_PAGES = 200;
const CONTEST_MAX_PAGES = 200;
const ORPHAN_MAX_PAGES = 500;
const TOMBSTONE_MAX_PAGES = 100;
const RETRIEVAL_PRUNE_MAX_PAGES = 200;

// ── Entity resolution (local mirror of atomsCore.ENTITY_TABLES / entityExists,
// kept local to avoid an atomsCore ⇄ integritySweep import coupling — the same
// pattern versionPrecedence.ts uses for its atomsShareIdentity mirror). The map
// is spec-frozen: the six atom subject/object entity kinds. ──
const ENTITY_TABLES = {
  client: "clients",
  project: "projects",
  contact: "contacts",
  company: "companiesHouseCompanies",
  facility: "facilities",
  candidate: "entityCandidates",
} as const;

type EntityKind = keyof typeof ENTITY_TABLES;

/** Does `id` still resolve to a live row of the table backing `type`? A
 * malformed id (normalizeId returns null) or a deleted row both count as
 * "does not resolve" — the atom's anchor is gone either way. */
async function entityResolves(
  ctx: MutationCtx,
  type: string,
  id: string,
): Promise<boolean> {
  const table = (ENTITY_TABLES as Record<string, string>)[type];
  if (!table) return false; // unknown subject/object kind — treat as unresolved
  const normalized = ctx.db.normalizeId(table as any, id);
  if (!normalized) return false;
  return (await ctx.db.get(normalized)) !== null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(n, hi));
}

// ── Sub-job 2: stale-contest ageing ──

/**
 * staleContestScanPage — flag contested atoms older than the window that the
 * retro pass left unresolved. Paginate the atoms table for `status:contested`
 * (same scan shape as applyVersionPrecedenceRetro); flag each atom whose
 * _creationTime predates the cutoff and which is not already flagged. Flagging
 * = set atoms.contestFlaggedAt (idempotent — an already-flagged atom is
 * skipped) + write an auditLog row for the operator trail. Never resolves the
 * contest; version precedence is the ONLY auto-winner rule.
 */
export const staleContestScanPage = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
    olderThanDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const days = args.olderThanDays ?? STALE_CONTEST_DAYS;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const numItems = clamp(args.limit ?? CONTEST_PAGE, 1, 200);
    const page = await ctx.db
      .query("atoms")
      .filter((q) => q.eq(q.field("status"), "contested"))
      .paginate({ cursor: args.cursor ?? null, numItems });

    const now = new Date().toISOString();
    let scanned = 0;
    let flagged = 0;
    let alreadyFlagged = 0;
    let tooRecent = 0;
    for (const atom of page.page) {
      scanned++;
      if (atom.contestFlaggedAt) {
        alreadyFlagged++;
        continue;
      }
      if (atom._creationTime > cutoff) {
        tooRecent++;
        continue;
      }
      await ctx.db.patch(atom._id, { contestFlaggedAt: now });
      await ctx.db.insert("auditLog", {
        tableName: "atoms",
        recordId: atom._id,
        action: "update" as const,
        metadata: {
          operation: "integritySweep.staleContest",
          predicate: atom.predicate,
          subjectType: atom.subjectType,
          subjectId: atom.subjectId,
          ageDays: Math.floor((Date.now() - atom._creationTime) / 86400000),
          thresholdDays: days,
        },
        timestamp: now,
      });
      flagged++;
    }
    return {
      scanned,
      flagged,
      alreadyFlagged,
      tooRecent,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// ── Sub-job 3a: orphan / dangling atom detection ──

async function retireOrphan(
  ctx: MutationCtx,
  atom: Doc<"atoms">,
  reason: "subject_missing" | "object_missing",
  now: string,
): Promise<void> {
  // Reuse the retire machinery's shape (atomsCore.retireAtom): status →
  // "retired". A retired atom has no successor, so supersededBy is cleared; the
  // reason lives on the atom (supersessionReason "dangling_entity") AND in the
  // auditLog metadata (the granular subject/object distinction).
  await ctx.db.patch(atom._id, {
    status: "retired",
    supersededBy: undefined,
    supersessionReason: "dangling_entity",
  });
  await ctx.db.insert("auditLog", {
    tableName: "atoms",
    recordId: atom._id,
    action: "update" as const,
    metadata: {
      operation: "integritySweep.orphanRetire",
      reason,
      predicate: atom.predicate,
      subjectType: atom.subjectType,
      subjectId: atom.subjectId,
      objectEntityType: atom.objectEntityType ?? null,
      objectEntityId: atom.objectEntityId ?? null,
    },
    timestamp: now,
  });
}

/**
 * orphanScanPage — one page of the atoms table. For every atom:
 *  - supersededBy pointing at a now-missing atom → clear it + log (any status;
 *    a dangling pointer corrupts the supersession chain regardless of status).
 *  - live atom (active | contested) whose SUBJECT entity row no longer resolves
 *    → retire (reason "subject_missing").
 *  - live edge atom whose OBJECT entity row no longer resolves → retire (reason
 *    "object_missing").
 * Retired/superseded atoms are already dead, so their dangling anchors are left
 * alone (only their supersededBy pointer is repaired).
 */
export const orphanScanPage = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = clamp(args.limit ?? ORPHAN_PAGE, 1, 500);
    const page = await ctx.db
      .query("atoms")
      .paginate({ cursor: args.cursor ?? null, numItems });

    const now = new Date().toISOString();
    let scanned = 0;
    let retiredSubject = 0;
    let retiredObject = 0;
    let clearedSupersededBy = 0;
    for (const atom of page.page) {
      scanned++;

      // Dangling supersededBy — repair on any status.
      if (atom.supersededBy) {
        const target = await ctx.db.get(atom.supersededBy);
        if (!target) {
          await ctx.db.patch(atom._id, { supersededBy: undefined });
          await ctx.db.insert("auditLog", {
            tableName: "atoms",
            recordId: atom._id,
            action: "update" as const,
            metadata: {
              operation: "integritySweep.danglingSupersededBy",
              missingSupersededBy: atom.supersededBy,
            },
            timestamp: now,
          });
          clearedSupersededBy++;
        }
      }

      // Orphan subject/object only matters for still-live atoms.
      if (atom.status !== "active" && atom.status !== "contested") continue;

      const subjectOk = await entityResolves(
        ctx,
        atom.subjectType,
        atom.subjectId,
      );
      if (!subjectOk) {
        await retireOrphan(ctx, atom, "subject_missing", now);
        retiredSubject++;
        continue; // already retired — don't also object-check
      }

      if (atom.objectEntityId !== undefined && atom.objectEntityType !== undefined) {
        const objectOk = await entityResolves(
          ctx,
          atom.objectEntityType,
          atom.objectEntityId,
        );
        if (!objectOk) {
          await retireOrphan(ctx, atom, "object_missing", now);
          retiredObject++;
        }
      }
    }
    return {
      scanned,
      retiredSubject,
      retiredObject,
      clearedSupersededBy,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// ── Sub-job 3b: resolved entityCandidate tombstone hygiene ──

/**
 * candidateTombstoneScanPage — a resolved entityCandidate is a tombstone
 * (status "resolved" + resolvedToType/resolvedToId) so re-extraction anchors
 * instantly (candidates.ts §"Resolved tombstone"). If the target entity was
 * later deleted the tombstone dangles — every future re-extraction would anchor
 * to a dead row. This is LOG-ONLY (an auditLog row): un-resolving would silently
 * re-open the candidate for re-enrichment, which is an operator decision, not
 * the sweep's.
 */
export const candidateTombstoneScanPage = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = clamp(args.limit ?? TOMBSTONE_PAGE, 1, 500);
    const page = await ctx.db
      .query("entityCandidates")
      .withIndex("by_status", (q) => q.eq("status", "resolved"))
      .paginate({ cursor: args.cursor ?? null, numItems });

    const now = new Date().toISOString();
    let scanned = 0;
    let dangling = 0;
    for (const cand of page.page) {
      scanned++;
      if (!cand.resolvedToType || !cand.resolvedToId) continue;
      const ok = await entityResolves(ctx, cand.resolvedToType, cand.resolvedToId);
      if (!ok) {
        await ctx.db.insert("auditLog", {
          tableName: "entityCandidates",
          recordId: cand._id,
          action: "update" as const,
          metadata: {
            operation: "integritySweep.danglingTombstone",
            normalizedName: cand.normalizedName,
            resolvedToType: cand.resolvedToType,
            resolvedToId: cand.resolvedToId,
          },
          timestamp: now,
        });
        dangling++;
      }
    }
    return {
      scanned,
      dangling,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

// ── Driver ──

/**
 * nightlyIntegritySweep — the cron entry point. Chains the paginated sub-jobs
 * sequentially; each page is its own transaction so nothing is unbounded. Logs
 * a per-sub-job summary line and writes one auditLog row for the whole run.
 */
export const nightlyIntegritySweep = internalAction({
  args: {},
  handler: async (ctx) => {
    const startedAt = new Date().toISOString();

    // 1. Retro version-precedence pass over contested groups.
    const retro = {
      scannedContested: 0,
      resolvedGroups: 0,
      archivedAtoms: 0,
      pages: 0,
      capped: false,
    };
    {
      let cursor: string | null = null;
      for (let i = 0; i < RETRO_MAX_PAGES; i++) {
        const r: {
          scannedContested: number;
          resolvedGroups: number;
          archivedAtoms: number;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runMutation(
          internal.knowledge.versionPrecedence.applyVersionPrecedenceRetro,
          { cursor, limit: RETRO_PAGE },
        );
        retro.scannedContested += r.scannedContested;
        retro.resolvedGroups += r.resolvedGroups;
        retro.archivedAtoms += r.archivedAtoms;
        retro.pages++;
        if (r.isDone) break;
        cursor = r.continueCursor;
        if (i === RETRO_MAX_PAGES - 1) retro.capped = true;
      }
    }
    console.log(
      `[integritySweep] retro: scanned=${retro.scannedContested} resolvedGroups=${retro.resolvedGroups} archived=${retro.archivedAtoms} pages=${retro.pages} capped=${retro.capped}`,
    );

    // 2. Stale-contest ageing (run AFTER retro so only the residue is flagged).
    const contest = {
      scanned: 0,
      flagged: 0,
      alreadyFlagged: 0,
      pages: 0,
      capped: false,
    };
    {
      let cursor: string | null = null;
      for (let i = 0; i < CONTEST_MAX_PAGES; i++) {
        const r: {
          scanned: number;
          flagged: number;
          alreadyFlagged: number;
          tooRecent: number;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runMutation(
          internal.knowledge.integritySweep.staleContestScanPage,
          { cursor, limit: CONTEST_PAGE },
        );
        contest.scanned += r.scanned;
        contest.flagged += r.flagged;
        contest.alreadyFlagged += r.alreadyFlagged;
        contest.pages++;
        if (r.isDone) break;
        cursor = r.continueCursor;
        if (i === CONTEST_MAX_PAGES - 1) contest.capped = true;
      }
    }
    console.log(
      `[integritySweep] staleContest: scanned=${contest.scanned} flagged=${contest.flagged} alreadyFlagged=${contest.alreadyFlagged} pages=${contest.pages} capped=${contest.capped}`,
    );

    // 3a. Orphan / dangling atom detection.
    const orphan = {
      scanned: 0,
      retiredSubject: 0,
      retiredObject: 0,
      clearedSupersededBy: 0,
      pages: 0,
      capped: false,
    };
    {
      let cursor: string | null = null;
      for (let i = 0; i < ORPHAN_MAX_PAGES; i++) {
        const r: {
          scanned: number;
          retiredSubject: number;
          retiredObject: number;
          clearedSupersededBy: number;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runMutation(
          internal.knowledge.integritySweep.orphanScanPage,
          { cursor, limit: ORPHAN_PAGE },
        );
        orphan.scanned += r.scanned;
        orphan.retiredSubject += r.retiredSubject;
        orphan.retiredObject += r.retiredObject;
        orphan.clearedSupersededBy += r.clearedSupersededBy;
        orphan.pages++;
        if (r.isDone) break;
        cursor = r.continueCursor;
        if (i === ORPHAN_MAX_PAGES - 1) orphan.capped = true;
      }
    }
    console.log(
      `[integritySweep] orphan: scanned=${orphan.scanned} retiredSubject=${orphan.retiredSubject} retiredObject=${orphan.retiredObject} clearedSupersededBy=${orphan.clearedSupersededBy} pages=${orphan.pages} capped=${orphan.capped}`,
    );

    // 3b. Resolved entityCandidate tombstone hygiene.
    const tombstone = { scanned: 0, dangling: 0, pages: 0, capped: false };
    {
      let cursor: string | null = null;
      for (let i = 0; i < TOMBSTONE_MAX_PAGES; i++) {
        const r: {
          scanned: number;
          dangling: number;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runMutation(
          internal.knowledge.integritySweep.candidateTombstoneScanPage,
          { cursor, limit: TOMBSTONE_PAGE },
        );
        tombstone.scanned += r.scanned;
        tombstone.dangling += r.dangling;
        tombstone.pages++;
        if (r.isDone) break;
        cursor = r.continueCursor;
        if (i === TOMBSTONE_MAX_PAGES - 1) tombstone.capped = true;
      }
    }
    console.log(
      `[integritySweep] tombstone: scanned=${tombstone.scanned} dangling=${tombstone.dangling} pages=${tombstone.pages} capped=${tombstone.capped}`,
    );

    // 4. retrievalLog pruning (age-out disposable telemetry). Runs BEFORE the
    //    salience refresh on purpose: pruning is cheap and independent, so doing
    //    it first means a salience failure can never starve the prune, and the
    //    refresh then counts a trimmed (rolling-window) retrievalLog.
    const prune = { deleted: 0, pages: 0, capped: false };
    {
      let cursor: string | null = null;
      for (let i = 0; i < RETRIEVAL_PRUNE_MAX_PAGES; i++) {
        const r: {
          deleted: number;
          continueCursor: string;
          isDone: boolean;
        } = await ctx.runMutation(
          internal.knowledge.salience.pruneRetrievalLog,
          { cursor, limit: RETRIEVAL_PRUNE_PAGE },
        );
        prune.deleted += r.deleted;
        prune.pages++;
        if (r.isDone) break;
        cursor = r.continueCursor;
        if (i === RETRIEVAL_PRUNE_MAX_PAGES - 1) prune.capped = true;
      }
    }
    console.log(
      `[integritySweep] retrievalPrune: deleted=${prune.deleted} pages=${prune.pages} capped=${prune.capped}`,
    );

    // 5. Salience / IDF refresh (self-paginates internally; each apply page is a
    //    bounded transaction — see APPLY_PAGE × RETRIEVAL_COUNT_CAP in salience.ts).
    const salience = await ctx.runAction(
      internal.knowledge.salience.refreshSalience,
      {},
    );
    console.log(
      `[integritySweep] salience: totalLive=${salience.totalLive} predicates=${salience.predicates} patched=${salience.patched}`,
    );

    // 5b. Chunk-backfill tick (bounded walk — see backfillChunksForProseDocs).
    const chunks = await ctx.runAction(
      internal.knowledge.chunks.backfillChunksForProseDocs,
      {},
    );
    console.log(
      `[integritySweep] chunkBackfill: walked=${chunks.walked} chunked=${chunks.chunked} skipped=${chunks.skipped} pages=${chunks.pages} capped=${chunks.capped}`,
    );

    const finishedAt = new Date().toISOString();
    const summary = {
      startedAt,
      finishedAt,
      retro,
      contest,
      orphan,
      tombstone,
      salience,
      prune,
      chunks,
    };
    await ctx.runMutation(
      internal.knowledge.integritySweep.recordSweepRun,
      { startedAt, summary },
    );
    console.log(
      `[integritySweep] done: retiredAtoms=${orphan.retiredSubject + orphan.retiredObject} flaggedContests=${contest.flagged} resolvedRetro=${retro.resolvedGroups} saliencePatched=${salience.patched}`,
    );
    return summary;
  },
});

/** Persist one auditLog row per sweep run (the driver is an action and cannot
 * write directly). */
export const recordSweepRun = internalMutation({
  args: { startedAt: v.string(), summary: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLog", {
      tableName: "knowledgeIntegritySweep",
      recordId: args.startedAt,
      action: "update" as const,
      metadata: { operation: "integritySweep.run", ...args.summary },
      timestamp: new Date().toISOString(),
    });
  },
});
