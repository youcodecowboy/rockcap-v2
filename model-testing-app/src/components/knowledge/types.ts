// Shared view-model types for the knowledge-graph drawer. The drawer derives
// these from the `expandEntity` public query result (convex/knowledge/graphQueries.ts).

import type { GraphEntityType, GraphFamily } from "./graphVocab";

/** One entity on the canvas — the center plus one ring of `other` endpoints. */
export interface GraphNodeVM {
  id: string;
  type: GraphEntityType;
  name: string;
  sub?: string;
  isCenter: boolean;
}

/** One line between two nodes (server-provided edge). Center edges join the
 * center to a ring node; inter edges (`inter: true`) join two ring nodes —
 * they render fainter and pull with weaker springs so center edges stay primary. */
export interface GraphEdgeVM {
  id: string;
  aId: string;
  bId: string;
  predicate: string;
  qualifier?: string;
  family: GraphFamily;
  status: "active" | "contested";
  /** Ring-to-ring edge from expandEntity's interEdges lane. */
  inter?: boolean;
}

/** One atom-rail line item — an edge or an attribute of the center entity. */
export interface AtomLineVM {
  id: string;
  family: GraphFamily;
  predicate: string;
  /** Readable statement line (from predicate / other-name / value / qualifier). */
  line: string;
  qualifier?: string;
  status: "active" | "contested";
  /** Provenance summary (sourceType · observation count, native ref, etc.). */
  provenance: string;
  /** Node ids this atom touches — [center] for an attribute, [center, other] for an edge. */
  nodeIds: string[];
  /** Convex atom id — the handle for contested resolution. Present on stored
   * atoms (ring attributes, center attributes, atom edges); absent on native
   * edges (structural record, never contested). */
  atomId?: string;
  /** Display name of the atom's subject/host — the contested section header. */
  hostName?: string;
}

/** One "knowledge satellite" — an ATTRIBUTE atom rendered as a small dot
 * attached to its host node (the center, or a ring member via ringAttributes).
 * Hover-labeled only; click selects the host + highlights the atom's rail row. */
export interface SatelliteVM {
  /** atomId for a ring attribute; the center attribute's rail-VM id otherwise.
   * Always matches the corresponding AtomLineVM.id so selection reuses the
   * existing atom-select path. */
  id: string;
  /** Node id this satellite orbits (raw entity id, matches a GraphNodeVM.id). */
  hostId: string;
  family: GraphFamily;
  /** Predicate — the hover label's key half. */
  label: string;
  /** Formatted value — the hover card's value half (full, un-truncated). */
  valueSnippet: string;
  status: "active" | "contested";
  /** Qualifier tag (e.g. tranche / role) — hover-card muted line. */
  qualifier?: string;
  /** asOf date string — hover-card muted line. */
  asOf?: string;
  /** Display name of the host entity this satellite orbits — hover-card footer. */
  hostName: string;
  /** Provenance summary — hover-card muted line. */
  provenance?: string;
}

/** A breadcrumb hop — the pivot stack the explorer pushes/pops. */
export interface Crumb {
  type: GraphEntityType;
  id: string;
  name: string;
}
