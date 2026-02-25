# V4 Skills Architecture — V1 Fix Plan

**Goal:** Take V1 from 72/100 → 100/100
**Scope:** Document upload, summarization, filing, intelligence extraction, checklist matching, chat

---

## Revised Assessment After Deep Dive

### What's Working (No Changes Needed)
- Intelligence extraction persists correctly: V4 `extractedIntelligence` → `bulkUploadItems` → `knowledgeItems` ✅
- V4 classification runs via legacy `BulkQueueProcessor` → `/api/v4-analyze` ✅
- Reference library (55 types, 13 categories, 8,465 lines) ✅
- Placement rules and document code generation ✅
- Chat assistant with tool use and context gathering ✅
- Knowledge bank entries created on filing ✅

### What's Broken (Fixes Below)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | Checklist items never queried or sent to V4 pipeline | **Critical** — no checklist matching at all | Medium |
| 2 | Available folders never sent to V4 pipeline | **High** — Claude sees no folder options | Small |
| 3 | No self-review in skill prompts (critic) | **Medium** — classification errors not caught | Small |
| 4 | User instructions not passed to V4 prompt | **Medium** — user guidance ignored | Small |
| 5 | V4BatchProcessor missing intelligence/checklist in callbacks | **Medium** — blocks processor swap | Medium |
| 6 | Background processing (>5 files) is serial per-file | **Medium** — slow for bulk uploads | Large |

---

## Fix 1: Wire Checklist Items into Pipeline (CRITICAL)

### Problem
`BulkUpload.tsx` never queries checklist items. `bulkQueueProcessor.ts` sends `checklistItems: []` to the V4 pipeline. The pipeline's prompt includes a "Missing Checklist Items" section that is always empty. Claude never suggests matches.

### Files to Change

**1a. `src/lib/bulkQueueProcessor.ts`**
- Add `checklistItems` and `availableFolders` to `BatchInfo` interface (~line 156)
- Include them in the metadata JSON sent to `/api/v4-analyze` (~line 330-350)

```typescript
// In BatchInfo interface, add:
checklistItems?: Array<{
  id: string;
  name: string;
  category: string;
  status: string;
  matchingDocumentTypes?: string[];
}>;
availableFolders?: Array<{
  folderKey: string;
  name: string;
  level: 'client' | 'project';
}>;
```

```typescript
// In metadata building (~line 330), add:
if (this.batchInfo.checklistItems?.length) {
  metadata.checklistItems = this.batchInfo.checklistItems;
}
if (this.batchInfo.availableFolders?.length) {
  metadata.availableFolders = this.batchInfo.availableFolders;
}
```

**1b. `src/components/BulkUpload.tsx`**
- Query checklist items from Convex when client/project is selected (~line 94-108 area)
- Query available folders for the selected scope
- Pass both into `batchInfo` (~line 421-432)

```typescript
// Add Convex queries:
const checklistItems = useQuery(
  api.knowledgeLibrary.getChecklistItems,
  selectedProject ? { projectId: selectedProject._id } : 'skip'
);

const projectFolders = useQuery(
  api.folders.getProjectFolders,
  selectedProject ? { projectId: selectedProject._id } : 'skip'
);

// In batchInfo construction:
const batchInfo: BatchInfo = {
  // ...existing fields...
  checklistItems: checklistItems
    ?.filter(item => item.status === 'missing')
    ?.map(item => ({
      id: item._id,
      name: item.label || item.title,
      category: item.category,
      status: item.status,
      matchingDocumentTypes: item.matchingDocumentTypes,
    })),
  availableFolders: projectFolders?.map(f => ({
    folderKey: f.folderKey,
    name: f.name,
    level: 'project' as const,
  })),
};
```

**1c. `convex/bulkUpload.ts` — `updateItemAnalysis`**
- The `suggestedChecklistItems` parameter already exists and works (~line 306-312)
- The auto-selection logic at lines 383-391 already picks the top match at ≥0.7 confidence
- **No changes needed here** — just need data to flow in

### Verification
After this fix, uploading a document to a project with a checklist should:
1. Show "Missing Checklist Items" in Claude's prompt
2. Return `checklistMatches` with confidence scores
3. Auto-link documents to checklist items during filing

---

## Fix 2: Wire Available Folders into Pipeline (HIGH)

### Problem
`metadata.availableFolders` is always `[]`. Claude's system prompt has an empty "Available Folders" section. Folder suggestions rely purely on deterministic placement rules.

### Files to Change
Already covered in Fix 1b above — the `availableFolders` are queried and passed alongside checklist items. Also need client-level folders for client scope.

**2a. `src/components/BulkUpload.tsx`**
- Also query client folders when in client scope:

```typescript
const clientFolders = useQuery(
  api.folders.getClientFolders,
  uploadScope === 'client' && selectedClient
    ? { clientId: selectedClient._id }
    : 'skip'
);
```

- Merge into `availableFolders` in batchInfo

### Verification
Claude's system prompt should show the actual folder names and keys, leading to more accurate folder suggestions.

---

## Fix 3: Add Self-Review/Critic to Skill Prompts (MEDIUM)

### Problem
No critic step. If Claude misclassifies a document, there's no self-check. User wants this embedded in the existing skill prompt (not a separate LLM call).

### Files to Change

**3a. `src/v4/skills/document-classify/SKILL.md`**
Append a self-review section at the end of the instructions:

```markdown
## Self-Review (REQUIRED before returning)

Before finalizing your response, review each classification against these checks:

1. **Confidence sanity check**: If confidence > 0.85, verify the document content actually matches the type. Common mistakes:
   - Generic letters classified as specific legal documents
   - Bank statements confused with financial reports
   - Meeting notes classified as formal reports

2. **Category-type consistency**: Does the fileType belong in the category? A "Valuation Report" should NOT be in "KYC".

3. **Alternative type check**: If your top two types are within 0.15 confidence of each other, lower the top confidence to reflect genuine ambiguity and include detailed reasoning.

4. **Checklist match validation**: If you matched a document to a checklist item, verify the document actually satisfies that requirement (not just a related topic).

5. **Folder assignment**: Does the suggested folder match the category? Cross-check against the Available Folders list.

If any check fails, revise before returning. It is better to return lower confidence with correct classification than high confidence with wrong classification.
```

**3b. `src/v4/skills/intelligence-extract/SKILL.md`**
Append a similar review section:

```markdown
## Self-Review (REQUIRED before returning)

Before finalizing your extraction:

1. **Value accuracy**: Re-read the source text for each extracted value. Did you transcribe the number correctly? Common mistakes:
   - Mixing up GDV and loan amount
   - Getting LTV% vs LTGDV% confused
   - Reading dates in wrong format (DD/MM vs MM/DD)

2. **Scope assignment**: Is this a client-level or project-level field? Banking details = client. Loan amount = project.

3. **Confidence calibration**: Only assign > 0.9 if the value is explicitly stated with no ambiguity. Derived or calculated values should be ≤ 0.8.

4. **Duplicate fields**: Check you haven't extracted the same data point under two different field paths.
```

### Verification
Classification accuracy should improve, especially for edge cases. Low-confidence documents should get honest scores instead of inflated ones.

---

## Fix 4: Pass User Instructions to V4 Prompt (MEDIUM)

### Problem
Users can enter instructions in BulkUpload.tsx (e.g., "These are all KYC documents for the borrower"). The field is sent in metadata but the V4 pipeline ignores it.

### Files to Change

**4a. `src/v4/types.ts`**
- Add `instructions` to `ClientContext` or `PipelineInput`

**4b. `src/v4/lib/pipeline.ts`**
- Accept `instructions` in `PipelineInput`
- Pass through to `buildBatchUserMessage`

**4c. `src/v4/lib/anthropic-client.ts`**
- In `buildBatchUserMessage`, add an "Uploader Instructions" section:

```typescript
if (instructions) {
  contextText += `\n## Uploader Instructions\n${instructions}\n`;
}
```

**4d. `src/app/api/v4-analyze/route.ts`**
- Extract `instructions` from metadata and pass to pipeline

### Verification
When a user enters "These are all KYC documents", the pipeline should bias classification toward KYC types.

---

## Fix 5: Update V4BatchProcessor Callback Signatures (MEDIUM)

### Problem
`V4BatchProcessor` in `v4-batch-processor.ts` has a simplified `updateItemAnalysis` callback that strips intelligence fields, checklist suggestions, and classification reasoning. If we swap to it later, intelligence won't persist.

### Files to Change

**5a. `src/v4/lib/v4-batch-processor.ts`**
- Expand `V4BatchProcessorCallbacks.updateItemAnalysis` to match what Convex expects:

```typescript
updateItemAnalysis: (args: {
  itemId: Id<'bulkUploadItems'>;
  fileStorageId?: Id<'_storage'>;
  summary: string;
  fileTypeDetected: string;
  category: string;
  targetFolder?: string;
  confidence: number;
  generatedDocumentCode?: string;
  version?: string;
  isDuplicate?: boolean;
  duplicateOfDocumentId?: Id<'documents'>;
  // ADD:
  suggestedChecklistItems?: SuggestedChecklistItem[];
  extractedIntelligence?: ExtractedIntelligence;
  documentAnalysis?: DocumentAnalysis;
  classificationReasoning?: string;
}) => Promise<Id<'bulkUploadItems'>>;
```

- Update the call site (~line 330-344) to pass through intelligence data from V4 response

**Note:** Do NOT swap BulkUpload.tsx to use V4BatchProcessor yet. The duplicate checking callback signatures are fundamentally different (filename-based vs pattern-based). This is a V1.1 task. For V1, the legacy processor calling /api/v4-analyze is sufficient.

---

## Fix 6: Background Processing Batching (MEDIUM)

### Problem
Background processing (>5 files) in `bulkBackgroundProcessor.ts` processes files one-at-a-time with 500ms delay. Each file gets its own `/api/v4-analyze` call. Should batch 8 files per call.

### Files to Change

**6a. `convex/bulkBackgroundProcessor.ts`**
- Refactor `processNextItem` to `processNextBatch`
- Collect up to 8 pending items
- Build FormData with `file_0`, `file_1`, ... format
- Send single `/api/v4-analyze` call
- Map results back to individual items

### Complexity
This is the most complex fix. The background processor runs as a Convex internal action with scheduler chaining. Batching requires:
- Collecting multiple items atomically
- Building multi-file FormData
- Mapping batch results back to individual items
- Handling partial batch failures

### Recommendation
Defer to V1.1 unless bulk upload performance is a user complaint. The current serial approach works, just slowly.

---

## Implementation Order

| Priority | Fix | Effort | Impact | V1 Score Gain |
|----------|-----|--------|--------|---------------|
| **P0** | Fix 1: Wire checklist items | 2-3 hours | Critical | +12 |
| **P0** | Fix 2: Wire available folders | 30 min (part of Fix 1) | High | +3 |
| **P1** | Fix 3: Self-review in skill prompts | 30 min | Medium | +5 |
| **P1** | Fix 4: Pass user instructions | 1 hour | Medium | +3 |
| **P2** | Fix 5: V4BatchProcessor callbacks | 1-2 hours | Medium | +3 |
| **P3** | Fix 6: Background batch processing | 4-6 hours | Medium | +2 |

**Total effort for P0+P1:** ~4-5 hours → Score: 72 + 23 = **95/100**
**Total effort for all:** ~10-12 hours → Score: **100/100**

---

## Files Modified (Summary)

| File | Fixes | Type |
|------|-------|------|
| `src/components/BulkUpload.tsx` | 1, 2 | Add Convex queries, pass to batchInfo |
| `src/lib/bulkQueueProcessor.ts` | 1, 2 | Expand BatchInfo, include in metadata |
| `src/v4/skills/document-classify/SKILL.md` | 3 | Add self-review section |
| `src/v4/skills/intelligence-extract/SKILL.md` | 3 | Add self-review section |
| `src/v4/types.ts` | 4 | Add instructions to PipelineInput |
| `src/v4/lib/pipeline.ts` | 4 | Pass instructions through |
| `src/v4/lib/anthropic-client.ts` | 4 | Include in user prompt |
| `src/app/api/v4-analyze/route.ts` | 4 | Extract and pass instructions |
| `src/v4/lib/v4-batch-processor.ts` | 5 | Expand callback signatures |
| `convex/bulkBackgroundProcessor.ts` | 6 | Batch processing refactor |
