import { v } from "convex/values";
import {
  query,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
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
const SETTLE_MS = 15 * 60_000; // settling debounce for changed files
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
// refresh failure — callers stop cleanly.
async function ensureAccessToken(ctx: any, token: any): Promise<string | null> {
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
type MirrorFolder = {
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

// Upsert file metadata by driveFileId, stamping extraction bookkeeping:
//  - queueSettling=true (changes poll / reconcile diff): a new-or-changed
//    checksum on a file whose effective scope is mapped (hydrate) enters
//    "settling" — settleAfter pushed forward on EVERY change (debounce),
//    firstDirtyAt preserved from the first dirty moment (starvation guard).
//    An "error" row that changes again resets to settling with the error
//    cleared.
//  - queueSettling=false (initial backfill): new rows land as "none";
//    existing rows get metadata-only updates (a reseed must never downgrade
//    or mass-queue extraction state).
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
        hydrate: v.boolean(), // effective scope has a clientId
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
        const dirty =
          args.queueSettling && f.hydrate && f.md5Checksum !== undefined;
        await ctx.db.insert("driveFiles", {
          driveFileId: f.driveFileId,
          ...meta,
          extractionStatus: dirty ? "settling" : "none",
          settleAfter: dirty ? now + SETTLE_MS : undefined,
          firstDirtyAt: dirty ? now : undefined,
        });
        continue;
      }
      const checksumChanged = existing.md5Checksum !== f.md5Checksum;
      const dirty =
        args.queueSettling &&
        checksumChanged &&
        f.hydrate &&
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
    }
  },
});

// Mark mirror rows trashed by Drive id (folder or file — checks both
// tables; no-ops on ids we never mirrored). Used for removed/trashed
// changes and for items that moved out of scope (left the corpus).
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
          // File upsert. Hydrate iff the nearest ancestor with clientId
          // exists in the (now fully resolved) folder map.
          const scope = resolveFolderScope(parentId!, foldersById, rootFolderId);
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
            hydrate: scope.clientId != null,
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
//    New files land as extractionStatus "none" — initial hydration of mapped
//    folders is triggered later (mapping, phase 4/5, or the operator); do
//    NOT mass-queue settling during backfill. Existing rows get
//    metadata-only updates (extraction state preserved).
//  - mode "reconcile": same walk as a diff. Changed checksums in mapped
//    scopes follow the normal settling rules; unseen rows are trashed in
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

    // Folder map: paths for children + (reconcile) hydrate resolution. Every
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
            const hydrate =
              args.mode === "reconcile" &&
              resolveFolderScope(folderId, foldersById, rootFolderId).clientId != null;
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
              hydrate,
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
