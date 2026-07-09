"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Loader2, Search } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { DARK } from "@/lib/colors";
import { EmptyState } from "@/components/layouts";
import AtlasCanvas, { type AtlasHover } from "./AtlasCanvas";
import AtlasSidePanel from "./AtlasSidePanel";
import {
  ATLAS_DISPLAY_TYPES,
  colorForDisplayType,
  displayTypeOf,
  type AtlasDisplayType,
  type AtlasNode,
  type AtlasOverview,
} from "./atlasTypes";

// The atlas board is a committed dark surface in both app themes — the same
// deliberate choice the Sidebar makes for its chrome. All tokens come from the
// canonical DARK palette so it stays in the app's design system.
const colors = DARK;

/** Matches the server's SNAPSHOT_TTL_MS — younger snapshots render without a
 * refresh kick (the server would decline the rebuild anyway). */
const SNAPSHOT_TTL_MS = 5 * 60_000;

export default function AtlasView() {
  // The overview is served from a cached snapshot (the org-wide walk outgrew
  // a single query execution — see convex/knowledge/graphOverview.ts). The
  // query is reactive: it returns the cached board instantly, and when the
  // refresh action lands a rebuild, the new snapshot swaps in on its own.
  const snap = useQuery(api.knowledge.graphOverview.snapshot, {});
  const refreshAtlas = useAction(api.knowledge.graphOverview.refresh);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  // One kick per observed builtAt — never a refresh loop.
  const kickedForRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (snap === undefined || snap.building) return;
    const stale = snap.builtAt === null || Date.now() - snap.builtAt > SNAPSHOT_TTL_MS;
    if (!stale || kickedForRef.current === snap.builtAt) return;
    kickedForRef.current = snap.builtAt;
    refreshAtlas({}).catch((e: unknown) => {
      setRefreshError(e instanceof Error ? e.message : String(e));
    });
  }, [snap, refreshAtlas]);

  const data = (snap?.overview ?? undefined) as AtlasOverview | undefined;

  const [excluded, setExcluded] = useState<Set<AtlasDisplayType>>(new Set());
  const [contestedOnly, setContestedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ key: string; nonce: number } | null>(null);
  const [hover, setHover] = useState<AtlasHover | null>(null);
  const flyNonceRef = useRef(0);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Esc clears focus (and an open search dropdown first).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSearchOpen(false);
      setFocusKey(null);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // ── view filtering (true views, drawer rule: filtered = removed, not dimmed) ──
  // Contested-only keeps contested edges + every node that carries a contested
  // atom or touches a contested edge. Type chips then exclude display types;
  // edges need both surviving endpoints.
  const { viewNodes, viewEdges, chipCounts } = useMemo(() => {
    if (!data) {
      return { viewNodes: [] as AtlasNode[], viewEdges: [], chipCounts: new Map<AtlasDisplayType, number>() };
    }
    let nodes = data.nodes;
    let edges = data.edges;
    if (contestedOnly) {
      edges = edges.filter((e) => e.status === "contested");
      const keep = new Set<string>();
      for (const e of edges) {
        keep.add(e.from);
        keep.add(e.to);
      }
      nodes = nodes.filter((n) => n.contestedCount > 0 || keep.has(n.key));
    }
    // Chip counts are live against the contested filter but ignore the type
    // exclusions themselves (a chip must keep showing what toggling it back
    // would restore).
    const counts = new Map<AtlasDisplayType, number>();
    for (const n of nodes) {
      const t = displayTypeOf(n);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    if (excluded.size) {
      nodes = nodes.filter((n) => !excluded.has(displayTypeOf(n)));
    }
    const alive = new Set(nodes.map((n) => n.key));
    // Also drop any edge whose endpoint the server didn't include in nodes —
    // defensive against overview truncation on the backend side.
    edges = edges.filter((e) => alive.has(e.from) && alive.has(e.to));
    return { viewNodes: nodes, viewEdges: edges, chipCounts: counts };
  }, [data, contestedOnly, excluded]);

  const byKey = useMemo(() => {
    const m = new Map<string, AtlasNode>();
    for (const n of viewNodes) m.set(n.key, n);
    return m;
  }, [viewNodes]);

  // Drop a focus that the filters removed.
  useEffect(() => {
    if (focusKey && !byKey.has(focusKey)) setFocusKey(null);
  }, [focusKey, byKey]);

  // Focus spotlight: the 1–2 hop neighborhood of the focused node (BFS depth 2).
  const spotlightKeys = useMemo(() => {
    if (!focusKey) return null;
    const adj = new Map<string, string[]>();
    for (const e of viewEdges) {
      (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
      (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
    }
    const lit = new Set<string>([focusKey]);
    let frontier = [focusKey];
    for (let hop = 0; hop < 2; hop++) {
      const next: string[] = [];
      for (const k of frontier) {
        for (const nb of adj.get(k) ?? []) {
          if (!lit.has(nb)) {
            lit.add(nb);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    return lit;
  }, [focusKey, viewEdges]);

  // ── search ──
  const searchLc = search.trim().toLowerCase();
  const searchMatchKeys = useMemo(() => {
    const s = new Set<string>();
    if (!searchLc) return s;
    for (const n of viewNodes) if (n.name.toLowerCase().includes(searchLc)) s.add(n.key);
    return s;
  }, [viewNodes, searchLc]);

  const searchResults = useMemo(() => {
    if (!searchLc) return [];
    const hits = viewNodes.filter((n) => n.name.toLowerCase().includes(searchLc));
    // Prefix matches first, then by degree (hubs are the likely target).
    hits.sort((a, b) => {
      const ap = a.name.toLowerCase().startsWith(searchLc) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(searchLc) ? 0 : 1;
      return ap - bp || b.degree - a.degree;
    });
    return hits.slice(0, 8);
  }, [viewNodes, searchLc]);

  const flyToNode = useCallback((key: string) => {
    flyNonceRef.current += 1;
    setFlyTo({ key, nonce: flyNonceRef.current });
    setFocusKey(key);
    setSearchOpen(false);
  }, []);

  const toggleType = useCallback((t: AtlasDisplayType) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const focusNode = focusKey ? byKey.get(focusKey) ?? null : null;
  const contestedInView = useMemo(
    () => viewNodes.reduce((acc, n) => acc + (n.contestedCount > 0 ? 1 : 0), 0),
    [viewNodes],
  );

  // ── chrome ──
  const chip = (t: AtlasDisplayType) => {
    const on = !excluded.has(t);
    const count = chipCounts.get(t) ?? 0;
    const hue = colorForDisplayType(colors, t);
    return (
      <button
        key={t}
        onClick={() => toggleType(t)}
        title={on ? `Hide ${t} nodes` : `Show ${t} nodes`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: `1px solid ${on ? hue : colors.border.default}`,
          background: on ? `${hue}18` : "transparent",
          color: on ? colors.text.primary : colors.text.dim,
          borderRadius: 999,
          padding: "3px 11px",
          fontSize: 11.5,
          cursor: "pointer",
          textTransform: "capitalize",
          whiteSpace: "nowrap",
        }}
      >
        <i style={{ width: 7, height: 7, borderRadius: "50%", background: on ? hue : colors.text.dim, display: "inline-block" }} />
        {t}
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: on ? colors.text.muted : colors.text.dim }}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: colors.bg.base }}>
      {/* top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderBottom: `1px solid ${colors.border.default}`,
          flex: "none",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 650, margin: 0, letterSpacing: "-.01em", color: colors.text.primary, whiteSpace: "nowrap" }}>
          Knowledge Atlas
        </h1>

        {/* search-as-you-type — flies the camera to a match */}
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: colors.text.muted }} />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length) flyToNode(searchResults[0].key);
            }}
            placeholder="Search entities…"
            style={{
              width: 240,
              background: colors.bg.card,
              border: `1px solid ${colors.border.default}`,
              borderRadius: 5,
              padding: "6px 10px 6px 28px",
              color: colors.text.primary,
              fontSize: 12.5,
            }}
          />
          {searchOpen && searchResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 5px)",
                left: 0,
                width: 300,
                background: colors.bg.card,
                border: `1px solid ${colors.border.mid}`,
                borderRadius: 6,
                boxShadow: "0 12px 40px rgba(0,0,0,.5)",
                zIndex: 20,
                overflow: "hidden",
              }}
            >
              {searchResults.map((n) => {
                const t = displayTypeOf(n);
                return (
                  <button
                    key={n.key}
                    onMouseDown={(e) => e.preventDefault() /* keep input focus until the click lands */}
                    onClick={() => flyToNode(n.key)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 12px",
                      background: "transparent",
                      border: "none",
                      borderTop: `1px solid ${colors.border.default}`,
                      color: colors.text.primary,
                      fontSize: 12.5,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <i style={{ width: 8, height: 8, borderRadius: "50%", background: colorForDisplayType(colors, t), flex: "none" }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.name}</span>
                    <span style={{ fontSize: 10, color: colors.text.dim, textTransform: "capitalize" }}>{t}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* entity-type chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{ATLAS_DISPLAY_TYPES.map(chip)}</div>

        {/* contested-only toggle — same idiom as the drawer's prospect-intel chip */}
        <button
          onClick={() => setContestedOnly((on) => !on)}
          title={contestedOnly ? "Showing contested knowledge only — click to show everything" : "Show only contested knowledge"}
          style={{
            border: `1px solid ${contestedOnly ? colors.accent.red : colors.border.default}`,
            background: contestedOnly ? `${colors.accent.red}18` : "transparent",
            color: contestedOnly ? colors.accent.red : colors.text.muted,
            borderRadius: 999,
            padding: "3px 11px",
            fontSize: 11.5,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Contested only{data?.counts.contested ? ` (${data.counts.contested})` : ""}
        </button>

        {/* stats line */}
        <span
          style={{
            marginLeft: "auto",
            color: colors.text.dim,
            fontSize: 11.5,
            fontFamily: "ui-monospace, Menlo, monospace",
            whiteSpace: "nowrap",
          }}
          title="Entities and edges currently on the board · atoms and contested counts are org-wide"
        >
          {data
            ? `${viewNodes.length} entities · ${viewEdges.length} edges · ${data.counts.atoms} atoms · ${data.counts.contested} contested${contestedInView && !contestedOnly ? ` (${contestedInView} nodes)` : ""}${snap?.building ? " · refreshing…" : ""}`
            : "loading…"}
        </span>
        {data?.counts.truncated && (
          <span
            title="The overview hit its server cap — some nodes/edges are not shown"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: colors.accent.yellow,
              border: `1px solid ${colors.accent.yellow}`,
              borderRadius: 999,
              padding: "2px 9px",
              whiteSpace: "nowrap",
            }}
          >
            truncated
          </span>
        )}
      </div>

      {/* board */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {data === undefined && refreshError ? (
          // No cached snapshot AND the first build failed — surface it
          // instead of spinning forever (a stale cached board still renders).
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
            <EmptyState
              title="Atlas build failed"
              body={`The snapshot rebuild errored: ${refreshError} — check the Convex logs for knowledge/graphOverview.`}
            />
          </div>
        ) : data === undefined ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center" }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: colors.text.dim }} />
            {snap !== undefined && (
              // Query answered but no snapshot exists yet — the first build
              // is assembling the graph in the background.
              <span style={{ fontSize: 12, color: colors.text.dim }}>Assembling the atlas…</span>
            )}
          </div>
        ) : data.counts.nodes === 0 ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
            <EmptyState
              title="No knowledge atoms yet"
              body="As documents are filed and analysed, the org-wide knowledge graph will grow here — clients, lenders, projects, people and the facts that connect them."
            />
          </div>
        ) : (
          <>
            <AtlasCanvas
              nodes={viewNodes}
              edges={viewEdges}
              focusKey={focusKey}
              spotlightKeys={spotlightKeys}
              searchMatchKeys={searchMatchKeys}
              flyTo={flyTo}
              reducedMotion={reducedMotion}
              colors={colors}
              onFocus={setFocusKey}
              onHover={setHover}
            />

            {/* hover card — static anchor captured at hover start (drawer behaviour) */}
            {hover && hover.node.key !== focusKey && (() => {
              const t = displayTypeOf(hover.node);
              const hue = colorForDisplayType(colors, t);
              const CARD_W = 240;
              const flipX = hover.x + 16 + CARD_W > (typeof window !== "undefined" ? window.innerWidth : 1600) - 80;
              return (
                <div
                  style={{
                    position: "absolute",
                    left: flipX ? hover.x - 16 : hover.x + 16,
                    top: hover.y + 14,
                    transform: flipX ? "translateX(-100%)" : undefined,
                    maxWidth: CARD_W,
                    pointerEvents: "none",
                    background: colors.bg.card,
                    border: `1px solid ${colors.border.mid}`,
                    borderRadius: 8,
                    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
                    padding: "10px 13px",
                    zIndex: 5,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                    <i style={{ width: 9, height: 9, borderRadius: "50%", background: hue, flex: "none" }} />
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: colors.text.primary, wordBreak: "break-word" }}>
                      {hover.node.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: colors.text.muted }}>
                    <span style={{ textTransform: "capitalize", color: hue }}>{t}</span>
                    {" · "}
                    {hover.node.atomCount} atom{hover.node.atomCount === 1 ? "" : "s"}
                    {hover.node.contestedCount > 0 && (
                      <span style={{ color: colors.accent.red }}>{` · ${hover.node.contestedCount} contested`}</span>
                    )}
                    {` · ${hover.node.degree} link${hover.node.degree === 1 ? "" : "s"}`}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10.5, color: colors.text.dim }}>click to focus</div>
                </div>
              );
            })()}

            {focusNode && <AtlasSidePanel node={focusNode} colors={colors} onClose={() => setFocusKey(null)} />}
          </>
        )}
      </div>
    </div>
  );
}
