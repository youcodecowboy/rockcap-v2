import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  allClients,
  allContacts,
  allFacilities,
  allProjects,
  NameResolver,
  nativeEdgesForClient,
  nativeEdgesForCompany,
  nativeEdgesForFacility,
  type FedEdge,
  type GraphEntityType,
  type ScanCache,
} from "./graphQueries";

// graph.overview — the ORG-WIDE graph snapshot behind the atlas view.
//
// One query the frontend calls to render EVERY entity and edge in the
// company's knowledge graph on a single explorable board: cross-client
// connections, lenders fanning out across clients/projects, contested atoms
// visible. Same federation semantics as graphQueries.expandEntity, applied
// globally instead of per-center:
//
//   ATOM edges    — one bounded walk of the `atoms` table (live statuses
//                   only: active | contested; superseded/retired skipped).
//                   Every atom with objectEntityId becomes an edge candidate;
//                   attribute atoms contribute to the subject's atomCount.
//   NATIVE edges  — synthesized by the SAME per-entity helpers expandEntity
//                   uses (nativeEdgesFor*), collected from one canonical side
//                   per relation so each structural fact is walked once:
//                     clients    → clientRoles, works_at, spv_of_group,
//                                  funds / lends_to (facility hubs)
//                     facilities → secured_on + external-lender funds
//                     companies  → officer_of / psc_of (CH exact-name joins),
//                                  run only for companies ALREADY in the
//                                  graph (referenced by an atom or a
//                                  structural edge) — the atlas deliberately
//                                  does not fan out to every synced CH mirror.
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
// ── Bounds ──
// Current scale is ~305 live atoms + native edges, so one query does the
// whole walk. Every lane is still capped so growth degrades to
// counts.truncated=true instead of blowing Convex read limits:
//   - the atoms walk reads at most ATOM_SCAN_CAP rows (take, not collect);
//   - the CH-company officer/psc pass runs over at most COMPANY_PASS_CAP
//     referenced companies;
//   - the response is truncated to maxNodes/maxEdges (defaults below),
//     dropping lowest-degree contact/company/candidate leaves first.
// documents / atomObservations are never walked. If the atoms table ever
// outgrows ATOM_SCAN_CAP, the seam is to split the walk into
// internalQuery pages stitched by a public action — keeping this module's
// pure assembly helpers (dedupe / degrees / truncation) unchanged and the
// frontend still on ONE call site.

// ── Bounds ──

export const DEFAULT_MAX_NODES = 2500;
export const DEFAULT_MAX_EDGES = 6000;
/** Max `atoms` rows read in the walk (all statuses — the table includes
 * superseded/retired history rows we skip but still pay to scan). */
const ATOM_SCAN_CAP = 8000;
/** Max referenced CH companies expanded for officer_of/psc_of joins. */
const COMPANY_PASS_CAP = 400;

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

// ── Snapshot assembly ──

function fedToOverviewEdge(
  srcType: GraphEntityType,
  srcId: string,
  e: FedEdge,
): OverviewEdge {
  const src = `${srcType}:${srcId}`;
  const other = `${e.otherType}:${e.otherId}`;
  const [from, to] = e.direction === "out" ? [src, other] : [other, src];
  return { from, to, predicate: e.predicate, kind: "native", status: "active" };
}

function projectOwnerClientId(project: Doc<"projects">): string | undefined {
  const roles = project.clientRoles ?? [];
  const nonLender = roles.find((r) => r.role.toLowerCase() !== "lender");
  return (nonLender ?? roles[0])?.clientId as string | undefined;
}

export async function overviewCore(
  ctx: QueryCtx,
  args: { maxNodes?: number; maxEdges?: number },
): Promise<OverviewResult> {
  const maxNodes = Math.min(Math.max(args.maxNodes ?? DEFAULT_MAX_NODES, 1), DEFAULT_MAX_NODES);
  const maxEdges = Math.min(Math.max(args.maxEdges ?? DEFAULT_MAX_EDGES, 1), DEFAULT_MAX_EDGES);
  const cache: ScanCache = {};
  const names = new NameResolver(ctx);

  // ── 1. Atom walk (bounded; live atoms → edges + per-subject counts) ──
  const scanned = await ctx.db.query("atoms").take(ATOM_SCAN_CAP + 1);
  const atomScanTruncated = scanned.length > ATOM_SCAN_CAP;
  const atomRows = atomScanTruncated ? scanned.slice(0, ATOM_SCAN_CAP) : scanned;

  const rawEdges: OverviewEdge[] = [];
  const atomCounts = new Map<string, { atoms: number; contested: number }>();
  let totalAtoms = 0;
  let totalContested = 0;
  for (const atom of atomRows) {
    if (atom.status !== "active" && atom.status !== "contested") continue;
    totalAtoms++;
    const contested = atom.status === "contested";
    if (contested) totalContested++;
    const subjectKey = `${atom.subjectType}:${atom.subjectId}`;
    const counts = atomCounts.get(subjectKey) ?? { atoms: 0, contested: 0 };
    counts.atoms++;
    if (contested) counts.contested++;
    atomCounts.set(subjectKey, counts);
    if (atom.objectEntityId !== undefined && atom.objectEntityType !== undefined) {
      rawEdges.push({
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

  // ── 2. Native lanes (one canonical side per relation — see header) ──
  const clients = await allClients(ctx, cache);
  for (const client of clients) {
    for (const e of await nativeEdgesForClient(ctx, client._id, client, cache)) {
      rawEdges.push(fedToOverviewEdge("client", client._id as string, e));
    }
  }
  const facilities = await allFacilities(ctx, cache);
  for (const facility of facilities) {
    for (const e of await nativeEdgesForFacility(ctx, facility)) {
      rawEdges.push(fedToOverviewEdge("facility", facility._id as string, e));
    }
  }
  // CH officer/psc joins — only for companies already IN the graph.
  const referencedCompanyIds = new Set<string>();
  for (const e of rawEdges) {
    for (const key of [e.from, e.to]) {
      if (key.startsWith("company:")) referencedCompanyIds.add(key.slice("company:".length));
    }
  }
  for (const key of atomCounts.keys()) {
    if (key.startsWith("company:")) referencedCompanyIds.add(key.slice("company:".length));
  }
  const companyPassTruncated = referencedCompanyIds.size > COMPANY_PASS_CAP;
  for (const companyId of [...referencedCompanyIds].slice(0, COMPANY_PASS_CAP)) {
    const nid = ctx.db.normalizeId("companiesHouseCompanies", companyId);
    const row = nid && (await ctx.db.get(nid));
    if (!nid || !row) continue;
    for (const e of await nativeEdgesForCompany(ctx, nid, row, cache)) {
      rawEdges.push(fedToOverviewEdge("company", companyId, e));
    }
  }

  // ── 3. Dedupe (atom wins; mirrors collapse) ──
  const edges = dedupeOverviewEdges(rawEdges);

  // ── 4. Nodes: all clients + projects, plus every other entity with ≥1
  //       atom or edge. Names via the shared NameResolver. ──
  const contactById = new Map<string, Doc<"contacts">>();
  for (const c of await allContacts(ctx, cache)) contactById.set(c._id as string, c);
  const facilityById = new Map<string, Doc<"facilities">>();
  for (const f of facilities) facilityById.set(f._id as string, f);

  const clientById = new Map<string, Doc<"clients">>();
  for (const c of clients) clientById.set(c._id as string, c);
  const projectById = new Map<string, Doc<"projects">>();
  for (const p of await allProjects(ctx, cache)) projectById.set(p._id as string, p);

  const nodeKeys = new Set<string>();
  for (const id of clientById.keys()) nodeKeys.add(`client:${id}`);
  for (const id of projectById.keys()) nodeKeys.add(`project:${id}`);
  for (const key of atomCounts.keys()) nodeKeys.add(key);
  for (const e of edges) {
    nodeKeys.add(e.from);
    nodeKeys.add(e.to);
  }

  const nodes: OverviewNode[] = [];
  for (const key of nodeKeys) {
    const sep = key.indexOf(":");
    const type = key.slice(0, sep) as GraphEntityType;
    const id = key.slice(sep + 1);
    const ref = await names.ref(type, id);
    const counts = atomCounts.get(key);
    const node: OverviewNode = {
      key,
      type,
      id,
      name: ref.name,
      atomCount: counts?.atoms ?? 0,
      contestedCount: counts?.contested ?? 0,
      degree: 0, // filled from the final edge list in truncateOverview
    };
    if (type === "client") {
      const row = clientById.get(id);
      if (row) {
        node.clientType = normalizeClientType(row.type);
        node.clientStatus = normalizeClientStatus(row.status);
      }
    } else if (type === "project") {
      const owner = projectById.get(id) && projectOwnerClientId(projectById.get(id)!);
      if (owner) node.ownerClientId = owner;
    } else if (type === "contact") {
      const owner = contactById.get(id)?.clientId;
      if (owner) node.ownerClientId = owner as string;
    } else if (type === "facility") {
      const owner = facilityById.get(id)?.borrowerClientId;
      if (owner) node.ownerClientId = owner as string;
    }
    nodes.push(node);
  }

  // ── 5. Truncate (leaf contacts/companies first) + final degrees ──
  const pre = computeDegrees(edges);
  for (const n of nodes) n.degree = pre.get(n.key) ?? 0;
  const result = truncateOverview(nodes, edges, maxNodes, maxEdges);

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

// ── Surfaces: public Clerk-authed query (the atlas board) + internal
//    wrapper (the MCP graph.overview tool) — same auth idiom as the other
//    public knowledge queries (graphQueries.ts). ──

const overviewArgs = {
  maxNodes: v.optional(v.number()),
  maxEdges: v.optional(v.number()),
};

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
}

export const overview = query({
  args: overviewArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return overviewCore(ctx, args);
  },
});

export const overviewInternal = internalQuery({
  args: overviewArgs,
  handler: async (ctx, args) => overviewCore(ctx, args),
});
