// src/lib/docgen/comps/compsCompute.ts
// Pure, format-agnostic comps helpers shared by the XLSX and DOCX builders:
// £psf auto-compute (price ÷ sqft) and per-tier average rows. Kept free of
// exceljs / html so both renderers — and unit tests — use identical maths.
import type { CompColumn, CompRow, CompCellValue, LinkValue, CompTier } from "./types";

export function isLink(v: CompCellValue): v is LinkValue {
  return !!v && typeof v === "object" && "text" in v;
}

export function asNumber(v: CompCellValue): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function colByRole(columns: CompColumn[], role: string): CompColumn | undefined {
  return columns.find((c) => c.role === role);
}

/** Fill in £psf (price ÷ sqft, rounded) where the psf cell is empty and roles are set. Mutates rows. */
export function computePsf(columns: CompColumn[], rows: CompRow[]): void {
  const priceCol = colByRole(columns, "price");
  const sqftCol = colByRole(columns, "sqft");
  const psfCol = colByRole(columns, "psf");
  if (!priceCol || !sqftCol || !psfCol) return;
  for (const r of rows) {
    const existing = r.cells[psfCol.key];
    if (existing !== undefined && existing !== null && existing !== "") continue;
    const price = asNumber(r.cells[priceCol.key]);
    const sqft = asNumber(r.cells[sqftCol.key]);
    if (price !== null && sqft && sqft > 0) r.cells[psfCol.key] = Math.round(price / sqft);
  }
}

/** Build an auto-average row over the named columns across non-excluded rows. */
export function buildAutoAverage(
  columns: CompColumn[],
  rows: CompRow[],
  avgKeys: string[],
  label?: string,
): CompRow {
  const cells: Record<string, CompCellValue> = {};
  const firstCol = columns[0]?.key;
  if (firstCol) cells[firstCol] = label ?? "Average";
  for (const key of avgKeys) {
    const nums = rows
      .filter((r) => !r.excludeFromAverage)
      .map((r) => asNumber(r.cells[key]))
      .filter((n): n is number => n !== null);
    if (nums.length) cells[key] = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  }
  return { cells, isSummary: true };
}

/** Resolve a tier's optional average spec into a concrete summary row (or null). */
export function resolveAverageRow(columns: CompColumn[], tier: CompTier): CompRow | null {
  if (!tier.average) return null;
  if (tier.average.auto) return buildAutoAverage(columns, tier.rows, tier.average.auto, tier.average.label);
  return tier.average.row ? { ...tier.average.row, isSummary: true } : null;
}
