"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { EmptyState } from "@/components/layouts";
import GraphCanvas from "./GraphCanvas";
import AtomRail from "./AtomRail";
import NodeDetailCard from "./NodeDetailCard";
import { FAMILIES, colorForType, familyFor } from "./graphVocab";
import type { GraphEntityType, GraphFamily } from "./graphVocab";
import type { AtomLineVM, Crumb, GraphEdgeVM, GraphNodeVM, SatelliteVM } from "./types";

interface KnowledgeGraphDrawerProps {
  entryEntityType: GraphEntityType;
  entryEntityId: string;
  entryName: string;
  /** Spec §14b.6a — the entry entity is a prospect-status clients row.
   * Viewing a prospect is ALWAYS unfiltered (connection-hunting is the point)
   * and the "Prospect intel" toggle is not rendered. Client-side mounts leave
   * this false/undefined: prospect-scoped atoms are hidden by default and the
   * toolbar toggle reveals them. */
  entryIsProspect?: boolean;
  onClose: () => void;
}

// expandEntity edge shape (convex/knowledge/graphQueries.ts GraphEdge).
interface RawEdge {
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
interface RawInterEdge extends RawEdge {
  from: { id: string; type: GraphEntityType; name: string; sub?: string };
}
interface RawAttr {
  predicate: string;
  value: unknown;
  valueType: string;
  currency?: string;
  qualifier?: string;
  asOf?: string;
  status: "active" | "contested";
  confidence: number;
  native?: string;
}
/** ringAttributes entry — a ring member's attribute atom (the satellite lane):
 * the attribute shape plus its owning subject ref and the atom id. */
interface RawRingAttr extends RawAttr {
  atomId: string;
  subject: { id: string; type: GraphEntityType; name: string; sub?: string };
}

function formatAttrValue(a: RawAttr): string {
  if (typeof a.value === "number") {
    if (a.currency) return `£${a.value.toLocaleString("en-GB")}`;
    return a.value.toLocaleString("en-GB");
  }
  if (a.value === null || a.value === undefined) return "—";
  return String(a.value);
}

function edgeProvenance(p: RawEdge["provenance"]): string {
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

function attrProvenance(a: RawAttr): string {
  if (a.native) return `native · ${a.native}`;
  return a.asOf ? `atom · ${a.asOf}` : "atom";
}

export default function KnowledgeGraphDrawer({ entryEntityType, entryEntityId, entryName, entryIsProspect, onClose }: KnowledgeGraphDrawerProps) {
  const colors = useColors();

  // Breadcrumb / pivot stack — bottom is the entry entity, top is the current center.
  const [stack, setStack] = useState<Crumb[]>([{ type: entryEntityType, id: entryEntityId, name: entryName }]);
  const center = stack[stack.length - 1];

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFamily, setActiveFamily] = useState<GraphFamily | "all">("all");
  // Prospect-intel toggle (spec §14b.6a). Only meaningful when the entry is a
  // client: off (default) hides prospect-scoped atoms; on reveals them.
  // A prospect entry is always unfiltered and never shows the toggle.
  const [showProspectIntel, setShowProspectIntel] = useState(false);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // ESC to close.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  // Reset selection when the center changes (pivot / pop).
  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedAtomId(null);
  }, [center.id]);

  // Client-wide totals for the header — the canvas is a one-hop view; most
  // client knowledge lives on project subjects, one pivot away.
  const clientTotals = useQuery(
    api.knowledge.graphQueries.clientAtomTotals,
    entryEntityType === "client" ? { clientId: entryEntityId as any } : "skip",
  );
  const data = useQuery(api.knowledge.graphQueries.expandEntity, {
    entityType: center.type,
    entityId: center.id,
    // Prospect entry ⇒ always unfiltered; client entry ⇒ the toggle decides.
    includeProspectScoped: entryIsProspect || showProspectIntel,
    // Satellites: always pull each ring member's attribute atoms so a ring
    // member's knowledge (a project's GDV/planning/cost) is visible in place.
    includeRingAttributes: true,
  });

  // ── derive view-models from the expandEntity result ──
  const { nodes, edges, atoms, satellites, satelliteTruncation } = useMemo(() => {
    if (!data)
      return {
        nodes: [] as GraphNodeVM[],
        edges: [] as GraphEdgeVM[],
        atoms: [] as AtomLineVM[],
        satellites: [] as SatelliteVM[],
        satelliteTruncation: {} as Record<string, number>,
      };
    const entity = data.entity as { id: string; type: GraphEntityType; name: string; sub?: string };
    const rawEdges = [...(data.edges as RawEdge[]), ...(data.nativeEdges as RawEdge[])];
    const rawAttrs = data.attributes as RawAttr[];

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
      });
    });

    // Ring-to-ring edges (interEdges lane). Endpoints are drawn from the
    // returned center edges so both nodes normally already exist; guard-add
    // anyway (the server ring cap could differ from what we rendered above).
    const rawInter = ((data.interEdges ?? []) as RawInterEdge[]);
    rawInter.forEach((e, i) => {
      if (e.from.id === e.other.id) return;
      for (const ep of [e.from, e.other]) {
        if (!nodeMap.has(ep.id)) {
          nodeMap.set(ep.id, { id: ep.id, type: ep.type, name: ep.name, sub: ep.sub, isCenter: false });
        }
      }
      const id = `i${i}`;
      const family = familyFor(e.predicate);
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
      });
    });

    // Center attributes — rail rows AND satellites orbiting the center node.
    rawAttrs.forEach((a, i) => {
      const id = `a${i}`;
      const family = familyFor(a.predicate);
      const value = formatAttrValue(a);
      atomVMs.push({
        id,
        family,
        predicate: a.predicate,
        line: value,
        qualifier: a.qualifier,
        status: a.status,
        provenance: attrProvenance(a),
        nodeIds: [entity.id],
      });
      satelliteVMs.push({ id, hostId: entity.id, family, label: a.predicate, valueSnippet: value, status: a.status });
    });

    // Ring-member attributes (satellite lane). Each becomes a rail row filed
    // under its host (nodeIds=[hostId], reusing the node-click filter + the
    // satellite-click selection path) AND a satellite orbiting that host.
    const rawRingAttrs = (data.ringAttributes ?? {}) as Record<string, RawRingAttr[]>;
    const rawRingTrunc = (data.ringAttributeTruncated ?? {}) as Record<string, number>;
    const satelliteTrunc: Record<string, number> = {};
    for (const [key, rows] of Object.entries(rawRingAttrs)) {
      // entityKey is `${type}:${id}`; the node VM is keyed by the raw id.
      const hostId = key.slice(key.indexOf(":") + 1);
      if (!nodeMap.has(hostId)) continue; // host not on canvas — skip its satellites
      if (rawRingTrunc[key]) satelliteTrunc[hostId] = rawRingTrunc[key];
      rows.forEach((a) => {
        const family = familyFor(a.predicate);
        const value = formatAttrValue(a);
        atomVMs.push({
          id: a.atomId,
          family,
          predicate: a.predicate,
          line: value,
          qualifier: a.qualifier,
          status: a.status,
          provenance: attrProvenance(a),
          nodeIds: [hostId],
        });
        satelliteVMs.push({ id: a.atomId, hostId, family, label: a.predicate, valueSnippet: value, status: a.status });
      });
    }

    return { nodes: [...nodeMap.values()], edges: edgeVMs, atoms: atomVMs, satellites: satelliteVMs, satelliteTruncation: satelliteTrunc };
  }, [data]);

  // ── family VIEW filtering — the filters are TRUE VIEWS, not dimming ──
  // When a family is active the canvas renders a genuine SUBGRAPH: the CENTER
  // always stays; a non-center node survives iff it has ≥1 edge of that family
  // (either endpoint — inter-edges count) OR ≥1 satellite of that family.
  // Everything else is REMOVED — not passed to the canvas, so not rendered and
  // not simulated. Only that family's edges + satellites survive; the canvas
  // recomputes host satellite-counts / cluster radii / prominence against this
  // filtered satellite set on its own (a project that survives via a people
  // edge carries no property satellites here and shrinks accordingly). Filtering
  // in this ONE place keeps GraphCanvas view-agnostic.
  const { viewNodes, viewEdges, viewAtoms, viewSatellites, viewSatelliteTruncation } = useMemo(() => {
    if (activeFamily === "all") {
      return {
        viewNodes: nodes,
        viewEdges: edges,
        viewAtoms: atoms,
        viewSatellites: satellites,
        viewSatelliteTruncation: satelliteTruncation,
      };
    }
    const fam = activeFamily;
    const fEdges = edges.filter((e) => e.family === fam);
    const fSatellites = satellites.filter((s) => s.family === fam);
    // Surviving node ids: center + both endpoints of every family edge + every
    // family satellite's host.
    const keep = new Set<string>([center.id]);
    for (const e of fEdges) {
      keep.add(e.aId);
      keep.add(e.bId);
    }
    for (const s of fSatellites) keep.add(s.hostId);
    const fNodes = nodes.filter((n) => n.isCenter || keep.has(n.id));
    // Atoms in view = atoms of this family. Every such atom's nodeIds are
    // surviving nodes by the membership rule above, so the rail stays exactly
    // consistent with the canvas with no extra pruning.
    const fAtoms = atoms.filter((a) => a.family === fam);
    // Server-capped overflow ("+N more (capped)") is family-agnostic — the
    // capped atoms can't be attributed to a family, so suppress it inside a view.
    return {
      viewNodes: fNodes,
      viewEdges: fEdges,
      viewAtoms: fAtoms,
      viewSatellites: fSatellites,
      viewSatelliteTruncation: {} as Record<string, number>,
    };
  }, [activeFamily, nodes, edges, atoms, satellites, satelliteTruncation, center.id]);

  const truncatedMore = useMemo(() => {
    if (!data) return 0;
    const c = data.counts as { edges: number; nativeEdges: number; truncated: boolean };
    if (!c.truncated) return 0;
    const shown = (data.edges as RawEdge[]).length + (data.nativeEdges as RawEdge[]).length;
    return Math.max(0, c.edges + c.nativeEdges - shown);
  }, [data]);

  // How many atom-lane items the prospect-scope filter hid (0 when the
  // filter is off) — labels the "Prospect intel" toggle chip.
  const prospectHidden = (data?.counts as { prospectScopedHidden?: number } | undefined)?.prospectScopedHidden ?? 0;

  // ── filtering ──
  const searchLc = search.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    const s = new Set<string>();
    // viewAtoms is already family-filtered; only search + selected-node narrow it.
    for (const a of viewAtoms) {
      if (searchLc && !`${a.predicate} ${a.line} ${a.qualifier ?? ""}`.toLowerCase().includes(searchLc)) continue;
      if (selectedNodeId && !a.nodeIds.includes(selectedNodeId)) continue;
      s.add(a.id);
    }
    return s;
  }, [viewAtoms, searchLc, selectedNodeId]);

  const searchMatchNodeIds = useMemo(() => {
    const s = new Set<string>();
    if (!searchLc) return s;
    for (const a of viewAtoms) {
      if (`${a.predicate} ${a.line} ${a.qualifier ?? ""}`.toLowerCase().includes(searchLc)) {
        for (const id of a.nodeIds) s.add(id);
      }
    }
    return s;
  }, [viewAtoms, searchLc]);

  // Satellites glow on a search hit over their predicate + value (their own
  // ids, matched independently of the node-id set above).
  const satelliteMatchIds = useMemo(() => {
    const s = new Set<string>();
    if (!searchLc) return s;
    for (const sat of viewSatellites) {
      if (`${sat.label} ${sat.valueSnippet}`.toLowerCase().includes(searchLc)) s.add(sat.id);
    }
    return s;
  }, [viewSatellites, searchLc]);

  // Selection resolves against the in-view node set — a node removed by a family
  // switch drops its detail card automatically.
  const selectedNode = selectedNodeId ? viewNodes.find((n) => n.id === selectedNodeId) ?? null : null;
  const detailAtoms = useMemo(
    () => (selectedNode ? viewAtoms.filter((a) => a.nodeIds.includes(selectedNode.id)) : []),
    [viewAtoms, selectedNode],
  );
  const detailEdgeCount = useMemo(
    () => (selectedNode ? viewEdges.filter((e) => e.aId === selectedNode.id || e.bId === selectedNode.id).length : 0),
    [viewEdges, selectedNode],
  );

  const contestedCount = viewAtoms.filter((a) => a.status === "contested").length;

  // ── interactions ──
  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setSelectedAtomId(null);
  }, []);

  const handleAtomSelect = useCallback((atom: AtomLineVM) => {
    const target = atom.nodeIds[atom.nodeIds.length - 1];
    setSelectedNodeId(target);
    setSelectedAtomId(atom.id);
  }, []);

  // Satellite click → select its host node (so the rail/detail filters to it)
  // and highlight the atom's row (same path as an atom-rail click).
  const handleSatelliteSelect = useCallback((sat: SatelliteVM) => {
    setSelectedNodeId(sat.hostId);
    setSelectedAtomId(sat.id);
  }, []);

  const handleExplore = useCallback((node: GraphNodeVM) => {
    setStack((prev) => {
      // If already in the stack, pop back to it; otherwise push.
      const existing = prev.findIndex((c) => c.id === node.id);
      if (existing !== -1) return prev.slice(0, existing + 1);
      return [...prev, { type: node.type, id: node.id, name: node.name }];
    });
    setSearch("");
    setActiveFamily("all");
  }, []);

  const popTo = useCallback((index: number) => {
    setStack((prev) => prev.slice(0, index + 1));
  }, []);

  const crossClient = stack.length > 1;
  const centerColor = colorForType(colors, center.type);

  const chip = (label: string, value: GraphFamily | "all") => {
    const on = activeFamily === value;
    return (
      <button
        key={value}
        onClick={() => setActiveFamily(value)}
        style={{
          border: `1px solid ${on ? colors.text.secondary : colors.border.default}`,
          background: on ? colors.bg.card : "transparent",
          color: on ? colors.text.primary : colors.text.muted,
          borderRadius: 999,
          padding: "4px 13px",
          fontSize: 12,
          cursor: "pointer",
          textTransform: "capitalize",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000 }} role="dialog" aria-label={`Knowledge graph for ${entryName}`}>
      <style>{`
        @keyframes rc-graph-slidein { to { transform: translateX(0); } }
        .rc-graph-drawer { transform: translateX(-102%); animation: rc-graph-slidein .55s cubic-bezier(.22,1,.3,1) .05s forwards; }
        @media (prefers-reduced-motion: reduce) { .rc-graph-drawer { animation: none; transform: none; } }
      `}</style>

      {/* scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: colors.bg.base === "#ffffff" ? "rgba(10,10,10,0.35)" : "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      />

      {/* drawer */}
      <div
        className="rc-graph-drawer"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(80vw, 1480px)",
          background: colors.bg.base,
          borderRight: `1px solid ${colors.border.mid}`,
          display: "flex",
          flexDirection: "column",
          boxShadow: "24px 0 80px rgba(0,0,0,0.45)",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 22px", borderBottom: `1px solid ${colors.border.default}`, flex: "none" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              padding: "3px 9px",
              borderRadius: 999,
              border: `1px solid ${colorForType(colors, entryEntityType)}`,
              color: colorForType(colors, entryEntityType),
            }}
          >
            {entryEntityType}
          </span>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 650, margin: 0, letterSpacing: "-.01em", color: colors.text.primary }}>
              {entryName} — Knowledge Graph
            </h1>
            <div style={{ color: colors.text.muted, fontSize: 12 }}>
              {viewAtoms.length} atom{viewAtoms.length === 1 ? "" : "s"} shown · {viewNodes.length} entit{viewNodes.length === 1 ? "y" : "ies"}
              {contestedCount > 0 ? ` · ${contestedCount} contested` : ""}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          {entryEntityType === "client" && (
            <Link
              href={entryIsProspect ? `/prospects/${entryEntityId}` : `/clients/${entryEntityId}`}
              style={{
                background: colors.bg.card,
                color: colors.text.secondary,
                border: `1px solid ${colors.border.default}`,
                borderRadius: 5,
                padding: "6px 12px",
                fontSize: 12.5,
                textDecoration: "none",
              }}
            >
              {entryIsProspect ? "Prospect profile ↗" : "Client profile ↗"}
            </Link>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{
              background: colors.bg.card,
              color: colors.text.secondary,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 5,
              padding: "6px 10px",
              fontSize: 16,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* breadcrumbs */}
        {stack.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 22px", borderBottom: `1px solid ${colors.border.default}`, flex: "none", flexWrap: "wrap" }}>
            {stack.map((c, i) => {
              const last = i === stack.length - 1;
              return (
                <span key={`${c.id}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span style={{ color: colors.text.dim, fontSize: 12 }}>›</span>}
                  <button
                    onClick={() => !last && popTo(i)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: last ? "default" : "pointer",
                      fontSize: 12,
                      fontWeight: last ? 600 : 400,
                      color: last ? colors.text.primary : colors.text.muted,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <i style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: colorForType(colors, c.type) }} />
                    {c.name}
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", borderBottom: `1px solid ${colors.border.default}`, flex: "none" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search atoms…"
            style={{
              flex: "0 0 300px",
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 5,
              padding: "7px 12px",
              color: colors.text.primary,
              fontSize: 13,
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {chip("All", "all")}
            {FAMILIES.map((f) => chip(f, f))}
          </div>
          {/* Prospect-intel toggle (spec §14b.6a) — client entries only; a
              prospect entry is always unfiltered so the toggle never shows. */}
          {!entryIsProspect && (
            <button
              onClick={() => setShowProspectIntel((on) => !on)}
              title={
                showProspectIntel
                  ? "Prospect-scoped atoms are shown — click to hide them"
                  : "Prospect-scoped atoms are hidden by default — click to include prospect intel"
              }
              style={{
                border: `1px solid ${showProspectIntel ? colors.entityTypes.prospect : colors.border.default}`,
                background: showProspectIntel ? `${colors.entityTypes.prospect}15` : "transparent",
                color: showProspectIntel ? colors.entityTypes.prospect : colors.text.muted,
                borderRadius: 999,
                padding: "4px 13px",
                fontSize: 12,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Prospect intel{!showProspectIntel && prospectHidden > 0 ? ` (${prospectHidden})` : ""}
            </button>
          )}
          {crossClient && (
            <span
              title="The current center is not the entry client"
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: centerColor,
                border: `1px solid ${centerColor}`,
                borderRadius: 999,
                padding: "3px 10px",
              }}
            >
              cross-client scope
            </span>
          )}
          <span
            title="Client-wide = every atom scoped to this client. In view = the current center's one-hop neighborhood — Explore a node to see its own knowledge. Contested = live sources disagree; both values are kept with provenance."
            style={{ marginLeft: "auto", color: colors.text.dim, fontSize: 11.5, fontFamily: "ui-monospace, Menlo, monospace", cursor: "help" }}
          >
            {clientTotals
              ? `${clientTotals.total} atoms client-wide${clientTotals.contested ? ` (${clientTotals.contested} contested)` : ""} · ${viewNodes.length} entities · ${viewAtoms.length} in view${viewSatellites.length ? ` · ${viewSatellites.length} knowledge points` : ""}`
              : `${viewNodes.length} entities · ${viewAtoms.length} atoms${contestedCount ? ` · ${contestedCount} contested` : ""}${viewSatellites.length ? ` · ${viewSatellites.length} knowledge points` : ""}`}
          </span>
        </div>

        {/* body */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <AtomRail
            atoms={viewAtoms}
            visibleIds={visibleIds}
            selectedNodeName={selectedNode ? selectedNode.name : null}
            selectedAtomId={selectedAtomId}
            onClearFilter={() => handleSelectNode(null)}
            onAtomSelect={handleAtomSelect}
          />

          {data === undefined ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: colors.bg.base }}>
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.text.dim }} />
            </div>
          ) : nodes.length <= 1 && atoms.length === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: colors.bg.base }}>
              <EmptyState
                title={`No knowledge atoms yet for this ${center.type}`}
                body="As documents are filed and analysed, extracted facts and relationships will appear here as a graph."
              />
            </div>
          ) : (
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <GraphCanvas
                nodes={viewNodes}
                edges={viewEdges}
                satellites={viewSatellites}
                satelliteTruncation={viewSatelliteTruncation}
                satelliteMatchIds={satelliteMatchIds}
                centerId={center.id}
                selectedId={selectedNodeId}
                selectedAtomId={selectedAtomId}
                searchMatchIds={searchMatchNodeIds}
                activeFamily={activeFamily}
                reducedMotion={reducedMotion}
                truncatedMore={truncatedMore}
                onSelect={handleSelectNode}
                onSatelliteSelect={handleSatelliteSelect}
              />
              {selectedNode && (
                <NodeDetailCard
                  node={selectedNode}
                  atoms={detailAtoms}
                  edgeCount={detailEdgeCount}
                  onExplore={handleExplore}
                  onClose={() => handleSelectNode(null)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
