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
              .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotContactId", hubspotContactId))
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
              .withIndex("by_hubspot_id", (q: any) => q.eq("hubspotCompanyId", hubspotCompanyId))
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


/**
 * Back-fill `contact.clientId` for contacts whose linked HubSpot companies
 * have been promoted to Rockcap clients (via `companies.promotedToClientId`).
 *
 * Context: the HubSpot sync populates `contact.linkedCompanyIds` (HubSpot
 * company → Convex company), and the Plan 1 back-link script populated
 * `companies.promotedToClientId` (Convex company → Rockcap client). But the
 * bridge — setting `contact.clientId` from those two — was missing, so the
 * client profile's Key Contacts section appeared empty for HubSpot imports.
 *
 * Idempotent: only patches contacts where `clientId` is not already set.
 */
export const backfillContactClientLinks = mutation({
  args: {},
  handler: async (ctx) => {
    let checked = 0;
    let patched = 0;
    let alreadyLinked = 0;
    let noPromotedCompany = 0;

    const contacts = await ctx.db
      .query("contacts")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    for (const contact of contacts) {
      checked++;
      if ((contact as any).clientId) {
        alreadyLinked++;
        continue;
      }
      const linkedCompanyIds = (contact as any).linkedCompanyIds ?? [];
      if (linkedCompanyIds.length === 0) {
        noPromotedCompany++;
        continue;
      }

      // Find the first linked company that has a promotedToClientId.
      let promotedClientId: any = undefined;
      for (const cid of linkedCompanyIds) {
        const c = await ctx.db.get(cid);
        if (c && (c as any).promotedToClientId) {
          promotedClientId = (c as any).promotedToClientId;
          break;
        }
      }

      if (!promotedClientId) {
        noPromotedCompany++;
        continue;
      }

      await ctx.db.patch(contact._id, { clientId: promotedClientId });
      patched++;
    }

    return {
      checked,
      patched,
      alreadyLinked,
      noPromotedCompany,
    };
  },
});

/**
 * Diagnostic: report counts on the contact↔company linkage state.
 * Use this to answer "how many contacts are unlinked and why" without
 * running mutations.
 */
export const contactLinkageStats = mutation({
  args: {},
  handler: async (ctx) => {
    const contacts = await ctx.db
      .query("contacts")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    let total = 0;
    let withClientId = 0;
    let withHubspotCompanyIds = 0;
    let withLinkedCompanyIds = 0;
    let withAnyLink = 0;
    let fullyOrphan = 0;
    let eligibleForBackfill = 0;

    for (const c of contacts) {
      total++;
      const hasClientId = !!(c as any).clientId;
      const hasHubspotCompanyIds =
        Array.isArray((c as any).hubspotCompanyIds) &&
        (c as any).hubspotCompanyIds.length > 0;
      const hasLinkedCompanyIds =
        Array.isArray((c as any).linkedCompanyIds) &&
        (c as any).linkedCompanyIds.length > 0;

      if (hasClientId) withClientId++;
      if (hasHubspotCompanyIds) withHubspotCompanyIds++;
      if (hasLinkedCompanyIds) withLinkedCompanyIds++;
      if (hasClientId || hasLinkedCompanyIds) withAnyLink++;
      if (!hasClientId && !hasLinkedCompanyIds && !hasHubspotCompanyIds) {
        fullyOrphan++;
      }

      // Eligible for back-fill: no clientId, has linkedCompanyIds, and at
      // least one of those companies has promotedToClientId.
      if (!hasClientId && hasLinkedCompanyIds) {
        for (const cid of (c as any).linkedCompanyIds) {
          const co = await ctx.db.get(cid);
          if (co && (co as any).promotedToClientId) {
            eligibleForBackfill++;
            break;
          }
        }
      }
    }

    return {
      total,
      withClientId,
      withHubspotCompanyIds,
      withLinkedCompanyIds,
      withAnyLink,
      fullyOrphan,
      eligibleForBackfill,
    };
  },
});

/**
 * Aggregated HubSpot activity for the daily-brief generator. Answers:
 * "What HubSpot stuff happened in the last N hours?"
 *
 * Returns counts by activity type + notable recent items, plus deals and
 * contacts synced since the cutoff. All scoped globally (no per-user /
 * per-client filtering) since the daily brief is a whole-org summary.
 *
 * IMPORTANT: uses indexed `.take()` reads to stay under the 16MB per-function
 * read limit. The activities table holds email bodyHtml blobs (tens of KB
 * each) and 5k+ rows — a naive `.collect()` overflows fast. The daily brief
 * only needs aggregate counts + 5 notable items, so capping reads to the
 * most-recent 150 rows is plenty for a 24h window and keeps us bounded
 * regardless of how big the table grows.
 *
 * Deals and contacts tables don't carry bodyHtml but still benefit from
 * indexed reads — we use Convex's implicit `_creationTime` desc order
 * to read the most recent 100 of each and filter in memory.
 */
import { query as reQuery } from "../_generated/server";

const RECENT_ACTIVITY_CAP = 150;
const RECENT_DEAL_CONTACT_CAP = 100;

export const dailyBriefSummary = reQuery({
  args: { sinceISO: v.string() },
  handler: async (ctx, args) => {
    const sinceMs = new Date(args.sinceISO).getTime();

    // Activities — indexed read on by_activity_date, order desc, take the
    // most recent N rows. Filter to the sinceISO window in memory. Bounded
    // by RECENT_ACTIVITY_CAP so the read size can't blow 16MB even if the
    // rows we fetch contain large email bodies.
    const recentSlice = await ctx.db
      .query("activities")
      .withIndex("by_activity_date")
      .order("desc")
      .take(RECENT_ACTIVITY_CAP);
    const recentActivities = recentSlice.filter((a) => {
      if (!a.activityDate) return false;
      return new Date(a.activityDate).getTime() >= sinceMs;
    });

    const byType: Record<string, number> = {};
    for (const a of recentActivities) {
      const type = (a.activityType ?? 'UNKNOWN').toUpperCase();
      byType[type] = (byType[type] || 0) + 1;
    }

    // Notable items: top 5 most recent with a subject (recentSlice is
    // already date-desc from the index, so we walk it in order).
    const notable: Array<{
      type: string;
      subject?: string;
      preview?: string;
      ownerName?: string;
      activityDate?: string;
    }> = [];
    for (const a of recentActivities) {
      if (notable.length >= 5) break;
      if (!a.subject && !a.bodyPreview) continue;
      notable.push({
        type: a.activityType ?? 'UNKNOWN',
        subject: a.subject,
        preview: a.bodyPreview?.slice(0, 120),
        ownerName: a.ownerName,
        activityDate: a.activityDate,
      });
    }

    // Deals — Convex default order is by _creationTime; desc + take gives
    // us the most recently created. Filter in memory to the sinceISO
    // window. Accepts `createdAt` string OR `_creationTime` ms for the
    // check, same as the pre-fix logic.
    const recentDealsSlice = await ctx.db
      .query("deals")
      .order("desc")
      .take(RECENT_DEAL_CONTACT_CAP);
    const newDeals = recentDealsSlice.filter((d) => {
      const ct = d.createdAt
        ? new Date(d.createdAt).getTime()
        : d._creationTime;
      return ct >= sinceMs;
    });

    // Contacts — same pattern. Filter out soft-deleted inside the take
    // loop via Convex's .filter — keeps the read bounded while still
    // respecting the isDeleted flag.
    const recentContactsSlice = await ctx.db
      .query("contacts")
      .order("desc")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .take(RECENT_DEAL_CONTACT_CAP);
    const newContacts = recentContactsSlice.filter((c) => {
      const ct = c.createdAt
        ? new Date(c.createdAt).getTime()
        : c._creationTime;
      return ct >= sinceMs;
    });

    return {
      activitiesByType: byType,
      activitiesTotal: recentActivities.length,
      notableActivities: notable,
      newDealsCount: newDeals.length,
      newDealNames: newDeals.slice(0, 5).map((d) => d.name),
      newContactsCount: newContacts.length,
      newContactNames: newContacts.slice(0, 5).map((c) => c.name),
    };
  },
});
