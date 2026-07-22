import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Per-section cap on indexed hits pulled before JS-side status filtering.
const TAKE = 20;

async function clientNameLookup(
  ctx: QueryCtx,
  cache: Map<string, string | undefined>,
  clientId: Id<"clients"> | undefined
): Promise<string | undefined> {
  if (!clientId) return undefined;
  const key = clientId as string;
  if (!cache.has(key)) {
    const client = await ctx.db.get(clientId);
    cache.set(key, client?.name);
  }
  return cache.get(key);
}

function snippet(text: string, maxLength = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}

/**
 * Global search backing the command palette. Every section is served by a
 * dedicated search index (see schema) — no `.collect()` table scans, so the
 * query stays within Convex read limits regardless of table size.
 *
 * clients/prospects/lenders all live in the `clients` table and are
 * partitioned here: type "lender" → lender, status "prospect" → prospect
 * (matches convex/prospects.ts), everything else → client.
 *
 * Document coverage is two-fold: `documents.search_fileName` matches file
 * names, and `documentChunks.search_text` (the graph-RAG chunk store, which
 * indexes the full parsed text of every ingested document) matches document
 * content.
 */
export const globalSearch = query({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const searchQuery = args.query.trim();
    const limit = args.limit ?? 6;

    const empty = {
      clients: [],
      prospects: [],
      lenders: [],
      projects: [],
      documents: [],
      docContent: [],
      contacts: [],
      notes: [],
      meetings: [],
      events: [],
      tasks: [],
      atoms: [],
    };
    if (!searchQuery) return empty;

    const [
      clientHits,
      projectHits,
      documentHits,
      chunkHits,
      contactHits,
      noteHits,
      meetingHits,
      eventHits,
      taskHits,
      atomHits,
    ] = await Promise.all([
      ctx.db
        .query("clients")
        .withSearchIndex("search_name", (q) => q.search("name", searchQuery))
        .take(TAKE * 3), // partitioned into clients/prospects/lenders below
      ctx.db
        .query("projects")
        .withSearchIndex("search_name", (q) => q.search("name", searchQuery))
        .take(TAKE),
      ctx.db
        .query("documents")
        .withSearchIndex("search_fileName", (q) => q.search("fileName", searchQuery))
        .take(TAKE),
      ctx.db
        .query("documentChunks")
        .withSearchIndex("search_text", (q) => q.search("text", searchQuery))
        .take(TAKE),
      ctx.db
        .query("contacts")
        .withSearchIndex("search_name", (q) => q.search("name", searchQuery))
        .take(TAKE),
      ctx.db
        .query("notes")
        .withSearchIndex("search_title", (q) => q.search("title", searchQuery))
        .take(TAKE),
      ctx.db
        .query("meetings")
        .withSearchIndex("search_title", (q) => q.search("title", searchQuery))
        .take(TAKE),
      ctx.db
        .query("events")
        .withSearchIndex("search_title", (q) => q.search("title", searchQuery))
        .take(TAKE),
      ctx.db
        .query("tasks")
        .withSearchIndex("search_title", (q) => q.search("title", searchQuery))
        .take(TAKE),
      ctx.db
        .query("atoms")
        .withSearchIndex("search_statement", (q) => q.search("statement", searchQuery))
        .take(TAKE),
    ]);

    const names = new Map<string, string | undefined>();
    // Seed the lookup cache with the client rows we already have.
    for (const c of clientHits) names.set(c._id as string, c.name);

    // ── clients / prospects / lenders ──
    const liveClients = clientHits.filter((c) => c.isDeleted !== true);
    const mapClient = (c: Doc<"clients">) => ({
      id: c._id,
      name: c.name,
      companyName: c.companyName,
      email: c.email,
      status: c.status,
      type: c.type,
      prospectState: c.prospectState,
    });
    const lenders = liveClients.filter((c) => c.type === "lender").slice(0, limit).map(mapClient);
    const prospects = liveClients
      .filter((c) => c.type !== "lender" && c.status === "prospect")
      .slice(0, limit)
      .map(mapClient);
    const clients = liveClients
      .filter((c) => c.type !== "lender" && c.status !== "prospect")
      .slice(0, limit)
      .map(mapClient);

    // ── projects ──
    const projects = projectHits
      .filter((p) => p.isDeleted !== true)
      .slice(0, limit)
      .map((p) => ({
        id: p._id,
        name: p.name,
        status: p.status,
        city: p.city,
        loanAmount: p.loanAmount,
      }));

    // ── documents by file name ──
    const documents = documentHits
      .filter((d) => d.isDeleted !== true)
      .slice(0, limit)
      .map((d) => ({
        id: d._id,
        fileName: d.displayName || d.fileName,
        fileTypeDetected: d.fileTypeDetected,
        clientName: d.clientName,
        projectName: d.projectName || d.suggestedProjectName,
      }));

    // ── documents by content (graph-RAG chunks) ──
    const seenDocs = new Set<string>(documents.map((d) => d.id as string));
    const docContent: Array<{
      documentId: Id<"documents">;
      fileName: string;
      clientName?: string;
      snippet: string;
    }> = [];
    for (const chunk of chunkHits) {
      if (docContent.length >= limit) break;
      const docKey = chunk.documentId as string;
      if (seenDocs.has(docKey)) continue;
      seenDocs.add(docKey);
      const doc = await ctx.db.get(chunk.documentId);
      if (!doc || doc.isDeleted === true) continue;
      docContent.push({
        documentId: doc._id,
        fileName: doc.displayName || doc.fileName,
        clientName: doc.clientName,
        snippet: snippet(chunk.text),
      });
    }

    // ── contacts ──
    const contacts = contactHits
      .filter((c) => (c as { isDeleted?: boolean }).isDeleted !== true)
      .slice(0, limit)
      .map((c) => ({
        id: c._id,
        name: c.name,
        email: c.email,
        role: c.role,
        company: c.company,
      }));

    // ── notes ──
    const notes = await Promise.all(
      noteHits.slice(0, limit).map(async (n) => ({
        id: n._id,
        title: n.title,
        emoji: n.emoji,
        clientId: n.clientId,
        clientName: await clientNameLookup(ctx, names, n.clientId),
        projectId: n.projectId,
      }))
    );

    // ── meetings ──
    const meetings = await Promise.all(
      meetingHits
        .filter((m) => m.status !== "cancelled")
        .slice(0, limit)
        .map(async (m) => ({
          id: m._id,
          title: m.title,
          meetingDate: m.meetingDate,
          clientId: m.clientId,
          clientName: await clientNameLookup(ctx, names, m.clientId),
        }))
    );

    // ── calendar events ──
    const events = await Promise.all(
      eventHits
        .filter((e) => e.status !== "cancelled")
        .slice(0, limit)
        .map(async (e) => ({
          id: e._id,
          title: e.title,
          startTime: e.startTime,
          location: e.location,
          clientName: await clientNameLookup(ctx, names, e.clientId),
        }))
    );

    // ── tasks ──
    const tasks = taskHits
      .filter((t) => t.status !== "cancelled")
      .slice(0, limit)
      .map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
      }));

    // ── knowledge atoms (live facts only) ──
    const atoms = await Promise.all(
      atomHits
        .filter((a) => a.status === "active" || a.status === "contested")
        .slice(0, limit)
        .map(async (a) => ({
          id: a._id,
          statement: a.statement,
          status: a.status,
          clientId: a.clientId,
          clientName: await clientNameLookup(ctx, names, a.clientId),
        }))
    );

    return {
      clients,
      prospects,
      lenders,
      projects,
      documents,
      docContent,
      contacts,
      notes,
      meetings,
      events,
      tasks,
      atoms,
    };
  },
});
