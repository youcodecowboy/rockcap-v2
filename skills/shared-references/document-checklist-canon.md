# Document Checklist Canon

Canonical RockCap document checklist, folder structure, and placement rules. Sourced directly from the app's seed migrations (`convex/migrations/seedKnowledgeTemplates.ts`, `seedFolderTemplates.ts`, `seedPlacementRules.ts`). Skills that build a deal's information pack, file incoming documents, ask for missing items, or assess deal readiness use this canon.

The data lives in three Convex tables:

- `knowledgeRequirementTemplates` — the master per-client-type checklist
- `folderTemplates` — folder structures per client-type and per level (client vs project)
- `documentPlacementRules` — routing rules (document type → target folder)

Skills query these tables at runtime via the tool catalogue rather than relying on this document being current. This file documents the canon so skills can be authored against a known state. When the seeds change, this file gets updated in the same PR.

## Client types covered

The app supports three client types: `borrower`, `lender`, `developer`. Of these:

- **`borrower`**: fully covered. Checklist, folders, placement rules all in place.
- **`lender`**: folder template and placement rules in place; no requirement-template checklist yet.
- **`developer`**: not yet covered by any of the three seeds. Treated as `borrower` until a developer-specific seed lands.

This gap is intentional. The skills that file documents work today against borrower deals; lender-side and developer-side filing flows are downstream.

## Deal phases

Three phases drive the checklist gating: `indicative_terms`, `credit_submission`, `post_credit`. A fourth value `always` means the item applies regardless of phase. Skills filter the requirement set by the deal's current `projects.dealPhase`.

## Borrower checklist (the real canon)

### Client-level (applies to the borrower entity, not a specific project)

Six required items in the `credit_submission` phase, plus a personal financials category. All `priority: required`. These are the items that a borrower must satisfy once across the relationship, not per deal.

| ID | Requirement | Phase | Priority | Matching document types |
|---|---|---|---|---|
| `kyc-proof-of-address` | Certified Proof of Address | credit_submission | required | Utility Bill, Bank Statement |
| `kyc-proof-of-id` | Certified Proof of ID | credit_submission | required | Passport, Driving License |
| `kyc-business-bank-statements` | Business Bank Statements (3 months) | credit_submission | required | Bank Statement |
| `kyc-personal-bank-statements` | Personal Bank Statements (3 months) | credit_submission | required | Bank Statement |
| `kyc-track-record-excel` | Track Record (Excel) | credit_submission | required | (operator-uploaded) |
| `kyc-track-record-word` | Track Record (Word) | credit_submission | required | (operator-uploaded) |
| `kyc-assets-liabilities` | Assets & Liabilities Statement | credit_submission | required | Assets & Liabilities Statement |

Skills asking "what's missing for this borrower" against this list use `knowledgeLibrary.getChecklistByClient` and filter for `level: 'client'`.

### Project-level (applies to a specific deal)

Fifteen items spread across phases.

**`indicative_terms` phase (5 required + 1 nice-to-have):**

| ID | Requirement | Priority | Matching document types |
|---|---|---|---|
| `project-appraisal` | Project Appraisal / Feasibility | required | Appraisal, Cashflow |
| `project-floorplans` | Architectural Floorplans | required | Floor Plans |
| `project-elevations` | Elevation Drawings | required | Elevations |
| `project-site-plan` | Site Plan | required | Site Plans |
| `project-site-location-plan` | Location Plan | required | Location Plans |
| `project-scheme-brief` | Scheme Brief / Background | nice_to_have | (operator-written note) |

**`credit_submission` phase (1 nice-to-have):**

| ID | Requirement | Priority | Matching document types |
|---|---|---|---|
| `project-planning-decision` | Planning Permission Decision Notice | nice_to_have | Planning Documentation |

**`post_credit` phase (8 required):**

| ID | Requirement | Priority | Matching document types |
|---|---|---|---|
| `project-valuation` | RICS Red Book Valuation | required | RedBook Valuation |
| `project-monitoring-report` | Initial Monitoring Report | required | Initial Monitoring Report |
| `project-legal-dd` | Legal Due Diligence | required | (legal pack) |
| `project-report-on-title` | Solicitor's Report on Title | required | (legal pack) |
| `project-facility-letter` | Executed Facility Agreement | required | Facility Letter |
| `project-personal-guarantee` | Executed Personal Guarantee | required | Personal Guarantee |
| `project-share-charge` | Share Charge Document | required | Share Charge |
| `project-debenture` | Debenture Security Document | required | Debenture |

Skills asking "what's missing for this deal at this phase" use `knowledgeLibrary.getChecklistByProject` and filter by the project's current `dealPhase`. The extension fields from BL-1.5 (`isBlocking`, `rockcapStatus`, `lenderStatus`) layer on top of the `status` field above to support graded reporting.

## Folder structures

### Borrower client-level (4 folders)

```
Background
├── KYC
└── Background Docs
Miscellaneous
```

Skills filing client-level documents (KYC primarily) route into `kyc` via the placement rules.

### Borrower project-level (8 folders)

```
Background
Terms Comparison
Terms Request
Credit Submission
Post-completion Documents
Appraisals
Notes
Operational Model
```

Each deal gets this skeleton. Skills filing deal documents route by category, not by guessing folder names.

### Lender client-level (4 folders)

```
KYC
Agreements
Correspondence
Miscellaneous
```

### Lender project-level (7 folders)

```
Term Sheets
Facility Documents
Security Documents
Drawdown Requests
Monitoring Reports
Correspondence
Miscellaneous
```

Lender-side filing applies when a lender is the client and we are managing the lender's view of a deal (rare but supported for lenders we represent on the buy side).

## Placement rules

These are the routing rules `documentPlacementRules` enforces. Skills do not bypass them; if a document does not match any rule, it lands in `miscellaneous` and the operator triages.

### Borrower placement rules (14 rules, priority-ordered)

| Document category / type | Target folder | Target level | Priority |
|---|---|---|---|
| Red Book Valuation, RICS Valuation | `appraisals` | project | 100 |
| Report (appraisals-shaped) | `appraisals` | project | 50 |
| Term Sheet, Indicative Terms | `terms_comparison` | project | 100 |
| Credit Memo, Credit Backed Terms | `credit_submission` | project | 100 |
| Operating Statement, Financial Model | `operational_model` | project | 100 |
| Contract, Agreement (legal) | `background` | project | 80 |
| KYC documents | `kyc` | client | 100 |
| Correspondence | `notes` | project | 60 |
| Invoice | `post_completion` | project | 50 |
| Note | `notes` | project | 100 |
| (everything else) | `miscellaneous` | client | 1 |

### Lender placement rules (12 rules, priority-ordered)

| Document category / type | Target folder | Target level | Priority |
|---|---|---|---|
| Term Sheet | `term_sheets` | project | 100 |
| Contract, Agreement (legal) | `facility_documents` | project | 80 |
| Red Book Valuation, RICS Valuation | `security_documents` | project | 100 |
| Report | `monitoring_reports` | project | 50 |
| Operating Statement, Financial Model | `monitoring_reports` | project | 80 |
| Credit Memo | `facility_documents` | project | 90 |
| KYC documents | `kyc` | client | 100 |
| Correspondence | `correspondence` | project | 100 |
| Invoice | `drawdown_requests` | project | 50 |
| Note | `correspondence` | project | 60 |
| (everything else) | `miscellaneous` | project | 1 |

## How skills use this

### To check what's missing for a deal

```
1. Read project.dealPhase
2. Query knowledgeLibrary.getChecklistByProject(projectId, phase=current and earlier)
3. Filter for status='missing' or status='pending_review'
4. Group by priority: required first, nice_to_have second
5. For graded reporting, also surface isBlocking=true items as urgent
```

### To file an inbound document

```
1. The document arrives via upload, Gmail attachment, or HubSpot sync
2. Classification (V4 pipeline) returns the file type and category
3. The skill calls folderStructure.mapCategoryToFolder(category, hasProject)
4. The skill calls documents.create or documents.update to place the file
5. If a checklist item matches the document type, the skill calls
   knowledgeLibrary.linkDocumentToRequirement
6. The skill writes a touchpoint with provider matching the source
   (gmail / hubspot / manual / fireflies)
```

### To draft a "missing documents" follow-up

The cadence-fire skill's `monitoring_ask` and `execution_chaser` types pull from this canon when composing the request. The cadence's draft includes the specific items missing, named with their canonical labels (not paraphrased), so the recipient sees the same names they see in the app.

## What this canon does not cover yet

- **Developer-specific checklist**: when a developer client (distinct from a borrower SPV) gets onboarded, the requirements differ. A developer-specific seed needs authoring.
- **Lender requirement checklist**: lenders we work with on the buy side need their own checklist. Today only the folder template and placement rules are in place; no `knowledgeRequirementTemplates` rows exist for lender.
- **Phase-specific KYC**: the client-level KYC items are all currently tagged `credit_submission`. In practice some firms ask for KYC at indicative-terms stage. Future iteration may split the phase tagging.
- **Asset-class variations**: residential, commercial, mixed-use, BTR, and operating-asset deals each have additional documents that the generic checklist does not name (e.g., GVA reports for BTR, EPRA disclosures for commercial). Variants can be added as additional requirement templates with `clientType: 'borrower'` and an asset-class discriminator (not yet a schema field).

When extending the canon, edit the seed migrations, run them, then update this document in the same PR.
