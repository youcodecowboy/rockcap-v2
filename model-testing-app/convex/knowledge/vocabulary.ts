// Knowledge-layer predicate vocabulary — Spec 2 §5 (docs/spec-2-knowledge-layer.md).
//
// This is a plain TS module, deliberately NOT a schema union: the vocabulary
// must grow without Convex schema pushes (dev IS prod). Noise is made
// unrepresentable here — there is no `located_in_country` predicate, so a
// UK-ness edge CANNOT exist (spec §2.4).
//
// ── Discipline ──
// Additions are deliberate one-line PRs, the same discipline as the MCP
// catalogue (skills/CATALOGUE.md). The review question for any proposed
// predicate: is it selective (shared by 2–5 entities, not all), and does
// sharing it imply a real-world mechanism? Same registered office passes
// (implies group / formation agent); UK-ness fails. Explicitly excluded
// forever: symmetric/derivable predicates (`co_lends_with`,
// `shares_director_with`, `competitor_of` — all 2-hop traversals, spec §2.2)
// and geographic/categorical trivia (`based_in_uk`).
//
// ── Store semantics ──
// `store: "native"` predicates are relations already encoded in structural
// tables (clientRoles, contacts, CH mirrors, appetiteSignals). They are
// listed so the traversal layer (Phase 2b) can federate them, but they are
// NEVER stored as atoms — atomsCore rejects them at the persistence gate
// (spec §2.1: a fact that fits a structural field goes in the structural
// field; atoms never duplicate native edges). `store: "both"` means the
// native edge exists but documents add atom-worthy detail (e.g.
// funds_project with a tranche qualifier).

export type PredicateKind = "edge" | "attribute";
export type PredicateFamily =
  | "financing"
  | "people"
  | "structure"
  | "property"
  | "meta";
export type PredicateStore = "atom" | "native" | "both";

export interface PredicateDef {
  kind: PredicateKind;
  family: PredicateFamily;
  /** Edge direction, active voice: subject —predicate→ object. */
  direction?: string;
  description: string;
  /** Where the fact lives. Defaults to "atom" when omitted. */
  store?: PredicateStore;
}

export const PREDICATES: Record<string, PredicateDef> = {
  // ── Financing (the lender-centric core) ──
  funds_project: {
    kind: "edge",
    family: "financing",
    direction: "lender → project",
    description:
      "Lender funds a project. Native via projects.clientRoles; documents add the tranche qualifier as an atom.",
    store: "both",
  },
  lends_to: {
    kind: "edge",
    family: "financing",
    direction: "lender → company",
    description: "Lender lends to a company (facility letters, loan terms).",
  },
  holds_charge_over: {
    kind: "edge",
    family: "financing",
    direction: "chargeholder → company",
    description:
      "Chargeholder holds a registered charge over a company (CH charges, materialized on relevance — spec §8).",
  },
  guarantees: {
    kind: "edge",
    family: "financing",
    direction: "person/company → facility",
    description: "Guarantor guarantees a facility (facility letters, PGs, KYC).",
  },
  granted_security_over: {
    kind: "edge",
    family: "financing",
    direction: "company → asset/scheme",
    description:
      "Company granted security over an asset or scheme (debentures, legal charges).",
  },
  refinanced_by: {
    kind: "edge",
    family: "financing",
    direction: "project/facility → lender",
    description: "Project or facility refinanced by a lender (docs, operator).",
  },
  has_appetite_for: {
    kind: "edge",
    family: "financing",
    direction: "lender → deal-shape",
    description:
      "Lender appetite for a deal shape. Native via appetiteSignals — never stored as an atom.",
    store: "native",
  },

  // ── People (the connective tissue) ──
  officer_of: {
    kind: "edge",
    family: "people",
    direction: "person → company",
    description:
      "Person is an officer of a company. Native via companiesHouseOfficers.",
    store: "native",
  },
  psc_of: {
    kind: "edge",
    family: "people",
    direction: "person → company",
    description:
      "Person with significant control over a company. Native via companiesHousePSC.",
    store: "native",
  },
  works_at: {
    kind: "edge",
    family: "people",
    direction: "person → company",
    description:
      "Person works at a company (role qualifier). Native via contacts.linkedCompanyIds.",
    store: "native",
  },
  advises: {
    kind: "edge",
    family: "people",
    direction: "person/firm → client/project",
    description:
      "Adviser acts for a client or project — capacity qualifier: solicitor, QS, agent, broker (professional reports, legal docs).",
  },
  introduced: {
    kind: "edge",
    family: "people",
    direction: "person → client/deal",
    description: "Person introduced a client or deal (operator notes).",
  },
  formerly_at: {
    kind: "edge",
    family: "people",
    direction: "person → company",
    description: "Person formerly worked at a company (Apollo history, docs).",
  },

  // ── Corporate structure ──
  parent_of: {
    kind: "edge",
    family: "structure",
    direction: "company → company",
    description: "Parent company of a subsidiary (CH group walk).",
  },
  spv_of_group: {
    kind: "edge",
    family: "structure",
    direction: "company → client group",
    description:
      "SPV belongs to a client's group. Native via clients.relatedCompaniesHouseNumbers.",
    store: "native",
  },
  renamed_from: {
    kind: "edge",
    family: "structure",
    direction: "company → prior name",
    description: "Company was renamed from a prior name (CH).",
  },

  // ── Property / deal context ──
  developing: {
    kind: "edge",
    family: "property",
    direction: "client → scheme",
    description:
      "Client is developing a scheme. Native via projects.clientRoles.",
    store: "native",
  },
  owns_site: {
    kind: "edge",
    family: "property",
    direction: "company → scheme/address",
    description: "Company owns a site (title docs).",
  },
  acquired_site_from: {
    kind: "edge",
    family: "property",
    direction: "company → company",
    description: "Company acquired a site from another company (legal docs).",
  },

  // ── Attribute predicates (objectLiteral side) — same review bar ──
  has_gdv: {
    kind: "attribute",
    family: "property",
    description: "Gross development value of a scheme (currency).",
  },
  has_loan_amount: {
    kind: "attribute",
    family: "financing",
    description: "Loan / facility amount (currency).",
  },
  has_interest_rate: {
    kind: "attribute",
    family: "financing",
    description: "Interest rate on a facility (percentage or margin string).",
  },
  matures_on: {
    kind: "attribute",
    family: "financing",
    description: "Facility maturity date (ISO date).",
  },
  has_unit_count: {
    kind: "attribute",
    family: "property",
    description: "Number of units in a scheme (number).",
  },
  has_registration_number: {
    kind: "attribute",
    family: "structure",
    description: "Companies House registration number (string).",
  },
  has_registered_office: {
    kind: "attribute",
    family: "structure",
    description:
      "Registered office address (string) — selective: shared offices imply group / formation agent.",
  },
  planning_status: {
    kind: "attribute",
    family: "property",
    description:
      "Planning status of a scheme — the specific application, decision, or condition (string).",
  },
  has_valuation: {
    kind: "attribute",
    family: "property",
    description: "Valuation of an asset or scheme (currency).",
  },
  has_construction_cost: {
    kind: "attribute",
    family: "property",
    description: "Construction cost of a scheme (currency).",
  },
  has_construction_programme: {
    kind: "attribute",
    family: "property",
    description: "Construction programme / build duration (string or range).",
  },
  has_price_psf: {
    kind: "attribute",
    family: "property",
    description: "Sales price per square foot (currency).",
  },
  states: {
    kind: "attribute",
    family: "meta",
    description:
      "Escape hatch for knowledgeItems Phase-A shims (spec §12): unmapped fieldPaths land here with qualifier = fieldPath. Not for atomizer use.",
  },
};

/** Facility-shaped predicates — spec §3.3 minting triggers. The spec's
 * `secured_by` shorthand maps to `granted_security_over` (the §5 vocabulary
 * name for the security predicate). */
export const FACILITY_SHAPED_PREDICATES = new Set([
  "lends_to",
  "has_loan_amount",
  "has_interest_rate",
  "matures_on",
  "granted_security_over",
]);

/** True when the predicate exists in the vocabulary (any store kind). */
export function isValidPredicate(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PREDICATES, name);
}

/** True when atoms may be persisted for this predicate (store "atom"/"both"). */
export function isAtomStorablePredicate(name: string): boolean {
  const def = PREDICATES[name];
  if (!def) return false;
  return (def.store ?? "atom") !== "native";
}

/** Family for a known predicate; undefined for unknown names. */
export function predicateFamily(name: string): PredicateFamily | undefined {
  return PREDICATES[name]?.family;
}
