# Intelligence UI Redesign — Design Spec

**Date:** 2026-03-14
**Status:** Approved
**Scope:** Canonical taxonomy expansion, intelligence card UI redesign, chat query system

## Problem Statement

The client intelligence tab is the most important data substrate in RockCap — it feeds document generation, chat answers, and deal overview. But it has three critical problems:

1. **80% of entries fall into "Custom"** — the canonical field taxonomy (~100 fields across client + project) doesn't cover the property finance domain adequately, so most extracted data lands in `extractedAttributes[]` and displays under a generic "Custom" category.
2. **Cards are too sparse** — the current card layout shows label + value + date + source doc name. No confidence scores, no quoted evidence, no conflict detection, no overwrite history, no document summaries. Users can't assess data quality or provenance at a glance.
3. **Chat loads too much context** — the full intelligence record (10,000-25,000 tokens for populated clients) is dumped into every chat message's system context, even for questions that need 2-3 fields.

## Goals

- Intelligence entries should be properly categorized with <10% ending up in "Other"
- Every intelligence entry should show its provenance: source document (with link), quoted evidence, confidence, and history
- Chat should answer intelligence questions with ~95% fewer tokens via targeted queries
- The UI should clearly signal what needs attention: conflicts, missing critical fields, stale data, recent updates

## Non-Goals

- Changing the extraction pipeline itself (V4 / intelligence-extract route)
- Modifying the Convex schema for `clientIntelligence` / `projectIntelligence` (the existing schema already supports everything we need — `evidenceTrail`, `extractedAttributes`, `aiInsights` are all there)
- Building the document generation feature (this is a future consumer of intelligence)

---

## Workstream 1: Canonical Taxonomy Expansion

### Overview

Expand the canonical field taxonomy (~100 existing fields) with ~70 new fields across new domain-specific categories. Add auto-categorization as a fallback for remaining custom fields.

**Note on field tables below:** The "Priority" column values are for the UI `fieldDefinitions.ts` entries (which use the `FieldDefinition` interface with a `priority` field). The `CanonicalFieldConfig` interface in `canonicalFields.ts` does not have a priority field — it only has `label`, `type`, `description`, and `aliases`. Each new field needs entries in both files. Duplicate-check against existing canonical fields before adding — some Loan Terms and Valuation fields may overlap with existing project fields.

### New Client Categories

**KYC / Due Diligence** (~8 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `kyc.idVerificationStatus` | string | critical | ID verified, identity check, ID status |
| `kyc.amlCheckDate` | date | critical | AML date, anti-money laundering check |
| `kyc.pepScreening` | string | important | PEP check, politically exposed person |
| `kyc.sourceOfFunds` | text | critical | source of funds, SOF, funding source |
| `kyc.sourceOfWealth` | text | important | source of wealth, SOW, wealth origin |
| `kyc.riskRating` | string | important | risk level, risk score, risk assessment |
| `kyc.sanctionsCheck` | string | important | sanctions screening, sanctions status |
| `kyc.enhancedDueDiligence` | text | optional | EDD, enhanced checks, EDD notes |

**Legal** (~5 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `legal.personalGuarantees` | text | critical | personal guarantee, PG, guarantor |
| `legal.legalDisputes` | text | important | disputes, litigation, legal proceedings |
| `legal.bankruptcyHistory` | string | critical | bankruptcy, insolvency, IVA |
| `legal.ccjs` | string | critical | CCJ, county court judgement, court orders |
| `legal.restrictions` | text | optional | restrictions, caveats, legal restrictions |

### New Project Categories

**Loan Terms** (~12 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `loanTerms.facilityAmount` | currency | critical | facility amount, loan amount, facility size, total facility |
| `loanTerms.netLoan` | currency | important | net loan, net advance, net facility |
| `loanTerms.ltv` | percentage | critical | LTV, loan to value |
| `loanTerms.ltgdv` | percentage | critical | LTGDV, loan to GDV, loan to gross development value |
| `loanTerms.interestRate` | percentage | critical | interest rate, rate, coupon |
| `loanTerms.arrangementFee` | currency | important | arrangement fee, facility fee, commitment fee |
| `loanTerms.exitFee` | currency | important | exit fee, redemption fee |
| `loanTerms.termMonths` | number | critical | term, loan term, facility term, duration |
| `loanTerms.drawdownSchedule` | text | important | drawdown, tranches, drawdown schedule |
| `loanTerms.covenantsSummary` | text | important | covenants, loan covenants, financial covenants |
| `loanTerms.facilityType` | string | critical | facility type, loan type, senior, mezzanine, bridging |
| `loanTerms.redemptionDate` | date | important | redemption date, maturity date, repayment date |

**Valuation** (~8 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `valuation.currentMarketValue` | currency | critical | current value, market value, CMV, as-is value |
| `valuation.gdv` | currency | critical | GDV, gross development value, completed value |
| `valuation.dayOneValue` | currency | important | day one value, day 1 value, initial value |
| `valuation.specialAssumptions` | text | optional | special assumptions, valuation assumptions |
| `valuation.comparableEvidence` | text | important | comparables, comparable evidence, comps |
| `valuation.valuerName` | string | important | valuer, surveyor, valuation firm |
| `valuation.valuationDate` | date | critical | valuation date, date of valuation, inspection date |
| `valuation.reinspectionDate` | date | important | reinspection, next inspection, re-inspection date |

**Planning** (~8 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `planning.reference` | string | critical | planning reference, planning ref, application number |
| `planning.status` | string | critical | planning status, planning permission, consent status |
| `planning.permittedDevelopment` | string | optional | PD, permitted development, PD rights |
| `planning.conditionsSummary` | text | important | planning conditions, conditions, pre-commencement |
| `planning.s106Obligations` | text | optional | S106, section 106, CIL, community infrastructure levy |
| `planning.expiryDate` | date | important | planning expiry, permission expiry |
| `planning.useClass` | string | important | use class, planning use, C3, B1, E class |
| `planning.conservationArea` | string | optional | conservation area, listed building, heritage |

**Construction** (~10 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `construction.contractorName` | string | critical | contractor, builder, main contractor |
| `construction.contractType` | string | important | contract type, JCT, design and build, D&B |
| `construction.contractSum` | currency | critical | contract sum, build cost, construction cost, contract value |
| `construction.programmeDuration` | number | important | programme, build programme, construction programme, duration |
| `construction.currentProgress` | percentage | important | progress, completion percentage, % complete |
| `construction.practicalCompletion` | date | critical | PC date, practical completion, completion date |
| `construction.defectsLiability` | string | optional | defects period, DLP, defects liability |
| `construction.retentionPercent` | percentage | optional | retention, retention percentage |
| `construction.clerkOfWorks` | string | optional | clerk of works, site inspector |
| `construction.buildWarrantyProvider` | string | important | build warranty, NHBC, Premier Guarantee, structural warranty |

**Legal / Title** (~8 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `title.titleNumber` | string | critical | title number, title ref, land registry |
| `title.tenure` | string | critical | tenure, freehold, leasehold |
| `title.leaseTermRemaining` | number | important | lease term, unexpired term, years remaining |
| `title.groundRent` | currency | optional | ground rent, peppercorn |
| `title.charges` | text | important | charges, encumbrances, restrictions |
| `title.restrictiveCovenants` | text | optional | restrictive covenants, covenants on title |
| `title.reportOnTitleStatus` | string | important | report on title, ROT, title report |
| `title.solicitorFirm` | string | important | solicitor, law firm, conveyancer |

**Insurance** (~6 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `insurance.buildingWorksPolicy` | string | important | building works, construction insurance, CAR |
| `insurance.professionalIndemnity` | string | optional | PI insurance, professional indemnity, PI |
| `insurance.contractorsAllRisks` | string | important | contractors all risks, CAR, all risks |
| `insurance.publicLiability` | string | optional | public liability, PL insurance |
| `insurance.structuralWarranty` | string | important | structural warranty, latent defects, building warranty |
| `insurance.policyExpiry` | date | important | policy expiry, renewal date, insurance expiry |

**Sales / Exit** (~7 fields)
| Field | Type | Priority | Aliases |
|-------|------|----------|---------|
| `exit.strategy` | string | critical | exit strategy, exit route, repayment strategy |
| `exit.unitsReserved` | number | important | reserved, reservations |
| `exit.unitsExchanged` | number | important | exchanged, exchanges |
| `exit.unitsCompleted` | number | important | completed sales, completions |
| `exit.averageSalesPrice` | currency | important | average price, ASP, avg sales price |
| `exit.totalSalesRevenue` | currency | important | total revenue, sales revenue, total sales |
| `exit.salesAgent` | string | optional | sales agent, estate agent, marketing agent |

### Auto-Categorization Fallback

For `extractedAttributes` that don't match any canonical field, a `categorizeAttribute(label: string): string` function uses keyword matching:

```
label contains "loan|interest|ltv|facility|covenant|drawdown" → "Loan Terms"
label contains "planning|permitted|s106|cil|use class" → "Planning"
label contains "valuation|gdv|comparable|market value" → "Valuation"
label contains "contract|build|construct|programme|retention" → "Construction"
label contains "title|tenure|freehold|leasehold|solicitor" → "Legal / Title"
label contains "insurance|indemnity|warranty|liability|policy" → "Insurance"
label contains "exit|sales|reserved|exchanged|completion" → "Sales / Exit"
label contains "kyc|aml|pep|sanctions|due diligence|verification" → "KYC / Due Diligence"
label contains "guarantee|dispute|bankruptcy|ccj|litigation" → "Legal"
label contains "contact|email|phone|address|name" → "Contact Info"
label contains "company|director|shareholder|registration|vat" → "Company"
label contains "income|net worth|assets|debt|credit|bank" → "Financial"
label contains "experience|track record|project|completed" → "Experience"
fallback → "Other"
```

### Migration

A one-time Convex migration function:
1. Scans all `extractedAttributes` across client and project intelligence records
2. Attempts to match each attribute label against the expanded canonical field aliases
3. Promotes matching attributes into the structured intelligence fields (with evidence trail preserved)
4. Logs migration results (promoted count, remaining custom count)

**File changes:**
- `src/lib/canonicalFields.ts` — add ~70 new field definitions with aliases
- `src/components/intelligence/fieldDefinitions.ts` — add corresponding UI field definitions
- `src/lib/intelligenceCategorizer.ts` — new file for `categorizeAttribute()` fallback logic
- `convex/intelligence.ts` — add migration mutation

---

## Workstream 2: Intelligence Card UI Redesign

### Card Design — Rich Expandable Cards

**Collapsed state** (default):
- Left border color-coded by confidence: green (≥85%), amber (60-84%), red (<60%)
- Field label with "Core" badge for canonical fields
- Field value (formatted by type — currency with £, dates formatted, etc.)
- Confidence percentage badge (top right)
- Source document name as clickable link (navigates to document viewer)
- Relative timestamp ("3 days ago", "Today")
- Conflict indicator ("⚠ 1 conflict") if evidence trail has conflicting values
- History indicator ("1 prior value") if superseded entries exist
- Expand/collapse chevron
- "Updated today" entries get subtle green background tint

**Expanded state** (on click):
- **Source Document panel** — document name (clickable link to viewer), category tags, document summary, page number, extraction date, method. The document summary is fetched on-demand when the card expands: the component uses the `sourceDocumentId` from `evidenceTrail` to query the document record and read `documentAnalysis.executiveSummary`. This is a lightweight read (single document lookup), not a bulk load — it only fires when the user explicitly expands a card.
- **Evidence panel** — quoted source text from `evidenceTrail[].sourceText`, styled as a blockquote with indigo left border
- **Conflict panel** (if conflicts exist) — amber background, shows alternative value with its confidence, source document (linked), and a brief note about the nature of the conflict
- **Prior Values panel** (if superseded entries exist) — dimmed/strikethrough display of old values with their source documents (linked) and confidence scores

### Sidebar Design

**Client header:**
- Client name, type (Borrower/Lender), project count
- Overall completeness progress bar with percentage

**Category list — client level:**
- Each category shows: icon, name, filled/total fraction
- Color-coded attention dot:
  - 🔴 Red: critical priority fields are missing
  - 🟡 Amber: conflicts detected in this category
  - 🟢 Green: category received updates in the last 24 hours
- Active category highlighted with indigo left border and background

**Category list — project level:**
- Separated by "Project Categories" header
- Project selector dropdown (for clients with multiple projects)
- Same category items as client level but indented
- Project categories: Loan Terms, Valuation, Planning, Construction, Legal/Title, Insurance, Sales/Exit

**Bottom of sidebar:**
- "Other" category (was "Custom") — should be small after taxonomy expansion
- Legend explaining the attention dot colors

### Main Content Area

**Header:**
- Category icon and name
- Filled/total count and last updated timestamp
- Sort control (Recent, Confidence, Alphabetical)
- Filter control (All, Conflicts only, Missing only)
- "+ Add Entry" button

**Attention chips** (below header):
- Filterable summary badges: "⚠ 2 conflicts" (red), "7 missing fields" (amber), "3 updated today" (green)
- Clicking a chip filters the card list to only those entries

**Card list:**
- Rich expandable cards as described above
- Cards sorted by user's selected sort order (default: most recent first)

**Missing fields section** (bottom of card list):
- Compact chip layout showing unfilled fields
- Critical missing fields highlighted in red with "critical" label
- Optional fields in neutral gray
- Clicking a missing field chip opens the add entry modal

### Component Architecture

The current `IntelligenceTab.tsx` (94.9KB) is too large. Decompose into:

- `IntelligenceTab.tsx` — top-level container, data fetching, state management (~300 lines)
- `IntelligenceSidebar.tsx` — sidebar with categories, completeness, attention signals (~200 lines)
- `IntelligenceCardList.tsx` — card list with sort/filter/attention chips (~150 lines)
- `IntelligenceCard.tsx` — single rich expandable card (~250 lines)
- `IntelligenceCardExpanded.tsx` — expanded detail panel (source doc, evidence, conflicts, history) (~200 lines)
- `IntelligenceMissingFields.tsx` — missing fields chip section (~80 lines)
- `intelligenceUtils.ts` — confidence colors, date formatting, conflict detection helpers (~100 lines)

**Relationship to existing components:**

The `src/components/intelligence/` directory already contains: `KnownDataCard.tsx`, `MissingDataList.tsx`, `IntelligenceSection.tsx`, `CompletenessIndicator.tsx`, `SharedComponents.tsx`, `fieldDefinitions.ts`, `types.ts`, and a `sections/` subdirectory (`ClientSections.tsx`, `ProjectSections.tsx`). The new components replace several of these:

| Existing File | Disposition |
|---------------|-------------|
| `KnownDataCard.tsx` | **Replaced** by `IntelligenceCard.tsx` + `IntelligenceCardExpanded.tsx` |
| `MissingDataList.tsx` | **Replaced** by `IntelligenceMissingFields.tsx` |
| `IntelligenceSection.tsx` | **Replaced** by `IntelligenceCardList.tsx` |
| `CompletenessIndicator.tsx` | **Merged** into `IntelligenceSidebar.tsx` |
| `SharedComponents.tsx` | **Merged** into relevant new components or `intelligenceUtils.ts` |
| `fieldDefinitions.ts` | **Kept and extended** with new category field definitions |
| `types.ts` | **Kept and extended** with new types for expanded card state |
| `sections/ClientSections.tsx` | **Removed** — section logic moves into category-based card list |
| `sections/ProjectSections.tsx` | **Removed** — section logic moves into category-based card list |

Old files should be deleted after the new components are verified working.

**File changes:**
- `src/components/IntelligenceTab.tsx` — refactor into smaller components
- `src/components/intelligence/IntelligenceSidebar.tsx` — new
- `src/components/intelligence/IntelligenceCardList.tsx` — new
- `src/components/intelligence/IntelligenceCard.tsx` — new (replaces KnownDataCard)
- `src/components/intelligence/IntelligenceCardExpanded.tsx` — new
- `src/components/intelligence/IntelligenceMissingFields.tsx` — new
- `src/components/intelligence/intelligenceUtils.ts` — new

---

## Workstream 3: Chat Intelligence Query System

### Problem

Every chat message pre-loads the full intelligence record into system context — 10,000-25,000 tokens for well-populated clients. Most questions need 2-3 fields. This wastes tokens, increases latency, and makes it harder for the model to find the right answer.

### Solution: Lightweight Summary + Query Tool

**1. Lightweight context summary**

Replace the full intelligence dump with a compact summary (~200-300 tokens):

```
Client Intelligence Summary (Capstone Group, Borrower):
- Contact Info: 16/23 filled
- Company: 5/12 filled [⚠ missing critical: Company Number, UBO]
- Financial: 3/8 filled [⚠ missing critical: Net Worth, Liquid Assets]
- KYC: 2/8 filled [⚠ missing critical: ID Verification, Source of Funds]
- Experience: 4/5 filled
- Legal: 1/5 filled

Project Intelligence (Manor Park):
- Loan Terms: 9/12 filled [⚠ 1 conflict]
- Valuation: 7/8 filled [updated today]
- Planning: 5/8 filled
- Construction: 4/10 filled [⚠ missing critical: Contractor, Contract Sum]
- Legal/Title: 6/8 filled
- Insurance: 2/6 filled
- Sales/Exit: 3/7 filled

Use queryIntelligence tool to look up specific values.
```

This tells the model *what's available* without loading the actual data.

**2. New `queryIntelligence` tool**

```typescript
{
  name: "queryIntelligence",
  description: "Query client or project intelligence for specific data. Use this to look up field values, check for conflicts, or search across intelligence entries. Always prefer this over loading full documents when the answer is likely in intelligence.",
  scope: "global",
  requiresConfirmation: false,
  parameters: {
    scope: "client" | "project",          // required
    projectId: string,                     // required if scope is "project"
    category: string,                      // optional — e.g., "Loan Terms", "Contact Info"
    fieldName: string,                     // optional — e.g., "interest rate", "LTV"
    query: string,                         // optional — free text search across labels and values
  }
}
```

**Return format:**
```typescript
{
  results: Array<{
    field: string,            // canonical path or attribute label
    value: string | number,   // the current value
    confidence: number,       // 0-1
    source: string,           // source document name
    sourceDate: string,       // when extracted
    category: string,         // which category this belongs to
    hasConflict: boolean,     // whether alternative values exist
    conflictingValues?: Array<{
      value: string,
      confidence: number,
      source: string,
    }>,
  }>,
  totalMatches: number,
}
```

**Query logic:**
- If `category` provided: return all fields in that category
- If `fieldName` provided: fuzzy match against canonical field labels and aliases
- If `query` provided: case-insensitive substring search across field labels, field values (stringified), and source document names. No fuzzy matching — exact substring is sufficient since the model controls the query string
- Results sorted by: confidence (desc) → recency (desc)
- Conflicts included inline so the model can present both values to the user

**3. System prompt update**

Add to the chat system instructions:
```
Intelligence data is available via the queryIntelligence tool. The summary above shows what categories have data and what's missing. For questions about specific values (e.g., "what's the interest rate?", "who is the contractor?"), call queryIntelligence with the relevant category or field name rather than searching through documents.
```

**4. Token savings**

| Scenario | Current | New | Savings |
|----------|---------|-----|---------|
| Simple lookup ("what's the LTV?") | ~15,000 tokens | ~300 summary + ~500 query result | ~95% |
| Category overview ("show me loan terms") | ~15,000 tokens | ~300 summary + ~800 query result | ~93% |
| No intelligence needed | ~15,000 tokens | ~300 summary | ~98% |

### Implementation

**New files:**
- `src/lib/tools/domains/intelligenceQuery.tools.ts` — tool definition for `queryIntelligence`
- `convex/intelligence.ts` — add `queryIntelligence` query function with category/field/text search

**Modified files:**
- `src/app/api/chat-assistant/route.ts` — replace full intelligence dump in `gatherChatContext()` with lightweight summary; add `queryIntelligence` to tool dispatch
- `src/lib/tools/executor.ts` — add handler for `queryIntelligence`
- `src/lib/tools/registry.ts` — register `queryIntelligence` in global scope

---

## Implementation Order

1. **Workstream 1: Taxonomy Expansion** — must come first because the UI and chat system both depend on proper categories
2. **Workstream 2: UI Redesign** — depends on taxonomy being in place
3. **Workstream 3: Chat Query System** — independent of UI, could be done in parallel with Workstream 2

**Shared file note:** `convex/intelligence.ts` is modified in both Workstream 1 (migration mutation) and Workstream 3 (query function). If Workstreams 2 and 3 run in parallel, coordinate changes to this file to avoid merge conflicts.

## Hard Constraints

- **ZERO DATA LOSS:** Existing client intelligence entries (thousands of records) must never be deleted, overwritten, or corrupted. All taxonomy expansion and migration work is additive only — promoting an `extractedAttribute` to a canonical field copies it, it does not remove the original until verified. The migration must be reversible. UI component refactoring must not change the underlying data layer. This is the single most important constraint of the entire project.

## Risk Considerations

- **Migration safety:** The attribute promotion migration should be run as a dry-run first to verify mappings before committing changes. Migration must be additive — copy attributes to canonical fields, never delete originals until verified correct.
- **Alias collisions:** New canonical field aliases must be tested against existing fields to avoid ambiguous matches
- **Chat regression:** Switching from full context to summary + query could initially cause the model to miss information it previously had "for free" — monitor chat quality during rollout
- **Component refactor size:** The IntelligenceTab.tsx decomposition touches a 95KB file — should be done carefully with existing tests as guardrails
