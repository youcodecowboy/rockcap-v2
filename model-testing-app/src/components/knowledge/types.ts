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
}

/** A breadcrumb hop — the pivot stack the explorer pushes/pops. */
export interface Crumb {
  type: GraphEntityType;
  id: string;
  name: string;
}
