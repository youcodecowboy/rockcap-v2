// src/lib/docgen/renderDocx.ts
// HTML -> DOCX via html-to-docx (pure JS, runs anywhere Node runs).
// The default export is an async function returning a Buffer/ArrayBuffer/Blob
// depending on environment; normalise to Buffer.
// @ts-expect-error no types shipped
import HTMLtoDOCX from "html-to-docx";

export interface DocxOptions {
  /** Optional header HTML string. html-to-docx signature:
   *  HTMLtoDOCX(html, headerHtml, documentOptions, footerHtml) */
  headerHtml?: string;
  /** Optional footer HTML string. */
  footerHtml?: string;
}

export async function renderHtmlToDocx(html: string, opts?: DocxOptions): Promise<Buffer> {
  const hasHeader = !!opts?.headerHtml;
  const hasFooter = !!opts?.footerHtml;
  let out: unknown;
  try {
    out = await HTMLtoDOCX(
      html,
      opts?.headerHtml ?? null,
      {
        table: { row: { cantSplit: true } },
        header: hasHeader,
        footer: hasFooter,
        pageNumber: hasFooter,
      },
      opts?.footerHtml ?? null,
    );
  } catch {
    // If html-to-docx header/footer args misbehave, fall back to no header/footer.
    out = await HTMLtoDOCX(html, undefined, {
      table: { row: { cantSplit: true } },
      footer: false,
      header: false,
    });
  }
  if (Buffer.isBuffer(out)) return out;
  if (out instanceof ArrayBuffer) return Buffer.from(out);
  // Blob (web) fallback.
  if (typeof (out as Blob)?.arrayBuffer === "function") {
    return Buffer.from(await (out as Blob).arrayBuffer());
  }
  throw new Error("renderHtmlToDocx: unexpected output type from html-to-docx");
}
