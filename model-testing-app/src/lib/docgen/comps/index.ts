// src/lib/docgen/comps/index.ts
// Comps-appendix render engine. XLSX is the primary format (a real spreadsheet
// schedule); DOCX renders the same data as a stacked Word table via the shared
// html-to-docx path. PDF is intentionally unsupported — these are working
// schedules, not prose documents.
import type { RenderResult } from "../types";
import { renderHtmlToDocx } from "../renderDocx";
import { buildCompsXlsx } from "./buildCompsXlsx";
import { buildCompsHtml } from "./buildCompsHtml";
import { COMPS_MIME, type CompsAppendixData, type CompsFormat } from "./types";

export * from "./types";
export { buildCompsXlsx } from "./buildCompsXlsx";
export { buildCompsHtml } from "./buildCompsHtml";

const VALID: CompsFormat[] = ["xlsx", "docx"];

export async function renderCompsAppendix(
  data: CompsAppendixData,
  formats: CompsFormat[],
): Promise<RenderResult[]> {
  if (!data.sheets?.length) throw new Error("renderCompsAppendix: no sheets");
  const wanted = formats.filter((f) => VALID.includes(f));
  if (!wanted.length) throw new Error("renderCompsAppendix: no valid formats (xlsx|docx)");

  const results: RenderResult[] = [];
  for (const format of wanted) {
    if (format === "xlsx") {
      const buffer = await buildCompsXlsx(data);
      results.push({ format: "xlsx", buffer, mime: COMPS_MIME.xlsx, ext: "xlsx" });
    } else {
      const buffer = await renderHtmlToDocx(buildCompsHtml(data));
      results.push({ format: "docx", buffer, mime: COMPS_MIME.docx, ext: "docx" });
    }
  }
  return results;
}
