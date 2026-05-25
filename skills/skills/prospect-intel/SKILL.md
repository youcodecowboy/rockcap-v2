# prospect-intel

Step 1 of the deal lifecycle. Cold-prospect intelligence and template-mapped reachout.

**v2 hardening (2026-05-25):** the skill now produces a deep multi-source intel report (the `intelMarkdown` field on the skillRun, rendered by the `/prospects/[id]` Intel tab) drawing from Companies House, the prospect's website, web search for company + director signals, and the existing RockCap intelligence base. The narrative `brief` is still the 2-paragraph operator-facing TL;DR; `intelMarkdown` is the full artefact.

## Trigger

Invoke when an operator wants to assess and reach out to a new prospective borrower. Common forms of the trigger:

- "Run prospect intel on {company name}"
- "Look at this developer for me: {Companies House number}"
- "We've seen a planning hit on {company name}, what's their lender DNA?"

The skill takes either a Companies House number or a company name. If only a name is provided, the skill resolves to a Companies House number first; if the resolution is ambiguous, it asks.

## Inputs

Required:

- One of: `companiesHouseNumber` (string, 8 digits or 6 digits prefixed by `SC`, `NI`, etc.) OR `companyName` (string)

Optional but useful:

- `triggerContext` (string): why we're looking at this prospect now. A planning hit, a referral, a charge filing, a press mention.
- `relatedDealContext` (string): if the operator already has a deal context to colour the analysis.
- `clientId` (Convex id): if the prospect already has a `clients` row in `status='prospect'`, pass it so the skill updates the existing row instead of resolving fresh.

## Dedup

- **dedupKey**: the resolved `companiesHouseNumber` (set after step 1 of the workflow).
- **dedupWindowDays**: 7
- **On `status: "duplicate_found"`**: surface the prior run's brief AND the prior `intelMarkdown` to the operator, then ask "refresh (re-run from scratch) or open prior?". Default action is "open prior" unless the operator explicitly asks for a refresh.
- **On `status: "already_running"`** (v1.2): a parallel run is in-flight. Surface the priorRunId + priorRunOwnerId + priorRunStartedAgoMinutes and ASK the operator before starting a competing run. The race-prevention contract: only one prospect-intel run per CH number at a time.
- **Why 7 days**: Companies House charge filings can land any day; a new filing often justifies a fresh DNA analysis. Shorter than 7 risks blocking legitimate refreshes; longer leaves stale conclusions live.

## Cadence package

When the workflow produces a draft outreach (step 11), it does NOT stop at the initial message. Instead it produces a **cadence package**: the initial outreach plus 3 follow-ups, all pre-drafted at queue time, with sequential send dates.

**Why upfront drafting:** the follow-ups reference the initial pitch and intel. Drafting them at queue time keeps the narrative coherent (each follow-up builds on the prior); deferring composition to fire-time loses that thread. Operator approves the full package once (via the v1.2 `/prospects/[id]` Approve & Schedule button, which fires `cadences.approvePackage`).

**Package shape (4 rows in `cadences`, all sharing a `packageId`):**

| Order | Type | nextDueAt offset from now | Content angle |
|---|---|---|---|
| 1 | `prospect_followup` | +0 days (immediate, post-approval) | The cold outreach itself (drawn from template-mapped-reachout reference) |
| 2 | `prospect_followup` | +5 days | Soft nudge referencing the initial; new angle (one fresh piece of intel from sections 2-6 of the report) |
| 3 | `prospect_followup` | +12 days | Stronger close referencing a specific scheme or charge filing (cite from sections 4-5) |
| 4 | `prospect_followup` | +30 days | Final touch with a "should I stop reaching out?" close |

**Implementation:** in workflow step 11, after composing the four messages, call `cadence.create` four times (one per row). Same `packageId` (a UUID generated at step start). `packageOrder` 1-4. Each row carries `preDraftedTouch: { subject, bodyText, bodyHtml }`. `isActive: true`. `sourceSkillRunId` set to the current runId. `packageApprovalStatus: "pending"` by default (v1.2 single-gate approval model).

If a reply arrives at any point, the cadence engine cancels all remaining package members automatically (via the by_contact_active index lookup). No skill action needed.

## Outputs

Persisted to Convex via the MCP tool surface:

1. A `clients` row in `status='prospect'` if one does not already exist for the matched company, OR an update to the existing prospect's `clientIntelligence` row. The clients row is linked via `skillRun.complete({linkedClientId})`.
2. An updated `clientIntelligence` with sections: identity (legal name, trading names, registered address, incorporation date), key people (PSCs, officers), lender DNA summary (the charges-derived view), and an AI summary.
3. Where useful, `knowledgeItems` for specific extracted figures (turnover, ebitda, headcount if visible from HubSpot Beauhurst metadata).
4. Optional: a draft outreach email staged as a pending `approvals` row with `entityType: "client_communication"`. Subject and body composed using the template-mapped reachout reference. Only created if `triggerContext` makes a reachout plausible.
5. **v1.2 hardened:** the rich markdown `intelMarkdown` field on the skillRun row, written via `skillRun.complete({intelMarkdown})`. Structure per `references/intel-report-template.md`.
6. **v1.2 hardened:** if the operator approves the produced package, the clients row's `prospectState` transitions from `drafted` → `active` (via the CRM Approve button calling `cadences.approvePackage` + the reply event processor's downstream transitions). The skill does NOT call `prospect.transitionState` itself — that's an operator action.

What it does not do:

- Does not send email.
- Does not contact the prospect through any channel.
- Does not create a `projects` row. Projects are created when an actual transaction emerges from the prospecting phase.
- Does not promote the prospect to active client status (status remains `prospect`).
- Does not transition `prospectState` directly. Operator does that via the CRM UI.

## High-level workflow

1. **Resolve the company**. If a Companies House number was given, fetch the company profile directly. If a name was given, search Companies House for matches and disambiguate. If multiple plausible matches, surface them and ask. At this point the canonical `companiesHouseNumber` is available; call `skillRun.start` with `dedupKey: companiesHouseNumber`, `dedupWindowDays: 7`, `skillName: "prospect-intel"`. If the response is `duplicate_found`, surface the prior brief + intelMarkdown and ask. If `already_running`, surface the in-flight run and ask before competing. Otherwise proceed with the returned runId.

2. **Fetch Companies House data.** Call `companies.syncCompaniesHouse({chNumber})` (added v1.2.1) — fetches profile + charges directly from the CH API and persists into `companiesHouseCompanies` + `companiesHouseCharges`. Idempotent: safe to call even if data exists; tool upserts. Verify after via `companiesHouse:getCompanyByNumber({companyNumber})`.
   - **Why this comes BEFORE web research:** the structured charges data from CH is more complete than what the company's public CH profile page shows (the website summary doesn't surface the charges sub-page contents). The validation walkthrough on Mccarthy proved this: web-only research returned "no charges"; the CH API returned 2 outstanding charges with specific lender names + a charged property address. **Skipping this step risks producing wrong lender DNA conclusions.**
   - **Officers + PSCs:** the v1.2.1 sync tool does NOT persist these (data-shape adapter not yet built). Fetch them via WebFetch on the CH public site as needed for section 3 of the intel report. Pattern from the validation walkthrough:
     - `WebFetch https://find-and-update.company-information.service.gov.uk/company/{N}/officers` → director list
     - `WebFetch https://find-and-update.company-information.service.gov.uk/company/{N}/persons-with-significant-control` → PSC list
   - **If the tool errors** (`company_not_found_on_companies_house` or `COMPANIES_HOUSE_API_KEY not set`): surface as a gap with `kind: "missing_data"` and continue with web-research-only flow. The report will be sparse but still useful.

3. **Check for existing prospect or client**. If a `clients` row already references this company number, this is an update flow, not a new-prospect flow. Update the existing row's intelligence; do not create a duplicate.

4. **Run Lender DNA analysis**. Load `references/lender-dna-from-charges.md` and follow it. The output is a section of structured findings: which lenders the company has used, which are current, which patterns the charge book reveals. This populates section 4 of the intel report.

5. **Classify the developer type**. Load `references/bridging-vs-developer.md` and follow it. The classification is one of: bridging-suitable, development-finance-suitable, term-loan-suitable, unclassifiable. The classification colours the reachout angle and the lender match. This populates the Classification subsection of section 7.

6. **Discover + scrape the prospect's website**. Load `references/website-scrape-playbook.md` and follow phases 1-4. The output populates section 2 (Online Presence) and feeds project facts into section 5 (Track Record).

7. **Company-level web search**. Load `references/web-research-playbook.md` and follow Phase A (7 company-level queries). Output populates section 2 (news mentions), section 5 (partnerships), section 6 (recent signals).

8. **Director-level web search**. Load `references/web-research-playbook.md` and follow Phase B (4 queries × top 2 directors). Output populates section 3 (Key People).

9. **Cross-reference checks**. Follow `references/web-research-playbook.md` Phase C — Convex intelligence lookups for prior connections, address cross-check, sister entity check. Output enriches sections 3 and 4.

10. **Persist intelligence**. Write the findings to `clientIntelligence` and any specific data points to `knowledgeItems`. Cite sources (Companies House filing numbers, charge IDs, URLs scraped with timestamps, web search queries used). Build the full markdown report following `references/intel-report-template.md` — all 9 sections, in order, with confidence levels.

11. **If a reachout is appropriate, draft it**. Load `references/template-mapped-reachout.md`, select the template that matches the classification and trigger context, populate the variables. If a reachout is not appropriate (no contact, no trigger reason, recent contact already made), say so and stop. After composing, queue the full cadence package via `cadence.create` per the `## Cadence package` section above. The cadences land with `packageApprovalStatus: "pending"`; the operator approves the package via the CRM detail page.

12. **Return**. Call `skillRun.complete` with:
    - `status: "complete"` if everything ran, or `"complete_with_gaps"` if any gap was surfaced
    - `brief`: two-paragraph narrative summary (operator-facing TL;DR — what we found, what we recommend)
    - `intelMarkdown`: the full report from step 10, built per `references/intel-report-template.md`
    - `linkedClientId`: the clients row id
    - `linkedApprovalIds`: any approvals staged in step 11
    - `gaps`: any gaps captured along the way

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. The four that matter most for this skill:

- **Evidence-first.** Every lender DNA finding cites a Companies House charge ID. Every classification cites the patterns that drove it. Every web finding cites the URL + retrieved date. Every website claim cites the URL + scrape timestamp.
- **No fabrication.** If a charge name is ambiguous, qualify it ("possibly a security agent for a syndicate") rather than guessing the underlying lender. If a director's LinkedIn is not findable, say so — do not link to a similar-named profile. If a press mention can't be found in 4 queries, say "no press mentions found in N queries", not "low public profile" (the inference is fine; the confidence label conveys it).
- **No padding.** The report can be short. If a section has no findings, write "No findings (queries tried: ...)" rather than padding with speculation. Section 9 (gaps) is the legitimate way to record what couldn't be found.
- **UK English throughout.** No em dashes. No rule-of-three. GBP currency. ISO date format `YYYY-MM-DD` for dates in evidence; longer prose dates OK in narrative ("filed in March 2025").

## Tool dependencies

This skill calls these MCP-exposed tools (or their pre-MCP atomic-tool equivalents during the transition):

- `companies-house.searchCompanies`, `companies-house.getCompanyProfile`, `companies-house.getCharges`, `companies-house.getOfficers`, `companies-house.getPSC` — for step 2 (CH data fetch)
- `companiesHouse:getCompanyByNumber` (Convex query) — for step 2 sync check
- `client.list`, `client.get`, `client.create`, `client.checkExists` — for step 3
- `intelligence.getClientIntelligence`, `intelligence.updateClientIntelligence`, `intelligence.addKnowledgeItem`, `intelligence.searchLenders`, `intelligence.searchPeople` — for steps 3, 9, 10
- `contact.get`, `contact.getByClient` — for step 11 contact resolution
- `approval.create` — for step 11 (staged reachout)
- `cadence.create` — for step 11 (cadence package, 4 calls)
- `skillRun.start` (with dedup) — for step 1
- `skillRun.complete` (with intelMarkdown) — for step 12

The skill also uses **Claude Code's native tools**, available in every Claude Code session:

- `WebSearch` — for steps 7, 8, 9 (web research playbook)
- `WebFetch` — for step 6 (website scrape playbook) and step 7 (following up on search hits)

If any required MCP tool is unavailable, the skill stops and reports what it tried to call. If `WebSearch` or `WebFetch` is unavailable (rare; only if running outside Claude Code), the skill produces sections 1, 3, 4, 5 from CH data alone and surfaces a gap explaining sections 2, 6 are absent.

## What goes wrong

The most common failure modes the skill is built to handle:

1. **Multiple Companies House matches for the same name.** The skill surfaces top three by incorporation date and SIC code, asks the operator to pick.
2. **No charges on file.** Either a very young company or one with no secured borrowings. The skill says so explicitly in section 4; classification falls back on company age, incorporation date, and visible Beauhurst/HubSpot signals.
3. **A name that resolves to a dissolved company.** The skill checks status; if dissolved, returns sections 1 + 4 + a short brief and stops. Reactivation flow is not in this skill's scope.
4. **A prospect that's already been touched recently.** The skill checks `touchpoints` for outbound contact in the last 90 days; if found, qualifies the reachout draft accordingly or stops if a recent send is still awaiting a reply.
5. **Sparse Companies House data (small or recently incorporated).** Classification confidence is reported low; the operator decides whether to proceed.
6. **Website not findable (v2).** Phases 1-4 of the website scrape playbook fail. Section 2 is short, gap is recorded, web research in Phase A relies on press / planning queries alone.
7. **Director name doesn't match real-person searches (v2).** Common for very common names or pseudonyms. Phase B logs "Not found in N queries" and moves on. Section 3 is sparse, gap recorded.
8. **All web queries return promotional/SEO results.** Filter rules in the web research playbook discard these. If 5+ queries all hit only SEO spam, the report notes this in section 2 ("Web research returned only promotional results; possibly indicates a low-profile entity OR strong SEO content marketing — operator judgment required").
9. **CH data not synced.** Workflow step 2 calls `companies.syncCompaniesHouse({chNumber})` (added v1.2.1) which fetches + persists profile + charges from the CH API directly. The tool may error with `company_not_found_on_companies_house` (CH 404 — verify the number) or `COMPANIES_HOUSE_API_KEY not set` (Convex env misconfig). On either, surface as a `missing_data` gap and continue with web-research-only flow.
10. **WebFetch hits a paywall.** The playbook documents the URL with a "[paywall]" tag and moves on. Don't try to bypass.

## References

Loaded on demand during the workflow:

- `references/lender-dna-from-charges.md` — how to extract lender DNA from the charge book and what patterns to look for. (Step 4.) Authored.
- `references/bridging-vs-developer.md` — classification rules with signal-weighting table. (Step 5.) Authored.
- `references/template-mapped-reachout.md` — reachout templates per classification with operating principles + tone rules. (Step 11.) Authored.
- **`references/intel-report-template.md`** (v2) — full markdown structure for the `intelMarkdown` field. (Step 10.)
- **`references/website-scrape-playbook.md`** (v2) — URL discovery + page fetching + extraction format. (Step 6.)
- **`references/web-research-playbook.md`** (v2) — exact queries for company-level + director-level + cross-reference research. (Steps 7, 8, 9.)

## Corpora (planned)

The `corpora/` directory will hold 2-3 anonymised exemplars of good intel reports, populated from the first hardened runs in v1.2.1. Until then, the playbooks above are the only ground truth.
