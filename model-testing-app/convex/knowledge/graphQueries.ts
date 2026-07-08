import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveContestedCore } from "./atomsCore";

// Graph traversal layer — Spec 2 Phase 2a.4 (docs/spec-2-knowledge-layer.md
// §9, §2.1, §14b.3, §14b.6).
//
// ── Federation (spec §2.1) ──
// Two edge sources of equal rank, merged at READ time, never stored twice:
//   1. ATOM edges    — atoms rows with objectEntityId set (document / CH /
//                      Apollo / operator provenance via atomObservations).
//   2. NATIVE edges  — relations already encoded in structural tables,
//                      synthesized per call: projects.clientRoles,
//                      contacts.clientId, clients.relatedCompaniesHouseNumbers,
//                      companiesHouseOfficers / companiesHousePSC, facilities
//                      columns, appetiteSignals (federated as attributes).
//
// ── Dedupe rule (implementation decision, 2a.4) ──
// When an atom edge and a native edge assert the same (predicate, direction,
// other), the ATOM edge wins — it carries richer provenance (observations,
// asOf, qualifier) — and its provenance is annotated with
// `nativeCorroboration: <table>` so the structural agreement is visible.
// The native edge is dropped from the response, never from the table.
//
// ── Synthetic facility-hub predicates ──
// facilities rows are the n-ary hub (spec §3.3); their columns federate as
// three synthetic native predicates, canonical direction fixed once so both
// endpoints mirror consistently:
//     funds:       lender (client|company) → facility
//     lends_to:    facility → borrower client   (native homonym of the atom
//                  predicate; provenance ref "facilities" disambiguates)
//     secured_on:  facility → project
//
// ── CH people joins — match quality caveat ──
// companiesHouseOfficers / companiesHousePSC rows carry NAMES, not contact
// ids. officer_of / psc_of edges are therefore produced ONLY on exact
// normalized-name matches (lowercased, honorifics stripped, CH
// "SURNAME, Forenames" comma form reordered). Every such edge carries
// provenance.matchQuality = "exact_name" — treat as strong-but-unverified.
//
// ── Fan-out rule (spec §14b.3) ──
// Edges are ranked (contested first → confidence desc → asOf recency) and
// truncated to `limit` (default 30, hard cap 100); full counts + a truncated
// flag always ride along, so "edges to 27 clients — expand?" is answerable
// without flooding either the LLM context or the drawer canvas.
//
// ── Inter-ring pass ──
// expandEntity additionally returns `interEdges`: edges AMONG the returned
// ring members (neither endpoint is the center). Without them the drawer
// renders a hub-and-spoke even when real clusters exist (facility ↔ SPV,
// SPV ↔ project, guarantor ↔ facility). Each entry is the standard edge
// shape plus `from` (the non-center endpoint the edge was collected from),
// since neither endpoint is implied.
//
// ── Consumers ──
// One shared core, three surfaces (spec §14b.6 — one backend, two consumers):
//   - internal* wrappers → the MCP graph.* / atoms.search tools (mcp.ts)
//   - public Clerk-authed queries → the Phase 2b knowledge drawer
//   - clientGraphSection → the bounded Graph section on
//     prospects.getDeepContext (client./prospect.getDeepContext).
//
// ── Prospect-scope visibility filter (spec §14b.6a) ──
// "Prospect atoms" are DERIVED, never flagged: an atom is prospect-scoped iff
// its owning `clientId` row has status "prospect". expandEntity + atomsSearch
// take `includeProspectScoped?: boolean`:
//   - undefined / true → no filter (the DEFAULT; the MCP/LLM lane sees
//     everything — drafting rules gate what leaves, not retrieval).
//   - false → ATOM-lane items (edges, attributes, interEdges, search hits)
//     whose owning clientId resolves to a prospect-status clients row are
//     excluded. Company-wide atoms (no clientId) are never filtered.
// NATIVE edges are public/structural record (CH officers, clientRoles,
// facilities columns) and are EXEMPT from the filter — deliberately, even
// when synthesized from a prospect's own structural data. Only the atom lane
// is scoped. The atom-lane filter runs BEFORE the atom-wins dedupe, so a
// public-record native mirror survives when its atom twin is hidden.
// Post-filter counts ride along plus `counts.prospectScopedHidden`, so the
// drawer can label its toggle ("include prospect intel (12)"). Promotion is
// free: `client.activate` flips the owning row's status and every atom
// graduates — the filter is a status read, not stored state.

// ── Constants ──

const DEFAULT_LIMIT = 30;
const HARD_CAP = 100;
/** Inter-ring pass: max ring members expanded for ring-to-ring edges. The
 * pass operates on the RETURNED (post-truncation) edge endpoints, top-ranked
 * first, so S = {center} ∪ ring stays ≤ 41 entities per call. */
const INTER_RING_CAP = 40;
/** Ring-attribute pass ("knowledge satellites"): max ATTRIBUTE atoms surfaced
 * per ring member. Ranked contested-first. Operator directive: visualize ALL
 * knowledge — the drawer fans every atom out into canvas space, so this is a
 * sanity ceiling (48 per node) against a pathological subject, NOT an
 * aggregation cap. Overflow still rides along as a per-member truncatedCount
 * (surfaced as muted "+N (capped)" text, never a badge) and in the counts. */
const RING_ATTR_CAP = 48;
/** Per-entity edge cap when a caller needs the whole neighborhood
 * (sharedNeighbors / findPaths) rather than a page of it. */
const NEIGHBORHOOD_CAP = 200;
/** sharedNeighbors group-expansion cap (spec §9 group hop): max structural
 * members a single input entity expands into (INCLUDING itself) before its
 * neighborhoods are unioned. Bounds worst-case cost at GROUP_CAP × inputs
 * federatedEdges calls, each still NEIGHBORHOOD_CAP-ranked. Overflow past the
 * cap is dropped (self is always kept — inserted first) and flagged per input
 * as `capped` in the result. */
const GROUP_CAP = 25;
/** findPaths bounds — this is a 3-person-firm graph; keep it simple + safe. */
const MAX_HOPS = 3;
const MAX_PATHS = 5;
const PATH_EXPANSION_BUDGET = 200;
const PATH_NEIGHBOR_CAP = 30;

// ── Types ──

export type GraphEntityType =
  | "client"
  | "project"
  | "contact"
  | "company"
  | "facility"
  | "candidate";

export type EntityRef = {
  id: string;
  type: GraphEntityType;
  name: string;
  sub?: string;
};

export type EdgeProvenance = {
  /** Atom edges: the atom's primarySourceType. Native edges: "native". */
  sourceType: string;
  /** Atom edges: the atom id (the drill-down handle for observations).
   * Native edges: the structural table/field that encodes the relation. */
  ref?: string;
  /** Live observation count (0 for native edges). */
  observationCount: number;
  /** Set on an atom edge when a native edge asserted the same relation and
   * was deduped away (atom wins; structural agreement noted here). */
  nativeCorroboration?: string;
  /** "exact_name" on CH officer/PSC ↔ contact joins — see module header. */
  matchQuality?: string;
};

export type GraphEdge = {
  predicate: string;
  direction: "out" | "in";
  other: EntityRef;
  qualifier?: string;
  asOf?: string;
  confidence: number;
  status: "active" | "contested";
  provenance: EdgeProvenance;
};

/** Ring-to-ring edge (inter-ring pass): neither endpoint is the center, so
 * the edge carries BOTH — `from` (collection side) and `other`. Direction is
 * relative to `from`: "out" ⇒ from is the subject. */
export type InterGraphEdge = GraphEdge & { from: EntityRef };

export type GraphAttribute = {
  predicate: string;
  value: unknown;
  valueType: string;
  currency?: string;
  qualifier?: string;
  asOf?: string;
  status: "active" | "contested";
  confidence: number;
  /** Set when the attribute is federated from a native lane
   * (today: "appetiteSignals" for lender clients). */
  native?: string;
  /** Convex atom id — the contested-resolution handle. Present on stored
   * attribute atoms; absent on native-federated attributes (appetiteSignals). */
  atomId?: string;
};

/** Pre-name-resolution federated edge. */
type FedEdge = {
  predicate: string;
  direction: "out" | "in";
  otherType: GraphEntityType;
  otherId: string;
  qualifier?: string;
  asOf?: string;
  confidence: number;
  status: "active" | "contested";
  provenance: EdgeProvenance;
  native: boolean;
  /** The atom's owning clientId (scope tag) — drives the prospect-scope
   * visibility filter (spec §14b.6a). Unset for native edges and
   * company-wide atoms; never leaves this module (stripped by resolveEdges). */
  ownerClientId?: string;
};

// ── Name resolution (batched per call via cache) ──

class NameResolver {
  private cache = new Map<string, EntityRef>();
  constructor(private ctx: QueryCtx) {}

  async ref(type: GraphEntityType, id: string): Promise<EntityRef> {
    const key = `${type}:${id}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const resolved = await this.load(type, id);
    this.cache.set(key, resolved);
    return resolved;
  }

  private async load(type: GraphEntityType, id: string): Promise<EntityRef> {
    const ctx = this.ctx;
    const missing: EntityRef = { id, type, name: `(missing ${type})` };
    switch (type) {
      case "client": {
        const nid = ctx.db.normalizeId("clients", id);
        const row = nid && (await ctx.db.get(nid));
        if (!row) return missing;
        return {
          id,
          type,
          name: row.name || row.companyName || "(unnamed client)",
          sub: row.type ?? undefined,
        };
      }
      case "project": {
        const nid = ctx.db.normalizeId("projects", id);
        const row = nid && (await ctx.db.get(nid));
        if (!row) return missing;
        return { id, type, name: row.name, sub: row.status ?? undefined };
      }
      case "contact": {
        const nid = ctx.db.normalizeId("contacts", id);
        const row = nid && (await ctx.db.get(nid));
        if (!row) return missing;
        return { id, type, name: row.name, sub: row.role ?? undefined };
      }
      case "company": {
        const nid = ctx.db.normalizeId("companiesHouseCompanies", id);
        const row = nid && (await ctx.db.get(nid));
        if (!row) return missing;
        return { id, type, name: row.companyName, sub: row.companyNumber };
      }
      case "facility": {
        const nid = ctx.db.normalizeId("facilities", id);
        const row = nid && (await ctx.db.get(nid));
        if (!row) return missing;
        const amount =
          row.amountGBP !== undefined
            ? `£${row.amountGBP.toLocaleString("en-GB")}`
            : undefined;
        const name = amount ? `Facility · ${amount}` : "Facility";
        const sub = [row.tranche, row.status].filter(Boolean).join(" · ");
        return { id, type, name, sub: sub || undefined };
      }
      case "candidate": {
        const nid = ctx.db.normalizeId("entityCandidates", id);
        const row = nid && (await ctx.db.get(nid));
        if (!row) return missing;
        return {
          id,
          type,
          name: row.mentionText,
          sub: `unresolved ${row.guessedType} candidate`,
        };
      }
    }
  }
}

// ── Prospect-scope filter (spec §14b.6a — see module header) ──
// Batched per call: each distinct owning clientId is loaded ONCE (memoized
// Map), so filtering a whole result set costs at most a handful of gets.

class ProspectScopeFilter {
  /** clientId (string) → owning row has status "prospect". */
  private cache = new Map<string, boolean>();
  /** Atom-lane items excluded so far (edges + attributes + interEdges /
   * search hits) — surfaces as counts.prospectScopedHidden. */
  hidden = 0;
  /**
   * @param ownScopeClientId — the viewing context's OWN client scope. An
   * entity's own atoms are never hidden from its own view: the §14b.6a
   * asymmetry protects a client's view from OTHER prospects' speculative
   * intel, not from itself (a prospect-status client would otherwise render
   * its own drawer nearly empty — the exact confusion this exemption removes).
   */
  constructor(
    private ctx: QueryCtx,
    private ownScopeClientId?: string,
  ) {}

  /** True iff the owning clientId resolves to a prospect-status clients row.
   * No clientId (company-wide atom), the viewer's own scope, or an
   * unresolvable id → never filtered. */
  async isProspectScoped(ownerClientId: string | undefined): Promise<boolean> {
    if (!ownerClientId) return false;
    if (this.ownScopeClientId && ownerClientId === this.ownScopeClientId) return false;
    const hit = this.cache.get(ownerClientId);
    if (hit !== undefined) return hit;
    const nid = this.ctx.db.normalizeId("clients", ownerClientId);
    const row = nid ? await this.ctx.db.get(nid) : null;
    const isProspect = !!row && row.status === "prospect";
    this.cache.set(ownerClientId, isProspect);
    return isProspect;
  }

  /** Keep the non-prospect-scoped items; count the rest in `hidden`. */
  async filter<T extends { ownerClientId?: string }>(items: T[]): Promise<T[]> {
    const kept: T[] = [];
    for (const item of items) {
      if (await this.isProspectScoped(item.ownerClientId)) this.hidden++;
      else kept.push(item);
    }
    return kept;
  }
}

// ── Ranking (spec §14b.3 fan-out rule) ──

function asOfMs(asOf: string | undefined): number {
  if (!asOf) return -Infinity;
  const t = Date.parse(asOf);
  return Number.isNaN(t) ? -Infinity : t;
}

/** Contested first, then confidence desc, then asOf recency. */
function rankEdges(a: FedEdge, b: FedEdge): number {
  const contested = Number(b.status === "contested") - Number(a.status === "contested");
  if (contested !== 0) return contested;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return asOfMs(b.asOf) - asOfMs(a.asOf);
}

function rankAttributes(a: GraphAttribute, b: GraphAttribute): number {
  const contested = Number(b.status === "contested") - Number(a.status === "contested");
  if (contested !== 0) return contested;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return asOfMs(b.asOf) - asOfMs(a.asOf);
}

// ── Name normalization for CH people joins ──

const HONORIFICS = /^(mr|mrs|ms|miss|dr|sir|dame|prof|professor)\.?\s+/i;

/** Lowercase, strip honorifics/punctuation, reorder CH "SURNAME, Forenames"
 * comma form to natural order, collapse whitespace. */
function normalizePersonName(raw: string): string {
  let name = raw.trim();
  const comma = name.indexOf(",");
  if (comma !== -1) {
    name = `${name.slice(comma + 1).trim()} ${name.slice(0, comma).trim()}`;
  }
  name = name.replace(HONORIFICS, "");
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Exact-string variants to probe the CH by_name indexes with, given a
 * natural-order contact name ("James Carter"): the name itself plus the CH
 * register's conventional "SURNAME, Forenames" forms. */
function chNameVariants(name: string): string[] {
  const variants = new Set<string>([name.trim()]);
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const surname = parts[parts.length - 1];
    const forenames = parts.slice(0, -1).join(" ");
    variants.add(`${surname.toUpperCase()}, ${forenames}`);
    variants.add(`${surname}, ${forenames}`);
  }
  return [...variants];
}

// ── Atom edge + attribute collection ──

const LIVE_STATUSES = ["active", "contested"] as const;

async function liveObservationCount(
  ctx: QueryCtx,
  atomId: Id<"atoms">,
): Promise<number> {
  const obs = await ctx.db
    .query("atomObservations")
    .withIndex("by_atom", (q) => q.eq("atomId", atomId))
    .collect();
  return obs.filter((o) => o.superseded !== true).length;
}

async function collectAtomEdges(
  ctx: QueryCtx,
  entityType: GraphEntityType,
  entityId: string,
  direction: "out" | "in" | "both",
  /** Optional endpoint filter, applied BEFORE the per-atom observation-count
   * read — the inter-ring pass keeps only in-ring endpoints and must not pay
   * a by_atom read for every discarded edge. */
  keep?: (otherType: GraphEntityType, otherId: string) => boolean,
): Promise<FedEdge[]> {
  const rows: Array<{ atom: Doc<"atoms">; direction: "out" | "in" }> = [];
  if (direction !== "in") {
    for (const status of LIVE_STATUSES) {
      const out = await ctx.db
        .query("atoms")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", entityType).eq("subjectId", entityId).eq("status", status),
        )
        .collect();
      for (const atom of out) {
        if (atom.objectEntityId !== undefined) rows.push({ atom, direction: "out" });
      }
    }
  }
  if (direction !== "out") {
    for (const status of LIVE_STATUSES) {
      const inbound = await ctx.db
        .query("atoms")
        .withIndex("by_object", (q) =>
          q.eq("objectEntityType", entityType).eq("objectEntityId", entityId).eq("status", status),
        )
        .collect();
      for (const atom of inbound) rows.push({ atom, direction: "in" });
    }
  }

  const edges: FedEdge[] = [];
  for (const { atom, direction: dir } of rows) {
    const otherType = (dir === "out" ? atom.objectEntityType : atom.subjectType) as GraphEntityType;
    const otherId = dir === "out" ? atom.objectEntityId! : atom.subjectId;
    if (keep && !keep(otherType, otherId)) continue;
    edges.push({
      predicate: atom.predicate,
      direction: dir,
      otherType,
      otherId,
      qualifier: atom.qualifier,
      asOf: atom.asOf,
      confidence: atom.confidence,
      status: atom.status as "active" | "contested",
      provenance: {
        sourceType: atom.primarySourceType,
        ref: atom._id as string,
        observationCount: await liveObservationCount(ctx, atom._id),
      },
      native: false,
      ownerClientId: atom.clientId as string | undefined,
    });
  }
  return edges;
}

/** GraphAttribute plus the atom's owning clientId (for the prospect-scope
 * filter) and the atom id — both internal. The clientId is stripped before
 * the attribute leaves the module; the atomId is kept on ring-attribute rows
 * (the satellite handle) and stripped from the center's attributes so their
 * public shape is unchanged. */
type AttrWithOwner = GraphAttribute & { ownerClientId?: string; atomId: string };

/** A ring member's ATTRIBUTE atom, resolved for the satellite lane: the
 * standard attribute shape plus its owning subject ref and the atom id. */
export type AttributeRow = GraphAttribute & { subject: EntityRef; atomId: string };

async function collectAtomAttributes(
  ctx: QueryCtx,
  entityType: GraphEntityType,
  entityId: string,
): Promise<AttrWithOwner[]> {
  const attrs: AttrWithOwner[] = [];
  for (const status of LIVE_STATUSES) {
    const rows = await ctx.db
      .query("atoms")
      .withIndex("by_subject", (q) =>
        q.eq("subjectType", entityType).eq("subjectId", entityId).eq("status", status),
      )
      .collect();
    for (const atom of rows) {
      if (atom.objectLiteral === undefined) continue;
      attrs.push({
        predicate: atom.predicate,
        value: atom.objectLiteral.value,
        valueType: atom.objectLiteral.valueType,
        currency: atom.objectLiteral.currency,
        qualifier: atom.qualifier,
        asOf: atom.asOf,
        status: atom.status as "active" | "contested",
        confidence: atom.confidence,
        ownerClientId: atom.clientId as string | undefined,
        atomId: atom._id as string,
      });
    }
  }
  return attrs;
}

// ── Per-call scan cache ──
// Some native lanes have no usable index (arrays can't be indexed in
// Convex): projects.clientRoles, facilities.borrowerClientId,
// clients.relatedCompaniesHouseNumbers, contact-name joins. Those table
// scans are memoized PER QUERY CALL so a multi-expansion walk (findPaths /
// sharedNeighbors) scans each table once, not once per node — keeps a
// budgeted 200-expansion walk safely inside Convex read limits.

type ScanCache = {
  projects?: Doc<"projects">[];
  facilities?: Doc<"facilities">[];
  clients?: Doc<"clients">[];
  contacts?: Doc<"contacts">[];
};

async function allProjects(ctx: QueryCtx, cache: ScanCache) {
  cache.projects ??= (await ctx.db.query("projects").collect()).filter(
    (p) => p.isDeleted !== true,
  );
  return cache.projects;
}
async function allFacilities(ctx: QueryCtx, cache: ScanCache) {
  cache.facilities ??= await ctx.db.query("facilities").collect();
  return cache.facilities;
}
async function allClients(ctx: QueryCtx, cache: ScanCache) {
  cache.clients ??= (await ctx.db.query("clients").collect()).filter(
    (c) => c.isDeleted !== true,
  );
  return cache.clients;
}
async function allContacts(ctx: QueryCtx, cache: ScanCache) {
  cache.contacts ??= (await ctx.db.query("contacts").collect()).filter(
    (c) => c.isDeleted !== true,
  );
  return cache.contacts;
}

// ── Native edge synthesis (spec §2.1 — computed per call, never stored) ──

function nativeEdge(
  predicate: string,
  direction: "out" | "in",
  otherType: GraphEntityType,
  otherId: string,
  ref: string,
  extra?: { qualifier?: string; asOf?: string; matchQuality?: string },
): FedEdge {
  return {
    predicate,
    direction,
    otherType,
    otherId,
    qualifier: extra?.qualifier,
    asOf: extra?.asOf,
    confidence: 1,
    status: "active",
    provenance: {
      sourceType: "native",
      ref,
      observationCount: 0,
      ...(extra?.matchQuality ? { matchQuality: extra.matchQuality } : {}),
    },
    native: true,
  };
}

/** clientRoles role → predicate mapping (spec §5): lender → funds_project,
 * everything else (borrower / developer / …) → developing. The raw role
 * string rides along as the qualifier. */
function rolePredicate(role: string): string {
  return role.toLowerCase() === "lender" ? "funds_project" : "developing";
}

async function nativeEdgesForClient(
  ctx: QueryCtx,
  clientId: Id<"clients">,
  client: Doc<"clients">,
  cache: ScanCache,
): Promise<FedEdge[]> {
  const edges: FedEdge[] = [];

  // projects.clientRoles → funds_project / developing (client out).
  // No usable index into the clientRoles array (Convex can't index into
  // arrays) — memoized scan, same pattern as prospects.getDeepContext.
  const projects = await allProjects(ctx, cache);
  for (const project of projects) {
    for (const cr of project.clientRoles ?? []) {
      if (cr.clientId !== clientId) continue;
      edges.push(
        nativeEdge(rolePredicate(cr.role), "out", "project", project._id as string, "projects.clientRoles", {
          qualifier: cr.role,
        }),
      );
    }
  }

  // contacts.clientId → works_at (person → company ⇒ IN edge for the client).
  const contacts = (
    await ctx.db
      .query("contacts")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .collect()
  ).filter((c) => c.isDeleted !== true);
  for (const contact of contacts) {
    edges.push(
      nativeEdge("works_at", "in", "contact", contact._id as string, "contacts.clientId", {
        qualifier: contact.role ?? undefined,
      }),
    );
  }

  // clients.relatedCompaniesHouseNumbers → spv_of_group (company → client
  // group ⇒ IN edge). Only CH numbers that resolve to a mirrored
  // companiesHouseCompanies row become edges — no row, no node.
  for (const chNumber of client.relatedCompaniesHouseNumbers ?? []) {
    const company = await ctx.db
      .query("companiesHouseCompanies")
      .withIndex("by_company_number", (q) => q.eq("companyNumber", chNumber))
      .first();
    if (company) {
      edges.push(
        nativeEdge(
          "spv_of_group",
          "in",
          "company",
          company._id as string,
          "clients.relatedCompaniesHouseNumbers",
        ),
      );
    }
  }

  // facilities touching the client. Lender side is indexed; borrower side
  // has no index → scan (facilities is a small derived-hub table).
  const lenderFacilities = await ctx.db
    .query("facilities")
    .withIndex("by_lender", (q) => q.eq("lenderClientId", clientId))
    .collect();
  for (const f of lenderFacilities) {
    edges.push(
      nativeEdge("funds", "out", "facility", f._id as string, "facilities.lenderClientId", {
        qualifier: f.tranche ?? undefined,
      }),
    );
  }
  const borrowerFacilities = (await allFacilities(ctx, cache)).filter(
    (f) => f.borrowerClientId === clientId,
  );
  for (const f of borrowerFacilities) {
    edges.push(
      nativeEdge("lends_to", "in", "facility", f._id as string, "facilities.borrowerClientId", {
        qualifier: f.tranche ?? undefined,
      }),
    );
  }

  return edges;
}

async function nativeEdgesForContact(
  ctx: QueryCtx,
  contact: Doc<"contacts">,
): Promise<FedEdge[]> {
  const edges: FedEdge[] = [];

  // works_at → its client (contact out). NOTE: contacts.linkedCompanyIds
  // points at the HubSpot `companies` table, which is not a graph entity
  // type — not federated here.
  if (contact.clientId) {
    edges.push(
      nativeEdge("works_at", "out", "client", contact.clientId as string, "contacts.clientId", {
        qualifier: contact.role ?? undefined,
      }),
    );
  }

  // officer_of / psc_of via CH by_name indexes. Exact-string probes with the
  // natural + CH comma-form variants; every match is name-based only
  // (matchQuality: "exact_name") — CH rows carry no person id we can join.
  const seenOfficers = new Set<string>();
  const seenPsc = new Set<string>();
  for (const variant of chNameVariants(contact.name)) {
    const officers = await ctx.db
      .query("companiesHouseOfficers")
      .withIndex("by_name", (q) => q.eq("name", variant))
      .collect();
    for (const o of officers) {
      if (seenOfficers.has(o._id as string)) continue;
      seenOfficers.add(o._id as string);
      const resigned = o.resignedOn ? " (resigned)" : "";
      edges.push(
        nativeEdge("officer_of", "out", "company", o.companyId as string, "companiesHouseOfficers", {
          qualifier: `${o.officerRole}${resigned}`,
          asOf: o.appointedOn,
          matchQuality: "exact_name",
        }),
      );
    }
    const pscs = await ctx.db
      .query("companiesHousePSC")
      .withIndex("by_name", (q) => q.eq("name", variant))
      .collect();
    for (const p of pscs) {
      if (seenPsc.has(p._id as string)) continue;
      seenPsc.add(p._id as string);
      const ceased = p.ceasedOn ? " (ceased)" : "";
      const control = p.naturesOfControl?.[0];
      edges.push(
        nativeEdge("psc_of", "out", "company", p.companyId as string, "companiesHousePSC", {
          qualifier: control ? `${control}${ceased}` : ceased || undefined,
          asOf: p.notifiableOn,
          matchQuality: "exact_name",
        }),
      );
    }
  }

  return edges;
}

async function nativeEdgesForCompany(
  ctx: QueryCtx,
  companyId: Id<"companiesHouseCompanies">,
  company: Doc<"companiesHouseCompanies">,
  cache: ScanCache,
): Promise<FedEdge[]> {
  const edges: FedEdge[] = [];

  // Officers / PSC rows on this company, joined to contacts by normalized
  // exact name (honest about quality: exact_name only; unmatched CH people
  // produce NO edge — they are names, not graph entities).
  const officerRows = await ctx.db
    .query("companiesHouseOfficers")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();
  const pscRows = await ctx.db
    .query("companiesHousePSC")
    .withIndex("by_company", (q) => q.eq("companyId", companyId))
    .collect();

  if (officerRows.length > 0 || pscRows.length > 0) {
    const contacts = await allContacts(ctx, cache);
    const byNormalizedName = new Map<string, Doc<"contacts">>();
    for (const c of contacts) {
      byNormalizedName.set(normalizePersonName(c.name), c);
    }
    for (const o of officerRows) {
      const match = byNormalizedName.get(normalizePersonName(o.name));
      if (!match) continue;
      const resigned = o.resignedOn ? " (resigned)" : "";
      edges.push(
        nativeEdge("officer_of", "in", "contact", match._id as string, "companiesHouseOfficers", {
          qualifier: `${o.officerRole}${resigned}`,
          asOf: o.appointedOn,
          matchQuality: "exact_name",
        }),
      );
    }
    for (const p of pscRows) {
      if (p.pscType !== "individual") continue;
      const match = byNormalizedName.get(normalizePersonName(p.name));
      if (!match) continue;
      const ceased = p.ceasedOn ? " (ceased)" : "";
      const control = p.naturesOfControl?.[0];
      edges.push(
        nativeEdge("psc_of", "in", "contact", match._id as string, "companiesHousePSC", {
          qualifier: control ? `${control}${ceased}` : ceased || undefined,
          asOf: p.notifiableOn,
          matchQuality: "exact_name",
        }),
      );
    }
  }

  // spv_of_group → any client listing this company's number in its group.
  // No index into the array → memoized scan (small table).
  const clients = await allClients(ctx, cache);
  for (const c of clients) {
    if (c.relatedCompaniesHouseNumbers?.includes(company.companyNumber)) {
      edges.push(
        nativeEdge(
          "spv_of_group",
          "out",
          "client",
          c._id as string,
          "clients.relatedCompaniesHouseNumbers",
        ),
      );
    }
  }

  // facilities where this CH company is the (external) lender.
  const lenderFacilities = await ctx.db
    .query("facilities")
    .withIndex("by_lender_company", (q) => q.eq("lenderCompanyId", companyId))
    .collect();
  for (const f of lenderFacilities) {
    edges.push(
      nativeEdge("funds", "out", "facility", f._id as string, "facilities.lenderCompanyId", {
        qualifier: f.tranche ?? undefined,
      }),
    );
  }

  return edges;
}

async function nativeEdgesForFacility(
  ctx: QueryCtx,
  facility: Doc<"facilities">,
): Promise<FedEdge[]> {
  const edges: FedEdge[] = [];
  // Column-derived edges, canonical directions per the module header:
  // funds: lender → facility; lends_to: facility → borrower;
  // secured_on: facility → project.
  edges.push(
    nativeEdge("secured_on", "out", "project", facility.projectId as string, "facilities.projectId", {
      qualifier: facility.tranche ?? undefined,
    }),
  );
  if (facility.lenderClientId) {
    edges.push(
      nativeEdge("funds", "in", "client", facility.lenderClientId as string, "facilities.lenderClientId", {
        qualifier: facility.tranche ?? undefined,
      }),
    );
  }
  if (facility.lenderCompanyId) {
    edges.push(
      nativeEdge("funds", "in", "company", facility.lenderCompanyId as string, "facilities.lenderCompanyId", {
        qualifier: facility.tranche ?? undefined,
      }),
    );
  }
  if (facility.borrowerClientId) {
    edges.push(
      nativeEdge("lends_to", "out", "client", facility.borrowerClientId as string, "facilities.borrowerClientId", {
        qualifier: facility.tranche ?? undefined,
      }),
    );
  }
  return edges;
}

async function nativeEdgesForProject(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  project: Doc<"projects">,
): Promise<FedEdge[]> {
  const edges: FedEdge[] = [];
  for (const cr of project.clientRoles ?? []) {
    edges.push(
      nativeEdge(rolePredicate(cr.role), "in", "client", cr.clientId as string, "projects.clientRoles", {
        qualifier: cr.role,
      }),
    );
  }
  const facilities = await ctx.db
    .query("facilities")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .collect();
  for (const f of facilities) {
    edges.push(
      nativeEdge("secured_on", "in", "facility", f._id as string, "facilities.projectId", {
        qualifier: f.tranche ?? undefined,
      }),
    );
  }
  return edges;
}

async function synthesizeNativeEdges(
  ctx: QueryCtx,
  entityType: GraphEntityType,
  entityId: string,
  cache: ScanCache,
): Promise<FedEdge[]> {
  switch (entityType) {
    case "client": {
      const id = ctx.db.normalizeId("clients", entityId);
      const row = id && (await ctx.db.get(id));
      return row ? await nativeEdgesForClient(ctx, id, row, cache) : [];
    }
    case "contact": {
      const id = ctx.db.normalizeId("contacts", entityId);
      const row = id && (await ctx.db.get(id));
      return row ? await nativeEdgesForContact(ctx, row) : [];
    }
    case "company": {
      const id = ctx.db.normalizeId("companiesHouseCompanies", entityId);
      const row = id && (await ctx.db.get(id));
      return row ? await nativeEdgesForCompany(ctx, id, row, cache) : [];
    }
    case "facility": {
      const id = ctx.db.normalizeId("facilities", entityId);
      const row = id && (await ctx.db.get(id));
      return row ? await nativeEdgesForFacility(ctx, row) : [];
    }
    case "project": {
      const id = ctx.db.normalizeId("projects", entityId);
      const row = id && (await ctx.db.get(id));
      return row ? await nativeEdgesForProject(ctx, id, row) : [];
    }
    case "candidate":
      return []; // provisional entities have no structural home yet
  }
}

// ── Federation core: atoms + native, deduped (atom wins) ──

function edgeIdentity(e: FedEdge): string {
  return `${e.predicate}|${e.direction}|${e.otherType}|${e.otherId}`;
}

/** The edgeIdentity convention made endpoint-symmetric for the inter-ring
 * pass: the same relation collected from either endpoint (subject side of an
 * atom, or a native mirror synthesized from the opposite entity) maps to one
 * key — predicate + canonical (subject, object) pair. */
function canonicalEdgeIdentity(fromType: GraphEntityType, fromId: string, e: FedEdge): string {
  const from = `${fromType}:${fromId}`;
  const other = `${e.otherType}:${e.otherId}`;
  const subj = e.direction === "out" ? from : other;
  const obj = e.direction === "out" ? other : from;
  return `${e.predicate}|${subj}|${obj}`;
}

async function federatedEdges(
  ctx: QueryCtx,
  entityType: GraphEntityType,
  entityId: string,
  opts?: {
    predicates?: string[];
    direction?: "out" | "in" | "both";
    /** Prospect-scope filter (spec §14b.6a). ATOM lane only — applied BEFORE
     * the atom-wins dedupe so a public-record native mirror survives when
     * its atom twin is hidden. Native edges are structural record, exempt. */
    prospectFilter?: ProspectScopeFilter;
  },
  cache: ScanCache = {},
): Promise<{ atomEdges: FedEdge[]; nativeEdges: FedEdge[] }> {
  const direction = opts?.direction ?? "both";
  let atomEdges = await collectAtomEdges(ctx, entityType, entityId, direction);
  if (opts?.prospectFilter) {
    atomEdges = await opts.prospectFilter.filter(atomEdges);
  }
  let nativeEdges = (await synthesizeNativeEdges(ctx, entityType, entityId, cache)).filter(
    (e) => direction === "both" || e.direction === direction,
  );

  // Dedupe: same (predicate, direction, other) asserted by both lanes →
  // atom wins, native corroboration noted in the atom's provenance.
  const atomKeys = new Map<string, FedEdge>();
  for (const e of atomEdges) atomKeys.set(edgeIdentity(e), e);
  nativeEdges = nativeEdges.filter((n) => {
    const winner = atomKeys.get(edgeIdentity(n));
    if (winner) {
      winner.provenance.nativeCorroboration = n.provenance.ref;
      return false;
    }
    return true;
  });

  const predicateFilter = opts?.predicates;
  const filter = (e: FedEdge) => !predicateFilter || predicateFilter.includes(e.predicate);
  return {
    atomEdges: atomEdges.filter(filter),
    nativeEdges: nativeEdges.filter(filter),
  };
}

async function resolveEdges(
  names: NameResolver,
  edges: FedEdge[],
): Promise<GraphEdge[]> {
  const out: GraphEdge[] = [];
  for (const e of edges) {
    out.push({
      predicate: e.predicate,
      direction: e.direction,
      other: await names.ref(e.otherType, e.otherId),
      qualifier: e.qualifier,
      asOf: e.asOf,
      confidence: e.confidence,
      status: e.status,
      provenance: e.provenance,
    });
  }
  return out;
}

// ── Native attributes: appetiteSignals federation (has_appetite_for) ──

async function nativeAttributesForClient(
  ctx: QueryCtx,
  entityId: string,
): Promise<GraphAttribute[]> {
  const clientId = ctx.db.normalizeId("clients", entityId);
  if (!clientId) return [];
  const signals = await ctx.db
    .query("appetiteSignals")
    .withIndex("by_lender_current", (q) =>
      q.eq("lenderClientId", clientId).eq("isCurrent", true),
    )
    .take(20);
  return signals.map((s) => ({
    predicate: "has_appetite_for",
    value: s.value,
    valueType: s.valueType,
    qualifier: s.fieldPath,
    asOf: s.asOfDate,
    status: "active" as const,
    confidence: s.confidence ?? 0.8,
    native: "appetiteSignals",
  }));
}

// ── expandEntity (spec §9, §14b.6 — the one call both consumers recurse on) ──

export type ExpandEntityArgs = {
  entityType: GraphEntityType;
  entityId: string;
  predicates?: string[];
  direction?: "out" | "in" | "both";
  includeAttributes?: boolean;
  limit?: number;
  /** Prospect-scope visibility (spec §14b.6a). undefined/true = no filter
   * (the default — the MCP/LLM lane sees everything); false = exclude
   * ATOM-lane items whose owning clientId is a prospect-status clients row.
   * Native edges are public/structural record and always exempt. */
  includeProspectScoped?: boolean;
  /** Satellite lane. When true, also return `ringAttributes`: the ATTRIBUTE
   * atoms of each ring member in the SAME capped set S the inter-ring pass
   * uses (≤ INTER_RING_CAP). Lets the drawer render a ring member's knowledge
   * (a project's GDV / planning / cost, etc.) without pivoting onto it.
   * Atom lane only; respects the prospect-scope filter when active. */
  includeRingAttributes?: boolean;
};

export async function expandEntityCore(ctx: QueryCtx, args: ExpandEntityArgs) {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), HARD_CAP);
  const names = new NameResolver(ctx);
  const entity = await names.ref(args.entityType, args.entityId);
  // Shared across the center expansion AND the inter-ring pass, so the
  // unindexed native lanes (projects/facilities/clients/contacts scans) are
  // read once per call, not once per ring member.
  const cache: ScanCache = {};
  // Prospect-scope filter — only instantiated when explicitly asked to
  // exclude (includeProspectScoped: false). One instance spans the center
  // expansion, attributes, AND the inter-ring pass, so each owning clientId
  // is loaded once and `hidden` is the single post-filter total.
  // Own-scope exemption: a client center never has its own atoms hidden
  // from its own view (see ProspectScopeFilter doc).
  const ownScope =
    args.entityType === "client" ? args.entityId : undefined;
  const prospectFilter =
    args.includeProspectScoped === false
      ? new ProspectScopeFilter(ctx, ownScope)
      : undefined;

  const { atomEdges, nativeEdges } = await federatedEdges(
    ctx,
    args.entityType,
    args.entityId,
    { predicates: args.predicates, direction: args.direction, prospectFilter },
    cache,
  );

  let attributes: GraphAttribute[] = [];
  if (args.includeAttributes !== false) {
    let attrsWithOwner = await collectAtomAttributes(ctx, args.entityType, args.entityId);
    if (prospectFilter) {
      attrsWithOwner = await prospectFilter.filter(attrsWithOwner);
    }
    // Strip the internal ownerClientId before the CENTER attribute leaves the
    // module; KEEP atomId (the contested-resolution handle the drawer needs).
    attributes = attrsWithOwner.map(({ ownerClientId: _owner, ...attr }) => attr);
    if (args.entityType === "client") {
      attributes.push(...(await nativeAttributesForClient(ctx, args.entityId)));
    }
    if (args.predicates) {
      attributes = attributes.filter((a) => args.predicates!.includes(a.predicate));
    }
    attributes.sort(rankAttributes);
  }

  atomEdges.sort(rankEdges);
  nativeEdges.sort(rankEdges);

  const returnedAtomEdges = atomEdges.slice(0, limit);
  const returnedNativeEdges = nativeEdges.slice(0, limit);

  // ── Inter-ring pass (see module header) ──
  // S = {center} ∪ the RETURNED ring (post-truncation endpoints, top-ranked
  // first, capped at INTER_RING_CAP). For each ring member: atom edges from
  // the by_subject side ONLY — every in-ring atom edge is seen exactly once,
  // from its subject, so by_object double-collection can't happen — plus its
  // native edges (reusing synthesizeNativeEdges + the shared ScanCache).
  // Only edges whose OTHER endpoint is also in S survive; the center is
  // excluded as an endpoint, which is exactly what guarantees no inter-edge
  // duplicates an edge already returned (all of those touch the center).
  const centerKey = `${args.entityType}:${args.entityId}`;
  const ringSeen = new Set<string>([centerKey]);
  const ringMembers: Array<{ type: GraphEntityType; id: string }> = [];
  for (const e of [...returnedAtomEdges, ...returnedNativeEdges].sort(rankEdges)) {
    if (ringMembers.length >= INTER_RING_CAP) break;
    const key = `${e.otherType}:${e.otherId}`;
    if (ringSeen.has(key)) continue;
    ringSeen.add(key);
    ringMembers.push({ type: e.otherType, id: e.otherId });
  }
  const inRing = (t: GraphEntityType, i: string) => {
    const key = `${t}:${i}`;
    return ringSeen.has(key) && key !== centerKey;
  };

  type InterFed = { fromType: GraphEntityType; fromId: string; edge: FedEdge };
  const interAtomByKey = new Map<string, InterFed>();
  const interNativeCandidates: InterFed[] = [];
  for (const member of ringMembers) {
    let memberAtomEdges = await collectAtomEdges(ctx, member.type, member.id, "out", inRing);
    if (prospectFilter) {
      // Atom lane only, same as the center expansion — a hidden atom edge
      // simply lets its public-record native mirror (if any) win the key.
      memberAtomEdges = await prospectFilter.filter(memberAtomEdges);
    }
    for (const edge of memberAtomEdges) {
      const key = canonicalEdgeIdentity(member.type, member.id, edge);
      if (interAtomByKey.has(key)) continue;
      interAtomByKey.set(key, { fromType: member.type, fromId: member.id, edge });
    }
    for (const edge of await synthesizeNativeEdges(ctx, member.type, member.id, cache)) {
      if (!inRing(edge.otherType, edge.otherId)) continue;
      interNativeCandidates.push({ fromType: member.type, fromId: member.id, edge });
    }
  }
  // Dedupe — same convention as federatedEdges: atom wins over native (with
  // nativeCorroboration annotated); native mirrors seen from both endpoints
  // collapse to one via the canonical key.
  const interNativeByKey = new Map<string, InterFed>();
  for (const cand of interNativeCandidates) {
    const key = canonicalEdgeIdentity(cand.fromType, cand.fromId, cand.edge);
    const atomWinner = interAtomByKey.get(key);
    if (atomWinner) {
      atomWinner.edge.provenance.nativeCorroboration = cand.edge.provenance.ref;
      continue;
    }
    if (!interNativeByKey.has(key)) interNativeByKey.set(key, cand);
  }
  let interFed = [...interAtomByKey.values(), ...interNativeByKey.values()];
  if (args.predicates) {
    interFed = interFed.filter((x) => args.predicates!.includes(x.edge.predicate));
  }
  interFed.sort((a, b) => rankEdges(a.edge, b.edge));
  const interTotal = interFed.length;
  interFed = interFed.slice(0, HARD_CAP);
  const interResolved = await resolveEdges(names, interFed.map((x) => x.edge));
  const interEdges: InterGraphEdge[] = [];
  for (let i = 0; i < interFed.length; i++) {
    interEdges.push({
      ...interResolved[i],
      from: await names.ref(interFed[i].fromType, interFed[i].fromId),
    });
  }

  // ── Ring-attribute pass (satellites — see module header §14b.5) ──
  // For each ring member in S (the SAME capped set the inter-ring pass used),
  // collect its ATTRIBUTE atoms so the drawer can render them as "knowledge
  // satellites" attached to the member — a project's GDV / planning / cost
  // become visible without pivoting onto it. Atom lane only; respects the
  // prospect-scope filter when active. Capped at RING_ATTR_CAP per member by
  // the attribute ranking (contested first), overflow as truncatedCount.
  const ringAttributes: Record<string, AttributeRow[]> = {};
  const ringAttributeTruncated: Record<string, number> = {};
  let ringAttributesTotal = 0;
  if (args.includeRingAttributes) {
    for (const member of ringMembers) {
      let memberAttrs = await collectAtomAttributes(ctx, member.type, member.id);
      if (prospectFilter) memberAttrs = await prospectFilter.filter(memberAttrs);
      if (memberAttrs.length === 0) continue;
      memberAttrs.sort(rankAttributes);
      const memberRef = await names.ref(member.type, member.id);
      const key = `${member.type}:${member.id}`;
      const capped = memberAttrs.slice(0, RING_ATTR_CAP);
      ringAttributes[key] = capped.map(
        ({ ownerClientId: _owner, atomId, ...attr }) => ({ ...attr, atomId, subject: memberRef }),
      );
      if (memberAttrs.length > RING_ATTR_CAP) {
        ringAttributeTruncated[key] = memberAttrs.length - RING_ATTR_CAP;
      }
      ringAttributesTotal += capped.length;
    }
  }

  const truncated =
    atomEdges.length > limit ||
    nativeEdges.length > limit ||
    attributes.length > limit ||
    interTotal > HARD_CAP;

  return {
    entity,
    edges: await resolveEdges(names, returnedAtomEdges),
    nativeEdges: await resolveEdges(names, returnedNativeEdges),
    interEdges,
    attributes: attributes.slice(0, limit),
    // Satellite lane — keyed by `${type}:${id}`; empty unless includeRingAttributes.
    ringAttributes,
    ringAttributeTruncated,
    counts: {
      edges: atomEdges.length,
      nativeEdges: nativeEdges.length,
      interEdges: interTotal,
      attributes: attributes.length,
      ringAttributes: ringAttributesTotal,
      truncated,
      // Post-filter semantics: the counts above reflect what survived the
      // prospect-scope filter; this is how many atom-lane items it hid
      // (0 when the filter is off) — the drawer's toggle label reads it.
      prospectScopedHidden: prospectFilter?.hidden ?? 0,
    },
  };
}

// ── sharedNeighbors (spec §9 — the "what connects these?" primitive) ──

export type SharedNeighborsArgs = {
  entities: Array<{ type: GraphEntityType; id: string }>;
  via?: "people" | "companies" | "lenders" | "any";
};

/** A group member: the structural entity itself plus how it joined the group
 * (the field/relation that anchored it — provenance for the "why is this in
 * the group?" question). `self` marks the input entity. */
type GroupMember = { type: GraphEntityType; id: string; via: string };

/** Expand one input entity into a bounded "group" of structurally-adjacent
 * members (spec §9 group hop) so the shared-neighbor intersection reaches a
 * node ANY member can touch — fixing the lender→facility→project→developer
 * gap where the only common ground sits two hops from a lender that anchors
 * on the facility node. Membership is the "same-side arm" relations only:
 *   client  → its role projects, its (lender+borrower) facilities, its CH
 *             group companies;
 *   project → its facilities + those facilities' borrower (SPV) client;
 *   company → the client(s) it is a group SPV of, and their other group
 *             companies (mapped siblings).
 * Leaf inputs (contact / facility / candidate) do not expand — the group is
 * just the entity itself, so the intersection degenerates to the classic
 * one-hop check. Self is inserted FIRST so the GROUP_CAP slice never drops it. */
async function expandGroup(
  ctx: QueryCtx,
  type: GraphEntityType,
  id: string,
  cache: ScanCache,
): Promise<{ members: GroupMember[]; capped: boolean }> {
  const members = new Map<string, GroupMember>();
  const add = (t: GraphEntityType, i: string, via: string) => {
    const key = `${t}:${i}`;
    if (!members.has(key)) members.set(key, { type: t, id: i, via });
  };
  add(type, id, "self");

  switch (type) {
    case "client": {
      const clientId = ctx.db.normalizeId("clients", id);
      const client = clientId && (await ctx.db.get(clientId));
      if (!clientId || !client) break;
      // Role projects (any clientRole) — the client's own deal footprint.
      for (const p of await allProjects(ctx, cache)) {
        if ((p.clientRoles ?? []).some((cr) => cr.clientId === clientId)) {
          add("project", p._id as string, "projects.clientRoles");
        }
      }
      // Facilities on either side (lender-arm or borrower-arm).
      const lenderFacs = await ctx.db
        .query("facilities")
        .withIndex("by_lender", (q) => q.eq("lenderClientId", clientId))
        .collect();
      for (const f of lenderFacs) add("facility", f._id as string, "facilities.lenderClientId");
      for (const f of await allFacilities(ctx, cache)) {
        if (f.borrowerClientId === clientId) add("facility", f._id as string, "facilities.borrowerClientId");
      }
      // CH group companies.
      for (const chNumber of client.relatedCompaniesHouseNumbers ?? []) {
        const company = await ctx.db
          .query("companiesHouseCompanies")
          .withIndex("by_company_number", (q) => q.eq("companyNumber", chNumber))
          .first();
        if (company) add("company", company._id as string, "clients.relatedCompaniesHouseNumbers");
      }
      break;
    }
    case "project": {
      const projectId = ctx.db.normalizeId("projects", id);
      if (!projectId) break;
      const facilities = await ctx.db
        .query("facilities")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      for (const f of facilities) {
        add("facility", f._id as string, "facilities.projectId");
        // The borrower client is the project's SPV — its own arm of the group.
        if (f.borrowerClientId) add("client", f.borrowerClientId as string, "facilities.borrowerClientId");
      }
      break;
    }
    case "company": {
      const companyId = ctx.db.normalizeId("companiesHouseCompanies", id);
      const company = companyId && (await ctx.db.get(companyId));
      if (!companyId || !company) break;
      // Client(s) this company is a group SPV of, plus their OTHER group
      // companies (mapped siblings — the corporate group around this SPV).
      for (const c of await allClients(ctx, cache)) {
        const groupNumbers = c.relatedCompaniesHouseNumbers ?? [];
        if (!groupNumbers.includes(company.companyNumber)) continue;
        add("client", c._id as string, "clients.relatedCompaniesHouseNumbers");
        for (const chNumber of groupNumbers) {
          if (chNumber === company.companyNumber) continue;
          const sibling = await ctx.db
            .query("companiesHouseCompanies")
            .withIndex("by_company_number", (q) => q.eq("companyNumber", chNumber))
            .first();
          if (sibling) add("company", sibling._id as string, "clients.relatedCompaniesHouseNumbers");
        }
      }
      break;
    }
    // contact / facility / candidate → leaf inputs, no expansion (see header).
  }

  const all = [...members.values()];
  return { members: all.slice(0, GROUP_CAP), capped: all.length > GROUP_CAP };
}

export async function sharedNeighborsCore(ctx: QueryCtx, args: SharedNeighborsArgs) {
  const inputs = args.entities.slice(0, 5);
  if (inputs.length < 2) {
    throw new Error("sharedNeighbors needs at least 2 entities");
  }
  const names = new NameResolver(ctx);
  const inputRefs: EntityRef[] = [];
  for (const e of inputs) inputRefs.push(await names.ref(e.type, e.id));
  const inputKeys = new Set(inputs.map((e) => `${e.type}:${e.id}`));

  type Connection = {
    fromInput: EntityRef;
    /** The group member that actually held the edge to the shared node.
     * Absent when the input entity itself held it (a classic one-hop link);
     * present ⇒ the link runs input → groupMember → sharedNode (the group hop
     * that makes the connection auditable). */
    groupMember?: EntityRef;
    predicate: string;
    direction: "out" | "in";
    qualifier?: string;
    provenance: EdgeProvenance;
  };
  // otherKey → inputIndex → connections
  const reach = new Map<string, Map<number, Connection[]>>();

  const cache: ScanCache = {};
  // Expand each input into its bounded group up front (spec §9 group hop).
  const groups: Array<{ members: GroupMember[]; capped: boolean }> = [];
  for (const e of inputs) groups.push(await expandGroup(ctx, e.type, e.id, cache));

  // Memoized member expansion — a member shared across two inputs' groups
  // (e.g. a co-exposure facility) is federated once, not per group.
  const neighborCache = new Map<string, FedEdge[]>();
  const expandMember = async (t: GraphEntityType, i: string): Promise<FedEdge[]> => {
    const key = `${t}:${i}`;
    const hit = neighborCache.get(key);
    if (hit) return hit;
    const { atomEdges, nativeEdges } = await federatedEdges(ctx, t, i, undefined, cache);
    const all = [...atomEdges, ...nativeEdges].sort(rankEdges).slice(0, NEIGHBORHOOD_CAP);
    neighborCache.set(key, all);
    return all;
  };

  for (let i = 0; i < inputs.length; i++) {
    const inputKey = `${inputs[i].type}:${inputs[i].id}`;
    for (const member of groups[i].members) {
      const memberKey = `${member.type}:${member.id}`;
      const isSelf = memberKey === inputKey;
      const memberRef = isSelf ? undefined : await names.ref(member.type, member.id);
      for (const e of await expandMember(member.type, member.id)) {
        const key = `${e.otherType}:${e.otherId}`;
        // Only the INPUT entities themselves are never shared neighbors. A
        // group member that the OTHER side reaches (e.g. a developer's own
        // project reached by a lender via its facility) IS a legitimate
        // shared node — that is exactly the group-hop answer.
        if (inputKeys.has(key)) continue;
        let perInput = reach.get(key);
        if (!perInput) {
          perInput = new Map();
          reach.set(key, perInput);
        }
        const list = perInput.get(i) ?? [];
        list.push({
          fromInput: inputRefs[i],
          groupMember: memberRef,
          predicate: e.predicate,
          direction: e.direction,
          qualifier: e.qualifier,
          provenance: e.provenance,
        });
        perInput.set(i, list);
      }
    }
  }

  const shared: Array<{ entity: EntityRef; connections: Connection[] }> = [];
  for (const [key, perInput] of reach) {
    if (perInput.size < inputs.length) continue; // must connect ALL inputs
    const [type, id] = [key.slice(0, key.indexOf(":")) as GraphEntityType, key.slice(key.indexOf(":") + 1)];
    const entity = await names.ref(type, id);

    // via filter — applied on the shared node's type.
    if (args.via && args.via !== "any") {
      if (args.via === "people" && type !== "contact") continue;
      if (args.via === "companies" && type !== "company") continue;
      if (args.via === "lenders") {
        if (type !== "client") continue;
        const clientId = ctx.db.normalizeId("clients", id);
        const row = clientId && (await ctx.db.get(clientId));
        if (!row || row.type !== "lender") continue;
      }
    }
    shared.push({ entity, connections: [...perInput.values()].flat() });
  }

  return {
    inputs: inputRefs,
    via: args.via ?? "any",
    // Per-input group provenance — the members each input expanded into
    // (self plus its structural arms) and whether GROUP_CAP truncated it.
    groups: inputRefs.map((input, i) => ({
      input,
      memberCount: groups[i].members.length,
      capped: groups[i].capped,
    })),
    shared,
    counts: { shared: shared.length },
  };
}

// ── findPaths (spec §9 — bounded BFS over the federated edge function) ──

export type FindPathsArgs = {
  from: { type: GraphEntityType; id: string };
  to: { type: GraphEntityType; id: string };
  maxHops?: number;
};

type PathHop = {
  from: EntityRef;
  predicate: string;
  direction: "out" | "in";
  qualifier?: string;
  to: EntityRef;
  provenance: EdgeProvenance;
};

export async function findPathsCore(ctx: QueryCtx, args: FindPathsArgs) {
  const maxHops = Math.min(Math.max(args.maxHops ?? MAX_HOPS, 1), MAX_HOPS);
  const names = new NameResolver(ctx);
  const fromRef = await names.ref(args.from.type, args.from.id);
  const toRef = await names.ref(args.to.type, args.to.id);
  const targetKey = `${args.to.type}:${args.to.id}`;

  // Memoized neighbor expansion — each node is expanded at most once and
  // the total number of expansions is budgeted (~200): a 3-person-firm
  // graph, kept simple and safe.
  const neighborCache = new Map<string, FedEdge[]>();
  const scanCache: ScanCache = {};
  let expansions = 0;
  const neighbors = async (type: GraphEntityType, id: string): Promise<FedEdge[]> => {
    const key = `${type}:${id}`;
    const hit = neighborCache.get(key);
    if (hit) return hit;
    if (expansions >= PATH_EXPANSION_BUDGET) return [];
    expansions++;
    const { atomEdges, nativeEdges } = await federatedEdges(ctx, type, id, undefined, scanCache);
    const all = [...atomEdges, ...nativeEdges].sort(rankEdges).slice(0, PATH_NEIGHBOR_CAP);
    neighborCache.set(key, all);
    return all;
  };

  type QueueItem = {
    nodeType: GraphEntityType;
    nodeId: string;
    visited: Set<string>;
    hops: Array<{ fromType: GraphEntityType; fromId: string; edge: FedEdge }>;
  };
  const startKey = `${args.from.type}:${args.from.id}`;
  let frontier: QueueItem[] = [
    { nodeType: args.from.type, nodeId: args.from.id, visited: new Set([startKey]), hops: [] },
  ];
  const found: QueueItem[] = [];

  for (let depth = 0; depth < maxHops && frontier.length > 0 && found.length < MAX_PATHS; depth++) {
    const next: QueueItem[] = [];
    for (const item of frontier) {
      if (found.length >= MAX_PATHS) break;
      const edges = await neighbors(item.nodeType, item.nodeId);
      for (const e of edges) {
        const key = `${e.otherType}:${e.otherId}`;
        if (item.visited.has(key)) continue; // no cycles within a path
        const hops = [...item.hops, { fromType: item.nodeType, fromId: item.nodeId, edge: e }];
        if (key === targetKey) {
          found.push({ nodeType: e.otherType, nodeId: e.otherId, visited: new Set(), hops });
          if (found.length >= MAX_PATHS) break;
          continue;
        }
        if (depth + 1 < maxHops) {
          next.push({
            nodeType: e.otherType,
            nodeId: e.otherId,
            visited: new Set([...item.visited, key]),
            hops,
          });
        }
      }
    }
    frontier = next;
  }

  // Rank: shorter first, then higher weakest-link confidence.
  const minConfidence = (p: QueueItem) => Math.min(...p.hops.map((h) => h.edge.confidence));
  found.sort((a, b) => a.hops.length - b.hops.length || minConfidence(b) - minConfidence(a));

  const paths: Array<{ length: number; minConfidence: number; hops: PathHop[] }> = [];
  for (const p of found.slice(0, MAX_PATHS)) {
    const hops: PathHop[] = [];
    for (const h of p.hops) {
      hops.push({
        from: await names.ref(h.fromType, h.fromId),
        predicate: h.edge.predicate,
        direction: h.edge.direction,
        qualifier: h.edge.qualifier,
        to: await names.ref(h.edge.otherType, h.edge.otherId),
        provenance: h.edge.provenance,
      });
    }
    paths.push({ length: p.hops.length, minConfidence: minConfidence(p), hops });
  }

  return {
    from: fromRef,
    to: toRef,
    maxHops,
    paths,
    counts: { paths: paths.length, expansions, budgetExhausted: expansions >= PATH_EXPANSION_BUDGET },
  };
}

// ── atomsSearch (spec §9 — full-text lane; hybrid RRF arrives with 2a.2) ──

export type AtomsSearchArgs = {
  query: string;
  clientId?: string;
  subjectType?: GraphEntityType;
  status?: "active" | "contested" | "superseded" | "retired";
  limit?: number;
  /** Prospect-scope visibility (spec §14b.6a) — same semantics as
   * expandEntity: undefined/true = no filter (default), false = exclude hits
   * whose owning clientId is a prospect-status clients row. */
  includeProspectScoped?: boolean;
};

/** The enriched hit shape both search lanes return: statement + predicate +
 * resolved subject/object names + literal + scope + provenance summary. Shared
 * by the text lane (atomsSearchCore) and the vector lane (atomsVectorEnrich,
 * consumed by the 2a.2 hybrid action) so the two lists fuse row-for-row. */
async function enrichSearchAtom(
  ctx: QueryCtx,
  names: NameResolver,
  atom: Doc<"atoms">,
) {
  return {
    atomId: atom._id,
    statement: atom.statement,
    predicate: atom.predicate,
    subject: await names.ref(atom.subjectType as GraphEntityType, atom.subjectId),
    object: atom.objectEntityId
      ? await names.ref(atom.objectEntityType as GraphEntityType, atom.objectEntityId)
      : undefined,
    objectLiteral: atom.objectLiteral,
    qualifier: atom.qualifier,
    clientId: atom.clientId,
    projectId: atom.projectId,
    asOf: atom.asOf,
    status: atom.status,
    confidence: atom.confidence,
    primarySourceType: atom.primarySourceType,
    observationCount: await liveObservationCount(ctx, atom._id),
  };
}

export async function atomsSearchCore(ctx: QueryCtx, args: AtomsSearchArgs) {
  const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const clientId = args.clientId ? ctx.db.normalizeId("clients", args.clientId) : undefined;
  if (args.clientId && !clientId) {
    throw new Error(`invalid_client_id: "${args.clientId}" is not a clients id`);
  }

  // Full-text lane over the search_statement index.
  let rows = await ctx.db
    .query("atoms")
    .withSearchIndex("search_statement", (q) => {
      let s = q.search("statement", args.query);
      if (clientId) s = s.eq("clientId", clientId);
      if (args.subjectType) s = s.eq("subjectType", args.subjectType);
      if (args.status) s = s.eq("status", args.status);
      return s;
    })
    // No status filter ⇒ default to LIVE atoms; over-fetch then post-filter
    // (search-index filter fields only support equality).
    .take(args.status ? limit : limit * 3);
  if (!args.status) {
    rows = rows.filter((a) => a.status === "active" || a.status === "contested");
  }

  // Prospect-scope filter (spec §14b.6a) — applied to the fetched candidate
  // set BEFORE the final slice, so the returned page is fully non-prospect.
  // `prospectScopedHidden` counts hidden hits among the fetched candidates
  // (the over-fetch window), not the whole corpus.
  const prospectFilter =
    args.includeProspectScoped === false
      ? new ProspectScopeFilter(ctx, args.clientId as string | undefined)
      : undefined;
  if (prospectFilter) {
    const kept: typeof rows = [];
    for (const atom of rows) {
      if (await prospectFilter.isProspectScoped(atom.clientId as string | undefined)) {
        prospectFilter.hidden++;
      } else {
        kept.push(atom);
      }
    }
    rows = kept;
  }
  rows = rows.slice(0, limit);

  // ── RRF seam (Phase 2a.2) ──
  // This function stays the TEXT lane, and stays a QUERY: ctx.vectorSearch is
  // an ACTION-only platform primitive (never available in a query/mutation),
  // so the vector lane and reciprocal-rank fusion CANNOT live here. They live
  // in the hybrid ACTION `internal.knowledge.embeddings.atomsSearchHybrid`,
  // which calls this query (via atomsSearchInternal) as one fusion input,
  // runs the atoms `by_embedding` vector search as the other, enriches the
  // vector hits through `atomsVectorEnrich` (same row shape as below), and
  // RRF-merges the two ranked lists. The MCP `atoms.search` tool now targets
  // that action; this query remains the public/text-only entry point.

  const names = new NameResolver(ctx);
  const results = [];
  for (const atom of rows) {
    results.push(await enrichSearchAtom(ctx, names, atom));
  }
  return {
    query: args.query,
    results,
    counts: {
      returned: results.length,
      limit,
      prospectScopedHidden: prospectFilter?.hidden ?? 0,
    },
  };
}

// ── getDeepContext Graph section (spec §9 "existing tools benefit") ──
//
// Bounded, CLIENT-scoped only (2a.4 keeps scope tight; project/lender
// sections can reuse the same cores later). Near-zero cost for
// non-knowledge-enabled clients: two indexed count reads, and if the entity
// has zero atoms the section is `{atoms: 0}` — nothing else is computed.

export async function clientGraphSection(
  ctx: QueryCtx,
  clientId: Id<"clients">,
): Promise<Record<string, unknown>> {
  const idStr = clientId as string;
  const countByStatus = async (status: "active" | "contested") => {
    const ids = new Set<string>();
    const subject = await ctx.db
      .query("atoms")
      .withIndex("by_subject", (q) =>
        q.eq("subjectType", "client").eq("subjectId", idStr).eq("status", status),
      )
      .collect();
    for (const a of subject) ids.add(a._id as string);
    const scoped = await ctx.db
      .query("atoms")
      .withIndex("by_client_status", (q) => q.eq("clientId", clientId).eq("status", status))
      .collect();
    for (const a of scoped) ids.add(a._id as string);
    return ids.size;
  };

  const atoms = await countByStatus("active");
  const contested = await countByStatus("contested");
  if (atoms === 0 && contested === 0) return { atoms: 0 };

  // Top federated edges by the same fan-out ranking, capped at 10.
  const names = new NameResolver(ctx);
  const cache: ScanCache = {};
  const { atomEdges, nativeEdges } = await federatedEdges(ctx, "client", idStr, undefined, cache);
  const top = [...atomEdges, ...nativeEdges].sort(rankEdges).slice(0, 10);

  // Facilities touching the client (lender or borrower side).
  const lenderSide = await ctx.db
    .query("facilities")
    .withIndex("by_lender", (q) => q.eq("lenderClientId", clientId))
    .collect();
  const borrowerSide = (await allFacilities(ctx, cache)).filter(
    (f) => f.borrowerClientId === clientId,
  );
  const facilityRows = [...lenderSide, ...borrowerSide.filter((f) => !lenderSide.some((l) => l._id === f._id))];
  const facilities = [];
  for (const f of facilityRows.slice(0, 10)) {
    facilities.push({
      facilityId: f._id,
      project: (await names.ref("project", f.projectId as string)).name,
      lender: f.lenderClientId
        ? (await names.ref("client", f.lenderClientId as string)).name
        : f.lenderCompanyId
          ? (await names.ref("company", f.lenderCompanyId as string)).name
          : undefined,
      amountGBP: f.amountGBP,
      status: f.status,
    });
  }

  return {
    atoms,
    contested,
    topEdges: await resolveEdges(names, top),
    facilities,
  };
}

// ── Validators ──

const entityTypeValidator = v.union(
  v.literal("client"),
  v.literal("project"),
  v.literal("contact"),
  v.literal("company"),
  v.literal("facility"),
  v.literal("candidate"),
);

const expandArgs = {
  entityType: entityTypeValidator,
  entityId: v.string(),
  predicates: v.optional(v.array(v.string())),
  direction: v.optional(v.union(v.literal("out"), v.literal("in"), v.literal("both"))),
  includeAttributes: v.optional(v.boolean()),
  limit: v.optional(v.number()),
  // Spec §14b.6a — undefined/true = unfiltered (default), false = hide
  // prospect-scoped atom-lane items. Native edges always exempt.
  includeProspectScoped: v.optional(v.boolean()),
  // Satellite lane — when true, also return each ring member's ATTRIBUTE atoms
  // (ringAttributes), so the drawer can show ring knowledge without pivoting.
  includeRingAttributes: v.optional(v.boolean()),
};

const sharedNeighborsArgs = {
  entities: v.array(v.object({ type: entityTypeValidator, id: v.string() })),
  via: v.optional(
    v.union(v.literal("people"), v.literal("companies"), v.literal("lenders"), v.literal("any")),
  ),
};

const findPathsArgs = {
  from: v.object({ type: entityTypeValidator, id: v.string() }),
  to: v.object({ type: entityTypeValidator, id: v.string() }),
  maxHops: v.optional(v.number()),
};

const atomsSearchArgs = {
  query: v.string(),
  clientId: v.optional(v.string()),
  subjectType: v.optional(entityTypeValidator),
  status: v.optional(
    v.union(
      v.literal("active"),
      v.literal("contested"),
      v.literal("superseded"),
      v.literal("retired"),
    ),
  ),
  limit: v.optional(v.number()),
  // Spec §14b.6a — same semantics as expandEntity's flag.
  includeProspectScoped: v.optional(v.boolean()),
};

// ── Internal wrappers (the MCP graph.* / atoms.search surface) ──

export const expandEntityInternal = internalQuery({
  args: expandArgs,
  handler: async (ctx, args) => expandEntityCore(ctx, args),
});

export const sharedNeighborsInternal = internalQuery({
  args: sharedNeighborsArgs,
  handler: async (ctx, args) => sharedNeighborsCore(ctx, args),
});

export const findPathsInternal = internalQuery({
  args: findPathsArgs,
  handler: async (ctx, args) => findPathsCore(ctx, args),
});

export const atomsSearchInternal = internalQuery({
  args: atomsSearchArgs,
  handler: async (ctx, args) => atomsSearchCore(ctx, args),
});

// ── atomsVectorEnrich — the vector lane's row loader (Phase 2a.2) ──
// The hybrid action passes the vectorSearch hit ids (already ranked by cosine
// score) here; this query loads each row, re-applies the SAME semantics the
// text lane enforces — default LIVE (active|contested) unless a specific
// status is asked, plus subjectType / clientId / prospect-scope filters — and
// enriches survivors into the shared search-hit shape. Input order (= vector
// rank) is preserved, so the action can fuse it against the text list by rank.
// This mirrors why the vectorSearch filter itself is single-field only: it
// can't AND clientId with status, so the real narrowing happens right here.
export const atomsVectorEnrich = internalQuery({
  args: {
    atomIds: v.array(v.id("atoms")),
    clientId: v.optional(v.string()),
    subjectType: v.optional(entityTypeValidator),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("contested"),
        v.literal("superseded"),
        v.literal("retired"),
      ),
    ),
    includeProspectScoped: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const clientId = args.clientId
      ? ctx.db.normalizeId("clients", args.clientId)
      : undefined;
    if (args.clientId && !clientId) {
      throw new Error(`invalid_client_id: "${args.clientId}" is not a clients id`);
    }
    const prospectFilter =
      args.includeProspectScoped === false
        ? new ProspectScopeFilter(ctx, args.clientId as string | undefined)
        : undefined;
    const names = new NameResolver(ctx);
    const results = [];
    for (const id of args.atomIds) {
      const atom = await ctx.db.get(id);
      if (!atom) continue;
      // Status: a specific status filters to exactly it; otherwise LIVE only.
      if (args.status) {
        if (atom.status !== args.status) continue;
      } else if (atom.status !== "active" && atom.status !== "contested") {
        continue;
      }
      if (args.subjectType && atom.subjectType !== args.subjectType) continue;
      if (clientId && atom.clientId !== clientId) continue;
      if (
        prospectFilter &&
        (await prospectFilter.isProspectScoped(atom.clientId as string | undefined))
      ) {
        prospectFilter.hidden++;
        continue;
      }
      results.push(await enrichSearchAtom(ctx, names, atom));
    }
    return results;
  },
});

// ── Public Clerk-authed queries (the Phase 2b drawer surface) ──
// Pivoting in the explorer drawer is just recursive expandEntity (§14b.6):
// the canvas re-centers by calling expandEntity on the clicked node.

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
}

export const expandEntity = query({
  args: expandArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return expandEntityCore(ctx, args);
  },
});

export const sharedNeighbors = query({
  args: sharedNeighborsArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return sharedNeighborsCore(ctx, args);
  },
});

/** Client-WIDE atom totals for the drawer header. The canvas shows only the
 * current center's one-hop neighborhood; without this, a client whose
 * knowledge lives mostly on project subjects (the normal case) looks like it
 * "isn't growing" no matter how much is atomized. Two indexed count reads. */
export const clientAtomTotals = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    let active = 0;
    let contested = 0;
    for (const status of ["active", "contested"] as const) {
      const rows = await ctx.db
        .query("atoms")
        .withIndex("by_client_status", (q) =>
          q.eq("clientId", args.clientId).eq("status", status),
        )
        .collect();
      if (status === "active") active = rows.length;
      else contested = rows.length;
    }
    return { active, contested, total: active + contested };
  },
});

export const findPaths = query({
  args: findPathsArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return findPathsCore(ctx, args);
  },
});

/** Operator adjudication of a contested fact (spec §7 layer 3) — the drawer's
 * "Contested" resolution lane. The winner returns to active; every other member
 * of its contested identity group is archived as superseded (operator reason).
 * Nothing is deleted — provenance survives. Operator hygiene, no approvals. */
export const resolveContested = mutation({
  args: { winnerAtomId: v.id("atoms") },
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return resolveContestedCore(ctx, args);
  },
});

export const atomsSearch = query({
  args: atomsSearchArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return atomsSearchCore(ctx, args);
  },
});
