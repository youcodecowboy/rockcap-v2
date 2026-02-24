# V1 Feature Audit & Testing Plan

> **Milestone Date:** January 28, 2026
> **Purpose:** Systematic validation of all V1 features before delivery
> **Approach:** Phase-by-phase testing with acceptance criteria
> **Audit Completed:** January 28, 2026

---

## Code Audit Executive Summary

### Overall Status: ✅ ALL PHASES PASSED CODE REVIEW

| Phase | Feature | Code Status | Notes |
|-------|---------|-------------|-------|
| 1 | Document Filing | ✅ PASSED | 7-stage modular pipeline, 60+ filename patterns |
| 2 | Self-Learning Loop | ✅ PASSED | Tiered correction system, cache invalidation |
| 3 | Client Intelligence | ✅ PASSED | 60+ canonical fields, evidence trail tracking |
| 4 | Document Library | ✅ PASSED | 3 scopes, cross-scope moves, folder management |
| 5 | Client & Project Views | ✅ PASSED | 11 client tabs, 8 project tabs, full navigation |
| 6 | Meeting Notes | ✅ PASSED | Extraction pipeline, task promotion |
| 7 | Checklist System | ✅ PASSED | Template init, many-to-many linking, AI suggestions |

### Key Findings

**Strengths Identified:**
1. **Modular Agent Architecture** - 7-stage pipeline with confidence-based routing
2. **Comprehensive Self-Learning** - Tiered correction retrieval (consolidated → targeted → full)
3. **Rich Field Taxonomy** - 60+ canonical fields with alias normalization
4. **Evidence-Based Intelligence** - Full audit trail with source tracking
5. **Flexible Document Organization** - 3 scopes with proper auth isolation

**Recommended Manual Testing Focus:**
1. **Checklist Matching Accuracy** (Phase 1, Tests F-1.4.1 through F-1.4.6)
2. **Automatic Naming Convention** (Phase 1, Tests F-1.5.1 through F-1.5.5)
3. **Learning Loop Verification** (Phase 2, Test L-2.3.1) - Critical for V1
4. **Intelligence Field Extraction** (Phase 3, Tests I-3.1.x)

### Files Audited

| Category | Files | Total Lines |
|----------|-------|-------------|
| Agent Pipeline | 6 files | ~1,500 |
| Feedback Loop | 2 files | ~1,200 |
| Intelligence | 2 files | ~3,200 |
| Document Mgmt | 4 files | ~1,800 |
| Client/Project | 4 files | ~2,000 |
| Meetings | 2 files | ~700 |
| Checklist | 2 files | ~2,600 |
| **TOTAL** | **22 files** | **~13,000 lines** |

---

## Feature Summary

This audit covers 7 core feature areas:

| # | Feature | Priority | Risk Level |
|---|---------|----------|------------|
| 1 | Document Filing | **CRITICAL** | High |
| 2 | Self-Learning Loop | **CRITICAL** | High |
| 3 | Client Intelligence | High | Medium |
| 4 | Document Library | High | Low |
| 5 | Client & Project Views | Medium | Low |
| 6 | Meeting Notes | Medium | Medium |
| 7 | Checklist System | High | Medium |

---

## Phase 1: Document Filing (CRITICAL)

**Files Under Test:**
- [src/lib/agents/index.ts](src/lib/agents/index.ts) - Pipeline orchestrator
- [src/app/api/bulk-analyze/route.ts](src/app/api/bulk-analyze/route.ts) - Analysis API
- [src/lib/agents/checklist-agent/](src/lib/agents/checklist-agent/) - Checklist matching
- [src/lib/agents/filename-matcher/](src/lib/agents/filename-matcher/) - Filename analysis
- [src/lib/documentNaming.ts](src/lib/documentNaming.ts) - Auto-naming logic
- [convex/folderStructure.ts](convex/folderStructure.ts) - Folder selection

### 1.1 Upload & Summarization

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| F-1.1.1 | Single PDF upload | Upload a PDF via filing page | File processes, summary generated | ☐ |
| F-1.1.2 | Multiple file batch | Upload 5+ files simultaneously | All files queue and process | ☐ |
| F-1.1.3 | Large file handling | Upload 50+ page document | Summary captures key content | ☐ |
| F-1.1.4 | Varied file types | Upload PDF, DOCX, image | Each type summarized appropriately | ☐ |
| F-1.1.5 | Empty/corrupt file | Upload empty PDF | Graceful error handling | ☐ |

### 1.2 Automatic Folder Selection

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| F-1.2.1 | Financial doc → Financial folder | Upload bank statement | Routes to Financial/Banking folder | ☐ |
| F-1.2.2 | Legal doc → Legal folder | Upload LLC Agreement | Routes to Legal/Entity folder | ☐ |
| F-1.2.3 | Insurance doc → Insurance folder | Upload insurance policy | Routes to Insurance folder | ☐ |
| F-1.2.4 | Tax doc → Tax folder | Upload K-1 or tax return | Routes to Tax folder | ☐ |
| F-1.2.5 | Ambiguous document | Upload generic letter | Reasonable folder with explanation | ☐ |

### 1.3 File Type Classification

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| F-1.3.1 | Bank statement detection | Upload bank statement | fileType = "Bank Statement" | ☐ |
| F-1.3.2 | Operating agreement | Upload LLC Operating Agreement | fileType = "Operating Agreement" | ☐ |
| F-1.3.3 | K-1 form detection | Upload K-1 | fileType = "K-1" | ☐ |
| F-1.3.4 | Rent roll detection | Upload rent roll | fileType = "Rent Roll" | ☐ |
| F-1.3.5 | Unclear document | Upload misc correspondence | fileType assigned with low confidence flag | ☐ |

### 1.4 Checklist Matching (HIGH PRIORITY)

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| F-1.4.1 | Exact match | Upload "Operating Agreement" to client with that checklist item | Matches correct checklist item | ☐ |
| F-1.4.2 | Synonym match | Upload "Bank Statements" when checklist says "Banking Records" | Matches via alias | ☐ |
| F-1.4.3 | Partial match | Upload "2024 K-1" when checklist says "K-1 Documents" | Matches with high confidence | ☐ |
| F-1.4.4 | No match scenario | Upload unrelated document | No checklist item selected | ☐ |
| F-1.4.5 | Multiple candidates | Upload doc matching 2+ items | Most relevant selected with reasoning | ☐ |
| F-1.4.6 | Filename-based matching | Upload "Smith_K1_2024.pdf" | Checklist agent uses filename hints | ☐ |

### 1.5 Automatic Naming (HIGH PRIORITY)

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| F-1.5.1 | Bank statement naming | Upload "scan001.pdf" (bank statement) | Named: "[Client] - Bank Statement - [Bank] - [Date]" | ☐ |
| F-1.5.2 | K-1 naming | Upload generic K-1 file | Named: "[Client] - K-1 - [Entity] - [Year]" | ☐ |
| F-1.5.3 | Existing good name | Upload "ABC_LLC_Operating_Agreement.pdf" | Preserves/enhances existing name | ☐ |
| F-1.5.4 | Missing date info | Upload doc without clear date | Uses reasonable default or "Unknown" | ☐ |
| F-1.5.5 | Special characters | Upload file with special chars | Clean, valid filename generated | ☐ |

### 1.6 Pipeline Integration

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| F-1.6.1 | Full pipeline flow | Upload document through filing | All 7 stages execute in order | ☐ |
| F-1.6.2 | High confidence skip | Upload clear bank statement | Verification stage skipped | ☐ |
| F-1.6.3 | Low confidence path | Upload ambiguous document | Critic agent engaged | ☐ |
| F-1.6.4 | Cache hit | Re-upload identical document | Returns cached result quickly | ☐ |

### Phase 1 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED (with recommendations)

#### Architecture Summary

**7-Stage Modular Pipeline** ([src/lib/agents/index.ts](src/lib/agents/index.ts))

| Stage | Agent | Purpose | Model |
|-------|-------|---------|-------|
| 0 | Cache Check | Skip if cached result exists | - |
| 1 | Filename Analysis | Extract type hints from filename patterns | Pattern matching |
| 2 | Summary Agent | Deep document analysis | Together AI Llama |
| 3 | Classification Agent | Classify file type and category | Together AI Llama |
| 4 | Verification Agent | Validate low-confidence results | Together AI Llama |
| 5 | Checklist Agent | Match to checklist items | Together AI Llama |
| 6 | Critic Agent | Final reasoning with correction context | OpenAI GPT-4o |

**Confidence-Based Routing:**
- High (≥0.8): Skip verification, skip critic
- Medium (0.5-0.8): Run verification + checklist agent
- Low (<0.5): Run all stages including critic with correction context

**API Route** ([src/app/api/bulk-analyze/route.ts](src/app/api/bulk-analyze/route.ts))
- Fetches context: file type definitions, checklist items, folder structure
- Handles large documents: 40K+ chars get smart summarization
- Post-pipeline: Checks placement rules from database
- Adds canonical field hints for intelligence extraction

#### Checklist Matching Analysis

**Checklist Agent** ([src/lib/agents/checklist-agent/index.ts](src/lib/agents/checklist-agent/index.ts))

**Matching Rules (from prompt):**
1. Filename contains requirement name → 0.85+ confidence
2. Document TYPE matches acceptable types → 0.75+ confidence
3. Content serves described purpose → 0.65+ confidence
4. Semantic similarity → 0.50-0.65 confidence

**Strengths:**
- LLM-based matching with rich context (8000 chars content preview)
- Filename hints are "strong signals" - won't contradict clear matches
- Can return multiple matches if document fulfills multiple requirements
- Falls back to filename matches if API fails

**Potential Issues:**
- Only matches `missing` or `pending_review` items (already fulfilled items ignored)
- Relies on `matchingDocumentTypes` field being populated on checklist items
- Minimum confidence threshold of 0.50 filters out uncertain matches

#### Filename Matcher Analysis

**Filename Patterns** ([src/lib/agents/filename-matcher/patterns.ts](src/lib/agents/filename-matcher/patterns.ts))

**Pattern Coverage: 60+ patterns including:**
- KYC: passport, driving license, proof of address, bank statement, track record
- Appraisals: valuation, red book, appraisal, cashflow, comparables
- Plans: floor plan, elevation, section, site plan, location plan
- Inspections: initial monitoring, interim monitoring
- Professional Reports: planning, contract sum analysis, building survey
- Legal: facility letter, personal guarantee, share charge, debenture
- And more...

**Matching Algorithm:**
| Check | Score | Condition |
|-------|-------|-----------|
| 1 | 0.90 | Filename contains exact checklist item name |
| 2 | 0.85 | Filename matches `matchingDocumentTypes` |
| 3 | 0.80 | Pattern aliases match (e.g., "poa" → "proof of address") |
| 4 | 0.60 | Partial word matching (2+ significant words) |

**Pattern Aliases** ([CHECKLIST_PATTERN_ALIASES](src/lib/agents/filename-matcher/patterns.ts)):
```
proof of address: poa, utility, utility bill, bank statement
proof of id: poi, passport, driving license, id doc
bank statement: bank, statement, bs
appraisal: feasibility, da
valuation: val, red book, rics
```

**Strengths:**
- Exclusion patterns prevent false positives (e.g., "passport" but not "passport photo guide")
- Normalizes filename (removes underscores, dashes, dots)
- Multiple scoring tiers for different match qualities

**Potential Issues:**
- Pattern order matters - first match wins
- Some checklist items may not have corresponding patterns defined

#### Document Naming Analysis

**Naming Convention** ([src/lib/documentNaming.ts](src/lib/documentNaming.ts))

**Format:** `<ProjectShortcode>-<Type>-<INT/EXT>-<Initials>-<Version>-<Date>`

**Example:** `WIMBPARK28-APPRAISAL-EXT-JS-V1.0-2026-01-12`

**Type Abbreviations:**
| Input | Abbreviation |
|-------|--------------|
| appraisal, valuation, red book | APPRAISAL |
| term sheet, loan terms | TERMSHEET |
| credit memo, credit submission | CREDIT |
| contract, agreement | CONTRACT |
| kyc, identity verification | KYC |
| Default | First 8 chars uppercase |

**Strengths:**
- Version tracking with major/minor increments
- Duplicate detection via base pattern matching
- Parse function can deconstruct existing names

**Potential Issue:**
- Requires `projectShortcode`, `uploaderInitials`, `isInternal` at filing time
- If these aren't available/passed, naming may be incomplete

#### Critical Findings & Recommendations

| Finding | Severity | Recommendation |
|---------|----------|----------------|
| Checklist matching skips fulfilled items | Info | By design - prevents duplicate links |
| Filename patterns need manual maintenance | Medium | Add patterns for any missing checklist items |
| Critic agent only runs at low confidence | Medium | Consider running on certain file types always |
| Document naming needs context | Medium | Ensure project shortcode/initials passed in filing flow |
| Cache can persist incorrect results | Low | Cache invalidation on correction is implemented |

#### Recommendations for Manual Testing

1. **Test pattern coverage**: Upload documents for each checklist item, verify pattern matches
2. **Test ambiguous documents**: Upload documents that could match multiple types
3. **Test filename inference**: Upload "Smith_K1_2024.pdf" - should match K-1 checklist item
4. **Test naming generation**: File document, verify name follows convention
5. **Test low-confidence path**: Upload unusual document, verify critic agent runs

#### Files Under Test Summary

| File | Lines | Purpose |
|------|-------|---------|
| [src/lib/agents/index.ts](src/lib/agents/index.ts) | 759 | Pipeline orchestrator |
| [src/app/api/bulk-analyze/route.ts](src/app/api/bulk-analyze/route.ts) | 582 | API route |
| [src/lib/agents/checklist-agent/index.ts](src/lib/agents/checklist-agent/index.ts) | 198 | Checklist matching |
| [src/lib/agents/filename-matcher/index.ts](src/lib/agents/filename-matcher/index.ts) | 155 | Filename pattern matching |
| [src/lib/agents/filename-matcher/patterns.ts](src/lib/agents/filename-matcher/patterns.ts) | 149 | Pattern definitions |
| [src/lib/documentNaming.ts](src/lib/documentNaming.ts) | 310 | Naming convention |

---

## Phase 2: Self-Learning Loop (CRITICAL)

**Files Under Test:**
- [convex/filingFeedback.ts](convex/filingFeedback.ts) - Feedback capture
- [src/lib/agents/critic-agent/](src/lib/agents/critic-agent/) - Correction context

### 2.1 Correction Capture

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| L-2.1.1 | File type correction | AI says "Bank Statement", user changes to "Brokerage Statement" | Correction recorded in filingCorrections | ☐ |
| L-2.1.2 | Folder correction | AI routes to Legal, user moves to Financial | Correction recorded with both values | ☐ |
| L-2.1.3 | Checklist correction | AI matches wrong item, user selects correct | Correction recorded | ☐ |
| L-2.1.4 | Name correction | User edits auto-generated name | Name pattern correction stored | ☐ |
| L-2.1.5 | Multiple corrections | User changes 3+ fields | All corrections captured | ☐ |

### 2.2 Learning Application

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| L-2.2.1 | Correction retrieval | Query corrections for specific file type | Returns relevant past corrections | ☐ |
| L-2.2.2 | Consolidated rules | Get rules for frequently confused pairs | Returns aggregated patterns | ☐ |
| L-2.2.3 | Critic context | Process doc with prior correction history | Critic sees relevant corrections | ☐ |
| L-2.2.4 | Cache invalidation | Make correction | Related cache entries invalidated | ☐ |

### 2.3 Loop Verification

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| L-2.3.1 | Learning test | 1. Upload doc A → AI says X, correct to Y. 2. Upload similar doc B | Doc B should predict Y (not X) | ☐ |
| L-2.3.2 | Repeated pattern | Correct same mistake 3x | System learns pattern | ☐ |
| L-2.3.3 | No regression | After corrections, upload different doc type | Unrelated classifications unaffected | ☐ |

### Phase 2 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED - Comprehensive self-learning system

#### Architecture Summary

**Filing Feedback Module** ([convex/filingFeedback.ts](convex/filingFeedback.ts))
A 1000+ line module providing the complete feedback loop:

**1. Correction Capture**
```
User changes AI prediction → captureCorrection() → filingCorrections table
```
- Stores: AI prediction, user correction, filename (normalized), content summary
- Generates content hash for cache invalidation
- Tracks which fields were corrected (fileType, category, folder, checklist)

**2. Intelligent Retrieval Strategies**

| Query | Strategy | Use Case |
|-------|----------|----------|
| `getRelevantCorrections` | Multi-strategy (type → category → filename search) | General correction retrieval |
| `getTargetedCorrections` | Exact confusion pair matching (A↔B corrections) | Low confidence, specific uncertainty |
| `getConsolidatedRules` | Aggregated patterns (e.g., "Other→Track Record (12x)") | Medium confidence, compact context |

**3. Tiered Application in Critic Agent**

| Confidence | Tier | Context Size | Strategy |
|------------|------|--------------|----------|
| >0.85 | `none` | 0 tokens | Skip corrections |
| 0.65-0.85 | `consolidated` | ~100 tokens | Aggregated rules only |
| 0.50-0.65 | `targeted` | ~200-400 tokens | Confusion-pair corrections |
| <0.50 | `full` | ~500+ tokens | Complete correction history |

**4. Cache System**
- Content-hash based caching (`classificationCache` table)
- Auto-invalidation when correction is made for same content
- Hit count tracking for analytics
- `isValid` flag for soft invalidation

**5. LoRA Training Export**
- Export corrections as training data in multiple formats:
  - OpenAI Chat format (messages array)
  - Together Chat format (text with role tags)
  - Alpaca format (instruction/input/output)
- Criteria filtering: date range, correction type, client type

**Critic Agent Integration** ([src/lib/agents/critic-agent/index.ts](src/lib/agents/critic-agent/index.ts))

**Smart Correction Functions:**
- `determineCorrectionTier(confidence, hasAlternatives)` → Decides which retrieval tier
- `extractConfusionPairs(classification)` → Identifies what AI is uncertain between
- `buildConsolidatedRulesContext(rules)` → Formats compact rule text
- `buildTargetedCorrectionsContext(corrections, pairs)` → Formats specific corrections

**Prompt Integration:**
The critic prompt includes a `## LEARNING FROM PAST MISTAKES` section when corrections are available, instructing the model to:
1. Review past corrections for similar documents
2. Apply learned corrections if the current document is similar
3. Explicitly state in reasoning if a correction was applied
4. Track `correctionInfluence` in output

#### Database Schema

**`filingCorrections` table:**
```
- sourceItemId: Reference to bulk upload item
- fileName, fileNameNormalized: For pattern matching
- contentHash: For cache invalidation
- aiPrediction: { fileType, category, targetFolder, confidence, suggestedChecklistItems }
- userCorrection: { fileType?, category?, targetFolder?, checklistItems? }
- correctedFields: ["fileType", "category", ...]
- correctionWeight: For prioritization
```

**`classificationCache` table:**
```
- contentHash: Primary lookup key
- fileNamePattern: Normalized filename
- classification: Cached result
- hitCount, lastHitAt: Usage tracking
- isValid, invalidatedAt: Soft invalidation
- correctionCount: How many times this was corrected
```

#### The Complete Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                      SELF-LEARNING LOOP                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. UPLOAD → Pipeline runs → AI makes prediction              │
│                    ↓                                            │
│   2. USER REVIEWS → Changes classification if wrong            │
│                    ↓                                            │
│   3. CAPTURE → captureCorrection() stores the correction       │
│                    ↓                                            │
│   4. INVALIDATE → Cache for that content hash invalidated      │
│                    ↓                                            │
│   5. NEXT UPLOAD → Critic agent fetches relevant corrections   │
│                    ↓                                            │
│   6. APPLY → Critic considers corrections in decision-making   │
│                    ↓                                            │
│   7. LEARN → Better prediction → Back to step 1                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Code Quality Observations

| Aspect | Finding | Rating |
|--------|---------|--------|
| Correction Capture | Comprehensive with content hash, normalized filename | ✅ Excellent |
| Retrieval Strategies | 3 tiers with fallbacks | ✅ Excellent |
| Token Efficiency | Tiered context based on confidence | ✅ Excellent |
| Cache Invalidation | Automatic on correction | ✅ Good |
| Training Export | Multi-format with filtering | ✅ Good |
| Error Handling | Try/catch with fallbacks | ✅ Good |

#### Identified Strengths

1. **Token Efficiency**: Tiered approach minimizes prompt size while maximizing learning
2. **Confusion Pair Targeting**: Finds corrections specifically relevant to current uncertainty
3. **Aggregated Rules**: "Other → Track Record (12x)" provides strong signal in few tokens
4. **Multi-Strategy Retrieval**: Falls back through file type → category → filename search
5. **LoRA Export**: Future-proofs for model fine-tuning

#### Recommendations for Manual Testing

1. **Test correction capture**: Change a classification, verify record in filingCorrections
2. **Test cache invalidation**: Re-upload same document after correction, verify fresh analysis
3. **Test consolidated rules**: Make same correction 3x, check `getConsolidatedRules` returns it
4. **Test targeted corrections**: Create correction A→B, upload similar doc, verify B is suggested
5. **Monitor critic reasoning**: Check if "applied correction" appears in verification notes

---

## Phase 3: Client Intelligence

**Files Under Test:**
- [convex/intelligence.ts](convex/intelligence.ts) - Intelligence CRUD
- [src/lib/canonicalFields.ts](src/lib/canonicalFields.ts) - Field definitions
- [src/app/api/intelligence-extract/route.ts](src/app/api/intelligence-extract/route.ts) - Extraction API

### 3.1 Canonical Field Extraction

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| I-3.1.1 | Contact extraction | Upload doc with phone/email | Contact fields populated | ☐ |
| I-3.1.2 | Address extraction | Upload doc with addresses | Address fields populated | ☐ |
| I-3.1.3 | Banking info | Upload bank statement | Banking details extracted | ☐ |
| I-3.1.4 | Key people | Upload entity docs | Key people identified | ☐ |
| I-3.1.5 | Project financials | Upload project pro forma | Financial fields populated | ☐ |

### 3.2 Intelligence Accumulation

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| I-3.2.1 | First document | Upload first doc for new client | Intelligence record created | ☐ |
| I-3.2.2 | Incremental update | Upload second doc with new info | Existing intelligence enriched | ☐ |
| I-3.2.3 | No overwrite | Upload doc with conflicting info | Original info preserved or flagged | ☐ |
| I-3.2.4 | Custom fields | Upload doc with non-canonical data | Custom fields created | ☐ |

### 3.3 Intelligence Display

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| I-3.3.1 | Client intel view | Navigate to client Data tab | All extracted fields displayed | ☐ |
| I-3.3.2 | Project intel view | Navigate to project Data tab | Project-level fields shown | ☐ |
| I-3.3.3 | Source tracking | Click on field | Shows source document(s) | ☐ |

### Phase 3 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED - Comprehensive intelligence system

#### Architecture Summary

**Intelligence Storage** ([convex/intelligence.ts](convex/intelligence.ts))
A 2000+ line module providing:

**Client Intelligence:**
- Identity: legal name, trading name, company number, VAT, incorporation date
- Primary Contact: name, email, phone, role
- Addresses: registered, trading, correspondence
- Banking: bank name, account details, IBAN, SWIFT
- Key People: array of stakeholders with roles
- Lender/Borrower Profiles: specialized profiles per client type
- AI Summary: executive summary, key facts, recent updates

**Project Intelligence:**
- Overview: project type, asset class, description, unit count
- Location: site address, postcode, local authority, coordinates
- Financials: purchase price, TDC, GDV, loan amount, LTV, LTC, profit margin
- Timeline: acquisition, planning, construction start/completion
- Development: unit breakdown, total sqft, planning status
- Key Parties: borrower, lender, solicitor, valuer, architect, contractor

**Canonical Fields** ([src/lib/canonicalFields.ts](src/lib/canonicalFields.ts))
A 1250+ line taxonomy system:

| Category | Client Fields | Project Fields |
|----------|---------------|----------------|
| Contact | 10 fields | - |
| Company | 12 fields | - |
| Financial | 8 fields | 10 fields |
| Experience | 5 fields | - |
| Overview | - | 6 fields |
| Location | - | 4 fields |
| Timeline | - | 5 fields |

**Key Features:**
1. **Alias Normalization**: Each field has 3-10 aliases for flexible extraction
   - e.g., "company number" → "reg number" → "companies house number" → "crn"
2. **Fuzzy Matching**: Levenshtein distance for close-but-not-exact matches
3. **Checklist-to-Field Hints**: Maps "Bank Statement" → `financial.bankName`, `financial.liquidAssets`
4. **Smart Value Parsing**: Parses "£12.5m" → 12500000, "75%" → 75

**Intelligence Extraction Flow:**
```
Document Filed → createIntelligenceExtractionJob() → Queue
                          ↓
         /api/process-intelligence-queue → mergeExtractedIntelligence()
                          ↓
         Confidence-Based Merge → New data only if higher confidence
```

**Evidence Trail:**
Each extracted field tracks:
- Source document ID and name
- Confidence score
- Source text (quote from document)
- Page number (if available)
- Extraction method
- Timestamp

#### Code Quality Observations

| Aspect | Finding | Rating |
|--------|---------|--------|
| Field Taxonomy | 35+ client fields, 25+ project fields with rich aliases | ✅ Excellent |
| Normalization | Multi-strategy: exact → alias → contains → fuzzy | ✅ Excellent |
| Confidence Merge | Higher confidence wins, no data loss | ✅ Good |
| Evidence Trail | Full audit trail with source tracking | ✅ Excellent |
| Scope Handling | Correct client vs project field routing | ✅ Good |
| Data Library Sync | Aggregates project data items into intelligence | ✅ Good |

#### Recommendations for Manual Testing

1. **Test field extraction**: Upload bank statement, verify `financial.bankName` populated
2. **Test alias normalization**: Extract "Company Reg Number", verify maps to `company.registrationNumber`
3. **Test confidence merge**: Upload 2 docs with same field, verify higher confidence wins
4. **Test evidence trail**: View extracted field, verify shows source document
5. **Test scope routing**: Upload project doc, verify data goes to project intelligence not client

---

## Phase 4: Document Library

**Files Under Test:**
- [src/app/docs/page.tsx](src/app/docs/page.tsx) - Main library
- [convex/documents.ts](convex/documents.ts) - Document CRUD
- [convex/personalFolders.ts](convex/personalFolders.ts) - Personal folders
- [convex/internalFolders.ts](convex/internalFolders.ts) - Internal folders

### 4.1 Folder Management

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| D-4.1.1 | Create folder | Click "New Folder" in library | Folder created and visible | ☐ |
| D-4.1.2 | Rename folder | Rename existing folder | Name updated throughout | ☐ |
| D-4.1.3 | Delete empty folder | Delete folder with no docs | Folder removed | ☐ |
| D-4.1.4 | Delete folder with docs | Attempt delete | Warning/block or cascade option | ☐ |
| D-4.1.5 | Nested folders | Create subfolder | Hierarchy displays correctly | ☐ |

### 4.2 Document Scopes

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| D-4.2.1 | Client scope | Upload to client folder | Doc visible in client library | ☐ |
| D-4.2.2 | Personal scope | Upload to personal folder | Doc only visible to user | ☐ |
| D-4.2.3 | Internal scope | Upload to internal folder | Doc visible company-wide | ☐ |
| D-4.2.4 | Scope switching | View library, switch scopes | Correct documents displayed per scope | ☐ |

### 4.3 Document Operations

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| D-4.3.1 | View document | Click document in list | Detail panel opens with preview | ☐ |
| D-4.3.2 | Download document | Click download button | File downloads correctly | ☐ |
| D-4.3.3 | View summary | Open document details | Summary displayed | ☐ |
| D-4.3.4 | Move document | Drag/move to different folder | Document moved, breadcrumbs update | ☐ |
| D-4.3.5 | Search documents | Search by name/content | Relevant results returned | ☐ |

### Phase 4 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED

#### Architecture Summary

**Main Library Page** ([src/app/docs/page.tsx](src/app/docs/page.tsx))
- 3-pane layout: DocsSidebar → FolderBrowser → FileList
- Supports 3 document scopes: `client`, `internal`, `personal`
- URL deep-linking via `?clientId=` parameter
- Sheet-based detail panel (FileDetailPanel)
- Cross-scope document moving via MoveDocumentCrossScopeModal
- Breadcrumb navigation with scope awareness

**Document CRUD** ([convex/documents.ts](convex/documents.ts))
- `list` - Get documents with optional filters (client, project, category, status)
- `get` - Single document by ID
- `getByClient` / `getByProject` - Scoped document retrieval
- `getInternal` / `getUnfiled` - Scope-based queries
- `getByScope` - Internal/personal document queries with auth
- `getByFolder` - Folder-scoped document queries
- `create` - Auto-generates document code based on scope
- `update` - With folder validation
- `remove` - With cache invalidation
- `moveDocumentCrossScope` - Full cross-scope move with auth

**Personal Folders** ([convex/personalFolders.ts](convex/personalFolders.ts))
- User-specific folders with ownership verification
- Default folders: My Documents, Drafts, Archive
- `ensureDefaultFolders` - Idempotent folder initialization
- Prevents deletion of non-empty folders

**Internal Folders** ([convex/internalFolders.ts](convex/internalFolders.ts))
- Company-wide folders accessible to all authenticated users
- Default folders: Templates, Policies & Procedures, Marketing, Training, Miscellaneous
- Admin-only deletion
- `isCustom` flag distinguishes default vs user-created

**File Detail Panel** ([src/app/docs/components/FileDetailPanel.tsx](src/app/docs/components/FileDetailPanel.tsx))
- Sheet component with reactive document updates
- Download via storage URL
- Open in reader functionality
- Move and delete actions
- AI analysis trigger

#### Code Quality Observations

| Aspect | Finding | Rating |
|--------|---------|--------|
| Scope Handling | 3 scopes properly isolated with auth checks | ✅ Good |
| Folder Management | CRUD with empty-folder enforcement | ✅ Good |
| Document Codes | Auto-generated per scope (CLIENT-TYPE-DATE format) | ✅ Good |
| Cross-Scope Moves | Auth-verified, code regeneration | ✅ Good |
| File Storage | Convex storage with URL retrieval | ✅ Good |
| Search | Multi-field search (name, summary, client, project) | ✅ Good |

#### Recommendations for Manual Testing

1. **Test scope switching**: Switch between Client, Internal, Personal scopes - verify correct documents shown
2. **Test cross-scope move**: Move a document from Client → Personal scope, verify code regenerates
3. **Test personal folder privacy**: Log in as different user, verify can't see other's personal docs
4. **Test folder deletion**: Try to delete folder with documents, verify blocked
5. **Test download**: Click download button, verify file downloads with correct name

---

## Phase 5: Client & Project Views

**Files Under Test:**
- [src/app/clients/[clientId]/page.tsx](src/app/clients/[clientId]/page.tsx) - Client portal
- [src/app/clients/[clientId]/projects/[projectId]/page.tsx](src/app/clients/[clientId]/projects/[projectId]/page.tsx) - Project portal

### 5.1 Client Portal

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| C-5.1.1 | Client overview | Navigate to client | Overview tab shows key info | ☐ |
| C-5.1.2 | Tab navigation | Click each tab | All 11 tabs accessible and load | ☐ |
| C-5.1.3 | Client documents | Go to Documents tab | Client's documents displayed | ☐ |
| C-5.1.4 | Client projects | Go to Projects tab | All projects listed | ☐ |
| C-5.1.5 | Quick stats | View client page | Document count, project count visible | ☐ |

### 5.2 Project Portal

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| P-5.2.1 | Project overview | Navigate to project | Overview shows project details | ☐ |
| P-5.2.2 | Project tabs | Click each tab | All tabs accessible | ☐ |
| P-5.2.3 | Back to client | Click client breadcrumb | Returns to client view | ☐ |
| P-5.2.4 | Project documents | Go to Documents tab | Project-specific docs shown | ☐ |

### 5.3 Navigation

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| N-5.3.1 | Sidebar navigation | Click different menu items | Navigates correctly | ☐ |
| N-5.3.2 | Breadcrumbs | Navigate deep, check breadcrumbs | Path is accurate and clickable | ☐ |
| N-5.3.3 | Cross-linking | Click project from client view | Opens project correctly | ☐ |

### Phase 5 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED

#### Architecture Summary

**Client Portal** ([src/app/clients/[clientId]/page.tsx](src/app/clients/[clientId]/page.tsx))
- 11 fully-implemented tabs: Overview, Documents, Projects, Contacts, Tasks, Communications, Meetings, Data, Intelligence, Checklist, Notes
- URL-based tab state management (deep linking supported via `?tab=` parameter)
- Proper loading states with spinner animation
- Graceful "not found" handling with link back to clients list
- Quick stats row with CompactMetricCard components showing counts
- Settings panel integration with Archive/Delete dialogs

**Project Portal** ([src/app/clients/[clientId]/projects/[projectId]/page.tsx](src/app/clients/[clientId]/projects/[projectId]/page.tsx))
- 8 fully-implemented tabs: Overview, Documents, Tasks, Intelligence, Checklist, Communications, Data, Notes
- Back navigation to parent client with dynamic client name
- Status badge system (active, completed, on-hold, cancelled, archived)
- Project shortcode display in header
- Metrics row with document count, client count, loan amount, dates

**Sidebar Navigation** ([src/components/Sidebar.tsx](src/components/Sidebar.tsx))
- 11 navigation items: Dashboard, Tasks, Calendar, Inbox, Upload & File, Clients, Prospects, Rolodex, Docs, Notes, Modeling
- Active state detection using pathname matching
- Hover expansion animation (20px → 64px width)
- Settings link at bottom

**Backend Support**
- [convex/clients.ts](convex/clients.ts): Full CRUD with folder auto-creation, intelligence initialization, checklist initialization
- [convex/projects.ts](convex/projects.ts): Full CRUD with shortcode generation, folder templates, intelligence sync

#### Code Quality Observations

| Aspect | Finding | Rating |
|--------|---------|--------|
| Data Fetching | Uses Convex hooks properly with loading/error states | ✅ Good |
| State Management | URL params for tabs, React state for modals | ✅ Good |
| Error Handling | Try/catch on mutations, error alerts to user | ✅ Good |
| Navigation | Link components with proper hrefs | ✅ Good |
| Accessibility | Tab triggers with proper roles | ✅ Good |
| Code Organization | Tab components separated into individual files | ✅ Good |

#### Recommendations for Manual Testing

1. **Verify tab persistence**: Navigate to client, switch to Documents tab, refresh page - should stay on Documents
2. **Test cross-linking**: From client Projects tab, click a project - should open project detail
3. **Test back navigation**: From project page, click "Back to {Client}" - should return to client
4. **Verify counts**: Check that Documents/Projects/Contacts counts match actual data

---

## Phase 6: Meeting Notes

**Files Under Test:**
- [convex/meetings.ts](convex/meetings.ts) - Meeting CRUD
- [src/app/api/meeting-extract/route.ts](src/app/api/meeting-extract/route.ts) - Transcript processing
- [src/app/clients/[clientId]/components/ClientMeetingsTab.tsx](src/app/clients/[clientId]/components/ClientMeetingsTab.tsx)

### 6.1 Transcript Upload

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| M-6.1.1 | Upload transcript | Upload meeting transcript file | Meeting created and processed | ☐ |
| M-6.1.2 | Paste transcript | Paste transcript text directly | Meeting created and processed | ☐ |
| M-6.1.3 | Various formats | Upload .txt, .docx, .pdf transcript | All formats processed | ☐ |

### 6.2 Meeting Extraction

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| M-6.2.1 | Summary generation | Upload transcript | Concise summary generated | ☐ |
| M-6.2.2 | Key points | View meeting details | 3-7 key points extracted | ☐ |
| M-6.2.3 | Attendees | View meeting | Attendees with roles listed | ☐ |
| M-6.2.4 | Decisions | View meeting | Decisions captured if present | ☐ |
| M-6.2.5 | Action items | View meeting | Action items with assignees extracted | ☐ |

### 6.3 Task Integration

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| M-6.3.1 | Convert to task | Click "Add as task" on action item | Task created for client/project | ☐ |
| M-6.3.2 | Task linking | View created task | Links back to source meeting | ☐ |
| M-6.3.3 | Bulk task creation | Select multiple action items | Multiple tasks created | ☐ |

### Phase 6 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED

#### Architecture Summary

**Meetings Backend** ([convex/meetings.ts](convex/meetings.ts))
Full CRUD operations for meeting management:

**Data Model:**
- Client/Project association
- Meeting types: progress, kickoff, review, site_visit, call, other
- Attendees: name, role, company, optional contact link
- Summary and key points (3-7 bullets)
- Decisions made
- Action items with task promotion

**Queries:**
- `getByClient` / `getByProject`: Sorted by date (newest first)
- `getCountByClient`: For tab badges
- `getPendingActionItemsCount`: For notifications

**Mutations:**
- `create`: Manual entry or from extraction
- `update`: Partial update support
- `deleteMeeting`: Full delete
- `updateActionItemStatus`: Mark items complete/cancelled
- `promoteActionItemToTask`: Bi-directional linking to tasks table

**Meeting Extraction API** ([src/app/api/meeting-extract/route.ts](src/app/api/meeting-extract/route.ts))

**Extraction Pipeline:**
1. Accepts: JSON body or FormData (with file upload)
2. Text extraction from PDF/DOCX via `extractTextFromFile`
3. LLM extraction using OpenAI GPT-4o or Together AI Llama
4. Optional save to database (`save=true` parameter)

**Extraction Targets:**
| Field | Description |
|-------|-------------|
| title | Auto-generated descriptive title |
| meetingDate | ISO format date |
| meetingType | Classified type |
| attendees | People with roles/companies |
| summary | 2-3 sentence executive summary |
| keyPoints | 3-7 main discussion topics |
| decisions | Decisions made during meeting |
| actionItems | Tasks with assignee, due date, unique ID |
| confidence | 0.0-1.0 extraction quality score |

**Confidence Scoring:**
- 0.9-1.0: Clear formal meeting notes
- 0.7-0.9: Informal but clear content
- 0.5-0.7: Partial notes, inference needed
- <0.5: Very sparse, significant inference

**Action Item → Task Promotion:**
```
Action Item in Meeting → promoteActionItemToTask() → Creates Task
                                    ↓
            Updates action item with taskId for bi-directional link
```

#### Code Quality Observations

| Aspect | Finding | Rating |
|--------|---------|--------|
| Data Model | Comprehensive with attendees, action items | ✅ Good |
| Extraction | Clear prompts with confidence scoring | ✅ Good |
| Task Integration | Bi-directional linking | ✅ Good |
| Error Handling | Try/catch with error responses | ✅ Good |
| API Flexibility | Supports JSON and FormData | ✅ Good |

#### Recommendations for Manual Testing

1. **Test transcript upload**: Upload meeting transcript file, verify extraction
2. **Test paste input**: Paste meeting notes text, verify extraction
3. **Test attendee extraction**: Verify names, roles, companies extracted
4. **Test action item extraction**: Verify tasks captured with assignees
5. **Test task promotion**: Click promote, verify task created with link

---

## Phase 7: Checklist System

**Files Under Test:**
- [convex/knowledgeLibrary.ts](convex/knowledgeLibrary.ts) - Checklist management
- [src/app/clients/[clientId]/components/KnowledgeChecklistPanel.tsx](src/app/clients/[clientId]/components/KnowledgeChecklistPanel.tsx)

### 7.1 Template Initialization

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| CL-7.1.1 | New client checklist | Create new client | Default checklist items created | ☐ |
| CL-7.1.2 | New project checklist | Create new project | Project-level checklist items created | ☐ |
| CL-7.1.3 | Template variations | Create different client types | Appropriate templates applied | ☐ |

### 7.2 Dynamic Management

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| CL-7.2.1 | Add custom item | Click "Add Item" | New checklist item added | ☐ |
| CL-7.2.2 | Remove item | Delete checklist item | Item removed from list | ☐ |
| CL-7.2.3 | Edit item | Modify item name/description | Changes saved | ☐ |
| CL-7.2.4 | Reorder items | Drag items to reorder | Order persists | ☐ |

### 7.3 Document Linking

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| CL-7.3.1 | Auto-link from filing | File document via filing | Matched checklist item linked | ☐ |
| CL-7.3.2 | Manual link | Manually link doc to item | Link created, item marked fulfilled | ☐ |
| CL-7.3.3 | Unlink document | Remove document link | Link removed, item unmarked | ☐ |
| CL-7.3.4 | Multiple docs per item | Link 2+ docs to one item | All links tracked | ☐ |

### 7.4 Completion Tracking

| Test ID | Test Case | Steps | Expected Result | Status |
|---------|-----------|-------|-----------------|--------|
| CL-7.4.1 | Progress display | View checklist | Shows X of Y complete | ☐ |
| CL-7.4.2 | Missing items | View checklist | Unfulfilled items highlighted | ☐ |
| CL-7.4.3 | Client-level view | Check client Knowledge tab | Aggregated checklist status | ☐ |
| CL-7.4.4 | Project-level view | Check project Knowledge tab | Project-specific status | ☐ |

### Phase 7 Code Audit Results

**Audit Date:** January 28, 2026
**Auditor:** Claude Code
**Status:** ✅ CODE REVIEW PASSED

#### Architecture Summary

**Backend System** ([convex/knowledgeLibrary.ts](convex/knowledgeLibrary.ts))
A comprehensive 2400+ line module providing:

**Template System:**
- `getRequirementTemplate` - Fetches templates by client type and level (client/project)
- `initializeChecklistForClient` - Creates checklist from template (idempotent)
- `initializeChecklistForProject` - Creates project-level checklist from template

**Checklist Item Management:**
- `getChecklistByClient` / `getChecklistByProject` - Enriched with linked document counts
- `getClientLevelChecklist` - Client-only items (no project)
- `getMissingItems` - Filtered by phase (indicative_terms, credit_submission, post_credit, always)
- `getChecklistSummary` - Aggregated stats (total, fulfilled, pending_review, missing, required)
- `addCustomRequirement` - Manual custom item creation
- `addCustomRequirementsFromLLM` - Bulk add from AI parsing
- `deleteCustomRequirement` - Delete custom items only (template items protected)
- `updateItemStatus` - Manual status override

**Document Linking (Many-to-Many):**
- `linkDocumentToChecklistItem` - Create link with primary/secondary tracking
- `unlinkDocumentFromChecklistItem` - Remove specific link, promotes next to primary
- `getLinkedDocuments` - All documents linked to an item (primary first)
- `getChecklistItemsForDocument` - Reverse lookup: what items is this doc linked to?

**AI Suggestion Workflow:**
- `setSuggestion` - AI suggests a document match
- `confirmSuggestedLink` - User confirms AI suggestion → creates link
- `rejectSuggestedLink` - User rejects suggestion → clears it
- `suggestDocumentMatches` - Auto-match uploaded docs to missing items

**Field-Based Progress Tracking (Sprint 3):**
- `getChecklistFieldProgress` - Maps checklist items to expected canonical fields
- `CHECKLIST_FIELD_HINTS` - 30+ mappings (e.g., "Bank Statement" → financial.bankName, financial.liquidAssets)
- Computes effective status: fulfilled / partially_filled / missing

**Consolidation Features (Sprint 4):**
- `applyDuplicateResolution` - Archive duplicate items
- `reclassifyToCanonical` - Move custom field to canonical
- `applyConsolidation` - Bulk apply consolidation results

**UI Components:**

**KnowledgeChecklistPanel** ([src/app/clients/[clientId]/components/KnowledgeChecklistPanel.tsx](src/app/clients/[clientId]/components/KnowledgeChecklistPanel.tsx))
- Search, phase filter, priority filter
- Items grouped by status (pending_review, missing, fulfilled)
- Expand item to see all linked documents
- Link/unlink documents from modal
- Accept/reject AI suggestions
- Delete custom items

**ClientKnowledgeTab** ([src/app/clients/[clientId]/components/ClientKnowledgeTab.tsx](src/app/clients/[clientId]/components/ClientKnowledgeTab.tsx))
- Scope switcher (client-level vs specific project)
- Progress bar visualization
- Intelligence stats display
- Auto-initialize checklist on first view
- Category navigation sidebar

#### Code Quality Observations

| Aspect | Finding | Rating |
|--------|---------|--------|
| Template Initialization | Idempotent, creates from template, protects existing | ✅ Excellent |
| Document Linking | Many-to-many with primary tracking | ✅ Excellent |
| AI Suggestions | Full confirm/reject workflow | ✅ Good |
| Status Management | 3 states with proper transitions | ✅ Good |
| Custom Items | Protected template items, deletable custom | ✅ Good |
| Field Progress | Innovative field-based completion tracking | ✅ Excellent |
| UI Filtering | Search, phase, priority, category filters | ✅ Good |

#### Identified Strengths

1. **Field-Based Progress**: Maps checklist items to expected intelligence fields - powerful for "partial" completion tracking
2. **Many-to-Many Linking**: Single document can fulfill multiple checklist items, checklist item can have multiple docs
3. **AI Suggestion Flow**: Clean accept/reject workflow with confidence scores
4. **Template Protection**: Can't delete template-based items, preserves data integrity

#### Recommendations for Manual Testing

1. **Test template initialization**: Create new client, verify checklist auto-created
2. **Test document linking**: Link doc to item, verify status changes to "fulfilled"
3. **Test multi-doc linking**: Link 2+ docs to same item, verify primary tracking
4. **Test AI suggestions**: File document through filing, verify suggestion appears on matching item
5. **Test custom items**: Add custom item, delete it, verify template items can't be deleted

---

## Test Execution Checklist

### Pre-Testing Setup
- [ ] Fresh test environment / clean database state
- [ ] Test client created with sample data
- [ ] Test project created under test client
- [ ] Sample documents prepared for each test category
- [ ] Checklist templates seeded

### Testing Order (Recommended)
1. **Phase 5** - Client & Project Views (foundational navigation)
2. **Phase 4** - Document Library (document infrastructure)
3. **Phase 7** - Checklist System (required for filing tests)
4. **Phase 1** - Document Filing (core feature)
5. **Phase 2** - Self-Learning Loop (depends on Phase 1)
6. **Phase 3** - Client Intelligence (uses filed documents)
7. **Phase 6** - Meeting Notes (can run parallel to others)

### Test Document Kit Needed
| Document Type | Count | Purpose |
|---------------|-------|---------|
| Bank Statements | 3 | Filing classification |
| K-1 Forms | 2 | Tax document handling |
| Operating Agreements | 2 | Legal document handling |
| Insurance Policies | 2 | Insurance classification |
| Rent Rolls | 2 | Financial document handling |
| Meeting Transcripts | 2 | Meeting notes feature |
| Generic Letters | 2 | Ambiguous document handling |
| Mixed/Unclear Docs | 3 | Edge case testing |

---

## Issue Tracking

### Critical Issues (Blockers)
| Issue | Phase | Test ID | Description | Resolution |
|-------|-------|---------|-------------|------------|
| | | | | |

### High Priority Issues
| Issue | Phase | Test ID | Description | Resolution |
|-------|-------|---------|-------------|------------|
| | | | | |

### Medium/Low Priority Issues
| Issue | Phase | Test ID | Description | Resolution |
|-------|-------|---------|-------------|------------|
| | | | | |

---

## Sign-Off

| Phase | Tester | Date | Pass/Fail | Notes |
|-------|--------|------|-----------|-------|
| Phase 1: Document Filing | | | | |
| Phase 2: Self-Learning Loop | | | | |
| Phase 3: Client Intelligence | | | | |
| Phase 4: Document Library | | | | |
| Phase 5: Client & Project Views | | | | |
| Phase 6: Meeting Notes | | | | |
| Phase 7: Checklist System | | | | |

---

## V1 Release Criteria

### Must Pass (Blocking)
- [ ] All Phase 1 (Document Filing) tests pass
- [ ] All Phase 2 (Self-Learning Loop) tests pass
- [ ] Core Phase 7 (Checklist) tests pass (7.1, 7.3)
- [ ] No critical issues open

### Should Pass (High Priority)
- [ ] All Phase 3 (Client Intelligence) tests pass
- [ ] All Phase 4 (Document Library) tests pass
- [ ] All Phase 7 (Checklist) tests pass

### Nice to Have
- [ ] All Phase 5 (Client/Project Views) tests pass
- [ ] All Phase 6 (Meeting Notes) tests pass
- [ ] Zero high-priority issues
