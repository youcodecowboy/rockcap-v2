# SAF-01: Soft Delete with Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement recoverable soft-delete for clients and projects with cascade behavior, undo toast, and permanent delete with name confirmation.

**Architecture:** Leverages existing `isDeleted`/`deletedAt`/`deletedBy`/`deletedReason` schema fields. Adds restore + permanent-delete mutations to Convex, relocates delete UI from page headers to Settings panels, adds "Show deleted" filter and restoration banner to existing list views.

**Tech Stack:** Convex (backend mutations/queries), Next.js App Router, React, Tailwind CSS, shadcn/ui components, sonner (toasts), Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-22-soft-delete-recovery-design.md`

---

## File Structure

### Backend (Convex)

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/clients.ts` | Modify | Add cascade to `remove`, add `restore`, `permanentDelete`, `listDeleted`, `deletedCount` |
| `convex/projects.ts` | Modify | Add `deletedBy` to `remove`, add `restore`, `permanentDelete`, `listDeletedByClient`, `deletedCountByClient` |

### Frontend (React)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/PermanentDeleteModal.tsx` | Create | Shared name-confirmation permanent delete modal |
| `src/components/RestorationBanner.tsx` | Create | Shared amber banner for trashed entity pages |
| `src/components/DangerZone.tsx` | Create | Shared "Danger Zone" card for settings panels |
| `src/components/ClientSettingsPanel.tsx` | Modify | Add DangerZone to bottom of General tab |
| `src/components/ProjectSettingsPanel.tsx` | Modify | Add DangerZone to bottom of General tab |
| `src/app/clients/[clientId]/page.tsx` | Modify | Remove header delete button/dialog, add RestorationBanner |
| `src/app/clients/[clientId]/projects/[projectId]/page.tsx` | Modify | Remove header delete button/dialog, add RestorationBanner |
| `src/app/clients/components/ClientsSidebar.tsx` | Modify | Add "Show deleted" toggle |
| `src/app/clients/[clientId]/components/ClientProjectsTab.tsx` | Modify | Add "Show deleted" toggle |

---

## Task 1: Modify `clients.remove` — add cascade and `deletedBy`

**Files:**
- Modify: `convex/clients.ts` (lines 487-503)

- [ ] **Step 1: Update `clients.remove` to resolve user identity and cascade to projects**

In `convex/clients.ts`, replace the existing `remove` mutation with:

```typescript
export const remove = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }

    const now = new Date().toISOString();

    // Soft-delete the client
    await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
      deletedReason: "user_deleted",
    });

    // Cascade: soft-delete all non-deleted projects belonging to this client
    const allProjects = await ctx.db.query("projects")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const clientProjects = allProjects.filter((p) =>
      p.clientRoles?.some((cr: any) => cr.clientId === args.id)
    );

    for (const project of clientProjects) {
      await ctx.db.patch(project._id, {
        isDeleted: true,
        deletedAt: now,
        deletedBy: userId,
        deletedReason: "parent_client_deleted",
      });

      // Invalidate project cache
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: project._id,
      });
    }

    // Invalidate client cache
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "client",
      contextId: args.id,
    });
  },
});
```

- [ ] **Step 2: Verify the build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/clients.ts
git commit -m "feat(SAF-01): add cascade soft-delete and deletedBy to clients.remove"
```

---

## Task 2: Modify `projects.remove` — add `deletedBy`

**Files:**
- Modify: `convex/projects.ts` (lines 347-374)

- [ ] **Step 1: Add user identity resolution to `projects.remove`**

In `convex/projects.ts`, update the `remove` mutation handler. After `const existing = await ctx.db.get(args.id);` add:

```typescript
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }
```

Then update the `ctx.db.patch` call to include `deletedBy: userId`.

- [ ] **Step 2: Verify the build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/projects.ts
git commit -m "feat(SAF-01): add deletedBy tracking to projects.remove"
```

---

## Task 3: Add `clients.restore` and `clients.listDeleted` / `clients.deletedCount`

**Files:**
- Modify: `convex/clients.ts`

- [ ] **Step 1: Add `clients.restore` mutation**

Append to `convex/clients.ts`:

```typescript
export const restore = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client || !client.isDeleted) {
      throw new Error("Client is not in trash");
    }

    // Restore the client
    await ctx.db.patch(args.id, {
      isDeleted: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      deletedReason: undefined,
    });

    // Restore cascade-trashed projects
    const allProjects = await ctx.db.query("projects").collect();
    const cascadeProjects = allProjects.filter((p) =>
      p.isDeleted &&
      p.deletedReason === "parent_client_deleted" &&
      p.clientRoles?.some((cr: any) => cr.clientId === args.id)
    );

    for (const project of cascadeProjects) {
      await ctx.db.patch(project._id, {
        isDeleted: undefined,
        deletedAt: undefined,
        deletedBy: undefined,
        deletedReason: undefined,
      });

      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: project._id,
      });
    }

    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "client",
      contextId: args.id,
    });
  },
});
```

- [ ] **Step 2: Add `clients.listDeleted` query**

```typescript
export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const deleted = await ctx.db
      .query("clients")
      .filter((q) => q.eq(q.field("isDeleted"), true))
      .collect();

    return deleted.sort((a, b) =>
      (b.deletedAt || "").localeCompare(a.deletedAt || "")
    );
  },
});
```

- [ ] **Step 3: Add `clients.deletedCount` query**

```typescript
export const deletedCount = query({
  args: {},
  handler: async (ctx) => {
    const deleted = await ctx.db
      .query("clients")
      .filter((q) => q.eq(q.field("isDeleted"), true))
      .collect();
    return deleted.length;
  },
});
```

- [ ] **Step 4: Verify the build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add convex/clients.ts
git commit -m "feat(SAF-01): add clients.restore, listDeleted, deletedCount"
```

---

## Task 4: Add `projects.restore` and `projects.listDeletedByClient` / `projects.deletedCountByClient`

**Files:**
- Modify: `convex/projects.ts`

- [ ] **Step 1: Add `projects.restore` mutation**

Append to `convex/projects.ts`:

```typescript
export const restore = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project || !project.isDeleted) {
      throw new Error("Project is not in trash");
    }

    await ctx.db.patch(args.id, {
      isDeleted: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      deletedReason: undefined,
    });

    // Invalidate project cache
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "project",
      contextId: args.id,
    });

    // Invalidate related client caches
    if (project.clientRoles) {
      for (const cr of project.clientRoles) {
        await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
          contextType: "client",
          contextId: cr.clientId,
        });
      }
    }
  },
});
```

- [ ] **Step 2: Add `projects.listDeletedByClient` query**

```typescript
export const listDeletedByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const allDeleted = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("isDeleted"), true))
      .collect();

    return allDeleted
      .filter((p) => p.clientRoles?.some((cr: any) => cr.clientId === args.clientId))
      .sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
  },
});
```

- [ ] **Step 3: Add `projects.deletedCountByClient` query**

```typescript
export const deletedCountByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const allDeleted = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("isDeleted"), true))
      .collect();

    return allDeleted.filter((p) =>
      p.clientRoles?.some((cr: any) => cr.clientId === args.clientId)
    ).length;
  },
});
```

- [ ] **Step 4: Verify the build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add convex/projects.ts
git commit -m "feat(SAF-01): add projects.restore, listDeletedByClient, deletedCountByClient"
```

---

## Task 5: Add `clients.permanentDelete`

**Files:**
- Modify: `convex/clients.ts`

- [ ] **Step 1: Add `clients.permanentDelete` mutation**

This is the most complex mutation. It hard-deletes the client and all related data. For shared projects, only remove the client's role.

```typescript
export const permanentDelete = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client || !client.isDeleted) {
      throw new Error("Can only permanently delete clients that are in trash");
    }

    // Find all projects linked to this client
    const allProjects = await ctx.db.query("projects").collect();
    const linkedProjects = allProjects.filter((p) =>
      p.clientRoles?.some((cr: any) => cr.clientId === args.id)
    );

    for (const project of linkedProjects) {
      const otherClients = (project.clientRoles || []).filter(
        (cr: any) => cr.clientId !== args.id
      );

      if (otherClients.length === 0) {
        // Sole owner — hard-delete project and all related data
        await deleteProjectRelatedData(ctx, project._id);
        await ctx.db.delete(project._id);
      } else {
        // Shared project — only remove this client's role
        await ctx.db.patch(project._id, {
          clientRoles: otherClients,
        });
      }
    }

    // Delete client-level related data
    await deleteByField(ctx, "contacts", "clientId", args.id);
    await deleteByField(ctx, "documents", "clientId", args.id);
    await deleteByField(ctx, "tasks", "clientId", args.id);
    await deleteByField(ctx, "flags", "clientId", args.id);
    await deleteByField(ctx, "notes", "clientId", args.id);
    await deleteByField(ctx, "meetings", "clientId", args.id);
    await deleteByField(ctx, "chatSessions", "clientId", args.id);
    await deleteByField(ctx, "enrichmentSuggestions", "clientId", args.id);
    await deleteByField(ctx, "reminders", "clientId", args.id);
    await deleteByField(ctx, "events", "clientId", args.id);

    // Clean up flag thread entries for client-level flags
    const clientFlags = await ctx.db.query("flags").collect();
    const matchingFlags = clientFlags.filter((f: any) => f.clientId === args.id);
    for (const flag of matchingFlags) {
      await deleteByField(ctx, "flagThreadEntries", "flagId", flag._id);
    }

    // Delete the client
    await ctx.db.delete(args.id);
  },
});

// Helper: delete all records in a table matching a field value
async function deleteByField(
  ctx: any,
  table: string,
  field: string,
  value: any
) {
  const records = await ctx.db.query(table).collect();
  const matches = records.filter((r: any) => r[field] === value);
  for (const record of matches) {
    await ctx.db.delete(record._id);
  }
}

// Helper: delete all data related to a project
async function deleteProjectRelatedData(ctx: any, projectId: Id<"projects">) {
  const tables = [
    "documents",
    "tasks",
    "flags",
    "notes",
    "meetings",
    "projectFolders",
    "scenarios",
    "chatSessions",
    "knowledgeBankEntries",
    "knowledgeItems",
    "codifiedExtractions",
  ];

  for (const table of tables) {
    await deleteByField(ctx, table, "projectId", projectId);
  }

  // Also clean up flag thread entries for deleted flags
  const flags = await ctx.db.query("flags").collect();
  const projectFlags = flags.filter((f: any) => f.projectId === projectId);
  for (const flag of projectFlags) {
    await deleteByField(ctx, "flagThreadEntries", "flagId", flag._id);
  }
}
```

**Note for implementer:** If a client has many related records (100+), this mutation may approach Convex write limits. If you see errors during testing, break the deletion into scheduled sub-mutations using `ctx.scheduler.runAfter(0, ...)`.

- [ ] **Step 2: Verify the build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/clients.ts
git commit -m "feat(SAF-01): add clients.permanentDelete with multi-client safety"
```

---

## Task 6: Add `projects.permanentDelete`

**Files:**
- Modify: `convex/projects.ts`

- [ ] **Step 1: Add `projects.permanentDelete` mutation**

```typescript
export const permanentDelete = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project || !project.isDeleted) {
      throw new Error("Can only permanently delete projects that are in trash");
    }

    // Delete all project-related data
    const tables = [
      "documents",
      "tasks",
      "flags",
      "notes",
      "meetings",
      "projectFolders",
      "scenarios",
      "chatSessions",
      "knowledgeBankEntries",
      "knowledgeItems",
      "codifiedExtractions",
    ];

    for (const table of tables) {
      const records = await ctx.db.query(table).collect();
      const matches = records.filter((r: any) => r.projectId === args.id);
      for (const record of matches) {
        await ctx.db.delete(record._id);
      }
    }

    // Clean up flag thread entries for project flags
    const flags = await ctx.db.query("flags").collect();
    const projectFlags = flags.filter((f: any) => f.projectId === args.id);
    for (const flag of projectFlags) {
      const entries = await ctx.db.query("flagThreadEntries").collect();
      const flagEntries = entries.filter((e: any) => e.flagId === flag._id);
      for (const entry of flagEntries) {
        await ctx.db.delete(entry._id);
      }
    }

    // Invalidate related client caches before deletion
    if (project.clientRoles) {
      for (const cr of project.clientRoles) {
        await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
          contextType: "client",
          contextId: cr.clientId,
        });
      }
    }

    // Delete the project
    await ctx.db.delete(args.id);
  },
});
```

- [ ] **Step 2: Verify the build**

Run: `npx convex codegen`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add convex/projects.ts
git commit -m "feat(SAF-01): add projects.permanentDelete"
```

---

## Task 7: Create shared frontend components

**Files:**
- Create: `src/components/PermanentDeleteModal.tsx`
- Create: `src/components/RestorationBanner.tsx`
- Create: `src/components/DangerZone.tsx`

- [ ] **Step 1: Create `PermanentDeleteModal.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface PermanentDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'client' | 'project';
  entityName: string;
  entityId: string;
  relatedCounts?: { documents?: number; projects?: number; tasks?: number };
  onDeleted: () => void;
}

export default function PermanentDeleteModal({
  isOpen,
  onClose,
  entityType,
  entityName,
  entityId,
  relatedCounts,
  onDeleted,
}: PermanentDeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteClient = useMutation(api.clients.permanentDelete);
  const deleteProject = useMutation(api.projects.permanentDelete);

  const isConfirmed = confirmText === entityName;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    try {
      if (entityType === 'client') {
        await deleteClient({ id: entityId as Id<'clients'> });
      } else {
        await deleteProject({ id: entityId as Id<'projects'> });
      }
      toast.success(`${entityName} permanently deleted`);
      setConfirmText('');
      onClose();
      onDeleted();
    } catch (error) {
      console.error('Permanent delete failed:', error);
      toast.error('Failed to permanently delete. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const impactParts: string[] = [];
  if (relatedCounts?.documents) impactParts.push(`${relatedCounts.documents} documents`);
  if (relatedCounts?.projects) impactParts.push(`${relatedCounts.projects} projects`);
  if (relatedCounts?.tasks) impactParts.push(`${relatedCounts.tasks} tasks`);
  const impactText = impactParts.length > 0
    ? ` including ${impactParts.join(', ')}`
    : '';

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => { if (!open) { setConfirmText(''); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-red-600 mb-2">
            <AlertTriangle className="w-5 h-5" />
            <AlertDialogTitle className="text-red-600">
              Permanently delete {entityName}?
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3">
            <p>
              This will permanently delete this {entityType} and all associated data{impactText}. <strong>This cannot be undone.</strong>
            </p>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1.5">
                Type <strong>{entityName}</strong> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={entityName}
                autoFocus
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Forever'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Create `RestorationBanner.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import PermanentDeleteModal from './PermanentDeleteModal';

interface RestorationBannerProps {
  entityType: 'client' | 'project';
  entityName: string;
  entityId: string;
  deletedAt?: string;
  relatedCounts?: { documents?: number; projects?: number; tasks?: number };
  onRestored?: () => void;
  onPermanentlyDeleted?: () => void;
}

export default function RestorationBanner({
  entityType,
  entityName,
  entityId,
  deletedAt,
  relatedCounts,
  onRestored,
  onPermanentlyDeleted,
}: RestorationBannerProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [showPermanentDelete, setShowPermanentDelete] = useState(false);

  const restoreClient = useMutation(api.clients.restore);
  const restoreProject = useMutation(api.projects.restore);

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      if (entityType === 'client') {
        await restoreClient({ id: entityId as Id<'clients'> });
      } else {
        await restoreProject({ id: entityId as Id<'projects'> });
      }
      toast.success(`${entityName} restored`);
      onRestored?.();
    } catch (error) {
      console.error('Restore failed:', error);
      toast.error('Failed to restore. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const formattedDate = deletedAt
    ? new Date(deletedAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'an unknown date';

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            This {entityType} was moved to trash on {formattedDate}.
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={handleRestore}
            disabled={isRestoring}
            className="h-7 text-xs"
          >
            {isRestoring ? 'Restoring...' : 'Restore'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-xs"
            onClick={() => setShowPermanentDelete(true)}
          >
            Delete Permanently
          </Button>
        </div>
      </div>

      <PermanentDeleteModal
        isOpen={showPermanentDelete}
        onClose={() => setShowPermanentDelete(false)}
        entityType={entityType}
        entityName={entityName}
        entityId={entityId}
        relatedCounts={relatedCounts}
        onDeleted={() => onPermanentlyDeleted?.()}
      />
    </>
  );
}
```

- [ ] **Step 3: Create `DangerZone.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Trash2 } from 'lucide-react';

interface DangerZoneProps {
  entityType: 'client' | 'project';
  entityName: string;
  cascadeCount?: number; // Number of active projects that will be cascade-trashed (clients only)
  onConfirmTrash: () => Promise<void>;
}

export default function DangerZone({
  entityType,
  entityName,
  cascadeCount,
  onConfirmTrash,
}: DangerZoneProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const handleTrash = async () => {
    setIsTrashing(true);
    try {
      await onConfirmTrash();
      setShowConfirm(false);
    } catch (error) {
      console.error('Trash failed:', error);
    } finally {
      setIsTrashing(false);
    }
  };

  return (
    <>
      <div className="mt-8 pt-6 border-t border-gray-200">
        <div className="rounded-lg border border-red-200 p-4">
          <h3 className="text-sm font-semibold text-red-600 mb-1">Danger Zone</h3>
          <p className="text-sm text-gray-600 mb-3">
            Move this {entityType} to trash. It can be restored from the Deleted filter
            in the {entityType === 'client' ? 'clients sidebar' : 'projects tab'}.
          </p>
          {entityType === 'client' && cascadeCount !== undefined && cascadeCount > 0 && (
            <p className="text-xs text-amber-600 mb-3">
              This will also move {cascadeCount} active project{cascadeCount !== 1 ? 's' : ''} to trash.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => setShowConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Move to Trash
          </Button>
        </div>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {entityName} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {entityType === 'client' && cascadeCount ? (
                <>This will move the client and {cascadeCount} active project{cascadeCount !== 1 ? 's' : ''} to trash. You can restore them later.</>
              ) : (
                <>This will move the {entityType} to trash. You can restore it later.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTrash}
              disabled={isTrashing}
              className="bg-red-600 hover:bg-red-700"
            >
              {isTrashing ? 'Moving...' : 'Move to Trash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/PermanentDeleteModal.tsx src/components/RestorationBanner.tsx src/components/DangerZone.tsx
git commit -m "feat(SAF-01): add PermanentDeleteModal, RestorationBanner, DangerZone components"
```

---

## Task 8: Add DangerZone to Settings panels + remove header delete buttons

**Files:**
- Modify: `src/components/ClientSettingsPanel.tsx` (insert DangerZone after Notes section ~line 299)
- Modify: `src/components/ProjectSettingsPanel.tsx` (insert DangerZone after Notes section ~line 405)
- Modify: `src/app/clients/[clientId]/page.tsx` (remove delete button ~lines 301-309, remove dialog ~lines 526-545)
- Modify: `src/app/clients/[clientId]/projects/[projectId]/page.tsx` (remove delete button ~lines 261-269, remove dialog)

- [ ] **Step 1: Add DangerZone to ClientSettingsPanel**

Import at top of `ClientSettingsPanel.tsx`:
```typescript
import DangerZone from './DangerZone';
```

After the Notes `</div>` (the section with the Textarea) and before the `<div className="flex justify-end pt-4 border-t">` save button section, insert:

```typescript
            <DangerZone
              entityType="client"
              entityName={client.name}
              cascadeCount={activeProjectCount}
              onConfirmTrash={async () => {
                await deleteClientMutation({ id: clientId });
                toast(`${client.name} moved to trash`, {
                  duration: 8000,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      restoreClientMutation({ id: clientId });
                      toast.success(`${client.name} restored`);
                    },
                  },
                });
                onClose();
                onTrash?.();
              }}
            />
```

The implementer will need to:
- Add `toast` import from `sonner`
- Add `restoreClientMutation = useMutation(api.clients.restore)` hook
- Add `deleteClientMutation = useMutation(api.clients.remove)` hook (or use existing)
- Add `activeProjectCount` from existing project data or a new query
- Add `onTrash?: () => void` to the component's props interface (called after trash for navigation)

- [ ] **Step 2: Add DangerZone to ProjectSettingsPanel**

Same pattern. Import `DangerZone`, add it after Notes section. No `cascadeCount` needed for projects.

```typescript
            <DangerZone
              entityType="project"
              entityName={project.name}
              onConfirmTrash={async () => {
                await deleteProjectMutation({ id: projectId });
                toast(`${project.name} moved to trash`, {
                  duration: 8000,
                  action: {
                    label: 'Undo',
                    onClick: () => {
                      restoreProjectMutation({ id: projectId });
                      toast.success(`${project.name} restored`);
                    },
                  },
                });
                onClose();
                onTrash?.();
              }}
            />
```

- [ ] **Step 3: Remove delete button and dialog from client page**

In `src/app/clients/[clientId]/page.tsx`:
1. Remove the delete `<Button>` (around lines 301-309)
2. Remove the `showDeleteDialog` state variable
3. Remove the `handleDeleteClient` function
4. Remove the delete `<AlertDialog>` (around lines 526-545)
5. Remove the `Trash2` import if no longer used elsewhere

- [ ] **Step 4: Remove delete button and dialog from project page**

In `src/app/clients/[clientId]/projects/[projectId]/page.tsx`:
1. Same removals as above for the project delete button/dialog

- [ ] **Step 5: Verify the build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/components/ClientSettingsPanel.tsx src/components/ProjectSettingsPanel.tsx src/app/clients/\[clientId\]/page.tsx src/app/clients/\[clientId\]/projects/\[projectId\]/page.tsx
git commit -m "feat(SAF-01): relocate delete to Settings panels, remove header delete buttons"
```

---

## Task 9: Add RestorationBanner to client and project pages

**Files:**
- Modify: `src/app/clients/[clientId]/page.tsx`
- Modify: `src/app/clients/[clientId]/projects/[projectId]/page.tsx`

- [ ] **Step 1: Add RestorationBanner to client page**

Import `RestorationBanner` at top. Then, below the `<header>` section and before the tab content, add:

```typescript
        {client.isDeleted && (
          <RestorationBanner
            entityType="client"
            entityName={client.name}
            entityId={clientId}
            deletedAt={client.deletedAt}
            onRestored={() => {
              // Stay on page, banner will disappear when client updates
            }}
            onPermanentlyDeleted={() => {
              router.push('/clients');
            }}
          />
        )}
```

**Important:** The existing `useClient(clientId)` hook fetches by ID using `ctx.db.get()`, which does NOT filter `isDeleted`. So deleted clients are still loadable by direct ID — the banner will show. Verify this during implementation.

- [ ] **Step 2: Add RestorationBanner to project page**

Same pattern:

```typescript
        {project.isDeleted && (
          <RestorationBanner
            entityType="project"
            entityName={project.name}
            entityId={projectId}
            deletedAt={project.deletedAt}
            onRestored={() => {}}
            onPermanentlyDeleted={() => {
              router.push(`/clients/${clientId}?tab=projects`);
            }}
          />
        )}
```

- [ ] **Step 3: Verify the build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/\[clientId\]/page.tsx src/app/clients/\[clientId\]/projects/\[projectId\]/page.tsx
git commit -m "feat(SAF-01): add restoration banner to client and project pages"
```

---

## Task 10: Add "Show deleted" toggle to ClientsSidebar

**Files:**
- Modify: `src/app/clients/components/ClientsSidebar.tsx`

- [ ] **Step 1: Add deleted toggle state and queries**

At the top of the component, add:

```typescript
const [showDeleted, setShowDeleted] = useState(false);
const deletedClientsCount = useQuery(api.clients.deletedCount);
const deletedClients = useQuery(
  api.clients.listDeleted,
  showDeleted ? {} : "skip"
);
```

- [ ] **Step 2: Add toggle button before "New Client" button**

Before the `{/* Add Client Button */}` section (around line 212), insert:

```typescript
      {/* Show deleted toggle */}
      {(deletedClientsCount ?? 0) > 0 && (
        <div className="px-3 py-2 border-t border-gray-200">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
          >
            {showDeleted ? (
              <>
                <ArrowLeft className="w-3 h-3" />
                Back to active clients
              </>
            ) : (
              <>
                <Trash2 className="w-3 h-3" />
                Show deleted ({deletedClientsCount})
              </>
            )}
          </button>
        </div>
      )}
```

Add `ArrowLeft` and `Trash2` to the Lucide imports.

- [ ] **Step 3: Render deleted clients when toggled**

When `showDeleted` is true, replace the normal client list with the deleted list. Each deleted client should render with `opacity-60` and the existing row component. The implementer should conditionally render:

```typescript
const displayClients = showDeleted ? (deletedClients || []) : filteredClients;
```

And add opacity styling to the client row when `client.isDeleted`:

```typescript
className={cn(existingClasses, client.isDeleted && "opacity-60")}
```

- [ ] **Step 4: Verify the build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/components/ClientsSidebar.tsx
git commit -m "feat(SAF-01): add Show deleted toggle to clients sidebar"
```

---

## Task 11: Add "Show deleted" toggle to ClientProjectsTab

**Files:**
- Modify: `src/app/clients/[clientId]/components/ClientProjectsTab.tsx`

- [ ] **Step 1: Add deleted toggle state and queries**

Same pattern as ClientsSidebar but for projects:

```typescript
const [showDeleted, setShowDeleted] = useState(false);
const deletedProjectsCount = useQuery(api.projects.deletedCountByClient, { clientId });
const deletedProjects = useQuery(
  api.projects.listDeletedByClient,
  showDeleted ? { clientId } : "skip"
);
```

- [ ] **Step 2: Add toggle below project list**

After the project cards grid, before the closing div, add the same toggle pattern with `Trash2` / `ArrowLeft` icons.

- [ ] **Step 3: Render deleted projects when toggled**

When toggled, display `deletedProjects` with `opacity-60` styling using the existing `ProjectCard` component.

- [ ] **Step 4: Verify the build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/clients/\[clientId\]/components/ClientProjectsTab.tsx
git commit -m "feat(SAF-01): add Show deleted toggle to projects tab"
```

---

## Task 12: Final build verification and push

- [ ] **Step 1: Full build check**

Run: `npx next build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Update backlog document**

Mark SAF-01 as complete in `docs/BACKLOG-2026-03-22.md` with root cause and fix description.

- [ ] **Step 3: Final commit and push**

```bash
git add docs/BACKLOG-2026-03-22.md
git commit -m "docs: mark SAF-01 as complete in backlog"
git push
```

---

## Implementation Notes

**User identity helper:** Tasks 1-4 duplicate the identity resolution block (getUserIdentity → query by clerkId). Extract a shared helper `resolveUserId(ctx)` if the codebase doesn't already have one.

**`deletedBy` display in banner:** The spec calls for showing "by [user name]" in the restoration banner. The current `RestorationBanner` component doesn't include this. To add it, pass `deletedBy: Id<"users">` and use `useQuery(api.users.getByIds, ...)` to resolve the name. This is a minor UX enhancement — implement if time permits.

**`relatedCounts` for PermanentDeleteModal:** The prop exists but is not populated by any caller. Either remove it for V1 (the modal shows generic "all associated data" copy) or add count queries. Spec says this is nice-to-have.

**Storage blob cleanup:** When documents are hard-deleted, their Convex storage blobs (`_storage`) are NOT cleaned up. File a follow-up to add `ctx.storage.delete(doc.fileStorageId)` during document cleanup.

**`onTrash` callback wiring:** The client page should pass `onTrash={() => router.push('/clients')}` and the project page should pass `onTrash={() => router.push(`/clients/${clientId}?tab=projects`)}` to the Settings panel.

**`cascadeCount` sourcing:** Use the existing `projects` data already in scope on the client page (e.g., `projects.filter(p => p.status === 'active').length`) rather than adding a new query.

**`deleteByField` helper limitations:** Uses full table scans. Acceptable for current data volumes. If performance becomes an issue, switch to `withIndex` queries where indexes exist (e.g., `reminders.by_client`, `events.by_client`).
