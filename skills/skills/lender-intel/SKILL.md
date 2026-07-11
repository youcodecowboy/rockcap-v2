# lender-intel

Parallel to the deal-lifecycle skills. Maintains the lender intelligence layer: captures appetite signals from BDM conversations, lender publications, and deal behavioural data; provides "which lender for this deal" matching answers; surfaces appetite drift over time so RockCap stays current with the lender market.

**v2 hardening (2026-05-25):** retargeted at the v1.3 substrate. `lender.recordAppetite` / `getAppetite` / `getAppetiteHistory` / `matchForDeal` MCP tools are now live (Sprint F adds the backend + tool surface). The skill became operational on day one; previously it was conceptual.

## Trigger

Three invocation modes:

1. **Capture mode** (most common): a BDM check-in, a published rate sheet, an emailed policy update yields appetite information about an existing OR new lender.
   - "Capture appetite signals from the Octopus BDM call this morning, here's the transcript: ..."
   - "Update Pluto's profile from this market view they published"
   - "Add Allica as a new lender — they specialise in £500k-2m bridging in London + South East"

2. **Matching mode** (operator-driven OR auto-triggered by other skills): a deal needs a lender shortlist.
   - "Which lenders for the Comberton deal?"
   - prospect-intel's Recommended Approach section auto-calls this when the prospect classification is a fundable deal type (`new_development`, `bridging`, or `existing_asset` — never `unclassifiable`) and the deal size + asset class are known. Pass the prospect's canonical `dealType` straight through; `matchForDeal` maps it onto the lender product vocabulary (see `references/lender-matching-rules.md` § "Deal-type vocabulary + prospect mapping").
   - terms-package-build calls this to determine the lender distribution list

3. **Behavioural recompute mode** (cron-driven, future v1.4): scan the last N months of closed deals and update each lender's "actual behaviour" signals — typical-time-to-offer, indicative-to-close rate, rate slippage. Schema supports `sourceType: "deal_behaviour"` for these. v1.3 has the schema but not the cron; deferred.

4. **Enrich mode** (operator-driven, 2026-07-11): the lender gauntlet — the miniature prospecting run for lenders. Ingestion waves mint lender rows that are correct but THIN (name + maybe a website; no Companies House link, no contacts, no market footprint). Enrich mode backfills one lender — or sweeps every thin lender — with CH identity, officers→contacts via Apollo, and the charges-register footprint.
   - "Enrich Allica's lender profile"
   - "Backfill Companies House and contacts for our lenders"
   - "Run the lender gauntlet on everything that's thin"

## Inputs

For capture mode:

Required (one of):
- `lenderClientId`: capturing for an existing lender. Most common.
- `lenderName` + lender details: capturing for a NEW lender; skill creates the clients row first via `lender.create` then proceeds.

Required (one of, for content):
- `meetingId`: id of a `meetings` row to extract from (a BDM call captured by meeting-capture)
- `documentId`: id of a `documents` row (lender's rate sheet, market view, policy doc)
- `inboundEmailText`: pasted email body from a BDM with appetite content
- `manualSignals[]`: array of `{fieldPath, value, valueType, sourceType, confidence?}` — operator already has structured signals to record

Optional:
- `asOfDate`: defaults to source date (meeting / doc / email date) or now
- `notes`: free-text annotation per signal

For matching mode:

Required:
- `criteria`: object with `{dealSize, dealType, assetClass, geography, ltv, ltgdv, timelineWeeks}` — all optional individually but at least 2 should be set for meaningful matching

Optional:
- `topN`: max lenders to return (default 10)
- `projectId`: if matching for a specific project (the criteria can be auto-derived from project.getDeepContext)

For enrich mode:

Required (one of):
- `lenderClientId`: enrich one lender
- `sweep: true`: enrich every thin lender (`lender.list` filtered to rows missing `companiesHouseNumber` OR with 0 contacts)

Optional:
- `skipApollo`: skip the email-enrichment stage (Apollo credits cost money; CH + charges stages are free)
- `maxLenders`: cap a sweep (default 10 per run — enrichment is bursty against external APIs; run repeatedly rather than unboundedly)

## Dedup

**Capture mode:**
- `dedupKey`: `capture:${lenderClientId}:${sourceType}:${asOfDate}` — one capture per lender per source per day. Re-running with new signals from the same source overwrites; new sources / new days are separate captures.
- `dedupWindowDays`: 1

**Matching mode:**
- `dedupKey`: `match:${JSON.stringify(criteria)}` — same criteria → same match result. Matching is deterministic given current signals.
- `dedupWindowDays`: 1 (signals drift; cache for a day max)
- **On `duplicate_found`**: return the prior result. Operator confirms refresh if they think signals changed.

**Enrich mode:**
- `dedupKey`: `enrich:${lenderClientId}` (a sweep starts one run per lender, not one run for the sweep)
- `dedupWindowDays`: 30 — CH officers and the charges register move slowly; re-enriching inside a month is churn. On `duplicate_found`, surface the prior brief; the operator can force a refresh (e.g. after a known BDM move).

## Cadence package

The skill **does** produce a cadence package — but only for capture mode, optionally, and only with operator approval. The relevant cadenceType is `bdm_relationship`: periodic check-ins with a lender BDM to refresh appetite over time.

Package shape (when triggered):

| Order | Type | nextDueAt offset | Content angle |
|---|---|---|---|
| 1 (only) | `bdm_relationship` | +60 days | "How's the market for you, any appetite changes?" check-in. Same recipient. Subject references the prior call so the BDM remembers the relationship. |

A single-touch package (vs prospect-intel's 4-touch). Created `isActive: true` because BDM check-ins are recurring; the cadence engine fires it, captures the response (auto-cancels, classifier routes — typically `defer_long_term` since appetite check-ins aren't deal-bound), and lender-intel re-runs in capture mode to record any new signals.

The bdm_relationship cadence is created ONLY if the operator explicitly approves OR if the lender has no recent capture (>90 days since last appetite signal). Default to NOT creating; let operator request.

## Outputs

Persisted to Convex:

1. **`appetiteSignals` rows** via `lender.recordAppetite`. Each signal carries source provenance + isCurrent flag. Superseded prior signals (same fieldPath) automatically.
2. **`clientIntelligence.lenderProfile.staticLayer` updates** for stable facts (legal name, address, lender type, HQ region). Static layer updates rarely; most signals are dynamic appetite. **v1.3 gap:** `intelligence.updateLenderProfile` MCP tool doesn't exist yet — capture static-layer updates in `skillRun.complete.gaps` for manual persistence.
3. **For matching mode**: returns the ranked lender list inline (no persistence by default). Optionally records a `knowledgeBankEntries` audit row of `{deal criteria, top N lenders, scores, asOfDate}` for traceability — write via `knowledge.recordMatchOutcome` (MCP tool not yet exposed; capture in gaps).
4. **A `skillRun`** via `skillRun.start` + `skillRun.complete`. `linkedClientId` = the lender being captured (capture mode) OR linked via project (matching mode). `brief` summarises captures or the match recommendation.

## High-level workflow

### Capture mode

1. **Resolve the lender.** If `lenderClientId` given, call `client.get` to verify it exists + has type=lender (lenders are clients rows). If `lenderName` only: call `lender.create({name, ...})` to create the record; use the returned id.

2. **Call `skillRun.start`** with `skillName: "lender-intel"`, the appropriate `dedupKey`, `dedupWindowDays: 1`, `input: {lenderClientId, sourceType, sourceRef}`.

3. **Load lender context.** Call `lender.getDeepContext({lenderClientId})` for: current appetite + recent changes + linked projects. Helps detect "this is a restatement of what we already know" vs "this is genuinely new".

4. **Extract candidate signals from the source:**
   - **Meeting source**: read `meeting.get({meetingId})` for keyPoints + decisions; mine for appetite info per `references/appetite-signal-catalogue.md`.
   - **Document source**: read `document.get({documentId})`; extract from the doc text per the catalogue.
   - **Email source**: parse the `inboundEmailText` directly.
   - **Manual signals**: validate the shape matches `references/appetite-signal-catalogue.md`'s standard fieldPaths.

5. **Filter for novelty.** Compare each candidate signal against current appetite (from step 3). If the candidate value matches the current value AND the same source type within 90 days, skip — no change. If different, this is a real update.

6. **Write each new/changed signal** via `lender.recordAppetite({lenderClientId, fieldPath, value, valueType, sourceType, sourceRef, asOfDate, confidence, notes})`. Each write supersedes the prior current signal automatically.

7. **Capture static-layer updates** (legal name change, HQ relocation, lender-type re-categorisation): list in `skillRun.complete.gaps` (`kind: "static_layer_update_deferred"`) until the MCP tool lands.

8. **Optionally queue a bdm_relationship cadence** per the Cadence package section.

9. **Call `skillRun.complete`** with `status: "complete"` (or `complete_with_gaps`), `brief` (one paragraph: what was captured, what changed, what's deferred to gaps), `linkedClientId` = the lender.

### Ingesting appetite packets & criteria documents

A lender's own appetite packet, lending-criteria sheet, or product one-pager is capture mode with the source pre-structured for you. Same discipline as any document source, plus two things specific to lender-doc ingestion:

- **Structured signals, not prose.** Extract every appetite-shaped fact (deal-size band, LTV / LTGDV ceilings, `products.offered`, `propertyType.allowed`, geography, typical time-to-offer, rates) to `lender.recordAppetite` at the standard fieldPaths in `references/appetite-signal-catalogue.md`. Set `sourceType: "lender_doc"`, `sourceRef` = the document id, `asOfDate` = the document date. A criteria sheet often fills most of the 7 matching-critical fieldPaths in one pass — that is the highest-value capture there is, because it directly lifts `lender.matchForDeal`.
- **Refresh the lender row while you have the document open.** `lender.create` now UPSERTS: call it with the lender's `name`, any `aliases` the document reveals (brand plus legal name, e.g. "Paragon" + "Paragon Development Finance Limited"), `website`, and `sourceDocumentIds` = the packet. It normalises the name (case, punctuation, legal suffixes ltd/limited/llp/plc/inc), matches the existing row, enriches it, and returns it with `deduped: true` — that is success, and it means you never mint a second lender for a name variant. If ingestion surfaces an actual duplicate pair already in the roster, consolidate with `lender.merge({fromClientId, toClientId, dryRun?})`; it repoints atoms, contacts, appetite signals, and facilities onto the survivor and soft-deletes the duplicate.

### Enrich mode (the lender gauntlet)

The prospect-intel gauntlet, adapted for lenders. Runs per lender; a sweep is
this workflow in a loop over thin lenders. Stages are ordered so each feeds the
next: CH identity unlocks officers, officers unlock Apollo, and the canonical
charges name unlocks the footprint.

0. **Select targets** (sweep only). `lender.list`, keep rows where `companiesHouseNumber` is unset OR `contact.getByClient` returns 0 contacts. Respect `maxLenders`; report the remainder so the operator can re-run.

1. **Call `skillRun.start`** per lender: `dedupKey: enrich:${lenderClientId}`, `dedupWindowDays: 30`, `input: {lenderClientId, mode: "enrich"}`.

2. **Load the lender.** `lender.getDeepContext({lenderClientId})` — establishes what's already there (contacts, appetite fields, website) so every later stage only fills GAPS, never overwrites operator-entered data.

3. **Companies House identity.**
   - `companies.searchCompaniesHouse({query: name})` — try the display name, then `companyName`, then each alias. Lenders are usually PLCs/large LTDs, so matches are typically clean.
   - **Disambiguation discipline:** prefer an ACTIVE company whose title matches the legal name/alias closely; finance-flavoured SIC codes (64xxx — "other credit granting", banks, financial intermediation) are strong confirmation. If the best candidate is ambiguous (two plausible actives, or only a dissolved match), DO NOT GUESS — a wrong CH link poisons group-charges, officer walks, and the graph's `officer_of` edges. Log a `gaps` entry (`kind: "ch_match_ambiguous"`, list the candidates) and continue to stage 5 (the charges footprint doesn't need the CH number).
   - On a confident match: `companies.syncCompaniesHouse({chNumber})` (persists profile + charges + officers + PSCs), then — **critically** — `clients.setProspectFacts({clientId, companiesHouseNumber})`. The sync alone does NOT link the number to the lender's clients row; `setProspectFacts` is the only mutation that sets `companiesHouseNumber` (its name is prospect-flavoured but it is a generic clients-row patch). Also pass `website` here if CH revealed one and the row lacks it.

4. **Officers → contacts.**
   - `companies.getOfficers({companyNumber})` — active officers first. For a lender you want the PEOPLE RockCap could actually talk to; CH gives directors/secretaries, which for big banks are board members, not BDMs. Take up to ~5 active individual officers (skip corporate officers like "XYZ SECRETARIES LIMITED").
   - Unless `skipApollo`: for each name, `apollo.findEmail({firstName, lastName, companyName, companyDomain?})` (domain from the lender's website when known — sharpens matching). Persist ONLY hits with an email or LinkedIn: `contact.create({name, role: officerRole + title from Apollo, email, emailStatus, clientId: lenderClientId, notes: "CH officer, enriched via Apollo (lender gauntlet)"})`. Officers with no Apollo hit are listed in the brief, not minted as empty contacts.
   - **BDMs beat board members.** If the lender's appetite history or meeting notes name a BDM (e.g. from `notes.bdm` signals), Apollo-match that person FIRST — a named BDM contact is worth more than three directors.

5. **Charges-register footprint.** `sourcing.searchLenders({q: name})` against the external charges DB. Pick the canonical row(s) matching this lender (watch for splits: "Paragon Bank PLC" vs "Paragon Development Finance Limited" are separate canonical names — sum only what genuinely belongs to this lender entity; when in doubt record the closest single canonical and note the split in the brief). Record via `lender.recordAppetite` at the `footprint.*` fieldPaths (see `references/appetite-signal-catalogue.md` § Market-footprint signals): `activeCharges` (= outstandingCount), `totalCharges` (= chargeCount), `chargedCompanies` (= companyCount), `canonicalName`. `sourceType: "deal_behaviour"`, `asOfDate` = the dataset's dataAsOf. Re-runs supersede, so the footprint self-refreshes.

6. **Web presence** (gap-fill only). If the row still lacks a website: `WebSearch` the lender name, confirm the domain, `clients.setProspectFacts({clientId, website})`. Don't scrape appetite from marketing pages here — that's capture mode's job with a real source document.

7. **Call `skillRun.complete`** with `status: "complete"` (or `complete_with_gaps`), `linkedClientId` = the lender, and a `brief` that reads as a delta: what was linked (CH number), who was added (contacts with emails), the footprint numbers, and the standing gaps (ambiguous CH match, officers Apollo couldn't find, appetite still uninformed). For a sweep, one line per lender plus a totals row.

**What enrich mode never does:** send anything, create cadences, or touch appetite fieldPaths other than `footprint.*`. It is data-gathering only — the same intel-vs-outreach gate as prospect-intel.

### Matching mode

1. **Validate the criteria.** At least 2 of `{dealSize, dealType, assetClass, geography, ltv, ltgdv, timelineWeeks}` should be set. If `projectId` is given: load `project.getDeepContext({projectId})` and auto-derive missing criteria from project's intelligence (GDV → dealSize estimate, asset class, geography from address).

2. **Call `skillRun.start`** with `dedupKey: match:<criteria-hash>`, `dedupWindowDays: 1`.

3. **Call `lender.matchForDeal({criteria, limit: topN})`**. Returns ranked list with per-lender matchScore + matchReasons + fitConcerns. `criteria.dealType` accepts either a prospect canonical code or a lender product code — it is normalised to the `products.offered` vocabulary internally (see `references/lender-matching-rules.md` § "Deal-type vocabulary + prospect mapping").

4. **Format the result** for the operator/calling-skill:
   - Group lenders by tier: `optimal` (matchScore ≥ 8), `viable` (matchScore 3-7), `stretch` (matchScore 0-2 OR uninformed)
   - For each lender in optimal + viable: highlight the top 2 matchReasons + any fitConcerns
   - If <3 optimal lenders, note "Limited optimal matches — consider broadening criteria or recording more appetite signals for adjacent lenders"

5. **Return inline** — matching mode is read-only by default. Optionally record an audit row (see Outputs #3).

6. **Call `skillRun.complete`** with `brief` (the recommendation summary), `linkedClientId` = primary borrower if known, `linkedProjectId` if from a project context.

## Style rules

All `../../CONVENTIONS.md` rules apply. Three that matter most:

- **Faithful to the source.** Capture mode: if the BDM said "we're at 70% LTGDV on residential", record `ltgdv.maximum = 0.70` + `propertyType.allowed = ["residential"]` — don't extrapolate to "and probably 65% on commercial". One signal per stated fact.
- **Confidence calibration.** Use the same scale as the meeting-capture template: 1.0 for explicit-authoritative, 0.8 for stated-but-qualified, 0.6 for derived-in-discussion, 0.4 for implied-not-stated, <0.4 don't extract. Lower confidence signals still get persisted but downstream matching weights them less.
- **Report-as-standalone-artefact.** Matching mode briefs never compare lenders by name beyond what's in the ranked list ("Lender A scored 12; Lender B scored 9"). Don't editorialise across lenders ("Lender A is better than Lender B because..."). Let the matchScore + matchReasons speak.

## Tool dependencies

This skill calls these MCP-exposed tools (v1.3 Sprint F):

- `lender.create` — capture mode for new lenders; UPSERTS (normalises name + matches `name`/`companyName`/`aliases`, returns `deduped: true` on a match). Pass `aliases` + `sourceDocumentIds`; also used to refresh an existing lender row (aliases, website)
- `lender.merge` — consolidate a duplicate lender pair discovered later (`{fromClientId, toClientId, dryRun?}`; repoints atoms/contacts/signals/facilities, soft-deletes the duplicate)
- `client.get` — verify existing lender (lenders are clients rows with type=lender)
- `lender.getDeepContext` — load current appetite + history for novelty check
- `lender.recordAppetite` — write a new signal (supersedes prior automatically)
- `lender.getAppetite` / `lender.getAppetiteHistory` — read surfaces
- `lender.matchForDeal` — matching mode entry
- `meeting.get` / `document.get` / `project.getDeepContext` — source loading
- `skillRun.start` / `skillRun.complete` — workflow envelope

Enrich mode additionally (2026-07-11):

- `lender.list` — sweep target selection (thin lenders)
- `companies.searchCompaniesHouse` / `companies.syncCompaniesHouse` — CH identity + mirror sync
- `clients.setProspectFacts` — the ONLY write path for `companiesHouseNumber` (and `website`) on the clients row; prospect-flavoured name, generic patch
- `companies.getOfficers` — read back synced officers/PSCs (the name-seed for Apollo; added 2026-07-11)
- `apollo.findEmail` — per-named-person enrichment (there is NO company-wide people search; names must come from getOfficers or known BDMs)
- `contact.create` / `contact.getByClient` — persist enriched people on the lender
- `sourcing.searchLenders` — charges-register footprint counts (chargeCount / outstandingCount / companyCount per canonical lender)
- `companies.getGroupCharges` — optional: the lender's OWN group charge book (them as chargee) once CH-linked

Tools NOT yet MCP-exposed (capture in gaps):
- `intelligence.updateLenderProfile` — for static-layer facts; planned, no MCP tool yet — capture in gaps
- `knowledge.recordMatchOutcome` — for matching audit trail; defer

## What goes wrong

1. **Lender doesn't exist yet.** Capture mode: skill calls `lender.create` first — it upserts, so a name variant of an existing lender enriches that row and returns `deduped: true` rather than minting a duplicate. Pass `aliases` (brand + legal name) and `sourceDocumentIds` so future variants resolve to the same row; extra fields (website, email) go via the extended args. Consolidate any pre-existing duplicate pair with `lender.merge`. Matching mode: skip; matching only against existing lenders.
2. **Signal contradicts a recent capture (within 90 days).** Don't auto-supersede — flag in the brief: "Octopus said LTGDV=0.70 today; recorded 0.75 on 2026-04-15 via BDM meeting. Either appetite tightened OR one source is wrong." Skill writes the new signal (newer source wins) but flags for operator review.
3. **Matching returns zero optimal lenders.** Common when criteria are very specific or our lender database is thin. Skill response: "0 optimal matches across N lenders with appetite recorded. To improve: broaden criteria OR add appetite signals for adjacent lenders (currently uninformed: list with currentSignalsCount=0)."
4. **Source extraction is ambiguous.** Meeting transcript says "they like the deal" without specifics. Capture mode: don't extract signals (per "no fabrication" rule); flag in brief that the source had no usable appetite info.
5. **Lender has 0 contacts.** Capture mode: BDM signals lose value without an attributable BDM. Skill writes the signal anyway with `notes: "BDM contact not yet captured"` and surfaces a gap. **Enrich mode is the fix** — run the gauntlet on that lender.
6. **CH match is ambiguous (enrich mode).** Two plausible active companies, or brand ≠ legal entity ("Octopus Real Estate" trades under a different registered name). Never guess — log `ch_match_ambiguous` with the candidates and move on; the operator resolves it in seconds, a wrong link takes much longer to unwind.
7. **Apollo finds nobody (enrich mode).** Common for big banks whose CH officers are board members with no public email. Not a failure: the CH link + footprint still landed. The brief lists the unmatched officers; the durable fix is capturing real BDMs from meetings/emails (capture mode), which enrich mode then prioritises on re-runs.
8. **Charges-register canonical-name split (enrich mode).** One lender group appears as several canonical names (Paragon Bank PLC / Paragon Development Finance Limited). Record the closest single canonical name's counts and note the split — don't sum across names unless certain they're the same legal entity we roster.

## References

- `references/appetite-signal-catalogue.md` — standard fieldPaths + valueTypes + when each signal matters (v2 hardening: authored alongside this rewrite)
- `references/lender-matching-rules.md` — the matchForDeal scoring rubric + how to interpret matchScore tiers (v2 hardening: authored alongside this rewrite)
- `../../shared-references/uk-property-finance-glossary.md` — vocabulary checks
- `../prospect-intel/references/lender-dna-from-charges.md` — patterns to look for when a lender's deal-behaviour signals come from CH charges (matches the deal_behaviour sourceType)
