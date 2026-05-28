// Mirror of skills/shared-references/lender-tiers.md (the human source of truth).
// Add a lender to that markdown reference first, then mirror it here.

export const TIER1_LENDERS = ["Quantum Development Finance"]; // FULL PARK
export const TIER2_LENDERS = ["Yellow Tree"]; // SOFTEN

export type LenderTierConflict = {
  action: "park" | "soften" | "none";
  tier1: string[];
  tier2: string[];
};

function normalise(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesList(lender: string, list: string[]): string | null {
  const n = normalise(lender);
  if (!n) return null;
  for (const entry of list) {
    const e = normalise(entry);
    if (n === e || n.includes(e) || e.includes(n)) return entry;
  }
  return null;
}

export function classifyLenderTier(lenderNames: string[]): LenderTierConflict {
  const tier1 = new Set<string>();
  const tier2 = new Set<string>();
  for (const name of lenderNames) {
    const m1 = matchesList(name, TIER1_LENDERS);
    if (m1) tier1.add(m1);
    const m2 = matchesList(name, TIER2_LENDERS);
    if (m2) tier2.add(m2);
  }
  const action = tier1.size > 0 ? "park" : tier2.size > 0 ? "soften" : "none";
  return { action, tier1: [...tier1], tier2: [...tier2] };
}
