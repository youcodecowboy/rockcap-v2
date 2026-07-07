import { v } from "convex/values";
import { anyApi } from "convex/server";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { backfillContactClientLinks } from "./contacts";
import { INTEL_STALE_DAYS } from "./lib/pipelineStages";

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
        .withIndex("by_status", (q: any) => q.eq("status", args.status!))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
    } else if (args.type) {
      return await ctx.db
        .query("clients")
        .withIndex("by_type", (q: any) => q.eq("type", args.type))
        .filter((q) => q.neq(q.field("isDeleted"), true))
        .collect();
    }

    return await ctx.db.query("clients").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
  },
});

// Query: Get client by ID (returns deleted clients too — UI shows restoration banner)
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
      .withIndex("by_status", (q: any) => q.eq("status", args.status))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});

// Query: Get clients by type
export const getByType = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clients")
      .withIndex("by_type", (q: any) => q.eq("type", args.type))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
  },
});

// Fallback client folder structure (used when no template exists)
const FALLBACK_CLIENT_FOLDERS = [
  { name: "Background", folderKey: "background", order: 1 },
  { name: "KYC", folderKey: "kyc", parentKey: "background", order: 2 },
  { name: "Background Docs", folderKey: "background_docs", parentKey: "background", order: 3 },
  { name: "Miscellaneous", folderKey: "miscellaneous", order: 4 },
];

// Shared bootstrap path for a newly-inserted client: creates template folders,
// schedules intelligence initialization, schedules checklist initialization.
// Both `create` and `createWithPromotion` call this so a mobile-created client
// gets the same base infrastructure as a web-created one.
async function bootstrapNewClient(
  ctx: any,
  clientId: Id<"clients">,
  type: string | undefined
) {
  const clientType = (type || "borrower").toLowerCase();
  const now = new Date().toISOString();

  const templates = await ctx.db
    .query("folderTemplates")
    .withIndex("by_client_type_level", (q: any) =>
      q.eq("clientType", clientType).eq("level", "client")
    )
    .collect();

  const folderTemplate =
    templates.find((t: any) => t.isDefault) || templates[0];
  const folders = folderTemplate?.folders || FALLBACK_CLIENT_FOLDERS;
  const sortedFolders = [...folders].sort(
    (a: any, b: any) => a.order - b.order
  );

  const folderIdMap: Record<string, any> = {};

  // First pass: parent folders (no parentKey)
  for (const folder of sortedFolders) {
    if (!folder.parentKey) {
      const folderId = await ctx.db.insert("clientFolders", {
        clientId,
        folderType: folder.folderKey as any,
        name: folder.name,
        depth: 0,
        createdAt: now,
      });
      folderIdMap[folder.folderKey] = folderId;
    }
  }

  // Second pass: child folders (with parentKey)
  for (const folder of sortedFolders) {
    if (folder.parentKey && folderIdMap[folder.parentKey]) {
      await ctx.db.insert("clientFolders", {
        clientId,
        folderType: folder.folderKey as any,
        name: folder.name,
        parentFolderId: folderIdMap[folder.parentKey],
        depth: 1,
        createdAt: now,
      });
    }
  }

  // anyApi: clients.ts is part of the generated `api` type cycle; resolving
  // `api` member types here trips TS2589 (instantiation depth). ctx is already
  // untyped in this helper, so the shallow reference loses nothing.
  await ctx.scheduler.runAfter(0, anyApi.intelligence.initializeClientIntelligence, {
    clientId,
    clientType,
  });

  await ctx.scheduler.runAfter(0, anyApi.knowledgeLibrary.initializeChecklistForClient, {
    clientId,
    clientType,
  });
}

// ── Backfill (one-off) ──────────────────────────────────────────
//
// Mobile-created clients from before commit 0b52853 (2026-04-20) were
// inserted via createWithPromotion without hitting the bootstrap helper,
// so they have no rows in clientFolders (and no intelligence / checklist
// init). These two functions power scripts/backfill-client-folders.ts —
// the query enumerates candidates, the mutation safely re-runs bootstrap
// for one client at a time.

export const listMissingFolders = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Pull all live clients first; join against clientFolders rather
    // than doing N queries. Table size is small (~hundreds), so
    // .collect() on both is fine for a one-off backfill.
    const allClients = await ctx.db
      .query("clients")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    const allFolders = await ctx.db.query("clientFolders").collect();
    const clientsWithFolders = new Set(
      allFolders.map((f) => String(f.clientId)),
    );
    return allClients
      .filter((c) => !clientsWithFolders.has(String(c._id)))
      .map((c) => ({
        clientId: c._id,
        name: c.name,
        type: c.type ?? "borrower",
        status: c.status ?? "unknown",
        createdAt: c.createdAt,
        hubspotCompanyId: (c as any).hubspotCompanyId,
      }));
  },
});

export const backfillClientBootstrap = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { bootstrapped: true }
    | { skipped: "not_found" | "folders_exist" | "deleted" }
  > => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return { skipped: "not_found" };
    if ((client as any).isDeleted === true) return { skipped: "deleted" };
    // Idempotency: if any folders already exist for this client, treat
    // it as already-bootstrapped. Prevents duplicate inserts on re-run.
    const anyFolder = await ctx.db
      .query("clientFolders")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .first();
    if (anyFolder) return { skipped: "folders_exist" };
    await bootstrapNewClient(ctx, args.clientId, client.type);
    return { bootstrapped: true };
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

    await bootstrapNewClient(ctx, clientId, args.type);

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

    // Invalidate context cache for this client
    // @ts-ignore - TypeScript has issues with deep type instantiation for Convex scheduler
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "client",
      contextId: id,
    });

    return id;
  },
});

// Mutation: Update client stage note
export const updateStageNote = mutation({
  args: {
    id: v.id("clients"),
    stageNote: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Client not found");
    }

    const now = new Date().toISOString();

    await ctx.db.patch(args.id, {
      stageNote: args.stageNote,
      stageNoteUpdatedAt: now,
    });

    return args.id;
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
      .withIndex("by_client", (q: any) => q.eq("clientId", oldId))
      .collect();
    
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_client", (q: any) => q.eq("clientId", oldId))
      .collect();
    
    const enrichments = await ctx.db
      .query("enrichmentSuggestions")
      .withIndex("by_client", (q: any) => q.eq("clientId", oldId))
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
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }

    const now = new Date().toISOString();

    // Soft-delete the client
    await ctx.db.patch(args.id, {
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
      deletedReason: "user_deleted",
    });

    // Cascade: soft-delete all non-deleted projects belonging to this client
    const allProjects = await ctx.db.query("projects")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const clientProjects = allProjects.filter((p) =>
      p.clientRoles?.some((cr: any) => cr.clientId === args.id)
    );

    for (const project of clientProjects) {
      await ctx.db.patch(project._id, {
        isDeleted: true,
        deletedAt: now,
        deletedBy: userId,
        deletedReason: "parent_client_deleted",
      });

      // Invalidate project cache
      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: project._id,
      });
    }

    // Invalidate client cache
    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "client",
      contextId: args.id,
    });
  },
});

// Query: Check if client exists by name
export const exists = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_name", (q: any) => q.eq("name", args.name))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    return clients.length > 0;
  },
});

// Query: Get client stats
export const getStats = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    // Get projects for this client
    const allProjects = await ctx.db.query("projects").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const clientProjects = allProjects.filter(p =>
      p.clientRoles.some(cr => cr.clientId === args.clientId)
    );

    // Get documents for this client
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
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

// Query: Get recent clients
export const getRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 4;
    const allClients = await ctx.db.query("clients").filter((q) => q.neq(q.field("isDeleted"), true)).collect();
    const sorted = allClients.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted.slice(0, limit);
  },
});

// Query: Get client folders
export const getClientFolders = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientFolders")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
  },
});

// Mutation: Add a custom folder to a client
export const addCustomFolder = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.string(),
    description: v.optional(v.string()),
    parentFolderId: v.optional(v.id("clientFolders")),
  },
  handler: async (ctx, args) => {
    // Generate a folderType from the name (lowercase, underscore-separated)
    const folderType = `custom_${args.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;

    // If creating a subfolder, validate parent and compute depth
    // (mirrors addCustomProjectFolder in projects.ts)
    let depth = 0;
    if (args.parentFolderId) {
      const parent = await ctx.db.get(args.parentFolderId);
      if (!parent) {
        throw new Error("Parent folder not found");
      }
      if (parent.clientId !== args.clientId) {
        throw new Error("Parent folder belongs to a different client");
      }

      // Compute depth from parent (server-side, never trust client)
      depth = (parent.depth ?? 0) + 1;
      if (depth > 4) {
        throw new Error("Maximum folder nesting depth (5 levels) reached");
      }
    }

    // Check if folder with same type already exists for this client
    const existing = await ctx.db
      .query("clientFolders")
      .withIndex("by_client_type", (q: any) =>
        q.eq("clientId", args.clientId).eq("folderType", folderType)
      )
      .first();

    if (existing) {
      throw new Error(`A folder named "${args.name}" already exists for this client`);
    }

    return await ctx.db.insert("clientFolders", {
      clientId: args.clientId,
      folderType,
      name: args.name,
      description: args.description,
      parentFolderId: args.parentFolderId,
      depth,
      isCustom: true,
      createdAt: new Date().toISOString(),
    });
  },
});

// Mutation: Delete a custom folder from a client (only custom folders can be deleted)
export const deleteCustomFolder = mutation({
  args: {
    folderId: v.id("clientFolders"),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    
    if (!folder) {
      throw new Error("Folder not found");
    }
    
    if (!folder.isCustom) {
      throw new Error("Cannot delete template folders. Only custom folders can be deleted.");
    }
    
    // Check if folder has documents
    const documents = await ctx.db
      .query("documents")
      .filter((q: any) => q.eq(q.field("folderId"), folder.folderType))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();

    const clientDocs = documents.filter(d => d.clientId === folder.clientId && !d.projectId);

    if (clientDocs.length > 0) {
      throw new Error(`Cannot delete folder "${folder.name}". It contains ${clientDocs.length} document(s). Move or delete them first.`);
    }

    // Defensive: Re-query and move any documents that might have been added
    // between the check above and now (handles race conditions)
    const finalCheck = await ctx.db
      .query("documents")
      .filter((q: any) => q.eq(q.field("folderId"), folder.folderType))
      .filter((q: any) => q.neq(q.field("isDeleted"), true))
      .collect();

    const orphanedDocs = finalCheck.filter(d => d.clientId === folder.clientId && !d.projectId);
    for (const doc of orphanedDocs) {
      await ctx.db.patch(doc._id, {
        folderId: "miscellaneous",
        folderType: "client",
      });
    }

    await ctx.db.delete(args.folderId);
    return { success: true, movedDocuments: orphanedDocs.length };
  },
});

// Mutation: Rename a custom folder
export const renameCustomFolder = mutation({
  args: {
    folderId: v.id("clientFolders"),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    
    if (!folder) {
      throw new Error("Folder not found");
    }
    
    if (!folder.isCustom) {
      throw new Error("Cannot rename template folders. Only custom folders can be renamed.");
    }
    
    await ctx.db.patch(args.folderId, {
      name: args.name,
      description: args.description,
    });
    
    return { success: true };
  },
});

// Mutation: Record client access for recency tracking
export const recordAccess = mutation({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) return;

    // Debounce: skip if accessed less than 30 seconds ago
    if (client.lastAccessedAt) {
      const lastAccess = new Date(client.lastAccessedAt).getTime();
      const now = Date.now();
      if (now - lastAccess < 30_000) return;
    }

    await ctx.db.patch(args.clientId, {
      lastAccessedAt: new Date().toISOString(),
    });
  },
});

export const restore = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client || !client.isDeleted) {
      throw new Error("Client is not in trash");
    }

    // Restore the client
    await ctx.db.patch(args.id, {
      isDeleted: undefined,
      deletedAt: undefined,
      deletedBy: undefined,
      deletedReason: undefined,
    });

    // Restore cascade-trashed projects
    const allProjects = await ctx.db.query("projects").collect();
    const cascadeProjects = allProjects.filter((p) =>
      p.isDeleted &&
      p.deletedReason === "parent_client_deleted" &&
      p.clientRoles?.some((cr: any) => cr.clientId === args.id)
    );

    for (const project of cascadeProjects) {
      await ctx.db.patch(project._id, {
        isDeleted: undefined,
        deletedAt: undefined,
        deletedBy: undefined,
        deletedReason: undefined,
      });

      await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
        contextType: "project",
        contextId: project._id,
      });
    }

    await ctx.scheduler.runAfter(0, api.contextCache.invalidate, {
      contextType: "client",
      contextId: args.id,
    });
  },
});

export const listDeleted = query({
  args: {},
  handler: async (ctx) => {
    const deleted = await ctx.db
      .query("clients")
      .filter((q) => q.eq(q.field("isDeleted"), true))
      .collect();

    return deleted.sort((a, b) =>
      (b.deletedAt || "").localeCompare(a.deletedAt || "")
    );
  },
});

export const deletedCount = query({
  args: {},
  handler: async (ctx) => {
    const deleted = await ctx.db
      .query("clients")
      .filter((q) => q.eq(q.field("isDeleted"), true))
      .collect();
    return deleted.length;
  },
});

/**
 * Create a new client AND link a HubSpot company to it (promotedToClientId).
 * Used by the new-client autocomplete flow in the mobile app.
 */
export const createWithPromotion = mutation({
  args: {
    name: v.string(),
    companyName: v.optional(v.string()),
    industry: v.optional(v.string()),
    website: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    country: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("prospect"),
      v.literal("active"),
      v.literal("archived"),
      v.literal("past"),
    )),
    type: v.optional(v.string()),
    promoteFromCompanyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const { promoteFromCompanyId, ...clientFields } = args;

    const clientId = await ctx.db.insert("clients", {
      ...clientFields,
      source: promoteFromCompanyId ? "hubspot" : "manual",
      status: clientFields.status ?? "prospect",
      createdAt: now,
    });

    if (promoteFromCompanyId) {
      await ctx.db.patch(promoteFromCompanyId, { promotedToClientId: clientId });
      // Back-fill clientId onto contacts already linked to this company so
      // inbound replies from them resolve to the new client immediately.
      await backfillContactClientLinks(ctx, promoteFromCompanyId, clientId);
    }

    await bootstrapNewClient(ctx, clientId, args.type);

    return clientId;
  },
});

export const permanentDelete = mutation({
  args: { id: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.id);
    if (!client || !client.isDeleted) {
      throw new Error("Can only permanently delete clients that are in trash");
    }

    // Find all projects linked to this client
    const allProjects = await ctx.db.query("projects").collect();
    const linkedProjects = allProjects.filter((p) =>
      p.clientRoles?.some((cr: any) => cr.clientId === args.id)
    );

    for (const project of linkedProjects) {
      const otherClients = (project.clientRoles || []).filter(
        (cr: any) => cr.clientId !== args.id
      );

      if (otherClients.length === 0) {
        // Sole owner — hard-delete project and all related data
        await deleteProjectRelatedData(ctx, project._id);
        await ctx.db.delete(project._id);
      } else {
        // Shared project — only remove this client's role
        await ctx.db.patch(project._id, {
          clientRoles: otherClients,
        });
      }
    }

    // Delete client-level related data
    await deleteByField(ctx, "contacts", "clientId", args.id);
    await deleteByField(ctx, "documents", "clientId", args.id);
    await deleteByField(ctx, "tasks", "clientId", args.id);
    await deleteByField(ctx, "flags", "clientId", args.id);
    await deleteByField(ctx, "notes", "clientId", args.id);
    await deleteByField(ctx, "meetings", "clientId", args.id);
    await deleteByField(ctx, "chatSessions", "clientId", args.id);
    await deleteByField(ctx, "enrichmentSuggestions", "clientId", args.id);
    await deleteByField(ctx, "reminders", "clientId", args.id);
    await deleteByField(ctx, "events", "clientId", args.id);

    // Clean up flag thread entries for client-level flags
    const clientFlags = await ctx.db.query("flags").collect();
    const matchingFlags = clientFlags.filter((f: any) => f.clientId === args.id);
    for (const flag of matchingFlags) {
      await deleteByField(ctx, "flagThreadEntries", "flagId", flag._id);
    }

    // Delete the client
    await ctx.db.delete(args.id);
  },
});

// Helper: delete all records in a table matching a field value
async function deleteByField(
  ctx: any,
  table: string,
  field: string,
  value: any
) {
  const records = await ctx.db.query(table).collect();
  const matches = records.filter((r: any) => r[field] === value);
  for (const record of matches) {
    await ctx.db.delete(record._id);
  }
}

// Helper: delete all data related to a project
async function deleteProjectRelatedData(ctx: any, projectId: Id<"projects">) {
  const tables = [
    "documents",
    "tasks",
    "flags",
    "notes",
    "meetings",
    "projectFolders",
    "scenarios",
    "chatSessions",
    "knowledgeBankEntries",
    "knowledgeItems",
    "codifiedExtractions",
  ];

  for (const table of tables) {
    await deleteByField(ctx, table, "projectId", projectId);
  }

  // Also clean up flag thread entries for deleted flags
  const flags = await ctx.db.query("flags").collect();
  const projectFlags = flags.filter((f: any) => f.projectId === projectId);
  for (const flag of projectFlags) {
    await deleteByField(ctx, "flagThreadEntries", "flagId", flag._id);
  }
}

// ── v1.2.4 prospect-intel hardening: structured prospect facts ──
// Replaces the template-locked regex extraction (aside / PeopleTab /
// OverviewTab parsing intelMarkdown for director name + website + CH
// number) with real columns on the clients row. The skill calls this
// mutation in workflow step 10, after building the intelMarkdown report.
// All consumers READ these fields directly; regex extraction remains
// as the fallback for legacy reports that predate this commit.

// Shared arg shape + write logic for setProspectFacts. Both the internal
// mutation (called by the MCP tool / skills) and the public mutation
// (direct `npx convex run clients:setProspectFacts` data populates) delegate
// here so the field set + patch behaviour can never drift.
const setProspectFactsArgs = {
  clientId: v.id("clients"),
  companiesHouseNumber: v.optional(v.string()),
  // Corporate-group SPV CH numbers (excludes the parent companiesHouseNumber).
  // Discovered by the resolve-related-entities sub-skill; powers the CH-tab
  // group-charges rollup via companies.getGroupCharges.
  relatedCompaniesHouseNumbers: v.optional(v.array(v.string())),
  website: v.optional(v.string()),
  primaryDirectorName: v.optional(v.string()),
  primaryContactId: v.optional(v.id("contacts")),
  dealType: v.optional(v.union(
    v.literal("new_development"),
    v.literal("bridging"),
    v.literal("existing_asset"),
    v.literal("unclassifiable"),
  )),
  dealSizeRange: v.optional(v.string()),
};

async function applyProspectFacts(
  ctx: any,
  args: {
    clientId: Id<"clients">;
    companiesHouseNumber?: string;
    relatedCompaniesHouseNumbers?: string[];
    website?: string;
    primaryDirectorName?: string;
    primaryContactId?: Id<"contacts">;
    dealType?: "new_development" | "bridging" | "existing_asset" | "unclassifiable";
    dealSizeRange?: string;
  },
) {
  const patch: Record<string, unknown> = {};
  if (args.companiesHouseNumber !== undefined) patch.companiesHouseNumber = args.companiesHouseNumber;
  if (args.relatedCompaniesHouseNumbers !== undefined) patch.relatedCompaniesHouseNumbers = args.relatedCompaniesHouseNumbers;
  if (args.website !== undefined) patch.website = args.website;
  if (args.primaryDirectorName !== undefined) patch.primaryDirectorName = args.primaryDirectorName;
  if (args.primaryContactId !== undefined) patch.primaryContactId = args.primaryContactId;
  if (args.dealType !== undefined) patch.dealType = args.dealType;
  if (args.dealSizeRange !== undefined) patch.dealSizeRange = args.dealSizeRange;
  if (Object.keys(patch).length === 0) {
    return { ok: true, patched: 0, note: "no fields supplied; nothing to write" };
  }
  await ctx.db.patch(args.clientId, patch);
  return { ok: true, patched: Object.keys(patch).length };
}

export const setProspectFactsInternal = internalMutation({
  args: setProspectFactsArgs,
  handler: async (ctx, args) => applyProspectFacts(ctx, args),
});

// Public mutation mirror of setProspectFactsInternal. Lets operators run
// `npx convex run clients:setProspectFacts '{...}'` directly (e.g. the
// one-off corporate-group populate) without going through the MCP layer.
export const setProspectFacts = mutation({
  args: setProspectFactsArgs,
  handler: async (ctx, args) => applyProspectFacts(ctx, args),
});

// ── v1.4 Sprint I: prospect → active client activation ──────────
//
// Fires as part of deal-intake when the client starts sending docs.
// Atomically: (1) patches clients.status from "prospect" to "active",
// (2) if prospectState is set, transitions it to "promoted" via the
// internal prospects mutation (which also pushes to HubSpot).
//
// Idempotent: if client is already active (status="active"), returns
// {ok:true, idempotent:true} without further writes. The prospectState
// transition is skipped if already promoted/parked/lost.
//
// Use case: deal-intake skill calls this once docs are confirmed AND
// project is being stood up. Marks the entity transition from "lead
// we're chasing" to "active client we're executing on."

type ActivateResult = {
  ok: true;
  idempotent?: boolean;
  statusChanged?: boolean;
  prospectStateChanged?: boolean;
  fromStatus?: string;
  fromProspectState?: string;
  note?: string;
};

// Shared activation logic. Single source of truth for the prospect →
// active-client transition: patches status, transitions prospectState to
// "promoted" (with audit fields) if it's set + non-terminal, and schedules
// the HubSpot lifecycleStage push-back. Both the public `activate` mutation
// (one-click promote from the prospect detail UI) and `activateInternal`
// (deal-intake skill / MCP) call this so the behaviour can never drift.
async function activateClient(
  ctx: any,
  clientId: Id<"clients">,
  userId: Id<"users"> | undefined
): Promise<ActivateResult> {
  const client = await ctx.db.get(clientId);
  if (!client) {
    throw new Error("client_not_found");
  }

  const currentStatus = (client as any).status;
  const currentProspectState = (client as any).prospectState;
  const now = new Date().toISOString();

  // Already active — return idempotent
  if (currentStatus === "active") {
    return {
      ok: true,
      idempotent: true,
      fromStatus: currentStatus,
      note: "client already active; no patch applied",
    };
  }

  // Patch status to active
  await ctx.db.patch(clientId, {
    status: "active",
  });

  // If prospectState is set AND not yet in a terminal state, transition to promoted
  let prospectStateChanged = false;
  const terminalStates = new Set(["promoted", "parked", "lost"]);
  if (currentProspectState && !terminalStates.has(currentProspectState)) {
    await ctx.db.patch(clientId, {
      prospectState: "promoted",
      prospectStateChangedAt: now,
      prospectStateChangedBy: userId,
    });
    prospectStateChanged = true;

    // Schedule the HubSpot push-back so the lifecycleStage + hs_lead_status
    // reflect the promotion (same side-effect as prospect.transitionState MCP).
    // anyApi (runtime-identical to `internal`): prospects.ts has self-referential
    // inference; resolving this member type here trips TS2589.
    await ctx.scheduler.runAfter(0, anyApi.prospects.pushStateToHubspotInternal, {
      clientId,
      newState: "promoted",
    });
  }

  return {
    ok: true,
    statusChanged: true,
    prospectStateChanged,
    fromStatus: currentStatus ?? "n/a",
    fromProspectState: currentProspectState ?? "n/a",
  };
}

// Public mutation so the prospect detail UI can promote a client in one
// click (useMutation(api.clients.activate)). Resolves the acting user from
// the Clerk identity (same pattern as `remove`) so prospectStateChangedBy
// is recorded, then runs the shared activation logic. Idempotent: a no-op
// if the client is already active.
export const activate = mutation({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args): Promise<ActivateResult> => {
    const identity = await ctx.auth.getUserIdentity();
    let userId: Id<"users"> | undefined;
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
        .first();
      userId = user?._id;
    }

    return await activateClient(ctx, args.clientId, userId);
  },
});

export const activateInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args): Promise<ActivateResult> => {
    return await activateClient(ctx, args.clientId, args.userId);
  },
});

// ── Outreach-ready gate (2026-05-30) ────────────────────────────
//
// The operator "accept → ready for outreach" gate. Marking a prospect ready is
// an explicit human bless of the intel that exists; nothing is drafted until
// this. The flag is two optional columns (outreachReadyAt/outreachReadyBy), not
// a prospectState transition and not a HubSpot change. The outreach-draft skill
// (a later session / batch) enumerates ready-but-not-drafted prospects and
// composes the cadence package — which still routes through the approval gate.
//
// Guard: you accept intel that EXISTS. A prospect with no completed
// prospect-intel run cannot be marked ready (the UI button is also disabled).

// Does this client have a completed prospect-intel run? "Completed" means the
// run reached complete or complete_with_gaps (gaps are expected and fine — a
// no-email run still produces acceptable intel). skillRuns has no by-client
// index; prospects are low-volume so a filtered scan is acceptable (mirrors
// prospects.getDeepContext, which scans the same way).
async function hasCompletedIntelRun(ctx: any, clientId: Id<"clients">): Promise<boolean> {
  const runs = await ctx.db
    .query("skillRuns")
    .filter((q: any) => q.eq(q.field("linkedClientId"), clientId))
    .collect();
  return runs.some(
    (r: any) =>
      r.skillName === "prospect-intel" &&
      (r.status === "complete" || r.status === "complete_with_gaps"),
  );
}

type OutreachReadyResult = {
  ok: true;
  idempotent?: boolean;
  outreachReadyAt?: string;
  note?: string;
};

// Shared logic for both the public mutation (UI accept button, resolves the
// Clerk identity) and the internal mutation (MCP tool, passes userId). Single
// source of truth so the field set never drifts.
async function applyMarkOutreachReady(
  ctx: any,
  clientId: Id<"clients">,
  userId: Id<"users"> | undefined,
): Promise<OutreachReadyResult> {
  const client = await ctx.db.get(clientId);
  if (!client) throw new Error("client_not_found");

  // Already accepted — idempotent no-op (keep the original accept timestamp).
  if ((client as any).outreachReadyAt) {
    return {
      ok: true,
      idempotent: true,
      outreachReadyAt: (client as any).outreachReadyAt,
      note: "already marked ready; original accept preserved",
    };
  }

  // Guard: intel must exist before it can be accepted.
  if (!(await hasCompletedIntelRun(ctx, clientId))) {
    throw new Error("no_completed_intel_run: cannot mark ready before a prospect-intel run completes");
  }

  const now = new Date().toISOString();
  // clients has no `updatedAt` column; outreachReadyAt is itself the audit stamp.
  await ctx.db.patch(clientId, {
    outreachReadyAt: now,
    outreachReadyBy: userId,
  });
  return { ok: true, outreachReadyAt: now };
}

async function applyClearOutreachReady(
  ctx: any,
  clientId: Id<"clients">,
): Promise<OutreachReadyResult> {
  const client = await ctx.db.get(clientId);
  if (!client) throw new Error("client_not_found");

  if (!(client as any).outreachReadyAt) {
    return { ok: true, idempotent: true, note: "not marked ready; nothing to clear" };
  }

  await ctx.db.patch(clientId, {
    outreachReadyAt: undefined,
    outreachReadyBy: undefined,
  });
  return { ok: true };
}

// Resolve the Clerk identity to a users._id (same pattern as `activate`).
async function resolveUserId(ctx: any): Promise<Id<"users"> | undefined> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return undefined;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
    .first();
  return user?._id;
}

// Public: UI "Accept intel — ready for outreach" button.
export const markOutreachReady = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<OutreachReadyResult> => {
    const userId = await resolveUserId(ctx);
    return await applyMarkOutreachReady(ctx, args.clientId, userId);
  },
});

// Internal: MCP tool (client.markOutreachReady) passes the resolved userId.
export const markOutreachReadyInternal = internalMutation({
  args: { clientId: v.id("clients"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args): Promise<OutreachReadyResult> => {
    return await applyMarkOutreachReady(ctx, args.clientId, args.userId);
  },
});

// Public: UI "Unmark" link (meaningful only pre-draft).
export const clearOutreachReady = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<OutreachReadyResult> => {
    return await applyClearOutreachReady(ctx, args.clientId);
  },
});

export const clearOutreachReadyInternal = internalMutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args): Promise<OutreachReadyResult> => {
    return await applyClearOutreachReady(ctx, args.clientId);
  },
});

// Query: prospects that are ready for outreach AND not yet drafted. This is the
// pool "draft all outreach for ready companies" enumerates. A prospect drops
// out automatically once outreach-draft advances it past `researched` (to
// `drafted`/etc.), so re-running the batch never double-drafts. Returns whole
// client rows (the caller reads name/dealType/contacts off them).
export const listOutreachReady = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("clients")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();
    return all.filter((c: any) => {
      if (!c.outreachReadyAt) return false;
      // Not yet drafted: still at the initial `researched` state (or, defensively,
      // unset). Anything `drafted` or later has left the to-draft pool.
      const st = c.prospectState;
      return st === undefined || st === "researched";
    });
  },
});

// ── Prospecting v3 — needs-action flags + intel freshness (2026-06-26) ──
//
// needsActionFlags is an upsert-by-`kind` array on the clients row. Each entry
// is one open ask raised by a feed (reply drafted, approval gated, etc.). The
// scalar needsActionAt mirrors the EARLIEST open flag's raisedAt so the
// requires-attention surface can sort/index on a single column; it is cleared
// (undefined) when the last flag clears. The read-side surface derives the
// operator-facing booleans via deriveProspectFlags() — these helpers only feed
// the underlying flag array.

type NeedsActionFlag = {
  kind: string;
  reason: string;
  sourceReplyEventId?: Id<"replyEvents">;
  sourceApprovalId?: Id<"approvals">;
  raisedAt: string;
};

// The earliest open flag's raisedAt (ISO compare is lexicographically safe),
// or undefined when there are no flags.
function earliestRaisedAt(flags: NeedsActionFlag[]): string | undefined {
  if (flags.length === 0) return undefined;
  return flags.reduce(
    (min, f) => (f.raisedAt < min ? f.raisedAt : min),
    flags[0].raisedAt,
  );
}

// Shared upsert: replaces any existing flag of the same `kind`, then recomputes
// the scalar needsActionAt mirror.
async function applyRaiseNeedsActionFlag(
  ctx: any,
  args: {
    clientId: Id<"clients">;
    kind: string;
    reason: string;
    sourceReplyEventId?: Id<"replyEvents">;
    sourceApprovalId?: Id<"approvals">;
  },
): Promise<{ ok: true; needsActionAt?: string; flagCount: number }> {
  const client = await ctx.db.get(args.clientId);
  if (!client) throw new Error("client_not_found");

  const existing: NeedsActionFlag[] = Array.isArray((client as any).needsActionFlags)
    ? ((client as any).needsActionFlags as NeedsActionFlag[])
    : [];

  // Drop any existing entry of the same kind (upsert-by-kind), then append the
  // fresh one. We re-stamp raisedAt so the latest raise wins on the mirror.
  const kept = existing.filter((f) => f.kind !== args.kind);
  const newFlag: NeedsActionFlag = {
    kind: args.kind,
    reason: args.reason,
    raisedAt: new Date().toISOString(),
  };
  if (args.sourceReplyEventId !== undefined) newFlag.sourceReplyEventId = args.sourceReplyEventId;
  if (args.sourceApprovalId !== undefined) newFlag.sourceApprovalId = args.sourceApprovalId;

  const next = [...kept, newFlag];
  const needsActionAt = earliestRaisedAt(next);

  await ctx.db.patch(args.clientId, {
    needsActionFlags: next,
    needsActionAt,
  });
  return { ok: true, needsActionAt, flagCount: next.length };
}

// Shared clear: removes flags matching `kind` (and `sourceReplyEventId` when
// supplied — lets a reply-specific flag clear without touching another open
// flag of the same kind). Recomputes the scalar mirror (undefined when none
// remain).
async function applyClearNeedsActionFlag(
  ctx: any,
  args: {
    clientId: Id<"clients">;
    kind: string;
    sourceReplyEventId?: Id<"replyEvents">;
  },
): Promise<{ ok: true; needsActionAt?: string; flagCount: number; removed: number }> {
  const client = await ctx.db.get(args.clientId);
  if (!client) throw new Error("client_not_found");

  const existing: NeedsActionFlag[] = Array.isArray((client as any).needsActionFlags)
    ? ((client as any).needsActionFlags as NeedsActionFlag[])
    : [];

  const next = existing.filter((f) => {
    if (f.kind !== args.kind) return true; // unrelated kind — keep
    if (args.sourceReplyEventId !== undefined) {
      // Scoped clear: only remove the matching-source entry.
      return f.sourceReplyEventId !== args.sourceReplyEventId;
    }
    return false; // matches kind, no source scoping — remove
  });

  const removed = existing.length - next.length;
  const needsActionAt = earliestRaisedAt(next);

  await ctx.db.patch(args.clientId, {
    needsActionFlags: next,
    needsActionAt,
  });
  return { ok: true, needsActionAt, flagCount: next.length, removed };
}

// Internal: feeds (reply drafted, approval gated, …) raise an open ask.
export const raiseNeedsActionFlagInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    kind: v.string(),
    reason: v.string(),
    sourceReplyEventId: v.optional(v.id("replyEvents")),
    sourceApprovalId: v.optional(v.id("approvals")),
  },
  handler: async (ctx, args) => applyRaiseNeedsActionFlag(ctx, args),
});

// Internal: a feed clears its own ask once handled.
export const clearNeedsActionFlagInternal = internalMutation({
  args: {
    clientId: v.id("clients"),
    kind: v.string(),
    sourceReplyEventId: v.optional(v.id("replyEvents")),
  },
  handler: async (ctx, args) => applyClearNeedsActionFlag(ctx, args),
});

// Public: UI "dismiss" on a requires-attention card. Resolves the acting user
// (kept for parity with the other public mutations; clearing carries no
// audit column today) and clears by kind.
export const clearNeedsActionFlag = mutation({
  args: {
    clientId: v.id("clients"),
    kind: v.string(),
    sourceReplyEventId: v.optional(v.id("replyEvents")),
  },
  handler: async (ctx, args) => {
    await resolveUserId(ctx);
    return await applyClearNeedsActionFlag(ctx, args);
  },
});

// Internal query: read-only intel-freshness snapshot for a prospect. Feeds the
// requires-attention surface + intel-revalidate decision (Trigger A meeting +
// >7d stale; Trigger B 30-day cadence gap is computed by the caller off gapDays
// vs CADENCE_REVALIDATE_GAP_DAYS). Returns denormalised client fields plus the
// derived day-deltas. ageDays/gapDays are undefined when the source timestamp
// is unset.
export const getIntelFreshnessInternal = internalQuery({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("client_not_found");

    const now = Date.now();
    const DAY_MS = 86_400_000;

    const lastFullIntelAt: string | undefined = (client as any).lastFullIntelAt;
    const lastOutreachSendAt: string | undefined = (client as any).lastOutreachSendAt;

    const ageMs = lastFullIntelAt ? now - Date.parse(lastFullIntelAt) : undefined;
    const ageDays =
      ageMs !== undefined && isFinite(ageMs) ? Math.floor(ageMs / DAY_MS) : undefined;
    const isStale7 = ageDays !== undefined && ageDays >= INTEL_STALE_DAYS;

    const gapMs = lastOutreachSendAt ? now - Date.parse(lastOutreachSendAt) : undefined;
    const gapDays =
      gapMs !== undefined && isFinite(gapMs) ? Math.floor(gapMs / DAY_MS) : undefined;

    return {
      lastFullIntelAt,
      ageDays,
      isStale7,
      lastOutreachSendAt,
      gapDays,
      intelAttentionAt: (client as any).intelAttentionAt as string | undefined,
      intelAttentionReason: (client as any).intelAttentionReason as string | undefined,
    };
  },
});
