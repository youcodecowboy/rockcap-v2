import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api } from "./_generated/api";
import { getAuthenticatedUser } from "./authHelpers";
import { buildDocumentName } from "../src/lib/documentNaming";

// Mutation: Direct upload document with AI analysis
// This bypasses the queue and creates the document immediately
export const uploadDocumentDirect = mutation({
  args: {
    fileStorageId: v.id("_storage"),
    fileName: v.string(),
    fileSize: v.number(),
    fileType: v.string(),
    clientId: v.id("clients"),
    clientName: v.string(),
    projectId: v.optional(v.id("projects")),
    projectName: v.optional(v.string()),
    isBaseDocument: v.boolean(),
    // Analysis results from AI
    summary: v.string(),
    fileTypeDetected: v.string(),
    category: v.string(),
    reasoning: v.string(),
    confidence: v.number(),
    tokensUsed: v.number(),
    extractedData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const uploadedAt = new Date().toISOString();
    
    // Capture authenticated user
    let uploadedBy: Id<"users"> | undefined = undefined;
    try {
      const user = await getAuthenticatedUser(ctx);
      uploadedBy = user._id;
    } catch (error) {
      // If user is not authenticated, uploadedBy will remain undefined
      // This allows for backward compatibility
    }
    
    // Generate document code via the canonical convention
    // e.g. DarkMills_CreditChecklist_V1.0_20260707
    let documentCode: string | undefined = undefined;
    if (args.clientName) {
      // For base documents, don't include project name in code
      const projectNameForCode = args.isBaseDocument ? undefined : args.projectName;
      documentCode = buildDocumentName({
        fileType: args.fileTypeDetected || args.category,
        clientName: args.clientName,
        projectName: projectNameForCode,
        date: uploadedAt,
      });
      
      // Ensure uniqueness
      const existingDocs = await ctx.db.query("documents").filter((q: any) => q.neq(q.field("isDeleted"), true)).collect();
      let finalCode = documentCode;
      let counter = 1;
      while (existingDocs.some(doc => doc.documentCode === finalCode)) {
        finalCode = `${documentCode}-${counter}`;
        counter++;
      }
      documentCode = finalCode;
    }
    
    // Insert document directly
    const documentId = await ctx.db.insert("documents", {
      fileStorageId: args.fileStorageId,
      fileName: args.fileName,
      fileSize: args.fileSize,
      fileType: args.fileType,
      uploadedAt: uploadedAt,
      summary: args.summary,
      fileTypeDetected: args.fileTypeDetected,
      category: args.category,
      reasoning: args.reasoning,
      confidence: args.confidence,
      tokensUsed: args.tokensUsed,
      clientId: args.clientId,
      clientName: args.clientName,
      projectId: args.isBaseDocument ? undefined : args.projectId,
      projectName: args.isBaseDocument ? undefined : args.projectName,
      documentCode: documentCode,
      isBaseDocument: args.isBaseDocument || false,
      extractedData: args.extractedData,
      status: "completed",
      savedAt: uploadedAt,
      uploadedBy: uploadedBy,
    });

    // (Knowledge-bank entry write retired 2026-07-11 — knowledgeBankEntries
    // is read-only legacy data.)
    if (args.clientId) {
      // Meeting extraction: Check if this is a meeting document      // Meeting extraction: Check if this is a meeting document
      const meetingTypes = ['Meeting Minutes', 'Meeting Notes', 'Minutes'];
      const fileTypeLower = args.fileTypeDetected.toLowerCase();
      const fileNameLower = args.fileName.toLowerCase();
      const isMeetingDocument = meetingTypes.some(t => t.toLowerCase() === fileTypeLower) ||
        (fileNameLower.includes('meeting') && (fileNameLower.includes('minutes') || fileNameLower.includes('notes')));

      if (isMeetingDocument) {
        try {
          // Check if job already exists for this document
          const existingJob = await ctx.db
            .query("meetingExtractionJobs")
            .withIndex("by_document", (q) => q.eq("documentId", documentId))
            .first();

          if (!existingJob) {
            await ctx.db.insert("meetingExtractionJobs", {
              documentId,
              clientId: args.clientId,
              projectId: args.projectId,
              fileStorageId: args.fileStorageId,
              documentName: args.fileName,
              status: "pending",
              attempts: 0,
              maxAttempts: 3,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
            // Jobs are processed by /api/process-meeting-queue (handles PDFs properly)
            console.log(`[DirectUpload] 🗓️ Created meeting extraction job for "${args.fileName}"`);
          }
        } catch (error) {
          console.error("[DirectUpload] Failed to create meeting extraction job:", error);
        }
      }
    }

    return documentId;
  },
});

