# RockCap System Analysis: Filing, Intelligence & Checklist Systems

**Date:** January 22, 2026
**Purpose:** Comprehensive analysis of filing upload agent, client intelligence, and checklist systems for refactoring/fortification planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [🚨 User-Reported Operational Problems](#-user-reported-operational-problems)
3. [System Architecture Overview](#system-architecture-overview)
4. [Filing Upload Agent](#filing-upload-agent)
5. [Folder Structure System](#folder-structure-system)
6. [Client Intelligence System](#client-intelligence-system)
7. [Intelligence Schema Flexibility Analysis](#intelligence-schema-flexibility-analysis)
8. [Knowledge Checklist System](#knowledge-checklist-system)
9. [AI/Model Integration](#aimodel-integration)
10. [Identified Gaps & Issues](#identified-gaps--issues)
11. [Root Cause Analysis](#root-cause-analysis)
12. [Revised Recommendations](#revised-recommendations)
13. [File Reference](#file-reference)

---

## Executive Summary

The RockCap system implements a sophisticated document management and intelligence extraction platform for real estate financing. The three core systems analyzed are:

| System | Primary Purpose | Key Files |
|--------|----------------|-----------|
| **Filing Upload Agent** | Bulk document upload, classification, and filing | `bulkQueueProcessor.ts`, `bulk-analyze/route.ts` |
| **Client Intelligence** | Structured data extraction and client profiling | `intelligence.ts`, `IntelligenceTab.tsx` |
| **Knowledge Checklist** | Document requirements tracking and completion | `knowledgeLibrary.ts`, `KnowledgeChecklistPanel.tsx` |

**Key Finding:** These three systems are interconnected but have gaps in their integration. The filing system suggests checklist matches, but doesn't leverage intelligence data. The intelligence system extracts data but doesn't feed back into checklist recommendations. There's significant opportunity for improvement in context sharing between systems.

---

## V1 Scope & Future Roadmap

### V1 Deliverables (Current Focus)

V1 is focused on delivering a **fully functional document management foundation**:

| Deliverable | Description | Status |
|-------------|-------------|--------|
| **Filing Agent** | Accurate classification + correct folder placement | 🔴 Needs fixes |
| **Filing System** | Organized folder structure, documents findable | 🟡 Partially working |
| **Client Intelligence** | Living, auto-populated knowledge base | 🔴 Needs work |
| **Project Intelligence** | Deal-specific data extraction and tracking | 🔴 Needs work |
| **Dynamic Checklist** | Reliable document requirement tracking | 🟡 Needs fixes |
| **Foundation for V2** | Architecture supporting future features | 🟡 In progress |

### V2+ Future Features

These features depend on V1 being solid:

1. **Modeling Section** - Financial modeling and analysis tools
2. **Automatic Document Generation** - Generate lender proposals, credit memos from intelligence + checklist docs
3. **Prospecting Hub** - Client acquisition and relationship management
4. **Additional features TBD**

### Why V1 Quality Matters

```
V1 Foundation (Filing + Intelligence + Checklist)
                    │
                    ▼
         ┌─────────────────────────────────┐
         │   Document Generation (V2)      │
         │   - Lender proposals            │
         │   - Credit submissions          │
         │   - Term sheets                 │
         │                                 │
         │   REQUIRES:                     │
         │   ✓ Complete checklist docs     │
         │   ✓ Accurate intelligence       │
         │   ✓ Properly filed documents    │
         └─────────────────────────────────┘
```

**Intelligence quality is critical** - it's the foundation for document generation. Garbage in = garbage out for proposals.

---

## 🔧 Key Design Requirement: Malleability

**Critical Constraint:** The system must remain **flexible and extensible** over time.

### Document Taxonomy Must Be Living

The filing agent needs to classify documents into a **dynamic taxonomy** that can be:
- Extended by users (add new document types)
- Modified over time (update descriptions, keywords, matching rules)
- Queried at runtime (not hardcoded)

**Current State:**
- ✅ `fileTypeDefinitions` table exists in database
- ✅ Can store document types with keywords and descriptions
- ⚠️ BUT: Some hardcoded mappings in code (CATEGORY_TO_FOLDER)
- ⚠️ BUT: Checklist `matchingDocumentTypes` not consistently used

**Required State:**
- All document types defined in database
- All folder mappings defined in database (placement rules)
- All checklist matching rules defined in database
- Filing agent queries these at runtime
- Admin UI to manage taxonomy (future)

### No Hardcoded Document Types

```typescript
// ❌ BAD - Hardcoded, inflexible
const DOCUMENT_TYPES = ["Valuation", "Appraisal", "Contract"];

// ✅ GOOD - Database-driven, flexible
const documentTypes = await ctx.db
  .query("fileTypeDefinitions")
  .collect();
```

### Implications for Implementation

When implementing fixes, ensure:
1. **Document types** come from `fileTypeDefinitions` table
2. **Folder mappings** come from `placementRules` table (or move CATEGORY_TO_FOLDER there)
3. **Checklist matching** uses `matchingDocumentTypes` field
4. **No new hardcoded lists** - everything configurable

---

## 🚨 User-Reported Operational Problems

*Added January 22, 2026 based on stakeholder feedback*

These are the **actual problems being experienced in production** that need to be addressed:

### Problem 1: Filing Accuracy is Inconsistent

**Symptom:** Documents are regularly being misclassified for both type and folder location.

**User Observation:** "Filing accuracy is inconsistent of type/location (folder to be placed in). It is regularly misclassifying documents."

**Proposed Solution Direction:** Expand context passed to the model OR add an additional verification agent to the pipeline (a "gauntlet" approach where documents must pass multiple checks).

**Root Cause Analysis:**
- Only 8000 characters of text sent to model (truncation)
- No client intelligence context (model doesn't "know" the client)
- No historical document context (can't learn from past filings)
- Hardcoded CATEGORY_TO_FOLDER mapping doesn't match actual folder structure
- No verification pass after initial classification

---

### Problem 2: Checklist Matching is Broken

**Symptom:** Even when documents are clearly labeled, they fail to map correctly to checklist items.

**User Observation:** "The checklist functionality is hit or miss, even when documents are labeled very clearly they are not mapping correctly to the checklist."

**Root Cause Analysis:**
- Current matching is **text-based only** - no semantic understanding
- AI receives checklist items as simple text: `[id] name (category) - status`
- No `matchingDocumentTypes` context passed in some flows
- Confidence threshold (0.7) may be too high for clearly labeled docs
- Model sees document content but doesn't understand checklist requirement semantics

**Example Failure Case:**
```
Document: "Smith_ProofOfAddress_2026.pdf" (clearly labeled)
Checklist Item: "Certified Proof of Address"
Result: NO MATCH (model doesn't connect "ProofOfAddress" to "Proof of Address")
```

---

### Problem 3: Client Intelligence Feels Stale

**Symptom:** Intelligence section is not being populated with useful data; feels like a static form with gaps.

**User Observation:** "The client intelligence feels very stale, and this section will be extremely important because this intelligence doc is what will allow us to create templated documents in the next version."

**Future Dependency:** Intelligence will be used for automated document generation (e.g., generating lender proposals from collected intel + checklist docs).

**Root Cause Analysis:**
- Intelligence only updates via **manual modal entry** or explicit extraction
- No automatic extraction from filed documents
- No incremental learning from document content
- Schema is structured but feels like "checklist with gaps" - either you have the field or you don't
- No reasoning layer (WHY is this data important?)
- No confidence tracking (HOW reliable is this data?)
- No source attribution (WHERE did this data come from?)

---

### Problem 4: Folder Structure Not Respected

**Symptom:** Need to ensure filing agent uses correct folder structure and new clients get proper folder setup.

**User Observation:** "We have a new folder structure and I want to ensure it's being respected/used correctly by the filing agent and when we create a new client it creates these blank folders successfully."

**Expected Behavior:**
```
New Client Created →
  ├── Empty folder structure created (from template)
  ├── Checklist initialized (from template)
  ├── Intelligence record created (empty, ready to fill)
  └── All systems in sync and ready for documents
```

**Current State (Verified):**
- ✅ Folder templates exist in database (borrower/lender, client/project level)
- ✅ Folders ARE auto-created on client creation (in `clients.create()`)
- ⚠️ BUT filing agent uses hardcoded CATEGORY_TO_FOLDER mapping
- ⚠️ Mapping may not match actual folder templates
- ❌ No validation that filed folder exists in client's structure

---

### Problem 5: Intelligence Needs Dedicated Agents

**Symptom:** Intelligence extraction should happen automatically from document filings, not just manual entry.

**User Observation:** "I think the intelligence system might need its own agent or agents to take uploaded documents and specifically attempt to pull document-level intel and add it to the file."

**Additional Concern:** "Is the intel on each client malleable enough? I do not want this to just feel like a second checklist with a bunch of gaps, every client intel section may be different."

**Desired Behavior:**
```
Document Filed →
  ├── Classification Agent (type, folder)
  ├── Checklist Agent (requirement matching)
  └── Intelligence Agent (extract & merge intel)
        ├── Pull contact info, company details, key people
        ├── Extract financial data, deal terms
        ├── Identify relationships and insights
        └── Merge into client intelligence (don't overwrite)
```

**Schema Flexibility Assessment:**
- Current schema has `customFields: v.any()` for arbitrary data
- BUT: No structure = can't query or filter
- Current schema has fixed profiles (lender, borrower)
- Need: Dynamic attributes with confidence, evidence, timestamps

---

### Summary: The Core Integration Problem

```
┌─────────────────────────────────────────────────────────────────────────┐
│              CURRENT STATE: Disconnected Pipeline                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Document Upload                                                         │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ Single Classification Pass                                       │    │
│  │ - Limited context (8000 chars)                                   │    │
│  │ - No client knowledge                                            │    │
│  │ - Text-only checklist matching                                   │    │
│  │ - Hardcoded folder mapping                                       │    │
│  │ - No intelligence extraction                                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│       │                                                                  │
│       ▼                                                                  │
│  Document Filed (misclassified, wrong folder, no checklist match)       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│              DESIRED STATE: Multi-Agent Pipeline                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Document Upload                                                         │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ AGENT 1: Classification                                          │    │
│  │ - Full document context (or smart summarization)                 │    │
│  │ - Client intelligence included                                   │    │
│  │ - Historical document patterns                                   │    │
│  │ - Dynamic folder structure lookup                                │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                            │
│                             ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ AGENT 2: Checklist Matching                                      │    │
│  │ - Semantic matching (embeddings or detailed descriptions)        │    │
│  │ - Requirement context (not just names)                           │    │
│  │ - High-confidence auto-linking                                   │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                            │
│                             ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ AGENT 3: Intelligence Extraction                                 │    │
│  │ - Document-level intel extraction                                │    │
│  │ - Merge with existing (don't overwrite)                          │    │
│  │ - Confidence + source tracking                                   │    │
│  │ - Client-specific flexible schema                                │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                            │
│                             ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ AGENT 4: Verification (Optional)                                 │    │
│  │ - Cross-check classification                                     │    │
│  │ - Validate folder exists                                         │    │
│  │ - Confirm checklist matches make sense                           │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                            │
│                             ▼                                            │
│  Document Filed (correct type, right folder, checklist linked,          │
│                  intelligence updated)                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INTERFACE                                 │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│   Filing Page   │  Client Portal  │ Project Portal  │  Document Queue   │
│   /filing       │  /clients/[id]  │  /projects/[id] │  /docs/queue      │
└────────┬────────┴────────┬────────┴────────┬────────┴─────────┬─────────┘
         │                 │                 │                   │
         ▼                 ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                       │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│ /bulk-analyze   │ /intelligence-  │ /knowledge-     │ /chat-assistant   │
│ Classification  │ extract         │ parse           │ Context + Tools   │
└────────┬────────┴────────┬────────┴────────┬────────┴─────────┬─────────┘
         │                 │                 │                   │
         ▼                 ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    TOGETHER AI (Llama 4 Maverick)                        │
│    Classification │ Extraction │ Normalization │ Verification │ Chat    │
└─────────────────────────────────────────────────────────────────────────┘
         │                 │                 │                   │
         ▼                 ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       CONVEX DATABASE                                    │
├─────────────────┬─────────────────┬─────────────────┬───────────────────┤
│ documents       │ clientIntel     │ knowledgeCheck  │ bulkUpload        │
│ fileQueue       │ projectIntel    │ listItems       │ Batches/Items     │
│ extractionJobs  │ knowledgeBank   │ docLinks        │                   │
└─────────────────┴─────────────────┴─────────────────┴───────────────────┘
```

---

## Filing Upload Agent

### Overview

The filing upload agent is a **summary-only bulk upload pipeline** designed for fast document classification and filing. It processes documents sequentially, classifies them using AI, and allows user review before final filing.

### Data Flow

```
User Upload → File Validation → Batch Creation → Sequential Processing
                                                         │
                                                         ▼
                              ┌──────────────────────────────────────┐
                              │     For Each File:                   │
                              │  1. Upload to storage                │
                              │  2. Extract text (PDF/DOCX/Excel)    │
                              │  3. Call /api/bulk-analyze           │
                              │  4. AI classifies document           │
                              │  5. Check for duplicates             │
                              │  6. Store analysis results           │
                              │  7. Suggest checklist matches        │
                              └──────────────────────────────────────┘
                                                         │
                                                         ▼
              Review Page → User Edits → File Document → Create Knowledge Entry
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Filing Page | `src/app/filing/page.tsx` | Entry point, client/project selection |
| Bulk Upload | `src/components/BulkUpload.tsx` | File staging, validation, options |
| Queue Processor | `src/lib/bulkQueueProcessor.ts` | Sequential processing orchestration |
| File Processor | `src/lib/fileProcessor.ts` | Text extraction (PDF, DOCX, Excel, CSV) |
| Bulk Analyze API | `src/app/api/bulk-analyze/route.ts` | AI classification endpoint |
| Convex Mutations | `convex/bulkUpload.ts` | Batch/item lifecycle, filing logic |

### Text Extraction Capabilities

| Format | Library | Notes |
|--------|---------|-------|
| PDF | `pdf-parse` | Validates magic header, handles corruption |
| DOCX | `mammoth` | Full text extraction |
| DOC | ❌ Not supported | Legacy format rejected |
| XLSX/XLS | `xlsx` | Converts to readable format with headers |
| CSV | Native parsing | Handles quoted values |
| TXT/MD | Native | Direct read |
| Images | ❌ No OCR | Returns default classification |

### AI Classification Context

**What's Passed to the Model:**
- File content (first 8000 characters - **truncated**)
- File name and metadata
- Client name and type
- Project name and shortcode (if applicable)
- File type definitions from database (keyword-matched)
- Checklist items with statuses (if client specified)
- User-provided instructions (HIGH PRIORITY override)
- Available categories and file types for validation

**What's NOT Passed:**
- ❌ Historical documents from same client/project
- ❌ Similar documents' classifications
- ❌ Client intelligence or knowledge bank data
- ❌ Document content comparison for deduplication
- ❌ Existing folder structure or custom folder names

### Document Naming Convention

```
{PROJECT_SHORTCODE}-{TYPE_ABBREV}-{INT/EXT}-{INITIALS}-{VERSION}-{DATE}
Example: WIMBPARK-APPRAISAL-EXT-JS-V1.0-2026-01-12
```

**Version Control:**
- Minor version: V{major}.{minor+1} (V1.0 → V1.1)
- Significant version: V{major+1}.0 (V1.0 → V2.0)
- User must manually select version type for duplicates

### Checklist Integration Flow

1. AI receives checklist items with IDs, names, categories, statuses
2. Returns `suggestedChecklistItems` array with confidence scores
3. Items with confidence ≥ 0.7 are auto-selected in UI
4. User can override selections during review
5. On filing, creates document-to-checklist links
6. First link marks checklist item as "fulfilled"

---

## Folder Structure System

### Overview

The folder system uses **database-driven templates** that are applied when clients and projects are created. This is a well-designed system, but there's a **disconnect** between the template system and the filing agent's folder placement logic.

### Folder Auto-Creation (Working Correctly)

When a new client is created (`clients.create()` mutation):
1. Client record created
2. Folder template looked up by client type (defaults to "borrower")
3. Complete folder structure auto-created:
   - Parent folders first (no parentKey)
   - Child folders second (with parentKey references)
4. Fallback structure used if no template exists

### Folder Templates

**Borrower Client Folders:**
```
Background (parent)
  ├── KYC
  └── Background Docs
Miscellaneous
```

**Borrower Project Folders (8 standard):**
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

**Lender Client Folders:**
```
KYC
Agreements
Correspondence
Miscellaneous
```

**Lender Project Folders:**
```
Term Sheets
Facility Documents
Security Documents
Drawdown Requests
Monitoring Reports
Correspondence
Miscellaneous
```

### ⚠️ The Disconnect: Filing Agent vs. Folder Templates

**Problem:** The filing agent uses a **hardcoded mapping** in `bulk-analyze/route.ts` that may not match the actual folder templates:

```typescript
// HARDCODED in bulk-analyze/route.ts (lines 40-61)
const CATEGORY_TO_FOLDER: Record<string, string> = {
  "appraisals": "appraisals",
  "valuation": "appraisals",
  "term sheet": "terms_comparison",
  "credit memo": "credit_submission",
  "financial model": "operational_model",
  // ... etc
}
```

**Issues:**
1. This mapping is **not derived from folder templates**
2. Folder keys may not match template folder keys
3. No validation that suggested folder actually exists
4. If user customizes folders, mapping doesn't adapt

### Folder Placement Decision Flow

```
AI classifies document → fileType, category
       │
       ▼
Look up placement rule (placementRules table)
       │
       ▼ (no rule found)
Fall back to CATEGORY_TO_FOLDER mapping
       │
       ▼ (no mapping found)
Default to "miscellaneous"
       │
       ▼
Document filed to folder (no validation it exists!)
```

### Required Fix

The filing agent should:
1. Query actual folder structure for client/project
2. Match against real folder keys, not hardcoded mapping
3. Validate folder exists before filing
4. Use placement rules from database (already exists, underutilized)

---

## Client Intelligence System

### Overview

Intelligence represents **structured, AI-extracted, and curated knowledge** about clients and projects. It serves as a central repository for decision-making data, combining AI extraction with manual curation.

### Two Intelligence Levels

| Level | Purpose | Key Data |
|-------|---------|----------|
| **Client Intelligence** | Comprehensive borrower/lender profiles | Identity, contacts, banking, key people, lender/borrower profiles |
| **Project Intelligence** | Deal-specific information | Overview, location, financials, timeline, development details, key parties |

### Client Intelligence Schema

```typescript
clientIntelligence: {
  // Identity
  identity: { legalName, tradingName, companyNumber, vatNumber, incorporationDate }

  // Contacts
  primaryContact: { name, email, phone, role }
  addresses: { registered, trading, correspondence }
  keyPeople: [{ name, role, email, phone, isDecisionMaker }]

  // Financial
  banking: { bankName, accountDetails, sortCode, IBAN, SWIFT }

  // Role-Specific Profiles
  lenderProfile: { dealSize, propertyTypes, loanTypes, regions, LTV, decisionSpeed }
  borrowerProfile: { experienceLevel, completedProjects, netWorth, liquidAssets }

  // Aggregated Data
  projectSummaries: [{ projectName, role, loanAmount, dataSummary }]
  dataLibraryAggregate: { totalDevelopmentCost, projectCount, categoryTotals }

  // AI-Generated
  aiSummary: { executiveSummary, keyFacts, recentUpdates }
}
```

### Intelligence Extraction Flow

```
User Input (text/file)
       │
       ▼
┌──────────────────┐
│ Text Extraction  │ (if file uploaded)
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│            Together AI LLM                            │
│  Model: Llama-3.3-70B-Instruct-Turbo-Free            │
│  Temperature: 0.1 (low for accuracy)                  │
│  Extracts: identity, contacts, addresses, banking,   │
│            key people, profiles, project details      │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│ Parse & Validate │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Merge with       │ (preserves existing data, adds new)
│ Existing Intel   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Update Database  │
│ Trigger Syncs    │
└──────────────────┘
```

### Data Synchronization

The intelligence system has automatic sync mechanisms:

1. **Document Filed with Extraction** → `syncDataLibraryToIntelligence` → Updates project intelligence
2. **Project Data Updated** → `syncProjectSummariesToClient` → Updates client's aggregated data
3. **Client/Project Created** → Auto-initializes intelligence records

### Integration with Chat Assistant

The chat assistant gathers comprehensive context including:
- All client/project intelligence data
- Documents with summaries and extracted data
- Notes (extracted from TipTap JSON)
- Contacts, deals, tasks, events
- Context is cached for 1 hour

---

## Intelligence Schema Flexibility Analysis

*This section addresses the concern: "Is the intel on each client malleable enough? I do not want this to just feel like a second checklist with a bunch of gaps."*

### Current Schema Assessment

The intelligence schema is **highly structured with escape hatches**:

| Aspect | Current State | Implication |
|--------|---------------|-------------|
| **Fixed Fields** | ~15 predefined sections | Predictable but rigid |
| **Optional Wrapping** | `v.optional()` on most fields | Can be empty, but still fixed shape |
| **Custom Fields** | `customFields: v.any()` | Completely untyped - can't query |
| **Role Profiles** | Separate lender/borrower profiles | Client-type specific variation |

### Why It Feels Like "Checklist with Gaps"

**Problem 1: All-or-Nothing Fields**
```typescript
// Either you have lenderProfile data or you don't
lenderProfile: { dealSizeMin, dealSizeMax, ... } | null

// Visually appears as: ☑ filled OR ☐ missing
```

**Problem 2: No Reasoning Layer**
- Intelligence stores **facts**, not **understanding**
- `aiSummary.keyFacts` is just an array of strings
- No field for "this borrower is risky because..."
- No explanation of WHY data matters

**Problem 3: No Confidence/Evidence Tracking**
```typescript
// Current: just a value
netWorth: 5000000

// Needed: value with context
netWorth: {
  value: 5000000,
  confidence: 0.8,
  evidence: ["Assets statement dated 2025-12-01"],
  lastVerified: "2026-01-15",
  notes: "Self-reported, awaiting verification"
}
```

**Problem 4: Static Profiling**
- Lender profile has fixed fields (deals, property types, regions)
- Can't capture "this lender just changed strategy"
- No temporal dimension (when did this become true?)

### What Would Make Intelligence Dynamic

**1. Add Versioned Intelligence**
```typescript
// Track changes over time
profileHistory: [
  { version: 1, data: {...}, effectiveDate, reason: "Initial profile" },
  { version: 2, data: {...}, effectiveDate, reason: "Updated after Q4 review" }
]
```

**2. Add Evidence + Confidence Fields**
```typescript
// For each major data point:
dataPoint: {
  value: any,
  confidence: number,        // 0-1
  sources: string[],         // Document IDs
  extractedFrom: string,     // Source description
  lastUpdated: timestamp,
  lastVerifiedBy: string,    // User or "system"
  notes: string              // Context
}
```

**3. Replace customFields with Typed Attributes**
```typescript
// Instead of untyped v.any()
attributes: [
  {
    key: "market_appetite_shift",
    value: "reduced risk tolerance",
    date: timestamp,
    source: "Meeting notes 2026-01-10",
    confidence: 0.9,
    tags: ["strategic", "temporary"]
  }
]
```

**4. Add Client-Specific Sections**
```typescript
// Allow different clients to have different intelligence shapes
customSections: [
  {
    sectionName: "Dubai Operations",
    fields: [
      { key: "localEntity", value: "...", ... },
      { key: "localContact", value: "...", ... }
    ]
  }
]
```

### Proposed Intelligence Schema Enhancement

```typescript
clientIntelligence: {
  // Keep structured fields for common data
  identity: { ... },
  contacts: { ... },

  // Add evidence layer
  evidenceTrail: [
    {
      fieldPath: "identity.legalName",
      value: "Acme Holdings Ltd",
      extractedFrom: "doc_abc123",
      extractedAt: timestamp,
      confidence: 0.95,
      verifiedBy: "user_xyz"
    }
  ],

  // Add flexible attributes (typed, queryable)
  attributes: [
    {
      category: "strategy",
      key: "risk_appetite",
      value: "conservative",
      since: timestamp,
      evidence: ["meeting_123", "doc_456"],
      confidence: 0.8
    }
  ],

  // Add insights (AI-generated reasoning)
  insights: [
    {
      type: "observation",
      content: "Client has shifted to lower-risk deals after Q3 losses",
      generatedAt: timestamp,
      basedOn: ["doc_123", "doc_456"],
      confidence: 0.7
    }
  ],

  // Keep AI summary but make it richer
  aiSummary: {
    executiveSummary: string,
    keyFacts: string[],
    concerns: string[],           // NEW
    opportunities: string[],      // NEW
    relationshipHealth: string,   // NEW
    lastAnalyzed: timestamp
  }
}
```

### Intelligence vs. Checklist: Key Differences

| Aspect | Checklist | Intelligence |
|--------|-----------|--------------|
| **Question Answered** | "Do we have X document?" | "What do we know about this client?" |
| **Data Type** | Binary (have/don't have) | Rich (values, context, confidence) |
| **Updates** | Document linking | Extraction + manual + inference |
| **Structure** | Fixed requirements list | Flexible knowledge graph |
| **Goal** | Completeness tracking | Decision support |

**Intelligence should NOT be:**
- A list of checkboxes
- Fixed fields with empty states
- Static snapshot of facts

**Intelligence SHOULD be:**
- Living knowledge base
- Context-aware and temporal
- Confidence-tracked and sourced
- Flexible per client type

---

## Knowledge Checklist System

### Overview

The checklist system tracks **document requirements** for clients and projects. It supports requirement templates, AI-assisted document matching, and manual linking with multi-document support per requirement.

### Core Tables

| Table | Purpose |
|-------|---------|
| `knowledgeRequirementTemplates` | Default requirements by client type and level |
| `knowledgeChecklistItems` | Per-client/project checklist items with status |
| `knowledgeChecklistDocumentLinks` | Many-to-many document-to-requirement links |
| `knowledgeEmailLogs` | Audit trail of email requests |

### Status Progression

```
Missing ──────► Pending Review ──────► Fulfilled
   ▲                  │                    │
   │                  │                    │
   └──────────────────┴────────────────────┘
   (All documents removed or suggestion rejected)
```

**Status Definitions:**
- **Missing**: Initial state, no documents linked
- **Pending Review**: AI suggested a document match, awaiting user confirmation
- **Fulfilled**: At least one document linked (isPrimary = true)

### Template Structure

```typescript
requirement: {
  id: string,
  name: string,                    // "Certified Proof of Address"
  category: string,                // "KYC", "Project Plans", etc.
  phaseRequired: string,           // "indicative_terms", "credit_submission", "post_credit"
  priority: string,                // "required", "nice_to_have", "optional"
  matchingDocumentTypes: string[], // For AI matching
  order: number                    // Display order
}
```

### Pre-Seeded Templates (Borrower Type)

**Client-Level (7 items - KYC):**
- Certified Proof of Address, Certified Proof of ID
- Business/Personal Bank Statements (3 months)
- Track Record (Excel & Word versions)
- Assets & Liabilities Statement

**Project-Level (15 items):**
- Project Information: Appraisal, Planning Decision Notice, Scheme Brief
- Project Plans: Floorplans, Elevations, Site Plan, Site Location Plan
- Professional Reports: Valuation, Initial Monitoring, Legal DD, Report on Title
- Legal Documents: Facility Letter, Personal Guarantee, Share Charge, Debenture

### Multi-Document Support

The system supports linking multiple documents to a single requirement:
- First link is marked as `isPrimary = true` and triggers "fulfilled" status
- Additional links are secondary
- When primary removed, oldest remaining is promoted
- Item reverts to "missing" only when ALL documents removed

### Dynamic Checklist Inputs

Users can add custom requirements via:

1. **AI Assisted Mode:**
   - User describes requirements in natural language
   - `/api/knowledge-parse` extracts structured requirements
   - Supports "duplicate" requests (e.g., "Duplicate KYC for Dubai office")
   - Creates items with `customSource: 'llm'`

2. **Manual Entry Mode:**
   - Direct form input for name, category, description, priority
   - Creates items with `customSource: 'manual'`

---

## AI/Model Integration

### Primary Model

**Model:** `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8`
**Provider:** Together AI
**Context Window:** 1M tokens (currently using <50k)

### Temperature Configuration by Task

| Task | Temperature | Max Tokens | Purpose |
|------|-------------|------------|---------|
| Extraction | 0.2 | 65,000 | Low for consistency |
| Normalization | 0.1 | 65,000 | Very low for precision |
| Verification | 0.1 | 65,000 | Very low for accuracy |
| Analysis | 0.3 | 8,000 | Moderate for flexibility |
| Codification | 0.3 | 32,000 | Balanced |
| Chat | 0.7 | 4,000 | Higher for conversational variety |

### Multi-Stage Extraction Pipeline

For spreadsheet extraction, the system uses a **3-pass verification pipeline**:

```
Raw Content
     │
     ▼
┌─────────────────────────────────────┐
│ Pass 1: Data Extraction             │
│ - Extract costs, plots, revenue     │
│ - Currency normalization            │
│ - Exclude subtotals                 │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Pass 2: Data Normalization          │
│ - Remove duplicates and subtotals   │
│ - Validate category assignments     │
│ - Separate revenue from costs       │
│ - Mathematical validation           │
└─────────────┬───────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Pass 3: Data Verification           │
│ - Validate against source           │
│ - Ensure totals match               │
│ - Add missing items if found        │
│ - Preserve exact cost names         │
└─────────────────────────────────────┘
```

### Prompt Engineering Quality

**Strengths:**
- Domain-specific real estate financing terminology embedded
- Clear JSON response formats with examples
- Multiple levels of emphasis for critical instructions
- Custom instructions have "ABSOLUTE PRIORITY" override
- Confidence scoring built into outputs

**Areas for Improvement:**
- Some prompts are verbose and could be condensed
- Limited few-shot learning in some endpoints
- No explicit prompt versioning or A/B testing
- Chain-of-thought reasoning could be more structured

---

## Identified Gaps & Issues

### High Priority

| # | Gap | Impact | Affected System |
|---|-----|--------|-----------------|
| 1 | **Text truncation at 8000 chars** | Long documents (contracts, financial models) lose critical context | Filing |
| 2 | **No semantic deduplication** | Pattern matching only - actual content duplicates not detected | Filing |
| 3 | **Intelligence not used in filing context** | AI classifies without knowing client history or intelligence | Filing + Intelligence |
| 4 | **Checklist matching is surface-level** | Only text matching, no semantic similarity | Checklist |
| 5 | **No extraction pipeline in bulk workflow** | Can't batch-enable extraction before filing | Filing |

### Medium Priority

| # | Gap | Impact | Affected System |
|---|-----|--------|-----------------|
| 6 | **Folder mapping hardcoded** | Requires code change to update mappings | Filing |
| 7 | **Version type selection required** | UX friction for duplicates | Filing |
| 8 | **Confidence score not validated** | Model may be overconfident | Filing + Checklist |
| 9 | **Limited error messaging** | Users don't know why classification failed | Filing |
| 10 | **No document preview in review** | Can't see full content during review | Filing |

### Low Priority

| # | Gap | Impact | Affected System |
|---|-----|--------|-----------------|
| 11 | **Legacy .doc files rejected** | Some users still use legacy Word format | Filing |
| 12 | **No parallel processing** | Sequential processing slow for large batches | Filing |
| 13 | **No rate limiting** | Could exceed Together.ai rate limits | All |
| 14 | **Status auto-cleanup missing** | No automatic cleanup if documents deleted | Checklist |
| 15 | **Primary document not user-controllable** | Only first link is primary | Checklist |

### Cross-System Integration Gaps

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CURRENT STATE (Disconnected)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Filing ──────X────── Intelligence ──────X────── Checklist              │
│    │                       │                        │                    │
│    │ No intelligence       │ No filing             │ Surface-level       │
│    │ context passed        │ integration           │ matching only       │
│    │                       │                        │                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    DESIRED STATE (Integrated)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Filing ◄─────►  Intelligence ◄─────►  Checklist                        │
│    │                 │                     │                             │
│    │ Uses client     │ Auto-updates        │ Semantic matching           │
│    │ intelligence    │ from filings        │ with embeddings             │
│    │ for context     │                     │                             │
│    │                 │                     │                             │
│    └─────────────────┴─────────────────────┘                             │
│              Shared context layer                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Root Cause Analysis

*Mapping user-reported problems to technical root causes*

### Problem → Root Cause Matrix

| User Problem | Technical Root Cause | Why It Happens |
|-------------|---------------------|----------------|
| **Filing misclassifies type** | 8000 char truncation + no client context | Model can't see enough document or understand client patterns |
| **Filing picks wrong folder** | Hardcoded CATEGORY_TO_FOLDER mapping | Mapping doesn't match actual folder templates; no validation |
| **Checklist matching fails** | Text-only matching, no semantics | "ProofOfAddress" ≠ "Proof of Address" to the model |
| **Intelligence feels stale** | Manual-only updates | No auto-extraction from filed documents |
| **Intelligence feels like checklist** | Fixed schema with optional fields | Empty field = gap; no reasoning or confidence |

### Deep Dive: Why Filing Accuracy Fails

```
Document: "Valuation Report - 123 High Street - Final.pdf" (50 pages)

CURRENT FLOW:
1. Extract text → Get 200,000 characters
2. Truncate to 8,000 characters (FIRST 4%)
3. Send to model with:
   - File name ✓
   - Client name ✓
   - File type definitions ✓
   - Checklist items ✓
   - ❌ No client intelligence
   - ❌ No historical patterns
   - ❌ No actual folder list

4. Model sees only introduction + table of contents
5. Classifies as "Report" (generic) → "background" folder
6. WRONG: Should be "Valuation Report" → "appraisals" folder

WHY IT FAILED:
- Truncation cut off the actual valuation content
- Model didn't know this client usually files valuations to "appraisals"
- No verification that "background" folder even exists
```

### Deep Dive: Why Checklist Matching Fails

```
Document: "Smith_ID_Passport_Scan.pdf"
Checklist Item: "Certified Proof of ID"

CURRENT FLOW:
1. Model receives checklist as:
   "[abc123] Certified Proof of ID (KYC) - missing"
2. Model receives document text:
   "UNITED KINGDOM PASSPORT... SMITH, JOHN..."
3. Model must match text "Certified Proof of ID" to passport content

4. Model returns: NO MATCH (confidence 0.4)

WHY IT FAILED:
- No semantic understanding that passport = proof of ID
- Checklist item doesn't include matchingDocumentTypes
- Model doesn't know "passport" fulfills "Proof of ID"
- Confidence threshold (0.7) rejects uncertain matches
```

### Deep Dive: Why Intelligence Feels Stale

```
CURRENT FLOW:
- User creates client
- Intelligence record created (empty)
- User files 50 documents over 6 months
- Intelligence still empty (no auto-extraction)
- User must manually open modal + paste text

RESULT:
- Intelligence shows blank fields
- Feels like "checklist with gaps"
- No value being delivered

DESIRED FLOW:
- User creates client → Intelligence initialized
- User files document → Intelligence Agent extracts data
- Each filing enriches intelligence incrementally
- Intelligence shows populated, sourced, confident data
```

---

## Expected Behavior Analysis

### Filing System Expected Behavior

**Current:**
1. User selects client/project and uploads files
2. System extracts text and sends to AI with file type definitions
3. AI classifies document with category, type, and confidence
4. User reviews and can edit classifications
5. Filing creates document record and optional checklist links

**Expected (Ideal):**
1. User selects client/project and uploads files
2. System extracts full text (no truncation) or summarizes intelligently
3. AI receives:
   - File type definitions
   - **Client intelligence profile** (lender/borrower context)
   - **Similar documents previously filed** for this client
   - **Project-specific context** (deal type, phase, existing documents)
   - Checklist requirements with semantic matching
4. AI provides:
   - High-confidence classification with reasoning
   - Duplicate detection with content similarity score
   - Auto-suggested version type based on content diff
   - Extraction preview for spreadsheets
5. User reviews with document preview and diff view for duplicates
6. Filing updates both document library and intelligence (if applicable)

### Intelligence System Expected Behavior

**Current:**
1. Intelligence initialized when client/project created
2. User manually adds intelligence via modal
3. AI extracts structured data from text/documents
4. Data library syncs to intelligence aggregates

**Expected (Ideal):**
1. Intelligence initialized with onboarding wizard
2. **Auto-extraction enabled on all document filings**
3. AI extracts and **merges incrementally** (not overwriting)
4. Field-level confidence tracking and source attribution
5. Relationship intelligence (who knows whom, deal history)
6. **Proactive intelligence suggestions** ("Based on this document, should we update X?")

### Checklist System Expected Behavior

**Current:**
1. Checklist initialized from templates
2. During filing, AI suggests checklist matches
3. User confirms/rejects matches
4. Documents linked to requirements

**Expected (Ideal):**
1. Checklist initialized with smart template selection
2. **Semantic matching** using document embeddings
3. **Auto-linking** for high-confidence matches (>90%)
4. **Partial fulfillment** tracking (e.g., "Draft received, awaiting final")
5. **Expiration tracking** (e.g., "Bank statement older than 3 months")
6. **Dependency awareness** (e.g., "Valuation requires completed development appraisal")

---

## Revised Recommendations

*Updated based on user-reported operational problems*

### Priority 1: Fix Filing Accuracy (Critical) ✅ IMPLEMENTED

**Goal:** Documents classified correctly for type AND folder placement

| # | Change | Implementation | Impact | Status |
|---|--------|----------------|--------|--------|
| 1.1 | **Increase text limit** | Change 8000 → 32000 chars in bulk-analyze | More context = better classification | ✅ Done |
| 1.2 | **Smart summarization for long docs** | If >40k chars, AI summarizes first; 32-40k truncated | Don't lose critical content | ✅ Done |
| 1.3 | **Add classification verification agent** | Second pass `verifyClassification()` validates type + folder | Catch misclassifications | ✅ Done |
| 1.4 | **Dynamic folder lookup** | Query actual client folders from `api.clients.getClientFolders` | Ensure folder exists | ✅ Done |
| 1.5 | **Add client intelligence to context** | Pass client name, type, legal name, recent doc types, preferred folders | Model "knows" the client | ✅ Done |
| 1.6 | **Add confidence threshold for auto-file** | High (≥0.85) = auto-OK, Medium (≥0.65) = review, Low (<0.65) = flag | Prevent low-confidence errors | ✅ Done |

**Implementation Location:** [bulk-analyze/route.ts](src/app/api/bulk-analyze/route.ts)

**Proposed Multi-Agent Filing Pipeline:**

```
Document Upload
      │
      ▼
┌─────────────────────────────────────────┐
│ AGENT 1: Classification                  │
│ Context:                                 │
│ - Full text (or smart summary)           │
│ - Client intelligence profile            │
│ - Historical filing patterns             │
│ - Actual folder structure (from DB)      │
│ - File type definitions                  │
│ Output: type, category, folder, conf     │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ AGENT 2: Verification                    │
│ Input: Classification + document         │
│ Checks:                                  │
│ - Does folder exist?                     │
│ - Does type match content?               │
│ - Is this a duplicate?                   │
│ - Does confidence justify auto-file?     │
│ Output: verified classification OR flag  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
         Classification Result
```

---

### Priority 2: Fix Checklist Matching (Critical) ✅ IMPLEMENTED

**Goal:** Clearly labeled documents should ALWAYS match their checklist items

| # | Change | Implementation | Impact | Status |
|---|--------|----------------|--------|--------|
| 2.1 | **Add matchingDocumentTypes to prompt** | Templates already have it; now shown in prompt with "Matches:" hints | "passport" matches "Proof of ID" | ✅ Done |
| 2.2 | **Semantic matching via descriptions** | Item descriptions shown as "Purpose:" in prompt; richer instructions | Better understanding | ✅ Done |
| 2.3 | **Lower confidence threshold** | Final filter now at 0.50 (was implicit 0.7+) | Don't reject obvious matches | ✅ Done |
| 2.4 | **Filename pattern matching** | `checkFilenamePatterns()` runs BEFORE AI with pattern aliases | Quick wins for labeled files | ✅ Done |
| 2.5 | **Dedicated checklist matching agent** | `runChecklistMatchingAgent()` as second pass when initial matching weak | Better specialized results | ✅ Done |

**Implementation Details:**
- `checkFilenamePatterns()` - Pre-check function with pattern aliases (e.g., "poa" → Proof of Address)
- `runChecklistMatchingAgent()` - Dedicated second-pass agent when initial matches are weak
- Filename hints shown to AI with ⚡ indicator and pre-computed scores
- Matching philosophy changed to "be generous" with lower thresholds
- AI prompt now emphasizes semantic understanding via descriptions

**Implementation Location:** [bulk-analyze/route.ts](src/app/api/bulk-analyze/route.ts)

**Enhanced Checklist Context:**

```typescript
// CURRENT (insufficient)
"[abc123] Certified Proof of ID (KYC) - missing"

// PROPOSED (rich context)
{
  id: "abc123",
  name: "Certified Proof of ID",
  category: "KYC",
  status: "missing",
  description: "Government-issued photo identification document",
  matchingTypes: ["passport", "driving license", "national ID card", "photo ID"],
  examples: ["UK Passport", "EU ID Card", "US Driver License"],
  keywords: ["ID", "identification", "passport", "license", "identity"]
}
```

---

### Priority 3: Revitalize Intelligence System (High) ✅ IMPLEMENTED

**Goal:** Intelligence should be automatically enriched from every filing, not feel like a checklist with gaps

| # | Change | Implementation | Impact | Status |
|---|--------|----------------|--------|--------|
| 3.1 | **Add Intelligence Extraction Agent** | `intelligenceExtractionJobs` queue + `/api/process-extraction-queue` | Auto-populate intel | ✅ Done |
| 3.2 | **Incremental merge, not overwrite** | `mergeExtractedIntelligence` mutation with confidence-based merge | Build knowledge over time | ✅ Done |
| 3.3 | **Add confidence + source tracking** | Schema updated with `evidenceTrail` array | Trust and verification | ✅ Done |
| 3.4 | **Add flexible attributes system** | Schema updated with `extractedAttributes` array | Client-specific data | ✅ Done |
| 3.5 | **Add insights/reasoning layer** | Schema updated with `aiInsights` object | Intelligence feels "alive" | ✅ Done |
| 3.6 | **Schema evolution** | Full schema update in `convex/schema.ts` | Support dynamic profiles | ✅ Done |

**Implementation Details:**
- **Extraction Jobs Queue**: Background processing via `intelligenceExtractionJobs` table
- **Merge Logic**: Confidence-based decisions (higher confidence wins, conflicts flagged)
- **Evidence Trail**: Each field tracks source document, extraction timestamp, confidence
- **Wired into Filing Pipeline**: Automatically triggers after document filing
- **Test Coverage**: 48 tests for intelligence system (all passing)

**Intelligence Extraction Flow (Implemented):**

```
Document Filed
      │
      ▼
┌─────────────────────────────────────────┐
│ intelligenceExtractionJobs (Queue)       │
│ - Created after document filing          │
│ - Background processing                  │
│ - Retry support with max attempts        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ /api/process-extraction-queue            │
│ - Fetches pending jobs                   │
│ - Runs extraction pipeline               │
│ - Calls mergeExtractedIntelligence       │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ mergeExtractedIntelligence               │
│                                          │
│ For each extracted field:                │
│ - If empty in intel → ADD                │
│ - If same value → SKIP                   │
│ - If different + higher conf → UPDATE    │
│ - If different + lower conf → FLAG       │
│                                          │
│ Updates evidenceTrail with source        │
└─────────────────────────────────────────┘
```

---

### Priority 4: Ensure Folder Structure Integrity (Medium) 🟡 PARTIAL

**Goal:** New client = correct folders + checklist + empty intelligence ready to fill

| # | Change | Implementation | Impact | Status |
|---|--------|----------------|--------|--------|
| 4.1 | **Validate folder creation on client create** | Post-creation validation hook | Ensure all folders exist | ⚠️ Needs verification |
| 4.2 | **Sync filing agent with folder templates** | Dynamic folder lookup via `getClientFolders` | Folders always match | ✅ Done (via P1.4) |
| 4.3 | **Add folder validation before filing** | Check folder exists before committing | Prevent orphaned docs | ✅ Done (via P1.4) |
| 4.4 | **Add client onboarding checklist** | Track what's set up vs. missing | Clear visibility | ❌ Not started |

**Remaining Work:**

1. **4.1 - Folder Creation Validation**
   - Add post-creation hook in `clients.create()` to verify all template folders were created
   - Log warning if folder count doesn't match template
   - Auto-repair missing folders

2. **4.4 - Client Onboarding Checklist** (New Feature)
   - Add `onboardingStatus` field to client schema
   - Track: folders ready, checklist initialized, intelligence created, first document filed
   - Show onboarding progress on client dashboard
   - Alert for incomplete setup

**New Client Creation Flow:**

```
Client Created
      │
      ├──► Folder Template Applied
      │         └── All folders created ✓
      │
      ├──► Checklist Template Applied
      │         └── All requirements created ✓
      │
      ├──► Intelligence Record Created
      │         └── Empty but ready ✓
      │
      └──► Onboarding Status Set
                └── "folders: ready, checklist: ready, intel: empty"
```

---

### Priority 5: Build Multi-Agent Pipeline (Strategic) ❌ NOT STARTED

**Goal:** Transform from single-pass classification to robust multi-agent pipeline

**Current State:** Enhanced single-pass with verification agent (implemented in P1.3)

**Decision Required:** Full multi-agent vs. current enhanced single-pass
- Current approach handles most cases well
- Multi-agent adds latency and cost
- Consider implementing only for low-confidence cases

**Proposed Architecture (If Implemented):**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FILING AGENT GAUNTLET                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Document Upload                                                     │
│        │                                                             │
│        ▼                                                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 1: PRE-PROCESSING                                       │   │
│  │ - Extract full text                                           │   │
│  │ - If >32k chars, create smart summary                         │   │
│  │ - Extract filename patterns                                   │   │
│  │ - Check for obvious duplicates (hash)                         │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 2: CLASSIFICATION AGENT                                 │   │
│  │ Context: text + client intel + folder structure + history     │   │
│  │ Output: type, category, folder, confidence                    │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 3: CHECKLIST MATCHING AGENT                             │   │
│  │ Context: doc content + rich checklist items + descriptions    │   │
│  │ Output: matched items with confidence                         │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 4: INTELLIGENCE EXTRACTION AGENT                        │   │
│  │ Context: doc content + current intel + document type          │   │
│  │ Output: extracted fields + confidence + merge instructions    │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ STAGE 5: VERIFICATION AGENT (optional, for low confidence)    │   │
│  │ Input: all previous outputs                                   │   │
│  │ Output: verified results OR flags for human review            │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│                              ▼                                       │
│  FILING RESULT                                                       │
│  - Document filed to correct folder                                  │
│  - Checklist items linked                                            │
│  - Intelligence updated                                              │
│  - All changes tracked with sources                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Priority 6: Expand Document Type Taxonomy (High) ❌ NOT STARTED

**Goal:** Ensure every document gets a specific type, not just category/folder

**Problem Identified:** Documents are being classified correctly for category and folder, but the specific `fileType` field is often left empty. This indicates the taxonomy is missing common document types.

**Current Taxonomy Coverage:** 30 document types across 9 categories

**Missing Document Types Identified:**

| Category | Missing Types | Description |
|----------|---------------|-------------|
| **KYC** | Proof of ID (generic) | Catch-all for ID docs that aren't passport/license |
| **KYC** | Proof of Address (generic) | Catch-all for address docs that aren't utility bills |
| **KYC** | Track Record | Developer CV/experience document |
| **KYC** | Company Search | Companies House searches |
| **KYC** | Certificate of Incorporation | Company formation documents |
| **Professional Reports** | Building Survey | Structural surveys, condition reports |
| **Professional Reports** | Report on Title | Solicitor's title report |
| **Professional Reports** | Legal Opinion | Legal advice letters |
| **Professional Reports** | Environmental Search | Phase 1/2 environmental reports |
| **Professional Reports** | Local Authority Search | Council searches |
| **Legal Documents** | Building Contract | JCT, construction contracts |
| **Legal Documents** | Professional Appointment | Architect/QS appointments |
| **Legal Documents** | Collateral Warranty | Third party warranties |
| **Legal Documents** | Title Deed | Land Registry documents |
| **Legal Documents** | Lease | Tenancy agreements |
| **Project Documents** | Specification | Construction specifications |
| **Project Documents** | Tender | Contractor tenders |
| **Project Documents** | CGI/Renders | Marketing visuals |
| **Financial Documents** | Invoice | Contractor/professional invoices |
| **Financial Documents** | Receipt | Payment receipts |
| **Financial Documents** | Tax Return | Personal/company tax documents |
| **Insurance** | Insurance Policy | Building, PI, contractor insurance |
| **Insurance** | Insurance Certificate | Certificates of insurance |
| **Communications** | Email/Correspondence | Email threads, letters |
| **Communications** | Meeting Minutes | Meeting notes, board minutes |
| **Warranties** | NHBC Warranty | Building warranties |
| **Warranties** | Latent Defects Insurance | LDI policies |
| **Photographs** | Site Photographs | Progress photos, site images |

**Implementation Plan:**

| # | Task | Implementation | Impact |
|---|------|----------------|--------|
| 6.1 | **Add missing types to seed migration** | Update `seedFileTypeDefinitions.ts` with ~25 new types | Better coverage |
| 6.2 | **Add "Other" fallback behavior** | If no type matches but category does, use "Other - {Category}" | No empty types |
| 6.3 | **Update filename patterns** | Add patterns for new types in `bulk-analyze/route.ts` | Better detection |
| 6.4 | **Add Insurance category** | New category for insurance documents | Better organization |
| 6.5 | **Add Communications category** | New category for correspondence | Better organization |
| 6.6 | **Add Warranties category** | New category for warranties/guarantees | Better organization |
| 6.7 | **Run sync migration** | Use `syncDefinitions` to add new types to existing databases | Live update |

**Type Selection Fallback Logic:**

```
Document Content Analysis
         │
         ▼
┌────────────────────────────────┐
│ Attempt Specific Type Match    │
│ (30+ defined types)            │
└────────────┬───────────────────┘
             │
       Type Found?
       /         \
     Yes          No
      │            │
      ▼            ▼
┌──────────┐ ┌────────────────────────────┐
│ Use Type │ │ Category + Folder Found?   │
└──────────┘ └────────────┬───────────────┘
                         │
                   Yes   │   No
                    │    │    │
                    ▼    ▼    ▼
             ┌──────────────────────┐
             │ Use "Other - {Cat}"  │
             │ or "General Document"│
             └──────────────────────┘
```

---

### Priority 7: Test Suite & Validation (Medium) ✅ IMPLEMENTED

**Goal:** Comprehensive test coverage for filing system

**Completed:**
- **154 tests passing** across 6 test files
- Classification tests (51 tests) - filename pattern detection
- Edge case tests (28 tests) - ambiguous filenames, batch processing
- Content-to-filing tests (27 tests) - summary → type → category → folder → checklist
- Intelligence tests (48 tests) - extraction, merge, confidence

**Test Coverage Results:**
- Document Type Coverage: 100% (18/18 tested types have patterns)
- Batch Detection Rate: 85% (17/20 realistic files detected)
- Content-to-Filing Accuracy: 100% (20/20 documents correctly classified)

---

### Implementation Phases - Updated Status

**Phase 1: Quick Fixes** ✅ COMPLETE
- ✅ Increase text limit to 32k
- ✅ Add filename pattern matching for checklist
- ✅ Lower confidence threshold for obvious matches
- ✅ Add folder validation before filing

**Phase 2: Enhanced Context** ✅ COMPLETE
- ✅ Replace hardcoded folder mapping with DB lookup
- ✅ Add client intelligence to classification context
- ✅ Enrich checklist items with descriptions/keywords
- ✅ Add smart summarization for long documents

**Phase 3: Intelligence Evolution** ✅ COMPLETE
- ✅ Update schema for confidence/source tracking
- ✅ Add flexible attributes system
- ✅ Build incremental merge logic
- ✅ Add insights/reasoning generation

**Phase 4: Type Taxonomy Expansion** ❌ NOT STARTED
- Add ~25 missing document types
- Add fallback "Other - {Category}" behavior
- Add Insurance, Communications, Warranties categories
- Update filename patterns for new types

**Phase 5: Multi-Agent Pipeline** ❌ NOT STARTED (Decision Required)
- Evaluate whether current single-pass is sufficient
- If needed: Build Classification Agent with verification
- If needed: Build Checklist Matching Agent (separate from classification)
- Consider only for low-confidence cases

---

## File Reference

### Filing System
| File | Lines | Purpose |
|------|-------|---------|
| [src/app/filing/page.tsx](src/app/filing/page.tsx) | ~100 | Filing entry point |
| [src/components/BulkUpload.tsx](src/components/BulkUpload.tsx) | ~500 | Upload component |
| [src/lib/bulkQueueProcessor.ts](src/lib/bulkQueueProcessor.ts) | ~300 | Queue orchestration |
| [src/lib/fileProcessor.ts](src/lib/fileProcessor.ts) | ~200 | Text extraction |
| [src/app/api/bulk-analyze/route.ts](src/app/api/bulk-analyze/route.ts) | ~250 | Classification API |
| [convex/bulkUpload.ts](convex/bulkUpload.ts) | ~700 | Database mutations |
| [convex/documents.ts](convex/documents.ts) | ~500 | Document management |

### Intelligence System
| File | Lines | Purpose |
|------|-------|---------|
| [convex/intelligence.ts](convex/intelligence.ts) | ~1200 | Intelligence functions |
| [src/app/api/intelligence-extract/route.ts](src/app/api/intelligence-extract/route.ts) | ~286 | Extraction API |
| [src/components/AddIntelligenceModal.tsx](src/components/AddIntelligenceModal.tsx) | ~328 | Add intelligence UI |
| [src/components/IntelligenceTab.tsx](src/components/IntelligenceTab.tsx) | ~2191 | Intelligence display |

### Checklist System
| File | Lines | Purpose |
|------|-------|---------|
| [convex/knowledgeLibrary.ts](convex/knowledgeLibrary.ts) | ~1122 | Checklist functions |
| [src/app/clients/[clientId]/components/KnowledgeChecklistPanel.tsx](src/app/clients/[clientId]/components/KnowledgeChecklistPanel.tsx) | ~626 | Checklist panel |
| [src/app/clients/[clientId]/components/MissingDocumentsCard.tsx](src/app/clients/[clientId]/components/MissingDocumentsCard.tsx) | ~233 | Missing docs display |
| [src/app/clients/[clientId]/components/DynamicChecklistInput.tsx](src/app/clients/[clientId]/components/DynamicChecklistInput.tsx) | ~378 | Dynamic inputs |
| [src/app/api/knowledge-parse/route.ts](src/app/api/knowledge-parse/route.ts) | ~150 | Requirement parsing |
| [convex/migrations/seedKnowledgeTemplates.ts](convex/migrations/seedKnowledgeTemplates.ts) | ~313 | Template seeding |

### AI Integration
| File | Lines | Purpose |
|------|-------|---------|
| [src/lib/togetherAI.ts](src/lib/togetherAI.ts) | ~400 | Core AI functions |
| [src/lib/modelConfig.ts](src/lib/modelConfig.ts) | ~50 | Model configuration |
| [src/app/api/chat-assistant/route.ts](src/app/api/chat-assistant/route.ts) | ~800 | Chat with context |
| [src/lib/fastPassCodification.ts](src/lib/fastPassCodification.ts) | ~300 | Dictionary matching |
| [src/app/api/bulk-extract/route.ts](src/app/api/bulk-extract/route.ts) | ~400 | Full extraction |

### Folder Structure
| File | Lines | Purpose |
|------|-------|---------|
| [convex/folderTemplates.ts](convex/folderTemplates.ts) | ~200 | Template CRUD |
| [convex/folderStructure.ts](convex/folderStructure.ts) | ~150 | Folder utilities |
| [convex/placementRules.ts](convex/placementRules.ts) | ~100 | Filing rules |
| [convex/migrations/seedFolderTemplates.ts](convex/migrations/seedFolderTemplates.ts) | ~150 | Template seeding |

---

## Test Findings & Observations (January 2026)

### Test Suite Summary

**154 tests passing** across 6 test files:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `intelligence.test.ts` | 48 | Intelligence extraction, merge, confidence |
| `classification.test.ts` | 51 | Filename patterns, checklist matching |
| `classification-edge-cases.test.ts` | 28 | Ambiguous files, batch processing |
| `classification-content.test.ts` | 27 | Content → type → folder → checklist |

### Key Metrics

| Metric | Result | Target |
|--------|--------|--------|
| Document Type Coverage | 100% (18/18) | 100% |
| Batch Detection Rate | 85% (17/20) | 90% |
| Content-to-Filing Accuracy | 100% (20/20) | 95% |
| Checklist Coverage | 100% (18/18) | 100% |

### Issues Identified

**1. Type Field Empty Despite Correct Category/Folder**

**Symptom:** Documents get correct category and folder but `fileType` is empty.

**Root Cause:** Taxonomy gaps - documents don't match any of the 30 defined types.

**Examples of unmatched documents:**
- Generic correspondence/emails
- Company searches and certificates
- Building surveys (not valuations)
- Invoices and receipts
- Insurance documents
- Warranties and guarantees

**Fix:** Priority 6 - Expand Type Taxonomy with ~25 additional types

---

**2. Bank Statements with Bank Name Prefix**

**Symptom:** `HSBC_Business_Statement_Dec2024.pdf` wasn't detected.

**Root Cause:** Pattern required "bank statement" but file had "business statement".

**Fix Applied:** Added patterns for `business statement`, `personal statement`, `account statement`, `current account`.

**Status:** ✅ Fixed - now 85% batch detection rate

---

**3. Planning Documents Missed**

**Symptom:** `Planning_Decision_Notice.pdf` wasn't detected.

**Root Cause:** No pattern for "decision notice" variant.

**Fix Applied:** Added patterns for `planning decision`, `planning permission`, `decision notice`, `planning notice`, `planning approval`.

**Status:** ✅ Fixed

---

**4. URL-Encoded Filenames**

**Symptom:** `Bank%20Statement.pdf` not detected as Bank Statement.

**Root Cause:** `%20` becomes "20" not space after character normalization.

**Fix:** Known limitation - URL decoding should happen before classification (upstream fix needed).

**Status:** ⚠️ Documented limitation

---

**5. Generic "terms" False Positive**

**Symptom:** `terms_and_conditions.pdf` was matching as Term Sheet.

**Root Cause:** Generic "terms" pattern too broad.

**Fix Applied:** Removed generic "terms" pattern, kept specific: `term sheet`, `indicative terms`, `credit backed terms`.

**Status:** ✅ Fixed

---

### Recommendations from Testing

1. **Priority 6 is Critical** - The empty type field issue will persist until taxonomy is expanded
2. **Add URL Decoding** - Add `decodeURIComponent()` before filename normalization
3. **Consider "Learning" Mode** - Track documents that get no type match to inform taxonomy expansion
4. **Add Monitoring** - Track classification accuracy in production to catch new edge cases

---

## Adversarial Test Results (January 22, 2026)

### Test Summary

**60 tests total: 54 passed, 6 failed**

The adversarial tests intentionally stress-test the classification system with edge cases, false positive traps, and boundary conditions. A 90% pass rate indicates reasonable robustness, but the 6 failures reveal real vulnerabilities.

### ✅ What Works Well

| Test Category | Result | Notes |
|---------------|--------|-------|
| Generic filenames rejected | ✅ All pass | Document.pdf, Scan_001.pdf, etc. correctly return null |
| Scanner-generated files | ✅ All pass | HP_Scan_001.pdf, CamScanner_*.pdf not matched |
| Ambiguous filenames | ✅ All pass | Report_Final.pdf, Agreement_Signed.pdf correctly return null |
| Valuation vs Appraisal distinction | ✅ Pass | Different types detected correctly |
| Share Charge vs Shareholders Agreement | ✅ Pass | Fixed pattern ordering prevents confusion |
| Keyword position (start/middle/end) | ✅ All pass | Passport_John.pdf = John_Passport.pdf = John_Passport_Smith.pdf |
| Empty/edge case filenames | ✅ All pass | Empty string, very long names handled safely |
| Historical bugs (regressions) | ✅ Most pass | HSBC_Business_Statement works, terms_and_conditions doesn't match Term Sheet |

### ❌ Vulnerabilities Discovered (6 Failures)

| # | Filename | Incorrectly Matched As | Root Cause |
|---|----------|------------------------|------------|
| 1 | `software_license_key.txt` | Driving License | "license" substring match |
| 2 | `passport_photo_background.jpg` | Passport | "passport" substring match |
| 3 | `floor_plan_discussion_notes.docx` | Floor Plans | "floor plan" substring match |
| 4 | `invoice_template.docx` | Invoice | "invoice" substring match |
| 5 | `driving_directions.pdf` | Driving License | "driving" substring match |
| 6 | `valuation_methodology_guide.pdf` | RedBook Valuation | "valuation" substring match |

### Root Cause Analysis

**Core Problem:** Simple substring matching (`includes()`) without context awareness.

```javascript
// Current approach (vulnerable)
if (fileNameLower.includes('passport')) {
  return { fileType: 'Passport', ... };  // MATCHES "passport_photo_background.jpg"!
}

// Better approach (context-aware)
const shouldExclude = ['photo', 'background', 'template', 'guide', 'directions'].some(
  exclude => fileNameLower.includes(exclude)
);
if (fileNameLower.includes('passport') && !shouldExclude) {
  return { fileType: 'Passport', ... };
}
```

### Recommended Fixes

**Option A: Negative Context Patterns (Quick Fix)**
Add exclusion lists for each keyword pattern:
```javascript
{
  keywords: ['passport'],
  excludeIf: ['photo', 'background', 'template', 'guide'],
  fileType: 'Passport'
}
```

**Option B: Word Boundary Matching (Better)**
Use regex with word boundaries:
```javascript
const regex = /\bpassport\b/i;
if (regex.test(filename)) { ... }  // Won't match "passportphoto"
```

**Option C: Content-Based Verification (Best)**
For edge cases, require content analysis to confirm filename hints:
- Filename suggests "Passport" → Check if content contains passport-specific terms
- If both align → High confidence
- If mismatch → Flag for review

### Quality Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| **Types with keywords** | 63/64 (98%) | Excellent coverage |
| **Types with 3+ keywords** | 62/63 (98%) | Strong detection |
| **Weak detection types** | Term Sheet (2 keywords) | Needs more keywords |
| **False positive rate** | 6/60 (10%) | Acceptable but fixable |
| **Substring vulnerability** | 6 patterns affected | Needs negative context |

### Console Output Observations

```
Accented filename "Société_Bank_Statement.pdf": Bank Statement ✅
Accented filename "Garantía_Personal.pdf": no match ⚠️
Accented filename "Déclaration_fiscale.pdf": no match ⚠️
"passportphoto.jpg" matches: Passport ❌ (false positive)
```

**Note:** Accented characters work when keyword is in ASCII (e.g., "Bank Statement"), but foreign-language documents need dedicated patterns or transliteration.

---

## Next Steps

### Completed (as of January 22, 2026)
- ✅ Priority 1: Filing Accuracy - All items implemented
- ✅ Priority 2: Checklist Matching - All items implemented
- ✅ Priority 3: Intelligence System - All items implemented
- ✅ Priority 7: Test Suite - 154 tests passing

### In Progress
- 🟡 Priority 4: Folder Structure - 2/4 items done (via P1)

### Recommended Next Actions

**Immediate (This Week):**
1. **Priority 6: Expand Type Taxonomy** - Critical for fixing empty type field issue
   - Add ~25 missing document types
   - Add "Other - {Category}" fallback behavior
   - Run sync migration to update existing databases

**Short Term (Next 2 Weeks):**
2. **Priority 4: Complete Folder Structure**
   - Add folder creation validation hook
   - Add client onboarding status tracking

**Decision Required:**
3. **Priority 5: Multi-Agent Pipeline**
   - Current single-pass handles most cases well
   - Consider only implementing for low-confidence cases
   - Evaluate cost/latency tradeoffs

### Key Decisions Needed
1. **Type Taxonomy**: Should we add all ~25 types at once or incrementally?
2. **Fallback Behavior**: Use "Other - {Category}" or "General Document"?
3. **Multi-Agent**: Full pipeline or only for edge cases?
4. **URL Decoding**: Fix upstream in queue processor or in analysis route?

### Success Metrics - Current Status

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Filing accuracy (type + folder) | >90% | ~75%* | 🔴 Needs P6 |
| Checklist matching (labeled docs) | >95% | 100% | 🟢 Met |
| Intelligence auto-population | >50% fields | In progress | 🟡 Monitoring |
| Test coverage | >150 tests | 154 tests | 🟢 Met |

*Type accuracy affected by empty type field issue - folder accuracy is >90%

---

## Priority 8: Contact System Integration (Medium)

### Current State Analysis

**Schema:** `convex/schema.ts` (lines 274-309)

The contacts table has a flexible linking model:
- `clientId` - Links contact to a client
- `projectId` - Links contact to a project
- `sourceDocumentId` - Document that provided this contact
- `linkedCompanyIds` / `linkedDealIds` - Multi-entity associations

**Gap Identified:** No automated contact extraction during document upload.

### Contact System Issues

| # | Issue | Impact | Severity |
|---|-------|--------|----------|
| 8.1 | **No automated contact extraction** | Contacts must be manually created | High |
| 8.2 | **sourceDocumentId never populated** | Can't trace where contact info came from | Medium |
| 8.3 | **No contact extraction pipeline** | Unlike intelligence, no extraction queue | High |
| 8.4 | **UI shows single company field** | Schema supports multi-company but UI doesn't | Low |

### Implementation Plan

| # | Task | Implementation | Status |
|---|------|----------------|--------|
| 8.1 | **Add contact extraction to intelligence pipeline** | Extend extraction to pull contacts | ❌ Not started |
| 8.2 | **Create contact extraction jobs** | Add `contactExtractionJobs` table | ❌ Not started |
| 8.3 | **Link contacts to source documents** | Populate `sourceDocumentId` on extraction | ❌ Not started |
| 8.4 | **Add contact deduplication** | Match by email, then name when merging | ❌ Not started |

### Contact Extraction Flow (Proposed)

```
Document Filed
      │
      ▼
┌─────────────────────────────────────────┐
│ Intelligence Extraction Agent           │
│ - Extract client/project intelligence   │
│ - Identify contact information          │
│   • Names, roles, emails, phones        │
│   • Company associations                │
│   • Decision maker indicators           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Contact Deduplication                    │
│ - Check by email (primary)              │
│ - Check by name (secondary)             │
│ - If match: Update existing contact     │
│ - If new: Create with sourceDocumentId  │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│ Link to Client/Project                   │
│ - Set clientId from document context    │
│ - Optionally set projectId              │
│ - Add to linkedCompanyIds if applicable │
└─────────────────────────────────────────┘
```

---

## Priority 9: Intelligence UI Redesign (High)

### Problem Statement

**User Feedback:** "The intelligence section feels like a bunch of boxes that are predetermined and may or may not be full of info. We need to show what intelligence we actually have within each category, and what we are still waiting for."

### Current UI Pattern Analysis

**Location:** `src/components/IntelligenceTab.tsx` (1244 lines)

**Current Pattern:**
```
┌─────────────────────────────────────────────────────────────┐
│ Basic Information                                            │
│ ┌─────────────────┬─────────────────┬─────────────────┐     │
│ │ [Legal Name   ] │ [Trading Name ] │ [Company No.  ] │     │
│ │ _______________ │ _______________ │ _______________ │     │
│ │ (empty)         │ (empty)         │ 12345678        │     │
│ └─────────────────┴─────────────────┴─────────────────┘     │
│ ┌─────────────────┬─────────────────┐                       │
│ │ [VAT Number   ] │ [Incorp Date  ] │                       │
│ │ _______________ │ _______________ │                       │
│ │ (empty)         │ (empty)         │                       │
│ └─────────────────┴─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

**Problems:**
1. Empty fields look the same as filled fields
2. No visual indication of completeness
3. No prioritization of important vs optional fields
4. No "what's missing" summary
5. No source/confidence indicators
6. Users must click through each tab to see status

### Proposed UI Pattern

**Design Principles:**
1. **Lead with what we know** - Show filled data prominently
2. **De-emphasize gaps** - Missing data shown as "needed" list, not empty boxes
3. **Progress at a glance** - Completeness indicators on sidebar
4. **Source attribution** - Show where data came from
5. **Smart prioritization** - Critical fields highlighted

### Sidebar Enhancement

**Current:**
```
│ 📋 Basic Info          │
│ 💳 Financial           │
│ 👥 Key People (3)      │
│ 💬 Meetings (2)        │
│ 📄 Documents (15)      │
```

**Proposed:**
```
│ 📋 Basic Info     ●●●○○ │  (3/5 fields)
│ 💳 Financial      ●○○○○ │  (1/5 fields)
│ 👥 Key People (3) ●●●●● │  (complete)
│ 💬 Meetings (2)   ●●○○○ │
│ 📄 Documents (15) ●●●●○ │
│ ─────────────────────── │
│ ⚠️ Missing Critical: 4   │
```

### Section Content Redesign

**Before (Box Pattern):**
```
┌─────────────────────────────────────┐
│ Company Identity                     │
│ ┌───────────┐ ┌───────────┐         │
│ │ Legal Name│ │Trading As │         │
│ │ _________ │ │ _________ │ (empty) │
│ └───────────┘ └───────────┘         │
└─────────────────────────────────────┘
```

**After (Known vs Unknown):**
```
┌─────────────────────────────────────────────────────────────┐
│ ✅ What We Know                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Legal Name      Acme Holdings Ltd                      📋 │
│ │                 Source: Bank Statement (Jan 2026)         │
│ │─────────────────────────────────────────────────────────│ │
│ │ Company Number  12345678                               📋 │
│ │                 Source: Certificate of Incorporation      │
│ │─────────────────────────────────────────────────────────│ │
│ │ Primary Contact John Smith (Director)                  📋 │
│ │                 john@acme.com • +44 7700 900123           │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ ⚠️ Still Needed                                              │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ • VAT Number                         [+ Add Manually]    │ │
│ │ • Trading Name (optional)            [+ Add Manually]    │ │
│ │ • Incorporation Date                 [+ Add Manually]    │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Component Architecture

**New Components Needed:**

1. **IntelligenceOverview** - Dashboard view showing all sections at a glance
2. **IntelligenceSection** - "Known vs Unknown" pattern for each category
3. **KnownDataCard** - Display filled field with source
4. **MissingDataList** - Compact list of missing fields with add buttons
5. **CompletenessIndicator** - Visual progress (dots, bar, or percentage)
6. **SourceBadge** - Show where data came from (document, manual, AI)

### Data Structure Enhancement

**Current Field Storage:**
```typescript
identity: {
  legalName: "Acme Holdings Ltd",
  companyNumber: "12345678",
  // No metadata
}
```

**Enhanced Field Storage (Using evidenceTrail):**
```typescript
identity: {
  legalName: "Acme Holdings Ltd",
  companyNumber: "12345678",
},
evidenceTrail: [
  {
    fieldPath: "identity.legalName",
    value: "Acme Holdings Ltd",
    source: "doc_bank_statement_123",
    sourceType: "document",
    extractedAt: "2026-01-20T10:30:00Z",
    confidence: 0.95
  },
  {
    fieldPath: "identity.companyNumber",
    value: "12345678",
    source: "manual",
    sourceType: "user",
    extractedAt: "2026-01-15T14:00:00Z",
    confidence: 1.0
  }
]
```

### Implementation Phases

**Phase 1: Sidebar Completeness Indicators**
- Add field counting per section
- Show visual progress dots/bars
- Add "missing critical" count

**Phase 2: Section Redesign**
- Convert from grid-of-boxes to "known vs unknown"
- Add source attribution from evidenceTrail
- Style filled data prominently

**Phase 3: Overview Dashboard**
- Add summary view showing all sections
- Highlight what's critical and missing
- Quick actions to add common fields

**Phase 4: Smart Suggestions**
- "Based on uploaded documents, we could extract..."
- Auto-suggest from pending extraction jobs
- Link directly to source documents

### UI Mockup: Client Intelligence Tab

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Client Intelligence: Acme Holdings Ltd                     [+ Add Intel] 💾  │
├──────────┬───────────────────────────────────────────────────────────────────┤
│          │                                                                    │
│ Overview │  📊 Intelligence Summary                                          │
│ ●●●●○    │  ┌──────────────────────────────────────────────────────────────┐ │
│          │  │ Completeness: 68%  ████████████░░░░░                          │ │
│ Identity │  │                                                                │ │
│ ●●●○○    │  │ ✅ Known (12 fields)  ⚠️ Missing (6 fields)  🔴 Critical (2)  │ │
│          │  └──────────────────────────────────────────────────────────────┘ │
│ Financial│                                                                    │
│ ●○○○○    │  ┌─ Critical Missing ────────────────────────────────────────────┐ │
│          │  │ • Bank Account Details     Required for drawdown               │ │
│ Contacts │  │ • VAT Number               Required for invoicing              │ │
│ ●●●●●    │  └───────────────────────────────────────────────────────────────┘ │
│          │                                                                    │
│ Profile  │  ┌─ Recently Added ──────────────────────────────────────────────┐ │
│ ●●○○○    │  │ 📄 Legal Name from Bank Statement (2 hours ago)               │ │
│          │  │ 📄 Company Number from Certificate of Inc. (yesterday)         │ │
│ AI       │  │ ✋ Primary Contact added manually (3 days ago)                 │ │
│ ●●●○○    │  └───────────────────────────────────────────────────────────────┘ │
│          │                                                                    │
│ Projects │  ┌─ Pending Extraction ──────────────────────────────────────────┐ │
│ ●●●●●    │  │ 📋 3 documents queued for intelligence extraction             │ │
│          │  │    May contain: addresses, banking details, key contacts       │ │
│──────────│  └───────────────────────────────────────────────────────────────┘ │
│          │                                                                    │
│ ⚠️ 2      │                                                                    │
│ Critical │                                                                    │
└──────────┴───────────────────────────────────────────────────────────────────┘
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/IntelligenceTab.tsx` | Major refactor to new pattern |
| `src/components/ui/CompletenessIndicator.tsx` | New component |
| `src/components/ui/KnownDataCard.tsx` | New component |
| `src/components/ui/MissingDataList.tsx` | New component |
| `convex/intelligence.ts` | Add field counting helpers |

---

## Updated Priority List (January 22, 2026)

| Priority | Status | Description |
|----------|--------|-------------|
| P1 | ✅ Complete | Filing Accuracy |
| P2 | ✅ Complete | Checklist Matching |
| P3 | ✅ Complete | Intelligence System Backend |
| P4 | 🟡 Partial | Folder Structure Integrity |
| P5 | ❌ Not Started | Multi-Agent Pipeline |
| P6 | ❌ Not Started | Type Taxonomy Expansion |
| P7 | ✅ Complete | Test Suite (321 tests passing) |
| **P8** | ❌ Not Started | **Contact System Integration** |
| **P9** | ❌ Not Started | **Intelligence UI Redesign** |

---

*Document last updated: January 22, 2026*
*Status: P1-3, P7 complete. P9 (Intelligence UI) is next focus for user experience improvement.*
