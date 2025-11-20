import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Query: Get enrichment suggestions by client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("enrichmentSuggestions")
      .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
      .collect();
  },
});

// Query: Get enrichment suggestions by project
export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("enrichmentSuggestions")
      .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Query: Get enrichment suggestions by document
export const getByDocument = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("enrichmentSuggestions")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
  },
});

// Query: Get pending suggestions
export const getPending = query({
  args: {
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    let suggestions;
    
    if (args.clientId) {
      suggestions = await ctx.db
        .query("enrichmentSuggestions")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId))
        .collect();
    } else if (args.projectId) {
      suggestions = await ctx.db
        .query("enrichmentSuggestions")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      suggestions = await ctx.db
        .query("enrichmentSuggestions")
        .withIndex("by_status", (q: any) => q.eq("status", "pending"))
        .collect();
    }
    
    return suggestions.filter(s => s.status === "pending");
  },
});

// Mutation: Create enrichment suggestion
export const create = mutation({
  args: {
    type: v.union(
      v.literal("email"),
      v.literal("phone"),
      v.literal("address"),
      v.literal("company"),
      v.literal("contact"),
      v.literal("date"),
      v.literal("other")
    ),
    field: v.string(),
    value: v.any(),
    source: v.string(),
    documentId: v.id("documents"),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    confidence: v.number(),
  },
  handler: async (ctx, args) => {
    const suggestionId = await ctx.db.insert("enrichmentSuggestions", {
      type: args.type,
      field: args.field,
      value: args.value,
      source: args.source,
      documentId: args.documentId,
      clientId: args.clientId,
      projectId: args.projectId,
      confidence: args.confidence,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    return suggestionId;
  },
});

// Valid client fields that can be updated directly
const VALID_CLIENT_FIELDS = new Set([
  'name',
  'companyName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'zip',
  'country',
  'website',
  'industry',
  'type',
  'status',
  'notes',
  'tags',
  'lastContactDate',
  'enrichmentScore',
  'source',
  'assignedTo',
]);

// Valid project fields that can be updated directly
const VALID_PROJECT_FIELDS = new Set([
  'name',
  'description',
  'address',
  'city',
  'state',
  'zip',
  'country',
  'status',
  'lifecycleStage',
  'tags',
  'startDate',
  'endDate',
  'expectedCompletionDate',
  'loanNumber',
  'loanAmount',
  'interestRate',
  'notes',
]);

// Map enrichment field names to valid schema fields
function mapEnrichmentFieldToClient(field: string, value: any): Record<string, any> {
  const updates: Record<string, any> = {};
  
  // Normalize field name for comparison
  const fieldLower = field.toLowerCase().trim();
  
  // Direct field mapping - check exact match first
  if (VALID_CLIENT_FIELDS.has(field)) {
    updates[field] = value;
    return updates;
  }
  
  // Special field mappings for contact-related fields
  if (fieldLower === 'contactname' || 
      fieldLower === 'contact_name' || 
      fieldLower === 'contact' ||
      field === 'contactName' ||
      field === 'contact_name') {
    // Store contact name in metadata
    // Always store in metadata to avoid schema violations
    const contactValue = String(value);
    updates.metadata = { contactName: contactValue };
    return updates;
  }
  
  // For other unmapped fields, store in metadata
  // This ensures we never try to set invalid fields directly
  updates.metadata = { [field]: value };
  return updates;
}

function mapEnrichmentFieldToProject(field: string, value: any): Record<string, any> {
  const updates: Record<string, any> = {};
  
  // Direct field mapping
  if (VALID_PROJECT_FIELDS.has(field)) {
    updates[field] = value;
    return updates;
  }
  
  // For unmapped fields, store in metadata
  updates.metadata = { [field]: value };
  return updates;
}

// Mutation: Accept enrichment suggestion
export const accept = mutation({
  args: {
    id: v.id("enrichmentSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.id);
    if (!suggestion) {
      throw new Error("Suggestion not found");
    }
    
    // If already accepted, just return success (idempotent)
    if (suggestion.status === "accepted") {
      return args.id;
    }
    
    // If not pending, provide helpful error message
    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion is already ${suggestion.status}. Cannot accept a suggestion that is not pending.`);
    }
    
    await ctx.db.patch(args.id, { status: "accepted" });
    
    // Apply enrichment to client or project
    if (suggestion.clientId) {
      const client = await ctx.db.get(suggestion.clientId);
      if (client) {
        // First, check if the client has any invalid fields that need migration
        // Convex validates the entire document on patch, so we need to clean it first
        const clientData = client as any;
        
        // Check for any invalid fields (fields not in the schema)
        const invalidFields: string[] = [];
        const validFieldNames = new Set([
          'name', 'createdAt', 'type', 'status', 'companyName', 'address', 'city', 
          'state', 'zip', 'country', 'phone', 'email', 'website', 'industry', 
          'tags', 'notes', 'lastContactDate', 'enrichmentScore', 'source', 
          'assignedTo', 'metadata', '_id', '_creationTime'
        ]);
        
        // Check all fields in the client document
        for (const key in clientData) {
          if (!validFieldNames.has(key)) {
            invalidFields.push(key);
          }
        }
        
        if (invalidFields.length > 0) {
          // Client has invalid fields - MUST migrate before we can patch
          console.log(`Client ${suggestion.clientId} has invalid fields: ${invalidFields.join(', ')}. Starting migration...`);
          
          // Use the internal migration mutation to clean up the client
          // This uses delete + insert to bypass replace validation issues
          try {
            // @ts-expect-error - Type inference issue with Convex internal mutations
            const migrationResult = await ctx.runMutation(internal.clients.migrateInvalidFields, {
              id: suggestion.clientId,
            }) as { migrated: boolean; oldId?: string; newId?: string; invalidFields?: string[] };
            
            if (!migrationResult || !migrationResult.migrated) {
              throw new Error("Migration did not complete successfully");
            }
            
            console.log(`Migration completed. Old ID: ${migrationResult.oldId}, New ID: ${migrationResult.newId}`);
            
            // Migration may have created a new client ID, update the suggestion
            const actualClientId = (migrationResult.newId || suggestion.clientId) as Id<"clients">;
            if (migrationResult.newId && migrationResult.newId !== suggestion.clientId) {
              await ctx.db.patch(args.id, { clientId: migrationResult.newId as Id<"clients"> });
              suggestion.clientId = migrationResult.newId as Id<"clients">;
            }
            
            // Refresh client reference after migration using the actual client ID
            const refreshedClient = await ctx.db.get(actualClientId);
            if (!refreshedClient) {
              throw new Error("Failed to refresh client after migration");
            }
            
            // Verify the migrated client is clean
            const refreshedClientData = refreshedClient as any;
            const stillHasInvalidFields = Object.keys(refreshedClientData).some(key => 
              !validFieldNames.has(key)
            );
            
            if (stillHasInvalidFields) {
              throw new Error(`Client still has invalid fields after migration. This should not happen.`);
            }
            
            console.log(`Client ${actualClientId} is clean after migration. Proceeding with enrichment update.`);
            
            // Update client reference for rest of function
            const client = refreshedClient;
            
            // Update suggestion.clientId for the rest of the function
            suggestion.clientId = actualClientId;
          } catch (migrationError) {
            // If migration fails, log and throw helpful error
            console.error('Failed to migrate client invalid fields:', migrationError);
            const errorMessage = migrationError instanceof Error ? migrationError.message : 'Unknown error';
            console.error('Migration error details:', {
              clientId: suggestion.clientId,
              clientName: client.name,
              invalidFields,
              error: errorMessage,
            });
            throw new Error(`Cannot update client "${client.name}" - it contains invalid fields (${invalidFields.join(', ')}) that prevent updates. Migration error: ${errorMessage}. Please try refreshing the page or contact support if this persists.`);
          }
        }
        
        // Now apply the enrichment update
        const updates = mapEnrichmentFieldToClient(suggestion.field, suggestion.value);
        
        // Ensure we never set invalid fields - filter out any that aren't in schema
        const safeUpdates: Record<string, any> = {};
        
        // Only include fields that are valid or metadata
        for (const [key, val] of Object.entries(updates)) {
          if (VALID_CLIENT_FIELDS.has(key) || key === 'metadata') {
            safeUpdates[key] = val;
          }
        }
        
        // Handle metadata merge if needed
        if (safeUpdates.metadata) {
          const currentClient = await ctx.db.get(suggestion.clientId);
          const existingMetadata = currentClient?.metadata || {};
          safeUpdates.metadata = { ...existingMetadata, ...safeUpdates.metadata };
        }
        
        // Handle notes append if needed
        if (safeUpdates.notes) {
          const currentClient = await ctx.db.get(suggestion.clientId);
          if (currentClient?.notes) {
            safeUpdates.notes = `${currentClient.notes}\n${safeUpdates.notes}`;
          }
        }
        
        // Only patch if we have valid updates
        // Double-check that client doesn't have invalid fields before patching
        if (Object.keys(safeUpdates).length > 0) {
          // Verify client is clean before patching
          const clientToPatch = await ctx.db.get(suggestion.clientId);
          if (clientToPatch) {
            const clientToPatchData = clientToPatch as any;
            const hasInvalidFields = Object.keys(clientToPatchData).some(key => 
              !validFieldNames.has(key)
            );
            
            if (hasInvalidFields) {
              // Client still has invalid fields - migration must have failed
              throw new Error(`Client still has invalid fields after migration. Cannot patch. Please try again or contact support.`);
            }
          }
          
          await ctx.db.patch(suggestion.clientId, safeUpdates);
        }
      }
    } else if (suggestion.projectId) {
      const project = await ctx.db.get(suggestion.projectId);
      if (project) {
        // Map field to valid schema fields
        const updates = mapEnrichmentFieldToProject(suggestion.field, suggestion.value);
        
        // Ensure we never set invalid fields - filter out any that aren't in schema
        const safeUpdates: Record<string, any> = {};
        
        // Only include fields that are valid or metadata
        for (const [key, val] of Object.entries(updates)) {
          if (VALID_PROJECT_FIELDS.has(key) || key === 'metadata') {
            safeUpdates[key] = val;
          }
        }
        
        // Handle metadata merge if needed
        if (safeUpdates.metadata) {
          const existingMetadata = project.metadata || {};
          safeUpdates.metadata = { ...existingMetadata, ...safeUpdates.metadata };
        }
        
        // Only patch if we have valid updates
        if (Object.keys(safeUpdates).length > 0) {
          await ctx.db.patch(suggestion.projectId, safeUpdates);
        }
      }
    }
    
    return args.id;
  },
});

// Mutation: Reject enrichment suggestion
export const reject = mutation({
  args: {
    id: v.id("enrichmentSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.id);
    if (!suggestion) {
      throw new Error("Suggestion not found");
    }
    
    // If already rejected, just return success (idempotent)
    if (suggestion.status === "rejected") {
      return args.id;
    }
    
    // If not pending, provide helpful error message
    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion is already ${suggestion.status}. Cannot reject a suggestion that is not pending.`);
    }
    
    await ctx.db.patch(args.id, { status: "rejected" });
    return args.id;
  },
});

// Mutation: Skip enrichment suggestion
export const skip = mutation({
  args: {
    id: v.id("enrichmentSuggestions"),
  },
  handler: async (ctx, args) => {
    const suggestion = await ctx.db.get(args.id);
    if (!suggestion) {
      throw new Error("Suggestion not found");
    }
    
    // If already skipped, just return success (idempotent)
    if (suggestion.status === "skipped") {
      return args.id;
    }
    
    // If not pending, provide helpful error message
    if (suggestion.status !== "pending") {
      throw new Error(`Suggestion is already ${suggestion.status}. Cannot skip a suggestion that is not pending.`);
    }
    
    await ctx.db.patch(args.id, { status: "skipped" });
    return args.id;
  },
});

// Mutation: Update document ID (for temp IDs)
export const updateDocumentId = mutation({
  args: {
    oldDocumentId: v.string(),
    newDocumentId: v.id("documents"),
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    let suggestions;
    
    if (args.clientId) {
      suggestions = await ctx.db
        .query("enrichmentSuggestions")
        .withIndex("by_client", (q: any) => q.eq("clientId", args.clientId!))
        .collect();
    } else if (args.projectId) {
      suggestions = await ctx.db
        .query("enrichmentSuggestions")
        .withIndex("by_project", (q: any) => q.eq("projectId", args.projectId!))
        .collect();
    } else {
      suggestions = await ctx.db.query("enrichmentSuggestions").collect();
    }
    
    for (const suggestion of suggestions) {
      // Match if documentId starts with oldDocumentId (for temp IDs) or exact match
      if (suggestion.documentId === args.newDocumentId || 
          (typeof suggestion.documentId === "string" && suggestion.documentId.startsWith(args.oldDocumentId))) {
        await ctx.db.patch(suggestion._id, { documentId: args.newDocumentId });
      }
    }
  },
});

