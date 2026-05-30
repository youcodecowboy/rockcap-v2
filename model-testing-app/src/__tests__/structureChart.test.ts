// src/__tests__/structureChart.test.ts
import { describe, it, expect } from "vitest";
import { buildStructureChartSvg, svgToMarkdownImage } from "../lib/docgen/structureChart";
import { gradeStructure } from "../lib/structure/stressTest";
import { birkettHallGraph } from "../lib/structure/fixtures/birkettHall";

const graded = { ...birkettHallGraph, verdict: gradeStructure(birkettHallGraph) };

describe("buildStructureChartSvg", () => {
  const svg = buildStructureChartSvg(graded);
  it("is an svg sized to scale to its container", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="100%"');
    expect(svg).toContain("viewBox=");
  });
  it("renders every node name", () => {
    expect(svg).toContain("Woodham45 Ltd");
    expect(svg).toContain("Birkett Hall Homes Ltd");
    expect(svg).toContain("Bocking Homes Ltd");
  });
  it("draws inferred/band-only ownership edges dashed", () => {
    expect(svg).toContain("stroke-dasharray"); // band-only / soft edges
  });
  it("shows the verdict chip", () => {
    expect(svg).toContain("STRUCTURE: MEDIUM");
  });
  it("omits non-owned entities entirely (not part of the ownership structure)", () => {
    // D2P is in the graph data (it drives the verdict + Track Record) but is only
    // a directorship, not owned — so it must NOT appear in the ownership chart.
    expect(svg).not.toContain("D2P Billericay");
    expect(svg).not.toContain("PRIOR / NON-OWNED");
  });
  it("clusters parents over their children (people sit above Homes, not page-spread)", () => {
    const xOf = (name: string) => {
      const m = svg.match(new RegExp(`<text x="([0-9.]+)"[^>]*>${name}</text>`));
      return m ? parseFloat(m[1]) : NaN;
    };
    const thompson = xOf("Paul Thompson"), bedding = xOf("Mark Bedding"), homes = xOf("Birkett Hall Homes Ltd");
    expect(Number.isNaN(thompson) || Number.isNaN(bedding) || Number.isNaN(homes)).toBe(false);
    // The two owners must cluster tightly (≈ one box-width apart), not be flung to the page edges.
    // This is the real discriminator: BEFORE the barycenter pass they sit symmetrically at ~208/~592
    // (spread ~384); AFTER, they collapse to one box-width + gap apart (~186), directly above Homes.
    expect(Math.abs(thompson - bedding)).toBeLessThan(250);
    // ...and their midpoint sits above the holding company they own (holds before and after).
    expect(Math.abs((thompson + bedding) / 2 - homes)).toBeLessThan(120);
  });
});

describe("svgToMarkdownImage", () => {
  it("wraps the svg as a data-uri markdown image", () => {
    const md = svgToMarkdownImage("<svg></svg>", "Corporate structure");
    expect(md.startsWith("![Corporate structure](data:image/svg+xml,")).toBe(true);
  });
});
