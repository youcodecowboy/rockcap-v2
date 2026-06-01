// src/lib/docgen/comps/buildCompsXlsx.ts
// Render a CompsAppendixData to a styled XLSX (one worksheet per sheet) via exceljs.
// House style learned from the operator's real appendices:
//   • title  : bold 14pt, RockCap blue (#1F4E79)
//   • prepared-by line : 9pt grey (#999999)
//   • tier band : full-width merged row, fill #2E5090, white bold
//   • column header row : fill #1F4E79, white bold, centred, wrapped
//   • price / £psf columns : "£"#,##0 ; notes column wrapped
//   • evidence links : hyperlink cells
//   • £psf auto-computed (price ÷ sqft) when left blank and roles are set
import ExcelJS from "exceljs";
import type {
  CompsAppendixData,
  CompsSheet,
  CompColumn,
  CompRow,
  CompCellValue,
} from "./types";
import { computePsf, resolveAverageRow, isLink } from "./compsCompute";

const BLUE = "FF1F4E79"; // header + title
const BAND = "FF2E5090"; // tier band
const GREY = "FF999999"; // prepared-by line
const SUMMARY_FILL = "FFEAF0F8"; // light blue for average/summary rows
const WHITE = "FFFFFFFF";
const BORDER = "FFE0E0E0";
const LINK = "FF1155CC";

const PRICE_FMT = '"£"#,##0';
const PSF_FMT = '"£"#,##0';
const NUM_FMT = "#,##0";

const thinBorder = {
  bottom: { style: "thin" as const, color: { argb: BORDER } },
};

function defaultWidth(col: CompColumn): number {
  if (col.width) return col.width;
  switch (col.type) {
    case "price":
    case "psf":
      return 13;
    case "number":
      return 9;
    case "date":
      return 12;
    case "link":
      return 26;
    default:
      // Notes-ish wide columns vs normal text
      return col.key.toLowerCase().includes("note") ? 60 : col.label.length > 16 ? 22 : 16;
  }
}

function styleDataCell(cell: ExcelJS.Cell, col: CompColumn, value: CompCellValue, summary: boolean): void {
  cell.border = thinBorder;
  cell.font = { size: 10, bold: summary };
  if (summary) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUMMARY_FILL } };
  const wrap = col.type === "text" && (col.key.toLowerCase().includes("note") || (col.width ?? 0) >= 40);
  cell.alignment = {
    vertical: "top",
    horizontal: col.align ?? (col.type === "price" || col.type === "psf" || col.type === "number" ? "center" : "left"),
    wrapText: wrap,
  };
  if (isLink(value)) {
    if (value.url) {
      cell.value = { text: value.text, hyperlink: value.url };
      cell.font = { size: 10, color: { argb: LINK }, underline: true };
    } else {
      cell.value = value.text;
    }
    return;
  }
  cell.value = value ?? null;
  if (col.type === "price") cell.numFmt = PRICE_FMT;
  else if (col.type === "psf") cell.numFmt = PSF_FMT;
  else if (col.type === "number") cell.numFmt = NUM_FMT;
}

function renderSheet(ws: ExcelJS.Worksheet, sheet: CompsSheet, data: CompsAppendixData): void {
  const nCols = sheet.columns.length;
  const lastColLetter = ws.getColumn(nCols).letter;
  let r = 1;

  const bandRow = (text: string, opts: { fill?: string; bold?: boolean; size?: number; color?: string }) => {
    ws.mergeCells(`A${r}:${lastColLetter}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = text;
    c.font = { bold: opts.bold ?? false, size: opts.size ?? 11, color: opts.color ? { argb: opts.color } : undefined };
    if (opts.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    r++;
  };

  // Title block
  bandRow(data.title, { bold: true, size: 14, color: BLUE });
  if (data.subtitle) bandRow(data.subtitle, { size: 10 });
  if (data.preparedBy) bandRow(data.preparedBy, { size: 9, color: GREY });
  r++; // spacer

  // Optional framing bullets
  if (sheet.intro?.length) {
    for (const line of sheet.intro) bandRow(`•  ${line}`, { size: 9 });
    r++;
  }

  const writeHeaderRow = () => {
    sheet.columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = col.label;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
      cell.font = { bold: true, size: 11, color: { argb: WHITE } };
      cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
      cell.border = thinBorder;
    });
    r++;
  };

  const writeDataRow = (row: CompRow) => {
    sheet.columns.forEach((col, i) => {
      styleDataCell(ws.getCell(r, i + 1), col, row.cells[col.key] ?? null, !!row.isSummary);
    });
    r++;
  };

  for (const tier of sheet.tiers) {
    if (tier.heading) bandRow(tier.heading, { fill: BAND, bold: true, size: 11, color: WHITE });
    writeHeaderRow();
    computePsf(sheet.columns, tier.rows);
    for (const row of tier.rows) writeDataRow(row);
    const avgRow = resolveAverageRow(sheet.columns, tier);
    if (avgRow) writeDataRow(avgRow);
    r++; // spacer between tiers
  }

  // Column widths
  sheet.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = defaultWidth(col);
  });
}

export async function buildCompsXlsx(data: CompsAppendixData): Promise<Buffer> {
  if (!data.sheets?.length) throw new Error("buildCompsXlsx: no sheets");
  const wb = new ExcelJS.Workbook();
  wb.creator = "RockCap";
  for (const sheet of data.sheets) {
    // Excel tab names: max 31 chars, no : \ / ? * [ ]
    const safeName = (sheet.name || "Comps").replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
    const ws = wb.addWorksheet(safeName);
    renderSheet(ws, sheet, data);
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
