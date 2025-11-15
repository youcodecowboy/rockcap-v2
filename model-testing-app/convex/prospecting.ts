import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get prospecting context by document
export const getByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const contexts = await ctx.db
      .query("prospectingContext")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    return contexts[0] || null;
  },
});

// Query: Get prospecting contexts by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("prospectingContext")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
  },
});

// Query: Get prospecting contexts by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("prospectingContext")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Mutation: Create or update prospecting context
export const save = mutation({
  args: {
    documentId: v.id("documents"),
    clientId: v.optional(v.union(v.id("clients"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    keyPoints: v.array(v.string()),
    painPoints: v.array(v.string()),
    opportunities: v.array(v.string()),
    decisionMakers: v.array(v.object({
      name: v.string(),
      role: v.optional(v.string()),
      context: v.optional(v.string()),
    })),
    businessContext: v.optional(v.object({
      industry: v.optional(v.string()),
      companySize: v.optional(v.string()),
      growthIndicators: v.optional(v.array(v.string())),
      challenges: v.optional(v.array(v.string())),
      goals: v.optional(v.array(v.string())),
    })),
    financialContext: v.optional(v.object({
      budgetMentioned: v.optional(v.boolean()),
      budgetRange: v.optional(v.string()),
      investmentLevel: v.optional(v.string()),
      timeline: v.optional(v.string()),
    })),
    relationshipContext: v.optional(v.object({
      currentStage: v.optional(v.string()),
      relationshipStrength: v.optional(v.string()),
      lastInteraction: v.optional(v.string()),
      sentiment: v.optional(v.union(
        v.literal("positive"),
        v.literal("neutral"),
        v.literal("negative")
      )),
    })),
    competitiveMentions: v.optional(v.array(v.object({
      competitor: v.optional(v.string()),
      context: v.optional(v.string()),
    }))),
    timeline: v.optional(v.object({
      urgency: v.optional(v.union(
        v.literal("high"),
        v.literal("medium"),
        v.literal("low")
      )),
      deadlines: v.optional(v.array(v.string())),
      milestones: v.optional(v.array(v.string())),
    })),
    templateSnippets: v.optional(v.object({
      opening: v.optional(v.string()),
      valueProposition: v.optional(v.string()),
      callToAction: v.optional(v.string()),
    })),
    confidence: v.number(),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if context already exists for this document
    const existing = await ctx.db
      .query("prospectingContext")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    
    const contextData = {
      documentId: args.documentId,
      clientId: args.clientId || undefined,
      projectId: args.projectId || undefined,
      extractedAt: new Date().toISOString(),
      keyPoints: args.keyPoints,
      painPoints: args.painPoints,
      opportunities: args.opportunities,
      decisionMakers: args.decisionMakers,
      businessContext: args.businessContext,
      financialContext: args.financialContext,
      relationshipContext: args.relationshipContext,
      competitiveMentions: args.competitiveMentions,
      timeline: args.timeline,
      templateSnippets: args.templateSnippets,
      confidence: args.confidence,
      tokensUsed: args.tokensUsed,
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, contextData);
      return existing._id;
    } else {
      return await ctx.db.insert("prospectingContext", contextData);
    }
  },
});

// Mutation: Delete prospecting context
export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const context = await ctx.db
      .query("prospectingContext")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();
    
    if (context) {
      await ctx.db.delete(context._id);
    }
  },
});

