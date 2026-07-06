import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  query,
  mutation,
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { refreshAccessToken } from "./driveTokens";
import { getAuthenticatedUserOrNull } from "./authHelpers";

// Google Drive metadata mirror — the sync engine (phase 2).
//
// Drive is a one-way feed; driveFolders/driveFiles are a disposable cache
// that can be rebuilt from scratch at any time (backfillWalk). Three entry
// points, all internal:
//
//   pollChanges    — cron, every 2 min. Pages Drive's changes.list from the
//                    stored startPageToken watermark and applies each change
//                    to the mirror. Losslessly resumable: the watermark is
//                    advanced page-by-page, only AFTER a page is processed.
//   backfillWalk   — scheduler-chained BFS over the folder tree. Seeds the
//                    mirror initially, reseeds after a 410 (expired
//                    watermark), and doubles as the reconcile walker.
//   reconcileWalk  — cron, nightly. Re-walks the whole tree and trashes any
//                    mirror row the walk didn't see (safety net for gaps in
//                    the per-user changes feed on shared-with-me content).
//
// No bytes are fetched here. The poller stamps extraction bookkeeping
// (settling debounce + firstDirtyAt starvation guard) on driveFiles for the
// phase-3 hydration worker to consume.
//
// Scope model: there is NO stored sync mode. A folder/file is in-scope iff
// its parent chain reaches rootFolderId; its effective hydration scope is
// the nearest ancestor folder with clientId set (resolveFolderScope). This
// avoids all subtree-invalidation machinery when folders move or mappings
// change.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const LEASE_MS = 90_000; // pollChanges overlap lease (cron fires every 2 min)
// Settling debounce for changed files. Exported for driveHydration.ts (the
// phase-3 worker re-arms this window when a file drifts mid-hydration).
export const SETTLE_MS = 15 * 60_000;
const MAX_PAGES_PER_TICK = 10; // changes.list pages per poll tick
const MAX_ANCESTOR_LOOKUPS = 10; // files.get calls per change when walking scope
const FOLDERS_PER_WALK_INVOCATION = 5;
const MUTATION_CHUNK = 50; // keep each mutation comfortably under ~100 writes

const CHANGES_FIELDS =
  "nextPageToken,newStartPageToken,changes(changeType,removed,fileId,file(id,name,mimeType,parents,md5Checksum,headRevisionId,modifiedTime,trashed,size,webViewLink,shortcutDetails))";
const FILE_LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,parents,md5Checksum,headRevisionId,modifiedTime,size,webViewLink,shortcutDetails)";

// ── Drive REST helper (mirrors gmailInbound.gmailGet) ────────────
// Returns { ok, status, data }. Callers decide how to react to !ok (e.g.
// changes.list 410 → reseed) rather than throwing on every non-200.
async function driveGet(
  accessToken: string,
  path: string,
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

// Refresh the access token if it is expired / within 60s of expiry (same
// pattern as gmailInbound). Returns null after flagging reconnect on a
// refresh failure — callers stop cleanly. Exported for driveHydration.ts —
// one refresh path for the whole Drive integration (all token WRITES stay
// in driveTokens.ts).
export async function ensureAccessToken(ctx: any, token: any): Promise<string | null> {
  let accessToken: string = token.accessToken;
  const expiresMs = new Date(token.expiresAt).getTime();
  if (Number.isNaN(expiresMs) || Date.now() > expiresMs - 60_000) {
    try {
      const refreshed = await refreshAccessToken(token.refreshToken);
      accessToken = refreshed.access_token;
      await ctx.runMutation(internal.driveTokens.writeRefreshedToken, {
        accessToken,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      });
    } catch {
      await ctx.runMutation(internal.driveTokens.flagNeedsReconnect, {});
      return null;
    }
  }
  return accessToken;
}

// ── Pure scope/path helpers ──────────────────────────────────────

// Minimal in-memory shape of a driveFolders row (what the walks need).
// Exported for driveHydration.ts's scope resolution.
export type MirrorFolder = {
  driveFolderId: string;
  name: string;
  parentFolderId?: string;
  path: string;
  clientId?: string;
  trashed?: boolean;
};

// Path join: root is "/", children are "/Name", "/Name/Child", ...
function childPath(parentPath: string, name: string): string {
  return parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
}

// Effective scope of a folder: walk parentFolderId up through the in-memory
// map. In-scope iff the chain reaches rootFolderId; hydration clientId is the
// NEAREST ancestor (including the folder itself) with clientId set. Mapped
// folders are by construction in the mirror (in scope), so a clientId hit
// short-circuits.
export function resolveFolderScope(
  folderId: string,
  foldersById: Map<string, MirrorFolder>,
  rootFolderId: string,
): { inScope: boolean; clientId: string | null; mappedFolderId: string | null } {
  let current: string | undefined = folderId;
  for (let depth = 0; depth < 64 && current; depth++) {
    const row = foldersById.get(current);
    if (row?.clientId) {
      return { inScope: true, clientId: row.clientId, mappedFolderId: current };
    }
    if (current === rootFolderId) {
      return { inScope: true, clientId: null, mappedFolderId: null };
    }
    if (!row) return { inScope: false, clientId: null, mappedFolderId: null };
    current = row.parentFolderId;
  }
  return { inScope: false, clientId: null, mappedFolderId: null };
}

// ── Internal reads ───────────────────────────────────────────────

// All folder rows — the folders table is small, so the walks load it once
// per tick/invocation and do scope/path work over an in-memory Map.
export const listAllFoldersInternal = internalQuery({
  args: {},
  handler: async (ctx): Promise<MirrorFolder[]> => {
    const rows = await ctx.db.query("driveFolders").collect();
    return rows.map((r) => ({
      driveFolderId: r.driveFolderId,
      name: r.name,
      parentFolderId: r.parentFolderId,
      path: r.path,
      clientId: r.clientId as string | undefined,
      trashed: r.trashed,
    }));
  },
});

// Effective hydration scope of a folder, for later phases (hydration worker,
// mapping UI). Walks the stored folder rows; see resolveFolderScope.
export const getEffectiveScope = internalQuery({
  args: { folderId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ inScope: boolean; clientId: string | null; mappedFolderId: string | null }> => {
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token?.rootFolderId) {
      return { inScope: false, clientId: null, mappedFolderId: null };
    }
    const rows = await ctx.db.query("driveFolders").collect();
    const map = new Map<string, MirrorFolder>(
      rows.map((r) => [
        r.driveFolderId,
        {
          driveFolderId: r.driveFolderId,
          name: r.name,
          parentFolderId: r.parentFolderId,
          path: r.path,
          clientId: r.clientId as string | undefined,
          trashed: r.trashed,
        },
      ]),
    );
    return resolveFolderScope(args.folderId, map, token.rootFolderId);
  },
});

// ── Internal writes (actions can't touch the DB; the poller/walks batch
//    their work through these, chunked to stay well under ~100 writes) ──

// Upsert folder metadata by driveFolderId. clientId (operator mapping) is
// deliberately never written here — sync must not clobber mappings.
export const upsertFoldersInternal = internalMutation({
  args: {
    folders: v.array(
      v.object({
        driveFolderId: v.string(),
        name: v.string(),
        parentFolderId: v.optional(v.string()),
        path: v.string(),
      }),
    ),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    for (const f of args.folders) {
      const existing = await ctx.db
        .query("driveFolders")
        .withIndex("by_drive_id", (q) => q.eq("driveFolderId", f.driveFolderId))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: f.name,
          parentFolderId: f.parentFolderId,
          path: f.path,
          trashed: false,
          lastSyncedAt: args.syncedAt,
        });
      } else {
        await ctx.db.insert("driveFolders", {
          driveFolderId: f.driveFolderId,
          name: f.name,
          parentFolderId: f.parentFolderId,
          path: f.path,
          trashed: false,
          lastSyncedAt: args.syncedAt,
        });
      }
    }
  },
});

// Patch materialized paths on descendant folders after a rename/move. The
// action computes the new paths over its in-memory map; this just writes.
export const patchFolderPathsInternal = internalMutation({
  args: {
    updates: v.array(v.object({ driveFolderId: v.string(), path: v.string() })),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    for (const u of args.updates) {
      const existing = await ctx.db
        .query("driveFolders")
        .withIndex("by_drive_id", (q) => q.eq("driveFolderId", u.driveFolderId))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { path: u.path, lastSyncedAt: args.syncedAt });
      }
    }
  },
});

// Drive-trash ↔ documents soft-delete propagation (single helper — every
// path that flips a mirror row's trashed state on an IMPORTED file routes
// through here). Trashing in Drive soft-deletes the library row; the file
// re-appearing un-deletes it — but ONLY when the soft-delete was ours
// (deletedReason "trashed_in_drive"). An operator's own delete is never
// resurrected by Drive activity.
export const DRIVE_TRASH_REASON = "trashed_in_drive";
async function propagateDriveTrashToDocument(
  ctx: any,
  doc: Doc<"documents"> | null,
  trashed: boolean,
) {
  if (!doc) return;
  if (trashed) {
    if (doc.isDeleted !== true) {
      await ctx.db.patch(doc._id, {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedReason: DRIVE_TRASH_REASON,
      });
    }
  } else if (doc.isDeleted === true && doc.deletedReason === DRIVE_TRASH_REASON) {
    await ctx.db.patch(doc._id, {
      isDeleted: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      deletedReason: undefined,
    });
  }
}

// Upsert file metadata by driveFileId, stamping extraction bookkeeping:
//  - queueSettling=true (changes poll / reconcile diff): a changed checksum
//    on an IMPORTED file (documentId set — import is the only gate; see
//    importDriveFiles) enters "settling" — settleAfter pushed forward on
//    EVERY change (debounce), firstDirtyAt preserved from the first dirty
//    moment (starvation guard). An "error" row that changes again resets to
//    settling with the error cleared.
//  - queueSettling=false (initial backfill): existing rows get metadata-only
//    updates (a reseed must never downgrade or mass-queue extraction state).
//  - New rows ALWAYS land as "none" — a file can never be born settling;
//    extraction is queued only for imported files.
//  - Imported files additionally get their documents row's surfaced metadata
//    (fileName / fileSize / driveWebViewLink) patched live, so the library
//    reflects Drive renames within a poll tick, ahead of any re-extraction.
export const upsertFilesInternal = internalMutation({
  args: {
    files: v.array(
      v.object({
        driveFileId: v.string(),
        name: v.string(),
        mimeType: v.string(),
        parentFolderId: v.optional(v.string()),
        size: v.optional(v.number()),
        modifiedTime: v.string(),
        md5Checksum: v.optional(v.string()),
        headRevisionId: v.optional(v.string()),
        webViewLink: v.optional(v.string()),
      }),
    ),
    queueSettling: v.boolean(),
    syncedAt: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const f of args.files) {
      const meta = {
        name: f.name,
        mimeType: f.mimeType,
        parentFolderId: f.parentFolderId,
        size: f.size,
        modifiedTime: f.modifiedTime,
        md5Checksum: f.md5Checksum,
        headRevisionId: f.headRevisionId,
        webViewLink: f.webViewLink,
        trashed: false,
        lastSyncedAt: args.syncedAt,
      };
      const existing = await ctx.db
        .query("driveFiles")
        .withIndex("by_drive_id", (q) => q.eq("driveFileId", f.driveFileId))
        .first();
      if (!existing) {
        await ctx.db.insert("driveFiles", {
          driveFileId: f.driveFileId,
          ...meta,
          extractionStatus: "none",
        });
        continue;
      }
      const checksumChanged = existing.md5Checksum !== f.md5Checksum;
      const dirty =
        args.queueSettling &&
        checksumChanged &&
        existing.documentId !== undefined && // imported files only
        f.md5Checksum !== undefined;
      if (dirty) {
        await ctx.db.patch(existing._id, {
          ...meta,
          extractionStatus: "settling",
          extractionError: undefined,
          settleAfter: now + SETTLE_MS, // pushed on every change
          firstDirtyAt: existing.firstDirtyAt ?? now, // never pushed out
        });
      } else {
        await ctx.db.patch(existing._id, meta);
      }

      // Live library metadata + un-trash self-healing for imported files.
      if (existing.documentId) {
        const doc = await ctx.db.get(existing.documentId);
        if (doc) {
          const docPatch: Record<string, unknown> = {};
          if (doc.fileName !== f.name) docPatch.fileName = f.name;
          if (f.webViewLink !== undefined && doc.driveWebViewLink !== f.webViewLink) {
            docPatch.driveWebViewLink = f.webViewLink;
          }
          if (f.size !== undefined && doc.fileSize !== f.size) {
            docPatch.fileSize = f.size;
          }
          // documents.savedAt tracks Drive's modifiedTime so the library can
          // show a "last updated" timestamp for Drive rows without joining
          // driveFiles. Only stamp it alongside a real content-metadata change
          // (name/size/link) — keeps savedAt = last-updated, not last-polled.
          // Sort safety: FileList sorts client-side on uploadedAt/name/size,
          // never savedAt, so refreshing savedAt never reorders the list.
          if (
            Object.keys(docPatch).length > 0 &&
            f.modifiedTime &&
            doc.savedAt !== f.modifiedTime
          ) {
            docPatch.savedAt = f.modifiedTime;
          }
          if (Object.keys(docPatch).length > 0) {
            await ctx.db.patch(doc._id, docPatch);
          }
          if (existing.trashed === true) {
            // The walk/poll sees the file again after a trash — un-delete.
            await propagateDriveTrashToDocument(ctx, doc, false);
          }
        }
      }
    }
  },
});

// Mark mirror rows trashed by Drive id (folder or file — checks both
// tables; no-ops on ids we never mirrored). Used for removed/trashed
// changes and for items that moved out of scope (left the corpus).
// Imported files propagate the trash to their documents row (soft delete).
export const markTrashedInternal = internalMutation({
  args: { driveIds: v.array(v.string()), syncedAt: v.string() },
  handler: async (ctx, args) => {
    for (const id of args.driveIds) {
      const folder = await ctx.db
        .query("driveFolders")
        .withIndex("by_drive_id", (q) => q.eq("driveFolderId", id))
        .first();
      if (folder && folder.trashed !== true) {
        await ctx.db.patch(folder._id, { trashed: true, lastSyncedAt: args.syncedAt });
      }
      const file = await ctx.db
        .query("driveFiles")
        .withIndex("by_drive_id", (q) => q.eq("driveFileId", id))
        .first();
      if (file && file.trashed !== true) {
        await ctx.db.patch(file._id, { trashed: true, lastSyncedAt: args.syncedAt });
        if (file.documentId) {
          await propagateDriveTrashToDocument(
            ctx,
            await ctx.db.get(file.documentId),
            true,
          );
        }
      }
    }
  },
});

// Reconcile sweep: any live mirror row the completed walk did NOT touch
// (lastSyncedAt < walkStart — the walk stamps exactly walkStart) has
// vanished from Drive → trash it. Capped writes per call; the finalize
// step loops until done=true.
export const markUnseenTrashedInternal = internalMutation({
  args: { walkStart: v.string() },
  handler: async (ctx, args): Promise<{ done: boolean; patched: number }> => {
    const cap = 80;
    let patched = 0;
    const folders = await ctx.db.query("driveFolders").collect();
    for (const f of folders) {
      if (f.trashed !== true && f.lastSyncedAt < args.walkStart) {
        await ctx.db.patch(f._id, { trashed: true, lastSyncedAt: args.walkStart });
        if (++patched >= cap) return { done: false, patched };
      }
    }
    const files = await ctx.db.query("driveFiles").collect();
    for (const f of files) {
      if (f.trashed !== true && f.lastSyncedAt < args.walkStart) {
        await ctx.db.patch(f._id, { trashed: true, lastSyncedAt: args.walkStart });
        if (f.documentId) {
          await propagateDriveTrashToDocument(
            ctx,
            await ctx.db.get(f.documentId),
            true,
          );
        }
        if (++patched >= cap) return { done: false, patched };
      }
    }
    return { done: true, patched };
  },
});

// ── A. Changes poll (cron, every 2 min) ──────────────────────────

export const pollChanges = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ status: string; pages?: number; changes?: number }> => {
    const token: any = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) return { status: "no_connection" };
    if (token.needsReconnect) return { status: "needs_reconnect" };
    if (!token.rootFolderId) return { status: "no_root_folder" };
    if (!token.startPageToken) return { status: "no_watermark" }; // backfill not run yet

    // Overlap lease: a slow tick must not be overlapped by the next cron
    // fire. 90s < the 2-min interval, so a crashed tick self-heals.
    if (
      typeof token.lastPollStartedAt === "number" &&
      Date.now() - token.lastPollStartedAt < LEASE_MS
    ) {
      return { status: "lease_held" };
    }
    await ctx.runMutation(internal.driveTokens.stampPollStarted, { at: Date.now() });

    const accessToken = await ensureAccessToken(ctx, token);
    if (!accessToken) return { status: "refresh_failed" };
    const rootFolderId: string = token.rootFolderId;

    // In-memory folder map for scope walks + path computation, kept live as
    // this tick upserts folders. Plus a per-tick negative cache so repeated
    // out-of-scope subtrees cost nothing after the first walk.
    const folderRows: MirrorFolder[] = await ctx.runQuery(
      internal.driveSync.listAllFoldersInternal,
      {},
    );
    const foldersById = new Map<string, MirrorFolder>(
      folderRows.map((r) => [r.driveFolderId, r]),
    );
    const outOfScope = new Set<string>();

    // Walk a folder's parent chain to the root, fetching unknown ancestors
    // from the API (bounded). Newly discovered in-scope ancestors are queued
    // for upsert (top-down, with computed paths) and added to the map, so a
    // later resolveFolderScope over the map answers hydration too.
    const pendingFolderUpserts: Array<{
      driveFolderId: string;
      name: string;
      parentFolderId?: string;
      path: string;
    }> = [];
    async function resolveScopeWithFetch(startFolderId: string): Promise<boolean> {
      const chain: Array<{ id: string; name: string; parentId?: string }> = [];
      let current: string | undefined = startFolderId;
      let lookups = 0;
      for (let depth = 0; depth < 64 && current; depth++) {
        if (outOfScope.has(current)) {
          for (const c of chain) outOfScope.add(c.id);
          return false;
        }
        if (foldersById.has(current) || current === rootFolderId) {
          // Anchored. Upsert any newly discovered ancestors top-down.
          let parentPath = foldersById.get(current)?.path ?? "/";
          let parentId: string = current;
          for (let i = chain.length - 1; i >= 0; i--) {
            const c = chain[i];
            const path = childPath(parentPath, c.name);
            pendingFolderUpserts.push({
              driveFolderId: c.id,
              name: c.name,
              parentFolderId: parentId,
              path,
            });
            foldersById.set(c.id, {
              driveFolderId: c.id,
              name: c.name,
              parentFolderId: parentId,
              path,
            });
            parentPath = path;
            parentId = c.id;
          }
          return true;
        }
        if (lookups >= MAX_ANCESTOR_LOOKUPS) {
          // Give up cheaply; the nightly reconcile walk will pick it up.
          for (const c of chain) outOfScope.add(c.id);
          outOfScope.add(current);
          return false;
        }
        lookups++;
        const r = await driveGet(
          accessToken!,
          `/files/${encodeURIComponent(current)}?fields=id,name,mimeType,parents,trashed&supportsAllDrives=true`,
        );
        if (!r.ok || r.data?.mimeType !== FOLDER_MIME || r.data?.trashed === true) {
          for (const c of chain) outOfScope.add(c.id);
          outOfScope.add(current);
          return false;
        }
        const nextParent: string | undefined = r.data?.parents?.[0];
        chain.push({ id: current, name: r.data.name, parentId: nextParent });
        if (!nextParent) {
          // Not the root and no parent → outside the corpus.
          for (const c of chain) outOfScope.add(c.id);
          return false;
        }
        current = nextParent;
      }
      for (const c of chain) outOfScope.add(c.id);
      return false;
    }

    // Flush helper — chunked so each mutation stays well under ~100 writes.
    async function flush(batch: {
      folders: Array<{ driveFolderId: string; name: string; parentFolderId?: string; path: string }>;
      pathPatches: Array<{ driveFolderId: string; path: string }>;
      files: Array<any>;
      trashIds: string[];
      syncedAt: string;
    }) {
      for (let i = 0; i < batch.folders.length; i += MUTATION_CHUNK) {
        await ctx.runMutation(internal.driveSync.upsertFoldersInternal, {
          folders: batch.folders.slice(i, i + MUTATION_CHUNK),
          syncedAt: batch.syncedAt,
        });
      }
      for (let i = 0; i < batch.pathPatches.length; i += MUTATION_CHUNK) {
        await ctx.runMutation(internal.driveSync.patchFolderPathsInternal, {
          updates: batch.pathPatches.slice(i, i + MUTATION_CHUNK),
          syncedAt: batch.syncedAt,
        });
      }
      for (let i = 0; i < batch.files.length; i += MUTATION_CHUNK) {
        await ctx.runMutation(internal.driveSync.upsertFilesInternal, {
          files: batch.files.slice(i, i + MUTATION_CHUNK),
          queueSettling: true,
          syncedAt: batch.syncedAt,
        });
      }
      // Trash marks may touch 2 rows each (folder + file lookup).
      for (let i = 0; i < batch.trashIds.length; i += 40) {
        await ctx.runMutation(internal.driveSync.markTrashedInternal, {
          driveIds: batch.trashIds.slice(i, i + 40),
          syncedAt: batch.syncedAt,
        });
      }
    }

    let pageToken: string = token.startPageToken;
    let pages = 0;
    let totalChanges = 0;

    while (pages < MAX_PAGES_PER_TICK) {
      const qs = new URLSearchParams({
        pageToken,
        pageSize: "200",
        includeRemoved: "true",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        fields: CHANGES_FIELDS,
      });
      const r = await driveGet(accessToken, `/changes?${qs.toString()}`);
      if (r.status === 410) {
        // Watermark expired — the mirror must be reseeded from a fresh walk.
        await ctx.scheduler.runAfter(0, internal.driveSync.backfillWalk, {
          queue: [rootFolderId],
          phase: "walk" as const,
          mode: "backfill" as const,
          walkStart: new Date().toISOString(),
        });
        return { status: "reseed", pages };
      }
      if (!r.ok) return { status: `changes_error_${r.status}`, pages };

      const syncedAt = new Date().toISOString();
      const changes: any[] = r.data?.changes ?? [];
      const batch = {
        folders: [] as Array<{ driveFolderId: string; name: string; parentFolderId?: string; path: string }>,
        pathPatches: [] as Array<{ driveFolderId: string; path: string }>,
        files: [] as any[],
        trashIds: [] as string[],
        syncedAt,
      };

      for (const change of changes) {
        if (change?.changeType && change.changeType !== "file") continue;
        const fileId: string | undefined = change?.fileId;
        const file = change?.file;
        if (!fileId) continue;

        // Removed or trashed → mark the mirror row if we have one.
        if (change.removed === true || file?.trashed === true) {
          batch.trashIds.push(fileId);
          continue;
        }
        if (!file) continue;
        if (file.mimeType === SHORTCUT_MIME) {
          console.log(`[driveSync] skipping shortcut ${file.name} (${fileId})`);
          continue;
        }

        // Scope: in-scope iff the parents[0] chain reaches the root (or the
        // item IS the root). A move OUT of scope trashes any existing row —
        // the item left the corpus.
        const isRoot = fileId === rootFolderId;
        const parentId: string | undefined = file.parents?.[0];
        let inScope = isRoot;
        if (!isRoot && parentId) {
          inScope = await resolveScopeWithFetch(parentId);
        }
        if (!inScope) {
          if (foldersById.has(fileId) || file.mimeType !== FOLDER_MIME) {
            batch.trashIds.push(fileId);
          }
          continue;
        }

        if (file.mimeType === FOLDER_MIME) {
          // Folder upsert + path maintenance. The parent is always resolvable
          // after resolveScopeWithFetch — except the root itself, which may
          // predate its mirror row on a manually seeded watermark; fall back
          // to the root path.
          const parentRow = isRoot ? undefined : foldersById.get(parentId!);
          const newPath = isRoot
            ? "/"
            : childPath(parentRow?.path ?? "/", file.name);
          const prev = foldersById.get(fileId);
          batch.folders.push({
            driveFolderId: fileId,
            name: file.name,
            parentFolderId: isRoot ? undefined : parentId,
            path: newPath,
          });
          foldersById.set(fileId, {
            driveFolderId: fileId,
            name: file.name,
            parentFolderId: isRoot ? undefined : parentId,
            path: newPath,
            clientId: prev?.clientId,
          });
          // Rename/move → recompute materialized paths on DESCENDANT folder
          // rows (files carry no path). BFS over the in-memory map.
          if (prev && (prev.name !== file.name || prev.parentFolderId !== (isRoot ? undefined : parentId) || prev.path !== newPath)) {
            const childrenByParent = new Map<string, MirrorFolder[]>();
            for (const row of foldersById.values()) {
              if (!row.parentFolderId) continue;
              const list = childrenByParent.get(row.parentFolderId) ?? [];
              list.push(row);
              childrenByParent.set(row.parentFolderId, list);
            }
            const stack: Array<{ id: string; parentPath: string }> = [
              { id: fileId, parentPath: newPath },
            ];
            while (stack.length > 0) {
              const { id, parentPath } = stack.pop()!;
              for (const child of childrenByParent.get(id) ?? []) {
                const childNewPath = childPath(parentPath, child.name);
                if (child.path !== childNewPath) {
                  child.path = childNewPath;
                  batch.pathPatches.push({
                    driveFolderId: child.driveFolderId,
                    path: childNewPath,
                  });
                }
                stack.push({ id: child.driveFolderId, parentPath: childNewPath });
              }
            }
          }
        } else {
          // File upsert. Whether a changed checksum queues extraction is
          // decided inside upsertFilesInternal: imported files only
          // (driveFiles.documentId set) — folder mappings alone never queue.
          batch.files.push({
            driveFileId: fileId,
            name: file.name,
            mimeType: file.mimeType,
            parentFolderId: parentId,
            size: file.size !== undefined ? Number(file.size) : undefined,
            modifiedTime: file.modifiedTime ?? syncedAt,
            md5Checksum: file.md5Checksum,
            headRevisionId: file.headRevisionId,
            webViewLink: file.webViewLink,
          });
        }
      }

      // Ancestors discovered during scope walks get persisted with this page.
      if (pendingFolderUpserts.length > 0) {
        batch.folders.unshift(...pendingFolderUpserts.splice(0));
      }
      await flush(batch);
      totalChanges += changes.length;
      pages++;

      // CRITICAL — lossless watermark: persist exactly where processing
      // stopped, only AFTER this page's writes landed. If the tick dies or
      // hits the page cap, the next tick resumes from here; nothing skips.
      const next: string | undefined =
        r.data?.nextPageToken ?? r.data?.newStartPageToken;
      if (next) {
        await ctx.runMutation(internal.driveTokens.updateSyncWatermark, {
          startPageToken: next,
        });
      }
      if (!r.data?.nextPageToken) {
        return { status: "ok", pages, changes: totalChanges };
      }
      pageToken = r.data.nextPageToken;
    }

    return { status: "page_cap", pages, changes: totalChanges };
  },
});

// ── B/C. Tree walk (backfill seed/reseed + nightly reconcile) ────
//
// Scheduler-chained BFS: each invocation pops up to 5 folders off the queue,
// lists their children, upserts folders (enqueueing subfolders) and files,
// then chains. Every row the walk touches gets lastSyncedAt = walkStart, so
// the reconcile finalize can trash anything the walk didn't see — but ONLY
// after the chain completed fully (finalize is only ever scheduled once the
// queue drains).
//
//  - mode "backfill": seeds/reseeds the mirror. FIRST fetches a fresh
//    changes startPageToken and stashes it, so changes landing during the
//    walk are replayed by the poller afterwards (upserts are idempotent).
//    New files land as extractionStatus "none" — extraction is queued only
//    by an explicit import (importDriveFiles/importDriveFolder); do NOT
//    mass-queue settling during backfill. Existing rows get metadata-only
//    updates (extraction state preserved).
//  - mode "reconcile": same walk as a diff. Changed checksums on IMPORTED
//    files follow the normal settling rules; unseen rows are trashed in
//    finalize.

export const backfillWalk = internalAction({
  args: {
    queue: v.array(v.string()), // folderIds pending
    phase: v.union(v.literal("walk"), v.literal("finalize")),
    mode: v.union(v.literal("backfill"), v.literal("reconcile")),
    walkStart: v.string(), // ISO — stamped as lastSyncedAt on touched rows
    rootProcessed: v.optional(v.boolean()),
    retries: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ status: string; queued?: number }> => {
    const token: any = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) return { status: "no_connection" };
    if (token.needsReconnect) return { status: "needs_reconnect" };
    if (!token.rootFolderId) return { status: "no_root_folder" };
    const rootFolderId: string = token.rootFolderId;

    // Finalize: reconcile sweeps unseen rows, both modes stamp lastSyncAt.
    if (args.phase === "finalize") {
      if (args.mode === "reconcile") {
        for (let i = 0; i < 200; i++) {
          const r: { done: boolean; patched: number } = await ctx.runMutation(
            internal.driveSync.markUnseenTrashedInternal,
            { walkStart: args.walkStart },
          );
          if (r.done) break;
        }
      }
      await ctx.runMutation(internal.driveTokens.stampLastSyncAt, {});
      console.log(`[driveSync] ${args.mode} walk complete (started ${args.walkStart})`);
      return { status: "complete" };
    }

    const accessToken = await ensureAccessToken(ctx, token);
    if (!accessToken) return { status: "refresh_failed" };

    // Transient Drive errors retry the whole invocation (idempotent) with a
    // short backoff rather than killing the chain; three strikes aborts.
    const retry = async (why: string): Promise<{ status: string }> => {
      const retries = args.retries ?? 0;
      if (retries >= 3) {
        console.error(`[driveSync] ${args.mode} walk aborted after retries: ${why}`);
        return { status: `walk_error_${why}` };
      }
      await ctx.scheduler.runAfter(30_000, internal.driveSync.backfillWalk, {
        queue: args.queue,
        phase: args.phase,
        mode: args.mode,
        walkStart: args.walkStart,
        rootProcessed: args.rootProcessed,
        retries: retries + 1,
      });
      return { status: "retrying" };
    };

    // First invocation: (backfill) stash a fresh changes watermark BEFORE
    // walking, then give the root itself a mirror row (path "/") — stamped
    // with walkStart so the reconcile sweep never counts the root as unseen.
    if (!args.rootProcessed) {
      if (args.mode === "backfill") {
        const seed = await driveGet(
          accessToken,
          `/changes/startPageToken?supportsAllDrives=true`,
        );
        if (!seed.ok || !seed.data?.startPageToken) {
          return retry(`seed_token_${seed.status}`);
        }
        await ctx.runMutation(internal.driveTokens.setStartPageTokenInternal, {
          startPageToken: String(seed.data.startPageToken),
        });
      }
      const rootRes = await driveGet(
        accessToken,
        `/files/${encodeURIComponent(rootFolderId)}?fields=id,name,mimeType&supportsAllDrives=true`,
      );
      if (!rootRes.ok) return retry(`root_fetch_${rootRes.status}`);
      await ctx.runMutation(internal.driveSync.upsertFoldersInternal, {
        folders: [
          { driveFolderId: rootFolderId, name: rootRes.data.name ?? "ROCKCAP Historic Drive", path: "/" },
        ],
        syncedAt: args.walkStart,
      });
    }

    // Folder map: paths for children. Every
    // queued folder was upserted by a previous invocation (or the root init
    // above), so its path is always resolvable.
    const folderRows: MirrorFolder[] = await ctx.runQuery(
      internal.driveSync.listAllFoldersInternal,
      {},
    );
    const foldersById = new Map<string, MirrorFolder>(
      folderRows.map((r) => [r.driveFolderId, r]),
    );

    const batchIds = args.queue.slice(0, FOLDERS_PER_WALK_INVOCATION);
    const rest = args.queue.slice(FOLDERS_PER_WALK_INVOCATION);

    for (const folderId of batchIds) {
      const parentRow = foldersById.get(folderId);
      if (!parentRow) {
        console.log(`[driveSync] walk: folder ${folderId} missing from mirror, skipping`);
        continue;
      }
      let pageToken: string | undefined;
      do {
        const qs = new URLSearchParams({
          q: `'${folderId}' in parents and trashed=false`,
          pageSize: "1000",
          supportsAllDrives: "true",
          includeItemsFromAllDrives: "true",
          fields: FILE_LIST_FIELDS,
        });
        if (pageToken) qs.set("pageToken", pageToken);
        const r = await driveGet(accessToken, `/files?${qs.toString()}`);
        if (!r.ok) return retry(`list_${r.status}`);

        const folderUpserts: Array<{
          driveFolderId: string;
          name: string;
          parentFolderId?: string;
          path: string;
        }> = [];
        const fileUpserts: any[] = [];
        for (const f of r.data?.files ?? []) {
          if (!f?.id) continue;
          if (f.mimeType === SHORTCUT_MIME) {
            console.log(`[driveSync] skipping shortcut ${f.name} (${f.id})`);
            continue;
          }
          if (f.mimeType === FOLDER_MIME) {
            const path = childPath(parentRow.path, f.name);
            folderUpserts.push({
              driveFolderId: f.id,
              name: f.name,
              parentFolderId: folderId,
              path,
            });
            foldersById.set(f.id, {
              driveFolderId: f.id,
              name: f.name,
              parentFolderId: folderId,
              path,
              clientId: foldersById.get(f.id)?.clientId,
            });
            rest.push(f.id); // enqueue subfolder for a later invocation
          } else {
            fileUpserts.push({
              driveFileId: f.id,
              name: f.name,
              mimeType: f.mimeType,
              parentFolderId: folderId,
              size: f.size !== undefined ? Number(f.size) : undefined,
              modifiedTime: f.modifiedTime ?? args.walkStart,
              md5Checksum: f.md5Checksum,
              headRevisionId: f.headRevisionId,
              webViewLink: f.webViewLink,
            });
          }
        }

        for (let i = 0; i < folderUpserts.length; i += MUTATION_CHUNK) {
          await ctx.runMutation(internal.driveSync.upsertFoldersInternal, {
            folders: folderUpserts.slice(i, i + MUTATION_CHUNK),
            syncedAt: args.walkStart,
          });
        }
        for (let i = 0; i < fileUpserts.length; i += MUTATION_CHUNK) {
          await ctx.runMutation(internal.driveSync.upsertFilesInternal, {
            files: fileUpserts.slice(i, i + MUTATION_CHUNK),
            queueSettling: args.mode === "reconcile",
            syncedAt: args.walkStart,
          });
        }
        pageToken = r.data?.nextPageToken;
      } while (pageToken);
    }

    if (rest.length > 0) {
      await ctx.scheduler.runAfter(0, internal.driveSync.backfillWalk, {
        queue: rest,
        phase: "walk" as const,
        mode: args.mode,
        walkStart: args.walkStart,
        rootProcessed: true,
      });
      return { status: "chained", queued: rest.length };
    }
    await ctx.scheduler.runAfter(0, internal.driveSync.backfillWalk, {
      queue: [],
      phase: "finalize" as const,
      mode: args.mode,
      walkStart: args.walkStart,
      rootProcessed: true,
    });
    return { status: "walk_done" };
  },
});

// Kick off the initial backfill (or a manual reseed). Run via
//   npx convex run driveSync:startBackfill
// (a settings-page button arrives in phase 4).
export const startBackfill = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const token: any = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) return { status: "no_connection" };
    if (token.needsReconnect) return { status: "needs_reconnect" };
    if (!token.rootFolderId) return { status: "no_root_folder" };
    await ctx.scheduler.runAfter(0, internal.driveSync.backfillWalk, {
      queue: [token.rootFolderId],
      phase: "walk" as const,
      mode: "backfill" as const,
      walkStart: new Date().toISOString(),
    });
    return { status: "started" };
  },
});

// Public, operator-triggered manual (re)seed for the settings page's "Run
// initial sync" button (phase 4b). The internal `startBackfill` above stays
// internal (cron / `npx convex run`); this thin authenticated wrapper is the
// only UI entry point and simply schedules the SAME walk with the SAME args —
// no change to the walk's behaviour. Progress surfaces in getMirrorStats /
// lastSyncAt while it runs.
export const startBackfillManual = action({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const token: any = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) return { status: "no_connection" };
    if (token.needsReconnect) return { status: "needs_reconnect" };
    if (!token.rootFolderId) return { status: "no_root_folder" };
    await ctx.scheduler.runAfter(0, internal.driveSync.backfillWalk, {
      queue: [token.rootFolderId],
      phase: "walk" as const,
      mode: "backfill" as const,
      walkStart: new Date().toISOString(),
    });
    return { status: "started" };
  },
});

// Nightly reconciliation (cron): re-walk the whole tree and trash any live
// mirror row the walk didn't see. This is the safety net for per-user
// changes-feed gaps on shared-with-me content.
export const reconcileWalk = internalAction({
  args: {},
  handler: async (ctx): Promise<{ status: string }> => {
    const token: any = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) return { status: "no_connection" };
    if (token.needsReconnect) return { status: "needs_reconnect" };
    if (!token.rootFolderId) return { status: "no_root_folder" };
    if (!token.startPageToken) return { status: "not_seeded" }; // backfill hasn't run
    await ctx.scheduler.runAfter(0, internal.driveSync.backfillWalk, {
      queue: [token.rootFolderId],
      phase: "walk" as const,
      mode: "reconcile" as const,
      walkStart: new Date().toISOString(),
    });
    return { status: "started" };
  },
});

// ── Mirror stats (settings page, phase 4 + manual verification) ──

export const getMirrorStats = query({
  args: {},
  handler: async (ctx) => {
    // Same always-on-UI posture as driveTokens.getConnectionStatus: render
    // as empty rather than crash before Clerk's token lands.
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return null;

    const folders = await ctx.db.query("driveFolders").collect();
    const files = await ctx.db.query("driveFiles").collect();

    const byExtractionStatus: Record<string, number> = {
      none: 0,
      settling: 0,
      processing: 0,
      complete: 0,
      error: 0,
    };
    let trashedFiles = 0;
    for (const f of files) {
      byExtractionStatus[f.extractionStatus] =
        (byExtractionStatus[f.extractionStatus] ?? 0) + 1;
      if (f.trashed === true) trashedFiles++;
    }
    let trashedFolders = 0;
    let mappedFolders = 0;
    for (const f of folders) {
      if (f.trashed === true) trashedFolders++;
      if (f.clientId) mappedFolders++;
    }

    return {
      folders: folders.length,
      mappedFolders,
      trashedFolders,
      files: files.length,
      trashedFiles,
      byExtractionStatus,
    };
  },
});

// ── UI-facing browser queries/mutations (phase 4) ────────────────
//
// The docs-area Drive browser drives these. All folder rows fit comfortably
// in memory (the mirror is a disposable cache of one org drive), so each
// query does ONE .collect() on driveFolders and answers scope/path/breadcrumb
// questions over an in-memory Map — the same posture the sync engine uses.

// Clerk-authenticated user resolver for the public MUTATION (writes must be
// attributable; a missing identity is an error, not an empty render). Public
// QUERIES below use getAuthenticatedUserOrNull and render empty instead.
async function requireUser(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  if (!user) throw new Error("User not found");
  return user;
}

// Nearest ancestor clientId (including the folder itself), walking the map.
// Returns the mapped clientId + whether THIS folder carries the mapping.
function effectiveClientOf(
  folderId: string,
  foldersById: Map<string, MirrorFolder>,
): { clientId: string | null; isExplicit: boolean } {
  const self = foldersById.get(folderId);
  const isExplicit = !!self?.clientId;
  let current: string | undefined = folderId;
  for (let depth = 0; depth < 64 && current; depth++) {
    const row = foldersById.get(current);
    if (row?.clientId) return { clientId: row.clientId, isExplicit };
    if (!row) break;
    current = row.parentFolderId;
  }
  return { clientId: null, isExplicit };
}

// 1. Children of a folder (undefined ⇒ the token's root folder), plus the
//    root→here breadcrumb. Each folder row is enriched with its effective
//    client mapping (own clientId, else inherited via ancestor walk).
//
// Auth-free core shared by the public query (listFolderChildren) and the MCP
// internal variant (listFolderChildrenInternal, phase 5). Callers gate auth.
async function computeFolderChildren(
  ctx: any,
  parentFolderId?: string,
): Promise<{
  folders: Array<{
    driveFolderId: string;
    name: string;
    path: string;
    effectiveClientId: string | null;
    isExplicitMapping: boolean;
    effectiveClientName: string | null;
  }>;
  breadcrumb: Array<{ driveFolderId: string; name: string }>;
  notConnected: boolean;
}> {
  const token = await ctx.db.query("googleDriveTokens").first();
  if (!token?.rootFolderId) {
    return { folders: [], breadcrumb: [], notConnected: true };
  }
  const parentId = parentFolderId ?? token.rootFolderId;

  const rows = await ctx.db.query("driveFolders").collect();
  const foldersById = new Map<string, MirrorFolder>(
    rows.map((r: Doc<"driveFolders">) => [
      r.driveFolderId,
      {
        driveFolderId: r.driveFolderId,
        name: r.name,
        parentFolderId: r.parentFolderId,
        path: r.path,
        clientId: r.clientId as string | undefined,
        trashed: r.trashed,
      },
    ]),
  );

  const children = rows
    .filter((r: Doc<"driveFolders">) => r.parentFolderId === parentId && r.trashed !== true)
    .sort((a: Doc<"driveFolders">, b: Doc<"driveFolders">) => a.name.localeCompare(b.name));

  // Resolve client display names for the effective mappings on this page.
  const enriched = children.map((r: Doc<"driveFolders">) => {
    const eff = effectiveClientOf(r.driveFolderId, foldersById);
    return {
      driveFolderId: r.driveFolderId,
      name: r.name,
      path: r.path,
      effectiveClientId: eff.clientId,
      isExplicitMapping: eff.isExplicit,
      effectiveClientName: null as string | null,
    };
  });
  const clientIds = Array.from(
    new Set(enriched.map((e) => e.effectiveClientId).filter(Boolean) as string[]),
  );
  const nameById = new Map<string, string>();
  await Promise.all(
    clientIds.map(async (id) => {
      const c = await ctx.db.get(id as Id<"clients">);
      if (c) nameById.set(id, (c as any).name ?? (c as any).companyName ?? "Client");
    }),
  );
  for (const e of enriched) {
    if (e.effectiveClientId) {
      e.effectiveClientName = nameById.get(e.effectiveClientId) ?? null;
    }
  }

  // Breadcrumb: root → … → parentId (walk up the map, then reverse).
  const breadcrumb: Array<{ driveFolderId: string; name: string }> = [];
  let cur: string | undefined = parentId;
  for (let depth = 0; depth < 64 && cur; depth++) {
    const row = foldersById.get(cur);
    if (!row) break;
    breadcrumb.unshift({ driveFolderId: row.driveFolderId, name: row.name });
    if (cur === token.rootFolderId) break;
    cur = row.parentFolderId;
  }

  return { folders: enriched, breadcrumb, notConnected: false };
}

export const listFolderChildren = query({
  args: { parentFolderId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return { folders: [], breadcrumb: [], notConnected: true as const };
    return computeFolderChildren(ctx, args.parentFolderId);
  },
});

// 2. Files under a folder, paginated by_parent. Trashed rows are filtered out.
//    NOTE: driveFiles has no per-parent modifiedTime index, so this returns
//    rows in index (insertion) order; the browser sorts each loaded page by
//    modifiedTime desc client-side. Shape mirrors replyEvents.listInboundPaginated.
export const listFilesPaginated = query({
  args: { parentFolderId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db
      .query("driveFiles")
      .withIndex("by_parent", (q) => q.eq("parentFolderId", args.parentFolderId))
      .filter((q) => q.neq(q.field("trashed"), true))
      .paginate(args.paginationOpts);

    const page = result.page.map((f) => ({
      _id: f._id,
      driveFileId: f.driveFileId,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink,
      extractionStatus: f.extractionStatus,
      extractionError: f.extractionError,
      documentId: f.documentId,
    }));
    return { ...result, page };
  },
});

// 3. Map (or clear) a folder's client mapping. Mapping ONLY establishes
//    scope/ownership for later imports — it creates no documents rows and
//    queues no extraction (import is the purposeful act; see
//    importDriveFiles/importDriveFolder below). An unmapped 10,000-file
//    historical folder therefore costs nothing, forever.
export const mapFolderToClient = mutation({
  args: {
    driveFolderId: v.string(),
    clientId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const folder = await ctx.db
      .query("driveFolders")
      .withIndex("by_drive_id", (q) => q.eq("driveFolderId", args.driveFolderId))
      .first();
    if (!folder) throw new Error("Folder not found in the Drive mirror");

    // patch with undefined clears the field (Convex removes it).
    await ctx.db.patch(folder._id, { clientId: args.clientId });

    return { ok: true, cleared: args.clientId === undefined };
  },
});

// ── Import — the purposeful act that puts Drive files in the library ──
//
// Importing creates a METADATA-FIRST documents row per file immediately
// (fileName/size/link visible in the library at once; classification fields
// are placeholders) and flips the live link on: from now on the poller
// queues this file for (re-)extraction whenever its content changes —
// driveFiles.documentId presence IS the imported flag. First successful
// extraction fills in the analysis fields and auto-files the document into
// the client's folder taxonomy (driveHydration.applyExtraction); after that
// folderId is app-owned and re-extraction never touches it.

const STAGGER_MS = 90_000; // settleAfter spacing across an import batch
const IMPORT_BATCH_CAP = 200; // importDriveFiles per-call cap
// Folder imports chain through the scheduler: each slice is ~2 writes per
// file (documents insert + driveFiles patch), so 75 files stays under the
// ~150-writes-per-mutation posture (idiom: bulkBackgroundProcessor).
const IMPORT_SLICE = 75;

// Load the whole driveFolders table into the in-memory map every walk-style
// query/mutation uses (the folder table is small by construction).
async function loadFolderMap(ctx: any): Promise<Map<string, MirrorFolder>> {
  const rows = await ctx.db.query("driveFolders").collect();
  return new Map<string, MirrorFolder>(
    rows.map((r: any) => [
      r.driveFolderId,
      {
        driveFolderId: r.driveFolderId,
        name: r.name,
        parentFolderId: r.parentFolderId,
        path: r.path,
        clientId: r.clientId as string | undefined,
        trashed: r.trashed,
      },
    ]),
  );
}

// Full descendant-folder set of a Drive folder (the folder itself included),
// skipping trashed folders. Unlike scope resolution this does NOT stop at
// clientId overrides — an import targets the physical subtree; each file's
// owning client still resolves per-file via resolveFolderScope.
function subtreeFolderIds(
  rootId: string,
  foldersById: Map<string, MirrorFolder>,
): string[] {
  const childrenByParent = new Map<string, MirrorFolder[]>();
  for (const row of foldersById.values()) {
    if (!row.parentFolderId || row.trashed === true) continue;
    const list = childrenByParent.get(row.parentFolderId) ?? [];
    list.push(row);
    childrenByParent.set(row.parentFolderId, list);
  }
  const out: string[] = [rootId];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      out.push(child.driveFolderId);
      stack.push(child.driveFolderId);
    }
  }
  return out;
}

type ImportSkip = { driveFileId: string; reason: string };

// Shared import core (importDriveFiles + importDriveFolder + continuation).
// Per mirror row: validate (not trashed / not already imported / resolves to
// a mapped client), insert the metadata-first documents row, then patch the
// mirror row — documentId always; settling bookkeeping only when the file
// has fetchable content (md5). Google-native files (Docs/Sheets — no md5)
// become permanent links: documents.status "completed", never extracted in
// v1, extractionStatus stays "none".
// `base`+`nextIndex` stagger settleAfter in 90s steps across the WHOLE
// import (chained slices keep counting), so a big import trickles through
// the hydration cron instead of arriving as one thundering herd.
async function importFileRows(
  ctx: any,
  rows: Doc<"driveFiles">[],
  foldersById: Map<string, MirrorFolder>,
  rootFolderId: string,
  base: number,
  startIndex: number,
): Promise<{ imported: number; skipped: ImportSkip[]; nextIndex: number }> {
  const nowIso = new Date().toISOString();
  const clientNames = new Map<string, string | undefined>();
  const skipped: ImportSkip[] = [];
  let imported = 0;
  let index = startIndex;

  for (const row of rows) {
    if (row.trashed === true) {
      skipped.push({ driveFileId: row.driveFileId, reason: "trashed" });
      continue;
    }
    if (row.documentId) {
      skipped.push({ driveFileId: row.driveFileId, reason: "already_imported" });
      continue;
    }
    const scope = row.parentFolderId
      ? resolveFolderScope(row.parentFolderId, foldersById, rootFolderId)
      : { inScope: false, clientId: null, mappedFolderId: null };
    if (!scope.clientId) {
      skipped.push({ driveFileId: row.driveFileId, reason: "no_client_mapping" });
      continue;
    }
    const clientId = scope.clientId as Id<"clients">;
    if (!clientNames.has(clientId)) {
      const client: any = await ctx.db.get(clientId);
      clientNames.set(
        clientId,
        client ? (client.name ?? client.companyName ?? undefined) : undefined,
      );
    }

    const isGoogleNative = row.md5Checksum === undefined;
    const documentId: Id<"documents"> = await ctx.db.insert("documents", {
      fileName: row.name,
      fileSize: row.size ?? 0,
      fileType: row.mimeType,
      uploadedAt: nowIso,
      summary: isGoogleNative
        ? "Google-native file — view in Drive"
        : "Imported from Google Drive — content sync pending",
      fileTypeDetected: "Unclassified",
      category: "Unclassified",
      reasoning:
        "Metadata-first import from Google Drive; classification runs on first extraction.",
      confidence: 0,
      tokensUsed: 0,
      clientId,
      clientName: clientNames.get(clientId),
      scope: "client",
      // Google-native files are links with a Drive preview — terminal state.
      status: isGoogleNative ? "completed" : "pending",
      savedAt: nowIso,
      source: "drive",
      driveFileId: row.driveFileId,
      driveWebViewLink: row.webViewLink,
      // folderId/folderType deliberately unset — the doc lands "unfiled";
      // first extraction stamps the v4 placement into the client taxonomy.
    });

    if (isGoogleNative) {
      await ctx.db.patch(row._id, { documentId });
    } else {
      await ctx.db.patch(row._id, {
        documentId,
        extractionStatus: "settling",
        extractionError: undefined,
        settleAfter: base + index * STAGGER_MS,
        firstDirtyAt: base,
      });
      index++;
    }
    imported++;
  }

  return { imported, skipped, nextIndex: index };
}

// 3a. Import explicit Drive files (operator selection / MCP tool, later
//     phases call this). Capped at 200 per call.
export const importDriveFiles = mutation({
  args: { driveFileIds: v.array(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ imported: number; skipped: ImportSkip[] }> => {
    await requireUser(ctx);
    if (args.driveFileIds.length > IMPORT_BATCH_CAP) {
      throw new Error(
        `Import at most ${IMPORT_BATCH_CAP} files per call (got ${args.driveFileIds.length})`,
      );
    }
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token?.rootFolderId) throw new Error("Google Drive is not connected");

    const foldersById = await loadFolderMap(ctx);
    const skipped: ImportSkip[] = [];
    const rows: Doc<"driveFiles">[] = [];
    for (const id of Array.from(new Set(args.driveFileIds))) {
      const row = await ctx.db
        .query("driveFiles")
        .withIndex("by_drive_id", (q) => q.eq("driveFileId", id))
        .first();
      if (!row) {
        skipped.push({ driveFileId: id, reason: "not_found" });
        continue;
      }
      rows.push(row);
    }

    const res = await importFileRows(
      ctx,
      rows,
      foldersById,
      token.rootFolderId,
      Date.now(),
      0,
    );
    return { imported: res.imported, skipped: [...skipped, ...res.skipped] };
  },
});

// 3b. Import a whole Drive folder subtree. WITHOUT confirm this is a dry
//     run — counts only, zero writes — which is the cost barrier both the
//     UI and the MCP tool surface before an operator commits to a large
//     historical folder. With confirm it imports via the shared core,
//     chaining through the scheduler beyond the first slice.
export const importDriveFolder = mutation({
  args: { driveFolderId: v.string(), confirm: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { dryRun: true; fileCount: number; alreadyImported: number; folders: number }
    | {
        dryRun: false;
        fileCount: number;
        alreadyImported: number;
        imported: number;
        queuedForImport: number;
        skipped: ImportSkip[];
      }
  > => {
    await requireUser(ctx);
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token?.rootFolderId) throw new Error("Google Drive is not connected");

    const foldersById = await loadFolderMap(ctx);
    const folder = foldersById.get(args.driveFolderId);
    if (!folder || folder.trashed === true) {
      throw new Error("Folder not found in the Drive mirror");
    }

    const subtree = subtreeFolderIds(args.driveFolderId, foldersById);
    const candidates: Doc<"driveFiles">[] = [];
    let alreadyImported = 0;
    for (const fid of subtree) {
      const files = await ctx.db
        .query("driveFiles")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", fid))
        .filter((q) => q.neq(q.field("trashed"), true))
        .collect();
      for (const f of files) {
        if (f.documentId) {
          alreadyImported++;
        } else {
          candidates.push(f);
        }
      }
    }

    if (!args.confirm) {
      return {
        dryRun: true as const,
        fileCount: candidates.length,
        alreadyImported,
        folders: subtree.length,
      };
    }

    const base = Date.now();
    const first = candidates.slice(0, IMPORT_SLICE);
    const rest = candidates.slice(IMPORT_SLICE);
    const res = await importFileRows(
      ctx,
      first,
      foldersById,
      token.rootFolderId,
      base,
      0,
    );
    if (rest.length > 0) {
      await ctx.scheduler.runAfter(0, internal.driveSync.importFolderContinuation, {
        fileIds: rest.map((f) => f._id),
        base,
        startIndex: res.nextIndex,
      });
    }
    return {
      dryRun: false as const,
      fileCount: candidates.length,
      alreadyImported,
      imported: res.imported,
      queuedForImport: rest.length,
      skipped: res.skipped,
    };
  },
});

// Continuation for importDriveFolder beyond the first slice (same scheduler
// chaining idiom as bulkBackgroundProcessor). Re-reads each row — a file
// trashed or imported between slices skips safely inside importFileRows.
export const importFolderContinuation = internalMutation({
  args: {
    fileIds: v.array(v.id("driveFiles")),
    base: v.number(),
    startIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token?.rootFolderId) return;
    const foldersById = await loadFolderMap(ctx);

    const slice = args.fileIds.slice(0, IMPORT_SLICE);
    const rest = args.fileIds.slice(IMPORT_SLICE);
    const rows: Doc<"driveFiles">[] = [];
    for (const id of slice) {
      const row = await ctx.db.get(id);
      if (row) rows.push(row);
    }
    const res = await importFileRows(
      ctx,
      rows,
      foldersById,
      token.rootFolderId,
      args.base,
      args.startIndex,
    );
    if (rest.length > 0) {
      await ctx.scheduler.runAfter(0, internal.driveSync.importFolderContinuation, {
        fileIds: rest,
        base: args.base,
        startIndex: res.nextIndex,
      });
    }
  },
});

// 3c. Subtree listing for the import picker (phase 4b UI): every non-trashed
//     file under the folder with its imported flag and display path. Capped
//     at 500 rows; `truncated` tells the picker to fall back to
//     import-the-whole-folder instead of per-file selection.
export const listImportCandidates = query({
  args: { driveFolderId: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return { files: [], truncated: false };

    const foldersById = await loadFolderMap(ctx);
    if (!foldersById.has(args.driveFolderId)) return { files: [], truncated: false };

    const subtree = subtreeFolderIds(args.driveFolderId, foldersById);
    const files: Array<{
      driveFileId: string;
      name: string;
      mimeType: string;
      size: number | undefined;
      modifiedTime: string;
      imported: boolean;
      path: string;
    }> = [];
    let truncated = false;

    outer: for (const fid of subtree) {
      const rows = await ctx.db
        .query("driveFiles")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", fid))
        .filter((q) => q.neq(q.field("trashed"), true))
        .collect();
      const folderPath = foldersById.get(fid)?.path ?? "/";
      for (const f of rows) {
        if (files.length >= 500) {
          truncated = true;
          break outer;
        }
        files.push({
          driveFileId: f.driveFileId,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime,
          imported: f.documentId !== undefined,
          path: childPath(folderPath, f.name),
        });
      }
    }

    return { files, truncated };
  },
});

// 4. Files currently in extraction error, with a computed path for display.
export const listExtractionErrors = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return [];

    const errored = await ctx.db
      .query("driveFiles")
      .withIndex("by_extraction_status", (q) => q.eq("extractionStatus", "error"))
      .collect();
    if (errored.length === 0) return [];

    const rows = await ctx.db.query("driveFolders").collect();
    const pathById = new Map<string, string>(
      rows.map((r) => [r.driveFolderId, r.path]),
    );

    return errored
      .filter((f) => f.trashed !== true)
      .map((f) => {
        const folderPath = f.parentFolderId ? pathById.get(f.parentFolderId) : undefined;
        const path =
          folderPath && folderPath !== "/"
            ? `${folderPath}/${f.name}`
            : `/${f.name}`;
        return {
          driveFileId: f.driveFileId,
          name: f.name,
          path,
          extractionError: f.extractionError ?? null,
        };
      });
  },
});

// 5. Active, non-deleted clients for the folder-mapping picker. Explicit
//    status filter — clients.list does NOT default-filter by status.
export const getActiveClientsForMapping = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthenticatedUserOrNull(ctx);
    if (!user) return [];

    const clients = await ctx.db
      .query("clients")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    return clients
      .map((c) => ({ _id: c._id, name: c.name ?? c.companyName ?? "Client" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ── Phase 5 — MCP internal variants ──────────────────────────────
//
// The `drive.*` MCP tool surface (convex/mcp.ts) authenticates via per-user
// bearer token, NOT a Clerk session — so ctx.auth is empty and the public
// queries/mutations above (which requireUser / getAuthenticatedUserOrNull)
// would either throw or render empty. These internal* variants carry the
// SAME behaviour with the auth gate removed; the bearer-token check upstream
// (convex/mcp.ts) is the trust boundary. Imports have no per-user side effect
// (importFileRows never reads the user), so the internal mutations are exact
// behavioural twins of their public counterparts. Do NOT expose these to the
// browser — they are internal.* by design.

// drive.status — connection status (safe fields only; never the OAuth tokens)
// + mirror stats, in one call.
export const getStatusForMcpInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const token = await ctx.db.query("googleDriveTokens").first();
    const connection = token
      ? {
          connected: true as const,
          connectedEmail: token.connectedEmail,
          connectedAt: token.connectedAt,
          lastSyncAt: token.lastSyncAt,
          needsReconnect: token.needsReconnect === true,
          scope: token.scope,
          rootFolderId: token.rootFolderId,
          rootFolderName: token.rootFolderName,
        }
      : { connected: false as const };

    const folders = await ctx.db.query("driveFolders").collect();
    const files = await ctx.db.query("driveFiles").collect();
    const byExtractionStatus: Record<string, number> = {
      none: 0,
      settling: 0,
      processing: 0,
      complete: 0,
      error: 0,
    };
    let trashedFiles = 0;
    let importedFiles = 0;
    for (const f of files) {
      byExtractionStatus[f.extractionStatus] =
        (byExtractionStatus[f.extractionStatus] ?? 0) + 1;
      if (f.trashed === true) trashedFiles++;
      if (f.documentId) importedFiles++;
    }
    let trashedFolders = 0;
    let mappedFolders = 0;
    for (const f of folders) {
      if (f.trashed === true) trashedFolders++;
      if (f.clientId) mappedFolders++;
    }

    return {
      connection,
      mirror: {
        folders: folders.length,
        mappedFolders,
        trashedFolders,
        files: files.length,
        importedFiles,
        trashedFiles,
        byExtractionStatus,
      },
    };
  },
});

// drive.listFolders — child folders + breadcrumb + effective client mapping.
export const listFolderChildrenInternal = internalQuery({
  args: { parentFolderId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return computeFolderChildren(ctx, args.parentFolderId);
  },
});

// drive.listFiles — files under one folder (subtree=false) or its whole
// subtree (subtree=true, listImportCandidates-style, capped at 500 with a
// `truncated` flag). Both modes skip trashed rows and surface the import +
// extraction state per file.
export const listFilesForMcpInternal = internalQuery({
  args: { folderId: v.string(), subtree: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const foldersById = await loadFolderMap(ctx);
    if (!foldersById.has(args.folderId)) {
      return { files: [], truncated: false, subtree: args.subtree === true };
    }

    const folderIds = args.subtree
      ? subtreeFolderIds(args.folderId, foldersById)
      : [args.folderId];

    const files: Array<{
      driveFileId: string;
      name: string;
      mimeType: string;
      size: number | undefined;
      modifiedTime: string;
      imported: boolean;
      extractionStatus: string;
      documentId: Id<"documents"> | undefined;
      path: string;
    }> = [];
    let truncated = false;

    outer: for (const fid of folderIds) {
      const rows = await ctx.db
        .query("driveFiles")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", fid))
        .filter((q) => q.neq(q.field("trashed"), true))
        .collect();
      const folderPath = foldersById.get(fid)?.path ?? "/";
      for (const f of rows) {
        if (files.length >= 500) {
          truncated = true;
          break outer;
        }
        files.push({
          driveFileId: f.driveFileId,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          modifiedTime: f.modifiedTime,
          imported: f.documentId !== undefined,
          extractionStatus: f.extractionStatus,
          documentId: f.documentId,
          path: childPath(folderPath, f.name),
        });
      }
    }

    return { files, truncated, subtree: args.subtree === true };
  },
});

// drive.getFile — the full mirror row for one file + linked documentId +
// webViewLink + effective client scope (resolved through the folder map).
export const getFileForMcpInternal = internalQuery({
  args: { driveFileId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("driveFiles")
      .withIndex("by_drive_id", (q) => q.eq("driveFileId", args.driveFileId))
      .first();
    if (!row) return null;

    const token = await ctx.db.query("googleDriveTokens").first();
    const foldersById = await loadFolderMap(ctx);
    const scope =
      row.parentFolderId && token?.rootFolderId
        ? resolveFolderScope(row.parentFolderId, foldersById, token.rootFolderId)
        : { inScope: false, clientId: null, mappedFolderId: null };

    let clientName: string | null = null;
    if (scope.clientId) {
      const c: any = await ctx.db.get(scope.clientId as Id<"clients">);
      if (c) clientName = c.name ?? c.companyName ?? "Client";
    }

    return {
      driveFileId: row.driveFileId,
      name: row.name,
      mimeType: row.mimeType,
      size: row.size,
      modifiedTime: row.modifiedTime,
      parentFolderId: row.parentFolderId,
      trashed: row.trashed === true,
      md5Checksum: row.md5Checksum,
      webViewLink: row.webViewLink,
      imported: row.documentId !== undefined,
      documentId: row.documentId,
      extractionStatus: row.extractionStatus,
      extractionError: row.extractionError ?? null,
      settleAfter: row.settleAfter,
      effectiveScope: {
        inScope: scope.inScope,
        clientId: scope.clientId,
        clientName,
        mappedFolderId: scope.mappedFolderId,
      },
    };
  },
});

// drive.mapFolderToClient — internal twin of mapFolderToClient (scope only).
export const mapFolderToClientInternal = internalMutation({
  args: { driveFolderId: v.string(), clientId: v.optional(v.id("clients")) },
  handler: async (ctx, args) => {
    const folder = await ctx.db
      .query("driveFolders")
      .withIndex("by_drive_id", (q) => q.eq("driveFolderId", args.driveFolderId))
      .first();
    if (!folder) throw new Error("Folder not found in the Drive mirror");
    await ctx.db.patch(folder._id, { clientId: args.clientId });
    return { ok: true, cleared: args.clientId === undefined };
  },
});

// drive.importFiles — internal twin of importDriveFiles.
export const importDriveFilesInternal = internalMutation({
  args: { driveFileIds: v.array(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ imported: number; skipped: ImportSkip[] }> => {
    if (args.driveFileIds.length > IMPORT_BATCH_CAP) {
      throw new Error(
        `Import at most ${IMPORT_BATCH_CAP} files per call (got ${args.driveFileIds.length})`,
      );
    }
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token?.rootFolderId) throw new Error("Google Drive is not connected");

    const foldersById = await loadFolderMap(ctx);
    const skipped: ImportSkip[] = [];
    const rows: Doc<"driveFiles">[] = [];
    for (const id of Array.from(new Set(args.driveFileIds))) {
      const row = await ctx.db
        .query("driveFiles")
        .withIndex("by_drive_id", (q) => q.eq("driveFileId", id))
        .first();
      if (!row) {
        skipped.push({ driveFileId: id, reason: "not_found" });
        continue;
      }
      rows.push(row);
    }

    const res = await importFileRows(
      ctx,
      rows,
      foldersById,
      token.rootFolderId,
      Date.now(),
      0,
    );
    return { imported: res.imported, skipped: [...skipped, ...res.skipped] };
  },
});

// drive.importFolder — internal twin of importDriveFolder (dry run without
// confirm; chained import with confirm:true).
export const importDriveFolderInternal = internalMutation({
  args: { driveFolderId: v.string(), confirm: v.optional(v.boolean()) },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { dryRun: true; fileCount: number; alreadyImported: number; folders: number }
    | {
        dryRun: false;
        fileCount: number;
        alreadyImported: number;
        imported: number;
        queuedForImport: number;
        skipped: ImportSkip[];
      }
  > => {
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token?.rootFolderId) throw new Error("Google Drive is not connected");

    const foldersById = await loadFolderMap(ctx);
    const folder = foldersById.get(args.driveFolderId);
    if (!folder || folder.trashed === true) {
      throw new Error("Folder not found in the Drive mirror");
    }

    const subtree = subtreeFolderIds(args.driveFolderId, foldersById);
    const candidates: Doc<"driveFiles">[] = [];
    let alreadyImported = 0;
    for (const fid of subtree) {
      const files = await ctx.db
        .query("driveFiles")
        .withIndex("by_parent", (q) => q.eq("parentFolderId", fid))
        .filter((q) => q.neq(q.field("trashed"), true))
        .collect();
      for (const f of files) {
        if (f.documentId) {
          alreadyImported++;
        } else {
          candidates.push(f);
        }
      }
    }

    if (!args.confirm) {
      return {
        dryRun: true as const,
        fileCount: candidates.length,
        alreadyImported,
        folders: subtree.length,
      };
    }

    const base = Date.now();
    const first = candidates.slice(0, IMPORT_SLICE);
    const rest = candidates.slice(IMPORT_SLICE);
    const res = await importFileRows(
      ctx,
      first,
      foldersById,
      token.rootFolderId,
      base,
      0,
    );
    if (rest.length > 0) {
      await ctx.scheduler.runAfter(0, internal.driveSync.importFolderContinuation, {
        fileIds: rest.map((f) => f._id),
        base,
        startIndex: res.nextIndex,
      });
    }
    return {
      dryRun: false as const,
      fileCount: candidates.length,
      alreadyImported,
      imported: res.imported,
      queuedForImport: rest.length,
      skipped: res.skipped,
    };
  },
});
