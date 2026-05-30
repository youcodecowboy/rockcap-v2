// src/lib/docgen/structureChart.ts
// Renders a StructureGraph to a styled SVG laid out by OWNERSHIP HIERARCHY:
// owners sit above what they own; a child owned by two parents lands beneath both
// (a JV "diamond"); non-ownership context (former-employer / contractor reached
// only by `directs`) is pulled into a separate "prior / non-owned" strip so it is
// never woven into the ownership tree. Confidence styling: solid = filed,
// dashed = inferred/band-only, red dashed = flagged / not owned.
import type { StructureGraph, StructureNode, StructureEdge } from "../structure/types";

const W = 800, BOX_W = 168, BOX_H = 50, LEVEL_GAP = 104, TOP = 64, SIDE = 16, MIN_GAP = 18;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isOwnership = (e: StructureEdge) => e.relation === "owns" || e.relation === "psc";

export function buildStructureChartSvg(graph: StructureGraph): string {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const ownEdges = graph.edges.filter(isOwnership);
  const ownerSet = new Set<string>();
  for (const e of ownEdges) { ownerSet.add(e.from); ownerSet.add(e.to); }

  // A node is "context" (not in the ownership tree) if it is a former-employer /
  // contractor, or a company reached by no ownership edge (only directs/charges).
  const isContext = (n: StructureNode) =>
    n.role === "former-employer" || n.role === "contractor" || (n.kind === "company" && !ownerSet.has(n.id));
  const treeNodes = graph.nodes.filter((n) => !isContext(n));
  const contextNodes = graph.nodes.filter((n) => isContext(n));
  const inTree = new Set(treeNodes.map((n) => n.id));

  // ownership parent/child maps (tree-only)
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const e of ownEdges) {
    if (!inTree.has(e.from) || !inTree.has(e.to)) continue;
    (childrenOf.get(e.from) ?? childrenOf.set(e.from, []).get(e.from)!).push(e.to);
    (parentsOf.get(e.to) ?? parentsOf.set(e.to, []).get(e.to)!).push(e.from);
  }

  // rank bottom-up: rank(n) = 0 if owns nothing, else 1 + max(child rank). A JV
  // child's two owners thus share a level (both one above the shared child).
  const rankMemo = new Map<string, number>();
  const rankOf = (id: string, seen = new Set<string>()): number => {
    if (rankMemo.has(id)) return rankMemo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const kids = (childrenOf.get(id) ?? []).filter((k) => inTree.has(k));
    const r = kids.length ? 1 + Math.max(...kids.map((k) => rankOf(k, seen))) : 0;
    rankMemo.set(id, r);
    return r;
  };
  treeNodes.forEach((n) => rankOf(n.id));
  const maxRank = Math.max(0, ...treeNodes.map((n) => rankMemo.get(n.id) ?? 0));

  const levels: StructureNode[][] = [];
  for (const n of treeNodes) (levels[maxRank - (rankMemo.get(n.id) ?? 0)] ??= []).push(n);

  // x = barycenter of parents (top-down); even-spread fallback; then de-overlap + centre
  const pos = new Map<string, { x: number; y: number }>();
  const span = W - 2 * SIDE;
  for (let lv = 0; lv < levels.length; lv++) {
    const row = levels[lv] ?? [];
    row.forEach((n, i) => {
      const ps = (parentsOf.get(n.id) ?? []).map((p) => pos.get(p)?.x).filter((x): x is number => x != null);
      const x = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : SIDE + (span * (i + 0.5)) / row.length;
      pos.set(n.id, { x, y: TOP + lv * LEVEL_GAP });
    });
    const sorted = [...row].sort((a, b) => pos.get(a.id)!.x - pos.get(b.id)!.x);
    const step = BOX_W + MIN_GAP;
    for (let i = 1; i < sorted.length; i++) {
      const prev = pos.get(sorted[i - 1].id)!, cur = pos.get(sorted[i].id)!;
      if (cur.x - prev.x < step) cur.x = prev.x + step;
    }
    const xs = sorted.map((n) => pos.get(n.id)!.x);
    if (xs.length) {
      const shift = (W - (Math.max(...xs) - Math.min(...xs))) / 2 - Math.min(...xs);
      sorted.forEach((n) => {
        const p = pos.get(n.id)!;
        p.x = Math.max(SIDE + BOX_W / 2, Math.min(W - SIDE - BOX_W / 2, p.x + shift));
      });
    }
  }

  const ownEdgeSvg = ownEdges.filter((e) => inTree.has(e.from) && inTree.has(e.to)).map((e) => {
    const a = pos.get(e.from)!, z = pos.get(e.to)!;
    const soft = e.confidence === "soft" || (e.flags ?? []).includes("band-only");
    const dash = soft ? ' stroke-dasharray="5 4"' : "";
    const x1 = a.x, y1 = a.y + BOX_H / 2, x2 = z.x, y2 = z.y - BOX_H / 2;
    // label at the child end, nudged toward the parent so a two-parent child's
    // labels sit apart instead of stacking at the line midpoint.
    const label = e.detail
      ? `<text x="${x2 + (x1 - x2) * 0.28}" y="${y2 - 6}" font-size="8" fill="#555" text-anchor="middle">${esc(e.detail)}</text>`
      : "";
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888" stroke-width="1.2"${dash}/>${label}`;
  }).join("");

  const boxOf = (n: StructureNode, p: { x: number; y: number }, flagged = false) => {
    const x = p.x - BOX_W / 2, y = p.y - BOX_H / 2;
    const rx = n.kind === "person" ? 22 : 4;
    const isBorrower = n.role === "borrower";
    const fill = isBorrower ? "#141414" : "#ffffff";
    const tcol = isBorrower ? "#ffffff" : "#141414";
    const border = flagged ? "#b00020" : "#141414";
    const bdash = flagged ? ' stroke-dasharray="4 3"' : "";
    const sub = `${n.role && n.role !== "unknown" ? n.role.replace(/-/g, " ") : ""}${n.ref ? ` · ${n.ref}` : ""}`;
    return `<g><rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="${rx}" fill="${fill}" stroke="${border}" stroke-width="1"${bdash}/>` +
      `<text x="${p.x}" y="${p.y - 1}" font-size="9.5" font-weight="600" fill="${tcol}" text-anchor="middle">${esc(n.name)}</text>` +
      `<text x="${p.x}" y="${p.y + 12}" font-size="7.5" fill="${isBorrower ? "#bbbbbb" : "#777777"}" text-anchor="middle">${esc(sub)}</text></g>`;
  };
  const treeBoxes = treeNodes.map((n) => boxOf(n, pos.get(n.id)!)).join("");

  // context strip (prior / non-owned), drawn detached below the tree
  const treeBottom = TOP + Math.max(0, levels.length - 1) * LEVEL_GAP + BOX_H / 2;
  let contextSvg = "", H = treeBottom + 24;
  if (contextNodes.length) {
    const divY = treeBottom + 28, stripY = divY + 34;
    contextSvg += `<line x1="${SIDE}" y1="${divY}" x2="${W - SIDE}" y2="${divY}" stroke="#ddd" stroke-width="1" stroke-dasharray="2 3"/>`;
    contextSvg += `<text x="${SIDE}" y="${divY - 5}" font-size="8" fill="#999" letter-spacing="0.05em">PRIOR / NON-OWNED — NOT IN THE OWNERSHIP TREE</text>`;
    const slot = (W - 2 * SIDE) / contextNodes.length;
    contextNodes.forEach((n, i) => {
      const cx = SIDE + slot * (i + 0.5), cy = stripY + BOX_H / 2;
      contextSvg += boxOf(n, { x: cx, y: cy }, true);
      const d = graph.edges.find((e) => e.to === n.id && e.relation === "directs");
      const director = d ? nodeById.get(d.from)?.name : undefined;
      if (director) {
        const when = d?.detail ? ` (${esc(d.detail.replace(/^director,?\s*/i, ""))})` : "";
        contextSvg += `<text x="${cx}" y="${cy + BOX_H / 2 + 12}" font-size="7.5" fill="#b00020" text-anchor="middle">directed by ${esc(director)}${when} — not owned</text>`;
      }
    });
    H = stripY + BOX_H + 30;
  }

  const vc = graph.verdict.structureConfidence;
  const vcColor = vc === "high" ? "#1a7f37" : vc === "medium" ? "#9a6700" : "#b00020";
  const legend = `<g font-size="8" fill="#666">` +
    `<line x1="${SIDE}" y1="24" x2="${SIDE + 22}" y2="24" stroke="#888" stroke-width="1.2"/><text x="${SIDE + 28}" y="27">filed</text>` +
    `<line x1="${SIDE + 78}" y1="24" x2="${SIDE + 100}" y2="24" stroke="#888" stroke-width="1.2" stroke-dasharray="5 4"/><text x="${SIDE + 106}" y="27">inferred</text>` +
    `<rect x="${SIDE + 168}" y="19.5" width="14" height="9" fill="none" stroke="#b00020" stroke-width="1.2" stroke-dasharray="3 2"/><text x="${SIDE + 188}" y="27">flagged / not owned</text></g>`;
  const verdict = `<g><rect x="${W - 168 - SIDE}" y="12" width="168" height="18" rx="9" fill="${vcColor}"/>` +
    `<text x="${W - 84 - SIDE}" y="24.5" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">STRUCTURE: ${vc.toUpperCase()}</text></g>`;

  const Hc = Math.ceil(H);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hc}" width="100%" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif">` +
    `<rect x="0" y="0" width="${W}" height="${Hc}" fill="#ffffff"/>${legend}${verdict}${ownEdgeSvg}${treeBoxes}${contextSvg}</svg>`;
}

export function svgToMarkdownImage(svg: string, alt = "Corporate structure"): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![${alt}](data:image/svg+xml,${encoded})`;
}
