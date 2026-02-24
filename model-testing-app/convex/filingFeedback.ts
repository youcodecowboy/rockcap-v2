import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ============================================================================
// FILING FEEDBACK LOOP
// Self-teaching system for improving AI classification accuracy
// ============================================================================

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a simple content hash for deduplication and caching
 * Uses a simple hash algorithm that works in Convex runtime
 * Takes first 10KB of content for consistency
 */
export function generateContentHash(content: string): string {
  const normalizedContent = content.slice(0, 10000).toLowerCase().trim();

  // Simple djb2 hash algorithm - fast and deterministic
  let hash = 5381;
  for (let i = 0; i < normalizedContent.length; i++) {
    hash = ((hash << 5) + hash) + normalizedContent.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert to hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Normalize filename for pattern matching
 * Converts to lowercase, removes extension, replaces numbers with placeholder
 */
export function normalizeFilename(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[^.]+$/, "") // Remove extension
    .replace(/[_\-\.]/g, " ") // Replace separators with spaces
    .replace(/\d+/g, "#") // Replace numbers with placeholder
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

// ============================================================================
// CORRECTION QUERIES
// ============================================================================

/**
 * Get relevant corrections for the Critic agent
 * Uses prioritized retrieval strategy:
 * 1. Same file type corrections (highest priority)
 * 2. Same category corrections
 * 3. Similar filename patterns
 */
export const getRelevantCorrections = query({
  args: {
    fileType: v.string(),
    category: v.string(),
    fileName: v.string(),
    clientType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxCorrections = args.limit || 5;
    const corrections: Array<{
      _id: Id<"filingCorrections">;
      aiPrediction: {
        fileType: string;
        category: string;
        targetFolder: string;
        confidence: number;
        isInternal?: boolean;
        suggestedChecklistItems?: Array<{ itemId: string; itemName: string; confidence: number }>;
      };
      userCorrection: {
        fileType?: string;
        category?: string;
        targetFolder?: string;
        isInternal?: boolean;
        checklistItems?: Array<{ itemId: string; itemName: string }>;
      };
      fileName: string;
      matchReason: string;
      relevanceScore: number;
    }> = [];

    // Strategy 1: Exact file type corrections (highest priority)
    const fileTypeCorrections = await ctx.db
      .query("filingCorrections")
      .withIndex("by_file_type", (q) => q.eq("aiPrediction.fileType", args.fileType))
      .order("desc")
      .take(2);

    for (const c of fileTypeCorrections) {
      corrections.push({
        _id: c._id,
        aiPrediction: c.aiPrediction,
        userCorrection: c.userCorrection,
        fileName: c.fileName,
        matchReason: `Same AI-predicted file type "${args.fileType}" was corrected before`,
        relevanceScore: 1.0,
      });
    }

    // Strategy 2: Category corrections
    if (corrections.length < maxCorrections) {
      const categoryCorrections = await ctx.db
        .query("filingCorrections")
        .withIndex("by_category", (q) => q.eq("aiPrediction.category", args.category))
        .order("desc")
        .take(2);

      for (const c of categoryCorrections) {
        // Skip if already added from file type search
        if (corrections.some((existing) => existing._id === c._id)) continue;

        corrections.push({
          _id: c._id,
          aiPrediction: c.aiPrediction,
          userCorrection: c.userCorrection,
          fileName: c.fileName,
          matchReason: `Same AI-predicted category "${args.category}" was corrected before`,
          relevanceScore: 0.8,
        });
      }
    }

    // Strategy 3: Similar filename patterns using search index
    if (corrections.length < maxCorrections) {
      const normalizedName = normalizeFilename(args.fileName);

      try {
        const similarNameCorrections = await ctx.db
          .query("filingCorrections")
          .withSearchIndex("search_filename", (q) =>
            q.search("fileNameNormalized", normalizedName)
          )
          .take(2);

        for (const c of similarNameCorrections) {
          // Skip if already added
          if (corrections.some((existing) => existing._id === c._id)) continue;

          corrections.push({
            _id: c._id,
            aiPrediction: c.aiPrediction,
            userCorrection: c.userCorrection,
            fileName: c.fileName,
            matchReason: `Similar filename pattern was corrected before`,
            relevanceScore: 0.7,
          });
        }
      } catch (e) {
        // Search index may not be ready yet, skip this strategy
        console.warn("[Filing Feedback] Search index not ready:", e);
      }
    }

    // Sort by relevance and limit
    return corrections
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxCorrections);
  },
});

/**
 * ENHANCED: Get targeted corrections based on specific confusion pairs
 *
 * This is called when the AI is uncertain between specific options.
 * Instead of broad retrieval, it finds corrections where:
 * 1. AI predicted X but user corrected to Y (or vice versa)
 * 2. The confusion is between the exact types the current AI is uncertain about
 *
 * This dramatically reduces token usage while increasing relevance.
 */
export const getTargetedCorrections = query({
  args: {
    // The types/categories the AI is confused between
    confusedBetween: v.array(v.object({
      field: v.union(v.literal("fileType"), v.literal("category"), v.literal("folder")),
      options: v.array(v.string()), // e.g., ["Track Record", "Other"] or ["KYC", "Legal Documents"]
    })),
    // Current classification for context
    currentClassification: v.object({
      fileType: v.string(),
      category: v.string(),
      confidence: v.number(),
    }),
    fileName: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxCorrections = args.limit || 3; // Smaller limit for targeted queries
    const results: Array<{
      aiPrediction: {
        fileType: string;
        category: string;
        targetFolder: string;
        confidence: number;
      };
      userCorrection: {
        fileType?: string;
        category?: string;
        targetFolder?: string;
      };
      fileName: string;
      matchReason: string;
      relevanceScore: number;
      confusionResolved: string; // e.g., "Track Record (not Other)"
    }> = [];

    // For each confusion pair, find corrections that resolved that exact confusion
    for (const confusion of args.confusedBetween) {
      if (confusion.options.length < 2) continue;

      const [optionA, optionB] = confusion.options;

      if (confusion.field === "fileType") {
        // Find corrections where AI said A but user said B
        const correctionsAtoB = await ctx.db
          .query("filingCorrections")
          .withIndex("by_file_type", (q) => q.eq("aiPrediction.fileType", optionA))
          .filter((q) => q.eq(q.field("userCorrection.fileType"), optionB))
          .order("desc")
          .take(2);

        for (const c of correctionsAtoB) {
          results.push({
            aiPrediction: c.aiPrediction,
            userCorrection: c.userCorrection,
            fileName: c.fileName,
            matchReason: `AI thought "${optionA}" but correct answer was "${optionB}"`,
            relevanceScore: 1.0,
            confusionResolved: `${optionB} (not ${optionA})`,
          });
        }

        // Also find corrections where AI said B but user said A
        const correctionsBtoA = await ctx.db
          .query("filingCorrections")
          .withIndex("by_file_type", (q) => q.eq("aiPrediction.fileType", optionB))
          .filter((q) => q.eq(q.field("userCorrection.fileType"), optionA))
          .order("desc")
          .take(2);

        for (const c of correctionsBtoA) {
          if (results.some(r => r.fileName === c.fileName)) continue;
          results.push({
            aiPrediction: c.aiPrediction,
            userCorrection: c.userCorrection,
            fileName: c.fileName,
            matchReason: `AI thought "${optionB}" but correct answer was "${optionA}"`,
            relevanceScore: 1.0,
            confusionResolved: `${optionA} (not ${optionB})`,
          });
        }
      }

      if (confusion.field === "category") {
        // Same logic for category confusion
        const correctionsAtoB = await ctx.db
          .query("filingCorrections")
          .withIndex("by_category", (q) => q.eq("aiPrediction.category", optionA))
          .filter((q) => q.eq(q.field("userCorrection.category"), optionB))
          .order("desc")
          .take(2);

        for (const c of correctionsAtoB) {
          if (results.some(r => r.fileName === c.fileName)) continue;
          results.push({
            aiPrediction: c.aiPrediction,
            userCorrection: c.userCorrection,
            fileName: c.fileName,
            matchReason: `AI thought category "${optionA}" but correct was "${optionB}"`,
            relevanceScore: 0.9,
            confusionResolved: `${optionB} (not ${optionA})`,
          });
        }
      }
    }

    // Sort by relevance and limit
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxCorrections);
  },
});

/**
 * Get consolidated correction rules (aggregated patterns)
 *
 * Instead of individual corrections, this returns learned "rules" like:
 * "When AI says 'Other' for documents with 'track record' in filename, it's usually 'Track Record' (15 corrections)"
 *
 * This provides high-signal, low-token corrections.
 */
export const getConsolidatedRules = query({
  args: {
    fileType: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db.query("filingCorrections").collect();

    // Group corrections by (aiPrediction.fileType -> userCorrection.fileType) pattern
    const fileTypeRules: Record<string, {
      from: string;
      to: string;
      count: number;
      examples: string[];
      avgConfidence: number;
    }> = {};

    const categoryRules: Record<string, {
      from: string;
      to: string;
      count: number;
      examples: string[];
    }> = {};

    for (const c of corrections) {
      // File type corrections
      if (c.userCorrection.fileType && c.userCorrection.fileType !== c.aiPrediction.fileType) {
        const key = `${c.aiPrediction.fileType}→${c.userCorrection.fileType}`;
        if (!fileTypeRules[key]) {
          fileTypeRules[key] = {
            from: c.aiPrediction.fileType,
            to: c.userCorrection.fileType,
            count: 0,
            examples: [],
            avgConfidence: 0,
          };
        }
        fileTypeRules[key].count++;
        if (fileTypeRules[key].examples.length < 3) {
          fileTypeRules[key].examples.push(c.fileName);
        }
        fileTypeRules[key].avgConfidence =
          (fileTypeRules[key].avgConfidence * (fileTypeRules[key].count - 1) + c.aiPrediction.confidence) /
          fileTypeRules[key].count;
      }

      // Category corrections
      if (c.userCorrection.category && c.userCorrection.category !== c.aiPrediction.category) {
        const key = `${c.aiPrediction.category}→${c.userCorrection.category}`;
        if (!categoryRules[key]) {
          categoryRules[key] = {
            from: c.aiPrediction.category,
            to: c.userCorrection.category,
            count: 0,
            examples: [],
          };
        }
        categoryRules[key].count++;
        if (categoryRules[key].examples.length < 3) {
          categoryRules[key].examples.push(c.fileName);
        }
      }
    }

    // Filter to rules that match current context and have enough occurrences
    let relevantFileTypeRules = Object.values(fileTypeRules)
      .filter(r => r.count >= 2) // Only rules with 2+ occurrences
      .sort((a, b) => b.count - a.count);

    let relevantCategoryRules = Object.values(categoryRules)
      .filter(r => r.count >= 2)
      .sort((a, b) => b.count - a.count);

    // If specific fileType provided, prioritize rules involving it
    if (args.fileType) {
      relevantFileTypeRules = relevantFileTypeRules.filter(r =>
        r.from === args.fileType || r.to === args.fileType
      );
    }

    if (args.category) {
      relevantCategoryRules = relevantCategoryRules.filter(r =>
        r.from === args.category || r.to === args.category
      );
    }

    const limit = args.limit || 5;

    return {
      fileTypeRules: relevantFileTypeRules.slice(0, limit),
      categoryRules: relevantCategoryRules.slice(0, limit),
      totalCorrections: corrections.length,
    };
  },
});

/**
 * Get correction statistics for a given time period
 */
export const getCorrectionStats = query({
  args: {
    since: v.optional(v.string()), // ISO date string
  },
  handler: async (ctx, args) => {
    let corrections = await ctx.db.query("filingCorrections").collect();

    if (args.since) {
      corrections = corrections.filter((c) => c.createdAt >= args.since!);
    }

    // Calculate statistics
    const stats = {
      totalCorrections: corrections.length,
      byField: {} as Record<string, number>,
      byFileType: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
    };

    for (const c of corrections) {
      // Count by corrected field
      for (const field of c.correctedFields) {
        stats.byField[field] = (stats.byField[field] || 0) + 1;
      }
      // Count by AI-predicted file type
      stats.byFileType[c.aiPrediction.fileType] =
        (stats.byFileType[c.aiPrediction.fileType] || 0) + 1;
      // Count by AI-predicted category
      stats.byCategory[c.aiPrediction.category] =
        (stats.byCategory[c.aiPrediction.category] || 0) + 1;
    }

    return stats;
  },
});

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

/**
 * Check classification cache for a content hash
 * Returns cached result if valid, otherwise null
 */
export const checkCache = query({
  args: {
    contentHash: v.string(),
    clientType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("classificationCache")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", args.contentHash))
      .filter((q) => q.eq(q.field("isValid"), true))
      .first();

    if (cached) {
      return {
        hit: true,
        classification: cached.classification,
        hitCount: cached.hitCount,
        cacheId: cached._id,
      };
    }

    return { hit: false };
  },
});

/**
 * Increment cache hit count (called after successful cache use)
 */
export const incrementCacheHit = mutation({
  args: {
    cacheId: v.id("classificationCache"),
  },
  handler: async (ctx, args) => {
    const cached = await ctx.db.get(args.cacheId);
    if (cached) {
      await ctx.db.patch(args.cacheId, {
        hitCount: cached.hitCount + 1,
        lastHitAt: new Date().toISOString(),
      });
    }
  },
});

/**
 * Store classification in cache
 */
export const cacheClassification = mutation({
  args: {
    contentHash: v.string(),
    fileNamePattern: v.string(),
    classification: v.object({
      fileType: v.string(),
      category: v.string(),
      targetFolder: v.string(),
      confidence: v.number(),
      isInternal: v.optional(v.boolean()),
      suggestedChecklistItems: v.optional(
        v.array(
          v.object({
            itemId: v.string(),
            itemName: v.string(),
            confidence: v.number(),
          })
        )
      ),
    }),
    clientType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if entry already exists
    const existing = await ctx.db
      .query("classificationCache")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", args.contentHash))
      .first();

    if (existing) {
      // Update existing entry
      await ctx.db.patch(existing._id, {
        classification: args.classification,
        isValid: true,
        invalidatedAt: undefined,
        lastHitAt: now,
      });
      return existing._id;
    }

    // Create new entry
    return await ctx.db.insert("classificationCache", {
      contentHash: args.contentHash,
      fileNamePattern: args.fileNamePattern,
      classification: args.classification,
      hitCount: 0,
      lastHitAt: now,
      createdAt: now,
      correctionCount: 0,
      isValid: true,
      clientType: args.clientType,
    });
  },
});

/**
 * Invalidate cache entries by content hash
 * Called when a correction is made for that content
 */
export const invalidateCacheByHash = mutation({
  args: {
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const cacheEntries = await ctx.db
      .query("classificationCache")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", args.contentHash))
      .collect();

    const now = new Date().toISOString();
    let invalidatedCount = 0;

    for (const entry of cacheEntries) {
      await ctx.db.patch(entry._id, {
        isValid: false,
        invalidatedAt: now,
        correctionCount: (entry.correctionCount || 0) + 1,
      });
      invalidatedCount++;
    }

    return { invalidatedCount };
  },
});

/**
 * Invalidate cache entries by pattern or criteria
 * Admin utility for bulk cache invalidation
 */
export const invalidateCacheByPattern = mutation({
  args: {
    pattern: v.optional(v.string()),
    clientType: v.optional(v.string()),
    olderThan: v.optional(v.string()), // ISO date string
  },
  handler: async (ctx, args) => {
    let entries = await ctx.db.query("classificationCache").collect();

    if (args.clientType) {
      entries = entries.filter((e) => e.clientType === args.clientType);
    }

    const now = new Date().toISOString();
    let invalidatedCount = 0;

    for (const entry of entries) {
      const shouldInvalidate =
        (args.pattern && entry.fileNamePattern.includes(args.pattern)) ||
        (args.olderThan && entry.lastHitAt < args.olderThan);

      if (shouldInvalidate) {
        await ctx.db.patch(entry._id, {
          isValid: false,
          invalidatedAt: now,
        });
        invalidatedCount++;
      }
    }

    return { invalidatedCount };
  },
});

// ============================================================================
// CORRECTION CAPTURE
// ============================================================================

/**
 * Capture a filing correction when user overrides AI prediction
 * Called from updateItemDetails mutation in bulkUpload.ts
 */
export const captureCorrection = mutation({
  args: {
    sourceItemId: v.id("bulkUploadItems"),
    fileName: v.string(),
    contentSummary: v.string(),
    clientType: v.optional(v.string()),
    aiPrediction: v.object({
      fileType: v.string(),
      category: v.string(),
      targetFolder: v.string(),
      confidence: v.number(),
      isInternal: v.optional(v.boolean()),
    }),
    userCorrection: v.object({
      fileType: v.optional(v.string()),
      category: v.optional(v.string()),
      targetFolder: v.optional(v.string()),
      isInternal: v.optional(v.boolean()),
    }),
    correctedFields: v.array(v.string()),
    correctedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const contentHash = generateContentHash(args.contentSummary || args.fileName);
    const fileNameNormalized = normalizeFilename(args.fileName);

    // Insert the correction record
    const correctionId = await ctx.db.insert("filingCorrections", {
      sourceItemId: args.sourceItemId,
      fileName: args.fileName,
      fileNameNormalized,
      contentHash,
      contentSummary: (args.contentSummary || "").slice(0, 500),
      clientType: args.clientType,
      aiPrediction: args.aiPrediction,
      userCorrection: args.userCorrection,
      correctedFields: args.correctedFields,
      correctionWeight: 1.0,
      correctedBy: args.correctedBy,
      createdAt: now,
    });

    // Invalidate any cache entries for this content hash
    const cacheEntries = await ctx.db
      .query("classificationCache")
      .withIndex("by_content_hash", (q) => q.eq("contentHash", contentHash))
      .collect();

    for (const entry of cacheEntries) {
      await ctx.db.patch(entry._id, {
        isValid: false,
        invalidatedAt: now,
        correctionCount: (entry.correctionCount || 0) + 1,
      });
    }

    return correctionId;
  },
});

// ============================================================================
// LORA TRAINING EXPORT
// ============================================================================

/**
 * Create a new LoRA training export job
 */
export const createTrainingExport = mutation({
  args: {
    exportName: v.string(),
    exportedBy: v.id("users"),
    format: v.union(
      v.literal("openai_chat"),
      v.literal("together_chat"),
      v.literal("alpaca")
    ),
    criteria: v.object({
      minCorrectionWeight: v.optional(v.number()),
      correctedFieldsFilter: v.optional(v.array(v.string())),
      dateRangeStart: v.optional(v.string()),
      dateRangeEnd: v.optional(v.string()),
      clientTypes: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Create export record
    const exportId = await ctx.db.insert("loraTrainingExports", {
      exportName: args.exportName,
      exportedBy: args.exportedBy,
      exportedAt: now,
      criteria: args.criteria,
      stats: {
        totalExamples: 0,
        byFileType: {},
        byCategory: {},
        byCorrectionType: {},
      },
      exportFormat: args.format,
      status: "pending",
    });

    // Schedule background job to generate export
    await ctx.scheduler.runAfter(0, internal.filingFeedback.generateExportInternal, {
      exportId,
    });

    return exportId;
  },
});

/**
 * Internal mutation to generate the export file
 */
export const generateExportInternal = internalMutation({
  args: { exportId: v.id("loraTrainingExports") },
  handler: async (ctx, args) => {
    const exportRecord = await ctx.db.get(args.exportId);
    if (!exportRecord) return;

    await ctx.db.patch(args.exportId, { status: "generating" });

    try {
      // Fetch corrections matching criteria
      let corrections = await ctx.db.query("filingCorrections").collect();

      // Apply filters
      const { criteria } = exportRecord;
      if (criteria.minCorrectionWeight) {
        corrections = corrections.filter(
          (c) => c.correctionWeight >= criteria.minCorrectionWeight!
        );
      }
      if (criteria.dateRangeStart) {
        corrections = corrections.filter(
          (c) => c.createdAt >= criteria.dateRangeStart!
        );
      }
      if (criteria.dateRangeEnd) {
        corrections = corrections.filter(
          (c) => c.createdAt <= criteria.dateRangeEnd!
        );
      }
      if (criteria.clientTypes && criteria.clientTypes.length > 0) {
        corrections = corrections.filter(
          (c) =>
            c.clientType && criteria.clientTypes!.includes(c.clientType)
        );
      }
      if (
        criteria.correctedFieldsFilter &&
        criteria.correctedFieldsFilter.length > 0
      ) {
        corrections = corrections.filter((c) =>
          c.correctedFields.some((f) =>
            criteria.correctedFieldsFilter!.includes(f)
          )
        );
      }

      // Generate training examples
      const examples = corrections.map((c) =>
        formatTrainingExample(c, exportRecord.exportFormat)
      );

      // Calculate stats
      const stats = {
        totalExamples: examples.length,
        byFileType: countBy(
          corrections,
          (c) => c.userCorrection.fileType || c.aiPrediction.fileType
        ),
        byCategory: countBy(
          corrections,
          (c) => c.userCorrection.category || c.aiPrediction.category
        ),
        byCorrectionType: countBy(corrections.flatMap((c) => c.correctedFields)),
      };

      // Store as JSONL content (in a real implementation, you'd upload to storage)
      const jsonlContent = examples.map((e) => JSON.stringify(e)).join("\n");

      // For now, store the content directly (in production, upload to file storage)
      // const blob = new Blob([jsonlContent], { type: 'application/jsonl' });
      // const storageId = await ctx.storage.store(blob);

      await ctx.db.patch(args.exportId, {
        status: "completed",
        stats,
        // exportFileStorageId: storageId,
      });
    } catch (error) {
      await ctx.db.patch(args.exportId, {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

/**
 * Get export status and download URL
 */
export const getExport = query({
  args: { exportId: v.id("loraTrainingExports") },
  handler: async (ctx, args) => {
    const exportRecord = await ctx.db.get(args.exportId);
    if (!exportRecord) return null;

    let downloadUrl: string | null = null;
    if (exportRecord.exportFileStorageId) {
      downloadUrl = await ctx.storage.getUrl(exportRecord.exportFileStorageId);
    }

    return {
      ...exportRecord,
      downloadUrl,
    };
  },
});

/**
 * List all exports for a user
 */
export const listExports = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("loraTrainingExports")
      .filter((q) => q.eq(q.field("exportedBy"), args.userId))
      .order("desc")
      .collect();
  },
});

// ============================================================================
// HELPER FUNCTIONS FOR EXPORT
// ============================================================================

function formatTrainingExample(
  correction: {
    fileName: string;
    contentSummary: string;
    aiPrediction: {
      fileType: string;
      category: string;
      targetFolder: string;
    };
    userCorrection: {
      fileType?: string;
      category?: string;
      targetFolder?: string;
    };
  },
  format: "openai_chat" | "together_chat" | "alpaca"
): object {
  // Construct the correct classification from user correction
  const correctClassification = {
    fileType: correction.userCorrection.fileType || correction.aiPrediction.fileType,
    category: correction.userCorrection.category || correction.aiPrediction.category,
    targetFolder:
      correction.userCorrection.targetFolder || correction.aiPrediction.targetFolder,
  };

  const systemPrompt = `You are a document classification agent for a real estate finance company. Classify documents accurately based on their content and filename.`;

  const userPrompt = `Classify this document:
Filename: ${correction.fileName}
Summary: ${correction.contentSummary}

Return JSON with: fileType, category, targetFolder`;

  const assistantResponse = JSON.stringify(correctClassification);

  switch (format) {
    case "openai_chat":
      return {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
          { role: "assistant", content: assistantResponse },
        ],
      };

    case "together_chat":
      return {
        text: `<|system|>\n${systemPrompt}\n<|user|>\n${userPrompt}\n<|assistant|>\n${assistantResponse}`,
      };

    case "alpaca":
      return {
        instruction: systemPrompt,
        input: userPrompt,
        output: assistantResponse,
      };
  }
}

function countBy<T>(
  items: T[],
  keyFn: (item: T) => string | undefined
): Record<string, number>;
function countBy(items: string[]): Record<string, number>;
function countBy<T>(
  items: T[] | string[],
  keyFn?: (item: T) => string | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};

  if (keyFn) {
    for (const item of items as T[]) {
      const key = keyFn(item);
      if (key) {
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  } else {
    for (const item of items as string[]) {
      counts[item] = (counts[item] || 0) + 1;
    }
  }

  return counts;
}

// ============================================================================
// ADMIN / CLEANUP MUTATIONS
// ============================================================================

/**
 * Delete all corrections (for testing/cleanup)
 */
export const deleteAllCorrections = mutation({
  args: {},
  handler: async (ctx) => {
    const corrections = await ctx.db.query("filingCorrections").collect();
    let deleted = 0;
    for (const correction of corrections) {
      await ctx.db.delete(correction._id);
      deleted++;
    }
    console.log(`[Feedback Loop] Deleted ${deleted} corrections`);
    return { deleted };
  },
});

/**
 * Delete corrections by source item ID (for cleaning up duplicates)
 */
export const deleteCorrectionsForItem = mutation({
  args: {
    sourceItemId: v.id("bulkUploadItems"),
  },
  handler: async (ctx, args) => {
    const corrections = await ctx.db
      .query("filingCorrections")
      .filter((q) => q.eq(q.field("sourceItemId"), args.sourceItemId))
      .collect();

    let deleted = 0;
    for (const correction of corrections) {
      await ctx.db.delete(correction._id);
      deleted++;
    }
    console.log(`[Feedback Loop] Deleted ${deleted} corrections for item ${args.sourceItemId}`);
    return { deleted };
  },
});

/**
 * List all corrections (for debugging)
 */
export const listAllCorrections = query({
  args: {},
  handler: async (ctx) => {
    const corrections = await ctx.db.query("filingCorrections").collect();
    return corrections.map(c => ({
      _id: c._id,
      fileName: c.fileName,
      aiFileType: c.aiPrediction.fileType,
      userFileType: c.userCorrection.fileType,
      aiCategory: c.aiPrediction.category,
      userCategory: c.userCorrection.category,
      aiTargetFolder: c.aiPrediction.targetFolder,
      userTargetFolder: c.userCorrection.targetFolder,
      // Checklist corrections
      aiChecklistSuggestions: c.aiPrediction.suggestedChecklistItems?.map(s => s.itemName) || [],
      userChecklistItems: c.userCorrection.checklistItems?.map(i => i.itemName) || [],
      correctedFields: c.correctedFields,
      createdAt: c.createdAt,
    }));
  },
});
