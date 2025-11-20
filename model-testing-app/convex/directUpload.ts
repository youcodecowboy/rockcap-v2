import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper functions for document code generation (same as in documents.ts)
function abbreviateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned.slice(0, maxLength);
}

function abbreviateCategory(category: string): string {
  if (!category) return 'DOC';
  
  const categoryMap: Record<string, string> = {
    'valuation': 'VAL',
    'operating': 'OPR',
    'operating statement': 'OPR',
    'appraisal': 'APP',
    'financial': 'FIN',
    'contract': 'CNT',
    'agreement': 'AGR',
    'invoice': 'INV',
    'report': 'RPT',
    'letter': 'LTR',
    'email': 'EML',
    'note': 'NTE',
    'memo': 'MEM',
    'proposal': 'PRP',
    'quote': 'QTE',
    'receipt': 'RCP',
  };
  
  const categoryLower = category.toLowerCase();
  for (const [key, value] of Object.entries(categoryMap)) {
    if (categoryLower.includes(key)) {
      return value;
    }
  }
  
  return abbreviateText(category, 3);
}

function formatDateDDMMYY(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

function generateDocumentCode(
  clientName: string,
  category: string,
  projectName: string | undefined,
  uploadedAt: string | Date
): string {
  const clientCode = abbreviateText(clientName, 8);
  const typeCode = abbreviateCategory(category);
  const projectCode = projectName ? abbreviateText(projectName, 10) : '';
  const dateCode = formatDateDDMMYY(uploadedAt);
  
  if (projectCode) {
    return `${clientCode}-${typeCode}-${projectCode}-${dateCode}`;
  } else {
    return `${clientCode}-${typeCode}-${dateCode}`;
  }
}

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
    
    // Generate document code
    let documentCode: string | undefined = undefined;
    if (args.clientName) {
      // For base documents, don't include project name in code
      const projectNameForCode = args.isBaseDocument ? undefined : args.projectName;
      documentCode = generateDocumentCode(
        args.clientName,
        args.category,
        projectNameForCode,
        uploadedAt
      );
      
      // Ensure uniqueness
      const existingDocs = await ctx.db.query("documents").collect();
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
    });

    // Automatically create knowledge bank entry if document is linked to a client
    if (args.clientId) {
      try {
        // Determine entry type based on category and file type
        let entryType: "deal_update" | "call_transcript" | "email" | "document_summary" | "project_status" | "general" = "document_summary";
        
        const categoryLower = args.category.toLowerCase();
        const fileNameLower = args.fileName.toLowerCase();
        
        if (categoryLower.includes("deal") || categoryLower.includes("loan") || categoryLower.includes("term")) {
          entryType = "deal_update";
        } else if (categoryLower.includes("project") || categoryLower.includes("development")) {
          entryType = "project_status";
        } else if (fileNameLower.includes("call") || fileNameLower.includes("transcript")) {
          entryType = "call_transcript";
        } else if (categoryLower.includes("email") || fileNameLower.includes("email")) {
          entryType = "email";
        }

        // Extract key points from summary
        const keyPoints: string[] = [];
        const summaryLines = args.summary.split(/[.!?]\s+/).filter(line => line.trim().length > 0);
        keyPoints.push(...summaryLines.slice(0, 5).map(line => line.trim()));

        // Extract metadata from extractedData if available
        const metadata: any = {};
        if (args.extractedData) {
          if (args.extractedData.loanAmount) metadata.loanAmount = args.extractedData.loanAmount;
          if (args.extractedData.interestRate) metadata.interestRate = args.extractedData.interestRate;
          if (args.extractedData.loanNumber) metadata.loanNumber = args.extractedData.loanNumber;
          if (args.extractedData.costsTotal) metadata.costsTotal = args.extractedData.costsTotal;
          if (args.extractedData.detectedCurrency) metadata.currency = args.extractedData.detectedCurrency;
        }

        // Generate tags from category and file type
        const tags: string[] = [args.category];
        if (args.fileTypeDetected) tags.push(args.fileTypeDetected);
        if (args.projectName) tags.push("project-related");

        // Create knowledge bank entry
        await ctx.db.insert("knowledgeBankEntries", {
          clientId: args.clientId,
          projectId: args.isBaseDocument ? undefined : args.projectId,
          sourceType: "document",
          sourceId: documentId,
          entryType: entryType,
          title: `${args.fileName} - ${args.category}`,
          content: args.summary,
          keyPoints: keyPoints,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          tags: tags,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        // Log error but don't fail document creation if knowledge bank entry fails
        console.error("Failed to create knowledge bank entry:", error);
      }
    }

    return documentId;
  },
});

