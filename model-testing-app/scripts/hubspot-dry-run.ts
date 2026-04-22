/**
 * HubSpot → Client Dry-Run
 *
 * Read-only preview of what a real HubSpot contact sync would look like.
 * Pulls a small sample of contacts with their associated companies, then
 * attempts to match each company against the existing Convex `clients` table
 * using progressively looser strategies. Writes nothing. Prints a report.
 *
 * Run (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/hubspot-dry-run.ts [sampleSize]
 *
 * Examples:
 *   npx tsx --env-file=.env.local scripts/hubspot-dry-run.ts        # default 20
 *   npx tsx --env-file=.env.local scripts/hubspot-dry-run.ts 50
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// ---- CLI ----------------------------------------------------------------
const SAMPLE_SIZE = Math.max(1, Math.min(100, parseInt(process.argv[2] ?? "20", 10)));

// ---- Env ----------------------------------------------------------------
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!HUBSPOT_API_KEY) {
  console.error("HUBSPOT_API_KEY not set. Run with: npx tsx --env-file=.env.local scripts/hubspot-dry-run.ts");
  process.exit(1);
}
if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set. Run with: npx tsx --env-file=.env.local scripts/hubspot-dry-run.ts");
  process.exit(1);
}

// ---- Types --------------------------------------------------------------
type HSContact = {
  id: string;
  properties: Record<string, string | undefined>;
  associations?: {
    companies?: { results: { id: string }[] };
    deals?: { results: { id: string }[] };
  };
};

type HSCompany = {
  id: string;
  properties: { name?: string; domain?: string; website?: string };
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

type MatchResult =
  | { kind: "already-linked"; client: ClientRow }
  | { kind: "exact-name"; client: ClientRow }
  | { kind: "domain"; client: ClientRow; domain: string }
  | { kind: "possible"; client: ClientRow; reason: string }
  | { kind: "no-match" };

// ---- Normalization helpers ---------------------------------------------
// Strip common legal suffixes so "Funding 365 Ltd" ≡ "Funding 365 Limited" ≡ "Funding 365"
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
  // Naive: take last two labels. Doesn't handle co.uk perfectly, but good enough for a dry-run.
  return parts.slice(-2).join(".");
}

// ---- Fetchers -----------------------------------------------------------
async function fetchSampleContacts(limit: number): Promise<HSContact[]> {
  const properties = [
    "email",
    "firstname",
    "lastname",
    "phone",
    "jobtitle",
    "company",
    "lifecyclestage",
    "hs_last_contacted_date",
    "hs_last_activity_date",
  ];
  const params = new URLSearchParams({
    limit: String(limit),
    properties: properties.join(","),
    associations: "companies,deals",
  });

  const res = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts?${params}`, {
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`HubSpot contacts fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { results?: HSContact[] };
  return data.results ?? [];
}

async function fetchCompaniesByIds(ids: string[]): Promise<Map<string, HSCompany>> {
  const out = new Map<string, HSCompany>();
  if (ids.length === 0) return out;

  // Batch-read endpoint: up to 100 inputs per call
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const res = await fetch("https://api.hubapi.com/crm/v3/objects/companies/batch/read", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: ["name", "domain", "website"],
        inputs: batch.map((id) => ({ id })),
      }),
    });
    if (!res.ok) {
      throw new Error(`HubSpot companies batch read failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as { results?: HSCompany[] };
    for (const c of data.results ?? []) out.set(c.id, c);
  }

  return out;
}

// ---- Matching -----------------------------------------------------------
function matchCompany(hs: HSCompany, clients: ClientRow[]): MatchResult {
  const hsName = hs.properties.name ?? "";
  const hsNorm = normalizeName(hsName);
  const hsDomain = rootDomain(extractDomain(hs.properties.domain ?? hs.properties.website ?? null));

  // 1) Already linked by HubSpot ID (highest confidence)
  const linked = clients.find((c) => c.hubspotCompanyId === hs.id);
  if (linked) return { kind: "already-linked", client: linked };

  // 2) Exact normalized name match against client.name OR client.companyName
  if (hsNorm) {
    const exact = clients.find((c) => {
      const n = normalizeName(c.name);
      const cn = normalizeName(c.companyName);
      return n === hsNorm || (cn !== "" && cn === hsNorm);
    });
    if (exact) return { kind: "exact-name", client: exact };
  }

  // 3) Root-domain match against website or email domain
  if (hsDomain) {
    const dom = clients.find((c) => {
      const websiteDomain = rootDomain(extractDomain(c.website));
      const emailDomain = rootDomain(extractDomain(c.email));
      return websiteDomain === hsDomain || emailDomain === hsDomain;
    });
    if (dom) return { kind: "domain", client: dom, domain: hsDomain };
  }

  // 4) Substring — flagged "possible", needs human review. Minimum length avoids noise.
  if (hsNorm && hsNorm.length >= 5) {
    const sub = clients.find((c) => {
      const n = normalizeName(c.name);
      const cn = normalizeName(c.companyName);
      const candidates = [n, cn].filter((x) => x.length >= 5);
      return candidates.some((x) => x.includes(hsNorm) || hsNorm.includes(x));
    });
    if (sub) return { kind: "possible", client: sub, reason: "name substring" };
  }

  return { kind: "no-match" };
}

// ---- Rendering ----------------------------------------------------------
function renderMatch(m: MatchResult): string {
  switch (m.kind) {
    case "already-linked":
      return `ALREADY LINKED  → "${m.client.name}" (hubspotCompanyId)`;
    case "exact-name":
      return `EXACT NAME      → "${m.client.name}"`;
    case "domain":
      return `DOMAIN MATCH    → "${m.client.name}" (${m.domain})`;
    case "possible":
      return `POSSIBLE MATCH  → "${m.client.name}" (${m.reason}) — review`;
    case "no-match":
      return `NO MATCH        → would create new \`companies\` row`;
  }
}

// ---- Main ---------------------------------------------------------------
async function main() {
  console.log(`\n======================================================================`);
  console.log(`  HubSpot → Client Dry-Run  |  sample: ${SAMPLE_SIZE}  |  READ-ONLY`);
  console.log(`======================================================================\n`);

  console.log(`Step 1 — Fetching ${SAMPLE_SIZE} contacts from HubSpot...`);
  const contacts = await fetchSampleContacts(SAMPLE_SIZE);
  console.log(`  ✓ ${contacts.length} contacts fetched`);

  const companyIds = [
    ...new Set(
      contacts.flatMap((c) => (c.associations?.companies?.results ?? []).map((a) => a.id))
    ),
  ];
  console.log(`\nStep 2 — Fetching ${companyIds.length} unique associated companies...`);
  const companies = await fetchCompaniesByIds(companyIds);
  console.log(`  ✓ ${companies.size} companies fetched (name, domain, website)`);

  console.log(`\nStep 3 — Loading all clients from Convex...`);
  const convex = new ConvexHttpClient(CONVEX_URL!);
  const clientsRaw = (await convex.query(api.clients.list, {})) as unknown as ClientRow[];
  const clients = clientsRaw ?? [];
  console.log(`  ✓ ${clients.length} non-deleted clients in DB`);
  console.log(`    └ with hubspotCompanyId: ${clients.filter((c) => c.hubspotCompanyId).length}`);
  console.log(`    └ with website:          ${clients.filter((c) => c.website).length}`);
  console.log(`    └ with email:            ${clients.filter((c) => c.email).length}`);

  console.log(`\nStep 4 — Per-contact match report`);
  console.log("─".repeat(110));

  type Bucket = "auto" | "possible" | "orphan" | "no-company";
  const contactBucket = new Map<string, Bucket>();
  let autoLinkCount = 0;
  let alreadyLinkedCount = 0;
  let possibleCount = 0;
  let noMatchCount = 0;
  let noCompanyCount = 0;

  for (const contact of contacts) {
    const first = contact.properties.firstname ?? "";
    const last = contact.properties.lastname ?? "";
    const fullName = `${first} ${last}`.trim() || "(no name)";
    const email = contact.properties.email ?? "(no email)";
    const stage = contact.properties.lifecyclestage ?? "—";
    const lastAct = contact.properties.hs_last_activity_date ?? "—";
    const compStringProp = contact.properties.company ?? "";
    const compIds = contact.associations?.companies?.results?.map((r) => r.id) ?? [];

    console.log(
      `\n• ${fullName.padEnd(32)} <${email}>  stage=${stage}  lastActivity=${lastAct.slice(0, 10)}`
    );

    if (compIds.length === 0) {
      console.log(
        `    ⚠ No associated companies (contact.properties.company = "${compStringProp}")`
      );
      noCompanyCount++;
      contactBucket.set(contact.id, "no-company");
      continue;
    }

    const results: MatchResult[] = [];
    for (const cid of compIds) {
      const hsc = companies.get(cid);
      if (!hsc) {
        console.log(`    ✗ Company ${cid}: not returned by batch-read (deleted? permissions?)`);
        continue;
      }
      const m = matchCompany(hsc, clients);
      results.push(m);
      const label = `"${hsc.properties.name ?? "(no name)"}"`.padEnd(36);
      const dom = hsc.properties.domain ?? hsc.properties.website ?? "—";
      console.log(`    ${label} [${dom}]`);
      console.log(`      → ${renderMatch(m)}`);
    }

    const hasAuto = results.some(
      (r) => r.kind === "already-linked" || r.kind === "exact-name" || r.kind === "domain"
    );
    const hasAlreadyLinked = results.some((r) => r.kind === "already-linked");
    const hasPossible = results.some((r) => r.kind === "possible");

    if (hasAuto) {
      autoLinkCount++;
      if (hasAlreadyLinked) alreadyLinkedCount++;
      contactBucket.set(contact.id, "auto");
    } else if (hasPossible) {
      possibleCount++;
      contactBucket.set(contact.id, "possible");
    } else {
      noMatchCount++;
      contactBucket.set(contact.id, "orphan");
    }
  }

  console.log("\n" + "─".repeat(110));
  console.log(`\n======================================================================`);
  console.log(`  Summary`);
  console.log(`======================================================================\n`);
  console.log(`Contacts sampled:                            ${contacts.length}`);
  console.log(`Contacts with ≥1 associated company:         ${contacts.length - noCompanyCount}`);
  console.log(`Contacts with no company association:        ${noCompanyCount}`);
  console.log(``);
  console.log(`Auto-linkable (high-confidence):             ${autoLinkCount}`);
  console.log(`  └ already linked (hubspotCompanyId):       ${alreadyLinkedCount}`);
  console.log(`  └ new auto-links (name / domain):          ${autoLinkCount - alreadyLinkedCount}`);
  console.log(`Needs review (possible substring match):     ${possibleCount}`);
  console.log(`No match → would create new companies row:   ${noMatchCount}`);
  console.log(``);
  const denom = contacts.length - noCompanyCount;
  const autoRate = denom > 0 ? ((autoLinkCount / denom) * 100).toFixed(1) : "0.0";
  console.log(`Auto-link rate (of contacts with companies): ${autoRate}%`);

  // Cross-check: how many unique HubSpot companies in the sample do we already have in Convex?
  const hsCompanies = [...companies.values()];
  const matchedHsCompanies = hsCompanies.filter((hc) => {
    const m = matchCompany(hc, clients);
    return m.kind === "already-linked" || m.kind === "exact-name" || m.kind === "domain";
  });
  console.log(``);
  console.log(`Unique companies in sample:                  ${hsCompanies.length}`);
  console.log(`  └ would auto-link to a client:             ${matchedHsCompanies.length}`);
  console.log(`  └ would become new \`companies\` rows:       ${hsCompanies.length - matchedHsCompanies.length}`);
  console.log(``);
}

main().catch((e) => {
  console.error("\n✗ Dry-run failed:", e);
  process.exit(1);
});
