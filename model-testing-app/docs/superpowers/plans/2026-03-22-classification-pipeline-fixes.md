# Classification Pipeline Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four classification pipeline issues — folder mapping, KYC misclassification, data migration, and EML file handling.

**Architecture:** Deterministic rules for folder routing (placement-rules.ts), LLM disambiguation improvements for classification (reference library), preprocessing + prompt changes for EML files, and a Convex migration mutation for existing misfiled documents.

**Tech Stack:** TypeScript, Next.js 16, Convex, Anthropic Claude API

**Spec:** `docs/superpowers/specs/2026-03-22-classification-pipeline-fixes-design.md`

**Execution order:** Tasks 1-3 (CLS-01+CLS-03), then Task 4 (CLS-04), then Task 5 (CLS-02 migration), then Task 6 (build + backlog + commit).

---

### Task 1: Fix Placement Rules — CATEGORY_PLACEMENT and FILE_TYPE_OVERRIDES

**Files:**
- Modify: `src/v4/lib/placement-rules.ts:67-85` (CATEGORY_PLACEMENT)
- Modify: `src/v4/lib/placement-rules.ts:92-121` (FILE_TYPE_OVERRIDES)

- [ ] **Step 1: Update CATEGORY_PLACEMENT map**

In `src/v4/lib/placement-rules.ts`, replace lines 67-85 with:

```typescript
/** Default category-to-folder mapping. Most documents follow this. */
const CATEGORY_PLACEMENT: Record<string, { folderKey: string; targetLevel: 'client' | 'project' }> = {
  // Project-level categories
  'Appraisals':           { folderKey: 'appraisals', targetLevel: 'project' },
  'Legal Documents':      { folderKey: 'terms_comparison', targetLevel: 'project' },
  'Loan Terms':           { folderKey: 'terms_comparison', targetLevel: 'project' },
  'Inspections':          { folderKey: 'post_completion', targetLevel: 'project' },
  'Professional Reports': { folderKey: 'background', targetLevel: 'project' },
  'Plans':                { folderKey: 'background', targetLevel: 'project' },
  'Insurance':            { folderKey: 'post_completion', targetLevel: 'project' },
  'Photographs':          { folderKey: 'background', targetLevel: 'project' },
  'Project Documents':    { folderKey: 'background', targetLevel: 'project' },
  'Warranties':           { folderKey: 'background', targetLevel: 'project' },

  // Client-level categories
  'KYC':                  { folderKey: 'kyc', targetLevel: 'client' },
  'Communications':       { folderKey: 'notes', targetLevel: 'project' },
  'Financial Documents':  { folderKey: 'background', targetLevel: 'client' },

  // Fallback
  'Other':                { folderKey: 'miscellaneous', targetLevel: 'client' },
};
```

Key changes:
- `Professional Reports`, `Plans`, `Photographs` → `background` (was `appraisals`)
- Added `Project Documents` → `background` (was missing entirely)
- Added `Warranties` → `background` (was missing entirely)
- `Financial Documents` stays at `background` with `targetLevel: 'client'` — no conflict because each entry carries its own `targetLevel`

- [ ] **Step 2: Add FILE_TYPE_OVERRIDES for known misrouted types**

In `src/v4/lib/placement-rules.ts`, add these entries to `FILE_TYPE_OVERRIDES` (after the existing `Invoice` entry, before the closing `};`):

```typescript
  // Project Documents — safety-net overrides (these should never land in appraisals or kyc)
  'Accommodation Schedule':    { folderKey: 'background', targetLevel: 'project' },
  'Build Programme':           { folderKey: 'background', targetLevel: 'project' },
```

- [ ] **Step 3: Commit**

```bash
git add src/v4/lib/placement-rules.ts
git commit -m "fix(CLS-01): remap CATEGORY_PLACEMENT so only Appraisals go to appraisals folder

Professional Reports, Plans, Photographs, Project Documents, and
Warranties now route to background. Added missing Project Documents
and Warranties entries. Added FILE_TYPE_OVERRIDES for Accommodation
Schedule and Build Programme as safety nets."
```

---

### Task 2: Sync Convex Folder Mapping and Mock Client

**Files:**
- Modify: `convex/folderStructure.ts:12-65` (CATEGORY_TO_FOLDER_MAP)
- Modify: `src/v4/lib/mock-client.ts:192-216` (resolveFolder + resolveTargetLevel)

- [ ] **Step 1: Update CATEGORY_TO_FOLDER_MAP in Convex**

In `convex/folderStructure.ts`, add the following entries to `CATEGORY_TO_FOLDER_MAP` (after the `"project background"` entry at line 53, before the client-level comment):

```typescript
  "professional report": { level: "project", folderType: "background" },
  "professional reports": { level: "project", folderType: "background" },
  "plans": { level: "project", folderType: "background" },
  "floor plan": { level: "project", folderType: "background" },
  "site plan": { level: "project", folderType: "background" },
  "photographs": { level: "project", folderType: "background" },
  "site photographs": { level: "project", folderType: "background" },
  "project documents": { level: "project", folderType: "background" },
  "accommodation schedule": { level: "project", folderType: "background" },
  "build programme": { level: "project", folderType: "background" },
  "specification": { level: "project", folderType: "background" },
  "tender": { level: "project", folderType: "background" },
  "cgi": { level: "project", folderType: "background" },
  "renders": { level: "project", folderType: "background" },
  "warranties": { level: "project", folderType: "background" },
```

- [ ] **Step 2: Update mock client resolveFolder()**

In `src/v4/lib/mock-client.ts`, replace the `CATEGORY_TO_FOLDER` map inside `resolveFolder()` (lines 193-207) with:

```typescript
  const CATEGORY_TO_FOLDER: Record<string, string> = {
    'Appraisals': 'appraisals',
    'KYC': 'kyc',
    'Legal Documents': 'terms_comparison',
    'Loan Terms': 'terms_comparison',
    'Inspections': 'post_completion',
    'Professional Reports': 'background',
    'Plans': 'background',
    'Insurance': 'post_completion',
    'Financial Documents': 'background',
    'Communications': 'notes',
    'Photographs': 'background',
    'Project Documents': 'background',
    'Warranties': 'background',
    'Other': 'miscellaneous',
  };
```

- [ ] **Step 3: Update mock client resolveTargetLevel()**

In `src/v4/lib/mock-client.ts`, replace the `CLIENT_LEVEL_CATEGORIES` set inside `resolveTargetLevel()` (lines 212-215) with:

```typescript
  const CLIENT_LEVEL_CATEGORIES = new Set([
    'KYC',
    'Financial Documents',
  ]);
```

This fixes `Communications` which was incorrectly listed as client-level (should be project-level, routing to `notes`).

- [ ] **Step 4: Commit**

```bash
git add convex/folderStructure.ts src/v4/lib/mock-client.ts
git commit -m "fix(CLS-01): sync Convex folder map and mock client with new placement rules

Added Project Documents, Plans, Photographs, Professional Reports, and
Warranties to CATEGORY_TO_FOLDER_MAP pointing to background. Fixed mock
client: Inspections→post_completion, Communications→project-level,
added missing categories."
```

---

### Task 3: Strengthen Reference Library Disambiguation (CLS-03)

**Files:**
- Modify: `src/lib/references/references/project-documents.ts:63-68` (Accommodation Schedule disambiguation)
- Modify: `src/lib/references/references/project-documents.ts:230-236` (Build Programme disambiguation)
- Modify: `src/lib/references/references/kyc.ts` (multiple disambiguation arrays)

- [ ] **Step 1: Add KYC-negative disambiguation to Accommodation Schedule**

In `src/lib/references/references/project-documents.ts`, add this entry to the Accommodation Schedule's `disambiguation` array (after the existing 4 entries, before the closing `],`):

```typescript
      'This is an Accommodation Schedule, NOT a KYC document — it describes property units, sizes, and values within a development scheme. It is not an identity, address, or corporate verification document, even if it contains company names or registration numbers.',
```

- [ ] **Step 2: Add KYC-negative disambiguation to Build Programme**

In `src/lib/references/references/project-documents.ts`, add this entry to the Build Programme's `disambiguation` array (after the existing 5 entries, before the closing `],`):

```typescript
      'This is a Build Programme, NOT a KYC document — it describes construction timelines, task durations, and project phasing. It is not an identity or corporate verification document, even if it references a company or contractor.',
```

- [ ] **Step 3: Add property-document-negative disambiguation to KYC references**

In `src/lib/references/references/kyc.ts`, find the **first** document reference (Passport, `id: 'passport'`). Before the `terminology` field (around line 57), the `disambiguation` array ends. We need to add a general negative rule to the **most common KYC misclassification target** — the Certificate of Incorporation reference (the last item, `id: 'certificate-of-incorporation'`).

Find the Certificate of Incorporation's `disambiguation` array (around line 1030-1034) and add after the existing 3 entries:

```typescript
      'Documents describing property specifications, unit layouts, construction programmes, or development schemes are NOT KYC documents even if they contain company names, registration numbers, or corporate letterhead. These are Project Documents or Professional Reports.',
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/references/references/project-documents.ts src/lib/references/references/kyc.ts
git commit -m "fix(CLS-03): add KYC-negative disambiguation to Project Documents and KYC references

Accommodation Schedule and Build Programme now explicitly state they are
NOT KYC. Certificate of Incorporation disambiguation now warns against
classifying property/construction documents as KYC."
```

---

### Task 4: Fix EML File Classification (CLS-04)

**Files:**
- Modify: `src/v4/lib/document-preprocessor.ts:96-130` (preprocessDocument)
- Modify: `src/lib/references/references/communications.ts:92-96` (filenamePatterns)
- Modify: `src/v4/lib/anthropic-client.ts:107-189` (buildBatchUserMessage)

- [ ] **Step 1: Strip .eml/.msg extension before filename analysis**

In `src/v4/lib/document-preprocessor.ts`, in the `preprocessDocument` function, insert two new lines between line 103 (`const mediaType = ...`) and line 105 (the comment `// Generate hints from filename`). Then change the `analyzeFilename` call on line 106 to use the stripped name:

Insert after line 103:
```typescript
  // Strip .eml/.msg extensions before hint analysis so email container format
  // doesn't bias classification. Original filename preserved for display.
  const filenameForHints = fileName.replace(/\.(eml|msg)$/i, '');
```

Then change line 106 from:
```typescript
  const hints = analyzeFilename(fileName, extractedText);
```
To:
```typescript
  const hints = analyzeFilename(filenameForHints, extractedText);
```

The `fileName` variable in the return object at line 124 stays as the original `file.name` — only the `analyzeFilename` call uses `filenameForHints`.

- [ ] **Step 2: Remove eml$/msg$ from Communications filenamePatterns and decisionRules**

In `src/lib/references/references/communications.ts`, replace lines 92-96:

```typescript
    filenamePatterns: [
      'email', 'correspondence', 'letter', 'eml$', 'msg$',
      'fwd', 'fw[_\\-\\s]', 're[_\\-\\s]',
      'broker[_\\-]?intro',
    ],
```

With:

```typescript
    filenamePatterns: [
      'email', 'correspondence', 'letter',
      'fwd', 'fw[_\\-\\s]', 're[_\\-\\s]',
      'broker[_\\-]?intro',
    ],
```

Also in the same file, find the `decisionRules` array (lines 104-129). Remove the entry that boosts on `.eml`/`.msg` file extension (lines 123-128):

Remove this entry:
```typescript
      {
        condition: 'File extension is .eml or .msg indicating native email format',
        signals: ['eml-extension', 'msg-extension'],
        priority: 3,
        action: 'boost',
      },
```

This removes the last extension-based bias signal from the Communications reference.

- [ ] **Step 3: Add per-document EML annotation in buildBatchUserMessage**

In `src/v4/lib/anthropic-client.ts`, in the `buildBatchUserMessage` function, find the loop that adds each document (line 175: `for (const doc of documents) {`). Inside this loop, after the document header block is pushed (the block at lines 177-189), add an EML annotation before the content block:

After line 189 (`});`) and before line 192 (`switch (doc.processedContent.type) {`), add:

```typescript
    // For email-delivered files, add classification guidance annotation
    if (/\.(eml|msg)$/i.test(doc.fileName)) {
      blocks.push({
        type: 'text',
        text: '⚠ EMAIL CONTAINER: This content was delivered inside an email (.eml). Classify based on the document content below, not the email delivery format. If the email contains or forwards a substantive document (valuation, legal terms, report, schedule, etc.), classify as that document type — not as Email/Correspondence.',
      });
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/v4/lib/document-preprocessor.ts src/lib/references/references/communications.ts src/v4/lib/anthropic-client.ts
git commit -m "fix(CLS-04): classify EML files by content, not file extension

Strip .eml/.msg extensions before filename hint analysis. Remove eml$/msg$
from Communications filenamePatterns. Add per-document annotation for
email-delivered files instructing the model to classify by content."
```

---

### Task 5: Migration Script — Move Misfiled Documents (CLS-02)

**Files:**
- Create: `convex/migrations.ts`

**Important:** This mutation is built but NOT auto-executed. It will be triggered manually via the Convex dashboard after verifying CLS-01 and CLS-03 work correctly. The optional admin API route (`src/app/api/admin/migrate-appraisals/route.ts` from the spec) is deferred — dashboard invocation is sufficient for a one-time migration.

- [ ] **Step 1: Create the migration mutation**

Create `convex/migrations.ts`:

```typescript
import { v } from "convex/values";
import { mutation } from "./_generated/server";

/**
 * One-time migration: move non-appraisal documents out of the appraisals folder.
 *
 * After CLS-01 fixed the placement rules so only Appraisals category goes to
 * the appraisals folder, this migration cleans up documents that were misfiled
 * under the old rules.
 *
 * Paginates by project to stay within Convex mutation execution limits.
 * Call with a specific projectId to migrate one project, or omit to migrate all.
 * Run with dryRun: true first to review, then dryRun: false to execute.
 */
export const migrateAppraisalFolder = mutation({
  args: {
    dryRun: v.boolean(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const moves: Array<{
      documentId: string;
      documentName: string;
      projectId: string;
      oldCategory: string;
      oldFolderId: string;
      newFolderId: string;
      timestamp: string;
    }> = [];

    const skipped: Array<{
      documentId: string;
      documentName: string;
      reason: string;
    }> = [];

    // Query all documents in the "appraisals" folder
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q: any) => q.eq("folderId", "appraisals"))
      .collect();

    // Filter to project-level only, and optionally to a specific project
    const projectDocs = docs.filter(d =>
      d.folderType === "project" &&
      (!args.projectId || d.projectId === args.projectId)
    );

    for (const doc of projectDocs) {
      const docName = doc.documentName || doc.fileName || doc._id;
      const category = doc.category;

      // Skip correctly-filed appraisals
      if (category === "Appraisals") {
        continue;
      }

      // Skip documents with no category — log for manual review
      if (!category) {
        skipped.push({
          documentId: doc._id,
          documentName: docName,
          reason: "No category field — cannot determine if misfiled",
        });
        continue;
      }

      // Skip documents without a project — can't verify background folder exists
      if (!doc.projectId) {
        skipped.push({
          documentId: doc._id,
          documentName: docName,
          reason: "No projectId — cannot verify target folder",
        });
        continue;
      }

      // Verify background folder exists for this project
      const backgroundFolder = await ctx.db
        .query("projectFolders")
        .withIndex("by_project_type", (q: any) =>
          q.eq("projectId", doc.projectId).eq("folderType", "background")
        )
        .first();

      if (!backgroundFolder) {
        // Create the background folder if missing
        if (!args.dryRun) {
          await ctx.db.insert("projectFolders", {
            projectId: doc.projectId,
            folderType: "background",
            name: "Background",
            createdAt: new Date().toISOString(),
          });
        }
      }

      // Move the document
      if (!args.dryRun) {
        await ctx.db.patch(doc._id, {
          folderId: "background",
          // folderType stays "project" — background is also project-level
        });
      }

      moves.push({
        documentId: doc._id,
        documentName: docName,
        projectId: doc.projectId,
        oldCategory: category,
        oldFolderId: "appraisals",
        newFolderId: "background",
        timestamp: new Date().toISOString(),
      });
    }

    const result = {
      dryRun: args.dryRun,
      totalScanned: projectDocs.length,
      moved: moves.length,
      skipped: skipped.length,
      moves,
      skippedDetails: skipped,
    };

    console.log(
      `[MIGRATION] migrateAppraisalFolder ${args.dryRun ? "(DRY RUN)" : "(LIVE)"}${args.projectId ? ` (project: ${args.projectId})` : " (all projects)"}:`,
      `scanned=${result.totalScanned}, moved=${result.moved}, skipped=${result.skipped}`
    );

    if (moves.length > 0) {
      console.log("[MIGRATION] Moves:", JSON.stringify(moves, null, 2));
    }
    if (skipped.length > 0) {
      console.log("[MIGRATION] Skipped:", JSON.stringify(skipped, null, 2));
    }

    return result;
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add convex/migrations.ts
git commit -m "feat(CLS-02): add migration script to move non-appraisals out of appraisals folder

Convex mutation with dry-run support and optional projectId for
per-project pagination. Scans documents with folderId='appraisals',
moves non-Appraisals-category docs to background. Logs all moves
and skips for audit. Must be triggered manually."
```

---

### Task 6: Build Check, Backlog Documentation, and Final Commit

**Files:**
- Modify: `docs/BACKLOG-2026-03-22.md`

- [ ] **Step 1: Run build check**

```bash
npx next build
```

Expected: Build succeeds with no errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Run Convex codegen to verify migration types**

```bash
npx convex codegen
```

Expected: Codegen succeeds, types are generated for the new `migrations.ts` file.

- [ ] **Step 3: Update backlog with detailed breakdowns**

In `docs/BACKLOG-2026-03-22.md`, update the Tier 2 section. Replace the four unchecked items with checked items that include solution breakdowns:

For **CLS-01**, change `- [ ]` to `- [x]` and add a sub-section:

```markdown
- [x] **CLS-01** | Fix folder mapping logic: appraisals only in Appraisal folder
  - Priority: Critical | Effort: Medium | Category: Classification
  - **Solution:** Updated `CATEGORY_PLACEMENT` in `src/v4/lib/placement-rules.ts` so only the "Appraisals" category routes to the `appraisals` folder. Professional Reports, Plans, Photographs, Project Documents, and Warranties now route to `background` (project-level). Added `FILE_TYPE_OVERRIDES` for Accommodation Schedule and Build Programme as deterministic safety nets. Synced `CATEGORY_TO_FOLDER_MAP` in `convex/folderStructure.ts` and the mock client in `src/v4/lib/mock-client.ts` to match. Also fixed mock client bugs: Inspections was mapping to `operational_model` (should be `post_completion`), Communications was mapping to client-level (should be project-level).
```

For **CLS-03**, change `- [ ]` to `- [x]` and add:

```markdown
- [x] **CLS-03** | Fix classification: background docs not categorized as KYC
  - Priority: Critical | Effort: Medium | Category: Classification
  - **Solution:** Two-layer fix. (1) Deterministic: `FILE_TYPE_OVERRIDES` in `placement-rules.ts` ensure Accommodation Schedule and Build Programme always route to `background` regardless of model classification. (2) LLM guidance: Added KYC-negative disambiguation rules to Accommodation Schedule and Build Programme references in `src/lib/references/references/project-documents.ts` ("NOT a KYC document"). Added property-document-negative rule to Certificate of Incorporation in `src/lib/references/references/kyc.ts` warning against classifying construction/property docs as KYC.
```

For **CLS-02**, change `- [ ]` to `- [x]` and add:

```markdown
- [x] **CLS-02** | Migration script: move non-appraisals out of Appraisal folders
  - Priority: Critical | Effort: Medium | Category: Classification
  - **Solution:** Created `convex/migrations.ts` with `migrateAppraisalFolder` mutation. Queries all documents where `folderId === "appraisals"` and `folderType === "project"`. Moves any document whose category is not "Appraisals" to the `background` folder. Supports `dryRun: true` mode to preview moves before executing. Handles edge cases: skips documents with no category (logs for manual review), creates missing background folders, logs all moves with document IDs for audit trail. **Not auto-executed — must be triggered manually.**
```

For **CLS-04**, change `- [ ]` to `- [x]` and add:

```markdown
- [x] **CLS-04** | Fix .EML file classification: classify by content, not file type
  - Priority: High | Effort: High | Category: Classification
  - **Solution:** Three-layer fix to remove email-format bias. (1) `src/v4/lib/document-preprocessor.ts`: Strip `.eml`/`.msg` extensions before `analyzeFilename()` so filename hints don't suggest Communications. (2) `src/lib/references/references/communications.ts`: Removed `eml$` and `msg$` from `filenamePatterns` so the tag resolver doesn't score toward Email/Correspondence on file extension alone. (3) `src/v4/lib/anthropic-client.ts`: Added per-document annotation in `buildBatchUserMessage()` for `.eml`/`.msg` files instructing the model to classify by the actual document content, not the email container. Existing system prompt instruction retained as reinforcement.
```

- [ ] **Step 4: Commit backlog updates**

```bash
git add docs/BACKLOG-2026-03-22.md
git commit -m "docs: update backlog with detailed solution breakdowns for Tier 2 items"
```

- [ ] **Step 5: Push to GitHub**

```bash
git push origin main
```
