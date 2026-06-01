// src/lib/docgen/comps/buildCompsHtml.ts
// Render a CompsAppendixData to a full HTML document for the DOCX path (via
// renderHtmlToDocx). Mirrors the XLSX house style with inline-ish CSS that
// html-to-docx honours: blue tier bands, blue header rows, £-formatted prices,
// wrapped notes. Each sheet becomes a stacked, headed table.
import { escapeHtml } from "../houseStyle";
import { computePsf, resolveAverageRow, isLink } from "./compsCompute";
import type { CompsAppendixData, CompsSheet, CompColumn, CompRow, CompCellValue } from "./types";

const COMPS_CSS = `
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #141414; font-size: 9pt; }
  h1.comps-title { color: #1F4E79; font-size: 16pt; margin: 0 0 2px; }
  p.comps-sub { font-size: 10pt; margin: 0 0 2px; }
  p.comps-prep { color: #999999; font-size: 8.5pt; margin: 0 0 10px; }
  h2.comps-sheet { color: #1F4E79; font-size: 12pt; margin: 14px 0 4px; }
  ul.comps-intro { font-size: 8.5pt; margin: 0 0 8px; padding-left: 16px; }
  table.comps { width: 100%; border-collapse: collapse; margin: 4px 0 12px; }
  table.comps th { background: #1F4E79; color: #ffffff; font-size: 8pt; text-align: center; padding: 4px 5px; border: 1px solid #e0e0e0; }
  table.comps th.l, table.comps td.l { text-align: left; }
  table.comps td { font-size: 8.5pt; padding: 4px 5px; border: 1px solid #e0e0e0; vertical-align: top; }
  table.comps td.num { text-align: center; }
  table.comps tr.band td { background: #2E5090; color: #ffffff; font-weight: bold; font-size: 8.5pt; }
  table.comps tr.summary td { background: #EAF0F8; font-weight: bold; }
  a { color: #1155CC; }
`;

function fmtPrice(n: number): string {
  return "£" + Math.round(n).toLocaleString("en-GB");
}

function cellHtml(col: CompColumn, value: CompCellValue): string {
  if (isLink(value)) {
    return value.url
      ? `<a href="${escapeHtml(value.url)}">${escapeHtml(value.text)}</a>`
      : escapeHtml(value.text);
  }
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (col.type === "price" || col.type === "psf") return fmtPrice(value);
    if (col.type === "number") return value.toLocaleString("en-GB");
    return String(value);
  }
  return escapeHtml(String(value));
}

function isNumericCol(col: CompColumn): boolean {
  return col.type === "price" || col.type === "psf" || col.type === "number";
}

function sheetHtml(sheet: CompsSheet, multi: boolean): string {
  const nCols = sheet.columns.length;
  let out = "";
  if (multi) out += `<h2 class="comps-sheet">${escapeHtml(sheet.name)}</h2>`;
  if (sheet.intro?.length) {
    out += `<ul class="comps-intro">${sheet.intro.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
  }
  out += `<table class="comps">`;
  const headerCells = sheet.columns
    .map((c, i) => `<th class="${i === 0 ? "l" : ""}">${escapeHtml(c.label)}</th>`)
    .join("");
  const dataRowHtml = (row: CompRow) => {
    const cls = row.isSummary ? ' class="summary"' : "";
    const tds = sheet.columns
      .map((col, i) => {
        const numeric = isNumericCol(col);
        const klass = [i === 0 ? "l" : "", numeric ? "num" : ""].filter(Boolean).join(" ");
        return `<td${klass ? ` class="${klass}"` : ""}>${cellHtml(col, row.cells[col.key] ?? null)}</td>`;
      })
      .join("");
    return `<tr${cls}>${tds}</tr>`;
  };

  for (const tier of sheet.tiers) {
    if (tier.heading) {
      out += `<tr class="band"><td colspan="${nCols}">${escapeHtml(tier.heading)}</td></tr>`;
    }
    out += `<tr>${headerCells}</tr>`;
    computePsf(sheet.columns, tier.rows);
    for (const row of tier.rows) out += dataRowHtml(row);
    const avg = resolveAverageRow(sheet.columns, tier);
    if (avg) out += dataRowHtml(avg);
  }
  out += `</table>`;
  return out;
}

export function buildCompsHtml(data: CompsAppendixData): string {
  const multi = data.sheets.length > 1;
  const body =
    `<h1 class="comps-title">${escapeHtml(data.title)}</h1>` +
    (data.subtitle ? `<p class="comps-sub">${escapeHtml(data.subtitle)}</p>` : "") +
    (data.preparedBy ? `<p class="comps-prep">${escapeHtml(data.preparedBy)}</p>` : "") +
    data.sheets.map((s) => sheetHtml(s, multi)).join("");
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(data.title)}</title><style>${COMPS_CSS}</style></head>` +
    `<body>${body}</body></html>`
  );
}
