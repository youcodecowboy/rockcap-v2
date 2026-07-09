import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ── Drive-mirror placement authority ──
//
// When a Drive-imported document sits inside a folder whose NAME matches one
// of the app's folders for that document's scope, the client's own Drive
// placement is authoritative curation and wins over content-classification
// placement (resolvePlacement). This is what lets an operator-curated folder
// like "Lender Pack" — which content classification must never auto-target —
// fill up in the app exactly as it is in Drive.
//
// Matching walks the file's ancestor Drive folders child-most first,
// comparing normalized folder names against the project's projectFolders
// (or the client's clientFolders for client-scoped docs). The walk stops at
// the subtree's mapped root (the folder carrying the projectId/clientId
// mapping): names above the mapping boundary belong to Drive organization,
// not the document taxonomy.
//
// Returns null when the document is not Drive-mirrored or no ancestor name
// matches — callers fall back to resolvePlacement.

const normalize = (s: string) => s.trim().toLowerCase();

export async function resolveDriveMirrorFolderKey(
  ctx: MutationCtx,
  doc: {
    driveFileId?: string;
    projectId?: Id<"projects">;
    clientId?: Id<"clients">;
  },
): Promise<{ folderId: string; folderType: "client" | "project" } | null> {
  if (!doc.driveFileId) return null;

  const driveFile = await ctx.db
    .query("driveFiles")
    .withIndex("by_drive_id", (q) => q.eq("driveFileId", doc.driveFileId!))
    .unique();
  if (!driveFile || !driveFile.parentFolderId) return null;

  // Candidate app folders for the document's scope.
  let candidates: Array<{ folderType: string; name: string }>;
  let folderType: "client" | "project";
  if (doc.projectId) {
    candidates = await ctx.db
      .query("projectFolders")
      .withIndex("by_project", (q) => q.eq("projectId", doc.projectId!))
      .collect();
    folderType = "project";
  } else if (doc.clientId) {
    candidates = await ctx.db
      .query("clientFolders")
      .withIndex("by_client", (q) => q.eq("clientId", doc.clientId!))
      .collect();
    folderType = "client";
  } else {
    return null;
  }
  const byName = new Map(candidates.map((f) => [normalize(f.name), f]));

  // Walk ancestors child-most first, up to (and excluding) the mapped root.
  let cursor: string | undefined = driveFile.parentFolderId;
  for (let hops = 0; cursor && hops < 12; hops++) {
    const folder: Doc<"driveFolders"> | null = await ctx.db
      .query("driveFolders")
      .withIndex("by_drive_id", (q) => q.eq("driveFolderId", cursor!))
      .unique();
    if (!folder) return null;
    // Mapping boundary: the project/client-mapped folder itself represents
    // the subtree root (e.g. the "Dark Mills" folder), not a taxonomy folder.
    if (folder.projectId || folder.clientId) return null;
    const hit = byName.get(normalize(folder.name));
    if (hit) return { folderId: hit.folderType, folderType };
    cursor = folder.parentFolderId;
  }
  return null;
}
