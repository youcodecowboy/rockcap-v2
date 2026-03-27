# Project-Aware Bulk Upload + CSV Client Import

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered project inference to bulk upload and a CSV client importer, enabling efficient migration of ~500 documents across 35 clients.

**Architecture:** Two independent features: (1) CSV client import — parse names, preview, bulk-create via existing `clients.create` mutation. (2) Project-aware bulk upload — extend the V4 classification pipeline with a `projectInference` field (same API call, ~50 extra output tokens), add folder-drop support to extract project hints from `webkitRelativePath`, and enhance the review table with a project assignment column. All schema changes are optional fields, preserving full backward compatibility.

**Tech Stack:** Next.js 16, Convex (schema + mutations), Anthropic Claude Haiku 4.5, shadcn/ui, browser `webkitdirectory` API

---

## Task 1: CSV Client Import Component

**Files:**
- Create: `src/components/CSVClientImport.tsx`
- Modify: `src/app/clients/page.tsx:37-39` (add import button)

**Step 1: Create the CSVClientImport component**

```tsx
// src/components/CSVClientImport.tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useUser } from '@clerk/nextjs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface CSVClientImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedClient {
  name: string;
  isDuplicate: boolean;
  status: 'pending' | 'creating' | 'created' | 'error' | 'skipped';
  error?: string;
}

export default function CSVClientImport({ open, onOpenChange }: CSVClientImportProps) {
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);

  // Get existing clients for duplicate detection
  const existingClients = useQuery(api.clients.list, {});
  const createClient = useMutation(api.clients.create);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      // Skip header row if it looks like one
      const startIndex = lines[0]?.toLowerCase().includes('name') ||
                         lines[0]?.toLowerCase().includes('client') ? 1 : 0;

      const existingNames = new Set(
        (existingClients || []).map(c => c.name.toLowerCase().trim())
      );

      const clients: ParsedClient[] = lines.slice(startIndex).map(line => {
        // Handle CSV with commas — take first column
        const name = line.split(',')[0].replace(/^["']|["']$/g, '').trim();
        return {
          name,
          isDuplicate: existingNames.has(name.toLowerCase().trim()),
          status: existingNames.has(name.toLowerCase().trim()) ? 'skipped' as const : 'pending' as const,
        };
      }).filter(c => c.name.length > 0);

      setParsedClients(clients);
    };
    reader.readAsText(file);

    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [existingClients]);

  const handleImport = useCallback(async () => {
    const toCreate = parsedClients.filter(c => c.status === 'pending');
    if (toCreate.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);

    let created = 0;
    let errors = 0;

    for (let i = 0; i < parsedClients.length; i++) {
      const client = parsedClients[i];
      if (client.status !== 'pending') continue;

      setParsedClients(prev => prev.map((c, idx) =>
        idx === i ? { ...c, status: 'creating' } : c
      ));

      try {
        await createClient({
          name: client.name,
          type: 'borrower',
          status: 'active',
        });
        created++;
        setParsedClients(prev => prev.map((c, idx) =>
          idx === i ? { ...c, status: 'created' } : c
        ));
      } catch (err: any) {
        errors++;
        setParsedClients(prev => prev.map((c, idx) =>
          idx === i ? { ...c, status: 'error', error: err.message } : c
        ));
      }

      setImportProgress(Math.round(((created + errors) / toCreate.length) * 100));
    }

    setIsImporting(false);
    setImportComplete(true);
    toast.success(`Imported ${created} clients${errors > 0 ? `, ${errors} errors` : ''}`);
  }, [parsedClients, createClient]);

  const handleClose = () => {
    setParsedClients([]);
    setImportProgress(0);
    setImportComplete(false);
    onOpenChange(false);
  };

  const pendingCount = parsedClients.filter(c => c.status === 'pending').length;
  const duplicateCount = parsedClients.filter(c => c.isDuplicate).length;
  const createdCount = parsedClients.filter(c => c.status === 'created').length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import Clients from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file with client names. All clients will be created as type &quot;Borrower&quot; with active status.
          </DialogDescription>
        </DialogHeader>

        {parsedClients.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              <Upload className="w-8 h-8 text-blue-500" />
            </div>
            <p className="text-sm text-gray-500">Select a CSV file with one client name per row</p>
            <Button onClick={() => fileInputRef.current?.click()}>
              Choose CSV File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="outline">{parsedClients.length} total</Badge>
              {pendingCount > 0 && <Badge className="bg-blue-100 text-blue-800">{pendingCount} to create</Badge>}
              {duplicateCount > 0 && <Badge variant="secondary">{duplicateCount} duplicates (skipped)</Badge>}
              {createdCount > 0 && <Badge className="bg-green-100 text-green-800">{createdCount} created</Badge>}
            </div>

            {isImporting && <Progress value={importProgress} className="h-2" />}

            {/* Client list */}
            <div className="flex-1 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client Name</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead className="w-32 text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedClients.map((client, i) => (
                    <TableRow key={i} className={client.isDuplicate ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell><Badge variant="outline">Borrower</Badge></TableCell>
                      <TableCell className="text-right">
                        {client.status === 'pending' && <Badge variant="outline">Ready</Badge>}
                        {client.status === 'creating' && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
                        {client.status === 'created' && <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />}
                        {client.status === 'skipped' && <Badge variant="secondary">Duplicate</Badge>}
                        {client.status === 'error' && (
                          <span className="flex items-center gap-1 text-red-600 text-xs justify-end">
                            <AlertTriangle className="w-3 h-3" /> {client.error}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {importComplete ? 'Done' : 'Cancel'}
          </Button>
          {parsedClients.length > 0 && !importComplete && (
            <Button onClick={handleImport} disabled={isImporting || pendingCount === 0}>
              {isImporting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Importing...</>
              ) : (
                `Import ${pendingCount} Client${pendingCount !== 1 ? 's' : ''}`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Add import button to clients page**

In `src/app/clients/page.tsx`, add a state + button + modal for CSV import. The button goes in the header area near the existing "Add Client" button. Import `CSVClientImport` and add:
- `const [isCSVImportOpen, setIsCSVImportOpen] = useState(false);`
- A `<Button variant="outline" onClick={() => setIsCSVImportOpen(true)}>Import CSV</Button>` in the header
- `<CSVClientImport open={isCSVImportOpen} onOpenChange={setIsCSVImportOpen} />` in the JSX

**Step 3: Verify CSV import works**

Run: `npx next build`
Manual test: Create a test CSV with 3 names, upload, verify clients created with borrower type and folder structures.

**Step 4: Commit**

```bash
git add src/components/CSVClientImport.tsx src/app/clients/page.tsx
git commit -m "feat: add CSV client import for bulk client creation"
```

---

## Task 2: Schema Changes (Foundation)

**Files:**
- Modify: `convex/schema.ts:803-865` (bulkUploadBatches)
- Modify: `convex/schema.ts:868-975` (bulkUploadItems)

**Step 1: Add isMultiProject to bulkUploadBatches**

In `convex/schema.ts`, inside the `bulkUploadBatches` table definition, add after line ~848 (`notificationDismissed`):

```ts
    // Multi-project mode (documents can target different projects within the client)
    isMultiProject: v.optional(v.boolean()),
```

**Step 2: Add per-item project fields to bulkUploadItems**

In `convex/schema.ts`, inside the `bulkUploadItems` table definition, add after the existing `suggestedChecklistItems` field (line ~955):

```ts
    // Per-item project assignment (multi-project mode)
    itemProjectId: v.optional(v.id("projects")),            // Confirmed project for this item
    suggestedProjectId: v.optional(v.id("projects")),       // AI-suggested existing project
    suggestedProjectName: v.optional(v.string()),            // AI-suggested new project name
    projectConfidence: v.optional(v.number()),               // AI confidence in project suggestion
    projectReasoning: v.optional(v.string()),                // AI reasoning for project suggestion
    folderHint: v.optional(v.string()),                      // Subfolder name from webkitRelativePath
    isClientLevel: v.optional(v.boolean()),                  // Explicitly client-level (no project)
```

Add a new index after the existing indexes on `bulkUploadItems`:

```ts
    .index("by_batch_project", ["batchId", "itemProjectId"])
```

**Step 3: Run codegen**

Run: `npx convex codegen`

**Step 4: Verify build**

Run: `npx next build`

**Step 5: Commit**

```bash
git add convex/schema.ts convex/_generated/
git commit -m "feat: add multi-project schema fields to bulk upload tables"
```

---

## Task 3: V4 Types Extension

**Files:**
- Modify: `src/v4/types.ts:98-115` (DocumentHints)
- Modify: `src/v4/types.ts:159-213` (DocumentClassification)
- Modify: `src/v4/types.ts:300-305` (ClientContext)
- Modify: `src/v4/types.ts:48-69` (PipelineInput — via pipeline.ts)

**Step 1: Extend DocumentHints with folderHint**

In `src/v4/types.ts`, add to the `DocumentHints` interface (after line 114, before the closing `}`):

```ts
  /** Subfolder name from webkitRelativePath (e.g., "Wimbledon Park") */
  folderHint?: string;
```

**Step 2: Extend DocumentClassification with projectInference**

In `src/v4/types.ts`, add to the `DocumentClassification` interface (after `intelligenceFields` at line ~212, before the closing `}`):

```ts
  /** Project inference (only present in multi-project mode) */
  projectInference?: {
    /** ID of suggested existing project, or null if suggesting new */
    suggestedProjectId: string | null;
    /** Suggested new project name (when no existing project matches) */
    suggestedProjectName: string | null;
    /** Confidence in the project suggestion (0-1) */
    confidence: number;
    /** Reasoning for the project suggestion */
    reasoning: string;
  };
```

**Step 3: Extend ClientContext with availableProjects**

In `src/v4/types.ts`, add to the `ClientContext` interface (after line 304, before the closing `}`):

```ts
  /** Available projects for this client (enables project inference in multi-project mode) */
  availableProjects?: Array<{
    id: string;
    name: string;
    shortcode?: string;
    address?: string;
  }>;
```

**Step 4: Extend PipelineInput with folderHints**

In `src/v4/lib/pipeline.ts`, add to the `PipelineInput` interface (after `config` at line 68):

```ts
  /** Folder hints from webkitRelativePath — maps file index to subfolder name */
  folderHints?: Map<number, string>;
```

**Step 5: Verify build**

Run: `npx next build`

**Step 6: Commit**

```bash
git add src/v4/types.ts src/v4/lib/pipeline.ts
git commit -m "feat: extend V4 types with project inference and folder hints"
```

---

## Task 4: V4 Pipeline — Project Inference in Classification

**Files:**
- Modify: `src/v4/lib/anthropic-client.ts:103-254` (buildBatchUserMessage)
- Modify: `src/v4/lib/pipeline.ts:92-200` (runV4Pipeline stages 1 and 5)

**Step 1: Add project context to buildBatchUserMessage**

In `src/v4/lib/anthropic-client.ts`, inside `buildBatchUserMessage()`:

**After the client context section (~line 120)**, add the available projects section:

```ts
  // Available projects for multi-project inference
  if (clientContext.availableProjects && clientContext.availableProjects.length > 0 && !clientContext.projectId) {
    contextText += `\n## Available Projects for This Client\n`;
    contextText += clientContext.availableProjects.map(p =>
      `- [${p.id}] "${p.name}"${p.shortcode ? ` (${p.shortcode})` : ''}${p.address ? ` — ${p.address}` : ''}`
    ).join('\n');
    contextText += `\n\nFor each document, determine which project it belongs to. If no existing project matches, suggest a new project name. If the document is a client-level document (not project-specific), indicate that.\n`;
  }
```

**In the per-document header section (~line 156)**, add folder hint after the existing hints:

```ts
        (doc.hints.folderHint
          ? `Folder path hint: "${doc.hints.folderHint}"\n`
          : '') +
```

This goes right after the `matchedTags` line at ~161.

**Step 2: Add projectInference to the output format JSON template**

In the output format JSON template (~line 220-248), add the `projectInference` field. This should be added **conditionally** — only when `clientContext.availableProjects` is provided. Modify the output format block:

After the `intelligenceFields` array in the JSON template, add:

```json
    "projectInference": {
      "suggestedProjectId": "existing_project_id_or_null",
      "suggestedProjectName": "New Project Name or null",
      "confidence": 0.85,
      "reasoning": "Document references 28 Wimbledon Park Road which matches project..."
    }
```

**Important**: Wrap the project inference additions in a conditional check. Create a variable `const includeProjectInference = clientContext.availableProjects && clientContext.availableProjects.length > 0 && !clientContext.projectId;` at the top of the function and use it to conditionally include both the projects section in context and the projectInference field in the output schema.

**Step 3: Attach folderHints during preprocessing in pipeline.ts**

In `src/v4/lib/pipeline.ts`, in the Stage 1 preprocessing section (~line 110-112), after `preprocessDocument` creates `batchDocuments`, attach folder hints:

```ts
  // Attach folder hints from webkitRelativePath
  if (input.folderHints) {
    for (const doc of batchDocuments) {
      const hint = input.folderHints.get(doc.index);
      if (hint) {
        doc.hints.folderHint = hint;
      }
    }
  }
```

**Step 4: Verify build**

Run: `npx next build`

**Step 5: Commit**

```bash
git add src/v4/lib/anthropic-client.ts src/v4/lib/pipeline.ts
git commit -m "feat: add project inference to V4 classification pipeline"
```

---

## Task 5: API Route — Accept Project Metadata

**Files:**
- Modify: `src/app/api/v4-analyze/route.ts`

**Step 1: Parse availableProjects and folderHints from request**

In the `/api/v4-analyze` route handler, the request comes as FormData. Add parsing for the new metadata fields. Look for where `clientContext` is constructed and extend it:

- Parse `availableProjects` from a JSON string in the FormData: `formData.get('availableProjects')` → `JSON.parse()`
- Parse `folderHints` from a JSON string: `formData.get('folderHints')` → reconstruct as `Map<number, string>`
- Pass both through to `runV4Pipeline({ ..., folderHints, clientContext: { ...clientContext, availableProjects } })`

**Step 2: Map projectInference results back to response**

The V4 pipeline results already include `DocumentClassification[]` in `result.documents`. The `projectInference` field will be part of each classification automatically. Ensure the response serializes this new field — it should work without changes since the response likely serializes the full result object.

**Step 3: Verify build**

Run: `npx next build`

**Step 4: Commit**

```bash
git add src/app/api/v4-analyze/route.ts
git commit -m "feat: pass project metadata through v4-analyze API route"
```

---

## Task 6: BulkUpload — Folder Drop Support

**Files:**
- Modify: `src/components/BulkUpload.tsx`

**Step 1: Add folder hint extraction utility**

Add at the top of the file (after the constants ~line 56):

```ts
/**
 * Extract project folder hints from webkitRelativePath.
 * Maps file index to the first subfolder name in the path.
 * e.g., "Wimbledon Park/valuation.pdf" → "Wimbledon Park"
 */
function extractFolderHints(files: File[]): Map<number, string> {
  const hints = new Map<number, string>();
  for (let i = 0; i < files.length; i++) {
    const relativePath = (files[i] as any).webkitRelativePath || '';
    if (relativePath) {
      const parts = relativePath.split('/');
      // parts[0] is the root folder name, parts[1] is the first subfolder
      // If there are 3+ parts (root/subfolder/file.pdf), use subfolder as project hint
      if (parts.length >= 3) {
        hints.set(i, parts[1]);
      }
      // If 2 parts (root/file.pdf), these are client-level documents
    }
  }
  return hints;
}
```

**Step 2: Add folder upload input and drag-drop folder detection**

Add a secondary file input with `webkitdirectory` attribute alongside the existing file input. Add state for folder hints:

```ts
const [folderHints, setFolderHints] = useState<Map<number, string>>(new Map());
const [detectedProjects, setDetectedProjects] = useState<string[]>([]);
const folderInputRef = useRef<HTMLInputElement>(null);
```

Add a folder input element:
```tsx
<input
  ref={folderInputRef}
  type="file"
  // @ts-ignore - webkitdirectory is non-standard but widely supported
  webkitdirectory=""
  multiple
  className="hidden"
  onChange={handleFolderSelect}
/>
```

**Step 3: Add handleFolderSelect callback**

```ts
const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const fileList = e.target.files;
  if (!fileList || fileList.length === 0) return;

  const allFiles = Array.from(fileList);

  // Filter to supported file types only
  const supportedFiles = allFiles.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx', 'xls'].includes(ext || '');
  });

  if (supportedFiles.length === 0) {
    toast.error('No supported documents found in the selected folder');
    return;
  }

  // Extract folder hints
  const hints = extractFolderHints(supportedFiles);
  setFolderHints(hints);

  // Detect unique project names from subfolder structure
  const projectNames = [...new Set(hints.values())];
  setDetectedProjects(projectNames);

  // Add files to the upload queue
  setFiles(prev => {
    const newFiles = [...prev, ...supportedFiles].slice(0, MAX_FILES);
    return newFiles;
  });

  e.target.value = '';
}, []);
```

**Step 4: Add "Upload Folder" button in the drop zone UI**

In the drop zone area, add a second button alongside the existing "Browse Files":

```tsx
<Button variant="outline" onClick={() => folderInputRef.current?.click()}>
  <FolderOpen className="w-4 h-4 mr-2" /> Upload Folder
</Button>
```

**Step 5: Show detected projects preview**

When `detectedProjects.length > 0`, show a preview card:

```tsx
{detectedProjects.length > 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
    <p className="font-medium text-blue-800 mb-1">
      Detected {detectedProjects.length} project folder{detectedProjects.length !== 1 ? 's' : ''}
    </p>
    <div className="flex flex-wrap gap-1.5">
      {detectedProjects.map(name => (
        <Badge key={name} variant="outline" className="bg-white">{name}</Badge>
      ))}
    </div>
    <p className="text-blue-600 mt-1.5 text-xs">
      Projects will be created or matched during analysis. You can adjust in the review step.
    </p>
  </div>
)}
```

**Step 6: Pass folderHints through batch creation and processing**

When creating the batch, if `folderHints.size > 0` and no project is selected, set `isMultiProject: true` on the batch. Pass `folderHints` as serialized JSON through the processing pipeline.

In the `createBatch` call, add:
```ts
// In the batch creation args, conditionally add isMultiProject
// The batch mutation needs to accept this new field
```

In the `addItemToBatch` calls, include `folderHint` per item.

**Step 7: Pass availableProjects and folderHints to the V4 analyze API**

When building the FormData for the `/api/v4-analyze` call, add:
- `availableProjects`: query the client's projects and serialize as JSON
- `folderHints`: serialize the Map as JSON (`Object.fromEntries(folderHints)`)

This requires querying projects for the selected client. Add a query:
```ts
const clientProjects = useQuery(
  api.projects.listByClient,
  selectedClientId ? { clientId: selectedClientId } : "skip"
);
```

**Step 8: Verify build**

Run: `npx next build`

**Step 9: Commit**

```bash
git add src/components/BulkUpload.tsx
git commit -m "feat: add folder upload support with project hint extraction"
```

---

## Task 7: Convex Mutations — Multi-Project Support

**Files:**
- Modify: `convex/bulkUpload.ts:17-80` (createBatch)
- Modify: `convex/bulkUpload.ts:182-213` (addItemToBatch)
- Modify: `convex/bulkUpload.ts:1368-1460` (fileBatch)

**Step 1: Extend createBatch to accept isMultiProject**

In `convex/bulkUpload.ts`, add to the `createBatch` args:

```ts
    isMultiProject: v.optional(v.boolean()),
```

And include it in the `ctx.db.insert` call.

**Step 2: Extend addItemToBatch to accept per-item project fields**

Add to the `addItemToBatch` args:

```ts
    folderHint: v.optional(v.string()),
```

Include in the `ctx.db.insert` call.

**Step 3: Add updateItemProject mutation**

Create a new mutation for the review page to update per-item project assignment:

```ts
export const updateItemProject = mutation({
  args: {
    itemId: v.id("bulkUploadItems"),
    itemProjectId: v.optional(v.id("projects")),
    isClientLevel: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      itemProjectId: args.itemProjectId,
      isClientLevel: args.isClientLevel,
      updatedAt: new Date().toISOString(),
    });
  },
});
```

**Step 4: Update fileBatch to use per-item projectId**

In the `fileBatch` mutation (~line 1430-1432), change:

```ts
// Before:
projectId: batch.projectId,
projectName: batch.projectName,

// After:
projectId: item.itemProjectId || batch.projectId,
projectName: item.itemProjectId ? undefined : batch.projectName, // Will need to resolve name for per-item projects
```

Also update folderType determination (~line 1407):

```ts
// Before:
let folderType: "client" | "project" | undefined = batch.projectId ? "project" : "client";

// After:
const effectiveProjectId = item.itemProjectId || batch.projectId;
let folderType: "client" | "project" | undefined = effectiveProjectId ? "project" : "client";
```

**Step 5: Add updateItemAnalysisResults mutation extension**

Find the existing mutation that saves analysis results to items (likely `updateItemAnalysis` or similar). Extend its args to also accept:

```ts
    suggestedProjectId: v.optional(v.id("projects")),
    suggestedProjectName: v.optional(v.string()),
    projectConfidence: v.optional(v.number()),
    projectReasoning: v.optional(v.string()),
```

**Step 6: Run codegen and verify**

Run: `npx convex codegen && npx next build`

**Step 7: Commit**

```bash
git add convex/bulkUpload.ts convex/_generated/
git commit -m "feat: add multi-project mutations for bulk upload"
```

---

## Task 8: Review Table — Project Column

**Files:**
- Modify: `src/components/BulkReviewTable.tsx:670-686` (props)
- Modify: `src/components/BulkReviewTable.tsx` (table header + rows)

**Step 1: Extend BulkReviewTableProps**

Add to the interface at line 670:

```ts
interface BulkReviewTableProps {
  items: BulkUploadItem[];
  batchIsInternal: boolean;
  hasProject: boolean;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
  onRefresh?: () => void;
  // NEW: Multi-project mode
  isMultiProject?: boolean;
  projects?: Array<{ _id: Id<"projects">; name: string; projectShortcode?: string }>;
}
```

**Step 2: Add project column to table header**

When `isMultiProject` is true, add a new `<TableHead>` for "Project" in the table header row, between the filename and type columns.

**Step 3: Add project badge per row**

For each row, add a `<TableCell>` with a project badge:

```tsx
{isMultiProject && (
  <TableCell>
    <ProjectBadge
      item={item}
      projects={projects || []}
      onAssign={(projectId) => handleProjectAssign(item._id, projectId)}
      onCreateNew={(name) => handleCreateNewProject(item._id, name)}
      onSetClientLevel={() => handleSetClientLevel(item._id)}
    />
  </TableCell>
)}
```

**Step 4: Create ProjectBadge sub-component**

Create within the same file (or as a separate small component):

```tsx
function ProjectBadge({
  item,
  projects,
  onAssign,
  onCreateNew,
  onSetClientLevel,
}: {
  item: BulkUploadItem;
  projects: Array<{ _id: Id<"projects">; name: string; projectShortcode?: string }>;
  onAssign: (projectId: Id<"projects">) => void;
  onCreateNew: (name: string) => void;
  onSetClientLevel: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine display state
  const assignedProject = item.itemProjectId
    ? projects.find(p => p._id === item.itemProjectId)
    : null;
  const isNew = item.suggestedProjectName && !item.suggestedProjectId && !item.itemProjectId;
  const isClientLevel = item.isClientLevel;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="text-left">
          {assignedProject && (
            <Badge className="bg-green-100 text-green-800 cursor-pointer hover:bg-green-200">
              {assignedProject.name}
            </Badge>
          )}
          {isNew && (
            <Badge className="bg-amber-100 text-amber-800 cursor-pointer hover:bg-amber-200">
              New: {item.suggestedProjectName}
            </Badge>
          )}
          {isClientLevel && (
            <Badge variant="secondary" className="cursor-pointer">
              Client-level
            </Badge>
          )}
          {!assignedProject && !isNew && !isClientLevel && (
            <Badge variant="outline" className="cursor-pointer text-gray-400">
              Unassigned
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 px-2 py-1">Assign to project</p>
          {projects.map(p => (
            <button
              key={p._id}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100"
              onClick={() => { onAssign(p._id); setIsOpen(false); }}
            >
              {p.name} {p.projectShortcode && <span className="text-gray-400">({p.projectShortcode})</span>}
            </button>
          ))}
          <hr className="my-1" />
          <button
            className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 text-gray-600"
            onClick={() => { onSetClientLevel(); setIsOpen(false); }}
          >
            Client-level document
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

**Step 5: Add project assignment handlers**

```ts
const updateItemProject = useMutation(api.bulkUpload.updateItemProject);

const handleProjectAssign = async (itemId: Id<"bulkUploadItems">, projectId: Id<"projects">) => {
  await updateItemProject({ itemId, itemProjectId: projectId, isClientLevel: false });
};

const handleSetClientLevel = async (itemId: Id<"bulkUploadItems">) => {
  await updateItemProject({ itemId, itemProjectId: undefined, isClientLevel: true });
};
```

**Step 6: Verify build**

Run: `npx next build`

**Step 7: Commit**

```bash
git add src/components/BulkReviewTable.tsx
git commit -m "feat: add project column to bulk review table"
```

---

## Task 9: Review Page — Wire Multi-Project Mode

**Files:**
- Modify: `src/app/docs/bulk/[batchId]/page.tsx`

**Step 1: Query projects for the batch's client**

Add after the existing queries (~line 64):

```ts
// Query projects for multi-project mode
const clientProjects = useQuery(
  api.projects.listByClient,
  batch?.clientId && batch?.isMultiProject ? { clientId: batch.clientId } : "skip"
);
```

**Step 2: Pass multi-project props to BulkReviewTable**

Update the `<BulkReviewTable>` component usage to include:

```tsx
<BulkReviewTable
  items={items || []}
  batchIsInternal={batch?.isInternal ?? false}
  hasProject={!!batch?.projectId}
  clientId={batch?.clientId}
  projectId={batch?.projectId}
  isMultiProject={batch?.isMultiProject}
  projects={clientProjects?.map(p => ({
    _id: p._id,
    name: p.name,
    projectShortcode: p.projectShortcode,
  }))}
/>
```

**Step 3: Add multi-project summary card**

When `batch?.isMultiProject`, show a summary above the table:

```tsx
{batch?.isMultiProject && items && (
  <Card className="mb-4">
    <CardContent className="py-3 px-4">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-medium">{items.length} documents</span>
        <span className="text-gray-400">|</span>
        <span>{new Set(items.map(i => i.itemProjectId).filter(Boolean)).size} projects assigned</span>
        <span className="text-gray-400">|</span>
        <span>{items.filter(i => i.suggestedProjectName && !i.itemProjectId).length} new projects suggested</span>
      </div>
    </CardContent>
  </Card>
)}
```

**Step 4: Handle new project creation before filing**

Before the "File All" action, check for items with `suggestedProjectName` that haven't been assigned to an existing project. Show a confirmation dialog listing the new projects that will be created.

**Step 5: Verify build**

Run: `npx next build`

**Step 6: Commit**

```bash
git add src/app/docs/bulk/[batchId]/page.tsx
git commit -m "feat: wire multi-project mode in bulk review page"
```

---

## Task 10: Integration — Connect BulkQueueProcessor to Project Inference

**Files:**
- Modify: `src/lib/bulkQueueProcessor.ts`
- Modify: `src/v4/lib/v4-batch-processor.ts`

**Step 1: Pass folderHints and availableProjects through BulkQueueProcessor**

The `BulkQueueProcessor` in `src/lib/bulkQueueProcessor.ts` makes calls to `/api/v4-analyze`. Extend the FormData construction to include:
- `availableProjects`: JSON-serialized project list
- Per-item `folderHint` values

**Step 2: Map projectInference results back to items**

When the V4 analysis returns results with `projectInference`, pass these through to the `updateItemAnalysis` mutation call, setting `suggestedProjectId`, `suggestedProjectName`, `projectConfidence`, and `projectReasoning` on each item.

**Step 3: Update V4BatchProcessor similarly**

The `V4BatchProcessor` in `src/v4/lib/v4-batch-processor.ts` handles background batches. Apply the same changes: pass project metadata in FormData, map results back.

**Step 4: Verify build**

Run: `npx next build`

**Step 5: Commit**

```bash
git add src/lib/bulkQueueProcessor.ts src/v4/lib/v4-batch-processor.ts
git commit -m "feat: connect queue processors to project inference pipeline"
```

---

## Task 11: Final Build + Push

**Step 1: Full build verification**

Run: `npx next build`

Fix any errors.

**Step 2: Final commit and push**

```bash
git push origin main
```

---

## Verification Checklist

1. **CSV Import**: Upload CSV with 3 names → verify 3 clients created as borrower type with folder structures
2. **Folder Upload**: Drop a 2-subfolder structure → verify folder hints extracted and project preview shown
3. **Single Project Fast Path**: Select specific project → upload files → verify identical to current behavior
4. **Project Inference**: Upload at client level with existing projects → verify `projectInference` in results
5. **New Project Suggestion**: Include doc from unknown project → verify AI suggests new name
6. **Review Page Project Column**: Verify badges (green/amber/gray) and reassignment popover works
7. **Filing**: File multi-project batch → verify documents land in correct projects with correct folders
8. **Build**: `npx next build` passes clean
