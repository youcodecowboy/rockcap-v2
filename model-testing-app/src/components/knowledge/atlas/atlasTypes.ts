// Org-wide knowledge atlas — shared types.
//
// The node/edge/counts shapes mirror the backend contract of
// `convex/knowledge/graphOverview.ts` (the OverviewResult inside the cached
// `snapshot` query's return). Keep in sync.

import type { ColorPalette } from "@/lib/colors";
import { colorForType, type GraphEntityType } from "../graphVocab";

export type AtlasEntityType = GraphEntityType;

/** Lenders are `clients` rows with clientType="lender" — the atlas renders
 * them as their own hue (they fan out across many clients/projects, and that
 * fan-out is the board's whole point), so filtering/coloring works on this
 * derived display type rather than the raw entity type. */
export type AtlasDisplayType = AtlasEntityType | "lender";

export interface AtlasNode {
  key: string;
  type: AtlasEntityType;
  id: string;
  name: string;
  clientType?: "lender" | "borrower" | "developer";
  clientStatus?: string;
  ownerClientId?: string;
  atomCount: number;
  contestedCount: number;
  degree: number;
}

export interface AtlasEdge {
  from: string;
  to: string;
  predicate: string;
  kind: "atom" | "native";
  atomId?: string;
  status: "active" | "contested";
  confidence?: number;
  salience?: number;
}

export interface AtlasCounts {
  nodes: number;
  edges: number;
  atoms: number;
  contested: number;
  byType: Record<string, number>;
  truncated: boolean;
}

export interface AtlasOverview {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  counts: AtlasCounts;
}

export const ATLAS_DISPLAY_TYPES: AtlasDisplayType[] = [
  "lender",
  "client",
  "project",
  "contact",
  "company",
  "facility",
  "candidate",
];

export function displayTypeOf(n: Pick<AtlasNode, "type" | "clientType">): AtlasDisplayType {
  return n.type === "client" && n.clientType === "lender" ? "lender" : n.type;
}

/** Entity hue — the drawer's colorForType plus the lender split. */
export function colorForDisplayType(colors: ColorPalette, t: AtlasDisplayType): string {
  if (t === "lender") return colors.entityTypes.lender;
  return colorForType(colors, t);
}
