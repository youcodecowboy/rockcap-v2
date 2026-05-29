// src/lib/docgen/types.ts
// Shared types for the document render engine (P1).

export type DocFormat = "pdf" | "docx";

export interface RenderSpec {
  /** Semantic HTML for the document body (NO <html>/<head>/<style> — the
   *  house-style wrapper adds those). */
  contentHtml: string;
  /** Human title; used in <title> and as the default file name stem. */
  title: string;
  /** Which formats to produce. Defaults to ["pdf"] when omitted by a caller. */
  formats: DocFormat[];
}

export interface RenderResult {
  format: DocFormat;
  buffer: Buffer;
  /** MIME type for storage + HTTP. */
  mime: string;
  /** File extension without the dot, e.g. "pdf". */
  ext: string;
}

export const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
