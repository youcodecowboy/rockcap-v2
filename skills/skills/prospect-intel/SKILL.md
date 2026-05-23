# prospect-intel

Step 1 of the deal lifecycle. Cold-prospect intelligence and template-mapped reachout.

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

## Dedup

- **dedupKey**: the resolved `companiesHouseNumber` (set after step 1 of the workflow).
- **dedupWindowDays**: 7
- **On duplicate**: surface the prior run's brief and ask the operator
  "refresh (re-run from scratch) or open prior?". Default action is "open prior"
  unless the operator explicitly asks for a refresh.
- **Why 7 days**: Companies House charge filings can land any day; a new filing
  often justifies a fresh DNA analysis. Shorter than 7 risks blocking legitimate
  refreshes; longer leaves stale conclusions live.

## Outputs

Persisted to Convex:

1. A `clients` row in `status='prospect'` if one does not already exist for the matched company, OR an update to the existing prospect's `clientIntelligence` row.
2. An updated `clientIntelligence` with sections: identity (legal name, trading names, registered address, incorporation date), key people (PSCs, officers), lender DNA summary (the charges-derived view), and an AI summary.
3. Where useful, `knowledgeItems` for specific extracted figures (turnover, ebitda, headcount if visible from HubSpot Beauhurst metadata).
4. Optional: a draft outreach email staged as a pending `approvals` row with `entityType: "client_communication"`. Subject and body composed using the template-mapped reachout reference. Only created if `triggerContext` makes a reachout plausible.

What it does not do:

- Does not send email.
- Does not contact the prospect through any channel.
- Does not create a `projects` row. Projects are created when an actual transaction emerges from the prospecting phase.
- Does not promote the prospect to active client status.

## High-level workflow

1. **Resolve the company**. If a Companies House number was given, fetch the company profile directly. If a name was given, search Companies House for matches and disambiguate. If multiple plausible matches, surface them and ask. At this point the canonical `companiesHouseNumber` is available; call `skillRun.start` with `dedupKey: companiesHouseNumber`, `dedupWindowDays: 7` per the `## Dedup` section above. If the response is `duplicate_found`, surface the prior brief and ask the operator before continuing.
2. **Fetch Companies House data**. Profile, charges, officers, PSCs. Capture each into the relevant Convex tables (`companiesHouseCompanies`, `companiesHouseCharges`, `companiesHouseOfficers`, `companiesHousePSC`).
3. **Check for existing prospect or client**. If a `clients` row already references this company number, this is an update flow, not a new-prospect flow. Update the existing row's intelligence; do not create a duplicate.
4. **Run Lender DNA analysis**. Load `references/lender-dna-from-charges.md` and follow it. The output is a section of structured findings: which lenders the company has used, which are current, which patterns the charge book reveals.
5. **Classify the developer type**. Load `references/bridging-vs-developer.md` and follow it. The classification is one of: bridging-suitable, development-finance-suitable, term-loan-suitable, unclassifiable. The classification colours the reachout angle and the lender match.
6. **Persist intelligence**. Write the findings to `clientIntelligence` and any specific data points to `knowledgeItems`. Cite sources (Companies House filing numbers, charge IDs, document IDs).
7. **If a reachout is appropriate, draft it**. Load `references/template-mapped-reachout.md`, select the template that matches the classification and trigger context, populate the variables, stage an `approvals` row. If a reachout is not appropriate (no contact, no trigger reason, recent contact already made), say so and stop.
8. **Return a brief**. Two paragraphs maximum. What we found, what we recommend doing about it. Hand the operator the structured intelligence link and the staged approval link.

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. The two that matter most for this skill:

- **Evidence-first.** Every lender DNA finding cites a Companies House charge ID. Every classification cites the patterns that drove it.
- **No fabrication.** If a charge name is ambiguous, qualify it ("possibly a security agent for a syndicate") rather than guessing the underlying lender.

## Tool dependencies

This skill calls these MCP-exposed tools (or their pre-MCP atomic-tool equivalents during the transition):

- `companies-house.searchCompanies`, `companies-house.getCompanyProfile`, `companies-house.getCharges`, `companies-house.getOfficers`, `companies-house.getPSC`
- `client.list`, `client.get`, `client.create`, `client.checkExists`
- `intelligence.getClientIntelligence`, `intelligence.updateClientIntelligence`, `intelligence.addKnowledgeItem`
- `approval.create` (for the staged reachout)
- `companies-house.getCompanyCharges` for the deep charge enrichment per the Lender DNA reference

If any required tool is unavailable, the skill stops and reports what it tried to call.

## What goes wrong

The most common failure modes the skill is built to handle:

1. **Multiple Companies House matches for the same name.** The skill surfaces top three by incorporation date and SIC code, asks the operator to pick.
2. **No charges on file.** Either a very young company or one with no secured borrowings. The skill says so explicitly; classification falls back on company age, incorporation date, and any visible HubSpot/Beauhurst signals.
3. **A name that resolves to a dissolved company.** The skill checks status; if dissolved, returns the finding and stops. Reactivation flow is not in this skill's scope.
4. **A prospect that's already been touched recently.** The skill checks `touchpoints` for outbound contact in the last 90 days; if found, qualifies the reachout draft accordingly or stops if a recent send is still awaiting a reply.
5. **Sparse Companies House data (small or recently incorporated).** Classification confidence is reported low; the operator decides whether to proceed.

## References

Loaded on demand during the workflow:

- `references/lender-dna-from-charges.md` — how to extract lender DNA from the charge book and what patterns to look for.
- `references/bridging-vs-developer.md` — classification rules (not yet authored).
- `references/template-mapped-reachout.md` — reachout templates per classification (not yet authored).
