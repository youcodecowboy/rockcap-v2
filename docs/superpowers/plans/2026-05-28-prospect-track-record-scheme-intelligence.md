# Prospect Track Record + Scheme-Level Charge Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a prospect's per-scheme charge picture (group charges chronology per SPV) and a Track Record tab of their last 5-7 live/past schemes, each with address and a deep, operator-confirmable estimate of what they're building.

**Architecture:** Extend the existing `companies.getGroupCharges` Convex query to also return per-charge rows; add a `prospectSchemes` table + `getProspectSchemes`/`upsertProspectScheme` for durable per-scheme enrichment; pure grouping/ranking/parse logic lives in a Convex-import-free helper module (`convex/lib/schemeGrouping.ts`) so it is unit-tested with vitest; UI reuses the existing charge-table styling in two surfaces (CH tab + new Track Record tab); the prospect-intel skill writes draft enrichment.

**Tech Stack:** Next.js 16 (App Router, `--webpack`), Convex, React 19, vitest 4, TypeScript. The Next app is in `model-testing-app/`. MCP tools are defined in `model-testing-app/convex/mcp.ts`.

**Verification model (important):** This repo has **no `convex-test`** — vitest tests cover **pure `src/lib` / `convex/lib` logic only**. Convex query/mutation handlers and UI are verified with `npm run build` + manual preview (per CLAUDE.md). So: TDD the pure helpers; build+preview the wiring and UI; dry-run the skill on already-synced Mackenzie Miller data.

**Commands** (run from `model-testing-app/`):
- Tests: `npm run test:run -- <file>`
- Build (final gate): `npm run build` (this is `next build --webpack`)

---

## Task 1: Pure scheme-grouping helpers (TDD)

**Files:**
- Create: `model-testing-app/convex/lib/schemeGrouping.ts` (pure — NO `convex/` server imports)
- Test: `model-testing-app/src/__tests__/schemeGrouping.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// model-testing-app/src/__tests__/schemeGrouping.test.ts
import { describe, it, expect } from "vitest";
import {
  type GroupCharge,
  distinctLenders,
  classifySchemeStatus,
  parseCandidateAddress,
  rankByRecency,
} from "../../convex/lib/schemeGrouping";

const ch = (over: Partial<GroupCharge> = {}): GroupCharge => ({
  companyNumber: "16027708",
  companyName: "LAND AT LEIGHTERTON SPV LTD",
  companyStatus: "active",
  chargeId: "x",
  lender: "Quantum Development Finance LTD",
  date: "2025-04-10",
  status: "outstanding",
  description: "Part of the freehold property to be known as land at poole farm leighterton",
  ...over,
});

describe("distinctLenders", () => {
  it("dedupes and drops empties", () => {
    expect(
      distinctLenders([ch(), ch({ lender: "Quantum Development Finance LTD" }), ch({ lender: "Investec Bank PLC" })]),
    ).toEqual(["Quantum Development Finance LTD", "Investec Bank PLC"]);
  });
});

describe("classifySchemeStatus", () => {
  it("live when an outstanding charge exists on an active company", () => {
    expect(classifySchemeStatus("active", [ch({ status: "outstanding" })])).toBe("live");
  });
  it("past when all charges satisfied", () => {
    expect(classifySchemeStatus("active", [ch({ status: "fully-satisfied" })])).toBe("past");
  });
  it("past when company dissolved even with an outstanding charge", () => {
    expect(classifySchemeStatus("dissolved", [ch({ status: "outstanding" })])).toBe("past");
  });
});

describe("parseCandidateAddress", () => {
  it("strips common charge-particulars prefixes", () => {
    expect(parseCandidateAddress("Part of the freehold property to be known as land at poole farm leighterton"))
      .toBe("land at poole farm leighterton");
  });
  it("returns undefined for empty/charge-jargon-only text", () => {
    expect(parseCandidateAddress("")).toBeUndefined();
    expect(parseCandidateAddress("None")).toBeUndefined();
  });
});

describe("rankByRecency", () => {
  it("orders by lastChargeDate desc", () => {
    const a = { lastChargeDate: "2022-01-01" };
    const b = { lastChargeDate: "2025-10-24" };
    expect(rankByRecency([a, b])).toEqual([b, a]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test:run -- src/__tests__/schemeGrouping.test.ts`
Expected: FAIL — cannot resolve `../../convex/lib/schemeGrouping`.

- [ ] **Step 3: Implement the helpers**

```ts
// model-testing-app/convex/lib/schemeGrouping.ts
// Pure helpers for grouping Companies House charges into schemes.
// MUST NOT import anything from convex/_generated or "convex/server" so it
// stays unit-testable under vitest (this repo has no convex-test).

export type GroupCharge = {
  companyNumber: string;
  companyName: string;
  companyStatus?: string;
  chargeId: string;
  lender: string;
  date?: string;
  status?: string;
  description?: string;
};

export function distinctLenders(charges: GroupCharge[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of charges) {
    const name = (c.lender ?? "").trim();
    if (!name || name === "(unnamed)" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function classifySchemeStatus(
  companyStatus: string | undefined,
  charges: GroupCharge[],
): "live" | "past" {
  if ((companyStatus ?? "").toLowerCase() === "dissolved") return "past";
  const anyOutstanding = charges.some((c) => (c.status ?? "").toLowerCase() === "outstanding");
  return anyOutstanding ? "live" : "past";
}

const ADDRESS_PREFIXES = [
  /^part of the freehold property to be known as\s+/i,
  /^the freehold property being part of\s+/i,
  /^the freehold (?:land|property)(?: being| known as)?\s+/i,
  /^property (?:known as|description:?\.?)\s*/i,
  /^\(1\)\s*(?:the freehold property (?:known as |being ))?/i,
];

export function parseCandidateAddress(description: string | undefined): string | undefined {
  const raw = (description ?? "").trim();
  if (!raw || /^none$/i.test(raw)) return undefined;
  let s = raw;
  for (const re of ADDRESS_PREFIXES) s = s.replace(re, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length < 4) return undefined;
  return s;
}

export function rankByRecency<T extends { lastChargeDate?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.lastChargeDate ?? "").localeCompare(a.lastChargeDate ?? ""));
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test:run -- src/__tests__/schemeGrouping.test.ts`
Expected: PASS (4 suites).

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/convex/lib/schemeGrouping.ts model-testing-app/src/__tests__/schemeGrouping.test.ts
git commit -m "feat(prospect-schemes): pure scheme-grouping helpers + tests"
```

---

## Task 2: Extend `companies.getGroupCharges` to return per-charge rows

**Files:**
- Modify: `model-testing-app/convex/companies.ts` (the `getGroupCharges` handler, ~lines 432-544)

The handler already loops every charge of every group company; it currently discards the rows. Add a `charges` array (newest-first) to the return. Backward-compatible (purely additive).

- [ ] **Step 1: Collect per-charge rows inside the existing company loop**

Inside the `for (const companyNumber of numbers)` loop, after `const charges = await ctx.db.query("companiesHouseCharges")...collect();`, push each charge into a new accumulator declared above the loop:

```ts
// declare above the loop, beside `byCompany`:
const allCharges: Array<{
  companyNumber: string;
  companyName: string;
  companyStatus?: string;
  chargeId: string;
  lender: string;
  date?: string;
  status?: string;
  description?: string;
}> = [];
```

```ts
// inside the `for (const c of charges)` loop body (alongside the existing count logic):
allCharges.push({
  companyNumber,
  companyName: company.companyName,
  companyStatus: (company as any).companyStatus,
  chargeId: c.chargeId,
  lender: c.chargeeName?.trim() || "(unnamed)",
  date: c.chargeDate,
  status: c.chargeStatus,
  description: c.chargeDescription,
});
```

- [ ] **Step 2: Sort newest-first and add to the return**

After the loop, before `return {...}`:

```ts
allCharges.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
```

Add `charges: allCharges,` to BOTH the `empty` object (as `charges: [] as typeof allCharges` — or `[]`) and the final returned object. (The `empty` early-returns must include `charges: []` so the shape is stable.)

- [ ] **Step 3: Update the MCP tool description**

In `model-testing-app/convex/mcp.ts`, find the `companies.getGroupCharges` tool (~line 2089) and update its `description` to note it now also returns a `charges` array (per-charge rows: companyNumber, companyName, lender, date, status, description; newest-first). No handler change needed (it passes the query result through `asText`).

- [ ] **Step 4: Verify build + manual check**

Run: `npm run build`
Expected: build succeeds (TypeScript clean).
Manual: in the running app, open the Mackenzie Miller prospect CH tab; confirm no regression in the existing group rollup. (We render the new `charges` in Task 5.)

- [ ] **Step 5: Update CATALOGUE + commit**

Edit `skills/CATALOGUE.md`: in the `companies.getGroupCharges` entry, note the added `charges` array.

```bash
git add model-testing-app/convex/companies.ts model-testing-app/convex/mcp.ts skills/CATALOGUE.md
git commit -m "feat(prospect-schemes): getGroupCharges returns per-charge rows"
```

---

## Task 3: `prospectSchemes` table

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (add a table near `companiesHouseCharges`)

- [ ] **Step 1: Add the table definition**

```ts
// model-testing-app/convex/schema.ts — add inside defineSchema({ ... })
// Durable per-scheme enrichment for prospects. One row per SPV (scheme).
// Written as drafts by the prospect-intel skill (operatorConfirmed=false),
// confirmed/edited by operators in the Track Record tab. Surface-only:
// does NOT create clients/companies rows. See
// docs/superpowers/specs/2026-05-28-prospect-track-record-scheme-intelligence-design.md
prospectSchemes: defineTable({
  clientId: v.id("clients"),
  companyNumber: v.string(), // the SPV's Companies House number
  companyName: v.string(),
  schemeName: v.optional(v.string()),
  address: v.optional(v.string()),
  planningRefs: v.optional(v.array(v.string())),
  estimatedUnits: v.optional(v.number()),
  schemeType: v.optional(v.string()),
  whatBuilding: v.optional(v.string()),
  gdvEstimate: v.optional(v.string()), // range string, never a naked number
  confidence: v.optional(v.string()), // "high" | "med" | "low"
  status: v.optional(v.string()), // "live" | "past"
  sourceUrls: v.optional(v.array(v.string())),
  operatorConfirmed: v.boolean(),
  updatedBy: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
})
  .index("by_client", ["clientId"])
  .index("by_client_company", ["clientId", "companyNumber"]),
```

- [ ] **Step 2: Verify the schema compiles**

Run: `npx convex codegen` (regenerates `convex/_generated`).
Expected: no errors; `prospectSchemes` appears in generated types.

- [ ] **Step 3: Commit**

```bash
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated
git commit -m "feat(prospect-schemes): add prospectSchemes table"
```

---

## Task 4: `getProspectSchemes` query + `upsertProspectScheme` mutation

**Files:**
- Modify: `model-testing-app/convex/companies.ts` (add two exports)

- [ ] **Step 1: Implement `getProspectSchemes`**

Mirror `getGroupCharges`'s company-number resolution + per-company charge collection, then group into schemes using the Task 1 helpers and merge `prospectSchemes` enrichment.

```ts
import {
  type GroupCharge,
  distinctLenders,
  classifySchemeStatus,
  parseCandidateAddress,
  rankByRecency,
} from "./lib/schemeGrouping";

export const getProspectSchemes = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return { live: [], past: [] };

    const parentNumber = (client as any).companiesHouseNumber as string | undefined;
    const relatedNumbers = ((client as any).relatedCompaniesHouseNumbers ?? []) as string[];
    const seen = new Set<string>();
    const numbers: string[] = [];
    for (const n of [parentNumber, ...relatedNumbers]) {
      const num = (n ?? "").trim();
      if (!num || seen.has(num)) continue;
      seen.add(num);
      numbers.push(num);
    }
    if (numbers.length === 0) return { live: [], past: [] };

    // Pre-load enrichment rows for this client, keyed by companyNumber
    const enrichmentRows = await ctx.db
      .query("prospectSchemes")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    const enrichmentByCompany = new Map(enrichmentRows.map((r) => [r.companyNumber, r]));

    const schemes: any[] = [];
    for (const companyNumber of numbers) {
      const company = await ctx.db
        .query("companiesHouseCompanies")
        .withIndex("by_company_number", (q: any) => q.eq("companyNumber", companyNumber))
        .first();
      if (!company) continue;

      const rawCharges = await ctx.db
        .query("companiesHouseCharges")
        .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
        .collect();
      if (rawCharges.length === 0) continue; // schemes are charge-bearing SPVs

      const charges: GroupCharge[] = rawCharges
        .map((c) => ({
          companyNumber,
          companyName: company.companyName,
          companyStatus: (company as any).companyStatus,
          chargeId: c.chargeId,
          lender: c.chargeeName?.trim() || "(unnamed)",
          date: c.chargeDate,
          status: c.chargeStatus,
          description: c.chargeDescription,
        }))
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

      const enrichment = enrichmentByCompany.get(companyNumber);
      const lastChargeDate = charges[0]?.date;
      schemes.push({
        companyNumber,
        companyName: company.companyName,
        companyStatus: (company as any).companyStatus,
        lenders: distinctLenders(charges),
        charges,
        lastChargeDate,
        status: classifySchemeStatus((company as any).companyStatus, charges),
        // enrichment (may be undefined until the skill runs)
        address: enrichment?.address ?? parseCandidateAddress(charges[0]?.description),
        addressIsEstimate: !enrichment?.address,
        planningRefs: enrichment?.planningRefs ?? [],
        estimatedUnits: enrichment?.estimatedUnits,
        schemeType: enrichment?.schemeType,
        whatBuilding: enrichment?.whatBuilding,
        gdvEstimate: enrichment?.gdvEstimate,
        confidence: enrichment?.confidence,
        sourceUrls: enrichment?.sourceUrls ?? [],
        operatorConfirmed: enrichment?.operatorConfirmed ?? false,
      });
    }

    const live = rankByRecency(schemes.filter((s) => s.status === "live"));
    const past = rankByRecency(schemes.filter((s) => s.status === "past"));
    return { live, past };
  },
});
```

- [ ] **Step 2: Implement `upsertProspectScheme`**

```ts
export const upsertProspectScheme = mutation({
  args: {
    clientId: v.id("clients"),
    companyNumber: v.string(),
    companyName: v.string(),
    schemeName: v.optional(v.string()),
    address: v.optional(v.string()),
    planningRefs: v.optional(v.array(v.string())),
    estimatedUnits: v.optional(v.number()),
    schemeType: v.optional(v.string()),
    whatBuilding: v.optional(v.string()),
    gdvEstimate: v.optional(v.string()),
    confidence: v.optional(v.string()),
    status: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
    operatorConfirmed: v.optional(v.boolean()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("prospectSchemes")
      .withIndex("by_client_company", (q: any) =>
        q.eq("clientId", args.clientId).eq("companyNumber", args.companyNumber),
      )
      .first();

    const { clientId, companyNumber, operatorConfirmed, ...rest } = args;
    if (existing) {
      // Never silently clobber an operator-confirmed row from a skill re-run.
      const keepConfirmed = existing.operatorConfirmed && operatorConfirmed === undefined;
      await ctx.db.patch(existing._id, {
        ...rest,
        operatorConfirmed: keepConfirmed ? true : (operatorConfirmed ?? existing.operatorConfirmed),
        updatedAt: now,
      });
      return { schemeId: existing._id, created: false };
    }
    const schemeId = await ctx.db.insert("prospectSchemes", {
      clientId,
      companyNumber,
      ...rest,
      operatorConfirmed: operatorConfirmed ?? false,
      createdAt: now,
      updatedAt: now,
    } as any);
    return { schemeId, created: true };
  },
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds. (Convex codegen runs as part of dev/build; if types lag, run `npx convex codegen` first.)

- [ ] **Step 4: Commit**

```bash
git add model-testing-app/convex/companies.ts
git commit -m "feat(prospect-schemes): getProspectSchemes query + upsertProspectScheme mutation"
```

---

## Task 5: MCP tools for the two new functions

**Files:**
- Modify: `model-testing-app/convex/mcp.ts` (add two tool objects to the `TOOLS` array, beside the existing `companies.*` tools)
- Modify: `skills/CATALOGUE.md` (add the two tools + bump the count)

- [ ] **Step 1: Add the tool definitions** (follow the existing pattern at the `companies.getGroupCharges` tool)

```ts
{
  name: "companies.getProspectSchemes",
  description:
    "Per-scheme view of a prospect's corporate group: one row per charge-bearing SPV, split into live[] and past[] (live = active company with an outstanding charge), each ranked by most-recent charge date. Merges the SPV's charges (lender(s), dates) with any prospectSchemes enrichment (address, what they're building, confidence). Powers the Track Record tab. Args: { clientId }.",
  inputSchema: {
    type: "object",
    properties: { clientId: { type: "string", description: "Convex id of the prospect's clients row" } },
    required: ["clientId"],
  },
  handler: async (ctx, _userId, args) => {
    const result = await ctx.runQuery(api.companies.getProspectSchemes, { clientId: args.clientId });
    return asText(result);
  },
},
{
  name: "companies.upsertProspectScheme",
  description:
    "Upsert per-scheme enrichment for a prospect (keyed by clientId + companyNumber). The prospect-intel skill writes draft estimates (operatorConfirmed defaults false); operator edits in the Track Record tab set operatorConfirmed true and are not clobbered by skill re-runs. Pass address, planningRefs, estimatedUnits, schemeType, whatBuilding, gdvEstimate (range string), confidence ('high'|'med'|'low'), status ('live'|'past'), sourceUrls. Surface-only: does not create clients/companies rows.",
  inputSchema: {
    type: "object",
    properties: {
      clientId: { type: "string" },
      companyNumber: { type: "string" },
      companyName: { type: "string" },
      schemeName: { type: "string" },
      address: { type: "string" },
      planningRefs: { type: "array", items: { type: "string" } },
      estimatedUnits: { type: "number" },
      schemeType: { type: "string" },
      whatBuilding: { type: "string" },
      gdvEstimate: { type: "string" },
      confidence: { type: "string" },
      status: { type: "string" },
      sourceUrls: { type: "array", items: { type: "string" } },
      operatorConfirmed: { type: "boolean" },
    },
    required: ["clientId", "companyNumber", "companyName"],
  },
  handler: async (ctx, _userId, args) => {
    const result = await ctx.runMutation(api.companies.upsertProspectScheme, args);
    return asText(result);
  },
},
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Update CATALOGUE + commit**

Add both tools to the `companies.*` section of `skills/CATALOGUE.md`, bump the tool count in the header line (currently "84 tools" → 86), and note that `getProspectSchemes` powers the Track Record tab.

```bash
git add model-testing-app/convex/mcp.ts skills/CATALOGUE.md
git commit -m "feat(prospect-schemes): MCP tools getProspectSchemes + upsertProspectScheme"
```

---

## Task 6: CH tab — extract `ChargeChronologyTable`, add per-SPV + group-flat chronology

**Files:**
- Create: `model-testing-app/src/components/prospects/tabs/ChargeChronologyTable.tsx`
- Modify: `model-testing-app/src/components/prospects/tabs/CompaniesHouseTab.tsx`

- [ ] **Step 1: Extract the existing inline charge table into a reusable component**

Create `ChargeChronologyTable.tsx` containing the table markup currently at `CompaniesHouseTab.tsx:264-295` (the `<table>` with Date / Lender / Status / Description columns + the `chargeStatusPill`). Props:

```tsx
"use client";
import { useColors } from "@/lib/useColors";

type ChargeRow = { chargeId?: string; _id?: string; chargeDate?: string; date?: string; chargeeName?: string; lender?: string; chargeStatus?: string; status?: string; chargeDescription?: string; description?: string };

export function ChargeChronologyTable({ charges }: { charges: ChargeRow[] }) {
  // ...move chargeStatusPill here (or import it); render the table exactly as the
  // existing CompaniesHouseTab table, reading date/lender/status/description with
  // fallbacks (chargeDate||date, chargeeName||lender, chargeStatus||status, chargeDescription||description).
}
```

Update `CompaniesHouseTab.tsx` to import and use `<ChargeChronologyTable charges={sortedCharges} />` for the anchor company (replacing the inline `<table>`), keeping the `SectionLabel`.

- [ ] **Step 2: Add a flat group chronology + per-SPV chronology to the group section**

In `CompaniesHouseTab.tsx`, inside the group block (`groupCharges && groupCharges.companyCount > 1`), after the "Companies in group" list, add:

```tsx
{/* Group charges chronology — every charge across the group, newest-first */}
{(groupCharges.charges ?? []).length > 0 && (
  <div style={{ marginTop: 18 }}>
    <SectionLabel colors={colors}>Group charges chronology ({groupCharges.charges.length})</SectionLabel>
    <ChargeChronologyTable
      charges={(groupCharges.charges as any[]).map((c) => ({
        chargeId: c.chargeId, chargeDate: c.date, chargeeName: `${c.lender} · ${c.companyName}`,
        chargeStatus: c.status, chargeDescription: c.description,
      }))}
    />
  </div>
)}

{/* Per-SPV charges chronology — each funded group company, collapsible */}
{(() => {
  const byCo = new Map<string, any[]>();
  for (const c of (groupCharges.charges ?? []) as any[]) {
    if (!byCo.has(c.companyNumber)) byCo.set(c.companyNumber, []);
    byCo.get(c.companyNumber)!.push(c);
  }
  const cos = [...byCo.entries()].sort((a, b) => (b[1][0]?.date ?? "").localeCompare(a[1][0]?.date ?? ""));
  return cos.length > 0 ? (
    <div style={{ marginTop: 18 }}>
      <SectionLabel colors={colors}>Charge chronology by company ({cos.length})</SectionLabel>
      {cos.map(([num, cs]) => (
        <details key={num} style={{ marginBottom: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 12, color: colors.text.primary, padding: "6px 0" }}>
            {cs[0].companyName} · <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: colors.text.muted }}>{num}</span> · {cs.length} charge{cs.length === 1 ? "" : "s"}
          </summary>
          <ChargeChronologyTable charges={cs.map((c) => ({ chargeId: c.chargeId, chargeDate: c.date, chargeeName: c.lender, chargeStatus: c.status, chargeDescription: c.description }))} />
        </details>
      ))}
    </div>
  ) : null;
})()}
```

- [ ] **Step 3: Verify build + preview**

Run: `npm run build`
Expected: succeeds.
Preview (manual): open the Mackenzie Miller prospect → CH tab → confirm (a) the anchor table still renders, (b) "Group charges chronology" lists all 19 charges newest-first, (c) "Charge chronology by company" expands per-SPV (e.g. Little Rissington shows its Paragon-2022 + Investec-2025 charges).

- [ ] **Step 4: Commit**

```bash
git add model-testing-app/src/components/prospects/tabs/ChargeChronologyTable.tsx model-testing-app/src/components/prospects/tabs/CompaniesHouseTab.tsx
git commit -m "feat(prospect-schemes): per-SPV + group charges chronology on CH tab"
```

---

## Task 7: Track Record tab

**Files:**
- Create: `model-testing-app/src/components/prospects/tabs/TrackRecordTab.tsx`
- Modify: `model-testing-app/src/app/(desktop)/prospects/[prospectId]/page.tsx`
- Modify: `model-testing-app/src/components/prospects/ProspectDetailHeader.tsx` (add the nav button)

- [ ] **Step 1: Build `TrackRecordTab`**

Reads `schemes = { live, past }` (from `getProspectSchemes`). Renders two `SectionLabel` sections (Live schemes / Past schemes), top 5-7 each with a "Show all" toggle. Each scheme card shows: company name + CH link, `lenders.join(", ")`, `lastChargeDate`, status pill, address (with an "estimate" tag when `addressIsEstimate`), and a "what they're building" block (`whatBuilding` + `confidence` chip + `planningRefs`/`sourceUrls` links) or a muted "Not yet researched" when `whatBuilding` is empty. Include an inline confirm/edit affordance that calls `upsertProspectScheme` (via `useMutation(api.companies.upsertProspectScheme)`) and sets `operatorConfirmed: true`. Reuse the visual primitives (`SectionLabel`, status pill) — export them from `ChargeChronologyTable.tsx` or a small shared module to avoid duplication.

- [ ] **Step 2: Wire the query + render block in `page.tsx`**

```tsx
// 1. extend the activeTab union (line 28):
const [activeTab, setActiveTab] = useState<"overview" | "intel" | "people" | "ch" | "track-record" | "outreach" | "replies" | "meetings" | "activity">("overview");

// 2. import: import { TrackRecordTab } from "@/components/prospects/tabs/TrackRecordTab";

// 3. add the query (beside groupCharges, ~line 70):
const schemes = useQuery(api.companies.getProspectSchemes, prospect ? { clientId: prospectId } : "skip");

// 4. add the render block (beside the ch block, ~line 131):
{activeTab === "track-record" && <TrackRecordTab schemes={schemes} clientId={prospectId} />}

// 5. pass a count to the header for the nav badge:
schemesCount={((schemes as any)?.live?.length ?? 0) + ((schemes as any)?.past?.length ?? 0)}
```

- [ ] **Step 3: Add the nav button in `ProspectDetailHeader.tsx`**

Add a "Track Record" tab entry following the existing tab-button pattern (the same way "ch"/"people" buttons are rendered), keyed to `"track-record"`, with the `schemesCount` badge. Read the file to match the exact button markup.

- [ ] **Step 4: Verify build + preview**

Run: `npm run build`
Expected: succeeds.
Preview (manual): Mackenzie Miller → Track Record tab → Live section lists the funded live SPVs (Leighterton/Poole, Temple Guiting, Little Rissington, Nether Westcote, etc.) newest-first with lender + address; Past section lists satisfied/dissolved; "Not yet researched" shows where enrichment is absent.

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/src/components/prospects/tabs/TrackRecordTab.tsx "model-testing-app/src/app/(desktop)/prospects/[prospectId]/page.tsx" model-testing-app/src/components/prospects/ProspectDetailHeader.tsx
git commit -m "feat(prospect-schemes): Track Record tab (live/past schemes)"
```

---

## Task 8: prospect-intel skill — deep scheme enrichment step

**Files:**
- Create: `skills/skills/prospect-intel/references/scheme-from-charges.md`
- Modify: `skills/skills/prospect-intel/SKILL.md` (new workflow step + tool dependency + reference entry)

- [ ] **Step 1: Author the reference**

`scheme-from-charges.md` documents: for each LIVE scheme (an SPV with an outstanding charge) returned by `companies.getProspectSchemes`, take the candidate address from the charge particulars; run deep research "as deep as possible" — planning portal search, local press, the developer's own site, property listings — to estimate units / scheme type / GDV (range, never naked) / what they're building, with a confidence label and cited `sourceUrls`; then persist via `companies.upsertProspectScheme` as a draft (`operatorConfirmed=false`). Rules: estimates only (no fabrication, per CONVENTIONS); cite every claim; skip schemes already enriched unless stale (>30 days or a new charge); never assert which lender funded which scheme without the per-charge register (link the lender-dna guardrail).

- [ ] **Step 2: Add the workflow step + deps to SKILL.md**

Add a step (after the corporate-group walk / lender DNA) invoking `references/scheme-from-charges.md`; add `companies.getProspectSchemes` + `companies.upsertProspectScheme` to `## Tool dependencies`; add the reference to `## References`; note in `## Outputs` that the skill now writes `prospectSchemes` rows (draft scheme enrichment) feeding the Track Record tab.

- [ ] **Step 3: Verify (no build needed — markdown only) + commit**

```bash
git add skills/skills/prospect-intel/references/scheme-from-charges.md skills/skills/prospect-intel/SKILL.md
git commit -m "feat(prospect-schemes): prospect-intel deep scheme-enrichment step"
```

---

## Task 9: Final verification + discoverability sweep

**Files:** (verification only; fix-ups as needed)

- [ ] **Step 1: Full test + build**

Run: `npm run test:run` (all suites green, incl. `schemeGrouping.test.ts`)
Run: `npm run build` (clean)

- [ ] **Step 2: End-to-end preview on Mackenzie Miller**

CH tab: anchor table + group chronology + per-SPV chronology all render. Track Record tab: live/past populated. Run the prospect-intel scheme-enrichment step on 1-2 live schemes (Leighterton/Poole 16027708, Temple Guiting 14032704), reload Track Record, confirm "what they're building" appears as a draft estimate with sources; confirm operator-confirm sets the badge and survives a skill re-run.

- [ ] **Step 3: Discoverability check (explicit requirement)**

Confirm: `skills/CATALOGUE.md` lists the 2 new tools + the `getGroupCharges` `charges` note + bumped count; `prospectSchemes` has its schema comment pointing at the spec; prospect-intel `SKILL.md` references the table + Track Record tab. Move the logbook task `.logbook/queued/2026-05-28_prospect-track-record-scheme-charge-intelligence.md` to done (or note completion).

- [ ] **Step 4: Final commit (+ spec/plan if still uncommitted)**

```bash
git add -A
git commit -m "chore(prospect-schemes): docs, catalogue, logbook discoverability"
```

---

## Self-review notes (author)

- **Spec coverage:** group charges chronology (Task 2 + 6), per-SPV chronology (Task 6, the explicit "important" ask), Track Record tab live/past 5-7 (Task 7), address from particulars (Task 1 `parseCandidateAddress` + Task 4 surfacing), "what they're building" via skill (Task 8), durable enrichment (Task 3/4), discoverability (Task 5 + 9). All covered.
- **Type consistency:** `GroupCharge` shape defined in Task 1 is reused in Tasks 2/4; `getGroupCharges.charges` and `getProspectSchemes` rows use the same field names (`lender`, `date`, `status`, `description`).
- **No convex-test:** TDD applies to Task 1 helpers only; everything else is build + preview, by design (repo reality).
