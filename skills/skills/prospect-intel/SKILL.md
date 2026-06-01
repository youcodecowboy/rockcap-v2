# prospect-intel

Step 1 of the deal lifecycle. Cold-prospect intelligence (intel-only — outreach is gated behind an operator accept and drafted by the separate `outreach-draft` skill; see `../prospect-pipeline-gates.md`).

**v2 hardening (2026-05-25):** the skill now produces a deep multi-source intel report (the `intelMarkdown` field on the skillRun, rendered by the `/prospects/[id]` Intel tab) drawing from Companies House, the prospect's website, web search for company + director signals, and the existing RockCap intelligence base. The narrative `brief` is still the 2-paragraph operator-facing TL;DR; `intelMarkdown` is the full artefact.

**v3.1 (2026-05-30) — People-tab contract:** the People tab renders one person card per `### {Full Name}` heading in section 3 and matches each to a contact by name. The skill now (a) gives **every** key person their own `### ` heading in section 3 (never grouped under one heading), and (b) creates a **contact per key person** (step 8) carrying the Apollo enrichment (`emailSource`/`emailStatus`/`linkedinUrl`) even when no email is published, so all key people appear in the People tab and reflect the completed Apollo search ("found, no published email") rather than an un-searched "no email" prompt.

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

## Outreach is gated — this skill does NOT draft (2026-05-30)

**prospect-intel is intel-only.** It no longer composes or queues the cold-outreach cadence package. The package is produced later, by the separate **`outreach-draft`** skill, and only after the operator has reviewed the intel and clicked **"Accept — ready for outreach"** on the prospect detail page (which sets `outreachReadyAt`). See `../prospect-pipeline-gates.md` for the four-gate flow end to end.

**Why the split.** Whether the old step 11 drafted a package used to track whether Apollo returned an email — not anything about the prospect — so the initial batch was non-deterministic (some prospects got 4 cadence rows, some got 0). Making the initial run uniform intel-only and putting an explicit operator accept gate before any drafting removes that variance and keeps outreach deliberate rather than a side effect of research.

**What moved to `outreach-draft`:** the cadence-package composition (4 touches, same `packageId`), the lender-tier gate (`companies.getLenderTierConflict` — park Tier 1 / soften Tier 2), the contactless held-draft rule (Phase 3 `needs_contact`), and the outreach references (`template-mapped-reachout`, `rockcap-outreach-voice`, `hook-ladder`, `compose-outreach-hook`, regional/sender-geography). prospect-intel keeps the intel references only.

**The invariant is unchanged:** no autonomous outreach. `outreach-draft` still lands every touch as a `pending` cadence that the operator approves via the existing Approve & Schedule button before anything fires.

## Outputs

Persisted to Convex via the MCP tool surface:

1. A `clients` row in `status='prospect'` if one does not already exist for the matched company, OR an update to the existing prospect's `clientIntelligence` row. The clients row is linked via `skillRun.complete({linkedClientId})`.
2. An updated `clientIntelligence` with sections: identity (legal name, trading names, registered address, incorporation date), key people (PSCs, officers), lender DNA summary (the charges-derived view), and an AI summary.
3. Where useful, `knowledgeItems` for specific extracted figures (turnover, ebitda, headcount if visible from HubSpot Beauhurst metadata).
4. **No outreach.** This skill does not stage any draft outreach, approval, or cadence (changed 2026-05-30 — see "Outreach is gated" above). Outreach is composed by `outreach-draft` after the operator accepts the intel.
5. **v1.2 hardened:** the rich markdown `intelMarkdown` field on the skillRun row, written via `skillRun.complete({intelMarkdown})`. Structure per `references/intel-report-template.md`.
6. **Prospect state:** the skill sets `prospectState: "researched"` on completion (via `prospect.transitionState`, step 12), reflecting that intel now exists for this prospect. It only sets `researched` if the prospect has no later state yet — it never downgrades a prospect already in `drafted`/`active`/etc. Later transitions are operator-driven: the operator clicks "Accept — ready for outreach" (sets `outreachReadyAt`), `outreach-draft` then composes the package and moves the prospect to `drafted`, and the CRM Approve button (`cadences.approvePackage`) plus the reply event processor advance it through `active` and beyond.
6b. **Definition of Done manifest (2026-05-30):** the last section of `intelMarkdown` is a fixed `## Definition of Done` checklist (step 12) — one line per deliverable, each `DONE` or `SKIPPED — reason`, ending with the fixed `Outreach: not drafted — pending operator accept` line. Same shape every run, so the operator can eyeball completeness before accepting.

7. **Draft per-scheme enrichment (v1.2.5):** one `prospectSchemes` row per live SPV, written via `companies.upsertProspectScheme` in step 10b. Each row is a draft (`operatorConfirmed: false`) containing the best available estimate of what the scheme is building — type, unit count, GDV range, planning references, confidence label, and source URLs. The operator confirms each row in the prospect detail Track Record tab; confirmed rows are never clobbered by a re-run.

What it does not do:

- Does not send email.
- Does not contact the prospect through any channel.
- Does not create a `projects` row. Projects are created when an actual transaction emerges from the prospecting phase.
- Does not promote the prospect to active client status (status remains `prospect`).
- Does not drive `prospectState` beyond the initial `researched`. Transitions past `researched` (`drafted`, `active`, and onward) are operator-driven via the CRM UI + the cadence/reply machinery.

## High-level workflow

1. **Resolve the company**. If a Companies House number was given, fetch the company profile directly. If a name was given, search Companies House for matches and disambiguate. If multiple plausible matches, surface them and ask. At this point the canonical `companiesHouseNumber` is available; call `skillRun.start` with `dedupKey: companiesHouseNumber`, `dedupWindowDays: 7`, `skillName: "prospect-intel"`. If the response is `duplicate_found`, surface the prior brief + intelMarkdown and ask. If `already_running`, surface the in-flight run and ask before competing. Otherwise proceed with the returned runId.

2. **Fetch Companies House data.** Call `companies.syncCompaniesHouse({chNumber})` (added v1.2.1) — fetches profile + charges directly from the CH API and persists into `companiesHouseCompanies` + `companiesHouseCharges`. It persists the profile + charges + officers + PSC and stores each officer's `appointmentsLink` (used later in step 8b for group mapping). Idempotent: safe to call even if data exists; tool upserts and returns the synced result.
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

    **Create a contact per key person (People-tab contract). MANDATORY — do not create only the primary.** After the Apollo lookup, call `contact.create` for **every** key person surfaced (each majority PSC + each key director), linked to the prospect (`clientId` + `linkedCompanyIds` = the HubSpot `companies` row). Persist the Apollo result on each contact even when no email is published: `emailSource: "apollo"`, `emailStatus` (use `unavailable` when Apollo *found the person* but returned no email), and `linkedinUrl` when Apollo returns one (`contact.create`/`contact.update` accept `emailStatus`/`emailSource`/`linkedinUrl`). Then pick the best outreach target as the primary and set it via `clients.setProspectFacts({primaryContactId})`. **Why:** the `/prospects/[id]` **People tab** renders one card per `### {Full Name}` heading in section 3 of `intelMarkdown` and matches each to a contact by name — so (a) section 3 MUST give every key person their own `### {Full Name}` heading (NEVER group people under one heading such as "### {Family} family"; the parser would emit one card, not N), and (b) a contact must exist per person, carrying the Apollo enrichment, for the tab to show "searched via Apollo — found (no published email)" with the LinkedIn rather than an un-searched "no email on file" prompt. Creating only the primary leaves the other key people invisible in the People tab.

8b. **Map the corporate group (related entities). MANDATORY — do not skip; this is the step that surfaces the actual borrower SPV.** The step-1 CH name search (on the sponsor) and the prospect's own PSC register are both structurally blind to (a) **per-scheme SPVs named after the scheme, not the sponsor** (a `Woodham45 Ltd` or `Old Vicarage Elsenham Ltd` never appears under `Birkett Hall`), and (b) the controllers' vehicles at **other developers or in JVs**. So: (i) also **search CH by the deal/scheme name** when one is known (per-scheme SPVs are routinely named after the site); and (ii) invoke the `../../sub-skills/resolve-related-entities` sub-skill for the prospect's **majority controllers** — resolving THROUGH any corporate PSC down to the individual humans, then walking **every majority PSC and each key director**. **Director ≠ owner:** before attributing any walked company to the prospect's track record, confirm ownership via that company's PSC register and reality via its charges — a company the controllers merely *direct* may be owned by a former employer or a JV partner, not the prospect (a directorship is experience, not an owned scheme). It walks each controller's other Companies House appointments via `companies.getOfficerAppointments({appointmentsLink})` (the link persisted on each `companiesHouseOfficers` row by step 2's sync) and returns the corporate group: the likely trading parent + likely sibling SPVs (matched on shared name root per the `{Sponsor} ({Scheme}) Limited` convention and/or shared registered office), split active vs dissolved. Persist **both** outputs the sub-skill specifies: the prose `borrower.related_entities` knowledge item **and** the structured group CH-number set via `clients.setProspectFacts({clientId, relatedCompaniesHouseNumbers})` (the siblings + parent, excluding the prospect's own number). The structured persist is what lights up the prospect detail **CH-tab "Group charges" rollup** (`companies.getGroupCharges` aggregates the group's whole charge book); the prose item drives the narrative subsection. **Surface-only: do NOT create `clients`/`companies` rows for the discovered appointments** — persisting the CH numbers as metadata on the prospect is not the same as standing up entity rows. Output populates the "Corporate group / related entities" subsection of section 3. **Why this matters:** a single CH number understates a developer's SPV-spread lender DNA — the prospect may be one scheme vehicle, not the trading parent. Walking the controller's appointments reveals the sibling SPVs (likely each carrying their own charges) so the lender-DNA picture in section 4 is read in the context of the whole group, not one node. This directly addresses the prior "single-CH-number understates SPV lender DNA" gap. If the controller's `appointmentsLink` is absent, or the appointment list resolves to a different individual (DOB mismatch), the sub-skill records that and the subsection notes it — see the sub-skill's `## What goes wrong`. Then build the `StructureGraph` from the walk, call `structure.renderChart({graph})` (returns `{svg, dataUri, verdict}`), set `graph.verdict` to that returned `verdict` (authoritative — keeps the persisted graph in sync with the chart badge), embed the returned `dataUri` as a markdown image (`![Corporate structure](<dataUri>)`) in `intelMarkdown` under a "Corporate structure" heading, and persist the graph via `skillRun.complete({structureGraph})`.

9. **Cross-reference checks**. Follow `references/web-research-playbook.md` Phase C — Convex intelligence lookups for prior connections, address cross-check, sister entity check. Output enriches sections 3 and 4.

10. **Persist intelligence**. Persist across the structured stores, then build the report:
    - **Structured `clientIntelligence` doc (Output #2)** — call `intelligence.updateClientIntelligence({ clientId, identity, keyPeople, borrowerProfile, aiSummary, updatedBy: "prospect-intel" })` (partial merge; safe to pass only what you have). Pass `identity` (legal name, trading name, CH number, incorporation date), `keyPeople` (one entry per key person from step 8, `isDecisionMaker: true` on the chosen primary), `borrowerProfile` where derivable, and `aiSummary` (`executiveSummary` = the brief; `keyFacts` = a short bullet list that includes the one-line lender-DNA summary + the classification). This is the canonical structured layer the deep-context tools read — populate it, do not rely on the report markdown alone. (The doc's `lenderProfile` is for clients that ARE lenders; leave it unset for a borrower prospect.)
    - **Discrete facts (`knowledgeItems`)** — write specific data points via `intelligence.addKnowledgeItem` (the lender-DNA summary, the classification, related entities, and any extracted figures). These are now read back by `intelligence.getKnowledgeItemsByClient` and surface on `prospect.getDeepContext.knowledgeItems`.
    - **Report** — build the full markdown report following `references/intel-report-template.md` — all 9 sections, in order, with confidence levels. Cite sources (Companies House filing numbers, charge IDs, URLs scraped with timestamps, web search queries used).

    **Also call `clients.setProspectFacts({clientId, companiesHouseNumber, website, primaryDirectorName, primaryContactId, dealType, dealSizeRange})` (v1.2.4; dealType + dealSizeRange added Phase 2)** to populate the structured fields on the clients row. These are the canonical source for the CRM aside / PeopleTab / OverviewTab / prospects table — promoted out of intelMarkdown regex extraction so the UI doesn't depend on the report's template shape. Pass:
    - `companiesHouseNumber`: the resolved CH number (always pass if known)
    - `website`: the URL discovered in step 6 (or omit if "Not found" after 4 attempts)
    - `primaryDirectorName`: the lead director name as it should appear in the UI (e.g., "Stephen John Mccarthy" or "Shane Gordon")
    - `primaryContactId`: the Convex id of the primary contact created/found in step 11 (call setProspectFacts AGAIN after step 11 if the contact didn't exist when step 10 ran)
    - `dealType`: the canonical deal-type code from step 5 (`new_development` / `bridging` / `existing_asset` / `unclassifiable`)
    - `dealSizeRange`: the indicative deal-size display string from step 5 — the range + confidence + basis line (e.g., "£2-5m, medium confidence, based on Woodberry Park 48 units"). Omit for `unclassifiable`. Never a naked number.

10b. **Enrich live schemes (Track Record).** Load `references/scheme-from-charges.md` and follow it. Call `companies.getProspectSchemes({clientId})` to get the group's live schemes (the charge-bearing SPVs), then for the 5-7 most recent run the deep address → planning/web research and persist a draft estimate per scheme via `companies.upsertProspectScheme` (operatorConfirmed defaults false; the operator confirms in the Track Record tab). Estimates only, every figure cited. This populates the prospect detail Track Record tab.

11. **Outreach is gated — do NOT draft in this run (2026-05-30).** The cadence package, the lender-tier gate, and the contactless held-draft rule all moved to the `outreach-draft` skill. Do not call `companies.getLenderTierConflict`, do not compose touches, do not call `cadence.create`. Outreach is produced only after the operator reviews this intel and clicks **"Accept — ready for outreach"** on the prospect detail page (which sets `outreachReadyAt`); a later session then runs `outreach-draft` for the ready prospects. The Apollo email status you captured in step 8 still matters — it travels on the contacts you created and `outreach-draft` reads it to decide contactless-vs-addressed — but nothing is drafted here. The final manifest line (step 12) records `Outreach: not drafted — pending operator accept`.

12. **Return + Definition-of-Done manifest.** First append a `## Definition of Done` section to the END of `intelMarkdown` (no schema change — it is part of the report). Emit it on **every** run, the same fixed checklist each time, each line either `DONE` or `SKIPPED — {reason}`:

    ```
    ## Definition of Done
    - Onboarded (clients row + CH number): DONE / SKIPPED — reason
    - CH synced + group walked: DONE / SKIPPED — reason
    - Structure graph + chart embedded: DONE / SKIPPED — reason
    - Contact per key person (+ Apollo status each): DONE / SKIPPED — reason
    - clientIntelligence doc enriched (identity + key people + summary): DONE / SKIPPED — reason
    - 9 report sections present: DONE / SKIPPED — reason
    - Per-scheme Track Record rows: DONE / SKIPPED — reason
    - Lender DNA from the group book: DONE / SKIPPED — reason
    - dealType + dealSizeRange set: DONE / SKIPPED — reason
    - Gaps surfaced as chips: DONE / SKIPPED — reason
    - Outreach: not drafted — pending operator accept (mark "Ready for outreach")
    ```

    The last line is fixed text on every run (outreach is gated, never drafted here). The "contact per key person" and "structure graph + chart" lines stay mandatory manifest items (the v3.1 People-tab contract + the structure chart). A line is `SKIPPED` only when the underlying step genuinely could not run (e.g. CH API unavailable) — record the reason, never silently drop the line.

    Then call `skillRun.complete` with:
    - `status: "complete"` if everything ran, or `"complete_with_gaps"` if any gap was surfaced
    - `brief`: two-paragraph narrative summary (operator-facing TL;DR — what we found, what we recommend)
    - `intelMarkdown`: the full report from step 10 **plus the Definition of Done section** appended at the end
    - `linkedClientId`: the clients row id
    - `gaps`: any gaps captured along the way

    **Then set the prospect state.** After `skillRun.complete` returns, call `prospect.transitionState({ clientId, newState: "researched" })` to mark that intel now exists for this prospect. Guard against downgrade: only do this if the prospect has no later state yet (i.e., `prospectState` is unset or already `researched`). If the prospect is already in `drafted`, `active`, or any later state, do NOT call this; leave the later state intact. All transitions past `researched` are operator-driven (the Accept gate, then `outreach-draft`, then the CRM Approve button + reply processor); the skill only owns this one initial transition.

## Style rules

All voice and output rules from `../../CONVENTIONS.md` apply. The four that matter most for this skill:

- **Evidence-first.** Every lender DNA finding cites a Companies House charge ID. Every classification cites the patterns that drove it. Every web finding cites the URL + retrieved date. Every website claim cites the URL + scrape timestamp.
- **No fabrication.** If a charge name is ambiguous, qualify it ("possibly a security agent for a syndicate") rather than guessing the underlying lender. If a director's LinkedIn is not findable, say so — do not link to a similar-named profile. If a press mention can't be found in 4 queries, say "no press mentions found in N queries", not "low public profile" (the inference is fine; the confidence label conveys it).
- **No padding.** The report can be short. If a section has no findings, write "No findings (queries tried: ...)" rather than padding with speculation. Section 9 (gaps) is the legitimate way to record what couldn't be found.
- **UK English throughout.** No em dashes. No rule-of-three. GBP currency. ISO date format `YYYY-MM-DD` for dates in evidence; longer prose dates OK in narrative ("filed in March 2025").
- **Report-as-standalone-artefact.** Never reference another prospect, client, lender, or prior skillRun in this report. No "materially stronger than X", no "unlike Y", no "similar to Z's pattern". The report is shown to lenders, attached to credit memos, sometimes shared with the prospect. State findings on their own merits with evidence; use ARCHETYPE language for patterns ("textbook bridge-to-term") not COMPARISON language ("matches X's pattern"). See `references/intel-report-template.md` for full rule.

## Tool dependencies

This skill calls these MCP-exposed tools:

- `companies.searchCompaniesHouse` — for step 2 (find the company at Companies House)
- `companies.syncCompaniesHouse` — for step 2 (sync the CH profile + charges + officers onto the record)
- `client.list`, `client.get`, `client.create` — for step 3 (find an existing record, or seed a net-new prospect via `client.create`, which defaults `type='borrower'` / `status='prospect'` and supports promote-from-company modes)
- `intelligence.getClientIntelligence`, `intelligence.updateClientIntelligence`, `intelligence.addKnowledgeItem`, `intelligence.searchLenders` — for steps 3, 9, 10 (people are enriched per-person via `apollo.findEmail` + `contact.create` in step 8, not a people-search tool)
- `contact.get`, `contact.getByClient`, `contact.create`, `contact.update` — for step 8 (contact per key person + Apollo enrichment)
- `apollo.findEmail` — for step 8 (per-director email discovery; the v1.2.3 capability; cached 30 days at v1.2.4)
- `companies.syncCompaniesHouse` — for step 2 (CH profile + charges sync)
- `companies.getOfficerAppointments` — for step 8b (corporate-group mapping; consumes the `appointmentsLink` persisted on each officer row by step 2, via the `resolve-related-entities` sub-skill)
- `clients.setProspectFacts` — for step 10 (populate structured prospect facts on the clients row; v1.2.4)
- `companies.getProspectSchemes` — for step 10b (read the group's live schemes + candidate addresses parsed from charge particulars).
- `companies.upsertProspectScheme` — for step 10b (persist the per-scheme "what they're building" draft estimate; operator confirms in the Track Record tab).
- `structure.renderChart` — for step 8b (render the corporate-structure chart embedded in the report).
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
4. **A prospect that's already been touched recently.** The skill checks `touchpoints` for outbound contact in the last 90 days and notes any recent send + awaited reply in the report (section 6 / gaps), so the operator sees it before accepting. Acting on that signal (qualifying or skipping outreach) is `outreach-draft`'s job, not this skill's — intel only records it.
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
- **`references/intel-report-template.md`** (v2) — full markdown structure for the `intelMarkdown` field. (Step 10.)
- **`references/website-scrape-playbook.md`** (v2) — URL discovery + page fetching + extraction format. (Step 6.)
- **`references/web-research-playbook.md`** (v2) — exact queries for company-level + director-level + cross-reference research. (Steps 7, 8, 9.)
- `../../shared-references/spv-structure-canon.md` — canonical UK property finance SPV chain (Sponsor → Borrower SPV → Lender SPV → Lender → Agent + Guarantors). Loaded when interpreting Companies House charges + officers + PSC data: helps recognise `Sponsor (X) Limited` patterns as scheme-specific SPVs, lender SPVs on charges, and parent-subsidiary structures. CH-perspective extraction guidance is in section "Perspective A — Companies House."
- `../../sub-skills/resolve-related-entities.md` — the corporate-group walk. (Step 8b.) Given the prospect's persisted majority PSCs + key directors, walks each controller's other CH appointments via `companies.getOfficerAppointments` to surface likely sibling SPVs + the trading parent. Persists two things (surface-only; no rows created): the prose `borrower.related_entities` knowledge item, and the structured group CH-number set via `clients.setProspectFacts({relatedCompaniesHouseNumbers})` — the latter powers the CH-tab `companies.getGroupCharges` group-charges rollup. Authored.
- `references/scheme-from-charges.md` — deep per-scheme enrichment (address → planning/web research → what they're building), persisted to `prospectSchemes`. (Step 10b.)

The outreach references (`template-mapped-reachout`, `rockcap-outreach-voice`, `hook-ladder`, `lender-tiers`, `rockcap-regional-activity`, `sender-geography`, `compose-outreach-hook`) moved to the `outreach-draft` skill (2026-05-30). prospect-intel no longer loads them.

## Corpora (planned)

The `corpora/` directory will hold 2-3 anonymised exemplars of good intel reports, populated from the first hardened runs in v1.2.1. Until then, the playbooks above are the only ground truth.
