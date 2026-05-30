// src/lib/structure/types.ts
export type NodeKind = "company" | "person";
export type NodeRole =
  | "borrower" | "landholder" | "sponsor-holding" | "jv-partner"
  | "former-employer" | "contractor" | "pipeline" | "unknown";
export type EdgeRelation = "owns" | "directs" | "charges" | "psc";
export type Confidence = "hard" | "soft";
export type EdgeFlag =
  | "director-not-owner" | "brand-not-borrower" | "band-only"
  | "ceased" | "dissolved" | "unverified";
export type StructureConfidence = "high" | "medium" | "low";

export interface StructureNode {
  id: string;                 // CH number for companies; slug/officer-id for people
  kind: NodeKind;
  name: string;
  ref?: string;               // CH number / CH officer appointment id
  status?: "active" | "dissolved" | "ceased";
  role?: NodeRole;
  meta?: Record<string, string | number>;
}
export interface StructureEdge {
  from: string;               // node id
  to: string;                 // node id
  relation: EdgeRelation;
  detail?: string;            // "25–50%", "75%+", "director appt 2024-12-03", lender + date
  evidence: { source: string; url?: string; filing?: string };
  confidence: Confidence;
  flags?: EdgeFlag[];
}
export interface StructureVerdict {
  structureConfidence: StructureConfidence;
  rationale: string;
  openQuestions: string[];
}
export interface StructureGraph {
  subjectClientId: string;
  asOf: string;               // ISO date; passed in (never Date.now())
  nodes: StructureNode[];
  edges: StructureEdge[];
  verdict: StructureVerdict;
}
