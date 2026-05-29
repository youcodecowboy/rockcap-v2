// src/__tests__/lenderBriefLayout.test.ts
import { describe, it, expect } from "vitest";
import {
  buildLenderBriefHtml,
  buildLenderBriefFooterTemplate,
} from "../lib/docgen/layouts/lenderBrief";
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
  it("is a full HTML document with in-body masthead", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // Change 1: masthead restored as in-body .brief-header block
    expect(html).toContain("class=\"brief-wordmark\">RockCap<");
    expect(html).toContain("class=\"brief-header\"");
    expect(html).toContain("Strictly Private");
  });
  it("renders the title block", () => {
    expect(html).toContain("BURNHAM, BUCKINGHAMSHIRE");
    expect(html).toContain("9-Unit Residential — Senior + Equity");
  });
  it("does NOT include the INTERNAL token in the meta line (Change 3)", () => {
    // confidentiality field kept on LenderBriefData but not rendered in metaline
    expect(html).not.toContain(">LDRM Construction Ltd  ·  Prepared by RockCap Ltd  ·  27 May 2026  ·  INTERNAL<");
    // Ensure the meta line itself is present without the token
    expect(html).toContain("Prepared by RockCap Ltd  ·  27 May 2026");
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
  it("includes page-break-avoid CSS rules including sign-off (Change 4)", () => {
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("break-after: avoid");
    expect(html).toContain(".brief-signoff { break-inside: avoid; }");
  });
});

describe("buildLenderBriefFooterTemplate", () => {
  const footer = buildLenderBriefFooterTemplate();
  it("is a full-bleed black band with bigger text, company line + page numbers (Change 2)", () => {
    expect(footer).toContain("background:#141414");
    expect(footer).toContain("height:100%");   // fills entire bottom margin to page edge
    expect(footer).toContain("font-size:8.5pt"); // bigger text
    expect(footer).toContain("RockCap Ltd");
    expect(footer).toContain("rockcap.uk");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
  });
});
