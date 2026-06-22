# Deal Book / Case-Study Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-backed case-study index + Deal Book page that makes hook-ladder rung 9 ("we've done a couple of similar [TYPE] schemes in [REGION]") a live, queryable, human-gated capability.

**Architecture:** A new `caseStudies` Convex table (1:1 with `completed` projects) holds anonymised sector/region/size metadata, gated by a draft→confirm flow. A `caseStudy` MCP domain exposes derive/confirm/match/list/toggle. A "Deal Book" Next.js page reads `projects` as a portfolio (Open/Closed/Lost) with a stats bar; closed rows link to both their case study and project. Pure logic (sector inference, size banding, anonymised headline, portfolio stats) lives in `convex/lib/dealBook.ts` and is unit-tested with vitest. Canonical skill/reference edits land in RockCap-MCP and are synced down to `v2/skills`.

**Tech Stack:** Convex (queries/mutations, JSON-Schema MCP tools in `mcp.ts`), Next.js App Router + React + inline `useColors()` styling (matches existing prospects page), vitest.

**Repos:** code in `rockcap-v2` (`model-testing-app/`); canonical skills in `RockCap-MCP` (`~/ROCKCAP/RockCap-MCP`), synced into `rockcap-v2/skills/`.

**Key conventions discovered (apply throughout):**
- Convex: one file per table; soft-delete via `isDeleted` patch (follow `convex/projects.ts`); timestamps are ISO strings `new Date().toISOString()`; index callbacks typed `(q: any)`; reads exclude soft-deleted with `.filter((q) => q.neq(q.field("isDeleted"), true))`.
- MCP tools are object literals in the `TOOLS` array in `convex/mcp.ts`; `inputSchema` is **raw JSON Schema**; handlers call `ctx.runQuery`/`ctx.runMutation(api.*, ...)` and wrap returns in `asText(...)`. There is **no `tools-manifest.json` in rockcap-v2** — the array is the source of truth.
- **Auth:** MCP runs as an httpAction with a bearer token (no Clerk identity). Any Convex mutation that MCP calls must use `getAuthenticatedUserOrNull(ctx)` (from `convex/authHelpers.ts`) and treat the user as optional — never `getAuthenticatedUser` (which throws).
- Frontend list pages use raw `<table>` + inline styles from `useColors()` + a custom `TabButton` (follow `src/app/(desktop)/prospects/page.tsx`), not shadcn.

---

## File Structure

**rockcap-v2 (`model-testing-app/`):**
- Create `convex/lib/dealBook.ts` — pure helpers (sector taxonomy, size band, sector inference, anonymised headline, status bucketing, portfolio stats).
- Create `src/__tests__/dealBook.test.ts` — vitest unit tests for the helpers.
- Modify `convex/schema.ts` — add `caseStudies` table.
- Create `convex/caseStudies.ts` — `deriveDrafts`, `confirm`, `matchForProspect`, `list`, `getByProject`, `setReferenceable`.
- Create `convex/dealBook.ts` — `stats` query (portfolio aggregates over projects).
- Modify `convex/mcp.ts` — add 5 `caseStudy.*` tools + 1 `dealBook.stats` tool to the `TOOLS` array.
- Modify `src/components/Sidebar.tsx` — add "Deal Book" nav item.
- Create `src/app/(desktop)/deal-book/page.tsx` — the Deal Book page.

**RockCap-MCP (canonical, then rsync to `rockcap-v2/skills/`):**
- Create `shared-references/deal-sectors.md` — canonical sector taxonomy.
- Modify `shared-references/hook-ladder.md` — flip rung 9 to live.
- Modify `sub-skills/compose-outreach-hook.md` — add the rung-9 procedure.
- Modify `CATALOGUE.md` + `tools-manifest.json` — add the `caseStudy`/`dealBook` domain; bump counts.

---

## Task 1: Pure helpers (TDD)

**Files:**
- Create: `model-testing-app/convex/lib/dealBook.ts`
- Test: `model-testing-app/src/__tests__/dealBook.test.ts`

- [ ] **Step 1: Write the failing test**

Create `model-testing-app/src/__tests__/dealBook.test.ts`:

```ts
import {
  sizeBandFromLoanAmount,
  inferSector,
  buildAnonymisedHeadline,
  bucketProjectStatus,
  computePortfolioStats,
  DEAL_SECTORS,
} from "../../convex/lib/dealBook";

describe("sizeBandFromLoanAmount", () => {
  it("returns undisclosed for missing/zero", () => {
    expect(sizeBandFromLoanAmount(undefined)).toBe("undisclosed");
    expect(sizeBandFromLoanAmount(0)).toBe("undisclosed");
  });
  it("bands by millions", () => {
    expect(sizeBandFromLoanAmount(3_000_000)).toBe("sub-£5m");
    expect(sizeBandFromLoanAmount(7_500_000)).toBe("£5–10m");
    expect(sizeBandFromLoanAmount(20_000_000)).toBe("£10–25m");
    expect(sizeBandFromLoanAmount(40_000_000)).toBe("£25–50m");
    expect(sizeBandFromLoanAmount(80_000_000)).toBe("£50–100m");
    expect(sizeBandFromLoanAmount(150_000_000)).toBe("£100m+");
  });
});

describe("inferSector", () => {
  it("matches keywords case-insensitively", () => {
    expect(inferSector("Purpose Built Student accommodation")).toBe("student_pbsa");
    expect(inferSector("A Build-to-Rent tower")).toBe("btr_rental");
    expect(inferSector("logistics warehouse")).toBe("industrial_logistics");
  });
  it("returns null when nothing matches", () => {
    expect(inferSector("")).toBeNull();
    expect(inferSector("misc project")).toBeNull();
  });
  it("only returns canonical sectors", () => {
    const s = inferSector("residential houses");
    expect(DEAL_SECTORS).toContain(s);
  });
});

describe("buildAnonymisedHeadline", () => {
  it("uses region phrasing when region present", () => {
    expect(buildAnonymisedHeadline({ sector: "btr_rental", region: "North West" }))
      .toBe("we've arranged funding on a couple of BTR/rental schemes in the North West");
  });
  it("falls back to type-only phrasing without region", () => {
    expect(buildAnonymisedHeadline({ sector: "student_pbsa" }))
      .toBe("we've done a couple of similar student schemes");
  });
  it("never contains a borrower/client placeholder", () => {
    const h = buildAnonymisedHeadline({ sector: "residential", region: "London" });
    expect(h).not.toMatch(/\[CLIENT\]|borrower/i);
  });
});

describe("bucketProjectStatus", () => {
  it("maps lifecycle to buckets", () => {
    expect(bucketProjectStatus("active")).toBe("open");
    expect(bucketProjectStatus("on-hold")).toBe("open");
    expect(bucketProjectStatus("completed")).toBe("closed");
    expect(bucketProjectStatus("cancelled")).toBe("lost");
    expect(bucketProjectStatus("inactive")).toBeNull();
    expect(bucketProjectStatus(undefined)).toBeNull();
  });
});

describe("computePortfolioStats", () => {
  const now = "2026-06-10T00:00:00.000Z";
  it("aggregates counts, values, and closed windows", () => {
    const projects = [
      { status: "active", loanAmount: 10_000_000, endDate: null },
      { status: "active", loanAmount: 5_000_000, endDate: null },
      { status: "completed", loanAmount: 20_000_000, endDate: "2026-06-01T00:00:00.000Z" }, // ~9d
      { status: "completed", loanAmount: 30_000_000, endDate: "2026-01-01T00:00:00.000Z" }, // ~160d
      { status: "completed", loanAmount: 1_000_000, endDate: "2024-01-01T00:00:00.000Z" }, // >365d
      { status: "cancelled", loanAmount: 9_000_000, endDate: null },
      { status: "inactive", loanAmount: 999, endDate: null }, // excluded
    ];
    const s = computePortfolioStats(projects, now);
    expect(s.open).toEqual({ count: 2, value: 15_000_000 });
    expect(s.closed).toEqual({ count: 3, value: 51_000_000 });
    expect(s.lost).toEqual({ count: 1 });
    expect(s.closedByWindow.d30).toBe(1);
    expect(s.closedByWindow.d90).toBe(1);
    expect(s.closedByWindow.d180).toBe(2);
    expect(s.closedByWindow.d365).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd model-testing-app && npx vitest run src/__tests__/dealBook.test.ts`
Expected: FAIL — cannot resolve `../../convex/lib/dealBook` (module not found).

- [ ] **Step 3: Write the implementation**

Create `model-testing-app/convex/lib/dealBook.ts`:

```ts
/**
 * Pure, runtime-free helpers for the Deal Book / case-study index.
 * No Convex imports — safe to import from both convex/ functions and vitest.
 * Keep DEAL_SECTORS in sync with shared-references/deal-sectors.md.
 */

export const DEAL_SECTORS = [
  "residential",
  "btr_rental",
  "student_pbsa",
  "co_living",
  "mixed_use",
  "commercial",
  "industrial_logistics",
  "hotel_leisure",
] as const;
export type DealSector = (typeof DEAL_SECTORS)[number];

export const SECTOR_LABELS: Record<DealSector, string> = {
  residential: "residential",
  btr_rental: "BTR/rental",
  student_pbsa: "student",
  co_living: "co-living",
  mixed_use: "mixed-use",
  commercial: "commercial",
  industrial_logistics: "industrial/logistics",
  hotel_leisure: "hotel/leisure",
};

const SECTOR_KEYWORDS: Record<DealSector, string[]> = {
  btr_rental: ["btr", "build to rent", "build-to-rent", "rental", "prs", "multifamily"],
  student_pbsa: ["student", "pbsa", "purpose built student", "halls"],
  co_living: ["co-living", "coliving", "co living"],
  mixed_use: ["mixed use", "mixed-use"],
  industrial_logistics: ["industrial", "logistics", "warehouse", "distribution"],
  hotel_leisure: ["hotel", "leisure", "hospitality", "aparthotel"],
  commercial: ["office", "commercial", "retail"],
  residential: ["residential", "houses", "housing", "apartments", "flats", "homes", "for sale"],
};
// Match order: most-specific sectors first, generic residential/commercial last.
const SECTOR_MATCH_ORDER: DealSector[] = [
  "btr_rental",
  "student_pbsa",
  "co_living",
  "mixed_use",
  "industrial_logistics",
  "hotel_leisure",
  "commercial",
  "residential",
];

/** Coarse loan-size band from an actual loanAmount (GBP). */
export function sizeBandFromLoanAmount(loanAmount: number | undefined | null): string {
  if (loanAmount == null || loanAmount <= 0) return "undisclosed";
  const m = loanAmount / 1_000_000;
  if (m < 5) return "sub-£5m";
  if (m < 10) return "£5–10m";
  if (m < 25) return "£10–25m";
  if (m < 50) return "£25–50m";
  if (m < 100) return "£50–100m";
  return "£100m+";
}

/** Best-effort sector inference from free text. Draft only — operator confirms. */
export function inferSector(text: string | undefined | null): DealSector | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const sector of SECTOR_MATCH_ORDER) {
    if (SECTOR_KEYWORDS[sector].some((kw) => t.includes(kw))) return sector;
  }
  return null;
}

/** Anonymised rung-9 headline. NEVER includes a borrower / prospect-side name. */
export function buildAnonymisedHeadline(opts: {
  sector: DealSector;
  region?: string | null;
  sizeBand?: string | null;
}): string {
  const label = SECTOR_LABELS[opts.sector] ?? String(opts.sector);
  const region = opts.region?.trim();
  if (region) {
    return `we've arranged funding on a couple of ${label} schemes in the ${region}`;
  }
  return `we've done a couple of similar ${label} schemes`;
}

export type DealBucket = "open" | "closed" | "lost";

/** Map a project's status to a Deal Book bucket (null = excluded). */
export function bucketProjectStatus(status: string | undefined | null): DealBucket | null {
  switch (status) {
    case "active":
    case "on-hold":
      return "open";
    case "completed":
      return "closed";
    case "cancelled":
      return "lost";
    default:
      return null;
  }
}

export interface DealBookProjectLike {
  status?: string | null;
  loanAmount?: number | null;
  endDate?: string | null;
}
export interface PortfolioStats {
  open: { count: number; value: number };
  closed: { count: number; value: number };
  lost: { count: number };
  closedByWindow: { d30: number; d90: number; d180: number; d365: number };
}

/** Portfolio aggregates over a set of projects. `nowIso` injected for determinism. */
export function computePortfolioStats(
  projects: DealBookProjectLike[],
  nowIso: string,
): PortfolioStats {
  const now = new Date(nowIso).getTime();
  const day = 24 * 60 * 60 * 1000;
  const s: PortfolioStats = {
    open: { count: 0, value: 0 },
    closed: { count: 0, value: 0 },
    lost: { count: 0 },
    closedByWindow: { d30: 0, d90: 0, d180: 0, d365: 0 },
  };
  for (const p of projects) {
    const bucket = bucketProjectStatus(p.status);
    const amount = p.loanAmount ?? 0;
    if (bucket === "open") {
      s.open.count++;
      s.open.value += amount;
    } else if (bucket === "closed") {
      s.closed.count++;
      s.closed.value += amount;
      if (p.endDate) {
        const ageDays = (now - new Date(p.endDate).getTime()) / day;
        if (ageDays <= 30) s.closedByWindow.d30++;
        if (ageDays <= 90) s.closedByWindow.d90++;
        if (ageDays <= 180) s.closedByWindow.d180++;
        if (ageDays <= 365) s.closedByWindow.d365++;
      }
    } else if (bucket === "lost") {
      s.lost.count++;
    }
  }
  return s;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd model-testing-app && npx vitest run src/__tests__/dealBook.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add model-testing-app/convex/lib/dealBook.ts model-testing-app/src/__tests__/dealBook.test.ts
git commit -m "feat(deal-book): pure helpers for sector/size/headline/stats (TDD)"
```

---

## Task 2: `caseStudies` schema table

**Files:**
- Modify: `model-testing-app/convex/schema.ts` (insert after the `knowledgeBankEntries` block, before `notes:` at line ~1289)

- [ ] **Step 1: Add the table definition**

In `model-testing-app/convex/schema.ts`, immediately after the `knowledgeBankEntries` table's closing `}),` (line ~1287) and before the `// Notes` comment, insert:

```ts
  // Deal Book / case-study index — 1:1 with a completed project. Powers
  // hook-ladder rung 9 (anonymised sub-sector match). See
  // docs/superpowers/specs/2026-06-10-deal-book-case-study-index-design.md
  caseStudies: defineTable({
    projectId: v.id("projects"),
    curationStatus: v.union(v.literal("draft"), v.literal("confirmed")),
    sector: v.string(), // canonical value from convex/lib/dealBook DEAL_SECTORS ("" until confirmed)
    dealType: v.string(), // e.g. "development finance", "bridge" ("" until set)
    region: v.string(),
    sizeBand: v.string(), // from sizeBandFromLoanAmount
    headline: v.string(), // anonymised one-liner; "" until confirmed
    referenceable: v.boolean(), // hard gate for hook eligibility
    confirmedBy: v.optional(v.id("users")),
    confirmedAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    // Soft delete
    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.string()),
    deletedBy: v.optional(v.id("users")),
    deletedReason: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_curationStatus", ["curationStatus"])
    .index("by_sector", ["sector"])
    .index("by_referenceable", ["referenceable"]),
```

- [ ] **Step 2: Verify the schema compiles**

Run: `cd model-testing-app && npx convex codegen`
Expected: completes without error; `convex/_generated/dataModel.d.ts` now includes `caseStudies`.

- [ ] **Step 3: Commit**

```bash
git add model-testing-app/convex/schema.ts model-testing-app/convex/_generated
git commit -m "feat(deal-book): add caseStudies table (1:1 with completed projects)"
```

---

## Task 3: `caseStudies` Convex functions

**Files:**
- Create: `model-testing-app/convex/caseStudies.ts`

- [ ] **Step 1: Write the module**

Create `model-testing-app/convex/caseStudies.ts`:

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthenticatedUserOrNull } from "./authHelpers";
import {
  sizeBandFromLoanAmount,
  inferSector,
  buildAnonymisedHeadline,
  type DealSector,
} from "./lib/dealBook";

/**
 * Scan completed projects with no case study and create draft entries with
 * inferred sector/region/sizeBand. Idempotent: skips projects already covered.
 * Callable from the web app (Clerk) and from MCP (bearer token) — no user required.
 */
export const deriveDrafts = mutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    const completed = projects.filter((p) => p.status === "completed");
    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;
    for (const p of completed) {
      const existing = await ctx.db
        .query("caseStudies")
        .withIndex("by_project", (q: any) => q.eq("projectId", p._id))
        .filter((q: any) => q.neq(q.field("isDeleted"), true))
        .first();
      if (existing) {
        skipped++;
        continue;
      }
      const sector = inferSector(
        `${p.name ?? ""} ${p.description ?? ""} ${(p.tags ?? []).join(" ")}`,
      );
      await ctx.db.insert("caseStudies", {
        projectId: p._id,
        curationStatus: "draft",
        sector: sector ?? "",
        dealType: "",
        region: p.city ?? p.state ?? "",
        sizeBand: sizeBandFromLoanAmount(p.loanAmount),
        headline: "",
        referenceable: false,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    return { created, skipped, totalCompleted: completed.length };
  },
});

/**
 * Operator confirms/edits a draft. If no headline supplied, an anonymised one
 * is generated from sector + region. Sets curationStatus = "confirmed".
 */
export const confirm = mutation({
  args: {
    id: v.id("caseStudies"),
    sector: v.string(),
    dealType: v.optional(v.string()),
    region: v.optional(v.string()),
    sizeBand: v.optional(v.string()),
    headline: v.optional(v.string()),
    referenceable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Case study not found");
    const region = args.region ?? entry.region;
    const sizeBand = args.sizeBand ?? entry.sizeBand;
    const headline =
      args.headline && args.headline.trim().length > 0
        ? args.headline
        : buildAnonymisedHeadline({
            sector: args.sector as DealSector,
            region,
            sizeBand,
          });
    const now = new Date().toISOString();
    await ctx.db.patch(args.id, {
      sector: args.sector,
      dealType: args.dealType ?? entry.dealType,
      region,
      sizeBand,
      headline,
      referenceable: args.referenceable ?? entry.referenceable,
      curationStatus: "confirmed",
      confirmedBy: user?._id,
      confirmedAt: now,
      updatedAt: now,
    });
    return { status: "confirmed", id: args.id };
  },
});

/**
 * Query the index for hook rung 9. Returns ONLY confirmed + referenceable
 * entries, projected to anonymised fields — never the backing project name.
 * If a region is given and any match shares it, region matches are preferred.
 */
export const matchForProspect = query({
  args: { sector: v.string(), region: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("caseStudies")
      .withIndex("by_sector", (q: any) => q.eq("sector", args.sector))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();
    entries = entries.filter(
      (e) => e.curationStatus === "confirmed" && e.referenceable === true,
    );
    if (args.region) {
      const regionMatches = entries.filter(
        (e) => (e.region ?? "").toLowerCase() === args.region!.toLowerCase(),
      );
      if (regionMatches.length > 0) entries = regionMatches;
    }
    return entries.map((e) => ({
      sector: e.sector,
      region: e.region,
      sizeBand: e.sizeBand,
      dealType: e.dealType,
      headline: e.headline,
    }));
  },
});

/** List entries (joined with their backing project) for the page and ops. */
export const list = query({
  args: {
    curationStatus: v.optional(v.union(v.literal("draft"), v.literal("confirmed"))),
    sector: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let entries = await ctx.db
      .query("caseStudies")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    if (args.curationStatus) {
      entries = entries.filter((e) => e.curationStatus === args.curationStatus);
    }
    if (args.sector) entries = entries.filter((e) => e.sector === args.sector);
    return Promise.all(
      entries.map(async (e) => ({ ...e, project: await ctx.db.get(e.projectId) })),
    );
  },
});

/** Fetch the case study for a project (closed-row "Case study" button). */
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("caseStudies")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .first();
  },
});

/** Toggle the hook-eligibility gate. */
export const setReferenceable = mutation({
  args: { id: v.id("caseStudies"), referenceable: v.boolean() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      referenceable: args.referenceable,
      updatedAt: new Date().toISOString(),
    });
    return { status: "updated", id: args.id, referenceable: args.referenceable };
  },
});
```

- [ ] **Step 2: Verify codegen + typecheck**

Run: `cd model-testing-app && npx convex codegen`
Expected: succeeds; `api.caseStudies.*` now exists in `_generated/api.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add model-testing-app/convex/caseStudies.ts model-testing-app/convex/_generated
git commit -m "feat(deal-book): caseStudies queries/mutations (derive/confirm/match/list)"
```

---

## Task 4: `dealBook.stats` Convex query

**Files:**
- Create: `model-testing-app/convex/dealBook.ts`

- [ ] **Step 1: Write the module**

Create `model-testing-app/convex/dealBook.ts`:

```ts
import { query } from "./_generated/server";
import { computePortfolioStats } from "./lib/dealBook";

/** Portfolio aggregates for the Deal Book stats bar (over the projects table). */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    return computePortfolioStats(
      projects.map((p) => ({
        status: p.status,
        loanAmount: p.loanAmount,
        endDate: p.endDate,
      })),
      new Date().toISOString(),
    );
  },
});
```

- [ ] **Step 2: Verify codegen**

Run: `cd model-testing-app && npx convex codegen`
Expected: succeeds; `api.dealBook.stats` exists.

- [ ] **Step 3: Commit**

```bash
git add model-testing-app/convex/dealBook.ts model-testing-app/convex/_generated
git commit -m "feat(deal-book): dealBook.stats portfolio aggregate query"
```

---

## Task 5: MCP tools (`caseStudy.*` + `dealBook.stats`)

**Files:**
- Modify: `model-testing-app/convex/mcp.ts` — insert into the `TOOLS` array just before the `// ── Meta / introspection` banner (~line 4120)

- [ ] **Step 1: Insert the tool definitions**

In `model-testing-app/convex/mcp.ts`, find the `// ── Meta / introspection` banner near line 4120 and insert the following block immediately **before** it (still inside the `TOOLS` array):

```ts
  // ── CaseStudy domain (Deal Book / hook rung 9) ───────────────
  {
    name: "caseStudy.deriveDrafts",
    description:
      "Scan completed projects with no case study and create draft entries with inferred sector/region/size band. Idempotent — skips projects already covered. Returns {created, skipped, totalCompleted}. Drafts are NOT hook-eligible until confirmed.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async (ctx, _userId, _args) => {
      const result = await ctx.runMutation(api.caseStudies.deriveDrafts, {});
      return asText(result);
    },
  },
  {
    name: "caseStudy.confirm",
    description:
      "Confirm/edit a case study draft. Sets sector (canonical), optional dealType/region/sizeBand/headline/referenceable, and marks it confirmed. If headline omitted, an anonymised one is generated (sector + region). Only confirmed + referenceable entries are usable in hooks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "caseStudies id" },
        sector: {
          type: "string",
          description:
            "Canonical sector: residential | btr_rental | student_pbsa | co_living | mixed_use | commercial | industrial_logistics | hotel_leisure",
        },
        dealType: { type: "string" },
        region: { type: "string" },
        sizeBand: { type: "string" },
        headline: { type: "string", description: "Anonymised one-liner; leave blank to auto-generate" },
        referenceable: { type: "boolean", description: "Whether usable in a cold hook" },
      },
      required: ["id", "sector"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.caseStudies.confirm, {
        id: args.id,
        sector: args.sector,
        dealType: args.dealType,
        region: args.region,
        sizeBand: args.sizeBand,
        headline: args.headline,
        referenceable: args.referenceable,
      });
      return asText(result);
    },
  },
  {
    name: "caseStudy.matchForProspect",
    description:
      "Find anonymised RockCap track-record material for hook-ladder rung 9. Returns ONLY confirmed + referenceable case studies in the given sector (region-preferred if supplied), projected to {sector, region, sizeBand, dealType, headline} — never a borrower/project name.",
    inputSchema: {
      type: "object",
      properties: {
        sector: { type: "string", description: "Canonical sector (see caseStudy.confirm)" },
        region: { type: "string", description: "Optional; prefers same-region matches" },
      },
      required: ["sector"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.caseStudies.matchForProspect, {
        sector: args.sector,
        region: args.region,
      });
      return asText(result);
    },
  },
  {
    name: "caseStudy.list",
    description:
      "List case studies (joined with their backing project) for review/ops. Optional filters: curationStatus (draft|confirmed), sector.",
    inputSchema: {
      type: "object",
      properties: {
        curationStatus: { type: "string", enum: ["draft", "confirmed"] },
        sector: { type: "string" },
      },
      required: [],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runQuery(api.caseStudies.list, {
        curationStatus: args.curationStatus,
        sector: args.sector,
      });
      return asText(result);
    },
  },
  {
    name: "caseStudy.setReferenceable",
    description: "Toggle whether a case study is eligible for use in cold hooks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        referenceable: { type: "boolean" },
      },
      required: ["id", "referenceable"],
    },
    handler: async (ctx, _userId, args) => {
      const result = await ctx.runMutation(api.caseStudies.setReferenceable, {
        id: args.id,
        referenceable: args.referenceable,
      });
      return asText(result);
    },
  },
  // ── DealBook domain (portfolio stats) ────────────────────────
  {
    name: "dealBook.stats",
    description:
      "Portfolio aggregates over projects for the Deal Book: open {count,value}, all-time closed {count,value}, lost {count}, and closed-deal counts in the last 30/90/180/365 days.",
    inputSchema: { type: "object", properties: {}, required: [] },
    handler: async (ctx, _userId, _args) => {
      const result = await ctx.runQuery(api.dealBook.stats, {});
      return asText(result);
    },
  },
```

- [ ] **Step 2: Verify the new tools register**

Run: `cd model-testing-app && npx convex codegen && npx tsc --noEmit -p convex 2>/dev/null || npx convex codegen`
Then verify by grepping the array compiled clean:
Run: `grep -c '"caseStudy\.' convex/mcp.ts`
Expected: `4` (the four `caseStudy.` names with a literal dot) plus `caseStudy.deriveDrafts` — i.e. the grep returns `4` for `caseStudy\.` matches that include the escaped dot; confirm all 5 caseStudy tools + 1 dealBook tool are present:
Run: `grep -E 'name: "(caseStudy|dealBook)\.' convex/mcp.ts`
Expected: 6 lines (deriveDrafts, confirm, matchForProspect, list, setReferenceable, stats).

- [ ] **Step 3: Commit**

```bash
git add model-testing-app/convex/mcp.ts
git commit -m "feat(deal-book): expose caseStudy.* and dealBook.stats MCP tools"
```

---

## Task 6: Sidebar nav item

**Files:**
- Modify: `model-testing-app/src/components/Sidebar.tsx` (icon import block ~line 8-23; `navItems` array ~line 56-69)

- [ ] **Step 1: Add the icon import**

In `model-testing-app/src/components/Sidebar.tsx`, add `BookOpen` to the existing `lucide-react` import block (lines ~8-23). For example if the import is `import { LayoutDashboard, CheckSquare, /* ... */ } from 'lucide-react';`, add `BookOpen` to that list.

- [ ] **Step 2: Add the nav item**

In the `navItems` array (~line 56-69), add after the `{ href: '/clients', label: 'Clients', icon: Building },` line:

```tsx
    { href: '/deal-book', label: 'Deal Book', icon: BookOpen },
```

- [ ] **Step 3: Verify**

Run: `cd model-testing-app && grep -n "deal-book" src/components/Sidebar.tsx`
Expected: one line showing the new nav item.

- [ ] **Step 4: Commit**

```bash
git add model-testing-app/src/components/Sidebar.tsx
git commit -m "feat(deal-book): add Deal Book to the sidebar nav"
```

---

## Task 7: Deal Book page

**Files:**
- Create: `model-testing-app/src/app/(desktop)/deal-book/page.tsx`

This page follows the prospects-page pattern: `"use client"`, `useColors()`, raw `<table>`, custom tab buttons. It reads `api.dealBook.stats`, `api.projects.list`, and `api.caseStudies.list`; buckets projects with `bucketProjectStatus`; and provides a derive-drafts button and an inline confirm panel.

- [ ] **Step 1: Write the page**

Create `model-testing-app/src/app/(desktop)/deal-book/page.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useColors } from "@/lib/useColors";
import {
  bucketProjectStatus,
  DEAL_SECTORS,
  SECTOR_LABELS,
  type DealBucket,
  type DealSector,
} from "../../../../convex/lib/dealBook";

function fmtCompactGBP(amount: number): string {
  if (!amount || amount <= 0) return "£0";
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(0)}m`;
  if (amount >= 1_000) return `£${(amount / 1_000).toFixed(0)}k`;
  return `£${amount}`;
}

type Tab = DealBucket;

export default function DealBookPage() {
  const colors = useColors();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const stats = useQuery(api.dealBook.stats, {});
  const projects = (useQuery(api.projects.list as any, {}) as any[]) ?? [];
  const caseStudies = (useQuery(api.caseStudies.list as any, {}) as any[]) ?? [];
  const deriveDrafts = useMutation(api.caseStudies.deriveDrafts);

  const csByProject = useMemo(() => {
    const m = new Map<string, any>();
    for (const cs of caseStudies) m.set(cs.projectId, cs);
    return m;
  }, [caseStudies]);

  const rows = useMemo(
    () => projects.filter((p) => bucketProjectStatus(p.status) === tab),
    [projects, tab],
  );

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: colors.text.primary, marginBottom: 4 }}>
        Deal Book
      </h1>
      <div style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        RockCap track record — open business, closed deals, and the case-study index behind hook rung 9.
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          padding: 16,
          borderRadius: 8,
          background: colors.bg.cardAlt,
          border: `1px solid ${colors.border.default}`,
          marginBottom: 20,
        }}
      >
        <Stat label="Open business" value={stats ? `${stats.open.count} · ${fmtCompactGBP(stats.open.value)}` : "—"} accent={colors.entityTypes.deal} colors={colors} />
        <Stat label="Closed (total)" value={stats ? `${stats.closed.count} · ${fmtCompactGBP(stats.closed.value)}` : "—"} accent={colors.accent.green} colors={colors} />
        <Stat label="Closed 30/90/180/365d" value={stats ? `${stats.closedByWindow.d30} / ${stats.closedByWindow.d90} / ${stats.closedByWindow.d180} / ${stats.closedByWindow.d365}` : "—"} accent={colors.text.primary} colors={colors} />
        <Stat label="Lost" value={stats ? String(stats.lost.count) : "—"} accent={colors.status.lost} colors={colors} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${colors.border.default}`, marginBottom: 14, alignItems: "center" }}>
        <TabButton label="Open" active={tab === "open"} onClick={() => setTab("open")} colors={colors} />
        <TabButton label="Closed" active={tab === "closed"} onClick={() => setTab("closed")} colors={colors} />
        <TabButton label="Lost" active={tab === "lost"} onClick={() => setTab("lost")} colors={colors} />
        {tab === "closed" && (
          <button
            onClick={async () => { await deriveDrafts({}); }}
            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${colors.border.mid}`, background: colors.bg.card, color: colors.text.secondary, cursor: "pointer" }}
          >
            Derive drafts from closed deals
          </button>
        )}
      </div>

      {/* Table */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle(colors)}>Deal</th>
            <th style={thStyle(colors)}>Sector</th>
            <th style={thStyle(colors)}>Region</th>
            <th style={thStyle(colors)}>Size</th>
            <th style={thStyle(colors)}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const cs = csByProject.get(p._id);
            return (
              <tr key={p._id}>
                <td style={tdStyle(colors)}>
                  <div style={{ color: colors.text.primary, fontWeight: 500 }}>{p.name ?? "—"}</div>
                </td>
                <td style={tdStyle(colors)}>
                  {cs && cs.sector ? (SECTOR_LABELS[cs.sector as DealSector] ?? cs.sector) : "—"}
                </td>
                <td style={tdStyle(colors)}>{cs?.region || p.city || p.state || "—"}</td>
                <td style={tdStyle(colors)}>{cs?.sizeBand || "—"}</td>
                <td style={tdStyle(colors)}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {tab === "closed" && (
                      cs ? (
                        <button onClick={() => setConfirmId(cs._id)} style={btnStyle(colors)}>
                          {cs.curationStatus === "confirmed" ? "Case study" : "Review draft"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: colors.text.dim }}>no case study</span>
                      )
                    )}
                    <button onClick={() => router.push(`/projects/${p._id}`)} style={btnStyle(colors)}>
                      Project
                    </button>
                    {tab === "closed" && cs && cs.curationStatus !== "confirmed" && (
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: colors.accent.yellow, color: "#000" }}>Needs review</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td style={tdStyle(colors)} colSpan={5}>
                <span style={{ color: colors.text.dim }}>No {tab} deals.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {confirmId && (
        <ConfirmPanel
          entry={caseStudies.find((c) => c._id === confirmId)}
          onClose={() => setConfirmId(null)}
          colors={colors}
        />
      )}
    </div>
  );
}

function ConfirmPanel({ entry, onClose, colors }: { entry: any; onClose: () => void; colors: any }) {
  const confirm = useMutation(api.caseStudies.confirm);
  const [sector, setSector] = useState<string>(entry?.sector ?? "");
  const [dealType, setDealType] = useState<string>(entry?.dealType ?? "");
  const [region, setRegion] = useState<string>(entry?.region ?? "");
  const [headline, setHeadline] = useState<string>(entry?.headline ?? "");
  const [referenceable, setReferenceable] = useState<boolean>(entry?.referenceable ?? false);
  if (!entry) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: colors.bg.card, border: `1px solid ${colors.border.default}`, borderRadius: 10, padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, marginBottom: 12 }}>Case study — {entry.project?.name ?? "deal"}</h2>
        <Field label="Sector" colors={colors}>
          <select value={sector} onChange={(e) => setSector(e.target.value)} style={inputStyle(colors)}>
            <option value="">— select —</option>
            {DEAL_SECTORS.map((s) => (
              <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Deal type" colors={colors}>
          <input value={dealType} onChange={(e) => setDealType(e.target.value)} style={inputStyle(colors)} placeholder="e.g. development finance" />
        </Field>
        <Field label="Region" colors={colors}>
          <input value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle(colors)} />
        </Field>
        <Field label="Headline (blank = auto)" colors={colors}>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} style={inputStyle(colors)} placeholder="anonymised — no borrower name" />
        </Field>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: colors.text.secondary, margin: "10px 0" }}>
          <input type="checkbox" checked={referenceable} onChange={(e) => setReferenceable(e.target.checked)} />
          Referenceable in cold hooks
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnStyle(colors)}>Cancel</button>
          <button
            disabled={!sector}
            onClick={async () => {
              await confirm({ id: entry._id, sector, dealType, region, headline, referenceable });
              onClose();
            }}
            style={{ ...btnStyle(colors), background: colors.accent.green, color: "#000", opacity: sector ? 1 : 0.5 }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, colors }: { label: string; value: string; accent: string; colors: any }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.text.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  );
}

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: colors.text.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function TabButton({ label, active, onClick, colors }: { label: string; active: boolean; onClick: () => void; colors: any }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        fontSize: 12,
        background: "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${colors.entityTypes.deal}` : "2px solid transparent",
        color: active ? colors.text.primary : colors.text.muted,
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function thStyle(colors: any) {
  return {
    textAlign: "left" as const,
    fontFamily: "ui-monospace, monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase" as const,
    color: colors.text.muted,
    fontWeight: 400,
    padding: "8px 14px",
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.cardAlt,
  };
}
function tdStyle(colors: any) {
  return {
    padding: "10px 14px",
    borderBottom: `1px solid ${colors.border.light}`,
    fontSize: 11,
    color: colors.text.primary,
    verticalAlign: "middle" as const,
  };
}
function btnStyle(colors: any) {
  return {
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${colors.border.mid}`,
    background: colors.bg.card,
    color: colors.text.secondary,
    cursor: "pointer",
  };
}
function inputStyle(colors: any) {
  return {
    width: "100%",
    padding: "6px 8px",
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${colors.border.mid}`,
    background: colors.bg.base,
    color: colors.text.primary,
  };
}
```

- [ ] **Step 2: Verify the build**

Run: `cd model-testing-app && npx next build`
Expected: build succeeds, `/deal-book` route compiled. Fix any type errors (common: a missing color token name — check against `src/lib/colors.ts` and adjust, e.g. swap `colors.accent.yellow` for an existing token if absent; verify `/projects/[id]` route exists, otherwise change the Project button target to the correct project route).

- [ ] **Step 3: Commit**

```bash
git add "model-testing-app/src/app/(desktop)/deal-book/page.tsx"
git commit -m "feat(deal-book): Deal Book page — stats bar, Open/Closed/Lost tabs, case-study confirm"
```

---

## Task 8: Canonical skill/reference edits (RockCap-MCP) + sync

All edits happen in `~/ROCKCAP/RockCap-MCP` first (the canonical repo), then are synced into `~/ROCKCAP/rockcap-v2/skills/`.

- [ ] **Step 1: Create the sector taxonomy reference**

Create `~/ROCKCAP/RockCap-MCP/shared-references/deal-sectors.md`:

```markdown
# Deal sectors (canonical)

The controlled sector vocabulary used to match a prospect's activity to RockCap's track record (hook-ladder rung 9, via `caseStudy.matchForProspect`). Keep in lockstep with `DEAL_SECTORS` in the app's `convex/lib/dealBook.ts`.

| Key | Label | Notes |
|---|---|---|
| `residential` | residential | for-sale housing/apartments |
| `btr_rental` | BTR/rental | build-to-rent, PRS, multifamily |
| `student_pbsa` | student | purpose-built student accommodation |
| `co_living` | co-living | |
| `mixed_use` | mixed-use | |
| `commercial` | commercial | office / retail |
| `industrial_logistics` | industrial/logistics | warehouse, distribution, sheds |
| `hotel_leisure` | hotel/leisure | incl. aparthotel |

**Inference is best-effort and draft-only.** The app infers a sector from a project's name/description/tags when deriving drafts; an operator confirms it before the case study is hook-eligible. Most-specific sectors win over generic `residential`/`commercial`.
```

- [ ] **Step 2: Flip hook-ladder rung 9 to live**

In `~/ROCKCAP/RockCap-MCP/shared-references/hook-ladder.md`, replace this exact text in the rung-9 section:

Find:
```
- **Our data:** needs a sector-tagged recent-deal index (regions/sectors, no client names). We do not yet have this as structured data; treat as a future reference to build. Until then, surface for manual use. Hard rule: never name the prospect-side client.
```
Replace with:
```
- **Our data:** the **Deal Book / case-study index** — query `caseStudy.matchForProspect({sector, region})`. Returns only operator-confirmed, `referenceable` deals, projected to an anonymised `{sector, region, sizeBand, headline}` (regions/sectors, never names). Sectors are the canonical set in `deal-sectors.md`. Hard rule: never name the prospect-side client; the RockCap-led deal may be named only if the operator has cleared it.
```

Then in the "Input to output mapping" table, replace the rung-9 row:

Find:
```
| 9 Sub-sector match | No (need deal index) | No | No | (future deal index) | Manual until built |
```
Replace with:
```
| 9 Sub-sector match | Yes (on match) | No | No | caseStudy.matchForProspect | Auto when a confirmed match exists |
```

- [ ] **Step 3: Add the rung-9 procedure to compose-outreach-hook**

Read `~/ROCKCAP/RockCap-MCP/sub-skills/compose-outreach-hook.md` to find where the rungs are walked. Add a rung-9 step that reads:

```markdown
### Rung 9 — sub-sector match (Deal Book)

After computing the prospect's sector (from scheme/charge evidence) and region, call `caseStudy.matchForProspect({ sector, region })`. If it returns one or more entries, surface the top entry's `headline` as a candidate hook for operator review — e.g. *"we've arranged funding on a couple of BTR/rental schemes in the North West"*. Never emit a borrower/prospect-side name. If it returns nothing, fall through to the next-best honest rung (7/8). This rung is anonymised by construction; the match payload carries no client names.
```

- [ ] **Step 4: Update CATALOGUE.md**

Read `~/ROCKCAP/RockCap-MCP/CATALOGUE.md`, find the domain listing/grouping, and add a `caseStudy` / `dealBook` domain section documenting the 6 tools (`caseStudy.deriveDrafts`, `caseStudy.confirm`, `caseStudy.matchForProspect`, `caseStudy.list`, `caseStudy.setReferenceable`, `dealBook.stats`) with one-line "when to use" notes mirroring their MCP descriptions, and bump the headline tool/domain counts (129 → 135 tools; 25 → 26 domains — verify the current numbers in the file before editing and adjust by +6 tools / +1 domain).

- [ ] **Step 5: Refresh tools-manifest.json**

`~/ROCKCAP/RockCap-MCP/tools-manifest.json` is normally regenerated by calling the live `meta.listTools` MCP tool. After the app is deployed (Task 9), either (a) call `meta.listTools` and paste the result, or (b) hand-add the 6 tool entries to the `tools` array, add `caseStudy` and `dealBook` to the `domains` array, and bump `toolCount` (+6) and `domainCount` (+1). Keep this consistent with the CATALOGUE counts.

- [ ] **Step 6: Sync canonical skills down into rockcap-v2**

Run:
```bash
rsync -a --delete --exclude='.git' ~/ROCKCAP/RockCap-MCP/ ~/ROCKCAP/rockcap-v2/skills/
```
Verify: `diff -rq ~/ROCKCAP/RockCap-MCP ~/ROCKCAP/rockcap-v2/skills --exclude=.git` shows no differences.

- [ ] **Step 7: Commit (both repos, parallel messages)**

```bash
# Canonical
cd ~/ROCKCAP/RockCap-MCP && git checkout -b feat/deal-book-rung9 && git add -A && \
  git commit -m "feat(deal-book): wire hook rung 9 to caseStudy.matchForProspect; add deal-sectors + catalogue"

# Synced copy in rockcap-v2 (on the same feature branch as the code)
cd ~/ROCKCAP/rockcap-v2 && git add skills && \
  git commit -m "chore(skills): sync Deal Book rung-9 wiring from RockCap-MCP"
```

---

## Task 9: Final build, deploy check, and push

- [ ] **Step 1: Run the full build (repo CLAUDE.md rule)**

Run: `cd ~/ROCKCAP/rockcap-v2/model-testing-app && npx next build`
Expected: PASS with no errors. Fix any that appear.

- [ ] **Step 2: Run the unit tests**

Run: `cd ~/ROCKCAP/rockcap-v2/model-testing-app && npx vitest run src/__tests__/dealBook.test.ts`
Expected: PASS.

- [ ] **Step 3: Deploy Convex + smoke-test the loop (optional but recommended)**

With Convex dev running, exercise: `caseStudy.deriveDrafts` → `caseStudy.list` (see drafts) → `caseStudy.confirm` (one entry, referenceable=true) → `caseStudy.matchForProspect` (returns the anonymised entry) → `dealBook.stats` (returns aggregates). Confirm the Deal Book page renders Open/Closed/Lost and the confirm panel works.

- [ ] **Step 4: Push both repos**

```bash
cd ~/ROCKCAP/rockcap-v2 && git push -u origin feat/deal-book-case-study-index
cd ~/ROCKCAP/RockCap-MCP && git push -u origin feat/deal-book-rung9
```

- [ ] **Step 5: Open PRs (lead with "Problems this PR solves" per repo CLAUDE.md)**

Open a PR for each repo. The rockcap-v2 PR body should open with the "Problems this PR solves" bullet list from the spec.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Concept → Tasks 2-4,7; data model → Task 2; MCP tools → Task 5; web page → Tasks 6-7; skill wiring → Task 8; sector taxonomy → Tasks 1 & 8; confidentiality (anonymised projection, referenceable gate) → Tasks 1 (`buildAnonymisedHeadline`), 3 (`matchForProspect` projection), 5; cross-repo split → Tasks 8-9; out-of-scope items intentionally not implemented.
- **Placeholders:** none — all code blocks are complete. Task 8 steps 3-5 describe markdown insertions with exact target strings where the source text is known (rung 9) and explicit anchors + exact content where the file must be read first (compose-outreach-hook, CATALOGUE, manifest) because those files weren't fully read at plan time.
- **Type consistency:** `DealSector`, `DealBucket`, `PortfolioStats`, `bucketProjectStatus`, `computePortfolioStats`, `sizeBandFromLoanAmount`, `inferSector`, `buildAnonymisedHeadline`, `SECTOR_LABELS`, `DEAL_SECTORS` are defined in Task 1 and used consistently in Tasks 3, 4, 7. Convex function names (`deriveDrafts`, `confirm`, `matchForProspect`, `list`, `getByProject`, `setReferenceable`, `stats`) match their MCP handlers in Task 5 and page calls in Task 7.
- **Known execution-time check (flagged in Task 7 Step 2):** color tokens (`colors.accent.yellow`, `colors.status.lost`, `colors.entityTypes.deal`) and the `/projects/[id]` route must be verified against the actual codebase; the task instructs the executor to adjust if a token/route name differs.
```
