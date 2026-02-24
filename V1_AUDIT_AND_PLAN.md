# RockCap V2 — Comprehensive Codebase Audit & V1 Delivery Plan

**Branch:** `refactor/modular-document-agents`
**Date:** 2026-02-24
**Status:** Active Development

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Technology Stack](#2-technology-stack)
3. [Application Architecture](#3-application-architecture)
4. [Navigation & Page Structure](#4-navigation--page-structure)
5. [Core V1 Pipeline](#5-core-v1-pipeline)
6. [Bulk Upload System](#6-bulk-upload-system)
7. [Document Classification & AI](#7-document-classification--ai)
8. [File Type Definitions & Reference Library](#8-file-type-definitions--reference-library)
9. [Knowledge Library & Checklist System](#9-knowledge-library--checklist-system)
10. [Intelligence System](#10-intelligence-system)
11. [Document Library & Folder Structure](#11-document-library--folder-structure)
12. [Database Schema Overview](#12-database-schema-overview)
13. [API Routes Inventory](#13-api-routes-inventory)
14. [Feature Completeness Assessment](#14-feature-completeness-assessment)
15. [Gaps & Issues](#15-gaps--issues)
16. [V1 Delivery Definition](#16-v1-delivery-definition)
17. [Migration Plan: Haiku Skills Architecture](#17-migration-plan-haiku-skills-architecture)

---

## 1. Executive Summary

RockCap V2 is a document management and intelligence platform for a real estate financing company. The application handles bulk document uploads, AI-powered classification, dynamic checklist tracking, intelligence extraction, and client/project management.

### Current State (refactor/modular-document-agents branch)

The system is substantially more complete than the `main` branch. Key additions:

| Feature | Status | Notes |
|---------|--------|-------|
| Bulk Upload Pipeline | ~90% | Upload → Analyze → Review → File flow working |
| AI Document Classification | ~85% | Together.ai + deterministic verification |
| Dynamic Checklist System | ~80% | Full CRUD, template-based, AI matching, email requests |
| Intelligence Extraction | ~75% | Knowledge items, field tracking, conflict resolution |
| Document Library | ~85% | Multi-scope folders, FolderBrowser, FileList |
| File Type Reference Library | ~90% | 55 types, auto-learning keywords, deterministic scoring |
| Self-Teaching Loop | ~70% | Correction capture, keyword learning, consolidated rules |
| Client/Project Management | ~80% | Overview, settings, contacts, tasks, meetings |
| HubSpot Integration | ~60% | Sync companies/contacts/deals, but external dependency |
| Financial Modeling | ~50% | Templates, extraction, code mapping (not V1 critical) |

### V1 Core Pipeline

```
Upload → AI Classify → Review & Correct → Checklist Match → File to Library → Extract Intelligence
```

This pipeline is **functional end-to-end** but needs refinement in:
- Classification accuracy (migrate to Haiku skills)
- Checklist matching confidence (currently substring-based, 0.8 hardcoded)
- Reference library completeness (55 types defined, matching rules need tuning)

---

## 2. Technology Stack

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router) | TypeScript, React 18 |
| **Styling** | Tailwind CSS + shadcn/ui | Consistent component library |
| **Backend/DB** | Convex | Real-time BaaS, ~61 tables |
| **AI Provider** | Together.ai | Llama 4 Maverick 17B (primary) |
| **AI Fallback** | OpenAI-compatible | GPT-OSS-20B for task parsing |
| **File Storage** | Convex Storage | Built-in blob storage |
| **Auth** | Clerk | User authentication |
| **Integrations** | HubSpot, Companies House | CRM + UK company data |

### AI Model Configuration (`src/lib/modelConfig.ts`)

| Use Case | Model | Temperature | Max Tokens |
|----------|-------|-------------|------------|
| Extraction | Llama 4 Maverick 17B | 0.2 | 65,536 |
| Analysis | Llama 4 Maverick 17B | 0.3 | 8,192 |
| Chat | Llama 4 Maverick 17B | 0.7 | 4,096 |

**No Anthropic SDK installed.** Migration to Haiku would require adding `@anthropic-ai/sdk` dependency.

---

## 3. Application Architecture

```
model-testing-app/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── api/                      # 50 API routes
│   │   ├── clients/[clientId]/       # Client pages (11 tabs)
│   │   │   └── projects/[projectId]/ # Project pages (8 tabs)
│   │   ├── docs/                     # Document library
│   │   ├── filing/                   # Upload & file page
│   │   ├── modeling/                 # Financial modeling
│   │   ├── prospects/                # Prospecting
│   │   └── ...
│   ├── components/                   # Shared components
│   │   ├── BulkUpload.tsx           # Upload wizard (833 lines)
│   │   ├── BulkReviewTable.tsx      # Review table (627+ lines)
│   │   ├── IntelligenceTab.tsx      # Intelligence UI
│   │   ├── ProjectSettingsPanel.tsx  # Settings panel
│   │   └── Sidebar.tsx              # Navigation
│   └── lib/
│       ├── togetherAI.ts            # AI functions (498 lines)
│       ├── modelConfig.ts           # Model configuration
│       ├── fileTypeDefinitions.ts   # Client-side type defs (5 types)
│       ├── bulkQueueProcessor.ts    # Queue processor (338 lines)
│       ├── canonicalFields.ts       # Canonical field paths
│       └── agents/                  # Modular AI agents
│           ├── classification-agent/
│           ├── checklist-agent/
│           └── deterministic-verifier/
├── convex/
│   ├── schema.ts                    # Database schema (~2000 lines, 61 tables)
│   ├── knowledgeLibrary.ts          # Checklist & intelligence (2,372 lines)
│   ├── knowledgeBank.ts             # Knowledge entries
│   ├── fileTypeDefinitions.ts       # 55 document types + learning
│   ├── bulkUpload.ts                # Bulk upload backend (741 lines)
│   ├── documents.ts                 # Document CRUD
│   ├── folderStructure.ts           # Folder management
│   └── migrations/
│       ├── seedFileTypeDefinitions.ts
│       ├── seedFolderTemplates.ts
│       └── seedPlacementRules.ts
```

---

## 4. Navigation & Page Structure

### Sidebar (11 items)

| # | Item | Route | Status |
|---|------|-------|--------|
| 1 | Dashboard | `/` | Active |
| 2 | Tasks | `/tasks` | Active (NEW) |
| 3 | Calendar | `/calendar` | Active (NEW) |
| 4 | Inbox | `/inbox` | Active (NEW) |
| 5 | Upload & File | `/filing` | Active |
| 6 | Clients | `/clients` | Active |
| 7 | Prospects | `/prospects` | Active |
| 8 | Rolodex | `/rolodex` | Active |
| 9 | Docs | `/docs` | Active |
| 10 | Notes | `/notes` | Active |
| 11 | Modeling | `/modeling` | Active |

**Settings:** `/settings` (bottom of sidebar, labeled "VERSION 2.1")

### Client Page Tabs (11 tabs)

| Tab | Component | V1 Critical |
|-----|-----------|-------------|
| Overview | ClientOverviewTab | Yes |
| Documents | ClientDocumentLibrary | Yes |
| Projects | ClientProjectsTab | Yes |
| Contacts | ClientContactsTab | No |
| Tasks | ClientTasksTab | No |
| Communications | ClientCommunicationsTab | No |
| Meetings | ClientMeetingsTab | No |
| Data | ClientDataTab | No |
| Intelligence | ClientIntelligenceTab | Yes |
| Checklist | ClientKnowledgeTab | Yes |
| Notes | ClientNotesTab | No |

### Project Page Tabs (8 tabs)

| Tab | Component | V1 Critical |
|-----|-----------|-------------|
| Overview | ProjectOverviewTab | Yes |
| Documents | ProjectDocumentsTab | Yes |
| Intelligence | ProjectIntelligenceTab | Yes |
| Checklist | ProjectKnowledgeTab | Yes |
| Communications | (shared component) | No |
| Data | ProjectDataTab | No |
| Notes | ProjectNotesTab | No |
| Tasks | ProjectTasksTab | No |

---

## 5. Core V1 Pipeline

The V1 delivery pipeline is the end-to-end document processing flow:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Bulk Upload  │────▶│ AI Analysis  │────▶│ User Review  │────▶│ File to Library │
│ (BulkUpload) │     │ (/api/bulk-  │     │ (BulkReview  │     │ (fileBatch      │
│              │     │  analyze)    │     │  Table)      │     │  mutation)      │
└─────────────┘     └──────────────┘     └──────────────┘     └────────┬────────┘
                                                                       │
                    ┌──────────────┐     ┌──────────────┐             │
                    │ Intelligence │◀────│  Checklist   │◀────────────┘
                    │  Extraction  │     │  Matching    │
                    │ (knowledge   │     │ (suggest     │
                    │  Items)      │     │  Matches)    │
                    └──────────────┘     └──────────────┘
```

### Pipeline Stages

**Stage 1 — Upload** (`BulkUpload.tsx`)
- Select scope: Client / Internal / Personal
- Choose destination (client, project, folder)
- Upload files (max 100, 100MB each)
- Processing mode: Foreground (≤5 files) or Background (>5 files)

**Stage 2 — AI Analysis** (`/api/bulk-analyze` → `togetherAI.ts`)
- Text extraction from uploaded file
- Summary Agent: executive summary, entities, key terms, dates, amounts, characteristics
- Classification Agent: fileType, category, targetFolder, confidence, reasoning
- Checklist Agent: match document to missing checklist items with confidence scores
- Placement rules override folder suggestion if rule exists

**Stage 3 — User Review** (`BulkReviewTable.tsx`)
- Expandable rows with full document analysis (tabbed: Summary, Entities, Key Terms, Doc Info, Classification)
- Editable: fileType, category, folder, internal flag, checklist items, version, notes
- AI suggestions shown with sparkles icon; user corrections tracked for feedback loop
- Checklist item popover: AI suggestions first (with confidence %), then all items

**Stage 4 — Filing** (`convex/bulkUpload.ts` → `fileItem`/`fileBatch`)
- Create document record with all metadata
- Link to checklist items → mark as "fulfilled"
- Extract intelligence from documentAnalysis (amounts, dates, entities)
- Create knowledge items at client/project scope
- Capture user corrections for feedback loop → trigger keyword learning

---

## 6. Bulk Upload System

### Components

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| BulkUpload | `src/components/BulkUpload.tsx` | 833 | Upload wizard UI |
| BulkReviewTable | `src/components/BulkReviewTable.tsx` | 627+ | Review/edit table |
| BulkQueueProcessor | `src/lib/bulkQueueProcessor.ts` | 338 | Client-side queue |
| bulk-analyze API | `src/app/api/bulk-analyze/route.ts` | 348 | AI analysis endpoint |
| bulkUpload backend | `convex/bulkUpload.ts` | 741 | Convex mutations |

### Processing Modes

| Mode | Trigger | Processing | Progress |
|------|---------|-----------|----------|
| Foreground | ≤5 files | BulkQueueProcessor (browser) | Real-time UI updates |
| Background | >5 files | Convex scheduler (server) | Batch status polling |

### Self-Teaching Feedback Loop

```
User corrects classification
  → filingCorrections table stores: AI prediction, user correction, document keywords
  → Cache invalidated for this content hash
  → If fileType changed: trigger keyword learning
  → After 3+ corrections for same pattern: auto-learn common keywords
  → Learned keywords boost future deterministic scoring by 0.15 each
  → Consolidated rules passed to classification agent as examples
```

### Checklist Linking During Filing

```
For each user-selected checklist item:
  1. Create knowledgeChecklistDocumentLinks record (isPrimary for first)
  2. Update checklist item status → "fulfilled"
  3. Extract intelligence fields from documentAnalysis
  4. Create/update knowledgeItems at appropriate scope
```

---

## 7. Document Classification & AI

### Multi-Stage Pipeline

**Stage 1 — Summary Agent** (Together.ai)
```
Input: Document text (or smart summary if >40KB)
Output:
  - documentDescription, documentPurpose
  - executiveSummary, detailedSummary, sectionBreakdown
  - entities: {people, companies, locations, projects}
  - keyTerms, keyDates, keyAmounts
  - documentCharacteristics: {isFinancial, isLegal, isIdentity, isReport, isDesign, isCorrespondence, ...}
  - confidenceInAnalysis (0-1)
```

**Stage 2 — Classification Agent** (Together.ai)
```
Input: Summary output + file type definitions + folder list + client context + past corrections
Output:
  - fileType: e.g., "RedBook Valuation"
  - category: e.g., "Appraisals"
  - targetFolder: e.g., "appraisals"
  - confidence: 0-1
  - typeAbbreviation: e.g., "RBV"
  - classificationReasoning: explanation
```

**Stage 3 — Deterministic Verifier** (No AI — keyword scoring)
```
Scoring weights:
  - keyTermMatch: 0.4
  - summaryMatch: 0.3
  - filenameMatch: 0.3
  - filenamePatternBonus: 0.3
  - exclusionPenalty: 0.5x multiplier
  - correctionBoost: 0.2
  - learnedKeywordBoost: 0.15 per keyword

Decision logic:
  - LLM matches top deterministic score → VERIFIED
  - Score difference >0.25 AND top ≥0.4 → SUGGEST CHANGE
  - Otherwise → ACCEPT with alternative noted
  - Top 2 scores within 0.15 → trigger critic agent for disambiguation
```

**Stage 4 — Checklist Matching Agent**
```
Input: Classified document + missing checklist items + filename matches
Output: Array of {itemId, itemName, category, confidence, reasoning}
  - Filename exact match → 0.85+ confidence
  - Document type match → 0.75+ confidence
  - Content serves purpose → 0.65+ confidence
  - Semantic similarity → 0.50-0.65 confidence
Only auto-selects highest confidence item (≥0.7) in UI
```

### Current AI Provider: Together.ai

- Model: `meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8`
- REST API calls via `src/lib/togetherAI.ts`
- Retry with exponential backoff via `fetchWithRetry()`
- No streaming; synchronous request-response
- **No Anthropic SDK installed**

---

## 8. File Type Definitions & Reference Library

### Architecture

| Layer | File | Types | Purpose |
|-------|------|-------|---------|
| Backend (source of truth) | `convex/fileTypeDefinitions.ts` | 55 | Database persistence, CRUD, learning |
| Frontend (hints) | `src/lib/fileTypeDefinitions.ts` | 5 | Client-side guidance, merges with DB |
| Seed migration | `convex/migrations/seedFileTypeDefinitions.ts` | 55 | Initial database population |
| Keyword learning | `convex/keywordLearning.ts` | — | Auto-learn from corrections |

### 55 Document Types Across 12 Categories

| Category | Types | Examples |
|----------|-------|---------|
| Appraisals | 3 | Appraisal, RedBook Valuation, Cashflow |
| Plans | 6 | Floor Plans, Elevations, Sections, Site Plans, Location Plans |
| Inspections | 2 | Initial Monitoring Report, Interim Monitoring Report |
| Professional Reports | 8 | Planning Documentation, Contract Sum Analysis, Comparables, Building Survey, Report on Title, Legal Opinion, Environmental Report, Local Authority Search |
| KYC | 10 | Passport, Driving License, Utility Bill, Bank Statement, Application Form, Assets & Liabilities, Track Record, Certificate of Incorporation, Company Search, Tax Return |
| Loan Terms | 2 | Indicative Terms, Credit Backed Terms |
| Legal Documents | 13 | Facility Letter, Personal Guarantee, Corporate Guarantee, T&Cs, Shareholders Agreement, Share Charge, Debenture, Corporate Authorisations, Building Contract, Professional Appointment, Collateral Warranty, Title Deed, Lease |
| Project Documents | 2 | Accommodation Schedule, Build Programme |
| Financial Documents | 5 | Loan Statement, Redemption Statement, Completion Statement, Invoice, Receipt |
| Insurance | 2 | Insurance Policy, Insurance Certificate |
| Communications | 2 | Email/Correspondence, Meeting Minutes |
| Warranties | 2 | NHBC Warranty, Latent Defects Insurance |
| Photographs | 1 | Site Photographs |

### Each Definition Contains

```typescript
{
  fileType: string;           // "RedBook Valuation"
  category: string;           // "Appraisals"
  keywords: string[];         // ["RICS", "red book", "valuation", ...]
  description: string;        // 100+ words (enforced)
  identificationRules: string[];  // Detection rules
  categoryRules: string;      // Why this category
  // Deterministic verification fields:
  targetFolderKey?: string;   // "appraisals"
  targetLevel?: "client" | "project";
  filenamePatterns?: string[];
  excludePatterns?: string[];
  // Auto-learning:
  learnedKeywords?: Array<{keyword, source, addedAt, correctionCount}>;
}
```

### Auto-Learning Keyword System

1. User corrects classification → correction stored in `filingCorrections`
2. After 3+ corrections for same pattern (e.g., "Plans" → "Floor Plans"):
   - System finds keywords appearing in 50%+ of corrections
   - Deduplicates against existing keywords
   - Adds to `learnedKeywords` array with source="correction"
3. Learned keywords boost deterministic scoring by 0.15 each
4. Users can undo learned keywords via UI notification feed
5. Learning events tracked with stats (this week, this month)

---

## 9. Knowledge Library & Checklist System

### Backend: `convex/knowledgeLibrary.ts` (2,372 lines)

**13 Queries + 34 Mutations** managing:
- Requirement templates
- Checklist items (client-level and project-level)
- Document-checklist links
- AI suggestions
- Email logging
- Knowledge items (intelligence)
- Intelligence conflicts
- Field-based progress tracking

### Checklist Architecture

```
knowledgeRequirementTemplates      knowledgeChecklistItems         knowledgeChecklistDocumentLinks
┌──────────────────────────┐       ┌──────────────────────┐       ┌────────────────────────────┐
│ clientType: "borrower"   │──────▶│ clientId             │──────▶│ checklistItemId            │
│ level: "client"/"project"│       │ projectId?           │       │ documentId                 │
│ requirements: [          │       │ name                 │       │ documentName               │
│   {name, category,       │       │ category             │       │ isPrimary                  │
│    priority, phase,      │       │ status: missing |    │       │ linkedAt                   │
│    matchingDocTypes}     │       │   pending_review |   │       │ linkedBy                   │
│ ]                        │       │   fulfilled          │       └────────────────────────────┘
└──────────────────────────┘       │ priority: required | │
                                   │   nice_to_have |     │
                                   │   optional           │
                                   │ phaseRequired        │
                                   │ matchingDocTypes[]   │
                                   │ suggestedDocId?      │
                                   │ suggestedConfidence? │
                                   │ isCustom             │
                                   └──────────────────────┘
```

### Checklist Initialization

```
initializeChecklistForClient(clientId, clientType)
  → Find template for clientType + level="client"
  → Create checklist items from template requirements
  → All start as status="missing"

initializeChecklistForProject(projectId, clientType)
  → Find template for clientType + level="project"
  → Create checklist items from template requirements
  → All start as status="missing"
```

### Checklist Item Statuses

| Status | Meaning | Trigger |
|--------|---------|---------|
| `missing` | No documents linked | Default state |
| `pending_review` | AI suggested a match, awaiting user confirmation | `suggestDocumentMatches()` |
| `fulfilled` | At least one document linked | `confirmSuggestedLink()` or `linkDocumentToChecklistItem()` |

### AI Matching Logic (`suggestDocumentMatches`)

```
1. Get all MISSING checklist items for client
2. For each item with matchingDocumentTypes:
   a. Compare document type (substring matching, case-insensitive)
   b. 3-way logic: docType⊂itemType OR itemType⊂docType OR category⊂itemType
3. If match found → set item to pending_review with suggestion
4. Default confidence: 0.8 (hardcoded)
```

### Document Linking Flow

```
User confirms match → confirmSuggestedLink()
  → Create knowledgeChecklistDocumentLinks record
  → If first link: mark item "fulfilled", clear suggestion
  → If additional link: just clear suggestion

User manually links → linkDocumentToChecklistItem()
  → Create link record (isPrimary if first)
  → Mark item "fulfilled"

User unlinks → unlinkDocumentFromChecklistItem()
  → Remove specific link
  → If was primary, promote next link to primary
  → If no links remain, mark item "missing"
```

### Deal Phase Filtering

Items have `phaseRequired` field:
- `indicative_terms` — Required at early proposal stage
- `credit_submission` — Required for credit application
- `post_credit` — Required after credit approval
- `always` — Required regardless of phase

### Custom Requirements

- `addCustomRequirement()` — Manual single requirement (isCustom=true, customSource="manual")
- `addCustomRequirementsFromLLM()` — Bulk from LLM parsing (isCustom=true, customSource="llm")

### Email Request System

- Email modal generates request for missing documents
- `logEmailGeneration()` records email content, recipients, checklist items referenced
- `getLastEmailGeneration()` shows when last email was sent

### Field-Based Progress Tracking (Sprint 3)

`getChecklistFieldProgress` maps checklist items to canonical fields:
```typescript
CHECKLIST_FIELD_HINTS = {
  'Company Search': ['company.name', 'company.registrationNumber', ...],
  'Development Appraisal': ['financials.gdv', 'financials.totalDevelopmentCost', ...],
  'Planning Permission': ['timeline.planningStatus', 'overview.unitCount', ...],
  // 25 document types mapped to canonical fields
}
```
Calculates "effective status" based on which expected fields are filled in knowledgeItems.

---

## 10. Intelligence System

### Knowledge Items (`knowledgeItems` table)

Flexible normalized intelligence storage:
```typescript
{
  clientId, projectId?,
  fieldPath: "company.registrationNumber",  // canonical OR custom
  label: "Company Registration Number",
  category: "company",
  value: "12345678",
  valueType: "text" | "currency" | "percentage" | "date" | "number" | "array" | "boolean",
  confidence: 0.85,
  source: "document" | "manual" | "ai_extraction",
  sourceDocumentId?, sourceText?,
  status: "active" | "flagged" | "archived" | "superseded",
  supersededBy?, supersededAt?,
  flaggedReason?, flaggedAt?,
}
```

### Intelligence Tab UI (`IntelligenceTab.tsx`)

- Dual-mode: Client-level and Project-level scope switching
- 9 client categories (Contact, Company, Financial, etc.) or 10 project categories
- Canonical field management with completion tracking
- Value history (superseded/prior values with dates and sources)
- Document analysis viewer (tabbed: Summary, Entities, Key Data, Characteristics)
- AddIntelligenceModal for AI extraction
- ConsolidationModal for duplicate/conflict resolution

### Conflict Resolution

```
createIntelligenceConflict()
  → Flag items with same fieldPath from different sources
  → Status: "pending" | "resolved"

resolveIntelligenceConflict()
  → Mark winner as "active", others as "superseded"
  → Record resolution decision
```

### Knowledge Bank vs Knowledge Library

| Feature | knowledgeLibrary | knowledgeBank |
|---------|-----------------|---------------|
| Purpose | Structured requirements + intelligence | Unstructured knowledge entries |
| Tables | knowledgeChecklistItems, knowledgeItems, intelligenceConflicts | knowledgeBankEntries |
| Data Model | Strongly typed, canonical fields | Flexible JSON metadata |
| Entry Types | Document requirements + extracted fields | deal_update, call_transcript, email, document_summary |
| Complexity | 13 queries + 34 mutations | 4 queries + 6 mutations |

---

## 11. Document Library & Folder Structure

### Multi-Scope Architecture

| Scope | Folder Table | Description |
|-------|-------------|-------------|
| Client | `clientFolders` | Client-specific documents |
| Project | `projectFolders` | Project-specific documents |
| Internal | `internalFolders` | Company-wide RockCap documents |
| Personal | `personalFolders` | User-specific private documents |

### FolderBrowser Component

- Tree view of folders organized by scope
- Supports `projectFilter` prop to limit to single project
- Client profile link navigation
- Folder selection drives FileList content

### Folder Templates

Seeded via `convex/migrations/seedFolderTemplates.ts`:
- **Borrower template**: Background, Terms, Appraisals, Plans, Legal, Insurance, etc.
- **Lender template**: Credit Papers, Due Diligence, Security, Monitoring, etc.

### Document Placement Rules

Seeded via `convex/migrations/seedPlacementRules.ts`:
- Maps (clientType, documentType, category) → targetFolder
- Applied post-classification to override AI folder suggestions
- Priority-based when multiple rules match

---

## 12. Database Schema Overview

**61 tables** organized by domain:

### Core CRM (5 tables)
`users`, `clients`, `companies`, `projects`, `contacts`

### Document Management (7 tables)
`documents`, `documentNotes`, `internalDocuments`, `internalFolders`, `personalFolders`, `clientFolders`, `projectFolders`

### Upload & Processing (3 tables)
`fileUploadQueue`, `bulkUploadBatches`, `bulkUploadItems`

### Intelligence & Knowledge (7 tables)
`knowledgeItems`, `intelligenceConflicts`, `clientIntelligence`, `projectIntelligence`, `knowledgeRequirementTemplates`, `knowledgeChecklistItems`, `knowledgeChecklistDocumentLinks`

### Extraction & Classification (10 tables)
`documentExtractions`, `extractionJobs`, `extractedItemCodes`, `itemCodeAliases`, `itemCategories`, `codifiedExtractions`, `intelligenceExtractionJobs`, `classificationCache`, `fileTypeDefinitions`, `categorySettings`

### Activities & Communications (10 tables)
`activities`, `dealActivities`, `emailTemplates`, `emailFunnels`, `prospectingEmails`, `chatSessions`, `chatMessages`, `chatActions`, `events`, `knowledgeBankEntries`

### Tasks & Meetings (4 tables)
`tasks`, `meetings`, `meetingExtractionJobs`, `reminders`

### Data Modeling (7 tables)
`modelingTemplates`, `modelingCodeMappings`, `templateDefinitions`, `templateSheets`, `projectDataItems`, `dataLibrarySnapshots`, `modelExports`

### HubSpot & External (8+ tables)
`hubspotSyncConfig`, `hubspotPipelines`, `companiesHouseCompanies`, `companiesHouseCharges`, `companiesHousePSC`, `companiesHouseOfficers`, `companyRelationships`, `planningApplications`

---

## 13. API Routes Inventory

**50 API routes** across the application:

### Document Processing (10 routes)
- `POST /api/analyze-file` — Single file analysis
- `POST /api/bulk-analyze` — Batch analysis (V1 critical)
- `POST /api/bulk-analyze-debug` — Debug batch analysis
- `POST /api/reanalyze-document` — Re-analyze with new instructions
- `POST /api/intelligence-extract` — Extract intelligence fields
- `POST /api/process-extraction-queue` — Process extraction jobs
- `POST /api/process-intelligence-queue` — Process intelligence jobs
- `POST /api/consolidate-intelligence` — Merge intelligence
- `POST /api/convex-file` — Convex file operations
- `POST /api/extract-prospecting-context` — Prospecting insights

### Meeting & Task Processing (5 routes)
- `POST /api/meeting-extract` — Extract meetings from documents
- `POST /api/process-meeting-queue` — Process meeting queue
- `POST /api/tasks/parse` — Parse natural language tasks
- `POST /api/reminders/parse` — Parse reminders
- `POST /api/reminders/enhance` — Enhance reminders

### Chat & AI (2 routes)
- `POST /api/chat-assistant` — Chat completion
- `POST /api/ai-assistant` — General AI assistant

### HubSpot (15 routes)
Sync, test, import, explore operations for companies, contacts, deals, leads, pipelines

### Companies House (6 routes)
Search, details, charges, sync, test operations

### Other (12 routes)
Prospects, modeling, migrations, notifications, debugging

---

## 14. Feature Completeness Assessment

### V1 Critical Features

| # | Feature | Completeness | Status |
|---|---------|-------------|--------|
| 1 | **Bulk Upload UI** | 90% | Working: scope selection, file upload, foreground/background modes |
| 2 | **AI Document Analysis** | 85% | Working: summary, entities, key terms, characteristics extraction |
| 3 | **AI Classification** | 80% | Working: fileType + category + folder + confidence. Needs accuracy improvement |
| 4 | **Deterministic Verification** | 90% | Working: keyword scoring, filename patterns, learned keywords |
| 5 | **Review Table** | 85% | Working: edit all fields, view analysis, checklist linking |
| 6 | **Checklist Templates** | 80% | Working: template-based init, custom requirements, phase filtering |
| 7 | **Checklist Matching** | 70% | Working but basic: substring matching, hardcoded 0.8 confidence |
| 8 | **Document Filing** | 85% | Working: folder placement, checklist linking, version tracking |
| 9 | **Intelligence Extraction** | 75% | Working: amounts, dates, entities → knowledge items |
| 10 | **Feedback Loop** | 70% | Working: correction capture, keyword learning. Needs tuning |
| 11 | **Document Library** | 85% | Working: multi-scope folders, FolderBrowser, FileList, detail panel |
| 12 | **Reference Library** | 90% | Working: 55 types, 12 categories, learned keywords, seed/sync |
| 13 | **Client Overview** | 80% | Working: MissingDocumentsCard, stage notes, deal values |
| 14 | **Project Overview** | 80% | Working: checklist progress, category breakdown, alert for missing |
| 15 | **Checklist UI** | 80% | Working: ProjectKnowledgeTab with progress, categories, email requests |

### Non-V1 Features (Active but Lower Priority)

| Feature | Completeness | Notes |
|---------|-------------|-------|
| Financial Modeling | 50% | Templates, extraction, code mapping |
| HubSpot Integration | 60% | Sync working, but external dependency |
| Prospecting | 40% | Gauntlet, enrichment suggestions |
| Chat Assistant | 50% | Context-aware chat |
| Calendar/Inbox | 30% | Navigation exists, implementation unclear |
| Companies House | 50% | Search, sync working |

---

## 15. Gaps & Issues

### Critical (V1 Blockers)

| # | Gap | Impact | Location |
|---|-----|--------|----------|
| 1 | **Checklist matching uses substring only** | Misses valid matches (e.g., "Tax Returns" vs "Tax Return"), no fuzzy matching | `knowledgeLibrary.ts:881-888` |
| 2 | **Hardcoded 0.8 confidence** | All matches look equally confident, no way to distinguish strong vs weak | `knowledgeLibrary.ts:895` |
| 3 | **No Anthropic SDK** | Cannot migrate to Haiku skills without adding dependency | `package.json` |
| 4 | **AI suggestion overwrites without history** | Previous suggestion lost when new match found | `knowledgeLibrary.ts` setSuggestion |
| 5 | **No transaction safety** | Partial failures during filing could leave inconsistent state | `bulkUpload.ts` fileBatch |

### High Priority (V1 Quality)

| # | Gap | Impact | Location |
|---|-----|--------|----------|
| 6 | **CHECKLIST_FIELD_HINTS hardcoded in Convex** | Duplicated from canonicalFields.ts, no single source of truth | `knowledgeLibrary.ts:1942-1975` |
| 7 | **No pagination on large collections** | Performance degradation with many checklist/knowledge items | Multiple queries |
| 8 | **Background processing has no real-time updates** | Users can't see individual file progress for background batches | `bulkUpload.ts` |
| 9 | **Frontend file type defs drift from DB** | 5 client-side types may diverge from 55 DB types | `src/lib/fileTypeDefinitions.ts` |
| 10 | **Debug queries exposed** | `debugGetAllKnowledgeItems` does full table scan in production | `knowledgeLibrary.ts` |

### Medium Priority (Post-V1)

| # | Gap | Impact |
|---|-----|--------|
| 11 | No document count limits per checklist item | Can't enforce "3 months bank statements" |
| 12 | No undo/redo for mutations | Destructive operations can't be reversed |
| 13 | No optimistic updates | UI feels slow after mutations |
| 14 | Tasks not linked to checklist | Can't create task from missing requirement |
| 15 | Data library not linked to intelligence | Extracted data separate from knowledge items |
| 16 | Multiple `@ts-ignore` for Convex type depth | Type safety compromised |
| 17 | No orphaned link cleanup | Deleted checklist items leave dangling links |
| 18 | Conflict detection is manual only | No auto-detection when contradictory values added |
| 19 | No rich text in tasks/notes | Plain textarea only |
| 20 | Sidebar state not persisted | Collapse resets on page reload |

---

## 16. V1 Delivery Definition

### What Constitutes an Acceptable V1

V1 is the **core document processing pipeline** that delivers value to the RockCap team. Users should be able to:

1. **Upload documents in bulk** through the upload wizard
2. **Get AI-powered classification** with reasonable accuracy
3. **Review and correct** AI suggestions before filing
4. **Match documents to checklist requirements** with AI suggestions
5. **File documents** to the correct folders in the document library
6. **Track checklist completion** at both client and project levels
7. **View extracted intelligence** from filed documents
8. **Request missing documents** via email from the checklist view

### V1 Acceptance Criteria

| Criterion | Current State | V1 Target |
|-----------|--------------|-----------|
| Classification accuracy | ~70% (Llama 4) | ≥85% (Haiku) |
| Checklist match recall | ~60% (substring) | ≥80% (semantic) |
| End-to-end filing time | ~30s/doc (foreground) | ≤20s/doc |
| Reference library coverage | 55 types | 55+ types (same) |
| False positive rate | Unknown | ≤10% |
| User correction rate | Unknown | ≤25% (down from current) |

### V1 Scope Boundary

**IN scope for V1:**
- Bulk upload with foreground/background modes
- AI classification with Haiku (migrated from Together.ai)
- Document review table with correction UI
- Dynamic checklist with template initialization
- Document filing to folder library
- Intelligence extraction from filed documents
- Client/project overview with checklist progress
- Email request for missing documents
- Self-teaching keyword learning

**OUT of scope for V1:**
- Financial modeling and template population
- HubSpot/Companies House integration
- Prospecting and enrichment
- Chat assistant
- Calendar/Inbox features
- Meeting extraction
- Advanced conflict resolution UI

---

## 17. Migration Plan: Haiku Skills Architecture

### Goal

Replace Together.ai (Llama 4 Maverick) with Anthropic Claude Haiku for document classification and summarization, using a skills-based architecture for modular, maintainable AI operations.

### Proposed Skill Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Skill Router                       │
│  Determines which skill(s) to invoke per document    │
└──────────┬───────────┬───────────┬──────────────────┘
           │           │           │
    ┌──────▼──────┐ ┌──▼────────┐ ┌▼────────────────┐
    │ Summary     │ │ Classify  │ │ Checklist Match  │
    │ Skill       │ │ Skill     │ │ Skill            │
    │ (Haiku)     │ │ (Haiku)   │ │ (Haiku)          │
    │             │ │           │ │                  │
    │ Extract:    │ │ Determine:│ │ Match against:   │
    │ - Summary   │ │ - fileType│ │ - Missing items  │
    │ - Entities  │ │ - category│ │ - Confidence     │
    │ - Key data  │ │ - folder  │ │ - Reasoning      │
    │ - Chars     │ │ - abbrev  │ │                  │
    └─────────────┘ └───────────┘ └──────────────────┘
           │           │           │
    ┌──────▼──────┐ ┌──▼────────┐ ┌▼────────────────┐
    │ Intelligence│ │Deterministic│ │ Critic Skill   │
    │ Skill       │ │ Verifier  │ │ (Sonnet, rare)  │
    │ (Haiku)     │ │ (No AI)   │ │                  │
    │             │ │           │ │ Disambiguate     │
    │ Extract:    │ │ Verify:   │ │ close matches    │
    │ - Fields    │ │ - Keyword │ │ when top 2       │
    │ - Values    │ │   scoring │ │ scores within    │
    │ - Confidence│ │ - Suggest │ │ 0.15             │
    └─────────────┘ │   change  │ └──────────────────┘
                    └───────────┘
```

### Model Assignment

| Skill | Model | Temperature | Max Tokens | Cost/1K docs (est.) |
|-------|-------|-------------|------------|---------------------|
| Summary | Haiku | 0.2 | 4,096 | ~$0.50 |
| Classify | Haiku | 0.1 | 1,024 | ~$0.15 |
| Checklist Match | Haiku | 0.1 | 2,048 | ~$0.20 |
| Intelligence Extract | Haiku | 0.2 | 4,096 | ~$0.50 |
| Critic (rare) | Sonnet | 0.3 | 2,048 | ~$0.10 (5% of docs) |

### Implementation Steps

**Phase 1 — Add Anthropic SDK & Skill Framework**
1. Install `@anthropic-ai/sdk`
2. Create `src/lib/anthropicClient.ts` with API client setup
3. Create `src/lib/skills/` directory with skill interface:
   ```typescript
   interface Skill<TInput, TOutput> {
     name: string;
     model: 'haiku' | 'sonnet' | 'opus';
     temperature: number;
     maxTokens: number;
     buildPrompt(input: TInput): MessageParam[];
     parseResponse(response: string): TOutput;
   }
   ```
4. Create environment variable `ANTHROPIC_API_KEY`

**Phase 2 — Migrate Summary Skill**
1. Create `src/lib/skills/summarySkill.ts`
2. Port Summary Agent prompt from `togetherAI.ts`
3. Adapt for Haiku message format
4. Add structured output parsing (JSON mode)
5. A/B test: run both Together.ai and Haiku, compare quality
6. Switch over when Haiku quality ≥ Together.ai

**Phase 3 — Migrate Classification Skill**
1. Create `src/lib/skills/classificationSkill.ts`
2. Port Classification Agent prompt
3. Include file type definitions in system prompt (with caching)
4. Keep deterministic verifier as post-processing
5. A/B test and switch over

**Phase 4 — Migrate Checklist Matching Skill**
1. Create `src/lib/skills/checklistMatchSkill.ts`
2. Replace substring matching with semantic Haiku matching
3. Return confidence scores per item (not hardcoded 0.8)
4. Include reasoning for each match
5. Auto-select threshold: configurable (default 0.7)

**Phase 5 — Add Intelligence Extraction Skill**
1. Create `src/lib/skills/intelligenceSkill.ts`
2. Extract structured fields with canonical field paths
3. Return confidence per field
4. Map to knowledgeItems schema

**Phase 6 — Add Critic Skill (Sonnet)**
1. Create `src/lib/skills/criticSkill.ts`
2. Only invoked when deterministic verifier detects ambiguity
3. Uses Sonnet for deeper reasoning
4. Resolves close classification matches

**Phase 7 — Deprecate Together.ai**
1. Remove Together.ai calls from pipeline
2. Remove `TOGETHER_API_KEY` environment variable
3. Keep `togetherAI.ts` as reference during transition
4. Clean up model config

### Prompt Caching Strategy

Haiku supports prompt caching. Structure system prompts to maximize cache hits:

```
System prompt (CACHED — changes rarely):
  - Role description
  - File type definitions (55 types)
  - Category list
  - Output format specification

User prompt (PER DOCUMENT — changes each time):
  - Document text/summary
  - Filename
  - Client context
  - Past corrections for this client
  - Checklist items (if matching skill)
```

Expected cache hit rate: ~95% (only system prompt changes when definitions update).

### Cost Comparison

| Metric | Together.ai (Current) | Haiku (Proposed) |
|--------|----------------------|-----------------|
| Model | Llama 4 Maverick 17B | Claude Haiku |
| Input cost | ~$0.27/M tokens | $0.25/M tokens (cached: $0.025/M) |
| Output cost | ~$0.85/M tokens | $1.25/M tokens |
| Accuracy (est.) | ~70% | ~85%+ |
| Latency | 3-8s | 1-3s |
| Prompt caching | No | Yes (10x cheaper repeated prompts) |
| Structured output | JSON mode | JSON mode + tool use |

**With prompt caching, effective cost per document should be comparable or lower than Together.ai while delivering significantly higher accuracy.**

---

## Appendix A: Key File Locations

| Purpose | Path |
|---------|------|
| Bulk Upload UI | `src/components/BulkUpload.tsx` |
| Review Table | `src/components/BulkReviewTable.tsx` |
| Queue Processor | `src/lib/bulkQueueProcessor.ts` |
| AI Analysis API | `src/app/api/bulk-analyze/route.ts` |
| Together.ai Client | `src/lib/togetherAI.ts` |
| Model Config | `src/lib/modelConfig.ts` |
| File Type Defs (client) | `src/lib/fileTypeDefinitions.ts` |
| File Type Defs (server) | `convex/fileTypeDefinitions.ts` |
| Keyword Learning | `convex/keywordLearning.ts` |
| Deterministic Verifier | `src/lib/agents/deterministic-verifier/index.ts` |
| Classification Agent | `src/lib/agents/classification-agent/` |
| Checklist Agent | `src/lib/agents/checklist-agent/` |
| Knowledge Library | `convex/knowledgeLibrary.ts` |
| Knowledge Bank | `convex/knowledgeBank.ts` |
| Bulk Upload Backend | `convex/bulkUpload.ts` |
| Schema | `convex/schema.ts` |
| Folder Structure | `convex/folderStructure.ts` |
| Seed Templates | `convex/migrations/seedFolderTemplates.ts` |
| Seed Placement Rules | `convex/migrations/seedPlacementRules.ts` |
| Seed File Types | `convex/migrations/seedFileTypeDefinitions.ts` |
| Intelligence Tab | `src/components/IntelligenceTab.tsx` |
| Project Checklist Tab | `src/app/clients/[clientId]/projects/[projectId]/components/ProjectKnowledgeTab.tsx` |
| Missing Docs Card | `src/app/clients/[clientId]/components/MissingDocumentsCard.tsx` |
| Project Overview | `src/app/clients/[clientId]/projects/[projectId]/components/ProjectOverviewTab.tsx` |
| Client Overview | `src/app/clients/[clientId]/components/ClientOverviewTab.tsx` |
| Project Settings | `src/components/ProjectSettingsPanel.tsx` |
| Sidebar | `src/components/Sidebar.tsx` |
| Canonical Fields | `src/lib/canonicalFields.ts` |
