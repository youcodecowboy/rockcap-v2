# V4 Skills Architecture

## Overview

V4 replaces the multi-stage Together.ai/OpenAI pipeline with a skills-based architecture following the [Anthropic Agent Skills standard](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). The core principle: Claude is multimodal — send it the document directly instead of extracting text through 3+ layers of normalization.

## Architecture Comparison

```
CURRENT (v1 — 4-6 LLM calls, ~30s/doc, 3 providers):
  PDF → text extract → markdown → Summary Agent (Together.ai)
    → Classification Agent (Together.ai) → Deterministic Verifier
    → Checklist Agent (Together.ai) → Critic Agent (OpenAI GPT-4o)

V4 (1-2 LLM calls, ~5-10s/batch of 5-8 docs):
  Batch of docs → Pre-process (no LLM)
    → Select references by tags
    → Single Claude call (multimodal + references)
    → Structured JSON output for all docs
    → If any ambiguous → Sonnet critic (rare)
```

## Key Design Decisions

### 1. Shared Reference Library (Not Per-Skill)

References are **NOT locked to individual skills**. Instead, a shared Reference Library with a tagging system allows any skill to query relevant references. A lightweight orchestrator selects references based on document hints (filename patterns, content keywords).

```
User uploads "RedBook_Valuation_2024.pdf"
  → Pre-processor generates hints: tags=['appraisals', 'valuation']
  → Orchestrator queries: references WHERE tags OVERLAP ['appraisals', 'valuation']
  → Selects: RedBook Valuation ref, Appraisal ref, Cashflow ref
  → Only these 3 refs go into the API call (not all 55)
```

### 2. Batch Processing

**Never call the API per-file.** Multiple documents are batched into single API calls:

| Batch Size | API Calls | Strategy |
|-----------|-----------|----------|
| 1-5 docs | 1 call | Foreground, immediate |
| 6-8 docs | 1 call | Foreground, single batch |
| 9-16 docs | 2 calls | Foreground, 2 chunks |
| 17+ docs | 3+ calls | Background, chunked |

**Batch limits per call:**
- Max 8 documents per API call
- Max ~80K input tokens per call
- ~3K tokens per truncated document
- ~5K tokens for reference context
- ~3K tokens for system prompt

**Cost comparison (15 documents):**
| Approach | API Calls | Input Tokens | Output Tokens | Est. Cost |
|----------|-----------|-------------|---------------|-----------|
| Current (per-doc) | 15 × 4 = 60 | ~900K | ~120K | ~$1.25 |
| V4 (batched) | 2 | ~100K | ~30K | ~$0.07 |

### 3. Smart Truncation

Large documents (30-50+ pages) are truncated before sending:
- **Text documents**: First 3000 chars + last 1000 chars (captures header/intro + conclusion/signatures)
- **PDFs**: Sent as document blocks (Anthropic handles page extraction internally)
- **Images**: Sent directly as base64
- **Spreadsheets**: Sheet names + headers + first 5 rows per sheet

This keeps per-document token cost at ~3K instead of 20-30K.

### 4. 1-Hour Reference Cache

Since only a few internal users access the system:
- Reference library loaded once, cached in memory for 1 hour
- Cache cleared when user adds/edits a reference
- No complex invalidation — just time-based TTL
- System references (filesystem) never change during runtime
- Convex references (user-created) refresh on next cache miss

### 5. Anthropic Agent Skills Standard

Skills follow the [official specification](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview):

```
v4/
├── skills/
│   ├── document-classify/
│   │   ├── SKILL.md           # Classification instructions (Level 2)
│   │   └── references/        # (empty — refs in shared library)
│   ├── checklist-match/
│   │   └── SKILL.md           # Checklist matching instructions
│   ├── intelligence-extract/
│   │   └── SKILL.md           # Intelligence extraction instructions
│   └── document-summarize/
│       └── SKILL.md           # Deep summarization instructions
├── lib/
│   ├── pipeline.ts            # Main orchestrator
│   ├── anthropic-client.ts    # Anthropic SDK wrapper
│   ├── reference-library.ts   # Shared reference library + cache
│   ├── document-preprocessor.ts  # Truncation, hints, batching
│   └── skill-loader.ts        # SKILL.md loader (progressive disclosure)
├── api/
│   └── v4-analyze/
│       └── route.ts           # Next.js API route
├── types.ts                   # All type definitions
├── index.ts                   # Barrel export
└── V4_ARCHITECTURE.md         # This file
```

**Progressive disclosure (3 levels):**
1. **Metadata** (~100 tokens per skill): name + description from YAML frontmatter
2. **Instructions** (~2K tokens): SKILL.md body loaded when skill is triggered
3. **References** (variable): Loaded on-demand from shared library by tag match

### 6. Intelligence Tagging for Templates

All extracted intelligence fields include `templateTags` for future template population:

```typescript
intelligenceFields: [
  {
    fieldPath: "financials.propertyValue",
    label: "Property Value",
    value: "2500000",
    valueType: "currency",
    confidence: 0.9,
    templateTags: ["lenders_note", "perspective", "credit_submission"]
  }
]
```

This enables the planned template generation system:
- **Lenders' Notes** — pull tagged fields to auto-fill
- **Perspectives** — investment overview from extracted data
- **Contracts** — pre-populate facility letter fields
- **Credit Submissions** — assembled from tagged intelligence

### 7. Future Skills (Extensible)

The framework supports adding new skills without code changes:

```
v4/skills/
├── document-classify/         # V1 — document classification
├── checklist-match/           # V1 — checklist matching
├── intelligence-extract/      # V1 — field extraction
├── document-summarize/        # V1 — deep summarization
├── excel-extract/             # V2 — complex Excel processing
├── prospecting/               # V3 — lead prospecting
├── outbound-marketing/        # V3 — marketing communications
└── template-populate/         # V3 — fill document templates
```

Each skill is a folder with SKILL.md. Add a folder → it's discovered automatically.

## API Integration

### POST /api/v4-analyze

```typescript
// Request: FormData
const formData = new FormData();
formData.append('file_0', file1);
formData.append('file_1', file2);
formData.append('text_0', extractedText1); // optional
formData.append('metadata', JSON.stringify({
  clientContext: { clientId, clientName, clientType },
  availableFolders: [...],
  checklistItems: [...],
  corrections: [...],
}));

// Response: BatchClassifyResult
{
  success: true,
  documents: [
    {
      documentIndex: 0,
      fileName: "RedBook_Valuation.pdf",
      classification: {
        fileType: "RedBook Valuation",
        category: "Appraisals",
        suggestedFolder: "appraisals",
        targetLevel: "project",
        confidence: 0.92,
        reasoning: "..."
      },
      summary: { ... },
      checklistMatches: [ ... ],
      intelligenceFields: [ ... ]
    },
    // ... one per document
  ],
  metadata: {
    model: "claude-haiku-4-5-20251001",
    batchSize: 2,
    apiCallsMade: 1,
    totalInputTokens: 8500,
    totalOutputTokens: 3200,
    totalLatencyMs: 4500,
    referencesLoaded: ["RedBook Valuation", "Appraisal"],
    cachedReferenceHit: true
  },
  errors: []
}
```

## How to Add a New File Type

1. **Add reference to Convex** (via the existing File Type Definitions UI)
   - Set fileType, category, keywords, description
   - Keywords become tags automatically
   - The shared reference library picks it up on next cache refresh

2. **Or add a system reference** (in `reference-library.ts`)
   - Add to `SYSTEM_REFERENCES` array
   - Include appropriate tags for the orchestrator

3. **No code changes needed** — the orchestrator will automatically:
   - Match new documents to the new reference by tags
   - Include the reference in API calls when relevant
   - Return the new fileType in classification results

## Frontend Hookup

The V4 API returns the same shape as the existing pipeline, so the frontend components (`BulkUpload.tsx`, `BulkReviewTable.tsx`) can be pointed at `/api/v4-analyze` with minimal changes:

1. Update `BulkUpload.tsx` to call `/api/v4-analyze` instead of `/api/bulk-analyze`
2. Map `BatchClassifyResult.documents[]` to the existing `BulkAnalysisResult` shape
3. The review table, filing, and checklist linking stay unchanged

## Dependencies

- `@anthropic-ai/sdk` — Anthropic TypeScript SDK (to be installed)
- `ANTHROPIC_API_KEY` — environment variable

No other new dependencies. Convex client is passed in from existing infrastructure.
