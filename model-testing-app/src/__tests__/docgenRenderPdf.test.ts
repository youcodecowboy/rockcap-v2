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
