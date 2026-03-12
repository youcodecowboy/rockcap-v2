# .eml Content Classification, Version Detection & Bulk Delete

**Goal:** Fix .eml files being misclassified as correspondence, add smart version detection for files with similar names, and add delete functionality to the bulk review table.

**Architecture:** Three independent features that share the bulk upload pipeline. No new pages or routes. Minimal schema additions. All version grouping is client-side.

**Tech Stack:** Next.js, Convex, Anthropic Claude API, React

**Implementation Order:** Feature 3 (Delete) first, then Feature 1 (.eml) and Feature 2 (Versioning) in parallel. Feature 2's merge action depends on Feature 3's `deleteItems` mutation.

---

## Feature 1: .eml Content-Based Classification

### Problem

.eml files are always classified as "Email/Correspondence" regardless of their actual content. Three layers of bias cause this:

1. **Text extraction** (`fileProcessor.ts`) prefixes content with email headers (From, To, Subject, Date), making everything look like correspondence
2. **Filename hints** (`document-preprocessor.ts`) — if a hint rule matching `.eml`/email exists, remove it. If not present, skip this step.
3. **Reference library** (`communications.ts`) has two problematic decision rules:
   - Priority-10 "require" rule for `.eml`/`.msg` file extensions (line ~126)
   - Priority-9 "require" rule for email headers (From/To/Subject/Date) in content (line ~106)

### Solution

Strip email headers from classification input, remove/downgrade bias rules, and store email metadata separately as provenance.

### Changes

**`src/lib/fileProcessor.ts`**
- Split .eml handling into two exported functions:
  - `extractEmailBody(raw: string): string` — parses the raw .eml text and returns only the body content (no headers, no quoted header blocks from forwarded messages). This is what gets sent to the classification pipeline.
  - `extractEmailMetadata(raw: string): { from?: string; to?: string; subject?: string; date?: string }` — extracts structured email metadata for provenance storage.
- The main `extractTextFromFile()` function calls `extractEmailBody()` for .eml files instead of the current header-prefixed approach.

**`src/v4/lib/document-preprocessor.ts`**
- Check if any filename hint rule matches `.eml` extension or "email" keyword to "Email/Correspondence". If found, remove it. If no such rule exists, skip this file.

**`src/lib/references/references/communications.ts`**
- Change the `.eml`/`.msg` extension decision rule from `priority: 10, action: 'require'` to `priority: 3, action: 'boost'`.
- Change the email headers (From/To/Subject/Date) decision rule from `priority: 9, action: 'require'` to `priority: 3, action: 'boost'`. Since `extractEmailBody()` strips headers from the main text, this rule should rarely fire — but downgrading it protects against header traces in forwarded/quoted content.

**`src/v4/lib/anthropic-client.ts`**
- Add to the classification system prompt: "For .eml or .msg files, classify based on the document content within the email body, not the email container format. The email format is a delivery mechanism, not a document type."

**`src/app/api/v4-analyze/route.ts`**
- After text extraction, if the file is .eml, also call `extractEmailMetadata()` and pass the result through to `updateItemAnalysis`.

**`convex/schema.ts`**
- Add to `bulkUploadItems` table: `emailMetadata: v.optional(v.object({ from: v.optional(v.string()), to: v.optional(v.string()), subject: v.optional(v.string()), date: v.optional(v.string()) }))`

**`convex/bulkUpload.ts`**
- Add `emailMetadata` to the `updateItemAnalysis` mutation's `args` validator block (required for Convex's strict validation) and include it in the `ctx.db.patch()` call.

**`src/components/BulkReviewTable.tsx`**
- Show a small `Mail` icon (from lucide-react) next to the filename for items that have `emailMetadata` set. Tooltip shows "Received via email from [sender]" or similar.

**Note:** `.msg` (Outlook) files have a binary format that requires a dedicated parser. Handling `.msg` is out of scope — only `.eml` (plaintext RFC 822) is addressed. The reference library rule downgrade covers `.msg` to reduce bias, but no text extraction changes are needed for `.msg`.

### Data Flow

```
.eml file → extractEmailBody() → body text only → V4 pipeline → classifies by content
         → extractEmailMetadata() → { from, to, subject, date } → stored on item as provenance
```

---

## Feature 2: Version Detection + Candidates Panel

### Problem

Files like "Valuation Report - March 2024.pdf" and "Valuation Report - June 2024.pdf" are not detected as versions of the same document. Users must manually identify and link them.

### Solution

Add a filename normalization function that strips dates, version numbers, and copy suffixes. Group files with matching normalized names. Show version candidates in a panel above the review table, similar to the NewProjectsPanel pattern.

### Filename Normalization and Extraction

**New file: `src/lib/versionDetection.ts`**

Two functions work together:

**`parseVersionInfo(filename: string): { normalized: string; extractedDate?: string; extractedVersion?: string }`**

Strips the following patterns from the filename while capturing them:
- **Dates:** `2024-03-01`, `March 2024`, `01.03.24`, `20240301`, `01-03-2024`, `Dec 2022`, etc. → captured in `extractedDate`
- **Version numbers:** `V1`, `V1.0`, `v2`, `_V1.5`, `Version 2`, etc. → captured in `extractedVersion`
- **Copy suffixes:** `(1)`, `(2)`, `[1]`, `copy`, `final`, `revised`, `updated`, `draft` → stripped (not captured)
- **File extensions:** `.pdf`, `.xlsx`, `.docx`, etc. → stripped
- **Cleanup:** collapse whitespace, strip trailing punctuation, lowercase

Examples:
| Input | Normalized | extractedDate | extractedVersion |
|-------|-----------|---------------|-----------------|
| `Valuation Report - March 2024.pdf` | `valuation report` | `March 2024` | — |
| `Valuation Report - June 2024.pdf` | `valuation report` | `June 2024` | — |
| `Report V1.pdf` | `report` | — | `V1` |
| `Report V2.pdf` | `report` | — | `V2` |
| `BGR Model_2024-03-01.xlsx` | `bgr model` | `2024-03-01` | — |
| `Document (1).pdf` | `document` | — | — |
| `Document final.pdf` | `document` | — | — |

**`buildVersionCandidateGroups(items): VersionCandidateGroup[]`**

- Takes the array of bulk upload items (after they reach `ready_for_review`)
- Calls `parseVersionInfo()` on each filename
- Groups items with matching normalized names
- Only returns groups with 2+ items
- Grouping rules for project assignment:
  - Items in the same project → grouped together
  - Items with no project assigned → grouped together freely
  - Items in different projects → NOT grouped together
- Returns groups sorted by item count descending (largest groups first)

Called in the review page (`src/app/docs/bulk/[batchId]/page.tsx`) via `useMemo` when items change.

**Test file: `src/lib/versionDetection.test.ts`** — Unit tests for `parseVersionInfo` covering all date formats, version patterns, copy suffixes, and edge cases.

### VersionCandidatesPanel Component

**New file: `src/components/VersionCandidatesPanel.tsx`**

Appears above the review table when version candidate groups exist. Styled consistently with `NewProjectsPanel` (Card with orange/amber colored border/background to distinguish from the purple new-projects panel).

**Layout:**
- Header: "Version Candidates Detected" with badge showing group count
- One section per group, showing:
  - Group label (the normalized base name, title-cased)
  - List of files in the group with checkboxes, showing filename and detected date/version difference highlighted
- Toolbar appears when 2+ checkboxes selected within a group:
  - **"Version"** button — opens version assignment modal
  - **"Merge"** button — opens merge confirmation

**Version Modal (Dialog):**
- Shows selected files in a list
- Auto-suggests version order: if dates were extracted, sort chronologically (earliest = V1.0). If version numbers were extracted, use those. Otherwise, sort alphabetically.
- Each file has an editable version number input
- "Apply Versions" button:
  - Calls a new `applyVersionLabels` mutation (see below) that sets `version`, `isDuplicate: true`, and `versionType: "significant"` on each item
  - The first item (V1.0) is the base — `isDuplicate` is set to `false` for it
  - Subsequent versions get `isDuplicate: true` and `duplicateOfItemId` referencing the base item's `_id`
  - Items in the review table below update to show their version numbers

**Merge Modal (AlertDialog):**
- Shows selected files, auto-selects the newest as the keeper
- User can change which file to keep via radio buttons
- "Merge — Delete [N] copies" button:
  - Keeps the selected file
  - Deletes the others via `deleteItems` mutation (Feature 3)
  - Updates the review table reactively

### New Mutation: `applyVersionLabels`

**`convex/bulkUpload.ts`**

```
Args: {
  batchId: Id<"bulkUploads">,
  versions: Array<{
    itemId: Id<"bulkUploadItems">,
    version: string,        // "V1.0", "V2.0", etc.
    isBase: boolean,        // true for the V1.0 item
  }>
}
```

For each entry in `versions`:
- Patch the item with `version`, `isDuplicate: !isBase`, `versionType: "significant"`
- If not the base, set `duplicateOfItemId` to the base item's `_id`
- If the base, clear `duplicateOfItemId`

**Schema addition:** `duplicateOfItemId: v.optional(v.id("bulkUploadItems"))` on `bulkUploadItems` table. This allows linking unfiled items to each other (unlike the existing `duplicateOfDocumentId` which requires a filed document).

### Interface

```typescript
interface VersionCandidateGroup {
  normalizedName: string;
  items: Array<{
    _id: Id<"bulkUploadItems">;
    fileName: string;
    extractedDate?: string;    // Date parsed from filename, if any
    extractedVersion?: string; // Version parsed from filename, if any
  }>;
}
```

---

## Feature 3: Delete from Review Table

### Problem

No way to remove unwanted items from a bulk upload batch. Users must file everything or leave items in limbo.

### Changes

**`convex/bulkUpload.ts`** — New mutation: `deleteItems`
```
Args: { batchId: Id<"bulkUploads">, itemIds: Id<"bulkUploadItems">[] }
```
For each item:
- Read the item to check its current status
- Delete the item from `bulkUploadItems`
- Decrement batch counters based on item status:
  - All statuses: decrement `totalFiles`
  - `ready_for_review` or `filed`: decrement `processedFiles`
  - `error`: decrement `errorFiles`
  - `pending` or `processing`: no additional counter changes (only `totalFiles`)
- If item has `fileStorageId`, delete the file from Convex storage (`ctx.storage.delete()`)
- Return count of deleted items

**Edge case:** If all items in a batch are deleted, the batch remains with `totalFiles: 0`. The review page should show an empty state message ("All items have been removed from this batch") rather than breaking.

**`src/components/BulkReviewTable.tsx`** — Toolbar addition:
- Add "Delete Selected" button (red/destructive variant) to the selection toolbar
- Position at the end of the toolbar actions (after Set Type, Set Category, Set Folder)
- Uses `AlertDialog` from `@/components/ui/alert-dialog` (already available in the project — used in other pages). Import it in BulkReviewTable.
- Confirmation text: "Delete [N] items? This removes them from this batch permanently."
- On confirm: calls `deleteItems` mutation, items disappear reactively via the Convex subscription
- Any item status is deletable (pending, processing, ready_for_review, error, filed)

### Safety

- Confirmation dialog required — no silent deletes
- Batch counters kept consistent via the mutation
- Storage cleanup prevents orphaned files

---

## Out of Scope

- MIME attachment extraction from .eml files (future feature)
- `.msg` (Outlook binary format) text extraction
- AI-assisted version grouping (content similarity)
- Cross-batch version detection
- Undo/restore for deleted items
