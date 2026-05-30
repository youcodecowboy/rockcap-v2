// src/lib/docgen/renderDocx.ts
// HTML -> DOCX via html-to-docx (pure JS, runs anywhere Node runs).
// The default export is an async function returning a Buffer/ArrayBuffer/Blob
// depending on environment; normalise to Buffer.
// The lender-brief in-body masthead (.brief-header) renders in the DOCX body,
// so no separate DOCX header is needed.
// @ts-expect-error no types shipped
import HTMLtoDOCX from "html-to-docx";

export async function renderHtmlToDocx(html: string): Promise<Buffer> {
  const out: unknown = await HTMLtoDOCX(html, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    header: false,
  });
  if (Buffer.isBuffer(out)) return out;
  if (out instanceof ArrayBuffer) return Buffer.from(out);
  // Blob (web) fallback.
  if (typeof (out as Blob)?.arrayBuffer === "function") {
    return Buffer.from(await (out as Blob).arrayBuffer());
  }
  throw new Error("renderHtmlToDocx: unexpected output type from html-to-docx");
}
