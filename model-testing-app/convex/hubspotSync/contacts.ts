import { v } from "convex/values";
import { mutation } from "../_generated/server";
import {
    cleanArgs as cleanArgsUtil,
    parseCreatedAt,
    parseUpdatedAt,
    mergeMetadata,
    mapToLeadLifecycleStage,
} from "./utils";

/**
 * Helper function to link companies and deals to a contact
 */
async function linkContactAssociations(
  ctx: any,
  contactId: any,
  hubspotCompanyIds?: string[],
  hubspotDealIds?: string[]
) {
  // Link companies
  if (hubspotCompanyIds && hubspotCompanyIds.length > 0) {
    try {
      const linkedCompanyIds: any[] = [];
      const seenCompanyIds = new Set<string>();
      for (const hubspotCompanyId of hubspotCompanyIds) {
        if (seenCompanyIds.has(hubspotCompanyId)) continue;
        seenCompanyIds.add(hubspotCompanyId);
        
        const company = await ctx.db
          .query("companies")
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", hubspotCompanyId))
          .first();
        if (company && !linkedCompanyIds.some(id => id === company._id)) {
          linkedCompanyIds.push(company._id as any);
        }
      }
      if (linkedCompanyIds.length > 0) {
        await ctx.db.patch(contactId, { linkedCompanyIds: linkedCompanyIds as any });
      }
    } catch (linkError) {
      console.error('Error linking companies to contact:', linkError);
    }
  }
  
  // Link deals
  if (hubspotDealIds && hubspotDealIds.length > 0) {
    try {
      const linkedDealIds: any[] = [];
      const seenDealIds = new Set<string>();
      for (const hubspotDealId of hubspotDealIds) {
        if (seenDealIds.has(hubspotDealId)) continue;
        seenDealIds.add(hubspotDealId);
        
        const deal = await ctx.db
          .query("deals")
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotDealId", hubspotDealId))
          .first();
        if (deal && !linkedDealIds.some(id => id === deal._id)) {
          linkedDealIds.push(deal._id as any);
        }
      }
      if (linkedDealIds.length > 0) {
        await ctx.db.patch(contactId, { linkedDealIds: linkedDealIds as any });
      }
    } catch (linkError) {
      console.error('Error linking deals to contact:', linkError);
    }
  }
}

/**
 * Create or update contact from HubSpot contact data
 * Implements duplicate detection: checks by hubspotContactId first, then by email or name
 */
export const syncContactFromHubSpot = mutation({
  args: {
    hubspotContactId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()), // Legacy field - kept for backward compatibility
    role: v.optional(v.string()),
    lifecycleStage: v.optional(v.string()), // Lifecycle stage ID
    lifecycleStageName: v.optional(v.string()), // Lifecycle stage name (human-readable)
    hubspotOwnerId: v.optional(v.string()), // HubSpot owner/user ID
    hubspotCompanyIds: v.optional(v.array(v.string())), // HubSpot company IDs (multiple companies)
    hubspotDealIds: v.optional(v.array(v.string())), // HubSpot deal IDs (multiple deals)
    lastContactedDate: v.optional(v.string()),
    lastActivityDate: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    customProperties: v.optional(v.any()),
    hubspotUrl: v.optional(v.string()),
    metadata: v.optional(v.any()), // Custom properties from HubSpot
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { hubspotContactId, ...contactData } = args;
    
    // Clean args - filter out null/undefined/empty values
    const cleaned = cleanArgsUtil(contactData);
    const cleanArgs: any = { hubspotContactId, ...cleaned };
    
    // First, check if contact exists with this HubSpot ID
    const existingByHubSpotId = await ctx.db
      .query("contacts")
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotContactId", hubspotContactId))
      .first();
    
    if (existingByHubSpotId) {
      // Update existing contact (HubSpot data wins)
      const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
      
      const updateData: any = {
        name: cleanArgs.name,
        clientId: cleanArgs.clientId || existingByHubSpotId.clientId,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanArgs.lifecycleStage) updateData.hubspotLifecycleStage = cleanArgs.lifecycleStage;
      if (cleanArgs.lifecycleStageName) updateData.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
      if (cleanArgs.hubspotOwnerId) updateData.hubspotOwnerId = cleanArgs.hubspotOwnerId;
      if (cleanArgs.lastContactedDate) updateData.lastContactedDate = cleanArgs.lastContactedDate;
      if (cleanArgs.lastActivityDate) updateData.lastActivityDate = cleanArgs.lastActivityDate;
      if (cleanArgs.email) updateData.email = cleanArgs.email;
      if (cleanArgs.phone) updateData.phone = cleanArgs.phone;
      if (cleanArgs.company) updateData.company = cleanArgs.company;
      if (cleanArgs.role) updateData.role = cleanArgs.role;
      
      // FIX: Ensure hubspotCompanyIds and hubspotDealIds are properly stored
      if (cleanArgs.hubspotCompanyIds && cleanArgs.hubspotCompanyIds.length > 0) {
        updateData.hubspotCompanyIds = cleanArgs.hubspotCompanyIds;
      }
      if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
        updateData.hubspotDealIds = cleanArgs.hubspotDealIds;
      }
      
      // FIX: Merge metadata properly
      const metadata = mergeMetadata(
        existingByHubSpotId.metadata,
        cleanArgs.customProperties,
        cleanArgs.metadata
      );
      if (Object.keys(metadata).length > 0) {
        updateData.metadata = metadata;
      }
      
      await ctx.db.patch(existingByHubSpotId._id, updateData);
      
      // Link companies and deals
      await linkContactAssociations(
        ctx,
        existingByHubSpotId._id,
        cleanArgs.hubspotCompanyIds,
        cleanArgs.hubspotDealIds
      );
      
      return { id: existingByHubSpotId._id, action: "updated" };
    }
    
    // Check for duplicate by email (if provided)
    if (contactData.email) {
      const existingByEmail = await ctx.db
        .query("contacts")
        .withIndex("by_email", (q: any) => q.eq("email", contactData.email!))
        .first();
      
      if (existingByEmail) {
        const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
        
        const updateData: any = {
          hubspotContactId,
          name: cleanArgs.name,
          email: cleanArgs.email,
          clientId: cleanArgs.clientId || existingByEmail.clientId,
          hubspotUrl: cleanArgs.hubspotUrl,
          lastHubSpotSync: new Date().toISOString(),
          updatedAt: updatedAtDate,
        };
        
        // Only include fields that have actual values
        if (cleanArgs.lifecycleStage) updateData.hubspotLifecycleStage = cleanArgs.lifecycleStage;
        if (cleanArgs.lifecycleStageName) updateData.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
        if (cleanArgs.hubspotOwnerId) updateData.hubspotOwnerId = cleanArgs.hubspotOwnerId;
        if (cleanArgs.lastContactedDate) updateData.lastContactedDate = cleanArgs.lastContactedDate;
        if (cleanArgs.lastActivityDate) updateData.lastActivityDate = cleanArgs.lastActivityDate;
        
        const phone = cleanArgs.phone || existingByEmail.phone;
        const company = cleanArgs.company || existingByEmail.company;
        const role = cleanArgs.role || existingByEmail.role;
        
        if (phone) updateData.phone = phone;
        if (company) updateData.company = company;
        if (role) updateData.role = role;
        
        // FIX: Store hubspotCompanyIds and hubspotDealIds
        if (cleanArgs.hubspotCompanyIds && cleanArgs.hubspotCompanyIds.length > 0) {
          updateData.hubspotCompanyIds = cleanArgs.hubspotCompanyIds;
        }
        if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
          updateData.hubspotDealIds = cleanArgs.hubspotDealIds;
        }
        
        await ctx.db.patch(existingByEmail._id, updateData);
        
        // Link companies and deals
        await linkContactAssociations(
          ctx,
          existingByEmail._id,
          cleanArgs.hubspotCompanyIds,
          cleanArgs.hubspotDealIds
        );
        
        return { id: existingByEmail._id, action: "updated" };
      }
    }
    
    // Check for duplicate by name (case-insensitive)
    const allContacts = await ctx.db.query("contacts").collect();
    const existingByName = allContacts.find(c => 
      c.name.toLowerCase() === contactData.name.toLowerCase()
    );
    
    if (existingByName) {
      const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
      
      const updateData: any = {
        hubspotContactId,
        name: cleanArgs.name,
        clientId: cleanArgs.clientId || existingByName.clientId,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        updatedAt: updatedAtDate,
      };
      
      // Only include fields that have actual values
      if (cleanArgs.lifecycleStage) updateData.hubspotLifecycleStage = cleanArgs.lifecycleStage;
      if (cleanArgs.lifecycleStageName) updateData.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
      if (cleanArgs.hubspotOwnerId) updateData.hubspotOwnerId = cleanArgs.hubspotOwnerId;
      if (cleanArgs.lastContactedDate) updateData.lastContactedDate = cleanArgs.lastContactedDate;
      if (cleanArgs.lastActivityDate) updateData.lastActivityDate = cleanArgs.lastActivityDate;
      
      const email = cleanArgs.email || existingByName.email;
      const phone = cleanArgs.phone || existingByName.phone;
      const company = cleanArgs.company || existingByName.company;
      const role = cleanArgs.role || existingByName.role;
      
      if (email) updateData.email = email;
      if (phone) updateData.phone = phone;
      if (company) updateData.company = company;
      if (role) updateData.role = role;
      
      // FIX: Store hubspotCompanyIds and hubspotDealIds
      if (cleanArgs.hubspotCompanyIds && cleanArgs.hubspotCompanyIds.length > 0) {
        updateData.hubspotCompanyIds = cleanArgs.hubspotCompanyIds;
      }
      if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
        updateData.hubspotDealIds = cleanArgs.hubspotDealIds;
      }
      
      await ctx.db.patch(existingByName._id, updateData);
      
      // Link companies and deals
      await linkContactAssociations(
        ctx,
        existingByName._id,
        cleanArgs.hubspotCompanyIds,
        cleanArgs.hubspotDealIds
      );
      
      return { id: existingByName._id, action: "updated" };
    }
    
    // Create new contact
    const createdAtDate = parseCreatedAt(cleanArgs.createdAt);
    const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt);
    
    const contactDataClean: any = {
      hubspotContactId,
      name: cleanArgs.name,
      clientId: cleanArgs.clientId,
      hubspotUrl: cleanArgs.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    };
    
    // Only include fields that have actual values
    if (cleanArgs.email) contactDataClean.email = cleanArgs.email;
    if (cleanArgs.phone) contactDataClean.phone = cleanArgs.phone;
    if (cleanArgs.company) contactDataClean.company = cleanArgs.company; // Legacy field
    if (cleanArgs.role) contactDataClean.role = cleanArgs.role;
    if (cleanArgs.lifecycleStage) contactDataClean.hubspotLifecycleStage = cleanArgs.lifecycleStage;
    if (cleanArgs.lifecycleStageName) contactDataClean.hubspotLifecycleStageName = cleanArgs.lifecycleStageName;
    if (cleanArgs.hubspotOwnerId) contactDataClean.hubspotOwnerId = cleanArgs.hubspotOwnerId;
    if (cleanArgs.lastContactedDate) contactDataClean.lastContactedDate = cleanArgs.lastContactedDate;
    if (cleanArgs.lastActivityDate) contactDataClean.lastActivityDate = cleanArgs.lastActivityDate;
    
    // FIX: Ensure hubspotCompanyIds and hubspotDealIds are properly stored
    if (cleanArgs.hubspotCompanyIds && cleanArgs.hubspotCompanyIds.length > 0) {
      contactDataClean.hubspotCompanyIds = cleanArgs.hubspotCompanyIds;
    }
    if (cleanArgs.hubspotDealIds && cleanArgs.hubspotDealIds.length > 0) {
      contactDataClean.hubspotDealIds = cleanArgs.hubspotDealIds;
    }
    
    // Merge custom properties into metadata
    const metadata = mergeMetadata(undefined, cleanArgs.customProperties, cleanArgs.metadata);
    if (Object.keys(metadata).length > 0) {
      contactDataClean.metadata = metadata;
    }
    
    const contactId = await ctx.db.insert("contacts", contactDataClean);
    
    // Link companies and deals
    await linkContactAssociations(
      ctx,
      contactId,
      cleanArgs.hubspotCompanyIds,
      cleanArgs.hubspotDealIds
    );
    
    return { id: contactId, action: "created" };
  },
});

/**
 * Create or update lead from HubSpot contact data
 * Creates/updates the contact first, then creates/updates the lead
 */
export const syncLeadFromHubSpot = mutation({
  args: {
    hubspotContactId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    lifecycleStage: v.string(), // Required for leads
    hubspotCompanyId: v.optional(v.string()),
    hubspotCompanyUrl: v.optional(v.string()),
    customProperties: v.optional(v.any()),
    hubspotUrl: v.optional(v.string()),
    // Date fields from HubSpot
    createdAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
    lastContactDate: v.optional(v.string()),
    hubspotCreatedDate: v.optional(v.string()),
    hubspotModifiedDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { hubspotContactId, lifecycleStage, hubspotCompanyId, hubspotCompanyUrl, customProperties, ...contactData } = args;
    
    // Clean args - filter out null/undefined values
    const cleaned = cleanArgsUtil(contactData);
    const cleanArgs: any = { hubspotContactId, lifecycleStage, ...cleaned };
    if (hubspotCompanyId) cleanArgs.hubspotCompanyId = hubspotCompanyId;
    if (hubspotCompanyUrl) cleanArgs.hubspotCompanyUrl = hubspotCompanyUrl;
    if (customProperties) cleanArgs.customProperties = customProperties;
    if (args.hubspotUrl) cleanArgs.hubspotUrl = args.hubspotUrl;
    
    // First, ensure the contact exists (create or update)
    let contactId: any;
    const existingContact = await ctx.db
      .query("contacts")
          .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotContactId", hubspotContactId))
      .first();
    
    if (existingContact) {
      // Update existing contact
      const updateData: any = {
        name: cleanArgs.name,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
      };
      
      if (cleanArgs.email) updateData.email = cleanArgs.email;
      if (cleanArgs.phone) updateData.phone = cleanArgs.phone;
      if (cleanArgs.company) updateData.company = cleanArgs.company;
      if (cleanArgs.role) updateData.role = cleanArgs.role;
      
      await ctx.db.patch(existingContact._id, updateData);
      contactId = existingContact._id;
    } else {
      // Check for duplicate by email
      if (cleanArgs.email) {
        const existingByEmail = await ctx.db
          .query("contacts")
          .withIndex("by_email", (q: any) => q.eq("email", cleanArgs.email!))
          .first();
        
        if (existingByEmail) {
          const updateData: any = {
            hubspotContactId,
            name: cleanArgs.name,
            email: cleanArgs.email,
            hubspotUrl: cleanArgs.hubspotUrl,
            lastHubSpotSync: new Date().toISOString(),
          };
          
          const phone = cleanArgs.phone || existingByEmail.phone;
          const company = cleanArgs.company || existingByEmail.company;
          const role = cleanArgs.role || existingByEmail.role;
          
          if (phone) updateData.phone = phone;
          if (company) updateData.company = company;
          if (role) updateData.role = role;
          
          await ctx.db.patch(existingByEmail._id, updateData);
          contactId = existingByEmail._id;
        }
      }
      
      // Check for duplicate by name if not found yet
      if (!contactId) {
        const allContacts = await ctx.db.query("contacts").collect();
        const existingByName = allContacts.find(c => 
          c.name.toLowerCase() === cleanArgs.name.toLowerCase()
        );
        
        if (existingByName) {
          const updateData: any = {
            hubspotContactId,
            name: cleanArgs.name,
            hubspotUrl: cleanArgs.hubspotUrl,
            lastHubSpotSync: new Date().toISOString(),
          };
          
          const email = cleanArgs.email || existingByName.email;
          const phone = cleanArgs.phone || existingByName.phone;
          const company = cleanArgs.company || existingByName.company;
          const role = cleanArgs.role || existingByName.role;
          
          if (email) updateData.email = email;
          if (phone) updateData.phone = phone;
          if (company) updateData.company = company;
          if (role) updateData.role = role;
          
          await ctx.db.patch(existingByName._id, updateData);
          contactId = existingByName._id;
        }
      }
      
      // Create new contact if still not found
      if (!contactId) {
        const contactDataClean: any = {
          hubspotContactId,
          name: cleanArgs.name,
          hubspotUrl: cleanArgs.hubspotUrl,
          lastHubSpotSync: new Date().toISOString(),
          createdAt: parseCreatedAt(cleanArgs.createdAt || cleanArgs.hubspotCreatedDate),
        };
        
        if (cleanArgs.email) contactDataClean.email = cleanArgs.email;
        if (cleanArgs.phone) contactDataClean.phone = cleanArgs.phone;
        if (cleanArgs.company) contactDataClean.company = cleanArgs.company;
        if (cleanArgs.role) contactDataClean.role = cleanArgs.role;
        
        contactId = await ctx.db.insert("contacts", contactDataClean);
      }
    }
    
    // Map lifecycle stage
    const leadLifecycleStage = mapToLeadLifecycleStage(lifecycleStage);
    if (!leadLifecycleStage) {
      throw new Error(`Invalid lifecycle stage for lead: ${lifecycleStage}`);
    }
    
    // Check if lead already exists for this contact
    const existingLead = await ctx.db
      .query("leads")
      .withIndex("by_hubspot_contact_id", (q: any) => q.eq("hubspotContactId", hubspotContactId))
      .first();
    
    // Find company if hubspotCompanyId provided
    let companyId: any = undefined;
    if (hubspotCompanyId) {
      const company = await ctx.db
        .query("companies")
        .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", hubspotCompanyId))
        .first();
      if (company) {
        companyId = company._id;
      }
    }
    
    const metadata = mergeMetadata(undefined, customProperties);
    
    if (existingLead) {
      // Update existing lead
      const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt || cleanArgs.hubspotModifiedDate);
      
      const updateData: any = {
        lifecycleStage: leadLifecycleStage,
        hubspotUrl: cleanArgs.hubspotUrl,
        lastHubSpotSync: new Date().toISOString(),
        metadata,
        updatedAt: updatedAtDate,
      };
      
      if (companyId) updateData.companyId = companyId;
      if (cleanArgs.company) updateData.companyName = cleanArgs.company;
      if (cleanArgs.hubspotCompanyId) updateData.hubspotCompanyId = cleanArgs.hubspotCompanyId;
      if (cleanArgs.hubspotCompanyUrl) updateData.hubspotCompanyUrl = cleanArgs.hubspotCompanyUrl;
      if (cleanArgs.lastContactDate) updateData.lastContactDate = cleanArgs.lastContactDate;
      
      await ctx.db.patch(existingLead._id, updateData);
      return { id: existingLead._id, action: "updated", contactId };
    }
    
    // Create new lead
    const createdAtDate = parseCreatedAt(cleanArgs.createdAt || cleanArgs.hubspotCreatedDate);
    const updatedAtDate = parseUpdatedAt(cleanArgs.updatedAt || cleanArgs.hubspotModifiedDate);
    
    const leadDataClean: any = {
      contactId,
      lifecycleStage: leadLifecycleStage,
      status: "new",
      hubspotContactId,
      hubspotUrl: cleanArgs.hubspotUrl,
      lastHubSpotSync: new Date().toISOString(),
      metadata,
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
    };
    
    if (companyId) leadDataClean.companyId = companyId;
    if (cleanArgs.company) leadDataClean.companyName = cleanArgs.company;
    if (cleanArgs.hubspotCompanyId) leadDataClean.hubspotCompanyId = cleanArgs.hubspotCompanyId;
    if (cleanArgs.hubspotCompanyUrl) leadDataClean.hubspotCompanyUrl = cleanArgs.hubspotCompanyUrl;
    if (cleanArgs.lastContactDate) leadDataClean.lastContactDate = cleanArgs.lastContactDate;
    
    const leadId = await ctx.db.insert("leads", leadDataClean);
    
    return { id: leadId, action: "created", contactId };
  },
});

