import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { parseDate } from "./utils";

/**
 * Extract dates from metadata and populate createdAt/updatedAt columns
 * This fixes existing records that have dates stored in metadata
 */
export const extractDatesFromMetadata = mutation({
  args: {
    tableType: v.union(v.literal("contacts"), v.literal("companies"), v.literal("deals")),
  },
  handler: async (ctx, args) => {
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    if (args.tableType === "contacts") {
      const contacts = await ctx.db.query("contacts").collect();
      
      for (const contact of contacts) {
        try {
          if (!contact.metadata || typeof contact.metadata !== 'object') {
            skipped++;
            continue;
          }
          
          const metadata = contact.metadata as any;
          let needsUpdate = false;
          const updateData: any = {};
          
          // Extract createdAt from metadata if missing
          if (!contact.createdAt && metadata.createdAt) {
            const parsedDate = parseDate(metadata.createdAt);
            if (parsedDate !== new Date().toISOString() || metadata.createdAt) {
              updateData.createdAt = parsedDate;
              needsUpdate = true;
            }
          }
          
          // Extract updatedAt from metadata if missing or if metadata has newer date
          if (metadata.updatedAt) {
            const metadataDate = new Date(parseDate(metadata.updatedAt));
            const currentDate = contact.updatedAt ? new Date(contact.updatedAt) : null;
            
            if (!isNaN(metadataDate.getTime()) && metadataDate.getFullYear() > 1970) {
              if (!currentDate || metadataDate > currentDate) {
                updateData.updatedAt = metadataDate.toISOString();
                needsUpdate = true;
              }
            }
          }
          
          if (needsUpdate) {
            await ctx.db.patch(contact._id, updateData);
            updated++;
          } else {
            skipped++;
          }
        } catch (error: any) {
          errors++;
          console.error(`Error extracting dates for contact ${contact._id}:`, error);
        }
      }
    } else if (args.tableType === "companies") {
      const companies = await ctx.db.query("companies").collect();
      
      for (const company of companies) {
        try {
          if (!company.metadata || typeof company.metadata !== 'object') {
            skipped++;
            continue;
          }
          
          const metadata = company.metadata as any;
          let needsUpdate = false;
          const updateData: any = {};
          
          // Extract createdAt from metadata if missing
          if (!company.createdAt && metadata.createdAt) {
            const parsedDate = parseDate(metadata.createdAt);
            if (parsedDate !== new Date().toISOString() || metadata.createdAt) {
              updateData.createdAt = parsedDate;
              needsUpdate = true;
            }
          }
          
          // Extract updatedAt from metadata if missing or if metadata has newer date
          if (metadata.updatedAt) {
            const metadataDate = new Date(parseDate(metadata.updatedAt));
            const currentDate = company.updatedAt ? new Date(company.updatedAt) : null;
            
            if (!isNaN(metadataDate.getTime()) && metadataDate.getFullYear() > 1970) {
              if (!currentDate || metadataDate > currentDate) {
                updateData.updatedAt = metadataDate.toISOString();
                needsUpdate = true;
              }
            }
          }
          
          if (needsUpdate) {
            await ctx.db.patch(company._id, updateData);
            updated++;
          } else {
            skipped++;
          }
        } catch (error: any) {
          errors++;
          console.error(`Error extracting dates for company ${company._id}:`, error);
        }
      }
    } else if (args.tableType === "deals") {
      const deals = await ctx.db.query("deals").collect();
      
      for (const deal of deals) {
        try {
          if (!deal.metadata || typeof deal.metadata !== 'object') {
            skipped++;
            continue;
          }
          
          const metadata = deal.metadata as any;
          let needsUpdate = false;
          const updateData: any = {};
          
          // Extract createdAt from metadata if missing
          if (!deal.createdAt && metadata.createdAt) {
            const parsedDate = parseDate(metadata.createdAt);
            if (parsedDate !== new Date().toISOString() || metadata.createdAt) {
              updateData.createdAt = parsedDate;
              needsUpdate = true;
            }
          }
          
          // Extract updatedAt from metadata if missing or if metadata has newer date
          if (metadata.updatedAt) {
            const metadataDate = new Date(parseDate(metadata.updatedAt));
            const currentDate = deal.updatedAt ? new Date(deal.updatedAt) : null;
            
            if (!isNaN(metadataDate.getTime()) && metadataDate.getFullYear() > 1970) {
              if (!currentDate || metadataDate > currentDate) {
                updateData.updatedAt = metadataDate.toISOString();
                needsUpdate = true;
              }
            }
          }
          
          if (needsUpdate) {
            await ctx.db.patch(deal._id, updateData);
            updated++;
          } else {
            skipped++;
          }
        } catch (error: any) {
          errors++;
          console.error(`Error extracting dates for deal ${deal._id}:`, error);
        }
      }
    }
    
    return { updated, skipped, errors };
  },
});

/**
 * Link contacts to companies by matching company names
 * Matches contact.company (string) to company.name and populates hubspotCompanyIds
 */
export const linkContactsToCompanies = mutation({
  args: {},
  handler: async (ctx) => {
    let contactsUpdated = 0;
    let companiesUpdated = 0;
    let errors = 0;
    
    // Get all contacts with company names but no hubspotCompanyIds
    const contacts = await ctx.db.query("contacts").collect();
    
    // Build a map of company names to HubSpot company IDs
    const companies = await ctx.db.query("companies").collect();
    const companyNameToIdMap = new Map<string, string>();
    
    for (const company of companies) {
      if (company.name && company.hubspotCompanyId) {
        // Normalize company name (lowercase, trim)
        const normalizedName = company.name.toLowerCase().trim();
        companyNameToIdMap.set(normalizedName, company.hubspotCompanyId);
      }
    }
    
    // Match contacts to companies
    for (const contact of contacts) {
      try {
        if (!contact.company || !contact.company.trim()) {
          continue; // Skip contacts without company names
        }
        
        const normalizedContactCompany = contact.company.toLowerCase().trim();
        const matchingCompanyId = companyNameToIdMap.get(normalizedContactCompany);
        
        if (matchingCompanyId) {
          // Found a match - update contact's hubspotCompanyIds
          const existingCompanyIds = contact.hubspotCompanyIds || [];
          
          if (!existingCompanyIds.includes(matchingCompanyId)) {
            const updatedCompanyIds = [...existingCompanyIds, matchingCompanyId];
            await ctx.db.patch(contact._id, { 
              hubspotCompanyIds: updatedCompanyIds 
            });
            contactsUpdated++;
            
            // Also try to link the internal company ID
            const matchingCompany = companies.find(
              c => c.hubspotCompanyId === matchingCompanyId
            );
            
            if (matchingCompany) {
              const existingLinkedCompanyIds = contact.linkedCompanyIds || [];
              if (!existingLinkedCompanyIds.some((id: any) => id === matchingCompany._id)) {
                await ctx.db.patch(contact._id, {
                  linkedCompanyIds: [...existingLinkedCompanyIds, matchingCompany._id as any]
                });
              }
              
              // Also update the company's hubspotContactIds and linkedContactIds
              const existingCompanyContactIds = matchingCompany.hubspotContactIds || [];
              if (contact.hubspotContactId && !existingCompanyContactIds.includes(contact.hubspotContactId)) {
                await ctx.db.patch(matchingCompany._id, {
                  hubspotContactIds: [...existingCompanyContactIds, contact.hubspotContactId]
                });
                companiesUpdated++;
              }
              
              const existingLinkedContactIds = matchingCompany.linkedContactIds || [];
              if (!existingLinkedContactIds.some((id: any) => id === contact._id)) {
                await ctx.db.patch(matchingCompany._id, {
                  linkedContactIds: [...existingLinkedContactIds, contact._id as any]
                });
              }
            }
          }
        }
      } catch (error: any) {
        errors++;
        console.error(`Error linking contact ${contact._id} to company:`, error);
      }
    }
    
    return { contactsUpdated, companiesUpdated, errors };
  },
});

/**
 * Link contacts and companies to deals by matching HubSpot IDs
 * Uses the contactIds and companyIds arrays in deals to link them
 */
export const linkDealsToContactsAndCompanies = mutation({
  args: {},
  handler: async (ctx) => {
    let dealsUpdated = 0;
    let errors = 0;
    
    const deals = await ctx.db.query("deals").collect();
    
    for (const deal of deals) {
      try {
        if (!deal.contactIds && !deal.companyIds) {
          continue; // Skip deals without associations
        }
        
        const linkedContactIds: any[] = [];
        const linkedCompanyIds: any[] = [];
        
        // Link contacts
        if (deal.contactIds && deal.contactIds.length > 0) {
          for (const hubspotContactId of deal.contactIds) {
            const contact = await ctx.db
              .query("contacts")
              .withIndex("by_hubspot_id", (q) => q.eq("hubspotContactId", hubspotContactId))
              .first();
            
            if (contact && !linkedContactIds.some((id: any) => id === contact._id)) {
              linkedContactIds.push(contact._id as any);
            }
          }
        }
        
        // Link companies
        if (deal.companyIds && deal.companyIds.length > 0) {
          for (const hubspotCompanyId of deal.companyIds) {
            const company = await ctx.db
              .query("companies")
              .withIndex("by_hubspot_id", (q) => q.eq("hubspotCompanyId", hubspotCompanyId))
              .first();
            
            if (company && !linkedCompanyIds.some((id: any) => id === company._id)) {
              linkedCompanyIds.push(company._id as any);
            }
          }
        }
        
        // Update deal if we found links
        if (linkedContactIds.length > 0 || linkedCompanyIds.length > 0) {
          const updateData: any = {};
          if (linkedContactIds.length > 0) {
            updateData.linkedContactIds = linkedContactIds;
          }
          if (linkedCompanyIds.length > 0) {
            updateData.linkedCompanyIds = linkedCompanyIds;
          }
          await ctx.db.patch(deal._id, updateData);
          dealsUpdated++;
        }
      } catch (error: any) {
        errors++;
        console.error(`Error linking deal ${deal._id}:`, error);
      }
    }
    
    return { dealsUpdated, errors };
  },
});

