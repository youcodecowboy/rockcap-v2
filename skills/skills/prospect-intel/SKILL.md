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

**Contactless held drafts (Phase 3):** the package is composed and queued **whether or not** a verified contact email exists. When one exists, pass `contactId` and the rows land `pending` as above. When none exists, **omit `contactId`** on all four calls: `cadence.create` then forces the rows to `isActive: false` + `packageApprovalStatus: "needs_contact"` + `needsContact: true` — a held draft that is reviewable on the board but that the dispatcher will never fire (it polls only active + approved rows). Step 11 also records a `no_contact` gap in that case. The drafts are never blocked by a missing contact; they are held until one is attached.

If a reply arrives at any point, the cadence engine cancels all remaining package members automatically (via the by_contact_active index lookup). No skill action needed.

## Outputs

Persisted to Convex via the MCP tool surface:

1. A `clients` row in `status='prospect'` if one does not already exist for the matched company, OR an update to the existing prospect's `clientIntelligence` row. The clients row is linked via `skillRun.complete({linkedClientId})`.
2. An updated `clientIntelligence` with sections: identity (legal name, trading names, registered address, incorporation date), key people (PSCs, officers), lender DNA summary (the charges-derived view), and an AI summary.
3. Where useful, `knowledgeItems` for specific extracted figures (turnover, ebitda, headcount if visible from HubSpot Beauhurst metadata).
4. Optional: a draft outreach email staged as a pending `approvals` row with `entityType: "client_communication"`. Subject and body composed using the template-mapped reachout reference. Only created if `triggerContext` makes a reachout plausible.
5. **v1.2 hardened:** the rich markdown `intelMarkdown` field on the skillRun row, written via `skillRun.complete({intelMarkdown})`. Structure per `references/intel-report-template.md`.
6. **Prospect state:** the skill sets `prospectState: "researched"` on completion (via `prospect.transitionState`, step 12), reflecting that intel now exists for this prospect. It only sets `researched` if the prospect has no later state yet — it never downgrades a prospect already in `drafted`/`active`/etc. Later transitions are operator-driven: once the operator approves the produced cadence package, the CRM Approve button (`cadences.approvePackage`) and the reply event processor advance the state through `drafted` → `active` and beyond.

7. **Draft per-scheme enrichment (v1.2.5):** one `prospectSchemes` row per live SPV, written via `companies.upsertProspectScheme` in step 10b. Each row is a draft (`operatorConfirmed: false`) containing the best available estimate of what the scheme is building — type, unit count, GDV range, planning references, confidence label, and source URLs. The operator confirms each row in the prospect detail Track Record tab; confirmed rows are never clobbered by a re-run.

What it does not do:

- Does not send email.
- Does not contact the prospect through any channel.
- Does not create a `projects` row. Projects are created when an actual transaction emerges from the prospecting phase.
- Does not promote the prospect to active client status (status remains `prospect`).
- Does not drive `prospectState` beyond the initial `researched`. Transitions past `researched` (`drafted`, `active`, and onward) are operator-driven via the CRM UI + the cadence/reply machinery.

## High-level workflow

1. **Resolve the company**. If a Companies House number was given, fetch the company profile directly. If a name was given, search Companies House for matches and disambiguate. If multiple plausible matches, surface them and ask. At this point the canonical `companiesHouseNumber` is available; call `skillRun.start` with `dedupKey: companiesHouseNumber`, `dedupWindowDays: 7`, `skillName: "prospect-intel"`. If the response is `duplicate_found`, surface the prior brief + intelMarkdown and ask. If `already_running`, surface the in-flight run and ask before competing. Otherwise proceed with the returned runId.

2. **Fetch Companies House data.** Call `companies.syncCompaniesHouse({chNumber})` (added v1.2.1) — fetches profile + charges directly from the CH API and persists into `companiesHouseCompanies` + `companiesHouseCharges`. Idempotent: safe to call even if data exists; tool upserts. Verify after via `companiesHouse:getCompanyByNumber({companyNumber})`.
   - **Why this comes BEFORE web research:** the structured charges data from CH is more complete than what the company's public CH profile page shows (the website summary doesn't surface the charges sub-page contents). The validation walkthrough on Mccarthy proved this: web-only research returned "no charges"; the CH API returned 2 outstanding charges with specific lender names + a charged property address. **Skipping this step risks producing wrong lender DNA conclusions.**
   - **Officers + PSCs:** the v1.2.1 sync tool does NOT persist these (data-shape adapter not yet built). Fetch them via WebFetch on the CH public site as needed for section 3 of the intel report. Pattern from the validation walkthrough:
     - `WebFetch https://find-and-update.company-information.service.gov.uk/company/{N}/officers` → director list
     - `WebFetch https://find-and-update.company-information.service.gov.uk/company/{N}/persons-with-significant-control` → PSC list
   - **If the tool errors** (`company_not_found_on_companies_house` or `COMPANIES_HOUSE_API_KEY not set`): surface as a gap with `kind: "missing_data"` and continue with web-research-only flow. The report will be sparse but still useful.

3. **Check for existing prospect or client**. If a `clients` row already references this company number, this is an update flow, not a new-prospect flow. Update the existing row's intelligence; do not create a duplicate.

4. **Run Lender DNA analysis**. Load `references/lender-dna-from-charges.md` and follow it. The output is a section of structured findings: which lenders the company has used, which are current, which patterns the charge book reveals. This populates section 4 of the intel report. **When the prospect borrows through per-scheme SPVs (so the anchor company shows few or no charges), the group rollup `companies.getGroupCharges` from step 8b gives charge COUNTS per lender, not which lender sits on which scheme.** Do not name or characterise a lender's schemes (size, prime-ness) from counts; read the per-SPV charge register (`.../company/{N}/charges`) first. See the reference's "What not to do" for why (a past run mischaracterised a lender's schemes from counts alone).

5. **Classify the developer type + size the deal**. Load `references/bridging-vs-developer.md` and follow it. The classification is one of the four canonical deal types: `new_development`, `bridging`, `existing_asset`, `unclassifiable`. The classification colours the reachout angle and the lender match. Then load `../../shared-references/deal-type-size-bands.md` and derive an indicative deal-size range (a range + confidence + "based on X" basis line is mandatory; a naked number is forbidden; `unclassifiable` produces no size estimate). Both outputs populate the Recommended Approach (section 7) of the intel report and are required, not optional.

6. **Discover + scrape the prospect's website**. Load `references/website-scrape-playbook.md` and follow phases 1-4. The output populates section 2 (Online Presence) and feeds project facts into section 5 (Track Record).

7. **Company-level web search**. Load `references/web-research-playbook.md` and follow Phase A (7 company-level queries). Output populates section 2 (news mentions), section 5 (partnerships), section 6 (recent signals).

8. **Director-level web search + email discovery**. Load `references/web-research-playbook.md` and follow Phase B (5 queries × top 2 directors). For each director, ALSO call `apollo.findEmail({firstName, lastName, companyName})` — Apollo's people-match API returns business email + status + LinkedIn URL faster and more reliably than web search. Capture the email + status in section 3 of the report. **Email status semantics:**
    - `verified`: safe for outreach. Use as the cadence's target email.
    - `unverified`: present in Apollo's index but not SMTP-verified. Note in section 3; cadence engine should refuse to fire on this — operator must manually verify before approving the package.
    - `questionable` / `spam_trap`: do NOT use; flag as risk in section 7.
    - `unavailable` or `not found`: Apollo has no email; fall back to web research (LinkedIn personal profile, company website contact page) and surface as a gap if still unfindable. Without an email the package is still drafted — it lands **contactless** (`needs_contact`, held/inactive) so the drafts are reviewable on the board (see step 11), and a `no_contact` gap is recorded so the operator knows a contact must be attached before anything can send. Outreach is held, not blocked.

8b. **Map the corporate group (related entities).** Invoke the `../../sub-skills/resolve-related-entities` sub-skill for the prospect's **majority controllers** — every majority PSC and each key director. It walks each controller's other Companies House appointments via `companies.getOfficerAppointments({appointmentsLink})` (the link persisted on each `companiesHouseOfficers` row by step 2's sync) and returns the corporate group: the likely trading parent + likely sibling SPVs (matched on shared name root per the `{Sponsor} ({Scheme}) Limited` convention and/or shared registered office), split active vs dissolved. Persist **both** outputs the sub-skill specifies: the prose `borrower.related_entities` knowledge item **and** the structured group CH-number set via `clients.setProspectFacts({clientId, relatedCompaniesHouseNumbers})` (the siblings + parent, excluding the prospect's own number). The structured persist is what lights up the prospect detail **CH-tab "Group charges" rollup** (`companies.getGroupCharges` aggregates the group's whole charge book); the prose item drives the narrative subsection. **Surface-only: do NOT create `clients`/`companies` rows for the discovered appointments** — persisting the CH numbers as metadata on the prospect is not the same as standing up entity rows. Output populates the "Corporate group / related entities" subsection of section 3. **Why this matters:** a single CH number understates a developer's SPV-spread lender DNA — the prospect may be one scheme vehicle, not the trading parent. Walking the controller's appointments reveals the sibling SPVs (likely each carrying their own charges) so the lender-DNA picture in section 4 is read in the context of the whole group, not one node. This directly addresses the prior "single-CH-number understates SPV lender DNA" gap. If the controller's `appointmentsLink` is absent, or the appointment list resolves to a different individual (DOB mismatch), the sub-skill records that and the subsection notes it — see the sub-skill's `## What goes wrong`.

9. **Cross-reference checks**. Follow `references/web-research-playbook.md` Phase C — Convex intelligence lookups for prior connections, address cross-check, sister entity check. Output enriches sections 3 and 4.

10. **Persist intelligence**. Write the findings to `clientIntelligence` and any specific data points to `knowledgeItems`. Cite sources (Companies House filing numbers, charge IDs, URLs scraped with timestamps, web search queries used). Build the full markdown report following `references/intel-report-template.md` — all 9 sections, in order, with confidence levels.

    **Also call `clients.setProspectFacts({clientId, companiesHouseNumber, website, primaryDirectorName, primaryContactId, dealType, dealSizeRange})` (v1.2.4; dealType + dealSizeRange added Phase 2)** to populate the structured fields on the clients row. These are the canonical source for the CRM aside / PeopleTab / OverviewTab / prospects table — promoted out of intelMarkdown regex extraction so the UI doesn't depend on the report's template shape. Pass:
    - `companiesHouseNumber`: the resolved CH number (always pass if known)
    - `website`: the URL discovered in step 6 (or omit if "Not found" after 4 attempts)
    - `primaryDirectorName`: the lead director name as it should appear in the UI (e.g., "Stephen John Mccarthy" or "Shane Gordon")
    - `primaryContactId`: the Convex id of the primary contact created/found in step 11 (call setProspectFacts AGAIN after step 11 if the contact didn't exist when step 10 ran)
    - `dealType`: the canonical deal-type code from step 5 (`new_development` / `bridging` / `existing_asset` / `unclassifiable`)
    - `dealSizeRange`: the indicative deal-size display string from step 5 — the range + confidence + basis line (e.g., "£2-5m, medium confidence, based on Woodberry Park 48 units"). Omit for `unclassifiable`. Never a naked number.

10b. **Enrich live schemes (Track Record).** Load `references/scheme-from-charges.md` and follow it. Call `companies.getProspectSchemes({clientId})` to get the group's live schemes (the charge-bearing SPVs), then for the 5-7 most recent run the deep address → planning/web research and persist a draft estimate per scheme via `companies.upsertProspectScheme` (operatorConfirmed defaults false; the operator confirms in the Track Record tab). Estimates only, every figure cited. This populates the prospect detail Track Record tab.

11. **Always compose the cadence package** (unless a reachout is genuinely inappropriate — see the stop conditions below). Load `references/template-mapped-reachout.md`, select the template that matches the classification and trigger context, populate the variables, and compose all four touches per the `## Cadence package` section above. Then queue the package via `cadence.create` (four calls, same `packageId`, `packageOrder` 1-4). The contact situation decides HOW the rows land — not WHETHER they are created:

    - **Verified contact email exists** → pass `contactId` on every `cadence.create` call. The rows land with `packageApprovalStatus: "pending"` (the v1.2 single-gate model); the operator approves the package via the CRM detail page.
    - **No usable contact email** (Apollo `unavailable`/`not found`, or `emailStatus` blocks send) → **omit `contactId`** on every `cadence.create` call. The rows land **contactless**: the mutation forces `isActive: false` + `packageApprovalStatus: "needs_contact"` + `needsContact: true`, so the drafts are fully reviewable on the board but the dispatcher can never fire them. **Also record a `no_contact` gap** (`kind: "missing_data"`) so the operator is prompted to attach a verified contact, which makes the package fireable. Do NOT stop — the drafts are the deliverable.

    **Stop conditions (no package at all):** only skip drafting when a reachout is genuinely not warranted — no trigger reason, a dissolved company, or a recent outbound send still awaiting a reply (see `## What goes wrong`). In those cases, say so and stop; missing contact is NOT one of these — it produces a held draft, not a stop.

    The v1.2.4 fire-time email guard remains intact in both branches: even an approved package will not send until the target contact has a valid, non-blocked email — that is the point of the held `needs_contact` state.

12. **Return**. Call `skillRun.complete` with:
    - `status: "complete"` if everything ran, or `"complete_with_gaps"` if any gap was surfaced
    - `brief`: two-paragraph narrative summary (operator-facing TL;DR — what we found, what we recommend)
    - `intelMarkdown`: the full report from step 10, built per `references/intel-report-template.md`
    - `linkedClientId`: the clients row id
    - `linkedApprovalIds`: any approvals staged in step 11
    - `gaps`: any gaps captured along the way

    **Then set the prospect state.** After `skillRun.complete` returns, call `prospect.transitionState({ clientId, newState: "researched" })` to mark that intel now exists for this prospect. Guard against downgrade: only do this if the prospect has no later state yet (i.e., `prospectState` is unset or already `researched`). If the prospect is already in `drafted`, `active`, or any later state — because a prior run drafted a cadence or the operator has advanced it — do NOT call this; leave the later state intact. All transitions past `researched` are operator-driven (CRM Approve button + reply processor); the skill only owns this one initial transition.

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. The four that matter most for this skill:

- **Evidence-first.** Every lender DNA finding cites a Companies House charge ID. Every classification cites the patterns that drove it. Every web finding cites the URL + retrieved date. Every website claim cites the URL + scrape timestamp.
- **No fabrication.** If a charge name is ambiguous, qualify it ("possibly a security agent for a syndicate") rather than guessing the underlying lender. If a director's LinkedIn is not findable, say so — do not link to a similar-named profile. If a press mention can't be found in 4 queries, say "no press mentions found in N queries", not "low public profile" (the inference is fine; the confidence label conveys it).
- **No padding.** The report can be short. If a section has no findings, write "No findings (queries tried: ...)" rather than padding with speculation. Section 9 (gaps) is the legitimate way to record what couldn't be found.
- **UK English throughout.** No em dashes. No rule-of-three. GBP currency. ISO date format `YYYY-MM-DD` for dates in evidence; longer prose dates OK in narrative ("filed in March 2025").
- **Report-as-standalone-artefact.** Never reference another prospect, client, lender, or prior skillRun in this report. No "materially stronger than X", no "unlike Y", no "similar to Z's pattern". The report is shown to lenders, attached to credit memos, sometimes shared with the prospect. State findings on their own merits with evidence; use ARCHETYPE language for patterns ("textbook bridge-to-term") not COMPARISON language ("matches X's pattern"). See `references/intel-report-template.md` for full rule.

## Tool dependencies

This skill calls these MCP-exposed tools (or their pre-MCP atomic-tool equivalents during the transition):

- `companies-house.searchCompanies`, `companies-house.getCompanyProfile`, `companies-house.getCharges`, `companies-house.getOfficers`, `companies-house.getPSC` — for step 2 (CH data fetch)
- `companiesHouse:getCompanyByNumber` (Convex query) — for step 2 sync check
- `client.list`, `client.get`, `client.create`, `client.checkExists` — for step 3
- `intelligence.getClientIntelligence`, `intelligence.updateClientIntelligence`, `intelligence.addKnowledgeItem`, `intelligence.searchLenders`, `intelligence.searchPeople` — for steps 3, 9, 10
- `contact.get`, `contact.getByClient` — for step 11 contact resolution
- `approval.create` — for step 11 (staged reachout)
- `cadence.create` — for step 11 (cadence package, 4 calls)
- `apollo.findEmail` — for step 8 (per-director email discovery; the v1.2.3 capability; cached 30 days at v1.2.4)
- `companies.syncCompaniesHouse` — for step 2 (CH profile + charges sync)
- `companies.getOfficerAppointments` — for step 8b (corporate-group mapping; consumes the `appointmentsLink` persisted on each officer row by step 2, via the `resolve-related-entities` sub-skill)
- `contact.getByClient` — for step 11 (resolve the prospect's contact for cadence wiring)
- `clients.setProspectFacts` — for step 10 (populate structured prospect facts on the clients row; v1.2.4)
- `companies.getProspectSchemes` — for step 10b (read the group's live schemes + candidate addresses parsed from charge particulars).
- `companies.upsertProspectScheme` — for step 10b (persist the per-scheme "what they're building" draft estimate; operator confirms in the Track Record tab).

**Important — cadence email guard (v1.2.4):** when you pass a `contactId`, `cadence.create` refuses to queue a cadence for a contact with no email OR with `emailStatus` in [questionable, spam_trap, invalid, bounced]. If you encounter this error in step 11, either fix the upstream contact via `apollo.findEmail` + `contact.update` (or pick a different contact) and retry, OR omit `contactId` to land a held `needs_contact` draft for board review (Phase 3 — see step 11). The guard surfaces the gap at cadence-creation time rather than at fire time. The guard does not apply when `contactId` is omitted (there is no contact to validate); the contactless held state is what prevents an unaddressed send.
- `skillRun.start` (with dedup) — for step 1
- `skillRun.complete` (with intelMarkdown) — for step 12
- `prospect.transitionState` — for step 12 (set `prospectState: "researched"` on completion, guarded against downgrade)

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
- `../../shared-references/spv-structure-canon.md` — canonical UK property finance SPV chain (Sponsor → Borrower SPV → Lender SPV → Lender → Agent + Guarantors). Loaded when interpreting Companies House charges + officers + PSC data: helps recognise `Sponsor (X) Limited` patterns as scheme-specific SPVs, lender SPVs on charges, and parent-subsidiary structures. CH-perspective extraction guidance is in section "Perspective A — Companies House."
- `../../sub-skills/resolve-related-entities.md` — the corporate-group walk. (Step 8b.) Given the prospect's persisted majority PSCs + key directors, walks each controller's other CH appointments via `companies.getOfficerAppointments` to surface likely sibling SPVs + the trading parent. Persists two things (surface-only; no rows created): the prose `borrower.related_entities` knowledge item, and the structured group CH-number set via `clients.setProspectFacts({relatedCompaniesHouseNumbers})` — the latter powers the CH-tab `companies.getGroupCharges` group-charges rollup. Authored.
- `references/scheme-from-charges.md` — deep per-scheme enrichment (address → planning/web research → what they're building), persisted to `prospectSchemes`. (Step 10b.)

## Corpora (planned)

The `corpora/` directory will hold 2-3 anonymised exemplars of good intel reports, populated from the first hardened runs in v1.2.1. Until then, the playbooks above are the only ground truth.
