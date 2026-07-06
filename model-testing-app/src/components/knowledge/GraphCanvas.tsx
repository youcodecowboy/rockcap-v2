"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useColors } from "@/lib/useColors";
import { NODE_RADIUS, colorForType } from "./graphVocab";
import type { GraphEdgeVM, GraphNodeVM } from "./types";
import type { GraphFamily } from "./graphVocab";

interface Sim {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
  ph2: number;
}

interface GraphCanvasProps {
  nodes: GraphNodeVM[];
  edges: GraphEdgeVM[];
  centerId: string;
  selectedId: string | null;
  searchMatchIds: Set<string>;
  activeFamily: GraphFamily | "all";
  reducedMotion: boolean;
  /** counts.truncated fan-out overflow — rendered as a "+N more" badge on the center. */
  truncatedMore: number;
  onSelect: (id: string | null) => void;
}

// Ported physics constants (mmh-knowledge-graph.html prototype). The graph
// settles fully; "alive" is slow render-time drift, not jitter.
const REPULSE = 9200;
const REPULSE_RANGE = 440;
const SPRING_REST = 190;
const SPRING_K = 0.032;
const CENTER_PULL = 0.006;
const DAMP = 0.86;
const ALPHA_DECAY = 0.0035;

export default function GraphCanvas({
  nodes,
  edges,
  centerId,
  selectedId,
  searchMatchIds,
  activeFamily,
  reducedMotion,
  truncatedMore,
  onSelect,
}: GraphCanvasProps) {
  const colors = useColors();
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);

  // Mutable simulation state (kept out of React render to avoid re-render churn).
  const simRef = useRef<Map<string, Sim>>(new Map());
  const nodeElRef = useRef<Map<string, SVGGElement | null>>(new Map());
  const lineElRef = useRef<Map<string, SVGLineElement | null>>(new Map());
  const labelElRef = useRef<Map<string, SVGTextElement | null>>(new Map());
  const alphaRef = useRef(1);
  const dragIdRef = useRef<string | null>(null);

  // Viewport transform.
  const viewRef = useRef({ vw: 0, vh: 0, tx: 0, ty: 0, k: 1 });
  const panRef = useRef({ on: false, px: 0, py: 0 });

  const [hoverId, setHoverId] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, GraphNodeVM>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Adjacency for hover-neighborhood highlight.
  const neighbors = useCallback(
    (id: string): Set<string> => {
      const s = new Set<string>();
      for (const e of edges) {
        if (e.aId === id) s.add(e.bId);
        else if (e.bId === id) s.add(e.aId);
      }
      return s;
    },
    [edges],
  );

  const applyView = useCallback(() => {
    const { tx, ty, k } = viewRef.current;
    worldRef.current?.setAttribute("transform", `translate(${tx},${ty}) scale(${k})`);
  }, []);

  const size = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const v = viewRef.current;
    v.vw = stage.clientWidth;
    v.vh = stage.clientHeight;
    v.tx = v.vw / 2;
    v.ty = v.vh / 2 - 20;
    applyView();
  }, [applyView]);

  // Reseed the simulation whenever the node set / center changes (pivot): the
  // center sits at the origin, the ring is seeded in a circle for a clean settle.
  const nodeSig = useMemo(() => `${centerId}|${nodes.map((n) => n.id).join(",")}`, [centerId, nodes]);
  useEffect(() => {
    const others = nodes.filter((n) => n.id !== centerId);
    const next = new Map<string, Sim>();
    others.forEach((n, i) => {
      const ang = (i / Math.max(others.length, 1)) * Math.PI * 2;
      const rad = 190 + (i % 3) * 34;
      next.set(n.id, {
        x: Math.cos(ang) * rad + (Math.random() - 0.5) * 30,
        y: Math.sin(ang) * rad + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        ph: Math.random() * 6.28,
        ph2: Math.random() * 6.28,
      });
    });
    next.set(centerId, { x: 0, y: 0, vx: 0, vy: 0, ph: Math.random() * 6.28, ph2: Math.random() * 6.28 });
    simRef.current = next;
    alphaRef.current = 1;
  }, [nodeSig, centerId, nodes]);

  // Simulation + render loop.
  useEffect(() => {
    size();
    let raf = 0;
    const ambient = !reducedMotion;

    const step = () => {
      const sim = simRef.current;
      const act = nodes.map((n) => ({ n, s: sim.get(n.id)! })).filter((x) => x.s);
      const alpha = alphaRef.current;
      // Repulsion.
      for (let i = 0; i < act.length; i++) {
        for (let j = i + 1; j < act.length; j++) {
          const a = act[i].s;
          const b = act[j].s;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const d2 = dx * dx + dy * dy || 1;
          if (d2 < REPULSE_RANGE * REPULSE_RANGE) {
            const f = REPULSE / d2;
            const d = Math.sqrt(d2);
            dx /= d;
            dy /= d;
            a.vx -= dx * f;
            a.vy -= dy * f;
            b.vx += dx * f;
            b.vy += dy * f;
          }
        }
      }
      // Springs.
      for (const e of edges) {
        const a = sim.get(e.aId);
        const b = sim.get(e.bId);
        if (!a || !b) continue;
        const na = byId.get(e.aId);
        const nb = byId.get(e.bId);
        const rest = SPRING_REST + (NODE_RADIUS[na?.type ?? "contact"] + NODE_RADIUS[nb?.type ?? "contact"]);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - rest) * SPRING_K;
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      // Center pull + integrate.
      for (const { n, s } of act) {
        s.vx -= s.x * CENTER_PULL;
        s.vy -= s.y * CENTER_PULL;
        if (n.id === dragIdRef.current || n.id === centerId) {
          // Pin the center at origin; a dragged node follows the pointer.
          if (n.id === centerId && n.id !== dragIdRef.current) {
            s.x = 0;
            s.y = 0;
          }
          s.vx = 0;
          s.vy = 0;
          continue;
        }
        s.vx *= DAMP;
        s.vy *= DAMP;
        s.x += s.vx * alpha;
        s.y += s.vy * alpha;
      }
      alphaRef.current = Math.max(0, alpha - ALPHA_DECAY);
    };

    const drift = (s: Sim, t: number): [number, number] => {
      if (!ambient) return [s.x, s.y];
      return [s.x + Math.sin(t * 0.00034 + s.ph) * 3, s.y + Math.cos(t * 0.00027 + s.ph2) * 3];
    };

    const draw = () => {
      const sim = simRef.current;
      const t = performance.now();
      const P: Record<string, [number, number]> = {};
      for (const n of nodes) {
        const s = sim.get(n.id);
        if (!s) continue;
        const p = drift(s, t);
        P[n.id] = p;
        nodeElRef.current.get(n.id)?.setAttribute("transform", `translate(${p[0]},${p[1]})`);
      }
      for (const e of edges) {
        const pa = P[e.aId];
        const pb = P[e.bId];
        if (!pa || !pb) continue;
        const line = lineElRef.current.get(e.id);
        if (line) {
          line.setAttribute("x1", String(pa[0]));
          line.setAttribute("y1", String(pa[1]));
          line.setAttribute("x2", String(pb[0]));
          line.setAttribute("y2", String(pb[1]));
        }
        const label = labelElRef.current.get(e.id);
        if (label) {
          label.setAttribute("x", String((pa[0] + pb[0]) / 2));
          label.setAttribute("y", String((pa[1] + pb[1]) / 2 - 4));
        }
      }
    };

    const loop = () => {
      step();
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => size();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [nodes, edges, byId, centerId, reducedMotion, size]);

  // ── pan / zoom / drag ──
  const onWheel = useCallback(
    (ev: React.WheelEvent) => {
      ev.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const v = viewRef.current;
      const nk = Math.min(2.6, Math.max(0.35, v.k * (ev.deltaY < 0 ? 1.12 : 0.89)));
      const rect = svg.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      v.tx = mx - ((mx - v.tx) * nk) / v.k;
      v.ty = my - ((my - v.ty) * nk) / v.k;
      v.k = nk;
      applyView();
    },
    [applyView],
  );

  const onPointerDownBg = useCallback((ev: React.PointerEvent) => {
    panRef.current = { on: true, px: ev.clientX, py: ev.clientY };
    svgRef.current?.setPointerCapture(ev.pointerId);
  }, []);

  const onPointerMove = useCallback((ev: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const v = viewRef.current;
    if (dragIdRef.current) {
      const rect = svg.getBoundingClientRect();
      const s = simRef.current.get(dragIdRef.current);
      if (s) {
        s.x = (ev.clientX - rect.left - v.tx) / v.k;
        s.y = (ev.clientY - rect.top - v.ty) / v.k;
        alphaRef.current = 1;
      }
      return;
    }
    if (panRef.current.on) {
      v.tx += ev.clientX - panRef.current.px;
      v.ty += ev.clientY - panRef.current.py;
      panRef.current.px = ev.clientX;
      panRef.current.py = ev.clientY;
      applyView();
    }
  }, [applyView]);

  const endPointer = useCallback(() => {
    panRef.current.on = false;
    dragIdRef.current = null;
  }, []);

  const zoomBtn = useCallback(
    (factor: number) => {
      const v = viewRef.current;
      v.k = Math.min(2.6, Math.max(0.35, v.k * factor));
      applyView();
    },
    [applyView],
  );
  const fit = useCallback(() => {
    viewRef.current.k = 1;
    size();
  }, [size]);

  // ── highlight state (React-driven className/style; positions stay on refs) ──
  const activeId = hoverId ?? selectedId;
  const activeNeighbors = useMemo(() => (activeId ? neighbors(activeId) : null), [activeId, neighbors]);

  const btn: React.CSSProperties = {
    width: 30,
    height: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 15,
    color: colors.text.secondary,
    background: colors.bg.card,
    border: `1px solid ${colors.border.default}`,
    borderRadius: 5,
    cursor: "pointer",
  };

  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        background: `radial-gradient(ellipse at 50% 45%, ${colors.bg.light} 0%, ${colors.bg.base} 78%)`,
      }}
    >
      <style>{`
        @keyframes rc-graph-pulse { 0% { stroke-opacity:.9; r:14; } 100% { stroke-opacity:0; r:30; } }
        @keyframes rc-graph-pop { from { transform:scale(0); } to { transform:scale(1); } }
        .rc-node-pop { animation: rc-graph-pop .45s cubic-bezier(.2,1.6,.4,1); transform-origin:center; transform-box:fill-box; }
        @media (prefers-reduced-motion: reduce) { .rc-node-pop { animation:none !important; } }
      `}</style>
      <svg
        ref={svgRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: panRef.current.on ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        onClick={() => onSelect(null)}
      >
        <g ref={worldRef}>
          {/* edges */}
          {edges.map((e) => {
            const touches = activeId && (e.aId === activeId || e.bId === activeId);
            const hoverDim = activeId && !touches;
            const familyDim = activeFamily !== "all" && e.family !== activeFamily;
            const dim = hoverDim || familyDim;
            const stroke = touches ? colors.text.secondary : colors.border.mid;
            return (
              <g key={e.id}>
                <line
                  ref={(el) => {
                    lineElRef.current.set(e.id, el);
                  }}
                  stroke={stroke}
                  strokeWidth={touches ? 1.8 : 1.2}
                  style={{ opacity: dim ? 0.12 : touches ? 1 : 0.75, pointerEvents: "none" }}
                />
                <text
                  ref={(el) => {
                    labelElRef.current.set(e.id, el);
                  }}
                  textAnchor="middle"
                  style={{
                    fontSize: 9,
                    fill: colors.text.muted,
                    pointerEvents: "none",
                    opacity: dim ? 0.08 : 1,
                  }}
                >
                  {e.predicate}
                  {e.qualifier ? <tspan style={{ fill: colors.text.dim }}>{`  ·  ${e.qualifier}`}</tspan> : null}
                </text>
              </g>
            );
          })}
          {/* nodes */}
          {nodes.map((n) => {
            const c = colorForType(colors, n.type);
            const r = NODE_RADIUS[n.type];
            const isSel = n.id === selectedId;
            const dim = !!activeId && n.id !== activeId && !(activeNeighbors?.has(n.id));
            const match = searchMatchIds.has(n.id);
            return (
              <g
                key={n.id}
                ref={(el) => {
                  nodeElRef.current.set(n.id, el);
                }}
                className="rc-node-pop"
                style={{ cursor: "pointer", opacity: dim ? 0.14 : 1, color: c }}
                onPointerDown={(ev) => {
                  ev.stopPropagation();
                  dragIdRef.current = n.id;
                  svgRef.current?.setPointerCapture(ev.pointerId);
                }}
                onPointerEnter={() => setHoverId(n.id)}
                onPointerLeave={() => setHoverId(null)}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelect(n.id);
                }}
              >
                {isSel && (
                  <circle
                    r={r}
                    fill="none"
                    stroke={c}
                    strokeWidth={1.5}
                    style={{ animation: reducedMotion ? "none" : "rc-graph-pulse 2.2s ease-out infinite" }}
                  />
                )}
                {n.type === "facility" ? (
                  <rect
                    x={-r * 0.85}
                    y={-r * 0.85}
                    width={r * 1.7}
                    height={r * 1.7}
                    rx={3}
                    transform="rotate(45)"
                    fill={c}
                    stroke={colors.bg.base}
                    strokeWidth={2}
                    style={{ filter: match ? "drop-shadow(0 0 6px currentColor)" : undefined }}
                  />
                ) : (
                  <circle
                    r={r}
                    fill={c}
                    stroke={colors.bg.base}
                    strokeWidth={2}
                    style={{ filter: match ? "drop-shadow(0 0 6px currentColor)" : undefined }}
                  />
                )}
                <text textAnchor="middle" y={r + 17} style={{ fontSize: 11, fill: colors.text.primary, fontWeight: 600, pointerEvents: "none" }}>
                  {n.name}
                </text>
                {n.sub && (
                  <text textAnchor="middle" y={r + 31} style={{ fontSize: 9, fill: colors.text.muted, pointerEvents: "none" }}>
                    {n.sub}
                  </text>
                )}
                {n.isCenter && truncatedMore > 0 && (
                  <g style={{ pointerEvents: "none" }}>
                    <title>{`${truncatedMore} more connected entities not shown (fan-out truncated)`}</title>
                    <circle r={10} cx={r * 0.95} cy={-r * 0.95} fill={colors.text.secondary} />
                    <text x={r * 0.95} y={-r * 0.95 + 3} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: colors.bg.base }}>
                      +{truncatedMore}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* zoom HUD */}
      <div style={{ position: "absolute", right: 14, top: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <button style={btn} title="Zoom in" onClick={() => zoomBtn(1.25)}>+</button>
        <button style={btn} title="Zoom out" onClick={() => zoomBtn(0.8)}>−</button>
        <button style={{ ...btn, fontSize: 11 }} title="Fit" onClick={fit}>fit</button>
      </div>
      <div style={{ position: "absolute", left: 16, bottom: 12, color: colors.text.dim, fontSize: 11, pointerEvents: "none" }}>
        drag canvas to pan · scroll to zoom · drag nodes · click a node for its atoms
      </div>
    </div>
  );
}
