# Filename extraction patterns

Filenames in RockCap document intakes carry structured metadata: scheme name, sponsor, lender, date, plot/unit reference, version, revision marker. The deal-intake skill extracts this metadata BEFORE handing docs to V4 (pre-validation: enriches V4's input) AND validates V4's output AFTER classification (sanity-check: caught Track Record mismatch in corrections corpus 001/002).

Loaded by `deal-intake` skill at the doc-classification step. Output: enriched metadata written to `documents` via `documents.update` (or kept in-memory if minor).

## Voice + format rules

- Patterns shown as filename templates with `{placeholders}` and matching regex.
- All regex assumed case-insensitive unless noted; whitespace and `_` / `-` / `.` treated as soft separators.
- Cite production examples by exact filename in backticks.

---

## Pattern 1 — Heads of Terms (scheme + HOTs + date)

**Template.** `{scheme} HOTs {DDMMYY}.{ext}`
**Regex.** `(?<scheme>[\w\s\-]+?)\s+HOTs\s+(?<date>\d{6})\.(pdf|docx)`
**Examples (production).**
- `Comberton HOTs 011225.pdf` → scheme=Comberton, date=2025-12-01

**Extracted metadata to persist:**
- `documents.fileTypeDetected` should be `Indicative Terms` or `Heads of Terms`
- `knowledgeItems` at `deal.indicativeTermsDate` with the parsed date
- Cross-check against `category=Loan Terms`

**Detection use:** confirms Phase ≥ indicative_terms; signals multi-lender shopping if multiple matches with different dates.

---

## Pattern 2 — Lender-specific artefact (scheme + dash + lender)

**Template.** `{scheme} - {lender}.{ext}`
**Regex.** `(?<scheme>[\w\s]+)\s*-\s*(?<lender>[\w\s]+)\.(pdf|docx|xlsx)`
**Examples (production).**
- `Manor Park - Octane.pdf` → scheme=Manor Park, lender=Octane (likely Facility Letter)
- `Manor Park - Shawbrook.docx` → scheme=Manor Park, lender=Shawbrook (likely PG)
- `Comberton - Bayfield - Lender Appraisal.xlsx` → 3-segment variant: scheme=Comberton, sponsor=Bayfield, purpose="Lender Appraisal"

**Extracted metadata:**
- `knowledgeItems` at `deal.lenders[]` — array of lender names referenced in doc batch
- Maps to existing `clients` rows where `type=lender` (if match, link via `clientRoles`)

**Detection use:** multi-lender shopping detected if 3+ distinct lenders appear in filenames → strongly suggests Bridging type.

---

## Pattern 3 — Multi-lender comparison memo

**Template.** `{lender1}_{lender2}[...]_HoTSComparison.{ext}` (no scheme — usually it's clear from folder)
**Regex.** `(?<lenders>[\w_]+)_HoTS?Comparison\.(xlsx|pdf|docx)`
**Examples (production).**
- `Shawbrook_Allica_HoTSComparison.xlsx` → lenders=[Shawbrook, Allica]

**Extracted metadata:**
- `documents.fileTypeDetected` should be `Terms Comparison Memo` (vocab gap — currently classifier puts as `Term Sheet`)
- `knowledgeItems` at `deal.lendersCompared[]` — explicit comparison set

**Detection use:** strong Bridging signal. Also: this doc type should NEVER be linked to `Planning Decision Notice` checklist requirement (see corrections corpus 003).

---

## Pattern 4 — Dated appraisal / model (date prefix)

**Template.** `{DDMMYYYY} {scheme} - {sponsor} - {purpose}.{ext}`
**Regex.** `^(?<date>\d{8})\s+(?<scheme>[^-]+?)\s*-\s*(?<sponsor>[^-]+?)\s*-\s*(?<purpose>.+?)\.(xlsx|pdf)`
**Examples (production).**
- `25032025 Comberton - Bayfield - Lender Appraisal.xlsx` → date=2025-03-25, scheme=Comberton, sponsor=Bayfield, purpose=Lender Appraisal
- `15022025 Bayfield Portfolio.xlsx` → date=2025-02-15, scheme=Bayfield Portfolio (note: portfolio = multiple schemes, see Pattern 9)
- `03032025 Op Model - Monskbury Court - Kinspire Homes.xlsx` → date=2025-03-03, scheme=Monksbury Court (note: typo "Monskbury" in source), sponsor=Kinspire Homes, purpose="Op Model"

**Extracted metadata:**
- `documents.fileTypeDetected` should be `Appraisal` or `Cashflow` based on purpose keyword
- `knowledgeItems` at `deal.appraisalDate` with parsed date
- Detect scheme-name typos (Monskbury vs Monksbury) → add to alias list

---

## Pattern 5 — Per-unit-type plans (Type X + spec + plans + drawing-id + revision)

**Template.** `TYPE_{X}_-_{spec}_-_PLANS[_or_ELEVATIONS]-{drawing-id} {rev}.pdf`
**Regex.** `TYPE_(?<unitType>[A-Z0-9]+)_-_(?<spec>[^-]+)_-_(?<docKind>PLANS|ELEVATIONS|SECTIONS)[\w-]+\s+(?<rev>[Rr]ev\s+[A-Z])`
**Examples (production).**
- `TYPE_G2_-_4_BED_DETACHED-5598052 2-01 Rev D.pdf` → unitType=G2, spec="4 BED DETACHED", docKind=PLANS (inferred from filename containing PLANS), rev=Rev D
- `TYPE_A_-_2_BED_SEMI_DET._HOUSE_-_PLANS_ELEVATIONS-5598045 (A)PL-2-01 Rev D.pdf` → unitType=A, spec="2 BED SEMI DET. HOUSE", docKind=both PLANS+ELEVATIONS (special case)

**Extracted metadata:**
- These are **per-unit-type plan packs**. The skill clusters them as a single intake unit, not 18 unrelated docs.
- `knowledgeItems` at `scheme.unitMix` — array of unique unitType + spec combinations observed
- `documents.fileTypeDetected` should be `Floor Plans` or `Elevations` based on docKind

**Detection use:** confirms Development type (per-unit plans only exist for Development deals).

---

## Pattern 6 — Plot-specific plan revision

**Template.** `Amended Plot {N} {GF/FF/SF}.{ext}`
**Regex.** `Amended\s+Plot\s+(?<plotN>[\d,&\s]+)\s+(?<floor>GF|FF|SF|RP)\.(pdf|dwg)`
**Examples (production).**
- `Amended Plot 7 GF.pdf` → plotN=7, floor=GF (Ground Floor)
- `Amended Plots 3,4 & 5 FF.pdf` → plotN=[3,4,5], floor=FF (First Floor)

**Extracted metadata:**
- `knowledgeItems` at `scheme.planRevisions[]` — append-only log of revisions
- `documents.fileTypeDetected` = `Floor Plans` (Amended = revision)
- Tag with `revisionDate` from `_creationTime`

**Detection use:** signals `monitoring` phase (revisions happen during build).

---

## Pattern 7 — Portfolio document (sponsor + "Portfolio")

**Template.** `{DDMMYYYY} {sponsor} Portfolio[-laptop-XXXX].pdf`
**Regex.** `(?<date>\d{8})?\s*(?<sponsor>[\w\s]+)\s+Portfolio[\w\-\.]*\.(pdf|xlsx)`
**Examples (production).**
- `16012025 Bayfield Portfolio 2-LAPTOP-HSMTMDPH.pdf` → date=2025-01-16, sponsor=Bayfield, **portfolio doc covering 4 schemes**
- `Bayfield Portfolio 2-LAPTOP-HSMTMDPH.pdf` (variant without date) → portfolio doc

**Extracted metadata:**
- `documents.fileTypeDetected` = `Appraisal` (with note: portfolio scope, not single-scheme)
- `knowledgeItems` at `scheme.portfolioContext` if the doc references multiple schemes
- The `LAPTOP-XXXXX` suffix indicates the file was synced from a sponsor's laptop — informational only

**Detection use:** **portfolio docs should be weighted LESS in deal-type/phase detection** because they describe multiple schemes, not just the current one. They inflate plan/appraisal counts without proportionate signal.

---

## Pattern 8 — Numbered legal doc

**Template.** `{NN}. {abbrev} {date} - {state}.{ext}`
**Regex.** `^(?<order>\d{1,2})\.\s+(?<abbrev>[A-Z]+)\s+(?<date>[\d\s]+)\s*-?\s*(?<state>Signed|Draft|Executed|Final)?`
**Examples (production).**
- `02. FL 21 02 24 - Signed.pdf` → order=02, abbrev=FL (Facility Letter), date=2024-02-21, state=Signed
- `4. QDF Revised Facility Letter - Kinspire Property Ltd April 25.pdf` → order=4, abbrev=QDF, type=Revised Facility Letter, date=2025-04

**Extracted metadata:**
- Abbreviation expansion: FL=Facility Letter, PG=Personal Guarantee, SC=Share Charge, DEB=Debenture, RoT=Report on Title
- `documents.fileTypeDetected` set per expansion
- `knowledgeItems` at `deal.facilityLetterDate` or `deal.signedDate`

**Detection use:** signed Facility Letter present = phase ≥ post_credit.

---

## Pattern 9 — Statement files (Bank / Loan / Account)

**Template.** `Statement {DD-MMM-YY} AC {accountNumber} {sortCode}.{ext}` OR `statement-{YYYY-MM} (variant).pdf`
**Regex.** `(?:[Ss]tatement[-\s]+)(?<dateOrPeriod>\d{2}-[A-Z]{3}-\d{2}|\d{4}-(?:January|February|March|April|May|June|July|August|September|October|November|December))`
**Examples (production).**
- `Statement 31-JUL-25 AC 63989550 02053203.pdf` → date=2025-07-31
- `statement-2025-August (6).pdf` → period=2025-08

**Extracted metadata:**
- `documents.fileTypeDetected` = `Bank Statement` (mostly) or `Loan Statement` (if account # matches a known facility)
- `documents.category` = `KYC` (Bank Statement) or `Financial Documents` (Loan Statement)

---

## Special rule — macOS resource forks (`._*` prefix)

**Pattern.** Any filename starting with `._` is a macOS resource fork — a 0-byte sidecar that should NEVER be ingested.

**Examples (production noise).**
- `._Application Form[79] copy.pdf`
- `._statement-2025-August (6).pdf`
- `._ManorParkBrchMar25-FINAL-Digital.pdf`

**Skill behaviour:** the deal-intake skill SHOULD reject these at intake (before V4 runs) and emit a `gap` of kind `resource_fork_ingested`. Long-term fix is upload-side filter (see `.logbook/inbox.md` substrate D), but until then deal-intake catches them.

---

## Document code naming convention

V4 generates `documentCode` following: `{shortcode}-{type-abbrev}-{source}-{initials}-{version}-{date}`

**Examples (production):**
- `COMBER-FLRPLAN-EXT-KH-V1.0-2026-03-03` → shortcode=COMBER, type=FLRPLAN (Floor Plans), source=EXT (external sender), initials=KH (Kristian Hansen), version=V1.0, date=2026-03-03
- `COMBER-INDTERMS-EXT-KH-V1.0-2026-03-03` → type=INDTERMS (Indicative Terms)

**Type abbreviations observed in production:**
| Abbrev | Full type |
|---|---|
| FLRPLAN | Floor Plans |
| ELEV | Elevations |
| SITEPLN | Site Plans |
| APPR | Appraisal |
| CASHFL | Cashflow |
| INDTERMS | Indicative Terms |
| TERMSHT | Term Sheet |
| CRDBKDTERMS | Credit Backed Terms |
| FACLET | Facility Letter |
| RBKVAL | RedBook Valuation |
| IMR | Initial Monitoring Report |
| INTMR | Interim Monitoring Report |
| TRKREC | Track Record |
| ALIE | Assets & Liabilities Statement |
| BS | Bank Statement |

**Skill behaviour:** the deal-intake skill MAY validate documentCode for consistency, but should NOT mutate it (it's generated by the upstream V4 + bulkUpload pipeline).

---

## Persistence schema

Extracted filename metadata is persisted via `intelligence.addKnowledgeItem` at standardised fieldPaths:

| fieldPath | valueType | sourceType | Notes |
|---|---|---|---|
| `deal.indicativeTermsDate` | date | ai_extraction | From Pattern 1 |
| `deal.lenders[]` | array | ai_extraction | From Pattern 2 |
| `deal.lendersCompared[]` | array | ai_extraction | From Pattern 3 |
| `deal.appraisalDate` | date | ai_extraction | From Pattern 4 |
| `scheme.unitMix[]` | array | ai_extraction | From Pattern 5 |
| `scheme.planRevisions[]` | array | ai_extraction | From Pattern 6, append-only |
| `scheme.portfolioContext` | text | ai_extraction | From Pattern 7 |
| `deal.facilityLetterDate` | date | ai_extraction | From Pattern 8 |
| `scheme.aliases[]` | array | ai_extraction | From scheme-name typos / variants (e.g., Monskbury ↔ Monksbury) |
