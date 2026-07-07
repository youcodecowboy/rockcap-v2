# Dark Mills Exemplar Classification Pack

This is the definitive classification reference pack for RockCap's document classifier, distilled from the client-approved exemplar Drive folder **/Kinspire/Dark Mills** — a **59-file ground-truth corpus** read in full on **2026-07-07** by seven field agents (batches A–G, one per folder/subfolder region), via the claude.ai Google Drive connector, read-only. The folder structure is the client-approved target taxonomy; every file in it is a real deal artifact from the Dark Mills transaction (Kinspire Homes / Jason Buttle JV, 36-unit residential development at Brimscombe, Stroud; GDV ~£14.75m; six lenders canvassed; QDF selected and taken through credit).

This pack feeds three consumers:

1. **Classifier references** — per-docType identity, content signals, and disambiguation rules (§3), plus the placement axes (§2) and the trap list (§4).
2. **Placement engine** — the folder taxonomy and decisive placement rules (§1), including the Lender Pack never-auto-classify rule.
3. **Regression suite** — the full 59-row ground-truth table (§6) is the Phase 5 eval set.

Everything below is evidenced by the seven field reports. Where reports conflict (or conflict with their briefs), the conflict is flagged inline rather than silently resolved.

---

## 1. Target folder taxonomy

```
/Kinspire/Dark Mills/
├── 1. Modelling Info and Terms Request/
│   ├── (loose files: planning record, agent pricing, drawings)
│   ├── Client Appraisals/
│   ├── Lender Pack/          ← NEVER an auto-classification target
│   └── Rockcap Appraisals/
├── 2. Terms Received/
├── 3. Terms Analysis/
├── 4. Comps/
│   └── Appendix/
├── 5. Credit/
├── Notes/
└── 6. Post Completion/       ← app-added; no exemplars yet
```

### 1. Modelling Info and Terms Request (loose files)

**Lifecycle purpose:** asset-fact gathering at deal start — everything RockCap needs *about the asset* before terms can be requested: the statutory planning record (what may be built, on what obligations, and whether the permission is alive) and third-party professional opinion (agent pricing evidence, architect drawings) that feed the revenue and unit-mix assumptions of the model. Nothing here is deal-execution: no term sheets, no credit papers, no lender letters, no RockCap-authored analysis.

**Decisive placement rule:** the producer is *not* RockCap and *not* a lender — local-authority statutory form language ("TOWN AND COUNTRY PLANNING ACT, 1990", "HEREBY PERMITS", "Section 106", planning refs matching `S.\d{2}/\d+(/\w+)?`) or professional-firm letterhead (Knight Frank LLP boilerplate, architect job numbers) — and the content is asset evidence, not deal execution. Filename heterogeneity is itself a signal: legacy/client/tidied names in mixed date formats (`13-10-2004`, `9-6-10`, `12.05.2021`, `20240903`) mark documents *collected*, not produced under RockCap's strict output convention. Dates far predating the engagement (2004–2012) are consistent with this folder.

### 1 / Client Appraisals

**Lifecycle purpose:** the developer's own land appraisal / development budget workbooks (Kinspire's `Land Appraisal - Dark Mills V3/V4/V5` series) — the client's cost and profit view of the scheme, including operational actuals, shared with RockCap and solicitors at budget-fix stage.

**Decisive placement rule:** an appraisal-genre workbook (accommodation schedule + development cost categories + profit line) that carries **developer-operations DNA**: Timesheet/Invoice tabs, "Approved (Sign & Date)" block with housebuilder directorate titles, trade-level build-cost matrix (GROUNDWORKS/BRICKLAYING/… × house types), PAID TO DATE / CTC actuals, named individuals in cost comments, profit as Gross Margin % / Return on Sales, finance as a single lump "Total Finance Cost" line. Typos and live `#REF!`/`#DIV/0!` errors corroborate. Filename `Land Appraisal - <Project> V<n> <freetext>` is near-deterministic when present.

### 1 / Rockcap Appraisals

**Lifecycle purpose:** RockCap's own debt-structured appraisal models built from the client's numbers — the INTERNAL macro-enabled source-of-truth workbooks and their EXTERNAL lender-facing .xlsx exports cut at issue points.

**Decisive placement rule:** an appraisal-genre workbook carrying **debt-structuring DNA**: a "Lender Dashboard - \<lender\>" tab or Lender View pane; LTGDV/LTC/Lender IRR/Money Multiple/Peak Drawn Loan/SONIA vocabulary; Input Checks + Result Checks audit panel; Working Cells / Input Cells key; Bridge/Senior Dev/Stabilisation/Term facility columns; Active Scenario cell; monthly drawdown/repayment cashflow with per-stakeholder IRRs; mezz/equity waterfall; the rockcap.uk URL. The literal token `RockCap` in an underscore-delimited filename is by itself decisive. Shared numbers with the client files (land £1,848,800, housebuild £4,611,160, 36 units) do NOT distinguish producer — RockCap imports the client's category totals verbatim.

### 1 / Lender Pack — NEVER an auto-classification target

**Lifecycle purpose:** an **operator-curated outbound snapshot**, not a document category — brief + model + supporting evidence, frozen at send time, i.e. exactly what a lender needs to issue indicative terms. Observed composition: (1) the EXTERNAL Lender Brief (the only doc authored *for* the folder), (2) the EXTERNAL cut of RockCap's appraisal model, (3) evidence annexes — byte-copies of the planning chain, site plan, KF pricing report, and the client's own appraisal. Mixed producers (council, Knight Frank, client, RockCap), mixed content dates (2004–2026), one unifying property: **they were sent to lenders together on 2026-03-06**.

**Decisive placement rule:** **never auto-classify a document INTO Lender Pack.** Membership encodes an *operator send-event* (curating + transmitting a bundle), which content-based classification cannot detect from the bytes — 6 of the 8 pack files are byte-copies whose content fingerprints point at their canonical folders. Rule: **type-classify to the canonical folder always; pack membership is curated.** A classifier that finds a file already *inside* a Lender Pack folder should (a) classify its type normally, (b) tag it `outbound-pack member / probable duplicate`, and (c) dedup against the canonical copy. **Duplicate-detection signature:** Drive `createdTime` clustered across multiple files in a tight window (here: all 8 within 79 seconds, 2026-03-06 12:01:19→12:02:38 UTC) **AND `createdTime` > `modifiedTime`** — the Drive signature of a *copied* file. Same-filename-elsewhere-in-the-tree is the cheap first check. The two RockCap-authored pack members (EXTERNAL brief + EXTERNAL model, both `_20260306`) are versions *stamped for a specific send* — better modelled as "external variant of a canonical doc, linked to outreach event 2026-03-06" than as a folder placement decision.

### 2. Terms Received

**Lifecycle purpose:** the inbound-quote shoebox — **one artifact per lender per date**, each capturing a single lender's indicative terms in whatever form the lender sent them (formal PDF term sheet, terms-table screenshot, branded proposal panel, raw email-body screenshot). Six lenders quoted Dark Mills over 10 days (UTB 03-09 → HTB/QDF/TriplePoint 03-13 → Shawbrook 03-16 → QDF/Paragon 03-17 → HTB 03-19).

**Decisive placement rule:** ALL of: (1) producer is a **single external lender** (letterhead/regulatory footer, proprietary rate construct, first-person lender voice); (2) content is **indicative/heads-of-terms** with hedge boilerplate ("Indicative Terms", "Without Commitment", "Subject to Credit Approval"); (3) **the broker appears as a fee line, not an author**; (4) **exactly one lender's terms** — the moment two-plus lenders appear side-by-side, it is RockCap-produced comparison and belongs in folder 3. Boundary vs folder 5: terms naming the JV/prospect entity during the sourcing window are indicative (here); terms naming the resolved borrowing SPV and post-dating credit submission are credit-stage (folder 5).

### 3. Terms Analysis

**Lifecycle purpose:** RockCap compares/normalises the received terms on a like-for-like model basis and recommends a lender — triage grid → INTERNAL comparison model → EXTERNAL client cuts → narrative analysis-and-recommendation note. Timeline: 03-09 raw triage table → 03-16 INTERNAL V1.0 → 03-23 INTERNAL V1.1 + EXTERNAL V1.1 + narrative docx → 03-24 EXTERNAL V1.2.

**Decisive placement rule (verbatim from report E):** place in "3. Terms Analysis" when the document is RockCap-produced AND arrays two or more named lenders against a common set of pricing/structure criteria (margin, arrangement/exit fees, gross loan, LTGDV, term, PG) or narratively assesses a canvassed lender panel and recommends one. **This rule dominates:** embedded appraisal/cashflow sheets do not demote to folder 1, and per-lender term detail does not demote to folder 2 unless the document is lender-authored and single-lender.

### 4. Comps (root)

**Lifecycle purpose:** the SUBJECT-side value case in the comparable-evidence workstream — the Accommodation Schedule series (the pricing the comps must support) plus bulky third-party scheme-reference PDFs (the 4868 architect drawing pack). Working layer: multi-opinion pricing grids, same-day version churn, mixed producers.

**Decisive placement rule:** subject-plot grids (rows keyed by small sequential Plot integers 1..36 with tenure banding and a scheme GDV total) and scheme-description source docs go to the folder root; address-keyed external-evidence schedules go to the Appendix subfolder.

### 4 / Appendix

**Lifecycle purpose:** the OUTPUT artefact — the lender-facing "Appendix A: Master Comparable Schedule" series only (AppendixA V1_1→V1_7), RockCap-produced, credit-pack-labelled. The subfolder name maps to the credit pack's appendix letter: it is a *deliverable slot*, not a topic folder.

**Decisive placement rule:** RockCap-produced, address-keyed comparable-evidence schedule titled "Appendix …", with historic transaction dates/ASKING flags, tier banding by scheme/distance, and Evidence Link source citations, self-declaring "Comparable evidence for lender credit pack".

### 5. Credit

**Lifecycle purpose:** the post-selection credit process with the chosen lender (QDF): lender-specific information-request tracking, credit-backed/refreshed terms, and third-party attachments re-downloaded for the credit submission.

**Decisive placement rule (from report G):** file here when the document belongs to the post-selection credit process: (a) lender-specific working docs whose filename embeds the lender token (`{Project}_{LENDER}_CreditChecklist_…`) and whose body tracks lender information requests with "In Lender Pack / Now Provided / Outstanding" statuses and dated confirmations to named lender staff; (b) **terms issued at/after credit** — even where the lender's template still says "Indicative Terms", credit-stage terms name the resolved borrowing SPV (River Investments Ltd), post-date credit submission, and carry fully reconciled tranche/fee schedules; (c) third-party attachments re-downloaded for the submission (legacy-named, third-party job numbers, duplicated extensions) — classify these by producer content and treat Credit placement as circumstantial. Signature vocabulary: guarantor confirmations, A&Ls, HoTs golden-brick/turn-key, pre-commencement conditions, "flag to [lender contact]".

### Notes

**Lifecycle purpose:** RockCap's internal working record across the whole deal — call/meeting notes in the "Note" house template, internal filing copies/drafts of outward documents, and legacy internal models.

**Decisive placement rule (from report G):** the "Note" house template (`…_Note_{Initials}_{AUDIENCE}_V{n}_{date}` filename; body name-stamp + Subject/Date/Relationship Manager + numbered sections): call notes (event token, `[User Note, cite: N]` markers, Strategic Actions with owner initials, multi-lender option talk, client sensitivities) and internal filing copies of outward docs (the "INTERNAL" lender-brief copies whose body stamps say EXTERNAL). Also legacy internal models (space-delimited DDMMYYYY-prefixed names, misspellings, .xlsm appraisals). Everything here is INTERNAL **by filing**, but classify audience from body stamp + register, not filename — the folder guarantees custody, not register. Distinguish from Credit: Notes docs are lender-plural or lender-agnostic and process-reflective; Credit docs are single-named-lender and obligation-tracking.

### 6. Post Completion (app-added)

**Lifecycle purpose:** post-completion deal artifacts (drawdown monitoring, PMS reports, sales updates, facility administration). **No exemplars exist yet** in the Dark Mills corpus — the deal had not completed at read time. The folder is an app-added extension of the client-approved taxonomy; no placement rules can be evidenced until exemplars arrive.

---

## 2. The three placement axes

Every document classifies on three content-derived axes: **producer**, **audience**, **lifecycle stage**. Folder placement is a function of the three (plus, for Lender Pack only, an operator event that content cannot detect).

### Axis 1 — Producer (client / rockcap / lender / third-party-professional / statutory-authority)

Detect from content, never from Drive metadata (see §4 — Drive owner is always rockcap.uk):

- **Client (developer):** developer-ops DNA — Timesheet/Invoice tabs with named staff hourly rates; "Approved (Sign & Date)" with housebuilder directorate titles (Commercial Director, Land Manager, MD…); trade-level build-cost matrix (GROUNDWORKS / SCAFFOLDING / BRICKLAYING - S/C … × house types £/ft2); PAID TO DATE / CTC actuals; named counterparties in comments ("Jason Buttle", "Ben SC"); profit as **Gross Profit / Gross Margin % / Return on Capital / Return on Sales**; finance as one lump "Total Finance Cost" line with no facility mechanics. Typos and live `#REF!`/`#DIV/0!` errors corroborate hand-grown workbooks.
- **RockCap:** debt-structuring DNA — LTGDV, LTC, Lender IRR, Lender Money Multiple, Peak Drawn Loan, SONIA, Arrangement/Broker/Non-utilisation/Exit fees, Net Proceeds Day 1; "Lender Dashboard - \<lender\>" tabs; Input/Result Checks audit panels; Working Cells / Input Cells keys; profit as **Profit on Cost %**; rockcap.uk URL cells; "Prepared by RockCap Ltd" title blocks; the RockCap "Note" house template (name-stamp line + Subject/Date/Relationship Manager + numbered sections); the literal `RockCap` token in underscore-delimited filenames.
- **Lender:** **first-person lender voice** — "Subject to our normal lending criteria, I believe we could structure a facility…", "We will instruct our own professional team", "our arrangement fee", "our maximum Term", self-reference as "the Bank"; lender letterhead/regulatory footers (PRA/FCA FRN, company number, registered address); proprietary rate constructs ("HTB SVR", "Shawbrook Base Rate"). And the **broker-as-fee-line rule**, the killer discriminator: a document that lists "Broker Fee", "Introducer Fee", "RockCap's introductory fee" — even "broker fee to Laburnum" — as a cost line *charges for* the broker and therefore cannot be *by* the broker. Do not require the literal string "RockCap".
- **Third-party professional:** firm letterhead + role boilerplate (Knight Frank LLP OC305934 footer, "produced in the course of… our estate agency role"); architect drawing-register patterns (leading numeric job number `4868`, drawing numbers `4868-008`, scales "1:500 @A1", revision tables, "IF IN DOUBT, ASK"); label-only extracted text with no sentence structure marks a drawing.
- **Statutory authority:** operative statutory clauses ("HEREBY PERMITS", "HEREBY AGREES TO DISCHARGE"), Act/Regulation citations (TCPA 1990; Modification and Discharge of Planning Obligations Regulations 1992), planning refs `S.\d{2}/\d+(/\w+)?`, Conditions + mirrored Reasons blocks, council letterhead with Our Ref/Your Ref pairs.

### Axis 2 — Audience (internal / external / neutral)

- **INTERNAL vs EXTERNAL for RockCap workbooks:** filename AUDIENCE token, extension, and size all agree — INTERNAL = `.xlsm` (mime `application/vnd.ms-excel.sheet.macroenabled.12`), ~12MB, the full macro model; EXTERNAL = `.xlsx`, ~1MB down to 31KB, values-flavoured export with workings progressively stripped. The size ratio (up to 400×) proxies the audience axis even when content is unreadable. The internal/external axis for models is **model workings + macros vs presentable outputs**, not candour — the client-facing LenderAnalysis docx carries full lender candour.
- **Register:** external docs use promotional third-person pitch voice ("RockCap is pleased to present…"), are lender-agnostic or client-addressed, with no action items or client sensitivities. Internal docs name candidate lenders side-by-side, assign actions to initials, expose client constraints, decode quirks ("'Architect Contingency' tab is really Kinspire's £50k time fee"), and carry `[User Note, cite: N]` provenance markers.
- **Body name-stamp beats filename token:** RockCap Note-template docs embed their own version string as the first body line (e.g. `Note_AL_EXTERNAL_V2.0_20260306`). Where the filename says INTERNAL but the body stamp and register say EXTERNAL (the Notes-folder lender-brief filing copies), **the body stamp + register win**; the filename token records filing custody only.
- **Neutral:** statutory decision notices are public record — no private audience.

### Axis 3 — Lifecycle stage

- **Pre-terms / modelling:** asset evidence (planning chain, pricing reports, drawings), client and RockCap appraisals; dates may far predate the engagement.
- **Terms request / outreach:** external Lender Brief + EXTERNAL model cut; lender-agnostic (briefs precede lender selection — no lender named anywhere).
- **Terms received:** single-lender indicative terms with hedge boilerplate; borrower named as JV/prospect entity or "SPV TBC".
- **Terms analysis:** multi-lender grids/narratives in RockCap voice; negotiation deltas (same fee at two values across versions) are unique to this stage.
- **Credit:** the **resolved-SPV-name marker** — terms/checklists naming the confirmed borrowing SPV (River Investments Ltd, only confirmed to QDF 08/04/2026) rather than "Kinspire"/"SPV TBC", dated after credit submission, with fully reconciled tranche schedules. The lender's own "Indicative Terms" template heading is NOT a reliable stage signal; entity + date + reconciliation are.
- **Cross-cutting:** the same bytes can serve two lifecycle roles (the 4868 drawing pack lives in both "4. Comps" and "5. Credit") — classification must be content-identity based, with folder giving lifecycle context only.

---

## 3. Document type references

### 3.1 Client Land Appraisal

- **Identity:** the developer's own multi-tab land appraisal / development budget workbook, mixing scheme economics with operational actuals.
- **Placement:** 1. Modelling Info and Terms Request / Client Appraisals. Producer = client (Kinspire Homes); audience = internal-to-client, shared with RockCap/solicitors; lifecycle = land acquisition → budget-fix ("for legals").
- **Exemplars:** `Land Appraisal - Dark Mills V5 Final Budget for legals.xlsx`, `Land Appraisal - Dark Mills V4 Latest Cost estimate 090126.xlsx`, `Land Appraisal - Dark Mills V3 Final Budget for legals.xlsx`.
- **Filename grammar:** `Land Appraisal - <Project> V<n> <freetext>` — spaces not underscores, hyphen after genre, purpose-of-issue prose freetext, whole-number version bumps, no structured date/initials/audience tokens. Tolerance: freetext may embed a ddmmyy date ("090126"); freetext is NOT unique per version (V3 and V5 share "Final Budget for legals") — only `V<n>` is.
- **Content signals (ranked):** (1) "Appraisal Summary" block computing **Gross Profit / Gross Margin % / Return on Capital / Return on Sales**; (2) **"Approved (Sign & Date)"** block with housebuilder directorate titles; (3) trade-level housebuild cost matrix (GROUNDWORKS/SCAFFOLDING/BRICKLAYING… by house type £/ft2, FORECAST vs BUDGET); (4) operational actuals: Timesheet tab (staff-initials hour grid with "Cost Rate £/hr"), Invoice tab ("Invoice Dark Mills"), PAID TO DATE / CTC columns; (5) named counterparties in comments ("To be paid at end of project to Jason Buttle", "Ben SC £6.7kpm"); (6) finance as one lump line ("Intital Loan / Financial Backing" (sic), "Total Finance Cost") with no LTGDV/LTC/drawdowns/lender IRR. 13 tabs observed: Timesheet, Invoice, Summary, Revenue, Land, Finance, Offsite Works, Externals, House Build, Fees, Build Prelims, Sales Overheads, Planning Costs.
- **Disambiguation:** vs RockCap appraisal — shared numbers (£1,848,800 land, £4,611,160 housebuild, 36 units) do not distinguish; developer-ops DNA vs debt-structuring DNA does. "Appraisal Summary" as a label appears in BOTH producers' files — the surrounding metric vocabulary (Gross Margin vs Profit on Cost/LTGDV) discriminates.
- **Version semantics:** whole-number filename versions; the workbook accretes rows over versions (V3 1,968 → V4 2,104 → V5 2,158 reconstructed rows). V4 was the cost re-estimate; V5 locked it as "Final Budget for legals" — the operative version. The in-sheet version stamp is frozen at "Version Nr: 1 / Date: 28/03/2023" across V3–V5 — **never trust the in-sheet version cell; the filename V-token carries the real version.**

### 3.2 RockCap Appraisal Model — INTERNAL

- **Identity:** RockCap's full macro-enabled debt-structuring appraisal model — the source-of-truth workbook with scenario machinery and VBA.
- **Placement:** 1. Modelling Info and Terms Request / Rockcap Appraisals. Producer = RockCap; audience = INTERNAL; lifecycle = modelling / terms request.
- **Exemplars:** `DarkMills_Kinspire_RockCap_RS_AL_3.0_INTERNAL_20260515.xlsm`, `DarkMills_Kinspire_RockCap_RS_AL_2.1_INTERNAL_20260306.xlsm` (both unreadable via connector; plus inferred 1.1 and 2.0 series members, not read).
- **Filename grammar:** `<Project>_<Client>_RockCap_<II>_<II>_<n.n>_INTERNAL_<YYYYMMDD>` — bare `n.n` version token (no "V" prefix) on INTERNALs in this set, vs `Vn.n` on EXTERNALs (weak but real regularity).
- **Content signals (ranked):** content is **unverifiable via the connector** (unsupported mime; >10MB). Classify on: (1) mime `application/vnd.ms-excel.sheet.macroenabled.12`; (2) size ~12.3MB; (3) `INTERNAL` filename token; (4) the `RockCap` filename token; (5) extraction failure itself is a soft signal. Presumed content: the full multi-scenario model the EXTERNALs are cut from.
- **Disambiguation:** vs EXTERNAL — extension + size (>10× gap) + version-token style; never observed reversed. vs legacy .xlsm appraisals in Notes — those use pre-convention space-delimited DDMMYYYY-prefixed names.
- **Version semantics:** INTERNALs iterate more frequently (1.1 → 2.0 → 2.1 → 3.0); EXTERNALs exist only at issue points. The INTERNAL is the source of truth; the latest INTERNAL is operative.

### 3.3 RockCap Appraisal Model — EXTERNAL

- **Identity:** the lender-facing .xlsx export of the RockCap internal model — a 3-tab, single-scenario, values-flavoured cut with a lender-branded dashboard.
- **Placement:** 1. Modelling Info and Terms Request / Rockcap Appraisals (master); byte-copies appear in Lender Pack as sent artifacts (curated, not classified). Producer = RockCap (RS models, AL fronts); audience = external (lenders); lifecycle = terms request.
- **Exemplars:** `DarkMills_Kinspire_RockCap_RS_AL_V2.1_EXTERNAL_20260306.xlsx`, `DarkMills_Kinspire_RockCap_RS_AL_V1.1_EXTERNAL_20260210.xlsx` (+ Lender Pack copy of V2.1, near-identical to one cashflow cell: `-` vs `(£0)`).
- **Filename grammar:** `<Project>_<Client>_RockCap_<II>_<II>_V<n.n>_EXTERNAL_<YYYYMMDD>`; filename date == Drive createdTime.
- **Content signals (ranked):** (1) tab named **"Lender Dashboard - \<lender\>"** (here "BFS") with split "Project View" / "Lender View" panes and the rockcap.uk URL cell; (2) debt-metric vocabulary: **LTGDV, LTC, Lender IRR (14.68%), Lender Money Multiple (1.07x), Peak Drawn Loan, Margin 5.25% Floating over SONIA, Arrangement/Broker/Exit fees**; (3) **Checks framework** — Input Checks + Result Checks ("Fully Funded?", "Profit Metrics Match", "Cashflow Signs Test", "Fully Optimised?" → OK); (4) Working Cells / Input Cells key + Bridge/Senior Dev/Stabilisation/Term facility columns + "Active Scenario: Consented Scheme"; (5) monthly debt cashflow with Drawdowns/Repayments, per-stakeholder Money Multiple & IRR, MEZZ EQUITY SPLIT, PRE MEZZ AND EQUITY PROFIT vs DEVELOPER PROFIT; (6) profit quoted as **Profit on Cost %** (31.03%); (7) template placeholders survive: "Insert Devleoper Logo Here" (sic), "Enter Development Address Here".
- **Disambiguation:** vs client appraisal — Rules 1/2 (developer-ops vs debt-structuring DNA). vs INTERNAL — .xlsx ~1.15MB, exactly 3 tabs (Lender Dashboard - \<lender\> / AppraisalSite1 / CashflowSite1), single active scenario. vs Lender Pack copy — content-identical; the master lives in Rockcap Appraisals, the pack copy is the send artifact (dedup by createdTime cluster + createdTime > modifiedTime). The embedded lender name in the dashboard tab tells you who it was built FOR even in the master copy.
- **Version semantics:** EXTERNALs cut from the INTERNAL at issue points, same-day date tokens (both V2.1 files: 20260306). EXTERNAL versions evolve in lockstep with the client appraisal versions (client V3 → RockCap V1.1, GIA 34,132 sqft; client V4/V5 cost uplift → V2.1, GIA 38,124 sqft). Latest EXTERNAL is the operative outbound cut.

### 3.4 Lender Brief Note (external + internal filing copy)

- **Identity:** RockCap's ~1-page outbound deal memo pitching the financing opportunity to prospective lenders, in the RockCap "Note" house template.
- **Placement:** EXTERNAL final → Lender Pack (as a send-stamped artifact; see §1 pack rule); INTERNAL-tokened filing copies → Notes. Producer = RockCap (AL); audience = **external by content** (even for the INTERNAL-tokened copies — body stamp wins); lifecycle = terms request / lender outreach.
- **Exemplars:** `DarkMills_LenderBrief_Note_AL_EXTERNAL_V2.0_20260306.docx` (Lender Pack); `DarkMills_LenderBrief_Note_AL_INTERNAL_V2.0_20260306.docx`, `DarkMills_LenderBrief_Note_AL_INTERNAL_V1.0_20260211.docx` (Notes — body stamps read EXTERNAL).
- **Filename grammar:** `<Project>_LenderBrief_Note_<II>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>` — "Note" as explicit genre token, dot-versioning. **Deviation/trap:** the Notes copies carry `INTERNAL` in the filename but `EXTERNAL` in the body name-stamp — they are filing copies of the external brief, not distinct internal documents.
- **Content signals (ranked):** (1) Subject line literally begins "**Lender Brief:**"; (2) opening "**RockCap is pleased to present** a residential development opportunity…" — pitch voice, sender RockCap, recipient a lender; (3) "**Relationship Manager:**" preamble field; (4) labelled ask fields: "Borrower Entity:", "Funding Requirement: Initial £250,000 net land loan…"; (5) numbered 4-section skeleton (Executive Summary → Project Background & JV Structure → Planning & Operational Status → Technical Intelligence & Timeline); (6) first body line embeds its own version string (`Note_AL_EXTERNAL_V2.0_20260306`); (7) no docx header/footer parts at all — plain exported note, not a branded template; (8) lender-agnostic — no lender named anywhere (briefs precede lender selection).
- **Disambiguation:** vs Initial Call Note — brief is document-anchored ("Lender Brief:" subject), promotional, no actions/citations; call note is event-anchored with `[User Note, cite: N]` markers and Strategic Actions. vs genuinely internal notes — internal docs name candidate lenders side-by-side (QDF, Daizun, SBL), assign actions to initials, expose client sensitivities. **Audience call: body name-stamp + register over filename token.**
- **Version semantics:** version bumps = fact corrections + structure refinement, sections unchanged (V1.0 → V2.0: "6-month land loan term" → "2–3 month lead in"; affordable count corrected 14 → 9; guarantor status added). The EXTERNAL copy in the pack was edited for ~13 minutes after copy-in — final external-polish at pack-assembly time. Latest version stamped with a send date is operative.

### 3.5 Initial Call Note

- **Identity:** RockCap's internal, machine-assisted record of a client call at deal origination, with cited provenance and owner-assigned actions.
- **Placement:** Notes. Producer = RockCap (AL); audience = INTERNAL (filename and body agree); lifecycle = origination/appraisal, pre-outreach.
- **Exemplars:** `DarkMills_InitialCall_Note_AL_INTERNAL_V1.0_20260109.docx` (earliest-dated doc in the deal narrative).
- **Filename grammar:** `<Project>_<Event:InitialCall>_Note_<II>_INTERNAL_V<maj.min>_<YYYYMMDD>` — event token replaces docType.
- **Content signals (ranked):** (1) **`[User Note, cite: N]`** citation artifacts on nearly every line — decisive marker of an internal machine-assisted call/meeting note; (2) "Strategic Actions" section assigning tasks to initials ("Lender Outreach (AL)", "Modeling (RS)") plus a "Filing:" instruction referencing the GDrive folder itself; (3) multiple candidate lenders named for the same need (QDF, Daizun, SBL) — pre-selection talk, never in external docs; (4) client-sensitive candour ("Kinspire looking to avoid cash-flowing the full £240k"; "'Architect Contingency' tab is really Kinspire's £50k time fee"); (5) shared Note-template skeleton: name-stamp + Subject/Date/Relationship Manager + numbered sections.
- **Disambiguation:** vs Lender Brief Note — see 3.4; both share the Note house template, so discriminate on event token, citations, actions, and multi-lender strategy talk vs sell-side prose.
- **Version semantics:** event-anchored, single date; V1.0 only observed. Contains early/stale facts (14 affordable units) superseded by later docs — a call note is a point-in-time record, not a living document.

### 3.6 Lender Indicative Terms (per-lender; PDF or screenshot)

- **Identity:** a single lender's indicative/heads-of-terms quote for the deal, in whatever medium the lender sent it — formal PDF term sheet or PNG screenshot of emailed terms.
- **Placement:** 2. Terms Received. Producer = lender; audience = borrower + broker (RockCap); lifecycle = indicative terms received.
- **Exemplars:** `HTBTerms3Monthleadin_DarkMils_20260319.pdf`, `HTBTerms_DarkMils_20260313.pdf`, `QDFTerms_DarkMills_20260317.png`, `QDFTerms_DarkMills_20260313.png`, `ParagonTerms_DarkMills_20260317.pdf`, `ShawbrookTerms_DarkMills_20260316.png`, `TriplePointTerms_DarkMills_20260313.png`, `UTBTerms_DarkMills_20260309.png`.
- **Filename grammar:** `<LenderName>Terms_<Project>_<YYYYMMDD>` — lender prefix is the primary index key; needs a lender-alias table (HTB=Hampshire Trust Bank, QDF=Quantum Development Finance, UTB=United Trust Bank). Tolerance: typos ("DarkMils" twice — consistent within the HTB pair), ad-hoc variant tokens welded to the prefix ("HTBTerms**3Monthleadin**" — scenario label, never a different lender). Filename date ≈ date received/saved and can trail the internal issue date by 1–3 days (prefer filename date for thread ordering, internal date for provenance).
- **Content signals (ranked):** (1) hedge boilerplate — "INDICATIVE LOAN TERMS", "Indicative Terms - \<Lender\>", "Indicative Loan Summary (subject to credit review)", "WITHOUT COMMITMENT AND SUBJECT TO CREDIT APPROVAL", "Subject to our normal lending criteria"; (2) **broker as a fee line** — "Broker Fee £95,876", "Introducer Fee £100,000", "£96,000 towards RockCap's introductory fee", "1% broker fee to Laburnum"; (3) lender first-person voice / self-reference ("the Bank", "our arrangement fee", "We will instruct our own professional team", "our maximum Term being 24 months"); (4) lender letterhead/regulatory footer (HTB: PRA/FCA FRN 204601, 80 Fenchurch Street; Paragon Development Finance Limited) or proprietary rate construct ("HTB SVR", "Shawbrook Base Rate 3.75%"); (5) heads-of-terms field set: facility amount + tranche availability, LTGDV/LTV/LTC, margin over a base, arrangement + exit fees, term, security package (debenture, first legal charge, PGs), conditions precedent; (6) exactly one lender's terms, no comparison grid.
- **Disambiguation:** vs folder 3 comparison (**the folder-2-vs-3 single-vs-multi-lender rule**): folder 2 = raw single-lender inputs in lender voice; the moment two-plus lenders appear side-by-side (comparison grid, ranking, recommendation, normalised columns), it is RockCap-produced and belongs in folder 3. vs credit-stage terms (3.7): entity + date + reconciliation, not the template heading. Media rule: treat PDF and PNG as the same class — identity comes from content signals, not mime; expect OCR noise in PNGs ("$106" for S106, "€" for £). Screenshot sub-forms: terms-table attachment (QDF), branded proposal panel (Shawbrook — purple brand), prose email body (TriplePoint), criteria summary (UTB).
- **Version semantics:** same lender + same project + new date = **a new version on the same negotiation thread**, not a new artifact class. Two evolution modes observed: scenario re-run (HTB 0313→0319 "3Monthleadin": 3-month pre-build lead-in, term 25→28 months, pricing/security unchanged) and genuine re-price (QDF 0313→0317: margin 5.65%→4.75%, facility trimmed, "Peak Facility" line dropped). Latest date per lender is operative; earlier files are superseded-but-retained negotiation history. Cluster by (lender, project); order by date; store variant tokens as scenario qualifiers.

### 3.7 Credit-stage Terms

- **Identity:** the chosen lender's refreshed/credit-backed terms issued at or after credit submission — often on the same "Indicative Terms" template as folder-2 quotes.
- **Placement:** 5. Credit. Producer = lender (QDF); audience = inbound to broker/borrower; lifecycle = credit.
- **Exemplars:** `QDFTerms_DarkMills_20260523.png`.
- **Filename grammar:** identical to folder-2 terms (`<LenderName>Terms_<Project>_<YYYYMMDD>`) — **folder placement, not filename, encodes the lifecycle difference**; the classifier must use content.
- **Content signals (ranked):** (1) **borrower named as the resolved SPV** — "River Investments Ltd" (confirmed to QDF only on 08/04/2026), vs "Kinspire"/JV/"SPV TBC" on sourcing-window terms; (2) date post-dates the credit checklist cycle (Apr 2026); (3) fully tranched and reconciled numbers (10-line availability breakdown incl. broker fee, S106/CIL, interest allowance) rather than headline-only; (4) same lender terms-table anatomy as 3.6 (£9,570,000 gross, 63.7% LTGDV, 85.0% LTC, 4.75% over BoE base, 1.00%/1.00% fees).
- **Disambiguation:** vs folder-2 indicative terms — **the template heading still literally says "Indicative Terms"; it is not a reliable stage signal.** Rule of thumb (report G): terms sheet naming the confirmed borrowing entity + dated after credit submission = credit/updated terms; terms naming the JV/prospect entity during the sourcing window = indicative (folder 2).
- **Version semantics:** continuation of the same lender's negotiation thread into credit; latest is operative.

### 3.8 Lender Comparison Sheet (modelled, INTERNAL/EXTERNAL)

- **Identity:** RockCap's like-for-like multi-lender comparison workbook — scheme constants held fixed while lender pricing varies, run through the model.
- **Placement:** 3. Terms Analysis. Producer = RockCap; audience = INTERNAL (.xlsm working model) or EXTERNAL (.xlsx client cut); lifecycle = terms analysis.
- **Exemplars:** `DarkMills_LenderComparison_RS_AL_EXTERNAL_V1.2_20260324.xlsx` (31KB, comparison sheet only), `DarkMills_LenderComparison_RS_AL_EXTERNAL_V1.1_20260323.xlsx` (1.17MB, 4 sheets incl. appraisal + cashflow), `DarkMills_LenderComparison_RS_AL_INTERNAL_V1.1_20260323.xlsm` (unreadable), `DarkMills_LenderComparison_RS_INTERNAL_V1.0_20260316.xlsm` (unreadable).
- **Filename grammar:** `<Project>_LenderComparison_<II>[_<II>]_<AUDIENCE>_V<maj.min>_<YYYYMMDD>`. Initials pairs map exactly to Drive owners (V1.0 `RS`-only owned by rayns; V1.1/V1.2 `RS_AL` owned by alex).
- **Content signals (ranked):** (1) **≥3 named lenders arrayed against identical criteria** as columns (UTB, Triple Point, HTB, Shawbrook, QDF, Paragon) with per-lender Margin / Arrangement Fee / Exit Fee / Gross Loan / Term; (2) **scheme constants held fixed across the lender axis** (Total Fundable Cost £10,501,155 and Unlevered Profit £4,251,245 identical in every lender column) — the "like-for-like" tell that this is a comparison, not an appraisal; (3) fee-vocabulary cluster: Arrangement Fee, Exit Fee, Broker Fee, Non-Utilisation Fee, Monitoring £/month, PG %, benchmark rates (BoE Base + floor, SVR, "Shawbrook Rate"); (4) cross-reference language: "**Senior Debt - Outputs (to check against term sheet)**"; (5) a **Total Cost of Debt (incl fees)** ranking row that differs by lender (QDF £865,652 cheapest … Paragon £935,325); (6) sheet named "Lender Comparison Sheet"; placeholder "Lender 7"–"Lender 10" columns with template junk (17,672,518% IRR, `#NUM!` rows) — parser hazard.
- **Disambiguation:** vs folder-1 appraisals — **trap:** EXTERNAL V1.1 embeds full AppraisalSite1/CashflowSite1 sheets; the multi-lender comparison sheet TRUMPS embedded appraisal sheets. vs folder-2 terms — RockCap-produced and multi-lender vs lender-authored single-lender. vs triage table (3.9) — modelled like-for-like constants vs raw transcription.
- **Version semantics:** INTERNAL .xlsm is the source of truth; EXTERNAL cuts are progressively sanitised exports (V1.1: 4 sheets, 1.17MB → V1.2: 1 sheet, 31KB; each cut removes more workings). V1.2 recalculated the Cost of Senior Debt IRR row (14.84–16.08% → 11.85–13.04%) — "numbers may change marginally as the modelling is finalised". Latest EXTERNAL is the client-operative deliverable.

### 3.9 Lender Comparison Table (triage)

- **Identity:** the early scratch grid transcribing incoming term sheets raw, before terms were run through the model like-for-like.
- **Placement:** 3. Terms Analysis. Producer = RockCap (rayns); audience = internal working; lifecycle = terms triage (earliest artifact of stage 3).
- **Exemplars:** `DarkMills_LenderComparisonTable.xlsx` (created 2026-03-09, a week before V1.0).
- **Filename grammar:** bare `<Project>_<DocType>` — no initials, no AUDIENCE, no version, no date. **Pre-dates adoption of the naming convention; un-versioned + bare DocType = "early scratch triage" tell.**
- **Content signals (ranked):** (1) sheet "Comparison Dark Mills - Lender Comparison", TRANSPOSED vs the V1.x workbooks — **lenders as ROWS**, criteria as columns (Facility A/B, Net Facility, Gross Loan, Day 1 LTV, Peak LTGDV, LTC, Margin % PA, Benchmark, Arr/Exit Fee % & £, Est. Gross Interest, Total Cost, Term, PG); (2) **"IC Status"** column with values like "Indicative" and lender status "**Declined**" (Downing — dropped from all later versions); (3) header block of scheme constants (GDV £14,752,400, Total Dev Costs £10,501,155); (4) free-text raw term-sheet transcription notes (UTB: commitment fee £10k, bank DD £56k est.); (5) pre-negotiation figures (QDF margin 5.65% vs 4.75% later — proving the concession narrative).
- **Disambiguation:** vs modelled comparison (3.8) — transposed axis, raw transcription flavour, no modelled IRR/proceeds rows. Still folder 3: ≥2 lenders share the grid.
- **Version semantics:** one-off snapshot superseded by the LenderComparison V-series; retained as pre-negotiation evidence.

### 3.10 Lender Analysis Note

- **Identity:** RockCap's narrative analysis-and-recommendation memo to the client, comparing the canvassed lender panel and recommending one.
- **Placement:** 3. Terms Analysis. Producer = RockCap; audience = external (client, "Confidential"); lifecycle = terms analysis → lender selection.
- **Exemplars:** `DarkMills_LenderAnalysis_RockCap_March2026 (1).docx`.
- **Filename grammar:** `<Project>_LenderAnalysis_RockCap_<MonthYear>` + **" (1)" browser-duplicate suffix (non-semantic; strip before parsing)**. Deviates from the spreadsheet grammar: no initials, no AUDIENCE token, no V-number, month-year instead of YYYYMMDD.
- **Content signals (ranked):** (1) title block "Indicative Lender Terms — Analysis & Recommendation — Prepared by RockCap Ltd | … | Confidential" with running CONFIDENTIAL header; (2) "RockCap has canvassed the development finance market on behalf of Kinspire… Six lenders have provided indicative terms" + cross-ref to "the accompanying Excel workbook"; (3) one-row-per-lender Indicative Terms Comparison table (Gross Facility / Term / Interest Rate with benchmark / Arrangement / Exit / Guarantee / Est. Finance Cost); (4) "Lender-by-Lender Assessment" sections with candid qualitative views (Shawbrook "significant reservations… draw-stop loans"; HTB "post-credit approval process… slightly painful"); (5) named recommendation with negotiated deltas ("**QDF recommended**; exit fee cut to 1.00–1.25%, term extended to 30 months") and ask to "review this note… and revert"; (6) disclaimer "prepared by RockCap Ltd for the exclusive use of the named client… not authorised or regulated by the Financial Conduct Authority…". Human-authorship tell: sloppy heading edits ("United Trust Bank (HTB)" at 5.1, "HTB (HampshireTrust Bank)" at 5.5).
- **Disambiguation:** vs Lender Comparison workbooks — narrative docx vs numeric grid (docTypes "LenderAnalysis" vs "LenderComparison"). vs folder-2 terms — multi-lender + RockCap advisory voice ("our recommendation", "we have negotiated"). Note: client-facing does NOT mean sanitised — this external doc carries full lender candour; candour is not the internal/external axis here.
- **Version semantics:** month-year dated, single observed version; the recommendation memo is the stage-3 terminal deliverable.

### 3.11 Accommodation Schedule

- **Identity:** RockCap's subject-scheme unit grid — the plot-by-plot GDV build-up (36 plots, tenure-banded, priced) that the comparable evidence must support.
- **Placement:** 4. Comps (root). Producer = RockCap (RS) with sales-agent input (JP commentary); audience = internal deal team, feeding the lender pack as the GDV backbone; lifecycle = value-substantiation of the subject scheme.
- **Exemplars:** `DarkMills_AccommodationSchedule_RS_AL_JP_V3.1_20260522.xlsx`, `DarkMills_AccommodationSchedule_RS_V2.2_20260518.xlsx` (+ inferred series members V2.1/V2.0 of 20260518 and V1_1 of 20260422).
- **Filename grammar:** `<Project>_AccommodationSchedule_<II…>_V<n.n>_<YYYYMMDD>`. Deviations: version-token style is per-series habit — dot style `V3.1`/`V2.2` in V2+/V3, underscore `V1_1` in the 20260422 file; initials accrete as reviewers join (RS → RS_AL_JP — multi-initial runs signal a reviewed/negotiated artefact); three V2.x versions saved the same day (rapid same-day iteration is a series fingerprint).
- **Content signals (ranked):** (1) row key is a bare **Plot number (1..36)** — small sequential integers, not addresses; (2) unit-type code prefix in Description (`Aa |`, `Ga |`, `D1 |`) with tenure suffixes; (3) tenure banding rows "Affordable (9 units)" / "Private (27 units)" with subtotals and a Total Scheme row summing to a GDV (Total Private £12,840,000 @ £403 psf); (4) area column headed **NIA (Sq Ft)** — a design-side metric; (5) pricing columns named after valuers/agents (**Kinspire, KF, RockCap**) = forward-looking target values, no transaction dates; (6) no Date column, no external addresses, no Evidence Link, no source citations; (7) title "Dark Mills, Brimscombe - Accommodation Schedule", subtitle "36 units | 27 Private + 9 Affordable |".
- **Disambiguation (the flagship near-miss — Accommodation Schedule vs Comparable Schedule; rules verbatim from report F, priority order):**
  - **R1 — Row identity (decisive on its own):** rows keyed by small sequential integers under a "Plot" header (1..36, contiguous, with unit-type codes like `Aa |`, `Ga |`) → SUBJECT scheme → **Accommodation Schedule**. Rows keyed by postal addresses / house names of other properties ("24 Lewiston Mill, Toadsmoor Rd", "Anchordene, London Rd"), often with other scheme names and postcodes differing from the subject's → **Comparable Schedule**.
  - **R2 — Time direction:** no date column; prices are targets/opinions (columns named after agents/valuers: Kinspire, KF, RockCap; "Pricing TBC") → Accommodation Schedule. Date column of historic transactions (Mar 2025, Dec 2025) and/or "ASKING" flags with exclusion rules → Comparable Schedule.
  - **R3 — Grouping axis:** bands = tenure within the subject ("Affordable (9 units)" / "Private (27 units)") with subtotal + Total Scheme rows summing to a GDV → Accommodation Schedule. Bands = tiers of external evidence ("Tier 1: Lewiston Mill … | 0.4 miles | Colburn Homes", "Tier 5: Local resale … Market baseline") ranked by comparability/distance; no scheme-total row → Comparable Schedule.
  - **R4 — Evidence/source column:** presence of Evidence Link / source citations (Rightmove URLs, "RM Postcode", Realyse, EPC, Land Registry) → Comparable Schedule. Accommodation Schedules cite nothing.
  - **R5 — Narrative direction in Notes:** comments justify our unit's own price in first person ("we expect this house to sell between £330k and £350k") → Accommodation Schedule. Notes compare the row's property TO the subject named in third person ("Sits at the same price as the Dark Mills 3 bed Type D1…") → Comparable Schedule. Rule of thumb: if the project name appears repeatedly *inside row notes*, the rows are not the project's own units. Tolerated counter-signal: Accommodation Schedule comments may *mention* comps narratively ("similar to Howle Hill, just sold @ £340k") — one-off references, not per-row address+date+source records; R1/R2 still dominate.
  - **R6 — Area metric:** `NIA (Sq Ft)` → Accommodation Schedule; plain `SqFt` with verification notes → Comparable Schedule.
  - **R7 — Self-declaration (fast path):** title cell "Accommodation Schedule" vs "Master Comparable Schedule / Comparable evidence for lender credit pack". Trustworthy here, but R1–R3 must be the fallback because titles can be stale-copied.
  - **Third-wheel guard:** the phrase "ACCOMMODATION SCHEDULE" also appears as a legend inside architects' drawing packs (unit mix in m², no pricing, drawing-number title blocks). A PDF with CAD/title-block features and areas in m² is a design drawing, not either spreadsheet class.
- **Version semantics:** column count and names vary heavily across versions (V2.2's multi-source grid — Kinspire V4/V5, KF, RockCap columns, "Pricing TBC", raw unrounded floats — collapses to V3.1's single agreed "Kinspire Pricing" + "JP Comments"); the Plot/Description/Beds/NIA left spine and tenure banding are invariant. Latest (converged, multi-initial) version is operative.

### 3.12 Comparable Schedule / Appendix A

- **Identity:** RockCap's lender-facing master schedule of comparable transaction evidence for other properties, tier-banded and source-cited, compiled to support the subject's GDV.
- **Placement:** 4. Comps / Appendix. Producer = RockCap (RS); audience = lender credit team (explicit in-band); lifecycle = comparable-evidence stage of credit-pack assembly.
- **Exemplars:** `DarkMills_AppendixA_RS_V1_7_20260522.xlsx`, `DarkMills_AppendixA_ComparableSchedule_RS_V1_2_20260518.xlsx`, `DarkMills_AppendixA_RS_V1_2_20260410.xlsx` (+ inferred series members V1_1, V1_3–V1_6).
- **Filename grammar:** `<Project>_AppendixA[_ComparableSchedule]_RS_V<n>_<m>_<YYYYMMDD>` — underscore version style throughout the series (`V1_7`), even at dates where the AccommodationSchedule series uses dots; long-form doctype `AppendixA_ComparableSchedule` used in V1_1/V1_2, dropped from V1_4 onward; single initial RS throughout. **Trap:** two files share version `V1_2` under different name-forms and different dates (short 20260410 vs long 20260518) — **version tokens are not a reliable ordering key across name variants; order by the date token.**
- **Content signals (ranked):** (1) rows keyed by **postal addresses of other properties/schemes** ("9 Lewiston Mill, Toadsmoor Rd", "142a Thrupp Lane"), other developers named (Colburn Homes, Bales Homes, Cornwell Construction); (2) **Date column with historic sold dates** (Mar 2025, Dec 2025) or "ASKING" flags ("excluded from psf averages"); (3) **Evidence Link / source column** (Rightmove house-prices URLs, typed source tags "RM Street"/"RM Postcode"/"RM Area", Realyse, EPC); (4) **tier banding** by scheme/distance ("Tier 1: Lewiston Mill, Brimscombe (GL5 2TE) | Direct new build comp", "Tier 5: Local resale, GL5 2 sector | Within 1 mile"); (5) self-declaring header "Appendix A: Master Comparable Schedule … **Comparable evidence for lender credit pack** … Prepared by RockCap Ltd"; (6) Notes written as advocacy comparing each comp to the subject in third person ("Dark Mills 2 bed houses at £396–403 psf sit over £100 psf below this proven ceiling"); (7) workings tail of raw Rightmove URLs — scratch comps not yet promoted into a tier.
- **Disambiguation:** vs Accommodation Schedule — R1–R7 above (R1 decisive: address rows vs plot rows). vs KF pricing report — the KF report is third-party letterhead evidence *input*; Appendix A is RockCap's compiled *output*. Gaps in tier numbers (V1_7 has only Tiers 1 and 5) are a version tell — tier numbering survives deletion.
- **Version semantics:** V1_2 → V1_7: tiers pruned (3/4/6 dropped or merged), notes rewritten from verification-forensics ("VERIFIED 1,418 sqft (Realyse had 1,227 — 15.5% error)") toward lender-facing advocacy, source tags collapsed to plain text. Header/columns invariant. Latest date-token version is operative.

### 3.13 Architect Drawing Pack / Site Plan Markup

- **Identity:** third-party architect drawing sets and annotated site plans — CAD-derived PDFs describing the physical scheme (site layout, unit sketch plans), sometimes marked up by a consultant.
- **Placement:** canonical home = 1. Modelling Info and Terms Request (markup) and 4. Comps root (drawing pack); byte-copies recur in Lender Pack and 5. Credit as pack/submission attachments (circumstantial placement — classify by producer content). Producer = third-party professional (RRA Architects Ltd; markup annotated by KT); audience = design team/working, filed by RockCap as scheme-description evidence; lifecycle = design/concept input, reused at comps and credit stage.
- **Exemplars:** `4868 Dark Mills 20240903 KT Mark up.pdf` (+ Lender Pack copy), `4868 Dark Mills 20241217.pdf` (4. Comps, ~15MB), `4868_20Dark_20Mills_2020241217.pdf.pdf` (5. Credit, URL-encoded re-download).
- **Filename grammar:** `<JobNo> <Project> <YYYYMMDD> [<II> <doc type>]` — space-separated, leading bare numeric job number (4868 = RRA's drawing-register number), no doctype/version/audience token. Completely different grammar from RockCap convention; a leading bare number marks a third-party producer's job number. Tolerance: URL-encoded artifacts (`%20` → `_20`) and doubled `.pdf.pdf` extensions on re-downloads.
- **Content signals (ranked):** (1) extracted text is fragmentary labels only — no sentence structure (plot numbers 1–36, housetype-plot codes C17/F34/G1-4, "PUBLIC FOOTPATH", "COMMUNAL OPEN SPACE", "THAMES AND SEVERN CANAL [DISUSED]", "RIVER FROME", room labels BED 01/KITCHEN/EN-SUITE); (2) drawing-register apparatus: RRA Architects title blocks (Hereford/Cheltenham offices, enquiries@rraarchitects.com), drawing numbers `4868-008`…`4868-017`, scales "1:500 @A1", revision tables, status "Sketch / CONCEPT ISSUE / DRAFT FOR COMMENT", "IF IN DOUBT, ASK."; (3) "ACCOMODATION SCHEDULE:" legend (sic) with areas in **m²** and no pricing; (4) high proportion of all-caps short tokens and digits, no verbs — the low-text drawing profile; (5) extraction may be garbled by symbol-font substitution (`pfqb=mi^k` = "SITE PLAN") — a CAD-PDF tell.
- **Disambiguation:** vs KF pricing schedules — shares housetype letters and plot count but no prices/sq ft tables. vs the Accommodation Schedule xlsx — m² not sqft, no pricing, CAD title blocks (the third-wheel guard). vs formal valuation report — see §4: the "4868" prefix matches an architect's job numbering, not a valuer's; both batch briefs wrongly guessed these PDFs were valuations. Internal drawing inconsistencies (address "Knapp Lane" vs "Port Lane"; unit-letter typos) are normal for drawings.
- **Version semantics:** issue-date based (20240903 markup; 20241217 compiled sketch pack); revisions tracked in the drawing pack's own revision tables, not filenames. The markup ("Mark up" + initials + recent date, two decades after permission) signals a working annotated copy for the current re-appraisal.

### 3.14 Planning Permission Decision Notice

- **Identity:** the Local Planning Authority's statutory decision notice granting (outline) planning permission, with conditions and reasons.
- **Placement:** 1. Modelling Info and Terms Request (loose); byte-copy in Lender Pack. Producer = statutory authority (Stroud District Council); audience = neutral/public record; lifecycle = pre-terms planning evidence.
- **Exemplars:** `DM Outline Planning Permission 13-10-2004.pdf` (+ Lender Pack copy).
- **Filename grammar:** `DM` project abbreviation + full doc-type phrase + decision date `D-M-YYYY`. RockCap-tidied name for a legacy statutory document; no initials/version/audience tokens (statutory docs don't get them).
- **Content signals (ranked):** (1) "Outline Planning Permission" title + "**HEREBY PERMITS** the development described below subject to the conditions stated" operative clause; (2) "TOWN AND COUNTRY PLANNING ACT, 1990" header citation; (3) planning reference pattern `S.03/146` + Applicant/Agent/Dated field block; (4) numbered Conditions followed by mirrored numbered Reasons; (5) "**reserved matters**" (outline-specific token — distinguishes from full/detailed permission); (6) appeal-rights NOTES citing s.78/s.91/s.92 TCPA 1990.
- **Disambiguation:** vs full/detailed or reserved-matters permission — outline says "outline application" and defers "reserved matters"; a REM decision cites the parent outline ref (cf. `S.07/1856/REM`). vs S106 decision — "HEREBY PERMITS" vs "HEREBY AGREES TO DISCHARGE". vs planning correspondence — form document with conditions/reasons vs Dear/Yours sincerely letter.
- **Version semantics:** none — a dated statutory record; permanence is the point. Related later decisions (REM, S106 variations) reference it rather than superseding it.

### 3.15 S106 Discharge / Variation

- **Identity:** the council's statutory decision varying or discharging a Section 106 planning obligation.
- **Placement:** 1. Modelling Info and Terms Request (loose); byte-copy in Lender Pack. Producer = statutory authority; audience = neutral/public record; lifecycle = pre-terms planning evidence (deal-material: the over-50s restriction removal unlocks open-market sales).
- **Exemplars:** `DM S106 Change 10-7-2012.pdf` (+ Lender Pack copy).
- **Filename grammar:** `DM` + informal shorthand doc type ("S106 Change") + `D-M-YYYY`.
- **Content signals (ranked):** (1) "The Town and Country Planning (Modification and Discharge of Planning Obligations) Regulations 1992" citation; (2) "Section 106" / "S106 Agreement" title token; (3) planning ref suffix `…/106R` (obligation-modification class); (4) "**HEREBY AGREES TO DISCHARGE** the Section 106 Agreement" operative clause; (5) NPPF paras 204–205 planning-obligation tests quoted as grounds; (6) the substance: "variation… to remove clause 26 (occupancy restricted to age 50 and over)… to provide affordable housing on site" — cross-referenced by the KF report ("restricts for over 50s… we understand this has been superseded").
- **Disambiguation:** vs the original S106 deed — a deed is a long legal agreement with parties/recitals/covenants and solicitor execution blocks; this is the council's one-page *decision* varying it. vs planning permission — different operative clause and regulations.
- **Version semantics:** none — dated statutory record.

### 3.16 Commencement Confirmation Letter

- **Identity:** LPA officer correspondence confirming that works constitute lawful commencement, keeping the planning permission extant — a key underwriting fact.
- **Placement:** 1. Modelling Info and Terms Request (loose); byte-copy in Lender Pack. Producer = statutory authority (in letter form, addressed to the client's planning agent); audience = external correspondence, client-side record; lifecycle = pre-terms planning-status evidence.
- **Exemplars:** `Dark Mills Confirmation of Commencement 9-6-10.pdf` (+ Lender Pack copy).
- **Filename grammar:** full project name (not `DM`) + descriptive doc type + `D-M-YY` (two-digit year — inconsistent with the sibling statutory files; expect date-format drift within tidied legacy names).
- **Content signals (ranked):** (1) "constitutes a **commencement** of the overall approved development" + "the planning permissions will remain **extant**" — the defining payload; (2) council letterhead + Our Ref/Your Ref planning reference pair (`S.07/1856/REM` / `DP/0114.160`); (3) letter apparatus (Dear/Yours sincerely) from a Principal Planning Officer; (4) cross-reference to the parent outline permission ("pursuant to outline permission S.03/146"); (5) S106 payment-trigger mention (£50,000 affordable-housing contribution).
- **Disambiguation:** vs decision notices — letter format, no HEREBY clause, no conditions/reasons. vs CIL/Building Control commencement notices — those are developer-served forms; this is the LPA *confirming* lawful commencement. vs generic planning correspondence — the extant-permission confirmation is the classifiable payload.
- **Version semantics:** none — dated correspondence record.

### 3.17 Agent Pricing Report / Pricing Exercise

- **Identity:** an estate agent's sales-pricing opinion for the scheme — expressly NOT a valuation — in either narrative letter-proposal form or standalone schedule form.
- **Placement:** 1. Modelling Info and Terms Request (loose); the 2021 report also byte-copied into Lender Pack. Producer = third-party professional (Knight Frank LLP); audience = external (agent → client, expressly not for third parties); lifecycle = pre-terms revenue/GDV evidence for modelling.
- **Exemplars:** `KF Pricing Report - Dark Mills 12.05.2021.pdf` (narrative letter form, + Lender Pack copy); `Knight Frank Valuation.png` (schedule-only form, Jan 2026 — **misnamed**, see §4).
- **Filename grammar:** issuer-prefixed tidied names — `<Issuer initials> <DocType> - <Project> <DD.MM.YYYY>` for the report; plain `<Issuer> <DocType>.png` for the screenshot (no project/date/initials tokens at all). Date-format drift (dots vs hyphens vs YYYYMMDD) across sibling files.
- **Content signals (ranked):** (1) literal heading "**PRICING EXERCISE**" / "Pricing proposal for…"; (2) disclaimer "**does not constitute a valuation or appraisal** and must not be construed or relied upon as such" + "produced in the course of, or in contemplation of, our estate agency role, as an informal document"; (3) Housetype/No./Sq ft/Guide price/£PSF tabular schema with Private vs Affordable split (report: plot-by-plot Marketing Price vs Net Price, totals £12,645,000 / £11,820,000 net); (4) Knight Frank LLP boilerplate ("registered number OC305934… 55 Baker Street") + `KF Ref:` pattern (CL/HH/DarkMills); (5) numbered agency-proposal section sequence (credentials → site → market → development → comparables → pricing → conclusion) with comparable-evidence tables (Address, Date Sold, Sold Price, EMV, New Build, £psf, Tenure); (6) "GENERAL ASSUMPTIONS" numbered block (999-year lease etc.); (7) **no RICS/Red Book/Market Value language anywhere**.
- **Disambiguation — the valuation-vs-pricing-exercise Red Book rule:** a formal RICS Red Book Valuation cites "RICS Valuation – Global Standards", names an MRICS/FRICS valuer, states Market Value with a valuation date, and is addressed to a lender/client for reliance. These documents *disclaim* exactly that. **Decide on presence/absence of RICS Red Book / "Market Value" / valuer-reliance language — the text-body disclaimer outranks filename tokens.** This is the highest-risk confusion in folder 1. Also: schedule-only exercise vs narrative letter proposal (table + "Important Notice" vs salutation + numbered sections); vs marketing brochure (addressed privately to one client with net pricing); vs RockCap comps pack (KF identity vs RockCap identity). Note: report C's spot-check shorthand called the KF report "agent-produced valuation evidence" — report A's deep read is authoritative: it is a pricing opinion, not a valuation.
- **Version semantics:** refreshed opinions over time (2021 letter report → Jan 2026 schedule refresh) at different price levels — versioned *inputs* to the model; each is a dated snapshot, latest informs current modelling.

### 3.18 Credit Checklist

- **Identity:** RockCap's internal tracker of a specific lender's credit information requests, with tri-state status and dated evidence provenance.
- **Placement:** 5. Credit. Producer = RockCap (RS); audience = INTERNAL (candid flags); lifecycle = credit (post-submission Q&A with the chosen lender).
- **Exemplars:** `DarkMills_QDF_CreditChecklist_RS_V1_1_20260413.docx`, `DarkMills_QDF_CreditChecklist_RS_V1_0_20260401.docx`.
- **Filename grammar:** `<Project>_<LENDER>_CreditChecklist_<II>_V<maj>_<min>_<YYYYMMDD>` — the **embedded lender token (QDF)** is the tell: credit docs are lender-specific, so the lender appears where client-stage docs have none. Underscore minor-version (`V1_1`) vs dot form on Notes docs — formatting drift within house convention.
- **Content signals (ranked):** (1) tri-state status vocabulary "**In Lender Pack | Now Provided | Outstanding**" with a legend — unique to a credit information checklist; (2) explicit "Lender: QDF / Broker: RockCap Ltd" header block; (3) requirement rows phrased as lender asks ("Confirmation of borrowing entity", "HoTs for affordable sale — golden-brick or turn-key", "Comparables to support GDV"); (4) Notes column of dated evidence-trail entries naming individuals on both sides ("Confirmed by Alex to Liv (QDF) 08/04/2026", "email from John Parker (01/04/2026)"); (5) section rows mirroring a credit paper: CLIENT / SITE AND PLANNING / CONSTRUCTION / COMPLETED UNITS / SALES & MARKETING; (6) candid broker-side flags ("machinery loan is new vs QDF's original assumption… flag to Liv") — internal working language.
- **Disambiguation:** vs generic DD/document checklist — a generic checklist lists document names with received/missing states; this lists lender-posed credit questions with a lender-pack-aware tri-state status and per-item provenance. Presence of a named lender + "In Lender Pack" status is decisive.
- **Version semantics:** successive versions are **pure status migration** — identical requirement set, statuses moving Outstanding → Now Provided, with appended dated "Update DD/MM/YYYY:" notes; V1.0 notes read prospective ("To be confirmed…"), V1.1 evidential ("Confirmed by…"). Distinguish versions by status-column deltas, not structure. Latest is operative.

---

## 4. Classifier warnings (filenames lie)

Documented traps, each evidenced in the corpus:

1. **"Knight Frank Valuation.png" is NOT a valuation.** The body says "PRICING EXERCISE" and "does not constitute a valuation or appraisal and must not be construed or relied upon as such". Text-body disclaimers must outrank filename tokens for the valuation/pricing distinction (the Red Book rule, §3.17). This is the highest-risk confusion in folder 1.
2. **"4868 Dark Mills" PDFs are architect drawing packs, not valuations.** Both batch briefs (F and G) guessed "formal valuation report, job no. 4868"; the content is RRA Architects sketch/drawing packs (drawings 4868-008…-017). **The 4868 job-number trap:** a leading bare number is a third-party job/drawing-register number — here the *architect's* — and must never be read as a valuer's reference. The same job number recurs across three files in three folders (folder 1 markup, folder 4 pack, folder 5 re-download).
3. **LenderBrief files tokened INTERNAL that contain the EXTERNAL brief.** The Notes-folder copies are filenamed `…_INTERNAL_V2.0…` but their body name-stamps read `Note_AL_EXTERNAL_V2.0_20260306` and the register is promotional external pitch. **Body stamp + register win over the filename audience token**; the filename records filing custody, not audience.
4. **Drive owner is always rockcap.uk — never a producer signal.** Every file in the corpus, including client-produced land appraisals, council decision notices, and Knight Frank reports, is Drive-owned by rayns@ or alex@rockcap.uk (RockCap uploaded them). Producer must come from content.
5. **Client in-sheet version stamps are frozen.** The client Land Appraisal Summary tab says "Version Nr: 1 / Date: 28/03/2023" in V3, V4, and V5 alike — the in-sheet stamp was never maintained. **Trust the filename V-token for client files, never the version cell.**
6. **Version numbering is not in lockstep across name variants.** `DarkMills_AppendixA_RS_V1_2_20260410.xlsx` and `DarkMills_AppendixA_ComparableSchedule_RS_V1_2_20260518.xlsx` share version V1_2 under different name-forms and different dates. **Order series members by the date token, not the version token, across name variants.**
7. **" (1)" and ".pdf.pdf" download artifacts.** `DarkMills_LenderAnalysis_RockCap_March2026 (1).docx` carries a browser/Drive duplicate-download suffix (non-semantic — strip before parsing); `4868_20Dark_20Mills_2020241217.pdf.pdf` carries a doubled extension from re-download.
8. **URL-encoded names.** The same Credit file's `%20` sequences were mangled to `_20` (`4868_20Dark_20Mills_2020241217`) — decode before token parsing, and note the date token can be visually swallowed (`2020241217` = `%20` + `20241217`).
9. **Corollary traps also evidenced:** filename dates on lender terms trail internal issue dates by 1–3 days (filename = received/saved date); project-name typos in filenames ("DarkMils" twice, "Dartmills") require fuzzy matching; lender templates still say "Indicative Terms" at credit stage (stage from entity + date, not heading); image-only files (PNG, CAD PDFs) extract sparse/garbled text — the classifier needs a low-text fallback path keyed on filename convention + label-token profile; placeholder columns in RockCap workbooks contain template junk (17,672,518%, `#NUM!`) that parsers must not read as data; OCR noise in screenshots ("$106" for S106, "€" for £).

---

## 5. Naming convention (target)

The RockCap-native convention distilled from the corpus:

```
<Project>_<DocType>_<Initials…>_<AUDIENCE>_V<maj.min>_<YYYYMMDD>.<ext>
```

- **Underscores** as delimiters; **full words** in Project and DocType tokens (DarkMills, LenderComparison, AccommodationSchedule, CreditChecklist, LenderBrief).
- **Initials map to Drive owners / people:** `RS` = rayns@rockcap.uk (Rayn Smid, modeller), `AL` = alex@rockcap.uk (Alex Lundberg, Relationship Manager), `JP` = third party (agent commentator — the "JP Comments" column author). Initials pairs on LenderComparison files map exactly to Drive owners (V1.0 `RS`-only owned by rayns; V1.1/V1.2 `RS_AL` owned by alex). **Initials accrete as reviewers join** (RS → RS_AL_JP) — multi-initial runs signal a reviewed/negotiated artefact.
- **AUDIENCE token:** `INTERNAL` = the `.xlsm` macro-enabled source-of-truth workbook (~12MB, frequent version increments); `EXTERNAL` = the `.xlsx` sanitised export cut at issue points (macros stripped, workings progressively removed). Extension, size, and token agree; never observed reversed. (For docx Notes, remember trap §4.3: body stamp wins.)
- **Model-file extended form:** `<Project>_<Client>_RockCap_<II>_<II>_<[V]n.n>_<AUDIENCE>_<YYYYMMDD>` — the literal `RockCap` producer token is by itself decisive. The `V` prefix appears only on EXTERNALs in the model set (INTERNALs use bare `n.n`) — weak but real.
- **Lender-specific docs embed the lender token:** `<Project>_<LENDER>_CreditChecklist_…`.
- **Note-genre docs embed the genre/event:** `<Project>_<LenderBrief|InitialCall>_Note_<II>_<AUDIENCE>_V<n.n>_<YYYYMMDD>`, with the same string repeated as the body's first-line name-stamp.
- **Lender-terms variant (inbound artifacts, RockCap-saved):** `<Lender>Terms_<Project>_<YYYYMMDD>` — lender prefix as primary index key, requiring a lender-alias table (HTB, QDF, UTB, …).

**Observed malleability the parser must tolerate:**

- Typos in project tokens: "DarkMils" (HTB pair), "Dartmills" (legacy) — fuzzy-match project names.
- Ad-hoc variant tokens welded to prefixes: "HTBTerms**3Monthleadin**" — treat any non-date token beyond lender+project as a scenario qualifier, never a different lender.
- Version-token style drift: dot `V2.1`/`V3.1` vs underscore `V1_1`/`V1_7` — per-series habit, not per-date; both mean maj.min. Long-form vs short-form DocType names coexist (`AppendixA` vs `AppendixA_ComparableSchedule`) with non-lockstep version numbers — order by date token across variants.
- Multi-initial runs of variable length (RS / RS_AL / RS_AL_JP).
- Token-order drift: AUDIENCE-before-version (`…_EXTERNAL_V2.0_…` on Notes/LenderBrief; `…_EXTERNAL_V1.2_…` on LenderComparison) vs version-before-AUDIENCE (`…_V2.1_EXTERNAL_…` on models) — parse tokens by shape (ALL-CAPS audience, `V?\d[._]\d`, `\d{8}`), not by position.
- Non-convention families to recognise, not force-fit: client files (`Land Appraisal - <Project> V<n> <freetext>`, spaces, prose freetext, optional embedded ddmmyy); legacy pre-convention files (DDMMYYYY *prefix*, spaces and hyphens: `20012025 Dartmills - Kinspire - Lender Appraisal.xlsm`); tidied statutory/third-party names (mixed `D-M-YYYY`, `D-M-YY`, `DD.MM.YYYY` dates); third-party job-number grammar (`4868 Dark Mills 20241217.pdf`); download artifacts (" (1)", ".pdf.pdf", URL-encoding).

---

## 6. Ground-truth regression corpus

All 59 files under `/Kinspire/Dark Mills/`. This table is the Phase 5 eval set. Paths are relative to the project root. Rows marked *(inferred)* are version-series members attested by the reports' series descriptions but not individually deep-read; their date/name details follow the series pattern and should be verified against Drive at suite-build time. **UNREADABLE** = extraction failed via connector (.xlsm mime unsupported and/or >10MB) — 5 such files, plus 2 series-inferred .xlsm not attempted. (The commissioning brief said 3 unreadable .xlsm; the reports evidence 5 — conflict flagged, reports win.)

| # | Path | Canonical docType | Target folder / subfolder | Producer | Audience | Notes |
|---|------|-------------------|---------------------------|----------|----------|-------|
| 1 | 1. Modelling Info and Terms Request/Knight Frank Valuation.png | Agent Pricing Exercise | 1. Modelling Info and Terms Request | third-party-professional (Knight Frank) | external | **Misnamed** — not a valuation; body disclaims it. Jan 2026 schedule-only refresh |
| 2 | 1. Modelling Info and Terms Request/DM Outline Planning Permission 13-10-2004.pdf | Planning Permission Decision Notice | 1. Modelling Info and Terms Request | statutory-authority (Stroud DC) | neutral | Ref S.03/146; outline, 36 units |
| 3 | 1. Modelling Info and Terms Request/DM S106 Change 10-7-2012.pdf | S106 Discharge/Variation | 1. Modelling Info and Terms Request | statutory-authority | neutral | Ref S.11/2298/106R; removes over-50s restriction |
| 4 | 1. Modelling Info and Terms Request/Dark Mills Confirmation of Commencement 9-6-10.pdf | Commencement Confirmation Letter | 1. Modelling Info and Terms Request | statutory-authority | external (client-side record) | Ref S.07/1856/REM; permission extant |
| 5 | 1. Modelling Info and Terms Request/4868 Dark Mills 20240903 KT Mark up.pdf | Site Plan Markup (architect drawing) | 1. Modelling Info and Terms Request | third-party-professional (architect; KT markup) | internal/working | Low-text drawing; 4868 = architect job no. |
| 6 | 1. Modelling Info and Terms Request/KF Pricing Report - Dark Mills 12.05.2021.pdf | Agent Pricing Report | 1. Modelling Info and Terms Request | third-party-professional (Knight Frank) | external | Letter-form proposal; NOT a valuation |
| 7 | 1. Modelling Info and Terms Request/Client Appraisals/Land Appraisal - Dark Mills V5 Final Budget for legals.xlsx | Client Land Appraisal | 1 / Client Appraisals | client (Kinspire) | internal-to-client, shared | Operative version; in-sheet version stamp frozen |
| 8 | 1. Modelling Info and Terms Request/Client Appraisals/Land Appraisal - Dark Mills V4 Latest Cost estimate 090126.xlsx | Client Land Appraisal | 1 / Client Appraisals | client | internal-to-client, shared | Cost re-estimate; ddmmyy in freetext |
| 9 | 1. Modelling Info and Terms Request/Client Appraisals/Land Appraisal - Dark Mills V3 Final Budget for legals.xlsx | Client Land Appraisal | 1 / Client Appraisals | client | internal-to-client, shared | Freetext identical to V5 — only V-token distinguishes |
| 10 | 1. Modelling Info and Terms Request/Rockcap Appraisals/DarkMills_Kinspire_RockCap_RS_AL_3.0_INTERNAL_20260515.xlsm | RockCap Appraisal Model INTERNAL | 1 / Rockcap Appraisals | rockcap | internal | **UNREADABLE** (.xlsm mime, ~12.3MB); classify on filename+mime+size |
| 11 | 1. Modelling Info and Terms Request/Rockcap Appraisals/DarkMills_Kinspire_RockCap_RS_AL_2.1_INTERNAL_20260306.xlsm | RockCap Appraisal Model INTERNAL | 1 / Rockcap Appraisals | rockcap | internal | **UNREADABLE**; same-day source of the V2.1 EXTERNAL |
| 12 | 1. Modelling Info and Terms Request/Rockcap Appraisals/DarkMills_Kinspire_RockCap_RS_AL_V2.1_EXTERNAL_20260306.xlsx | RockCap Appraisal Model EXTERNAL | 1 / Rockcap Appraisals | rockcap | external (lenders) | Canonical master of the pack copy (#17); Lender Dashboard - BFS |
| 13 | 1. Modelling Info and Terms Request/Rockcap Appraisals/DarkMills_Kinspire_RockCap_RS_AL_1.1_INTERNAL_20260106 - 2.xlsm | RockCap Appraisal Model INTERNAL | 1 / Rockcap Appraisals | rockcap | internal | Verified in Drive mirror (12.2MB); " - 2" copy-suffix deviation; skipped, presumed unreadable .xlsm |
| 14 | 1. Modelling Info and Terms Request/Rockcap Appraisals/DarkMills_Kinspire_RockCap_RS_AL_2.0_INTERNAL_20260227.xlsm | RockCap Appraisal Model INTERNAL | 1 / Rockcap Appraisals | rockcap | internal | Verified in Drive mirror (12.2MB, modified 2026-02-27); skipped, presumed unreadable .xlsm |
| 15 | 1. Modelling Info and Terms Request/Rockcap Appraisals/DarkMills_Kinspire_RockCap_RS_AL_V1.1_EXTERNAL_20260210.xlsx | RockCap Appraisal Model EXTERNAL | 1 / Rockcap Appraisals | rockcap | external (lenders) | Earlier scheme (GIA 34,132 sqft — tracks client V3) |
| 16 | 1. Modelling Info and Terms Request/Lender Pack/DarkMills_LenderBrief_Note_AL_EXTERNAL_V2.0_20260306.docx | Lender Brief Note (EXTERNAL) | 1 / Lender Pack (curated — see §1 rule) | rockcap | external (lenders) | Only doc authored for the pack; edited 13 min after copy-in |
| 17 | 1. Modelling Info and Terms Request/Lender Pack/DarkMills_Kinspire_RockCap_RS_AL_V2.1_EXTERNAL_20260306.xlsx | RockCap Appraisal Model EXTERNAL | canonical: 1 / Rockcap Appraisals | rockcap | external | **Dup-of #12** (near-identical; one £0 cell delta); pack send artifact 2026-03-06 |
| 18 | 1. Modelling Info and Terms Request/Lender Pack/Land Appraisal - Dark Mills V4 Latest Cost estimate 090126.xlsx | Client Land Appraisal | canonical: 1 / Client Appraisals | client | internal-to-client, shared | **Dup-of #8**; createdTime cluster + createdTime>modifiedTime |
| 19 | 1. Modelling Info and Terms Request/Lender Pack/DM Outline Planning Permission 13-10-2004.pdf | Planning Permission Decision Notice | canonical: 1 (loose) | statutory-authority | neutral | **Dup-of #2** |
| 20 | 1. Modelling Info and Terms Request/Lender Pack/DM S106 Change 10-7-2012.pdf | S106 Discharge/Variation | canonical: 1 (loose) | statutory-authority | neutral | **Dup-of #3** |
| 21 | 1. Modelling Info and Terms Request/Lender Pack/Dark Mills Confirmation of Commencement 9-6-10.pdf | Commencement Confirmation Letter | canonical: 1 (loose) | statutory-authority | external (client-side record) | **Dup-of #4** |
| 22 | 1. Modelling Info and Terms Request/Lender Pack/4868 Dark Mills 20240903 KT Mark up.pdf | Site Plan Markup (architect drawing) | canonical: 1 (loose) | third-party-professional | internal/working | **Dup-of #5** |
| 23 | 1. Modelling Info and Terms Request/Lender Pack/KF Pricing Report - Dark Mills 12.05.2021.pdf | Agent Pricing Report | canonical: 1 (loose) | third-party-professional | external | **Dup-of #6** |
| 24 | 2. Terms Received/UTBTerms_DarkMills_20260309.png | Lender Indicative Terms | 2. Terms Received | lender (UTB) | borrower/broker | Screenshot; earliest quote on deal |
| 25 | 2. Terms Received/HTBTerms_DarkMils_20260313.pdf | Lender Indicative Terms | 2. Terms Received | lender (HTB) | borrower/broker | **Misnamed** project ("DarkMils"); internal date 10 Mar; superseded by #31 |
| 26 | 2. Terms Received/QDFTerms_DarkMills_20260313.png | Lender Indicative Terms | 2. Terms Received | lender (QDF) | borrower/broker | Screenshot; QDF v1, superseded by #29 |
| 27 | 2. Terms Received/TriplePointTerms_DarkMills_20260313.png | Lender Indicative Terms | 2. Terms Received | lender (Triple Point) | broker/borrower | Email-body screenshot; broker addressed as "Laburnum" |
| 28 | 2. Terms Received/ShawbrookTerms_DarkMills_20260316.png | Lender Indicative Terms | 2. Terms Received | lender (Shawbrook) | borrower/broker | Branded proposal-panel screenshot; most leveraged quote (70%/88%) |
| 29 | 2. Terms Received/QDFTerms_DarkMills_20260317.png | Lender Indicative Terms | 2. Terms Received | lender (QDF) | borrower/broker | Screenshot; re-price (margin 5.65%→4.75%); operative QDF indicative |
| 30 | 2. Terms Received/ParagonTerms_DarkMills_20260317.pdf | Lender Indicative Terms | 2. Terms Received | lender (Paragon) | borrower (River Investments) via broker | Most complete formal term sheet; names RockCap's introductory fee |
| 31 | 2. Terms Received/HTBTerms3Monthleadin_DarkMils_20260319.pdf | Lender Indicative Terms | 2. Terms Received | lender (HTB) | borrower/broker | **Misnamed** project; "3Monthleadin" = scenario qualifier; operative HTB version |
| 32 | 3. Terms Analysis/DarkMills_LenderComparisonTable.xlsx | Lender Comparison Table (triage) | 3. Terms Analysis | rockcap | internal working | Pre-convention name (no version/date/initials); includes Downing "Declined" |
| 33 | 3. Terms Analysis/DarkMills_LenderComparison_RS_INTERNAL_V1.0_20260316.xlsm | Lender Comparison Sheet (INTERNAL) | 3. Terms Analysis | rockcap | internal | **UNREADABLE** (.xlsm, 12.16MB > 10MB limit) |
| 34 | 3. Terms Analysis/DarkMills_LenderComparison_RS_AL_INTERNAL_V1.1_20260323.xlsm | Lender Comparison Sheet (INTERNAL) | 3. Terms Analysis | rockcap | internal | **UNREADABLE**; modified after V1.2 external cut — source of truth |
| 35 | 3. Terms Analysis/DarkMills_LenderComparison_RS_AL_EXTERNAL_V1.1_20260323.xlsx | Lender Comparison Sheet (EXTERNAL) | 3. Terms Analysis | rockcap | external (client) | 4 sheets — embeds appraisal+cashflow (trap: do not demote to folder 1) |
| 36 | 3. Terms Analysis/DarkMills_LenderAnalysis_RockCap_March2026 (1).docx | Lender Analysis Note | 3. Terms Analysis | rockcap | external (client, Confidential) | **" (1)" download artifact** in name; recommends QDF |
| 37 | 3. Terms Analysis/DarkMills_LenderComparison_RS_AL_EXTERNAL_V1.2_20260324.xlsx | Lender Comparison Sheet (EXTERNAL) | 3. Terms Analysis | rockcap | external (client) | Operative client deliverable; comparison sheet only, 31KB |
| 38 | 4. Comps/DarkMills_AccommodationSchedule_RS_V1_1_20260422.xlsx *(inferred)* | Accommodation Schedule | 4. Comps | rockcap | internal deal team | Series-inferred (report F: underscore-style V1_1 in "the 20260422 file") |
| 39 | 4. Comps/DarkMills_AccommodationSchedule_RS_V2.0_20260518.xlsx *(inferred)* | Accommodation Schedule | 4. Comps | rockcap | internal deal team | Series-inferred ("three V2.x versions saved the same day") |
| 40 | 4. Comps/DarkMills_AccommodationSchedule_RS_V2.1_20260518.xlsx *(inferred)* | Accommodation Schedule | 4. Comps | rockcap | internal deal team | Series-inferred, same-day V2.x churn |
| 41 | 4. Comps/DarkMills_AccommodationSchedule_RS_V2.2_20260518.xlsx | Accommodation Schedule | 4. Comps | rockcap | internal deal team | Multi-source pricing grid (Kinspire V4/V5, KF, RockCap); "Pricing TBC" |
| 42 | 4. Comps/DarkMills_AccommodationSchedule_RS_AL_JP_V3.1_20260522.xlsx | Accommodation Schedule | 4. Comps | rockcap (+ agent JP input) | internal deal team | Operative converged version; single agreed pricing + JP Comments |
| 43 | 4. Comps/4868 Dark Mills 20241217.pdf | Architect Drawing Pack | 4. Comps | third-party-professional (RRA Architects) | design team / filed as scheme evidence | **Misnamed by briefs as valuation** — sketch drawing pack; 15MB; same bytes re-downloaded as #55 |
| 44 | 4. Comps/Appendix/DarkMills_AppendixA_ComparableSchedule_RS_V1_1_[date].xlsx *(inferred)* | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Series-inferred (long-form name used in V1_1/V1_2) |
| 45 | 4. Comps/Appendix/DarkMills_AppendixA_RS_V1_2_20260410.xlsx | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Short-form name at V1_2 — version not in lockstep with #46; order by date |
| 46 | 4. Comps/Appendix/DarkMills_AppendixA_ComparableSchedule_RS_V1_2_20260518.xlsx | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Long-form name; Tiers 1,3,4,5,6; verification-forensic notes |
| 47 | 4. Comps/Appendix/DarkMills_AppendixA_RS_V1_3_[date].xlsx *(inferred)* | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Series-inferred (V1_1→V1_7 series); name-form/date unattested |
| 48 | 4. Comps/Appendix/DarkMills_AppendixA_RS_V1_4_[date].xlsx *(inferred)* | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Series-inferred; short-form from V1_4 onward |
| 49 | 4. Comps/Appendix/DarkMills_AppendixA_RS_V1_5_[date].xlsx *(inferred)* | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Series-inferred |
| 50 | 4. Comps/Appendix/DarkMills_AppendixA_RS_V1_6_[date].xlsx *(inferred)* | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Series-inferred |
| 51 | 4. Comps/Appendix/DarkMills_AppendixA_RS_V1_7_20260522.xlsx | Comparable Schedule / Appendix A | 4 / Appendix | rockcap | lender credit team | Operative version; Tiers 1+5 (tier-number gaps = version tell) |
| 52 | 5. Credit/DarkMills_QDF_CreditChecklist_RS_V1_0_20260401.docx | Credit Checklist | 5. Credit | rockcap | internal | 10 items Outstanding; prospective notes |
| 53 | 5. Credit/DarkMills_QDF_CreditChecklist_RS_V1_1_20260413.docx | Credit Checklist | 5. Credit | rockcap | internal | Operative; 3 Outstanding; dated confirmations to Liv (QDF) |
| 54 | 5. Credit/QDFTerms_DarkMills_20260523.png | Credit-stage Terms | 5. Credit | lender (QDF) | inbound to broker/borrower | Names resolved SPV River Investments Ltd; template still says "Indicative Terms" |
| 55 | 5. Credit/4868_20Dark_20Mills_2020241217.pdf.pdf | Architect Drawing Pack | canonical: 4. Comps | third-party-professional (RRA Architects) | credit-submission attachment | **Dup-of #43** (re-download; URL-encoded name, .pdf.pdf); extraction garbled (CAD symbol fonts); brief wrongly expected valuation |
| 56 | Notes/20012025 Dartmills - Kinspire - Lender Appraisal.xlsm | Legacy development appraisal model (.xlsm) | Notes | client/developer model held by broker (per report G: INTERNAL producer/audience) | internal | **UNREADABLE** (.xlsm mime); **misnamed** "Dartmills"; legacy DDMMYYYY-prefix name; identified via call-note cross-reference |
| 57 | Notes/DarkMills_LenderBrief_Note_AL_INTERNAL_V1.0_20260211.docx | Lender Brief Note (internal filing copy) | Notes | rockcap | **external by content** (body stamp EXTERNAL_V1.0) | Filename/body audience mismatch; earlier facts (14 affordable, 6-month land loan) |
| 58 | Notes/DarkMills_LenderBrief_Note_AL_INTERNAL_V2.0_20260306.docx | Lender Brief Note (internal filing copy) | Notes | rockcap | **external by content** (body stamp EXTERNAL_V2.0) | Filing copy of #16; body stamp wins over filename token |
| 59 | Notes/DarkMills_InitialCall_Note_AL_INTERNAL_V1.0_20260109.docx | Initial Call Note | Notes | rockcap | internal (filename and body agree) | `[User Note, cite: N]` markers; earliest doc in deal narrative |

**Folder "6. Post Completion": no rows** — app-added, no exemplars yet.

**Corpus accounting:** folder 1 loose 6 + Client Appraisals 3 + Rockcap Appraisals 6 + Lender Pack 8 + Terms Received 8 + Terms Analysis 6 + Comps root 6 + Appendix 8 + Credit 4 + Notes 4 = **59**. Deep/skim-read: 48; series-inferred (not individually read): 11 (#13, #14, #38–40, #44, #47–50 — verify names/dates against Drive when building the suite; #45 was named in report F but not opened). Confirmed unreadable .xlsm: 5 (#10, #11, #33, #34, #56); presumed-unreadable inferred .xlsm: 2 (#13, #14). Duplicates: 8 (#17–23 pack copies, #55 credit re-download).

### Flagged conflicts / discrepancies (do not silently resolve)

1. **Unreadable count:** the commissioning brief says "3 unreadable .xlsm"; the reports evidence **5** confirmed extraction failures (B×2, E×2, G×1). This pack marks all 5.
2. **"4868" identity:** batch F's and batch G's *briefs* both expected a valuation report; both agents' *content reads* found RRA Architects drawing packs. Reports agree with each other; the pack treats these as drawing packs and records the trap (§4.2). Report G hedges that its garbled copy could theoretically be a valuation's drawing appendix — cross-check the readable "4. Comps" copy (#43) settles it as drawings.
3. **"KT" attribution:** report A calls the 20240903 markup an architect/consultant drawing "marked up by KT" (practice name unrecoverable); report C glosses "KT = consultant mark-up (K-Ten drainage appears in the client timesheet)". Producer axis (third-party professional) is unaffected; the person behind "KT" is unresolved.
4. **KF Pricing Report shorthand:** report C's spot-check table calls it "agent-produced **valuation evidence**"; report A's deep read is explicit that it is a pricing opinion, NOT a valuation. Report A (deep read) is authoritative; C's phrase is loose shorthand.
5. **Report E internal timestamp muddle:** report E's own text stumbles over whether INTERNAL V1.1 was modified before or after the V1.2 external cut ("created 15:05 same day? no —"); its conclusion (internal edited 13:51, external V1.2 re-cut after → internal is source of truth) is retained, but the timestamps should be re-verified if load-bearing.
6. **#56 producer:** report G assigns the legacy "Lender Appraisal" .xlsm "INTERNAL producer/audience (developer's model held by broker)" — producer ambiguous between client and RockCap since content is unreadable; the row records report G's verdict verbatim.

---

## Appendix: legacy type mapping (Phase 3, 2026-07-07)

Every fileType in `convex/fileTypeDefinitions.ts` (plus the reference-library-only types) mapped to the new folder-key vocabulary. Authoritative implementation: `src/v4/lib/placement-rules.ts` (FILE_TYPE_PLACEMENT / CATEGORY_PLACEMENT / resolveAxisPlacement). "cat. default" = the type has no explicit row; its category default applies. Producer-conditional rows are marked ⚙.

| fileType | Category | New folderKey | Level | Rationale |
|---|---|---|---|---|
| Appraisal ⚙ | Appraisals | producer=client → `client_appraisals`; producer=rockcap → `rockcap_appraisals`; else `modelling_info` | project | §2 axis 1 — developer-ops vs debt-structuring DNA decides the sibling subfolder; unknown producer files to the parent |
| Cashflow ⚙ | Appraisals | same axis rule as Appraisal | project | A cashflow is appraisal-genre; old `operational_model` folder no longer exists |
| RedBook Valuation | Appraisals | `modelling_info` | project | Third-party professional asset evidence (pre-terms input) |
| Client Land Appraisal (new) | Appraisals | `client_appraisals` | project | §3.1 |
| RockCap Appraisal Model (new) | Appraisals | `rockcap_appraisals` | project | §3.2/3.3 — any audience; INTERNAL + EXTERNAL cuts live together |
| Floor Plans / Elevations / Sections / Site Plans / Location Plans | Plans | `modelling_info` (cat. default) | project | Drawings are asset evidence for modelling |
| Architect Drawing Pack (new) | Plans | `modelling_info` | project | §3.13 — canonical home folder 1; comps/credit copies are circumstantial |
| Initial / Interim Monitoring Report | Inspections | `post_completion` | project | Monitoring is a post-completion workstream (unchanged) |
| Planning Documentation | Professional Reports | `modelling_info` | project | Statutory planning record = asset-fact gathering (§1 folder 1) |
| Planning Permission Decision Notice (new) | Professional Reports | `modelling_info` | project | §3.14 |
| S106 Discharge/Variation (new) | Professional Reports | `modelling_info` | project | §3.15 |
| Commencement Confirmation Letter (new) | Professional Reports | `modelling_info` | project | §3.16 |
| Agent Pricing Report (new) | Professional Reports | `modelling_info` | project | §3.17 — pre-terms revenue/GDV evidence |
| Contract Sum Analysis | Professional Reports | `modelling_info` | project | Cost evidence feeding the model |
| Comparables | Professional Reports | `comps_appendix` | project | Address-keyed external evidence = the Appendix deliverable class |
| Building Survey | Professional Reports | `modelling_info` | project | Asset condition evidence, pre-terms |
| Environmental Report | Professional Reports | `modelling_info` | project | Asset evidence, pre-terms |
| Report on Title | Professional Reports | `credit` | project | Solicitor DD produced in the post-selection execution workstream |
| Legal Opinion | Professional Reports | `credit` | project | Same — credit-process legal DD |
| Local Authority Search | Professional Reports | `credit` | project | Conveyancing DD for the credit/completion process |
| Passport / Driving License / Utility Bill / Bank Statement / Application Form / Assets & Liabilities Statement / Track Record / Certificate of Incorporation / Company Search / Tax Return / ID Document / Proof of Address | KYC (+ Financial for Tax Return) | `kyc` | client | Client-level unchanged; `kyc` is now a child of `background` (parent fallback covers old clients) |
| Indicative Terms | Loan Terms | `terms_received` | project | §3.6 — single-lender inbound quote. The old lender-clientType override to `terms_request` is dropped: the new taxonomy has one content-keyed terms lane |
| Term Sheet | Loan Terms | `terms_received` | project | Generic lender-issued terms artifact |
| Credit Backed Terms | Loan Terms | `credit` | project | §3.7 — credit-stage terms (resolved-SPV marker) |
| Lender Comparison Sheet (new) | Loan Terms | `terms_analysis` | project | §3.8 |
| Lender Comparison Table (new) | Loan Terms | `terms_analysis` | project | §3.9 |
| Lender Analysis Note (new) | Loan Terms | `terms_analysis` | project | §3.10 |
| Facility Letter | Legal Documents | `post_completion` | project | Executed facility doc → facility administration |
| Personal Guarantee / Corporate Guarantee / Debenture / Share Charge / Collateral Warranty / Corporate Authorisations / Terms & Conditions | Legal Documents | `post_completion` | project | Executed security/facility docs (the "facility docs → post_completion" rule) |
| Building Contract / Professional Appointment / Shareholders Agreement | Legal Documents | `credit` | project | Credit-submission items (CONSTRUCTION / CLIENT sections of the credit checklist) |
| Title Deed / Lease | Legal Documents | `modelling_info` | project | Asset title facts — asset evidence, not deal execution |
| Accommodation Schedule | Project Documents | `comps` | project | §3.11 — subject plot grid, comps root |
| Comparable Schedule (new) | Project Documents | `comps_appendix` | project | §3.12 — Appendix A deliverable slot |
| Credit Checklist (new) | Project Documents | `credit` | project | §3.18 |
| Build Programme / Specification / Tender / CGI/Renders | Project Documents | `modelling_info` (cat. default) | project | Scheme-description inputs to the model |
| Loan Statement / Redemption Statement / Completion Statement | Financial Documents | `post_completion` | project | Facility administration |
| Invoice | Financial Documents | `post_completion` | project | Drawdown/monitoring evidence (old `operational_model` gone) |
| Receipt | Financial Documents | `background_docs` (cat. default) | client | No project-lifecycle home; client financial background |
| Insurance Policy / Insurance Certificate | Insurance | `post_completion` | project | Unchanged |
| Email/Correspondence / Meeting Minutes | Communications | `notes` | project | RockCap internal working record |
| Lender Brief Note (new) | Communications | `notes` | project | §3.4 — filing copies/drafts; the EXTERNAL send copy is pack-curated (never auto-filed to lender_pack) |
| Initial Call Note (new) | Communications | `notes` | project | §3.5 |
| NHBC Warranty / Latent Defects Insurance | Warranties | `post_completion` | project | Warranty docs are completion-adjacent facility security |
| Site Photographs | Photographs | `modelling_info` (cat. default) | project | Asset evidence; progress photos ride with monitoring reports |
| Other | Other | `miscellaneous` | client | Unchanged |

**Hard rule:** `lender_pack` is NEVER a mapping target (see §1). **Fallback:** a project-scoped document matching no rule files to `modelling_info` with `lowConfidence: true` on the PlacementResult (the explicit successor of the old `unfiled` fallback — the DB resolver still falls through to a legacy `unfiled` folder row on pre-taxonomy projects); client-scoped falls back to `miscellaneous` as before. **Subfolder fallback:** the DB resolvers (`resolveProjectFolderKey` / `resolveClientFolderKey` in `convex/driveSync.ts`) resolve nested keys exact-first, then walk the parent chain (`client_appraisals` → `modelling_info`; `kyc` → `background`), then `modelling_info` → legacy `unfiled`/`background` → any folder.
