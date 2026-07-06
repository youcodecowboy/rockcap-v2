import { v } from "convex/values";
import { internalQuery, query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

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
// ── Consumers ──
// One shared core, three surfaces (spec §14b.6 — one backend, two consumers):
//   - internal* wrappers → the MCP graph.* / atoms.search tools (mcp.ts)
//   - public Clerk-authed queries → the Phase 2b knowledge drawer
//   - clientGraphSection → the bounded Graph section on
//     prospects.getDeepContext (client./prospect.getDeepContext).

// ── Constants ──

const DEFAULT_LIMIT = 30;
const HARD_CAP = 100;
/** Per-entity edge cap when a caller needs the whole neighborhood
 * (sharedNeighbors / findPaths) rather than a page of it. */
const NEIGHBORHOOD_CAP = 200;
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
    });
  }
  return edges;
}

async function collectAtomAttributes(
  ctx: QueryCtx,
  entityType: GraphEntityType,
  entityId: string,
): Promise<GraphAttribute[]> {
  const attrs: GraphAttribute[] = [];
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

async function federatedEdges(
  ctx: QueryCtx,
  entityType: GraphEntityType,
  entityId: string,
  opts?: { predicates?: string[]; direction?: "out" | "in" | "both" },
  cache: ScanCache = {},
): Promise<{ atomEdges: FedEdge[]; nativeEdges: FedEdge[] }> {
  const direction = opts?.direction ?? "both";
  const atomEdges = await collectAtomEdges(ctx, entityType, entityId, direction);
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
};

export async function expandEntityCore(ctx: QueryCtx, args: ExpandEntityArgs) {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), HARD_CAP);
  const names = new NameResolver(ctx);
  const entity = await names.ref(args.entityType, args.entityId);

  const { atomEdges, nativeEdges } = await federatedEdges(
    ctx,
    args.entityType,
    args.entityId,
    { predicates: args.predicates, direction: args.direction },
    {},
  );

  let attributes: GraphAttribute[] = [];
  if (args.includeAttributes !== false) {
    attributes = await collectAtomAttributes(ctx, args.entityType, args.entityId);
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

  const truncated =
    atomEdges.length > limit || nativeEdges.length > limit || attributes.length > limit;

  return {
    entity,
    edges: await resolveEdges(names, atomEdges.slice(0, limit)),
    nativeEdges: await resolveEdges(names, nativeEdges.slice(0, limit)),
    attributes: attributes.slice(0, limit),
    counts: {
      edges: atomEdges.length,
      nativeEdges: nativeEdges.length,
      attributes: attributes.length,
      truncated,
    },
  };
}

// ── sharedNeighbors (spec §9 — the "what connects these?" primitive) ──

export type SharedNeighborsArgs = {
  entities: Array<{ type: GraphEntityType; id: string }>;
  via?: "people" | "companies" | "lenders" | "any";
};

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
    predicate: string;
    direction: "out" | "in";
    qualifier?: string;
    provenance: EdgeProvenance;
  };
  // otherKey → inputIndex → connections
  const reach = new Map<string, Map<number, Connection[]>>();

  const cache: ScanCache = {};
  for (let i = 0; i < inputs.length; i++) {
    const { atomEdges, nativeEdges } = await federatedEdges(
      ctx,
      inputs[i].type,
      inputs[i].id,
      undefined,
      cache,
    );
    const all = [...atomEdges, ...nativeEdges].sort(rankEdges).slice(0, NEIGHBORHOOD_CAP);
    for (const e of all) {
      const key = `${e.otherType}:${e.otherId}`;
      if (inputKeys.has(key)) continue; // the inputs themselves are not "shared neighbors"
      let perInput = reach.get(key);
      if (!perInput) {
        perInput = new Map();
        reach.set(key, perInput);
      }
      const list = perInput.get(i) ?? [];
      list.push({
        fromInput: inputRefs[i],
        predicate: e.predicate,
        direction: e.direction,
        qualifier: e.qualifier,
        provenance: e.provenance,
      });
      perInput.set(i, list);
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
};

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
  rows = rows.slice(0, limit);

  // TODO(2a.2 — RRF seam): when the embeddings lane lands, run the vector
  // query (atoms.by_embedding, same filters) here and merge the two ranked
  // lists with reciprocal-rank fusion before enrichment. The full-text list
  // above becomes one input of the fusion, not the final ranking.

  const names = new NameResolver(ctx);
  const results = [];
  for (const atom of rows) {
    results.push({
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
    });
  }
  return { query: args.query, results, counts: { returned: results.length, limit } };
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

export const findPaths = query({
  args: findPathsArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return findPathsCore(ctx, args);
  },
});

export const atomsSearch = query({
  args: atomsSearchArgs,
  handler: async (ctx, args) => {
    await requireIdentity(ctx);
    return atomsSearchCore(ctx, args);
  },
});
