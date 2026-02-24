# RockCap V1 Codebase Audit & Delivery Plan

**Date:** 2026-02-24
**Branch:** `claude/audit-codebase-v1-plan-IzH7J`

---

## 1. Executive Summary

RockCap is a document upload management and summarization platform for a real estate financing company. The application is built on **Next.js + Convex** (real-time backend) with AI-powered document analysis via **Together.ai** (Llama 4 Maverick model).

The codebase is feature-rich but has accumulated scope beyond the V1 goal. This audit identifies what is **active**, what is **deprecated/dormant**, and what **gaps** remain to deliver a focused V1: **bulk upload -> AI summarization -> client intelligence -> dynamic checklist -> document library**.

---

## 2. Architecture Overview

```
Frontend:  Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
Backend:   Convex (real-time database, file storage, mutations/queries)
AI:        Together.ai API (Llama 4 Maverick 17B primary, GPT-OSS-20B secondary)
Auth:      Clerk (configured but partially implemented)
Hosting:   Vercel (deployment configured)
```

### Key Directories
| Path | Purpose |
|------|---------|
| `model-testing-app/src/app/` | Next.js pages and API routes |
| `model-testing-app/src/components/` | React components |
| `model-testing-app/src/lib/` | Utility modules (AI, extraction, naming) |
| `model-testing-app/src/types/` | TypeScript interfaces |
| `model-testing-app/convex/` | Convex schema, queries, mutations |

---

## 3. Navigation Map: Active vs Deprecated

### Active in Sidebar (12 items)
| Route | Label | V1 Relevance |
|-------|-------|-------------|
| `/` | Dashboard | **CORE** - entry point |
| `/tasks` | Tasks | Supporting |
| `/calendar` | Calendar | Supporting |
| `/inbox` | Inbox | Supporting |
| `/filing` | Filing Agent | **CORE** - bulk upload entry |
| `/clients` | Clients | **CORE** - client intelligence hub |
| `/prospects` | Prospects | Out of V1 scope |
| `/rolodex` | Rolodex | Out of V1 scope |
| `/docs` | Docs | **CORE** - document library |
| `/notes` | Notes | Supporting |
| `/knowledge-bank` | Knowledge Bank | **CORE** - client intelligence |
| `/modeling` | Modeling | Out of V1 scope |
| `/settings` | Settings (v2.1) | Supporting |

### Hidden/Deprecated Routes (not in sidebar)
| Route | Status | Notes |
|-------|--------|-------|
| `/projects` | **DEPRECATED** | Redirects to `/clients` |
| `/companies` | Hidden | HubSpot entity detail pages only |
| `/contacts` | Hidden | HubSpot entity detail pages only |
| `/deals` | Hidden | HubSpot entity detail pages only |
| `/test` | Hidden | Dev/testing page (SIC codes) |
| `/templates` | Hidden | Template management |
| `/uploads` | Hidden | Internal file queue system |

---

## 4. V1 Core Pipeline Audit

### 4.1 Bulk Upload System - STATUS: FUNCTIONAL, NEEDS REFINEMENT

**Entry Point:** `/filing?tab=bulk` -> `BulkUpload.tsx` (833 lines)

**Current Flow:**
```
Step 1: Select Client (can create new)
Step 2: Select Project (optional, can create new)
Step 3: Options (internal/external toggle, instructions)
Step 4: File Upload (drag & drop, max 100 files, 10MB each)
        |
        v
Sequential Processing via BulkQueueProcessor
  -> Upload file to Convex storage
  -> POST /api/bulk-analyze (Together.ai Llama 4 Maverick)
  -> Check duplicates
  -> Generate document code
        |
        v
Navigate to /docs/bulk/{batchId} for Review
  -> BulkReviewTable (627 lines) - edit type, category, folder
  -> Resolve duplicates (minor v1.1 / significant v2.0)
  -> "File All Documents" button
        |
        v
fileBatch() Convex mutation
  -> Creates Document records
  -> Creates Knowledge Bank entries
  -> Links to client/project folders
```

**Key Files:**
| File | Lines | Purpose |
|------|-------|---------|
| `src/components/BulkUpload.tsx` | 833 | Main upload UI |
| `convex/bulkUpload.ts` | 741 | Backend operations |
| `src/app/api/bulk-analyze/route.ts` | 348 | AI analysis endpoint |
| `src/lib/bulkQueueProcessor.ts` | 338 | Queue processing |
| `src/components/BulkReviewTable.tsx` | 627 | Review/edit table |
| `src/app/docs/bulk/[batchId]/page.tsx` | 459 | Review page |

**Gaps & Issues:**
1. **Sequential processing only** - no parallel file analysis; slow for large batches
2. **Summary-only analysis** - does not run deep extraction by default (cost-saving trade-off)
3. **No prospecting context extraction** in bulk flow
4. **No auto-extraction toggle** - requires manual per-item toggle
5. **30-second API timeout** - may fail on large/complex documents
6. **No retry logic** on AI analysis failure per file

### 4.2 Document Summaries & Client Intelligence - STATUS: PARTIALLY IMPLEMENTED

**How Summaries Are Generated:**
- Together.ai analyzes each file during upload (`/api/bulk-analyze`)
- Produces: summary (1-3 sentences), category, fileType, confidence score
- Summary stored on the Document record AND creates a KnowledgeBankEntry

**Knowledge Bank Schema (`convex/schema.ts`):**
```typescript
knowledgeBankEntries: {
  clientId, projectId?
  sourceType: "document" | "email" | "manual" | "call_transcript"
  entryType: "deal_update" | "call_transcript" | "email" | "document_summary" | "project_status" | "general"
  title, content (summary text)
  keyPoints: string[]      // Up to 5 extracted points
  metadata: Record<string, any>  // Financial data
  tags: string[]
}
```

**Where Intelligence Surfaces:**
| Location | What Shows | Status |
|----------|-----------|--------|
| `/clients/[id]` Overview tab | Client summary, recent docs | **Working** |
| `/clients/[id]` Communications tab | Document summaries timeline | **Working** |
| `/clients/[id]` Document Library tab | Folder browser + summaries | **Working** |
| `/clients/[id]` Knowledge tab | "Coming Soon" placeholder | **NOT IMPLEMENTED** |
| `/knowledge-bank` main page | All entries, search, filter | **Working** |
| `/knowledge-bank/[clientId]` | Client-specific KB wiki | **Working** |
| Chat Assistant context | Full KB entries for AI reasoning | **Working** |

**Gaps:**
1. **Knowledge Library tab on client profile is a placeholder** - says "coming soon"
2. **No summary quality scoring** - no way to flag poor summaries for re-analysis
3. **No batch re-summarization** capability
4. **Summaries limited to ~500 chars** - may miss critical details in long documents
5. **No summary templates** per document type (e.g., appraisal summary should extract different fields than a lease)

### 4.3 Dynamic Checklist System - STATUS: NOT IMPLEMENTED

**Current State:** The client profile has a "Knowledge Library" tab placeholder that mentions a checklist is "coming soon." No schema, no UI, no backend logic exists.

**What Infrastructure Exists That Could Support It:**
- `documentPlacementRules` table - routes documents by type to folders; could be extended with `isRequired`
- `folderTemplates` table - defines standard folder structures per client type
- `categorySettings` table - system-wide document categories
- Document counts per folder/client already queryable

**What Needs to Be Built:**
1. **`requiredDocuments` schema/table** - define what documents are required per client type or per deal stage
2. **Checklist evaluation logic** - compare received documents against requirements
3. **Client profile checklist UI** - visual tracker showing received vs. missing documents
4. **Dynamic rules engine** - allow admins to configure required docs per client type/deal stage
5. **Completion status API** - percentage complete, missing items list

### 4.4 Document Library - STATUS: FUNCTIONAL

**Entry Point:** `/docs` with 3-pane Google Drive-style interface

**Architecture:**
```
Left Pane:    Client/Project tree navigation
Middle Pane:  File list (sortable, searchable)
Right Pane:   File detail panel (summary, metadata, extracted data)
```

**Key Features Working:**
- Hierarchical folder organization (client -> project -> category folders)
- Configurable folder templates per client type
- Automatic document code generation: `{SHORTCODE}-{TYPE}-{INT/EXT}-{INITIALS}-{VERSION}-{DATE}`
- Document versioning (V1.0, V1.1, V2.0)
- Comments on documents
- Drag-and-drop file operations
- Batch review pages at `/docs/bulk/[batchId]`

**Document Naming Example:** `WIMBPARK28-APPRAISAL-EXT-JS-V1.0-2026-01-12`

**Gaps:**
1. **No file preview** - can't preview PDFs/images inline
2. **No download management** - no bulk download
3. **No sharing/permissions** - all users see all docs (Clerk auth partially implemented)
4. **No document expiry/renewal tracking**

---

## 5. AI Architecture Audit

### Current Stack
```
All AI calls -> Together.ai REST API
                  |
                  v
        Llama 4 Maverick 17B (primary)
        GPT-OSS-20B (secondary - reminders/tasks)
```

**No Anthropic SDK is installed.** The `together-ai` package (v0.33.0) is the only AI dependency.

### AI Operations Inventory
| Operation | Route/File | Model | Tokens | Use Case |
|-----------|-----------|-------|--------|----------|
| Document Analysis | `/api/bulk-analyze` | Llama 4 Maverick | 8K | Classification & summary |
| File Analysis | `lib/togetherAI.ts` | Llama 4 Maverick | 65K extraction, 8K analysis | Deep document analysis |
| Prospecting Context | `lib/togetherAI.ts` | Llama 4 Maverick | 12K | Sales intelligence extraction |
| Smart Pass Codification | `lib/smartPassCodification.ts` | Llama 4 Maverick | 32K | Financial item coding |
| Chat Assistant | `/api/chat-assistant` | Llama 4 Maverick | 4K | Conversational AI + tools |
| Note Generation | `/api/ai-assistant` | Llama 4 Maverick | Variable | AI note drafting |
| Task Parsing | `/api/tasks/parse` | GPT-OSS-20B | 1K | Natural language task input |
| Reminder Parsing | `/api/reminders/parse` | GPT-OSS-20B | 1K | Reminder text enhancement |

### Centralized Config (`src/lib/modelConfig.ts`)
```typescript
MODELS = { primary: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8' }
MODEL_CONFIG = {
  extraction:    { temperature: 0.2, maxTokens: 65000 },
  normalization: { temperature: 0.1, maxTokens: 65000 },
  verification:  { temperature: 0.1, maxTokens: 65000 },
  analysis:      { temperature: 0.3, maxTokens: 8000 },
  codification:  { temperature: 0.3, maxTokens: 32000 },
  chat:          { temperature: 0.7, maxTokens: 4000 },
}
```

---

## 6. Skills-Based Haiku Migration Opportunity

### Current Problem
- All AI operations use a single large model (Llama 4 Maverick 17B) via Together.ai
- No skills/routing framework - each API route handles its own LLM call
- No prompt versioning or A/B testing
- Expensive for simple operations (task parsing, title generation, classification)

### Proposed Architecture: Skills-Based with Claude Haiku

```
                    ┌─────────────────────────┐
                    │    Skill Router          │
                    │  (model selection logic) │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              v              v              v
    ┌─────────────┐  ┌────────────┐  ┌────────────────┐
    │ Haiku Skills│  │Sonnet Skills│  │ Opus Skills    │
    │ (fast/cheap)│  │ (balanced) │  │ (complex)      │
    └─────────────┘  └────────────┘  └────────────────┘
```

### Skill Mapping

| Skill | Current Implementation | Recommended Model | Rationale |
|-------|----------------------|-------------------|-----------|
| `classify-document` | bulk-analyze route | **Haiku** | Fast classification, structured output |
| `summarize-document` | bulk-analyze route | **Haiku** | Summary generation is well-scoped |
| `extract-financial-data` | togetherAI.ts extraction | **Sonnet** | Complex financial parsing |
| `parse-task` | tasks/parse route | **Haiku** | Simple NL parsing |
| `parse-reminder` | reminders/parse route | **Haiku** | Simple NL parsing |
| `generate-note-title` | ai-assistant route | **Haiku** | 30-token output, trivial |
| `generate-note-body` | ai-assistant route | **Sonnet** | Longer-form content |
| `codify-financial-item` | smartPassCodification.ts | **Sonnet** | Nuanced matching |
| `extract-prospecting-context` | togetherAI.ts | **Sonnet** | Complex intelligence extraction |
| `chat-conversation` | chat-assistant route | **Sonnet/Opus** | Multi-turn, tool-using |
| `evaluate-checklist` | NOT YET BUILT | **Haiku** | Document-vs-requirements check |

### Migration Steps
1. **Install `@anthropic-ai/sdk`** alongside `together-ai`
2. **Create `src/lib/skillRouter.ts`** - central skill dispatcher
3. **Create `src/lib/skills/` directory** - one file per skill with prompt, model config, input/output types
4. **Migrate one skill at a time**, starting with `classify-document` (highest volume, lowest complexity)
5. **Keep Together.ai as fallback** during migration; feature-flag new skills
6. **Add prompt versioning** - store prompt templates with version IDs for A/B testing

### Cost/Performance Impact (Estimated)
| Operation | Current (Together.ai) | Proposed (Haiku) | Change |
|-----------|----------------------|------------------|--------|
| Document Classification | ~$0.003/doc | ~$0.0003/doc | **10x cheaper** |
| Task Parsing | ~$0.001/task | ~$0.0001/task | **10x cheaper** |
| Summary Generation | ~$0.005/doc | ~$0.0005/doc | **10x cheaper** |
| Financial Extraction | ~$0.02/doc | ~$0.005/doc (Sonnet) | **4x cheaper** |

---

## 7. Deprecated / Out-of-V1-Scope Components

### Clearly Deprecated
| Component | Evidence | Action |
|-----------|----------|--------|
| `/projects` route | Redirects to `/clients` with deprecation comment | Can remove route entirely |
| `DocumentsTable` component | Marked deprecated in changelog | Verify no imports, then remove |
| `InternalDocumentsTable` component | Marked deprecated in changelog | Verify no imports, then remove |
| `UnclassifiedDocumentsTable` component | Marked deprecated in changelog | Verify no imports, then remove |

### Out of V1 Scope (Keep but Deprioritize)
| Feature | Why Out of Scope |
|---------|-----------------|
| Prospects / CRM | Email outreach, enrichment - not core upload flow |
| Rolodex | Contact management - not core upload flow |
| Modeling (Excel-like) | Financial modeling spreadsheets - Phase 2 feature |
| HubSpot Integration | External sync - Phase 2 feature |
| Companies House API | UK company data lookup - Phase 2 feature |
| Chat Assistant | Valuable but not V1-blocking |
| Calendar / Tasks | Supporting features, not core flow |

---

## 8. V1 Delivery Gap Analysis

### Critical Path: Upload -> Summarize -> Intelligence -> Checklist -> Library

| Step | Status | Gaps |
|------|--------|------|
| 1. Bulk Upload | **90% Complete** | Needs retry logic, progress indicators |
| 2. AI Summarization | **80% Complete** | No type-specific summary templates, no quality scoring |
| 3. Knowledge Bank Population | **85% Complete** | Auto-creates entries, but keyPoints extraction is basic |
| 4. Client Intelligence View | **70% Complete** | Knowledge tab is placeholder; overview works |
| 5. Dynamic Checklist | **0% Complete** | No schema, no UI, no backend - entirely missing |
| 6. Document Library | **90% Complete** | Functional 3-pane UI, needs minor polish |

### Priority-Ordered V1 Gaps

#### P0 - Must Have for V1
1. **Build the Dynamic Checklist System**
   - Schema: `requiredDocuments` table per client type / deal stage
   - Backend: Checklist evaluation mutations/queries
   - UI: Checklist component on client profile (replace "coming soon" placeholder)
   - Admin: Settings page to configure required documents per type

2. **Wire Knowledge Tab on Client Profile**
   - Replace placeholder with actual Knowledge Bank view (component exists at `/knowledge-bank/[clientId]`)
   - Add checklist widget showing document completion status

3. **Improve Summary Quality for Bulk Uploads**
   - Add document-type-specific prompt templates (appraisal vs. lease vs. financial statement)
   - Increase summary detail for critical document types

#### P1 - Should Have for V1
4. **Bulk Upload Reliability**
   - Add per-file retry logic on AI analysis failure
   - Add progress percentage and ETA display
   - Allow parallel processing (2-3 concurrent) for speed

5. **Skills Migration (classify-document + summarize-document)**
   - Install Anthropic SDK
   - Migrate document classification to Haiku
   - Migrate summary generation to Haiku
   - Keep Together.ai for complex operations initially

6. **Summary Re-Analysis**
   - Ability to re-run AI analysis on a filed document
   - Useful when initial summary is poor quality

#### P2 - Nice to Have for V1
7. **Document Preview** - inline PDF/image viewer in library
8. **Bulk Download** - download all documents for a client/project
9. **Checklist Notifications** - alert when checklist reaches 100% or when critical docs arrive
10. **Export Client Intelligence** - PDF/export of client knowledge bank for sharing

---

## 9. Convex Data Model Summary

### Core Tables (V1 Relevant)
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `clients` | Client records | name, shortcode, type, status |
| `projects` | Projects per client | clientId, name, projectShortcode, status |
| `documents` | Filed documents | clientId, projectId, folderId, summary, documentCode, extractedData |
| `internalDocuments` | Internal docs | linkedClientId, folderId |
| `knowledgeBankEntries` | Client intelligence | clientId, sourceType, entryType, content, keyPoints, tags |
| `bulkUploadBatches` | Upload batches | clientId, projectId, status, itemCount |
| `bulkUploadItems` | Individual files in batch | batchId, fileName, status, analysisResult |
| `clientFolders` | Client folder hierarchy | clientId, folderType, parentFolderId |
| `projectFolders` | Project folder hierarchy | projectId, folderType |
| `folderTemplates` | Folder structure templates | clientType, level, folders[] |
| `documentPlacementRules` | Auto-filing rules | clientType, documentType, targetFolderKey |
| `categorySettings` | System categories | categoryType, name, displayOrder |

### Tables for New Checklist Feature (Proposed)
```
requiredDocumentDefinitions:
  - clientType: string (or "all")
  - dealStage?: string
  - documentCategory: string
  - description: string
  - isRequired: boolean
  - priority: "critical" | "important" | "optional"
  - order: number

clientChecklistStatus:
  - clientId: Id<"clients">
  - definitionId: Id<"requiredDocumentDefinitions">
  - status: "missing" | "received" | "expired" | "waived"
  - documentId?: Id<"documents">
  - lastChecked: number
  - notes?: string
```

---

## 10. Recommended V1 Implementation Order

```
Phase 1: Checklist Foundation
  ├── Add requiredDocumentDefinitions + clientChecklistStatus to Convex schema
  ├── Build checklist evaluation query (compare received docs vs requirements)
  ├── Create admin UI for managing required document definitions
  └── Build client-facing checklist widget

Phase 2: Client Intelligence Completion
  ├── Wire Knowledge tab on client profile to actual KB view
  ├── Add checklist status widget to client overview
  ├── Add type-specific summary prompt templates
  └── Improve keyPoints extraction quality

Phase 3: Skills Migration (Haiku)
  ├── Install @anthropic-ai/sdk
  ├── Create skill router + skill definitions
  ├── Migrate classify-document to Haiku
  ├── Migrate summarize-document to Haiku
  └── Migrate evaluate-checklist to Haiku (new)

Phase 4: Polish & Reliability
  ├── Add per-file retry logic in bulk processor
  ├── Add progress indicators in bulk upload
  ├── Summary re-analysis capability
  └── Final QA pass on complete V1 flow
```

---

## 11. Files Reference Index

### Critical V1 Files
| File | Lines | Role |
|------|-------|------|
| `src/components/BulkUpload.tsx` | 833 | Bulk upload wizard UI |
| `src/components/BulkReviewTable.tsx` | 627 | Review/edit uploaded docs |
| `src/lib/bulkQueueProcessor.ts` | 338 | Sequential file processing |
| `src/app/api/bulk-analyze/route.ts` | 348 | AI analysis endpoint |
| `convex/bulkUpload.ts` | 741 | Bulk upload backend |
| `convex/documents.ts` | ~500+ | Document CRUD |
| `convex/knowledgeBank.ts` | ~400+ | Knowledge bank operations |
| `convex/schema.ts` | 900+ | Full database schema |
| `src/lib/togetherAI.ts` | 498 | AI analysis functions |
| `src/lib/modelConfig.ts` | 57 | Model configuration |
| `src/app/clients/[clientId]/page.tsx` | Large | Client profile hub |
| `src/app/docs/page.tsx` | Large | Document library |
| `src/app/knowledge-bank/page.tsx` | Large | Knowledge bank main |
| `src/types/index.ts` | Large | All TypeScript interfaces |

---

## 12. Summary

**What's working well:** The bulk upload -> analyze -> review -> file pipeline is functional end-to-end. The document library has a solid 3-pane architecture. Knowledge Bank automatically populates from filed documents. The Convex real-time backend provides a good foundation.

**What's missing for V1:** The dynamic checklist system is entirely unbuilt (the #1 gap). The Knowledge tab on client profiles is a placeholder. Summary quality varies without type-specific prompts.

**What should change architecturally:** The AI layer should migrate from Together.ai/Llama to a skills-based Anthropic (Haiku/Sonnet) architecture for better quality, lower cost, and structured skill routing. This migration can happen incrementally alongside V1 feature work.

**What to deprioritize:** Prospects/CRM, Rolodex, Modeling, HubSpot integration, and Chat Assistant are all functional but out of V1 core scope. They should be left as-is and revisited in V2.
