// src/__tests__/lenderBriefExample.test.ts
// Worked example for skills/shared-references/doc-type-lender-brief.md: the Temple
// Guiting senior-dev lender brief, composed from the Mackenzie Miller group's
// Companies House charge register (companies.getGroupCharges / getProspectSchemes;
// clientId kn7byatdbeywpd8z5c7aghf2m582jyvq). Persisted so the composition is
// reproducible and not lost. The compose check runs in CI; the PDF render is gated
// on CHROMIUM_EXECUTABLE_PATH and writes /tmp/tg-current.pdf for local inspection
// (skipped in CI, mirroring lenderBriefRender.test.ts).
// Local render: CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//        npx vitest run src/__tests__/lenderBriefExample.test.ts
import { writeFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { renderDocument, buildLenderBriefHtml } from "../lib/docgen";
import type { LenderBriefData } from "../lib/docgen/types";

const canRunPdf = !!process.env.CHROMIUM_EXECUTABLE_PATH;

const tg: LenderBriefData = {
  variant: "senior-dev",
  confidentiality: "EXTERNAL",
  title: {
    location: "TEMPLE GUITING, GLOUCESTERSHIRE",
    descriptor: "Six Luxury Cotswold Homes — Senior Development Facility",
  },
  meta: {
    borrower: "Land at Temple Guiting SPV Limited (Mackenzie Miller group)",
    preparedBy: "RockCap Ltd",
    date: "29 May 2026",
  },
  keyFacts: [
    { label: "Borrower", value: "Land at Temple Guiting SPV Limited (CH 14032704) — Mackenzie Miller group" },
    { label: "Sponsor", value: "Mackenzie Miller Developments Ltd (CH 09840954), founded & controlled by Pete Mackenzie BSc MRICS" },
    { label: "Scheme", value: "6 luxury homes (5 new-build + 1 barn conversion), 17,782 sq ft" },
    { label: "Location", value: "Land NE of New Barn Farm, Temple Guiting, Gloucestershire GL54 5RW" },
    { label: "Gross Development Value", value: "£12.40m (blended £697 psf)" },
    { label: "Senior Facility", value: "£6.24m — Quantum Development Finance (executed 14 Oct 2025)" },
    { label: "Profit on Cost", value: "£2.73m (22%)" },
    { label: "Relationship Manager", value: "Alex Lundberg (AL) / Rayn Smid (RS)" },
  ],
  sections: [
    {
      n: 1,
      title: "Executive Summary",
      bodyHtml:
        "<p>RockCap presents Temple Guiting, a development of six luxury Cotswold homes — five new-build houses and one barn conversion — on the Temple Guiting Estate, Gloucestershire (GL54 5RW). The scheme holds full planning permission (ref 25/01431/FUL) and delivers 17,782 sq ft across six plots.</p>" +
        "<p>Gross Development Value is appraised at <strong>£12.40m</strong> (a blended £697 per sq ft), against which the scheme is forecast to deliver a developer profit of <strong>£2.73m, 22% on cost</strong>. A senior development facility of <strong>£6.24m</strong> is in place with Quantum Development Finance (facility letter executed 14 October 2025; first legal charge registered at Companies House on 30 October 2025), independently monitored by MDA Consulting.</p>" +
        "<p>The borrower is a dedicated single-purpose vehicle within the Mackenzie Miller group — a luxury Cotswold housebuilder founded and led by Pete Mackenzie (BSc MRICS). The group has a deep, repeat institutional funding base: 17 active senior charges across six lenders, with Quantum Development Finance the incumbent on its current Cotswold schemes (this one included).</p>",
    },
    {
      n: 2,
      title: "Asset Overview",
      bodyHtml:
        "<p>The site lies north-east of New Barn Farm on the Temple Guiting Estate, in the heart of the Cotswolds Area of Outstanding Natural Beauty (GL54 5RW). The consented scheme (ref 25/01431/FUL) comprises five new-build houses plus the conversion of an existing barn, replacing redundant agricultural buildings.</p>" +
        "<table><thead><tr><th>Plot</th><th>Type</th><th>Form</th></tr></thead><tbody>" +
        "<tr><td>Plot 1</td><td>Detached house</td><td>2-storey principal residence</td></tr>" +
        "<tr><td>Plots 2–4</td><td>Detached houses</td><td>New-build</td></tr>" +
        "<tr><td>Plot 5</td><td>Detached house</td><td>3-storey</td></tr>" +
        "<tr><td>Plot 6</td><td>Barn conversion</td><td>3-bed, 2-storey</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">Six plots, 17,782 sq ft total. Architecture by Intelligent Residential Design and Tyack Architects. Per-plot areas and pricing are detailed in the development appraisal.</p>",
    },
    {
      n: 3,
      title: "Scheme & Pricing",
      bodyHtml:
        "<p>Pricing is supported by strong local comparable evidence, including Mackenzie Miller's own recently-completed Cider Mill scheme in nearby Longborough.</p>" +
        "<table><thead><tr><th>Metric</th><th class=\"num\">Value</th></tr></thead><tbody>" +
        "<tr><td>Gross Development Value</td><td class=\"num\">£12.40m</td></tr>" +
        "<tr><td>Blended rate</td><td class=\"num\">£697 psf</td></tr>" +
        "<tr><td>Plot pricing range</td><td class=\"num\">£606–£727 psf</td></tr>" +
        "<tr><td>GL54 new-build comparables</td><td class=\"num\">£658–£783 psf</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">Comparable evidence per RockCap's pricing analysis (Knight Frank, Savills, Butler Sherborn; Cider Mill, Longborough). Per-plot GDV detailed in the development appraisal.</p>",
    },
    {
      n: 4,
      title: "Development Appraisal",
      bodyHtml:
        "<p>Headline appraisal metrics (per the development appraisal submitted to Quantum, August 2025):</p>" +
        "<table><thead><tr><th>Item</th><th class=\"num\">Amount</th><th class=\"num\">% of GDV</th></tr></thead><tbody>" +
        "<tr><td>Gross Development Value</td><td class=\"num\">£12.40m</td><td class=\"num\">100%</td></tr>" +
        "<tr><td>Net land value</td><td class=\"num\">£2.64m</td><td class=\"num\">21.3%</td></tr>" +
        "<tr><td>Construction (incl. CIL / S106)</td><td class=\"num\">£5.86m</td><td class=\"num\">47.3%</td></tr>" +
        "<tr><td>Finance costs</td><td class=\"num\">£0.98m</td><td class=\"num\">7.9%</td></tr>" +
        "<tr><td>Developer profit</td><td class=\"num\">£2.73m</td><td class=\"num\">22.0%</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">Source: Temple Guiting development appraisal (Quantum submission). Professional fees (£160k) and contingency (£219k) are included within development costs.</p>",
    },
    {
      n: 5,
      title: "Senior Facility & Security",
      bodyHtml:
        "<p>A senior development facility is in place with Quantum Development Finance, drawn in tranches against build progress.</p>" +
        "<table><thead><tr><th>Facility tranche</th><th class=\"num\">Amount</th></tr></thead><tbody>" +
        "<tr><td>Property advance</td><td class=\"num\">£592,200</td></tr>" +
        "<tr><td>Development advance</td><td class=\"num\">£4,203,000</td></tr>" +
        "<tr><td>Contingency advance</td><td class=\"num\">£219,000</td></tr>" +
        "<tr><td>Professional fees advance</td><td class=\"num\">£160,000</td></tr>" +
        "<tr><td>Monitoring (PMS) advance</td><td class=\"num\">£15,000</td></tr>" +
        "<tr><td><strong>Total senior facility</strong></td><td class=\"num\"><strong>£6,240,000</strong></td></tr>" +
        "</tbody></table>" +
        "<p>The facility represents c.50% of GDV over a c.17–18 month build programme. Security comprises a first legal charge over the site — registered to Quantum Development Finance at Companies House on 30 October 2025 — together with a debenture and share charge over Land at Temple Guiting SPV Limited and personal guarantees from Peter and Robert Mackenzie. Independent monitoring is provided by MDA Consulting.</p>",
    },
    {
      n: 6,
      title: "Borrower & Sponsor",
      bodyHtml:
        "<p>Mackenzie Miller Homes — registered as <strong>Mackenzie Miller Developments Limited</strong> (CH 09840954, incorporated 2015) — is a luxury bespoke housebuilder operating across the Cotswolds and Warwickshire. The business is founded and majority-controlled (75%+) by Pete Mackenzie (BSc MRICS), a chartered surveyor, and runs a disciplined per-scheme single-purpose-vehicle model: the trading parent carries no charges, while each site sits in its own ring-fenced SPV. The group currently controls c.20 active SPVs and funds multiple schemes concurrently.</p>" +
        "<table><thead><tr><th>Principal</th><th>Role</th></tr></thead><tbody>" +
        "<tr><td>Pete Mackenzie BSc MRICS</td><td>Founder &amp; Managing Director — sole majority shareholder (PSC)</td></tr>" +
        "<tr><td>Robert Mackenzie</td><td>Chairman</td></tr>" +
        "<tr><td>George Mackenzie</td><td>Land &amp; Planning</td></tr>" +
        "<tr><td>Nicola Kinnie</td><td>Director, Finance &amp; Investment</td></tr>" +
        "<tr><td>Adam Renn</td><td>Land &amp; Development Director (co-founder)</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">Per Companies House officer/PSC filings and the borrower's published leadership team. Pete Mackenzie is the sole registered person with significant control.</p>",
    },
    {
      n: 7,
      title: "Track Record & Group Funding",
      bodyHtml:
        "<p>The group's borrowing is spread across single-scheme SPVs, consistent with its delivery model. The Companies House charge register across the group records <strong>17 active secured charges</strong> against <strong>six lenders</strong>, plus two earlier facilities since fully repaid and satisfied — a deep, repeat institutional funding base for a developer of this size.</p>" +
        "<table><thead><tr><th>Senior lender</th><th class=\"num\">Active charges</th><th>Where</th></tr></thead><tbody>" +
        "<tr><td>Quantum Development Finance</td><td class=\"num\">6</td><td>Incumbent on current Cotswold schemes (incl. Temple Guiting)</td></tr>" +
        "<tr><td>Paragon Development Finance</td><td class=\"num\">5</td><td>Nether Westcote, Little Rissington</td></tr>" +
        "<tr><td>Investec Bank</td><td class=\"num\">3</td><td>Foxwood, Little Rissington (sales/refinance)</td></tr>" +
        "<tr><td>Neslo Partners (private)</td><td class=\"num\">2</td><td>The Sheppey; Clifton Hall land</td></tr>" +
        "<tr><td>Security Trustee Services</td><td class=\"num\">1</td><td>Warwickshire (1 further charge satisfied)</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">Source: Companies House charge register, Mackenzie Miller group (20 SPVs). 17 active charges, 2 historically satisfied. Charge values are not disclosed at Companies House.</p>" +
        "<p>Recent and current residential schemes, all in prime Cotswold villages:</p>" +
        "<table><thead><tr><th>Scheme</th><th>Location</th><th class=\"num\">Units</th><th>Senior lender</th><th>Funded</th><th>Status</th></tr></thead><tbody>" +
        "<tr><td>Temple Guiting <em>(this deal)</em></td><td>Temple Guiting</td><td class=\"num\">6</td><td>Quantum</td><td>Oct 2025</td><td>Live</td></tr>" +
        "<tr><td>Broomhall / Poole Farm</td><td>Leighterton</td><td class=\"num\">4</td><td>Quantum</td><td>Apr 2025</td><td>Live</td></tr>" +
        "<tr><td>The Arrows</td><td>Little Rissington</td><td class=\"num\">3</td><td>Investec / Paragon</td><td>2022–25</td><td>Sold</td></tr>" +
        "<tr><td>The Cider Mill</td><td>Longborough</td><td class=\"num\">6</td><td>Quantum</td><td>Dec 2023</td><td>Sold</td></tr>" +
        "<tr><td>The Sheppey</td><td>Chipping Campden</td><td class=\"num\">—</td><td>Neslo Partners</td><td>Oct 2022</td><td>Live</td></tr>" +
        "<tr><td>Foxwood</td><td>Chipping Campden</td><td class=\"num\">1</td><td>Investec</td><td>Sep 2022</td><td>Complete</td></tr>" +
        "<tr><td>Nether Westcote</td><td>Nether Westcote</td><td class=\"num\">—</td><td>Paragon</td><td>Jun 2022</td><td>Live</td></tr>" +
        "</tbody></table>" +
        "<p class=\"caption\">Unit counts and dates per Companies House charges and the developer's published portfolio; unit counts for most schemes are indicative. Quantum is the repeat incumbent on the live Cotswold schemes; Investec and Paragon funded earlier, now-completed projects. Two early facilities (2019, Warwickshire/Coventry) have been fully repaid — a documented fund-and-repay cycle.</p>",
    },
    {
      n: 8,
      title: "Professional Team & Enclosed Documentation",
      bodyHtml:
        "<table><thead><tr><th>Discipline</th><th>Firm</th></tr></thead><tbody>" +
        "<tr><td>Monitoring surveyor</td><td>MDA Consulting Ltd</td></tr>" +
        "<tr><td>Architects</td><td>Intelligent Residential Design; Tyack Architects Ltd</td></tr>" +
        "<tr><td>Market evidence</td><td>Knight Frank, Savills, Butler Sherborn, BNP Paribas</td></tr>" +
        "</tbody></table>" +
        "<p>The following documentation is enclosed in support of this brief:</p>" +
        "<table><thead><tr><th>Document</th><th>What it provides</th></tr></thead><tbody>" +
        "<tr><td>Development appraisal <span class=\"sub\">(Quantum submission, Aug 2025)</span></td><td>Full cost, GDV and profit build-up underpinning the headline metrics</td></tr>" +
        "<tr><td>Executed Facility Letter <span class=\"sub\">(14 Oct 2025)</span></td><td>Quantum senior terms — tranche schedule, covenants and drawdown conditions</td></tr>" +
        "<tr><td>MDA Consulting Initial Monitoring Report <span class=\"sub\">(Sep 2025)</span></td><td>Independent QS review of costs, programme and security position</td></tr>" +
        "<tr><td>Terms comparison</td><td>Benchmarking of the senior facility against the wider market</td></tr>" +
        "<tr><td>Pricing comparables</td><td>Knight Frank / Savills / Butler Sherborn evidence supporting the GDV</td></tr>" +
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

describe("lender-brief worked example: Temple Guiting", () => {
  it("composes the expected depth (track record, restored principal, annotated docs)", () => {
    const html = buildLenderBriefHtml(tg);
    // 8-section depth set, incl. the CH-grounded track-record section
    expect(html).toContain("7. Track Record &amp; Group Funding");
    expect(html).toContain("8. Professional Team &amp; Enclosed Documentation");
    expect(html).toContain("17 active secured charges");
    // Robert Mackenzie is a confirmed principal — guards against re-dropping him
    expect(html).toContain("Robert Mackenzie");
    expect(html).toContain("personal guarantees from Peter and Robert Mackenzie");
  });

  it.skipIf(!canRunPdf)("renders the branded PDF to /tmp/tg-current.pdf for local inspection", async () => {
    const results = await renderDocument({
      layout: "lender-brief",
      briefData: tg,
      title: "Temple Guiting Lender Brief",
      formats: ["pdf"],
    });
    const pdf = results[0];
    expect(pdf.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    writeFileSync("/tmp/tg-current.pdf", pdf.buffer);
    // eslint-disable-next-line no-console
    console.log(`\n[lender-brief example] wrote /tmp/tg-current.pdf (${pdf.buffer.length} bytes)\n`);
  }, 120_000);
});
