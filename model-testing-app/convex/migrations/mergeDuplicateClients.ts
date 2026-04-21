import { v } from "convex/values";
import { internalMutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Merge duplicate client records.
 *
 * Primary use case (2026-04-21): two clients have been created twice in
 * HubSpot / via promotion — "Halo Living" and "Kinspire" — each pair
 * needs to collapse into a single canonical record with all history
 * carried over.
 *
 * Usage:
 *   npx convex run migrations/mergeDuplicateClients:findDuplicatesByName '{"name":"Halo Living"}'
 *   # inspect output, confirm target (keep) + source (discard) ids
 *   npx convex run migrations/mergeDuplicateClients:mergeTwo \
 *     '{"sourceId":"<discard>","targetId":"<keep>"}'
 *
 * Or for a clean auto-pick (oldest createdAt wins):
 *   npx convex run migrations/mergeDuplicateClients:mergeByName '{"name":"Halo Living"}'
 *
 * What `mergeTwo` does:
 *  - Reassigns `clientId` on every table that references clients
 *    (contacts, documents, tasks, flags, notes, meetings, chatSessions,
 *    enrichmentSuggestions, reminders, events, knowledgeBankEntries,
 *    knowledgeChecklistItems, knowledgeEmailLogs, knowledgeItems)
 *  - Updates companies.promotedToClientId from source → target
 *  - Updates projects.clientRoles[].clientId (array-inside-doc patch)
 *  - Deletes source-scoped singletons that would duplicate (clientFolders,
 *    clientIntelligence) — target keeps its own
 *  - Soft-deletes source client with `deletedReason: "merged_into_<targetId>"`
 *    so the collapse is reversible if the user realises they picked
 *    the wrong canonical
 */

// ---------------------------------------------------------------------------
// Query: find candidate duplicates by exact name match
// ---------------------------------------------------------------------------

export const findDuplicatesByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const hits = await ctx.db
      .query("clients")
      .filter((q) => q.eq(q.field("name"), args.name))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    return hits
      .sort((a, b) =>
        (a.createdAt || "").localeCompare(b.createdAt || ""),
      )
      .map((c) => ({
        _id: c._id,
        name: c.name,
        createdAt: c.createdAt,
        status: c.status,
        type: c.type,
        source: c.source,
      }));
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reassign a flat `clientId` field on every doc in a table that matches
// source → target. Used for the simple one-to-many FK tables.
async function reassignField(
  ctx: any,
  table: string,
  field: string,
  sourceId: Id<"clients">,
  targetId: Id<"clients">,
): Promise<number> {
  const rows = await ctx.db.query(table).collect();
  const matches = rows.filter((r: any) => r[field] === sourceId);
  for (const row of matches) {
    await ctx.db.patch(row._id, { [field]: targetId });
  }
  return matches.length;
}

// Hard-delete every doc on a table whose `clientId` points at the source.
// Used for client-scoped singletons where the target already has its
// own record (clientFolders, clientIntelligence) — keeping both would
// cause duplicate folder listings etc.
async function deleteByClientId(
  ctx: any,
  table: string,
  clientId: Id<"clients">,
): Promise<number> {
  const rows = await ctx.db.query(table).collect();
  const matches = rows.filter((r: any) => r.clientId === clientId);
  for (const row of matches) {
    await ctx.db.delete(row._id);
  }
  return matches.length;
}

// ---------------------------------------------------------------------------
// Internal: actual merge
// ---------------------------------------------------------------------------

export const mergeTwo = internalMutation({
  args: {
    sourceId: v.id("clients"),
    targetId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    if (args.sourceId === args.targetId) {
      throw new Error("sourceId and targetId are the same");
    }
    const source = await ctx.db.get(args.sourceId);
    const target = await ctx.db.get(args.targetId);
    if (!source) throw new Error(`Source client ${args.sourceId} not found`);
    if (!target) throw new Error(`Target client ${args.targetId} not found`);

    const counts: Record<string, number> = {};

    // Simple one-to-many FKs — flat clientId reassignments.
    const simpleTables = [
      "contacts",
      "documents",
      "tasks",
      "flags",
      "notes",
      "meetings",
      "chatSessions",
      "enrichmentSuggestions",
      "reminders",
      "events",
      "knowledgeBankEntries",
      "knowledgeChecklistItems",
      "knowledgeEmailLogs",
      "knowledgeItems",
      "prospectingContext",
      "prospectingEmails",
      "intelligenceConflicts",
    ];
    for (const t of simpleTables) {
      counts[t] = await reassignField(
        ctx,
        t,
        "clientId",
        args.sourceId,
        args.targetId,
      );
    }

    // Companies that were promoted to the source client → point them at
    // the target instead. This is how HubSpot company rows link to the
    // canonical client record.
    counts.companies = await reassignField(
      ctx,
      "companies",
      "promotedToClientId",
      args.sourceId,
      args.targetId,
    );

    // Projects have a `clientRoles` array of {clientId, role} objects —
    // can't patch with a flat reassignField; iterate and rewrite the
    // whole array per project that contains source.
    const allProjects = await ctx.db.query("projects").collect();
    let projectsUpdated = 0;
    for (const p of allProjects) {
      const roles: { clientId: Id<"clients">; role: string }[] = (p as any).clientRoles || [];
      const hasSource = roles.some((r) => r.clientId === args.sourceId);
      if (!hasSource) continue;
      // Rewrite: source → target, then dedupe if target already present.
      const rewritten = roles.map((r) =>
        r.clientId === args.sourceId ? { ...r, clientId: args.targetId } : r,
      );
      const deduped: typeof rewritten = [];
      const seen = new Set<string>();
      for (const r of rewritten) {
        const key = `${r.clientId}:${r.role}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(r);
      }
      await ctx.db.patch(p._id, { clientRoles: deduped as any });
      projectsUpdated++;
    }
    counts.projects = projectsUpdated;

    // Client-scoped singletons — target already has its own, so the
    // source's versions get deleted outright rather than reassigned.
    counts.clientFolders_deleted = await deleteByClientId(
      ctx,
      "clientFolders",
      args.sourceId,
    );
    counts.clientIntelligence_deleted = await deleteByClientId(
      ctx,
      "clientIntelligence",
      args.sourceId,
    );

    // Activities — schema has `clientId` via company promotion, not direct,
    // so reassigning companies.promotedToClientId above already redirects
    // derived client linkage. Any activity rows that DO carry clientId
    // directly get updated for completeness.
    counts.activities = await reassignField(
      ctx,
      "activities",
      "clientId",
      args.sourceId,
      args.targetId,
    );

    // Soft-delete source. Matches clients.remove's shape so the
    // restoration banner recognises it if the user realises we picked
    // the wrong canonical and wants to roll back.
    const now = new Date().toISOString();
    await ctx.db.patch(args.sourceId, {
      isDeleted: true,
      deletedAt: now,
      deletedReason: `merged_into_${args.targetId}`,
    });

    return {
      sourceId: args.sourceId,
      targetId: args.targetId,
      targetName: target.name,
      counts,
    };
  },
});

// ---------------------------------------------------------------------------
// Convenience: auto-merge every duplicate sharing a name
// (target = oldest by createdAt; all others merged in)
// ---------------------------------------------------------------------------

export const mergeByName = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const hits = await ctx.db
      .query("clients")
      .filter((q) => q.eq(q.field("name"), args.name))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    if (hits.length < 2) {
      return {
        name: args.name,
        action: "no-op",
        reason: `Found ${hits.length} non-deleted client(s) named "${args.name}"`,
      };
    }

    // Target = oldest by createdAt. Ties resolved by _creationTime.
    hits.sort((a, b) => {
      const ca = (a.createdAt || "").localeCompare(b.createdAt || "");
      if (ca !== 0) return ca;
      return a._creationTime - b._creationTime;
    });
    const target = hits[0];
    const sources = hits.slice(1);

    const merges = [];
    for (const s of sources) {
      // Inline the merge body rather than calling mergeTwo — Convex
      // mutations can't invoke other mutations directly, and the whole
      // loop needs to run in the same transaction so a failure mid-way
      // doesn't leave the data half-collapsed.
      const counts: Record<string, number> = {};
      const simpleTables = [
        "contacts", "documents", "tasks", "flags", "notes", "meetings",
        "chatSessions", "enrichmentSuggestions", "reminders", "events",
        "knowledgeBankEntries", "knowledgeChecklistItems",
        "knowledgeEmailLogs", "knowledgeItems", "prospectingContext",
        "prospectingEmails", "intelligenceConflicts",
      ];
      for (const t of simpleTables) {
        counts[t] = await reassignField(ctx, t, "clientId", s._id, target._id);
      }
      counts.companies = await reassignField(
        ctx, "companies", "promotedToClientId", s._id, target._id,
      );

      const allProjects = await ctx.db.query("projects").collect();
      let projectsUpdated = 0;
      for (const p of allProjects) {
        const roles: { clientId: Id<"clients">; role: string }[] =
          (p as any).clientRoles || [];
        if (!roles.some((r) => r.clientId === s._id)) continue;
        const rewritten = roles.map((r) =>
          r.clientId === s._id ? { ...r, clientId: target._id } : r,
        );
        const deduped: typeof rewritten = [];
        const seen = new Set<string>();
        for (const r of rewritten) {
          const key = `${r.clientId}:${r.role}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(r);
        }
        await ctx.db.patch(p._id, { clientRoles: deduped as any });
        projectsUpdated++;
      }
      counts.projects = projectsUpdated;

      counts.clientFolders_deleted = await deleteByClientId(
        ctx, "clientFolders", s._id,
      );
      counts.clientIntelligence_deleted = await deleteByClientId(
        ctx, "clientIntelligence", s._id,
      );
      counts.activities = await reassignField(
        ctx, "activities", "clientId", s._id, target._id,
      );

      const now = new Date().toISOString();
      await ctx.db.patch(s._id, {
        isDeleted: true,
        deletedAt: now,
        deletedReason: `merged_into_${target._id}`,
      });

      merges.push({ sourceId: s._id, counts });
    }

    return {
      name: args.name,
      action: "merged",
      targetId: target._id,
      targetCreatedAt: target.createdAt,
      mergedCount: sources.length,
      merges,
    };
  },
});
