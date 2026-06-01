// src/lib/docgen/comps/types.ts
// Structured data for a RockCap "Appendix A — Master Comparable Schedule" (comps):
// the comparable-evidence table attached to a lender credit pack / client brief to
// justify a scheme's GDV pricing. Output is a spreadsheet (XLSX, primary) or a Word
// table (DOCX). The shape covers every observed variant:
//   • a single tiered schedule (Leafield, Dark Mills, Master Houses, Temple Dinsley)
//   • a multi-tab pack with analytical columns + per-group averages (Horton: Hero /
//     Second Hand / New Build, grouped by bed with Average rows).
// One CompsAppendixData → one workbook (one sheet per CompsSheet) or one Word doc
// (sheets become stacked tables).

export type CompsFormat = "xlsx" | "docx";

export const COMPS_MIME: Record<CompsFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** How a column is formatted + (for psf) computed. */
export type CompColType = "text" | "price" | "psf" | "number" | "date" | "link";

/** Semantic role used for the £psf auto-compute (psf = price ÷ sqft when psf empty). */
export type CompColRole = "price" | "sqft" | "psf";

export interface CompColumn {
  /** Maps to CompRow.cells[key]. */
  key: string;
  /** Header label, e.g. "£/psf". */
  label: string;
  /** Column width in Excel character units (sensible defaults applied if omitted). */
  width?: number;
  type?: CompColType;
  /** Set on the price / sqft / psf columns to enable £psf auto-compute. */
  role?: CompColRole;
  align?: "left" | "center" | "right";
}

/** A link cell value: { text, url }. Plain cells are string | number | null. */
export interface LinkValue {
  text: string;
  url?: string;
}
export type CompCellValue = string | number | null | LinkValue;

export interface CompRow {
  /** Values keyed by column key. A "link"-type column takes a LinkValue. */
  cells: Record<string, CompCellValue>;
  /** Asking/marketing evidence — excluded from any computed tier average. */
  excludeFromAverage?: boolean;
  /** Render as an emphasised summary row (e.g. "Average (3-bed)"). */
  isSummary?: boolean;
}

export interface CompTier {
  /** Full-width banded section header, e.g. "TIER 1: WALL HALL (WD25) …". Omit for a flat, ungrouped sheet. */
  heading?: string;
  rows: CompRow[];
  /**
   * Optional per-tier average row. If `auto` is set, the builder computes the mean of
   * the named columns across non-excluded rows; otherwise supply explicit `row`.
   */
  average?: { label?: string; auto?: string[]; row?: CompRow };
}

export interface CompsSheet {
  /** Tab name (XLSX) / table heading (DOCX), e.g. "Hero Comps". */
  name: string;
  /** Optional framing bullets rendered above the table (Horton "SCHEME FRAMING"). */
  intro?: string[];
  columns: CompColumn[];
  tiers: CompTier[];
}

export interface CompsAppendixData {
  /** e.g. "Horton — Master Comparable Appendix". */
  title: string;
  /** e.g. the scheme address + "Comparable evidence for lender credit pack". */
  subtitle?: string;
  /** e.g. "Prepared by RockCap Ltd | May 2026 | Anchor comparables …". */
  preparedBy?: string;
  sheets: CompsSheet[];
}
