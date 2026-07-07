"use client";

import { useEffect, useRef } from "react";
import { useColors } from "@/lib/useColors";
import { FAMILIES, colorForFamily } from "./graphVocab";
import type { GraphFamily } from "./graphVocab";
import type { AtomLineVM } from "./types";

interface AtomRailProps {
  atoms: AtomLineVM[];
  /** Atom ids passing the current search + family + selected-node filters. */
  visibleIds: Set<string>;
  selectedNodeName: string | null;
  selectedAtomId: string | null;
  onClearFilter: () => void;
  onAtomSelect: (atom: AtomLineVM) => void;
}

const ORDER: GraphFamily[] = [...FAMILIES, "other"];

export default function AtomRail({
  atoms,
  visibleIds,
  selectedNodeName,
  selectedAtomId,
  onClearFilter,
  onAtomSelect,
}: AtomRailProps) {
  const colors = useColors();

  // Scroll the selected atom's row into view — e.g. after a satellite click on
  // the canvas selects an atom that may be far down the rail.
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selectedAtomId && selRef.current) {
      selRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedAtomId]);

  return (
    <nav
      aria-label="Atoms"
      style={{
        width: 336,
        flex: "none",
        borderRight: `1px solid ${colors.border.default}`,
        overflowY: "auto",
        padding: "6px 0 34px",
      }}
    >
      {selectedNodeName && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "12px 14px 4px",
            padding: "9px 12px",
            border: `1px solid ${colors.border.mid}`,
            borderRadius: 6,
            background: colors.bg.card,
            fontSize: 12,
            color: colors.text.primary,
          }}
        >
          <span style={{ flex: 1, fontWeight: 600 }}>Atoms linked to {selectedNodeName}</span>
          <button
            onClick={onClearFilter}
            style={{ background: "none", border: "none", color: colors.text.muted, cursor: "pointer", fontSize: 11, padding: "2px 4px" }}
          >
            ✕ clear
          </button>
        </div>
      )}

      {ORDER.map((fam) => {
        const items = atoms.filter((a) => a.family === fam && visibleIds.has(a.id));
        if (items.length === 0) return null;
        return (
          <div key={fam}>
            <div
              style={{
                padding: "20px 18px 8px",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: ".13em",
                textTransform: "uppercase",
                color: colors.text.dim,
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <i style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", background: colorForFamily(colors, fam) }} />
              {fam}
            </div>
            {items.map((a) => {
              const sel = a.id === selectedAtomId;
              const contested = a.status === "contested";
              return (
                <button
                  key={a.id}
                  ref={sel ? selRef : undefined}
                  onClick={() => onAtomSelect(a)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: sel ? colors.bg.card : "none",
                    border: "none",
                    borderBottom: `1px solid ${colors.border.default}`,
                    borderLeft: `2px solid ${sel ? colors.accent.blue : "transparent"}`,
                    color: sel ? colors.text.primary : colors.text.secondary,
                    padding: "12px 18px 13px",
                    cursor: "pointer",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                  }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = colors.bg.card; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <span
                      style={{
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontSize: 11,
                        fontWeight: 600,
                        color: colors.text.primary,
                        background: colors.bg.cardAlt,
                        border: `1px solid ${colors.border.default}`,
                        borderRadius: 4,
                        padding: "2px 8px",
                      }}
                    >
                      {a.predicate}
                    </span>
                    <span
                      title={
                        contested
                          ? "Sources disagree on this fact — the graph keeps every version with its provenance instead of silently picking one. Click for the competing values."
                          : "Current per the most authoritative, most recent source."
                      }
                      style={{
                        marginLeft: "auto",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: ".08em",
                        cursor: "help",
                        color: contested ? colors.accent.red : colors.accent.green,
                      }}
                    >
                      {contested ? "CONTESTED" : "ACTIVE"}
                    </span>
                  </span>
                  <span style={{ display: "block", color: colors.text.muted }}>
                    {a.line}
                    {a.qualifier ? <span style={{ color: colors.text.dim }}>{`  ·  ${a.qualifier}`}</span> : null}
                  </span>
                  {a.provenance && (
                    <span style={{ display: "block", marginTop: 4, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim }}>
                      {a.provenance}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
