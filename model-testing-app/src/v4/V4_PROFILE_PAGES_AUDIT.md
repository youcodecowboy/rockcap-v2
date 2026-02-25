# V4 Compatibility Audit: Client & Project Profile Pages

**Date:** 2026-02-25
**Scope:** Client profile (`/clients/[clientId]`) and Project profile (`/clients/[clientId]/projects/[projectId]`) pages and all their sub-components, shared components, and Convex backend functions.

---

## Executive Summary

The client and project profile pages themselves are **clean** — they contain no direct V3 agent imports, no V3 API calls, and no hardcoded V3 category mappings. However, they depend on several **shared components** and **API routes** that still use V3 patterns (Together.ai, OpenAI GPT-4o, `/api/bulk-analyze`). These dependencies create indirect V3 coupling that will clash with V4 if not addressed.

**Severity Breakdown:**
- **CRITICAL** (2 issues) — Active V3 API endpoint calls in shared components
- **HIGH** (3 issues) — V3 LLM provider usage in API routes reachable from profile pages
- **MEDIUM** (4 issues) — Deprecated storage hooks, schema field assumptions
- **LOW** (3 issues) — Category naming assumptions, cosmetic references

---

## Detailed Findings

### CRITICAL — V3 API Endpoints Called from Profile Page Components

#### 1. `DirectUploadModal.tsx` calls `/api/bulk-analyze` (V3)
- **File:** `src/app/docs/components/DirectUploadModal.tsx:164`
- **Used by:** Document tabs on both client and project profile pages (via FolderBrowser upload action)
- **Code:** `await fetch('/api/bulk-analyze', { method: 'POST', body: formData })`
- **Impact:** Any document uploaded directly from a profile page's document tab will be analyzed by the V3 7-stage pipeline (Together.ai + OpenAI) instead of V4 skills-based pipeline.
- **Fix:** Replace with `/api/v4-analyze` and adapt the FormData structure to match V4's expected input format.

#### 2. `FileDetailPanel.tsx` calls `/api/reanalyze-document` (V3)
- **File:** `src/app/docs/components/FileDetailPanel.tsx:160`
- **Used by:** Both client and project document tabs when viewing file details
- **Code:** `await fetch('/api/reanalyze-document', { method: 'POST', body: JSON.stringify({ documentId }) })`
- **Impact:** The "Analyze Document" button (sparkles icon) in the file detail panel triggers V3 re-analysis using Together.ai (`TOGETHER_API_URL` import in `src/app/api/reanalyze-document/route.ts:4`).
- **Fix:** Either replace with a V4 single-document analysis endpoint, or disable the button until V4 has a re-analyze equivalent.

---

### HIGH — V3 LLM Providers in API Routes Reachable from Profile Pages

#### 3. `/api/intelligence-extract` uses Together.ai + OpenAI
- **File:** `src/app/api/intelligence-extract/route.ts:21-25`
- **Used by:** `AddIntelligenceModal.tsx` (line 103), accessible from the Intelligence tab on both profile pages
- **Code:**
  ```typescript
  const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
  const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
  ```
- **Impact:** Intelligence extraction from profile pages uses V3 LLM providers. V4 has its own `intelligence-extract` skill (`src/v4/skills/intelligence-extract/SKILL.md`) using Anthropic Claude.
- **Fix:** Migrate this endpoint to use V4's intelligence-extract skill, or create a new `/api/v4-intelligence-extract` route.

#### 4. `/api/consolidate-intelligence` uses Together.ai
- **File:** `src/app/api/consolidate-intelligence/route.ts:15`
- **Used by:** `ConsolidationModal.tsx` (line 107), accessible from the Intelligence tab
- **Code:** `const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';`
- **Impact:** Intelligence consolidation/normalization still uses V3 LLM calls.
- **Fix:** Migrate to Anthropic Claude calls consistent with V4 architecture.

#### 5. `/api/reanalyze-document` uses Together.ai
- **File:** `src/app/api/reanalyze-document/route.ts:4`
- **Code:** `import { TOGETHER_API_URL, MODEL_CONFIG } from '@/lib/modelConfig';`
- **Impact:** Already noted in Critical #2. The entire re-analysis pipeline is V3.

---

### MEDIUM — Deprecated Storage Hooks Still in Use

#### 6. Client profile imports deprecated `clientStorage` hooks
- **File:** `src/app/clients/[clientId]/page.tsx:10-15`
- **Code:**
  ```typescript
  import {
    useClient, useProjectsByClient, useUpdateClient,
    useContactsByClient, useDeleteClient,
  } from '@/lib/clientStorage';
  ```
- **Status:** These specific hooks (`useClient`, `useProjectsByClient`, etc.) are the **new** Convex-based hooks, not the deprecated plain functions. The deprecated functions are the non-hook versions (`getClients()`, `addClient()`, etc.) which throw errors.
- **Impact:** LOW — The hooks themselves work fine. The deprecated plain functions in the same file are dead code that should be cleaned up but don't cause V4 conflicts.

#### 7. Client profile imports deprecated `documentStorage` hook
- **File:** `src/app/clients/[clientId]/page.tsx:16`
- **Code:** `import { useDocumentsByClient } from '@/lib/documentStorage';`
- **Status:** Same as above — `useDocumentsByClient` is the Convex-based hook and works fine. Dead deprecated functions exist in the same module.
- **Impact:** LOW — No V4 conflict, but cleanup recommended.

#### 8. Document schema has V3-specific `documentAnalysis` field
- **File:** `convex/schema.ts:218-245`
- **Field:** `documentAnalysis` with deeply nested structure (`documentDescription`, `documentPurpose`, `entities`, `documentCharacteristics`, etc.)
- **Impact:** This field is populated by V3's Summary Agent (Stage 2). V4 does not populate this field — it produces `summary`, `fileType`, `category`, and `confidence` at the top level. Documents analyzed by V4 will have `documentAnalysis: undefined`, which is fine since the field is `v.optional()`. However, any UI code that reads `documentAnalysis` subfields will show empty data for V4-analyzed documents.
- **Affected UI:** `FileDetailPanel.tsx` may display `documentAnalysis` details. The overview/intelligence extraction pipeline also uses it.

#### 9. V3 tables still in schema (`filingCorrections`, `classificationCache`, `intelligenceExtractionJobs`)
- **File:** `convex/schema.ts:2738, 2918, 3005, 3147`
- **Impact:** These tables exist for V3 and some are still actively written to by the V3 bulk upload flow. V4 doesn't use `classificationCache` (it has its own reference library cache) or the old `filingCorrections` (it uses a different correction context). Not a conflict per se, but wasted schema surface.

---

### LOW — Category/Folder Naming Assumptions

#### 10. FolderBrowser uses `folderType` from Convex
- **File:** `src/app/docs/components/FolderBrowser.tsx:227, 243`
- **Impact:** The folder browser queries folders by `folderType` which is the canonical folder identifier (e.g., `"appraisals"`, `"kyc"`, `"terms_comparison"`). V4's placement rules in `src/v4/lib/placement-rules.ts` output the same `folderType` values, so this is compatible. No conflict.

#### 11. FileList queries documents by `folderType`
- **File:** `src/app/docs/components/FileList.tsx:120-130`
- **Impact:** Same as above — queries `api.documents.getByFolder` with `folderType`. V4 documents are placed into the same folder structure. No conflict.

#### 12. Email request modal groups missing items by V3-era categories
- **File:** `src/app/clients/[clientId]/components/EmailRequestModal.tsx:85-106`
- **Impact:** The email template groups missing checklist items by category name. These categories come from `knowledgeChecklistItems` which are populated from requirement templates, not from the filing agent classification. Categories are stable between V3 and V4. No conflict.

---

## Components Audit Summary

### Clean Components (No V3 References)
| Component | File | Status |
|-----------|------|--------|
| Client Profile Page | `src/app/clients/[clientId]/page.tsx` | CLEAN |
| Project Profile Page | `src/app/clients/[clientId]/projects/[projectId]/page.tsx` | CLEAN |
| ClientOverviewTab | `components/ClientOverviewTab.tsx` | CLEAN |
| ClientProjectsTab | `components/ClientProjectsTab.tsx` | CLEAN |
| ClientContactsTab | `components/ClientContactsTab.tsx` | CLEAN |
| ClientTasksTab | `components/ClientTasksTab.tsx` | CLEAN |
| ClientMeetingsTab | `components/ClientMeetingsTab.tsx` | CLEAN |
| ClientNotesTab | `components/ClientNotesTab.tsx` | CLEAN |
| ClientCommunicationsTab | `components/ClientCommunicationsTab.tsx` | CLEAN |
| ClientDataTab | `components/ClientDataTab.tsx` | CLEAN |
| ClientKnowledgeTab | `components/ClientKnowledgeTab.tsx` | CLEAN |
| ProjectOverviewTab | `components/ProjectOverviewTab.tsx` | CLEAN |
| ProjectDocumentsTab | `components/ProjectDocumentsTab.tsx` | CLEAN |
| ProjectKnowledgeTab | `components/ProjectKnowledgeTab.tsx` | CLEAN |
| ProjectDataTab | `components/ProjectDataTab.tsx` | CLEAN |
| ProjectTasksTab | `components/ProjectTasksTab.tsx` | CLEAN |
| ProjectNotesTab | `components/ProjectNotesTab.tsx` | CLEAN |
| KnowledgeChecklistPanel | `components/KnowledgeChecklistPanel.tsx` | CLEAN |
| MissingDocumentsCard | `components/MissingDocumentsCard.tsx` | CLEAN |
| EmailRequestModal | `components/EmailRequestModal.tsx` | CLEAN |
| ClientSettingsPanel | `components/ClientSettingsPanel.tsx` | CLEAN |
| ProjectSettingsPanel | `components/ProjectSettingsPanel.tsx` | CLEAN |
| FolderBrowser | `docs/components/FolderBrowser.tsx` | CLEAN |
| FileList | `docs/components/FileList.tsx` | CLEAN |

### Components with V3 Dependencies
| Component | File | Issue |
|-----------|------|-------|
| DirectUploadModal | `docs/components/DirectUploadModal.tsx:164` | Calls `/api/bulk-analyze` (V3) |
| FileDetailPanel | `docs/components/FileDetailPanel.tsx:160` | Calls `/api/reanalyze-document` (V3) |
| IntelligenceTab | `components/IntelligenceTab.tsx` | Imports AddIntelligenceModal & ConsolidationModal |
| AddIntelligenceModal | `components/AddIntelligenceModal.tsx:103` | Calls `/api/intelligence-extract` (Together.ai) |
| ConsolidationModal | `components/ConsolidationModal.tsx:107` | Calls `/api/consolidate-intelligence` (Together.ai) |

---

## Recommended Fix Priority

### Phase 1 — Must Fix Before V4 Launch (DONE)
1. **DirectUploadModal.tsx** — ~~Switch `/api/bulk-analyze` to `/api/v4-analyze` with V4 FormData format~~ FIXED: Now calls `/api/v4-analyze` and parses V4 `documents[]` response format with V3 fallback.
2. **FileDetailPanel.tsx** — ~~Disable or replace "Analyze Document" button with V4 equivalent~~ FIXED: Now fetches the file from storage, sends it through V4 `/api/v4-analyze` instead of the V3 `/api/reanalyze-document` endpoint.
3. **FileDetailPanel.tsx Summary Tab** — FIXED: Summary tab now handles V4-analyzed documents that have `summary` but no `documentAnalysis` deep structure. The tab shows the V4 summary as a fallback.

### Phase 2 — Should Fix for Full V4 Parity
4. **AddIntelligenceModal.tsx** — Migrate `/api/intelligence-extract` to use V4 `intelligence-extract` skill
5. **ConsolidationModal.tsx** — Migrate `/api/consolidate-intelligence` to Anthropic Claude
6. **reanalyze-document route** — Can be deprecated now that FileDetailPanel uses V4

### Phase 3 — Cleanup
7. **clientStorage.ts / documentStorage.ts** — Remove 90+ deprecated plain functions (keep hooks)
8. **Schema cleanup** — Consider deprecation markers on V3-only tables
9. **documentAnalysis field** — ~~Ensure UI gracefully handles `undefined` for V4-analyzed docs~~ FIXED in FileDetailPanel

---

## Conclusion

The profile pages are architecturally sound for V4. The V3 coupling is entirely through **shared utility components** (`DirectUploadModal`, `FileDetailPanel`, `AddIntelligenceModal`, `ConsolidationModal`) and their corresponding **API routes**, not through the profile page code itself. The folder structure, checklist system, data library, tasks, meetings, notes, and communications are all V3/V4 agnostic — they work with documents regardless of which pipeline analyzed them.

The critical fixes are limited to 2 files in `src/app/docs/components/` and 3 API routes in `src/app/api/`. Everything else is compatible as-is.
