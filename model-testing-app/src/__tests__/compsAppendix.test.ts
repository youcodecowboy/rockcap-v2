// src/__tests__/compsAppendix.test.ts
// Worked examples for skills/shared-references/doc-type-comps-appendix.md.
// Two shapes, reproduced from the operator's real appendices:
//   • Leafield — a single tiered schedule (the common case)
//   • Horton   — a multi-tab pack with per-group auto-averages
// Asserts the XLSX structure by reading the workbook back with exceljs: tier
// bands, header rows, AUTO-COMPUTED £psf, and auto-average rows. Writes
// /tmp/*-comps.xlsx for local inspection.
import { writeFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildCompsXlsx, buildCompsHtml, renderCompsAppendix } from "../lib/docgen/comps";
import type { CompsAppendixData } from "../lib/docgen/comps";

const STD_COLUMNS = [
  { key: "scheme", label: "Scheme", type: "text" as const },
  { key: "unit", label: "Unit", type: "text" as const },
  { key: "date", label: "Date", type: "date" as const },
  { key: "price", label: "Price (£)", type: "price" as const, role: "price" as const },
  { key: "sqft", label: "SqFt", type: "number" as const, role: "sqft" as const },
  { key: "psf", label: "£/psf", type: "psf" as const, role: "psf" as const },
  { key: "type", label: "Type", type: "text" as const },
  { key: "notes", label: "Notes", type: "text" as const, width: 60 },
  { key: "evidence", label: "Evidence", type: "link" as const },
];

const leafield: CompsAppendixData = {
  title: "Leafield, Fairspear Road — Master Comparable Schedule",
  subtitle: "Castlethorpe Homes. Comparable evidence for lender credit pack.",
  preparedBy: "Prepared by RockCap Ltd | April 2026",
  sheets: [
    {
      name: "Appendix A",
      columns: STD_COLUMNS,
      tiers: [
        {
          heading:
            "TIER 3: Leafield Prime Character Resale (OX29 9) — period/character stock requiring updating; NB should trade above this band.",
          rows: [
            // £psf intentionally omitted → auto-computed (900000/1685 = 534)
            { cells: { scheme: "Leafield Prime Character Resale", unit: "Sperrings, Witney Lane", date: "Oct 2023", price: 900000, sqft: 1685, type: "4b D", notes: "Core Leafield near village green.", evidence: { text: "Sperrings, Witney Lane", url: "https://example.com/sperrings" } } },
            { cells: { scheme: "Leafield Prime Character Resale", unit: "Thatched Cottage", date: "Aug 2025", price: 550000, sqft: 947, type: "3b D", notes: "Compact period character.", evidence: { text: "Thatched Cottage" } } },
          ],
          average: { label: "Average (Tier 3)", auto: ["price", "sqft", "psf"] },
        },
      ],
    },
  ],
};

const horton: CompsAppendixData = {
  title: "Horton — Master Comparable Appendix",
  subtitle: "Land at Broadway Hill, Horton, Ilminster.",
  preparedBy: "Prepared by RockCap Ltd | May 2026 | Anchor comparables per house type",
  sheets: [
    {
      name: "New Build",
      intro: ["Killams Park, Taunton — achieved-sale tier", "Neroche Meadows — asking-led sentiment"],
      columns: [
        { key: "scheme", label: "Scheme", type: "text" as const },
        { key: "plot", label: "Plot", type: "text" as const },
        { key: "beds", label: "Beds", type: "number" as const },
        { key: "sqft", label: "SqFt", type: "number" as const, role: "sqft" as const },
        { key: "price", label: "Price (£)", type: "price" as const, role: "price" as const },
        { key: "psf", label: "£psf", type: "psf" as const, role: "psf" as const },
        { key: "status", label: "Status", type: "text" as const },
        { key: "notes", label: "Notes", type: "text" as const, width: 50 },
      ],
      tiers: [
        {
          heading: "2-Bed comparables (3 units)",
          rows: [
            { cells: { scheme: "Neroche Meadows", plot: "P15", beds: 2, sqft: 848, price: 285000, status: "Asking", notes: "Closest NB scheme." }, excludeFromAverage: false },
            { cells: { scheme: "Neroche Meadows", plot: "P17", beds: 2, sqft: 848, price: 290000, status: "Asking", notes: "Asking sentiment." } },
            { cells: { scheme: "Neroche Meadows", plot: "P18", beds: 2, sqft: 848, price: 290000, status: "Asking", notes: "Asking sentiment." } },
          ],
          average: { label: "Average (2-bed)", auto: ["sqft", "price", "psf"] },
        },
      ],
    },
    {
      name: "Second Hand",
      columns: STD_COLUMNS,
      tiers: [
        {
          rows: [
            { cells: { scheme: "Resale", unit: "2 Orchard Court", date: "Dec 2025", price: 650000, sqft: 2234, type: "5b Det", notes: "Larger than any subject unit." } },
          ],
        },
      ],
    },
  ],
};

async function readBack(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb;
}

describe("comps appendix — Leafield (single tiered schedule)", () => {
  it("builds a valid XLSX with title, tier band, header, and AUTO-COMPUTED £psf", async () => {
    const buf = await buildCompsXlsx(leafield);
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK"); // xlsx is a zip
    const wb = await readBack(buf);
    const ws = wb.getWorksheet("Appendix A")!;
    expect(ws).toBeTruthy();

    // Title in A1
    expect(String(ws.getCell("A1").value)).toContain("Leafield");

    // Find the tier band + header + first data row by scanning column A / values
    const flat: string[] = [];
    ws.eachRow((row) => flat.push(String(row.getCell(1).value ?? "")));
    expect(flat.some((v) => v.startsWith("TIER 3"))).toBe(true);

    // £psf auto-computed for Sperrings: 900000 / 1685 = 534 (rounded)
    let foundPsf = false;
    ws.eachRow((row) => {
      if (String(row.getCell(2).value ?? "").includes("Sperrings")) {
        expect(row.getCell(6).value).toBe(534); // psf column (6th)
        foundPsf = true;
      }
    });
    expect(foundPsf).toBe(true);
  });

  it("renders a link cell as a hyperlink", async () => {
    const wb = await readBack(await buildCompsXlsx(leafield));
    const ws = wb.getWorksheet("Appendix A")!;
    let linked = false;
    ws.eachRow((row) => {
      const cell = row.getCell(9); // evidence column
      if (cell.value && typeof cell.value === "object" && "hyperlink" in (cell.value as any)) linked = true;
    });
    expect(linked).toBe(true);
  });
});

describe("comps appendix — Horton (multi-tab + auto-average)", () => {
  it("produces one worksheet per sheet", async () => {
    const wb = await readBack(await buildCompsXlsx(horton));
    expect(wb.worksheets.map((w) => w.name)).toEqual(["New Build", "Second Hand"]);
  });

  it("computes the per-group average across non-excluded rows", async () => {
    const wb = await readBack(await buildCompsXlsx(horton));
    const ws = wb.getWorksheet("New Build")!;
    // avg price of 285000, 290000, 290000 = 288333 (rounded)
    let avgPrice: unknown;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "").startsWith("Average (2-bed)")) {
        avgPrice = row.getCell(5).value; // price column (5th in this sheet)
      }
    });
    expect(avgPrice).toBe(288333);
  });

  it("renderCompsAppendix yields xlsx + docx buffers on request", async () => {
    const results = await renderCompsAppendix(horton, ["xlsx", "docx"]);
    expect(results.map((r) => r.format).sort()).toEqual(["docx", "xlsx"]);
    expect(results.find((r) => r.format === "xlsx")!.buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    // write for local inspection
    const xlsx = results.find((r) => r.format === "xlsx")!;
    writeFileSync("/tmp/horton-comps.xlsx", xlsx.buffer);
    writeFileSync("/tmp/leafield-comps.xlsx", await buildCompsXlsx(leafield));
  });
});

describe("comps appendix — DOCX html", () => {
  it("emits a banded table with the title and tier heading", () => {
    const html = buildCompsHtml(leafield);
    expect(html).toContain("Leafield");
    expect(html).toContain('class="band"');
    expect(html).toContain("TIER 3");
    expect(html).toContain("£/psf");
  });
});
