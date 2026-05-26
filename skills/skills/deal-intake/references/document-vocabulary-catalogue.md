# Document vocabulary catalogue

Canonical taxonomy for categorising deal-intake documents. Three vocabulary levels — `category`, `fileTypeDetected`, `phaseRequired` — plus normalisation rules for vocabulary drift observed in production.

Loaded by `deal-intake` skill at startup. Used to: (1) validate V4 classifier output, (2) auto-link docs to checklist requirements via `matchingDocumentTypes`, (3) decide which phase a doc fulfills.

## Voice + format rules

- UK English. Numbers in GBP unless cross-border. Dates ISO `YYYY-MM-DD`.
- When citing a vocabulary value, wrap in backticks: \`Loan Terms\` not "Loan Terms".
- "Production-observed" = appears in `documents.getUniqueCategories` / `getUniqueFileTypes` as of 2026-05-25. "Target canonical" = post-normalisation.

---

## Level 1: `category` (12 canonical + 5 to consolidate)

Production sweep (2026-05-25) returned 24 distinct category values. After normalisation, the canonical set is 12. Five additional values exist in production but represent drift that the skill should normalise on read.

### Canonical categories (target state)

| Category | Definition | Typical docs (fileTypeDetected) | Primary phaseRequired |
|---|---|---|---|
| `Appraisals` | Development financials — GDV, TDC, profit, cashflow models | Appraisal, Cashflow, Comparables, Operational Model | indicative_terms |
| `Plans` | Architectural drawings and site documentation | Floor Plans, Elevations, Site Plans, Site Location Plan, Roof Plans, Sections | indicative_terms |
| `Inspections` | Active monitoring + interim site reports | Initial Monitoring Report, Interim Monitoring Report, Building Survey | post_credit / monitoring |
| `Professional Reports` | Third-party expert reports | RedBook Valuation, Legal Due Diligence, Report on Title, Environmental Report, QS Report, Planning Documentation, Comparables | post_credit / monitoring (val), indicative_terms (planning) |
| `KYC` | Sponsor + entity identity and financial verification | Passport, Bank Statement, Tax Return, Assets & Liabilities Statement, Track Record, Director Profile / CV, Application Form | indicative_terms (initial), credit_submission (full) |
| `Loan Terms` | Lender-side proposed and executed loan documentation | Indicative Terms, Term Sheet, Credit Backed Terms, Heads of Terms, Facility Letter, Terms Comparison Memo | indicative_terms → credit_submission → post_credit |
| `Legal Documents` | Borrower-side legal artefacts | Debenture, Share Charge, Personal Guarantee, Corporate Guarantee, Shareholders Agreement, Corporate Authorisations, Legal Opinion, Title Deed, Lease, Local Authority Search | post_credit |
| `Project Documents` | Operational scheme docs not in Plans or Appraisals | Build Programme, Building Contract, Professional Appointment, Tender, Contract Sum Analysis, Specification, Accommodation Schedule | indicative_terms → post_credit |
| `Project Information` | Sponsor + scheme background materials | Scheme Brief, Background, Executive Summary, Track Record (when from sponsor's perspective), Sales Tracker | indicative_terms |
| `Financial Documents` | Sponsor company financials (vs. KYC personal financials) | Balance Sheet, Bank Statement, Loan Statement, Completion Statement, Redemption Statement, Invoice | indicative_terms / monitoring |
| `Insurance` | Insurance policies and certificates | Insurance Certificate, Insurance Policy | post_credit |
| `Communications` | Email and meeting correspondence | Email/Correspondence, Meeting Minutes | n/a (informational) |
| `Photographs` | Site + asset photographs | Site Photographs, Render/CGI | indicative_terms |

### Drift to normalise on read

| Production value | Target canonical | Rule |
|---|---|---|
| `Legal` | **`Legal Documents`** | **Always map.** Operator-confirmed canonical (2026-05-25). Matches the 13-category canon from MEMORY.md. |
| `Marketing & Sales` | `Project Documents` (if accommodation/sales tracker) OR `Project Information` (if marketing brochure) | Context-dependent — look at fileTypeDetected. |
| `Marketing Materials` | Same as above | Same. |
| `Background` | `Project Information` | `Background` is V4's earlier name for what's now Project Information. |
| `Corporate Structure` | `KYC` (entity-level) or `Legal Documents` (if shareholders agreement) | Context-dependent. |
| `Loan Applications` | `Loan Terms` (when it's an application form) OR `KYC` (when it's verification material) | Context-dependent. |
| `Operational Model` | `Appraisals` (Appraisal/Cashflow are the canonical fileTypeDetected here) | Always map. |
| `Market Research` | `Professional Reports` (if external) or `Project Information` (if internal) | Context-dependent. |
| `Other` / `Miscellaneous` / `Unclassified` | **`Unclassified`** (canonical) | **All three are the V4 defeat condition.** Operator-confirmed canonical (2026-05-25). Same rule as fileTypeDetected defeat-state above. |

**The 12 canonical categories above are the operator-facing taxonomy.** The deal-intake skill normalises drift values silently on read; if the operator queries `documents.list` they see canonical values only. Skill behaviour: in-memory normalisation only — DO NOT call `document.updateClassification` to persist canonical values for every legacy doc (write amplification). V4 prompt-side normalisation lands in a separate vocab-cleanup PR.

---

## Level 2: `fileTypeDetected` (~50 canonical after normalisation)

Production sweep returned 57 distinct values. Drift to normalise:

| Production value | Target canonical | Rule |
|---|---|---|
| `Roof Plan` | **`Roof Plans`** | Operator-confirmed canonical (2026-05-25). Skill normalises on read. |
| `Other` | **`Unclassified`** | Operator-confirmed canonical (2026-05-25). Most descriptive defeat value. Skill normalises on read. |
| `Other Document` | **`Unclassified`** | Same — operator-confirmed canonical (2026-05-25). |

**Normalisation rule (skill behaviour):** whenever the skill reads a doc's `fileTypeDetected` from `documents.get` / `documents.search` / a checklist's `primaryDocument`, apply the above mapping IN MEMORY before downstream processing (audit, classification, intelligence mining). DO NOT call `document.updateClassification` to persist the canonical value — that would create write amplification across hundreds of docs. The skill normalises silently on read; the V4 prompt-side normalisation lands in a separate vocab-cleanup PR.

### Vocabulary gaps (observed in production filenames but not in V4 vocabulary)

| Gap | Evidence | Recommendation |
|---|---|---|
| `Brochure` | `ManorParkBrchMar25-FINAL-Digital.pdf` classified as `Other Document` | Add to V4 vocabulary as `Brochure`, category=`Project Documents` |
| `Director Profile` / `CV` | `Director_s CVs.docx` classified as `Email/Correspondence` (wrongly) | Add. Closest existing match: `Track Record` (used as workaround) |
| `Bridge Loan Application` | Bridging deals frequently have generic Application Forms | Add to enable type detection |
| `HoTs Comparison Memo` | `Shawbrook_Allica_HoTSComparison.xlsx` classified as `Term Sheet` (misleading) | Add. Distinct from Term Sheet — comparison vs single offer |

### Skill-generated vocabulary (in production via skill writes)

These `fileTypeDetected` values are not V4 outputs — they're produced by skills via `document.createFromGeneration`. Catalogue them here so other skills know they exist.

| fileTypeDetected | category | Producer skill | Purpose | Shape canon |
|---|---|---|---|---|
| `Submission Requirements` | `Lender outreach` | lender-intel + lender.setSubmissionRequirements | Per-lender requirements doc (one per lender, `isBaseDocument: true`) | `../../../shared-references/lender-submission-requirements-canon.md` |
| `Lender Brief Package` | `Lender outreach` | terms-package-build (future) | Per-lender tailored submission pack for a specific deal | (Canon TBD when terms-package-build hardens) |
| `Indicative Terms (Client-facing)` | `Loan Terms` | terms-package-build (future) | Client-facing indicative terms summary | (Canon TBD) |
| `IC Paper` | `Credit submission` | ic-paper-drafter (future) | Internal credit committee submission | (Canon TBD) |
| `Terms Comparison Memo` | `Lender outreach` | terms-comparison (future) | Multi-lender HoTs comparison memo | (Canon TBD) |
| `Meeting Notes` | `Communications` | meeting-capture | Captured meeting record | (See meeting-capture references) |

**Until V4 vocabulary is extended, deal-intake uses the closest existing canonical value + flags the substitution in `skillRun.complete.gaps` with kind `vocab_substitution`.**

---

## Level 3: `phaseRequired` (4 canonical phases)

From the `knowledgeChecklistItems.phaseRequired` field. Determines when a checklist item is "expected" vs "premature."

| Phase | Trigger | What checklist items expect |
|---|---|---|
| `indicative_terms` | Skill stands up the project | Appraisal, Floorplans, Elevations, Site Plan, Site Location Plan, Scheme Brief, Planning Decision (if available) |
| `credit_submission` | Operator advances to "submitting to credit committee" | Planning Decision Notice (required), full KYC pack |
| `post_credit` | Lender approves, drawing legal docs | Valuation Report, Monitoring Report, Legal DD, Report on Title, Facility Letter, Personal Guarantee, Share Charge, Debenture |
| `monitoring` | Loan drawn, active execution | Interim Monitoring Reports, Loan Statements |

### Phase progression rule

The skill never auto-advances phase. Operator transitions explicitly. Skill MAY suggest "ready to advance to phase X" when all `phaseRequired ≤ X` items are fulfilled — flagged via `skillRun.complete.brief`.

---

## checklist requirement → matchingDocumentTypes map

The 15 default checklist requirements (from `requirementTemplate rx74mhakr5ntfjxe37zzfstd0h827zbw`) with their accepted fileTypeDetected values. The skill uses this to auto-link docs after V4 classification.

| Requirement | phaseRequired | matchingDocumentTypes |
|---|---|---|
| Appraisal | indicative_terms | Appraisal, Feasibility Study, Development Appraisal, Financial Model |
| Floorplans | indicative_terms | Floorplan, Floor Plan, Floor Plans, Architectural Plan, Plans |
| Elevations | indicative_terms | Elevation, Elevations, Architectural Plan, Plans |
| Site Plan | indicative_terms | Site Plan, Site Plans, Site Layout, Plans |
| Site Location Plan | indicative_terms | Location Plan, Site Location, Plans |
| Planning Decision Notice | credit_submission | Planning Decision, Planning Permission, Decision Notice, Planning Document |
| Scheme Brief / Background | indicative_terms | Scheme Brief, Project Brief, Background, Executive Summary |
| Valuation Report | post_credit | Valuation, RedBook Valuation, Red Book Valuation, Appraisal Report, Valuation Report |
| Initial Monitoring Report | post_credit | Initial Monitoring Report, Monitoring Report, QS Report, Surveyor Report, Construction Report |
| Legal Due Diligence | post_credit | Legal DD, Due Diligence, Legal Report |
| Report on Title | post_credit | Report on Title, Title Report, Certificate of Title, Legal Report |
| Facility Letter | post_credit | Facility Letter, Facility Agreement, Loan Agreement, Legal Document |
| Personal Guarantee | post_credit | Personal Guarantee, Guarantee, Legal Document |
| Share Charge | post_credit | Share Charge, Charge, Security Document, Legal Document |
| Debenture | post_credit | Debenture, Security Document, Legal Document |

When V4 outputs a fileTypeDetected matching ANY value in a requirement's `matchingDocumentTypes`, the skill auto-links via `checklist.linkDocument`. First match becomes `primary` + sets status to `fulfilled`.

**Bridging-type deals seed a different checklist** (KYC-heavy, no plans requirements). When deal type detection returns `Bridging`, the skill skips the Floorplans / Elevations / Site Plan / Site Location Plan requirements and instead seeds Bridging-specific ones (Asset Valuation, Exit Strategy Doc, Bridging Application Form). The bridging-checklist template is TBD — flag as `bridging_checklist_template_pending` substrate gap.

---

## Versioning

- v1 (2026-05-25): initial catalogue from production sweep + operator framing.
- Future: as V4 vocabulary extends (closing the gaps above), update the matchingDocumentTypes columns. As deal types beyond Development/Bridging/Investment emerge, add columns.
