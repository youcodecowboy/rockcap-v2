// src/lib/docgen/index.ts
// The render engine entry point. Dispatches on layout: "house" wraps a content
// body (v1); "lender-brief" assembles a branded doc from structured briefData
// and adds the PDF header/footer band. One HTML intermediate, many output formats.
import { wrapInHouseStyle } from "./houseStyle";
import {
  buildLenderBriefHtml,
  buildLenderBriefHeaderTemplate,
  buildLenderBriefFooterTemplate,
  buildLenderBriefDocxHeaderHtml,
  buildLenderBriefDocxFooterHtml,
} from "./layouts/lenderBrief";
import { renderHtmlToPdf, type PdfOptions } from "./renderPdf";
import { renderHtmlToDocx, type DocxOptions } from "./renderDocx";
import { MIME, type DocFormat, type RenderResult, type RenderSpec } from "./types";

export * from "./types";
export { wrapInHouseStyle, escapeHtml, HOUSE_STYLE_CSS } from "./houseStyle";
export { buildLenderBriefHtml } from "./layouts/lenderBrief";

async function renderOne(
  format: DocFormat,
  fullHtml: string,
  pdfOpts?: PdfOptions,
  docxOpts?: DocxOptions,
): Promise<RenderResult> {
  if (format === "pdf") {
    return { format, buffer: await renderHtmlToPdf(fullHtml, pdfOpts), mime: MIME.pdf, ext: "pdf" };
  }
  return { format, buffer: await renderHtmlToDocx(fullHtml, docxOpts), mime: MIME.docx, ext: "docx" };
}

export async function renderDocument(spec: RenderSpec): Promise<RenderResult[]> {
  if (!spec.formats?.length) throw new Error("renderDocument: no formats requested");

  let fullHtml: string;
  let pdfOpts: PdfOptions | undefined;
  let docxOpts: DocxOptions | undefined;

  if (spec.layout === "lender-brief") {
    if (!spec.briefData?.sections?.length) throw new Error("renderDocument: lender-brief has no sections");
    fullHtml = buildLenderBriefHtml(spec.briefData);
    pdfOpts = {
      headerTemplate: buildLenderBriefHeaderTemplate(),
      footerTemplate: buildLenderBriefFooterTemplate(),
      marginTopMm: 24,
      marginBottomMm: 24,
    };
    docxOpts = {
      headerHtml: buildLenderBriefDocxHeaderHtml(),
      footerHtml: buildLenderBriefDocxFooterHtml(),
    };
  } else {
    if (!spec.contentHtml?.trim()) throw new Error("renderDocument: contentHtml is empty");
    fullHtml = wrapInHouseStyle(spec.contentHtml, { title: spec.title });
  }

  const results: RenderResult[] = [];
  for (const format of spec.formats) {
    results.push(await renderOne(format, fullHtml, pdfOpts, docxOpts));
  }
  return results;
}
