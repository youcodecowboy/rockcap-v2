// Shared derivation: expandEntity query result → GraphCanvas view-models.
// Extracted from KnowledgeGraphDrawer so the full drawer and the inline
// MiniKnowledgeGraph render the SAME graph from the same transform — one
// place decides how raw edges/attributes become nodes, edges, rail rows,
// and satellites.

import { familyFor } from "./graphVocab";
import type { GraphEntityType } from "./graphVocab";
import type { AtomLineVM, GraphEdgeVM, GraphNodeVM, SatelliteVM } from "./types";

// expandEntity edge shape (convex/knowledge/graphQueries.ts GraphEdge).
export interface RawEdge {
  predicate: string;
  direction: "out" | "in";
  other: { id: string; type: GraphEntityType; name: string; sub?: string };
  qualifier?: string;
  asOf?: string;
  confidence: number;
  status: "active" | "contested";
  provenance: { sourceType: string; ref?: string; observationCount: number; nativeCorroboration?: string; matchQuality?: string };
}
/** interEdges entry — a ring-to-ring edge; neither endpoint is the center, so
 * it carries both (`from` = collection side; direction is relative to it). */
export interface RawInterEdge extends RawEdge {
  from: { id: string; type: GraphEntityType; name: string; sub?: string };
}
export interface RawAttr {
  predicate: string;
  value: unknown;
  valueType: string;
  currency?: string;
  qualifier?: string;
  asOf?: string;
  status: "active" | "contested";
  confidence: number;
  native?: string;
  /** Convex atom id — present on stored attribute atoms (center + ring),
   * absent on native-federated attributes (appetiteSignals). */
  atomId?: string;
}
/** ringAttributes entry — a ring member's attribute atom (the satellite lane):
 * the attribute shape plus its owning subject ref and the atom id. */
export interface RawRingAttr extends RawAttr {
  atomId: string;
  subject: { id: string; type: GraphEntityType; name: string; sub?: string };
}

export function formatAttrValue(a: RawAttr): string {
  if (typeof a.value === "number") {
    if (a.currency) return `£${a.value.toLocaleString("en-GB")}`;
    return a.value.toLocaleString("en-GB");
  }
  if (a.value === null || a.value === undefined) return "—";
  return String(a.value);
}

export function edgeProvenance(p: RawEdge["provenance"]): string {
  const parts: string[] = [];
  if (p.sourceType === "native") parts.push(`native · ${p.ref ?? "structural"}`);
  else {
    parts.push(p.sourceType);
    if (p.observationCount) parts.push(`${p.observationCount} obs`);
  }
  if (p.nativeCorroboration) parts.push(`+native: ${p.nativeCorroboration}`);
  if (p.matchQuality) parts.push(p.matchQuality);
  return parts.join(" · ");
}

export function attrProvenance(a: RawAttr): string {
  if (a.native) return `native · ${a.native}`;
  return a.asOf ? `atom · ${a.asOf}` : "atom";
}

export interface GraphViewModels {
  nodes: GraphNodeVM[];
  edges: GraphEdgeVM[];
  atoms: AtomLineVM[];
  satellites: SatelliteVM[];
  satelliteTruncation: Record<string, number>;
}

const EMPTY_VMS: GraphViewModels = {
  nodes: [],
  edges: [],
  atoms: [],
  satellites: [],
  satelliteTruncation: {},
};

/** Fan-out overflow count for the center's "+N more" badge. */
export function truncatedMoreFrom(data: unknown): number {
  if (!data) return 0;
  const d = data as { counts: { edges: number; nativeEdges: number; truncated: boolean }; edges: RawEdge[]; nativeEdges: RawEdge[] };
  if (!d.counts?.truncated) return 0;
  const shown = d.edges.length + d.nativeEdges.length;
  return Math.max(0, d.counts.edges + d.counts.nativeEdges - shown);
}

/** Derive canvas view-models from an expandEntity result (null-safe). */
export function deriveGraphViewModels(data: unknown): GraphViewModels {
  if (!data) return EMPTY_VMS;
  const d = data as {
    entity: { id: string; type: GraphEntityType; name: string; sub?: string };
    edges: RawEdge[];
    nativeEdges: RawEdge[];
    interEdges?: RawInterEdge[];
    attributes: RawAttr[];
    ringAttributes?: Record<string, RawRingAttr[]>;
    ringAttributeTruncated?: Record<string, number>;
  };
  const entity = d.entity;
  const rawEdges = [...d.edges, ...d.nativeEdges];
  const rawAttrs = d.attributes;

  const centerNode: GraphNodeVM = { id: entity.id, type: entity.type, name: entity.name, sub: entity.sub, isCenter: true };
  const nodeMap = new Map<string, GraphNodeVM>([[entity.id, centerNode]]);
  const edgeVMs: GraphEdgeVM[] = [];
  const atomVMs: AtomLineVM[] = [];
  const satelliteVMs: SatelliteVM[] = [];

  rawEdges.forEach((e, i) => {
    if (e.other.id === entity.id) return; // skip degenerate self edges
    if (!nodeMap.has(e.other.id)) {
      nodeMap.set(e.other.id, { id: e.other.id, type: e.other.type, name: e.other.name, sub: e.other.sub, isCenter: false });
    }
    const id = `e${i}`;
    const family = familyFor(e.predicate);
    // Atom edges carry their atomId in provenance.ref; native edges' ref is a
    // table name (never contested) → no resolve handle.
    const atomId = e.provenance.sourceType !== "native" ? e.provenance.ref : undefined;
    edgeVMs.push({ id, aId: entity.id, bId: e.other.id, predicate: e.predicate, qualifier: e.qualifier, family, status: e.status });
    atomVMs.push({
      id,
      family,
      predicate: e.predicate,
      line: e.other.name,
      qualifier: e.qualifier,
      status: e.status,
      provenance: edgeProvenance(e.provenance),
      nodeIds: [entity.id, e.other.id],
      atomId,
      hostName: e.direction === "out" ? entity.name : e.other.name,
    });
  });

  // Ring-to-ring edges (interEdges lane). Endpoints are drawn from the
  // returned center edges so both nodes normally already exist; guard-add
  // anyway (the server ring cap could differ from what we rendered above).
  const rawInter = d.interEdges ?? [];
  rawInter.forEach((e, i) => {
    if (e.from.id === e.other.id) return;
    for (const ep of [e.from, e.other]) {
      if (!nodeMap.has(ep.id)) {
        nodeMap.set(ep.id, { id: ep.id, type: ep.type, name: ep.name, sub: ep.sub, isCenter: false });
      }
    }
    const id = `i${i}`;
    const family = familyFor(e.predicate);
    const atomId = e.provenance.sourceType !== "native" ? e.provenance.ref : undefined;
    edgeVMs.push({ id, aId: e.from.id, bId: e.other.id, predicate: e.predicate, qualifier: e.qualifier, family, status: e.status, inter: true });
    const subjectName = e.direction === "out" ? e.from.name : e.other.name;
    const objectName = e.direction === "out" ? e.other.name : e.from.name;
    atomVMs.push({
      id,
      family,
      predicate: e.predicate,
      line: `${subjectName} → ${objectName}`,
      qualifier: e.qualifier,
      status: e.status,
      provenance: edgeProvenance(e.provenance),
      nodeIds: [e.from.id, e.other.id],
      atomId,
      hostName: subjectName,
    });
  });

  // Center attributes — rail rows AND satellites orbiting the center node.
  rawAttrs.forEach((a, i) => {
    const id = `a${i}`;
    const family = familyFor(a.predicate);
    const value = formatAttrValue(a);
    const provenance = attrProvenance(a);
    atomVMs.push({
      id,
      family,
      predicate: a.predicate,
      line: value,
      qualifier: a.qualifier,
      status: a.status,
      provenance,
      nodeIds: [entity.id],
      atomId: a.atomId,
      hostName: entity.name,
    });
    satelliteVMs.push({ id, hostId: entity.id, family, label: a.predicate, valueSnippet: value, status: a.status, qualifier: a.qualifier, asOf: a.asOf, hostName: entity.name, provenance });
  });

  // Ring-member attributes (satellite lane). Each becomes a rail row filed
  // under its host (nodeIds=[hostId], reusing the node-click filter + the
  // satellite-click selection path) AND a satellite orbiting that host.
  const rawRingAttrs = d.ringAttributes ?? {};
  const rawRingTrunc = d.ringAttributeTruncated ?? {};
  const satelliteTrunc: Record<string, number> = {};
  for (const [key, rows] of Object.entries(rawRingAttrs)) {
    // entityKey is `${type}:${id}`; the node VM is keyed by the raw id.
    const hostId = key.slice(key.indexOf(":") + 1);
    if (!nodeMap.has(hostId)) continue; // host not on canvas — skip its satellites
    if (rawRingTrunc[key]) satelliteTrunc[hostId] = rawRingTrunc[key];
    rows.forEach((a) => {
      const family = familyFor(a.predicate);
      const value = formatAttrValue(a);
      const provenance = attrProvenance(a);
      atomVMs.push({
        id: a.atomId,
        family,
        predicate: a.predicate,
        line: value,
        qualifier: a.qualifier,
        status: a.status,
        provenance,
        nodeIds: [hostId],
        atomId: a.atomId,
        hostName: a.subject.name,
      });
      satelliteVMs.push({ id: a.atomId, hostId, family, label: a.predicate, valueSnippet: value, status: a.status, qualifier: a.qualifier, asOf: a.asOf, hostName: a.subject.name, provenance });
    });
  }

  return { nodes: [...nodeMap.values()], edges: edgeVMs, atoms: atomVMs, satellites: satelliteVMs, satelliteTruncation: satelliteTrunc };
}
