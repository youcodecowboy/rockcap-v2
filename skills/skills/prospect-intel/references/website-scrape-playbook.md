# Website scrape playbook

Concrete steps for fetching a prospect company's website and extracting structured facts for the intel report.

## When to load

Workflow step 2.6 (website discovery + scrape). Runs after Companies House data is in hand but before the wider web search batch. The website often reveals enough specialism + project list to focus subsequent web searches.

## Phase 1 — URL discovery

The CH filing rarely lists a website. Use this order of attempts:

1. **CH profile registered office check.** Some CH profiles include a `Company contact website` field. Check the `companiesHouseCompanies` row's `metadata` if present.
2. **HubSpot custom property check.** If HubSpot has a `website` field on the company, use it. Surface via `companies.get({hubspotCompanyId})`.
3. **Domain heuristic.** Construct candidate URLs from the legal name:
   - Strip "Limited", "Ltd", "PLC", "LLP" suffixes.
   - Lowercase + remove punctuation + replace spaces with nothing (or hyphens).
   - Try in order: `https://{name}.com`, `https://{name}.co.uk`, `https://www.{name}.com`, `https://www.{name}.co.uk`
   - WebFetch each. If status 200 AND content mentions the company name in the first 500 chars, accept.
4. **Web search fallback.** If heuristics fail, run a `WebSearch` query: `"{Legal Name}" official website` and take the top result if it appears to be the company's own site (not Companies House, not Linkedin, not Companies-listing aggregators like endole.co.uk).

Surface the URL in section 2 of the report. If all four phases fail, write "Website: Not found (4 discovery attempts)" and note this in section 9 (gaps) with `kind: "missing_data"`.

## Phase 2 — Page fetching

Once a base URL is found, attempt these page paths in order. Use `WebFetch` with a per-page prompt describing what to extract.

| Order | Path | Why | Extract |
|---|---|---|---|
| 1 | `/` (homepage) | Hero claim, brand voice, top-level navigation | Headline text, tagline, what they say they do, geographic/sector cues |
| 2 | `/about` or `/about-us` or `/who-we-are` | History, principals, scale | Founded year, team size, key principals, value claims |
| 3 | `/team` or `/people` or `/our-team` | Names + bios for cross-reference with CH officers | Names, roles, photos (URL), bios (verbatim quotes) |
| 4 | `/projects` or `/portfolio` or `/developments` or `/case-studies` | THE most valuable page — completed + active projects | Per project: name, location, size (units / sqft), completion year, status |
| 5 | `/contact` or `/contact-us` | Direct contact details | Office address, phone, email (only capture if visible — never guess) |
| 6 | `/news` or `/press` or `/insights` | Self-published news | Top 3-5 dated items with headlines |

For each path: try the path. If it 404s, move to the next variant in the same row. If all variants 404, skip the row and move to the next.

Cap the total at 6 pages per company. Pages beyond that are diminishing returns.

## Phase 3 — Extraction format

For each successfully-fetched page, capture in a structured form. Example for `/projects`:

```
PAGE: https://example-developer.co.uk/projects
FETCHED: 2026-05-25T14:23:00Z
HTTP: 200

EXTRACTED PROJECTS:
- Name: The Mill, Slough
  Location: Slough, Berkshire
  Type: Residential development
  Scale: 42 units
  Status: Completed
  Year: 2024
  Notes: Marketed as "boutique residential", three-storey blocks

- Name: Riverview Place
  Location: Reading
  Type: Mixed-use
  Scale: 28 residential + 4 commercial
  Status: Under construction
  Year: 2025 (projected)
  Notes: Funded by [redacted on website]; planning ref RDG/2024/00187 visible in floor plan caption

VERBATIM HERO TEXT:
"Boutique residential developers building 20-50 unit schemes in the Thames Valley since 2018."

GEOGRAPHIC CUES:
- Logo footer mentions "London + South East"
- Office address: Slough
- All projects in Berks / Bucks / Surrey

SPECIALISM CUES:
- Self-describes as "residential developers"
- No commercial or hospitality projects shown
- Project sizes 20-50 units suggests mid-tier developer (not micro, not major)
```

This structured form feeds directly into section 5 (Track Record) and informs section 7 (Recommended Approach).

## Phase 4 — Cross-checks

Before treating extracted facts as evidence, sanity-check:

1. **Project count vs CH age:** If website claims 50+ completed projects but the company was incorporated 2 years ago, treat with LOW confidence — likely a successor/affiliate of an older entity.
2. **Project location vs registered office:** Mismatch is fine but worth noting in the report (e.g., "Registered in Slough but project portfolio is London — possible operating subsidiary").
3. **Director names vs CH officers:** Take the names from `/team` and check against the CH officers list. Mismatches (people on website not on CH) suggest informal partners or pre-incorporation involvement — worth noting.

## What NOT to capture

- **Email addresses** unless explicitly visible (do not infer "{first}.{last}@{domain}" — that's fabrication).
- **Phone numbers** unless explicitly listed.
- **Financial figures** unless explicitly stated on the website (a "we deliver £100m+ of GDV" tagline is OK to quote; do not extrapolate from project counts).
- **Lender names** from the website unless the website explicitly names them (e.g., a testimonial from a lender). Lender DNA comes from CH charges, not website claims.

## When the website fetch fails

If the homepage returns 200 but reads as a holding page, parked domain, or "Coming soon" page, treat as a website-not-found case. Note in section 2 with a "Website: present but parked" line + capture the URL anyway.

If WebFetch returns timeout / 5xx, retry once after 30 seconds. If it still fails, skip this phase entirely and note the gap.

## Confidence calibration

After this playbook completes, section 2 (Online Presence) confidence is:

- **HIGH** if 4+ pages successfully fetched + structured facts extracted.
- **MED** if 2-3 pages fetched.
- **LOW** if 0-1 pages fetched OR if extracted content contradicts itself.
