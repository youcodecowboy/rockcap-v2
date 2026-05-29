// src/lib/docgen/index.ts
// The render engine entry point: wrap a body in house style, then run each
// requested format's renderer. One HTML intermediate, many output formats.
import { wrapInHouseStyle } from "./houseStyle";
import { renderHtmlToPdf } from "./renderPdf";
import { renderHtmlToDocx } from "./renderDocx";
import { MIME, type DocFormat, type RenderResult, type RenderSpec } from "./types";

export * from "./types";
export { wrapInHouseStyle, escapeHtml, HOUSE_STYLE_CSS } from "./houseStyle";

async function renderOne(format: DocFormat, fullHtml: string): Promise<RenderResult> {
  if (format === "pdf") {
    return { format, buffer: await renderHtmlToPdf(fullHtml), mime: MIME.pdf, ext: "pdf" };
  }
  return { format, buffer: await renderHtmlToDocx(fullHtml), mime: MIME.docx, ext: "docx" };
}

export async function renderDocument(spec: RenderSpec): Promise<RenderResult[]> {
  if (!spec.contentHtml?.trim()) throw new Error("renderDocument: contentHtml is empty");
  if (!spec.formats?.length) throw new Error("renderDocument: no formats requested");
  const fullHtml = wrapInHouseStyle(spec.contentHtml, { title: spec.title });
  const results: RenderResult[] = [];
  for (const format of spec.formats) {
    results.push(await renderOne(format, fullHtml));
  }
  return results;
}
