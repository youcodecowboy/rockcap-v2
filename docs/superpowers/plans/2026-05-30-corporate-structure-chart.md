# Corporate Structure Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover a developer's corporate structure, grade its evidence/confidence with a verdict, render it to a styled SVG, and embed that one artefact in the prospect Intel tab and in lender briefs.

**Architecture:** A reusable `StructureGraph` JSON model is the single source. A pure grader (`gradeStructure`) assigns a high/med/low verdict from the graph's evidence flags. A pure renderer (`buildStructureChartSvg`) lays the graph out in role bands and emits a confidence-styled SVG. The brief embeds the SVG inline (Chromium renders SVG natively); the Intel tab embeds it as a `data:image/svg+xml` markdown image. Discovery reuses prospect-intel's hardened officer-walk (step 8b).

**Tech Stack:** TypeScript, Vitest, the existing `src/lib/docgen` render engine, `react-markdown` (Intel tab), Convex + the MCP tool surface (optional Task 7).

**Spec:** `docs/superpowers/specs/2026-05-30-corporate-structure-chart-design.md`

---

## File Structure

- `model-testing-app/src/lib/structure/types.ts` — the `StructureGraph` schema (types only).
- `model-testing-app/src/lib/structure/fixtures/birkettHall.ts` — the Birkett Hall / Woodham worked-example graph, used by tests + the example render.
- `model-testing-app/src/lib/structure/stressTest.ts` — `gradeStructure(graph) → StructureVerdict` (pure).
- `model-testing-app/src/lib/docgen/structureChart.ts` — `buildStructureChartSvg(graph) → string` + `svgToMarkdownImage(svg, alt) → string` (pure).
- `model-testing-app/src/lib/docgen/layouts/lenderBrief.ts` — MODIFY: one CSS rule so an inline SVG scales inside a section.
- `model-testing-app/src/components/prospects/tabs/IntelTab.tsx` — MODIFY: allow `data:image/svg+xml` images through react-markdown.
- `model-testing-app/src/__tests__/structureGrade.test.ts` — tests for `gradeStructure`.
- `model-testing-app/src/__tests__/structureChart.test.ts` — tests for the renderer (+ optional Chromium-gated render).
- `skills/skills/corporate-structure/SKILL.md` — the new skill.
- `skills/sub-skills/resolve-related-entities.md` — MODIFY: emit the `StructureGraph`.
- `skills/shared-references/doc-type-lender-brief.md` — MODIFY: add the optional "Corporate Structure" section.
- `skills/skills/README.md` — MODIFY: add the skill to the status table.
- `skills/CATALOGUE.md` — MODIFY (Task 7 only): add `companies.mapGroup`.

---

## Task 1: Structure-graph types + Birkett Hall fixture

**Files:**
- Create: `model-testing-app/src/lib/structure/types.ts`
- Create: `model-testing-app/src/lib/structure/fixtures/birkettHall.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/structure/types.ts
export type NodeKind = "company" | "person";
export type NodeRole =
  | "borrower" | "landholder" | "sponsor-holding" | "jv-partner"
  | "former-employer" | "contractor" | "pipeline" | "unknown";
export type EdgeRelation = "owns" | "directs" | "charges" | "psc";
export type Confidence = "hard" | "soft";
export type EdgeFlag =
  | "director-not-owner" | "brand-not-borrower" | "band-only"
  | "ceased" | "dissolved" | "unverified";
export type StructureConfidence = "high" | "medium" | "low";

export interface StructureNode {
  id: string;                 // CH number for companies; slug/officer-id for people
  kind: NodeKind;
  name: string;
  ref?: string;               // CH number / CH officer appointment id
  status?: "active" | "dissolved" | "ceased";
  role?: NodeRole;
  meta?: Record<string, string | number>;
}
export interface StructureEdge {
  from: string;               // node id
  to: string;                 // node id
  relation: EdgeRelation;
  detail?: string;            // "25–50%", "75%+", "director appt 2024-12-03", lender + date
  evidence: { source: string; url?: string; filing?: string };
  confidence: Confidence;
  flags?: EdgeFlag[];
}
export interface StructureVerdict {
  structureConfidence: StructureConfidence;
  rationale: string;
  openQuestions: string[];
}
export interface StructureGraph {
  subjectClientId: string;
  asOf: string;               // ISO date; passed in (never Date.now())
  nodes: StructureNode[];
  edges: StructureEdge[];
  verdict: StructureVerdict;
}
```

- [ ] **Step 2: Write the Birkett Hall fixture** (real data gathered 2026-05-30; `verdict` left empty — Task 2 fills it)

```ts
// src/lib/structure/fixtures/birkettHall.ts
import type { StructureGraph } from "../types";

export const birkettHallGraph: StructureGraph = {
  subjectClientId: "kn78czrp5pdw17cs86aneexsss85ap0w",
  asOf: "2026-05-30",
  nodes: [
    { id: "paul-thompson", kind: "person", name: "Paul Thompson" },
    { id: "mark-bedding", kind: "person", name: "Mark Bedding" },
    { id: "16115992", kind: "company", name: "Birkett Hall Homes Ltd", ref: "16115992", status: "active", role: "sponsor-holding" },
    { id: "15751971", kind: "company", name: "Birkett Hall Developments Ltd", ref: "15751971", status: "active", role: "landholder", meta: { charges: 3 } },
    { id: "17131507", kind: "company", name: "Woodham45 Ltd", ref: "17131507", status: "active", role: "borrower", meta: { charges: 0 } },
    { id: "10818893", kind: "company", name: "Bocking Homes Ltd", ref: "10818893", status: "active", role: "jv-partner" },
    { id: "15077959", kind: "company", name: "D2P Billericay Ltd", ref: "15077959", status: "active", role: "former-employer" },
  ],
  edges: [
    { from: "paul-thompson", to: "16115992", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC", url: "https://find-and-update.company-information.service.gov.uk/company/16115992/persons-with-significant-control" }, confidence: "hard", flags: ["band-only"] },
    { from: "mark-bedding", to: "16115992", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC" }, confidence: "hard", flags: ["band-only"] },
    { from: "16115992", to: "17131507", relation: "psc", detail: "75%+", evidence: { source: "CH PSC", url: "https://find-and-update.company-information.service.gov.uk/company/17131507/persons-with-significant-control" }, confidence: "hard" },
    { from: "16115992", to: "15751971", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC" }, confidence: "hard", flags: ["band-only"] },
    { from: "10818893", to: "15751971", relation: "psc", detail: "25–50%", evidence: { source: "CH PSC" }, confidence: "hard", flags: ["band-only"] },
    { from: "paul-thompson", to: "15077959", relation: "directs", detail: "director, resigned 2024", evidence: { source: "CH officer appointments" }, confidence: "hard", flags: ["director-not-owner"] },
  ],
  verdict: { structureConfidence: "low", rationale: "", openQuestions: [] },
};
```

- [ ] **Step 3: Commit**

```bash
git add model-testing-app/src/lib/structure/types.ts model-testing-app/src/lib/structure/fixtures/birkettHall.ts
git commit -m "feat(structure): StructureGraph schema + Birkett Hall fixture"
```

---

## Task 2: `gradeStructure` (stress-test grader)

**Files:**
- Create: `model-testing-app/src/lib/structure/stressTest.ts`
- Test: `model-testing-app/src/__tests__/structureGrade.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/structureGrade.test.ts
import { describe, it, expect } from "vitest";
import { gradeStructure } from "../lib/structure/stressTest";
import type { StructureGraph } from "../lib/structure/types";
import { birkettHallGraph } from "../lib/structure/fixtures/birkettHall";

const base = (over: Partial<StructureGraph> = {}): StructureGraph => ({
  subjectClientId: "c1", asOf: "2026-05-30", nodes: [], edges: [],
  verdict: { structureConfidence: "low", rationale: "", openQuestions: [] }, ...over,
});

describe("gradeStructure", () => {
  it("returns low when no borrower node is present", () => {
    const v = gradeStructure(base({ nodes: [{ id: "x", kind: "company", name: "X", role: "sponsor-holding" }] }));
    expect(v.structureConfidence).toBe("low");
    expect(v.openQuestions.join(" ")).toMatch(/borrower/i);
  });

  it("returns high when borrower ownership is all hard and unflagged", () => {
    const v = gradeStructure(base({
      nodes: [
        { id: "b", kind: "company", name: "B", role: "borrower" },
        { id: "h", kind: "company", name: "H", role: "sponsor-holding" },
      ],
      edges: [{ from: "h", to: "b", relation: "psc", detail: "75%+", evidence: { source: "CH" }, confidence: "hard" }],
    }));
    expect(v.structureConfidence).toBe("high");
  });

  it("returns medium when a director-not-owner edge is present", () => {
    const v = gradeStructure(base({
      nodes: [
        { id: "b", kind: "company", name: "B", role: "borrower" },
        { id: "x", kind: "company", name: "X", role: "former-employer" },
      ],
      edges: [
        { from: "h", to: "b", relation: "psc", detail: "75%+", evidence: { source: "CH" }, confidence: "hard" },
        { from: "p", to: "x", relation: "directs", evidence: { source: "CH" }, confidence: "hard", flags: ["director-not-owner"] },
      ],
    }));
    expect(v.structureConfidence).toBe("medium");
    expect(v.openQuestions.some((q) => /directed, not owned/i.test(q))).toBe(true);
  });

  it("returns low when an unverified candidate node exists", () => {
    const v = gradeStructure(base({
      nodes: [
        { id: "b", kind: "company", name: "B", role: "borrower" },
        { id: "u", kind: "company", name: "Maybe SPV", role: "unknown" },
      ],
      edges: [{ from: "h", to: "b", relation: "psc", evidence: { source: "CH" }, confidence: "hard" }],
    }));
    expect(v.structureConfidence).toBe("low");
  });

  it("grades the Birkett Hall fixture as medium with a JV open question", () => {
    const v = gradeStructure(birkettHallGraph);
    expect(v.structureConfidence).toBe("medium");
    expect(v.openQuestions.some((q) => /Bocking/i.test(q))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureGrade.test.ts`
Expected: FAIL — `gradeStructure` is not defined.

- [ ] **Step 3: Implement `gradeStructure`**

```ts
// src/lib/structure/stressTest.ts
import type { StructureGraph, StructureVerdict } from "./types";

export function gradeStructure(graph: StructureGraph): StructureVerdict {
  const openQuestions: string[] = [];
  const borrower = graph.nodes.find((n) => n.role === "borrower");
  if (!borrower) {
    return {
      structureConfidence: "low",
      rationale: "Borrower entity not identified in the structure.",
      openQuestions: ["Identify the legal borrower SPV (walk controllers' appointments + scheme-name search)."],
    };
  }

  const ownEdges = graph.edges.filter((e) => e.to === borrower.id && (e.relation === "owns" || e.relation === "psc"));
  const softOwn = ownEdges.some((e) => e.confidence === "soft" || (e.flags ?? []).includes("band-only"));
  const hasUnverified = graph.nodes.some((n) => n.role === "unknown") || graph.edges.some((e) => (e.flags ?? []).includes("unverified"));
  const directorNotOwner = graph.edges.filter((e) => (e.flags ?? []).includes("director-not-owner"));
  const brandNotBorrower = graph.edges.some((e) => (e.flags ?? []).includes("brand-not-borrower"));

  if (brandNotBorrower) openQuestions.push("Confirm the legal borrower vs the brand named in the documents.");
  for (const e of directorNotOwner) {
    const n = graph.nodes.find((x) => x.id === e.to);
    openQuestions.push(`Do not credit ${n?.name ?? e.to} as the sponsor's own scheme — directed, not owned.`);
  }
  const jv = graph.nodes.find((n) => n.role === "jv-partner");
  if (jv) openQuestions.push(`Confirm whether ${jv.name} (JV partner) participates in the development phase.`);

  let structureConfidence: StructureVerdict["structureConfidence"];
  if (hasUnverified) structureConfidence = "low";
  else if (softOwn || directorNotOwner.length > 0 || brandNotBorrower) structureConfidence = "medium";
  else structureConfidence = "high";

  const rationale =
    structureConfidence === "high"
      ? "Borrower and ownership chain are all filed declarations; no unresolved structural questions."
      : structureConfidence === "medium"
        ? "Some ownership is band-only/inferred or there are directorships that are not ownership; resolve the open questions before relying on the structure."
        : "The structure may be incomplete (an unconfirmed or unidentified entity); re-search before relying on it.";

  return { structureConfidence, rationale, openQuestions };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureGrade.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/src/lib/structure/stressTest.ts model-testing-app/src/__tests__/structureGrade.test.ts
git commit -m "feat(structure): gradeStructure verdict (hard/soft + flags -> high/med/low)"
```

---

## Task 3: `buildStructureChartSvg` renderer

**Files:**
- Create: `model-testing-app/src/lib/docgen/structureChart.ts`
- Test: `model-testing-app/src/__tests__/structureChart.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
  it("draws inferred/band-only edges dashed and flagged edges in red", () => {
    expect(svg).toContain("stroke-dasharray"); // band-only / soft edges
    expect(svg).toContain("#b00");             // director-not-owner edge
  });
  it("shows the verdict chip", () => {
    expect(svg).toContain("STRUCTURE: MEDIUM");
  });
});

describe("svgToMarkdownImage", () => {
  it("wraps the svg as a data-uri markdown image", () => {
    const md = svgToMarkdownImage("<svg></svg>", "Corporate structure");
    expect(md.startsWith("![Corporate structure](data:image/svg+xml,")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureChart.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the renderer**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureChart.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: (Optional) add a Chromium-gated visual render** to `structureChart.test.ts`, mirroring `lenderBriefExample.test.ts`:

```ts
const canRunPdf = !!process.env.CHROMIUM_EXECUTABLE_PATH;
it.skipIf(!canRunPdf)("renders the chart to /tmp/structure.html for eyeballing", async () => {
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/structure.html", `<!doctype html><body style="margin:24px">${buildStructureChartSvg(graded)}</body>`);
  expect(true).toBe(true);
});
```

- [ ] **Step 6: Commit**

```bash
git add model-testing-app/src/lib/docgen/structureChart.ts model-testing-app/src/__tests__/structureChart.test.ts
git commit -m "feat(structure): buildStructureChartSvg renderer (role-band layout, confidence styling)"
```

---

## Task 4: Embed the chart in the lender brief

The brief's `briefData.sections[].bodyHtml` is injected raw, so the composer can drop `buildStructureChartSvg(graph)` straight into a "Corporate Structure" section. The only engine change is a CSS rule so the SVG scales.

**Files:**
- Modify: `model-testing-app/src/lib/docgen/layouts/lenderBrief.ts` (CSS block, near `.brief-section .sub`)
- Modify: `model-testing-app/src/__tests__/lenderBriefLayout.test.ts`
- Modify: `skills/shared-references/doc-type-lender-brief.md`

- [ ] **Step 1: Add the failing assertion** to `lenderBriefLayout.test.ts` (inside the existing `buildLenderBriefHtml` describe):

```ts
it("scales an inline SVG to the section width", () => {
  expect(html).toContain(".brief-section svg { width: 100%; height: auto;");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd model-testing-app && npx vitest run src/__tests__/lenderBriefLayout.test.ts`
Expected: FAIL — assertion not met.

- [ ] **Step 3: Add the CSS rule** in `lenderBrief.ts`, immediately after the `.brief-section .sub { ... }` line:

```ts
  .brief-section svg { width: 100%; height: auto; display: block; margin: 6px 0 10px; }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd model-testing-app && npx vitest run src/__tests__/lenderBriefLayout.test.ts`
Expected: PASS.

- [ ] **Step 5: Document the section** — append to `doc-type-lender-brief.md` Section set, after item 8:

```markdown
9. **Corporate Structure** *(optional; include when the structure is non-trivial — JVs, multiple SPVs, a brand ≠ borrower split)*. Inline the SVG from `buildStructureChartSvg(graph)` plus the verdict's open questions as caption text. Place it after Borrower & Sponsor.
```

- [ ] **Step 6: Commit**

```bash
git add model-testing-app/src/lib/docgen/layouts/lenderBrief.ts model-testing-app/src/__tests__/lenderBriefLayout.test.ts skills/shared-references/doc-type-lender-brief.md
git commit -m "feat(structure): inline SVG section in lender brief (CSS scale + doc-type section)"
```

---

## Task 5: Embed the chart in the Intel tab

`react-markdown` (v10) sanitises URLs and strips `data:` by default. Allow `data:image/svg+xml` (content is system-generated and trusted) via a custom `urlTransform`.

**Files:**
- Modify: `model-testing-app/src/components/prospects/tabs/IntelTab.tsx`

- [ ] **Step 1: Locate the `<ReactMarkdown>` usage** in `IntelTab.tsx` (it renders `intelMarkdown` with `remarkPlugins={[remarkGfm]}`).

- [ ] **Step 2: Add a urlTransform that permits generated SVG data-URIs.** Above the component, add:

```tsx
import { defaultUrlTransform } from "react-markdown";

// Generated structure charts are embedded as data:image/svg+xml by the
// corporate-structure skill. That content is system-generated (no scripts),
// so allow it through; everything else uses react-markdown's safe default.
function allowSvgDataUri(url: string): string {
  if (url.startsWith("data:image/svg+xml,") || url.startsWith("data:image/svg+xml;")) return url;
  return defaultUrlTransform(url);
}
```

- [ ] **Step 3: Pass it to ReactMarkdown:**

```tsx
<ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={allowSvgDataUri}>
  {intelMarkdown}
</ReactMarkdown>
```

- [ ] **Step 4: Verify the build typechecks**

Run: `cd model-testing-app && npx next build`
Expected: compiles (route manifest prints); no type errors in `IntelTab.tsx`.

- [ ] **Step 5: Manual visual check** — render the Birkett fixture to a data-URI and paste into a prospect's `intelMarkdown` in dev; confirm the chart shows in the Intel tab. (No automated test — this is a React render path; the SVG + data-URI helper are already unit-tested in Task 3.)

- [ ] **Step 6: Commit**

```bash
git add model-testing-app/src/components/prospects/tabs/IntelTab.tsx
git commit -m "feat(structure): allow generated SVG data-uri charts in the Intel tab"
```

---

## Task 6: The `corporate-structure` skill + discovery wiring

**Files:**
- Create: `skills/skills/corporate-structure/SKILL.md`
- Modify: `skills/sub-skills/resolve-related-entities.md`
- Modify: `skills/skills/README.md`

- [ ] **Step 1: Write `skills/skills/corporate-structure/SKILL.md`** with this content:

```markdown
# corporate-structure

Discover, stress-test, and chart a prospect/borrower's corporate structure. Produces a `StructureGraph` (persisted on the skillRun) and a styled SVG that renders in the prospect Intel tab and embeds in lender briefs and future documents.

## Trigger
- Operator: "map / chart the structure of {client}".
- Invoked by `prospect-intel` step 8b as part of intel.

## Inputs
Required: `clientId`. Optional: `schemeName` (improves the scheme-name search), `tier` ("direct" default, or "expand").

## Workflow
1. `skillRun.start` (dedupKey `structure:${clientId}`, window 1 day).
2. **Resolve controllers** — through any corporate PSC down to the individuals.
3. **Tier-1 discovery** (auto): walk each controller's appointments (`companies.getOfficerAppointments`); search CH by `schemeName` (`companies.searchCompaniesHouse`); for each discovered entity `companies.syncCompaniesHouse` then ownership (PSC) + charges check one hop. Build `StructureGraph` nodes/edges with evidence + confidence + flags (`director-not-owner`, `brand-not-borrower`, `band-only`, `ceased`, `dissolved`).
4. **Stress-test** — adversarial completeness re-search (scheme name, spellings, controllers' associates); add unconfirmed entities as `role:"unknown"` nodes with an `unverified` edge. Call `gradeStructure(graph)` for the verdict.
5. **Tier-2** (only if `tier:"expand"` or verdict low): recurse into new controllers until no new `41xxx`/`68xxx` entity; cap depth 2 + 40 nodes; `log` what was dropped.
6. **Render** `buildStructureChartSvg(graph)`; persist the graph on the skillRun.
7. `skillRun.complete` with the graph, the SVG (or its data-URI), `linkedClientId`, and the verdict's `openQuestions` as gaps.

## Outputs
- `StructureGraph` JSON on the skillRun.
- SVG embedded (image) in `intelMarkdown`; available inline for the lender brief's Corporate Structure section.

## References
- `../../../model-testing-app/src/lib/structure/types.ts` (schema)
- `../../sub-skills/resolve-related-entities.md` (discovery walk)
- `../../shared-references/doc-type-lender-brief.md` (Corporate Structure section)

## Style rules
Evidence-first: every edge cites a CH filing. **Director ≠ owner** — confirm ownership before any `owns`/`role` claim. Never present `soft`/`band-only` as confirmed.
```

- [ ] **Step 2: Extend `resolve-related-entities.md`** — add a "## Output: StructureGraph" section stating it now emits `StructureGraph` nodes/edges (per `structure/types.ts`) in addition to the `relatedCompaniesHouseNumbers`, tagging each edge's `evidence`/`confidence`/`flags`.

- [ ] **Step 3: Add to `skills/skills/README.md`** status table: a `corporate-structure` row, status "skeleton (spec + libs landed)", mapped to the prospecting/intel lifecycle stage.

- [ ] **Step 4: Commit**

```bash
git add skills/skills/corporate-structure/SKILL.md skills/sub-skills/resolve-related-entities.md skills/skills/README.md
git commit -m "feat(structure): corporate-structure skill + resolve-related-entities graph emit"
```

---

## Task 7 (optional fast-follow): `companies.mapGroup` MCP tool

Removes the friction that causes the walk to be skipped: one call returns the controllers + their appointments.

**Files:**
- Modify: `model-testing-app/convex/companies.ts` (add `mapGroup` query)
- Modify: `model-testing-app/convex/mcp.ts` (expose `companies.mapGroup`)
- Modify: `skills/CATALOGUE.md`

- [ ] **Step 1: Add a `mapGroup` query** in `convex/companies.ts` that, given `clientId`, reads the client's controllers (PSC individuals resolved from `companiesHouseOfficers`/`companiesHousePSC` rows already synced) and returns `{ controllers: [{name, appointmentsLink}], note }`. (Read-only; aggregates existing synced rows — no new CH fetch.) Follow the shape of the existing `getGroupCharges` query in the same file.

- [ ] **Step 2: Expose it in `convex/mcp.ts`** as `companies.mapGroup` with `inputSchema { clientId }`, mirroring the `companies.getGroupCharges` tool block (handler calls `ctx.runQuery(api.companies.mapGroup, { clientId })`, returns `asText(result)`).

- [ ] **Step 3: Regenerate Convex types**

Run: `cd model-testing-app && npx convex codegen`
Expected: `convex/_generated/api.d.ts` updated with `mapGroup`.

- [ ] **Step 4: Update `skills/CATALOGUE.md`** — add `companies.mapGroup` to the companies-house domain section with its "when to use" line.

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/convex/companies.ts model-testing-app/convex/mcp.ts model-testing-app/convex/_generated skills/CATALOGUE.md
git commit -m "feat(structure): companies.mapGroup MCP tool (one-call controller walk)"
```

---

## Final step: build + push

- [ ] **Run the build** (per CLAUDE.md): `cd model-testing-app && npx next build` — fix any errors.
- [ ] **Run the structure tests**: `npx vitest run src/__tests__/structureGrade.test.ts src/__tests__/structureChart.test.ts src/__tests__/lenderBriefLayout.test.ts` — all green.
- [ ] **Push** the branch.

---

## Self-Review

**Spec coverage:**
- Structure-graph schema → Task 1. ✓
- Tiered discovery (tier-1 auto, tier-2 expand) → Task 6 (skill workflow) + reuses `resolve-related-entities`. ✓
- Stress-test (confidence flags + adversarial pass + verdict) → Task 2 (`gradeStructure`) + Task 6 step 4 (adversarial pass feeds `unknown`/`unverified` nodes the grader reads). ✓
- SVG renderer (role bands, confidence styling, legend, verdict chip) → Task 3. ✓
- Embedding (Intel tab image + brief inline) → Task 5 + Task 4. ✓
- Birkett Hall fixture / worked example → Task 1 + tests in 2 & 3. ✓
- Edge cases (CH gaps → unverified+lower verdict; layered ownership; multi-parent; large-group cap+log) → grader handles `unknown`/`unverified` (Task 2); skill caps + logs (Task 6 step 5); renderer handles multiple parents (Task 3 draws every edge). ✓
- `companies.mapGroup` tooling gap → Task 7 (optional). ✓
- Discoverability (README + CATALOGUE) → Task 6 step 3 + Task 7 step 4. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; the one manual step (Task 5 step 5) is a genuine React-render visual check, with the underlying SVG + helper unit-tested in Task 3.

**Type consistency:** `StructureGraph`/`StructureNode`/`StructureEdge`/`StructureVerdict` and the `gradeStructure` / `buildStructureChartSvg` / `svgToMarkdownImage` signatures are consistent across Tasks 1–6. Roles + flags used in the fixture (Task 1) and renderer/grader (Tasks 2–3) match the `types.ts` unions.
