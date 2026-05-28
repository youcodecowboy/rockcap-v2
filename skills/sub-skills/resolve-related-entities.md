# resolve-related-entities

Sub-skill: given a prospect's persisted Companies House officers + PSCs, walk the **controlling individuals'** other CH appointments to map the prospect's corporate group — the sibling SPVs and the trading parent that a single company's filing understates.

Used by prospect-intel (corporate-group mapping in/after the Key People step). Authored as a reusable primitive because the same "who else does this person control" walk recurs whenever a skill needs to see past one CH number to the group behind it.

## Why this exists

UK developers spread schemes across SPVs, so any single company's charge book and officer list understate the picture. The canonical chain (see `../shared-references/spv-structure-canon.md`) is `Sponsor → Borrower SPV (per scheme) → Lender SPV → Lender + Agent + Guarantors`. A prospect-intel run anchored on one CH number sees only one node of that chain — often a scheme-specific Borrower SPV, not the trading parent.

But the **majority PSC and the key directors of that node usually control the sibling SPVs and the parent too**. Companies House exposes this directly: every officer appointment carries a `links.officer.appointments` path that resolves to *that person's* full appointment list across all companies. Walking it turns "we have one CH number" into "here is the group: the trading parent plus N likely scheme SPVs". This is what lets the operator answer "is this the core company or just a scheme vehicle?" without manual register-spelunking.

## When to use

- prospect-intel has synced a prospect (so `companiesHouseOfficers` + `companiesHousePSC` rows exist with `appointmentsLink` populated) and you want to surface the corporate group.
- An operator asks "what else does {director} run?" or "map the sibling SPVs / corporate group for {company}".
- A charge book looks thin for the scheme scale on the prospect's website, suggesting the borrowing sits on sibling SPVs not yet in view.

## Inputs

Required:

- `clientId` (Convex id of the prospect's `clients` row) — where the finding is persisted.
- The prospect's persisted officers + PSCs. Get these from `prospect.getDeepContext({clientId})` (which returns the CH profile + the officer/PSC rows) or directly from the `companiesHouseOfficers` / `companiesHousePSC` tables. Each officer row carries `appointmentsLink` (the stored `links.officer.appointments` path) and a `dateOfBirth` `{month, year}`; each PSC row carries `naturesOfControl`, `name`, and `dateOfBirth`.

Optional but useful:

- `prospectCompanyName` — the anchored company's name, used to derive the shared name root for the SPV heuristic.
- `prospectRegisteredAddress` — the anchored company's registered office, used for the shared-office heuristic.

## Who to walk (controller selection)

Do NOT walk every officer — most appointment lists are noise (a company secretary who serves dozens of unrelated firms tells you nothing about the group). Walk only the **controllers**:

1. **Every majority PSC.** A PSC is "majority" when `naturesOfControl` includes an over-50%/75% ownership-of-shares or voting-rights nature, or a right-to-appoint-the-majority-of-directors nature. (CH nature strings look like `ownership-of-shares-75-to-100-percent`, `voting-rights-50-to-75-percent`, `right-to-appoint-and-remove-directors`.) Skip ceased PSCs (`ceasedOn` set).
2. **Each key director** — active directors (no `resignedOn`) with role `director` / `managing-director`. Prefer the 1-2 most recently appointed, and any director who is also a PSC. Skip the company secretary and any resigned officers.

Match the PSC back to an officer row to get the `appointmentsLink`: PSC rows do not carry the appointments link themselves, so pair a majority PSC to the director officer row with the same name + `dateOfBirth` `{month, year}`. If a controlling PSC has no matching officer row (e.g. a corporate PSC, or an individual who is a shareholder but not a director), note it and skip the walk for that PSC — there is no person-level appointments link to follow. A corporate PSC is itself a parent entity worth surfacing, but it is resolved by syncing its CH number, not by this person-appointments walk.

## Workflow

1. **Gather controllers** per the selection rules above. Produce a deduplicated list of `(name, dateOfBirth, appointmentsLink, why)` — `why` being "majority PSC (75-100% shares)" or "director, appointed 2023-04".

2. **For each controller, call `companies.getOfficerAppointments({appointmentsLink})`** — pass the stored link verbatim. The tool returns the person's full appointment list: each entry has `company_number`, `company_name`, `company_status`, `officer_role`, `appointed_on`, `resigned_on`, plus the person's `name` + `date_of_birth` echoed for disambiguation, and an `activeCount`.
   - **Disambiguate.** A common name can resolve to the wrong officer. Confirm the returned top-level `date_of_birth` `{month, year}` matches the controller's persisted `dateOfBirth`. If it does not match, discard the result and note "appointments link resolved to a different individual (DOB mismatch)".

3. **Classify each returned appointment** into one of:
   - **Likely sibling SPV** — `company_status: "active"` AND (shares a **name root** with the prospect OR shares the **registered office**). The name-root heuristic keys off the canonical SPV naming convention `{Sponsor} ({Scheme}) Limited`: strip a trailing parenthetical scheme tag and the `Limited`/`Ltd` suffix from both names and compare the remaining root case-insensitively (e.g. `Homes by Carlton (Staindrop) Ltd` and `Homes by Carlton (Bishopton) Ltd` share the root `homes by carlton`). A shared registered office is corroborating but weaker on its own (accountants' addresses are shared by unrelated firms) — treat shared-office-without-shared-name as MED, shared-name as HIGH, both as HIGH.
   - **Likely trading parent** — an active company that carries the bare sponsor root with no scheme parenthetical (e.g. `Homes by Carlton Ltd`), especially if older than the prospect (earlier `appointed_on` / incorporation) and itself carrying charges/officers. Flag the single best candidate as the probable parent.
   - **Unrelated** — active but no shared name root and no shared office. The controller may sit on boards of genuinely unrelated companies. Exclude from the group, but keep a count ("N further active appointments not obviously related").
   - **Dissolved / closed** — `company_status` not `active`. List separately as historic group members (dissolved sister SPVs are a risk signal worth surfacing, per prospect-intel's risk flags), do not count as live group.

4. **Assemble the corporate-group finding.** Per controller: the controller (name + why they qualify) → their related **active** companies split into likely-parent / likely-sibling-SPVs / dissolved-historic, each with `company_number`, `company_name`, `officer_role`, `appointed_on`, the match basis (shared name root / shared office / both), and a confidence. Deduplicate companies that surface via more than one controller (collapse onto the company, list which controllers connect it). Always exclude the prospect's own company number from its group list.

## Outputs

A `RelatedEntities` finding (also the value persisted in step "Persist" below):

```ts
type RelatedEntities = {
  prospectCompanyNumber: string;
  controllers: Array<{
    name: string;
    dateOfBirth?: { month?: number; year?: number };
    basis: string;                 // "majority PSC (ownership-of-shares-75-to-100-percent)" | "director, appointed 2023-04-11"
    appointmentsResolved: boolean; // false if DOB mismatch / link missing
  }>;
  likelyParent?: {
    companyNumber: string;
    companyName: string;
    confidence: "high" | "medium" | "low";
    basis: string;                 // "bare sponsor root, incorporated before prospect, carries charges"
    connectedVia: string[];        // controller names
  };
  likelySiblingSPVs: Array<{
    companyNumber: string;
    companyName: string;
    officerRole: string;
    appointedOn?: string;
    matchBasis: "shared_name_root" | "shared_office" | "both";
    confidence: "high" | "medium" | "low";
    connectedVia: string[];
  }>;
  dissolvedRelated: Array<{
    companyNumber: string;
    companyName: string;
    companyStatus: string;         // dissolved / liquidation / etc.
    connectedVia: string[];
  }>;
  unrelatedActiveCount: number;    // active appointments excluded from the group
  caveats: string[];               // heuristic limits — see Style rules
};
```

## Persist

Persist exactly **one** knowledge item — the surface-only design. Do **not** create `clients` or `companies` rows for discovered appointments; this sub-skill surfaces and records the finding, it does not stand up new tracked entities.

```
intelligence.addKnowledgeItem({
  clientId,                              // the prospect's clients row
  fieldPath: "borrower.related_entities",
  value: <the RelatedEntities object above>,
  category: "borrower",
  isCanonical: true,
  sourceType: "ai_extraction",
})
```

The prospect-intel report then renders this as the "Corporate group / related entities" subsection (under Key People). If the operator later decides a discovered sibling/parent is worth tracking in its own right, that is a separate, explicit operator action (sync it via `companies.syncCompaniesHouse`, promote it via `lender.create` / a client row) — never an automatic consequence of this walk.

## Style rules

CONVENTIONS apply. The ones that matter most here:

- **Heuristic, not proof.** A shared name root + shared controller is a strong signal that two companies are in the same group, but it is **not** proof of ownership. Companies House shows appointments and PSC natures, not the full ownership tree. State what CH shows ("the same individual is a director of both; both carry the `homes by carlton` root") and stop there. Do **not** assert "X owns Y" or "Y is a subsidiary of X" unless a PSC filing on Y actually names X. Every finding carries its basis + confidence; the `caveats` array spells out the limit in plain terms for the operator.
- **No fabrication.** If the appointments link 404s or the DOB does not match, say so and mark `appointmentsResolved: false` — never infer the group from the name alone when the walk failed.
- **Distinguish active vs dissolved.** A dissolved sister SPV is a different signal (possibly a wound-up completed scheme, possibly a failed one — flag for operator judgment) from an active sibling. Never blend them into one count.
- **Surface-only.** The deliverable is the finding + the single knowledge item. Resist the urge to "be helpful" by creating rows for the discovered companies.
- **UK English, GBP, ISO dates** in evidence.

## Tool dependencies

- `companies.getOfficerAppointments({appointmentsLink})` — the core walk (one call per controller). Consumes the `links.officer.appointments` path persisted on `companiesHouseOfficers.appointmentsLink` by `companies.syncCompaniesHouse`.
- `prospect.getDeepContext({clientId})` — to load the persisted officers + PSCs (or read the `companiesHouseOfficers` / `companiesHousePSC` tables directly).
- `intelligence.addKnowledgeItem` — to persist the single `borrower.related_entities` finding.

Loads `../shared-references/spv-structure-canon.md` for the SPV chain + the `{Sponsor} ({Scheme}) Limited` naming convention the name-root heuristic keys off.

## What goes wrong

1. **`appointmentsLink` is absent on the officer row.** Older syncs (pre the officers-persistence commit) or list items where CH omitted `links.officer.appointments` leave it undefined. Skip that controller and note it — the derived `officerId` fallback is not a valid appointments path, so do not attempt the call with it.
2. **Common name resolves to the wrong individual.** Always check the returned `date_of_birth` `{month, year}` against the persisted `dateOfBirth`. On mismatch, discard and record "DOB mismatch". Do not surface another person's appointments as the prospect controller's.
3. **Shared registered office is an accountant / formation agent.** Dozens of unrelated SPVs share a registered office at an accountancy firm. Shared-office-alone is MED at best and must be corroborated by a shared name root before it counts as HIGH. If the office is a known formation-agent address, treat shared-office as no signal.
4. **Corporate / legal-person PSC.** A majority PSC that is itself a company (not an individual) has no person-appointments link. Surface it as a parent-entity candidate (resolve by syncing its CH number), but do not run the person-walk on it.
5. **Controller sits on many unrelated boards.** A serial NED or a professional director may have dozens of appointments with no relation to the prospect's group. The name-root + office filters exclude these; report the residual count rather than listing them, so the group view stays signal-dense.
6. **Group is genuinely a single company.** Some prospects are the trading parent with no SPVs (common for bridging borrowers — see spv-structure-canon). The finding then says so: no sibling SPVs found; the prospect appears to be the core entity. That is a useful answer, not an empty result — persist it.
