/**
 * Pure, runtime-free helpers for the Deal Book / case-study index.
 * No Convex imports — safe to import from both convex/ functions and vitest.
 * Keep DEAL_SECTORS in sync with shared-references/deal-sectors.md.
 */

export const DEAL_SECTORS = [
  "residential",
  "btr_rental",
  "student_pbsa",
  "co_living",
  "mixed_use",
  "commercial",
  "industrial_logistics",
  "hotel_leisure",
] as const;
export type DealSector = (typeof DEAL_SECTORS)[number];

export const SECTOR_LABELS: Record<DealSector, string> = {
  residential: "residential",
  btr_rental: "BTR/rental",
  student_pbsa: "student",
  co_living: "co-living",
  mixed_use: "mixed-use",
  commercial: "commercial",
  industrial_logistics: "industrial/logistics",
  hotel_leisure: "hotel/leisure",
};

const SECTOR_KEYWORDS: Record<DealSector, string[]> = {
  btr_rental: ["btr", "build to rent", "build-to-rent", "rental", "prs", "multifamily"],
  student_pbsa: ["student", "pbsa", "purpose built student", "halls"],
  co_living: ["co-living", "coliving", "co living"],
  mixed_use: ["mixed use", "mixed-use"],
  industrial_logistics: ["industrial", "logistics", "warehouse", "distribution"],
  hotel_leisure: ["hotel", "leisure", "hospitality", "aparthotel"],
  commercial: ["office", "commercial", "retail"],
  residential: ["residential", "houses", "housing", "apartments", "flats", "homes", "for sale"],
};
// Match order: most-specific sectors first, generic residential/commercial last.
const SECTOR_MATCH_ORDER: DealSector[] = [
  "btr_rental",
  "student_pbsa",
  "co_living",
  "mixed_use",
  "industrial_logistics",
  "hotel_leisure",
  "commercial",
  "residential",
];

/** Coarse loan-size band from an actual loanAmount (GBP). */
export function sizeBandFromLoanAmount(loanAmount: number | undefined | null): string {
  if (loanAmount == null || loanAmount <= 0) return "undisclosed";
  const m = loanAmount / 1_000_000;
  if (m < 5) return "sub-£5m";
  if (m < 10) return "£5–10m";
  if (m < 25) return "£10–25m";
  if (m < 50) return "£25–50m";
  if (m < 100) return "£50–100m";
  return "£100m+";
}

/** Best-effort sector inference from free text. Draft only — operator confirms. */
export function inferSector(text: string | undefined | null): DealSector | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const sector of SECTOR_MATCH_ORDER) {
    if (SECTOR_KEYWORDS[sector].some((kw) => t.includes(kw))) return sector;
  }
  return null;
}

/** Anonymised rung-9 headline. NEVER includes a borrower / prospect-side name. */
export function buildAnonymisedHeadline(opts: {
  sector: DealSector;
  region?: string | null;
  sizeBand?: string | null;
}): string {
  const label = SECTOR_LABELS[opts.sector] ?? String(opts.sector);
  const region = opts.region?.trim();
  if (region) {
    return `we've arranged funding on a couple of ${label} schemes in the ${region}`;
  }
  return `we've done a couple of similar ${label} schemes`;
}

export type DealBucket = "open" | "closed" | "lost";

/** Map a project's status to a Deal Book bucket (null = excluded). */
export function bucketProjectStatus(status: string | undefined | null): DealBucket | null {
  switch (status) {
    case "active":
    case "on-hold":
      return "open";
    case "completed":
      return "closed";
    case "cancelled":
      return "lost";
    default:
      return null;
  }
}

export interface DealBookProjectLike {
  status?: string | null;
  loanAmount?: number | null;
  endDate?: string | null;
}
export interface PortfolioStats {
  open: { count: number; value: number };
  closed: { count: number; value: number };
  lost: { count: number };
  closedByWindow: { d30: number; d90: number; d180: number; d365: number };
}

/** Portfolio aggregates over a set of projects. `nowIso` injected for determinism. */
export function computePortfolioStats(
  projects: DealBookProjectLike[],
  nowIso: string,
): PortfolioStats {
  const now = new Date(nowIso).getTime();
  const day = 24 * 60 * 60 * 1000;
  const s: PortfolioStats = {
    open: { count: 0, value: 0 },
    closed: { count: 0, value: 0 },
    lost: { count: 0 },
    closedByWindow: { d30: 0, d90: 0, d180: 0, d365: 0 },
  };
  for (const p of projects) {
    const bucket = bucketProjectStatus(p.status);
    const amount = p.loanAmount ?? 0;
    if (bucket === "open") {
      s.open.count++;
      s.open.value += amount;
    } else if (bucket === "closed") {
      s.closed.count++;
      s.closed.value += amount;
      if (p.endDate) {
        const ageDays = (now - new Date(p.endDate).getTime()) / day;
        if (ageDays <= 30) s.closedByWindow.d30++;
        if (ageDays <= 90) s.closedByWindow.d90++;
        if (ageDays <= 180) s.closedByWindow.d180++;
        if (ageDays <= 365) s.closedByWindow.d365++;
      }
    } else if (bucket === "lost") {
      s.lost.count++;
    }
  }
  return s;
}
