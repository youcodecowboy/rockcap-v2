"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import { FAMILIES, colorForFamily } from "./graphVocab";
import type { GraphFamily } from "./graphVocab";
import type { AtomLineVM } from "./types";
import type { Id } from "../../../convex/_generated/dataModel";

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

/** Group key for a contested identity: same host + predicate + qualifier is
 * one contest (the competing values). */
function contestKey(a: AtomLineVM): string {
  return `${a.nodeIds.join(",")}|${a.predicate}|${a.qualifier ?? ""}`;
}

export default function AtomRail({
  atoms,
  visibleIds,
  selectedNodeName,
  selectedAtomId,
  onClearFilter,
  onAtomSelect,
}: AtomRailProps) {
  const colors = useColors();
  const resolveContested = useMutation(api.knowledge.graphQueries.resolveContested);
  const [resolving, setResolving] = useState<string | null>(null);

  // Scroll the selected atom's row into view — e.g. after a satellite click on
  // the canvas selects an atom that may be far down the rail.
  const selRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selectedAtomId && selRef.current) {
      selRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [selectedAtomId]);

  // Contested groups — competing values of one fact, pinned at the top of the
  // rail for operator adjudication. Grouped by identity (host + predicate +
  // qualifier); shown regardless of the search/selection filters (hygiene lane).
  const contestedGroups = useMemo(() => {
    const groups = new Map<string, AtomLineVM[]>();
    for (const a of atoms) {
      if (a.status !== "contested") continue;
      const key = contestKey(a);
      const arr = groups.get(key);
      if (arr) arr.push(a);
      else groups.set(key, [a]);
    }
    return [...groups.values()];
  }, [atoms]);

  const onKeep = async (a: AtomLineVM) => {
    if (!a.atomId || resolving) return;
    setResolving(a.id);
    try {
      await resolveContested({ winnerAtomId: a.atomId as Id<"atoms"> });
    } finally {
      setResolving(null);
    }
  };

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
      {contestedGroups.length > 0 && (
        <div style={{ borderBottom: `1px solid ${colors.border.mid}`, paddingBottom: 6 }}>
          <div
            style={{
              padding: "16px 18px 8px",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".13em",
              textTransform: "uppercase",
              color: colors.accent.red,
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            <i style={{ width: 8, height: 8, borderRadius: 2, display: "inline-block", background: colors.accent.red }} />
            Contested
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                fontWeight: 700,
                color: colors.accent.red,
                background: `${colors.accent.red}1a`,
                borderRadius: 999,
                padding: "1px 8px",
                letterSpacing: 0,
              }}
            >
              {contestedGroups.length}
            </span>
          </div>
          <div style={{ padding: "0 14px 4px", fontSize: 11, color: colors.text.dim, lineHeight: 1.5 }}>
            Sources disagree. Pick the correct value — the others are archived (kept with full history).
          </div>
          {contestedGroups.map((group, gi) => {
            const head = group[0];
            return (
              <div
                key={`contest-${gi}`}
                style={{
                  margin: "8px 14px",
                  border: `1px solid ${colors.accent.red}44`,
                  borderRadius: 7,
                  overflow: "hidden",
                  background: colors.bg.card,
                }}
              >
                <div
                  style={{
                    padding: "8px 11px",
                    borderBottom: `1px solid ${colors.border.default}`,
                    fontSize: 12,
                    color: colors.text.primary,
                  }}
                >
                  {head.hostName && <span style={{ fontWeight: 600 }}>{head.hostName}</span>}
                  <span
                    style={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 11,
                      color: colors.text.secondary,
                      marginLeft: head.hostName ? 7 : 0,
                    }}
                  >
                    {head.predicate}
                  </span>
                  {head.qualifier && <span style={{ color: colors.text.dim }}>{`  ·  ${head.qualifier}`}</span>}
                </div>
                {group.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "9px 11px",
                      borderBottom: `1px solid ${colors.border.default}`,
                    }}
                  >
                    <button
                      onClick={() => onAtomSelect(a)}
                      style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: colors.text.primary, wordBreak: "break-word" }}>
                        {a.line}
                      </span>
                      {a.provenance && (
                        <span style={{ display: "block", marginTop: 3, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim }}>
                          {a.provenance}
                        </span>
                      )}
                    </button>
                    {a.atomId ? (
                      <button
                        onClick={() => onKeep(a)}
                        disabled={resolving !== null}
                        title="Keep this value — the competing values are archived as superseded (reversible; full history is kept)."
                        style={{
                          flex: "none",
                          fontSize: 11,
                          fontWeight: 600,
                          color: colors.accent.green,
                          background: "transparent",
                          border: `1px solid ${colors.accent.green}`,
                          borderRadius: 5,
                          padding: "5px 10px",
                          cursor: resolving !== null ? "default" : "pointer",
                          opacity: resolving !== null && resolving !== a.id ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {resolving === a.id ? "Keeping…" : "Keep this value"}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

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
