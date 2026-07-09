import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  NameResolver,
  normalizePersonName,
  rolePredicate,
  type GraphEntityType,
} from "./graphQueries";

// graph.overview — the ORG-WIDE graph snapshot behind the atlas view.
//
// One snapshot the frontend renders to show EVERY entity and edge in the
// company's knowledge graph on a single explorable board: cross-client
// connections, lenders fanning out across clients/projects, contested atoms
// visible. Same federation semantics as graphQueries.expandEntity, applied
// globally instead of per-center:
//
//   ATOM edges    — a paged walk of the `atoms` table (live statuses only:
//                   active | contested; superseded/retired skipped). Every
//                   atom with objectEntityId becomes an edge candidate;
//                   attribute atoms contribute to the subject's atomCount.
//   NATIVE edges  — synthesized from ONE canonical structural side per
//                   relation so each fact is walked once:
//                     projects   → clientRoles (funds_project / developing)
//                     contacts   → works_at
//                     clients    → spv_of_group (CH-number joins)
//                     facilities → funds / lends_to / secured_on
//                     companies  → officer_of / psc_of (CH exact-name joins
//                                  against the contact roster), run only for
//                                  companies ALREADY in the graph — the atlas
//                                  deliberately does not fan out to every
//                                  synced CH mirror.
//
// Dedupe follows the module convention: per canonical (from, to, predicate)
// key the ATOM edge wins over its native mirror (`corroborated: true` notes
// the structural agreement); duplicate atoms keep the contested one first,
// then the higher-confidence one — a contest is never hidden by a calmer
// duplicate.
//
// Visibility: the atlas is the EVERYTHING view — no prospect-scope filter
// (matches the default lane everywhere else; spec §14b.6a filtering is a
// per-drawer concern, not an atlas one).
//
// ── Architecture: paged build → cached snapshot ──
// The original single-query walk blew Convex's 16MiB per-execution read
// limit once the graph passed ~800 atoms (the allContacts scan tipped it).
// The walk is now split along the seam that limit dictates:
//
//   1. LANE PAGES — internalQuery pages (pageAtoms / pageClients /
//      pageProjects / pageContacts / pageFacilities / pageCompanies /
//      resolveRefs), each reading a bounded slice well under the limit and
//      returning derived edges + node display info, never raw rows.
//   2. BUILD — an internalAction stitches the pages, then runs the SAME pure
//      assembly helpers as before (dedupe / degrees / truncation) and stores
//      the JSON in `graphOverviewCache`, chunked under the 1MiB doc cap.
//   3. READ — the public `snapshot` query (atlas board, reactive) and the
//      internal `snapshotInternal` (MCP graph.overview) parse the cached
//      chunks: instant load, no recompute per visit. Freshness: the public
//      `refresh` action / internal `ensureFresh` rebuild when the snapshot
//      is older than SNAPSHOT_TTL_MS (or `force`), guarded by a build lock.
//
// Bounds still degrade to counts.truncated=true instead of erroring: the
// atoms walk stops at ATOM_SCAN_CAP rows, the CH officer/psc pass covers at
// most COMPANY_PASS_CAP referenced companies, and the stored snapshot is
// truncated to DEFAULT_MAX_NODES/EDGES (lowest-degree contact/company/
// candidate leaves dropped first). documents / atomObservations are never
// walked.

// ── Bounds ──

export const DEFAULT_MAX_NODES = 2500;
export const DEFAULT_MAX_EDGES = 6000;
/** Max `atoms` rows read in the walk (all statuses — the table includes
 * superseded/retired history rows we skip but still pay to scan). */
const ATOM_SCAN_CAP = 8000;
/** Max referenced CH companies expanded for officer_of/psc_of joins. Keep it
 * a multiple of COMPANY_BATCH so the people/no-people split falls on a batch
 * boundary. */
const COMPANY_PASS_CAP = 400;
/** Rows per atoms page. */
const ATOM_PAGE = 1000;
/** Rows per structural-table page (clients/projects/contacts/facilities). */
const SCAN_PAGE = 250;
/** Companies per pageCompanies batch. */
const COMPANY_BATCH = 50;
/** Keys per resolveRefs batch. */
const REF_BATCH = 200;
/** A snapshot younger than this is served as-is; refresh/ensureFresh only
 * rebuild past it (or on force). */
const SNAPSHOT_TTL_MS = 5 * 60_000;
/** Build lock: a claim older than this is treated as a dead build. */
const BUILD_LOCK_MS = 2 * 60_000;
/** Max UTF-16 units per stored chunk — sized so even all-3-byte content
 * stays under Convex's 1MiB document cap. */
const CHUNK_CHARS = 300_000;

// ── Types ──

export type OverviewNode = {
  /** `${type}:${id}` — matches the edge endpoint keys. */
  key: string;
  type: GraphEntityType;
  id: string;
  name: string;
  /** Clients only — normalized from the free-string clients.type. */
  clientType?: "lender" | "borrower" | "developer";
  /** Clients only — "prospect" | "active" (archived/past ⇒ undefined). */
  clientStatus?: "active" | "prospect";
  /** Clustering hint: contact → its client; facility → borrower client;
   * project → first non-lender clientRole (else first role). */
  ownerClientId?: string;
  /** Live atoms with this entity as SUBJECT (edges + attributes). */
  atomCount: number;
  /** Contested subset of atomCount. */
  contestedCount: number;
  /** Edge endpoints touching this node in the RETURNED edge list. */
  degree: number;
};

export type OverviewEdge = {
  from: string;
  to: string;
  predicate: string;
  kind: "atom" | "native";
  /** Atom edges only — the drill-down / contested-resolution handle. */
  atomId?: string;
  status: "active" | "contested";
  /** Atom edges only; native edges are structural record (no score). */
  confidence?: number;
  salience?: number;
  /** Atom edge whose native mirror asserted the same relation (deduped away). */
  corroborated?: boolean;
};

export type OverviewCounts = {
  nodes: number;
  edges: number;
  /** Live atoms org-wide (edges + attributes) seen by the walk. */
  atoms: number;
  /** Contested subset of `atoms`. */
  contested: number;
  byType: Record<string, number>;
  truncated: boolean;
};

export type OverviewResult = {
  nodes: OverviewNode[];
  edges: OverviewEdge[];
  counts: OverviewCounts;
};

/** What the read surfaces return: the cached snapshot (null before the first
 * build lands), when it was built, and whether a rebuild is in flight. */
export type OverviewSnapshot = {
  overview: OverviewResult | null;
  builtAt: number | null;
  building: boolean;
};

// ── Pure helpers (unit-tested in graphOverview.test.ts) ──

/** Contested > active; then higher confidence; deterministic. Used to pick
 * the surviving atom when duplicates assert the same (from, to, predicate). */
function betterAtom(a: OverviewEdge, b: OverviewEdge): OverviewEdge {
  if (a.status !== b.status) return a.status === "contested" ? a : b;
  return (b.confidence ?? 0) > (a.confidence ?? 0) ? b : a;
}

/**
 * Dedupe per canonical (from, to, predicate) key.
 *   atom vs native → atom wins, `corroborated: true` (the expandEntity
 *                    atom-wins convention, minus the provenance annotation);
 *   atom vs atom   → contested wins over active (a contest is never hidden),
 *                    then higher confidence;
 *   native vs native → first wins (mirrors collected from both endpoints).
 * Input order never changes the surviving edge's identity fields.
 */
export function dedupeOverviewEdges(edges: OverviewEdge[]): OverviewEdge[] {
  const byKey = new Map<string, OverviewEdge>();
  for (const e of edges) {
    const key = `${e.predicate}|${e.from}|${e.to}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...e });
      continue;
    }
    if (prev.kind === "atom" && e.kind === "atom") {
      const winner = { ...betterAtom(prev, e) };
      winner.corroborated = prev.corroborated || e.corroborated || undefined;
      byKey.set(key, winner);
    } else if (prev.kind === "atom") {
      // e is the native mirror — atom stays, structural agreement noted.
      prev.corroborated = true;
    } else if (e.kind === "atom") {
      byKey.set(key, { ...e, corroborated: true });
    }
    // native vs native → keep prev (identical mirrors).
  }
  return [...byKey.values()];
}

/** Edge-endpoint count per node key over `edges`. Self-loops count once. */
export function computeDegrees(edges: OverviewEdge[]): Map<string, number> {
  const degrees = new Map<string, number>();
  const bump = (key: string) => degrees.set(key, (degrees.get(key) ?? 0) + 1);
  for (const e of edges) {
    bump(e.from);
    if (e.to !== e.from) bump(e.to);
  }
  return degrees;
}

/** Keep-priority for edge truncation: contested first, then atom over
 * native, then confidence desc, then a stable key for determinism. */
export function rankOverviewEdges(a: OverviewEdge, b: OverviewEdge): number {
  const contested = Number(b.status === "contested") - Number(a.status === "contested");
  if (contested !== 0) return contested;
  const atom = Number(b.kind === "atom") - Number(a.kind === "atom");
  if (atom !== 0) return atom;
  const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
  if (conf !== 0) return conf;
  return `${a.predicate}|${a.from}|${a.to}`.localeCompare(`${b.predicate}|${b.from}|${b.to}`);
}

/** Node drop order when over maxNodes: leafy types first (candidate, then
 * contact/company), then facility/project, clients last; within a tier,
 * lowest degree first, then lowest atomCount, then key (deterministic). */
const DROP_TIER: Record<string, number> = {
  candidate: 0,
  contact: 1,
  company: 1,
  facility: 2,
  project: 2,
  client: 3,
};

export function truncateOverview(
  nodes: OverviewNode[],
  edges: OverviewEdge[],
  maxNodes: number,
  maxEdges: number,
): { nodes: OverviewNode[]; edges: OverviewEdge[]; truncated: boolean } {
  let truncated = false;
  let keptNodes = nodes;
  let keptEdges = edges;

  if (keptNodes.length > maxNodes) {
    truncated = true;
    const dropOrder = [...keptNodes].sort(
      (a, b) =>
        (DROP_TIER[a.type] ?? 1) - (DROP_TIER[b.type] ?? 1) ||
        a.degree - b.degree ||
        a.atomCount - b.atomCount ||
        a.key.localeCompare(b.key),
    );
    const dropped = new Set(
      dropOrder.slice(0, keptNodes.length - maxNodes).map((n) => n.key),
    );
    keptNodes = keptNodes.filter((n) => !dropped.has(n.key));
    keptEdges = keptEdges.filter((e) => !dropped.has(e.from) && !dropped.has(e.to));
  }

  if (keptEdges.length > maxEdges) {
    truncated = true;
    keptEdges = [...keptEdges].sort(rankOverviewEdges).slice(0, maxEdges);
  }

  // Degrees reflect the RETURNED edge list.
  const degrees = computeDegrees(keptEdges);
  keptNodes = keptNodes.map((n) => ({ ...n, degree: degrees.get(n.key) ?? 0 }));
  return { nodes: keptNodes, edges: keptEdges, truncated };
}

/** clients.type is a free string ("lender", "real-estate-developer", …). */
export function normalizeClientType(
  raw: string | undefined,
): "lender" | "borrower" | "developer" | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase();
  if (t.includes("lender")) return "lender";
  if (t.includes("developer")) return "developer";
  if (t.includes("borrower")) return "borrower";
  return undefined;
}

/** Legacy rows with no status are working clients → "active"; archived/past
 * clients stay on the board (their edges are history) but unflagged. */
export function normalizeClientStatus(
  status: string | undefined,
): "active" | "prospect" | undefined {
  if (status === "prospect") return "prospect";
  if (status === "archived" || status === "past") return undefined;
  return "active";
}

/** Slice a string into ≤`size` UTF-16-unit pieces for chunked storage; join
 * with "" to reassemble losslessly. Never splits a surrogate pair across
 * chunks (Convex strings are UTF-8 — a lone surrogate wouldn't round-trip).
 * Always returns ≥1 chunk so a snapshot write is never empty. */
export function chunkString(s: string, size: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + size, s.length);
    const last = s.charCodeAt(end - 1);
    if (end < s.length && last >= 0xd800 && last <= 0xdbff) end++;
    out.push(s.slice(i, end));
    i = end;
  }
  return out.length > 0 ? out : [""];
}

function projectOwnerClientId(project: Doc<"projects">): string | undefined {
  const roles = project.clientRoles ?? [];
  const nonLender = roles.find((r) => r.role.toLowerCase() !== "lender");
  return (nonLender ?? roles[0])?.clientId as string | undefined;
}

// ── Lane pages (internalQuery each — every page reads a bounded slice well
//    under the 16MiB execution limit and returns DERIVED edges + node
//    display info, never raw rows) ──

const pageArgs = { cursor: v.union(v.string(), v.null()) };

type AtomsPage = {
  edges: OverviewEdge[];
  subjects: Array<{ key: string; atoms: number; contested: number }>;
  liveAtoms: number;
  contested: number;
  scanned: number;
  continueCursor: string;
  isDone: boolean;
};

export const pageAtoms = internalQuery({
  args: pageArgs,
  handler: async (ctx, args): Promise<AtomsPage> => {
    const page = await ctx.db
      .query("atoms")
      .paginate({ cursor: args.cursor, numItems: ATOM_PAGE });
    const edges: OverviewEdge[] = [];
    const perSubject = new Map<string, { atoms: number; contested: number }>();
    let liveAtoms = 0;
    let contested = 0;
    for (const atom of page.page) {
      if (atom.status !== "active" && atom.status !== "contested") continue;
      liveAtoms++;
      const isContested = atom.status === "contested";
      if (isContested) contested++;
      const subjectKey = `${atom.subjectType}:${atom.subjectId}`;
      const counts = perSubject.get(subjectKey) ?? { atoms: 0, contested: 0 };
      counts.atoms++;
      if (isContested) counts.contested++;
      perSubject.set(subjectKey, counts);
      if (atom.objectEntityId !== undefined && atom.objectEntityType !== undefined) {
        edges.push({
          from: subjectKey,
          to: `${atom.objectEntityType}:${atom.objectEntityId}`,
          predicate: atom.predicate,
          kind: "atom",
          atomId: atom._id as string,
          status: atom.status,
          confidence: atom.confidence,
          salience: atom.salience,
        });
      }
    }
    return {
      edges,
      subjects: [...perSubject].map(([key, c]) => ({ key, atoms: c.atoms, contested: c.contested })),
      liveAtoms,
      contested,
      scanned: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

type ClientsPage = {
  clients: Array<{
    id: string;
    name: string;
    clientType?: "lender" | "borrower" | "developer";
    clientStatus?: "active" | "prospect";
  }>;
  edges: OverviewEdge[];
  continueCursor: string;
  isDone: boolean;
};

export const pageClients = internalQuery({
  args: pageArgs,
  handler: async (ctx, args): Promise<ClientsPage> => {
    const page = await ctx.db
      .query("clients")
      .paginate({ cursor: args.cursor, numItems: SCAN_PAGE });
    const clients: ClientsPage["clients"] = [];
    const edges: OverviewEdge[] = [];
    for (const row of page.page) {
      if (row.isDeleted === true) continue;
      clients.push({
        id: row._id as string,
        name: row.name || row.companyName || "(unnamed client)",
        clientType: normalizeClientType(row.type),
        clientStatus: normalizeClientStatus(row.status),
      });
      // spv_of_group — only CH numbers that resolve to a mirrored
      // companiesHouseCompanies row become edges (no row, no node).
      for (const chNumber of row.relatedCompaniesHouseNumbers ?? []) {
        const company = await ctx.db
          .query("companiesHouseCompanies")
          .withIndex("by_company_number", (q) => q.eq("companyNumber", chNumber))
          .first();
        if (company) {
          edges.push({
            from: `company:${company._id}`,
            to: `client:${row._id}`,
            predicate: "spv_of_group",
            kind: "native",
            status: "active",
          });
        }
      }
    }
    return { clients, edges, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

type ProjectsPage = {
  projects: Array<{ id: string; name: string; ownerClientId?: string }>;
  edges: OverviewEdge[];
  continueCursor: string;
  isDone: boolean;
};

export const pageProjects = internalQuery({
  args: pageArgs,
  handler: async (ctx, args): Promise<ProjectsPage> => {
    const page = await ctx.db
      .query("projects")
      .paginate({ cursor: args.cursor, numItems: SCAN_PAGE });
    const projects: ProjectsPage["projects"] = [];
    const edges: OverviewEdge[] = [];
    for (const row of page.page) {
      if (row.isDeleted === true) continue;
      projects.push({
        id: row._id as string,
        name: row.name,
        ownerClientId: projectOwnerClientId(row),
      });
      for (const cr of row.clientRoles ?? []) {
        edges.push({
          from: `client:${cr.clientId}`,
          to: `project:${row._id}`,
          predicate: rolePredicate(cr.role),
          kind: "native",
          status: "active",
        });
      }
    }
    return { projects, edges, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

type ContactsPage = {
  contacts: Array<{
    id: string;
    name: string;
    /** normalizePersonName(name) — the action joins CH officer/PSC names
     * against this map. */
    normalizedName: string;
    ownerClientId?: string;
  }>;
  edges: OverviewEdge[];
  continueCursor: string;
  isDone: boolean;
};

export const pageContacts = internalQuery({
  args: pageArgs,
  handler: async (ctx, args): Promise<ContactsPage> => {
    const page = await ctx.db
      .query("contacts")
      .paginate({ cursor: args.cursor, numItems: SCAN_PAGE });
    const contacts: ContactsPage["contacts"] = [];
    const edges: OverviewEdge[] = [];
    for (const row of page.page) {
      if (row.isDeleted === true) continue;
      contacts.push({
        id: row._id as string,
        name: row.name,
        normalizedName: normalizePersonName(row.name),
        ownerClientId: row.clientId as string | undefined,
      });
      if (row.clientId) {
        edges.push({
          from: `contact:${row._id}`,
          to: `client:${row.clientId}`,
          predicate: "works_at",
          kind: "native",
          status: "active",
        });
      }
    }
    return { contacts, edges, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

type FacilitiesPage = {
  facilities: Array<{ id: string; name: string; ownerClientId?: string }>;
  edges: OverviewEdge[];
  continueCursor: string;
  isDone: boolean;
};

export const pageFacilities = internalQuery({
  args: pageArgs,
  handler: async (ctx, args): Promise<FacilitiesPage> => {
    const page = await ctx.db
      .query("facilities")
      .paginate({ cursor: args.cursor, numItems: SCAN_PAGE });
    const facilities: FacilitiesPage["facilities"] = [];
    const edges: OverviewEdge[] = [];
    for (const row of page.page) {
      // Same display naming as NameResolver's facility case.
      const amount =
        row.amountGBP !== undefined
          ? `£${row.amountGBP.toLocaleString("en-GB")}`
          : undefined;
      facilities.push({
        id: row._id as string,
        name: amount ? `Facility · ${amount}` : "Facility",
        ownerClientId: row.borrowerClientId as string | undefined,
      });
      const facilityKey = `facility:${row._id}`;
      // Canonical directions (see graphQueries module header): funds lender →
      // facility; lends_to facility → borrower; secured_on facility → project.
      edges.push({
        from: facilityKey,
        to: `project:${row.projectId}`,
        predicate: "secured_on",
        kind: "native",
        status: "active",
      });
      if (row.lenderClientId) {
        edges.push({
          from: `client:${row.lenderClientId}`,
          to: facilityKey,
          predicate: "funds",
          kind: "native",
          status: "active",
        });
      }
      if (row.lenderCompanyId) {
        edges.push({
          from: `company:${row.lenderCompanyId}`,
          to: facilityKey,
          predicate: "funds",
          kind: "native",
          status: "active",
        });
      }
      if (row.borrowerClientId) {
        edges.push({
          from: facilityKey,
          to: `client:${row.borrowerClientId}`,
          predicate: "lends_to",
          kind: "native",
          status: "active",
        });
      }
    }
    return { facilities, edges, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

type CompaniesBatch = Array<{
  id: string;
  name: string;
  officers?: Array<{ name: string }>;
  psc?: Array<{ name: string }>;
}>;

export const pageCompanies = internalQuery({
  args: { ids: v.array(v.string()), includePeople: v.boolean() },
  handler: async (ctx, args): Promise<CompaniesBatch> => {
    const companies: CompaniesBatch = [];
    for (const id of args.ids) {
      const nid = ctx.db.normalizeId("companiesHouseCompanies", id);
      const row = nid && (await ctx.db.get(nid));
      if (!nid || !row) continue;
      const entry: CompaniesBatch[number] = { id, name: row.companyName };
      if (args.includePeople) {
        const officers = await ctx.db
          .query("companiesHouseOfficers")
          .withIndex("by_company", (q) => q.eq("companyId", nid))
          .collect();
        entry.officers = officers.map((o) => ({ name: o.name }));
        const psc = await ctx.db
          .query("companiesHousePSC")
          .withIndex("by_company", (q) => q.eq("companyId", nid))
          .collect();
        entry.psc = psc
          .filter((p) => p.pscType === "individual")
          .map((p) => ({ name: p.name }));
      }
      companies.push(entry);
    }
    return companies;
  },
});

export const resolveRefs = internalQuery({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args): Promise<Array<{ key: string; name: string }>> => {
    const names = new NameResolver(ctx);
    const out: Array<{ key: string; name: string }> = [];
    for (const key of args.keys) {
      const sep = key.indexOf(":");
      const type = key.slice(0, sep) as GraphEntityType;
      const id = key.slice(sep + 1);
      out.push({ key, name: (await names.ref(type, id)).name });
    }
    return out;
  },
});

// ── Snapshot assembly (runs in an action — plain JS over the lane pages) ──

type NodeInfo = {
  name: string;
  clientType?: "lender" | "borrower" | "developer";
  clientStatus?: "active" | "prospect";
  ownerClientId?: string;
};

async function buildCore(ctx: ActionCtx): Promise<OverviewResult> {
  const rawEdges: OverviewEdge[] = [];
  const atomCounts = new Map<string, { atoms: number; contested: number }>();
  const info = new Map<string, NodeInfo>();
  let totalAtoms = 0;
  let totalContested = 0;

  // ── 1. Atom walk (paged; live atoms → edges + per-subject counts) ──
  let atomScanTruncated = false;
  {
    let cursor: string | null = null;
    let scanned = 0;
    for (;;) {
      const page = await ctx.runQuery(internal.knowledge.graphOverview.pageAtoms, { cursor });
      rawEdges.push(...page.edges);
      for (const s of page.subjects) {
        const counts = atomCounts.get(s.key) ?? { atoms: 0, contested: 0 };
        counts.atoms += s.atoms;
        counts.contested += s.contested;
        atomCounts.set(s.key, counts);
      }
      totalAtoms += page.liveAtoms;
      totalContested += page.contested;
      scanned += page.scanned;
      if (page.isDone) break;
      if (scanned >= ATOM_SCAN_CAP) {
        atomScanTruncated = true;
        break;
      }
      cursor = page.continueCursor;
    }
  }

  // ── 2. Structural lanes (each a paged scan; edges from ONE canonical
  //       side per relation — see header) ──
  const clientKeys: string[] = [];
  {
    let cursor: string | null = null;
    for (;;) {
      const page = await ctx.runQuery(internal.knowledge.graphOverview.pageClients, { cursor });
      rawEdges.push(...page.edges);
      for (const c of page.clients) {
        const key = `client:${c.id}`;
        clientKeys.push(key);
        info.set(key, { name: c.name, clientType: c.clientType, clientStatus: c.clientStatus });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }

  const projectKeys: string[] = [];
  {
    let cursor: string | null = null;
    for (;;) {
      const page = await ctx.runQuery(internal.knowledge.graphOverview.pageProjects, { cursor });
      rawEdges.push(...page.edges);
      for (const p of page.projects) {
        const key = `project:${p.id}`;
        projectKeys.push(key);
        info.set(key, { name: p.name, ownerClientId: p.ownerClientId });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }

  const contactByNormalizedName = new Map<string, string>();
  {
    let cursor: string | null = null;
    for (;;) {
      const page = await ctx.runQuery(internal.knowledge.graphOverview.pageContacts, { cursor });
      rawEdges.push(...page.edges);
      for (const c of page.contacts) {
        info.set(`contact:${c.id}`, { name: c.name, ownerClientId: c.ownerClientId });
        contactByNormalizedName.set(c.normalizedName, c.id);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }

  {
    let cursor: string | null = null;
    for (;;) {
      const page = await ctx.runQuery(internal.knowledge.graphOverview.pageFacilities, { cursor });
      rawEdges.push(...page.edges);
      for (const f of page.facilities) {
        info.set(`facility:${f.id}`, { name: f.name, ownerClientId: f.ownerClientId });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }

  // ── 3. Companies already IN the graph: names for all of them, CH
  //       officer/psc joins for the first COMPANY_PASS_CAP ──
  const referencedCompanyIds: string[] = [];
  {
    const seen = new Set<string>();
    const note = (key: string) => {
      if (!key.startsWith("company:")) return;
      const id = key.slice("company:".length);
      if (!seen.has(id)) {
        seen.add(id);
        referencedCompanyIds.push(id);
      }
    };
    for (const e of rawEdges) {
      note(e.from);
      note(e.to);
    }
    for (const key of atomCounts.keys()) note(key);
  }
  const companyPassTruncated = referencedCompanyIds.length > COMPANY_PASS_CAP;
  for (let i = 0; i < referencedCompanyIds.length; i += COMPANY_BATCH) {
    const batch = referencedCompanyIds.slice(i, i + COMPANY_BATCH);
    // COMPANY_PASS_CAP is a multiple of COMPANY_BATCH, so the people cutoff
    // falls exactly on a batch boundary.
    const includePeople = i < COMPANY_PASS_CAP;
    const rows = await ctx.runQuery(internal.knowledge.graphOverview.pageCompanies, {
      ids: batch,
      includePeople,
    });
    for (const row of rows) {
      const companyKey = `company:${row.id}`;
      info.set(companyKey, { name: row.name });
      // Exact-normalized-name joins to the contact roster — same match rule
      // (and the same strong-but-unverified caveat) as nativeEdgesForCompany.
      for (const o of row.officers ?? []) {
        const match = contactByNormalizedName.get(normalizePersonName(o.name));
        if (match) {
          rawEdges.push({
            from: `contact:${match}`,
            to: companyKey,
            predicate: "officer_of",
            kind: "native",
            status: "active",
          });
        }
      }
      for (const p of row.psc ?? []) {
        const match = contactByNormalizedName.get(normalizePersonName(p.name));
        if (match) {
          rawEdges.push({
            from: `contact:${match}`,
            to: companyKey,
            predicate: "psc_of",
            kind: "native",
            status: "active",
          });
        }
      }
    }
  }

  // ── 4. Dedupe (atom wins; mirrors collapse) ──
  const edges = dedupeOverviewEdges(rawEdges);

  // ── 5. Nodes: all clients + projects, plus every other entity with ≥1
  //       atom or edge. Names come from the lane scans; anything they didn't
  //       cover (candidates, rows referenced by atoms but deleted/missing)
  //       resolves through the shared NameResolver in batches. ──
  const nodeKeys = new Set<string>([...clientKeys, ...projectKeys]);
  for (const key of atomCounts.keys()) nodeKeys.add(key);
  for (const e of edges) {
    nodeKeys.add(e.from);
    nodeKeys.add(e.to);
  }

  const unresolved = [...nodeKeys].filter((k) => !info.has(k));
  for (let i = 0; i < unresolved.length; i += REF_BATCH) {
    const refs = await ctx.runQuery(internal.knowledge.graphOverview.resolveRefs, {
      keys: unresolved.slice(i, i + REF_BATCH),
    });
    for (const r of refs) info.set(r.key, { name: r.name });
  }

  const nodes: OverviewNode[] = [];
  for (const key of nodeKeys) {
    const sep = key.indexOf(":");
    const type = key.slice(0, sep) as GraphEntityType;
    const id = key.slice(sep + 1);
    const meta = info.get(key);
    const counts = atomCounts.get(key);
    const node: OverviewNode = {
      key,
      type,
      id,
      name: meta?.name ?? `(missing ${type})`,
      atomCount: counts?.atoms ?? 0,
      contestedCount: counts?.contested ?? 0,
      degree: 0, // filled from the final edge list in truncateOverview
    };
    if (meta?.clientType) node.clientType = meta.clientType;
    if (meta?.clientStatus) node.clientStatus = meta.clientStatus;
    if (meta?.ownerClientId) node.ownerClientId = meta.ownerClientId;
    nodes.push(node);
  }

  // ── 6. Truncate (leaf contacts/companies first) + final degrees ──
  const pre = computeDegrees(edges);
  for (const n of nodes) n.degree = pre.get(n.key) ?? 0;
  const result = truncateOverview(nodes, edges, DEFAULT_MAX_NODES, DEFAULT_MAX_EDGES);

  const byType: Record<string, number> = {};
  for (const n of result.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;

  return {
    nodes: result.nodes,
    edges: result.edges,
    counts: {
      nodes: result.nodes.length,
      edges: result.edges.length,
      atoms: totalAtoms,
      contested: totalContested,
      byType,
      truncated: result.truncated || atomScanTruncated || companyPassTruncated,
    },
  };
}

// ── Snapshot storage (graphOverviewCache: one meta row + JSON chunks) ──

async function getMeta(ctx: QueryCtx) {
  return await ctx.db
    .query("graphOverviewCache")
    .withIndex("by_kind_build", (q) => q.eq("kind", "meta"))
    .unique();
}

export const buildStatus = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ builtAt: number | null; building: boolean }> => {
    const meta = await getMeta(ctx);
    return { builtAt: meta?.builtAt ?? null, building: !!meta?.buildStartedAt };
  },
});

export const claimBuild = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ claimed: boolean }> => {
    const meta = await getMeta(ctx);
    const now = Date.now();
    if (meta?.buildStartedAt && now - meta.buildStartedAt < BUILD_LOCK_MS) {
      return { claimed: false };
    }
    if (meta) await ctx.db.patch(meta._id, { buildStartedAt: now });
    else await ctx.db.insert("graphOverviewCache", { kind: "meta", buildId: "", buildStartedAt: now });
    return { claimed: true };
  },
});

export const releaseBuild = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const meta = await getMeta(ctx);
    if (meta?.buildStartedAt) await ctx.db.patch(meta._id, { buildStartedAt: undefined });
  },
});

export const writeSnapshot = internalMutation({
  args: { chunks: v.array(v.string()) },
  handler: async (ctx, args): Promise<void> => {
    const buildId = `build_${Date.now()}`;
    for (let i = 0; i < args.chunks.length; i++) {
      await ctx.db.insert("graphOverviewCache", {
        kind: "chunk",
        buildId,
        seq: i,
        payload: args.chunks[i],
      });
    }
    const meta = await getMeta(ctx);
    if (meta) {
      await ctx.db.patch(meta._id, {
        buildId,
        builtAt: Date.now(),
        chunkCount: args.chunks.length,
        buildStartedAt: undefined,
      });
    } else {
      await ctx.db.insert("graphOverviewCache", {
        kind: "meta",
        buildId,
        builtAt: Date.now(),
        chunkCount: args.chunks.length,
      });
    }
    // Sweep chunks of superseded builds — readers flipped with the meta
    // patch above (same transaction), so nothing can still be reading them.
    const stale = (
      await ctx.db
        .query("graphOverviewCache")
        .withIndex("by_kind_build", (q) => q.eq("kind", "chunk"))
        .collect()
    ).filter((c) => c.buildId !== buildId);
    for (const c of stale) await ctx.db.delete(c._id);
  },
});

async function buildIfNeeded(
  ctx: ActionCtx,
  force: boolean,
): Promise<{ built: boolean; reason?: string; counts?: OverviewCounts }> {
  const status = await ctx.runQuery(internal.knowledge.graphOverview.buildStatus, {});
  if (!force && status.builtAt && Date.now() - status.builtAt < SNAPSHOT_TTL_MS) {
    return { built: false, reason: "fresh" };
  }
  const claim = await ctx.runMutation(internal.knowledge.graphOverview.claimBuild, {});
  if (!claim.claimed) return { built: false, reason: "already_building" };
  try {
    const overview = await buildCore(ctx);
    await ctx.runMutation(internal.knowledge.graphOverview.writeSnapshot, {
      chunks: chunkString(JSON.stringify(overview), CHUNK_CHARS),
    });
    return { built: true, counts: overview.counts };
  } catch (e) {
    await ctx.runMutation(internal.knowledge.graphOverview.releaseBuild, {});
    throw e;
  }
}

// ── Read side ──

async function readSnapshot(
  ctx: QueryCtx,
  args: { maxNodes?: number; maxEdges?: number },
): Promise<OverviewSnapshot> {
  const meta = await getMeta(ctx);
  const building = !!meta?.buildStartedAt;
  if (!meta || !meta.builtAt || !meta.buildId) {
    return { overview: null, builtAt: null, building };
  }
  const chunkRows = await ctx.db
    .query("graphOverviewCache")
    .withIndex("by_kind_build", (q) => q.eq("kind", "chunk").eq("buildId", meta.buildId))
    .collect();
  chunkRows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  let overview = JSON.parse(chunkRows.map((c) => c.payload ?? "").join("")) as OverviewResult;

  // Per-request caps re-apply over the cached (DEFAULT-capped) snapshot with
  // the same pure truncation, so smaller maxNodes/maxEdges still work.
  const maxNodes = Math.min(Math.max(args.maxNodes ?? DEFAULT_MAX_NODES, 1), DEFAULT_MAX_NODES);
  const maxEdges = Math.min(Math.max(args.maxEdges ?? DEFAULT_MAX_EDGES, 1), DEFAULT_MAX_EDGES);
  if (overview.nodes.length > maxNodes || overview.edges.length > maxEdges) {
    const capped = truncateOverview(overview.nodes, overview.edges, maxNodes, maxEdges);
    const byType: Record<string, number> = {};
    for (const n of capped.nodes) byType[n.type] = (byType[n.type] ?? 0) + 1;
    overview = {
      nodes: capped.nodes,
      edges: capped.edges,
      counts: {
        ...overview.counts,
        nodes: capped.nodes.length,
        edges: capped.edges.length,
        byType,
        truncated: overview.counts.truncated || capped.truncated,
      },
    };
  }
  return { overview, builtAt: meta.builtAt, building };
}

// ── Surfaces: public Clerk-authed query + refresh action (the atlas board),
//    internal twins (the MCP graph.overview tool) — same auth idiom as the
//    other public knowledge queries (graphQueries.ts). ──

const overviewArgs = {
  maxNodes: v.optional(v.number()),
  maxEdges: v.optional(v.number()),
};

async function requireIdentity(ctx: QueryCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
}

/** The atlas board's reactive read: the cached snapshot (null before the
 * first build), builtAt, and whether a rebuild is in flight. */
export const snapshot = query({
  args: overviewArgs,
  handler: async (ctx, args): Promise<OverviewSnapshot> => {
    await requireIdentity(ctx);
    return readSnapshot(ctx, args);
  },
});

export const snapshotInternal = internalQuery({
  args: overviewArgs,
  handler: async (ctx, args): Promise<OverviewSnapshot> => readSnapshot(ctx, args),
});

/** Rebuild the snapshot when missing/stale (past SNAPSHOT_TTL_MS) or on
 * `force`. The board calls this on load and lets query reactivity swap the
 * fresh snapshot in when the build lands. */
export const refresh = action({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ built: boolean; reason?: string }> => {
    await requireIdentity(ctx);
    const result = await buildIfNeeded(ctx, args.force === true);
    return { built: result.built, reason: result.reason };
  },
});

export const ensureFresh = internalAction({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ built: boolean; reason?: string }> => {
    const result = await buildIfNeeded(ctx, args.force === true);
    return { built: result.built, reason: result.reason };
  },
});
