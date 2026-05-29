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
