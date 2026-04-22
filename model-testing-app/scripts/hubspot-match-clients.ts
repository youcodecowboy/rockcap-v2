/**
 * HubSpot Company → Client Matcher (Dry-Run)
 *
 * For each existing Convex client, scores a sample of HubSpot companies
 * and prints the top N candidates with their HubSpot IDs so you can
 * manually confirm the linking before running a real back-link pass.
 *
 * Read-only. No writes.
 *
 * Run (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/hubspot-match-clients.ts [maxHubSpotCompanies] [topN]
 *
 * Defaults: up to 1000 HubSpot companies, top 3 candidates per client.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// ---- CLI ----------------------------------------------------------------
const MAX_HS_COMPANIES = Math.max(100, parseInt(process.argv[2] ?? "1000", 10));
const TOP_N = Math.max(1, Math.min(10, parseInt(process.argv[3] ?? "3", 10)));

// ---- Env ----------------------------------------------------------------
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!HUBSPOT_API_KEY) {
  console.error("HUBSPOT_API_KEY not set.");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set.");
  process.exit(1);
}

// ---- Types --------------------------------------------------------------
type HSCompany = {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    website?: string;
    lifecyclestage?: string;
    hs_last_activity_date?: string;
  };
};

type ClientRow = {
  _id: string;
  name: string;
  companyName?: string;
  website?: string;
  email?: string;
  hubspotCompanyId?: string;
  status?: string;
};

// ---- Normalization -----------------------------------------------------
const LEGAL_SUFFIX_RE =
  /\b(ltd|limited|llc|l\.l\.c\.|inc|incorporated|corp|corporation|plc|gmbh|srl|pty|s\.a\.|sa|ag|co|company|holdings?|group|services|international|intl|partners?|associates?)\b/gi;

function normalizeName(s: string | undefined | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(LEGAL_SUFFIX_RE, "")
    .replace(/[.,&'"/\\()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDomain(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  try {
    if (s.includes("://")) return new URL(s).hostname.replace(/^www\./, "").toLowerCase();
    if (s.includes("@")) return s.split("@")[1]!.toLowerCase();
    return s.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function rootDomain(d: string | null): string | null {
  if (!d) return null;
  const parts = d.split(".");
  if (parts.length <= 2) return d;
  return parts.slice(-2).join(".");
}

// ---- Scoring -----------------------------------------------------------
// Returns 0 if no match at all, higher is better.
function scoreMatch(client: ClientRow, hs: HSCompany): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const clientName = normalizeName(client.name);
  const clientCompany = normalizeName(client.companyName);
  const hsName = normalizeName(hs.properties.name);

  // Rule 1: exact normalized name match against name or companyName
  if (hsName && (hsName === clientName || (clientCompany !== "" && hsName === clientCompany))) {
    score += 100;
    reasons.push("exact-name");
  }
  // Rule 2: one contains the other (substring). Lower confidence.
  else if (hsName && hsName.length >= 5) {
    const cand = [clientName, clientCompany].filter((x) => x.length >= 5);
    for (const c of cand) {
      if (c.includes(hsName) || hsName.includes(c)) {
        score += 50;
        reasons.push(`substring-${c.length < hsName.length ? "client-in-hs" : "hs-in-client"}`);
        break;
      }
    }
  }

  // Rule 3: root-domain match (website or email domain on client)
  const hsDomain = rootDomain(extractDomain(hs.properties.domain ?? hs.properties.website ?? null));
  if (hsDomain) {
    const clientWebsiteDomain = rootDomain(extractDomain(client.website));
    const clientEmailDomain = rootDomain(extractDomain(client.email));
    if (clientWebsiteDomain && clientWebsiteDomain === hsDomain) {
      score += 70;
      reasons.push("domain-website");
    } else if (clientEmailDomain && clientEmailDomain === hsDomain) {
      score += 40;
      reasons.push("domain-email");
    }
  }

  // Rule 4: first-word match (weak signal, used as tiebreaker)
  if (score === 0 && hsName && clientName) {
    const firstClientToken = clientName.split(" ")[0] ?? "";
    const firstHsToken = hsName.split(" ")[0] ?? "";
    if (firstClientToken.length >= 4 && firstClientToken === firstHsToken) {
      score += 20;
      reasons.push("first-token");
    }
  }

  return { score, reasons };
}

// ---- Fetchers ----------------------------------------------------------
async function fetchHSCompanyPage(limit: number, after?: string) {
  const params = new URLSearchParams({
    limit: String(limit),
    properties: "name,domain,website,lifecyclestage,hs_last_activity_date",
  });
  if (after) params.append("after", after);

  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/companies?${params}`, {
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`HubSpot companies fetch failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { results?: HSCompany[]; paging?: { next?: { after?: string } } };
  return { results: data.results ?? [], nextAfter: data.paging?.next?.after };
}

async function fetchAllHSCompanies(maxRecords: number): Promise<HSCompany[]> {
  const all: HSCompany[] = [];
  let after: string | undefined;
  let page = 0;
  while (all.length < maxRecords) {
    page++;
    const batchSize = Math.min(100, maxRecords - all.length);
    const { results, nextAfter } = await fetchHSCompanyPage(batchSize, after);
    all.push(...results);
    if (!nextAfter || results.length === 0) break;
    after = nextAfter;
    // Polite rate-limit delay
    await new Promise((r) => setTimeout(r, 100));
  }
  return all;
}

// ---- Rendering ----------------------------------------------------------
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ---- Main ---------------------------------------------------------------
async function main() {
  console.log(`\n======================================================================`);
  console.log(`  Client ← HubSpot Company Match  |  top ${TOP_N}  |  sample ${MAX_HS_COMPANIES}`);
  console.log(`======================================================================\n`);

  console.log(`Step 1 — Loading all clients from Convex...`);
  const convex = new ConvexHttpClient(CONVEX_URL!);
  const clients = (await convex.query(api.clients.list, {})) as unknown as ClientRow[];
  console.log(`  ✓ ${clients.length} non-deleted clients`);

  console.log(`\nStep 2 — Fetching up to ${MAX_HS_COMPANIES} HubSpot companies (paginated, 100/page)...`);
  const hsCompanies = await fetchAllHSCompanies(MAX_HS_COMPANIES);
  console.log(`  ✓ ${hsCompanies.length} HubSpot companies fetched`);
  const hitCap = hsCompanies.length >= MAX_HS_COMPANIES;
  if (hitCap) {
    console.log(`  ⚠ Hit the ${MAX_HS_COMPANIES}-record cap. HubSpot may have more.`);
  }

  console.log(`\nStep 3 — Scoring every client against every HubSpot company...`);
  console.log("─".repeat(120));

  let strongMatches = 0;
  let weakMatches = 0;
  let zeroMatches = 0;
  const suggestions: Array<{
    client: ClientRow;
    top: Array<{ hs: HSCompany; score: number; reasons: string[] }>;
  }> = [];

  for (const client of clients) {
    const scored = hsCompanies
      .map((hs) => ({ hs, ...scoreMatch(client, hs) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    suggestions.push({ client, top: scored });

    if (scored.length === 0) {
      zeroMatches++;
    } else if (scored[0]!.score >= 70) {
      strongMatches++;
    } else {
      weakMatches++;
    }
  }

  // Print: one row per client
  for (const { client, top } of suggestions) {
    const clientLabel = truncate(`${client.name}${client.companyName ? ` (${client.companyName})` : ""}`, 55);
    const statusLabel = client.status ?? "—";

    if (top.length === 0) {
      console.log(`\n• ${clientLabel.padEnd(55)}  [${statusLabel}]`);
      console.log(`    (no HubSpot company in sample scored above 0)`);
      continue;
    }

    console.log(`\n• ${clientLabel.padEnd(55)}  [${statusLabel}]`);
    for (const { hs, score, reasons } of top) {
      const confidence = score >= 100 ? "STRONG" : score >= 70 ? "GOOD  " : score >= 40 ? "WEAK  " : "LOW   ";
      const hsLabel = truncate(hs.properties.name ?? "(no name)", 40).padEnd(40);
      const domain = truncate(hs.properties.domain ?? hs.properties.website ?? "—", 30).padEnd(30);
      const reasonsLabel = reasons.join(",");
      console.log(
        `    [${confidence}] score=${String(score).padStart(3)}  ${hsLabel}  ${domain}  id=${hs.id.padEnd(12)}  (${reasonsLabel})`
      );
    }
  }

  console.log("\n" + "─".repeat(120));
  console.log(`\n======================================================================`);
  console.log(`  Summary`);
  console.log(`======================================================================\n`);
  console.log(`Clients total:                                 ${clients.length}`);
  console.log(`  └ with ≥1 STRONG match (score ≥ 70):         ${strongMatches}`);
  console.log(`  └ with only WEAK/LOW matches:                ${weakMatches}`);
  console.log(`  └ with NO match in sample:                   ${zeroMatches}`);
  if (hitCap) {
    console.log(`\nNote: Capped at ${MAX_HS_COMPANIES} HubSpot companies. Rerun with a larger cap if zero-match rate is high.`);
    console.log(`      e.g. npx tsx --env-file=.env.local scripts/hubspot-match-clients.ts 3000 3`);
  }
  console.log(``);
  console.log(`To back-link a client to a HubSpot company, you'd eventually run a mutation like:`);
  console.log(`  companies.promotedToClientId = <client._id>  (on the companies row with matching hubspotCompanyId)`);
  console.log(``);
}

main().catch((e) => {
  console.error("\n✗ Match script failed:", e);
  process.exit(1);
});
