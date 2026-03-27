# Classification Pipeline Fixes — Design Spec

> **Date:** 2026-03-22
> **Scope:** CLS-01, CLS-02, CLS-03, CLS-04 from Backlog
> **Approach:** Hybrid — deterministic rules for folder routing, LLM improvements for classification, both for EML handling

---

## Overview

Four classification pipeline fixes addressing client feedback:

1. **CLS-01** — Only appraisals route to the Appraisal folder; all other categories route to Background
2. **CLS-03** — Background documents (accommodation schedules, build programs) must not be classified as KYC
3. **CLS-02** — Migration script to move misfiled non-appraisals out of Appraisal folders (depends on CLS-01 + CLS-03)
4. **CLS-04** — EML files classified by content, not file extension

Execution order: CLS-01 and CLS-03 first (same mapping logic), then CLS-02 (migration), then CLS-04 (independent).

---

## CLS-01 + CLS-03: Folder Mapping & Classification Fixes

These are the same problem at two layers: CLS-01 is wrong **folder placement**, CLS-03 is wrong **category classification**.

### Root Cause

- `CATEGORY_PLACEMENT` in `src/v4/lib/placement-rules.ts` routes 5 categories to the `appraisals` folder: Appraisals, Professional Reports, Plans, Photographs, and (via fallthrough) anything without a mapping.
- "Project Documents" and "Warranties" categories have **no entry** in the placement map, causing them to fall through to miscellaneous.
- The reference library's disambiguation rules are insufficient to prevent the model from classifying Project Documents (accommodation schedules, build programs) as KYC.

### Changes

#### 1. `src/v4/lib/placement-rules.ts` — `CATEGORY_PLACEMENT` map

Remap so only "Appraisals" routes to `appraisals`. All others move to `background`:

| Category | Old Folder | New Folder | Level |
|---|---|---|---|
| Appraisals | `appraisals` | `appraisals` | project |
| Professional Reports | `appraisals` | `background` | project |
| Plans | `appraisals` | `background` | project |
| Photographs | `appraisals` | `background` | project |
| Project Documents | *(missing)* | `background` | project |
| Warranties | *(missing)* | `background` | project |

**Note on `background` folder level:** `CATEGORY_PLACEMENT` entries carry their own `targetLevel` independent of `FOLDER_DEFINITIONS`. So `Financial Documents` keeps `{ folderKey: 'background', targetLevel: 'client' }` while the new entries use `{ folderKey: 'background', targetLevel: 'project' }` — no conflict. The same string key `"background"` exists as both a client-level folder (`clientFolders`) and a project-level folder (`projectFolders`). However, `FOLDER_DEFINITIONS` currently defines `background` as `level: 'client'` only. Update the description to acknowledge it is used at both levels, or (lower risk) leave it as-is since `FOLDER_DEFINITIONS` is only consulted for display name in Priority 3, and for level in Priority 4 (model suggestion fallback).

#### 2. `src/v4/lib/placement-rules.ts` — `FILE_TYPE_OVERRIDES`

Add deterministic safety-net overrides for known misrouted types:
- `Accommodation Schedule` → `background` (project)
- `Build Programme` → `background` (project)

These catch cases where the model gets the category right but folder placement still goes wrong.

#### 3. `convex/folderStructure.ts` — `CATEGORY_TO_FOLDER_MAP`

Add matching entries so Convex-side mapping agrees with the V4 pipeline:
- "accommodation schedule", "build programme", "specification", "tender", "cgi" → `background`
- Ensure "professional report", "plans", "photographs" → `background`

#### 4. `src/lib/references/references/project-documents.ts` — Strengthen disambiguation

Add explicit rules to Project Documents references:
- "An accommodation schedule is NOT a KYC document — it describes property units, not client identity."
- "A build programme is NOT a KYC document — it describes construction timelines."

#### 5. `src/lib/references/references/kyc.ts` — Negative disambiguation

Add "NOT" rules to reduce false positives:
- "Documents describing property specifications, unit layouts, or construction programmes are NOT KYC even if they contain company names or registration numbers."

#### 6. `src/v4/lib/mock-client.ts` — Sync mock folder mapping

Update the mock client's `resolveFolder()` to match the new placement rules for test consistency. Also fix existing discrepancies found during review:
- `Inspections` maps to `operational_model` in mock but should be `post_completion`
- `Communications` maps to client-level in mock but should be project-level (`notes`)
- Add missing entries for `Project Documents` and `Warranties`

### Files Modified

| File | Change |
|---|---|
| `src/v4/lib/placement-rules.ts` | Remap CATEGORY_PLACEMENT, add FILE_TYPE_OVERRIDES |
| `convex/folderStructure.ts` | Update CATEGORY_TO_FOLDER_MAP |
| `src/lib/references/references/project-documents.ts` | Add disambiguation rules |
| `src/lib/references/references/kyc.ts` | Add negative disambiguation rules |
| `src/v4/lib/mock-client.ts` | Sync mock folder mapping |

---

## CLS-02: Migration Script

One-time migration to move documents that were misfiled under the old rules. Runs **after** CLS-01 and CLS-03 are deployed. **Must be triggered manually — not auto-executed.**

### Data Model Note

The `folderId` field on documents is a **string key** (e.g., `"appraisals"`, `"background"`) that matches the `folderType` field on `projectFolders`/`clientFolders`. It is NOT a Convex document ID reference. The migration queries documents directly by this string field.

### Logic

1. Query all documents where `folderId === "appraisals"` and `folderType === "project"` (using the `by_folder` index)
2. For each document, check its `category` field:
   - If `"Appraisals"` → skip (correctly filed)
   - If category is undefined/null → skip (cannot determine correctness; log for manual review)
   - If anything else → move to `background`
3. Move = patch document's `folderId` to `"background"` (the `folderType` field stays as `"project"` since background is also a project-level folder)
4. Before moving, verify a `background` project folder exists for the document's `projectId`; create via `ensureProjectFolders` if missing
5. Log every move: `{ documentId, documentName, projectId, oldCategory, oldFolderId, newFolderId, timestamp }`
6. Also log skipped documents with undefined category for manual review
7. Return full log

### Design Decisions

- **No re-classification**: Only moves the folder. `category` and `fileTypeDetected` stay as-is. Future uploads will classify correctly via CLS-03 improvements.
- **Dry-run mode**: Accepts `dryRun: boolean`. When true, returns the list of documents that *would* be moved without patching. Run dry first, review, then execute.
- **Batch safety**: Paginate by project to stay within Convex mutation execution limits.
- **Audit trail**: Returned log serves as audit record. Also console-logged server-side.

### Files Created

| File | Purpose |
|---|---|
| `convex/migrations.ts` (new) | `migrateAppraisalFolder` mutation with dry-run support |
| `src/app/api/admin/migrate-appraisals/route.ts` (new, optional) | Thin API route to trigger migration with auth check |

---

## CLS-04: EML File Classification by Content

EML files should be classified based on the document content within the email, not the `.eml` file extension.

### Root Cause

Multiple signals bias the model toward classifying `.eml` files as "Email/Correspondence":
1. The filename contains `.eml` extension, visible to the model
2. The Communications reference has `filenamePatterns: ['eml$']`, causing tag-based scoring toward Communications
3. The existing system prompt instruction to "classify by content" is weaker than these filename-based signals

### Changes

#### 1. `src/v4/lib/document-preprocessor.ts` — Strip email extensions from filename

Before `analyzeFilename()` runs, strip `.eml` and `.msg` extensions from the filename used for hint generation. Original filename preserved for display — only affects hints sent to the model.

```
"valuation-report.eml" → analyzeFilename receives "valuation-report"
```

#### 2. `src/lib/references/references/communications.ts` — Remove filename patterns

Remove `'eml$'` and `'msg$'` from the Communications reference's `filenamePatterns` array. File extension should not be a classification signal.

#### 3. `src/v4/lib/anthropic-client.ts` — Per-document annotation

In `buildBatchUserMessage()`, when a document's original filename ends in `.eml` or `.msg`, add an inline annotation above the document content:

> "This content was delivered inside an email (.eml). Classify based on the document content below, not the email delivery format. If the email contains or forwards a substantive document (valuation, legal terms, report, etc.), classify as that document type."

This is stronger than the system-level instruction because it appears adjacent to the content being classified.

#### 4. Keep existing system prompt instruction

The system-level instruction in `anthropic-client.ts` stays as reinforcement.

### What does NOT change

- `extractEmailBody()` still strips headers — correct behavior
- `extractEmailMetadata()` still captures From/To/Subject for storage — useful metadata
- If an email genuinely IS just correspondence, the model will still classify it as Email/Correspondence — we remove bias, not prevent valid classification
- The `FILENAME_PATTERNS` array in `document-preprocessor.ts` has a `correspondence|letter` regex pattern that could still match email filenames like `correspondence-valuation.eml` after extension stripping (→ `correspondence-valuation`). This is acceptable: the per-document annotation and content signal will outweigh a filename hint, and if the filename literally says "correspondence" there may be merit to that signal.
- Per-document annotations add ~40 tokens per EML file. Acceptable for bulk uploads.

### Supersedes

This design supersedes the earlier `docs/superpowers/specs/2026-03-12-eml-classification-version-detection-design.md` for the EML classification portion.

### Files Modified

| File | Change |
|---|---|
| `src/v4/lib/document-preprocessor.ts` | Strip `.eml`/`.msg` from filename before hint analysis |
| `src/lib/references/references/communications.ts` | Remove `eml$`/`msg$` from `filenamePatterns` |
| `src/v4/lib/anthropic-client.ts` | Add per-document annotation for email-delivered files |

---

## Execution Order

1. **CLS-01 + CLS-03** (folder mapping + classification) — same code paths, implement together
2. **CLS-04** (EML handling) — independent, can be done in parallel or after
3. **CLS-02** (migration) — must be last, depends on CLS-01 + CLS-03 being deployed
4. **Manual migration execution** — dry-run first, review log, then execute

## Backlog Documentation

When each item is completed, a detailed breakdown of the solution will be added to the backlog document under the corresponding item.
