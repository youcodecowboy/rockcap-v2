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
