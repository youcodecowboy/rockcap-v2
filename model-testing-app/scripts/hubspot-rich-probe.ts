/**
 * HubSpot Rich Payload Probe (Dry-Run)
 *
 * Deep-dive exploration of the data available in this HubSpot tenant.
 *   1. Lists every property defined on Companies and Contacts
 *   2. Fetches one well-populated company (default: Talbot Homes) with ALL
 *      properties, ALL associations, ALL deals, and the engagement timeline
 *   3. Probes one associated contact with the same depth
 *   4. Resolves owner IDs to human names
 *
 * Purpose: decide which properties to sync into Convex, and discover which
 * "last activity" variant is actually populated in this tenant.
 *
 * Read-only. No writes.
 *
 * Run (from model-testing-app/):
 *   npx tsx --env-file=.env.local scripts/hubspot-rich-probe.ts [companyId] [dealLimit] [engagementLimit]
 *
 * Defaults: companyId=184286151922 (Talbot Homes, 13 deals)
 *           dealLimit=20, engagementLimit=10
 */

// ---- CLI ----------------------------------------------------------------
const COMPANY_ID = process.argv[2] ?? "184286151922"; // Talbot Homes
const DEAL_LIMIT = Math.max(1, Math.min(100, parseInt(process.argv[3] ?? "20", 10)));
const ENGAGEMENT_LIMIT = Math.max(1, Math.min(50, parseInt(process.argv[4] ?? "10", 10)));

// ---- Env ----------------------------------------------------------------
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
if (!HUBSPOT_API_KEY) {
  console.error("HUBSPOT_API_KEY not set.");
  process.exit(1);
}

// ---- Types --------------------------------------------------------------
type PropertyDef = {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName?: string;
  description?: string;
  calculated?: boolean;
  hubspotDefined?: boolean;
};

type HSRecord = {
  id: string;
  properties: Record<string, string | undefined | null>;
  associations?: Record<string, { results: { id: string; type?: string }[] }>;
};

// ---- Fetch wrapper ------------------------------------------------------
async function hs(method: "GET" | "POST", path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${HUBSPOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${method} ${path} failed: ${res.status} ${text.slice(0, 400)}`);
  }
  return res.json();
}

// ---- API helpers --------------------------------------------------------
async function discoverProperties(objectType: "companies" | "contacts" | "deals"): Promise<PropertyDef[]> {
  const data = await hs("GET", `/crm/v3/properties/${objectType}`);
  return (data.results ?? []) as PropertyDef[];
}

async function fetchCompanyWithAssociations(id: string): Promise<HSRecord> {
  // GET with only name to minimize URL length; we use batch-read for full props.
  const data = await hs(
    "GET",
    `/crm/v3/objects/companies/${id}?properties=name&associations=contacts,deals`
  );
  return data as HSRecord;
}

async function batchReadAllProps(
  objectType: "companies" | "contacts" | "deals",
  ids: string[],
  propNames: string[]
): Promise<HSRecord[]> {
  if (ids.length === 0) return [];
  const out: HSRecord[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batchIds = ids.slice(i, i + 100);
    const data = await hs("POST", `/crm/v3/objects/${objectType}/batch/read`, {
      properties: propNames,
      inputs: batchIds.map((id) => ({ id })),
    });
    out.push(...((data.results ?? []) as HSRecord[]));
  }
  return out;
}

async function searchEngagements(
  engagementType: "emails" | "calls" | "meetings" | "notes" | "tasks",
  companyId: string,
  propNames: string[],
  limit: number
): Promise<HSRecord[]> {
  const data = await hs("POST", `/crm/v3/objects/${engagementType}/search`, {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "associations.company",
            operator: "EQ",
            value: companyId,
          },
        ],
      },
    ],
    properties: propNames,
    sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
    limit,
  });
  return (data.results ?? []) as HSRecord[];
}

type Owner = { id: string; firstName?: string; lastName?: string; email?: string; userId?: string };
async function fetchOwner(ownerId: string): Promise<Owner | null> {
  try {
    return (await hs("GET", `/crm/v3/owners/${ownerId}`)) as Owner;
  } catch {
    return null;
  }
}

// ---- Rendering ----------------------------------------------------------
function fmtMoney(raw: string | undefined | null): string {
  if (!raw) return "—";
  const n = parseFloat(raw);
  if (!isFinite(n) || n === 0) return "—";
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(1)}K`;
  return `£${n.toFixed(0)}`;
}

function fmtDate(raw: string | undefined | null): string {
  if (!raw) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const ts = parseInt(raw, 10);
  if (!isNaN(ts) && ts > 0) {
    const d = new Date(ts < 946684800000 ? ts * 1000 : ts);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "—";
}

function isPopulated(v: string | undefined | null): boolean {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  return s !== "" && s !== "0.0" && s !== "0.00";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function section(title: string) {
  console.log(`\n${"═".repeat(90)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(90));
}

function subsection(title: string) {
  console.log(`\n── ${title} ──`);
}

// ---- Main ---------------------------------------------------------------
async function main() {
  console.log(`\n${"█".repeat(90)}`);
  console.log(`  HubSpot Rich Payload Probe`);
  console.log(`  companyId=${COMPANY_ID}  dealLimit=${DEAL_LIMIT}  engagementLimit=${ENGAGEMENT_LIMIT}`);
  console.log("█".repeat(90));

  // ---------- Step 1: property discovery ----------
  section("Step 1 — Property discovery (tenant schema)");
  const [companyProps, contactProps, dealProps] = await Promise.all([
    discoverProperties("companies"),
    discoverProperties("contacts"),
    discoverProperties("deals"),
  ]);

  const summarize = (props: PropertyDef[]) => {
    const standard = props.filter((p) => p.hubspotDefined);
    const custom = props.filter((p) => !p.hubspotDefined);
    return { total: props.length, standard: standard.length, custom: custom.length };
  };
  const cs = summarize(companyProps);
  const ks = summarize(contactProps);
  const ds = summarize(dealProps);
  console.log(`  Companies: ${cs.total} properties (${cs.standard} standard, ${cs.custom} custom)`);
  console.log(`  Contacts:  ${ks.total} properties (${ks.standard} standard, ${ks.custom} custom)`);
  console.log(`  Deals:     ${ds.total} properties (${ds.standard} standard, ${ds.custom} custom)`);

  if (cs.custom > 0) {
    subsection(`Custom company properties (${cs.custom})`);
    for (const p of companyProps.filter((p) => !p.hubspotDefined)) {
      console.log(`  · ${p.name.padEnd(45)}  ${p.label.padEnd(40)} [${p.type}/${p.fieldType}]`);
    }
  }
  if (ks.custom > 0) {
    subsection(`Custom contact properties (${ks.custom})`);
    for (const p of contactProps.filter((p) => !p.hubspotDefined)) {
      console.log(`  · ${p.name.padEnd(45)}  ${p.label.padEnd(40)} [${p.type}/${p.fieldType}]`);
    }
  }

  // ---------- Step 2: fetch company with associations, then full properties ----------
  section(`Step 2 — Company probe: id=${COMPANY_ID}`);
  console.log(`  Fetching associations...`);
  const companyAssoc = await fetchCompanyWithAssociations(COMPANY_ID);
  const dealIds = companyAssoc.associations?.deals?.results?.map((r) => r.id) ?? [];
  const contactIds = companyAssoc.associations?.contacts?.results?.map((r) => r.id) ?? [];
  // HubSpot may return duplicate association results (HUBSPOT_DEFINED + USER_DEFINED)
  const uniqueDealIds = [...new Set(dealIds)];
  const uniqueContactIds = [...new Set(contactIds)];
  console.log(`  ✓ Associated deals:    ${uniqueDealIds.length} (raw: ${dealIds.length})`);
  console.log(`  ✓ Associated contacts: ${uniqueContactIds.length} (raw: ${contactIds.length})`);

  console.log(`\n  Fetching company with ALL ${companyProps.length} properties via batch-read...`);
  const companyPropNames = companyProps.map((p) => p.name);
  const [company] = await batchReadAllProps("companies", [COMPANY_ID], companyPropNames);
  if (!company) {
    console.error("  ✗ Company not returned by batch-read — check ID");
    process.exit(1);
  }
  const cProps = company.properties;

  const populatedNames = companyPropNames.filter((n) => isPopulated(cProps[n]));
  const emptyNames = companyPropNames.filter((n) => !isPopulated(cProps[n]));
  console.log(`  ✓ Populated: ${populatedNames.length} / ${companyProps.length}  (${emptyNames.length} empty)`);

  subsection("Key identity & lifecycle");
  for (const n of ["name", "domain", "website", "phone", "lifecyclestage", "hs_lead_status", "industry", "type", "description"]) {
    const label = (companyProps.find((p) => p.name === n)?.label ?? n).padEnd(30);
    console.log(`  ${label} ${cProps[n] ?? "—"}`);
  }

  subsection("Activity / recency — all candidates (so we can pick the populated one)");
  const activityCandidates = companyPropNames.filter((n) =>
    /activity|contacted|contact_date|engagement|last_sales|last_meeting|last_email|notes_last|hs_analytics_last|hs_latest|next_activity|recent_deal_close|lastmodified/i.test(
      n
    )
  );
  for (const n of activityCandidates) {
    const label = (companyProps.find((p) => p.name === n)?.label ?? n).padEnd(45);
    const v = cProps[n];
    const marker = isPopulated(v) ? "✓" : " ";
    console.log(`  ${marker} ${label} ${isPopulated(v) ? fmtDate(v as string) + "  (raw: " + truncate(String(v), 24) + ")" : "(empty)"}`);
  }

  subsection("Revenue & deals (company-level aggregates)");
  for (const n of [
    "num_associated_deals",
    "num_associated_contacts",
    "total_revenue",
    "recent_deal_amount",
    "recent_deal_close_date",
    "hs_total_deal_value",
    "annualrevenue",
    "numberofemployees",
  ]) {
    const label = (companyProps.find((p) => p.name === n)?.label ?? n).padEnd(30);
    const v = cProps[n];
    const display =
      n.includes("revenue") || n.includes("amount") || n.includes("deal_value")
        ? fmtMoney(v as string)
        : n.includes("date")
        ? fmtDate(v as string)
        : v ?? "—";
    console.log(`  ${label} ${display}`);
  }

  subsection("Populated custom properties on this company");
  const populatedCustom = companyProps.filter((p) => !p.hubspotDefined && isPopulated(cProps[p.name]));
  if (populatedCustom.length === 0) {
    console.log(`  (none populated)`);
  } else {
    for (const p of populatedCustom) {
      console.log(`  ${p.label.padEnd(40)} = ${truncate(String(cProps[p.name]), 60)}`);
    }
  }

  subsection("Owner");
  const ownerId = cProps.hubspot_owner_id;
  if (ownerId && isPopulated(ownerId)) {
    const owner = await fetchOwner(String(ownerId));
    if (owner) {
      console.log(`  ${owner.firstName ?? ""} ${owner.lastName ?? ""} <${owner.email ?? "—"}>  (HS owner id=${ownerId})`);
    } else {
      console.log(`  (failed to resolve owner ${ownerId})`);
    }
  } else {
    console.log(`  (no owner set)`);
  }

  // ---------- Step 3: fetch all associated deals with details ----------
  section(`Step 3 — Associated deals (fetching up to ${DEAL_LIMIT})`);
  const dealPropNames = [
    "dealname",
    "amount",
    "amount_in_home_currency",
    "closedate",
    "dealstage",
    "pipeline",
    "dealtype",
    "hs_priority",
    "hs_is_closed",
    "hs_is_closed_won",
    "hs_deal_stage_probability",
    "description",
    "createdate",
    "hs_lastmodifieddate",
    "hubspot_owner_id",
  ];
  const deals = await batchReadAllProps("deals", uniqueDealIds.slice(0, DEAL_LIMIT), dealPropNames);
  console.log(`  ✓ ${deals.length} deals fetched\n`);

  for (const d of deals) {
    const p = d.properties;
    const name = truncate(String(p.dealname ?? "(no name)"), 50).padEnd(50);
    const amt = fmtMoney(p.amount as string).padEnd(8);
    const stage = String(p.dealstage ?? "—").padEnd(18);
    const close = fmtDate(p.closedate as string).padEnd(10);
    const closed = p.hs_is_closed === "true" ? (p.hs_is_closed_won === "true" ? "won " : "lost") : "open";
    console.log(`  ${name}  ${amt}  stage=${stage}  close=${close}  [${closed}]`);
  }

  const totalDealAmount = deals.reduce((sum, d) => {
    const n = parseFloat(d.properties.amount ?? "0");
    return sum + (isFinite(n) ? n : 0);
  }, 0);
  const wonDeals = deals.filter((d) => d.properties.hs_is_closed_won === "true");
  const wonAmount = wonDeals.reduce((sum, d) => sum + (parseFloat(d.properties.amount ?? "0") || 0), 0);
  console.log(`\n  Totals:  ${deals.length} deals, sum=${fmtMoney(String(totalDealAmount))}, won=${wonDeals.length} (${fmtMoney(String(wonAmount))})`);

  // ---------- Step 4: probe one associated contact ----------
  section(`Step 4 — One associated contact probed deeply`);
  if (uniqueContactIds.length === 0) {
    console.log(`  (company has no associated contacts)`);
  } else {
    const contactPropNames = contactProps.map((p) => p.name);
    const firstContactId = uniqueContactIds[0]!;
    console.log(`  Probing contact id=${firstContactId} with ALL ${contactProps.length} properties...`);
    const [contact] = await batchReadAllProps("contacts", [firstContactId], contactPropNames);
    if (!contact) {
      console.log(`  ✗ Contact not returned by batch-read`);
    } else {
      const kp = contact.properties;
      const populatedContactNames = contactPropNames.filter((n) => isPopulated(kp[n]));
      console.log(`  ✓ Populated: ${populatedContactNames.length} / ${contactProps.length} properties\n`);

      subsection("Identity & contact fields");
      for (const n of ["firstname", "lastname", "email", "phone", "mobilephone", "jobtitle", "lifecyclestage", "hs_lead_status", "company"]) {
        const label = (contactProps.find((p) => p.name === n)?.label ?? n).padEnd(30);
        console.log(`  ${label} ${kp[n] ?? "—"}`);
      }

      subsection("Activity & engagement");
      for (const n of [
        "hs_last_sales_activity_date",
        "hs_last_sales_activity_timestamp",
        "notes_last_contacted",
        "notes_last_updated",
        "lastcontacteddate",
        "hs_last_contacted_date",
        "hs_last_activity_date",
        "hs_email_last_engagement_date",
        "hs_email_last_send_date",
        "hs_email_last_open_date",
        "hs_email_last_click_date",
        "hs_email_last_reply_date",
        "next_activity_date",
      ]) {
        const label = (contactProps.find((p) => p.name === n)?.label ?? n).padEnd(45);
        const v = kp[n];
        const marker = isPopulated(v) ? "✓" : " ";
        console.log(`  ${marker} ${label} ${isPopulated(v) ? fmtDate(v as string) : "(empty)"}`);
      }

      subsection("Email engagement metrics");
      for (const n of ["hs_email_open", "hs_email_click", "hs_email_bounce", "hs_email_optout", "num_contacted_notes", "num_notes"]) {
        const label = (contactProps.find((p) => p.name === n)?.label ?? n).padEnd(35);
        console.log(`  ${label} ${kp[n] ?? "—"}`);
      }

      subsection("Populated custom properties on this contact");
      const populatedCustomContact = contactProps.filter((p) => !p.hubspotDefined && isPopulated(kp[p.name]));
      if (populatedCustomContact.length === 0) {
        console.log(`  (none populated)`);
      } else {
        for (const p of populatedCustomContact) {
          console.log(`  ${p.label.padEnd(40)} = ${truncate(String(kp[p.name]), 60)}`);
        }
      }
    }
  }

  // ---------- Step 5: engagement timeline ----------
  section(`Step 5 — Engagement timeline (last ${ENGAGEMENT_LIMIT} per type, most recent first)`);

  const engagementConfigs = [
    {
      type: "emails" as const,
      props: [
        "hs_timestamp",
        "hs_email_subject",
        "hs_email_direction",
        "hs_email_status",
        "hs_email_from_email",
        "hs_email_to_email",
        "hubspot_owner_id",
      ],
      render: (e: HSRecord) => {
        const p = e.properties;
        return `${fmtDate(p.hs_timestamp as string)}  ${String(p.hs_email_direction ?? "—").padEnd(12)}  "${truncate(String(p.hs_email_subject ?? "—"), 50)}"  [${p.hs_email_status ?? "—"}]`;
      },
    },
    {
      type: "calls" as const,
      props: ["hs_timestamp", "hs_call_title", "hs_call_direction", "hs_call_duration", "hs_call_disposition", "hubspot_owner_id"],
      render: (e: HSRecord) => {
        const p = e.properties;
        const dur = p.hs_call_duration ? `${Math.round(parseInt(p.hs_call_duration as string) / 1000 / 60)}m` : "—";
        return `${fmtDate(p.hs_timestamp as string)}  ${String(p.hs_call_direction ?? "—").padEnd(12)}  ${dur.padEnd(6)} "${truncate(String(p.hs_call_title ?? "—"), 50)}"`;
      },
    },
    {
      type: "meetings" as const,
      props: ["hs_timestamp", "hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time", "hs_meeting_outcome", "hubspot_owner_id"],
      render: (e: HSRecord) => {
        const p = e.properties;
        return `${fmtDate(p.hs_timestamp as string)}  "${truncate(String(p.hs_meeting_title ?? "—"), 50)}"  outcome=${p.hs_meeting_outcome ?? "—"}`;
      },
    },
    {
      type: "notes" as const,
      props: ["hs_timestamp", "hs_note_body", "hubspot_owner_id"],
      render: (e: HSRecord) => {
        const p = e.properties;
        const body = String(p.hs_note_body ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return `${fmtDate(p.hs_timestamp as string)}  "${truncate(body, 60)}"`;
      },
    },
    {
      type: "tasks" as const,
      props: ["hs_timestamp", "hs_task_subject", "hs_task_status", "hs_task_priority", "hs_task_type", "hubspot_owner_id"],
      render: (e: HSRecord) => {
        const p = e.properties;
        return `${fmtDate(p.hs_timestamp as string)}  [${p.hs_task_status ?? "—"}/${p.hs_task_priority ?? "—"}/${p.hs_task_type ?? "—"}] "${truncate(String(p.hs_task_subject ?? "—"), 50)}"`;
      },
    },
  ];

  for (const cfg of engagementConfigs) {
    subsection(`${cfg.type} (latest ${ENGAGEMENT_LIMIT})`);
    try {
      const results = await searchEngagements(cfg.type, COMPANY_ID, cfg.props, ENGAGEMENT_LIMIT);
      if (results.length === 0) {
        console.log(`  (none found)`);
      } else {
        console.log(`  Found: ${results.length}`);
        for (const e of results) {
          console.log(`  · ${cfg.render(e)}`);
        }
      }
    } catch (err) {
      console.log(`  ✗ Search failed: ${(err as Error).message}`);
    }
  }

  // ---------- Step 6: summary ----------
  section("Summary — what we can sync");
  console.log(`\n  COMPANY record:`);
  console.log(`    - ${populatedNames.length} / ${companyProps.length} properties populated on this example`);
  console.log(`    - ${populatedCustom.length} custom company properties populated`);
  console.log(`    - owner resolvable to name/email`);
  console.log(`    - ${uniqueDealIds.length} deals associated (fetchable in full)`);
  console.log(`    - ${uniqueContactIds.length} contacts associated`);
  console.log(`\n  Which "last activity" properties to use:`);
  const populatedActivity = activityCandidates.filter((n) => isPopulated(cProps[n]));
  if (populatedActivity.length === 0) {
    console.log(`    ⚠ NONE of the activity properties are populated on this company.`);
    console.log(`      Likely explanation: this HubSpot tenant doesn't auto-maintain them.`);
    console.log(`      The engagement timeline (Step 5) is the source of truth instead — derive lastActivity from the max hs_timestamp across engagements.`);
  } else {
    for (const n of populatedActivity) {
      console.log(`    ✓ ${n} = ${fmtDate(cProps[n] as string)}`);
    }
  }
  console.log(``);
}

main().catch((e) => {
  console.error("\n✗ Rich probe failed:", e);
  process.exit(1);
});
