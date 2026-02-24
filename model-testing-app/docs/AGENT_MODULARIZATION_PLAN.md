# Document Agent Modularization Plan

**Branch:** `refactor/modular-document-agents`
**Created:** January 2026
**Status:** Planning

## Executive Summary

Refactor the monolithic 3100-line `/api/bulk-analyze/route.ts` into a modular agent system to:
- Enable targeted prompt engineering with rich few-shot examples
- Support per-agent feedback loops for self-improvement
- Allow isolated testing and debugging
- Improve maintainability and onboarding

---

## Current Architecture Analysis

### File Overview
| Component | Lines | Purpose |
|-----------|-------|---------|
| `bulk-analyze/route.ts` | ~3100 | Monolithic document analysis pipeline |

### Current Stages (Embedded)
1. **Summary Agent** (~160 lines, Together AI) - Document analysis without classification
2. **Classification Agent** (~230 lines, Together AI) - Maps summary to fileType/category/folder
3. **Verification Agent** (~90 lines, Together AI) - Validates low-confidence classifications
4. **Checklist Matching Agent** (~105 lines, Together AI) - Links documents to requirements
5. **Critic Agent** (~260 lines, OpenAI GPT-4o) - Final reasoning pass with feedback loop
6. **Filename Pattern Matching** (~200 lines) - Pre-check using filename patterns
7. **Pre-Extraction** (~130 lines, OpenAI) - Now deferred to filing

### Key Integration Points
| System | How It Connects |
|--------|----------------|
| **BulkUpload.tsx** | Calls POST /api/bulk-analyze for each file |
| **bulkUpload.ts (Convex)** | Uses documentAnalysis from response on filing |
| **fileTypeDefinitions** | Fetched for classification rules |
| **filingFeedback** | Cache reads/writes, correction learning |
| **knowledgeLibrary** | Checklist items fetched for matching |
| **clients/projects** | Folders fetched for filing targets |
| **intelligence** | Client context fetched for personalization |

---

## Target Architecture

```
src/lib/agents/
├── index.ts                      # Pipeline orchestrator (entry point)
├── types.ts                      # Shared types (DocumentSummary, ClassificationResult, etc.)
├── config.ts                     # Model configs, retry settings, thresholds
├── utils/
│   ├── retry.ts                  # fetchWithRetry
│   ├── cache.ts                  # generateContentHash, normalizeFilename
│   └── validation.ts             # Type/category/folder validation
│
├── summary-agent/
│   ├── index.ts                  # runSummaryAgent()
│   ├── prompt.ts                 # System prompt + few-shot examples
│   └── types.ts                  # DocumentSummary interface
│
├── classification-agent/
│   ├── index.ts                  # runClassificationAgent()
│   ├── prompt.ts                 # Prompt builder with category guidance
│   ├── types.ts                  # ClassificationDecision interface
│   └── examples.ts               # Few-shot examples for edge cases
│
├── filename-matcher/
│   ├── index.ts                  # getFilenameTypeHints(), checkFilenamePatterns()
│   ├── patterns.ts               # Pattern definitions (extracted from route)
│   └── types.ts                  # FilenameTypeHint, FilenameMatchResult
│
├── checklist-agent/
│   ├── index.ts                  # runChecklistMatchingAgent()
│   ├── prompt.ts                 # Matching rules and examples
│   └── types.ts                  # ChecklistMatch interface
│
├── verification-agent/
│   ├── index.ts                  # verifyClassification()
│   ├── prompt.ts                 # Verification prompt
│   └── types.ts                  # VerificationResult
│
└── critic-agent/
    ├── index.ts                  # runCriticAgent()
    ├── prompt.ts                 # Decision-making prompt with correction context
    ├── types.ts                  # CriticAgentInput/Output
    └── feedback.ts               # Feedback loop integration
```

---

## Phase 1: Foundation Setup (Low Risk)

### 1.1 Create Directory Structure
```bash
mkdir -p src/lib/agents/{summary-agent,classification-agent,filename-matcher,checklist-agent,verification-agent,critic-agent,utils}
```

### 1.2 Extract Shared Types (`src/lib/agents/types.ts`)
Extract from route.ts:
- `DocumentSummary` interface
- `ClassificationDecision` interface
- `BulkAnalysisResult` interface
- `FileTypeDefinition` interface
- `EnrichedChecklistItem` interface
- `FolderInfo` interface
- `ClientIntelligenceContext` interface

### 1.3 Extract Config (`src/lib/agents/config.ts`)
Extract:
- `RETRY_CONFIG` object
- `MODEL_CONFIG` references
- `TOGETHER_API_URL`
- `OPENAI_API_URL`
- Confidence thresholds

### 1.4 Extract Utilities (`src/lib/agents/utils/`)
- `retry.ts`: `fetchWithRetry()` function
- `cache.ts`: `generateContentHash()`, `normalizeFilenameForCache()`
- `validation.ts`: `findBestTypeMatch()`, `findBestCategoryMatch()`, `matchCategoryToFolder()`

### Verification Criteria
- [ ] Types compile without errors
- [ ] Existing route continues to work (no functional changes yet)
- [ ] Can import types from new location

### Risk Mitigation
- **Risk:** Type mismatches when extracting
- **Mitigation:** Run TypeScript compilation after each extraction, ensure all usages in route.ts compile

---

## Phase 2: Filename Matcher Module (Lowest Risk)

### Why Start Here
- Pure functions with no external API calls
- Well-defined inputs/outputs
- Easy to test in isolation
- No prompt engineering needed

### 2.1 Create Module
**File:** `src/lib/agents/filename-matcher/patterns.ts`
Extract the ~200 lines of pattern definitions (the `patterns` array in `getFilenameTypeHints`)

**File:** `src/lib/agents/filename-matcher/index.ts`
Extract:
- `getFilenameTypeHints(fileName: string): FilenameTypeHint | null`
- `checkFilenamePatterns(fileName: string, checklistItems: EnrichedChecklistItem[]): FilenameMatchResult[]`

### 2.2 Add Unit Tests
```typescript
// src/lib/agents/filename-matcher/__tests__/index.test.ts
describe('getFilenameTypeHints', () => {
  it('detects passport from filename', () => {
    expect(getFilenameTypeHints('passport_john_smith.pdf')).toEqual({
      fileType: 'Passport',
      category: 'KYC',
      folder: 'kyc',
      confidence: 0.85,
      reason: 'Filename contains "passport"',
    });
  });

  it('excludes false positives via excludeIf', () => {
    // "passport photo" should not match Passport
    expect(getFilenameTypeHints('passport_photo_requirements.pdf')).toBeNull();
  });
});
```

### 2.3 Wire Up
Update route.ts to import from module:
```typescript
import { getFilenameTypeHints, checkFilenamePatterns } from '@/lib/agents/filename-matcher';
```

### Verification Criteria
- [ ] All existing pattern tests pass
- [ ] Route continues to work identically
- [ ] New unit tests cover edge cases

### Risk Mitigation
- **Risk:** Pattern logic differs after extraction
- **Mitigation:** Create before/after tests with known filenames to ensure identical behavior

---

## Phase 3: Summary Agent Module (Medium Risk)

### Why This Order
- First LLM agent to extract
- Output is consumed by Classification Agent
- Well-defined contract (textContent → DocumentSummary)
- Enables adding few-shot examples

### 3.1 Create Module

**File:** `src/lib/agents/summary-agent/types.ts`
Move `DocumentSummary` interface

**File:** `src/lib/agents/summary-agent/prompt.ts`
```typescript
export const SUMMARY_SYSTEM_PROMPT = `You are a document analysis specialist...`;

export const FEW_SHOT_EXAMPLES = [
  {
    description: 'Developer Track Record',
    input: { fileName: 'ACME_track_record_2024.pdf', contentSample: '...' },
    expectedOutput: {
      documentDescription: 'Company portfolio showcasing development projects',
      documentPurpose: 'Demonstrate development experience and capability',
      rawContentType: 'developer track record / portfolio',
      documentCharacteristics: { hasMultipleProjects: true, isFinancial: false, ... },
    },
    reasoning: 'Multiple projects listed with completion dates indicates track record',
  },
  // Add 5-10 examples covering problem areas
];

export function buildSummaryPrompt(fileName: string, content: string): string {
  // Build prompt with optional few-shot injection
}
```

**File:** `src/lib/agents/summary-agent/index.ts`
```typescript
export async function runSummaryAgent(
  textContent: string,
  fileName: string,
  apiKey: string
): Promise<DocumentSummary> {
  // Implementation using prompt.ts
}
```

### 3.2 Add Few-Shot Examples for Problem Areas
Based on your feedback loop data, identify common misclassifications and add examples:
- Track records being classified as "Other"
- Multi-project documents
- Scanned documents with minimal text

### 3.3 Add Tests
```typescript
describe('SummaryAgent', () => {
  it('identifies track record characteristics', async () => {
    const result = await runSummaryAgent(trackRecordContent, 'track_record.pdf', apiKey);
    expect(result.documentCharacteristics.hasMultipleProjects).toBe(true);
    expect(result.rawContentType).toContain('track record');
  });
});
```

### Verification Criteria
- [ ] Summary output is identical for same inputs (deterministic test)
- [ ] Few-shot examples improve accuracy on known problem documents
- [ ] Performance regression test (latency within 10% of original)

### Risk Mitigation
- **Risk:** Prompt changes affect downstream agents
- **Mitigation:** Run full pipeline tests after changes, compare outputs
- **Risk:** Few-shot examples make prompt too long
- **Mitigation:** Keep examples concise, measure token usage

---

## Phase 4: Classification Agent Module (Medium Risk)

### 4.1 Create Module

**File:** `src/lib/agents/classification-agent/types.ts`
```typescript
export interface ClassificationDecision {
  fileType: string;
  category: string;
  suggestedFolder: string;
  confidence: number;
  reasoning: string;
  alternativeTypes?: Array<{ type: string; confidence: number; reason: string }>;
}
```

**File:** `src/lib/agents/classification-agent/examples.ts`
```typescript
export const CLASSIFICATION_EXAMPLES = [
  {
    summary: {
      rawContentType: 'developer track record showing completed projects',
      documentCharacteristics: { hasMultipleProjects: true },
      keyTerms: ['GDV', 'completion', 'development'],
    },
    decision: {
      fileType: 'Track Record',
      category: 'KYC',
      suggestedFolder: 'kyc',
      confidence: 0.90,
      reasoning: 'Portfolio showing multiple completed developments indicates Track Record',
    },
  },
  // More examples...
];
```

**File:** `src/lib/agents/classification-agent/prompt.ts`
```typescript
export function buildClassificationPrompt(
  summary: DocumentSummary,
  fileName: string,
  fileTypes: string[],
  categories: string[],
  availableFolders: FolderInfo[],
  fileTypeDefinitions: FileTypeDefinition[],
  filenameHint: FilenameTypeHint | null
): string {
  // Build prompt with examples and guidance
}
```

**File:** `src/lib/agents/classification-agent/index.ts`
```typescript
export async function runClassificationAgent(
  summary: DocumentSummary,
  fileName: string,
  fileTypes: string[],
  categories: string[],
  availableFolders: FolderInfo[],
  fileTypeDefinitions: FileTypeDefinition[],
  filenameHint: FilenameTypeHint | null,
  apiKey: string
): Promise<ClassificationDecision>
```

### 4.2 Add Category-Specific Rules
```typescript
// classification-agent/rules.ts
export const CATEGORY_RULES = {
  'KYC': {
    indicators: ['passport', 'id', 'bank statement', 'track record', 'cv'],
    folder: 'kyc',
    level: 'client',
  },
  'Appraisals': {
    indicators: ['valuation', 'appraisal', 'rics', 'red book'],
    folder: 'appraisals',
    level: 'project',
  },
  // ...
};
```

### Verification Criteria
- [ ] Classification output matches original for test dataset
- [ ] Few-shot examples improve edge case handling
- [ ] No regression in overall accuracy

### Risk Mitigation
- **Risk:** Classification changes affect user-visible outputs
- **Mitigation:** A/B test with feature flag, compare results before rollout

---

## Phase 5: Checklist Agent Module (Medium Risk)

### 5.1 Create Module
**File:** `src/lib/agents/checklist-agent/index.ts`
```typescript
export async function runChecklistMatchingAgent(
  textContent: string,
  fileName: string,
  fileType: string,
  category: string,
  checklistItems: EnrichedChecklistItem[],
  filenameMatches: FilenameMatchResult[],
  apiKey: string
): Promise<Array<{ itemId: string; confidence: number; reasoning: string }>>
```

### 5.2 Add Matching Rules
```typescript
// checklist-agent/rules.ts
export const CHECKLIST_MATCHING_RULES = {
  'Passport': ['Proof of ID', 'Certified Proof of ID', 'ID Document'],
  'Driving License': ['Proof of ID', 'Certified Proof of ID'],
  'Utility Bill': ['Proof of Address', 'Certified Proof of Address'],
  'Bank Statement': ['Bank Statement', 'Business Bank Statements', 'Proof of Address'],
  // ...
};
```

### Verification Criteria
- [ ] Checklist matching accuracy unchanged
- [ ] Filename hint integration preserved

---

## Phase 6: Verification Agent Module (Low Risk)

### 6.1 Create Module
Relatively simple agent - extract and add examples for when verification should override.

### Verification Criteria
- [ ] Verification logic unchanged
- [ ] Folder validation preserved

---

## Phase 7: Critic Agent Module (High Value, Medium Risk)

### 7.1 Create Module
**File:** `src/lib/agents/critic-agent/feedback.ts`
```typescript
export async function fetchRelevantCorrections(
  client: ConvexClient,
  fileType: string,
  category: string,
  fileName: string,
  limit: number
): Promise<PastCorrection[]>
```

**File:** `src/lib/agents/critic-agent/prompt.ts`
```typescript
export function buildCriticPrompt(input: CriticAgentInput): string {
  // Build prompt with corrections context
}
```

### 7.2 Add Decision Examples
```typescript
export const CRITIC_DECISION_EXAMPLES = [
  {
    scenario: 'Summary says passport but initial classification is Other',
    input: { initialClassification: { fileType: 'Other' }, documentSummary: { rawContentType: 'passport biodata page' } },
    expectedDecision: { fileType: 'Passport', category: 'KYC', folder: 'kyc' },
    reasoning: 'Raw content type clearly identifies document as passport',
  },
];
```

### Verification Criteria
- [ ] Feedback loop integration preserved
- [ ] Correction influence tracking works
- [ ] Checklist matching corrections applied correctly

---

## Phase 8: Pipeline Orchestrator (Medium Risk)

### 8.1 Create Orchestrator
**File:** `src/lib/agents/index.ts`
```typescript
export interface PipelineInput {
  file: File;
  textContent: string;
  instructions?: string;
  clientId?: string;
  projectId?: string;
  clientType?: string;
  // ... context data
}

export interface PipelineOutput {
  result: BulkAnalysisResult;
  documentAnalysis: DocumentSummary;
  classificationReasoning: string;
  availableChecklistItems?: EnrichedChecklistItem[];
  availableFolders: FolderInfo[];
}

export async function runDocumentAnalysisPipeline(
  input: PipelineInput,
  context: PipelineContext  // API keys, Convex client, etc.
): Promise<PipelineOutput> {
  // Orchestrate all agents
  // 1. Run filename matcher
  // 2. Check cache
  // 3. Run summary agent
  // 4. Run classification agent
  // 5. Run verification if needed
  // 6. Run checklist agent
  // 7. Run critic agent if needed
  // 8. Cache result
  // 9. Return
}
```

### 8.2 Update Route
**File:** `src/app/api/bulk-analyze/route.ts` (now ~200 lines)
```typescript
import { runDocumentAnalysisPipeline, PipelineInput } from '@/lib/agents';

export async function POST(request: NextRequest) {
  // Auth, validation, context gathering (~100 lines)

  const result = await runDocumentAnalysisPipeline(input, context);

  return NextResponse.json({
    success: true,
    ...result,
  });
}
```

### Verification Criteria
- [ ] Route passes all existing tests
- [ ] Response format unchanged
- [ ] Performance within 10% of original

---

## Phase 9: Feedback Loop Enhancement (High Value)

### 9.1 Per-Agent Feedback Tables
Update schema to track which agent made errors:
```typescript
// convex/schema.ts
filingFeedbackV2: defineTable({
  // ... existing fields
  agentFeedback: v.optional(v.object({
    summaryAgent: v.optional(v.object({
      wasCorrect: v.boolean(),
      correctedFields: v.optional(v.array(v.string())),
    })),
    classificationAgent: v.optional(v.object({
      wasCorrect: v.boolean(),
      correctedFileType: v.optional(v.string()),
      correctedCategory: v.optional(v.string()),
    })),
    checklistAgent: v.optional(v.object({
      wasCorrect: v.boolean(),
      missedItems: v.optional(v.array(v.string())),
      wrongItems: v.optional(v.array(v.string())),
    })),
  })),
})
```

### 9.2 Agent-Specific Learning
```typescript
// When user corrects classification
function recordCorrection(original, corrected) {
  // Determine which agent was wrong
  if (original.rawContentType !== expected) {
    // Summary agent failed
    recordSummaryAgentFeedback(original, corrected);
  }
  if (original.fileType !== corrected.fileType) {
    // Classification agent failed
    recordClassificationAgentFeedback(original, corrected);
  }
  // etc.
}
```

### Verification Criteria
- [ ] Feedback correctly attributed to agent
- [ ] Per-agent accuracy metrics available
- [ ] Corrections flow to correct agent's few-shot context

---

## Phase 10: Testing & Validation

### 10.1 Create Test Suite
```
src/__tests__/agents/
├── summary-agent.test.ts
├── classification-agent.test.ts
├── filename-matcher.test.ts
├── checklist-agent.test.ts
├── verification-agent.test.ts
├── critic-agent.test.ts
└── pipeline.integration.test.ts
```

### 10.2 Golden Dataset
Create a dataset of 50+ documents with known correct classifications:
```typescript
const GOLDEN_DATASET = [
  {
    fileName: 'passport_john_smith.pdf',
    expectedFileType: 'Passport',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedChecklistMatch: 'Proof of ID',
  },
  // ...
];
```

### 10.3 Regression Testing
Before merging each phase:
1. Run pipeline on golden dataset
2. Compare outputs to expected
3. Measure accuracy delta
4. Only merge if accuracy >= baseline

---

## Rollout Strategy

### Feature Flags
```typescript
const USE_MODULAR_AGENTS = process.env.MODULAR_AGENTS === 'true';

if (USE_MODULAR_AGENTS) {
  return runDocumentAnalysisPipeline(input, context);
} else {
  return legacyAnalysis(input, context);
}
```

### Gradual Rollout
1. **Phase 1-2:** Internal testing only
2. **Phase 3-4:** 10% of traffic with monitoring
3. **Phase 5-7:** 50% of traffic
4. **Phase 8-10:** 100% rollout, remove legacy code

---

## Risk Summary

| Phase | Risk Level | Key Risks | Mitigation |
|-------|------------|-----------|------------|
| 1 | Low | Type mismatches | TypeScript compilation checks |
| 2 | Low | Pattern logic drift | Before/after tests |
| 3 | Medium | Summary quality changes | A/B comparison |
| 4 | Medium | Classification accuracy | Golden dataset testing |
| 5 | Medium | Checklist matching breaks | Integration tests |
| 6 | Low | Verification skipped | Threshold tests |
| 7 | Medium | Critic changes decisions | Feedback loop monitoring |
| 8 | Medium | Pipeline orchestration bugs | Full integration tests |
| 9 | Low | Schema migration | Backwards-compatible fields |
| 10 | Low | Test coverage gaps | Code coverage monitoring |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Classification accuracy | ~90% | 95%+ |
| Route file size | 3100 lines | <300 lines |
| Agent test coverage | 0% | 80%+ |
| Time to add few-shot example | ~30 min | ~5 min |
| Debug time for misclassification | ~60 min | ~15 min |

---

## Next Steps

1. [ ] Review and approve this plan
2. [ ] Create Phase 1 PR (foundation)
3. [ ] Run baseline accuracy measurement
4. [ ] Begin Phase 2 implementation

---

## Appendix: Current Dependencies Graph

```
BulkUpload.tsx
    │
    ▼
/api/bulk-analyze/route.ts
    │
    ├── Together AI API
    │   ├── Summary Agent
    │   ├── Classification Agent
    │   ├── Verification Agent
    │   └── Checklist Agent
    │
    ├── OpenAI API
    │   └── Critic Agent
    │
    └── Convex
        ├── fileTypeDefinitions.getAll
        ├── knowledgeLibrary.getAllChecklistItemsForClient
        ├── clients.getClientFolders
        ├── projects.getProjectFolders
        ├── clients.get
        ├── intelligence.getClientIntelligence
        ├── documents.list
        ├── placementRules.findPlacementRule
        ├── filingFeedback.checkCache
        ├── filingFeedback.getRelevantCorrections
        └── filingFeedback.cacheClassification
```
