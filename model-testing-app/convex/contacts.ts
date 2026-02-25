import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query: Get contacts by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});

// Query: Get contacts by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});

// Query: Get all contacts
export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("contacts").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
  },
});

// Query: Get contact by ID with associated companies and deals
export const get = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.id);
    if (!contact || contact.isDeleted) return null;
    
    // Fetch associated companies
    const companies = contact.linkedCompanyIds 
      ? await Promise.all(contact.linkedCompanyIds.map((id: any) => ctx.db.get(id)))
      : [];
    
    // Fetch associated deals
    const deals = contact.linkedDealIds
      ? await Promise.all(contact.linkedDealIds.map((id: any) => ctx.db.get(id)))
      : [];
    
    return {
      ...contact,
      companies: companies.filter(c => c !== null),
      deals: deals.filter(d => d !== null),
    };
  },
});

// Mutation: Create contact
export const create = mutation({
  args: {
    name: v.string(),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    sourceDocumentId: v.optional(v.id("documents")),
    linkedCompanyIds: v.optional(v.array(v.id("companies"))),
  },
  handler: async (ctx, args) => {
    const contactId = await ctx.db.insert("contacts", {
      name: args.name,
      role: args.role,
      email: args.email,
      phone: args.phone,
      company: args.company,
      notes: args.notes,
      clientId: args.clientId,
      projectId: args.projectId,
      sourceDocumentId: args.sourceDocumentId,
      linkedCompanyIds: args.linkedCompanyIds || [],
      createdAt: new Date().toISOString(),
    });

    // Update linked companies to include this contact
    if (args.linkedCompanyIds && args.linkedCompanyIds.length > 0) {
      for (const companyId of args.linkedCompanyIds) {
        const company = await ctx.db.get(companyId);
        if (company) {
          const existingContactIds = company.linkedContactIds || [];
          if (!existingContactIds.includes(contactId)) {
            await ctx.db.patch(companyId, {
              linkedContactIds: [...existingContactIds, contactId],
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    return contactId;
  },
});

// Mutation: Update contact
export const update = mutation({
  args: {
    id: v.id("contacts"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Contact not found");
    }
    
    await ctx.db.patch(id, updates);
    return id;
  },
});

// Mutation: Delete contact
export const remove = mutation({
  args: { id: v.id("contacts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedReason: "user_deleted",
    });
  },
});

