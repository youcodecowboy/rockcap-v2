# Document Library Toolbar Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unfiled folder visibility, bulk move (cross-client), and bulk delete to the Document Library.

**Architecture:** Three layers of change: (1) Convex data layer — new queries and mutations for bulk operations and unfiled counts, (2) FolderBrowser sidebar — render the existing "unfiled" folder when it has documents, (3) FileList toolbar — persistent Move/Delete buttons wired to a new BulkMoveModal and delete confirmation dialog.

**Tech Stack:** Convex (mutations/queries), Next.js App Router (client components), shadcn/ui (Dialog, AlertDialog, Select, RadioGroup, Button), Lucide icons.

**Spec:** `docs/superpowers/specs/2026-03-12-document-library-toolbar-enhancements-design.md`

---

## Chunk 1: Data Layer — Unfiled Count Query + Bulk Delete Mutation

### Task 1: Add `getUnfiledCountByProject` query

**Files:**
- Modify: `convex/documents.ts` (after `getProjectFolderCounts` at ~line 1755)

**Context:** The `projectFolders` table already has an `"unfiled"` folder type seeded for every project (see `convex/folderStructure.ts` line 300). Documents with `folderId === "unfiled"` are in that folder. We need a query that returns the count for conditional rendering in FolderBrowser.

- [ ] **Step 1: Add the query**

```typescript
// Add after getProjectFolderCounts query (~line 1755)

export const getUnfiledCountByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.and(
          q.eq(q.field("isDeleted"), false),
          q.or(
            q.eq(q.field("folderId"), "unfiled"),
            q.eq(q.field("folderId"), undefined),
            q.eq(q.field("folderId"), null)
          )
        )
      )
      .collect();
    return docs.length;
  },
});
```

**Why include null/undefined?** Some documents may have been filed before the unfiled folder existed — they'd have no folderId at all. These are also "unfiled" and should show up.

- [ ] **Step 2: Run codegen**

Run: `npx convex codegen`
Expected: Success, `convex/_generated/api.d.ts` updated with `documents.getUnfiledCountByProject`

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts convex/_generated/
git commit -m "feat: add getUnfiledCountByProject query for unfiled folder rendering"
```

---

### Task 2: Add `bulkDelete` mutation

**Files:**
- Modify: `convex/documents.ts` (after existing `remove` mutation at ~line 1034)

**Context:** The existing `remove()` mutation (line 1005) does a soft delete: sets `isDeleted: true` and `deletedAt`. We replicate that pattern for bulk operations.

- [ ] **Step 1: Add the mutation**

```typescript
// Add after remove mutation (~line 1034)

export const bulkDelete = mutation({
  args: {
    documentIds: v.array(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const now = new Date().toISOString();
    let deletedCount = 0;

    for (const docId of args.documentIds) {
      const doc = await ctx.db.get(docId);
      if (!doc || doc.isDeleted) continue;

      // Soft delete
      await ctx.db.patch(docId, {
        isDeleted: true,
        deletedAt: now,
        deletedReason: "bulk_delete",
      });

      // Unlink from version chains — clear parentDocumentId on children
      const children = await ctx.db
        .query("documents")
        .filter((q) => q.eq(q.field("parentDocumentId"), docId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { parentDocumentId: undefined });
      }

      deletedCount++;
    }

    return { deletedCount };
  },
});
```

- [ ] **Step 2: Run codegen**

Run: `npx convex codegen`
Expected: Success, `bulkDelete` available in API

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts convex/_generated/
git commit -m "feat: add bulkDelete mutation for soft-deleting multiple documents"
```

---

### Task 3: Add `bulkMove` mutation

**Files:**
- Modify: `convex/documents.ts` (after `bulkDelete`)

**Context:** The existing `moveDocumentCrossScope()` mutation (line 1147) handles single-doc moves with code regeneration and flag activity logging. The bulk version reuses the same logic pattern but in a loop within a single transaction. We keep `targetScope` as `"client"` only for now (forward-compatible field).

- [ ] **Step 1: Add the mutation**

```typescript
// Add after bulkDelete mutation

export const bulkMove = mutation({
  args: {
    documentIds: v.array(v.id("documents")),
    targetScope: v.literal("client"),
    targetClientId: v.id("clients"),
    targetProjectId: v.optional(v.id("projects")),
    targetFolderId: v.string(),
    targetFolderType: v.union(v.literal("client"), v.literal("project")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Validate target client exists
    const targetClient = await ctx.db.get(args.targetClientId);
    if (!targetClient) throw new Error("Target client not found");

    // Validate target project if specified
    let targetProject: any = null;
    if (args.targetProjectId) {
      targetProject = await ctx.db.get(args.targetProjectId);
      if (!targetProject) throw new Error("Target project not found");
    }

    let movedCount = 0;

    for (const docId of args.documentIds) {
      const doc = await ctx.db.get(docId);
      if (!doc || doc.isDeleted) continue;

      // Generate new document code
      const newCode = generateDocumentCode(
        targetClient.name,
        doc.category || "Other",
        targetProject?.name,
        doc.uploadedAt || new Date().toISOString(),
      );

      // Build update
      const updates: Record<string, any> = {
        clientId: args.targetClientId,
        folderId: args.targetFolderId,
        folderType: args.targetFolderType,
        scope: "client",
        documentCode: newCode,
        updatedAt: new Date().toISOString(),
      };

      // Set or clear projectId
      if (args.targetProjectId) {
        updates.projectId = args.targetProjectId;
      } else {
        updates.projectId = undefined;
      }

      // Clear base document flag when moving across clients
      if (doc.clientId !== args.targetClientId) {
        updates.isBaseDocument = false;
      }

      await ctx.db.patch(docId, updates);

      // Log flag activity if document has open flags
      const flags = await ctx.db
        .query("flags")
        .filter((q) =>
          q.and(
            q.eq(q.field("documentId"), docId),
            q.neq(q.field("status"), "resolved")
          )
        )
        .collect();
      for (const flag of flags) {
        await ctx.db.insert("flagActivity", {
          flagId: flag._id,
          action: "comment",
          content: `Moved to ${targetClient.name}${targetProject ? ` / ${targetProject.name}` : ""} / ${args.targetFolderId}`,
          performedBy: identity.subject,
          performedAt: new Date().toISOString(),
        });
      }

      movedCount++;
    }

    return { movedCount };
  },
});
```

**Note:** `generateDocumentCode` is already defined at the top of `convex/documents.ts` (line 52). The bulk mutation reuses it directly.

- [ ] **Step 2: Run codegen**

Run: `npx convex codegen`
Expected: Success, `bulkMove` available in API

- [ ] **Step 3: Commit**

```bash
git add convex/documents.ts convex/_generated/
git commit -m "feat: add bulkMove mutation for cross-client document moves"
```

---
