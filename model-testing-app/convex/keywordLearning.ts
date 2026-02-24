import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// KEYWORD LEARNING SERVICE
// ============================================================================
// Auto-learns keywords from user corrections. When users correct file type
// assignments, we extract common keywords from the document summaries
// (keyTerms from Summary Agent) and add them to the correct file type definition.
//
// Learning Flow:
// 1. User corrects: AI said "IMR" → User corrected to "RedBook Valuation"
// 2. System stores: documentKeywords (from summary agent), aiReasoning
// 3. After 3+ similar corrections: Find common keywords across those docs
// 4. Auto-add common keywords to the correct file type definition
// 5. Create learning event for notification
// ============================================================================

const LEARNING_THRESHOLD = 3; // Minimum corrections before learning
const KEYWORD_FREQUENCY_THRESHOLD = 0.5; // Keyword must appear in 50%+ of corrections

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Analyze corrections to find keywords ready to be learned
 * Groups corrections by pattern (aiPrediction.fileType → userCorrection.fileType)
 * and finds common keywords that appear in 50%+ of corrections
 */
export const getKeywordsToLearn = query({
  args: { threshold: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const threshold = args.threshold ?? LEARNING_THRESHOLD;

    // Get all corrections that have documentKeywords
    const corrections = await ctx.db
      .query("filingCorrections")
      .collect();

    // Filter to corrections with keywords and fileType changes
    const relevantCorrections = corrections.filter(
      (c) =>
        c.documentKeywords &&
        c.documentKeywords.length > 0 &&
        c.userCorrection?.fileType &&
        c.aiPrediction?.fileType !== c.userCorrection?.fileType
    );

    // Group by correction pattern: "aiFileType → userFileType"
    const patternGroups: Map<
      string,
      {
        aiFileType: string;
        userFileType: string;
        corrections: typeof relevantCorrections;
      }
    > = new Map();

    for (const correction of relevantCorrections) {
      const aiFileType = correction.aiPrediction?.fileType || "Unknown";
      const userFileType = correction.userCorrection?.fileType || "Unknown";
      const pattern = `${aiFileType}→${userFileType}`;

      if (!patternGroups.has(pattern)) {
        patternGroups.set(pattern, {
          aiFileType,
          userFileType,
          corrections: [],
        });
      }
      patternGroups.get(pattern)!.corrections.push(correction);
    }

    // Find patterns with 3+ corrections and extract common keywords
    const learningCandidates: Array<{
      aiFileType: string;
      userFileType: string; // This is the CORRECT type to learn keywords for
      correctionCount: number;
      keywords: Array<{
        keyword: string;
        frequency: number;
        occurrences: number;
      }>;
      correctionIds: Id<"filingCorrections">[];
    }> = [];

    for (const [pattern, group] of patternGroups) {
      if (group.corrections.length < threshold) continue;

      // Count keyword frequency across this group's corrections
      const keywordCounts: Map<string, number> = new Map();
      for (const correction of group.corrections) {
        const keywords = correction.documentKeywords || [];
        for (const keyword of keywords) {
          const normalizedKeyword = keyword.toLowerCase().trim();
          keywordCounts.set(
            normalizedKeyword,
            (keywordCounts.get(normalizedKeyword) || 0) + 1
          );
        }
      }

      // Filter to keywords appearing in 50%+ of corrections
      const totalCorrections = group.corrections.length;
      const commonKeywords: Array<{
        keyword: string;
        frequency: number;
        occurrences: number;
      }> = [];

      for (const [keyword, count] of keywordCounts) {
        const frequency = count / totalCorrections;
        if (frequency >= KEYWORD_FREQUENCY_THRESHOLD) {
          commonKeywords.push({
            keyword,
            frequency,
            occurrences: count,
          });
        }
      }

      if (commonKeywords.length > 0) {
        // Check if these keywords are already learned for this file type
        const fileTypeDef = await ctx.db
          .query("fileTypeDefinitions")
          .withIndex("by_file_type", (q) => q.eq("fileType", group.userFileType))
          .first();

        const existingKeywords = new Set(
          fileTypeDef?.keywords?.map((k) => k.toLowerCase()) || []
        );
        const existingLearnedKeywords = new Set(
          fileTypeDef?.learnedKeywords?.map((lk) => lk.keyword.toLowerCase()) || []
        );

        // Filter out already-known keywords
        const newKeywords = commonKeywords.filter(
          (k) =>
            !existingKeywords.has(k.keyword) &&
            !existingLearnedKeywords.has(k.keyword)
        );

        if (newKeywords.length > 0) {
          learningCandidates.push({
            aiFileType: group.aiFileType,
            userFileType: group.userFileType,
            correctionCount: totalCorrections,
            keywords: newKeywords.sort((a, b) => b.frequency - a.frequency),
            correctionIds: group.corrections.map((c) => c._id),
          });
        }
      }
    }

    return learningCandidates.sort((a, b) => b.correctionCount - a.correctionCount);
  },
});

/**
 * Get recent learning events for notification display
 */
export const getRecentLearningEvents = query({
  args: {
    limit: v.optional(v.number()),
    includeDismissed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    let events = await ctx.db
      .query("learningEvents")
      .withIndex("by_created_at")
      .order("desc")
      .take(100);

    // Filter out dismissed unless requested
    if (!args.includeDismissed) {
      events = events.filter((e) => !e.dismissed);
    }

    // Limit results
    events = events.slice(0, limit);

    // Enrich with file type info
    const enrichedEvents = await Promise.all(
      events.map(async (event) => {
        const fileTypeDef = await ctx.db.get(event.fileTypeId);
        return {
          ...event,
          fileTypeCategory: fileTypeDef?.category,
          fileTypeDescription: fileTypeDef?.description,
        };
      })
    );

    return enrichedEvents;
  },
});

/**
 * Get learning statistics
 */
export const getLearningStats = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("learningEvents").collect();

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const thisWeek = events.filter(
      (e) => new Date(e.createdAt) >= oneWeekAgo
    ).length;
    const thisMonth = events.filter(
      (e) => new Date(e.createdAt) >= oneMonthAgo
    ).length;

    // Count unique file types that have learned keywords
    const fileTypesWithLearning = new Set(events.map((e) => e.fileType)).size;

    // Get total corrections that contributed to learning
    const totalCorrections = events.reduce(
      (sum, e) => sum + e.correctionCount,
      0
    );

    return {
      totalKeywordsLearned: events.length,
      thisWeek,
      thisMonth,
      fileTypesWithLearning,
      totalCorrectionsContributed: totalCorrections,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Process and apply learned keywords for a specific correction pattern
 * Called when a new correction is captured and 3+ similar corrections exist
 */
export const processLearnedKeywords = internalMutation({
  args: {
    userFileType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Get all corrections pointing to this file type
    // Note: Using filter instead of index because userCorrection.fileType is nested in an optional object
    const allCorrections = await ctx.db.query("filingCorrections").collect();
    const corrections = allCorrections.filter(
      (c) => c.userCorrection?.fileType === args.userFileType
    );

    // Filter to corrections with keywords
    const relevantCorrections = corrections.filter(
      (c) => c.documentKeywords && c.documentKeywords.length > 0
    );

    if (relevantCorrections.length < LEARNING_THRESHOLD) {
      return { learned: false, reason: "Not enough corrections" };
    }

    // Count keyword frequency
    const keywordCounts: Map<string, number> = new Map();
    for (const correction of relevantCorrections) {
      const keywords = correction.documentKeywords || [];
      for (const keyword of keywords) {
        const normalizedKeyword = keyword.toLowerCase().trim();
        keywordCounts.set(
          normalizedKeyword,
          (keywordCounts.get(normalizedKeyword) || 0) + 1
        );
      }
    }

    // Filter to keywords appearing in 50%+ of corrections
    const totalCorrections = relevantCorrections.length;
    const commonKeywords: string[] = [];
    for (const [keyword, count] of keywordCounts) {
      const frequency = count / totalCorrections;
      if (frequency >= KEYWORD_FREQUENCY_THRESHOLD) {
        commonKeywords.push(keyword);
      }
    }

    if (commonKeywords.length === 0) {
      return { learned: false, reason: "No common keywords found" };
    }

    // Get the file type definition
    const fileTypeDef = await ctx.db
      .query("fileTypeDefinitions")
      .withIndex("by_file_type", (q) => q.eq("fileType", args.userFileType))
      .first();

    if (!fileTypeDef) {
      return { learned: false, reason: "File type definition not found" };
    }

    // Filter out already-known keywords
    const existingKeywords = new Set(
      fileTypeDef.keywords?.map((k) => k.toLowerCase()) || []
    );
    const existingLearnedKeywords = new Set(
      fileTypeDef.learnedKeywords?.map((lk) => lk.keyword.toLowerCase()) || []
    );

    const newKeywords = commonKeywords.filter(
      (k) => !existingKeywords.has(k) && !existingLearnedKeywords.has(k)
    );

    if (newKeywords.length === 0) {
      return { learned: false, reason: "Keywords already learned" };
    }

    // Add learned keywords to the file type definition
    const currentLearnedKeywords = fileTypeDef.learnedKeywords || [];
    const updatedLearnedKeywords = [
      ...currentLearnedKeywords,
      ...newKeywords.map((keyword) => ({
        keyword,
        source: "correction" as const,
        addedAt: now,
        correctionCount: totalCorrections,
      })),
    ];

    await ctx.db.patch(fileTypeDef._id, {
      learnedKeywords: updatedLearnedKeywords,
      lastLearnedAt: now,
      updatedAt: now,
    });

    // Create learning events for each keyword
    for (const keyword of newKeywords) {
      await ctx.db.insert("learningEvents", {
        eventType: "keyword_learned",
        fileTypeId: fileTypeDef._id,
        fileType: args.userFileType,
        keyword,
        correctionCount: totalCorrections,
        sourceCorrections: relevantCorrections.map((c) => c._id),
        createdAt: now,
      });
    }

    return {
      learned: true,
      keywordsLearned: newKeywords,
      correctionCount: totalCorrections,
      fileTypeId: fileTypeDef._id,
    };
  },
});

/**
 * Manually trigger learning for all pending patterns
 */
export const processAllPendingLearning = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();

    // Get all unique userCorrection.fileType values from corrections
    const corrections = await ctx.db.query("filingCorrections").collect();

    const fileTypesToProcess = new Set(
      corrections
        .filter((c) => c.userCorrection?.fileType)
        .map((c) => c.userCorrection!.fileType!)
    );

    const results: Array<{
      fileType: string;
      learned: boolean;
      keywordsLearned?: string[];
    }> = [];

    for (const fileType of fileTypesToProcess) {
      // Get corrections for this file type
      const relevantCorrections = corrections.filter(
        (c) =>
          c.userCorrection?.fileType === fileType &&
          c.documentKeywords &&
          c.documentKeywords.length > 0
      );

      if (relevantCorrections.length < LEARNING_THRESHOLD) {
        results.push({ fileType, learned: false });
        continue;
      }

      // Count keyword frequency
      const keywordCounts: Map<string, number> = new Map();
      for (const correction of relevantCorrections) {
        for (const keyword of correction.documentKeywords || []) {
          const normalizedKeyword = keyword.toLowerCase().trim();
          keywordCounts.set(
            normalizedKeyword,
            (keywordCounts.get(normalizedKeyword) || 0) + 1
          );
        }
      }

      // Filter to common keywords
      const totalCorrections = relevantCorrections.length;
      const commonKeywords: string[] = [];
      for (const [keyword, count] of keywordCounts) {
        if (count / totalCorrections >= KEYWORD_FREQUENCY_THRESHOLD) {
          commonKeywords.push(keyword);
        }
      }

      if (commonKeywords.length === 0) {
        results.push({ fileType, learned: false });
        continue;
      }

      // Get file type definition
      const fileTypeDef = await ctx.db
        .query("fileTypeDefinitions")
        .withIndex("by_file_type", (q) => q.eq("fileType", fileType))
        .first();

      if (!fileTypeDef) {
        results.push({ fileType, learned: false });
        continue;
      }

      // Filter out existing keywords
      const existingKeywords = new Set(
        fileTypeDef.keywords?.map((k) => k.toLowerCase()) || []
      );
      const existingLearnedKeywords = new Set(
        fileTypeDef.learnedKeywords?.map((lk) => lk.keyword.toLowerCase()) || []
      );

      const newKeywords = commonKeywords.filter(
        (k) => !existingKeywords.has(k) && !existingLearnedKeywords.has(k)
      );

      if (newKeywords.length === 0) {
        results.push({ fileType, learned: false });
        continue;
      }

      // Add learned keywords
      const updatedLearnedKeywords = [
        ...(fileTypeDef.learnedKeywords || []),
        ...newKeywords.map((keyword) => ({
          keyword,
          source: "correction" as const,
          addedAt: now,
          correctionCount: totalCorrections,
        })),
      ];

      await ctx.db.patch(fileTypeDef._id, {
        learnedKeywords: updatedLearnedKeywords,
        lastLearnedAt: now,
        updatedAt: now,
      });

      // Create learning events
      for (const keyword of newKeywords) {
        await ctx.db.insert("learningEvents", {
          eventType: "keyword_learned",
          fileTypeId: fileTypeDef._id,
          fileType,
          keyword,
          correctionCount: totalCorrections,
          sourceCorrections: relevantCorrections.map((c) => c._id),
          createdAt: now,
        });
      }

      results.push({ fileType, learned: true, keywordsLearned: newKeywords });
    }

    return {
      processed: results.length,
      learned: results.filter((r) => r.learned).length,
      details: results,
    };
  },
});

/**
 * Undo a learned keyword (remove from file type definition)
 */
export const undoLearnedKeyword = mutation({
  args: {
    learningEventId: v.id("learningEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.learningEventId);
    if (!event) {
      throw new Error("Learning event not found");
    }

    // Get the file type definition
    const fileTypeDef = await ctx.db.get(event.fileTypeId);
    if (!fileTypeDef) {
      throw new Error("File type definition not found");
    }

    // Remove the keyword from learnedKeywords
    const updatedLearnedKeywords = (fileTypeDef.learnedKeywords || []).filter(
      (lk) => lk.keyword.toLowerCase() !== event.keyword.toLowerCase()
    );

    await ctx.db.patch(fileTypeDef._id, {
      learnedKeywords: updatedLearnedKeywords,
      updatedAt: new Date().toISOString(),
    });

    // Mark the event as dismissed
    await ctx.db.patch(args.learningEventId, {
      dismissed: true,
    });

    return { success: true, keyword: event.keyword, fileType: event.fileType };
  },
});

/**
 * Dismiss a learning event (hide from notifications without removing keyword)
 */
export const dismissLearningEvent = mutation({
  args: {
    learningEventId: v.id("learningEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.learningEventId);
    if (!event) {
      throw new Error("Learning event not found");
    }

    await ctx.db.patch(args.learningEventId, {
      dismissed: true,
    });

    return { success: true };
  },
});

/**
 * Dismiss all learning events
 */
export const dismissAllLearningEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db
      .query("learningEvents")
      .filter((q) => q.neq(q.field("dismissed"), true))
      .collect();

    for (const event of events) {
      await ctx.db.patch(event._id, {
        dismissed: true,
      });
    }

    return { success: true, dismissed: events.length };
  },
});
