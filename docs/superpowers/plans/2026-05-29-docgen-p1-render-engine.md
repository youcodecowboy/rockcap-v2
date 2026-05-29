# Document Render Engine (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the render engine — a Next.js `nodejs` API route that turns semantic HTML into rendered PDF + DOCX files stored in Convex `_storage`, behind a pluggable per-format renderer interface.

**Architecture:** A pure `src/lib/docgen/` library (house-style HTML wrap + one renderer per format, both off a single HTML intermediate) wrapped by `POST /api/documents/generate`, which uploads each rendered buffer to Convex `_storage` and returns the storage IDs. No approval, no skill, no client-filing — those are P2/P3.

**Tech Stack:** Next.js (`runtime='nodejs'`), `puppeteer-core` + `@sparticuz/chromium` (HTML→PDF), `html-to-docx` (HTML→DOCX), Convex `_storage`, vitest.

**Where this sits:** v1 of the document-generation substrate (spec: `docs/superpowers/specs/2026-05-29-docgen-substrate-design.md`) decomposes into three plans — **P1 (this) render engine**, P2 approval + `document_publish` executor + client-filing, P3 guiding skill + rules + chat tool. P1 ships first to de-risk Chromium-on-Vercel (spec open-question #5).

**Implementer prerequisites:**
- Repo app root: `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/` — run all `npm`/`npx` there.
- Tests live in `src/__tests__/*.test.ts`, run with `npx vitest run <file>`. The repo has **no** `convex-test`; only pure logic is unit-tested. Binary/IO is smoke-tested or build-verified.
- Env vars used: `NEXT_PUBLIC_CONVEX_URL` (exists), `CONVEX_INTERNAL_SECRET` (exists — reused as the route guard, same one `cadenceDispatcher` sends as `x-convex-internal-secret`), and for **local** Chromium `CHROMIUM_EXECUTABLE_PATH` (path to a local Chrome/Chromium binary; `@sparticuz/chromium` supplies it on Vercel).
- Commit after each task. Do not push (the operator pushes per their workflow).

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via `npm install`)

- [ ] **Step 1: Install the three render libraries**

Run (in `model-testing-app/`):
```bash
npm install puppeteer-core @sparticuz/chromium html-to-docx
```

- [ ] **Step 2: Verify they landed in package.json**

Run: `node -e "const p=require('./package.json'); console.log(p.dependencies['puppeteer-core'], p.dependencies['@sparticuz/chromium'], p.dependencies['html-to-docx'])"`
Expected: three version strings print (none `undefined`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(docgen): add puppeteer-core, @sparticuz/chromium, html-to-docx"
```

---

### Task 2: Render types

**Files:**
- Create: `src/lib/docgen/types.ts`

- [ ] **Step 1: Create the types module**

```ts
// src/lib/docgen/types.ts
// Shared types for the document render engine (P1).

export type DocFormat = "pdf" | "docx";

export interface RenderSpec {
  /** Semantic HTML for the document body (NO <html>/<head>/<style> — the
   *  house-style wrapper adds those). */
  contentHtml: string;
  /** Human title; used in <title> and as the default file name stem. */
  title: string;
  /** Which formats to produce. Defaults to ["pdf"] when omitted by a caller. */
  formats: DocFormat[];
}

export interface RenderResult {
  format: DocFormat;
  buffer: Buffer;
  /** MIME type for storage + HTTP. */
  mime: string;
  /** File extension without the dot, e.g. "pdf". */
  ext: string;
}

export const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/docgen/types.ts
git commit -m "feat(docgen): render engine shared types"
```

---

### Task 3: House-style HTML wrapper (pure, TDD)

**Files:**
- Create: `src/lib/docgen/houseStyle.ts`
- Test: `src/__tests__/docgenHouseStyle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/docgenHouseStyle.test.ts
import { describe, it, expect } from "vitest";
import { escapeHtml, wrapInHouseStyle } from "../lib/docgen/houseStyle";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>Tom & Jerry</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;",
    );
  });
});

describe("wrapInHouseStyle", () => {
  const out = wrapInHouseStyle("<h1>Mackenzie Miller Homes</h1>", { title: "MMH <one-pager>" });

  it("produces a full HTML document", () => {
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<main class=\"doc\">");
    expect(out).toContain("<h1>Mackenzie Miller Homes</h1>");
  });
  it("inlines the house-style CSS", () => {
    expect(out).toContain("<style>");
    expect(out).toContain("font-family"); // proves CSS is present
  });
  it("escapes the title into <title>", () => {
    expect(out).toContain("<title>MMH &lt;one-pager&gt;</title>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/docgenHouseStyle.test.ts`
Expected: FAIL — "Cannot find module '../lib/docgen/houseStyle'".

- [ ] **Step 3: Implement the house-style module**

```ts
// src/lib/docgen/houseStyle.ts
// Wraps a document body in RockCap's house style. The SAME wrapped HTML feeds
// every renderer (PDF, DOCX), so all formats share one look.

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// RockCap house style. Kept intentionally conservative: system serif body,
// monospace labels echoing the app, A4-friendly spacing. v2 templates may
// override this; for v1 it is the single source of document styling.
export const HOUSE_STYLE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; color: #1a1a1a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  main.doc {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 11pt; line-height: 1.5;
    max-width: 720px; margin: 0 auto; padding: 8px 0;
  }
  main.doc h1 { font-size: 20pt; margin: 0 0 4px; letter-spacing: -0.01em; }
  main.doc h2 { font-size: 13pt; margin: 20px 0 6px; border-bottom: 1px solid #d9d9d9; padding-bottom: 3px; }
  main.doc h3 { font-size: 11pt; margin: 14px 0 4px; }
  main.doc p { margin: 0 0 8px; }
  main.doc .label {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 8pt; letter-spacing: 0.06em; text-transform: uppercase; color: #6b6b6b;
  }
  main.doc table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10pt; }
  main.doc th, main.doc td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e6e6e6; vertical-align: top; }
  main.doc th { font-family: ui-monospace, monospace; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; color: #6b6b6b; }
`;

export function wrapInHouseStyle(bodyHtml: string, opts: { title: string }): string {
  return (
    "<!doctype html>" +
    `<html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(opts.title)}</title>` +
    `<style>${HOUSE_STYLE_CSS}</style>` +
    `</head><body><main class="doc">${bodyHtml}</main></body></html>`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/docgenHouseStyle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docgen/houseStyle.ts src/__tests__/docgenHouseStyle.test.ts
git commit -m "feat(docgen): house-style HTML wrapper + escapeHtml (TDD)"
```

---

### Task 4: PDF renderer + Chromium de-risk (smoke test)

**Files:**
- Create: `src/lib/docgen/renderPdf.ts`
- Test: `src/__tests__/docgenRenderPdf.test.ts`

This is the **de-risk task**: the smoke test launches real Chromium. If it passes locally, the render path works; the Vercel check is Task 7's build + a deploy probe.

- [ ] **Step 1: Write the smoke test**

```ts
// src/__tests__/docgenRenderPdf.test.ts
import { describe, it, expect } from "vitest";
import { renderHtmlToPdf } from "../lib/docgen/renderPdf";
import { wrapInHouseStyle } from "../lib/docgen/houseStyle";

// Launches real Chromium. Requires a Chrome binary: on a dev machine set
// CHROMIUM_EXECUTABLE_PATH (e.g. the system Chrome); on Vercel
// @sparticuz/chromium supplies it. Skips if neither is available so the
// suite stays green in a headless CI without Chrome.
const canRun = !!process.env.CHROMIUM_EXECUTABLE_PATH;

describe.skipIf(!canRun)("renderHtmlToPdf", () => {
  it("produces a valid PDF buffer", async () => {
    const html = wrapInHouseStyle("<h1>Hello</h1><p>Render engine smoke test.</p>", { title: "Smoke" });
    const buf = await renderHtmlToPdf(html);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CHROMIUM_EXECUTABLE_PATH="$(which google-chrome || which chromium || echo /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome)" npx vitest run src/__tests__/docgenRenderPdf.test.ts`
Expected: FAIL — "Cannot find module '../lib/docgen/renderPdf'".

- [ ] **Step 3: Implement the PDF renderer**

```ts
// src/lib/docgen/renderPdf.ts
// HTML -> PDF via headless Chromium. Uses @sparticuz/chromium on serverless
// (Vercel) and a local Chrome via CHROMIUM_EXECUTABLE_PATH in development.
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

async function resolveExecutablePath(): Promise<string> {
  if (process.env.CHROMIUM_EXECUTABLE_PATH) return process.env.CHROMIUM_EXECUTABLE_PATH;
  return await chromium.executablePath();
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const executablePath = await resolveExecutablePath();
  const browser = await puppeteer.launch({
    args: process.env.CHROMIUM_EXECUTABLE_PATH ? ["--no-sandbox", "--disable-setuid-sandbox"] : chromium.args,
    executablePath,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CHROMIUM_EXECUTABLE_PATH="$(which google-chrome || which chromium || echo /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome)" npx vitest run src/__tests__/docgenRenderPdf.test.ts`
Expected: PASS (1 test). If it ERRORS launching Chromium, fix `CHROMIUM_EXECUTABLE_PATH` to a real Chrome binary before continuing — this is the de-risk gate.

- [ ] **Step 5: Commit**

```bash
git add src/lib/docgen/renderPdf.ts src/__tests__/docgenRenderPdf.test.ts
git commit -m "feat(docgen): HTML->PDF renderer via puppeteer-core + @sparticuz/chromium"
```

---

### Task 5: DOCX renderer (smoke test)

**Files:**
- Create: `src/lib/docgen/renderDocx.ts`
- Test: `src/__tests__/docgenRenderDocx.test.ts`

- [ ] **Step 1: Write the smoke test**

```ts
// src/__tests__/docgenRenderDocx.test.ts
import { describe, it, expect } from "vitest";
import { renderHtmlToDocx } from "../lib/docgen/renderDocx";
import { wrapInHouseStyle } from "../lib/docgen/houseStyle";

describe("renderHtmlToDocx", () => {
  it("produces a valid .docx (zip) buffer", async () => {
    const html = wrapInHouseStyle("<h1>Hello</h1><p>Docx smoke test.</p>", { title: "Smoke" });
    const buf = await renderHtmlToDocx(html);
    expect(buf.length).toBeGreaterThan(1000);
    // .docx is a zip — first two bytes are "PK".
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/docgenRenderDocx.test.ts`
Expected: FAIL — "Cannot find module '../lib/docgen/renderDocx'".

- [ ] **Step 3: Implement the DOCX renderer**

```ts
// src/lib/docgen/renderDocx.ts
// HTML -> DOCX via html-to-docx (pure JS, runs anywhere Node runs).
// The default export is an async function returning a Buffer/ArrayBuffer/Blob
// depending on environment; normalise to Buffer.
import HTMLtoDOCX from "html-to-docx";

export async function renderHtmlToDocx(html: string): Promise<Buffer> {
  const out: unknown = await HTMLtoDOCX(html, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    header: false,
  });
  if (Buffer.isBuffer(out)) return out;
  if (out instanceof ArrayBuffer) return Buffer.from(out);
  // Blob (web) fallback.
  if (typeof (out as Blob)?.arrayBuffer === "function") {
    return Buffer.from(await (out as Blob).arrayBuffer());
  }
  throw new Error("renderHtmlToDocx: unexpected output type from html-to-docx");
}
```

> If TypeScript complains that `html-to-docx` has no type declarations, add `// @ts-expect-error no types shipped` above the import, or create `src/types/html-to-docx.d.ts` with `declare module "html-to-docx";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/docgenRenderDocx.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docgen/renderDocx.ts src/__tests__/docgenRenderDocx.test.ts
git commit -m "feat(docgen): HTML->DOCX renderer via html-to-docx"
```

---

### Task 6: `renderDocument` orchestrator

**Files:**
- Create: `src/lib/docgen/index.ts`
- Test: `src/__tests__/docgenRenderDocument.test.ts`

- [ ] **Step 1: Write the test**

```ts
// src/__tests__/docgenRenderDocument.test.ts
import { describe, it, expect } from "vitest";
import { renderDocument } from "../lib/docgen";

const canRunPdf = !!process.env.CHROMIUM_EXECUTABLE_PATH;

describe("renderDocument", () => {
  it("renders only docx when only docx is requested", async () => {
    const results = await renderDocument({
      contentHtml: "<h1>X</h1>",
      title: "T",
      formats: ["docx"],
    });
    expect(results.map((r) => r.format)).toEqual(["docx"]);
    expect(results[0].mime).toContain("wordprocessingml");
    expect(results[0].ext).toBe("docx");
    expect(results[0].buffer.subarray(0, 2).toString("latin1")).toBe("PK");
  }, 30_000);

  it.skipIf(!canRunPdf)("renders both pdf and docx when both requested", async () => {
    const results = await renderDocument({
      contentHtml: "<h1>X</h1>",
      title: "T",
      formats: ["pdf", "docx"],
    });
    expect(results.map((r) => r.format).sort()).toEqual(["docx", "pdf"]);
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/docgenRenderDocument.test.ts`
Expected: FAIL — "Cannot find module '../lib/docgen'".

- [ ] **Step 3: Implement the orchestrator**

```ts
// src/lib/docgen/index.ts
// The render engine entry point: wrap a body in house style, then run each
// requested format's renderer. One HTML intermediate, many output formats.
import { wrapInHouseStyle } from "./houseStyle";
import { renderHtmlToPdf } from "./renderPdf";
import { renderHtmlToDocx } from "./renderDocx";
import { MIME, type DocFormat, type RenderResult, type RenderSpec } from "./types";

export * from "./types";
export { wrapInHouseStyle, escapeHtml, HOUSE_STYLE_CSS } from "./houseStyle";

async function renderOne(format: DocFormat, fullHtml: string): Promise<RenderResult> {
  if (format === "pdf") {
    return { format, buffer: await renderHtmlToPdf(fullHtml), mime: MIME.pdf, ext: "pdf" };
  }
  return { format, buffer: await renderHtmlToDocx(fullHtml), mime: MIME.docx, ext: "docx" };
}

export async function renderDocument(spec: RenderSpec): Promise<RenderResult[]> {
  if (!spec.contentHtml?.trim()) throw new Error("renderDocument: contentHtml is empty");
  if (!spec.formats?.length) throw new Error("renderDocument: no formats requested");
  const fullHtml = wrapInHouseStyle(spec.contentHtml, { title: spec.title });
  const results: RenderResult[] = [];
  for (const format of spec.formats) {
    results.push(await renderOne(format, fullHtml));
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/docgenRenderDocument.test.ts`
Expected: PASS (the docx test always; the pdf+docx test runs only with `CHROMIUM_EXECUTABLE_PATH` set).

- [ ] **Step 5: Commit**

```bash
git add src/lib/docgen/index.ts src/__tests__/docgenRenderDocument.test.ts
git commit -m "feat(docgen): renderDocument orchestrator (HTML -> formats)"
```

---

### Task 7: `/api/documents/generate` route (render + store)

**Files:**
- Create: `src/app/api/documents/generate/route.ts`

Mirrors the `src/app/api/quick-export/route.ts` pattern (`runtime='nodejs'`, `maxDuration`, `ConvexHttpClient`, binary-safe). Guarded by the existing `CONVEX_INTERNAL_SECRET` (same secret `cadenceDispatcher` sends). Uploads each rendered buffer to `_storage` via `api.files.generateUploadUrl` (the `convex/companiesHouse.ts:uploadChargePdf` upload pattern) and returns storage IDs. No approval / client-filing here — that is P2.

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/documents/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { renderDocument, type DocFormat } from "@/lib/docgen";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_FORMATS: DocFormat[] = ["pdf", "docx"];

function convex(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  return new ConvexHttpClient(url);
}

async function uploadToStorage(client: ConvexHttpClient, buffer: Buffer, mime: string): Promise<string> {
  const uploadUrl = await client.mutation(api.files.generateUploadUrl, {});
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": mime },
    body: new Blob([buffer], { type: mime }),
  });
  if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
  const { storageId } = await res.json();
  return storageId as string;
}

export async function POST(request: NextRequest) {
  // Internal-secret guard (same secret cadenceDispatcher sends).
  const secret = request.headers.get("x-convex-internal-secret");
  if (!secret || secret !== process.env.CONVEX_INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { contentHtml, title } = body;
    const formats: DocFormat[] = Array.isArray(body.formats) && body.formats.length
      ? body.formats.filter((f: string) => VALID_FORMATS.includes(f as DocFormat))
      : ["pdf"];

    if (typeof contentHtml !== "string" || !contentHtml.trim()) {
      return NextResponse.json({ error: "contentHtml is required" }, { status: 400 });
    }
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const rendered = await renderDocument({ contentHtml, title, formats });

    const client = convex();
    const safeStem = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "document";
    const files = [];
    for (const r of rendered) {
      const storageId = await uploadToStorage(client, r.buffer, r.mime);
      files.push({
        format: r.format,
        storageId,
        fileName: `${safeStem}.${r.ext}`,
        fileSize: r.buffer.length,
        mime: r.mime,
      });
    }

    return NextResponse.json({ ok: true, files });
  } catch (err) {
    console.error("[documents/generate] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", service: "documents/generate", formats: VALID_FORMATS });
}
```

> If `tsc`/build flags a deep type-instantiation error on the static `api` import (as `quick-export` avoids via `require`), swap the import for the same runtime require it uses: `const { api } = require("../../../../../convex/_generated/api");`.

- [ ] **Step 2: Build to typecheck the route + whole app**

Run: `npx convex dev --once && npx next build`
Expected: build completes (route appears as `ƒ /api/documents/generate` in the route manifest), no type errors.

- [ ] **Step 3: Manual end-to-end verify (dev server)**

Start the dev server (`npm run dev`), then:
```bash
curl -s -X POST http://localhost:3000/api/documents/generate \
  -H "Content-Type: application/json" \
  -H "x-convex-internal-secret: $CONVEX_INTERNAL_SECRET" \
  -d '{"title":"Render Engine Test","formats":["pdf","docx"],"contentHtml":"<h1>Render Engine</h1><p class=\"label\">P1 verification</p><p>If you can read this in a PDF, Chromium-on-this-host works.</p>"}'
```
Expected: JSON `{ "ok": true, "files": [ { "format": "pdf", "storageId": "...", ... }, { "format": "docx", ... } ] }`.
Then confirm the file opens: in a Convex dashboard function runner (or a scratch query) call `documents.getFileUrl` with a returned `storageId` and open the URL — the PDF should render with house styling. (A missing-`CHROMIUM_EXECUTABLE_PATH` dev host will 500 on the pdf format; set it or request `["docx"]` only to confirm the route+storage path independently.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/documents/generate/route.ts
git commit -m "feat(docgen): /api/documents/generate route (render + store to _storage)"
```

---

## Self-review checklist (run before handoff)

- [ ] **Vercel/Chromium deploy probe (do this once before P2):** deploy the branch to a Vercel preview and `curl` the preview's `/api/documents/generate` with `["pdf"]`. If `@sparticuz/chromium` exceeds the function size/time limit, P2/P3 stay valid but the PDF renderer moves to a worker behind the same `renderDocument` interface (spec note). Record the result.

## Done when

`/api/documents/generate` returns storage IDs for a rendered PDF + DOCX, the files open with house styling, and `npx next build` + `npx vitest run` are green. P2 (approval + `document_publish` executor + client-filing) consumes these storage IDs next.
