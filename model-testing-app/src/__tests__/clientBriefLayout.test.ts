// src/__tests__/clientBriefLayout.test.ts
import { describe, it, expect } from "vitest";
import {
  buildClientBriefHtml,
  buildClientBriefFooterTemplate,
} from "../lib/docgen/layouts/clientBrief";
import { buildLenderBriefFooterTemplate } from "../lib/docgen/layouts/lenderBrief";
import type { ClientBriefData } from "../lib/docgen/types";

const sample: ClientBriefData = {
  variant: "new-facility",
  confidentiality: "EXTERNAL",
  title: { location: "THE OLD DAIRY", descriptor: "Indicative Lender Landscape and Expected Pricing" },
  meta: { borrower: "Innocent Group / Vantage & Co", preparedBy: "RockCap Ltd", date: "22 April 2026" },
  keyFacts: [
    { label: "Borrower / SPV", value: "Innocent Group in JV with Vantage & Co (SPV TBC)" },
    { label: "GDV", value: "£5,111,000" },
  ],
  sections: [
    { n: 1, title: "Introduction", bodyHtml: "<p>RockCap is re-opening work on The Old Dairy, a 10-unit residential development.</p>" },
    { n: 2, title: "Market Overview and Leverage Structure", bodyHtml: "<table><tr><td>Cash equity required</td><td class=\"num\">£466,382</td></tr></table>" },
  ],
  signOff: { name: "Alex Lundberg", role: "Director, RockCap", email: "alex@rockcap.uk", phone: "07815 912 057" },
};

describe("buildClientBriefHtml", () => {
  const html = buildClientBriefHtml(sample);
  it("is a full HTML document with the RockCap masthead", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("class=\"brief-wordmark\">RockCap<");
    expect(html).toContain("class=\"brief-header\"");
  });
  it("labels the masthead 'Client Briefing / Confidential' (NOT 'Lender Brief')", () => {
    expect(html).toContain("Client Briefing<br>Confidential");
    expect(html).not.toContain("Lender Brief");
    expect(html).not.toContain("Strictly Private");
  });
  it("titles the document a Client Brief", () => {
    expect(html).toContain("<title>THE OLD DAIRY — Client Brief</title>");
  });
  it("renders the title block", () => {
    expect(html).toContain("THE OLD DAIRY");
    expect(html).toContain("Indicative Lender Landscape and Expected Pricing");
  });
  it("does NOT include the confidentiality token in the meta line (it lives in the masthead)", () => {
    expect(html).toContain("Innocent Group / Vantage &amp; Co  ·  Prepared by RockCap Ltd  ·  22 April 2026");
    expect(html).not.toContain("·  EXTERNAL<");
  });
  it("renders each key fact (label + value)", () => {
    expect(html).toContain("Borrower / SPV");
    expect(html).toContain("£5,111,000");
  });
  it("renders numbered sections with bodyHtml injected raw", () => {
    expect(html).toContain("<h2>1. Introduction</h2>");
    expect(html).toContain("<td class=\"num\">£466,382</td>"); // scenario table preserved
  });
  it("renders the sign-off", () => {
    expect(html).toContain("Alex Lundberg");
    expect(html).toContain("alex@rockcap.uk");
  });
  it("reuses the shared brief chrome (same break-avoid CSS as the lender brief)", () => {
    expect(html).toContain("section.brief-section { break-inside: avoid; }");
    expect(html).toContain(".brief-section svg { width: 100%; height: auto;");
  });
});

describe("buildClientBriefFooterTemplate", () => {
  it("is the shared brief footer (identical to the lender brief band)", () => {
    expect(buildClientBriefFooterTemplate()).toBe(buildLenderBriefFooterTemplate());
  });
  it("is a full-width black band with the company line and page numbers", () => {
    const tpl = buildClientBriefFooterTemplate();
    expect(tpl).toContain("background:#141414");
    expect(tpl).toContain("RockCap Ltd");
    expect(tpl).toContain("class=\"pageNumber\"");
    expect(tpl).toContain("class=\"totalPages\"");
  });
});
