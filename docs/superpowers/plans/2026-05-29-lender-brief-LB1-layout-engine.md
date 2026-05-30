# Lender Brief — LB1 Layout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a branded "lender-brief" layout to the v1 render engine — a server-assembled branded HTML shell (RockCap wordmark header, key-facts table, premium section tables, black footer band with page numbers, sign-off) that renders to a top-quality PDF (+ editable DOCX) from a structured `briefData`.

**Architecture:** `renderDocument`'s `RenderSpec` becomes a discriminated union (`house` = v1's `contentHtml` wrap; `lender-brief` = structured `briefData` → `buildLenderBriefHtml`). `renderHtmlToPdf` gains an optional Chromium `footerTemplate` + bottom margin for the black footer band + "Page X of Y". A company-info config feeds the header/footer.

**Tech Stack:** the v1 docgen engine (`puppeteer-core` + `@sparticuz/chromium` for PDF, `html-to-docx` for DOCX), vitest. No new dependencies.

**Where this sits:** LB1 of three lender-brief sub-plans (spec: `docs/superpowers/specs/2026-05-29-lender-brief-template-design.md`). LB1 = the layout engine (produces a branded brief PDF from sample data — de-risks the visual quality). LB2 = pipeline wiring (route + chat/MCP tools + the action accept `layout`+`briefData`; `recordPublishedDocs` files to the project). LB3 = the doc-type reference + `lender-brief` skill + e2e on Mackenzie Miller.

**Implementer prerequisites:**
- App root: `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/`. Run `npm`/`npx` there.
- Tests: `src/__tests__/*.test.ts`, `npx vitest run <file>`. Pure logic is unit-tested; PDF render is smoke-tested (needs a local Chrome via `CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`; skips otherwise).
- Existing v1 engine files you'll extend: `src/lib/docgen/types.ts`, `index.ts`, `renderPdf.ts`, plus `houseStyle.ts` (exports `escapeHtml`, unchanged). The DOCX path (`renderDocx.ts`) is unchanged — it has no repeating footer (spec: DOCX is the light-edit version).
- Commit after each task with the given message. Do NOT push, amend, or switch branches (on `claude/ch-group-charges`).

---

### Task 1: Types — `LenderBriefData` + layout-aware `RenderSpec`

**Files:**
- Modify: `src/lib/docgen/types.ts`

- [ ] **Step 1: Replace the file with the extended types**

```ts
// src/lib/docgen/types.ts
// Shared types for the document render engine (P1 + lender-brief layout LB1).

export type DocFormat = "pdf" | "docx";
export type DocLayout = "house" | "lender-brief";

export interface RenderResult {
  format: DocFormat;
  buffer: Buffer;
  mime: string; // MIME type for storage + HTTP
  ext: string;  // file extension without the dot, e.g. "pdf"
}

export const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// ── Lender-brief structured data ─────────────────────────────
export interface KeyFact {
  label: string;
  value: string;
}
export interface BriefSection {
  n: number;
  title: string;
  /** Composed semantic HTML (prose + tables). Injected RAW — the composer is
   *  trusted to emit clean HTML; only shell fields are escaped. */
  bodyHtml: string;
}
export interface LenderBriefData {
  variant: "senior-dev" | "dev-exit" | "jv";
  confidentiality: "INTERNAL" | "EXTERNAL";
  title: { location: string; descriptor: string };
  meta: { borrower: string; preparedBy: string; date: string };
  keyFacts: KeyFact[];
  sections: BriefSection[];
  signOff: { name: string; role: string; email: string; phone: string };
}

// ── Render spec (discriminated union by layout) ──────────────
interface RenderSpecBase {
  /** Human title; used in <title> and as the default file-name stem. */
  title: string;
  formats: DocFormat[];
}
export interface HouseRenderSpec extends RenderSpecBase {
  layout?: "house";
  /** Semantic HTML body (no <html>/<head>/<style> — the house wrapper adds those). */
  contentHtml: string;
}
export interface LenderBriefRenderSpec extends RenderSpecBase {
  layout: "lender-brief";
  briefData: LenderBriefData;
}
export type RenderSpec = HouseRenderSpec | LenderBriefRenderSpec;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20` (expect no NEW errors referencing `types.ts`; `index.ts` will error until Task 5 — that's fine for now, note it).
Expected: any errors are only in `index.ts` (consumes the old `RenderSpec.contentHtml` unconditionally) — resolved in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/lib/docgen/types.ts
git commit -m "feat(lender-brief): LenderBriefData + layout-aware RenderSpec union"
```

---

### Task 2: Company-info config

**Files:**
- Create: `src/lib/docgen/rockcapCompany.ts`

- [ ] **Step 1: Create the config**

```ts
// src/lib/docgen/rockcapCompany.ts
// RockCap company info for branded document headers/footers. registeredOffice
// and companyNo are optional — omitted from the footer until provided.
export interface CompanyInfo {
  wordmark: string;
  legalName: string;
  website: string;
  email: string;
  phone: string;
  registeredOffice?: string;
  companyNo?: string;
}

export const ROCKCAP_COMPANY: CompanyInfo = {
  wordmark: "RockCap",
  legalName: "RockCap Ltd",
  website: "rockcap.uk",
  email: "alex@rockcap.uk",
  phone: "07815 912 057",
  // registeredOffice: "…",  // fill when available
  // companyNo: "…",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/docgen/rockcapCompany.ts
git commit -m "feat(lender-brief): RockCap company-info config"
```

---

### Task 3: The lender-brief layout (TDD)

**Files:**
- Create: `src/lib/docgen/layouts/lenderBrief.ts`
- Test: `src/__tests__/lenderBriefLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lenderBriefLayout.test.ts
import { describe, it, expect } from "vitest";
import { buildLenderBriefHtml, buildLenderBriefFooterTemplate } from "../lib/docgen/layouts/lenderBrief";
import type { LenderBriefData } from "../lib/docgen/types";

const sample: LenderBriefData = {
  variant: "senior-dev",
  confidentiality: "INTERNAL",
  title: { location: "BURNHAM, BUCKINGHAMSHIRE", descriptor: "9-Unit Residential — Senior + Equity" },
  meta: { borrower: "LDRM Construction Ltd", preparedBy: "RockCap Ltd", date: "27 May 2026" },
  keyFacts: [
    { label: "Borrower", value: "LDRM Construction Ltd (Co. No. 13950418)" },
    { label: "Financing Requirement", value: "Senior dev debt c.65% LTGDV & A&B" },
  ],
  sections: [
    { n: 1, title: "Executive Summary", bodyHtml: "<p>RockCap is presenting a 9-unit scheme.</p>" },
    { n: 2, title: "Borrower Profile", bodyHtml: "<table><tr><td>Net worth</td><td class=\"num\">£700k</td></tr></table>" },
  ],
  signOff: { name: "Alex Lundberg", role: "Director, RockCap", email: "alex@rockcap.uk", phone: "07815 912 057" },
};

describe("buildLenderBriefHtml", () => {
  const html = buildLenderBriefHtml(sample);
  it("is a full HTML document with the brand header", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("class=\"brief-wordmark\">RockCap<");
    expect(html).toContain("Strictly Private");
  });
  it("renders the title block + confidentiality", () => {
    expect(html).toContain("BURNHAM, BUCKINGHAMSHIRE");
    expect(html).toContain("9-Unit Residential — Senior + Equity");
    expect(html).toContain("INTERNAL");
  });
  it("renders each key fact (label + value)", () => {
    expect(html).toContain("Financing Requirement");
    expect(html).toContain("Senior dev debt c.65% LTGDV &amp; A&amp;B"); // value escaped
  });
  it("renders numbered sections with bodyHtml injected raw", () => {
    expect(html).toContain("<h2>1. Executive Summary</h2>");
    expect(html).toContain("<p>RockCap is presenting a 9-unit scheme.</p>");
    expect(html).toContain("<td class=\"num\">£700k</td>"); // table preserved
  });
  it("renders the sign-off", () => {
    expect(html).toContain("Alex Lundberg");
    expect(html).toContain("alex@rockcap.uk");
    expect(html).toContain("RockCap Ltd"); // closing line
  });
});

describe("buildLenderBriefFooterTemplate", () => {
  const footer = buildLenderBriefFooterTemplate();
  it("is a black band with company line + page numbers", () => {
    expect(footer).toContain("background:#141414");
    expect(footer).toContain("RockCap Ltd");
    expect(footer).toContain("rockcap.uk");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lenderBriefLayout.test.ts`
Expected: FAIL — "Cannot find module '../lib/docgen/layouts/lenderBrief'".

- [ ] **Step 3: Implement the layout**

```ts
// src/lib/docgen/layouts/lenderBrief.ts
// Branded lender-brief layout: assembles a full HTML document from structured
// briefData. Shell fields are escaped; section bodyHtml is injected raw (the
// composer is trusted). The PDF gets a black footer band + page numbers via the
// Chromium footerTemplate (buildLenderBriefFooterTemplate); the DOCX has none.
import { escapeHtml } from "../houseStyle";
import { ROCKCAP_COMPANY } from "../rockcapCompany";
import type { LenderBriefData } from "../types";

const LENDER_BRIEF_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #141414; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main.brief { font-size: 10.5pt; line-height: 1.5; }
  .brief-header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #141414; padding-bottom: 10px; margin-bottom: 18px; }
  .brief-wordmark { font-size: 22pt; font-weight: 400; letter-spacing: -0.01em; }
  .brief-header-meta { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6b6b; text-align: right; line-height: 1.4; }
  .brief-title h1 { font-size: 19pt; letter-spacing: 0.01em; text-transform: uppercase; margin: 0 0 2px; }
  .brief-title .descriptor { font-size: 12pt; color: #3a3a3a; margin: 0 0 4px; }
  .brief-title .metaline { font-family: ui-monospace, monospace; font-size: 8.5pt; color: #6b6b6b; margin: 0; }
  table.key-facts { width: 100%; border-collapse: collapse; margin: 16px 0 22px; }
  table.key-facts td { padding: 5px 0; vertical-align: top; border-bottom: 1px solid #ededed; }
  table.key-facts td.kf-label { width: 220px; font-family: ui-monospace, monospace; font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #6b6b6b; }
  section.brief-section { margin: 18px 0; }
  section.brief-section > h2 { font-size: 12.5pt; margin: 0 0 7px; padding-bottom: 4px; border-bottom: 1px solid #d9d9d9; }
  section.brief-section p { margin: 0 0 8px; }
  .brief-section table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; }
  .brief-section th { text-align: left; font-family: ui-monospace, monospace; font-size: 7.5pt; letter-spacing: 0.05em; text-transform: uppercase; color: #6b6b6b; border-bottom: 1.5px solid #141414; padding: 5px 8px; }
  .brief-section td { padding: 5px 8px; border-bottom: 1px solid #ededed; vertical-align: top; }
  .brief-section td.num, .brief-section th.num { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
  .brief-section .caption { font-size: 8pt; color: #8a8a8a; margin-top: -4px; }
  .brief-signoff { margin-top: 28px; padding-top: 12px; border-top: 1px solid #d9d9d9; }
  .brief-signoff .name { font-weight: 600; }
  .brief-signoff .contact { font-family: ui-monospace, monospace; font-size: 9pt; color: #6b6b6b; }
  .brief-closing { margin-top: 6px; font-family: ui-monospace, monospace; font-size: 7.5pt; letter-spacing: 0.06em; text-transform: uppercase; color: #9a9a9a; }
`;

export function buildLenderBriefHtml(data: LenderBriefData): string {
  const c = ROCKCAP_COMPANY;
  const keyFactRows = data.keyFacts
    .map((kf) => `<tr><td class="kf-label">${escapeHtml(kf.label)}</td><td>${escapeHtml(kf.value)}</td></tr>`)
    .join("");
  const sections = data.sections
    .map((s) => `<section class="brief-section"><h2>${escapeHtml(String(s.n))}. ${escapeHtml(s.title)}</h2>${s.bodyHtml}</section>`)
    .join("");
  const metaline = `${data.meta.borrower}  ·  Prepared by ${data.meta.preparedBy}  ·  ${data.meta.date}  ·  ${data.confidentiality}`;
  return (
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    `<title>${escapeHtml(`${data.title.location} — Lender Brief`)}</title>` +
    `<style>${LENDER_BRIEF_CSS}</style></head><body><main class="brief">` +
    `<div class="brief-header"><div class="brief-wordmark">${escapeHtml(c.wordmark)}</div>` +
    `<div class="brief-header-meta">Lender Brief<br>Strictly Private &amp; Confidential</div></div>` +
    `<div class="brief-title"><h1>${escapeHtml(data.title.location)}</h1>` +
    `<p class="descriptor">${escapeHtml(data.title.descriptor)}</p>` +
    `<p class="metaline">${escapeHtml(metaline)}</p></div>` +
    `<table class="key-facts"><tbody>${keyFactRows}</tbody></table>` +
    sections +
    `<div class="brief-signoff"><div class="name">${escapeHtml(data.signOff.name)}</div>` +
    `<div>${escapeHtml(data.signOff.role)}</div>` +
    `<div class="contact">${escapeHtml(`${data.signOff.email}  |  ${data.signOff.phone}`)}</div>` +
    `<div class="brief-closing">${escapeHtml(`${c.legalName}  ·  ${c.website}`)}</div></div>` +
    `</main></body></html>`
  );
}

// Chromium footerTemplate (PDF only): black band, company legal line + page nos.
// Chromium quirks handled: explicit font-size (default is 0), exact color print.
export function buildLenderBriefFooterTemplate(): string {
  const c = ROCKCAP_COMPANY;
  const legal = [c.legalName, c.registeredOffice, c.companyNo ? `Co. No. ${c.companyNo}` : "", c.website]
    .filter(Boolean)
    .join("  ·  ");
  return (
    `<div style="width:100%;background:#141414;color:#ffffff;` +
    `font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:7pt;letter-spacing:0.04em;` +
    `padding:6px 14mm;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;">` +
    `<span>${legal}</span>` +
    `<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>` +
    `</div>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/lenderBriefLayout.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docgen/layouts/lenderBrief.ts src/__tests__/lenderBriefLayout.test.ts
git commit -m "feat(lender-brief): branded layout buildLenderBriefHtml + footer template (TDD)"
```

---

### Task 4: PDF footer support in `renderHtmlToPdf`

**Files:**
- Modify: `src/lib/docgen/renderPdf.ts`

- [ ] **Step 1: Replace the file**

(Adds an optional `opts.footerTemplate`; when present, enables Chromium `displayHeaderFooter` with an empty header + the given footer and a larger bottom margin. No-arg calls are unchanged — backward compatible with v1.)

```ts
// src/lib/docgen/renderPdf.ts
// HTML -> PDF via headless Chromium. Uses @sparticuz/chromium on serverless
// (Vercel) and a local Chrome via CHROMIUM_EXECUTABLE_PATH in development.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export interface PdfOptions {
  /** Chromium footer template (HTML). Enables displayHeaderFooter with an empty
   *  header. Use `<span class="pageNumber"></span>` / `totalPages` for page nos. */
  footerTemplate?: string;
  /** Bottom margin in mm when a footer is shown (must fit the footer). Default 24. */
  marginBottomMm?: number;
}

async function resolveExecutablePath(): Promise<string> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH;
  return await chromium.executablePath();
}

export async function renderHtmlToPdf(html: string, opts?: PdfOptions): Promise<Buffer> {
  const executablePath = await resolveExecutablePath();
  const browser = await puppeteer.launch({
    args: process.env.CHROMIUM_EXECUTABLE_PATH ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const hasFooter = !!opts?.footerTemplate;
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: hasFooter,
      headerTemplate: hasFooter ? "<span></span>" : undefined, // suppress default header
      footerTemplate: hasFooter ? opts!.footerTemplate : undefined,
      margin: {
        top: "20mm",
        bottom: hasFooter ? `${opts?.marginBottomMm ?? 24}mm` : "20mm",
        left: "18mm",
        right: "18mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Run the existing PDF smoke test (backward-compat check)**

Run: `CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx vitest run src/__tests__/docgenRenderPdf.test.ts`
Expected: PASS (the no-arg call path is unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/docgen/renderPdf.ts
git commit -m "feat(lender-brief): optional Chromium footerTemplate in renderHtmlToPdf"
```

---

### Task 5: Layout-aware `renderDocument`

**Files:**
- Modify: `src/lib/docgen/index.ts`

- [ ] **Step 1: Replace the file**

```ts
// src/lib/docgen/index.ts
// The render engine entry point. Dispatches on layout: "house" wraps a content
// body (v1); "lender-brief" assembles a branded doc from structured briefData
// and adds the PDF footer band. One HTML intermediate, many output formats.
import { wrapInHouseStyle } from "./houseStyle";
import { buildLenderBriefHtml, buildLenderBriefFooterTemplate } from "./layouts/lenderBrief";
import { renderHtmlToPdf, type PdfOptions } from "./renderPdf";
import { renderHtmlToDocx } from "./renderDocx";
import { MIME, type DocFormat, type RenderResult, type RenderSpec } from "./types";

export * from "./types";
export { wrapInHouseStyle, escapeHtml, HOUSE_STYLE_CSS } from "./houseStyle";
export { buildLenderBriefHtml } from "./layouts/lenderBrief";

async function renderOne(format: DocFormat, fullHtml: string, pdfOpts?: PdfOptions): Promise<RenderResult> {
  if (format === "pdf") {
    return { format, buffer: await renderHtmlToPdf(fullHtml, pdfOpts), mime: MIME.pdf, ext: "pdf" };
  }
  return { format, buffer: await renderHtmlToDocx(fullHtml), mime: MIME.docx, ext: "docx" };
}

export async function renderDocument(spec: RenderSpec): Promise<RenderResult[]> {
  if (!spec.formats?.length) throw new Error("renderDocument: no formats requested");

  let fullHtml: string;
  let pdfOpts: PdfOptions | undefined;

  if (spec.layout === "lender-brief") {
    if (!spec.briefData?.sections?.length) throw new Error("renderDocument: lender-brief has no sections");
    fullHtml = buildLenderBriefHtml(spec.briefData);
    pdfOpts = { footerTemplate: buildLenderBriefFooterTemplate(), marginBottomMm: 24 };
  } else {
    if (!spec.contentHtml?.trim()) throw new Error("renderDocument: contentHtml is empty");
    fullHtml = wrapInHouseStyle(spec.contentHtml, { title: spec.title });
  }

  const results: RenderResult[] = [];
  for (const format of spec.formats) {
    results.push(await renderOne(format, fullHtml, pdfOpts));
  }
  return results;
}
```

- [ ] **Step 2: Typecheck + existing docgen tests**

Run: `npx vitest run src/__tests__/docgenRenderDocument.test.ts src/__tests__/lenderBriefLayout.test.ts`
Expected: PASS (the v1 house-layout `renderDocument` tests still pass — `{contentHtml,title,formats}` matches `HouseRenderSpec`; the lender-brief layout tests pass).

- [ ] **Step 3: Commit**

```bash
git add src/lib/docgen/index.ts
git commit -m "feat(lender-brief): layout-aware renderDocument (house + lender-brief)"
```

---

### Task 6: End-to-end render smoke + build gate

**Files:**
- Test: `src/__tests__/lenderBriefRender.test.ts`

- [ ] **Step 1: Write the render smoke test**

```ts
// src/__tests__/lenderBriefRender.test.ts
import { describe, it, expect } from "vitest";
import { renderDocument } from "../lib/docgen";
import type { LenderBriefData } from "../lib/docgen/types";

const canRunPdf = !!process.env.CHROMIUM_EXECUTABLE_PATH;

const brief: LenderBriefData = {
  variant: "senior-dev",
  confidentiality: "INTERNAL",
  title: { location: "BURNHAM, BUCKINGHAMSHIRE", descriptor: "9-Unit Residential — Senior + Equity" },
  meta: { borrower: "LDRM Construction Ltd", preparedBy: "RockCap Ltd", date: "27 May 2026" },
  keyFacts: [
    { label: "Borrower", value: "LDRM Construction Ltd (Co. No. 13950418)" },
    { label: "Financing Requirement", value: "Senior dev debt c.65% LTGDV, 24-month term" },
    { label: "Relationship Manager", value: "Alex Lundberg (AL) / Rayn Smid (RS)" },
  ],
  sections: [
    { n: 1, title: "Executive Summary", bodyHtml: "<p>RockCap is presenting a 9-unit residential development.</p>" },
    { n: 2, title: "Asset Overview", bodyHtml: "<table><thead><tr><th>Unit</th><th class=\"num\">GDV</th></tr></thead><tbody><tr><td>8 x 4-bed</td><td class=\"num\">£1.10m</td></tr></tbody></table>" },
  ],
  signOff: { name: "Alex Lundberg", role: "Director, RockCap", email: "alex@rockcap.uk", phone: "07815 912 057" },
};

describe("renderDocument(lender-brief)", () => {
  it("renders a valid DOCX", async () => {
    const results = await renderDocument({ layout: "lender-brief", briefData: brief, title: "Burnham Lender Brief", formats: ["docx"] });
    expect(results[0].format).toBe("docx");
    expect(results[0].buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  }, 30_000);

  it.skipIf(!canRunPdf)("renders a valid branded PDF", async () => {
    const results = await renderDocument({ layout: "lender-brief", briefData: brief, title: "Burnham Lender Brief", formats: ["pdf"] });
    expect(results[0].format).toBe("pdf");
    expect(results[0].buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(results[0].buffer.length).toBeGreaterThan(2000);
  }, 60_000);
});
```

- [ ] **Step 2: Run the smoke test (with Chromium)**

Run: `CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx vitest run src/__tests__/lenderBriefRender.test.ts`
Expected: PASS (2 tests — DOCX always, PDF when Chromium is available).

- [ ] **Step 3: Eyeball the rendered PDF (manual quality check — the point of LB1)**

Write a throwaway script or use the test to dump the PDF to `/tmp/lender-brief-sample.pdf` and open it. Confirm: RockCap wordmark header, title block, key-facts table, the section table styled (right-aligned £), and the **black footer band with "Page 1 of N"**. (This is the de-risk: does it look top-quality? If the footer band/table styling needs tuning, adjust the CSS in `lenderBrief.ts` and re-render.)

- [ ] **Step 4: Build gate**

Run: `npx next build`
Expected: compiles clean.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/lenderBriefRender.test.ts
git commit -m "test(lender-brief): end-to-end render smoke for the branded layout"
```

---

## Self-review checklist (run before handoff)

- [ ] **Spec coverage (LB1 portion):** branded shell (header/key-facts/sections/black-footer/sign-off) ✓; layout-aware engine ✓; company config ✓; table-first CSS ✓; PDF footer band + page numbers ✓; DOCX = no repeating band (unchanged renderDocx) ✓. (LB2 = pipeline wiring; LB3 = reference + skill — separate plans.)
- [ ] **Type consistency:** `LenderBriefData` / `RenderSpec` union / `PdfOptions` names match across types.ts, lenderBrief.ts, renderPdf.ts, index.ts.

## Done when

`buildLenderBriefHtml` + footer-template unit tests pass, the lender-brief render smoke produces a valid PDF + DOCX, the eyeballed PDF looks top-quality (branded header, premium tables, black footer band + page numbers), the v1 house-layout tests still pass, and `npx next build` is green. LB2 then wires this layout into the route + chat/MCP tools and files to the project.
