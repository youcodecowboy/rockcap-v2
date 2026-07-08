"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColorPalette } from "@/lib/colors";
import { colorForDisplayType, displayTypeOf, type AtlasEdge, type AtlasNode } from "./atlasTypes";

// ── Force-sim constants ──────────────────────────────────────────────────────
// Hand-rolled damped force integrator on <canvas> (no d3 in this app — see
// package.json). Same force model family as the per-client drawer's GraphCanvas
// (range-limited inverse-square repulsion + edge springs + center gravity +
// velocity damping + alpha decay), retuned for org scale (hundreds–thousands of
// nodes) and made O(n·local density) with a spatial-hash grid on the repulsion
// pass — the all-pairs loop the drawer can afford at ~31 nodes cannot survive
// 10x–100x that.
const REPULSE = 1500;
const REPULSE_RANGE = 220;
const REPULSE_RANGE2 = REPULSE_RANGE * REPULSE_RANGE;
const REPULSE_CLAMP = 40;
/** Spatial-hash cell size — matched to the repulsion range so a node's 3×3
 * neighbourhood covers everything that can push it. */
const GRID = 220;
const SPRING_K = 0.028;
const SPRING_REST_BASE = 70;
const CENTER_PULL = 0.0009;
const DAMP = 0.85;
const ALPHA_DECAY = 0.004;
/** Below this the sim sleeps (draw continues; physics stops). */
const ALPHA_MIN = 0.02;
/** Soft collision: nodes push apart until their dots + a gap clear. */
const COLLIDE_GAP = 6;
const COLLIDE_K = 0.4;

// ── Zoom / LOD thresholds — kept in the drawer's spirit exactly ─────────────
/** k ≥ 1.3 → mini-labels appear on high-degree nodes (drawer: satellite
 * mini-labels at the same threshold). */
const LOD_MINI_LABELS = 1.3;
/** k ≥ 1.9 → all labels + dot growth (drawer: deep-zoom satellite growth). */
const LOD_ALL_LABELS = 1.9;
const DEEP_ZOOM_GROWTH = 1.3;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

/** Golden angle — spiral seeding (hubs seeded near the center, leaves out). */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const AUTOFIT_ALPHA = 0.3;
const AUTOFIT_DEADLINE_MS = 3000;
const AUTOFIT_PADDING = 70;

/** Camera-flight duration (search → node). */
const FLY_MS = 650;

function radiusOf(n: AtlasNode): number {
  // Sized by √degree (Obsidian degree scaling), floor for isolated nodes.
  return Math.min(16, 3 + 1.8 * Math.sqrt(Math.max(0, n.degree)));
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Camera {
  vw: number;
  vh: number;
  tx: number;
  ty: number;
  k: number;
}

interface Flight {
  t0: number;
  from: { tx: number; ty: number; k: number };
  to: { tx: number; ty: number; k: number };
}

export interface AtlasHover {
  node: AtlasNode;
  /** Screen-space anchor captured at hover start (static while hovering —
   * the drawer's hover-card behaviour). */
  x: number;
  y: number;
}

interface AtlasCanvasProps {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  focusKey: string | null;
  /** 1–2 hop spotlight around the focused node (computed by the view). */
  spotlightKeys: Set<string> | null;
  searchMatchKeys: Set<string>;
  /** Camera-flight request — nonce forces a re-fly to the same node. */
  flyTo: { key: string; nonce: number } | null;
  reducedMotion: boolean;
  colors: ColorPalette;
  onFocus: (key: string | null) => void;
  onHover?: (hover: AtlasHover | null) => void;
}

export default function AtlasCanvas({
  nodes,
  edges,
  focusKey,
  spotlightKeys,
  searchMatchKeys,
  flyTo,
  reducedMotion,
  colors,
  onFocus,
  onHover,
}: AtlasCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable sim state — kept out of React render (positions change every frame).
  const simRef = useRef<Map<string, Particle>>(new Map());
  const alphaRef = useRef(1);
  const pinnedRef = useRef<Set<string>>(new Set());
  const camRef = useRef<Camera>({ vw: 0, vh: 0, tx: 0, ty: 0, k: 0.6 });
  const flightRef = useRef<Flight | null>(null);
  const dragKeyRef = useRef<string | null>(null);
  const panRef = useRef({ on: false, px: 0, py: 0 });
  const pressRef = useRef<{ x: number; y: number; moved: boolean; key: string | null } | null>(null);
  const userTouchedCameraRef = useRef(false);
  const autoFitDoneRef = useRef(false);
  const simStartRef = useRef(0);

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const hoverKeyRef = useRef<string | null>(null);

  // Live mirrors for the rAF loop (loop is created once per data signature;
  // highlight props change without tearing it down).
  const focusKeyRef = useRef(focusKey);
  const spotlightRef = useRef(spotlightKeys);
  const searchMatchRef = useRef(searchMatchKeys);
  useEffect(() => { focusKeyRef.current = focusKey; }, [focusKey]);
  useEffect(() => { spotlightRef.current = spotlightKeys; }, [spotlightKeys]);
  useEffect(() => { searchMatchRef.current = searchMatchKeys; }, [searchMatchKeys]);
  const onFocusRef = useRef(onFocus);
  useEffect(() => { onFocusRef.current = onFocus; }, [onFocus]);
  const onHoverRef = useRef(onHover);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);

  const byKey = useMemo(() => {
    const m = new Map<string, AtlasNode>();
    for (const n of nodes) m.set(n.key, n);
    return m;
  }, [nodes]);

  // Adjacency (1-hop) — hover neighborhood highlight.
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.from)) m.set(e.from, new Set());
      if (!m.has(e.to)) m.set(e.to, new Set());
      m.get(e.from)!.add(e.to);
      m.get(e.to)!.add(e.from);
    }
    return m;
  }, [edges]);
  const adjacencyRef = useRef(adjacency);
  useEffect(() => { adjacencyRef.current = adjacency; }, [adjacency]);

  // Degree cutoff for the k≥1.3 mini-label LOD: top ~15% of degrees (min 3) —
  // "high-degree nodes get labels first", exactly the drawer's declutter idea.
  const miniLabelCutoff = useMemo(() => {
    if (!nodes.length) return Infinity;
    const degs = nodes.map((n) => n.degree).sort((a, b) => a - b);
    const q = degs[Math.min(degs.length - 1, Math.floor(degs.length * 0.85))];
    return Math.max(3, q);
  }, [nodes]);
  const miniLabelCutoffRef = useRef(miniLabelCutoff);
  useEffect(() => { miniLabelCutoffRef.current = miniLabelCutoff; }, [miniLabelCutoff]);

  const setHover = useCallback((key: string | null) => {
    if (hoverKeyRef.current === key) return;
    hoverKeyRef.current = key;
    setHoverKey(key);
    if (key) {
      const n = byKey.get(key);
      const p = simRef.current.get(key);
      const cam = camRef.current;
      if (n && p) {
        onHoverRef.current?.({ node: n, x: cam.tx + cam.k * p.x, y: cam.ty + cam.k * p.y });
        return;
      }
    }
    onHoverRef.current?.(null);
  }, [byKey]);

  // ── seed / reseed on node-set changes ──
  // Survivors keep their positions (filter toggles relax, not rebuild — the
  // drawer's family-view continuity rule); newcomers seed next to an already
  // placed neighbor when they have one, else on a degree-ordered golden-angle
  // spiral (hubs near the middle, leaves out) so the first settle is short.
  const nodeSig = useMemo(() => nodes.map((n) => n.key).join(","), [nodes]);
  useEffect(() => {
    const prev = simRef.current;
    const next = new Map<string, Particle>();
    const ordered = [...nodes].sort((a, b) => b.degree - a.degree);
    const spiralGap = 30 + 8 * Math.sqrt(ordered.length);
    ordered.forEach((n, i) => {
      const kept = prev.get(n.key);
      if (kept) {
        next.set(n.key, kept);
        return;
      }
      let x: number | undefined;
      let y: number | undefined;
      for (const nb of adjacency.get(n.key) ?? []) {
        const q = next.get(nb) ?? prev.get(nb);
        if (q) {
          x = q.x + (Math.random() - 0.5) * 60;
          y = q.y + (Math.random() - 0.5) * 60;
          break;
        }
      }
      if (x === undefined || y === undefined) {
        const ang = i * GOLDEN_ANGLE;
        const rad = spiralGap * Math.sqrt(i) * 0.9;
        x = Math.cos(ang) * rad + (Math.random() - 0.5) * 20;
        y = Math.sin(ang) * rad + (Math.random() - 0.5) * 20;
      }
      next.set(n.key, { x, y, vx: 0, vy: 0 });
    });
    for (const k of Array.from(pinnedRef.current)) if (!next.has(k)) pinnedRef.current.delete(k);
    simRef.current = next;
    // Alpha reheat on any node-set change (initial load + every filter change).
    alphaRef.current = prev.size ? 0.9 : 1;
    if (!prev.size) {
      autoFitDoneRef.current = false;
      simStartRef.current = performance.now();
    }
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSig]);

  // ── camera helpers ──
  const resize = useCallback(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cam = camRef.current;
    const first = cam.vw === 0;
    cam.vw = stage.clientWidth;
    cam.vh = stage.clientHeight;
    canvas.width = Math.round(cam.vw * dpr);
    canvas.height = Math.round(cam.vh * dpr);
    canvas.style.width = `${cam.vw}px`;
    canvas.style.height = `${cam.vh}px`;
    if (first) {
      cam.tx = cam.vw / 2;
      cam.ty = cam.vh / 2;
    }
  }, []);

  const fitToContent = useCallback(() => {
    const cam = camRef.current;
    if (!cam.vw || !cam.vh) return;
    const sim = simRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    for (const n of nodes) {
      const p = sim.get(n.key);
      if (!p) continue;
      const pad = radiusOf(n) + 24;
      minX = Math.min(minX, p.x - pad);
      maxX = Math.max(maxX, p.x + pad);
      minY = Math.min(minY, p.y - pad);
      maxY = Math.max(maxY, p.y + pad);
      count++;
    }
    if (!count) return;
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const k = Math.min(
      1.2,
      Math.max(ZOOM_MIN, Math.min((cam.vw - AUTOFIT_PADDING * 2) / bw, (cam.vh - AUTOFIT_PADDING * 2) / bh)),
    );
    cam.k = k;
    cam.tx = cam.vw / 2 - (k * (minX + maxX)) / 2;
    cam.ty = cam.vh / 2 - (k * (minY + maxY)) / 2;
  }, [nodes]);

  // Camera flight on search selection.
  useEffect(() => {
    if (!flyTo) return;
    const p = simRef.current.get(flyTo.key);
    const cam = camRef.current;
    if (!p || !cam.vw) return;
    const k = Math.max(cam.k, 1.5);
    const to = { tx: cam.vw / 2 - k * p.x, ty: cam.vh / 2 - k * p.y, k };
    userTouchedCameraRef.current = true;
    if (reducedMotion) {
      cam.tx = to.tx;
      cam.ty = to.ty;
      cam.k = to.k;
      flightRef.current = null;
    } else {
      flightRef.current = { t0: performance.now(), from: { tx: cam.tx, ty: cam.ty, k: cam.k }, to };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.nonce]);

  // ── main loop: physics + draw ──
  useEffect(() => {
    resize();
    let raf = 0;

    const step = () => {
      const alpha = alphaRef.current;
      if (alpha < ALPHA_MIN && !dragKeyRef.current) return;
      const sim = simRef.current;

      // Repulsion via spatial hash — O(n · local density).
      const grid = new Map<string, AtlasNode[]>();
      for (const n of nodes) {
        const p = sim.get(n.key);
        if (!p) continue;
        const key = `${Math.floor(p.x / GRID)},${Math.floor(p.y / GRID)}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(n);
        else grid.set(key, [n]);
      }
      for (const n of nodes) {
        const p = sim.get(n.key);
        if (!p) continue;
        const rN = radiusOf(n);
        const cx = Math.floor(p.x / GRID);
        const cy = Math.floor(p.y / GRID);
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          for (let gy = cy - 1; gy <= cy + 1; gy++) {
            const bucket = grid.get(`${gx},${gy}`);
            if (!bucket) continue;
            for (const other of bucket) {
              if (other.key === n.key) continue;
              const q = sim.get(other.key);
              if (!q) continue;
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              const d2 = dx * dx + dy * dy;
              if (d2 <= 0 || d2 > REPULSE_RANGE2) continue;
              const d = Math.sqrt(d2);
              let f = REPULSE / d2;
              if (f > REPULSE_CLAMP) f = REPULSE_CLAMP;
              p.vx += (dx / d) * f;
              p.vy += (dy / d) * f;
              // Soft collision — dots + gap never overlap at rest.
              const minSep = rN + radiusOf(other) + COLLIDE_GAP;
              if (d < minSep) {
                const push = (minSep - d) * COLLIDE_K;
                p.vx += (dx / d) * push;
                p.vy += (dy / d) * push;
              }
            }
          }
        }
      }

      // Springs. Strength eases off on hub endpoints (1/√minDegree) so a
      // lender fanned across 40 clients doesn't crush its whole neighborhood
      // into a knot — the d3-force link-strength heuristic.
      for (const e of edges) {
        const a = sim.get(e.from);
        const b = sim.get(e.to);
        const na = byKey.get(e.from);
        const nb = byKey.get(e.to);
        if (!a || !b || !na || !nb) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = SPRING_REST_BASE + radiusOf(na) + radiusOf(nb);
        const minDeg = Math.max(1, Math.min(na.degree, nb.degree));
        const f = ((d - rest) * SPRING_K) / Math.sqrt(minDeg);
        dx /= d;
        dy /= d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }

      // Center gravity + integrate.
      for (const n of nodes) {
        const p = sim.get(n.key);
        if (!p) continue;
        if (n.key === dragKeyRef.current || pinnedRef.current.has(n.key)) {
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.vx -= p.x * CENTER_PULL;
        p.vy -= p.y * CENTER_PULL;
        p.vx *= DAMP;
        p.vy *= DAMP;
        p.x += p.vx * alpha;
        p.y += p.vy * alpha;
      }
      alphaRef.current = Math.max(0, alpha - ALPHA_DECAY);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const cam = camRef.current;
      const dpr = window.devicePixelRatio || 1;
      const sim = simRef.current;

      // Background — near-black board with a faint radial breath, matching the
      // drawer's stage gradient but committed to dark (the board is a dark
      // surface in both app themes, like the sidebar chrome).
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = ctx.createRadialGradient(
        cam.vw / 2, cam.vh * 0.45, 0,
        cam.vw / 2, cam.vh * 0.45, Math.max(cam.vw, cam.vh) * 0.75,
      );
      bg.addColorStop(0, "#0e0e11");
      bg.addColorStop(1, "#060607");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cam.vw, cam.vh);

      // World transform.
      ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.tx, dpr * cam.ty);
      const k = cam.k;
      // Visible world bounds (for label culling; slack for circles).
      const wx0 = -cam.tx / k - 40;
      const wy0 = -cam.ty / k - 40;
      const wx1 = (cam.vw - cam.tx) / k + 40;
      const wy1 = (cam.vh - cam.ty) / k + 40;

      const focus = focusKeyRef.current;
      const spotlight = spotlightRef.current;
      const hovered = hoverKeyRef.current;
      const searchMatch = searchMatchRef.current;
      const adj = adjacencyRef.current;
      // Active highlight set: focus spotlight (1–2 hops) wins; else hover + 1 hop.
      let lit: Set<string> | null = null;
      let litCenter: string | null = null;
      if (focus && spotlight) {
        lit = spotlight;
        litCenter = focus;
      } else if (hovered) {
        lit = new Set(adj.get(hovered) ?? []);
        lit.add(hovered);
        litCenter = hovered;
      }

      // ── edges ──
      const deepGrowth = 1 + (DEEP_ZOOM_GROWTH - 1) * Math.min(1, Math.max(0, (k - LOD_ALL_LABELS) / 0.3));
      ctx.lineWidth = 1 / k;
      for (const e of edges) {
        const a = sim.get(e.from);
        const b = sim.get(e.to);
        if (!a || !b) continue;
        // Cull edges entirely outside the viewport.
        if (
          (a.x < wx0 && b.x < wx0) || (a.x > wx1 && b.x > wx1) ||
          (a.y < wy0 && b.y < wy0) || (a.y > wy1 && b.y > wy1)
        ) continue;
        const touchesLit = lit ? lit.has(e.from) && lit.has(e.to) : true;
        const touchesCenter = litCenter !== null && (e.from === litCenter || e.to === litCenter);
        const contested = e.status === "contested";
        // Opacity scales with confidence×salience when present (spec).
        const w = (e.confidence ?? 1) * (e.salience ?? 1);
        let alpha = (e.kind === "native" ? 0.1 : 0.16) * (0.35 + 0.65 * w);
        if (lit) alpha = touchesLit ? (touchesCenter ? 0.55 : 0.35) : 0.02;
        ctx.strokeStyle = contested ? colors.accent.red : "#8a93a6";
        ctx.globalAlpha = contested ? Math.max(alpha, lit && !touchesLit ? 0.02 : 0.3) : alpha;
        if (e.kind === "native") ctx.setLineDash([5 / k, 5 / k]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (e.kind === "native") ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;

      // ── nodes: glow halo + core dot ──
      // Two fills per node instead of shadowBlur — shadowBlur is a per-call
      // raster blur and collapses the frame rate at 1000+ nodes.
      for (const n of nodes) {
        const p = sim.get(n.key);
        if (!p) continue;
        if (p.x < wx0 || p.x > wx1 || p.y < wy0 || p.y > wy1) continue;
        const isLit = !lit || lit.has(n.key);
        const isFocus = n.key === focus;
        const isHover = n.key === hovered;
        const isMatch = searchMatch.has(n.key);
        const c = colorForDisplayType(colors, displayTypeOf(n));
        const r = radiusOf(n) * deepGrowth;
        const dim = lit && !isLit;

        // Halo (the glow). Search matches and the lit center glow harder.
        ctx.globalAlpha = dim ? 0.03 : isMatch ? 0.4 : isFocus || isHover ? 0.3 : 0.14;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * (isMatch ? 3 : 2.3), 0, Math.PI * 2);
        ctx.fill();

        // Core.
        ctx.globalAlpha = dim ? 0.12 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Contested tint — warning ring (drawer: red ring on contested satellites).
        if (n.contestedCount > 0) {
          ctx.globalAlpha = dim ? 0.1 : 0.9;
          ctx.strokeStyle = colors.accent.red;
          ctx.lineWidth = 1.4 / k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 2.5 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Focus ring.
        if (isFocus) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.6 / k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Pin ring (drag-to-pin, matching the drawer's pin-where-you-drop).
        if (pinnedRef.current.has(n.key) && !isFocus) {
          ctx.globalAlpha = dim ? 0.1 : 0.5;
          ctx.strokeStyle = "#8a93a6";
          ctx.lineWidth = 1 / k;
          ctx.setLineDash([3 / k, 3 / k]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5 / k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;

      // ── labels (zoom LOD, drawer thresholds) ──
      //   k ≥ 1.3 → mini-labels on high-degree nodes
      //   k ≥ 1.9 → labels on everything in view
      //   any zoom → hovered / focused / spotlit / search-matched nodes
      const allLabels = k >= LOD_ALL_LABELS;
      const miniLabels = k >= LOD_MINI_LABELS;
      const cutoff = miniLabelCutoffRef.current;
      if (miniLabels || lit || searchMatch.size) {
        for (const n of nodes) {
          const p = sim.get(n.key);
          if (!p) continue;
          if (p.x < wx0 || p.x > wx1 || p.y < wy0 || p.y > wy1) continue;
          const isLit = lit?.has(n.key) ?? false;
          const isMatch = searchMatch.has(n.key);
          const show =
            allLabels || (miniLabels && n.degree >= cutoff) || isLit || isMatch ||
            n.key === hovered || n.key === focus;
          if (!show) continue;
          if (lit && !isLit && !isMatch && n.key !== focus) continue; // dimmed nodes stay unlabeled
          const r = radiusOf(n) * deepGrowth;
          const primary = allLabels || isLit || isMatch || n.key === hovered || n.key === focus;
          // Constant screen-size text: world font = screen px / k.
          ctx.font = `${primary ? 600 : 500} ${(primary ? 11 : 10) / k}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillStyle = primary ? "#e5e5e5" : "#8a8a8a";
          ctx.globalAlpha = primary ? 0.95 : 0.75;
          ctx.fillText(n.name, p.x, p.y + r + 13 / k);
        }
        ctx.globalAlpha = 1;
      }
    };

    const loop = () => {
      step();
      // Camera flight.
      const flight = flightRef.current;
      if (flight) {
        const t = Math.min(1, (performance.now() - flight.t0) / FLY_MS);
        const e = easeInOutCubic(t);
        const cam = camRef.current;
        cam.tx = flight.from.tx + (flight.to.tx - flight.from.tx) * e;
        cam.ty = flight.from.ty + (flight.to.ty - flight.from.ty) * e;
        cam.k = flight.from.k + (flight.to.k - flight.from.k) * e;
        if (t >= 1) flightRef.current = null;
      }
      // One-shot auto-fit after the first settle (never after the user pans/zooms).
      if (
        !autoFitDoneRef.current &&
        !userTouchedCameraRef.current &&
        (alphaRef.current < AUTOFIT_ALPHA || performance.now() - simStartRef.current > AUTOFIT_DEADLINE_MS)
      ) {
        autoFitDoneRef.current = true;
        fitToContent();
      }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [nodes, edges, byKey, colors, resize, fitToContent]);

  // ── hit testing ──
  const hitTest = useCallback(
    (clientX: number, clientY: number): string | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cam = camRef.current;
      const wx = (clientX - rect.left - cam.tx) / cam.k;
      const wy = (clientY - rect.top - cam.ty) / cam.k;
      const slack = 5 / cam.k;
      let best: string | null = null;
      let bestD = Infinity;
      const sim = simRef.current;
      for (const n of nodes) {
        const p = sim.get(n.key);
        if (!p) continue;
        const r = radiusOf(n) + slack;
        const dx = wx - p.x;
        const dy = wy - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 < bestD) {
          bestD = d2;
          best = n.key;
        }
      }
      return best;
    },
    [nodes],
  );

  // ── pointer / wheel handlers (drawer's click-vs-drag discrimination) ──
  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      const key = hitTest(ev.clientX, ev.clientY);
      pressRef.current = { x: ev.clientX, y: ev.clientY, moved: false, key };
      if (key) {
        dragKeyRef.current = key;
      } else {
        panRef.current = { on: true, px: ev.clientX, py: ev.clientY };
        userTouchedCameraRef.current = true;
        flightRef.current = null;
      }
      setHover(null);
      canvasRef.current?.setPointerCapture(ev.pointerId);
    },
    [hitTest, setHover],
  );

  const onPointerMove = useCallback(
    (ev: React.PointerEvent) => {
      const press = pressRef.current;
      if (press && !press.moved && Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > 4) {
        press.moved = true;
      }
      const cam = camRef.current;
      if (dragKeyRef.current) {
        if (!press?.moved) return; // sub-threshold jitter stays a click
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const p = simRef.current.get(dragKeyRef.current);
        if (p) {
          p.x = (ev.clientX - rect.left - cam.tx) / cam.k;
          p.y = (ev.clientY - rect.top - cam.ty) / cam.k;
          p.vx = 0;
          p.vy = 0;
          alphaRef.current = Math.max(alphaRef.current, 0.4);
        }
        return;
      }
      if (panRef.current.on) {
        cam.tx += ev.clientX - panRef.current.px;
        cam.ty += ev.clientY - panRef.current.py;
        panRef.current.px = ev.clientX;
        panRef.current.py = ev.clientY;
        return;
      }
      setHover(hitTest(ev.clientX, ev.clientY));
    },
    [hitTest, setHover],
  );

  const onPointerUp = useCallback(() => {
    const press = pressRef.current;
    if (press) {
      if (!press.moved) {
        // Stationary press = click: focus a node, or clear on empty canvas.
        onFocusRef.current(press.key);
      } else if (press.key) {
        // Pin-where-you-drop (session-only) — double-click releases.
        pinnedRef.current.add(press.key);
      }
    }
    dragKeyRef.current = null;
    panRef.current.on = false;
    pressRef.current = null;
  }, []);

  const onDoubleClick = useCallback(
    (ev: React.MouseEvent) => {
      const key = hitTest(ev.clientX, ev.clientY);
      if (key && pinnedRef.current.delete(key)) {
        alphaRef.current = Math.max(alphaRef.current, 0.6);
      }
    },
    [hitTest],
  );

  const onWheel = useCallback(
    (ev: React.WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      userTouchedCameraRef.current = true;
      flightRef.current = null;
      setHover(null);
      const cam = camRef.current;
      const nk = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.k * (ev.deltaY < 0 ? 1.12 : 0.89)));
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const my = ev.clientY - rect.top;
      cam.tx = mx - ((mx - cam.tx) * nk) / cam.k;
      cam.ty = my - ((my - cam.ty) * nk) / cam.k;
      cam.k = nk;
    },
    [setHover],
  );

  // Native non-passive wheel listener — React's synthetic onWheel is passive on
  // some browsers and preventDefault (needed to stop page scroll) is ignored.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const block = (ev: WheelEvent) => ev.preventDefault();
    canvas.addEventListener("wheel", block, { passive: false });
    return () => canvas.removeEventListener("wheel", block);
  }, []);

  const zoomBtn = useCallback((factor: number) => {
    userTouchedCameraRef.current = true;
    flightRef.current = null;
    const cam = camRef.current;
    const nk = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.k * factor));
    const mx = cam.vw / 2;
    const my = cam.vh / 2;
    cam.tx = mx - ((mx - cam.tx) * nk) / cam.k;
    cam.ty = my - ((my - cam.ty) * nk) / cam.k;
    cam.k = nk;
  }, []);

  const fit = useCallback(() => {
    userTouchedCameraRef.current = true;
    flightRef.current = null;
    fitToContent();
  }, [fitToContent]);

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
    <div ref={stageRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          cursor: dragKeyRef.current ? "grabbing" : hoverKey ? "pointer" : "grab",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          // Leaving mid-press is neither a click nor a pin — just abort.
          pressRef.current = null;
          dragKeyRef.current = null;
          panRef.current.on = false;
          setHover(null);
        }}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      />
      {/* zoom HUD — drawer idiom */}
      <div style={{ position: "absolute", right: 14, top: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <button style={btn} title="Zoom in" onClick={() => zoomBtn(1.25)}>+</button>
        <button style={btn} title="Zoom out" onClick={() => zoomBtn(0.8)}>−</button>
        <button style={{ ...btn, fontSize: 11 }} title="Fit" onClick={fit}>fit</button>
      </div>
      <div style={{ position: "absolute", left: 16, bottom: 12, color: colors.text.dim, fontSize: 11, pointerEvents: "none" }}>
        drag canvas to pan · scroll to zoom · drag a node to arrange (it pins — double-click to release) · click a node for its atoms · esc to clear
      </div>
    </div>
  );
}
