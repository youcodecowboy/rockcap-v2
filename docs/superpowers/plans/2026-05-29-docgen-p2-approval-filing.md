# Document Publish Approval + Filing (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn rendered files (storage IDs from the P1 engine) into an operator-gated, client-filed document — stage a `document_publish` approval the operator can preview, and on approval create `documents` rows filed to the client's library.

**Architecture:** A new `convex/documentPublish.ts` exposes `requestPublish` (public mutation — stages a `document_publish` approval via `approvals.internalCreate`) and `recordPublishedDocs` (internal mutation — on approval, inserts client-scoped `documents` rows from the approval's `draftPayload`). The `executeApproval` dispatcher's `document_publish` case (currently a stub) is wired to `recordPublishedDocs`. The `/approvals` UI gains a preview (View PDF / DOCX) for `document_publish` rows. A pure helper builds the document row (unit-tested).

**Tech Stack:** Convex (mutations / internalMutation / internalAction dispatch), Next.js client UI (`useQuery`/`useMutation`), vitest for the pure helper.

**Where this sits:** Second of three v1 sub-plans. P1 (render engine) is done — `POST /api/documents/generate` returns `files:[{format,storageId,fileName,fileSize,mime}]`. P2 (this) consumes those storage IDs. P3 (guiding skill + chat tool) calls `requestPublish` with freshly-rendered files.

**The `draftPayload` contract (document_publish)** — written by `requestPublish`, read by both the UI and `recordPublishedDocs`:
```ts
// approval.relatedClientId : Id<"clients"> | undefined   (typed on the approval row, NOT in draftPayload)
// approval.draftPayload :
{
  title: string;          // e.g. "Company one-pager — Mackenzie Miller Homes"
  docType: string;        // -> documents.fileTypeDetected, e.g. "Company One-Pager"
  category: string;       // -> documents.category, e.g. "Generated"
  isBaseDocument: boolean;// file at client level (true) vs needs a project (false)
  files: Array<{ format: "pdf" | "docx"; storageId: Id<"_storage">; fileName: string; fileSize: number; mime: string }>;
}
```

**Implementer prerequisites:**
- App root: `/Users/cowboy/rockcap/rockcap-v2/model-testing-app/`. Run `npm`/`npx` there.
- Pure logic → vitest in `src/__tests__/`. Convex functions + UI have no `convex-test`; verified via `npx convex dev --once` + `npx next build` + a documented manual flow.
- Commit after each task with the given message. Do NOT push, amend, or switch branches (on `claude/ch-group-charges`).
- Verbatim patterns to mirror (already confirmed in the codebase):
  - `convex/gmailSend.ts` `requestSend` — a public `mutation` that resolves the user then `await ctx.runMutation(internal.approvals.internalCreate, {...})`. Mirror its `getAuthenticatedUser` helper and the `internalCreate` call.
  - `convex/approvals.ts` `internalCreate` args: `{ entityType, summary, draftPayload, requestedBy: Id<"users">, requestSource, requestSourceName?, relatedClientId?, relatedProjectId?, relatedSkillRunId?, ... }` → returns `Id<"approvals">`.
  - `convex/approvals.ts` `executeApproval` switch — the `document_publish` case currently falls into the shared stub block (`result = { stub: true, ... }`); replace it.
  - `documents` insert fields (from `documents.create`): `fileStorageId, fileName, fileSize, fileType, uploadedAt, summary, fileTypeDetected, category, reasoning, confidence, tokensUsed, clientId, clientName, scope, isBaseDocument, status, savedAt, uploadedBy`.
  - `api.documents.getFileUrl({ storageId })` → signed URL for preview.

---

### Task 1: Pure document-row builder (TDD)

**Files:**
- Create: `convex/lib/buildGeneratedDocRow.ts`
- Test: `src/__tests__/buildGeneratedDocRow.test.ts`

Pure, Convex-free (so it is vitest-able — the repo has no convex-test). It maps one rendered file + approval metadata into the object inserted into `documents`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/buildGeneratedDocRow.test.ts
import { describe, it, expect } from "vitest";
import { buildGeneratedDocRow } from "../../convex/lib/buildGeneratedDocRow";

const file = { format: "pdf" as const, storageId: "stor123", fileName: "MMH_One_Pager.pdf", fileSize: 5000, mime: "application/pdf" };

describe("buildGeneratedDocRow", () => {
  it("maps a rendered file into a client-scoped documents row", () => {
    const row = buildGeneratedDocRow({
      file, docType: "Company One-Pager", category: "Generated", title: "MMH one-pager",
      clientId: "client789", clientName: "Mackenzie Miller Homes", isBaseDocument: true,
      uploadedBy: "user42", now: "2026-05-29T10:00:00.000Z",
    });
    expect(row.fileStorageId).toBe("stor123");
    expect(row.fileType).toBe("application/pdf");
    expect(row.fileSize).toBe(5000);
    expect(row.fileTypeDetected).toBe("Company One-Pager");
    expect(row.category).toBe("Generated");
    expect(row.summary).toBe("MMH one-pager");
    expect(row.clientId).toBe("client789");
    expect(row.clientName).toBe("Mackenzie Miller Homes");
    expect(row.scope).toBe("client");
    expect(row.isBaseDocument).toBe(true);
    expect(row.status).toBe("completed");
    expect(row.uploadedBy).toBe("user42");
    expect(row.uploadedAt).toBe("2026-05-29T10:00:00.000Z");
    expect(row.savedAt).toBe("2026-05-29T10:00:00.000Z");
  });

  it("passes through an undefined client (unfiled)", () => {
    const row = buildGeneratedDocRow({
      file, docType: "X", category: "Generated", title: "t", isBaseDocument: true,
      uploadedBy: "user42", now: "2026-05-29T10:00:00.000Z",
    });
    expect(row.clientId).toBeUndefined();
    expect(row.clientName).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/buildGeneratedDocRow.test.ts`
Expected: FAIL — "Cannot find module '../../convex/lib/buildGeneratedDocRow'".

- [ ] **Step 3: Implement the helper**

```ts
// convex/lib/buildGeneratedDocRow.ts
// Pure mapper: one rendered file + approval metadata -> the object inserted
// into the `documents` table. Kept free of Convex imports so it is
// unit-testable under vitest (this repo has no convex-test). The insert site
// in documentPublish.recordPublishedDocs casts the result to satisfy the
// Convex Id types (storageId / clientId / uploadedBy arrive as strings here).

export interface GeneratedFile {
  format: "pdf" | "docx";
  storageId: string;
  fileName: string;
  fileSize: number;
  mime: string;
}

export interface BuildDocRowInput {
  file: GeneratedFile;
  docType: string;
  category: string;
  title: string;
  clientId?: string;
  clientName?: string;
  isBaseDocument: boolean;
  uploadedBy: string;
  now: string;
}

export function buildGeneratedDocRow(input: BuildDocRowInput) {
  return {
    fileStorageId: input.file.storageId,
    fileName: input.file.fileName,
    fileSize: input.file.fileSize,
    fileType: input.file.mime,
    uploadedAt: input.now,
    summary: input.title,
    fileTypeDetected: input.docType,
    category: input.category,
    reasoning: "Generated document, operator-approved.",
    confidence: 1,
    tokensUsed: 0,
    clientId: input.clientId,
    clientName: input.clientName,
    scope: "client" as const,
    isBaseDocument: input.isBaseDocument,
    status: "completed" as const,
    savedAt: input.now,
    uploadedBy: input.uploadedBy,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/buildGeneratedDocRow.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/lib/buildGeneratedDocRow.ts src/__tests__/buildGeneratedDocRow.test.ts
git commit -m "feat(docgen): pure buildGeneratedDocRow mapper (TDD)"
```

---

### Task 2: `convex/documentPublish.ts` — requestPublish + recordPublishedDocs

**Files:**
- Create: `convex/documentPublish.ts`

- [ ] **Step 1: Implement the module**

```ts
// convex/documentPublish.ts
// Document-publish approval surface (P2 of the doc-gen substrate).
//   requestPublish     — public mutation: stage a document_publish approval
//                        from already-rendered, already-stored files (P1).
//   recordPublishedDocs— internal mutation: on approval, create client-scoped
//                        `documents` rows from the approval's draftPayload.
// The actual filing happens ONLY on approval (no draft documents row exists
// before then), so a rejected draft never becomes a documents row.
import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { buildGeneratedDocRow } from "./lib/buildGeneratedDocRow";

async function getAuthenticatedUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

const FILE = v.object({
  format: v.union(v.literal("pdf"), v.literal("docx")),
  storageId: v.id("_storage"),
  fileName: v.string(),
  fileSize: v.number(),
  mime: v.string(),
});

// ── Stage the approval (called by the guiding skill / chat tool in P3) ──
export const requestPublish = mutation({
  args: {
    title: v.string(),
    docType: v.string(),
    category: v.string(),
    summary: v.string(),
    files: v.array(FILE),
    relatedClientId: v.optional(v.id("clients")),
    relatedProjectId: v.optional(v.id("projects")),
    relatedSkillRunId: v.optional(v.id("skillRuns")),
    requestSourceName: v.optional(v.string()),
    isBaseDocument: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (args.files.length === 0) throw new Error("requestPublish: no files to publish");

    const approvalId = await ctx.runMutation(internal.approvals.internalCreate, {
      entityType: "document_publish",
      summary: args.summary,
      draftPayload: {
        title: args.title,
        docType: args.docType,
        category: args.category,
        isBaseDocument: args.isBaseDocument ?? true,
        files: args.files,
      },
      requestedBy: user._id,
      requestSource: "skill",
      requestSourceName: args.requestSourceName ?? "document-author",
      relatedClientId: args.relatedClientId,
      relatedProjectId: args.relatedProjectId,
      relatedSkillRunId: args.relatedSkillRunId,
    });

    return { approvalId };
  },
});

// ── Finalise on approval (called by approvals.executeApproval) ──
export const recordPublishedDocs = internalMutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    if (approval.entityType !== "document_publish") {
      throw new Error(`Expected document_publish approval, got ${approval.entityType}`);
    }
    const payload = approval.draftPayload as {
      title: string; docType: string; category: string; isBaseDocument: boolean;
      files: Array<{ format: "pdf" | "docx"; storageId: string; fileName: string; fileSize: number; mime: string }>;
    };

    let clientName: string | undefined;
    if (approval.relatedClientId) {
      const client = await ctx.db.get(approval.relatedClientId);
      clientName = (client as any)?.name;
    }

    const now = new Date().toISOString();
    const documentIds: string[] = [];
    for (const file of payload.files) {
      const row = buildGeneratedDocRow({
        file,
        docType: payload.docType,
        category: payload.category,
        title: payload.title,
        clientId: approval.relatedClientId,
        clientName,
        isBaseDocument: payload.isBaseDocument,
        uploadedBy: approval.requestedBy,
        now,
      });
      const id = await ctx.db.insert("documents", row as any);
      documentIds.push(id);
    }

    return { documentIds, filedToClient: approval.relatedClientId ?? null };
  },
});
```

- [ ] **Step 2: Deploy + typecheck**

Run: `npx convex dev --once`
Expected: "Convex functions ready" with no errors (new functions `documentPublish.requestPublish` + `documentPublish.recordPublishedDocs` compile).

- [ ] **Step 3: Commit**

```bash
git add convex/documentPublish.ts
git commit -m "feat(docgen): document_publish requestPublish + recordPublishedDocs"
```

---

### Task 3: Wire the `document_publish` executor

**Files:**
- Modify: `convex/approvals.ts` (the `executeApproval` switch)

- [ ] **Step 1: Add a real case and remove `document_publish` from the stub block**

In `convex/approvals.ts`, the `executeApproval` switch currently has `document_publish` grouped with the stub cases. Change it so `document_publish` dispatches to the new executor. Replace this block:

```ts
        case "gmail_send":
          result = await ctx.runAction(internal.gmailSend.executeApprovedSend, {
            approvalId: args.approvalId,
          });
          break;
        // Other entity types register here. For v1, only gmail_send has
        // a real executor; the rest mark executed with no payload so
        // the lifecycle still advances.
        case "hubspot_write":
        case "document_publish":
        case "lender_outreach":
        case "client_communication":
        case "skill_action":
        case "cadence_fire":
        case "other":
          result = { stub: true, note: `Executor for ${approval.entityType} not yet wired` };
          break;
```

with:

```ts
        case "gmail_send":
          result = await ctx.runAction(internal.gmailSend.executeApprovedSend, {
            approvalId: args.approvalId,
          });
          break;
        case "document_publish":
          result = await ctx.runMutation(internal.documentPublish.recordPublishedDocs, {
            approvalId: args.approvalId,
          });
          break;
        // Other entity types register here. The rest mark executed with no
        // payload so the lifecycle still advances.
        case "hubspot_write":
        case "lender_outreach":
        case "client_communication":
        case "skill_action":
        case "cadence_fire":
        case "other":
          result = { stub: true, note: `Executor for ${approval.entityType} not yet wired` };
          break;
```

(`internal` is already imported at the top of `convex/approvals.ts`.)

- [ ] **Step 2: Deploy + typecheck**

Run: `npx convex dev --once`
Expected: compiles clean; `internal.documentPublish.recordPublishedDocs` resolves.

- [ ] **Step 3: Commit**

```bash
git add convex/approvals.ts
git commit -m "feat(docgen): wire document_publish executor in executeApproval"
```

---

### Task 4: Approvals UI — preview + file-to-client on approve

**Files:**
- Modify: `src/app/(desktop)/approvals/page.tsx`

Adds a `document_publish` preview (title + a "View PDF" / "Download DOCX" link per file, via `getFileUrl`), excludes `document_publish` from the raw JSON dump, and makes the "executed" badge read "Filed" for `document_publish` (vs "Sent" for email).

- [ ] **Step 1: Add the preview components**

Add near the top of the file (after the imports, before `StatusBadge`):

```tsx
function DocFileLink({ file }: { file: any }) {
  const url = useQuery(api.documents.getFileUrl as any, { storageId: file.storageId });
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 border rounded px-2 py-1 text-xs ${
        url ? "text-blue-700 hover:bg-blue-50" : "text-gray-400 pointer-events-none"
      }`}
    >
      {file.format === "pdf" ? "View PDF" : "Download DOCX"}
    </a>
  );
}

function DocumentPublishPreview({ payload }: { payload: any }) {
  const files = payload?.files ?? [];
  return (
    <div className="space-y-2 text-sm">
      <div>
        <span className="text-gray-500">Title: </span>
        <span className="font-medium">{payload?.title}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="font-mono">{payload?.docType}</span>
        <span>·</span>
        <span>{payload?.category}</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {files.map((f: any) => (
          <DocFileLink key={f.storageId} file={f} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Make the "executed" badge entity-aware**

Change the `StatusBadge` signature and its `executed` case. Replace:

```tsx
function StatusBadge({ status }: { status: ApprovalStatus }) {
```
with:
```tsx
function StatusBadge({ status, entityType }: { status: ApprovalStatus; entityType?: string }) {
```

and replace the `executed` case:

```tsx
    case "executed":
      return (
        <Badge variant="default" className="bg-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          Sent
        </Badge>
      );
```
with:
```tsx
    case "executed":
      return (
        <Badge variant="default" className="bg-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
          {entityType === "document_publish" ? "Filed" : "Sent"}
        </Badge>
      );
```

and update its call site:
```tsx
            <StatusBadge status={approval.status} />
```
to:
```tsx
            <StatusBadge status={approval.status} entityType={approval.entityType} />
```

- [ ] **Step 3: Render the preview + exclude from the JSON dump**

In `ApprovalCard`'s `CardContent`, after the `gmail_send` preview block and before the "Generic payload dump" block, add:

```tsx
            {/* Document-publish preview */}
            {approval.entityType === "document_publish" && approval.draftPayload && (
              <DocumentPublishPreview payload={approval.draftPayload} />
            )}
```

Then change the generic-dump condition from:
```tsx
            {/* Generic payload dump for non-Gmail types */}
            {approval.entityType !== "gmail_send" && (
```
to:
```tsx
            {/* Generic payload dump for remaining types */}
            {approval.entityType !== "gmail_send" && approval.entityType !== "document_publish" && (
```

- [ ] **Step 4: Build**

Run: `npx next build`
Expected: builds clean; `/approvals` page compiles with the new components.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(desktop)/approvals/page.tsx"
git commit -m "feat(docgen): approvals UI preview + file-to-client for document_publish"
```

---

### Task 5: Build gate + end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full build gate**

Run: `npx convex dev --once && npx next build`
Expected: both pass clean.

- [ ] **Step 2: Manual end-to-end (operator/dashboard — requires auth)**

`requestPublish` uses `getAuthenticatedUser`, so it cannot be driven from an unauthenticated `npx convex run`. Verify via the authenticated Convex dashboard function runner (or defer full e2e to P3, where the chat tool calls `requestPublish`):

1. Render a file with the P1 route to get a real `storageId` (dev server running, `CONVEX_INTERNAL_SECRET` set):
   ```bash
   curl -s -X POST http://localhost:3000/api/documents/generate \
     -H "Content-Type: application/json" -H "x-convex-internal-secret: $CONVEX_INTERNAL_SECRET" \
     -d '{"title":"P2 Filing Test","formats":["pdf"],"contentHtml":"<h1>P2</h1><p>Filing test.</p>"}'
   ```
   Note the returned `files[0]` (format/storageId/fileName/fileSize/mime).
2. In the Convex dashboard (authenticated as a real user), run `documentPublish.requestPublish` with `{ title, docType:"Test Doc", category:"Generated", summary:"P2 filing test", files:[<the file>], relatedClientId:<a real client id> }`.
3. Open `/approvals` → the `document_publish` row appears; expand it → the **View PDF** link opens the rendered file. Click **Approve**.
4. Confirm the badge flips to **Filed** (executed), and the document now appears in that client's **Documents** view (scope `client`). Also confirm `recordPublishedDocs` returned the new `documentId`(s) in the approval's execution result.
5. Reject path: stage another, **Reject** it → confirm no `documents` row is created for it.

- [ ] **Step 3: Commit (if any verification-driven fixups were needed; otherwise skip)**

---

## Self-review checklist (run before handoff)

- [ ] **Spec coverage:** approval staged (`requestPublish`) ✓; executor creates client-filed docs on approve (`recordPublishedDocs` + wired case) ✓; operator previews the real file (`/approvals` preview) ✓; rejected drafts never become documents ✓ (no row until approve).
- [ ] **Type consistency:** the `draftPayload` shape written by `requestPublish` matches what `recordPublishedDocs` and the UI read; `buildGeneratedDocRow` field names match the `documents` schema.

## Known deferrals (documented, not gaps)

- **Orphaned `_storage` blobs on reject.** A rejected draft's rendered files stay in `_storage` unreferenced. v1 accepts this minor leak; a periodic sweep of unreferenced storage (or a reject-time cleanup) can be added later. (The spec mentioned blob cleanup; deferring it keeps P2 focused.)
- **P3 closes the loop.** Fully automated e2e (chat → render → `requestPublish` → approve → filed) lands in P3; P2's automated gate is the build + the dashboard-driven manual flow above.

## Done when

`npx convex dev --once` + `npx next build` are green, the pure helper test passes, and a dashboard-staged `document_publish` approval can be previewed, approved, and results in a client-filed `documents` row (rejected ones produce none).
