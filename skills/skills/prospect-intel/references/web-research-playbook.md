# Web research playbook

Exact queries to run via `WebSearch` and `WebFetch` to surface news, signals, and people-research for a prospect company.

## When to load

Workflow steps 2.7 (company-level web research) and 2.8 (director-level web research). Runs after the website scrape is complete, so the report has the company's own framing before external research either confirms or contradicts it.

## Phase A — Company-level searches

Run these 7 queries in order. Use `WebSearch` for each. For each result of interest, follow up with `WebFetch` to extract the actual content.

| # | Query template | What we're hunting | Discard if |
|---|---|---|---|
| 1 | `"{Legal Name}" property development` | General presence + portfolio context | Result is Companies House aggregator / directory only |
| 2 | `"{Legal Name}" planning permission` | Active planning hits | Result is the company's own website (already captured) or a stale 5+ year old item |
| 3 | `"{Trading Name}" news {YYYY}` (current year) | Press mentions this year | Result is older than 12 months |
| 4 | `"{Trading Name}" {YYYY-1} OR {YYYY-2}` (last two years) | Press mentions prior | Result is purely promotional / paid placement |
| 5 | `"{Legal Name}" OR "{Trading Name}" GDV OR "gross development value"` | Scale claims in trade press | Result doesn't mention a specific figure |
| 6 | `"{Legal Name}" administration OR liquidation OR CVA` | Distress signals | Result is about an unrelated entity (verify CH number match) |
| 7 | `"{Trading Name}" architect OR contractor` | Partnership signals | No specific partnership named |

For each run: capture the top 3-5 results. For each result that passes the discard criteria, format the finding as:

```
QUERY: "exact query string"
RESULT: {title}
URL: {URL}
DATE: {publish date if visible; else "no date on page"}
SUMMARY: {2-3 sentence summary of relevance to this prospect}
EVIDENCE QUOTE: "{1 sentence verbatim from the result that earns its inclusion}"
```

These findings feed into section 2 (Online Presence — news mentions), section 5 (Track Record — partnerships), and section 6 (Recent Signals — recent press / distress signals).

## Phase B — Director-level searches

Identify the top 2 directors by CH appointment recency. (If only 1 director, do 1. If more than 2 are functionally the same person — e.g., husband and wife founders — pick the most prominent.)

For each director, run these 4 queries:

| # | Query template | What we're hunting | Capture |
|---|---|---|---|
| 1 | `"{Director Full Name}" "{Legal Name}"` | Direct co-occurrence in press | Press quotes, profile pages, interviews |
| 2 | `"{Director Full Name}" property developer OR director` | Independent profile pages | LinkedIn URL, profile bios, prior roles |
| 3 | `"{Director Full Name}" site:linkedin.com` | LinkedIn specifically | LinkedIn profile URL only (don't try to scrape behind the wall) |
| 4 | `"{Director Full Name}" director companies house` | Other directorships beyond what CH officer search shows | Cross-reference any other companies named |

Same capture format as Phase A. These feed into section 3 (Key People) per director sub-section.

## Phase C — Cross-reference checks

After Phases A + B, run 2-3 targeted cross-reference queries:

1. **Connection check.** For each director, see if they've co-directed with anyone in the RockCap intelligence base. Run a Convex query: `intelligence.searchPeople({name: directorName})` to find existing records.
2. **Address cross-check.** Search the registered address: `"{registered address}" property` to see if other property entities share the address (multi-SPV pattern).
3. **Sister entity check.** If the company name contains a distinctive identifier (e.g., "Mccarthy Property Developments"), search `"Mccarthy Property" companies house` to find sister entities under similar branding.

These feed into section 3 (connection signal) and section 4 (lender DNA patterns).

## Filtering rules

For each result, apply in order:

1. **Recency filter.** Press / news older than 12 months goes in only if there's no recent alternative AND the older item is materially relevant (e.g., a 3-year-old planning hit that's still in delivery).
2. **Authority filter.** Prefer named publications (Property Week, Bisnow, EG, BDC Magazine, BD, Building, local press), trade bodies (HBF, BPF), and government sources (planning portals, CH, HMRC public data). Discard SEO blog spam, paid press releases that are obviously promotional with no editorial substance, and aggregator sites that just republish CH data.
3. **Relevance filter.** The result must mention the specific company (not a similarly-named one). Verify by CH number if cited, or by registered address, or by director name.
4. **Originality filter.** If 3 results are clearly the same story republished, keep the most authoritative single source and discard the rest.

## Cap on queries

Don't run more than 15 total queries per prospect (7 company + 8 director-level). If you've burned the cap and still have gaps, surface them as `gaps` entries on `skillRun.complete` rather than running more queries. The cap is a backstop against runaway web-research costs.

## What to capture as gaps

If a query that should produce evidence comes up empty, that's a finding worth noting:

- "No press mentions found in 4 queries spanning 2 years" → useful signal (the company is quiet; possibly small-scale or new)
- "Director LinkedIn not findable" → useful signal (low online profile; consider warm-intro approach over cold outreach)
- "No planning hits found" → useful signal (either nothing on-site or the planning data is regional-portal-only and not in Google's index)

Surface these as `gap.kind: "thin_evidence"` entries on the skillRun, mirrored into section 9 of the report.

## What NOT to do

- **Don't fabricate sources.** If you can't find a press mention, the report says "No press mentions found", not "Likely featured in industry press around 2023".
- **Don't follow paywall links.** If WebFetch returns a paywall page or login wall, don't try to bypass. Note the URL with a "[paywall]" tag and move on.
- **Don't extract opinions as facts.** A blog post saying "{company} is one of the top developers in Slough" is an opinion, not evidence. Quote it as opinion if useful, but don't promote it to a fact in section 5 (Track Record).
- **Don't run additional searches "for completeness".** Stay within the 15-query cap. Surface gaps; don't paper over them.

## Confidence calibration

After Phases A + B + C complete:

- **HIGH** for section 2 / 3 / 5 / 6 if 5+ corroborating results across multiple sources.
- **MED** if 2-4 results.
- **LOW** if 0-1 results.

Section 6 (Recent Signals) specifically requires at least one query result from the last 90 days to be MED or HIGH. If all evidence is older than 90 days, section 6 is LOW with "No recent signals found".
