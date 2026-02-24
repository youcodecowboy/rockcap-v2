# V4 Filing Agent — Complete Data Flow & Storage Map

## Overview

The V4 filing agent processes uploaded documents through a 7-stage pipeline,
classifying them and routing them to the correct Convex storage locations.

This document maps every data transformation from **file upload** to
**final storage in Convex**.

---

## End-to-End Flow Diagram

```
USER (BulkUpload.tsx)
 │
 ├─ Selects: Client, Project (optional), Internal/External
 ├─ Drops files
 └─ Clicks "Start Upload"
      │
      ▼
V4 BATCH PROCESSOR (v4-batch-processor.ts)
 │
 ├─ PHASE 1: Upload files to Convex storage (parallel, 5 at a time)
 │   │  Each file → generateUploadUrl() → POST file → storageId
 │   └─ Result: Map<itemId, storageId>
 │
 ├─ PHASE 2: POST /api/v4-analyze (FormData with all files + metadata)
 │   │
 │   ▼
 │  V4 API ROUTE (v4-analyze/route.ts)
 │   │
 │   ├─ Stage 1: PREPROCESS (document-preprocessor.ts)
 │   │   Each file → filename analysis, content extraction, hint generation
 │   │   Output: BatchDocument[] with hints and processedContent
 │   │
 │   ├─ Stage 2: LOAD REFERENCES (reference-library.ts)
 │   │   System refs (36) + Convex user refs → cached 1 hour
 │   │   Output: ReferenceDocument[]
 │   │
 │   ├─ Stage 3: SELECT REFERENCES
 │   │   Tag-based scoring → top 12 most relevant refs
 │   │   Output: ReferenceDocument[] (subset)
 │   │
 │   ├─ Stage 4: LOAD SKILL (skill-loader.ts)
 │   │   document-classify/SKILL.md → instructions string
 │   │
 │   ├─ Stage 5: CLASSIFY (mock-client.ts OR anthropic-client.ts)
 │   │   │  Mock: Heuristic classification from hints + refs
 │   │   │  Live: Claude API call (batched, max 8 docs per call)
 │   │   └─ Output: DocumentClassification[] per document
 │   │
 │   ├─ Stage 6: PLACEMENT RULES (placement-rules.ts)
 │   │   Deterministic folder routing (overrides model suggestion)
 │   │   Priority: client-type override > file-type override > category default
 │   │   Output: PlacementResult per document
 │   │
 │   └─ Stage 7: RESULT MAPPING (result-mapper.ts)
 │       V4 output → Convex bulkUploadItem format
 │       Generates: document code, KB entry data, extracted data
 │       Output: MappedDocumentResult[]
 │
 ├─ PHASE 3: Map results to Convex items
 │   For each document:
 │   ├─ Check duplicates via checkForDuplicates()
 │   └─ Call updateItemAnalysis() with mapped result
 │
 └─ Update batch status → "review"
      │
      ▼
USER (BulkReviewTable.tsx)
 │
 ├─ Reviews: fileType, category, folder, confidence
 ├─ Edits any incorrect fields
 ├─ Resolves duplicates (minor/significant version)
 └─ Clicks "File All"
      │
      ▼
CONVEX FILING (bulkUpload.fileItem / fileBatch)
 │
 ├─ Creates document in 'documents' table
 ├─ Creates knowledge bank entry in 'knowledgeBank' table
 ├─ Updates batch item status to "filed"
 └─ Invalidates context cache
```

---

## Storage Map: Where Each Field Lands

### Convex `bulkUploadItems` (staging table, pre-review)

| Field | Source | V4 Origin |
|-------|--------|-----------|
| `fileStorageId` | Phase 1 upload | Convex storage |
| `summary` | Phase 2 API | `classification.summary.executiveSummary` |
| `fileTypeDetected` | Phase 2 API | `classification.classification.fileType` |
| `category` | Phase 2 API | `classification.classification.category` |
| `targetFolder` | Phase 2 API | `placement.folderKey` (from placement rules) |
| `confidence` | Phase 2 API | `classification.classification.confidence` |
| `generatedDocumentCode` | Phase 3 mapping | `{SHORTCODE}-{TYPE}-{INT/EXT}-{INITIALS}-{VERSION}-{DATE}` |
| `version` | Phase 3 mapping | "V1.0" or empty if duplicate |
| `isDuplicate` | Phase 3 duplicate check | Convex query |
| `duplicateOfDocumentId` | Phase 3 duplicate check | Convex query |
| `extractedData` | Phase 2 API | `classification.intelligenceFields` → nested JSON |

### Convex `documents` (final storage, after filing)

| Field | Source | Notes |
|-------|--------|-------|
| `fileStorageId` | From bulkUploadItem | Reference to actual file in Convex storage |
| `fileName` | Original upload | User's original filename |
| `fileSize` | Original upload | In bytes |
| `fileType` | Original upload | MIME type (application/pdf, etc.) |
| `uploadedAt` | Filing time | ISO timestamp |
| `summary` | V4 classification | Executive summary from model |
| `fileTypeDetected` | V4 classification | "RedBook Valuation", "Passport", etc. |
| `category` | V4 classification | "Appraisals", "KYC", etc. |
| `reasoning` | V4 classification | Why this classification was chosen |
| `confidence` | V4 classification | 0.0 – 1.0 |
| `clientId` | User-selected | From batch context |
| `projectId` | User-selected | From batch context (optional) |
| `documentCode` | V4 result mapper | Standardized naming convention |
| `folderId` | Placement rules | Resolved folder key |
| `folderType` | Placement rules | "client" or "project" |
| `isInternal` | User-selected | From batch isInternal flag |
| `version` | Duplicate resolution | "V1.0", "V1.1", "V2.0" |
| `extractedData` | V4 intelligence | Structured data from model |
| `status` | Filing flow | "completed" |

### Convex `knowledgeBank` (created on filing)

| Field | Source | Notes |
|-------|--------|-------|
| `clientId` | From document | Required |
| `projectId` | From document | Optional |
| `sourceType` | Fixed | "document" |
| `sourceId` | Document ID | Links back to document |
| `entryType` | Fixed | "document_summary" |
| `title` | V4 result mapper | "{fileType}: {fileName}" |
| `content` | V4 classification | Executive summary |
| `keyPoints` | V4 result mapper | Extracted from summary fields |
| `tags` | V4 result mapper | Category + fileType + folder + keyTerms |

---

## API Access Points

### POST `/api/v4-analyze`

**Request (FormData):**
```
file_0: File
file_1: File
...
metadata: JSON string {
  clientContext: { clientName, clientType },
  projectShortcode: string,
  clientName: string,
  isInternal: boolean,
  uploaderInitials: string,
  checklistItems: [],
  availableFolders: [],
}
clientType: string (backward compat)
```

**Response (JSON):**
```json
{
  "success": true,
  "isMock": false,
  "documents": [
    {
      "documentIndex": 0,
      "fileName": "valuation-report.pdf",
      "summary": "RedBook valuation for...",
      "fileType": "RedBook Valuation",
      "category": "Appraisals",
      "confidence": 0.92,
      "suggestedFolder": "appraisals",
      "generatedDocumentCode": "PROJ01-VAL-EXT-JS-V1.0-2026-02-24",
      "version": "V1.0",
      "placement": {
        "folderKey": "appraisals",
        "folderName": "Appraisals",
        "targetLevel": "project",
        "wasOverridden": false
      },
      "knowledgeBankEntry": {...},
      "isLowConfidence": false,
      "alternativeTypes": [...]
    }
  ],
  "stats": {
    "totalDocuments": 5,
    "classified": 5,
    "errors": 0,
    "lowConfidenceCount": 1,
    "placementOverrides": 0,
    "categoryCounts": {"Appraisals": 2, "KYC": 2, "Legal Documents": 1},
    "folderCounts": {"appraisals": 2, "kyc": 2, "terms_comparison": 1}
  },
  "metadata": {
    "model": "claude-haiku-4-5-20251001",
    "batchSize": 5,
    "apiCallsMade": 1,
    "totalInputTokens": 8500,
    "totalOutputTokens": 4200,
    "totalLatencyMs": 3200
  }
}
```

---

## Folder Routing Rules

### Standard Category → Folder Mapping

| Category | Folder | Level |
|----------|--------|-------|
| Appraisals | `appraisals` | project |
| Legal Documents | `terms_comparison` | project |
| Loan Terms | `terms_comparison` | project |
| Inspections | `post_completion` | project |
| Professional Reports | `appraisals` | project |
| Plans | `appraisals` | project |
| Insurance | `post_completion` | project |
| KYC | `kyc` | client |
| Communications | `notes` | project |
| Financial Documents | `background` | client |
| Other | `miscellaneous` | client |

### File Type Overrides (specific types that break the category rule)

| File Type | Folder | Level | Reason |
|-----------|--------|-------|--------|
| Cashflow | `operational_model` | project | Financial model, not appraisal |
| Bank Statement | `kyc` | client | KYC document |
| Facility Letter | `terms_comparison` | project | Part of loan terms |
| Monitoring Report | `post_completion` | project | Post-completion monitoring |
| Tax Return | `kyc` | client | KYC compliance |
| Invoice | `operational_model` | project | Operational cost tracking |

### Client Type Overrides

| Client Type | File Type | Folder | Reason |
|-------------|-----------|--------|--------|
| Lender | Indicative Terms | `terms_request` | Outgoing terms |
| Lender | Credit Backed Terms | `terms_request` | Outgoing terms |
| Borrower | Indicative Terms | `terms_comparison` | Incoming terms |
| Borrower | Credit Backed Terms | `terms_comparison` | Incoming terms |

---

## Mock Mode

When `ANTHROPIC_API_KEY` is not set, the pipeline automatically uses mock mode:

- **Classification**: Uses filename analysis, tag matching, and reference library
  to produce realistic (but not model-quality) classifications
- **Confidence**: Generally 0.60-0.92 based on hint quality
- **Placement**: Identical to live mode (same deterministic rules)
- **Latency**: ~50ms per document (vs ~2-5s per doc with live API)
- **Token usage**: Simulated realistic counts

Mock mode is designed for:
- Development without API access
- Testing the full data flow end-to-end
- Validating UI integration
- CI/CD pipelines

To switch to live mode: Set `ANTHROPIC_API_KEY` in environment variables.

---

## Caching

| Cache | TTL | Scope | Invalidation |
|-------|-----|-------|--------------|
| Reference Library | 1 hour | Server process | `clearReferenceCache()` or restart |
| Skill Instructions | Permanent | Server process | `clearSkillCache()` or restart |
| Convex Context Cache | 5 minutes | Per client/project | Auto on data change |
| Anthropic System Prompt | Per request | Anthropic-side | `cache_control: ephemeral` |

---

## File Structure

```
v4/
├── index.ts                    # Barrel exports
├── types.ts                    # All type definitions
├── V4_ARCHITECTURE.md          # Design document
├── V4_DATA_FLOW.md             # This file
├── V4_AUDIT_AND_TOOLING_PLAN.md # Audit & future plan
├── api/
│   └── v4-analyze/
│       └── route.ts            # POST /api/v4-analyze
├── lib/
│   ├── pipeline.ts             # 7-stage orchestrator
│   ├── anthropic-client.ts     # Live Anthropic API client
│   ├── mock-client.ts          # Mock client (no API key needed)
│   ├── reference-library.ts    # Shared reference library + cache
│   ├── document-preprocessor.ts # Filename analysis, content extraction
│   ├── skill-loader.ts         # SKILL.md loader
│   ├── placement-rules.ts      # Deterministic folder routing
│   ├── result-mapper.ts        # V4 output → Convex format
│   └── v4-batch-processor.ts   # Client-side batch processor
└── skills/
    └── document-classify/
        └── SKILL.md            # Classification skill
```
