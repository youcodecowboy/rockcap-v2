// src/__tests__/clientBriefExample.test.ts
// Worked example for skills/shared-references/doc-type-client-brief.md: the Old Dairy
// client brief (Innocent Group / Vantage & Co JV, new-facility variant, EXTERNAL).
// Reproduced from the operator's real V2.0 brief so the section set, the leverage-
// scenario table, and the eleven-lender expected-pricing panel are reproducible and
// not lost. The compose check runs in CI; the PDF render is gated on
// CHROMIUM_EXECUTABLE_PATH and writes /tmp/od-current.pdf for local inspection
// (skipped in CI, mirroring lenderBriefExample.test.ts).
// Local render: CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        npx vitest run src/__tests__/clientBriefExample.test.ts
import { writeFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderDocument, buildClientBriefHtml } from "../lib/docgen";
import type { ClientBriefData } from "../lib/docgen/types";

const canRunPdf = !!process.env.CHROMIUM_EXECUTABLE_PATH;

const oldDairy: ClientBriefData = {
  variant: "new-facility",
  confidentiality: "EXTERNAL",
  title: {
    location: "THE OLD DAIRY",
    descriptor: "Indicative Lender Landscape and Expected Pricing",
  },
  meta: {
    borrower: "Innocent Group / Vantage & Co",
    preparedBy: "RockCap Ltd",
    date: "April 2026",
  },
  keyFacts: [
    { label: "Borrower / SPV", value: "Innocent Group in JV with Vantage & Co (SPV TBC)" },
    { label: "Site", value: "The Old Dairy — address to confirm" },
    { label: "Development", value: "10 residential units for sale (consented)" },
    { label: "Gross Development Value", value: "£5,111,000 (blended £475 psf)" },
    { label: "Net Development Value", value: "£5,047,113" },
    { label: "Land cost", value: "£946,650" },
    { label: "Construction (incl. contingency + professionals)", value: "£2,675,843" },
    { label: "Programme", value: "18-month build; first sales completing month 15" },
    { label: "Relationship Manager", value: "Alex Lundberg (AL)" },
  ],
  sections: [
    {
      n: 1,
      title: "Introduction",
      bodyHtml:
        "<p>RockCap is re-opening work on The Old Dairy, a 10-unit residential development in the Innocent Group / Vantage &amp; Co joint venture pipeline, with a projected Gross Development Value of £5.11 million. This note sets out three leverage scenarios for the senior development facility, the associated cash equity requirement under each, and our view on the eleven lenders we intend to approach.</p>" +
        "<p>No lender has yet been approached. The pricing guidance set out below is drawn from indicative terms RockCap has received from the same lender panel on comparable schemes over recent weeks, most directly schemes in Hampshire (7 units, £4.48m GDV, March 2026) and Gloucestershire (36 units, £14.75m GDV, March 2026). These housebuilders are more experienced, so we would expect pricing for The Old Dairy to be slightly higher. In general, pricing is expectations, not commitments. Once the scheme goes to market we will replace these with actual indicative terms and produce a full comparative analysis and recommendation.</p>",
    },
    {
      n: 2,
      title: "Key Deal Parameters",
      bodyHtml:
        "<table><thead><tr><th>Parameter</th><th>Detail</th></tr></thead><tbody>" +
        "<tr><td>Borrower / SPV</td><td>Innocent Group in JV with Vantage &amp; Co (SPV TBC)</td></tr>" +
        "<tr><td>Site</td><td>The Old Dairy — [address to confirm]</td></tr>" +
        "<tr><td>Development</td><td>10 residential units for sale</td></tr>" +
        "<tr><td>Planning status</td><td>Consented scheme</td></tr>" +
        "<tr><td>Total GIA / NIA</td><td>10,760 sqft</td></tr>" +
        "<tr><td>Blended pricing</td><td>£475 psf</td></tr>" +
        "<tr><td>GDV</td><td class=\"num\">£5,111,000</td></tr>" +
        "<tr><td>Net Development Value</td><td class=\"num\">£5,047,113</td></tr>" +
        "<tr><td>Land cost</td><td class=\"num\">£946,650</td></tr>" +
        "<tr><td>Construction + contingency + professionals</td><td class=\"num\">£2,675,843</td></tr>" +
        "<tr><td>Programme</td><td>18-month build; first sales completing month 15</td></tr>" +
        "<tr><td>Facility term modelled</td><td>24 months; full cash sweep; exit fee in gross loan</td></tr>" +
        "</tbody></table>",
    },
    {
      n: 3,
      title: "Market Overview and Leverage Structure",
      bodyHtml:
        "<p>The Old Dairy is a well-defined scheme of the kind the development finance market engages with actively: ten consented residential units, for-sale exit, an 18-month build (which can be reduced if needed), and a borrower team with construction experience. At this size (sub-£5m facility, sub-£5.5m GDV) the market is deep. Eleven credible lenders are capable of writing this facility; all have live appetite for schemes of this profile.</p>" +
        "<p>The immediate structural question is leverage. Three scenarios have been modelled, holding programme, sales velocity, and professional fee assumptions constant. The senior debt margin assumptions in the model (5.25% / 5.75% / 6.25% over SONIA across the three leverage points) are deliberately set at a conservative level. Indicative pricing on comparable recent schemes has typically come in 25 to 50 bps tighter than these assumptions at equivalent leverage, which would translate into a modestly lower finance cost and slightly reduced equity requirement once live terms are in.</p>" +
        "<table><thead><tr><th>Metric</th><th class=\"num\">65% LTGDV</th><th class=\"num\">67.5% LTGDV</th><th class=\"num\">70% LTGDV</th></tr></thead><tbody>" +
        "<tr><td>Senior debt (gross, incl. exit)</td><td class=\"num\">£3.32m</td><td class=\"num\">£3.45m</td><td class=\"num\">£3.58m</td></tr>" +
        "<tr><td>Senior debt margin (modelled)</td><td class=\"num\">SONIA + 5.25%</td><td class=\"num\">SONIA + 5.75%</td><td class=\"num\">SONIA + 6.25%</td></tr>" +
        "<tr><td>Arrangement fee / exit fee</td><td class=\"num\">1.00% / 1.25%</td><td class=\"num\">1.00% / 1.25%</td><td class=\"num\">1.00% / 1.25%</td></tr>" +
        "<tr><td>Cash equity required</td><td class=\"num\">£569,968</td><td class=\"num\">£466,382</td><td class=\"num\">£373,147</td></tr>" +
        "<tr><td>Developer profit</td><td class=\"num\">£684,631</td><td class=\"num\">£712,235</td><td class=\"num\">£751,154</td></tr>" +
        "<tr><td>Profit on cost</td><td class=\"num\">28.3%</td><td class=\"num\">26.7%</td><td class=\"num\">25.7%</td></tr>" +
        "</tbody></table>" +
        "<p>Each 2.5 percentage point step up in LTGDV reduces the cash equity requirement by roughly £100,000, at the cost of 50 bps on the senior margin. The 70% option releases just under £200,000 of upfront equity versus the 65% option, with profit on cost compressing by 2.6 percentage points. In addition, personal guarantee requirements typically step up from 20% of gross loan at 65% LTGDV to 25–30% at 70%+, which is a non-trivial consideration when ranking the scenarios.</p>",
    },
    {
      n: 4,
      title: "Expected Senior Lender Pricing",
      bodyHtml:
        "<p>The table below summarises expected indicative pricing from each of the eleven lenders we intend to approach. Figures draw on three similar schemes we have requested terms on recently. Lenders RockCap transacts most frequently with are noted in the commentary.</p>" +
        "<table><thead><tr><th>Lender</th><th>Expected Margin</th><th>Arr. / Exit Fees</th><th>Max LTGDV</th><th>Commentary</th></tr></thead><tbody>" +
        "<tr><td>Quantum (QDF)</td><td>4.85–5.75% over Base (65–70%)</td><td>1.00% / 1.15–1.25%</td><td>70% for the right client</td><td>Most-active RockCap relationship. Sensitive to developer track record, which OD may not qualify for.</td></tr>" +
        "<tr><td>Downing</td><td>5.25–6.00% over Base (65–70%)</td><td>1.00% + broker / 1.25–1.50%</td><td>70% for the right client</td><td>Second most-active RockCap relationship.</td></tr>" +
        "<tr><td>Pallas Capital</td><td>5.60–6.60% over Base (65–70%); 7.25% at 75%</td><td>2.00% (incl. 1% broker) / 1.00–1.25%</td><td>75% standalone</td><td>Most aggressive headline terms. New UK entrant; execution untested.</td></tr>" +
        "<tr><td>Shawbrook</td><td>4.75% over Shawbrook Rate = c.8.50% all-in (70%)</td><td>1.00% / 1.25%</td><td>70%</td><td>Sharpest 70% LTGDV pricing; material process concerns.</td></tr>" +
        "<tr><td>Clearwell Capital</td><td>c.6.50–7.00% over Base (67.5–72%)</td><td>1.00% + 1% broker / 1.25–1.49%</td><td>c.72% stretch</td><td>Keen to deploy. Max c.£5m net loan.</td></tr>" +
        "<tr><td>Atelier</td><td>c.5.25–6% over Base</td><td>TBC</td><td>70%</td><td>Higher risk appetite; thorough DD can slow the process.</td></tr>" +
        "<tr><td>Triple Point</td><td>c.5.00% over Base (floor 8.50% all-in)</td><td>2.00% (incl. 1% broker) / 1.00%</td><td>70%</td><td>Credit team has shifted; still credible, good to deal with.</td></tr>" +
        "<tr><td>LendInvest</td><td>c.5.5–7% over Base</td><td>TBC</td><td>70% (via Mitcham)</td><td>Long-standing; appetite for non-standard schemes.</td></tr>" +
        "<tr><td>Sancus</td><td>c.8.00% over Base (stretch, all-in c.11.75%)</td><td>1.10% + 1% broker / 1.50%</td><td>73% stretch</td><td>Genuinely good to deal with; pricing at the top of the panel.</td></tr>" +
        "<tr><td>Assetz Capital</td><td>c.5.5% over Base</td><td>TBC</td><td>70%</td><td>Process-heavy; approached for coverage, not preferred.</td></tr>" +
        "<tr><td>Stamford</td><td>c.12.5–13% all-in</td><td>TBC</td><td>TBC</td><td>Outside core transacted panel; approached for panel breadth.</td></tr>" +
        "<tr><td>Invest &amp; Fund</td><td>c.4.7% over Base</td><td>TBC</td><td>TBC</td><td>Outside core transacted panel; approached for panel breadth.</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">All margins are quoted over Base unless otherwise stated. Shawbrook quotes against its own house base rate; QDF and Pallas typically apply a SONIA floor of 3.50%. Arrangement fees quoted as 2.00% include a 1.00% procuration fee payable to RockCap; the effective lender arrangement fee in those cases is 1.00%.</p>",
    },
    {
      n: 5,
      title: "Next Steps",
      bodyHtml:
        "<table><thead><tr><th>Owner</th><th>Action</th></tr></thead><tbody>" +
        "<tr><td>Client</td><td>Confirm preferred LTGDV target, or brief us to take two scenarios into market in parallel. We recommend 65% and 67.5% as the sensible leverage bracket given the personal guarantee step-up at 70%+.</td></tr>" +
        "<tr><td>Client</td><td>Provide the final scheme address, SPV structure, and any borrower documentation updates (CVs, track record schedule, recent accounts) to complete the lender pack.</td></tr>" +
        "<tr><td>RockCap</td><td>Finalise the lender note and issue a coordinated approach to the eleven-lender panel. Indicative terms expected back within one to two weeks.</td></tr>" +
        "<tr><td>RockCap</td><td>Produce a side-by-side terms comparison and written recommendation once lender responses are in.</td></tr>" +
        "</tbody></table>",
    },
  ],
  signOff: {
    name: "Alex Lundberg",
    role: "Director, RockCap",
    email: "alex@rockcap.uk",
    phone: "07815 912 057",
  },
};

describe("client-brief worked example: The Old Dairy", () => {
  it("composes the expected client-brief depth (intro caveat, scenario table, lender panel, next steps)", () => {
    const html = buildClientBriefHtml(oldDairy);
    // The borrower-facing masthead, not the lender brief's
    expect(html).toContain("Client Briefing<br>Confidential");
    // The pre-market caveat that defines a client brief
    expect(html).toContain("No lender has yet been approached.");
    // The leverage-scenario comparison (RockCap advising on equity vs leverage)
    expect(html).toContain("3. Market Overview and Leverage Structure");
    expect(html).toContain("£466,382"); // 67.5% cash equity
    // The eleven-lender expected-pricing panel
    expect(html).toContain("4. Expected Senior Lender Pricing");
    expect(html).toContain("Quantum (QDF)");
    expect(html).toContain("Invest &amp; Fund");
    expect(html).toContain("5. Next Steps");
  });

  it.skipIf(!canRunPdf)("renders the branded PDF to /tmp/od-current.pdf for local inspection", async () => {
    const results = await renderDocument({
      layout: "client-brief",
      briefData: oldDairy,
      title: "The Old Dairy Client Brief",
      formats: ["pdf"],
    });
    const pdf = results[0];
    expect(pdf.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    writeFileSync("/tmp/od-current.pdf", pdf.buffer);
    // eslint-disable-next-line no-console
    console.log(`\n[client-brief example] wrote /tmp/od-current.pdf (${pdf.buffer.length} bytes)\n`);
  }, 120_000);
});
