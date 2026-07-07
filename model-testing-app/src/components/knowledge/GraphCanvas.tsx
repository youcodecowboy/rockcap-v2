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

/** A satellite (leaf) force-sim particle. Unlike the old kinematic slots,
 * every satellite carries its own persistent position + velocity and is a
 * real participant in the simulation (spring to host, leaf↔leaf and
 * leaf↔foreign-node repulsion). */
interface SatSim {
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
// ── Phyllotaxis (sunflower) SEED slots ──
// Satellites are now real force-sim particles (see SatSim + the satellite pass
// in step()). But we still SEED each new leaf on its host's phyllotaxis spiral:
// satellite i at angle i × 137.5° (golden angle), radius r0 + c·√i. Seeding on
// the spiral means a freshly-appearing cluster starts pre-spread (no initial
// explosion) and the force sim only has to relax it, not build it from a point.
/** Golden angle (≈137.5°) — the phyllotaxis divergence angle. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Inner offset (px): the first seeded satellite sits this far off the host. */
const PHYLLO_R0 = 30;
/** Spiral growth coefficient for the seed layout. */
const PHYLLO_C = 8;

// ── Satellite (leaf) force-sim constants — the Obsidian dandelion model ──
// Each leaf springs to its host on a short rest length, weakly repels other
// leaves and foreign nodes, damps, and has NO center gravity. Hubs with many
// leaves bloom into clusters; cluster-vs-cluster spacing is handled entirely by
// the hosts' effectiveRadius node repulsion (unchanged), so clusters stay
// coherent and do not interleave.
/** Leaf→host spring stiffness. */
const SAT_SPRING_K = 0.08;
/** Leaf→host rest length grows slowly with sibling count so a heavy host blooms
 * into a bigger dandelion rather than an impossibly dense knot. */
function satRest(siblingCount: number): number {
  return 26 + 3 * Math.sqrt(Math.max(0, siblingCount));
}
/** Leaf↔leaf repulsion: force ≈ SAT_REPULSE / d² within SAT_REPULSE_RANGE,
 * clamped so two near-coincident leaves don't explode. */
const SAT_REPULSE = 900;
const SAT_REPULSE_RANGE = 48;
const SAT_REPULSE_RANGE2 = SAT_REPULSE_RANGE * SAT_REPULSE_RANGE;
const SAT_REPULSE_CLAMP = 40;
/** Spatial-hash cell size for the leaf↔leaf pass. Matched to the repulsion
 * range so a leaf's 3×3 neighbourhood covers everything that can push it —
 * keeps the pass O(S·localDensity) instead of O(S²) at 150+ leaves. */
const SAT_GRID = 48;
/** Leaf↔foreign-node repulsion — keeps a host's leaves out of OTHER hubs.
 * force ≈ SAT_NODE_REPULSE / d² within SAT_NODE_RANGE of a non-host node. */
const SAT_NODE_REPULSE = 2000;
const SAT_NODE_RANGE = 60;
const SAT_NODE_CLAMP = 60;
/** Leaf velocity damping (same feel as the node DAMP). */
const SAT_DAMP = 0.86;

/** Radius (px) the settled leaf cluster of a host with `count` leaves occupies.
 * An estimate (not the live positions) used for node effectiveRadius / spring
 * rests / auto-fit fallback so hubs claim canvas room before the leaves settle.
 * Derived from the spring rest plus a √count disc-fill term (leaves repel into
 * a filled disc when the ring at `rest` gets crowded). */
function clusterRadius(count: number): number {
  if (count <= 0) return 0;
  return satRest(count) + 0.9 * SAT_RADIUS * Math.sqrt(count) + SAT_RADIUS;
}

/** Host circle prominence bump (px): knowledge-heavy nodes read bigger, an
 * Obsidian-style degree-scaling cue. Capped so a mega-hub doesn't dwarf all. */
function hostRadiusBump(count: number): number {
  return count > 0 ? Math.min(7, 1.5 * Math.sqrt(count)) : 0;
}

/** Extra breathing gap (px) between two nodes' leaf clusters. */
const SAT_DISC_GAP = 24;
/** Soft separation stiffness — pushes overlapping clusters apart each step. */
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
  // Pin-where-you-drop (session-only): pinned nodes skip force integration —
  // they hold their dropped position while the layout drapes around them.
  // Double-click releases. State mirrors the ref so the pin ring renders.
  const pinnedRef = useRef<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const centerIdRef = useRef(centerId);
  useEffect(() => {
    centerIdRef.current = centerId;
  }, [centerId]);

  // Satellites: element refs + a persistent force-sim particle store (leaves
  // are real sim participants now, not kinematic slots). satLineElRef holds the
  // thin host→leaf link lines.
  const satElRef = useRef<Map<string, SVGGElement | null>>(new Map());
  const satLineElRef = useRef<Map<string, SVGLineElement | null>>(new Map());
  const satSimRef = useRef<Map<string, SatSim>>(new Map());
  const [hoverSatId, setHoverSatId] = useState<string | null>(null);
  // Screen-space anchor (px, relative to the stage) of the hovered satellite —
  // captured once when hover starts (static while hovering; hidden on
  // leave/zoom/pan). Drives the HTML overlay tooltip card.
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

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
    setHoverPos(null);
  }, [satSig]);

  // Hover lifecycle: capture the hovered satellite's screen anchor once (world
  // pos → screen via the live view transform), and a shared clear used on
  // leave and on any camera move (zoom / pan) — the card is static, so it must
  // vanish rather than drift when the camera changes.
  const showSatHover = useCallback((satId: string) => {
    setHoverSatId(satId);
    const p = satSimRef.current.get(satId);
    const v = viewRef.current;
    if (p) setHoverPos({ x: v.tx + v.k * p.x, y: v.ty + v.k * p.y });
    else setHoverPos(null);
  }, []);
  const clearSatHover = useCallback(() => {
    setHoverSatId(null);
    setHoverPos(null);
  }, []);
  // Leave guard: clustered satellites can fire enter(B) before leave(A), so
  // only clear if the leaving satellite is still the hovered one (ref avoids a
  // stale-closure read + keeps the updater pure).
  const hoverSatIdRef = useRef<string | null>(null);
  useEffect(() => { hoverSatIdRef.current = hoverSatId; }, [hoverSatId]);
  const onSatLeave = useCallback((id: string) => {
    if (hoverSatIdRef.current === id) clearSatHover();
  }, [clearSatHover]);

  // Per-satellite sim metadata: a phyllotaxis SEED slot (angle + slotRad) used
  // only to place a freshly-appearing leaf pre-spread, plus its spring rest
  // (shared across a host's leaves), ambient-wobble phases, and hostId. The
  // live position lives in satSimRef; this is the static per-leaf recipe.
  const { renderedSats, satMeta, hostSatCount } = useMemo(() => {
    const rendered: SatelliteVM[] = [];
    const meta = new Map<
      string,
      { angle: number; slotRad: number; rest: number; ph: number; ph2: number; hostId: string }
    >();
    const counts = new Map<string, number>();
    for (const [hostId, sats] of satsByHost) {
      // Per-host phase offset (host id hash) so neighboring clusters don't align.
      const phase = ((hashStr(hostId) % 360) * Math.PI) / 180;
      const rest = satRest(sats.length);
      sats.forEach((sat, i) => {
        meta.set(sat.id, {
          angle: phase + i * GOLDEN_ANGLE,
          slotRad: PHYLLO_R0 + PHYLLO_C * Math.sqrt(i),
          rest,
          ph: (hashStr(sat.id) % 628) / 100,
          ph2: (hashStr(`${sat.id}b`) % 628) / 100,
          hostId,
        });
        rendered.push(sat);
      });
      counts.set(hostId, sats.length);
    }
    return { renderedSats: rendered, satMeta: meta, hostSatCount: counts };
  }, [satsByHost]);

  // effectiveRadius = scaled node radius (prominence bump) + its estimated leaf
  // cluster radius. Hosts with heavy knowledge clusters claim more canvas: this
  // feeds node repulsion, spring rests, and auto-fit fallback. Kept in a ref so
  // the rAF sim loop reads live values.
  const effRadius = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      const count = hostSatCount.get(n.id) ?? 0;
      m.set(n.id, NODE_RADIUS[n.type] + hostRadiusBump(count) + clusterRadius(count));
    }
    return m;
  }, [nodes, hostSatCount]);

  // Mirror the satellite render data into refs so the rAF draw loop reads live
  // values without being torn down/recreated on every hover.
  const renderedSatsRef = useRef(renderedSats);
  const satMetaRef = useRef(satMeta);
  const effRadiusRef = useRef(effRadius);
  useEffect(() => { renderedSatsRef.current = renderedSats; }, [renderedSats]);
  useEffect(() => { satMetaRef.current = satMeta; }, [satMeta]);
  useEffect(() => { effRadiusRef.current = effRadius; }, [effRadius]);

  // When the satellite set changes (pivot / refilter): drop sim particles for
  // leaves that no longer exist (bounded memory) and wake the sim so new/removed
  // leaves re-settle. New leaves are lazily seeded on their phyllotaxis slot the
  // first time the step loop sees them (host position is known by then).
  useEffect(() => {
    const valid = new Set(satellites.map((s) => s.id));
    const store = satSimRef.current;
    for (const k of Array.from(store.keys())) if (!valid.has(k)) store.delete(k);
    alphaRef.current = Math.max(alphaRef.current, 0.7);
  }, [satellites]);

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

  // Reseed / re-settle the simulation whenever the node set or center changes.
  // Two distinct cases share this effect (the node set changes in both):
  //   • Center change (pivot / pop) ⇒ a brand-new view: seed the whole ring
  //     fresh in a circle, center at the origin, for a clean settle.
  //   • Same center, different node set ⇒ a family-VIEW switch: surviving nodes
  //     KEEP their sim positions (continuity — they relax from where they were),
  //     removed nodes are pruned (rebuilding the map drops them), and any newly
  //     appearing node is seeded on the ring.
  const nodeSig = useMemo(() => `${centerId}|${nodes.map((n) => n.id).join(",")}`, [centerId, nodes]);
  const prevCenterRef = useRef<string | null>(null);
  useEffect(() => {
    const centerChanged = prevCenterRef.current !== centerId;
    prevCenterRef.current = centerId;
    if (centerChanged && pinnedRef.current.size) {
      pinnedRef.current.clear(); // pins are per-view arrangements — a pivot is a new view
      setPinned(new Set());
    }
    const prev = simRef.current;
    const others = nodes.filter((n) => n.id !== centerId);
    const next = new Map<string, Sim>();
    others.forEach((n, i) => {
      const kept = centerChanged ? undefined : prev.get(n.id);
      if (kept) {
        next.set(n.id, kept); // survivor — keep its position for continuity
        return;
      }
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
    const keptCenter = centerChanged ? undefined : prev.get(centerId);
    next.set(centerId, keptCenter ?? { x: 0, y: 0, vx: 0, vy: 0, ph: Math.random() * 6.28, ph2: Math.random() * 6.28 });
    simRef.current = next;
    alphaRef.current = 1;
    // A view change is a NEW view: re-arm the one-shot auto-fit AND clear the
    // user-camera lock so the surviving subgraph refits even if the user had
    // panned/zoomed the previous view. This deliberately overrides the "never
    // refit after the user takes the camera" rule — a family switch is a fresh
    // framing, not a continuation of the old one.
    autoFitDoneRef.current = false;
    userTouchedCameraRef.current = false;
    simStartRef.current = performance.now();
  }, [nodeSig, centerId, nodes]);

  /** Fit the content bounding box into the viewport with AUTOFIT_PADDING. Used
   * by the one-shot auto-fit and the "fit" HUD button. The box unions each
   * node's slot (effectiveRadius + label allowance — the fallback before the
   * leaves settle) with the ACTUAL settled leaf positions, so a bloomed cluster
   * that reaches past its estimate is still fully framed. */
  const fitToContent = useCallback(() => {
    const v = viewRef.current;
    if (!v.vw || !v.vh) return;
    const sim = simRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const n of nodes) {
      const s = sim.get(n.id);
      if (!s) continue;
      // effectiveRadius (scaled node + estimated leaf cluster) + label allowance.
      const pad = (effRadiusRef.current.get(n.id) ?? NODE_RADIUS[n.type]) + 36;
      minX = Math.min(minX, s.x - pad);
      maxX = Math.max(maxX, s.x + pad);
      minY = Math.min(minY, s.y - pad);
      maxY = Math.max(maxY, s.y + pad);
      count++;
    }
    // Union with the live leaf particle positions (falls back cleanly to the
    // node estimate above when the store is empty / pre-first-settle).
    const satSim = satSimRef.current;
    for (const sat of renderedSatsRef.current) {
      const p = satSim.get(sat.id);
      if (!p) continue;
      const pad = SAT_RADIUS + 6;
      minX = Math.min(minX, p.x - pad);
      maxX = Math.max(maxX, p.x + pad);
      minY = Math.min(minY, p.y - pad);
      maxY = Math.max(maxY, p.y + pad);
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
        if (n.id === dragIdRef.current || n.id === centerId || pinnedRef.current.has(n.id)) {
          // Pin the center at origin; a dragged node follows the pointer;
          // operator-pinned nodes hold where they were dropped (they still
          // exert forces — the rest of the graph drapes around them).
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

      // ── Satellite (leaf) force pass ──────────────────────────────────────
      // Every leaf is a real particle: spring to host + leaf↔leaf repulsion
      // (via a 48px spatial-hash grid) + leaf↔foreign-node repulsion. No center
      // gravity. Damped and integrated with the SAME alpha as the nodes, so
      // leaves sleep when the graph sleeps.
      //
      // Cost model at S leaves, N nodes: the grid keeps leaf↔leaf linear —
      // each leaf scans only its 3×3 cell neighbourhood (~local density k, i.e.
      // its own cluster's leaves within 144px), so ≈ O(S·k). leaf↔node is
      // O(S·N) with N≈31 a small constant. At S≈150, N≈31: ≈ a few thousand
      // leaf-pair checks + ~4.6k leaf-node checks per step — well inside frame.
      const satSim = satSimRef.current;
      const meta = satMetaRef.current;
      const rendered = renderedSatsRef.current;
      if (rendered.length) {
        // Lazily seed any new leaf on its host's phyllotaxis slot (pre-spread,
        // no explosion) the first time we see it — host position is known now.
        for (const sat of rendered) {
          if (satSim.has(sat.id)) continue;
          const m = meta.get(sat.id);
          if (!m) continue;
          const host = sim.get(m.hostId);
          if (!host) continue;
          satSim.set(sat.id, {
            x: host.x + Math.cos(m.angle) * m.slotRad,
            y: host.y + Math.sin(m.angle) * m.slotRad,
            vx: 0,
            vy: 0,
            ph: (hashStr(sat.id) % 628) / 100,
            ph2: (hashStr(`${sat.id}c`) % 628) / 100,
          });
        }
        // Build the leaf spatial-hash grid for this step.
        const grid = new Map<string, string[]>();
        for (const sat of rendered) {
          const p = satSim.get(sat.id);
          if (!p) continue;
          const key = `${Math.floor(p.x / SAT_GRID)},${Math.floor(p.y / SAT_GRID)}`;
          const bucket = grid.get(key);
          if (bucket) bucket.push(sat.id);
          else grid.set(key, [sat.id]);
        }
        // Accumulate forces per leaf.
        for (const sat of rendered) {
          const p = satSim.get(sat.id);
          const m = meta.get(sat.id);
          if (!p || !m) continue;
          const host = sim.get(m.hostId);
          if (!host) continue;
          // Spring to host (short rest, no center gravity).
          let dx = host.x - p.x;
          let dy = host.y - p.y;
          const dh = Math.sqrt(dx * dx + dy * dy) || 1;
          const fs = (dh - m.rest) * SAT_SPRING_K;
          p.vx += (dx / dh) * fs;
          p.vy += (dy / dh) * fs;
          // Leaf↔leaf repulsion over the 3×3 neighbourhood (both directions are
          // applied naturally: each leaf pushes itself off its neighbours).
          const cx = Math.floor(p.x / SAT_GRID);
          const cy = Math.floor(p.y / SAT_GRID);
          for (let gx = cx - 1; gx <= cx + 1; gx++) {
            for (let gy = cy - 1; gy <= cy + 1; gy++) {
              const bucket = grid.get(`${gx},${gy}`);
              if (!bucket) continue;
              for (const otherId of bucket) {
                if (otherId === sat.id) continue;
                const q = satSim.get(otherId);
                if (!q) continue;
                const rx = p.x - q.x;
                const ry = p.y - q.y;
                const r2 = rx * rx + ry * ry;
                if (r2 > 0 && r2 < SAT_REPULSE_RANGE2) {
                  const rd = Math.sqrt(r2);
                  let force = SAT_REPULSE / r2;
                  if (force > SAT_REPULSE_CLAMP) force = SAT_REPULSE_CLAMP;
                  p.vx += (rx / rd) * force;
                  p.vy += (ry / rd) * force;
                }
              }
            }
          }
          // Leaf↔foreign-node repulsion — keeps a host's leaves out of OTHER
          // hubs (N is small, iterate directly).
          for (const { n, s } of act) {
            if (n.id === m.hostId) continue;
            const rx = p.x - s.x;
            const ry = p.y - s.y;
            const r2 = rx * rx + ry * ry;
            if (r2 > 0 && r2 < SAT_NODE_RANGE * SAT_NODE_RANGE) {
              const rd = Math.sqrt(r2);
              let force = SAT_NODE_REPULSE / r2;
              if (force > SAT_NODE_CLAMP) force = SAT_NODE_CLAMP;
              p.vx += (rx / rd) * force;
              p.vy += (ry / rd) * force;
            }
          }
        }
        // Integrate leaves with the shared alpha (sleep when the graph sleeps).
        for (const sat of rendered) {
          const p = satSim.get(sat.id);
          if (!p) continue;
          p.vx *= SAT_DAMP;
          p.vy *= SAT_DAMP;
          p.x += p.vx * alpha;
          p.y += p.vy * alpha;
        }
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
      // Satellites — drawn at their live force-sim positions, with a tiny
      // render-time ambient wobble for life (static under reduced-motion). Each
      // leaf also gets a thin link line back to its host (host uses the drifted
      // node position P so the line meets the node where it's drawn).
      const meta = satMetaRef.current;
      const satSim = satSimRef.current;
      for (const sat of renderedSatsRef.current) {
        const m = meta.get(sat.id);
        const p = m && satSim.get(sat.id);
        if (!m || !p) continue;
        let x = p.x;
        let y = p.y;
        if (ambient) {
          x += Math.sin(t * 0.0009 + p.ph) * 1.6;
          y += Math.cos(t * 0.0008 + p.ph2) * 1.6;
        }
        satElRef.current.get(sat.id)?.setAttribute("transform", `translate(${x},${y})`);
        const line = satLineElRef.current.get(sat.id);
        const hp = P[m.hostId];
        if (line && hp) {
          line.setAttribute("x1", String(hp[0]));
          line.setAttribute("y1", String(hp[1]));
          line.setAttribute("x2", String(x));
          line.setAttribute("y2", String(y));
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
      clearSatHover();
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
    [applyView, clearSatHover],
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
    clearSatHover();
    svgRef.current?.setPointerCapture(ev.pointerId);
  }, [clearSatHover]);

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
        const nx = (ev.clientX - rect.left - v.tx) / v.k;
        const ny = (ev.clientY - rect.top - v.ty) / v.k;
        // Velocity inheritance: carry this host's leaves rigidly by the same
        // delta so a fast drag doesn't tear the cluster off its host (the
        // springs then relax it back into shape). O(leaves-of-this-host).
        const ddx = nx - s.x;
        const ddy = ny - s.y;
        s.x = nx;
        s.y = ny;
        const satSim = satSimRef.current;
        const meta = satMetaRef.current;
        for (const sat of renderedSatsRef.current) {
          if (meta.get(sat.id)?.hostId !== dragIdRef.current) continue;
          const sp = satSim.get(sat.id);
          if (sp) {
            sp.x += ddx;
            sp.y += ddy;
          }
        }
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
      if (pressed && pressed !== centerIdRef.current) {
        // Pin-where-you-drop: a dragged node holds its position (session-only)
        // and the layout drapes around it. Double-click releases it.
        pinnedRef.current.add(pressed);
        setPinned(new Set(pinnedRef.current));
      }
    }
    panRef.current.on = false;
    dragIdRef.current = null;
    pressRef.current = null;
  }, []);

  const zoomBtn = useCallback(
    (factor: number) => {
      userTouchedCameraRef.current = true;
      clearSatHover();
      const v = viewRef.current;
      v.k = Math.min(2.6, Math.max(0.35, v.k * factor));
      applyView();
    },
    [applyView, clearSatHover],
  );
  const fit = useCallback(() => {
    userTouchedCameraRef.current = true; // explicit camera action — auto-fit stays off
    clearSatHover();
    fitToContent();
  }, [fitToContent, clearSatHover]);

  // A family view whose subgraph collapsed to the center alone (no in-view edges
  // and no in-view satellites) — the center survives but has no knowledge of
  // this family in its neighborhood. Show a subtle in-canvas hint instead of the
  // drawer's generic empty state (which is reserved for a genuinely empty graph).
  const emptyFamily = activeFamily !== "all" && nodes.length <= 1 && satellites.length === 0;

  // ── highlight state (React-driven className/style; positions stay on refs) ──
  const activeId = hoverId ?? selectedId;
  const activeNeighbors = useMemo(() => (activeId ? neighbors(activeId) : null), [activeId, neighbors]);
  const hoverSat = hoverSatId ? renderedSats.find((s) => s.id === hoverSatId) ?? null : null;

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
            // Family filtering is now a TRUE VIEW (done in the drawer) — only
            // in-view edges are passed here, so the canvas only hover-dims.
            const dim = activeId && !touches;
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
          {/* satellite link lines — one thin family-tinted line per leaf to its
              host, drawn behind the dots. Faint (0.18) so a cluster reads as
              organized knowledge; dims with family/host filtering; a hovered
              leaf raises its line to 0.6. Positions driven by the draw loop. */}
          {renderedSats.map((sat) => {
            // In-view satellites only reach here (family filtering is a true
            // view in the drawer); dim only for hover/selection neighborhood.
            const hostActive = activeId === sat.hostId;
            const dim = !!activeId && !hostActive && !activeNeighbors?.has(sat.hostId);
            const hovered = sat.id === hoverSatId;
            const fam = colorForFamily(colors, sat.family);
            return (
              <line
                key={`satlink-${sat.id}`}
                ref={(el) => {
                  satLineElRef.current.set(sat.id, el);
                }}
                stroke={fam}
                strokeWidth={0.8}
                style={{ opacity: dim ? 0.04 : hovered ? 0.6 : 0.18, pointerEvents: "none" }}
              />
            );
          })}
          {/* satellites — small family-colored dots, real force-sim leaves */}
          {renderedSats.map((sat) => {
            const hostActive = activeId === sat.hostId;
            const dim = !!activeId && !hostActive && !activeNeighbors?.has(sat.hostId);
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
                onPointerEnter={() => showSatHover(sat.id)}
                onPointerLeave={() => onSatLeave(sat.id)}
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
            // Prominence: knowledge-heavy hosts read bigger (Obsidian degree
            // scaling). All downstream geometry (ring, label offset, facility
            // rect, small-label declutter) derives from this scaled r.
            const r = NODE_RADIUS[n.type] + hostRadiusBump(hostSatCount.get(n.id) ?? 0);
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
                onDoubleClick={(ev) => {
                  ev.stopPropagation();
                  if (pinnedRef.current.delete(n.id)) {
                    setPinned(new Set(pinnedRef.current));
                    alphaRef.current = 1; // released — let the sim reclaim it
                  }
                }}
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
                {pinned.has(n.id) && (
                  <circle r={r + 5} fill="none" stroke={colors.text.dim} strokeWidth={1} strokeDasharray="3 3">
                    <title>Pinned — double-click to release</title>
                  </circle>
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
        </g>
      </svg>

      {/* satellite hover card — an HTML overlay anchored to the hovered
          satellite's screen position (captured at hover start; static while
          hovering). Flips across the anchor to stay inside the stage. Shows the
          FULL value clearly — the operator's core ask. */}
      {hoverSat && hoverPos && (() => {
        const v = viewRef.current;
        const CARD_W = 260;
        const EST_H = 130;
        const flipX = hoverPos.x + 14 + CARD_W > v.vw;
        const flipY = hoverPos.y + 14 + EST_H > v.vh;
        const contested = hoverSat.status === "contested";
        const fam = colorForFamily(colors, hoverSat.family);
        const metaBits = [hoverSat.qualifier, hoverSat.asOf].filter(Boolean).join("  ·  ");
        return (
          <div
            style={{
              position: "absolute",
              left: flipX ? hoverPos.x - 14 : hoverPos.x + 14,
              top: flipY ? hoverPos.y - 14 : hoverPos.y + 14,
              transform: `${flipX ? "translateX(-100%)" : ""} ${flipY ? "translateY(-100%)" : ""}`.trim() || undefined,
              maxWidth: CARD_W,
              pointerEvents: "none",
              background: colors.bg.card,
              border: `1px solid ${colors.border.mid}`,
              borderRadius: 8,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              padding: "11px 13px",
              zIndex: 5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <i style={{ width: 9, height: 9, borderRadius: 2, background: fam, flex: "none" }} />
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
                {hoverSat.label}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  color: contested ? colors.accent.red : colors.accent.green,
                }}
              >
                {contested ? "CONTESTED" : "ACTIVE"}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, lineHeight: 1.3, wordBreak: "break-word" }}>
              {hoverSat.valueSnippet}
            </div>
            {metaBits && (
              <div style={{ marginTop: 6, fontSize: 11, color: colors.text.muted }}>{metaBits}</div>
            )}
            {hoverSat.provenance && (
              <div style={{ marginTop: 3, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10, color: colors.text.dim }}>
                {hoverSat.provenance}
              </div>
            )}
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: `1px solid ${colors.border.default}`, fontSize: 11, color: colors.text.muted }}>
              on <span style={{ color: colors.text.secondary, fontWeight: 600 }}>{hoverSat.hostName}</span>
            </div>
          </div>
        );
      })()}

      {/* empty-family hint — subtle, non-blocking; the center still renders */}
      {emptyFamily && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            color: colors.text.dim,
            fontSize: 12.5,
            background: colors.bg.card,
            border: `1px solid ${colors.border.default}`,
            borderRadius: 999,
            padding: "6px 15px",
            whiteSpace: "nowrap",
          }}
        >
          No {activeFamily} knowledge in this neighborhood — try another view
        </div>
      )}

      {/* zoom HUD */}
      <div style={{ position: "absolute", right: 14, top: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <button style={btn} title="Zoom in" onClick={() => zoomBtn(1.25)}>+</button>
        <button style={btn} title="Zoom out" onClick={() => zoomBtn(0.8)}>−</button>
        <button style={{ ...btn, fontSize: 11 }} title="Fit" onClick={fit}>fit</button>
      </div>
      <div style={{ position: "absolute", left: 16, bottom: 12, color: colors.text.dim, fontSize: 11, pointerEvents: "none" }}>
        drag canvas to pan · scroll to zoom · drag a node to arrange (it pins — double-click to release) · click a node for its atoms
      </div>
    </div>
  );
}
