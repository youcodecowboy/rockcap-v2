// src/lib/docgen/structureChart.ts
import type { StructureGraph, StructureNode } from "../structure/types";

const W = 780, BOX_W = 156, BOX_H = 48, V_GAP = 92, TOP = 60, SIDE = 16;

function bandOf(n: StructureNode): number {
  switch (n.role) {
    case "person": return 0;
    case "sponsor-holding": return 1;
    case "borrower": case "landholder": case "jv-partner": case "pipeline": return 2;
    default: return n.kind === "person" ? 0 : 3;
  }
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildStructureChartSvg(graph: StructureGraph): string {
  const bands: StructureNode[][] = [[], [], [], []];
  for (const n of graph.nodes) bands[bandOf(n)].push(n);

  const pos = new Map<string, { x: number; y: number }>();
  bands.forEach((nodes, b) => {
    const slot = (W - 2 * SIDE) / (nodes.length || 1);
    nodes.forEach((node, i) => pos.set(node.id, { x: SIDE + slot * (i + 0.5), y: TOP + b * V_GAP }));
  });

  const edgeSvg = graph.edges.map((e) => {
    const a = pos.get(e.from), z = pos.get(e.to);
    if (!a || !z) return "";
    const flags = e.flags ?? [];
    const isSoft = e.confidence === "soft" || flags.some((f) => f === "band-only");
    const flagged = flags.some((f) => f === "director-not-owner" || f === "brand-not-borrower" || f === "unverified");
    const stroke = flagged ? "#b00" : "#888";
    const dash = isSoft || flagged ? ' stroke-dasharray="5 4"' : "";
    const mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2;
    const label = e.detail ? `<text x="${mx}" y="${my - 3}" font-size="8" fill="#666" text-anchor="middle">${esc(e.detail)}</text>` : "";
    return `<line x1="${a.x}" y1="${a.y + BOX_H / 2}" x2="${z.x}" y2="${z.y - BOX_H / 2}" stroke="${stroke}" stroke-width="1.2"${dash}/>${label}`;
  }).join("");

  const boxSvg = graph.nodes.map((n) => {
    const p = pos.get(n.id)!;
    const x = p.x - BOX_W / 2, y = p.y - BOX_H / 2;
    const rx = n.kind === "person" ? 20 : 4;
    const isBorrower = n.role === "borrower";
    const fill = isBorrower ? "#141414" : "#ffffff";
    const tcol = isBorrower ? "#ffffff" : "#141414";
    const sub = `${n.role && n.role !== "unknown" ? n.role.replace(/-/g, " ") : ""}${n.ref ? ` · ${n.ref}` : ""}`;
    return `<g><rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="${rx}" fill="${fill}" stroke="#141414" stroke-width="1"/>` +
      `<text x="${p.x}" y="${p.y - 1}" font-size="9.5" font-weight="600" fill="${tcol}" text-anchor="middle">${esc(n.name)}</text>` +
      `<text x="${p.x}" y="${p.y + 12}" font-size="7.5" fill="${isBorrower ? "#bbbbbb" : "#777777"}" text-anchor="middle">${esc(sub)}</text></g>`;
  }).join("");

  const vc = graph.verdict.structureConfidence;
  const vcColor = vc === "high" ? "#1a7f37" : vc === "medium" ? "#9a6700" : "#b00020";
  const legend = `<g font-size="8" fill="#666">` +
    `<line x1="${SIDE}" y1="22" x2="${SIDE + 22}" y2="22" stroke="#888" stroke-width="1.2"/><text x="${SIDE + 28}" y="25">filed</text>` +
    `<line x1="${SIDE + 78}" y1="22" x2="${SIDE + 100}" y2="22" stroke="#888" stroke-width="1.2" stroke-dasharray="5 4"/><text x="${SIDE + 106}" y="25">inferred</text>` +
    `<line x1="${SIDE + 168}" y1="22" x2="${SIDE + 190}" y2="22" stroke="#b00" stroke-width="1.2"/><text x="${SIDE + 196}" y="25">flagged</text></g>`;
  const verdict = `<g><rect x="${W - 160 - SIDE}" y="12" width="160" height="18" rx="9" fill="${vcColor}"/>` +
    `<text x="${W - 80 - SIDE}" y="24.5" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">STRUCTURE: ${vc.toUpperCase()}</text></g>`;

  const H = TOP + bands.length * V_GAP;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>${legend}${verdict}${edgeSvg}${boxSvg}</svg>`;
}

export function svgToMarkdownImage(svg: string, alt = "Corporate structure"): string {
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/"/g, "%22").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![${alt}](data:image/svg+xml,${encoded})`;
}
