// Knowledge-graph drawer — client-side vocabulary + node metadata.
//
// Predicate → family map. This is a DELIBERATE small duplicate of the
// canonical vocabulary in `convex/knowledge/vocabulary.ts` (PREDICATES[*].family)
// rather than an import: (1) that module is a Convex-server file and this is a
// client bundle, (2) the traversal layer also emits SYNTHETIC native predicates
// that are not vocabulary entries at all (`funds`, `secured_on` — see
// graphQueries.ts module header), so a straight re-export would miss them.
// Keep this table in sync when adding an edge/attribute predicate to vocabulary.ts.

import type { ColorPalette } from "@/lib/colors";

export type GraphEntityType =
  | "client"
  | "project"
  | "contact"
  | "company"
  | "facility"
  | "candidate";

/** The four filter families the drawer exposes as chips (spec §14b.5 prototype).
 * `other` is a catch-all bucket for `meta`/unknown predicates so nothing ever
 * silently drops out of the rail. */
export type GraphFamily = "financing" | "people" | "structure" | "property" | "other";

export const FAMILIES: GraphFamily[] = ["financing", "people", "structure", "property"];

const FAMILY_BY_PREDICATE: Record<string, GraphFamily> = {
  // financing
  funds_project: "financing",
  funds: "financing", // synthetic native (facility hub)
  lends_to: "financing",
  secured_on: "financing", // synthetic native (facility hub)
  holds_charge_over: "financing",
  guarantees: "financing",
  granted_security_over: "financing",
  refinanced_by: "financing",
  has_appetite_for: "financing",
  has_loan_amount: "financing",
  has_interest_rate: "financing",
  matures_on: "financing",
  has_total_development_cost: "financing",
  // people
  officer_of: "people",
  psc_of: "people",
  works_at: "people",
  advises: "people",
  introduced: "people",
  formerly_at: "people",
  // structure
  parent_of: "structure",
  spv_of_group: "structure",
  renamed_from: "structure",
  has_registration_number: "structure",
  has_registered_office: "structure",
  // property
  developing: "property",
  owns_site: "property",
  acquired_site_from: "property",
  contractor_for: "property",
  has_gdv: "property",
  has_unit_count: "property",
  planning_status: "property",
  has_valuation: "property",
  has_construction_cost: "property",
  has_construction_programme: "property",
  has_price_psf: "property",
  has_purchase_price: "property",
  has_overage: "property",
};

export function familyFor(predicate: string): GraphFamily {
  return FAMILY_BY_PREDICATE[predicate] ?? "other";
}

/** Node radius by entity type (ported from the prototype's R map). */
export const NODE_RADIUS: Record<GraphEntityType, number> = {
  client: 20,
  project: 17,
  facility: 14,
  company: 13,
  contact: 11,
  candidate: 10,
};

/** Canon entity color per type (src/lib/colors.ts). Facility → accent.blue,
 * company → accent.orange, candidate (unresolved) → prospect yellow. */
export function colorForType(colors: ColorPalette, type: GraphEntityType): string {
  switch (type) {
    case "client":
      return colors.entityTypes.client;
    case "project":
      return colors.entityTypes.project;
    case "contact":
      return colors.entityTypes.contact;
    case "company":
      return colors.accent.orange;
    case "facility":
      return colors.accent.blue;
    case "candidate":
      return colors.entityTypes.prospect;
    default:
      return colors.text.muted;
  }
}

/** Family swatch color for the rail section headers. */
export function colorForFamily(colors: ColorPalette, family: GraphFamily): string {
  switch (family) {
    case "financing":
      return colors.accent.blue;
    case "people":
      return colors.entityTypes.contact;
    case "structure":
      return colors.accent.orange;
    case "property":
      return colors.entityTypes.project;
    default:
      return colors.text.dim;
  }
}
