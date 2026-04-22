/**
 * HubSpot Email-Access Path Probe
 *
 * The /crm/v3/objects/emails/search endpoint requires crm.objects.emails.read
 * which Service Keys doesn't expose. But HubSpot has several other email-access
 * paths with different scope requirements. This script tries each to find one
 * that works with the current granted scopes (notably sales-email-read).
 *
 * Read-only.
 *
 * Run (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/hubspot-email-paths.ts [companyId]
 */

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
if (!HUBSPOT_API_KEY) {
  console.error("HUBSPOT_API_KEY not set.");
  process.exit(1);
}

const COMPANY_ID = process.argv[2] ?? "184286151922"; // Talbot Homes

async function hs(method: "GET" | "POST", path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let body_: any;
  try {
    body_ = await res.json();
  } catch {
    body_ = await res.text();
  }
  return { ok: res.ok, status: res.status, body: body_ };
}

function countByType(engagements: any[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of engagements) {
    const t = e.engagement?.type ?? e.type ?? "UNKNOWN";
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  Email-Access Path Probe — companyId=${COMPANY_ID}`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  // ---- Path 1: legacy v1 engagements associated with company ----
  console.log("Path 1: GET /engagements/v1/engagements/associated/company/{id}?limit=50");
  {
    const r = await hs("GET", `/engagements/v1/engagements/associated/company/${COMPANY_ID}?limit=50&associations=deals,contacts,companies`);
    if (!r.ok) {
      console.log(`  ✗ ${r.status}  ${typeof r.body === "string" ? r.body.slice(0, 200) : JSON.stringify(r.body).slice(0, 200)}`);
    } else {
      const results = r.body.results ?? [];
      const counts = countByType(results);
      console.log(`  ✓ ${r.status}  Returned ${results.length} engagements`);
      console.log(`    Types:`, JSON.stringify(counts));
      const emails = results.filter((e: any) => (e.engagement?.type ?? e.type) === "EMAIL");
      if (emails.length > 0) {
        console.log(`\n  ✓ EMAILS FOUND VIA LEGACY v1 PATH — showing first 3:`);
        for (const e of emails.slice(0, 3)) {
          const meta = e.metadata ?? {};
          const eng = e.engagement ?? {};
          const ts = eng.timestamp ? new Date(eng.timestamp).toISOString().slice(0, 10) : "—";
          console.log(`    · ${ts}  subject="${meta.subject ?? "—"}"  status="${meta.status ?? "—"}"  from="${meta.from?.email ?? "—"}"`);
          if (meta.html) {
            const textPreview = String(meta.html).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
            console.log(`      body preview: "${textPreview}${textPreview.length >= 120 ? "…" : ""}"`);
          } else if (meta.text) {
            const textPreview = String(meta.text).replace(/\s+/g, " ").trim().slice(0, 120);
            console.log(`      body preview: "${textPreview}${textPreview.length >= 120 ? "…" : ""}"`);
          }
        }
      } else {
        console.log(`  (no EMAIL-type engagements in the response — but endpoint works)`);
      }
    }
  }

  // ---- Path 2: v3 emails list endpoint (not search) ----
  console.log("\nPath 2: GET /crm/v3/objects/emails?limit=5 (list, not search)");
  {
    const r = await hs("GET", `/crm/v3/objects/emails?limit=5&properties=hs_timestamp,hs_email_subject,hs_email_direction,hs_email_status`);
    if (!r.ok) {
      console.log(`  ✗ ${r.status}  ${typeof r.body === "string" ? r.body.slice(0, 200) : JSON.stringify(r.body).slice(0, 200)}`);
    } else {
      const results = r.body.results ?? [];
      console.log(`  ✓ ${r.status}  Returned ${results.length} emails`);
    }
  }

  // ---- Path 3: company → associated emails (association list only) ----
  console.log("\nPath 3: GET /crm/v3/objects/companies/{id}/associations/emails");
  {
    const r = await hs("GET", `/crm/v3/objects/companies/${COMPANY_ID}/associations/emails`);
    if (!r.ok) {
      console.log(`  ✗ ${r.status}  ${typeof r.body === "string" ? r.body.slice(0, 200) : JSON.stringify(r.body).slice(0, 200)}`);
    } else {
      const results = r.body.results ?? [];
      console.log(`  ✓ ${r.status}  Found ${results.length} email IDs associated with this company`);
      if (results.length > 0) {
        console.log(`    Sample IDs: ${results.slice(0, 5).map((r: any) => r.id ?? r.toObjectId).join(", ")}`);

        // Try to fetch one by ID
        const firstId = results[0]?.id ?? results[0]?.toObjectId;
        if (firstId) {
          console.log(`\n    Trying GET /crm/v3/objects/emails/${firstId} ...`);
          const r2 = await hs("GET", `/crm/v3/objects/emails/${firstId}?properties=hs_timestamp,hs_email_subject,hs_email_direction,hs_email_status,hs_email_text,hs_email_html`);
          if (!r2.ok) {
            console.log(`    ✗ ${r2.status}  ${typeof r2.body === "string" ? r2.body.slice(0, 200) : JSON.stringify(r2.body).slice(0, 200)}`);
          } else {
            console.log(`    ✓ ${r2.status}  Email fetched:`);
            const p = r2.body.properties ?? {};
            console.log(`      subject: ${p.hs_email_subject ?? "—"}`);
            console.log(`      direction: ${p.hs_email_direction ?? "—"}`);
            console.log(`      status: ${p.hs_email_status ?? "—"}`);
            console.log(`      timestamp: ${p.hs_timestamp ?? "—"}`);
          }
        }
      }
    }
  }

  // ---- Path 4: calls via v1 (for completeness) ----
  console.log("\nPath 4: Counting other engagement types from Path 1 result (for calls/tasks)");
  {
    const r = await hs("GET", `/engagements/v1/engagements/associated/company/${COMPANY_ID}?limit=100`);
    if (r.ok) {
      const results = r.body.results ?? [];
      const counts = countByType(results);
      console.log(`  Totals (across latest 100 engagements):`, JSON.stringify(counts));
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`  Summary`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);
  console.log(`If Path 1 returned EMAIL results, the legacy v1 engagements endpoint`);
  console.log(`is our path forward — no additional scopes needed, and it's already`);
  console.log(`the pattern in src/lib/hubspot/activities.ts.\n`);
}

main().catch((e) => {
  console.error("\n✗ Probe failed:", e);
  process.exit(1);
});
