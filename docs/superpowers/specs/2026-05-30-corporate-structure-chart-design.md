# Corporate Structure Chart — Design

- **Date:** 2026-05-30
- **Status:** Approved design (brainstorming) → pending implementation plan
- **Builds on:** prospect-intel v2 (step 8b `resolve-related-entities`, hardened mandatory 2026-05-30), the docgen render engine (`src/lib/docgen/`), and the `doc-type-lender-brief.md` reference.
- **Origin:** the Birkett Hall / Woodham gauntlet (2026-05-30) exposed that a sponsor name-search + parent PSC register misses the actual borrower SPV (`Woodham45 Ltd`) and mis-attributes track record (schemes owned by `D2P Capital` / `Bocking Homes`, not the prospect). Only the officer-appointment walk + per-entity ownership checks recover the true structure. This skill productises that walk, stress-tests the result, and renders a reusable chart.

## Context & goal

A new capability that **aggressively discovers a developer's corporate structure, stress-tests it, and renders a styled chart** that lives in the prospect Intel tab and embeds in lender briefs (and future documents). It turns the manual officer-appointment walk into a repeatable, evidence-graded artefact.

Two failure modes it must guard against (both seen on Birkett Hall):
1. **Missing entity** — a per-scheme SPV named after the scheme (not the sponsor), invisible to a name search (`Woodham45`).
2. **Mis-attribution** — a company the controllers merely *direct* (a former employer's or a JV partner's), wrongly credited as the prospect's track record (`D2P Capital`, `Bocking`/`Elsenham`).

## Approach (A): structure-graph core + shared SVG renderer

A pipeline of small, independently-testable units around one reusable data model:

**discover → build graph → stress-test → render SVG → embed.**

Rejected alternatives:
- **Extend prospect-intel only, no skill** — not a standalone operator action ("chart the structure of X"), not cleanly invocable by other skills/docs.
- **Render-only, hand-assembled data** — no automated discovery/stress-test (the whole point).
- **Mermaid / React-component rendering** — Mermaid adds a client+server dependency with weak confidence-styling control; a React component is web-only and doesn't port to the Chromium PDF. A server-generated SVG is the only "build once, render everywhere" option (the Intel tab uses `react-markdown` + `remark-gfm` with no raw-HTML/SVG/Mermaid support, so the chart reaches it as an image).

## Components

1. **Structure-graph schema** — `src/lib/structure/types.ts`. The reusable core; the single source the chart, the Intel tab and all docs render from. Persisted on the skillRun.
2. **Discovery** — extends the existing `skills/sub-skills/resolve-related-entities` sub-skill to *emit the graph* (not just `relatedCompaniesHouseNumbers`). Tiered: tier-1 auto, tier-2 opt-in expand.
3. **Stress-test** — `src/lib/structure/stressTest.ts`: confidence tagging + adversarial completeness pass + verdict.
4. **SVG renderer** — `src/lib/docgen/structureChart.ts`: pure `buildStructureChartSvg(graph) → string`.
5. **Embedding** — Intel tab (image in `intelMarkdown`) + lender brief / future docs (inline SVG section).
6. **`corporate-structure` skill** — `skills/skills/corporate-structure/SKILL.md`: orchestrates the pipeline; standalone operator entry ("map & chart the structure of {client}") and invoked by prospect-intel step 8b.

## Structure-graph schema

```ts
interface StructureGraph {
  subjectClientId: string;        // the prospect/client mapped
  asOf: string;                   // ISO date stamp (passed in; never Date.now())
  nodes: Array<{
    id: string;                   // CH number for companies; officer-id/slug for people
    kind: "company" | "person";
    name: string;
    ref?: string;                 // CH number / CH officer appointment id
    status?: "active" | "dissolved" | "ceased";
    role?: "borrower" | "landholder" | "sponsor-holding"
         | "jv-partner" | "former-employer" | "contractor" | "pipeline" | "unknown";
    meta?: Record<string, string | number>;  // incorporation, SIC, chargesCount, etc.
  }>;
  edges: Array<{
    from: string; to: string;     // node ids
    relation: "owns" | "directs" | "charges" | "psc";
    detail?: string;              // "25–50%", "75%+", "director appt 2024-12-03", lender + date
    evidence: { source: string; url?: string; filing?: string };
    confidence: "hard" | "soft";  // hard = filed declaration; soft = inferred / band-only
    flags?: Array<"director-not-owner" | "brand-not-borrower" | "band-only"
                | "ceased" | "dissolved" | "unverified">;
  }>;
  verdict: {
    structureConfidence: "high" | "medium" | "low";
    rationale: string;
    openQuestions: string[];      // "confirm Bocking participates in dev phase", etc.
  };
}
```

## Data flow

1. prospect-intel step 8b (or the standalone skill) resolves the **controllers** — resolving THROUGH corporate PSCs down to the individual humans.
2. **Tier-1 discovery:** walk each controller's CH appointments (`companies.getOfficerAppointments`) + a **scheme-name CH search** (`companies.searchCompaniesHouse`); for each discovered entity, `companies.syncCompaniesHouse` then ownership-check (PSC) + reality-check (charges, one hop). Emit nodes + edges with evidence + confidence + flags.
3. **Stress-test** the graph (below) → set the verdict.
4. **Tier-2 (opt-in "expand"):** recurse into newly-found controllers until no new property-SIC (`41xxx`/`68xxx`) entities appear; cap at depth N and entity M; `log` what was dropped.
5. `buildStructureChartSvg(graph)` → SVG.
6. Persist the graph (new `structureGraph` field on the skillRun) and embed: image into `intelMarkdown`; inline SVG into the brief's "Corporate Structure" section.

## Stress-test rules

- **Confidence tagging.** `hard` = a filed CH declaration (PSC ownership, a registered charge, an officer appointment). `soft` = inferred (band-only ownership, name/office-shared association, a directorship used to imply control). Apply flags: `director-not-owner` (directs but PSC shows another owner), `brand-not-borrower` (named in docs but not the charge-holder), `band-only` (PSC gives 25–50% not an exact split), `ceased`/`dissolved`.
- **Adversarial completeness pass.** Re-search CH by the scheme/project name, alternate spellings, and the controllers' spouses / close associates. Plausible-but-unconfirmed entities are added as `soft` nodes and lower the verdict.
- **Verdict.** `high` = borrower + ownership chain all `hard`, no open structural questions. `medium` = some band-only/inferred edges or a JV whose dev-phase split is unconfirmed. `low` = the borrower entity is uncertain, or the adversarial pass found likely-missing vehicles. Always list `openQuestions`.

## Rendering & embedding

- **Renderer.** Pure function, no deps. Deterministic layered layout by role band: people (top) → sponsor-holding → borrower SPV + JV-partner + pipeline (middle) → former-employer/contractor (context band). Edges are connectors labelled with `relation`/`detail`. **Solid stroke = `hard`, dashed = `soft`.** Flag badges on edges (e.g. a "≠ owner" tag). A compact legend + a verdict chip (High/Med/Low). House-styled (RockCap type + palette) to match the brief.
- **Intel tab.** Render SVG, embed as an image in `intelMarkdown` (`![Corporate structure](…)`) — works with `react-markdown`. Either a data-URI or a stored SVG referenced by URL (implementation plan to choose; data-URI is dependency-free).
- **Lender brief / future docs.** Inject the SVG inline into a new optional **"Corporate Structure"** section body (Chromium renders SVG natively in the PDF). Add the section to `doc-type-lender-brief.md`.
- **Build once.** The persisted graph is the single source; both surfaces render the same SVG.

## Error handling / edge cases

- **CH gaps** (missing `appointmentsLink`, officer DOB mismatch, API 404/key-missing) → add the node with an `unverified` flag, lower the verdict; never hard-fail.
- **Layered ownership** (individuals control via holding companies that own the borrower) → resolve through corporate PSCs to the humans before walking.
- **JV / multi-parent / circular ownership** → the graph supports multiple parents; the renderer draws each.
- **Large groups** → cap nodes (top N by recency + charge activity) and `log` what was dropped — no silent truncation.

## Testing

- Unit-test `buildStructureChartSvg` on a committed fixture graph — the **Birkett Hall / Woodham** structure (data already gathered): asserts the layered structure, solid-vs-dashed by confidence, the flag badges, and the verdict chip. CI-safe (no Chromium).
- Unit-test `stressTest` on fixtures: a clean structure → `high`; a director-not-owner edge → flagged + `medium`; an unconfirmed scheme-name hit → `low`.
- Optional Chromium-gated render (mirrors `lenderBriefExample.test.ts`) to eyeball the chart locally.

## Scope (YAGNI for v1)

- **In:** tiered discovery, stress-test + verdict, the graph schema, the SVG renderer, embedding in the Intel tab + the lender brief, the Birkett Hall fixture.
- **Out (later):** an interactive web chart (pan/zoom/click) — v1 is static SVG on both surfaces; automated monitoring/alerts on structure changes; DOCX-native chart (the brief's DOCX path can carry a raster fallback later).

## Tooling gap addressed

This productises the manual officer-walk and removes the friction that caused it to be skipped. The implementation plan should also propose a `companies.mapGroup({clientId})` MCP/Convex query that returns the controllers + their appointments in one call, so the agent does not assemble the walk by hand.

## Discoverability / maintenance (per CLAUDE.md)

- Add the `corporate-structure` skill to `skills/skills/README.md` (status table) in the same commit it lands.
- If `companies.mapGroup` (or any new MCP tool) is added, update `skills/CATALOGUE.md` in the same commit.
