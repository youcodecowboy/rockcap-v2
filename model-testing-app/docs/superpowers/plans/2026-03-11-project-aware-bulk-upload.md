# Project-Aware Bulk Upload + Quick Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 quick bugs in the bulk upload flow (folder drag-drop, folder button first-click, safe-to-leave messaging) and add project-aware bulk upload that auto-creates projects at filing time with an editable New Projects panel.

**Architecture:** Two-mutation approach — `createBulkUploadProjects` runs before `fileBatch` to create projects and return a name→ID mapping. Frontend shows an editable New Projects panel when new project names are detected. `fileBatch` receives the mapping and assigns items to the correct projects. Graceful checklist fallback handles async initialization.

**Tech Stack:** Convex mutations/queries, Next.js 16, React, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-11-project-aware-bulk-upload-design.md`

---

## Chunk 1: Quick Fixes

### Task 1: Fix folder drag-and-drop recursive extraction

**Files:**
- Modify: `src/components/BulkUpload.tsx` — `handleDrop` (~line 328), add `traverseFileTree` helper

The current `handleDrop` (line 328) reads `e.dataTransfer.files` which returns the folder as a single empty item. We need to use `webkitGetAsEntry()` to walk directory trees recursively and collect all files.

- [ ] **Step 1: Add `traverseFileTree` helper above `BulkUpload` component**

Add this helper function above the component (around line 74, before `extractFolderHints`):

```typescript
/**
 * Recursively traverse a FileSystemEntry tree and collect all files.
 * Used for drag-and-drop folder support.
 */
async function traverseFileTree(entry: FileSystemEntry, path: string = ''): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((file) => {
        // Attach the relative path so extractFolderHints can use it
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false,
        });
        resolve([file]);
      }, () => resolve([])); // Skip files that can't be read
    });
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();

    // readEntries returns batches of up to 100 — must loop until empty
    const readAllEntries = (): Promise<FileSystemEntry[]> =>
      new Promise((resolve) => {
        const batch: FileSystemEntry[] = [];
        const readBatch = () => {
          dirReader.readEntries((results) => {
            if (results.length === 0) {
              resolve(batch);
            } else {
              batch.push(...results);
              readBatch();
            }
          }, () => resolve(batch)); // Skip unreadable dirs
        };
        readBatch();
      });

    const childEntries = await readAllEntries();
    const files: File[] = [];
    for (const child of childEntries) {
      const childFiles = await traverseFileTree(child, path + entry.name + '/');
      files.push(...childFiles);
    }
    return files;
  }

  return [];
}
```

- [ ] **Step 2: Replace `handleDrop` to use `traverseFileTree`**

Find the current `handleDrop` at line 328:

```typescript
const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, [handleFiles]);
```

Replace with:

```typescript
const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const items = e.dataTransfer.items;
    const allFiles: File[] = [];

    // Use webkitGetAsEntry to detect folders vs files
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      }
    }

    if (entries.length > 0) {
      // We have entries — traverse any directories
      for (const entry of entries) {
        const files = await traverseFileTree(entry);
        allFiles.push(...files);
      }
    } else {
      // Fallback: browser doesn't support webkitGetAsEntry
      allFiles.push(...Array.from(e.dataTransfer.files));
    }

    if (allFiles.length === 0) return;

    // Extract folder hints if no project is pre-selected (same as handleFolderSelect)
    if (!selectedProjectId) {
      const hints = extractFolderHints(allFiles);
      if (hints.size > 0) {
        setFolderHints(hints);
        setDetectedProjects([...new Set(hints.values())]);
      }
    }

    handleFiles(allFiles);
  }, [handleFiles, selectedProjectId]);
```

Note: The dependency array adds `selectedProjectId` because the folder hint extraction checks it.

- [ ] **Step 3: Verify the build compiles**

```bash
npx next build
```

Expected: no errors related to `handleDrop` or `traverseFileTree`. Fix any TypeScript issues (e.g., `FileSystemEntry` types may need `/// <reference lib="dom" />` or type assertions).

If `FileSystemEntry`, `FileSystemFileEntry`, or `FileSystemDirectoryEntry` types are not found, add these type declarations at the top of the file (after imports):

```typescript
// Type declarations for File System Access API (drag-and-drop folder support)
declare global {
  interface DataTransferItem {
    webkitGetAsEntry?(): FileSystemEntry | null;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/BulkUpload.tsx
git commit -m "fix: recursive folder extraction for drag-and-drop uploads"
```

---

### Task 2: Fix Upload Folder button first-click bug

**Files:**
- Modify: `src/components/BulkUpload.tsx` — Upload Folder button (~line 1247)

- [ ] **Step 1: Wrap the folder button click in `requestAnimationFrame`**

Find line 1247:

```typescript
<Button variant="outline" onClick={() => folderInputRef.current?.click()} disabled={isUploading}>
```

Replace with:

```typescript
<Button variant="outline" onClick={() => requestAnimationFrame(() => folderInputRef.current?.click())} disabled={isUploading}>
```

- [ ] **Step 2: Verify the build compiles**

```bash
npx next build
```

Expected: passes. This is a one-line change.

- [ ] **Step 3: Commit**

```bash
git add src/components/BulkUpload.tsx
git commit -m "fix: wrap folder button click in requestAnimationFrame for first-click reliability"
```

---

### Task 3: Add "safe to leave" messaging

**Files:**
- Modify: `src/app/docs/bulk/[batchId]/page.tsx` — background processing card (~lines 423-426)

- [ ] **Step 1: Update the background processing copy**

Find lines 423-426:

```tsx
<p className="text-sm text-blue-700 mt-3">
  Files are being analyzed in the background. You&apos;ll receive a notification when processing is complete.
  This page will automatically update as files are processed.
</p>
```

Replace with:

```tsx
<p className="text-sm text-blue-700 mt-3">
  Your files are being processed in the background. You can safely navigate away, start another upload, or come back later — you&apos;ll get a notification when it&apos;s done.
  This page will automatically update as files are processed.
</p>
<div className="mt-2">
  <Button
    variant="link"
    size="sm"
    className="text-blue-700 hover:text-blue-900 p-0 h-auto"
    onClick={() => router.push('/docs/upload')}
  >
    Start Another Upload →
  </Button>
</div>
```

Note: `router` is already available — imported at line 3 and initialized at line 47.

- [ ] **Step 2: Verify the build compiles**

```bash
npx next build
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/app/docs/bulk/[batchId]/page.tsx
git commit -m "fix: add safe-to-leave messaging and Start Another Upload link to background processing card"
```

---

## Chunk 2: Backend — createBulkUploadProjects + fileBatch Enhancement

### Task 4: Add `createBulkUploadProjects` mutation

**Files:**
- Modify: `convex/bulkUpload.ts` — add new mutation before `fileBatch` (~line 1467)

This mutation replicates the essential logic from `projects.create` (convex/projects.ts:107-260) — shortcode validation, project insert, folder creation, and scheduling checklist/intelligence init. It cannot call `projects.create` directly (Convex mutation-to-mutation limitation).

- [ ] **Step 1: Add the `FALLBACK_PROJECT_FOLDERS` constant**

Add this constant near the top of `convex/bulkUpload.ts` (after the imports, around line 6):

```typescript
// Fallback project folder types (matches convex/projects.ts)
const BULK_UPLOAD_FALLBACK_FOLDERS = [
  { name: "Background", folderKey: "background", order: 1 },
  { name: "Terms Comparison", folderKey: "terms_comparison", order: 2 },
  { name: "Terms Request", folderKey: "terms_request", order: 3 },
  { name: "Credit Submission", folderKey: "credit_submission", order: 4 },
  { name: "Post-completion Documents", folderKey: "post_completion", order: 5 },
  { name: "Appraisals", folderKey: "appraisals", order: 6 },
  { name: "Notes", folderKey: "notes", order: 7 },
  { name: "Operational Model", folderKey: "operational_model", order: 8 },
];
```

- [ ] **Step 2: Add the `generateShortcodeSuggestion` helper**

Add this helper after the constant (replicates `convex/projects.ts:61-92`):

```typescript
// Helper: Generate shortcode from project name (matches convex/projects.ts)
function generateShortcodeSuggestion(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';
  let shortcode = '';
  const numbers = name.replace(/[^0-9]/g, '');
  if (words[0]) {
    shortcode += words[0].slice(0, words.length > 2 ? 3 : 4);
  }
  for (let i = 1; i < words.length && shortcode.length < 7; i++) {
    shortcode += words[i].charAt(0);
  }
  if (numbers && shortcode.length + numbers.length <= 10) {
    shortcode += numbers;
  } else if (numbers) {
    shortcode = shortcode.slice(0, 10 - Math.min(numbers.length, 4)) + numbers.slice(0, 4);
  }
  return shortcode.slice(0, 10).toUpperCase();
}
```

- [ ] **Step 3: Add the `createBulkUploadProjects` mutation**

Add this mutation before `fileBatch` (around line 1467):

```typescript
// Mutation: Create new projects for bulk upload filing
// Called BEFORE fileBatch — returns a mapping of suggestedName → projectId
export const createBulkUploadProjects = mutation({
  args: {
    batchId: v.id("bulkUploadBatches"),
    newProjects: v.array(v.object({
      suggestedName: v.string(),
      name: v.string(),
      projectShortcode: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) throw new Error("Batch not found");
    if (!batch.clientId) throw new Error("Batch has no clientId");

    // Get client to determine clientType for folder templates and checklist init
    const client = await ctx.db.get(batch.clientId);
    if (!client) throw new Error("Client not found");
    const clientType = (client.type || "borrower").toLowerCase();

    // Validate intra-batch shortcode uniqueness (case-insensitive)
    const shortcodes = args.newProjects.map(p => p.projectShortcode.toUpperCase());
    const uniqueShortcodes = new Set(shortcodes);
    if (uniqueShortcodes.size !== shortcodes.length) {
      throw new Error("Duplicate shortcodes found within new projects");
    }

    // Look up folder template once (shared across all new projects)
    const templates = await ctx.db
      .query("folderTemplates")
      .withIndex("by_client_type_level", (q: any) =>
        q.eq("clientType", clientType).eq("level", "project")
      )
      .collect();
    const folderTemplate = templates.find((t: any) => t.isDefault) || templates[0];
    const folders = folderTemplate?.folders || BULK_UPLOAD_FALLBACK_FOLDERS;
    const sortedFolders = [...folders].sort((a: any, b: any) => a.order - b.order);

    const now = new Date().toISOString();
    const mapping: { suggestedName: string; projectId: Id<"projects"> }[] = [];

    for (const proj of args.newProjects) {
      const shortcode = proj.projectShortcode.toUpperCase().slice(0, 10);

      // Validate shortcode uniqueness vs DB
      const existing = await ctx.db
        .query("projects")
        .withIndex("by_shortcode", (q: any) => q.eq("projectShortcode", shortcode))
        .filter((q: any) => q.neq(q.field("isDeleted"), true))
        .first();
      if (existing) {
        throw new Error(`Project shortcode "${shortcode}" is already in use`);
      }

      // Insert project
      const projectId = await ctx.db.insert("projects", {
        name: proj.name,
        projectShortcode: shortcode,
        clientRoles: [{ clientId: batch.clientId, role: "borrower" }],
        status: "active",
        createdAt: now,
      });

      // Create project folders from template
      for (const folder of sortedFolders) {
        await ctx.db.insert("projectFolders", {
          projectId,
          folderType: folder.folderKey as any,
          name: folder.name,
          createdAt: now,
        });
      }

      // Schedule checklist initialization
      await ctx.scheduler.runAfter(0, api.knowledgeLibrary.initializeChecklistForProject, {
        clientId: batch.clientId,
        projectId,
        clientType,
      });

      // Schedule intelligence initialization
      await ctx.scheduler.runAfter(0, api.intelligence.initializeProjectIntelligence, {
        projectId,
      });

      // Schedule project summary sync to client
      await ctx.scheduler.runAfter(0, api.intelligence.syncProjectSummariesToClient, {
        clientId: batch.clientId,
      });

      mapping.push({ suggestedName: proj.suggestedName, projectId });
      console.log(`[createBulkUploadProjects] Created project "${proj.name}" (${shortcode}) → ${projectId}`);
    }

    return mapping;
  },
});
```

- [ ] **Step 4: Run Convex codegen**

```bash
npx convex codegen
```

Expected: no errors. This ensures the new mutation is available in the API.

- [ ] **Step 5: Commit**

```bash
git add convex/bulkUpload.ts
git commit -m "feat: add createBulkUploadProjects mutation for bulk upload project creation"
```

---

### Task 5: Enhance `fileBatch` with `projectMapping` argument

**Files:**
- Modify: `convex/bulkUpload.ts` — `fileBatch` mutation args and handler (~line 1469)

- [ ] **Step 1: Add `projectMapping` to `fileBatch` args**

Find the `fileBatch` args at line 1470:

```typescript
args: {
    batchId: v.id("bulkUploadBatches"),
    uploaderInitials: v.string(),
  },
```

Replace with:

```typescript
args: {
    batchId: v.id("bulkUploadBatches"),
    uploaderInitials: v.string(),
    projectMapping: v.optional(v.array(v.object({
      suggestedName: v.string(),
      projectId: v.id("projects"),
    }))),
  },
```

- [ ] **Step 2: Add project mapping resolution before the filing loop**

Find line 1496 (just before `for (const item of readyItems) {`):

```typescript
const results: { itemId: Id<"bulkUploadItems">; documentId?: Id<"documents">; error?: string }[] = [];
    const now = new Date().toISOString();

    for (const item of readyItems) {
```

Replace with:

```typescript
const results: { itemId: Id<"bulkUploadItems">; documentId?: Id<"documents">; error?: string }[] = [];
    const now = new Date().toISOString();

    // Build project mapping from suggestedName → projectId (case-insensitive)
    const projectMap = new Map<string, Id<"projects">>();
    if (args.projectMapping) {
      for (const entry of args.projectMapping) {
        projectMap.set(entry.suggestedName.toLowerCase(), entry.projectId);
      }
    }

    for (const item of readyItems) {
```

- [ ] **Step 3: Apply project mapping when determining effectiveProjectId**

Find line 1507:

```typescript
const effectiveProjectId = item.itemProjectId || batch.projectId;
```

Replace with:

```typescript
// Resolve projectId: explicit assignment > project mapping from bulk creation > batch default
        let resolvedProjectId = item.itemProjectId;
        if (!resolvedProjectId && item.suggestedProjectName) {
          resolvedProjectId = projectMap.get(item.suggestedProjectName.toLowerCase());
        }
        const effectiveProjectId = resolvedProjectId || batch.projectId;
```

- [ ] **Step 4: Run Convex codegen and verify build**

```bash
npx convex codegen && npx next build
```

Expected: passes. The new optional arg is backward-compatible — existing `fileBatch` calls without `projectMapping` work unchanged.

- [ ] **Step 5: Commit**

```bash
git add convex/bulkUpload.ts
git commit -m "feat: add projectMapping arg to fileBatch for project-aware filing"
```

---

### Task 6: Add graceful checklist fallback

**Files:**
- Modify: `convex/bulkUpload.ts` — `fileBatch` checklist linking section (~line 1564)

- [ ] **Step 1: Wrap checklist linking in a try-catch guard**

Find the checklist linking block at line 1564:

```typescript
// Link to checklist items if any were selected
        if (item.checklistItemIds && item.checklistItemIds.length > 0) {
          for (const checklistItemId of item.checklistItemIds) {
```

Replace the opening with:

```typescript
// Link to checklist items if any were selected (graceful fallback if checklist missing)
        if (item.checklistItemIds && item.checklistItemIds.length > 0) {
          for (const checklistItemId of item.checklistItemIds) {
            // Verify checklist item still exists (may not if project is newly created
            // and checklist init hasn't completed yet)
            const checklistItem = await ctx.db.get(checklistItemId);
            if (!checklistItem) {
              console.warn(`[fileBatch] Checklist item ${checklistItemId} not found for item ${item._id} — skipping link`);
              continue;
            }
```

Then find the closing of the inner for-loop (the `}` after the `isPrimary` patch block, around line 1604):

```typescript
            }
          }
        }
```

This should remain unchanged — we only added the guard at the top of the inner loop.

- [ ] **Step 2: Verify the build compiles**

```bash
npx next build
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add convex/bulkUpload.ts
git commit -m "fix: graceful checklist fallback when linking items during filing"
```

---

## Chunk 3: Frontend — New Projects Panel + Filing Flow

### Task 7: Add `generateShortcodeSuggestion` utility for frontend

**Files:**
- Create: `src/lib/shortcodeUtils.ts`

This utility replicates the shortcode generation logic so the frontend can auto-generate shortcodes for the New Projects panel.

- [ ] **Step 1: Create the utility file**

Create `src/lib/shortcodeUtils.ts`:

```typescript
/**
 * Generate a shortcode suggestion from a project name.
 * Replicates the logic from convex/projects.ts:generateShortcodeSuggestion
 */
export function generateShortcodeSuggestion(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9\s]/g, '').toUpperCase();
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return '';

  let shortcode = '';
  const numbers = name.replace(/[^0-9]/g, '');

  if (words[0]) {
    shortcode += words[0].slice(0, words.length > 2 ? 3 : 4);
  }

  for (let i = 1; i < words.length && shortcode.length < 7; i++) {
    shortcode += words[i].charAt(0);
  }

  if (numbers && shortcode.length + numbers.length <= 10) {
    shortcode += numbers;
  } else if (numbers) {
    shortcode = shortcode.slice(0, 10 - Math.min(numbers.length, 4)) + numbers.slice(0, 4);
  }

  return shortcode.slice(0, 10).toUpperCase();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/shortcodeUtils.ts
git commit -m "feat: add generateShortcodeSuggestion frontend utility"
```

---

### Task 8: Create NewProjectsPanel component

**Files:**
- Create: `src/components/NewProjectsPanel.tsx`

A self-contained component that shows editable rows for each detected new project. Manages its own local state and exposes the current list via a callback.

- [ ] **Step 1: Create the component**

Create `src/components/NewProjectsPanel.tsx`:

```typescript
'use client';

import { useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderPlus } from 'lucide-react';
import { generateShortcodeSuggestion } from '@/lib/shortcodeUtils';

export interface NewProjectEntry {
  suggestedName: string;   // Original name from V4 analysis
  name: string;            // Editable name
  projectShortcode: string; // Editable shortcode
  enabled: boolean;        // Whether to create this project
  fileCount: number;       // Number of items assigned
}

interface NewProjectsPanelProps {
  projects: NewProjectEntry[];
  onChange: (projects: NewProjectEntry[]) => void;
}

export default function NewProjectsPanel({ projects, onChange }: NewProjectsPanelProps) {
  // Check for duplicate shortcodes (case-insensitive) among enabled projects
  const duplicateShortcodes = useMemo(() => {
    const enabled = projects.filter(p => p.enabled);
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const p of enabled) {
      const key = p.projectShortcode.toUpperCase();
      seen.set(key, (seen.get(key) || 0) + 1);
      if ((seen.get(key) || 0) > 1) dupes.add(key);
    }
    return dupes;
  }, [projects]);

  const hasDuplicates = duplicateShortcodes.size > 0;

  const updateProject = (index: number, updates: Partial<NewProjectEntry>) => {
    const updated = projects.map((p, i) => {
      if (i !== index) return p;
      const merged = { ...p, ...updates };
      // Auto-regenerate shortcode when name changes (only if user hasn't manually edited it)
      if (updates.name !== undefined && !updates.projectShortcode) {
        const oldAutoShortcode = generateShortcodeSuggestion(p.name);
        if (p.projectShortcode === oldAutoShortcode) {
          merged.projectShortcode = generateShortcodeSuggestion(updates.name);
        }
      }
      return merged;
    });
    onChange(updated);
  };

  if (projects.length === 0) return null;

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FolderPlus className="w-5 h-5 text-purple-600" />
          <CardTitle className="text-base">New Projects Detected</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {projects.filter(p => p.enabled).length} of {projects.length} selected
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Header row */}
          <div className="grid grid-cols-[40px_1fr_160px_80px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <div></div>
            <div>Project Name</div>
            <div>Shortcode</div>
            <div className="text-right">Files</div>
          </div>

          {/* Project rows */}
          {projects.map((project, index) => {
            const isDupe = project.enabled && duplicateShortcodes.has(project.projectShortcode.toUpperCase());
            return (
              <div
                key={project.suggestedName}
                className={`grid grid-cols-[40px_1fr_160px_80px] gap-2 items-center p-2 rounded-md ${
                  project.enabled ? 'bg-white border' : 'bg-gray-50 opacity-60'
                } ${isDupe ? 'border-red-300' : 'border-gray-200'}`}
              >
                <Checkbox
                  checked={project.enabled}
                  onCheckedChange={(checked) => updateProject(index, { enabled: !!checked })}
                />
                <Input
                  value={project.name}
                  onChange={(e) => updateProject(index, { name: e.target.value })}
                  disabled={!project.enabled}
                  className="h-8 text-sm"
                />
                <div className="relative">
                  <Input
                    value={project.projectShortcode}
                    onChange={(e) => updateProject(index, { projectShortcode: e.target.value.toUpperCase().slice(0, 10) })}
                    disabled={!project.enabled}
                    className={`h-8 text-sm font-mono ${isDupe ? 'border-red-400 text-red-700' : ''}`}
                    maxLength={10}
                  />
                  {isDupe && (
                    <span className="text-xs text-red-600 absolute -bottom-4 left-0">Duplicate</span>
                  )}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {project.fileCount}
                </div>
              </div>
            );
          })}
        </div>

        {hasDuplicates && (
          <p className="text-xs text-red-600 mt-3">
            Resolve duplicate shortcodes before filing.
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-3">
          Projects will be created when you click &quot;File All&quot;
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Build the initial NewProjectEntry array from batch items and existing projects.
 * Call this once when the review page loads (or when items/projects change).
 */
export function buildNewProjectEntries(
  items: Array<{ suggestedProjectName?: string; itemProjectId?: string }>,
  existingProjectNames: string[],
): NewProjectEntry[] {
  const existingNamesLower = new Set(existingProjectNames.map(n => n.toLowerCase()));

  // Group items by suggestedProjectName (case-insensitive dedup)
  const projectMap = new Map<string, { name: string; count: number }>();
  for (const item of items) {
    if (!item.suggestedProjectName) continue;
    if (item.itemProjectId) continue; // Already assigned to existing project
    const key = item.suggestedProjectName.toLowerCase();
    if (existingNamesLower.has(key)) continue; // Matches existing project
    if (!projectMap.has(key)) {
      projectMap.set(key, { name: item.suggestedProjectName, count: 0 });
    }
    projectMap.get(key)!.count++;
  }

  return Array.from(projectMap.values()).map(({ name, count }) => ({
    suggestedName: name,
    name,
    projectShortcode: generateShortcodeSuggestion(name),
    enabled: true,
    fileCount: count,
  }));
}
```

- [ ] **Step 2: Verify the build compiles**

```bash
npx next build
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add src/components/NewProjectsPanel.tsx
git commit -m "feat: add NewProjectsPanel component for bulk upload project creation"
```

---

### Task 9: Wire New Projects Panel into batch review page

**Files:**
- Modify: `src/app/docs/bulk/[batchId]/page.tsx` — imports, state, panel rendering, handleFileAll

- [ ] **Step 1: Add imports**

At the top of the file, add these imports. After line 41 (`import BulkReviewTable`):

```typescript
import NewProjectsPanel, { NewProjectEntry, buildNewProjectEntries } from '@/components/NewProjectsPanel';
```

- [ ] **Step 2: Add new projects state**

After the existing state declarations (after line 60, the shortcode editing state):

```typescript
// New projects panel state
const [newProjects, setNewProjects] = useState<NewProjectEntry[]>([]);
```

- [ ] **Step 3: Add mutation hook for createBulkUploadProjects**

After line 102 (`const retryItem = ...`):

```typescript
const createBulkUploadProjects = useMutation(api.bulkUpload.createBulkUploadProjects);
```

- [ ] **Step 4: Add effect to build new projects list when items/projects load**

After the shortcode initialization effect (after line 109):

```typescript
// Build new projects list when items and client projects load
useEffect(() => {
  if (!items || !batch?.isMultiProject || batch.status !== 'review') {
    setNewProjects([]);
    return;
  }
  const existingNames = (clientProjects || []).map((p: any) => p.name);
  const entries = buildNewProjectEntries(items as any, existingNames);
  setNewProjects(entries);
}, [items, clientProjects, batch?.isMultiProject, batch?.status]);
```

- [ ] **Step 5: Add `hasNewProjectDuplicates` computed value**

After the `canFileAll` memo (after line 153):

```typescript
const hasNewProjectDuplicates = useMemo(() => {
  const enabled = newProjects.filter(p => p.enabled);
  const shortcodes = enabled.map(p => p.projectShortcode.toUpperCase());
  return new Set(shortcodes).size !== shortcodes.length;
}, [newProjects]);
```

- [ ] **Step 6: Update `handleFileAll` to create projects first**

Replace the `handleFileAll` function (lines 155-190) with:

```typescript
// Handle file all
const handleFileAll = async () => {
  if (!batch || !canFileAll) return;

  setShowFileAllDialog(false);
  setIsFilingAll(true);

  try {
    // Step 1: Create new projects if any are enabled
    let projectMapping: { suggestedName: string; projectId: any }[] | undefined;
    const enabledProjects = newProjects.filter(p => p.enabled && p.name.trim() && p.projectShortcode.trim());

    if (enabledProjects.length > 0) {
      projectMapping = await createBulkUploadProjects({
        batchId,
        newProjects: enabledProjects.map(p => ({
          suggestedName: p.suggestedName,
          name: p.name.trim(),
          projectShortcode: p.projectShortcode.trim().toUpperCase(),
        })),
      });
    }

    // Step 2: File all items with the project mapping
    const result = await fileBatch({
      batchId,
      uploaderInitials,
      projectMapping,
    });
    setFilingResult(result);

    // Trigger extraction queue processing (non-blocking)
    fetch('/api/process-extraction-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20 }),
    }).then(response => {
      if (response.ok) {
        console.log('[BulkUpload] Extraction queue processing started');
      }
    }).catch(err => {
      console.error('[BulkUpload] Failed to trigger extraction queue:', err);
    });
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Failed to file documents');
  } finally {
    setIsFilingAll(false);
  }
};
```

- [ ] **Step 7: Render the New Projects Panel**

Find the multi-project summary section (lines 533-542):

```tsx
{/* Multi-project summary */}
      {batch?.isMultiProject && items && (
```

Add the New Projects Panel **before** this block:

```tsx
{/* New Projects Panel — shown when new projects are detected */}
      {batch?.status === 'review' && newProjects.length > 0 && (
        <NewProjectsPanel
          projects={newProjects}
          onChange={setNewProjects}
        />
      )}

      {/* Multi-project summary */}
```

- [ ] **Step 8: Disable "File All" when there are duplicate shortcodes**

Find where `canFileAll` is used to control the File All button. In the `AlertDialogAction` for the File All dialog, find the disabled condition and add `|| hasNewProjectDuplicates`. Search for a button that calls `setShowFileAllDialog(true)` or uses `canFileAll`:

The "File All" button likely uses `disabled={!canFileAll || isFilingAll}`. Update it to:

```typescript
disabled={!canFileAll || isFilingAll || hasNewProjectDuplicates}
```

Also add a tooltip or message near the button if `hasNewProjectDuplicates` is true.

- [ ] **Step 9: Verify the build compiles**

```bash
npx next build
```

Expected: passes. Fix any TypeScript issues — common ones:
- `fileBatch` type may not include `projectMapping` yet if codegen hasn't run — run `npx convex codegen` first
- `clientProjects` type may need `as any` cast for `.map((p: any) => p.name)`

- [ ] **Step 10: Commit**

```bash
git add src/app/docs/bulk/[batchId]/page.tsx
git commit -m "feat: wire NewProjectsPanel into batch review page with two-step filing flow"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run Convex codegen**

```bash
npx convex codegen
```

- [ ] **Step 2: Run the full Next.js build**

```bash
npx next build
```

Expected: build passes with no errors. Fix any TypeScript errors before continuing.

- [ ] **Step 3: Commit any remaining fixes and push**

```bash
git add -A
git status
git commit -m "chore: build fixes for project-aware bulk upload"
git push
```
