"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useColors } from "@/lib/useColors";
import { NODE_RADIUS, colorForType, colorForFamily } from "./graphVocab";
import type { GraphEdgeVM, GraphNodeVM, SatelliteVM } from "./types";
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
  /** Attribute atoms of the center + ring members, rendered as small dots.
   * EVERY atom is rendered — no client-side aggregation. */
  satellites: SatelliteVM[];
  /** hostId → attributes the server capped away (pathological >48/node only).
   * Rendered as tiny muted "+N (capped)" text under the host, never a badge. */
  satelliteTruncation: Record<string, number>;
  /** Satellite ids whose predicate+value match the current search (glow). */
  satelliteMatchIds: Set<string>;
  centerId: string;
  selectedId: string | null;
  /** Selected atom id — highlights the matching satellite with a ring. */
  selectedAtomId: string | null;
  searchMatchIds: Set<string>;
  activeFamily: GraphFamily | "all";
  reducedMotion: boolean;
  /** counts.truncated fan-out overflow — rendered as a "+N more" badge on the center. */
  truncatedMore: number;
  onSelect: (id: string | null) => void;
  /** Satellite click → select its host + highlight the atom row. */
  onSatelliteSelect: (sat: SatelliteVM) => void;
}

/** Satellite render dot radius. */
const SAT_RADIUS = 4.5;
// ── Phyllotaxis (sunflower) satellite discs ──
// Every atom of a host is placed on a phyllotaxis spiral: satellite i sits at
// angle i × 137.5° (the golden angle) and radius r0 + c·√i. This packs an
// arbitrary count into a near-uniform-density disc — no aggregation, no
// hidden atoms — and the disc grows as √count so it stays compact.
/** Golden angle (≈137.5°) — the phyllotaxis divergence angle. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Inner offset (px): the first satellite sits this far off the host center. */
const PHYLLO_R0 = 30;
/** Spiral growth coefficient. Tuned so ~48 satellites fill a disc of radius
 * ~85: r0 + c·√47 ≈ 30 + 8·6.86 ≈ 85. */
const PHYLLO_C = 8;

/** Radius (px) of the satellite disc a host with `count` atoms occupies —
 * the outermost satellite's center distance plus its own dot radius. Drives
 * each node's effectiveRadius so hosts claim canvas room for their knowledge. */
function satDiscRadius(count: number): number {
  if (count <= 0) return 0;
  return PHYLLO_R0 + PHYLLO_C * Math.sqrt(count - 1) + SAT_RADIUS;
}
/** Extra breathing gap (px) between two nodes' satellite discs. */
const SAT_DISC_GAP = 24;
/** Soft separation stiffness — pushes overlapping discs apart each step. */
const SEP_K = 0.5;

/** Stable non-negative hash — deterministic per-satellite slot/phase seeding. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Ported physics constants (mmh-knowledge-graph.html prototype). The graph
// settles fully; "alive" is slow render-time drift, not jitter.
// Tuned for ~16 nodes — scaleForces() adapts them to the node count so a
// 31-node ring still spreads with readable labels.
const REPULSE = 9200;
const REPULSE_RANGE = 440;
const SPRING_REST = 190;
const SPRING_K = 0.032;
const CENTER_PULL = 0.006;
const DAMP = 0.86;
const ALPHA_DECAY = 0.0035;
/** Inter (ring-to-ring) edges pull with weaker springs — they cluster related
 * ring members without collapsing the ring onto the center's spokes. */
const INTER_SPRING_FACTOR = 0.6;
/** The prototype constants were tuned for ~16 nodes. Above that: more
 * repulsion + longer spring rest (spread the ring), less gravity (let it
 * breathe outward) — linear in the overcrowding ratio. */
function scaleForces(n: number) {
  const crowd = Math.max(0, n - 16) / 16;
  return {
    repulse: REPULSE * (1 + crowd * 0.9),
    springRest: SPRING_REST * (1 + crowd * 0.45),
    centerPull: CENTER_PULL * (16 / Math.max(16, n)),
  };
}
/** Auto-fit fires when alpha first decays below this, or after 2.5s. */
const AUTOFIT_ALPHA = 0.15;
const AUTOFIT_DEADLINE_MS = 2500;
const AUTOFIT_PADDING = 60;

export default function GraphCanvas({
  nodes,
  edges,
  satellites,
  satelliteTruncation,
  satelliteMatchIds,
  centerId,
  selectedId,
  selectedAtomId,
  searchMatchIds,
  activeFamily,
  reducedMotion,
  truncatedMore,
  onSelect,
  onSatelliteSelect,
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

  // Satellites: element refs + hover (positions are kinematic — computed
  // relative to the host each frame from a phyllotaxis slot, no force solve).
  const satElRef = useRef<Map<string, SVGGElement | null>>(new Map());
  const satHoverRef = useRef<SVGGElement | null>(null);
  const [hoverSatId, setHoverSatId] = useState<string | null>(null);

  // Viewport transform.
  const viewRef = useRef({ vw: 0, vh: 0, tx: 0, ty: 0, k: 1 });
  const panRef = useRef({ on: false, px: 0, py: 0 });

  // Auto-fit bookkeeping — fit once per center change, never after the user
  // has touched the camera (pan / wheel / zoom buttons).
  const userTouchedCameraRef = useRef(false);
  const autoFitDoneRef = useRef(false);
  const simStartRef = useRef(0);

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

  // Satellites grouped by host.
  const satsByHost = useMemo(() => {
    const m = new Map<string, SatelliteVM[]>();
    for (const s of satellites) {
      const arr = m.get(s.hostId);
      if (arr) arr.push(s);
      else m.set(s.hostId, [s]);
    }
    return m;
  }, [satellites]);

  // Clear a stale hover when the satellite set changes (pivot / refilter).
  const satSig = useMemo(() => satellites.map((s) => s.id).join(","), [satellites]);
  useEffect(() => {
    setHoverSatId(null);
  }, [satSig]);

  // Phyllotaxis layout: EVERY satellite gets a slot (angle + radius) on its
  // host's sunflower spiral, plus each host's disc radius (its knowledge
  // footprint). Nothing is aggregated or hidden.
  const { renderedSats, satMeta, hostDiscRadius } = useMemo(() => {
    const rendered: SatelliteVM[] = [];
    const meta = new Map<string, { angle: number; rad: number; ph: number; ph2: number; hostId: string }>();
    const disc = new Map<string, number>();
    for (const [hostId, sats] of satsByHost) {
      // Per-host phase offset (host id hash) so neighboring discs don't align.
      const phase = ((hashStr(hostId) % 360) * Math.PI) / 180;
      sats.forEach((sat, i) => {
        meta.set(sat.id, {
          angle: phase + i * GOLDEN_ANGLE,
          rad: PHYLLO_R0 + PHYLLO_C * Math.sqrt(i),
          ph: (hashStr(sat.id) % 628) / 100,
          ph2: (hashStr(`${sat.id}b`) % 628) / 100,
          hostId,
        });
        rendered.push(sat);
      });
      disc.set(hostId, satDiscRadius(sats.length));
    }
    return { renderedSats: rendered, satMeta: meta, hostDiscRadius: disc };
  }, [satsByHost]);

  // effectiveRadius = node radius + its satellite disc radius. Hosts with heavy
  // knowledge discs claim more canvas: this feeds repulsion, spring rests, and
  // auto-fit. Kept in a ref so the rAF sim loop reads live values.
  const effRadius = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.id, NODE_RADIUS[n.type] + (hostDiscRadius.get(n.id) ?? 0));
    return m;
  }, [nodes, hostDiscRadius]);

  // Mirror the satellite render data into refs so the rAF draw loop reads live
  // values without being torn down/recreated on every hover.
  const renderedSatsRef = useRef(renderedSats);
  const satMetaRef = useRef(satMeta);
  const effRadiusRef = useRef(effRadius);
  const hoverSatIdRef = useRef(hoverSatId);
  useEffect(() => { renderedSatsRef.current = renderedSats; }, [renderedSats]);
  useEffect(() => { satMetaRef.current = satMeta; }, [satMeta]);
  useEffect(() => { effRadiusRef.current = effRadius; }, [effRadius]);
  useEffect(() => { hoverSatIdRef.current = hoverSatId; }, [hoverSatId]);

  const applyView = useCallback(() => {
    const { tx, ty, k } = viewRef.current;
    worldRef.current?.setAttribute("transform", `translate(${tx},${ty}) scale(${k})`);
    // Label declutter — cheap class toggles at zoom thresholds (k only changes
    // through here, from the wheel/buttons/auto-fit paths), no React re-render:
    //   k > 1.15  → sub-labels appear (otherwise only on hover/selected/center)
    //   k < 0.55  → primary labels of tiny non-center nodes (r < 13) hide too
    const svg = svgRef.current;
    if (svg) {
      svg.classList.toggle("rc-zoom-sub", k > 1.15);
      svg.classList.toggle("rc-zoom-far", k < 0.55);
    }
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
    // New center ⇒ one fresh auto-fit is allowed again.
    autoFitDoneRef.current = false;
    userTouchedCameraRef.current = false;
    simStartRef.current = performance.now();
  }, [nodeSig, centerId, nodes]);

  /** Fit the node bounding box into the viewport with AUTOFIT_PADDING. Used
   * by the one-shot auto-fit and the "fit" HUD button. The box uses each
   * node's effectiveRadius (node + satellite disc) so the initial fit zooms
   * out far enough to show every satellite. */
  const fitToContent = useCallback(() => {
    const v = viewRef.current;
    if (!v.vw || !v.vh) return;
    const sim = simRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const n of nodes) {
      const s = sim.get(n.id);
      if (!s) continue;
      // effectiveRadius (node + its satellite disc) + label allowance.
      const pad = (effRadiusRef.current.get(n.id) ?? NODE_RADIUS[n.type]) + 36;
      minX = Math.min(minX, s.x - pad);
      maxX = Math.max(maxX, s.x + pad);
      minY = Math.min(minY, s.y - pad);
      maxY = Math.max(maxY, s.y + pad);
      count++;
    }
    if (count === 0) return;
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const k = Math.min(
      1.4,
      Math.max(0.2, Math.min((v.vw - AUTOFIT_PADDING * 2) / bw, (v.vh - AUTOFIT_PADDING * 2) / bh)),
    );
    v.k = k;
    v.tx = v.vw / 2 - (k * (minX + maxX)) / 2;
    v.ty = v.vh / 2 - (k * (minY + maxY)) / 2;
    applyView();
  }, [nodes, applyView]);

  // Simulation + render loop.
  useEffect(() => {
    size();
    let raf = 0;
    const ambient = !reducedMotion;
    const { repulse, springRest, centerPull } = scaleForces(nodes.length);

    const step = () => {
      const sim = simRef.current;
      const act = nodes.map((n) => ({ n, s: sim.get(n.id)! })).filter((x) => x.s);
      const alpha = alphaRef.current;
      // Repulsion + disc separation. Inverse-square repulsion spreads the
      // ring; a soft linear separation pushes any two nodes apart until their
      // satellite discs clear (min sep = sum of effectiveRadii + gap), so a
      // heavy knowledge disc naturally claims its canvas room.
      const eff = effRadiusRef.current;
      for (let i = 0; i < act.length; i++) {
        for (let j = i + 1; j < act.length; j++) {
          const a = act[i].s;
          const b = act[j].s;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const d2 = dx * dx + dy * dy || 1;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          if (d2 < REPULSE_RANGE * REPULSE_RANGE) {
            const f = repulse / d2;
            a.vx -= dx * f;
            a.vy -= dy * f;
            b.vx += dx * f;
            b.vy += dy * f;
          }
          const minSep =
            (eff.get(act[i].n.id) ?? NODE_RADIUS[act[i].n.type]) +
            (eff.get(act[j].n.id) ?? NODE_RADIUS[act[j].n.type]) +
            SAT_DISC_GAP;
          if (d < minSep) {
            const push = (minSep - d) * SEP_K;
            a.vx -= dx * push;
            a.vy -= dy * push;
            b.vx += dx * push;
            b.vy += dy * push;
          }
        }
      }
      // Springs. Inter (ring-to-ring) edges pull weaker — they cluster
      // related ring members without fighting the center spokes.
      for (const e of edges) {
        const a = sim.get(e.aId);
        const b = sim.get(e.bId);
        if (!a || !b) continue;
        const na = byId.get(e.aId);
        const nb = byId.get(e.bId);
        // Rest length grows with each endpoint's effectiveRadius (node + its
        // satellite disc) so edges don't drag heavy discs into each other.
        const restA = eff.get(e.aId) ?? NODE_RADIUS[na?.type ?? "contact"];
        const restB = eff.get(e.bId) ?? NODE_RADIUS[nb?.type ?? "contact"];
        const rest = springRest + restA + restB;
        const springK = e.inter ? SPRING_K * INTER_SPRING_FACTOR : SPRING_K;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - rest) * springK;
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
      // Center pull + integrate.
      for (const { n, s } of act) {
        s.vx -= s.x * centerPull;
        s.vy -= s.y * centerPull;
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
      // Satellites — kinematically pinned to their host at their slot (angle,
      // rest) so host motion carries them; a tiny ambient wobble keeps them
      // alive. No per-satellite force solve: O(rendered satellites) per frame.
      const meta = satMetaRef.current;
      for (const sat of renderedSatsRef.current) {
        const el = satElRef.current.get(sat.id);
        const m = meta.get(sat.id);
        if (!el || !m) continue;
        const hp = P[m.hostId];
        if (!hp) continue;
        let x = hp[0] + Math.cos(m.angle) * m.rad;
        let y = hp[1] + Math.sin(m.angle) * m.rad;
        if (ambient) {
          x += Math.sin(t * 0.0009 + m.ph) * 1.6;
          y += Math.cos(t * 0.0008 + m.ph2) * 1.6;
        }
        el.setAttribute("transform", `translate(${x},${y})`);
      }
      // Hover label follows the hovered satellite.
      const hov = hoverSatIdRef.current;
      const hoverEl = satHoverRef.current;
      if (hoverEl && hov) {
        const m = meta.get(hov);
        const hp = m && P[m.hostId];
        if (m && hp) {
          hoverEl.setAttribute(
            "transform",
            `translate(${hp[0] + Math.cos(m.angle) * m.rad},${hp[1] + Math.sin(m.angle) * m.rad - 10})`,
          );
        }
      }
    };

    const loop = () => {
      step();
      // One-shot auto-fit: once the sim has mostly settled (alpha decayed
      // below the threshold) or 2.5s has elapsed, whichever first — and never
      // after the user has taken the camera.
      if (
        !autoFitDoneRef.current &&
        !userTouchedCameraRef.current &&
        (alphaRef.current < AUTOFIT_ALPHA ||
          performance.now() - simStartRef.current > AUTOFIT_DEADLINE_MS)
      ) {
        autoFitDoneRef.current = true;
        fitToContent();
      }
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
  }, [nodes, edges, byId, centerId, reducedMotion, size, fitToContent]);

  // ── pan / zoom / drag ──
  const onWheel = useCallback(
    (ev: React.WheelEvent) => {
      ev.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      userTouchedCameraRef.current = true;
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

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /* Click-vs-drag discrimination. Pointer capture lives on the SVG, which
   * retargets pointerup/click to the svg element — child onClick handlers
   * never fire once a drag/pan starts. So selection is decided here on
   * pointerup: a press that moved < 4px is a click on whatever was pressed. */
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressBgClickRef = useRef(false);

  const onPointerDownBg = useCallback((ev: React.PointerEvent) => {
    panRef.current = { on: true, px: ev.clientX, py: ev.clientY };
    pressRef.current = { x: ev.clientX, y: ev.clientY, moved: false };
    userTouchedCameraRef.current = true;
    svgRef.current?.setPointerCapture(ev.pointerId);
  }, []);

  const onPointerMove = useCallback((ev: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const p = pressRef.current;
    if (p && !p.moved && Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 4) p.moved = true;
    const v = viewRef.current;
    if (dragIdRef.current) {
      if (!p?.moved) return; // sub-threshold jitter — keep it a click
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
    const pressed = dragIdRef.current;
    const moved = pressRef.current?.moved ?? false;
    if (pressed && !moved) {
      onSelectRef.current(pressed); // stationary press on a node = click
      suppressBgClickRef.current = true; // the retargeted click on the svg must not deselect
    } else if (moved) {
      suppressBgClickRef.current = true; // end of a drag/pan is not a background click
    }
    panRef.current.on = false;
    dragIdRef.current = null;
    pressRef.current = null;
  }, []);

  const zoomBtn = useCallback(
    (factor: number) => {
      userTouchedCameraRef.current = true;
      const v = viewRef.current;
      v.k = Math.min(2.6, Math.max(0.35, v.k * factor));
      applyView();
    },
    [applyView],
  );
  const fit = useCallback(() => {
    userTouchedCameraRef.current = true; // explicit camera action — auto-fit stays off
    fitToContent();
  }, [fitToContent]);

  // ── highlight state (React-driven className/style; positions stay on refs) ──
  const activeId = hoverId ?? selectedId;
  const activeNeighbors = useMemo(() => (activeId ? neighbors(activeId) : null), [activeId, neighbors]);
  const hoverSat = hoverSatId ? renderedSats.find((s) => s.id === hoverSatId) ?? null : null;
  const hoverSatLabel = hoverSat
    ? `${hoverSat.label}: ${hoverSat.valueSnippet.length > 42 ? `${hoverSat.valueSnippet.slice(0, 42)}…` : hoverSat.valueSnippet}`
    : "";

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
        /* Label declutter — classes toggled on the <svg> at zoom thresholds (applyView). */
        .rc-sublabel { display: none; }
        .rc-zoom-sub .rc-sublabel, .rc-sublabel.rc-sub-on { display: inline; }
        .rc-zoom-far .rc-plabel-sm { display: none; }
      `}</style>
      <svg
        ref={svgRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: panRef.current.on ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDownBg}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        onClick={() => {
          if (suppressBgClickRef.current) {
            suppressBgClickRef.current = false; // retargeted click after a drag/pan/node-press
            return;
          }
          onSelect(null);
        }}
      >
        <g ref={worldRef}>
          {/* edges */}
          {edges.map((e) => {
            // Inter (ring-to-ring) edges: same styling, ~half opacity so
            // center edges stay primary; they light up when EITHER endpoint
            // is hovered/selected (touches already checks both endpoints).
            const inter = e.inter === true;
            const touches = activeId && (e.aId === activeId || e.bId === activeId);
            const hoverDim = activeId && !touches;
            const familyDim = activeFamily !== "all" && e.family !== activeFamily;
            const dim = hoverDim || familyDim;
            const stroke = touches ? colors.text.secondary : colors.border.mid;
            const lineOpacity = dim ? 0.12 : touches ? (inter ? 0.6 : 1) : inter ? 0.38 : 0.75;
            const labelOpacity = dim ? 0.08 : inter ? 0.5 : 1;
            return (
              <g key={e.id}>
                <line
                  ref={(el) => {
                    lineElRef.current.set(e.id, el);
                  }}
                  stroke={stroke}
                  strokeWidth={touches ? 1.8 : 1.2}
                  style={{ opacity: lineOpacity, pointerEvents: "none" }}
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
                    opacity: labelOpacity,
                  }}
                >
                  {e.predicate}
                  {e.qualifier ? <tspan style={{ fill: colors.text.dim }}>{`  ·  ${e.qualifier}`}</tspan> : null}
                </text>
              </g>
            );
          })}
          {/* satellites — small family-colored dots orbiting their host */}
          {renderedSats.map((sat) => {
            const familyDim = activeFamily !== "all" && sat.family !== activeFamily;
            const hostActive = activeId === sat.hostId;
            const hostDim = !!activeId && !hostActive && !activeNeighbors?.has(sat.hostId);
            const dim = familyDim || hostDim;
            const match = satelliteMatchIds.has(sat.id);
            const isSelAtom = sat.id === selectedAtomId;
            const fill = colorForFamily(colors, sat.family);
            const contested = sat.status === "contested";
            return (
              <g
                key={sat.id}
                ref={(el) => {
                  satElRef.current.set(sat.id, el);
                }}
                style={{ cursor: "pointer", opacity: dim ? 0.12 : 1, color: fill }}
                onPointerEnter={() => setHoverSatId(sat.id)}
                onPointerLeave={() => setHoverSatId((h) => (h === sat.id ? null : h))}
                /* Without this, pointerdown bubbles to the svg pan handler,
                   which captures the pointer — the click never lands. */
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSatelliteSelect(sat);
                }}
              >
                {isSelAtom && <circle r={SAT_RADIUS + 3.5} fill="none" stroke={fill} strokeWidth={1.4} />}
                {contested && <circle r={SAT_RADIUS + 2} fill="none" stroke={colors.accent.red} strokeWidth={1.2} />}
                <circle
                  r={SAT_RADIUS}
                  fill={fill}
                  stroke={colors.bg.base}
                  strokeWidth={1}
                  style={{ filter: match ? "drop-shadow(0 0 5px currentColor)" : undefined }}
                />
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
                  pressRef.current = { x: ev.clientX, y: ev.clientY, moved: false };
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
                <text
                  className={!n.isCenter && r < 13 ? "rc-plabel-sm" : undefined}
                  textAnchor="middle"
                  y={r + 17}
                  style={{ fontSize: 11, fill: colors.text.primary, fontWeight: 600, pointerEvents: "none" }}
                >
                  {n.name}
                </text>
                {n.sub && (
                  <text
                    className={`rc-sublabel${n.isCenter || n.id === hoverId || n.id === selectedId ? " rc-sub-on" : ""}`}
                    textAnchor="middle"
                    y={r + 31}
                    style={{ fontSize: 9, fill: colors.text.muted, pointerEvents: "none" }}
                  >
                    {n.sub}
                  </text>
                )}
                {/* Server-capped satellite overflow — muted text, not a badge.
                    Only appears for a pathological host (>48 atoms). */}
                {(satelliteTruncation[n.id] ?? 0) > 0 && (
                  <text
                    textAnchor="middle"
                    y={r + (n.sub ? 43 : 31)}
                    style={{ fontSize: 8.5, fill: colors.text.dim, pointerEvents: "none" }}
                  >
                    {`+${satelliteTruncation[n.id]} more (capped)`}
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
          {/* satellite hover label — position driven by the draw loop */}
          {hoverSat && (
            <g ref={satHoverRef} style={{ pointerEvents: "none" }}>
              <rect
                x={-5}
                y={-11}
                width={hoverSatLabel.length * 5.6 + 10}
                height={16}
                rx={3}
                fill={colors.bg.card}
                stroke={colors.border.default}
                strokeWidth={1}
                opacity={0.96}
              />
              <text x={0} y={0} style={{ fontSize: 10, fill: colors.text.primary }}>
                {hoverSatLabel}
              </text>
            </g>
          )}
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
