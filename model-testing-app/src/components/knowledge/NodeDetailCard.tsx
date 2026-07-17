"use client";

import { useColors } from "@/lib/useColors";
import { colorForType } from "./graphVocab";
import type { GraphNodeVM, AtomLineVM } from "./types";

interface NodeDetailCardProps {
  node: GraphNodeVM;
  atoms: AtomLineVM[];
  edgeCount: number;
  onExplore: (node: GraphNodeVM) => void;
  onClose: () => void;
}

export default function NodeDetailCard({ node, atoms, edgeCount, onExplore, onClose }: NodeDetailCardProps) {
  const colors = useColors();
  const c = colorForType(colors, node.type);

  return (
    <aside
      style={{
        position: "absolute",
        right: 14,
        bottom: 14,
        width: 360,
        maxHeight: "56%",
        overflowY: "auto",
        background: colors.bg.card,
        border: `1px solid ${colors.border.mid}`,
        borderRadius: 8,
        padding: "16px 18px",
        boxShadow: "0 12px 40px rgba(0,0,0,.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        <i style={{ width: 10, height: 10, borderRadius: "50%", display: "inline-block", background: c, flex: "none" }} />
        <h3 style={{ margin: 0, fontSize: 14.5, color: colors.text.primary, flex: 1 }}>{node.name}</h3>
        <button
          onClick={onClose}
          aria-label="Close detail"
          style={{ background: "none", border: "none", color: colors.text.muted, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={{ color: colors.text.muted, fontSize: 11.5, marginBottom: 10 }}>
        {(node.sub || node.type)} · {atoms.length} atom{atoms.length === 1 ? "" : "s"} · {edgeCount} edge{edgeCount === 1 ? "" : "s"}
      </div>

      {atoms.length === 0 ? (
        <div style={{ borderTop: `1px solid ${colors.border.default}`, padding: "9px 0", fontSize: 12.5, color: colors.text.secondary }}>
          No atoms touch this node in the current view.
        </div>
      ) : (
        atoms.map((a) => (
          <div key={a.id} style={{ borderTop: `1px solid ${colors.border.default}`, padding: "9px 0", fontSize: 12.5, color: colors.text.secondary }}>
            <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10.5, color: colors.text.muted, display: "block", marginBottom: 2 }}>
              {a.predicate}{" "}
              <span style={{ color: a.status === "contested" ? colors.accent.red : colors.accent.green }}>
                {a.status === "contested" ? "contested" : "active"}
              </span>
            </span>
            {a.line}
            {a.qualifier ? <span style={{ color: colors.text.dim }}>{`  ·  ${a.qualifier}`}</span> : null}
            {a.provenance && (
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim, display: "block", marginTop: 4 }}>
                {a.provenance}
              </span>
            )}
          </div>
        ))
      )}

      {!node.isCenter && (
        <button
          onClick={() => onExplore(node)}
          style={{
            marginTop: 12,
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 500,
            color: "#ffffff",
            background: c,
            border: `1px solid ${c}`,
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Explore →
        </button>
      )}
    </aside>
  );
}
