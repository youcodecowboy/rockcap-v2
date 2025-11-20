import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get all emails
export const list = query({
  args: {
    prospectId: v.optional(v.id("clients")),
    clientId: v.optional(v.id("clients")),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("bounced")
    )),
  },
  handler: async (ctx, args) => {
    let emails;
    
    if (args.prospectId) {
      emails = await ctx.db
        .query("prospectingEmails")
        .withIndex("by_prospect", (q: any) => q.eq("prospectId", args.prospectId))
        .collect();
    } else if (args.clientId) {
      emails = await ctx.db
        .query("prospectingEmails")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.status) {
      emails = await ctx.db
        .query("prospectingEmails")
        .withIndex("by_status", (q: any) => q.eq("status", args.status!))
        .collect();
    } else {
      emails = await ctx.db.query("prospectingEmails").collect();
    }
    
    return emails.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Query: Get email by ID
export const get = query({
  args: { id: v.id("prospectingEmails") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get email drafts
export const getDrafts = query({
  args: {
    prospectId: v.optional(v.id("clients")),
  },
  handler: async (ctx, args) => {
    let emails;
    
    if (args.prospectId) {
      emails = await ctx.db
        .query("prospectingEmails")
        .withIndex("by_prospect", (q: any) => q.eq("prospectId", args.prospectId))
        .collect();
    } else {
      emails = await ctx.db
        .query("prospectingEmails")
        .withIndex("by_status", (q: any) => q.eq("status", "draft" as const))
        .collect();
    }
    
    return emails.filter(e => 
      e.status === "draft" || e.status === "pending_approval"
    );
  },
});

// Query: Get emails by prospect
export const getByProspect = query({
  args: { prospectId: v.id("clients") },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("prospectingEmails")
      .withIndex("by_prospect", (q: any) => q.eq("prospectId", args.prospectId))
      .collect();
    return emails.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Query: Get emails by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("prospectingEmails")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
    return emails.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },
});

// Mutation: Create email draft
export const create = mutation({
  args: {
    prospectId: v.optional(v.id("clients")),
    clientId: v.optional(v.id("clients")),
    templateId: v.optional(v.id("emailTemplates")),
    subject: v.string(),
    body: v.string(),
    enrichmentSummary: v.optional(v.object({
      keyPoints: v.optional(v.array(v.string())),
      painPoints: v.optional(v.array(v.string())),
      opportunities: v.optional(v.array(v.string())),
      usedSnippets: v.optional(v.array(v.string())),
    })),
    scheduledFor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const emailId = await ctx.db.insert("prospectingEmails", {
      prospectId: args.prospectId,
      clientId: args.clientId,
      templateId: args.templateId,
      subject: args.subject,
      body: args.body,
      status: "draft",
      enrichmentSummary: args.enrichmentSummary,
      scheduledFor: args.scheduledFor,
      createdAt: new Date().toISOString(),
    });
    return emailId;
  },
});

// Mutation: Update email
export const update = mutation({
  args: {
    id: v.id("prospectingEmails"),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("pending_approval"),
      v.literal("approved"),
      v.literal("sent"),
      v.literal("bounced")
    )),
    enrichmentSummary: v.optional(v.object({
      keyPoints: v.optional(v.array(v.string())),
      painPoints: v.optional(v.array(v.string())),
      opportunities: v.optional(v.array(v.string())),
      usedSnippets: v.optional(v.array(v.string())),
    })),
    scheduledFor: v.optional(v.string()),
    sentAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Email not found");
    }
    
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    return id;
  },
});

// Mutation: Approve email (mark as sent)
export const approve = mutation({
  args: { id: v.id("prospectingEmails") },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email) {
      throw new Error("Email not found");
    }
    
    await ctx.db.patch(args.id, {
      status: "sent",
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return args.id;
  },
});

// Mutation: Delete email
export const remove = mutation({
  args: { id: v.id("prospectingEmails") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Get recent emails
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    const allEmails = await ctx.db.query("prospectingEmails").collect();
    const sorted = allEmails.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.slice(0, limit);
  },
});

