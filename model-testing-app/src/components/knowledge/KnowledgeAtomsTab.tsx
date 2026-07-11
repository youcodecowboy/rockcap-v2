"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2, Network } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useColors } from "@/lib/useColors";
import { Button, EmptyState } from "@/components/layouts";
import { FAMILIES, colorForFamily, familyFor } from "./graphVocab";
import type { GraphEntityType, GraphFamily } from "./graphVocab";

// The atoms-backed profile tab (knowledge cutover Phase 2) — replaces the
// knowledgeItems IntelligenceTab on client/project pages. Read-only list view
// over the SAME expandEntity payload the KnowledgeGraphDrawer renders, so the
// tab and the graph never disagree: center attributes + edges + each ring
// member's attribute atoms (a client's projects' GDV/planning/etc. in place),
// with contested groups pinned for adjudication. Curation beyond
// keep-this-value stays in the drawer / atlas.

interface KnowledgeAtomsTabProps {
  entityType: Extract<GraphEntityType, "client" | "project">;
  entityId: string;
  entityName: string;
  /** Prospect-status clients view unfiltered (connection-hunting is the point). */
  isProspect?: boolean;
  onOpenGraph?: () => void;
}

interface Row {
  id: string;
  kind: "edge" | "attr";
  family: GraphFamily | "other";
  predicate: string;
  line: string;
  qualifier?: string;
  status: "active" | "contested";
  provenance: string;
  /** Subject the fact hangs off — shown when it isn't the page's entity. */
  hostName: string;
  isCenterHost: boolean;
  atomId?: string;
}

const FAMILY_ORDER: (GraphFamily | "other")[] = [...FAMILIES, "other"];

function formatValue(value: unknown, currency?: string): string {
  if (typeof value === "number") {
    if (currency) return `£${value.toLocaleString("en-GB")}`;
    return value.toLocaleString("en-GB");
  }
  if (value === null || value === undefined) return "—";
  return String(value);
}

function contestKey(r: Row): string {
  return `${r.hostName}|${r.predicate}|${r.qualifier ?? ""}`;
}

export default function KnowledgeAtomsTab({
  entityType,
  entityId,
  entityName,
  isProspect,
  onOpenGraph,
}: KnowledgeAtomsTabProps) {
  const colors = useColors();
  const resolveContested = useMutation(api.knowledge.graphQueries.resolveContested);
  const [resolving, setResolving] = useState<string | null>(null);

  const data = useQuery(api.knowledge.graphQueries.expandEntity, {
    entityType,
    entityId,
    includeProspectScoped: isProspect ?? false,
    includeRingAttributes: true,
  });

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const entity = data.entity as { id: string; name: string };
    const out: Row[] = [];

    const edgeProvenance = (p: any): string => {
      const parts: string[] = [];
      if (p.sourceType === "native") parts.push(`native · ${p.ref ?? "structural"}`);
      else {
        parts.push(p.sourceType);
        if (p.observationCount) parts.push(`${p.observationCount} obs`);
      }
      if (p.nativeCorroboration) parts.push(`+native: ${p.nativeCorroboration}`);
      return parts.join(" · ");
    };

    const rawEdges = [...(data.edges as any[]), ...(data.nativeEdges as any[])];
    rawEdges.forEach((e, i) => {
      if (e.other.id === entity.id) return;
      out.push({
        id: `e${i}`,
        kind: "edge",
        family: familyFor(e.predicate),
        predicate: e.predicate,
        line: e.direction === "out" ? `→ ${e.other.name}` : `← ${e.other.name}`,
        qualifier: e.qualifier,
        status: e.status,
        provenance: edgeProvenance(e.provenance),
        hostName: entity.name,
        isCenterHost: true,
        atomId: e.provenance.sourceType !== "native" ? e.provenance.ref : undefined,
      });
    });

    (data.attributes as any[]).forEach((a, i) => {
      out.push({
        id: `a${i}`,
        kind: "attr",
        family: familyFor(a.predicate),
        predicate: a.predicate,
        line: formatValue(a.value, a.currency),
        qualifier: a.qualifier,
        status: a.status,
        provenance: a.native ? `native · ${a.native}` : a.asOf ? `atom · ${a.asOf}` : "atom",
        hostName: entity.name,
        isCenterHost: true,
        atomId: a.atomId,
      });
    });

    const ringAttrs = (data.ringAttributes ?? {}) as Record<string, any[]>;
    for (const rows_ of Object.values(ringAttrs)) {
      rows_.forEach((a) => {
        out.push({
          id: a.atomId,
          kind: "attr",
          family: familyFor(a.predicate),
          predicate: a.predicate,
          line: formatValue(a.value, a.currency),
          qualifier: a.qualifier,
          status: a.status,
          provenance: a.native ? `native · ${a.native}` : a.asOf ? `atom · ${a.asOf}` : "atom",
          hostName: a.subject.name,
          isCenterHost: false,
          atomId: a.atomId,
        });
      });
    }
    return out;
  }, [data]);

  const contestedGroups = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.status !== "contested") continue;
      const arr = groups.get(contestKey(r));
      if (arr) arr.push(r);
      else groups.set(contestKey(r), [r]);
    }
    return [...groups.values()];
  }, [rows]);

  const onKeep = async (r: Row) => {
    if (!r.atomId || resolving) return;
    setResolving(r.id);
    try {
      await resolveContested({ winnerAtomId: r.atomId as Id<"atoms"> });
    } finally {
      setResolving(null);
    }
  };

  if (data === undefined) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: colors.text.dim }}>
        <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: 8 }} /> Loading knowledge…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Network className="w-5 h-5" />}
        title="No knowledge yet"
        body={`Atomic facts appear here as ${entityName}'s documents, notes and filings are ingested and atomized into the knowledge graph.`}
        action={onOpenGraph ? <Button size="sm" variant="ghost" onClick={onOpenGraph}><Network className="w-3.5 h-3.5" /> Open graph</Button> : undefined}
      />
    );
  }

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div>
      {/* Header strip — counts + graph entry */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: colors.text.secondary }}>
          <strong style={{ color: colors.text.primary }}>{activeCount}</strong> facts
        </span>
        {contestedGroups.length > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.accent.red }}>
            {contestedGroups.length} contested
          </span>
        )}
        <span style={{ flex: 1 }} />
        {onOpenGraph && (
          <Button size="sm" variant="ghost" onClick={onOpenGraph} title="Open the interactive knowledge graph">
            <Network className="w-3.5 h-3.5" /> Open graph
          </Button>
        )}
      </div>

      {/* Contested adjudication — pinned, same semantics as the drawer rail */}
      {contestedGroups.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: colors.accent.red, marginBottom: 6 }}>
            Contested — sources disagree
          </div>
          {contestedGroups.map((group, gi) => {
            const head = group[0];
            return (
              <div key={gi} style={{ border: `1px solid ${colors.accent.red}44`, borderRadius: 7, marginBottom: 8, background: colors.bg.card, overflow: "hidden" }}>
                <div style={{ padding: "8px 11px", borderBottom: `1px solid ${colors.border.default}`, fontSize: 12, color: colors.text.primary }}>
                  <span style={{ fontWeight: 600 }}>{head.hostName}</span>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: colors.text.secondary, marginLeft: 7 }}>{head.predicate}</span>
                  {head.qualifier && <span style={{ color: colors.text.dim }}>{`  ·  ${head.qualifier}`}</span>}
                </div>
                {group.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderBottom: `1px solid ${colors.border.default}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: colors.text.primary, wordBreak: "break-word" }}>{r.line}</span>
                      {r.provenance && (
                        <span style={{ display: "block", marginTop: 3, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim }}>{r.provenance}</span>
                      )}
                    </div>
                    {r.atomId && (
                      <button
                        onClick={() => onKeep(r)}
                        disabled={resolving !== null}
                        title="Keep this value — competing values are archived as superseded (reversible; full history kept)."
                        style={{
                          flex: "none", fontSize: 11, fontWeight: 600, color: colors.accent.green,
                          background: "transparent", border: `1px solid ${colors.accent.green}`, borderRadius: 5,
                          padding: "5px 10px", cursor: resolving !== null ? "default" : "pointer",
                          opacity: resolving !== null && resolving !== r.id ? 0.5 : 1, whiteSpace: "nowrap",
                        }}
                      >
                        {resolving === r.id ? "Keeping…" : "Keep this value"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Facts by family — same grouping vocabulary as the drawer rail */}
      {FAMILY_ORDER.map((fam) => {
        const items = rows.filter((r) => r.family === fam && r.status !== "contested");
        if (items.length === 0) return null;
        return (
          <div key={fam} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: colors.text.dim }}>
              <i style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", background: colorForFamily(colors, fam) }} />
              {fam}
              <span style={{ fontWeight: 400, letterSpacing: 0, color: colors.text.dim }}>({items.length})</span>
            </div>
            <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 7, background: colors.bg.card, overflow: "hidden" }}>
              {items.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "10px 13px", borderBottom: `1px solid ${colors.border.default}` }}>
                  <span style={{ flex: "none", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fontWeight: 600, color: colors.text.primary, background: colors.bg.cardAlt, border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: "2px 8px" }}>
                    {r.predicate}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: colors.text.secondary, wordBreak: "break-word" }}>
                    {!r.isCenterHost && <span style={{ fontWeight: 600, color: colors.text.primary }}>{r.hostName}: </span>}
                    {r.line}
                    {r.qualifier && <span style={{ color: colors.text.dim }}>{`  ·  ${r.qualifier}`}</span>}
                  </span>
                  <span style={{ flex: "none", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim, whiteSpace: "nowrap" }}>
                    {r.provenance}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
