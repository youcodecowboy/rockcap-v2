# RockCap V2 — System Hardening Plan

## Audit Scores (Before)

| # | Category | Score | Grade |
|---|----------|-------|-------|
| 1 | Shared Reference Library | 192/200 | A |
| 2 | Chat Tools Architecture | 168/200 | B+ |
| 3 | Filing Pipeline | 155/200 | B |
| 4 | Convex Schema Integrity | 145/200 | C+ |
| 5 | Client Intelligence System | 152/200 | B- |
| 6 | Document Library & Reader | 170/200 | B+ |
| 7 | Bulk Upload System | 160/200 | B |
| 8 | Multi-Intent Chat & Confirmation | 178/200 | A- |
| **Overall** | | **165/200** | **B+** |

---

## Phase 1: Blockers & Runtime Errors (Critical)

These will cause crashes or silent data loss during demo.

### 1.1 — Fix `linkDocumentToChecklist` userId mismatch
- **Files**: `src/lib/tools/domains/checklist.tools.ts`, `src/app/api/chat-assistant/route.ts`
- **Problem**: Executor at `executor.ts:320` throws if `userId` missing, but tool definition at `checklist.tools.ts:139` doesn't include `userId` in required params. Claude will never send it → runtime error.
- **Fix**: Auto-inject `userId` via `restrictToolAccess()` in route.ts (preferred over adding to tool params, since userId shouldn't come from the model). Add a case in the restrict function that injects the current session userId for this tool.

### 1.2 — Preserve `extractedIntelligence` when filing documents
- **Files**: `convex/bulkUpload.ts` (fileItem mutation, ~line 748)
- **Problem**: `extractedIntelligence` is stored in `bulkUploadItems` during analysis (line 403) but NEVER copied to the `documents` table in the `fileItem` mutation. Intelligence data extracted during bulk upload is silently dropped.
- **Fix**: Add `extractedIntelligence: item.extractedIntelligence` to the document insert in the `fileItem` mutation. Verify the `documents` schema has the field (it does at schema.ts ~line 888 area as `extractedData` — may need to check exact field name).

### 1.3 — Add `accept` attribute to DirectUploadModal file input
- **Files**: `src/app/docs/components/DirectUploadModal.tsx` (~line 535)
- **Problem**: File input has NO `accept` attribute — accepts any file type including executables. Should match `fileProcessor.ts` supported types.
- **Fix**: Add `accept=".pdf,.docx,.doc,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif"` to the file input element.

### 1.4 — Null-safe `clientName` in document code generation
- **Files**: `src/lib/bulkQueueProcessor.ts` (~line 454)
- **Problem**: `this.batchInfo.clientName.replace(...)` will throw TypeError if `clientName` is undefined/null.
- **Fix**: Add null coalescing: `(this.batchInfo.clientName || 'CLIENT').replace(...)`.

---

## Phase 2: Data Integrity (High Priority)

These cause inconsistent data or lost audit trails.

### 2.1 — Unify intelligence extraction code paths
- **Files**: `src/app/api/intelligence-extract/route.ts`
- **Problem**: Single uploads write to BOTH legacy `mergeExtractedIntelligence` (line 462) AND new `bulkAddKnowledgeItems` (line 494). Bulk uploads only use `knowledgeItems`. This creates dual records and inconsistency. If `bulkAddKnowledgeItems` fails, the error is swallowed (try-catch at ~line 501).
- **Fix**:
  1. Make `bulkAddKnowledgeItems` the primary path (remove try-catch, let errors propagate)
  2. Keep `mergeExtractedIntelligence` as secondary for backward compat but mark with TODO for removal
  3. Ensure both paths produce consistent results until legacy is fully deprecated

### 2.2 — Populate `evidenceTrail` fields in intelligence tables
- **Files**: `convex/intelligence.ts`
- **Problem**: Schema defines `evidenceTrail`, `extractedAttributes`, and `aiInsights` (schema.ts:2454-2487) but the `mergeExtractedIntelligence` mutation already writes to evidenceTrail. The issue is it only keeps the LATEST evidence per field (splice at line 1517) — historical chain is lost.
- **Fix**: Change the splice logic to APPEND rather than replace. Keep a max of 5 evidence entries per fieldPath (sorted by confidence desc). This preserves audit trail without unbounded growth.

### 2.3 — Move duplicate check into atomic Convex mutation
- **Files**: `src/lib/bulkQueueProcessor.ts` (~line 458), `convex/bulkUpload.ts`
- **Problem**: Duplicate check happens client-side. Two files with same name uploaded in parallel can both pass the check before either is saved. Race condition.
- **Fix**: Move the duplicate check INTO the Convex `updateItemAnalysis` or `fileItem` mutation where it can be atomic. Return isDuplicate flag from the mutation instead.

### 2.4 — Set `addedToIntelligence` flag during bulk filing
- **Files**: `convex/bulkUpload.ts` (fileItem mutation ~line 748)
- **Problem**: When filing a document via bulk upload, `addedToIntelligence` is never set on the created document, even though intelligence IS extracted later in the same mutation.
- **Fix**: After the intelligence extraction block succeeds, patch the document with `addedToIntelligence: true`.

---

## Phase 3: Schema Cleanup (Medium Priority)

Eliminate redundancy and inconsistency.

### 3.1 — Clarify `isInternal` vs `scope` on documents
- **Files**: `convex/schema.ts` (~line 212)
- **Problem**: Documents have both `isInternal: boolean` and `scope: "client"|"internal"|"personal"`. Redundant. Code writes both during filing (bulkUpload.ts:744).
- **Fix**: Deprecate `isInternal`. Add migration comment. Stop writing `isInternal` in new code — derive it from `scope === "internal"` where needed in reads. Don't remove from schema yet (backward compat).

### 3.2 — Document `fileType` vs `fileTypeDetected` semantics
- **Files**: `convex/schema.ts` (~lines 185-189)
- **Problem**: Both fields exist with unclear distinction.
- **Fix**: Add schema comments: `fileType` = original MIME type from upload, `fileTypeDetected` = AI-classified document type (e.g., "RedBook Valuation"). No code change needed.

### 3.3 — Add soft-delete to bulk upload tables
- **Files**: `convex/schema.ts` (bulkUploadBatches ~line 800, bulkUploadItems ~line 859)
- **Problem**: These tables have no soft-delete pattern unlike clients, projects, documents.
- **Fix**: Add `isDeleted`, `deletedAt`, `deletedBy`, `deletedReason` optional fields. Update list queries to filter `isDeleted !== true`.

### 3.4 — Add `deletedBy` to `codifiedExtractions`
- **Files**: `convex/schema.ts` (~line 1980)
- **Problem**: Soft-delete pattern missing `deletedBy` field (has isDeleted, deletedAt, deletedReason but not deletedBy).
- **Fix**: Add `deletedBy: v.optional(v.id("users"))`.

### 3.5 — Add `clientId`/`projectId` to `updateNote` tool definition
- **Files**: `src/lib/tools/domains/note.tools.ts` (~line 74)
- **Problem**: Executor handles clientId/projectId updates but tool definition doesn't expose them.
- **Fix**: Add optional `clientId` and `projectId` string params to the tool definition.

### 3.6 — Fix project folder `convexMapping` paths
- **Files**: `src/lib/tools/domains/folder.tools.ts` (~lines 139, 157, 174)
- **Problem**: convexMapping says `projects.addCustomFolder` but actual mutation is `projects.addCustomProjectFolder`.
- **Fix**: Update all three convexMapping paths to include "Project" suffix.

---

## Phase 4: Legacy Cleanup (Lower Priority)

Remove Together AI dependencies and dead code. 27 files reference Together AI.

### 4.1 — Identify active vs dead legacy routes
- **Active legacy routes using Together AI**:
  - `/api/analyze-file/route.ts` — still used?
  - `/api/bulk-analyze/route.ts` — still used?
  - `/api/process-intelligence-queue/route.ts` — still used?
  - `/api/process-meeting-queue/route.ts` — still used?
  - `/api/knowledge-parse/route.ts` — still used?
  - `/api/meeting-extract/route.ts` — still used?
  - `/api/generate-insights/route.ts` — still used?
  - `/api/codify-extraction/route.ts` — still used?
  - `/api/bulk-analyze-debug/route.ts` — still used?
  - `/api/extract-prospecting-context/route.ts` — still used?
  - `/api/reminders/parse/route.ts` — still used?
  - `/api/tasks/parse/route.ts` — still used?
- **Confirmed deprecated**:
  - `/api/reanalyze-document/route.ts` — has deprecation comment
  - `/api/ai-assistant/route.ts` — replaced by `/api/chat-assistant/route.ts`

- **Fix**: Audit each route. For routes replaced by V4/Claude pipeline, add deprecation comments or remove entirely. For routes still in active use (reminders, tasks, meetings), plan migration to Claude in future sprint.

### 4.2 — Remove `documentCodeUtils.ts`
- **Files**: `src/lib/documentCodeUtils.ts` (199 lines)
- **Problem**: Superseded by `src/lib/documentNaming.ts` (310 lines). BulkQueueProcessor and DirectUploadModal both use the new one.
- **Fix**: Search for any remaining imports of `documentCodeUtils`. If none are active, delete the file. If some remain, migrate them to `documentNaming.ts`.

### 4.3 — Legacy agent files cleanup
- **Files**: `src/lib/agents/` directory (verification-agent, summary-agent, checklist-agent, classification-agent, config.ts)
- **Problem**: All use Together AI. These are the old V3 pipeline agents, replaced by V4.
- **Fix**: Verify V4 pipeline doesn't delegate to these. If not used, delete the entire `src/lib/agents/` directory.

### 4.4 — Legacy lib files cleanup
- **Files**: `src/lib/smartPassCodification.ts`, `src/lib/dataVerification.ts`, `src/lib/dataNormalization.ts`, `src/lib/dataExtraction.ts`, `src/lib/modelConfig.ts`, `src/lib/reminderEnhancement.ts`
- **Problem**: All reference Together AI. May be unused if V4 pipeline handles their functions.
- **Fix**: Check imports. Remove any that are completely unused.

---

## Phase 5: Robustness (Nice-to-Have)

### 5.1 — Add retry logic to bulk processor
- **Files**: `src/lib/bulkQueueProcessor.ts`
- **Problem**: No retry on transient failures (network timeout, rate limit).
- **Fix**: Add exponential backoff (max 3 retries) around the `/api/v4-analyze` call.

### 5.2 — Orphaned storage file cleanup
- **Files**: `src/lib/bulkQueueProcessor.ts` (~line 351)
- **Problem**: If file uploads to Convex storage but the subsequent mutation fails, the storage file is orphaned.
- **Fix**: Add cleanup handler that deletes storage file if mutation fails.

### 5.3 — Graceful `.doc` handling
- **Files**: `src/lib/fileProcessor.ts` (~line 72)
- **Problem**: Legacy `.doc` files throw a hard error.
- **Fix**: Return a user-friendly message instead of throwing: "This document is in legacy .doc format. Please convert to .docx or PDF for full analysis. Filing with limited metadata."

### 5.4 — Add Analyze button to ReaderSidebar
- **Files**: `src/app/docs/reader/[documentId]/components/ReaderSidebar.tsx`
- **Problem**: No analysis action available in reader — must open FileDetailPanel.
- **Fix**: Add "Analyze Document" button that calls `/api/intelligence-extract`.

### 5.5 — Improve intelligence skip logging
- **Files**: `convex/intelligence.ts` (~line 1533)
- **Problem**: When lower-confidence extractions are skipped, no log is produced.
- **Fix**: Add `console.log` with field path, old confidence, new confidence.

---

## Implementation Order

```
Phase 1 (Blockers)     — ~2 hours  — Fix before demo
  1.1 userId injection
  1.2 extractedIntelligence preservation
  1.3 file input accept attribute
  1.4 null-safe clientName

Phase 2 (Data Integrity) — ~3 hours — Fix before demo if time permits
  2.1 Unify intelligence paths
  2.2 Evidence trail history
  2.3 Atomic duplicate check
  2.4 addedToIntelligence flag

Phase 3 (Schema)        — ~2 hours — Fix this week
  3.1-3.6 Schema cleanup items

Phase 4 (Legacy)        — ~3 hours — Fix this week
  4.1-4.4 Together AI removal

Phase 5 (Robustness)    — ~2 hours — Next sprint
  5.1-5.5 Quality of life
```

## Together AI Migration Status

The migration from Together AI to Anthropic Claude is **partial**. Only the primary chat and V4 filing pipeline have been migrated. Below is the status of all Together AI dependencies.

### Migrated to Claude
- `/api/chat-assistant` — Primary chat (was `/api/ai-assistant` on Together AI)
- `/api/v4-analyze` — Document classification pipeline (was `/api/bulk-analyze` agents)
- `/api/intelligence-extract` — Intelligence extraction (was `/api/process-intelligence-queue`)

### Still on Together AI (Active — migrate in future sprints)
| Route/File | Purpose | Priority |
|-----------|---------|----------|
| `/api/bulk-analyze` | Modular agent pipeline (summary, classification, checklist, verification) | High — replace agents with V4 |
| `/api/analyze-file` | Single file analysis + spreadsheet extraction | High |
| `/api/process-intelligence-queue` | Background intelligence extraction jobs | Medium — partially replaced by intelligence-extract |
| `/api/generate-insights` | AI insight generation for intelligence dashboards | Medium |
| `/api/knowledge-parse` | Checklist requirement parsing | Medium |
| `/api/codify-extraction` | Smart Pass codification for data library | Medium |
| `/api/meeting-extract` | Meeting transcript extraction | Low |
| `/api/process-meeting-queue` | Background meeting processing | Low |
| `/api/reminders/parse` | Natural language reminder creation | Low |
| `/api/tasks/parse` | Natural language task creation | Low |
| `/api/extract-prospecting-context` | Prospecting context from documents | Low |
| `src/lib/agents/*` | V3 agent pipeline (4 agents + config) | High — remove when bulk-analyze migrated |
| `src/lib/smartPassCodification.ts` | LLM-based data codification | Medium |
| `src/lib/dataExtraction.ts` | Spreadsheet data extraction | Medium |
| `src/lib/dataVerification.ts` | Extracted data verification | Medium |
| `src/lib/dataNormalization.ts` | Data normalization | Medium |
| `src/lib/modelConfig.ts` | Central Together AI config (used by all above) | Last — remove after all migrated |
| `src/lib/reminderEnhancement.ts` | Reminder text enhancement | Low |

### Removed / Deprecated
- `/api/bulk-analyze-debug` — Removed (dead debug endpoint)
- `/api/reanalyze-document` — Deprecated (no active callers, uses V3 pipeline)
- `/api/ai-assistant` — Deprecated (replaced by chat-assistant, still called by NotesEditor/AIAssistantBlock)

### Not Together AI dependent but legacy
- `src/lib/documentCodeUtils.ts` — Still actively imported by 4+ components. Superseded by `documentNaming.ts` but both are in use.

---

## Target Scores (After All Fixes)

| # | Category | Before | After | Delta |
|---|----------|--------|-------|-------|
| 1 | Reference Library | 192 | 195 | +3 |
| 2 | Chat Tools | 168 | 190 | +22 |
| 3 | Filing Pipeline | 155 | 185 | +30 |
| 4 | Schema Integrity | 145 | 185 | +40 |
| 5 | Intelligence System | 152 | 182 | +30 |
| 6 | Document Library | 170 | 188 | +18 |
| 7 | Bulk Upload | 160 | 185 | +25 |
| 8 | Chat & Confirmation | 178 | 190 | +12 |
| **Overall** | | **165** | **188** | **+23** |
