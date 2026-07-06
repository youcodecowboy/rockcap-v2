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

/** One line between the center and a ring node (server-provided edge). */
export interface GraphEdgeVM {
  id: string;
  aId: string;
  bId: string;
  predicate: string;
  qualifier?: string;
  family: GraphFamily;
  status: "active" | "contested";
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
}

/** A breadcrumb hop — the pivot stack the explorer pushes/pops. */
export interface Crumb {
  type: GraphEntityType;
  id: string;
  name: string;
}
