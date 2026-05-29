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
