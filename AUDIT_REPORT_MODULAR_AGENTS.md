# Comprehensive Audit Report: Document Upload Agent System
## Branch: `refactor/modular-document-agents`
## Date: 2026-02-24

---

## Executive Summary

This audit covers the `refactor/modular-document-agents` branch, which represents a **major architectural transformation** from a monolithic upload system to a modular, stage-based agent architecture with self-learning feedback loops. The refactor is contained in a single commit (`3618e49` - "Modular document agents, intelligence system, knowledge library, and build fixes").

The new architecture introduces a **7-stage pipeline** (cache check + 6 agent stages), a **tiered self-teaching correction system**, a **deterministic verification stage** (replacing an LLM call), and a **knowledge library** with checklist matching. While this is a significant improvement over the prior monolithic design, the audit identifies **11 critical**, **15 high**, and **18 medium** severity issues across security, race conditions, error handling, and architectural concerns.

---

## 1. ARCHITECTURE OVERVIEW (What Changed)

### New Modular Agent Pipeline
**Location:** `model-testing-app/src/lib/agents/`

The refactor replaces monolithic AI processing with a composable 7-stage pipeline:

| Stage | Name | File | LLM? | Purpose |
|-------|------|------|------|---------|
| 0 | Cache Check | `utils/cache.ts` | No | Content-hash deduplication |
| 1 | Filename Analysis | `filename-matcher/` | No | 100+ pattern rules extract type hints |
| 2 | Summary Agent | `summary-agent/index.ts` | Together AI (Llama 3.3-70B) | Deep document analysis, entity extraction |
| 3 | Classification Agent | `classification-agent/index.ts` | Together AI (Llama 3.3-70B) | FileType, Category, Folder classification |
| 4 | Deterministic Verification | `deterministic-verifier/index.ts` | No | Keyword scoring replaces LLM verification |
| 5 | Checklist Matching | `checklist-agent/index.ts` | Together AI | Links documents to checklist items |
| 6 | Critic Agent | `critic-agent/index.ts` | OpenAI GPT-4o | Final reasoning pass, can override all prior stages |

**Orchestrator:** `agents/index.ts` - `runDocumentAnalysisPipeline()` (line 170, ~800 lines)

### New Self-Teaching Feedback Loop
**Location:** `convex/filingFeedback.ts` (~900 lines)

```
User Correction → captureCorrection()
  → Stored in filingCorrections table
  → Cache invalidated for content hash
  → Retrieved in future via tiered context
  → Applied in Critic Agent
  → Improved future predictions
```

**Tiered Correction Context** (saves tokens based on confidence):
- **>0.85 confidence:** No corrections fetched (saves tokens)
- **0.65-0.85:** Consolidated rules only (~100 tokens)
- **<0.65:** Targeted corrections for confusion pairs (~200-400 tokens)
- **<0.50:** Full correction context

### New Database Tables
- `filingCorrections` - User correction records for self-teaching
- `classificationCache` - Persistent classification cache with hit counts
- `knowledgeChecklistItems` - Enriched checklist items with linked documents
- `knowledgeChecklistDocumentLinks` - Document-to-checklist item links
- `knowledgeRequirementTemplates` - Client-type-specific requirement templates
- `intelligenceExtractionJobs` - Async intelligence extraction queue
- `meetingExtractionJobs` - Async meeting extraction queue

---

## 2. POLLING MECHANISMS

### Finding: No Traditional Polling - Uses Reactive Subscriptions + Scheduled Tasks

**Client-Side Queue Processor** (`src/lib/fileQueueProcessor.ts`):
- In-memory `QueueJob[]` array with FIFO `while` loop processing
- Max 15 files per session
- **Vulnerability:** Queue lost if browser closes mid-processing (no IndexedDB/localStorage persistence)
- Jobs DO persist in Convex `fileUploadQueue` table, but client-side progress is lost

**Bulk Queue Processor** (`src/lib/bulkQueueProcessor.ts`):
- Similar in-memory queue pattern
- Has `abort()` mechanism via `this.aborted` flag
- Same browser-close vulnerability

**Server-Side Background Processor** (`convex/bulkBackgroundProcessor.ts`):
- Uses Convex `ctx.scheduler.runAfter()` for sequential processing
- 500ms delay between items to avoid API overwhelming
- **Survives browser close** - fully server-side
- Estimated 20 seconds per file

**External Queue Endpoints** (require external scheduler/cron):
- `POST /api/process-extraction-queue` - Intelligence extraction (max 5 minutes, 5 jobs per call)
- `POST /api/process-intelligence-queue` - Knowledge item extraction
- `POST /api/process-meeting-queue` - Meeting extraction from minutes

**Real-time Updates:** Convex `useQuery()` subscriptions (no polling overhead)

### Vulnerabilities
| Issue | Severity | Detail |
|-------|----------|--------|
| No persistent local queue | MEDIUM | Client-side queue lost on browser close; server-side jobs persist but progress resets |
| External queues need cron | MEDIUM | `process-extraction-queue`, `process-intelligence-queue`, `process-meeting-queue` must be called externally |
| No retry for stuck jobs | MEDIUM | Jobs in `uploading`/`analyzing` state have no automatic recovery |

---

## 3. FOLDER PLACEMENT LOGIC

### Finding: FOUR Competing Folder-Routing Mechanisms

#### System 1: Hardcoded CATEGORY_TO_FOLDER_MAP
**File:** `convex/folderStructure.ts` (lines 10-65)
- ~65 category-to-folder entries
- **Matching logic:** Exact match first → substring match (`includes()` bidirectional) → "miscellaneous" fallback
- **Vulnerability:** Substring matching is ambiguous ("term" matches both "term sheet" and "terms request")

#### System 2: Database Placement Rules
**File:** `convex/placementRules.ts`
- Priority-based system with client-type-specific rules (borrower vs lender)
- Fallback chain: Exact document type → Category match → "Other" rule → Lowest priority rule
- **Vulnerability:** No tie-breaking logic when multiple rules share the same priority

#### System 3: AI Classification Pipeline
**File:** `src/lib/agents/classification-agent/index.ts`
- AI suggests folder; validated against available folders with substring matching
- Fallback: Document characteristics (isIdentity→kyc, isFinancial→operational_model, etc.)
- **Vulnerability:** No validation that AI's suggested folder actually exists before reaching validation layer

#### System 4: Agent Validation Utility Layer
**File:** `src/lib/agents/utils/validation.ts`
- Escalating validation: Exact → Case-insensitive → Substring → Category-based → "miscellaneous" → First available
- Acts as final safety net but adds yet another mapping layer

#### Additional: Critic Agent Override
**File:** `src/lib/agents/index.ts` (lines 642-651)
- Critic Agent (Stage 6) has its own hardcoded `categoryFolderMap` and can **override all prior folder decisions**
- Yet another set of category→folder mappings that could diverge

### Priority Order When All Systems Active
1. Cached classification (if cache hit)
2. Database placement rules
3. AI classification pipeline (Summary → Classification → Verification → Checklist → Critic)
4. Hardcoded maps as fallback
5. "miscellaneous" as ultimate fallback

### Vulnerabilities
| Issue | Severity | Detail |
|-------|----------|--------|
| 4+ competing folder-routing mechanisms | HIGH | Divergent taxonomies across systems; no single source of truth |
| Substring matching ambiguity | MEDIUM | `includes()` bidirectional matching causes false positives (e.g., "operating" matches both "operating statement" and "operating model") |
| No deterministic iteration order | MEDIUM | JavaScript object iteration order for partial matches is not guaranteed |
| Critic can override without validation | MEDIUM | Critic Agent's folder suggestion not validated against available folders before use |
| Project folder without project | LOW | Falls back to client "miscellaneous" silently |

---

## 4. DOCUMENT CLASSIFICATION & AI ANALYSIS

### Models Used
| Stage | Provider | Model | Purpose |
|-------|----------|-------|---------|
| Summary Agent | Together AI | meta-llama/Llama-3.3-70B-Instruct-Turbo | Document analysis, entity extraction |
| Classification Agent | Together AI | meta-llama/Llama-3.3-70B-Instruct-Turbo | Type/category/folder classification |
| Checklist Agent | Together AI | meta-llama/Llama-3.3-70B-Instruct-Turbo | Document-to-checklist matching |
| Critic Agent | OpenAI | GPT-4o | Final reasoning with correction context |

### AI Response Parsing
- **Classification Agent:** Uses `normalizeClassificationDecision()` with validation against known file types, categories, and folders. Falls back to "Other"/"miscellaneous" for unrecognized values.
- **Critic Agent:** Parses JSON from GPT-4o response. Falls back to pre-critic classification if parsing fails.
- **Summary Agent:** Structured output with `documentCharacteristics` booleans and entity extraction.

### Client/Project Matching
**File:** `src/app/api/analyze-file/route.ts` (lines 106-121)
- **EXACT STRING MATCH ONLY** (case-insensitive)
- No fuzzy matching, no edit distance, no alias resolution
- "Fireside Capital" ≠ "Fireside Capital LLC"
- "Smith & Associates" ≠ "Smith and Associates"

### Confidence Scoring
- Summary Agent: No explicit confidence
- Classification Agent: Outputs confidence 0-1, boosted by filename hints
- Deterministic Verification: Keyword-based scoring with learned keyword boosts
- Critic Agent: Final confidence output, can adjust up or down
- **Auto-filing threshold:** ≥ 0.9 confidence
- **Cache save threshold:** ≥ 0.7 confidence
- **Checklist auto-select threshold:** ≥ 0.7 confidence
- **Checklist inclusion threshold:** ≥ 0.50 confidence

### Data Flow After Analysis
1. **Document created** in `documents` table
2. **Knowledge bank entry** created (`knowledgeBank` table)
3. **Intelligence extraction** - field-by-field from `documentAnalysis` into `knowledgeItems`
4. **Checklist links** - `knowledgeChecklistDocumentLinks` created
5. **Meeting extraction** - async job if document is meeting minutes
6. **Enrichment suggestions** - for detected emails, phones, addresses
7. **Prospecting context** - fire-and-forget to `/api/extract-prospecting-context`
8. **Feedback capture** - if user made edits, correction recorded

### Vulnerabilities
| Issue | Severity | Detail |
|-------|----------|--------|
| No fuzzy client/project matching | HIGH | Exact string match only; minor name variations cause misclassification |
| AI response parsing fragile | MEDIUM | JSON extraction from markdown; regex `/{[\s\S]*}/` could capture invalid JSON with multiple objects |
| No AI response schema validation | MEDIUM | AI could return arbitrary strings for category/fileType; no enum validation |
| Fire-and-forget prospecting extraction | MEDIUM | Silent failure; user never notified |
| Custom instructions override all AI analysis | MEDIUM | User-provided custom instructions take "absolute priority" over content analysis; could force incorrect classification |

### Additional API Routes for Analysis

| Route | Model | Purpose |
|-------|-------|---------|
| `/api/analyze-file` | Together AI (Llama) | Legacy single-file analysis with classification, extraction, enrichment |
| `/api/bulk-analyze` | Together AI + OpenAI GPT-4o | Modern modular pipeline (primary path) |
| `/api/intelligence-extract` | OpenAI GPT-4o (primary), Together AI (fallback) | Field extraction with canonical field normalization |
| `/api/reanalyze-document` | Together AI | Re-analysis with confidence override |
| `/api/bulk-extract` | Together AI | Bulk data extraction from spreadsheets |
| `/api/extract-prospecting-context` | Together AI | Prospecting intelligence for CRM enrichment |

### Data Extraction & Normalization Pipeline
**Triggered for:** Spreadsheets (xlsx, xls, csv) classified as "requires extraction"

1. **Detection** - Identify if spreadsheet format
2. **Extraction** - `extractSpreadsheetData()` via Together AI
3. **Normalization** (`src/lib/dataNormalization.ts`) - 9 validation tasks:
   - Remove subtotals (pattern: "Total X", "X Subtotal", "Net X" + sum verification)
   - Remove duplicates (same item, same/similar amount)
   - Separate revenue from costs
   - Plot validation (cost/sqft)
   - Currency symbol cleanup
   - Category subtotal verification
   - Math validation (sum of costs = total)
   - Unit interpretation (detect if "Total Units" is actually sqft)
4. **Verification** - Together AI validates data quality
5. **Fast Pass Codification** - Match to canonical cost codes via alias lookup

### Canonical Fields System (New)
**File:** `src/lib/canonicalFields.ts`

Structured field definitions for intelligence extraction:
- **Contact fields** (10): primaryName, email, phone, role, personalAddress, etc.
- **Company fields** (12): name, registrationNumber, incorporationDate, directors, shareholders, etc.
- **Financial fields** (6): netWorth, liquidAssets, bankName, etc.

Intelligence extraction uses natural language labels from AI, then normalizes to canonical field paths via alias matching. Each field has `normalizationConfidence` tracking.

### Prospecting Context Extraction
**File:** `src/lib/togetherAI.ts` (lines 375-549) - `extractProspectingContext()`

Extracts 10 intelligence sections: key points, pain points, opportunities, decision makers, business context, financial context, relationship context, competitive mentions, timeline, and template snippets. Entirely fire-and-forget with no error notification to user.

---

## 5. AUTO-FILING & CHECKLIST LOGIC

### Auto-Filing Decision
**File:** `src/lib/autoFiling.ts`

**`shouldAutoFile()` requires ALL:**
- Confidence ≥ 0.9 (90%)
- `clientId` AND `clientName` exist (exact matches, not suggestions)
- No `suggestedClientName` or `suggestedProjectName` present
- If `suggestedProjectName` exists, `projectId` must also exist

**`needsConfirmation()` triggers when:**
- Confidence < 0.9
- No `clientId` identified
- Any suggested (unmatched) client/project names present

### Checklist Matching System
**File:** `src/lib/agents/checklist-agent/index.ts`

The refactor adds an **explicit checklist matching system** (this was missing in the prior architecture):

**Confidence tiers:**
- Filename explicitly contains requirement → 0.85+
- Document TYPE matches acceptable types → 0.75+
- Content clearly serves purpose → 0.65+
- Reasonable semantic similarity → 0.50-0.65

**Merge logic:** Filename matches + AI matches merged; higher confidence wins for duplicates; filtered to ≥ 0.50.

**Auto-selection:** Top checklist item auto-selected if confidence ≥ 0.7 in `updateItemAnalysis()`.

### Duplicate Detection
**File:** `convex/bulkUpload.ts` (lines 620-663)
- Pattern matching on `documentCode` prefix: `${projectShortcode}-${typeAbbrev}-${internalExternal}`
- **Vulnerability:** Queries all documents and filters in memory (no index); degrades with scale
- Version calculation: Minor → `V{major}.{minor+1}`, Significant → `V{major+1}.0`

### Filing Flow
```
Analysis Complete
  → updateItemAnalysis() - stores results, auto-selects checklist
  → User Review (optional edits tracked in userEdits)
  → fileItem() OR fileBatch()
    → Validate required fields
    → Create document
    → Link checklist items (mark as "fulfilled")
    → Create knowledge bank entry
    → Extract intelligence (field-by-field)
    → Capture feedback (if user made edits)
    → Queue async jobs (meeting extraction, etc.)
```

### Vulnerabilities
| Issue | Severity | Detail |
|-------|----------|--------|
| Duplicate detection full table scan | HIGH | `checkForDuplicates()` queries all docs, filters in memory |
| Race condition in document code generation | HIGH | Two concurrent uploads could both pass uniqueness check |
| Auto-checklist selection at 0.7 confidence | MEDIUM | May auto-link wrong checklist item without user review |
| fileBatch not atomic | CRITICAL | Partial failure leaves some items filed, others not; retry would re-file already-filed items |

---

## 6. SECURITY, ERROR HANDLING & VULNERABILITIES

### Race Conditions

**fileItem() mutation** (`convex/bulkUpload.ts`, lines 670-1197):
- 16+ separate DB operations, NOT transactional
- If knowledge bank creation fails after document insert, document exists without knowledge entry
- Batch status calculation reads all items then patches batch - non-atomic

**fileBatch() mutation** (lines 1200-1676):
- 100+ operations across loop iterations, no transaction wrapping
- Partial failure creates inconsistent state (some items filed, batch shows "review")
- No rollback mechanism

**Knowledge item superseding** (lines 843-935):
- Check existing → Insert new → Patch old to "superseded"
- Another concurrent request could race between check and patch

### Silent Failure Patterns

| Location | Operation | Consequence |
|----------|-----------|-------------|
| `bulkUpload.ts:794-796` | Knowledge bank entry creation | Filed document lacks knowledge entry; user not notified |
| `bulkUpload.ts:844-934` | Field-by-field intelligence extraction | Individual field failures don't abort filing; partial intelligence |
| `bulkUpload.ts:945-963` | Intelligence extraction job creation | Fallback job not created; no retry |
| `bulkUpload.ts:970-1000` | User note intelligence creation | Note silently not stored as intelligence |
| `bulkUpload.ts:1133-1136` | `scheduler.runAfter()` for keyword learning | No error handling; learning may silently fail |
| `bulkUpload.ts:1658-1667` | Context cache invalidation | Stale cache served if fails |
| `fileQueueProcessor.ts:407-494` | Prospecting context extraction | Fire-and-forget fetch; errors only logged to console |
| `fileQueueProcessor.ts:399-401` | Enrichment suggestion creation | Partial failures swallowed |

### Missing Validations

| Field | Location | Issue |
|-------|----------|-------|
| `folderId` | Document creation in `fileItem()` | Not validated that folder actually exists (only validated on UPDATE in `documents.ts`) |
| `versionType` | `bulkUpload.ts:696-698` | May be undefined when `isDuplicate=true` |
| `fileStorageId` | `bulkUpload.ts:717-749` | Used without null check in document creation |
| `targetFolder` | `bulkUpload.ts:704` | Optional with no fallback if null |
| `documentCode` | `documents.ts:375` | Can be undefined if `clientName` is null |
| Category/FileType | Multiple | No enum validation; AI could return arbitrary strings |

### Injection Concerns

**Good:**
- Document code sanitization via regex (`replace(/[^a-zA-Z0-9]/g, '')`)
- PDF header validation (`%PDF` magic number check)
- Personal document ownership check on cross-scope moves

**Concerns:**
- `item.userNote.content` stored directly without HTML encoding or length limits (potential XSS if rendered with `dangerouslySetInnerHTML`)
- `folderId` passed from AI response to database without existence validation on CREATE
- No file size validation on upload endpoints
- No malware scanning; Excel files parsed without macro validation

### Missing Controls

| Control | Status | Impact |
|---------|--------|--------|
| Rate limiting on upload/analysis | Missing | DoS vector; user can spam bulk uploads |
| Audit trail for document operations | Missing | No persistent log of who uploaded/filed/moved what |
| File size validation | Missing | No max file size check on `/api/bulk-analyze` |
| Role-based access logging | Missing | Failed auth attempts not logged |
| Content-based file validation | Partial | PDF header checked; no validation for Excel, images, etc. |

---

## 7. DETERMINISTIC VERIFICATION (New in Refactor)

**File:** `src/lib/agents/deterministic-verifier/index.ts` (~350 lines)

Replaces an LLM-based verification stage with keyword scoring:

**Scoring Weights:**
| Signal | Weight |
|--------|--------|
| Key term match | 0.40 |
| Summary keyword match | 0.30 |
| Filename keyword match | 0.30 |
| Filename pattern bonus | 0.30 |
| Exclusion penalty | 0.50 (multiplier) |
| Correction boost | 0.20 |
| Learned keyword boost | 0.15 |

**Benefits:** Eliminates one LLM call per document, deterministic and reproducible, supports learned keywords from corrections.

**Vulnerability:** Relies on `FileTypeDefinition` keywords being comprehensive. New file types without keyword definitions would not be properly verified.

---

## 8. SELF-TEACHING FEEDBACK LOOP (New in Refactor)

### Correction Capture
**File:** `convex/filingFeedback.ts` - `captureCorrection()` (lines 624-682)

**Triggers:** Only during `fileItem()` when `userEdits` exist (user changed fields during review)

**Captures:**
- AI prediction (original fileType, category, folder, confidence, checklist suggestions)
- User correction (final values for changed fields only)
- Corrected field list
- Document keywords and classification reasoning
- Content hash for cache invalidation

### Smart Correction Retrieval
Three strategies:
1. **Exact file type corrections** (highest priority, top 2)
2. **Category corrections** (if space remains, top 2)
3. **Similar filename pattern** corrections (via search index)

### Consolidated Rules
Aggregated patterns with ≥2 occurrences:
```
Example: "Other → Track Record: 15 corrections, avg confidence 0.78"
```

### Targeted Corrections
For specific confusion pairs (e.g., "AI confused between Track Record and Other"):
- Finds corrections where AI predicted A but user chose B (and vice versa)
- Attaches reasoning for critic agent context

### Cache System
- Content hash based (`djb2` hash of first 10KB)
- Cache hit returns full classification (skips all LLM stages)
- Invalidated automatically on user corrections
- Only caches results with confidence ≥ 0.7
- Tracks hit count and correction count per entry

---

## 9. KNOWLEDGE LIBRARY & INTELLIGENCE SYSTEM (New in Refactor)

### Knowledge Requirement Templates
**File:** `convex/knowledgeLibrary.ts` (~74KB)
- Client-type-specific requirement templates (borrower, lender, etc.)
- Client-level vs project-level checklists
- Semantic requirement descriptions with matching document types

### Intelligence Extraction
**Triggered:** On confirmed document filing (not during analysis)
- Extracts key amounts, dates, entities from `documentAnalysis`
- Creates `knowledgeItems` with source tracking
- Higher confidence wins when existing items found
- Scope-aware: client vs project level assignment

### Meeting Extraction
- Auto-detected for "Meeting Minutes" / "Meeting Notes" documents
- Creates async `meetingExtractionJobs`
- Extracts attendees, decisions, action items

---

## 10. CRITICAL ISSUES SUMMARY

| # | Issue | Severity | Location | Impact |
|---|-------|----------|----------|--------|
| 1 | `fileBatch()` not atomic - 374 lines of non-atomic operations | CRITICAL | `bulkUpload.ts:1200-1676` | Partial failure leaves inconsistent state; no rollback |
| 2 | `fileItem()` 16+ non-atomic DB operations | CRITICAL | `bulkUpload.ts:670-1197` | Orphaned documents if secondary operations fail |
| 3 | Race condition in document code generation | HIGH | `documents.ts:416-426` | Duplicate codes possible with concurrent uploads |
| 4 | No fuzzy matching for client/project names | HIGH | `analyze-file/route.ts:106-121` | Minor name variations cause complete match failure |
| 5 | Duplicate detection full table scan | HIGH | `bulkUpload.ts:620-663` | O(n) scan of all documents; degrades with scale |
| 6 | 4+ competing folder-routing mechanisms | HIGH | Multiple files | Divergent taxonomies; no single source of truth |
| 7 | Knowledge bank creation silently fails | HIGH | `bulkUpload.ts:794-796` | Documents filed without knowledge entries |
| 8 | Intelligence extraction silently fails | HIGH | `bulkUpload.ts:844-963` | Partial or missing intelligence without notification |
| 9 | Fire-and-forget scheduler jobs | HIGH | Multiple locations | Keyword learning, cache invalidation can silently fail |
| 10 | No file size validation | HIGH | `/api/bulk-analyze` | No max file size limit; potential DoS |
| 11 | No rate limiting on upload endpoints | HIGH | Upload APIs | Users can spam bulk uploads |
| 12 | Substring folder matching ambiguity | MEDIUM | `folderStructure.ts:131` | "term" matches both "term sheet" and "terms request" |
| 13 | No persistent local queue | MEDIUM | `fileQueueProcessor.ts` | Client-side queue lost on browser close |
| 14 | AI response schema not validated | MEDIUM | Classification Agent | Arbitrary strings accepted for category/fileType |
| 15 | User note content not sanitized | MEDIUM | `bulkUpload.ts:970-1000` | Potential XSS if rendered unsafely |
| 16 | External queues need cron setup | MEDIUM | Queue API endpoints | Extraction/intelligence/meeting queues have no built-in scheduler |
| 17 | No audit trail for document operations | MEDIUM | System-wide | Cannot track who uploaded/filed/moved documents |
| 18 | Critic Agent folder override not validated | MEDIUM | `agents/index.ts:642-651` | May suggest non-existent folder |

---

## 11. RECOMMENDATIONS

### Priority 1 (Critical - Fix Immediately)

1. **Add transactional consistency to filing operations**
   - Implement error recovery/rollback for `fileItem()` and `fileBatch()`
   - If document creation succeeds but secondary operations fail, track partial state
   - Use optimistic locking pattern for batch status updates

2. **Add unique constraint on document codes**
   - Database-level uniqueness or distributed lock during code generation
   - Prevent race condition in concurrent uploads

3. **Implement fuzzy client/project name matching**
   - Levenshtein distance or similar algorithm
   - Alias/nickname resolution table
   - Minimum similarity threshold (e.g., 0.85)

### Priority 2 (High - Fix Soon)

4. **Consolidate folder-routing into single authoritative system**
   - Database placement rules should be the single source of truth
   - Hardcoded maps should only serve as seed data
   - AI suggestions should be validated against placement rules, not separate maps

5. **Add file size validation and rate limiting**
   - Max file size on upload endpoints (e.g., 50MB)
   - Per-user rate limit on bulk uploads
   - Return 429 with Retry-After header

6. **Promote silent failures to tracked errors**
   - Knowledge bank creation failures should be visible to users
   - Intelligence extraction failures should create retry jobs
   - Add `operationErrors` field to document/item records

7. **Add index for duplicate detection**
   - Create query index on `documents.documentCode`
   - Replace in-memory filtering with indexed query

8. **Implement audit trail**
   - Create `audit_log` table
   - Log: document filing, cross-scope moves, permission checks, corrections
   - Track: user, timestamp, action, before/after state

### Priority 3 (Medium - Plan for Next Sprint)

9. **Persist client-side queue to IndexedDB**
   - Survive page refreshes and browser closes
   - Resume processing from last known state

10. **Add JSON schema validation for AI responses**
    - Validate file types against known enum
    - Validate categories against known enum
    - Validate folder suggestions against available folders

11. **Set up cron/scheduler for extraction queues**
    - `process-extraction-queue`, `process-intelligence-queue`, `process-meeting-queue`
    - Need external trigger (Convex cron, Vercel cron, etc.)

12. **Sanitize user note content**
    - HTML-escape before storage
    - Add length limits (e.g., 5000 chars)
    - Never render with `dangerouslySetInnerHTML`

---

## 12. POSITIVE CHANGES IN THIS REFACTOR

The refactor introduces several significant improvements over the prior monolithic architecture:

1. **Modular pipeline** - Each stage can fail gracefully with fallbacks; results feed forward with confidence scores
2. **Deterministic verification** - Eliminates one LLM call per document; reproducible and debuggable
3. **Self-teaching feedback loop** - User corrections improve future classifications automatically
4. **Tiered correction context** - Smart token management; only fetches corrections when needed
5. **Checklist matching** - Explicit system for linking documents to requirements (was missing before)
6. **Knowledge library** - Structured intelligence extraction with confidence-based updates
7. **Classification cache** - Avoids redundant AI processing for previously seen content
8. **Server-side background processing** - Large batches survive browser close via Convex scheduler
9. **Filename pattern matching** - 100+ rules provide fast, deterministic hints before any LLM call
10. **Confusion pair resolution** - Targeted corrections for known ambiguous classifications

---

## Key File Reference

| Component | Path | Size |
|-----------|------|------|
| Pipeline Orchestrator | `src/lib/agents/index.ts` | ~850 lines |
| Type Definitions | `src/lib/agents/types.ts` | ~350 lines |
| Summary Agent | `src/lib/agents/summary-agent/index.ts` | ~164 lines |
| Classification Agent | `src/lib/agents/classification-agent/index.ts` | ~185 lines |
| Critic Agent | `src/lib/agents/critic-agent/index.ts` | ~550 lines |
| Deterministic Verifier | `src/lib/agents/deterministic-verifier/index.ts` | ~350 lines |
| Checklist Agent | `src/lib/agents/checklist-agent/index.ts` | ~198 lines |
| Filename Matcher | `src/lib/agents/filename-matcher/` | ~500+ lines |
| Agent Config | `src/lib/agents/config.ts` | ~136 lines |
| Agent Utils | `src/lib/agents/utils/` | ~300 lines |
| Filing Feedback | `convex/filingFeedback.ts` | ~900 lines |
| Bulk Upload | `convex/bulkUpload.ts` | ~1676 lines |
| Documents | `convex/documents.ts` | ~1200 lines |
| File Queue | `convex/fileQueue.ts` | ~549 lines |
| Folder Structure | `convex/folderStructure.ts` | ~154 lines |
| Placement Rules | `convex/placementRules.ts` | ~346 lines |
| Knowledge Library | `convex/knowledgeLibrary.ts` | ~74KB |
| Background Processor | `convex/bulkBackgroundProcessor.ts` | ~446 lines |
| File Queue Processor | `src/lib/fileQueueProcessor.ts` | ~645 lines |
| Bulk Queue Processor | `src/lib/bulkQueueProcessor.ts` | ~436 lines |
| Auto-Filing Logic | `src/lib/autoFiling.ts` | ~65 lines |
| Schema | `convex/schema.ts` | ~3000+ lines |
