import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get requirement template by client type and level
export const getRequirementTemplate = query({
  args: {
    clientType: v.string(),
    level: v.union(v.literal("client"), v.literal("project")),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("knowledgeRequirementTemplates")
      .withIndex("by_client_type_level", (q) =>
        q.eq("clientType", args.clientType.toLowerCase()).eq("level", args.level)
      )
      .collect();

    // Return default template or first one
    return templates.find((t) => t.isDefault) || templates[0] || null;
  },
});

// Query: Get all requirement templates for a client type
export const getTemplatesByClientType = query({
  args: { clientType: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeRequirementTemplates")
      .withIndex("by_client_type", (q) =>
        q.eq("clientType", args.clientType.toLowerCase())
      )
      .collect();
  },
});

// Query: Get all checklist items for a client (including project-level)
export const getChecklistByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Enrich with linked document info
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const links = await ctx.db
          .query("knowledgeChecklistDocumentLinks")
          .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", item._id))
          .collect();

        const primaryDoc = links.find((l) => l.isPrimary);

        return {
          ...item,
          linkedDocumentCount: links.length,
          primaryDocument: primaryDoc
            ? {
                documentId: primaryDoc.documentId,
                documentName: primaryDoc.documentName,
                linkedAt: primaryDoc.linkedAt,
              }
            : null,
        };
      })
    );

    // Sort by category and order
    return enrichedItems.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.order - b.order;
    });
  },
});

// Query: Get checklist items for a specific project
export const getChecklistByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Enrich with linked document info
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const links = await ctx.db
          .query("knowledgeChecklistDocumentLinks")
          .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", item._id))
          .collect();

        const primaryDoc = links.find((l) => l.isPrimary);

        return {
          ...item,
          linkedDocumentCount: links.length,
          primaryDocument: primaryDoc
            ? {
                documentId: primaryDoc.documentId,
                documentName: primaryDoc.documentName,
                linkedAt: primaryDoc.linkedAt,
              }
            : null,
        };
      })
    );

    return enrichedItems.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.order - b.order;
    });
  },
});

// Query: Get only client-level items (no project)
export const getClientLevelChecklist = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Filter to only client-level items (no projectId)
    const clientItems = items.filter((item) => !item.projectId);

    // Enrich with linked document info
    const enrichedItems = await Promise.all(
      clientItems.map(async (item) => {
        const links = await ctx.db
          .query("knowledgeChecklistDocumentLinks")
          .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", item._id))
          .collect();

        const primaryDoc = links.find((l) => l.isPrimary);

        return {
          ...item,
          linkedDocumentCount: links.length,
          primaryDocument: primaryDoc
            ? {
                documentId: primaryDoc.documentId,
                documentName: primaryDoc.documentName,
                linkedAt: primaryDoc.linkedAt,
              }
            : null,
        };
      })
    );

    return enrichedItems.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.order - b.order;
    });
  },
});

// Query: Get missing items only (for a client or project)
export const getMissingItems = query({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    phaseFilter: v.optional(
      v.union(
        v.literal("indicative_terms"),
        v.literal("credit_submission"),
        v.literal("post_credit"),
        v.literal("always")
      )
    ),
  },
  handler: async (ctx, args) => {
    let items;
    if (args.projectId) {
      items = await ctx.db
        .query("knowledgeChecklistItems")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "missing")
        )
        .collect();
    } else {
      items = await ctx.db
        .query("knowledgeChecklistItems")
        .withIndex("by_client_status", (q) =>
          q.eq("clientId", args.clientId).eq("status", "missing")
        )
        .collect();
    }

    // Filter by phase if specified
    if (args.phaseFilter) {
      items = items.filter(
        (item) =>
          item.phaseRequired === args.phaseFilter ||
          item.phaseRequired === "always"
      );
    }

    return items.sort((a, b) => {
      // Sort by priority first (required > nice_to_have > optional)
      const priorityOrder = { required: 0, nice_to_have: 1, optional: 2 };
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.order - b.order;
    });
  },
});

// Query: Get checklist summary stats for a client
export const getChecklistSummary = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const allItems = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const clientItems = allItems.filter((item) => !item.projectId);
    const projectItems = allItems.filter((item) => item.projectId);

    const getStats = (items: typeof allItems) => ({
      total: items.length,
      fulfilled: items.filter((i) => i.status === "fulfilled").length,
      pendingReview: items.filter((i) => i.status === "pending_review").length,
      missing: items.filter((i) => i.status === "missing").length,
      required: items.filter((i) => i.priority === "required").length,
      requiredFulfilled: items.filter(
        (i) => i.priority === "required" && i.status === "fulfilled"
      ).length,
    });

    return {
      client: getStats(clientItems),
      projects: getStats(projectItems),
      overall: getStats(allItems),
      byCategory: allItems.reduce(
        (acc, item) => {
          if (!acc[item.category]) {
            acc[item.category] = { total: 0, fulfilled: 0, missing: 0 };
          }
          acc[item.category].total++;
          if (item.status === "fulfilled") acc[item.category].fulfilled++;
          if (item.status === "missing") acc[item.category].missing++;
          return acc;
        },
        {} as Record<string, { total: number; fulfilled: number; missing: number }>
      ),
    };
  },
});

// Query: Get email generation logs
export const getEmailLogs = query({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logs;
    if (args.projectId) {
      logs = await ctx.db
        .query("knowledgeEmailLogs")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .collect();
    } else {
      logs = await ctx.db
        .query("knowledgeEmailLogs")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .order("desc")
        .collect();
    }

    if (args.limit) {
      logs = logs.slice(0, args.limit);
    }

    return logs;
  },
});

// Query: Get last email generation time
export const getLastEmailGeneration = query({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("knowledgeEmailLogs")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .first();

    return logs?.generatedAt || null;
  },
});

// Query: Check if checklist exists for client
export const hasChecklist = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    return item !== null;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: Initialize checklist for a client from template
export const initializeChecklistForClient = mutation({
  args: {
    clientId: v.id("clients"),
    clientType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if checklist already exists
    const existing = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
    
    if (existing) {
      // Already initialized
      return { success: true, message: "Checklist already exists", created: 0 };
    }

    // Get client-level template
    const templates = await ctx.db
      .query("knowledgeRequirementTemplates")
      .withIndex("by_client_type_level", (q) =>
        q.eq("clientType", args.clientType.toLowerCase()).eq("level", "client")
      )
      .collect();

    const template = templates.find((t) => t.isDefault) || templates[0];

    if (!template) {
      return { success: false, message: "No template found for client type", created: 0 };
    }

    // Create checklist items from template
    let created = 0;
    for (const req of template.requirements) {
      await ctx.db.insert("knowledgeChecklistItems", {
        clientId: args.clientId,
        requirementTemplateId: template._id,
        requirementId: req.id,
        name: req.name,
        category: req.category,
        phaseRequired: req.phaseRequired,
        priority: req.priority,
        description: req.description,
        matchingDocumentTypes: req.matchingDocumentTypes,
        order: req.order,
        status: "missing",
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { success: true, message: `Created ${created} checklist items`, created };
  },
});

// Mutation: Initialize checklist for a project from template
export const initializeChecklistForProject = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.id("projects"),
    clientType: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if checklist already exists for this project
    const existing = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
    
    if (existing) {
      return { success: true, message: "Project checklist already exists", created: 0 };
    }

    // Get project-level template
    const templates = await ctx.db
      .query("knowledgeRequirementTemplates")
      .withIndex("by_client_type_level", (q) =>
        q.eq("clientType", args.clientType.toLowerCase()).eq("level", "project")
      )
      .collect();

    const template = templates.find((t) => t.isDefault) || templates[0];

    if (!template) {
      return { success: false, message: "No project template found for client type", created: 0 };
    }

    // Create checklist items from template
    let created = 0;
    for (const req of template.requirements) {
      await ctx.db.insert("knowledgeChecklistItems", {
        clientId: args.clientId,
        projectId: args.projectId,
        requirementTemplateId: template._id,
        requirementId: req.id,
        name: req.name,
        category: req.category,
        phaseRequired: req.phaseRequired,
        priority: req.priority,
        description: req.description,
        matchingDocumentTypes: req.matchingDocumentTypes,
        order: req.order,
        status: "missing",
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { success: true, message: `Created ${created} project checklist items`, created };
  },
});

// Mutation: Link a document to a requirement (manual) - DEPRECATED, use linkDocumentToChecklistItem
// Kept for backwards compatibility, redirects to new linking system
export const linkDocumentToRequirement = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
    documentId: v.id("documents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Get the document details
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    // Check if link already exists
    const existingLink = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();
    
    if (existingLink) {
      return { success: true };
    }

    // Check if this is the first link (will be primary)
    const existingLinks = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .collect();
    
    const isPrimary = existingLinks.length === 0;

    // Create the link in the new linking table
    await ctx.db.insert("knowledgeChecklistDocumentLinks", {
      checklistItemId: args.checklistItemId,
      documentId: args.documentId,
      documentName: document.fileName || "Unknown",
      linkedAt: now,
      linkedBy: args.userId,
      isPrimary,
    });

    // If first link, mark item as fulfilled
    if (isPrimary) {
      await ctx.db.patch(args.checklistItemId, {
        status: "fulfilled",
        suggestedDocumentId: undefined,
        suggestedDocumentName: undefined,
        suggestedConfidence: undefined,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

// Mutation: Confirm AI-suggested document link
export const confirmSuggestedLink = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) {
      throw new Error("Checklist item not found");
    }

    if (!item.suggestedDocumentId) {
      throw new Error("No suggested document to confirm");
    }

    // Get document name
    const document = await ctx.db.get(item.suggestedDocumentId);

    // Check if link already exists
    const existingLink = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .filter((q) => q.eq(q.field("documentId"), item.suggestedDocumentId))
      .first();

    if (!existingLink) {
      // Check if this is the first link (will be primary)
      const existingLinks = await ctx.db
        .query("knowledgeChecklistDocumentLinks")
        .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
        .collect();

      const isPrimary = existingLinks.length === 0;

      // Create the link in the new linking table
      await ctx.db.insert("knowledgeChecklistDocumentLinks", {
        checklistItemId: args.checklistItemId,
        documentId: item.suggestedDocumentId,
        documentName: document?.fileName || item.suggestedDocumentName || "Unknown",
        linkedAt: now,
        linkedBy: args.userId,
        isPrimary,
      });

      // If first link, mark item as fulfilled
      if (isPrimary) {
        await ctx.db.patch(args.checklistItemId, {
          status: "fulfilled",
          suggestedDocumentId: undefined,
          suggestedDocumentName: undefined,
          suggestedConfidence: undefined,
          updatedAt: now,
        });
      } else {
        // Just clear the suggestion
        await ctx.db.patch(args.checklistItemId, {
          suggestedDocumentId: undefined,
          suggestedDocumentName: undefined,
          suggestedConfidence: undefined,
          updatedAt: now,
        });
      }
    } else {
      // Link already exists, just clear the suggestion
      await ctx.db.patch(args.checklistItemId, {
        suggestedDocumentId: undefined,
        suggestedDocumentName: undefined,
        suggestedConfidence: undefined,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});

// Mutation: Reject AI-suggested document link
export const rejectSuggestedLink = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.checklistItemId, {
      suggestedDocumentId: undefined,
      suggestedDocumentName: undefined,
      suggestedConfidence: undefined,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// Mutation: Unlink a document from a requirement
// DEPRECATED: Use unlinkDocumentFromChecklistItem instead
// This removes ALL document links from a checklist item
export const unlinkDocument = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Find all links for this checklist item
    const links = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .collect();
    
    // Delete all links
    for (const link of links) {
      await ctx.db.delete(link._id);
    }
    
    // Mark item as missing
    await ctx.db.patch(args.checklistItemId, {
      status: "missing",
      updatedAt: now,
    });

    return { success: true };
  },
});

// Mutation: Add a custom requirement (manual)
export const addCustomRequirement = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    priority: v.union(
      v.literal("required"),
      v.literal("nice_to_have"),
      v.literal("optional")
    ),
    phaseRequired: v.optional(
      v.union(
        v.literal("indicative_terms"),
        v.literal("credit_submission"),
        v.literal("post_credit"),
        v.literal("always")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Get max order for this category
    const existingItems = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client_category", (q) =>
        q.eq("clientId", args.clientId).eq("category", args.category)
      )
      .collect();

    const maxOrder = existingItems.reduce(
      (max, item) => Math.max(max, item.order),
      0
    );

    const itemId = await ctx.db.insert("knowledgeChecklistItems", {
      clientId: args.clientId,
      projectId: args.projectId,
      name: args.name,
      category: args.category,
      description: args.description,
      priority: args.priority,
      phaseRequired: args.phaseRequired || "always",
      order: maxOrder + 1,
      status: "missing",
      isCustom: true,
      customSource: "manual",
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, itemId };
  },
});

// Mutation: Add custom requirements from LLM parsing
export const addCustomRequirementsFromLLM = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    requirements: v.array(
      v.object({
        name: v.string(),
        category: v.string(),
        description: v.optional(v.string()),
        priority: v.union(
          v.literal("required"),
          v.literal("nice_to_have"),
          v.literal("optional")
        ),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const createdIds: Id<"knowledgeChecklistItems">[] = [];

    for (const req of args.requirements) {
      // Get max order for this category
      const existingItems = await ctx.db
        .query("knowledgeChecklistItems")
        .withIndex("by_client_category", (q) =>
          q.eq("clientId", args.clientId).eq("category", req.category)
        )
        .collect();

      const maxOrder = existingItems.reduce(
        (max, item) => Math.max(max, item.order),
        0
      );

      const itemId = await ctx.db.insert("knowledgeChecklistItems", {
        clientId: args.clientId,
        projectId: args.projectId,
        name: req.name,
        category: req.category,
        description: req.description,
        priority: req.priority,
        phaseRequired: "always",
        order: maxOrder + 1,
        status: "missing",
        isCustom: true,
        customSource: "llm",
        createdAt: now,
        updatedAt: now,
      });

      createdIds.push(itemId);
    }

    return { success: true, createdIds, count: createdIds.length };
  },
});

// Mutation: Delete a custom requirement
export const deleteCustomRequirement = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) {
      throw new Error("Checklist item not found");
    }

    if (!item.isCustom) {
      throw new Error("Cannot delete template-based requirements");
    }

    await ctx.db.delete(args.checklistItemId);

    return { success: true };
  },
});

// Mutation: Update item status manually
export const updateItemStatus = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
    status: v.union(
      v.literal("missing"),
      v.literal("pending_review"),
      v.literal("fulfilled")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.checklistItemId, {
      status: args.status,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// Mutation: Set AI suggestion on a checklist item
export const setSuggestion = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
    documentId: v.id("documents"),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);
    
    await ctx.db.patch(args.checklistItemId, {
      status: "pending_review",
      suggestedDocumentId: args.documentId,
      suggestedDocumentName: document?.fileName,
      suggestedConfidence: args.confidence,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// Mutation: Log email generation
export const logEmailGeneration = mutation({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    userId: v.id("users"),
    missingItemIds: v.array(v.id("knowledgeChecklistItems")),
    emailContent: v.string(),
    recipientEmail: v.optional(v.string()),
    recipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const logId = await ctx.db.insert("knowledgeEmailLogs", {
      clientId: args.clientId,
      projectId: args.projectId,
      generatedAt: new Date().toISOString(),
      generatedBy: args.userId,
      missingItemIds: args.missingItemIds,
      emailContent: args.emailContent,
      recipientInfo: args.recipientEmail
        ? {
            email: args.recipientEmail,
            name: args.recipientName,
          }
        : undefined,
    });

    return { success: true, logId };
  },
});

// Mutation: Suggest document matches for checklist items
// Called after document upload to check for matches
export const suggestDocumentMatches = mutation({
  args: {
    clientId: v.id("clients"),
    documentId: v.id("documents"),
    documentType: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Get all missing checklist items for this client
    const checklistItems = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client_status", (q) =>
        q.eq("clientId", args.clientId).eq("status", "missing")
      )
      .collect();

    const document = await ctx.db.get(args.documentId);
    if (!document) return { success: false, matched: 0 };

    let matched = 0;

    for (const item of checklistItems) {
      // Check if document type matches any in the matching types
      if (item.matchingDocumentTypes?.length) {
        const docTypeLower = args.documentType.toLowerCase();
        const categoryLower = args.category.toLowerCase();

        const isMatch = item.matchingDocumentTypes.some((type) => {
          const typeLower = type.toLowerCase();
          return (
            docTypeLower.includes(typeLower) ||
            typeLower.includes(docTypeLower) ||
            categoryLower.includes(typeLower)
          );
        });

        if (isMatch) {
          await ctx.db.patch(item._id, {
            status: "pending_review",
            suggestedDocumentId: args.documentId,
            suggestedDocumentName: document.fileName,
            suggestedConfidence: 0.8, // Default confidence
            updatedAt: now,
          });
          matched++;
        }
      }
    }

    return { success: true, matched };
  },
});

// ============================================================================
// DOCUMENT-CHECKLIST LINKING (Many-to-Many)
// ============================================================================

// Mutation: Link a document to a checklist item
export const linkDocumentToChecklistItem = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
    documentId: v.id("documents"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if this link already exists
    const existingLink = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();
    
    if (existingLink) {
      return { success: true, linkId: existingLink._id, alreadyExists: true };
    }
    
    // Check if this is the first link (will be primary)
    const existingLinks = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .collect();
    
    const isPrimary = existingLinks.length === 0;
    const document = await ctx.db.get(args.documentId);
    
    if (!document) {
      throw new Error("Document not found");
    }
    
    // Create the link
    const linkId = await ctx.db.insert("knowledgeChecklistDocumentLinks", {
      checklistItemId: args.checklistItemId,
      documentId: args.documentId,
      documentName: document.fileName || "Unknown",
      linkedAt: now,
      linkedBy: args.userId,
      isPrimary,
    });
    
    // If first link, mark checklist item as fulfilled
    if (isPrimary) {
      await ctx.db.patch(args.checklistItemId, {
        status: "fulfilled",
        // Clear any pending suggestion
        suggestedDocumentId: undefined,
        suggestedDocumentName: undefined,
        suggestedConfidence: undefined,
        updatedAt: now,
      });
    }
    
    return { success: true, linkId, isPrimary };
  },
});

// Mutation: Unlink a document from a checklist item
export const unlinkDocumentFromChecklistItem = mutation({
  args: {
    checklistItemId: v.id("knowledgeChecklistItems"),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Find the link
    const link = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();
    
    if (!link) {
      return { success: false, message: "Link not found" };
    }
    
    const wasPrimary = link.isPrimary;
    
    // Delete the link
    await ctx.db.delete(link._id);
    
    // If this was the primary doc, check if there are other docs
    if (wasPrimary) {
      const remainingLinks = await ctx.db
        .query("knowledgeChecklistDocumentLinks")
        .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
        .collect();
      
      if (remainingLinks.length > 0) {
        // Promote the oldest remaining link to primary
        const oldestLink = remainingLinks.sort(
          (a, b) => new Date(a.linkedAt).getTime() - new Date(b.linkedAt).getTime()
        )[0];
        await ctx.db.patch(oldestLink._id, { isPrimary: true });
      } else {
        // No more links, mark item as missing
        await ctx.db.patch(args.checklistItemId, {
          status: "missing",
          updatedAt: now,
        });
      }
    }
    
    return { success: true };
  },
});

// Query: Get all documents linked to a checklist item
export const getLinkedDocuments = query({
  args: { checklistItemId: v.id("knowledgeChecklistItems") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", args.checklistItemId))
      .collect();
    
    // Sort with primary first, then by linkedAt
    return links.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return new Date(a.linkedAt).getTime() - new Date(b.linkedAt).getTime();
    });
  },
});

// Query: Get all checklist items a document is linked to
export const getChecklistItemsForDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("knowledgeChecklistDocumentLinks")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .collect();
    
    // Get the actual checklist item details
    const itemsWithDetails = await Promise.all(
      links.map(async (link) => {
        const item = await ctx.db.get(link.checklistItemId);
        return {
          ...link,
          checklistItem: item,
        };
      })
    );
    
    return itemsWithDetails.filter((i) => i.checklistItem !== null);
  },
});

// Query: Get all checklist items for a client (for filing UI)
export const getAllChecklistItemsForClient = query({
  args: {
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // Get client-level items (no projectId)
    const allClientItems = await ctx.db
      .query("knowledgeChecklistItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    
    const clientItems = allClientItems.filter((item) => !item.projectId);
    
    // Get project-level items if projectId provided
    let projectItems: typeof clientItems = [];
    if (args.projectId) {
      projectItems = await ctx.db
        .query("knowledgeChecklistItems")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    }
    
    // For each item, get linked document count
    const allItems = [...clientItems, ...projectItems];
    const itemsWithLinks = await Promise.all(
      allItems.map(async (item) => {
        const links = await ctx.db
          .query("knowledgeChecklistDocumentLinks")
          .withIndex("by_checklist_item", (q) => q.eq("checklistItemId", item._id))
          .collect();
        
        const primaryDoc = links.find((l) => l.isPrimary);
        
        return {
          ...item,
          linkedDocumentCount: links.length,
          primaryDocument: primaryDoc
            ? {
                documentId: primaryDoc.documentId,
                documentName: primaryDoc.documentName,
                linkedAt: primaryDoc.linkedAt,
              }
            : null,
        };
      })
    );
    
    // Sort by category and order
    return itemsWithLinks.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.order - b.order;
    });
  },
});

// ============================================================================
// KNOWLEDGE ITEMS - Flexible Intelligence Storage
// ============================================================================

// Query: Get all knowledge items for a client
export const getKnowledgeItemsByClient = query({
  args: {
    clientId: v.id("clients"),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("flagged"),
      v.literal("archived"),
      v.literal("superseded")
    )),
  },
  handler: async (ctx, args) => {
    let items;
    const category = args.category;

    if (category) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_category", (q) =>
          q.eq("clientId", args.clientId).eq("category", category)
        )
        .collect();
    } else {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    }

    // Filter by status if provided
    if (args.status) {
      items = items.filter((item) => item.status === args.status);
    } else {
      // Default: only return active items
      items = items.filter((item) => item.status === "active");
    }

    // Sort by category, then by field path
    return items.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.fieldPath.localeCompare(b.fieldPath);
    });
  },
});

// Query: Get all knowledge items for a project
export const getKnowledgeItemsByProject = query({
  args: {
    projectId: v.id("projects"),
    category: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("flagged"),
      v.literal("archived"),
      v.literal("superseded")
    )),
  },
  handler: async (ctx, args) => {
    let items;
    const category = args.category;

    if (category) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_category", (q) =>
          q.eq("projectId", args.projectId).eq("category", category)
        )
        .collect();
    } else {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    }

    // Filter by status
    if (args.status) {
      items = items.filter((item) => item.status === args.status);
    } else {
      items = items.filter((item) => item.status === "active");
    }

    return items.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.fieldPath.localeCompare(b.fieldPath);
    });
  },
});

// Query: Get a specific knowledge item by field path
export const getKnowledgeItemByField = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    fieldPath: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.clientId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", args.clientId).eq("fieldPath", args.fieldPath)
        )
        .collect();
      return items.find((item) => item.status === "active") || null;
    }

    if (args.projectId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", args.projectId).eq("fieldPath", args.fieldPath)
        )
        .collect();
      return items.find((item) => item.status === "active") || null;
    }

    return null;
  },
});

// Query: Get knowledge items by source document
export const getKnowledgeItemsByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knowledgeItems")
      .withIndex("by_source_document", (q) => q.eq("sourceDocumentId", args.documentId))
      .collect();
  },
});

// Query: Get knowledge item stats for a client/project
export const getKnowledgeStats = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    let items;

    if (args.clientId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.projectId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      return null;
    }

    const activeItems = items.filter((i) => i.status === "active");
    const canonicalItems = activeItems.filter((i) => i.isCanonical);
    const customItems = activeItems.filter((i) => !i.isCanonical);
    const flaggedItems = items.filter((i) => i.status === "flagged");

    // Group by category
    const byCategory = activeItems.reduce(
      (acc, item) => {
        if (!acc[item.category]) {
          acc[item.category] = { total: 0, canonical: 0, custom: 0 };
        }
        acc[item.category].total++;
        if (item.isCanonical) acc[item.category].canonical++;
        else acc[item.category].custom++;
        return acc;
      },
      {} as Record<string, { total: number; canonical: number; custom: number }>
    );

    return {
      total: activeItems.length,
      canonical: canonicalItems.length,
      custom: customItems.length,
      flagged: flaggedItems.length,
      byCategory,
    };
  },
});

// DEBUG: Get ALL knowledge items for a client (no filtering) to diagnose count mismatch
export const debugGetAllKnowledgeItems = query({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const allItems = await ctx.db
      .query("knowledgeItems")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    // Group by status and category for debugging
    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const activeByCategory: Record<string, number> = {};

    for (const item of allItems) {
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      if (item.status === "active") {
        activeByCategory[item.category] = (activeByCategory[item.category] || 0) + 1;
      }
    }

    return {
      totalItems: allItems.length,
      byStatus,
      byCategory,
      activeByCategory,
      items: allItems.map((i) => ({
        _id: i._id,
        fieldPath: i.fieldPath,
        category: i.category,
        status: i.status,
        label: i.label,
        isCanonical: i.isCanonical,
        projectId: i.projectId, // Check if some items have projectId too
      })),
    };
  },
});

// Valid categories for client-level intelligence (must match UI categories)
const VALID_CLIENT_CATEGORIES = ["contact", "company", "financial", "experience", "preferences", "relationships", "extracted", "insights", "custom"];
// Valid categories for project-level intelligence
const VALID_PROJECT_CATEGORIES = ["overview", "location", "financials", "timeline", "development", "parties", "planning", "extracted", "insights", "custom"];

// CLEANUP: Remove orphaned knowledge items with invalid categories
export const cleanupOrphanedKnowledgeItems = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
    dryRun: v.optional(v.boolean()), // If true, just report what would be deleted
  },
  handler: async (ctx, args) => {
    let items;

    if (args.clientId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else {
      // Get ALL knowledge items
      items = await ctx.db.query("knowledgeItems").collect();
    }

    const orphanedItems = items.filter((item) => {
      const isClientLevel = item.clientId && !item.projectId;
      const isProjectLevel = item.projectId;

      if (isClientLevel) {
        return !VALID_CLIENT_CATEGORIES.includes(item.category);
      } else if (isProjectLevel) {
        return !VALID_PROJECT_CATEGORIES.includes(item.category);
      }
      return false;
    });

    if (args.dryRun) {
      return {
        wouldDelete: orphanedItems.length,
        items: orphanedItems.map((i) => ({
          _id: i._id,
          category: i.category,
          fieldPath: i.fieldPath,
          label: i.label,
          status: i.status,
        })),
      };
    }

    // Actually delete the orphaned items
    for (const item of orphanedItems) {
      await ctx.db.delete(item._id);
    }

    return {
      deleted: orphanedItems.length,
      items: orphanedItems.map((i) => ({
        category: i.category,
        fieldPath: i.fieldPath,
        label: i.label,
      })),
    };
  },
});

// Query: Get field history (superseded versions) for a specific field path
export const getFieldHistory = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    fieldPath: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all items with this field path (both active and superseded)
    let items;

    if (args.projectId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", args.projectId).eq("fieldPath", args.fieldPath)
        )
        .collect();
    } else if (args.clientId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", args.clientId).eq("fieldPath", args.fieldPath)
        )
        .collect();
    } else {
      return [];
    }

    // Sort by addedAt descending (most recent first)
    // Active items first, then superseded
    return items.sort((a, b) => {
      // Active items come first
      if (a.status === "active" && b.status !== "active") return -1;
      if (a.status !== "active" && b.status === "active") return 1;
      // Then sort by date descending
      const dateA = a.addedAt ? new Date(a.addedAt).getTime() : 0;
      const dateB = b.addedAt ? new Date(b.addedAt).getTime() : 0;
      return dateB - dateA;
    });
  },
});

// Query: Check if a field has history (superseded versions)
export const hasFieldHistory = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    fieldPath: v.string(),
  },
  handler: async (ctx, args) => {
    let items;

    if (args.projectId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", args.projectId).eq("fieldPath", args.fieldPath)
        )
        .filter((q) => q.eq(q.field("status"), "superseded"))
        .take(1);
    } else if (args.clientId) {
      items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", args.clientId).eq("fieldPath", args.fieldPath)
        )
        .filter((q) => q.eq(q.field("status"), "superseded"))
        .take(1);
    } else {
      return false;
    }

    return items.length > 0;
  },
});

// Mutation: Add a knowledge item
export const addKnowledgeItem = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    fieldPath: v.string(),
    isCanonical: v.boolean(),
    category: v.string(),
    label: v.string(),
    value: v.any(),
    valueType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("currency"),
      v.literal("date"),
      v.literal("percentage"),
      v.literal("array"),
      v.literal("text"),
      v.literal("boolean")
    ),
    sourceType: v.union(
      v.literal("document"),
      v.literal("manual"),
      v.literal("ai_extraction"),
      v.literal("data_library"),
      v.literal("checklist")
    ),
    sourceDocumentId: v.optional(v.id("documents")),
    sourceDocumentName: v.optional(v.string()),
    sourceText: v.optional(v.string()),
    originalLabel: v.optional(v.string()),
    matchedAlias: v.optional(v.string()),
    normalizationConfidence: v.optional(v.number()),
    addedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if an active item with this field path already exists
    let existingItem = null;
    if (args.clientId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", args.clientId).eq("fieldPath", args.fieldPath)
        )
        .collect();
      existingItem = items.find((i) => i.status === "active");
    } else if (args.projectId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", args.projectId).eq("fieldPath", args.fieldPath)
        )
        .collect();
      existingItem = items.find((i) => i.status === "active");
    }

    // If exists, supersede it
    if (existingItem) {
      await ctx.db.patch(existingItem._id, {
        status: "superseded",
        updatedAt: now,
      });
    }

    // Create the new item
    const itemId = await ctx.db.insert("knowledgeItems", {
      clientId: args.clientId,
      projectId: args.projectId,
      fieldPath: args.fieldPath,
      isCanonical: args.isCanonical,
      category: args.category,
      label: args.label,
      value: args.value,
      valueType: args.valueType,
      sourceType: args.sourceType,
      sourceDocumentId: args.sourceDocumentId,
      sourceDocumentName: args.sourceDocumentName,
      sourceText: args.sourceText,
      originalLabel: args.originalLabel,
      matchedAlias: args.matchedAlias,
      normalizationConfidence: args.normalizationConfidence,
      status: "active",
      addedAt: now,
      updatedAt: now,
      addedBy: args.addedBy,
    });

    // If we superseded an item, link them
    if (existingItem) {
      await ctx.db.patch(existingItem._id, {
        supersededBy: itemId,
      });
    }

    return { success: true, itemId, superseded: existingItem?._id };
  },
});

// Mutation: Update a knowledge item value
export const updateKnowledgeItem = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
    value: v.any(),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    await ctx.db.patch(args.itemId, {
      value: args.value,
      updatedAt: now,
      addedBy: args.updatedBy, // Track who made the update
    });

    return { success: true };
  },
});

// Mutation: Archive a knowledge item
export const archiveKnowledgeItem = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: "archived",
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// Mutation: Flag a knowledge item for review
export const flagKnowledgeItem = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: "flagged",
      flagReason: args.reason,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// Mutation: Unflag a knowledge item (resolve flag)
export const unflagKnowledgeItem = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: "active",
      flagReason: undefined,
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// Mutation: Delete a knowledge item permanently
export const deleteKnowledgeItem = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.itemId);
    return { success: true };
  },
});

// Mutation: Bulk add knowledge items (from extraction)
export const bulkAddKnowledgeItems = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    items: v.array(v.object({
      fieldPath: v.string(),
      isCanonical: v.boolean(),
      category: v.string(),
      label: v.string(),
      value: v.any(),
      valueType: v.union(
        v.literal("string"),
        v.literal("number"),
        v.literal("currency"),
        v.literal("date"),
        v.literal("percentage"),
        v.literal("array"),
        v.literal("text"),
        v.literal("boolean")
      ),
      sourceType: v.union(
        v.literal("document"),
        v.literal("manual"),
        v.literal("ai_extraction"),
        v.literal("data_library"),
        v.literal("checklist")
      ),
      sourceDocumentId: v.optional(v.id("documents")),
      sourceDocumentName: v.optional(v.string()),
      sourceText: v.optional(v.string()),
      originalLabel: v.optional(v.string()),
      matchedAlias: v.optional(v.string()),
      normalizationConfidence: v.optional(v.number()),
    })),
    addedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const results: { added: number; superseded: number; skipped: number } = {
      added: 0,
      superseded: 0,
      skipped: 0,
    };

    for (const item of args.items) {
      // Check for existing active item with same field path
      let existingItem = null;
      if (args.clientId) {
        const items = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_client_field", (q) =>
            q.eq("clientId", args.clientId).eq("fieldPath", item.fieldPath)
          )
          .collect();
        existingItem = items.find((i) => i.status === "active");
      } else if (args.projectId) {
        const items = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_project_field", (q) =>
            q.eq("projectId", args.projectId).eq("fieldPath", item.fieldPath)
          )
          .collect();
        existingItem = items.find((i) => i.status === "active");
      }

      // If exists with same value, skip
      if (existingItem && JSON.stringify(existingItem.value) === JSON.stringify(item.value)) {
        results.skipped++;
        continue;
      }

      // If exists with different value, supersede
      if (existingItem) {
        await ctx.db.patch(existingItem._id, {
          status: "superseded",
          updatedAt: now,
        });
        results.superseded++;
      }

      // Create new item
      const itemId = await ctx.db.insert("knowledgeItems", {
        clientId: args.clientId,
        projectId: args.projectId,
        fieldPath: item.fieldPath,
        isCanonical: item.isCanonical,
        category: item.category,
        label: item.label,
        value: item.value,
        valueType: item.valueType,
        sourceType: item.sourceType,
        sourceDocumentId: item.sourceDocumentId,
        sourceDocumentName: item.sourceDocumentName,
        sourceText: item.sourceText,
        originalLabel: item.originalLabel,
        matchedAlias: item.matchedAlias,
        normalizationConfidence: item.normalizationConfidence,
        status: "active",
        addedAt: now,
        updatedAt: now,
        addedBy: args.addedBy,
      });

      // Link superseded item
      if (existingItem) {
        await ctx.db.patch(existingItem._id, {
          supersededBy: itemId,
        });
      }

      results.added++;
    }

    return { success: true, ...results };
  },
});

// ============================================================================
// INTELLIGENCE CONFLICTS
// ============================================================================

// Query: Get all conflicts for a client/project
export const getIntelligenceConflicts = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    status: v.optional(v.union(v.literal("pending"), v.literal("resolved"))),
  },
  handler: async (ctx, args) => {
    let conflicts;

    if (args.clientId) {
      conflicts = await ctx.db
        .query("intelligenceConflicts")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.projectId) {
      conflicts = await ctx.db
        .query("intelligenceConflicts")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      return [];
    }

    if (args.status) {
      conflicts = conflicts.filter((c) => c.status === args.status);
    }

    // Enrich with related items
    const enrichedConflicts = await Promise.all(
      conflicts.map(async (conflict) => {
        const relatedItems = await Promise.all(
          conflict.relatedItemIds.map((id) => ctx.db.get(id))
        );
        return {
          ...conflict,
          relatedItems: relatedItems.filter(Boolean),
        };
      })
    );

    return enrichedConflicts;
  },
});

// Mutation: Create a conflict
export const createIntelligenceConflict = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    fieldPath: v.string(),
    category: v.string(),
    description: v.string(),
    relatedItemIds: v.array(v.id("knowledgeItems")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const conflictId = await ctx.db.insert("intelligenceConflicts", {
      clientId: args.clientId,
      projectId: args.projectId,
      fieldPath: args.fieldPath,
      category: args.category,
      description: args.description,
      relatedItemIds: args.relatedItemIds,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Flag the related items
    for (const itemId of args.relatedItemIds) {
      await ctx.db.patch(itemId, {
        status: "flagged",
        flagReason: `Conflict: ${args.description}`,
        updatedAt: now,
      });
    }

    return { success: true, conflictId };
  },
});

// Mutation: Resolve a conflict
export const resolveIntelligenceConflict = mutation({
  args: {
    conflictId: v.id("intelligenceConflicts"),
    winnerId: v.id("knowledgeItems"),
    resolvedBy: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const conflict = await ctx.db.get(args.conflictId);
    if (!conflict) {
      throw new Error("Conflict not found");
    }

    // Mark the winner as active, others as superseded
    for (const itemId of conflict.relatedItemIds) {
      if (itemId === args.winnerId) {
        await ctx.db.patch(itemId, {
          status: "active",
          flagReason: undefined,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(itemId, {
          status: "superseded",
          supersededBy: args.winnerId,
          flagReason: undefined,
          updatedAt: now,
        });
      }
    }

    // Update the conflict
    await ctx.db.patch(args.conflictId, {
      status: "resolved",
      resolution: {
        winnerId: args.winnerId,
        resolvedBy: args.resolvedBy,
        resolvedAt: now,
        reason: args.reason,
      },
      updatedAt: now,
    });

    return { success: true };
  },
});

// ============================================================================
// CHECKLIST FIELD-BASED PROGRESS TRACKING (Sprint 3)
// ============================================================================

/**
 * Maps checklist item names to the canonical fields they typically provide.
 * Duplicated from src/lib/canonicalFields.ts for Convex backend use.
 */
const CHECKLIST_FIELD_HINTS: Record<string, string[]> = {
  // Client documents
  'Company Search': ['company.name', 'company.registrationNumber', 'company.incorporationDate', 'company.registeredAddress', 'company.directors', 'company.shareholders', 'company.companyType', 'company.sicCode'],
  'Proof of Address': ['contact.personalAddress', 'company.registeredAddress'],
  'Passport/ID': ['contact.primaryName', 'contact.nationality'],
  'Passport': ['contact.primaryName', 'contact.nationality'],
  'ID': ['contact.primaryName', 'contact.nationality'],
  'Photo ID': ['contact.primaryName', 'contact.nationality'],
  'Financial Statement': ['financial.netWorth', 'financial.liquidAssets', 'financial.annualIncome', 'financial.existingDebt'],
  'Personal Financial Statement': ['financial.netWorth', 'financial.liquidAssets', 'financial.annualIncome', 'financial.existingDebt', 'financial.propertyPortfolioValue'],
  'Bank Statements': ['financial.bankName', 'financial.liquidAssets'],
  'Bank Statement': ['financial.bankName', 'financial.liquidAssets'],
  'Tax Returns': ['financial.annualIncome'],
  'CV': ['experience.developmentHistory', 'experience.projectsCompleted', 'experience.totalGDV', 'experience.specializations'],
  'Track Record': ['experience.developmentHistory', 'experience.projectsCompleted', 'experience.totalGDV', 'experience.geographicFocus'],
  // Project documents
  'Development Appraisal': ['financials.gdv', 'financials.totalDevelopmentCost', 'financials.constructionCost', 'financials.profitMargin', 'financials.purchasePrice', 'overview.unitCount'],
  'Appraisal': ['financials.gdv', 'financials.totalDevelopmentCost', 'financials.constructionCost', 'financials.profitMargin'],
  'Valuation Report': ['financials.currentValue', 'financials.gdv', 'location.siteAddress'],
  'Valuation': ['financials.currentValue', 'financials.gdv'],
  'Title Documents': ['location.titleNumber', 'location.siteAddress'],
  'Title': ['location.titleNumber', 'location.siteAddress'],
  'Land Registry': ['location.titleNumber', 'location.siteAddress'],
  'Planning Permission': ['timeline.planningStatus', 'overview.unitCount', 'overview.totalSqft'],
  'Planning': ['timeline.planningStatus', 'overview.unitCount'],
  'Schedule of Works': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion', 'timeline.projectDuration'],
  'Build Contract': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion'],
  'JCT Contract': ['financials.constructionCost', 'timeline.constructionStart', 'timeline.practicalCompletion'],
  'Heads of Terms': ['financials.loanAmount', 'financials.ltv', 'financials.ltc', 'timeline.projectDuration'],
  'Term Sheet': ['financials.loanAmount', 'financials.ltv', 'financials.ltc', 'timeline.projectDuration'],
  'Facility Agreement': ['financials.loanAmount', 'financials.ltv', 'financials.ltc', 'timeline.projectDuration'],
  'Sales Evidence': ['financials.gdv', 'overview.unitCount'],
  'Comparables': ['financials.gdv', 'financials.currentValue'],
};

/**
 * Get expected field hints for a checklist item name
 */
function getFieldHintsForChecklistItem(name: string): string[] {
  // Try exact match first
  if (CHECKLIST_FIELD_HINTS[name]) {
    return CHECKLIST_FIELD_HINTS[name];
  }

  // Try partial match
  const normalizedName = name.toLowerCase();
  for (const [key, hints] of Object.entries(CHECKLIST_FIELD_HINTS)) {
    if (normalizedName.includes(key.toLowerCase()) || key.toLowerCase().includes(normalizedName)) {
      return hints;
    }
  }

  return [];
}

// Query: Get checklist progress with field-based tracking
export const getChecklistFieldProgress = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // Get checklist items
    let checklistItems: Doc<"knowledgeChecklistItems">[] = [];
    if (args.projectId) {
      checklistItems = await ctx.db
        .query("knowledgeChecklistItems")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
    } else if (args.clientId) {
      // Get client-level items (no project)
      const allItems = await ctx.db
        .query("knowledgeChecklistItems")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
      checklistItems = allItems.filter((item) => !item.projectId);
    } else {
      return { items: [], summary: { total: 0, fulfilled: 0, partiallyFilled: 0, missing: 0, totalExpectedFields: 0, totalFilledFields: 0 } };
    }

    // Get all knowledge items for this client/project
    let knowledgeItems: Doc<"knowledgeItems">[] = [];
    if (args.projectId) {
      knowledgeItems = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
    } else if (args.clientId) {
      knowledgeItems = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .collect();
    }

    // Filter to active items only
    const activeKnowledgeItems = knowledgeItems.filter((item) => item.status === "active");
    const filledFieldPaths = new Set(activeKnowledgeItems.map((item) => item.fieldPath));

    // Compute progress for each checklist item
    const progressItems = checklistItems.map((item) => {
      const expectedFields = getFieldHintsForChecklistItem(item.name);
      const filledFields = expectedFields.filter((field) => filledFieldPaths.has(field));
      const totalExpected = expectedFields.length;
      const totalFilled = filledFields.length;

      return {
        _id: item._id,
        name: item.name,
        category: item.category,
        status: item.status,
        priority: item.priority,
        expectedFields,
        filledFields,
        fieldProgress: {
          total: totalExpected,
          filled: totalFilled,
          percentage: totalExpected > 0 ? Math.round((totalFilled / totalExpected) * 100) : 0,
        },
        // Enhanced status based on field progress
        effectiveStatus: totalExpected === 0
          ? item.status // No fields expected, use original status
          : totalFilled === totalExpected
            ? "fulfilled"
            : totalFilled > 0
              ? "partially_filled"
              : "missing",
      };
    });

    // Compute summary
    const summary = {
      total: progressItems.length,
      fulfilled: progressItems.filter((i) => i.effectiveStatus === "fulfilled").length,
      partiallyFilled: progressItems.filter((i) => i.effectiveStatus === "partially_filled").length,
      missing: progressItems.filter((i) => i.effectiveStatus === "missing").length,
      // Field-level summary
      totalExpectedFields: progressItems.reduce((sum, i) => sum + i.fieldProgress.total, 0),
      totalFilledFields: progressItems.reduce((sum, i) => sum + i.fieldProgress.filled, 0),
    };

    return {
      items: progressItems.sort((a, b) => {
        // Sort by category, then status (missing first), then name
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        const statusOrder = { missing: 0, partially_filled: 1, fulfilled: 2, pending_review: 1 };
        const aOrder = statusOrder[a.effectiveStatus as keyof typeof statusOrder] ?? 2;
        const bOrder = statusOrder[b.effectiveStatus as keyof typeof statusOrder] ?? 2;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      }),
      summary,
    };
  },
});

// ============================================================================
// CONSOLIDATION MUTATIONS (Sprint 4)
// ============================================================================

// Mutation: Apply duplicate resolution - archive duplicates
export const applyDuplicateResolution = mutation({
  args: {
    keepId: v.id("knowledgeItems"),
    removeIds: v.array(v.id("knowledgeItems")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Verify the keep item exists and is active
    const keepItem = await ctx.db.get(args.keepId);
    if (!keepItem || keepItem.status !== "active") {
      throw new Error("Item to keep not found or not active");
    }

    // Archive the duplicates
    let archived = 0;
    for (const removeId of args.removeIds) {
      const item = await ctx.db.get(removeId);
      if (item && item.status === "active") {
        await ctx.db.patch(removeId, {
          status: "superseded",
          supersededBy: args.keepId,
          updatedAt: now,
        });
        archived++;
      }
    }

    return { success: true, archived, keptId: args.keepId };
  },
});

// Mutation: Reclassify a custom field to canonical
export const reclassifyToCanonical = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
    newFieldPath: v.string(),
    newLabel: v.string(),
    newCategory: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check if there's already an active item at the new path
    let existingItem = null;
    if (item.clientId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", item.clientId).eq("fieldPath", args.newFieldPath)
        )
        .collect();
      existingItem = items.find((i) => i.status === "active" && i._id !== args.itemId);
    } else if (item.projectId) {
      const items = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", item.projectId).eq("fieldPath", args.newFieldPath)
        )
        .collect();
      existingItem = items.find((i) => i.status === "active" && i._id !== args.itemId);
    }

    // If existing, supersede it
    if (existingItem) {
      await ctx.db.patch(existingItem._id, {
        status: "superseded",
        supersededBy: args.itemId,
        updatedAt: now,
      });
    }

    // Update the item with canonical path
    await ctx.db.patch(args.itemId, {
      fieldPath: args.newFieldPath,
      label: args.newLabel,
      category: args.newCategory,
      isCanonical: true,
      updatedAt: now,
    });

    return {
      success: true,
      previousPath: item.fieldPath,
      newPath: args.newFieldPath,
      supersededExisting: !!existingItem,
    };
  },
});

// Mutation: Bulk apply consolidation results
export const applyConsolidation = mutation({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    duplicateResolutions: v.array(
      v.object({
        keepId: v.id("knowledgeItems"),
        removeIds: v.array(v.id("knowledgeItems")),
      })
    ),
    reclassifications: v.array(
      v.object({
        itemId: v.id("knowledgeItems"),
        newFieldPath: v.string(),
        newLabel: v.string(),
        newCategory: v.string(),
      })
    ),
    createConflicts: v.array(
      v.object({
        fieldPath: v.string(),
        category: v.string(),
        description: v.string(),
        relatedItemIds: v.array(v.id("knowledgeItems")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const results = {
      duplicatesResolved: 0,
      itemsArchived: 0,
      itemsReclassified: 0,
      conflictsCreated: 0,
    };

    // Apply duplicate resolutions
    for (const dup of args.duplicateResolutions) {
      const keepItem = await ctx.db.get(dup.keepId);
      if (!keepItem || keepItem.status !== "active") continue;

      for (const removeId of dup.removeIds) {
        const item = await ctx.db.get(removeId);
        if (item && item.status === "active") {
          await ctx.db.patch(removeId, {
            status: "superseded",
            supersededBy: dup.keepId,
            updatedAt: now,
          });
          results.itemsArchived++;
        }
      }
      results.duplicatesResolved++;
    }

    // Apply reclassifications
    for (const reclassify of args.reclassifications) {
      const item = await ctx.db.get(reclassify.itemId);
      if (!item || item.status !== "active") continue;

      // Check for existing item at new path
      let existingItem = null;
      if (args.clientId) {
        const items = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_client_field", (q) =>
            q.eq("clientId", args.clientId).eq("fieldPath", reclassify.newFieldPath)
          )
          .collect();
        existingItem = items.find((i) => i.status === "active" && i._id !== reclassify.itemId);
      } else if (args.projectId) {
        const items = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_project_field", (q) =>
            q.eq("projectId", args.projectId).eq("fieldPath", reclassify.newFieldPath)
          )
          .collect();
        existingItem = items.find((i) => i.status === "active" && i._id !== reclassify.itemId);
      }

      if (existingItem) {
        await ctx.db.patch(existingItem._id, {
          status: "superseded",
          supersededBy: reclassify.itemId,
          updatedAt: now,
        });
        results.itemsArchived++;
      }

      await ctx.db.patch(reclassify.itemId, {
        fieldPath: reclassify.newFieldPath,
        label: reclassify.newLabel,
        category: reclassify.newCategory,
        isCanonical: true,
        updatedAt: now,
      });
      results.itemsReclassified++;
    }

    // Create conflicts
    for (const conflict of args.createConflicts) {
      // Check if conflict already exists
      let existingConflict = null;
      if (args.clientId) {
        const conflicts = await ctx.db
          .query("intelligenceConflicts")
          .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
          .collect();
        existingConflict = conflicts.find(
          (c) => c.fieldPath === conflict.fieldPath && c.status === "pending"
        );
      } else if (args.projectId) {
        const conflicts = await ctx.db
          .query("intelligenceConflicts")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect();
        existingConflict = conflicts.find(
          (c) => c.fieldPath === conflict.fieldPath && c.status === "pending"
        );
      }

      if (!existingConflict) {
        await ctx.db.insert("intelligenceConflicts", {
          clientId: args.clientId,
          projectId: args.projectId,
          fieldPath: conflict.fieldPath,
          category: conflict.category,
          description: conflict.description,
          relatedItemIds: conflict.relatedItemIds,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });

        // Flag the related items
        for (const itemId of conflict.relatedItemIds) {
          await ctx.db.patch(itemId, {
            status: "flagged",
            flagReason: `Conflict detected: ${conflict.description}`,
            updatedAt: now,
          });
        }
        results.conflictsCreated++;
      }
    }

    return { success: true, ...results };
  },
});

// ============================================================================
// TEST UTILITIES (for development/testing only)
// ============================================================================

// Mutation: Reactivate a superseded item (TEST ONLY)
export const _testReactivateItem = mutation({
  args: {
    itemId: v.id("knowledgeItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    await ctx.db.patch(args.itemId, {
      status: "active",
      supersededBy: undefined,
      updatedAt: new Date().toISOString(),
    });

    return { success: true, reactivated: args.itemId };
  },
});
