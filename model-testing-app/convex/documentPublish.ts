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
