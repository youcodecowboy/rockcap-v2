// src/lib/docgen/types.ts
// Shared types for the document render engine (P1 + lender-brief layout LB1).

export type DocFormat = "pdf" | "docx";
export type DocLayout = "house" | "lender-brief";

export interface RenderResult {
  format: DocFormat;
  buffer: Buffer;
  mime: string; // MIME type for storage + HTTP
  ext: string;  // file extension without the dot, e.g. "pdf"
}

export const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// ── Lender-brief structured data ─────────────────────────────
export interface KeyFact {
  label: string;
  value: string;
}
export interface BriefSection {
  n: number;
  title: string;
  /** Composed semantic HTML (prose + tables). Injected RAW — the composer is
   *  trusted to emit clean HTML; only shell fields are escaped. */
  bodyHtml: string;
}
export interface LenderBriefData {
  variant: "senior-dev" | "dev-exit" | "jv";
  confidentiality: "INTERNAL" | "EXTERNAL";
  title: { location: string; descriptor: string };
  meta: { borrower: string; preparedBy: string; date: string };
  keyFacts: KeyFact[];
  sections: BriefSection[];
  signOff: { name: string; role: string; email: string; phone: string };
}

// ── Render spec (discriminated union by layout) ──────────────
interface RenderSpecBase {
  /** Human title; used in <title> and as the default file-name stem. */
  title: string;
  formats: DocFormat[];
}
export interface HouseRenderSpec extends RenderSpecBase {
  layout?: "house";
  /** Semantic HTML body (no <html>/<head>/<style> — the house wrapper adds those). */
  contentHtml: string;
}
export interface LenderBriefRenderSpec extends RenderSpecBase {
  layout: "lender-brief";
  briefData: LenderBriefData;
}
export type RenderSpec = HouseRenderSpec | LenderBriefRenderSpec;
