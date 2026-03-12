# .eml Classification, Version Detection & Bulk Delete Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix .eml misclassification, add smart version detection with a candidates panel, and add bulk delete to the review table.

**Architecture:** Three independent features sharing the bulk upload pipeline. Feature 3 (Delete) is implemented first as Feature 2's merge depends on it. All version grouping is client-side. .eml fix is surgical changes to 4 existing files + schema/mutation updates.

**Tech Stack:** Next.js 16, Convex, Anthropic Claude API, React, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-12-eml-classification-version-detection-design.md`

---

## File Structure

### New Files
- `src/lib/versionDetection.ts` — `parseVersionInfo()` and `buildVersionCandidateGroups()` functions
- `src/lib/versionDetection.test.ts` — Unit tests for version detection
- `src/components/VersionCandidatesPanel.tsx` — Panel UI for version candidate groups

### Modified Files
- `convex/schema.ts` — Add `emailMetadata` and `duplicateOfItemId` fields to `bulkUploadItems`
- `convex/bulkUpload.ts` — Add `emailMetadata` to `updateItemAnalysis` args, new `deleteItems` mutation, new `applyVersionLabels` mutation
- `src/lib/fileProcessor.ts` — Split .eml handling into `extractEmailBody()` and `extractEmailMetadata()`
- `src/v4/lib/document-preprocessor.ts` — Remove email filename hint pattern
- `src/lib/references/references/communications.ts` — Downgrade .eml and email header decision rules
- `src/v4/lib/anthropic-client.ts` — Add .eml classification guidance to system prompt
- `src/app/api/v4-analyze/route.ts` — Extract and pass email metadata for .eml files
- `src/components/BulkReviewTable.tsx` — Add delete button to toolbar, add email icon for .eml items
- `src/app/docs/bulk/[batchId]/page.tsx` — Render VersionCandidatesPanel, wire version/merge actions

---

## Chunk 1: Feature 3 — Delete from Review Table

### Task 1: Add `deleteItems` mutation to Convex

**Files:**
- Modify: `convex/bulkUpload.ts` (add mutation after line ~960)

- [ ] **Step 1: Add the `deleteItems` mutation**

Add this mutation to `convex/bulkUpload.ts` after the existing `setVersionType` mutation (around line 960):

```typescript
// Delete items from a batch (bulk delete from review table)
export const deleteItems = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    itemIds: v.array(v.id("bulkUploadItems")),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");

    let totalDecrement = 0;
    let processedDecrement = 0;
    let errorDecrement = 0;

    for (const itemId of args.itemIds) {
      const item = await ctx.db.get(itemId);
      if (!item || item.batchId !== args.batchId) continue;

      // Decrement counters based on item status
      totalDecrement++;
      if (item.status === "ready_for_review" || item.status === "filed") {
        processedDecrement++;
      } else if (item.status === "error") {
        errorDecrement++;
      }

      // Clean up storage
      if (item.fileStorageId) {
        try {
          await ctx.storage.delete(item.fileStorageId);
        } catch {
          // Storage already deleted — ignore
        }
      }

      await ctx.db.delete(itemId);
    }

    // Update batch counters
    await ctx.db.patch(args.batchId, {
      totalFiles: Math.max(0, (batch.totalFiles || 0) - totalDecrement),
      processedFiles: Math.max(0, (batch.processedFiles || 0) - processedDecrement),
      errorFiles: Math.max(0, (batch.errorFiles || 0) - errorDecrement),
      updatedAt: new Date().toISOString(),
    });

    return { deleted: totalDecrement };
  },
});
```

- [ ] **Step 2: Run `npx convex codegen` to regenerate types**

Run: `npx convex codegen`
Expected: Success, no errors

- [ ] **Step 3: Commit**

```bash
git add convex/bulkUpload.ts
git commit -m "feat: add deleteItems mutation for bulk review table"
```

---

### Task 2: Add delete button to BulkReviewTable toolbar

**Files:**
- Modify: `src/components/BulkReviewTable.tsx` (toolbar section around lines 947-1041)

- [ ] **Step 1: Add imports**

At the top of `BulkReviewTable.tsx`, add to the existing lucide-react import:
- Add `Trash2` to the lucide-react import
- Add the AlertDialog imports:

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
```

Also add the Convex mutation import near the other useMutation calls:

```typescript
const deleteItems = useMutation(api.bulkUpload.deleteItems);
```

- [ ] **Step 2: Add the delete button after the "Set Folder" popover**

After the last `</Popover>` in the selection toolbar (the "Set Folder" popover, around line 1040), add:

```typescript
{/* Bulk Delete */}
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 text-red-600 border-red-200 hover:bg-red-50">
      <Trash2 className="w-3 h-3" />
      Delete
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete {selectedItems.size} items?</AlertDialogTitle>
      <AlertDialogDescription>
        This removes them from this batch permanently. Files will be deleted from storage.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        className="bg-red-600 hover:bg-red-700"
        onClick={async () => {
          const batchId = items[0]?.batchId;
          if (!batchId) return;
          await deleteItems({ batchId, itemIds: Array.from(selectedItems) as any });
          setSelectedItems(new Set());
          toast.success(`Deleted ${selectedItems.size} items`);
        }}
      >
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/BulkReviewTable.tsx
git commit -m "feat: add bulk delete button to review table toolbar"
```

---

## Chunk 2: Feature 1 — .eml Content-Based Classification

### Task 3: Split .eml handling in fileProcessor.ts

**Files:**
- Modify: `src/lib/fileProcessor.ts` (lines 19-43)

- [ ] **Step 1: Replace the existing .eml block with split functions**

Replace the .eml handling block (lines 19-43 of `fileProcessor.ts`) with:

```typescript
// Handle EML (email) files — extract body only for classification (no headers)
if (fileType === 'message/rfc822' || fileName.endsWith('.eml')) {
  const raw = await file.text();
  return extractEmailBody(raw);
}
```

Then add two exported functions at the bottom of the file (or before the default export):

```typescript
/**
 * Extract the body content from a raw .eml file, stripping all email headers.
 * This ensures classification is based on document content, not email format.
 */
export function extractEmailBody(raw: string): string {
  const blankLineIndex = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  if (blankLineIndex === -1) return raw;
  let body = raw.slice(blankLineIndex).trim();

  // Strip quoted headers from forwarded messages (lines starting with "> From:", etc.)
  body = body.replace(/^>?\s*(From|To|Cc|Bcc|Date|Subject|Sent|Reply-To):.*$/gm, '');
  // Strip common forward/reply markers
  body = body.replace(/^-{3,}\s*(Forwarded|Original)\s+[Mm]essage\s*-{3,}$/gm, '');

  return body.trim();
}

/**
 * Extract structured email metadata from a raw .eml file for provenance storage.
 */
export function extractEmailMetadata(raw: string): {
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
} {
  const blankLineIndex = raw.indexOf('\r\n\r\n') !== -1 ? raw.indexOf('\r\n\r\n') : raw.indexOf('\n\n');
  if (blankLineIndex === -1) return {};
  const headerSection = raw.slice(0, blankLineIndex);
  const getHeader = (name: string) => {
    const match = headerSection.match(new RegExp(`^${name}:\\s*(.+)`, 'im'));
    return match ? match[1].trim() : undefined;
  };
  return {
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/fileProcessor.ts
git commit -m "feat: split .eml handling into extractEmailBody and extractEmailMetadata"
```

---

### Task 4: Remove email bias from preprocessor and reference library

**Files:**
- Modify: `src/v4/lib/document-preprocessor.ts` (line ~79)
- Modify: `src/lib/references/references/communications.ts` (lines ~104-128)

- [ ] **Step 1: Remove email filename hint from document-preprocessor.ts**

In `src/v4/lib/document-preprocessor.ts`, find the pattern at line ~79:

```typescript
{ pattern: /email|correspondence|letter/i, fileType: 'Email/Correspondence', category: 'Communications', tags: ['communications'] },
```

Change it to only match "correspondence" and "letter" (not "email", which would catch .eml files):

```typescript
{ pattern: /correspondence|letter/i, fileType: 'Email/Correspondence', category: 'Communications', tags: ['communications'] },
```

- [ ] **Step 2: Downgrade decision rules in communications.ts**

In `src/lib/references/references/communications.ts`, find the decision rules:

Change the email headers rule (~line 106) from:
```typescript
priority: 9,
action: 'require',
```
to:
```typescript
priority: 3,
action: 'boost',
```

Change the .eml/.msg extension rule (~line 126) from:
```typescript
priority: 10,
action: 'require',
```
to:
```typescript
priority: 3,
action: 'boost',
```

- [ ] **Step 3: Add .eml guidance to system prompt**

In `src/v4/lib/anthropic-client.ts`, in the `buildSystemPrompt` function (around line 97), add to the end of the `stableBlock` string:

```typescript
stableBlock: `${skillInstructions}\n\n## Available Folders\n${folderList || '(none)'}\n\n## Email File Handling\nFor .eml or .msg files, classify based on the document content within the email body, not the email container format. The email format is a delivery mechanism, not a document type. A valuation report forwarded by email is still a valuation report.`,
```

- [ ] **Step 4: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/v4/lib/document-preprocessor.ts src/lib/references/references/communications.ts src/v4/lib/anthropic-client.ts
git commit -m "fix: remove .eml classification bias — classify by content not format"
```

---

### Task 5: Add emailMetadata to schema, mutation, and API route

**Files:**
- Modify: `convex/schema.ts` (bulkUploadItems table, around line 880)
- Modify: `convex/bulkUpload.ts` (updateItemAnalysis mutation, around line 410)
- Modify: `src/app/api/v4-analyze/route.ts` (around line 140)

- [ ] **Step 1: Add emailMetadata field to schema**

In `convex/schema.ts`, inside the `bulkUploadItems` table definition (after the `fileStorageId` field, around line 880):

```typescript
emailMetadata: v.optional(v.object({
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  subject: v.optional(v.string()),
  date: v.optional(v.string()),
})),
```

- [ ] **Step 2: Add emailMetadata to updateItemAnalysis mutation args**

In `convex/bulkUpload.ts`, add to the `args` block of `updateItemAnalysis` (after `suggestedProjectName` around line 501):

```typescript
emailMetadata: v.optional(v.object({
  from: v.optional(v.string()),
  to: v.optional(v.string()),
  subject: v.optional(v.string()),
  date: v.optional(v.string()),
})),
```

Then in the handler, add `emailMetadata` to the destructured args (line ~506) and include it in the `ctx.db.patch()` call:

In the destructured line, add `emailMetadata` to the extracted fields:
```typescript
const { itemId, suggestedChecklistItems, extractedIntelligence, documentAnalysis, classificationReasoning, textContent, suggestedProjectId, suggestedProjectName, projectConfidence, projectReasoning, emailMetadata, ...updates } = args;
```

In the `ctx.db.patch()` call, add:
```typescript
emailMetadata,
```

- [ ] **Step 3: Extract and pass emailMetadata in v4-analyze route**

In `src/app/api/v4-analyze/route.ts`, after the text extraction loop (around line 146), add logic to extract email metadata for .eml files. This metadata needs to be passed through the pipeline result and included in the updateItemAnalysis call.

Find where the file metadata is prepared for the pipeline. After text extraction, add:

```typescript
// Extract email metadata for .eml files (provenance tracking)
const emailMetadataMap: Map<number, any> = new Map();
for (let i = 0; i < files.length; i++) {
  const { file } = files[i];
  if (file.name.endsWith('.eml') || file.type === 'message/rfc822') {
    try {
      const { extractEmailMetadata } = await import('@/lib/fileProcessor');
      const raw = await (file as File).text();
      const metadata = extractEmailMetadata(raw);
      if (metadata.from || metadata.subject) {
        emailMetadataMap.set(i, metadata);
      }
    } catch {
      // Ignore — metadata is optional provenance
    }
  }
}
```

Then include `emailMetadataMap` in the response that gets passed to `updateItemAnalysis`. Find where the pipeline results are mapped/returned and ensure `emailMetadata` from the map is included in the per-document result for the caller (bulkQueueProcessor or background processor) to pass to `updateItemAnalysis`.

The simplest approach: add `emailMetadata` to the V4 API response JSON alongside each document result.

In the result mapping section (after `runV4Pipeline`), when building the response documents array, add:

```typescript
emailMetadata: emailMetadataMap.get(i) || undefined,
```

- [ ] **Step 4: Pass emailMetadata through bulkQueueProcessor**

In `src/lib/bulkQueueProcessor.ts`, in the `processItem` method, after parsing the V4 response (around line 546), extract `emailMetadata` from the response:

```typescript
const emailMetadata = doc.emailMetadata || undefined;
```

Then include it in the `updateArgs`:

```typescript
emailMetadata,
```

- [ ] **Step 5: Add email icon to BulkReviewTable filename cell**

In `src/components/BulkReviewTable.tsx`, find the filename cell (around line 1192). Add a Mail icon for items with emailMetadata:

After the `FileText` icon, add:

```typescript
{item.emailMetadata && (
  <Tooltip>
    <TooltipTrigger>
      <Mail className="w-3 h-3 text-blue-400 flex-shrink-0" />
    </TooltipTrigger>
    <TooltipContent>
      {item.emailMetadata.from ? `Via email from ${item.emailMetadata.from}` : 'Received via email'}
    </TooltipContent>
  </Tooltip>
)}
```

Add `Mail` to the lucide-react imports at the top of the file.

- [ ] **Step 6: Run codegen and verify build**

Run: `npx convex codegen && npx next build`
Expected: Both succeed

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/bulkUpload.ts src/app/api/v4-analyze/route.ts src/lib/bulkQueueProcessor.ts src/components/BulkReviewTable.tsx
git commit -m "feat: store email metadata as provenance, show email icon in review table"
```

---

## Chunk 3: Feature 2 — Version Detection + Candidates Panel

### Task 6: Create version detection utility with tests

**Files:**
- Create: `src/lib/versionDetection.ts`
- Create: `src/lib/versionDetection.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/versionDetection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseVersionInfo, buildVersionCandidateGroups } from './versionDetection';

describe('parseVersionInfo', () => {
  it('strips dates in YYYY-MM-DD format', () => {
    const result = parseVersionInfo('Report 2024-03-01.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('2024-03-01');
  });

  it('strips dates in Month Year format', () => {
    const result = parseVersionInfo('Valuation Report - March 2024.pdf');
    expect(result.normalized).toBe('valuation report');
    expect(result.extractedDate).toBe('March 2024');
  });

  it('strips dates in Mon Year format', () => {
    const result = parseVersionInfo('BGR Valuation - Dec 2022.pdf');
    expect(result.normalized).toBe('bgr valuation');
    expect(result.extractedDate).toBe('Dec 2022');
  });

  it('strips dates in DD.MM.YY format', () => {
    const result = parseVersionInfo('Report 01.03.24.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('01.03.24');
  });

  it('strips dates in DD-MM-YYYY format', () => {
    const result = parseVersionInfo('Report 01-03-2024.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('01-03-2024');
  });

  it('strips compact dates YYYYMMDD', () => {
    const result = parseVersionInfo('Report_20240301.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedDate).toBe('20240301');
  });

  it('strips version numbers like V1, V2', () => {
    const result = parseVersionInfo('Report V2.pdf');
    expect(result.normalized).toBe('report');
    expect(result.extractedVersion).toBe('V2');
  });

  it('strips version numbers like V1.0, V2.5', () => {
    const result = parseVersionInfo('Model V1.5.xlsx');
    expect(result.normalized).toBe('model');
    expect(result.extractedVersion).toBe('V1.5');
  });

  it('strips copy suffixes like (1), (2)', () => {
    const result = parseVersionInfo('Document (1).pdf');
    expect(result.normalized).toBe('document');
  });

  it('strips copy suffixes like [1]', () => {
    const result = parseVersionInfo('Document [2].pdf');
    expect(result.normalized).toBe('document');
  });

  it('strips "copy", "final", "revised", "updated", "draft"', () => {
    expect(parseVersionInfo('Report final.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report revised.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report copy.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report updated.pdf').normalized).toBe('report');
    expect(parseVersionInfo('Report draft.pdf').normalized).toBe('report');
  });

  it('strips file extensions', () => {
    const result = parseVersionInfo('Report.xlsx');
    expect(result.normalized).toBe('report');
  });

  it('handles complex real-world filenames', () => {
    const r1 = parseVersionInfo('42 Wolverhampton St Valuation - March 2024.pdf');
    const r2 = parseVersionInfo('42 Wolverhampton St Valuation - June 2024.pdf');
    expect(r1.normalized).toBe(r2.normalized);
  });

  it('handles underscores and hyphens as separators', () => {
    const r1 = parseVersionInfo('BGR_Model_2024-03-01.xlsx');
    const r2 = parseVersionInfo('BGR_Model_2024-03-15.xlsx');
    expect(r1.normalized).toBe(r2.normalized);
  });

  it('returns no date or version when none present', () => {
    const result = parseVersionInfo('Simple Document.pdf');
    expect(result.normalized).toBe('simple document');
    expect(result.extractedDate).toBeUndefined();
    expect(result.extractedVersion).toBeUndefined();
  });
});

describe('buildVersionCandidateGroups', () => {
  const makeItem = (id: string, fileName: string, projectId?: string) => ({
    _id: id as any,
    fileName,
    itemProjectId: projectId,
    status: 'ready_for_review' as const,
  });

  it('groups files with matching normalized names', () => {
    const items = [
      makeItem('1', 'Valuation Report - March 2024.pdf'),
      makeItem('2', 'Valuation Report - June 2024.pdf'),
      makeItem('3', 'Completely Different.pdf'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('does not group files in different projects', () => {
    const items = [
      makeItem('1', 'Report V1.pdf', 'projA'),
      makeItem('2', 'Report V2.pdf', 'projB'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(0);
  });

  it('groups unassigned items together', () => {
    const items = [
      makeItem('1', 'Report V1.pdf'),
      makeItem('2', 'Report V2.pdf'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(1);
  });

  it('returns empty array when no groups have 2+ items', () => {
    const items = [
      makeItem('1', 'Unique File A.pdf'),
      makeItem('2', 'Unique File B.pdf'),
    ];
    const groups = buildVersionCandidateGroups(items as any);
    expect(groups).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/versionDetection.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement versionDetection.ts**

Create `src/lib/versionDetection.ts`:

```typescript
import type { Id } from '../../convex/_generated/dataModel';

// Date patterns to strip and capture
const DATE_PATTERNS = [
  // YYYY-MM-DD or YYYY/MM/DD
  /(\d{4}[-/]\d{2}[-/]\d{2})/g,
  // DD-MM-YYYY or DD/MM/YYYY
  /(\d{2}[-/]\d{2}[-/]\d{4})/g,
  // DD.MM.YY or DD.MM.YYYY
  /(\d{2}\.\d{2}\.\d{2,4})/g,
  // YYYYMMDD (8 consecutive digits that look like a date)
  /(?<!\d)(20\d{6})(?!\d)/g,
  // Month YYYY or Mon YYYY (e.g., "March 2024", "Dec 2022")
  /((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi,
  // DD Month YYYY
  /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi,
];

// Version patterns to strip and capture
const VERSION_PATTERNS = [
  // V1, V1.0, V2.5, v1, version 2
  /\b[Vv](?:ersion\s*)?(\d+(?:\.\d+)?)\b/g,
];

// Copy/status suffixes to strip (not captured)
const COPY_SUFFIXES = /\b(copy|final|revised|updated|draft)\b/gi;
const BRACKET_SUFFIXES = /\((\d+)\)|\[(\d+)\]/g;

// File extensions
const FILE_EXTENSION = /\.\w{2,5}$/;

export interface ParsedVersionInfo {
  normalized: string;
  extractedDate?: string;
  extractedVersion?: string;
}

/**
 * Parse a filename to extract a normalized base name (for grouping)
 * and any date/version information (for ordering).
 */
export function parseVersionInfo(filename: string): ParsedVersionInfo {
  let name = filename;
  let extractedDate: string | undefined;
  let extractedVersion: string | undefined;

  // Strip file extension first
  name = name.replace(FILE_EXTENSION, '');

  // Extract and strip dates
  for (const pattern of DATE_PATTERNS) {
    const match = name.match(pattern);
    if (match && !extractedDate) {
      extractedDate = match[0];
    }
    name = name.replace(pattern, ' ');
  }

  // Extract and strip version numbers
  for (const pattern of VERSION_PATTERNS) {
    const match = filename.match(pattern);
    if (match && !extractedVersion) {
      extractedVersion = match[0];
    }
    name = name.replace(pattern, ' ');
  }

  // Strip copy suffixes and bracket numbers
  name = name.replace(COPY_SUFFIXES, ' ');
  name = name.replace(BRACKET_SUFFIXES, ' ');

  // Normalize: replace separators with spaces, collapse, lowercase, trim
  name = name
    .replace(/[_\-./\\,;:]+/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  return {
    normalized: name,
    extractedDate,
    extractedVersion,
  };
}

export interface VersionCandidateGroup {
  normalizedName: string;
  items: Array<{
    _id: Id<"bulkUploadItems">;
    fileName: string;
    extractedDate?: string;
    extractedVersion?: string;
  }>;
}

/**
 * Group bulk upload items into version candidate clusters.
 * Only returns groups with 2+ items that share the same normalized filename.
 */
export function buildVersionCandidateGroups(
  items: Array<{
    _id: Id<"bulkUploadItems">;
    fileName: string;
    itemProjectId?: string;
    status: string;
  }>,
): VersionCandidateGroup[] {
  // Only consider items that are ready for review
  const reviewItems = items.filter(i => i.status === 'ready_for_review');

  // Group by normalized name + project scope
  const groups = new Map<string, VersionCandidateGroup>();

  for (const item of reviewItems) {
    const parsed = parseVersionInfo(item.fileName);
    if (!parsed.normalized) continue;

    // Group key includes project to prevent cross-project grouping
    const projectKey = item.itemProjectId || '__unassigned__';
    const groupKey = `${projectKey}::${parsed.normalized}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        normalizedName: parsed.normalized,
        items: [],
      });
    }

    groups.get(groupKey)!.items.push({
      _id: item._id,
      fileName: item.fileName,
      extractedDate: parsed.extractedDate,
      extractedVersion: parsed.extractedVersion,
    });
  }

  // Only return groups with 2+ items, sorted by size descending
  return Array.from(groups.values())
    .filter(g => g.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/versionDetection.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/versionDetection.ts src/lib/versionDetection.test.ts
git commit -m "feat: add version detection utility with parseVersionInfo and buildVersionCandidateGroups"
```

---

### Task 7: Add `applyVersionLabels` mutation and schema field

**Files:**
- Modify: `convex/schema.ts` (bulkUploadItems table)
- Modify: `convex/bulkUpload.ts` (add new mutation)

- [ ] **Step 1: Add `duplicateOfItemId` to schema**

In `convex/schema.ts`, in the `bulkUploadItems` table, near the existing `duplicateOfDocumentId` field (around line 948), add:

```typescript
duplicateOfItemId: v.optional(v.id("bulkUploadItems")),
```

- [ ] **Step 2: Add `applyVersionLabels` mutation**

In `convex/bulkUpload.ts`, add after the `deleteItems` mutation:

```typescript
// Apply version labels to a group of items (from version candidates panel)
export const applyVersionLabels = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    versions: v.array(v.object({
      itemId: v.id("bulkUploadItems"),
      version: v.string(),
      isBase: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    // Find the base item
    const baseEntry = args.versions.find(v => v.isBase);
    if (!baseEntry) throw new Error("No base version specified");

    for (const entry of args.versions) {
      await ctx.db.patch(entry.itemId, {
        version: entry.version,
        isDuplicate: !entry.isBase,
        versionType: entry.isBase ? undefined : "significant",
        duplicateOfItemId: entry.isBase ? undefined : baseEntry.itemId,
        updatedAt: new Date().toISOString(),
      });
    }

    return { updated: args.versions.length };
  },
});
```

- [ ] **Step 3: Run codegen and verify build**

Run: `npx convex codegen && npx next build`
Expected: Both succeed

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/bulkUpload.ts
git commit -m "feat: add applyVersionLabels mutation and duplicateOfItemId schema field"
```

---

### Task 8: Create VersionCandidatesPanel component

**Files:**
- Create: `src/components/VersionCandidatesPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/VersionCandidatesPanel.tsx`:

```typescript
'use client';

import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GitBranch, Merge, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { VersionCandidateGroup } from '@/lib/versionDetection';
import type { Id } from '../../convex/_generated/dataModel';

interface VersionCandidatesPanelProps {
  groups: VersionCandidateGroup[];
  onApplyVersions: (versions: Array<{ itemId: Id<"bulkUploadItems">; version: string; isBase: boolean }>) => Promise<void>;
  onDeleteItems: (itemIds: Id<"bulkUploadItems">[]) => Promise<void>;
}

export default function VersionCandidatesPanel({ groups, onApplyVersions, onDeleteItems }: VersionCandidatesPanelProps) {
  // Track selected items per group: groupIndex -> Set of item _ids
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map());
  const [versionModalGroup, setVersionModalGroup] = useState<number | null>(null);
  const [mergeModalGroup, setMergeModalGroup] = useState<number | null>(null);
  const [versionInputs, setVersionInputs] = useState<Map<string, string>>(new Map());
  const [keepItemId, setKeepItemId] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const toggleItem = (groupIdx: number, itemId: string) => {
    setSelections(prev => {
      const next = new Map(prev);
      const groupSet = new Set(next.get(groupIdx) || []);
      if (groupSet.has(itemId)) {
        groupSet.delete(itemId);
      } else {
        groupSet.add(itemId);
      }
      next.set(groupIdx, groupSet);
      return next;
    });
  };

  const getSelectedCount = (groupIdx: number) => selections.get(groupIdx)?.size || 0;

  // Auto-suggest version order for modal
  const openVersionModal = (groupIdx: number) => {
    const group = groups[groupIdx];
    const selected = selections.get(groupIdx) || new Set();
    const selectedItems = group.items.filter(i => selected.has(i._id));

    // Sort by date if available, otherwise by version, otherwise by filename
    const sorted = [...selectedItems].sort((a, b) => {
      if (a.extractedDate && b.extractedDate) return a.extractedDate.localeCompare(b.extractedDate);
      if (a.extractedVersion && b.extractedVersion) return a.extractedVersion.localeCompare(b.extractedVersion);
      return a.fileName.localeCompare(b.fileName);
    });

    const inputs = new Map<string, string>();
    sorted.forEach((item, idx) => {
      inputs.set(item._id, `V${idx + 1}.0`);
    });
    setVersionInputs(inputs);
    setVersionModalGroup(groupIdx);
  };

  const openMergeModal = (groupIdx: number) => {
    const group = groups[groupIdx];
    const selected = selections.get(groupIdx) || new Set();
    const selectedItems = group.items.filter(i => selected.has(i._id));
    // Default to keeping the last item (newest by sort order)
    setKeepItemId(selectedItems[selectedItems.length - 1]?._id || null);
    setMergeModalGroup(groupIdx);
  };

  const handleApplyVersions = async () => {
    if (versionModalGroup === null) return;
    setIsApplying(true);
    try {
      const entries = Array.from(versionInputs.entries()).map(([itemId, version]) => ({
        itemId: itemId as Id<"bulkUploadItems">,
        version,
        isBase: version === 'V1.0',
      }));
      await onApplyVersions(entries);
      // Clear selection for this group
      setSelections(prev => {
        const next = new Map(prev);
        next.delete(versionModalGroup);
        return next;
      });
      setVersionModalGroup(null);
    } finally {
      setIsApplying(false);
    }
  };

  const handleMerge = async () => {
    if (mergeModalGroup === null || !keepItemId) return;
    setIsApplying(true);
    try {
      const group = groups[mergeModalGroup];
      const selected = selections.get(mergeModalGroup) || new Set();
      const toDelete = group.items
        .filter(i => selected.has(i._id) && i._id !== keepItemId)
        .map(i => i._id as Id<"bulkUploadItems">);
      await onDeleteItems(toDelete);
      setSelections(prev => {
        const next = new Map(prev);
        next.delete(mergeModalGroup);
        return next;
      });
      setMergeModalGroup(null);
    } finally {
      setIsApplying(false);
    }
  };

  if (groups.length === 0) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-amber-600" />
            <CardTitle className="text-base">Version Candidates Detected</CardTitle>
            <Badge variant="secondary" className="ml-auto">
              {groups.length} group{groups.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.map((group, groupIdx) => {
            const selectedCount = getSelectedCount(groupIdx);
            return (
              <div key={group.normalizedName} className="border rounded-md p-3 bg-white">
                <div className="text-sm font-medium text-amber-800 mb-2 capitalize">
                  {group.normalizedName}
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({group.items.length} files)
                  </span>
                </div>
                <div className="space-y-1">
                  {group.items.map(item => (
                    <label
                      key={item._id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selections.get(groupIdx)?.has(item._id) || false}
                        onCheckedChange={() => toggleItem(groupIdx, item._id)}
                      />
                      <span className="text-xs truncate flex-1" title={item.fileName}>
                        {item.fileName}
                      </span>
                      {item.extractedDate && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {item.extractedDate}
                        </Badge>
                      )}
                      {item.extractedVersion && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {item.extractedVersion}
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
                {selectedCount >= 2 && (
                  <div className="flex gap-2 mt-2 pt-2 border-t">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => openVersionModal(groupIdx)}
                    >
                      <GitBranch className="w-3 h-3 mr-1" />
                      Version
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => openMergeModal(groupIdx)}
                    >
                      <Merge className="w-3 h-3 mr-1" />
                      Merge
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Version Assignment Modal */}
      <Dialog open={versionModalGroup !== null} onOpenChange={() => setVersionModalGroup(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Version Numbers</DialogTitle>
            <DialogDescription>
              Set the version for each file. V1.0 is treated as the base version.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 my-4">
            {versionModalGroup !== null && groups[versionModalGroup] &&
              groups[versionModalGroup].items
                .filter(i => selections.get(versionModalGroup!)?.has(i._id))
                .map(item => (
                  <div key={item._id} className="flex items-center gap-3">
                    <span className="text-xs truncate flex-1" title={item.fileName}>
                      {item.fileName}
                    </span>
                    <Input
                      value={versionInputs.get(item._id) || ''}
                      onChange={(e) => {
                        setVersionInputs(prev => {
                          const next = new Map(prev);
                          next.set(item._id, e.target.value);
                          return next;
                        });
                      }}
                      className="w-20 h-7 text-xs font-mono text-center"
                    />
                  </div>
                ))
            }
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVersionModalGroup(null)}>Cancel</Button>
            <Button onClick={handleApplyVersions} disabled={isApplying}>
              {isApplying ? 'Applying...' : 'Apply Versions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Confirmation Modal */}
      <AlertDialog open={mergeModalGroup !== null} onOpenChange={() => setMergeModalGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge Files</AlertDialogTitle>
            <AlertDialogDescription>
              Choose which file to keep. The others will be deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1 my-4">
            {mergeModalGroup !== null && groups[mergeModalGroup] &&
              groups[mergeModalGroup].items
                .filter(i => selections.get(mergeModalGroup!)?.has(i._id))
                .map(item => (
                  <label key={item._id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                    <input
                      type="radio"
                      name="keepItem"
                      checked={keepItemId === item._id}
                      onChange={() => setKeepItemId(item._id)}
                      className="accent-green-600"
                    />
                    <span className="text-xs truncate">{item.fileName}</span>
                    {keepItemId === item._id && (
                      <Badge className="bg-green-100 text-green-800 text-[10px]">Keep</Badge>
                    )}
                  </label>
                ))
            }
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleMerge}
              disabled={isApplying}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Merge — Delete {mergeModalGroup !== null ? (getSelectedCount(mergeModalGroup) - 1) : 0} copies
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/VersionCandidatesPanel.tsx
git commit -m "feat: add VersionCandidatesPanel component with version and merge modals"
```

---

### Task 9: Wire VersionCandidatesPanel into the review page

**Files:**
- Modify: `src/app/docs/bulk/[batchId]/page.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at the top of the file:

```typescript
import VersionCandidatesPanel from '@/components/VersionCandidatesPanel';
import { buildVersionCandidateGroups } from '@/lib/versionDetection';
```

Add the mutation:

```typescript
const applyVersionLabels = useMutation(api.bulkUpload.applyVersionLabels);
const deleteItems = useMutation(api.bulkUpload.deleteItems);
```

- [ ] **Step 2: Add version candidate groups memo**

After the existing `newProjects` state and effect (around line 165), add:

```typescript
// Build version candidate groups from items
const versionCandidateGroups = useMemo(() => {
  if (!items || batch?.status !== 'review') return [];
  return buildVersionCandidateGroups(items as any);
}, [items, batch?.status]);
```

- [ ] **Step 3: Add handler functions**

After the existing `handleCreateProjects` function, add:

```typescript
const handleApplyVersions = async (versions: Array<{ itemId: any; version: string; isBase: boolean }>) => {
  if (!batch) return;
  await applyVersionLabels({ batchId: batch._id, versions });
  toast.success(`Applied version labels to ${versions.length} items`);
};

const handleDeleteItems = async (itemIds: any[]) => {
  if (!batch) return;
  await deleteItems({ batchId: batch._id, itemIds });
  toast.success(`Deleted ${itemIds.length} items`);
};
```

- [ ] **Step 4: Render the panel**

Find where `NewProjectsPanel` is rendered (around line 725). Add the `VersionCandidatesPanel` right after it:

```typescript
{/* Version Candidates Panel — shown when version candidate groups are detected */}
{batch?.status === 'review' && versionCandidateGroups.length > 0 && (
  <VersionCandidatesPanel
    groups={versionCandidateGroups}
    onApplyVersions={handleApplyVersions}
    onDeleteItems={handleDeleteItems}
  />
)}
```

- [ ] **Step 5: Add empty batch state**

Find where the `BulkReviewTable` is rendered. Wrap it with an empty-state check:

```typescript
{items && items.length === 0 ? (
  <div className="text-center py-12 text-muted-foreground">
    All items have been removed from this batch.
  </div>
) : (
  <BulkReviewTable ... />
)}
```

- [ ] **Step 6: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/app/docs/bulk/[batchId]/page.tsx
git commit -m "feat: wire VersionCandidatesPanel into bulk review page"
```

---

### Task 10: Final build and push

- [ ] **Step 1: Run full build**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/lib/versionDetection.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit any remaining changes and push**

```bash
git push origin main
```
