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
