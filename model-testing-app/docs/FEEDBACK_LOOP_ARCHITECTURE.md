# Filing Feedback Loop Architecture

## Overview

The self-teaching feedback loop allows the AI filing agent to learn from user corrections. When a user overrides an AI classification, that correction is stored and used to improve future classifications.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FILING FEEDBACK LOOP                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  Upload  │───▶│ Cache Check  │───▶│ AI Classify  │───▶│ Critic Agent │  │
│  │  Document│    │              │    │ (Together AI)│    │ (OpenAI)     │  │
│  └──────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│                         │                                       │          │
│                   [Cache Hit]                           [Fetch Corrections] │
│                         │                                       │          │
│                         ▼                                       ▼          │
│                  ┌──────────────┐                    ┌──────────────────┐  │
│                  │Return Cached │                    │filingCorrections │  │
│                  │Result        │                    │     Table        │  │
│                  └──────────────┘                    └──────────────────┘  │
│                                                             ▲              │
│                                                             │              │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐      │              │
│  │  User    │───▶│ Update Item  │───▶│   Capture    │──────┘              │
│  │ Corrects │    │  Details     │    │  Correction  │                     │
│  └──────────┘    └──────────────┘    └──────────────┘                     │
│                                              │                             │
│                                              ▼                             │
│                                     ┌──────────────┐                       │
│                                     │  Invalidate  │                       │
│                                     │    Cache     │                       │
│                                     └──────────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow - Step by Step

### Phase 1: Document Upload & Classification

```
User uploads file
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/bulk-analyze                                     │
│  File: src/app/api/bulk-analyze/route.ts                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Extract text from file (extractTextFromFile)            │
│                                                             │
│  2. Generate content hash                                   │
│     contentHash = generateContentHash(text.slice(0,10000))  │
│                                                             │
│  3. Check cache ◄────────────────────────────────────────┐  │
│     client.query(api.filingFeedback.checkCache)          │  │
│           │                                              │  │
│           ├── HIT: Return cached classification ─────────┘  │
│           │                                                 │
│           └── MISS: Continue to AI analysis                 │
│                                                             │
│  4. AI Classification (Together AI)                         │
│     - Filename pattern matching                             │
│     - Content analysis                                      │
│     - Category/folder suggestion                            │
│                                                             │
│  5. Fetch relevant corrections ◄─────────────────────────┐  │
│     client.query(api.filingFeedback.getRelevantCorrections) │
│     Returns past mistakes for similar documents          │  │
│                                                          │  │
│  6. Critic Agent (OpenAI GPT-4o)                         │  │
│     - Receives initial classification                    │  │
│     - Receives past corrections in prompt ◄──────────────┘  │
│     - Makes final decision, may apply learned corrections   │
│                                                             │
│  7. Store in cache (if confidence >= 70%)                   │
│     client.mutation(api.filingFeedback.cacheClassification) │
│                                                             │
│  8. Return classification result                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: User Reviews & Corrects

```
User changes classification in UI
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  Convex Mutation: bulkUpload.updateItemDetails              │
│  File: convex/bulkUpload.ts (line ~344)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Detect what changed:                                    │
│     - Compare new values to existing values                 │
│     - Track correctedFields: ["fileType", "category", etc]  │
│                                                             │
│  2. If any field changed AND item has AI classification:    │
│                                                             │
│     ┌───────────────────────────────────────────────────┐   │
│     │  INSERT into filingCorrections table              │   │
│     │                                                   │   │
│     │  {                                                │   │
│     │    sourceItemId: item._id,                        │   │
│     │    fileName: "LOC_Plan_01.pdf",                   │   │
│     │    fileNameNormalized: "loc plan #",              │   │
│     │    contentHash: "abc12345",                       │   │
│     │    contentSummary: "This is a location plan...",  │   │
│     │    aiPrediction: {                                │   │
│     │      fileType: "Site Plan",      // AI said       │   │
│     │      category: "Plans",                           │   │
│     │      targetFolder: "plans",                       │   │
│     │      confidence: 0.78                             │   │
│     │    },                                             │   │
│     │    userCorrection: {                              │   │
│     │      fileType: "Location Plans"  // User fixed    │   │
│     │    },                                             │   │
│     │    correctedFields: ["fileType"],                 │   │
│     │    correctionWeight: 1.0,                         │   │
│     │    createdAt: "2024-01-22T..."                    │   │
│     │  }                                                │   │
│     └───────────────────────────────────────────────────┘   │
│                                                             │
│  3. Invalidate cache for this content hash:                 │
│     - Find cache entries with matching contentHash          │
│     - Set isValid = false                                   │
│     - Increment correctionCount                             │
│                                                             │
│  4. Update the bulkUploadItem with new values               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: Next Similar Document Benefits

```
New similar document uploaded
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  POST /api/bulk-analyze (again)                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. AI classifies as "Site Plan" (same mistake)             │
│                                                             │
│  2. Fetch corrections:                                      │
│     getRelevantCorrections("Site Plan", "Plans", ...)       │
│                                                             │
│     Returns:                                                │
│     [{                                                      │
│       aiPrediction: { fileType: "Site Plan" },              │
│       userCorrection: { fileType: "Location Plans" },       │
│       fileName: "LOC_Plan_01.pdf",                          │
│       matchReason: "Same AI-predicted file type",           │
│       relevanceScore: 1.0                                   │
│     }]                                                      │
│                                                             │
│  3. Critic Agent prompt includes:                           │
│                                                             │
│     ┌───────────────────────────────────────────────────┐   │
│     │  ## LEARNING FROM PAST MISTAKES                   │   │
│     │                                                   │   │
│     │  ### Correction 1 (Relevance: 100%)               │   │
│     │  - Similar filename: LOC_Plan_01.pdf              │   │
│     │  - Corrections: fileType: "Site Plan" →           │   │
│     │                          "Location Plans"         │   │
│     │                                                   │   │
│     │  INSTRUCTION: If current document is similar,     │   │
│     │  apply the learned correction.                    │   │
│     └───────────────────────────────────────────────────┘   │
│                                                             │
│  4. Critic outputs "Location Plans" (learned!)              │
│                                                             │
│  5. Response includes correctionInfluence:                  │
│     {                                                       │
│       appliedCorrections: ["Correction 1"],                 │
│       reasoning: "Applied learned correction..."            │
│     }                                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `filingCorrections`
Stores every AI mistake corrected by users.

```typescript
filingCorrections: {
  // Source reference
  sourceItemId: Id<"bulkUploadItems">,

  // For retrieval/matching
  fileName: string,              // "LOC_Plan_01.pdf"
  fileNameNormalized: string,    // "loc plan #"
  contentHash: string,           // "abc12345" (for cache invalidation)
  contentSummary: string,        // First 500 chars
  clientType?: string,           // "borrower", "lender"

  // The mistake
  aiPrediction: {
    fileType: string,            // What AI predicted
    category: string,
    targetFolder: string,
    confidence: number,
    isInternal?: boolean,
    // AI-suggested checklist items
    suggestedChecklistItems?: Array<{
      itemId: string,
      itemName: string,
      confidence: number,
    }>,
  },

  // The fix
  userCorrection: {
    fileType?: string,           // What user changed it to
    category?: string,
    targetFolder?: string,
    isInternal?: boolean,
    // User's final checklist selection
    checklistItems?: Array<{
      itemId: string,
      itemName: string,
    }>,
  },

  correctedFields: string[],     // ["fileType", "category", "checklistItems"]
  correctionWeight: number,      // 1.0 (for importance ranking)

  // Metadata
  correctedBy?: Id<"users">,
  createdAt: string,
}

// Indexes for fast retrieval:
// - by_file_type: Query by AI-predicted file type
// - by_category: Query by AI-predicted category
// - by_content_hash: For cache invalidation
// - search_filename: Full-text search on normalized filename
```

### Table: `classificationCache`
Caches classification results to avoid redundant AI calls.

```typescript
classificationCache: {
  contentHash: string,           // SHA-like hash of content
  fileNamePattern: string,       // Normalized filename

  classification: {
    fileType: string,
    category: string,
    targetFolder: string,
    confidence: number,
  },

  hitCount: number,              // Times this cache was used
  lastHitAt: string,
  isValid: boolean,              // Set to false when correction made
  correctionCount: number,       // How many times invalidated

  createdAt: string,
}
```

### Table: `loraTrainingExports`
For exporting corrections as training data (future LoRA fine-tuning).

```typescript
loraTrainingExports: {
  exportName: string,
  exportedBy: Id<"users">,
  criteria: { ... },             // Filters applied
  stats: { ... },                // Counts by type/category
  exportFormat: "openai_chat" | "together_chat" | "alpaca",
  exportFileStorageId?: Id<"_storage">,
  status: "pending" | "generating" | "completed" | "error",
}
```

---

## Key Files

| File | Purpose |
|------|---------|
| `convex/schema.ts` | Defines the 3 new tables |
| `convex/filingFeedback.ts` | All feedback loop queries/mutations |
| `convex/bulkUpload.ts` | `updateItemDetails` captures corrections |
| `src/app/api/bulk-analyze/route.ts` | Cache check, corrections fetch, Critic integration |
| `src/components/BulkReviewTable.tsx` | "Training" badge UI |

---

## Query Flow: `getRelevantCorrections`

```typescript
// File: convex/filingFeedback.ts

getRelevantCorrections(fileType, category, fileName, limit=5)
    │
    ├─► Query by file type (priority 1, score 1.0)
    │   "Same AI-predicted file type was corrected before"
    │   Take up to 2 matches
    │
    ├─► Query by category (priority 2, score 0.8)
    │   "Same AI-predicted category was corrected before"
    │   Take up to 2 matches (excluding file type matches)
    │
    └─► Search by filename pattern (priority 3, score 0.7)
        "Similar filename pattern was corrected before"
        Uses full-text search on fileNameNormalized
        Take up to 1 match

    Return: Top 5 corrections sorted by relevanceScore
```

---

## Token Cost Optimization

| Scenario | Token Impact |
|----------|-------------|
| Cache hit | **0 tokens** - Skip AI entirely |
| High confidence (>95%) | **0 extra** - Skip corrections fetch |
| Normal with 5 corrections | **+300-500 tokens** |
| Expected cache hit rate | **40-60%** after warmup |

The cache and confidence-based skipping means the feedback loop often **reduces** total token usage.

---

## UI Indicator

When user edits trigger correction capture, a "Training" badge appears:

```tsx
// File: src/components/BulkReviewTable.tsx

{item.userEdits && Object.values(item.userEdits).some(Boolean) && (
  <Badge className="bg-purple-50 text-purple-700">
    <Brain className="w-3 h-3 mr-1" />
    Training
  </Badge>
)}
```

Tooltip shows which fields were corrected and explains the AI is learning.
