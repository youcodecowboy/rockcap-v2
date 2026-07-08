"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { ColorPalette } from "@/lib/colors";
import { colorForDisplayType, displayTypeOf, type AtlasNode } from "./atlasTypes";

// The panel loads the focused entity's atoms with the SAME per-subject query
// the per-client drawer runs (knowledge.graphQueries.expandEntity) instead of
// shipping every statement in the overview payload — the atlas overview stays
// topology-only and the statements load on demand per click.

interface PanelAtom {
  id: string;
  predicate: string;
  statement: string;
  qualifier?: string;
  status: "active" | "contested";
  confidence: number;
  sourceType: string;
}

// expandEntity result slices the panel consumes (subset of the drawer's Raw* shapes).
interface RawEdge {
  predicate: string;
  direction: "out" | "in";
  other: { id: string; name: string };
  qualifier?: string;
  confidence: number;
  status: "active" | "contested";
  provenance: { sourceType: string; ref?: string };
}
interface RawAttr {
  predicate: string;
  value: unknown;
  currency?: string;
  qualifier?: string;
  status: "active" | "contested";
  confidence: number;
  native?: string;
  atomId?: string;
}

function formatValue(a: RawAttr): string {
  if (typeof a.value === "number") {
    if (a.currency) return `£${a.value.toLocaleString("en-GB")}`;
    return a.value.toLocaleString("en-GB");
  }
  if (a.value === null || a.value === undefined) return "—";
  return String(a.value);
}

interface AtlasSidePanelProps {
  node: AtlasNode;
  colors: ColorPalette;
  onClose: () => void;
}

export default function AtlasSidePanel({ node, colors, onClose }: AtlasSidePanelProps) {
  const dt = displayTypeOf(node);
  const c = colorForDisplayType(colors, dt);

  const data = useQuery(api.knowledge.graphQueries.expandEntity, {
    entityType: node.type,
    entityId: node.id,
    includeProspectScoped: true,
  });

  const atoms = useMemo<PanelAtom[]>(() => {
    if (!data) return [];
    const out: PanelAtom[] = [];
    const rawEdges = [...(data.edges as RawEdge[]), ...(data.nativeEdges as RawEdge[])];
    rawEdges.forEach((e, i) => {
      out.push({
        id: `e${i}`,
        predicate: e.predicate,
        statement: e.direction === "out" ? `→ ${e.other.name}` : `← ${e.other.name}`,
        qualifier: e.qualifier,
        status: e.status,
        confidence: e.confidence,
        sourceType: e.provenance.sourceType,
      });
    });
    (data.attributes as RawAttr[]).forEach((a, i) => {
      out.push({
        id: a.atomId ?? `a${i}`,
        predicate: a.predicate,
        statement: formatValue(a),
        qualifier: a.qualifier,
        status: a.status,
        confidence: a.confidence,
        sourceType: a.native ? "native" : "atom",
      });
    });
    return out;
  }, [data]);

  const contested = atoms.filter((a) => a.status === "contested");
  const active = atoms.filter((a) => a.status === "active");

  // Owning-client link: a client node links to its own page; anything scoped
  // to a client links to the owner's page.
  const clientHref =
    node.type === "client"
      ? node.clientStatus === "prospect"
        ? `/prospects/${node.id}`
        : `/clients/${node.id}`
      : node.ownerClientId
        ? `/clients/${node.ownerClientId}`
        : null;

  const row = (a: PanelAtom) => (
    <div key={a.id} style={{ borderTop: `1px solid ${colors.border.default}`, padding: "9px 0", fontSize: 12.5, color: colors.text.secondary }}>
      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10.5, color: colors.text.muted, display: "block", marginBottom: 2 }}>
        {a.predicate}{" "}
        <span style={{ color: a.status === "contested" ? colors.accent.red : colors.accent.green }}>
          {a.status}
        </span>
      </span>
      {a.statement}
      {a.qualifier ? <span style={{ color: colors.text.dim }}>{`  ·  ${a.qualifier}`}</span> : null}
      <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim, display: "block", marginTop: 4 }}>
        {a.sourceType} · {Math.round(a.confidence * 100)}%
      </span>
    </div>
  );

  const section = (title: string, tone: string, items: PanelAtom[]) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: tone, marginBottom: 4 }}>
        {title} ({items.length})
      </div>
      {items.map(row)}
    </div>
  );

  return (
    <aside
      role="complementary"
      aria-label={`Atoms for ${node.name}`}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        display: "flex",
        flexDirection: "column",
        background: colors.bg.card,
        borderLeft: `1px solid ${colors.border.mid}`,
        boxShadow: "-18px 0 50px rgba(0,0,0,.45)",
        zIndex: 4,
      }}
    >
      {/* header */}
      <div style={{ padding: "14px 18px 12px", borderBottom: `1px solid ${colors.border.default}`, flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", background: c, flex: "none" }} />
          <h3 style={{ margin: 0, fontSize: 14.5, color: colors.text.primary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {node.name}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close panel"
            style={{ background: "none", border: "none", color: colors.text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px solid ${c}`,
              color: c,
            }}
          >
            {dt}
          </span>
          <span style={{ color: colors.text.muted, fontSize: 11.5 }}>
            {node.atomCount} atom{node.atomCount === 1 ? "" : "s"}
            {node.contestedCount > 0 ? ` · ${node.contestedCount} contested` : ""} · {node.degree} link{node.degree === 1 ? "" : "s"}
          </span>
        </div>
        {clientHref && (
          <Link
            href={clientHref}
            style={{
              display: "inline-block",
              marginTop: 10,
              background: colors.bg.cardAlt,
              color: colors.text.secondary,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 5,
              padding: "5px 11px",
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            {node.type === "client"
              ? node.clientStatus === "prospect"
                ? "Prospect page ↗"
                : "Client page ↗"
              : "Owning client ↗"}
          </Link>
        )}
      </div>

      {/* atoms, grouped contested-first */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 18px" }}>
        {data === undefined ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: colors.text.dim }} />
          </div>
        ) : atoms.length === 0 ? (
          <div style={{ padding: "18px 0", fontSize: 12.5, color: colors.text.muted }}>
            No knowledge atoms yet for this {dt}. As documents are filed and analysed, extracted facts will appear here.
          </div>
        ) : (
          <>
            {contested.length > 0 && section("Contested", colors.accent.red, contested)}
            {section("Active", colors.text.muted, active)}
          </>
        )}
      </div>
    </aside>
  );
}
