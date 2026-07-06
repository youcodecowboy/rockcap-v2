# Spec 1 — Drive Ingestion Backbone

**Status:** Draft for Fable build session
**Owner:** RockCap
**Type:** Basic spec (Fable to expand into full technical spec)
**Depends on:** existing Gmail integration, v4 extraction pipeline, bulk upload v3, Convex file storage
**Enables:** [Spec 2 — Knowledge Layer](./spec-2-knowledge-layer.md)

---

## 1. Purpose — what this is for

The client's working files — especially Excel models — live in **Google Drive** and change **dozens of times a day**. The RockCap app cannot see those changes. Today the only way to get a current file into the app is manual: **download from Drive → upload into RockCap → re-version by hand.** It's slow, error-prone, and means the app (and the MCP tools that run the business on top of it) are almost always working from a *stale* copy.

RockCap is a **central system of record** with a **layer of MCP tools** that let Claude Code run parts of the business (document generation, email, outreach). A large portion of that work depends on the app having **direct, easy access to the contents of documents** (Excel numbers, PDFs, etc.). Reading those through Google Drive's own MCP tools at query time is not the easiest or most reliable path.

**This build connects Google Drive to the app so the app always holds a current, readable copy of the client's files** — updated automatically when files change in Drive — and unifies that with the existing manual/bulk upload path, so there is **one corpus** the MCP tools read from.

---

## 2. The load-bearing principle (read this first)

> **No one edits files inside the app. The app is a reader + organizer. Google Drive is the single source of truth for file contents.**

Everything follows from this:
- Because there is only **one writer (Drive)**, the app-side copy is a **pure downstream cache**, not a competing copy. There is **no bidirectional content sync, no conflict resolution, no drift** — the app copy is simply overwritten whenever Drive changes.
- The only writes the app makes back to Drive are **new files** and **organization** (folders/moves/naming) — never edits to existing file contents.

State this at the top of the full spec; it is the reason the whole design is safe and simple.

---

## 3. What it does / does not do

**In scope (v1):**
- Mirror Google Drive file **metadata** into the app (name, folder path, mime type, size, modified time, Drive revision id, web view/preview link).
- **Cache the file bytes** app-side (Convex file storage) so the MCP tools / extraction pipeline can read contents directly. Refreshed whenever Drive reports a new revision.
- Route both **Drive files** and **bulk upload v3** files through **one unified ingestion pipeline** into the existing **v4 extraction pipeline**, so there is a single parsed corpus.
- Surface a **live file list + in-app preview**, updating within ~1–2 minutes of a save in Drive.
- **Organization write-back (app → Drive):** the app's filing structure becomes Drive's structure — create folders, move/file documents, apply naming conventions — via the Drive API, **approval-gated**.

**Out of scope (v1):**
- Editing file **contents** inside the app.
- Continuous **two-way content sync** / conflict resolution.
- The knowledge graph / GraphRAG layer (that's [Spec 2](./spec-2-knowledge-layer.md); this build must *feed* it, see §7).

---

## 4. Architecture — one pipeline, two feeders

```
  FEEDER A: Google Drive (changes)      FEEDER B: Bulk Upload v3 / manual
            │                                    │
            └──────────────┬─────────────────────┘
                           ▼
              UNIFIED INGESTION PIPELINE
        detect/receive → fetch bytes → cache in Convex file storage
             → run existing v4 extraction → store parsed content + metadata
                           │
        ┌──────────────────┼───────────────────────────┐
        ▼                  ▼                            ▼
  driveFiles mirror   parsed content            [hook: feed Knowledge
  (metadata + link)   (v4 output)                Layer — Spec 2)]
        │
        ▼
  Reactive UI: live file list + preview     ← Convex reactivity, ~free
```

Plus a **one-way organization channel** (app → Drive): filing/folder/naming commands, approval-gated.

**Design the pipeline with an explicit post-extraction hook.** The real output of this build is not "a preview" — it is **clean, parsed, provenance-ready content**. Spec 2 attaches at that hook. Building the mirror as a dead-end preview feature would force a re-architecture later; don't.

---

## 5. Components

### 5.1 Google Drive OAuth (HIGH reuse from Gmail)
- Mirror the Gmail token pattern. Existing reference: token table `googleGmailTokens` (`convex/schema.ts` ~4291–4307); refresh helpers `convex/gmailInbound.ts:25–49` and `convex/gmailSend.ts:169–186`; OAuth helpers `src/lib/gmail/oauth.ts`; initiate route `src/app/api/gmail/auth/route.ts`.
- New: `googleDriveTokens` table (same shape; store Drive **changes page token / start token** instead of `historyId`). Separate OAuth app + env vars (`GOOGLE_DRIVE_CLIENT_ID/SECRET`) per the existing "independent consent screens" convention.
- Scope v1: `drive.readonly` for the mirror. Organization write-back (§5.5) needs a write scope (`drive` or `drive.file` — Fable to choose; note `drive.file` cannot reorganize files the app didn't create, so full `drive` is likely required for library-structure sync).
- **Configure the OAuth app as "Internal"** (single Workspace) so refresh tokens don't expire and no Google verification is needed.

### 5.2 Changes polling cron (HIGH reuse from Gmail inbound)
- Template: `convex/gmailInbound.ts` `pollAllInbound` (303–323) → `pollUserInbound` (159–300). Copy the shape: iterate connected users, fetch changes since stored watermark, handle stale-watermark reseed, cap per tick, advance watermark.
- New: `internal.driveSync.pollAllChanges` on a ~30-min (or shorter) cron in `convex/crons.ts` (see existing entry `84–88`). Use Drive `changes.list` since the stored page token; on stale token (410) reseed with `files.list` (modifiedTime within last N days). No MIME parsing (Drive metadata is JSON).
- Poll is the recommended mechanism (matches proven Gmail pattern, no webhook channel renewal). Push notifications are a possible later optimization, not v1.

### 5.3 `driveFiles` mirror table + byte cache
- New `driveFiles` table (shape modeled on `replyEvents`, `convex/schema.ts` ~4429–4528, but simpler — no classification/dispatch): `userId`, `source: "google_drive"`, `driveFileId` (string), `name`, `mimeType`, `parentFolderId`, `path`, `modifiedTime`, `headRevisionId`, `webViewLink`, `cachedStorageId?` (Convex file storage id for the cached bytes), `extractionStatus`, `lastSyncedAt`.
- **Idempotency / echo guard:** compound index by source + fileId (pattern: `replyEvents.ts:12–25`). Files the app itself writes back to Drive (§5.5) are tagged with their returned `driveFileId` on creation so the poll recognizes them and doesn't treat them as new external changes.
- **Byte cache:** on new/changed revision, fetch bytes via Drive API, store via Convex file storage (same mechanism uploaded docs use — `fileStorageId` on the `documents` table, `convex/documents.ts`), stamp with `headRevisionId`. Re-fetch only when the revision moves.

### 5.4 Unified ingestion → existing extraction
- Both feeders (Drive, bulk upload v3 via `bulkQueueProcessor.ts` → `/api/v4-analyze`) converge on one ingestion path that caches bytes and invokes the **existing v4 extraction pipeline**. Do **not** build new parsing — route into what exists.
- Cache extraction output keyed to the source revision (`headRevisionId` for Drive) so it only re-runs when contents change.
- Decision for Fable: whether Drive-cached files reuse the `documents` table or stay in `driveFiles` with a link. Recommendation from investigation: keep `driveFiles` as the mirror/cache record; link to a `documents`/extraction record rather than overloading the upload-oriented `documents` table. Fable to finalize.

### 5.5 Organization write-back (app → Drive), approval-gated
- One-way organizational commands: create folder, move/file document, apply naming conventions — so the app's filing structure **becomes** Drive's structure.
- Route every write through the existing **`approvals`** gate (per repo rule: no autonomous external action). Echo-guard via the returned `driveFileId`.
- v1 can ship read-only first and add this as a fast-follow within the same build; Fable to sequence.

### 5.6 Reactive UI: live file list + preview
- Reactive query: fork `replyEvents.listInboundPaginated` (`convex/replyEvents.ts:505`) → `driveFiles.listByUser` (paginated, ordered by modifiedTime desc).
- UI: fork the existing file-list components `src/app/(desktop)/docs/components/FileList.tsx` + `FileCard.tsx` → a Drive file list. Remap fields; a flat list is acceptable for v1 (folder-tree nav is a nice-to-have that adds ~3–5 hrs).
- Preview: embed Drive's own preview (`/file/d/{id}/preview` iframe) in a modal. Works org-wide (single Workspace, org sharing). No byte download needed for preview.

---

## 6. Infrastructure note

**No AWS / no new object storage / no new services.** Files stay canonical in the client's existing Google Drive. Cached bytes live in **Convex file storage** (already used by uploads). The app is Next.js + Convex (existing). The work is API integration + a metadata/byte mirror on infrastructure already in place.

---

## 7. What this enables next (hook for Spec 2)

The output of this build — a **fresh, unified, parsed corpus with provenance-ready content**, refreshed by a single one-way change feed — is the feedstock for the **Knowledge Layer** ([Spec 2](./spec-2-knowledge-layer.md)): atomization + a per-client and company-wide knowledge graph that improves MCP retrieval and reduces hallucination via multi-hop reasoning. **Build 1 must expose a clean post-extraction hook** so Spec 2 attaches without re-architecting.

---

## 8. Estimate (from code-grounded investigation)

- **Read-only mirror + byte cache + unified ingestion + live UI:** ~30–45 hrs (one developer fluent in the codebase; buffer included for Google Cloud OAuth setup + Drive Changes API quirks + testing).
- **+ Organization write-back:** additional ~20–35 hrs.
- Large reuse from the Gmail adapter, existing v4 pipeline, and existing file-list UI is what keeps this tight.

---

## 9. Open questions for Fable
1. `drive.readonly` for v1 mirror, then a write scope for organization write-back — confirm whether full `drive` scope is required (likely yes, to reorganize pre-existing files) vs `drive.file`.
2. Cadence: 30-min poll vs shorter; whether to add push notifications later.
3. Data model: `driveFiles` linking to `documents`/extraction records vs a unified table.
4. Byte-cache policy: cache all files, or only those an operator/MCP tool touches (lazy)? Trade-off: freshness/latency vs storage/compute.
5. Folder hierarchy in the UI for v1 (flat list) vs fast-follow.
6. Sequencing of organization write-back within the build.
