import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// Query: Get all clients
export const list = query({
  args: {
    status: v.optional(v.union(
      v.literal("prospect"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("past")
    )),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("clients")
        .withIndex("by_status", (q) => q.eq("status", args.status))
        .collect();
    } else if (args.type) {
      return await ctx.db
        .query("clients")
        .withIndex("by_type", (q) => q.eq("type", args.type))
        .collect();
    }
    
    return await ctx.db.query("clients").collect();
  },
});

// Query: Get client by ID
export const get = query({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get clients by status (for prospects)
export const getByStatus = query({
  args: { status: v.union(
    v.literal("prospect"),
    v.literal("active"),
    v.literal("archived"),
    v.literal("past")
  ) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
  },
});

// Query: Get clients by type
export const getByType = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .collect();
  },
});

// Mutation: Create client
export const create = mutation({
  args: {
    name: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("prospect"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("past")
    )),
    companyName: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    industry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    enrichmentScore: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal("apollo"),
      v.literal("zoominfo"),
      v.literal("real-estate-db"),
      v.literal("manual"),
      v.literal("other")
    )),
    assignedTo: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const clientId = await ctx.db.insert("clients", {
      name: args.name,
      type: args.type,
      status: args.status || "prospect",
      companyName: args.companyName,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      country: args.country,
      phone: args.phone,
      email: args.email,
      website: args.website,
      industry: args.industry,
      tags: args.tags,
      notes: args.notes,
      enrichmentScore: args.enrichmentScore,
      source: args.source,
      assignedTo: args.assignedTo,
      metadata: args.metadata,
      createdAt: new Date().toISOString(),
    });
    return clientId;
  },
});

// Mutation: Update client
export const update = mutation({
  args: {
    id: v.id("clients"),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("prospect"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("past")
    )),
    companyName: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    industry: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    lastContactDate: v.optional(v.string()),
    enrichmentScore: v.optional(v.number()),
    source: v.optional(v.union(
      v.literal("apollo"),
      v.literal("zoominfo"),
      v.literal("real-estate-db"),
      v.literal("manual"),
      v.literal("other")
    )),
    assignedTo: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Client not found");
    }
    
    await ctx.db.patch(id, updates);
    return id;
  },
});

// Mutation: Migrate invalid fields to metadata (internal helper)
// Uses delete + insert to bypass validation issues with replace
export const migrateInvalidFields = internalMutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client) {
      throw new Error("Client not found");
    }
    
    const clientData = client as any;
    const validFieldNames = new Set([
      'name', 'createdAt', 'type', 'status', 'companyName', 'address', 'city', 
      'state', 'zip', 'country', 'phone', 'email', 'website', 'industry', 
      'tags', 'notes', 'lastContactDate', 'enrichmentScore', 'source', 
      'assignedTo', 'metadata', '_id', '_creationTime'
    ]);
    
    // Find invalid fields
    const invalidFields: string[] = [];
    for (const key in clientData) {
      if (!validFieldNames.has(key)) {
        invalidFields.push(key);
      }
    }
    
    if (invalidFields.length === 0) {
      return { migrated: false, invalidFields: [] };
    }
    
    // Migrate to metadata
    const existingMetadata = client.metadata || {};
    const migratedMetadata: any = { ...existingMetadata };
    
    for (const fieldName of invalidFields) {
      if (clientData[fieldName] !== undefined) {
        migratedMetadata[fieldName] = clientData[fieldName];
      }
    }
    
    // Build clean client with ONLY valid fields - construct from scratch
    // Use explicit field-by-field construction to ensure no invalid fields slip through
    const cleanClient: Record<string, any> = {};
    
    // Required fields - use String() to ensure type safety
    cleanClient.name = String(client.name);
    cleanClient.createdAt = String(client.createdAt);
    
    // Optional fields - only copy if they exist and are the right type
    // Use explicit property checks to avoid any prototype pollution
    const clientObj = client as Record<string, any>;
    
    if (clientObj.type !== undefined && typeof clientObj.type === 'string') {
      cleanClient.type = clientObj.type;
    }
    if (clientObj.status !== undefined && 
        (clientObj.status === 'prospect' || clientObj.status === 'active' || 
         clientObj.status === 'archived' || clientObj.status === 'past')) {
      cleanClient.status = clientObj.status;
    }
    if (clientObj.companyName !== undefined && typeof clientObj.companyName === 'string') {
      cleanClient.companyName = clientObj.companyName;
    }
    if (clientObj.address !== undefined && typeof clientObj.address === 'string') {
      cleanClient.address = clientObj.address;
    }
    if (clientObj.city !== undefined && typeof clientObj.city === 'string') {
      cleanClient.city = clientObj.city;
    }
    if (clientObj.state !== undefined && typeof clientObj.state === 'string') {
      cleanClient.state = clientObj.state;
    }
    if (clientObj.zip !== undefined && typeof clientObj.zip === 'string') {
      cleanClient.zip = clientObj.zip;
    }
    if (clientObj.country !== undefined && typeof clientObj.country === 'string') {
      cleanClient.country = clientObj.country;
    }
    if (clientObj.phone !== undefined && typeof clientObj.phone === 'string') {
      cleanClient.phone = clientObj.phone;
    }
    if (clientObj.email !== undefined && typeof clientObj.email === 'string') {
      cleanClient.email = clientObj.email;
    }
    if (clientObj.website !== undefined && typeof clientObj.website === 'string') {
      cleanClient.website = clientObj.website;
    }
    if (clientObj.industry !== undefined && typeof clientObj.industry === 'string') {
      cleanClient.industry = clientObj.industry;
    }
    if (clientObj.tags !== undefined && Array.isArray(clientObj.tags)) {
      cleanClient.tags = clientObj.tags;
    }
    if (clientObj.notes !== undefined && typeof clientObj.notes === 'string') {
      cleanClient.notes = clientObj.notes;
    }
    if (clientObj.lastContactDate !== undefined && typeof clientObj.lastContactDate === 'string') {
      cleanClient.lastContactDate = clientObj.lastContactDate;
    }
    if (clientObj.enrichmentScore !== undefined && typeof clientObj.enrichmentScore === 'number') {
      cleanClient.enrichmentScore = clientObj.enrichmentScore;
    }
    if (clientObj.source !== undefined && 
        (clientObj.source === 'apollo' || clientObj.source === 'zoominfo' || 
         clientObj.source === 'real-estate-db' || clientObj.source === 'manual' || 
         clientObj.source === 'other')) {
      cleanClient.source = clientObj.source;
    }
    if (clientObj.assignedTo !== undefined && typeof clientObj.assignedTo === 'string') {
      cleanClient.assignedTo = clientObj.assignedTo;
    }
    
    // Always include metadata with migrated fields
    cleanClient.metadata = migratedMetadata;
    
    // CRITICAL: Final validation - ensure NO invalid fields
    const cleanKeys = Object.keys(cleanClient);
    for (const key of cleanKeys) {
      if (!validFieldNames.has(key)) {
        throw new Error(`BUG: Invalid field "${key}" found in cleanClient before insert. This should never happen.`);
      }
    }
    
    // Log for debugging
    console.log('Inserting clean client. Keys:', cleanKeys, 'Has contactName?', 'contactName' in cleanClient);
    console.log('cleanClient object:', JSON.stringify(cleanClient, null, 2));
    
    // CRITICAL: Final check - create a completely fresh object with only valid fields
    // This ensures no prototype pollution or hidden properties
    const finalInsertObject: Record<string, any> = {};
    for (const key of cleanKeys) {
      if (validFieldNames.has(key)) {
        finalInsertObject[key] = cleanClient[key];
      }
    }
    
    // Verify finalInsertObject has no invalid fields
    const finalKeys = Object.keys(finalInsertObject);
    for (const key of finalKeys) {
      if (!validFieldNames.has(key)) {
        throw new Error(`CRITICAL BUG: Invalid field "${key}" in finalInsertObject. This should never happen.`);
      }
    }
    
    console.log('Final insert object keys:', finalKeys, 'Has contactName?', 'contactName' in finalInsertObject);
    
    // CRITICAL: Use delete + insert instead of replace to bypass validation
    // This is the only way to remove invalid fields when replace fails
    const oldId = args.id;
    
    // Query all references BEFORE deleting (we can't query after delete)
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_client", (q) => q.eq("clientId", oldId))
      .collect();
    
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_client", (q) => q.eq("clientId", oldId))
      .collect();
    
    const enrichments = await ctx.db
      .query("enrichmentSuggestions")
      .withIndex("by_client", (q) => q.eq("clientId", oldId))
      .collect();
    
    const allProjects = await ctx.db.query("projects").collect();
    const projectsToUpdate = allProjects.filter(p => 
      p.clientRoles.some(cr => cr.clientId === oldId)
    );
    
    // Delete the old document
    await ctx.db.delete(oldId);
    
    // Insert the clean document (creates new ID)
    // Use finalInsertObject which is guaranteed to have only valid fields
    const newId = await ctx.db.insert("clients", finalInsertObject as any);
    
    // Update all references to point to the new ID
    for (const doc of documents) {
      await ctx.db.patch(doc._id, { clientId: newId });
    }
    
    for (const contact of contacts) {
      await ctx.db.patch(contact._id, { clientId: newId });
    }
    
    for (const enrichment of enrichments) {
      await ctx.db.patch(enrichment._id, { clientId: newId });
    }
    
    for (const project of projectsToUpdate) {
      const updatedRoles = project.clientRoles.map(cr => 
        cr.clientId === oldId ? { ...cr, clientId: newId } : cr
      );
      await ctx.db.patch(project._id, { clientRoles: updatedRoles });
    }
    
    return { migrated: true, invalidFields, oldId, newId };
  },
});

// Mutation: Delete client
export const remove = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Query: Check if client exists by name
export const exists = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .collect();
    return clients.length > 0;
  },
});

// Query: Get client stats
export const getStats = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get projects for this client
    const allProjects = await ctx.db.query("projects").collect();
    const clientProjects = allProjects.filter(p => 
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );
    
    // Get documents for this client
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    
    const activeProjects = clientProjects.filter(p => p.status === "active");
    
    let lastActivity: string | undefined;
    if (documents.length > 0) {
      const sortedDocs = documents.sort((a, b) => 
        new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
      );
      lastActivity = sortedDocs[0].uploadedAt;
    }
    
    return {
      totalProjects: clientProjects.length,
      activeProjects: activeProjects.length,
      totalDocuments: documents.length,
      lastActivity,
    };
  },
});

