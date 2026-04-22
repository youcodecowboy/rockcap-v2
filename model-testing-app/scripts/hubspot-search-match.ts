/**
 * HubSpot Search-Based Client Matcher (Dry-Run)
 *
 * For each Convex client, runs a targeted query against HubSpot's search API
 * (instead of bulk scanning all companies). Much more accurate at scale, and
 * also previews the rich data (last deal amount, last activity, lifecycle
 * stage, total revenue, num deals) that would populate client profiles once
 * linking is complete.
 *
 * Read-only. No writes.
 *
 * Run (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/hubspot-search-match.ts [topN] [limit]
 *
 * Defaults: topN=3 candidates per client, limit=10 HubSpot results per query.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// ---- CLI ----------------------------------------------------------------
const TOP_N = Math.max(1, Math.min(10, parseInt(process.argv[2] ?? "3", 10)));
const SEARCH_LIMIT = Math.max(1, Math.min(100, parseInt(process.argv[3] ?? "10", 10)));

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
    hs_lead_status?: string;
    hs_last_activity_date?: string;
    hs_last_contacted_date?: string;
    recent_deal_amount?: string;
    recent_deal_close_date?: string;
    total_revenue?: string;
    num_associated_deals?: string;
    num_associated_contacts?: string;
    createdate?: string;
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

// ---- Normalization ------------------------------------------------------
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

// ---- Scoring ------------------------------------------------------------
function scoreMatch(client: ClientRow, hs: HSCompany): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const clientName = normalizeName(client.name);
  const clientCompany = normalizeName(client.companyName);
  const hsName = normalizeName(hs.properties.name);

  if (hsName && (hsName === clientName || (clientCompany !== "" && hsName === clientCompany))) {
    score += 100;
    reasons.push("exact-name");
  } else if (hsName && hsName.length >= 4) {
    const cand = [clientName, clientCompany].filter((x) => x.length >= 4);
    for (const c of cand) {
      if (c.includes(hsName) || hsName.includes(c)) {
        score += 50;
        reasons.push(`substring-${c.length < hsName.length ? "client-in-hs" : "hs-in-client"}`);
        break;
      }
    }
  }

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

  return { score, reasons };
}

// ---- HubSpot search ----------------------------------------------------
const RICH_PROPERTIES = [
  "name",
  "domain",
  "website",
  "lifecyclestage",
  "hs_lead_status",
  "hs_last_activity_date",
  "hs_last_contacted_date",
  "recent_deal_amount",
  "recent_deal_close_date",
  "total_revenue",
  "num_associated_deals",
  "num_associated_contacts",
  "createdate",
];

async function searchHubSpotCompanies(query: string, limit: number): Promise<HSCompany[]> {
  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/companies/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      properties: RICH_PROPERTIES,
      limit,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot search failed for "${query}": ${res.status} ${text}`);
  }
  const data = (await res.json()) as { results?: HSCompany[] };
  return data.results ?? [];
}

// ---- Rendering ----------------------------------------------------------
function fmtMoney(amount: string | undefined): string {
  if (!amount) return "—";
  const n = parseFloat(amount);
  if (!isFinite(n) || n === 0) return "—";
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `£${(n / 1000).toFixed(0)}K`;
  return `£${n.toFixed(0)}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function renderRichLine(hs: HSCompany): string {
  const parts = [
    `lifecycle=${hs.properties.lifecyclestage ?? "—"}`,
    `deals=${hs.properties.num_associated_deals ?? "0"}`,
    `recentDeal=${fmtMoney(hs.properties.recent_deal_amount)}`,
    `totalRev=${fmtMoney(hs.properties.total_revenue)}`,
    `lastActivity=${fmtDate(hs.properties.hs_last_activity_date)}`,
    `lastContact=${fmtDate(hs.properties.hs_last_contacted_date)}`,
  ];
  return parts.join(" · ");
}

// ---- Main ---------------------------------------------------------------
async function main() {
  console.log(`\n======================================================================`);
  console.log(`  HubSpot Search-Based Client Matcher  |  topN=${TOP_N}  |  searchLimit=${SEARCH_LIMIT}`);
  console.log(`======================================================================\n`);

  console.log(`Step 1 — Loading all clients from Convex...`);
  const convex = new ConvexHttpClient(CONVEX_URL!);
  const clients = (await convex.query(api.clients.list, {})) as unknown as ClientRow[];
  console.log(`  ✓ ${clients.length} non-deleted clients`);

  console.log(`\nStep 2 — Searching HubSpot for each client (1 API call per client)...\n`);
  console.log("─".repeat(120));

  let strong = 0;
  let weak = 0;
  let none = 0;
  const rows: Array<{ client: ClientRow; top: Array<{ hs: HSCompany; score: number; reasons: string[] }> }> = [];

  for (const client of clients) {
    // Use normalized name as the search query (strips "Ltd"/"Group"/etc.)
    const query = normalizeName(client.name);
    if (!query) {
      console.log(`\n• ${client.name}  [${client.status ?? "—"}]`);
      console.log(`    (client name empty after normalization — skipped)`);
      none++;
      rows.push({ client, top: [] });
      continue;
    }

    let results: HSCompany[] = [];
    try {
      results = await searchHubSpotCompanies(query, SEARCH_LIMIT);
    } catch (e) {
      console.log(`\n• ${client.name}  [${client.status ?? "—"}]`);
      console.log(`    ✗ Search failed: ${(e as Error).message}`);
      none++;
      rows.push({ client, top: [] });
      continue;
    }

    const scored = results
      .map((hs) => ({ hs, ...scoreMatch(client, hs) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);

    rows.push({ client, top: scored });

    const clientLabel = truncate(`${client.name}${client.companyName ? ` (${client.companyName})` : ""}`, 55);
    console.log(`\n• ${clientLabel.padEnd(55)}  [${client.status ?? "—"}]  query="${query}"`);

    if (scored.length === 0) {
      if (results.length === 0) {
        console.log(`    ∅ HubSpot search returned 0 results for "${query}"`);
      } else {
        console.log(`    ∅ HubSpot returned ${results.length} results but none scored > 0 (showing top 2 anyway)`);
        for (const hs of results.slice(0, 2)) {
          const domain = hs.properties.domain ?? hs.properties.website ?? "—";
          console.log(`      · "${hs.properties.name}" [${domain}] id=${hs.id}`);
        }
      }
      none++;
      continue;
    }

    if (scored[0]!.score >= 70) strong++;
    else weak++;

    for (const { hs, score, reasons } of scored) {
      const confidence = score >= 100 ? "STRONG" : score >= 70 ? "GOOD  " : score >= 40 ? "WEAK  " : "LOW   ";
      const hsName = truncate(hs.properties.name ?? "(no name)", 44).padEnd(44);
      const dom = truncate(hs.properties.domain ?? hs.properties.website ?? "—", 28).padEnd(28);
      console.log(
        `    [${confidence}] score=${String(score).padStart(3)}  ${hsName}  ${dom}  id=${hs.id.padEnd(12)}  (${reasons.join(",")})`
      );
      console.log(`             └ ${renderRichLine(hs)}`);
    }

    // Rate-limit politely (HubSpot: 100 req/10s)
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log("\n" + "─".repeat(120));
  console.log(`\n======================================================================`);
  console.log(`  Summary`);
  console.log(`======================================================================\n`);
  console.log(`Clients total:                            ${clients.length}`);
  console.log(`  └ STRONG/GOOD match (score ≥ 70):       ${strong}`);
  console.log(`  └ WEAK match only (needs review):       ${weak}`);
  console.log(`  └ NO plausible match (score 0 or ∅):    ${none}`);
  console.log(``);

  // Write a machine-readable summary for easy follow-up
  const compact = rows.map(({ client, top }) => ({
    clientId: client._id,
    clientName: client.name,
    status: client.status,
    matches: top.map(({ hs, score, reasons }) => ({
      hubspotId: hs.id,
      name: hs.properties.name,
      domain: hs.properties.domain ?? hs.properties.website,
      score,
      reasons,
      lifecycle: hs.properties.lifecyclestage,
      deals: hs.properties.num_associated_deals,
      recentDeal: hs.properties.recent_deal_amount,
      totalRevenue: hs.properties.total_revenue,
      lastActivity: hs.properties.hs_last_activity_date,
      lastContact: hs.properties.hs_last_contacted_date,
    })),
  }));
  const outPath = `/tmp/hubspot-match-${Date.now()}.json`;
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(outPath, JSON.stringify(compact, null, 2))
  );
  console.log(`Machine-readable match data written to: ${outPath}`);
  console.log(``);
}

main().catch((e) => {
  console.error("\n✗ Search match failed:", e);
  process.exit(1);
});
