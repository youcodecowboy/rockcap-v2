// Pure helpers for grouping Companies House charges into schemes.
// MUST NOT import anything from convex/_generated or "convex/server" so it
// stays unit-testable under vitest (this repo has no convex-test).

export type GroupCharge = {
  companyNumber: string;
  companyName: string;
  companyStatus?: string;
  chargeId: string;
  lender: string;
  date?: string;
  status?: string;
  description?: string;
};

export function distinctLenders(charges: GroupCharge[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of charges) {
    const name = (c.lender ?? "").trim();
    if (!name || name === "(unnamed)" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function classifySchemeStatus(
  companyStatus: string | undefined,
  charges: GroupCharge[],
): "live" | "past" {
  if ((companyStatus ?? "").toLowerCase() === "dissolved") return "past";
  const anyOutstanding = charges.some((c) => (c.status ?? "").toLowerCase() === "outstanding");
  return anyOutstanding ? "live" : "past";
}

const ADDRESS_PREFIXES = [
  /^part of the freehold property to be known as\s+/i,
  /^the freehold property being part of\s+/i,
  /^the freehold (?:land|property)(?: being| known as)?\s+/i,
  /^property (?:known as|description:?\.?)\s*/i,
  /^\(1\)\s*(?:the freehold property (?:known as |being ))?/i,
];

export function parseCandidateAddress(description: string | undefined): string | undefined {
  const raw = (description ?? "").trim();
  if (!raw || /^none$/i.test(raw)) return undefined;
  let s = raw;
  for (const re of ADDRESS_PREFIXES) s = s.replace(re, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length < 4) return undefined;
  return s;
}

export function rankByRecency<T extends { lastChargeDate?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.lastChargeDate ?? "").localeCompare(a.lastChargeDate ?? ""));
}
