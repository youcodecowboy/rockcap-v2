# Structure Chart — Make It Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the tested structure-chart libs into a one-click live feature: an MCP-callable renderer, persistence on the skillRun, a one-call group-mapping tool, the prospect-intel runtime wiring, and a layout polish.

**Architecture:** Mirror the existing docgen bridge — an MCP tool calls a Convex action which `fetch`es a Next API route that imports the pure libs. The structure renderer is pure (no Puppeteer), so the route is thin. The agent-executed `prospect-intel` / `corporate-structure` skills call the MCP tool, embed the returned data-URI in `intelMarkdown`, and persist the graph via `skillRun.complete`.

**Tech Stack:** TypeScript, Vitest, Next.js route handlers, Convex (queries/actions/mutations + MCP tool surface), the existing `src/lib/structure` + `src/lib/docgen/structureChart` libs.

**Builds on:** `docs/superpowers/specs/2026-05-30-corporate-structure-chart-design.md` and the committed libs (`StructureGraph`, `gradeStructure`, `buildStructureChartSvg`, `svgToMarkdownImage`). Precedents to mirror: `src/app/api/documents/generate/route.ts`, `convex/skillRuns.ts:77 completeInternal`, `convex/mcp.ts` tool blocks, `convex/documentGen.renderAndStage` (action that fetches the Next route).

---

## File Structure
- `model-testing-app/src/app/api/structure/render/route.ts` — Create: POST `{ graph }` → `{ svg, dataUri, verdict }`.
- `model-testing-app/src/__tests__/structureRenderRoute.test.ts` — Create: route-handler test.
- `model-testing-app/convex/structureGen.ts` — Create: `renderChart` internal action (fetches the route, like `documentGen.renderAndStage`).
- `model-testing-app/convex/mcp.ts` — Modify: add `structure.renderChart` + `companies.mapGroup` tools; add `structureGraph` passthrough to `skillRun.complete`.
- `model-testing-app/convex/schema.ts` — Modify (`skillRuns` table, ~line 4247): add `structureGraph`.
- `model-testing-app/convex/skillRuns.ts` — Modify (`completeInternal`, ~line 77): add `structureGraph` arg + persist.
- `model-testing-app/convex/companies.ts` — Modify: add `mapGroup` query.
- `model-testing-app/src/lib/docgen/structureChart.ts` — Modify: top-row barycenter polish.
- `model-testing-app/src/__tests__/structureChart.test.ts` — Modify: assert the polish.
- `skills/skills/prospect-intel/SKILL.md`, `skills/skills/corporate-structure/SKILL.md`, `skills/shared-references/doc-type-lender-brief.md`, `skills/CATALOGUE.md` — Modify: runtime wiring + docs.

---

## Task 1: Renderer polish — cluster parents over their children

**Files:** Modify `model-testing-app/src/lib/docgen/structureChart.ts`; Modify `model-testing-app/src/__tests__/structureChart.test.ts`

- [ ] **Step 1: Add a failing test** to `structureChart.test.ts` inside the `describe("buildStructureChartSvg", ...)` block. It asserts the two people are clustered (close in x) above Birkett Hall Homes rather than spread to the page edges. Parse the `<text>` x-positions of the person names:

```ts
  it("clusters parents over their children (people sit above Homes, not page-spread)", () => {
    const xOf = (name: string) => {
      const m = svg.match(new RegExp(`<text x="([0-9.]+)"[^>]*>${name}</text>`));
      return m ? parseFloat(m[1]) : NaN;
    };
    const thompson = xOf("Paul Thompson"), bedding = xOf("Mark Bedding"), homes = xOf("Birkett Hall Homes Ltd");
    expect(Number.isNaN(thompson) || Number.isNaN(bedding) || Number.isNaN(homes)).toBe(false);
    // both people within ~one box-width of Homes (clustered), not flung to the page edges
    expect(Math.abs((thompson + bedding) / 2 - homes)).toBeLessThan(120);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureChart.test.ts`
Expected: the new test FAILS (people are currently spread; midpoint far from Homes).

- [ ] **Step 3: Add a bottom-up barycenter pass** in `buildStructureChartSvg`, immediately AFTER the existing top-down level loop (the `for (let lv = 0; ...)` block that ends before `let hasFlagged = false;`). Insert:

```ts
  // bottom-up pass: pull each parent over the barycenter of its children, so a
  // parent (e.g. the people above Homes) sits above what it owns rather than at a
  // page-spread default. Re-resolve overlaps + recentre per row afterwards.
  const recentreRow = (row: StructureNode[]) => {
    const sorted = [...row].sort((a, b) => pos.get(a.id)!.x - pos.get(b.id)!.x);
    const step = BOX_W + MIN_GAP;
    for (let i = 1; i < sorted.length; i++) {
      const prev = pos.get(sorted[i - 1].id)!, cur = pos.get(sorted[i].id)!;
      if (cur.x - prev.x < step) cur.x = prev.x + step;
    }
    const xs = sorted.map((n) => pos.get(n.id)!.x);
    if (!xs.length) return;
    const shift = (W - (Math.max(...xs) - Math.min(...xs))) / 2 - Math.min(...xs);
    sorted.forEach((n) => {
      const p = pos.get(n.id)!;
      p.x = Math.max(SIDE + BOX_W / 2, Math.min(W - SIDE - BOX_W / 2, p.x + shift));
    });
  };
  for (let lv = levels.length - 2; lv >= 0; lv--) {
    const row = levels[lv] ?? [];
    row.forEach((n) => {
      const cs = (childrenOf.get(n.id) ?? []).map((c) => pos.get(c)?.x).filter((x): x is number => x != null);
      if (cs.length) pos.get(n.id)!.x = cs.reduce((a, b) => a + b, 0) / cs.length;
    });
    recentreRow(row);
  }
```

(The existing top-down loop's de-overlap/centre logic is duplicated here as `recentreRow` — extract it: replace the inline de-overlap+centre at the end of the top-down loop with a call to `recentreRow(row)` so there is one implementation. The top-down loop becomes: set `pos` by parent-barycenter/fallback, then `recentreRow(row);`.)

- [ ] **Step 4: Run to verify pass**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureChart.test.ts`
Expected: all tests PASS (7).

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/src/lib/docgen/structureChart.ts model-testing-app/src/__tests__/structureChart.test.ts
git commit -m "feat(structure): cluster parents over children (barycenter pass) so the people sit above the holding co"
```

---

## Task 2: `/api/structure/render` route

**Files:** Create `model-testing-app/src/app/api/structure/render/route.ts`; Create `model-testing-app/src/__tests__/structureRenderRoute.test.ts`

- [ ] **Step 1: Write the failing test** (`structureRenderRoute.test.ts`):

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "../app/api/structure/render/route";
import { birkettHallGraph } from "../lib/structure/fixtures/birkettHall";

beforeAll(() => { process.env.CONVEX_INTERNAL_SECRET = "test-secret"; });

function req(body: unknown, secret = "test-secret") {
  return new Request("http://localhost/api/structure/render", {
    method: "POST",
    headers: { "content-type": "application/json", "x-convex-internal-secret": secret },
    body: JSON.stringify(body),
  });
}

describe("POST /api/structure/render", () => {
  it("401s without the internal secret", async () => {
    const res = await POST(req({ graph: birkettHallGraph }, "wrong") as never);
    expect(res.status).toBe(401);
  });
  it("returns svg + dataUri + verdict for a graph", async () => {
    const res = await POST(req({ graph: birkettHallGraph }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.svg).toContain("<svg");
    expect(json.dataUri).toContain("data:image/svg+xml,");
    expect(json.verdict.structureConfidence).toBe("medium");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd model-testing-app && npx vitest run src/__tests__/structureRenderRoute.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route** (`src/app/api/structure/render/route.ts`):

```ts
// src/app/api/structure/render/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildStructureChartSvg, svgToMarkdownImage } from "@/lib/docgen/structureChart";
import { gradeStructure } from "@/lib/structure/stressTest";
import type { StructureGraph } from "@/lib/structure/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-convex-internal-secret");
  if (!secret || secret !== process.env.CONVEX_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const graph = body?.graph as StructureGraph | undefined;
    if (!graph?.nodes || !graph?.edges) {
      return NextResponse.json({ error: "missing graph { nodes, edges }" }, { status: 400 });
    }
    const verdict = gradeStructure(graph);
    const graded: StructureGraph = { ...graph, verdict };
    const svg = buildStructureChartSvg(graded);
    return NextResponse.json({ svg, dataUri: svgToMarkdownImage(svg).replace(/^!\[[^\]]*\]\(|\)$/g, ""), verdict });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd model-testing-app && CONVEX_INTERNAL_SECRET=test-secret npx vitest run src/__tests__/structureRenderRoute.test.ts`
Expected: PASS (2 tests). Note: the test sets the env in `beforeAll`, so the bare command also works.

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/src/app/api/structure/render/route.ts model-testing-app/src/__tests__/structureRenderRoute.test.ts
git commit -m "feat(structure): /api/structure/render route (graph -> svg + dataUri + verdict)"
```

---

## Task 3: Convex action + MCP `structure.renderChart`

**Files:** Create `model-testing-app/convex/structureGen.ts`; Modify `model-testing-app/convex/mcp.ts`

- [ ] **Step 1: Read `convex/documentGen.ts`** to copy the exact NEXT_APP_URL normalisation + fetch pattern used by `renderAndStage` (it sends `x-convex-internal-secret: process.env.CONVEX_INTERNAL_SECRET`).

- [ ] **Step 2: Implement `convex/structureGen.ts`:**

```ts
// convex/structureGen.ts
import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const renderChart = internalAction({
  args: { graph: v.any() },
  handler: async (_ctx, { graph }) => {
    const base = (process.env.NEXT_APP_URL ?? "").replace(/\/$/, "");
    if (!base) throw new Error("NEXT_APP_URL not set");
    const url = `${(base.startsWith("http") ? base : `https://${base}`)}/api/structure/render`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-convex-internal-secret": process.env.CONVEX_INTERNAL_SECRET ?? "" },
      body: JSON.stringify({ graph }),
    });
    if (!res.ok) throw new Error(`structure render failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as { svg: string; dataUri: string; verdict: unknown };
  },
});
```

(Match the exact URL-normalisation helper `documentGen.renderAndStage` uses if it differs from the above; reuse it rather than duplicating.)

- [ ] **Step 3: Add the MCP tool** in `convex/mcp.ts`, mirroring a `ctx.runAction(...)` tool block (e.g. the `companies.getOfficerAppointments` block which runs an internal action):

```ts
  {
    name: "structure.renderChart",
    description:
      "Render a corporate StructureGraph to a styled SVG (ownership-only layout) + a data:image/svg+xml URI + the high/med/low verdict. Pass { graph } (shape per src/lib/structure/types.ts). Use after building the graph in the corporate-structure skill: embed the returned dataUri in intelMarkdown and inline the svg in a lender brief's Corporate Structure section. Read-only (does not persist).",
    inputSchema: {
      type: "object",
      properties: { graph: { type: "object", description: "StructureGraph { subjectClientId, asOf, nodes[], edges[] }" } },
      required: ["graph"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runAction(internal.structureGen.renderChart, { graph: args.graph });
      return asText(result);
    },
  },
```

- [ ] **Step 4: Regenerate types + build**

Run: `cd model-testing-app && npx convex codegen && npx next build 2>&1 | tail -5`
Expected: codegen adds `structureGen.renderChart`; build compiles.

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/convex/structureGen.ts model-testing-app/convex/mcp.ts model-testing-app/convex/_generated
git commit -m "feat(structure): structure.renderChart MCP tool (action fetches /api/structure/render)"
```

---

## Task 4: Persist `structureGraph` on the skillRun

**Files:** Modify `model-testing-app/convex/schema.ts` (~4247); Modify `model-testing-app/convex/skillRuns.ts` (~77); Modify `model-testing-app/convex/mcp.ts` (the `skillRun.complete` tool)

- [ ] **Step 1: Read** `convex/schema.ts` around line 4247 (the `skillRuns: defineTable({...})` block) and `convex/skillRuns.ts` lines 77–140 (the `completeInternal` mutation + the public `complete` mutation that wraps it, if present) to see the exact shapes.

- [ ] **Step 2: Add the field to the schema.** In the `skillRuns` table definition, alongside the existing `intelMarkdown: v.optional(v.string())` (or near it), add:

```ts
    structureGraph: v.optional(v.any()), // corporate-structure graph (nodes/edges/verdict), per src/lib/structure/types.ts
```

- [ ] **Step 3: Accept + persist it in the mutation.** In `convex/skillRuns.ts` `completeInternal` args, beside `intelMarkdown: v.optional(v.string()),` add `structureGraph: v.optional(v.any()),`. In the `ctx.db.patch(...)` call that writes the completion fields, add `structureGraph: args.structureGraph,` (follow exactly how `intelMarkdown` is threaded — args → patch). If there is a public `complete` wrapper mutation, thread the same optional arg through it.

- [ ] **Step 4: Pass it through the MCP tool.** In `convex/mcp.ts`, find the `skillRun.complete` tool block. Add `structureGraph: { type: "object", description: "Corporate StructureGraph to persist on the run (optional)." }` to its `inputSchema.properties`, and pass `structureGraph: args.structureGraph` in the `ctx.runMutation(...complete..., {...})` call (mirroring `intelMarkdown`).

- [ ] **Step 5: Regenerate + build**

Run: `cd model-testing-app && npx convex codegen && npx next build 2>&1 | tail -5`
Expected: codegen updates; build compiles. (Convex mutations aren't unit-tested here; correctness is verified by codegen + a manual `skillRun.complete({ structureGraph })` call writing the field.)

- [ ] **Step 6: Commit**

```bash
git add model-testing-app/convex/schema.ts model-testing-app/convex/skillRuns.ts model-testing-app/convex/mcp.ts model-testing-app/convex/_generated
git commit -m "feat(structure): persist structureGraph on the skillRun (schema + complete mutation + MCP passthrough)"
```

---

## Task 5: `companies.mapGroup` (one-call controller walk)

**Files:** Modify `model-testing-app/convex/companies.ts`; Modify `model-testing-app/convex/mcp.ts`; Modify `skills/CATALOGUE.md`

- [ ] **Step 1: Read** `convex/companies.ts` `getGroupCharges` query (the existing read that aggregates the client's synced CH rows) to reuse its client → companiesHouseNumber + relatedCompaniesHouseNumbers + companiesHouseOfficers lookups.

- [ ] **Step 2: Add `mapGroup`** in `convex/companies.ts` (read-only; aggregates already-synced rows, no CH fetch):

```ts
export const mapGroup = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, { clientId }) => {
    const client = await ctx.db.get(clientId);
    if (!client) return { ok: false, error: "client_not_found" } as const;
    const numbers = [client.companiesHouseNumber, ...(client.relatedCompaniesHouseNumbers ?? [])].filter(Boolean) as string[];
    const controllers: Array<{ name: string; appointmentsLink?: string; companyNumber: string }> = [];
    const seen = new Set<string>();
    for (const num of numbers) {
      const officers = await ctx.db
        .query("companiesHouseOfficers")
        .withIndex("by_company", (q) => q.eq("companyNumber", num)) // match the existing index name in companiesHouseOfficers
        .collect();
      for (const o of officers) {
        const key = (o.appointmentsLink ?? o.name) as string;
        if (o.officerRole !== "director" || seen.has(key)) continue;
        seen.add(key);
        controllers.push({ name: o.name, appointmentsLink: o.appointmentsLink, companyNumber: num });
      }
    }
    return { ok: true, companyNumbers: numbers, controllers,
      note: "Walk each controller's appointmentsLink via companies.getOfficerAppointments, then search CH by scheme name; confirm ownership (PSC) before crediting any company as the prospect's." } as const;
  },
});
```

(Adjust the `withIndex` name + field names — `companyNumber`, `officerRole`, `appointmentsLink`, `name` — to the actual `companiesHouseOfficers` schema; read the table definition in `schema.ts` first and match exactly.)

- [ ] **Step 3: Add the MCP tool** in `convex/mcp.ts` mirroring `companies.getGroupCharges`:

```ts
  {
    name: "companies.mapGroup",
    description:
      "One-call group map: returns the prospect group's CH numbers + the distinct directors across them (with each director's appointmentsLink). The starting point for the corporate-structure walk — feed each appointmentsLink to companies.getOfficerAppointments to find scheme SPVs, and search CH by the deal/scheme name. Director != owner: confirm ownership via PSC before crediting a company to the prospect. Read-only; aggregates already-synced rows.",
    inputSchema: { type: "object", properties: { clientId: { type: "string", description: "Convex id of the prospect's clients row" } }, required: ["clientId"] },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.companies.mapGroup, { clientId: args.clientId });
      return asText(result);
    },
  },
```

- [ ] **Step 4: Document it** — add `companies.mapGroup` to `skills/CATALOGUE.md` under the companies-house domain (one line: when to use = "start the corporate-structure walk; get controllers + appointment links in one call").

- [ ] **Step 5: Regenerate + build**

Run: `cd model-testing-app && npx convex codegen && npx next build 2>&1 | tail -5`
Expected: codegen adds `companies.mapGroup`; build compiles.

- [ ] **Step 6: Commit**

```bash
git add model-testing-app/convex/companies.ts model-testing-app/convex/mcp.ts model-testing-app/convex/_generated skills/CATALOGUE.md
git commit -m "feat(structure): companies.mapGroup MCP tool (controllers + appointment links in one call)"
```

---

## Task 6: Runtime wiring + docs

**Files:** Modify `skills/skills/corporate-structure/SKILL.md`, `skills/skills/prospect-intel/SKILL.md`, `skills/shared-references/doc-type-lender-brief.md`

- [ ] **Step 1: `corporate-structure/SKILL.md`** — in the Workflow, make the tool calls concrete: step 3 starts with `companies.mapGroup({clientId})`; step 6 calls `structure.renderChart({graph})` (returns `{svg, dataUri, verdict}`); step 7 embeds `dataUri` as an image in `intelMarkdown` and persists the graph via `skillRun.complete({structureGraph: graph})`. Add a line: "The chart shows ownership only — directed-but-not-owned entities are recorded in the graph (for the verdict + track record) but excluded from the SVG by the renderer."

- [ ] **Step 2: `prospect-intel/SKILL.md` step 8b** — append: "Then build the `StructureGraph` from the walk, call `structure.renderChart`, embed the returned `dataUri` in `intelMarkdown` under a 'Corporate structure' heading, and persist the graph via `skillRun.complete({structureGraph})`."

- [ ] **Step 3: `doc-type-lender-brief.md` §9 (Corporate Structure)** — append: "Ownership only: the renderer omits any entity not in the ownership tree (e.g. a directed-but-not-owned company) — those belong in §7 Track Record. Caption the chart with the verdict's `openQuestions`."

- [ ] **Step 4: Commit**

```bash
git add skills/skills/corporate-structure/SKILL.md skills/skills/prospect-intel/SKILL.md skills/shared-references/doc-type-lender-brief.md
git commit -m "feat(structure): wire prospect-intel/corporate-structure to renderChart + persistence; doc the ownership-only rule"
```

---

## Final step: build + push
- [ ] `cd model-testing-app && npx next build` — fix any errors.
- [ ] `npx vitest run src/__tests__/structureChart.test.ts src/__tests__/structureRenderRoute.test.ts` — green.
- [ ] Push the branch.
- [ ] Manual smoke (needs deploy + dev): call `structure.renderChart` with the Birkett fixture via MCP; confirm `dataUri` renders in a prospect's Intel tab.

---

## Self-Review

**Spec coverage:** the bridge (route + action + MCP tool) → Tasks 2–3; persistence → Task 4; `companies.mapGroup` → Task 5; runtime wiring → Task 6; renderer polish → Task 1; ownership-only doc rule → Task 6 step 3. All spec follow-ups covered.

**Placeholder scan:** no TBDs. The two places the engineer must match existing shapes (the `completeInternal` patch in Task 4 and the `companiesHouseOfficers` index/fields in Task 5) carry an explicit "read X first and match exactly" instruction with the real file:line anchors, because those exact field names aren't reproduced here — that is a grounded instruction, not a placeholder.

**Type consistency:** `StructureGraph` / `gradeStructure` / `buildStructureChartSvg` / `svgToMarkdownImage` signatures match the committed libs. The route returns `{ svg, dataUri, verdict }`; the action + MCP tool pass that through unchanged; the skill consumes `dataUri` (embed) + `graph` (persist). `structureGraph` is `v.optional(v.any())` consistently in the schema, mutation, and MCP tool.

**Convex caveat:** Convex queries/actions/mutations are verified by `convex codegen` + `next build` + a manual MCP smoke (the repo has no Convex unit-test harness); the pure libs + the route handler ARE unit-tested (Tasks 1–2).
