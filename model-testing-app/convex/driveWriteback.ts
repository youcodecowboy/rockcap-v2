import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ensureAccessToken, resolveFolderScope, MirrorFolder } from "./driveSync";
import { Id } from "./_generated/dataModel";

// Google Drive write-back (ingestion phase 6 — final).
//
// Drive is the single source of truth for file CONTENTS; the app never
// edits contents. The ONLY writes back to Drive are ORGANIZATIONAL:
//   create_folder — new folder under an existing mirrored parent
//   move_file     — re-parent a file within the corpus
//   rename        — rename a file or folder
//
// Two-layer gate, mirroring gmailSend's send kill-switch pattern:
//   1. driveWriteConfig.isEnabled (singleton; no row = disabled) is checked
//      at QUEUE time in requestWrite — if off, nothing is staged.
//   2. The same switch is RE-CHECKED at EXECUTE time in `execute` — guards
//      a switch flipped off while an approval sat pending (the approved row
//      then lands as execution_failed with a clear reason; Drive untouched).
// On top of both sits the approvals gate: requestWrite only ever creates a
// PENDING approvals row (never autoApprove — repo law: no autonomous
// external action); approvals.executeApproval dispatches to `execute` here
// only after an operator approves.
//
// Echo-guard: on success the executor immediately upserts the written
// resource into the mirror (driveSync's internal upserts, which are
// idempotent by drive id). The next poll tick's change event for our own
// write then hits an upsert that matches current state — harmless by
// construction. File upserts use queueSettling:false (moves/renames don't
// change content, so they must never queue re-extraction).

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS =
  "id,name,mimeType,parents,size,modifiedTime,md5Checksum,headRevisionId,webViewLink,trashed";

// ── Auth helper (same pattern as gmailSend / driveTokens) ────────
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

// Path join, same convention as driveSync: root is "/", children "/Name/...".
function childPath(parentPath: string, name: string): string {
  return parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
}

// ── Kill-switch config (modeled on gmailTokens.getSendConfig /
//    updateSendConfig — the gmailSendConfig toggle pair) ──────────

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("driveWriteConfig")
      .withIndex("by_enabled")
      .first();
    if (!config) {
      return { isEnabled: false, exists: false } as const;
    }
    return {
      isEnabled: config.isEnabled,
      updatedAt: config.updatedAt,
      exists: true,
    } as const;
  },
});

export const setEnabled = mutation({
  args: { isEnabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const existing = await ctx.db
      .query("driveWriteConfig")
      .withIndex("by_enabled")
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        isEnabled: args.isEnabled,
        updatedAt: now,
        updatedBy: user._id,
      });
      return existing._id;
    }
    return ctx.db.insert("driveWriteConfig", {
      isEnabled: args.isEnabled,
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});

// Executor-side re-read of the switch (defense-in-depth; mirrors
// gmailSend.getGlobalSendEnabled).
export const getWriteEnabledInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("driveWriteConfig")
      .withIndex("by_enabled")
      .first();
    return config?.isEnabled === true;
  },
});

// ── Mirror reads for the executor ────────────────────────────────

export const getMirrorFolderInternal = internalQuery({
  args: { driveFolderId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("driveFolders")
      .withIndex("by_drive_id", (q) => q.eq("driveFolderId", args.driveFolderId))
      .first();
  },
});

export const getMirrorFileInternal = internalQuery({
  args: { driveFileId: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("driveFiles")
      .withIndex("by_drive_id", (q) => q.eq("driveFileId", args.driveFileId))
      .first();
  },
});

// ── requestWrite — stage an organizational write as a PENDING approval ──
//
// Queue-time gate: throws (nothing staged) if the kill switch is off or the
// op's args don't validate against the mirror. On success returns the
// approvalId — the write happens ONLY after an operator approves.

const OP = v.union(
  v.literal("create_folder"),
  v.literal("move_file"),
  v.literal("rename"),
);

export const requestWrite = internalMutation({
  args: {
    userId: v.id("users"),
    op: OP,
    // Op-specific shape, validated by hand below for precise error messages:
    //   create_folder: { name, parentFolderId }
    //   move_file:     { driveFileId, newParentFolderId }
    //   rename:        { driveId, newName, kind: "file" | "folder" }
    args: v.any(),
  },
  handler: async (
    ctx,
    { userId, op, args },
  ): Promise<{ approvalId: Id<"approvals">; description: string }> => {
    // 1. Queue-time kill-switch gate. If off, nothing is staged.
    const config = await ctx.db
      .query("driveWriteConfig")
      .withIndex("by_enabled")
      .first();
    if (!config || config.isEnabled !== true) {
      throw new Error(
        "Drive write-back is disabled. Enable it at /settings/drive (Write-back section) before staging Drive organization writes.",
      );
    }

    // 2. Connection sanity — don't stage approvals against a dead connection.
    const token = await ctx.db.query("googleDriveTokens").first();
    if (!token) throw new Error("Google Drive is not connected");
    if (token.needsReconnect === true) {
      throw new Error("Drive token needs reconnect (see /settings/drive)");
    }

    const getFolder = (driveFolderId: string) =>
      ctx.db
        .query("driveFolders")
        .withIndex("by_drive_id", (q) => q.eq("driveFolderId", driveFolderId))
        .first();
    const getFile = (driveFileId: string) =>
      ctx.db
        .query("driveFiles")
        .withIndex("by_drive_id", (q) => q.eq("driveFileId", driveFileId))
        .first();

    // 3. Op-specific validation against the mirror. Also collect the folder
    //    whose scope resolves relatedClientId, and build the human-readable
    //    description for the approvals queue.
    let description: string;
    let normalizedArgs: Record<string, unknown>;
    let scopeFolderId: string | undefined;

    if (op === "create_folder") {
      const name = typeof args?.name === "string" ? args.name.trim() : "";
      const parentFolderId: string | undefined = args?.parentFolderId;
      if (!name) throw new Error("create_folder requires a non-empty name");
      if (!parentFolderId) throw new Error("create_folder requires parentFolderId");
      const parent = await getFolder(parentFolderId);
      if (!parent) {
        throw new Error(
          `Parent folder ${parentFolderId} is not in the Drive mirror — pick a folder from drive.listFolders`,
        );
      }
      if (parent.trashed === true) {
        throw new Error(`Parent folder "${parent.name}" is trashed in Drive`);
      }
      description = `Create folder "${name}" under ${parent.path}`;
      normalizedArgs = { name, parentFolderId };
      scopeFolderId = parentFolderId;
    } else if (op === "move_file") {
      const driveFileId: string | undefined = args?.driveFileId;
      const newParentFolderId: string | undefined = args?.newParentFolderId;
      if (!driveFileId) throw new Error("move_file requires driveFileId");
      if (!newParentFolderId) throw new Error("move_file requires newParentFolderId");
      const file = await getFile(driveFileId);
      if (!file) {
        throw new Error(
          `File ${driveFileId} is not in the Drive mirror — pick a file from drive.listFiles`,
        );
      }
      if (file.trashed === true) {
        throw new Error(`File "${file.name}" is trashed in Drive`);
      }
      const newParent = await getFolder(newParentFolderId);
      if (!newParent) {
        throw new Error(
          `Destination folder ${newParentFolderId} is not in the Drive mirror — pick a folder from drive.listFolders`,
        );
      }
      if (newParent.trashed === true) {
        throw new Error(`Destination folder "${newParent.name}" is trashed in Drive`);
      }
      if (file.parentFolderId === newParentFolderId) {
        throw new Error(`"${file.name}" is already in ${newParent.path}`);
      }
      const oldParent = file.parentFolderId
        ? await getFolder(file.parentFolderId)
        : null;
      description = `Move "${file.name}" from ${oldParent?.path ?? "(unknown)"} to ${newParent.path}`;
      normalizedArgs = { driveFileId, newParentFolderId };
      scopeFolderId = newParentFolderId;
    } else {
      // rename
      const driveId: string | undefined = args?.driveId;
      const newName = typeof args?.newName === "string" ? args.newName.trim() : "";
      const kind: string | undefined = args?.kind;
      if (!driveId) throw new Error("rename requires driveId");
      if (!newName) throw new Error("rename requires a non-empty newName");
      if (kind !== "file" && kind !== "folder") {
        throw new Error('rename requires kind: "file" or "folder"');
      }
      if (kind === "folder") {
        const folder = await getFolder(driveId);
        if (!folder) {
          throw new Error(`Folder ${driveId} is not in the Drive mirror`);
        }
        if (folder.trashed === true) {
          throw new Error(`Folder "${folder.name}" is trashed in Drive`);
        }
        if (!folder.parentFolderId) {
          throw new Error("Refusing to rename the connection root folder");
        }
        if (folder.name === newName) {
          throw new Error(`Folder is already named "${newName}"`);
        }
        description = `Rename folder "${folder.name}" → "${newName}" (${folder.path})`;
        scopeFolderId = driveId;
      } else {
        const file = await getFile(driveId);
        if (!file) {
          throw new Error(`File ${driveId} is not in the Drive mirror`);
        }
        if (file.trashed === true) {
          throw new Error(`File "${file.name}" is trashed in Drive`);
        }
        if (file.name === newName) {
          throw new Error(`File is already named "${newName}"`);
        }
        const parent = file.parentFolderId ? await getFolder(file.parentFolderId) : null;
        description = `Rename file "${file.name}" → "${newName}" (in ${parent?.path ?? "(unknown)"})`;
        scopeFolderId = file.parentFolderId;
      }
      normalizedArgs = { driveId, newName, kind };
    }

    // 4. relatedClientId — the nearest mapped ancestor of the folder the op
    //    lands in (same scope model as hydration). Best-effort: an unmapped
    //    corner of the corpus just leaves the approval unscoped.
    let relatedClientId: Id<"clients"> | undefined;
    if (scopeFolderId && token.rootFolderId) {
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
      const scope = resolveFolderScope(scopeFolderId, map, token.rootFolderId);
      if (scope.clientId) relatedClientId = scope.clientId as Id<"clients">;
    }

    // 5. Stage the PENDING approval. Never autoApprove: an organizational
    //    Drive write is an external action, and repo law routes every one
    //    through explicit operator approval.
    const approvalId: Id<"approvals"> = await ctx.runMutation(
      internal.approvals.internalCreate,
      {
        entityType: "drive_write",
        summary: description,
        draftPayload: { op, args: normalizedArgs, description },
        requestedBy: userId,
        requestSource: "manual",
        requestSourceName: "drive-writeback",
        relatedClientId,
      },
    );
    return { approvalId, description };
  },
});

// ── Drive REST write helpers ─────────────────────────────────────

async function driveRequest(
  accessToken: string,
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<any> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const detail = data?.error?.message ?? (data ? JSON.stringify(data) : "");
    throw new Error(`Drive ${method} ${path.split("?")[0]} failed: ${res.status} ${detail}`.trim());
  }
  return data;
}

// Shape a Drive files resource for driveSync.upsertFilesInternal.
function toMirrorFile(f: any, fallbackModified: string) {
  return {
    driveFileId: f.id as string,
    name: f.name as string,
    mimeType: f.mimeType as string,
    parentFolderId: (f.parents?.[0] as string | undefined) ?? undefined,
    size: f.size !== undefined ? Number(f.size) : undefined,
    modifiedTime: (f.modifiedTime as string | undefined) ?? fallbackModified,
    md5Checksum: f.md5Checksum as string | undefined,
    headRevisionId: f.headRevisionId as string | undefined,
    webViewLink: f.webViewLink as string | undefined,
  };
}

// ── execute — the approvals.executeApproval dispatch target ─────
//
// Runs ONLY after operator approval. Re-checks the kill switch (a throw here
// marks the approval execution_failed with the reason — Drive untouched),
// performs the Drive API call, then echo-guards the result into the mirror.

export const execute = internalAction({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const approval: any = await ctx.runQuery(
      internal.approvals.getApprovalForExecution,
      { approvalId: args.approvalId },
    );
    if (!approval) throw new Error("Approval not found");
    if (approval.entityType !== "drive_write") {
      throw new Error(`Expected drive_write approval, got ${approval.entityType}`);
    }
    const payload: any = approval.draftPayload ?? {};
    const op: string = payload.op;
    const opArgs: any = payload.args ?? {};

    // Execute-time kill-switch re-check (defense-in-depth): the switch may
    // have been flipped off while this approval sat pending, and staged rows
    // can also originate from approval.create (bypassing requestWrite's
    // queue-time gate) — same rationale as gmailSend.performApprovedSend.
    const writeEnabled: boolean = await ctx.runQuery(
      internal.driveWriteback.getWriteEnabledInternal,
      {},
    );
    if (!writeEnabled) {
      throw new Error(
        "Drive write-back is disabled (kill switch). Enable it at /settings/drive and retry.",
      );
    }

    const token: any = await ctx.runQuery(internal.driveTokens.getForSyncInternal, {});
    if (!token) throw new Error("Google Drive is not connected");
    if (token.needsReconnect) throw new Error("Drive token needs reconnect");
    const accessToken = await ensureAccessToken(ctx, token);
    if (!accessToken) {
      throw new Error("Drive token refresh failed — reconnect at /settings/drive");
    }

    const syncedAt = new Date().toISOString();

    switch (op) {
      case "create_folder": {
        const { name, parentFolderId } = opArgs;
        if (!name || !parentFolderId) throw new Error("Malformed create_folder payload");
        const created = await driveRequest(
          accessToken,
          "POST",
          `/files?supportsAllDrives=true&fields=id,name,parents`,
          { name, mimeType: FOLDER_MIME, parents: [parentFolderId] },
        );
        // Echo-guard: mirror the new folder NOW, with its materialized path,
        // so the next poll tick's change event is an idempotent no-op.
        const parent: any = await ctx.runQuery(
          internal.driveWriteback.getMirrorFolderInternal,
          { driveFolderId: parentFolderId },
        );
        const path = childPath(parent?.path ?? "/", created.name);
        await ctx.runMutation(internal.driveSync.upsertFoldersInternal, {
          folders: [
            {
              driveFolderId: created.id,
              name: created.name,
              parentFolderId,
              path,
            },
          ],
          syncedAt,
        });
        return { op, driveFolderId: created.id, name: created.name, path };
      }

      case "move_file": {
        const { driveFileId, newParentFolderId } = opArgs;
        if (!driveFileId || !newParentFolderId) {
          throw new Error("Malformed move_file payload");
        }
        // Fetch CURRENT parents LIVE from Drive — never trust the mirror
        // here. If the file moved in Drive between staging and approval,
        // the mirror's parent is stale and removeParents would silently
        // target the wrong folder, leaving the file multi-parented or the
        // move half-applied.
        const live = await driveRequest(
          accessToken,
          "GET",
          `/files/${encodeURIComponent(driveFileId)}?fields=id,name,parents,trashed&supportsAllDrives=true`,
        );
        if (live.trashed === true) {
          throw new Error(`"${live.name}" is trashed in Drive — refusing to move`);
        }
        const currentParents: string[] = live.parents ?? [];
        if (currentParents.includes(newParentFolderId)) {
          // Already in the destination (moved by someone in Drive since
          // staging). Nothing to write — just resync the mirror row.
          const fresh = await driveRequest(
            accessToken,
            "GET",
            `/files/${encodeURIComponent(driveFileId)}?fields=${FILE_FIELDS}&supportsAllDrives=true`,
          );
          await ctx.runMutation(internal.driveSync.upsertFilesInternal, {
            files: [toMirrorFile(fresh, syncedAt)],
            queueSettling: false,
            syncedAt,
          });
          return {
            op,
            driveFileId,
            noop: true,
            note: "File was already in the destination folder; mirror resynced.",
          };
        }
        const qs = new URLSearchParams({
          addParents: newParentFolderId,
          supportsAllDrives: "true",
          fields: FILE_FIELDS,
        });
        // Only send removeParents when there is something to remove (a
        // shared item can surface with no visible parents).
        if (currentParents.length > 0) {
          qs.set("removeParents", currentParents.join(","));
        }
        const updated = await driveRequest(
          accessToken,
          "PATCH",
          `/files/${encodeURIComponent(driveFileId)}?${qs.toString()}`,
          {},
        );
        // Echo-guard: metadata-only upsert (queueSettling:false — a move
        // changes no content, so it must never queue re-extraction).
        await ctx.runMutation(internal.driveSync.upsertFilesInternal, {
          files: [toMirrorFile(updated, syncedAt)],
          queueSettling: false,
          syncedAt,
        });
        return {
          op,
          driveFileId,
          name: updated.name,
          newParentFolderId,
          removedParents: currentParents,
        };
      }

      case "rename": {
        const { driveId, newName, kind } = opArgs;
        if (!driveId || !newName || (kind !== "file" && kind !== "folder")) {
          throw new Error("Malformed rename payload");
        }
        if (kind === "file") {
          const updated = await driveRequest(
            accessToken,
            "PATCH",
            `/files/${encodeURIComponent(driveId)}?supportsAllDrives=true&fields=${FILE_FIELDS}`,
            { name: newName },
          );
          // Echo-guard: upsertFilesInternal also patches the linked
          // documents row's fileName live for imported files.
          await ctx.runMutation(internal.driveSync.upsertFilesInternal, {
            files: [toMirrorFile(updated, syncedAt)],
            queueSettling: false,
            syncedAt,
          });
          return { op, kind, driveFileId: driveId, name: updated.name };
        }
        // Folder rename: PATCH the name, then recompute the folder's own
        // materialized path AND every descendant folder's path (same BFS the
        // changes poller runs — files carry no path, so only folders patch).
        const updated = await driveRequest(
          accessToken,
          "PATCH",
          `/files/${encodeURIComponent(driveId)}?supportsAllDrives=true&fields=id,name,parents`,
          { name: newName },
        );
        const folders: MirrorFolder[] = await ctx.runQuery(
          internal.driveSync.listAllFoldersInternal,
          {},
        );
        const byId = new Map<string, MirrorFolder>(
          folders.map((f) => [f.driveFolderId, f]),
        );
        const row = byId.get(driveId);
        const parentPath = row?.parentFolderId
          ? byId.get(row.parentFolderId)?.path ?? "/"
          : "/";
        const newPath = childPath(parentPath, updated.name);
        await ctx.runMutation(internal.driveSync.upsertFoldersInternal, {
          folders: [
            {
              driveFolderId: driveId,
              name: updated.name,
              parentFolderId: row?.parentFolderId,
              path: newPath,
            },
          ],
          syncedAt,
        });
        // Descendant path recompute (BFS over the in-memory map).
        if (row) {
          row.name = updated.name;
          row.path = newPath;
          const childrenByParent = new Map<string, MirrorFolder[]>();
          for (const f of folders) {
            if (!f.parentFolderId) continue;
            const list = childrenByParent.get(f.parentFolderId) ?? [];
            list.push(f);
            childrenByParent.set(f.parentFolderId, list);
          }
          const patches: Array<{ driveFolderId: string; path: string }> = [];
          const stack: Array<{ id: string; parentPath: string }> = [
            { id: driveId, parentPath: newPath },
          ];
          while (stack.length > 0) {
            const { id, parentPath: pp } = stack.pop()!;
            for (const child of childrenByParent.get(id) ?? []) {
              const childNewPath = childPath(pp, child.name);
              if (child.path !== childNewPath) {
                child.path = childNewPath;
                patches.push({ driveFolderId: child.driveFolderId, path: childNewPath });
              }
              stack.push({ id: child.driveFolderId, parentPath: childNewPath });
            }
          }
          for (let i = 0; i < patches.length; i += 50) {
            await ctx.runMutation(internal.driveSync.patchFolderPathsInternal, {
              updates: patches.slice(i, i + 50),
              syncedAt,
            });
          }
        }
        return { op, kind, driveFolderId: driveId, name: updated.name, path: newPath };
      }

      default:
        throw new Error(`Unknown drive_write op: ${op}`);
    }
  },
});
