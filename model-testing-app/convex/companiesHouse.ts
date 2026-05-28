import { v } from "convex/values";
import { mutation, query, internalAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";

/**
 * Normalize address for matching
 * Removes punctuation, converts to lowercase, standardizes format
 */
function normalizeAddress(address: any): string {
  if (!address) return '';
  
  const parts: string[] = [];
  
  if (address.premises) parts.push(address.premises);
  if (address.address_line_1) parts.push(address.address_line_1);
  if (address.address_line_2) parts.push(address.address_line_2);
  if (address.locality) parts.push(address.locality);
  if (address.region) parts.push(address.region);
  if (address.postal_code) parts.push(address.postal_code);
  if (address.country) parts.push(address.country);
  
  // Normalize: lowercase, remove punctuation, remove extra spaces
  const normalized = parts
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return normalized;
}

/**
 * Create hash of normalized address for quick matching
 */
function hashAddress(address: any): string {
  const normalized = normalizeAddress(address);
  // Simple hash function (Convex doesn't have crypto, so we'll use a simple approach)
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get all existing company numbers (for filtering during sync)
 */
export const getExistingCompanyNumbers = query({
  handler: async (ctx) => {
    const companies = await ctx.db.query("companiesHouseCompanies").collect();
    return companies.map(c => c.companyNumber);
  },
});

/**
 * List all tracked companies with optional filters
 */
export const listCompanies = query({
  args: {
    sicCode: v.optional(v.string()),
    hasNewCharges: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let companies: Doc<"companiesHouseCompanies">[];

    if (args.hasNewCharges !== undefined) {
      companies = await ctx.db
        .query("companiesHouseCompanies")
        .withIndex("by_new_charges", (q: any) =>
          q.eq("hasNewCharges", args.hasNewCharges!)
        )
        .collect();
    } else {
      companies = await ctx.db.query("companiesHouseCompanies").collect();
    }

    // Filter by SIC code if provided (client-side filter since index is on array)
    let filtered = companies;
    if (args.sicCode) {
      filtered = companies.filter((company) =>
        company.sicCodes.includes(args.sicCode!)
      );
    }

    // Get charge counts for each company
    const companiesWithChargeCounts = await Promise.all(
      filtered.map(async (company) => {
        const charges = await ctx.db
          .query("companiesHouseCharges")
          .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
          .collect();

        return {
          ...company,
          chargeCount: charges.length,
          newChargeCount: charges.filter((c) => c.isNew).length,
        };
      })
    );

    return companiesWithChargeCounts;
  },
});

/**
 * Get single company with all charges, PSC, and officers
 */
export const getCompany = query({
  args: { companyId: v.id("companiesHouseCompanies") },
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (!company) return null;

    const charges = await ctx.db
      .query("companiesHouseCharges")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    const psc = await ctx.db
      .query("companiesHousePSC")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    const officers = await ctx.db
      .query("companiesHouseOfficers")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    // Get relationships inline (can't call another query's handler)
    const relationships1 = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company1", (q: any) => q.eq("companyId1", args.companyId))
      .collect();
    
    const relationships2 = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company2", (q: any) => q.eq("companyId2", args.companyId))
      .collect();

    const allRelationships = [...relationships1, ...relationships2];
    
    const relationshipsWithCompanies = await Promise.all(
      allRelationships.map(async (rel) => {
        const company1 = await ctx.db.get(rel.companyId1);
        const company2 = await ctx.db.get(rel.companyId2);
        return {
          ...rel,
          company1,
          company2,
        };
      })
    );

    return {
      ...company,
      charges,
      psc,
      officers,
      relationships: relationshipsWithCompanies,
    };
  },
});

/**
 * Get company by company number
 */
export const getCompanyByNumber = query({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companiesHouseCompanies")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    if (!company) return null;

    const charges = await ctx.db
      .query("companiesHouseCharges")
      .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
      .collect();

    return {
      ...company,
      charges,
    };
  },
});

/**
 * Get companies with new charges
 */
export const getCompaniesWithNewCharges = query({
  handler: async (ctx) => {
    const companies = await ctx.db
      .query("companiesHouseCompanies")
      .withIndex("by_new_charges", (q: any) => q.eq("hasNewCharges", true))
      .collect();

    const companiesWithChargeCounts = await Promise.all(
      companies.map(async (company) => {
        const charges = await ctx.db
          .query("companiesHouseCharges")
          .withIndex("by_company", (q: any) => q.eq("companyId", company._id))
          .collect();

        return {
          ...company,
          chargeCount: charges.length,
          newChargeCount: charges.filter((c) => c.isNew).length,
        };
      })
    );

    return companiesWithChargeCounts;
  },
});

/**
 * Save or update company from API data
 */
export const saveCompany = mutation({
  args: {
    companyNumber: v.string(),
    companyName: v.string(),
    sicCodes: v.array(v.string()),
    address: v.optional(v.string()),
    incorporationDate: v.optional(v.string()),
    companyStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if company already exists
    const existing = await ctx.db
      .query("companiesHouseCompanies")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    const now = new Date().toISOString();

    if (existing) {
      // Update existing company
      await ctx.db.patch(existing._id, {
        companyName: args.companyName,
        sicCodes: args.sicCodes,
        address: args.address,
        incorporationDate: args.incorporationDate,
        companyStatus: args.companyStatus,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new company
      const companyId = await ctx.db.insert("companiesHouseCompanies", {
        companyNumber: args.companyNumber,
        companyName: args.companyName,
        sicCodes: args.sicCodes,
        address: args.address,
        incorporationDate: args.incorporationDate,
        companyStatus: args.companyStatus,
        hasNewCharges: false,
        createdAt: now,
        updatedAt: now,
      });
      return companyId;
    }
  },
});

/**
 * Save or update charge with PDF document
 */
export const saveCharge = mutation({
  args: {
    companyId: v.id("companiesHouseCompanies"),
    chargeId: v.string(),
    chargeNumber: v.optional(v.number()),
    chargeDate: v.optional(v.string()),
    chargeDescription: v.optional(v.string()),
    chargeAmount: v.optional(v.number()),
    chargeStatus: v.optional(v.string()),
    chargeeName: v.optional(v.string()),
    pdfUrl: v.optional(v.string()),
    pdfDocumentId: v.optional(v.id("_storage")),
    isNew: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if charge already exists
    const existingCharges = await ctx.db
      .query("companiesHouseCharges")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    const existing = existingCharges.find(
      (c) => c.chargeId === args.chargeId
    );

    const now = new Date().toISOString();
    const isNewCharge = existing === undefined;

    if (existing) {
      // Update existing charge
      await ctx.db.patch(existing._id, {
        chargeDate: args.chargeDate,
        chargeDescription: args.chargeDescription,
        chargeAmount: args.chargeAmount,
        chargeStatus: args.chargeStatus,
        chargeeName: args.chargeeName,
        pdfUrl: args.pdfUrl,
        pdfDocumentId: args.pdfDocumentId,
        isNew: args.isNew !== undefined ? args.isNew : existing.isNew,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new charge
      const chargeId = await ctx.db.insert("companiesHouseCharges", {
        companyId: args.companyId,
        chargeId: args.chargeId,
        chargeDate: args.chargeDate,
        chargeDescription: args.chargeDescription,
        chargeAmount: args.chargeAmount,
        chargeStatus: args.chargeStatus,
        chargeeName: args.chargeeName,
        pdfUrl: args.pdfUrl,
        pdfDocumentId: args.pdfDocumentId,
        isNew: args.isNew !== undefined ? args.isNew : isNewCharge,
        createdAt: now,
        updatedAt: now,
      });

      // Mark company as having new charges if this is a new charge
      if (isNewCharge) {
        const company = await ctx.db.get(args.companyId);
        if (company && !company.hasNewCharges) {
          await ctx.db.patch(args.companyId, {
            hasNewCharges: true,
            updatedAt: now,
          });
        }
      }

      return chargeId;
    }
  },
});

/**
 * Mark charges as seen (clear new charges flag)
 */
export const markChargesAsSeen = mutation({
  args: { companyId: v.id("companiesHouseCompanies") },
  handler: async (ctx, args) => {
    const charges = await ctx.db
      .query("companiesHouseCharges")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .collect();

    const now = new Date().toISOString();

    // Update all charges to clear isNew flag
    for (const charge of charges) {
      if (charge.isNew) {
        await ctx.db.patch(charge._id, {
          isNew: false,
          updatedAt: now,
        });
      }
    }

    // Update company flag
    await ctx.db.patch(args.companyId, {
      hasNewCharges: false,
      lastCheckedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Sync company data (company profile + charges)
 * This is called from the API route after fetching data from Companies House API
 */
export const syncCompanyData = mutation({
  args: {
    companyNumber: v.string(),
    companyName: v.string(),
    sicCodes: v.array(v.string()),
    address: v.optional(v.string()),
    registeredOfficeAddress: v.optional(v.any()),
    incorporationDate: v.optional(v.string()),
    companyStatus: v.optional(v.string()),
    charges: v.array(
      v.object({
        chargeId: v.string(),
        chargeNumber: v.optional(v.number()),
        chargeDate: v.optional(v.string()),
        chargeDescription: v.optional(v.string()),
        chargeAmount: v.optional(v.number()),
        chargeStatus: v.optional(v.string()),
        chargeeName: v.optional(v.string()),
        pdfUrl: v.optional(v.string()),
        pdfDocumentId: v.optional(v.id("_storage")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Calculate address hash if address provided
    const addressHash = args.registeredOfficeAddress 
      ? hashAddress(args.registeredOfficeAddress)
      : undefined;

    // Save or update company
    const existing = await ctx.db
      .query("companiesHouseCompanies")
      .withIndex("by_company_number", (q: any) =>
        q.eq("companyNumber", args.companyNumber)
      )
      .first();

    let companyId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        companyName: args.companyName,
        sicCodes: args.sicCodes,
        address: args.address,
        registeredOfficeAddress: args.registeredOfficeAddress,
        registeredOfficeAddressHash: addressHash,
        incorporationDate: args.incorporationDate,
        companyStatus: args.companyStatus,
        lastCheckedAt: now,
        updatedAt: now,
      });
      companyId = existing._id;
    } else {
      companyId = await ctx.db.insert("companiesHouseCompanies", {
        companyNumber: args.companyNumber,
        companyName: args.companyName,
        sicCodes: args.sicCodes,
        address: args.address,
        registeredOfficeAddress: args.registeredOfficeAddress,
        registeredOfficeAddressHash: addressHash,
        incorporationDate: args.incorporationDate,
        companyStatus: args.companyStatus,
        hasNewCharges: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Get existing charges to detect new ones
    const existingCharges = await ctx.db
      .query("companiesHouseCharges")
      .withIndex("by_company", (q: any) => q.eq("companyId", companyId))
      .collect();

    const existingChargeIds = new Set(existingCharges.map((c) => c.chargeId));
    const existingChargeMap = new Map(
      existingCharges.map((c) => [c.chargeId, c])
    );

    // Save or update charges
    // Mark charges as "new" if they're within the last 12 months (not just new to us)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    let hasNewCharges = false;
    for (const chargeData of args.charges) {
      const isNewToUs = !existingChargeIds.has(chargeData.chargeId);
      const existingCharge = existingChargeMap.get(chargeData.chargeId);
      
      // Check if charge is recent (within 12 months)
      const chargeDate = chargeData.chargeDate ? new Date(chargeData.chargeDate) : null;
      const isRecentCharge = chargeDate && chargeDate >= twelveMonthsAgo;
      
      // Mark as "new" if it's a recent charge (within 12 months)
      const shouldMarkAsNew = isRecentCharge ?? false;

      if (isNewToUs) {
        if (shouldMarkAsNew) {
          hasNewCharges = true;
        }
        // Insert new charge
        await ctx.db.insert("companiesHouseCharges", {
          companyId,
          chargeId: chargeData.chargeId,
          chargeDate: chargeData.chargeDate,
          chargeDescription: chargeData.chargeDescription,
          chargeAmount: chargeData.chargeAmount,
          chargeStatus: chargeData.chargeStatus,
          chargeeName: chargeData.chargeeName,
          pdfUrl: chargeData.pdfUrl,
          pdfDocumentId: chargeData.pdfDocumentId,
          isNew: shouldMarkAsNew,
          createdAt: now,
          updatedAt: now,
        });
      } else if (existingCharge) {
        // Update existing charge
        // Update isNew flag based on whether it's recent
        if (shouldMarkAsNew && !existingCharge.isNew) {
          hasNewCharges = true;
        }
        
        await ctx.db.patch(existingCharge._id, {
          chargeDate: chargeData.chargeDate,
          chargeDescription: chargeData.chargeDescription,
          chargeAmount: chargeData.chargeAmount,
          chargeStatus: chargeData.chargeStatus,
          chargeeName: chargeData.chargeeName,
          pdfUrl: chargeData.pdfUrl,
          pdfDocumentId: chargeData.pdfDocumentId,
          isNew: shouldMarkAsNew, // Update based on recency
          updatedAt: now,
        });
      }
    }

    // Update company's new charges flag
    if (hasNewCharges) {
      await ctx.db.patch(companyId, {
        hasNewCharges: true,
        updatedAt: now,
      });
    }

    return companyId;
  },
});

/**
 * Save PSC (Person with Significant Control) data
 */
export const savePSC = mutation({
  args: {
    pscId: v.string(),
    companyId: v.id("companiesHouseCompanies"),
    pscType: v.union(
      v.literal("individual"),
      v.literal("corporate-entity"),
      v.literal("legal-person")
    ),
    name: v.string(),
    nationality: v.optional(v.string()),
    dateOfBirth: v.optional(v.object({
      month: v.optional(v.number()),
      year: v.optional(v.number()),
    })),
    address: v.optional(v.any()),
    naturesOfControl: v.optional(v.array(v.string())),
    notifiableOn: v.optional(v.string()),
    ceasedOn: v.optional(v.string()),
    identification: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if PSC already exists for this company
    const existing = await ctx.db
      .query("companiesHousePSC")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .filter((q) => q.eq(q.field("pscId"), args.pscId))
      .first();

    if (existing) {
      // Update existing PSC
      await ctx.db.patch(existing._id, {
        name: args.name,
        nationality: args.nationality,
        dateOfBirth: args.dateOfBirth,
        address: args.address,
        naturesOfControl: args.naturesOfControl,
        notifiableOn: args.notifiableOn,
        ceasedOn: args.ceasedOn,
        identification: args.identification,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new PSC
      const pscId = await ctx.db.insert("companiesHousePSC", {
        pscId: args.pscId,
        companyId: args.companyId,
        pscType: args.pscType,
        name: args.name,
        nationality: args.nationality,
        dateOfBirth: args.dateOfBirth,
        address: args.address,
        naturesOfControl: args.naturesOfControl,
        notifiableOn: args.notifiableOn,
        ceasedOn: args.ceasedOn,
        identification: args.identification,
        createdAt: now,
        updatedAt: now,
      });
      return pscId;
    }
  },
});

/**
 * Save officer data
 */
export const saveOfficer = mutation({
  args: {
    officerId: v.string(),
    companyId: v.id("companiesHouseCompanies"),
    name: v.string(),
    officerRole: v.string(),
    appointedOn: v.optional(v.string()),
    resignedOn: v.optional(v.string()),
    nationality: v.optional(v.string()),
    occupation: v.optional(v.string()),
    countryOfResidence: v.optional(v.string()),
    address: v.optional(v.any()),
    dateOfBirth: v.optional(v.object({
      month: v.optional(v.number()),
      year: v.optional(v.number()),
    })),
    // CH links.officer.appointments — appointments URL/id (future join key).
    appointmentsLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if officer already exists for this company
    const existing = await ctx.db
      .query("companiesHouseOfficers")
      .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
      .filter((q) => q.eq(q.field("officerId"), args.officerId))
      .first();

    if (existing) {
      // Update existing officer
      await ctx.db.patch(existing._id, {
        name: args.name,
        officerRole: args.officerRole,
        appointedOn: args.appointedOn,
        resignedOn: args.resignedOn,
        nationality: args.nationality,
        occupation: args.occupation,
        countryOfResidence: args.countryOfResidence,
        address: args.address,
        dateOfBirth: args.dateOfBirth,
        appointmentsLink: args.appointmentsLink,
        updatedAt: now,
      });
      return existing._id;
    } else {
      // Create new officer
      const officerId = await ctx.db.insert("companiesHouseOfficers", {
        officerId: args.officerId,
        companyId: args.companyId,
        name: args.name,
        officerRole: args.officerRole,
        appointedOn: args.appointedOn,
        resignedOn: args.resignedOn,
        nationality: args.nationality,
        occupation: args.occupation,
        countryOfResidence: args.countryOfResidence,
        address: args.address,
        dateOfBirth: args.dateOfBirth,
        appointmentsLink: args.appointmentsLink,
        createdAt: now,
        updatedAt: now,
      });
      return officerId;
    }
  },
});

/**
 * Get PDF URL from storage ID
 */
export const getChargePdfUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Get company relationships
 */
export const getCompanyRelationships = query({
  args: { companyId: v.id("companiesHouseCompanies") },
  handler: async (ctx, args) => {
    const relationships = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company1", (q: any) => q.eq("companyId1", args.companyId))
      .collect();
    
    const relationships2 = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company2", (q: any) => q.eq("companyId2", args.companyId))
      .collect();

    // Combine and get company details
    const allRelationships = [...relationships, ...relationships2];
    
    const relationshipsWithCompanies = await Promise.all(
      allRelationships.map(async (rel) => {
        const company1 = await ctx.db.get(rel.companyId1);
        const company2 = await ctx.db.get(rel.companyId2);
        return {
          ...rel,
          company1,
          company2,
        };
      })
    );

    return relationshipsWithCompanies;
  },
});

/**
 * Build relationships for all companies
 * Scans companies and finds relationships through shared PSC, officers, and addresses
 */
export const buildAllRelationships = mutation({
  args: {},
  handler: async (ctx) => {
    const companies = await ctx.db.query("companiesHouseCompanies").collect();
    let relationshipsCreated = 0;

    // Group companies by address hash
    const companiesByAddress = new Map<string, Id<"companiesHouseCompanies">[]>();
    for (const company of companies) {
      if (company.registeredOfficeAddressHash) {
        if (!companiesByAddress.has(company.registeredOfficeAddressHash)) {
          companiesByAddress.set(company.registeredOfficeAddressHash, []);
        }
        companiesByAddress.get(company.registeredOfficeAddressHash)!.push(company._id);
      }
    }

    // Link companies by shared address
    for (const [addressHash, companyIds] of companiesByAddress.entries()) {
      if (companyIds.length > 1) {
        // Create relationships between all pairs
        for (let i = 0; i < companyIds.length; i++) {
          for (let j = i + 1; j < companyIds.length; j++) {
            // Check if relationship already exists
            const existing = await ctx.db
              .query("companyRelationships")
              .withIndex("by_company1", (q: any) => q.eq("companyId1", companyIds[i]))
              .filter((q) => 
                q.or(
                  q.and(
                    q.eq(q.field("companyId2"), companyIds[j]),
                    q.eq(q.field("relationshipType"), "shared_address")
                  ),
                  q.and(
                    q.eq(q.field("companyId1"), companyIds[j]),
                    q.eq(q.field("companyId2"), companyIds[i]),
                    q.eq(q.field("relationshipType"), "shared_address")
                  )
                )
              )
              .first();

            if (!existing) {
              const now = new Date().toISOString();
              await ctx.db.insert("companyRelationships", {
                companyId1: companyIds[i],
                companyId2: companyIds[j],
                relationshipType: "shared_address",
                sharedEntityId: addressHash,
                sharedEntityType: "address",
                strength: 1,
                createdAt: now,
                updatedAt: now,
              });
              relationshipsCreated++;
            }
          }
        }
      }
    }

    // Group companies by PSC
    const companiesByPSC = new Map<string, string[]>();
    const allPSC = await ctx.db.query("companiesHousePSC").collect();
    for (const psc of allPSC) {
      const key = psc.pscId;
      if (!companiesByPSC.has(key)) {
        companiesByPSC.set(key, []);
      }
      companiesByPSC.get(key)!.push(psc.companyId);
    }

    // Link companies by shared PSC
    for (const [pscId, companyIds] of companiesByPSC.entries()) {
      if (companyIds.length > 1) {
        // Count how many PSC connections exist between pairs
        const connectionCounts = new Map<string, number>();
        for (let i = 0; i < companyIds.length; i++) {
          for (let j = i + 1; j < companyIds.length; j++) {
            const pairKey = [companyIds[i], companyIds[j]].sort().join('-');
            connectionCounts.set(pairKey, (connectionCounts.get(pairKey) || 0) + 1);
          }
        }

        // Create relationships with strength based on number of shared PSC
        for (const [pairKey, strength] of connectionCounts.entries()) {
          const [id1, id2] = pairKey.split('-');
          // Check if relationship already exists
          const existing = await ctx.db
            .query("companyRelationships")
            .withIndex("by_company1", (q: any) => q.eq("companyId1", id1 as any))
            .filter((q) => 
              q.or(
                q.and(
                  q.eq(q.field("companyId2"), id2 as any),
                  q.eq(q.field("relationshipType"), "shared_psc")
                ),
                q.and(
                  q.eq(q.field("companyId1"), id2 as any),
                  q.eq(q.field("companyId2"), id1 as any),
                  q.eq(q.field("relationshipType"), "shared_psc")
                )
              )
            )
            .first();

          if (!existing || strength > existing.strength) {
            const now = new Date().toISOString();
            if (existing) {
              await ctx.db.patch(existing._id, {
                strength,
                updatedAt: now,
              });
            } else {
              await ctx.db.insert("companyRelationships", {
                companyId1: id1 as any,
                companyId2: id2 as any,
                relationshipType: "shared_psc",
                sharedEntityId: pscId,
                sharedEntityType: "psc",
                strength,
                createdAt: now,
                updatedAt: now,
              });
              relationshipsCreated++;
            }
          }
        }
      }
    }

    // Group companies by officers
    const companiesByOfficer = new Map<string, string[]>();
    const allOfficers = await ctx.db.query("companiesHouseOfficers").collect();
    for (const officer of allOfficers) {
      const key = officer.officerId;
      if (!companiesByOfficer.has(key)) {
        companiesByOfficer.set(key, []);
      }
      companiesByOfficer.get(key)!.push(officer.companyId);
    }

    // Link companies by shared officers
    for (const [officerId, companyIds] of companiesByOfficer.entries()) {
      if (companyIds.length > 1) {
        // Count how many officer connections exist between pairs
        const connectionCounts = new Map<string, number>();
        for (let i = 0; i < companyIds.length; i++) {
          for (let j = i + 1; j < companyIds.length; j++) {
            const pairKey = [companyIds[i], companyIds[j]].sort().join('-');
            connectionCounts.set(pairKey, (connectionCounts.get(pairKey) || 0) + 1);
          }
        }

        // Create relationships with strength based on number of shared officers
        for (const [pairKey, strength] of connectionCounts.entries()) {
          const [id1, id2] = pairKey.split('-');
          // Check if relationship already exists
          const existing = await ctx.db
            .query("companyRelationships")
            .withIndex("by_company1", (q: any) => q.eq("companyId1", id1 as any))
            .filter((q) => 
              q.or(
                q.and(
                  q.eq(q.field("companyId2"), id2 as any),
                  q.eq(q.field("relationshipType"), "shared_officer")
                ),
                q.and(
                  q.eq(q.field("companyId1"), id2 as any),
                  q.eq(q.field("companyId2"), id1 as any),
                  q.eq(q.field("relationshipType"), "shared_officer")
                )
              )
            )
            .first();

          if (!existing || strength > existing.strength) {
            const now = new Date().toISOString();
            if (existing) {
              await ctx.db.patch(existing._id, {
                strength,
                updatedAt: now,
              });
            } else {
              await ctx.db.insert("companyRelationships", {
                companyId1: id1 as any,
                companyId2: id2 as any,
                relationshipType: "shared_officer",
                sharedEntityId: officerId,
                sharedEntityType: "officer",
                strength,
                createdAt: now,
                updatedAt: now,
              });
              relationshipsCreated++;
            }
          }
        }
      }
    }

    return { relationshipsCreated };
  },
});

/**
 * Link companies by shared PSC
 */
export const linkCompaniesByPSC = mutation({
  args: {
    companyId1: v.id("companiesHouseCompanies"),
    companyId2: v.id("companiesHouseCompanies"),
    pscId: v.string(),
    strength: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if relationship already exists
    const existing = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company1", (q: any) => q.eq("companyId1", args.companyId1))
      .filter((q) => 
        q.or(
          q.and(
            q.eq(q.field("companyId2"), args.companyId2),
            q.eq(q.field("relationshipType"), "shared_psc")
          ),
          q.and(
            q.eq(q.field("companyId1"), args.companyId2),
            q.eq(q.field("companyId2"), args.companyId1),
            q.eq(q.field("relationshipType"), "shared_psc")
          )
        )
      )
      .first();

    if (existing) {
      // Update strength if higher
      if (args.strength > existing.strength) {
        await ctx.db.patch(existing._id, {
          strength: args.strength,
          updatedAt: now,
        });
      }
      return existing._id;
    } else {
      // Create new relationship
      const relId = await ctx.db.insert("companyRelationships", {
        companyId1: args.companyId1,
        companyId2: args.companyId2,
        relationshipType: "shared_psc",
        sharedEntityId: args.pscId,
        sharedEntityType: "psc",
        strength: args.strength,
        createdAt: now,
        updatedAt: now,
      });
      return relId;
    }
  },
});

/**
 * Link companies by shared officer
 */
export const linkCompaniesByOfficer = mutation({
  args: {
    companyId1: v.id("companiesHouseCompanies"),
    companyId2: v.id("companiesHouseCompanies"),
    officerId: v.string(),
    strength: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if relationship already exists
    const existing = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company1", (q: any) => q.eq("companyId1", args.companyId1))
      .filter((q) => 
        q.or(
          q.and(
            q.eq(q.field("companyId2"), args.companyId2),
            q.eq(q.field("relationshipType"), "shared_officer")
          ),
          q.and(
            q.eq(q.field("companyId1"), args.companyId2),
            q.eq(q.field("companyId2"), args.companyId1),
            q.eq(q.field("relationshipType"), "shared_officer")
          )
        )
      )
      .first();

    if (existing) {
      // Update strength if higher
      if (args.strength > existing.strength) {
        await ctx.db.patch(existing._id, {
          strength: args.strength,
          updatedAt: now,
        });
      }
      return existing._id;
    } else {
      // Create new relationship
      const relId = await ctx.db.insert("companyRelationships", {
        companyId1: args.companyId1,
        companyId2: args.companyId2,
        relationshipType: "shared_officer",
        sharedEntityId: args.officerId,
        sharedEntityType: "officer",
        strength: args.strength,
        createdAt: now,
        updatedAt: now,
      });
      return relId;
    }
  },
});

/**
 * Link companies by shared registered office address
 */
export const linkCompaniesByAddress = mutation({
  args: {
    companyId1: v.id("companiesHouseCompanies"),
    companyId2: v.id("companiesHouseCompanies"),
    addressHash: v.string(),
    strength: v.number(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    
    // Check if relationship already exists
    const existing = await ctx.db
      .query("companyRelationships")
      .withIndex("by_company1", (q: any) => q.eq("companyId1", args.companyId1))
      .filter((q) => 
        q.or(
          q.and(
            q.eq(q.field("companyId2"), args.companyId2),
            q.eq(q.field("relationshipType"), "shared_address")
          ),
          q.and(
            q.eq(q.field("companyId1"), args.companyId2),
            q.eq(q.field("companyId2"), args.companyId1),
            q.eq(q.field("relationshipType"), "shared_address")
          )
        )
      )
      .first();

    if (existing) {
      // Update strength if higher
      if (args.strength > existing.strength) {
        await ctx.db.patch(existing._id, {
          strength: args.strength,
          updatedAt: now,
        });
      }
      return existing._id;
    } else {
      // Create new relationship
      const relId = await ctx.db.insert("companyRelationships", {
        companyId1: args.companyId1,
        companyId2: args.companyId2,
        relationshipType: "shared_address",
        sharedEntityId: args.addressHash,
        sharedEntityType: "address",
        strength: args.strength,
        createdAt: now,
        updatedAt: now,
      });
      return relId;
    }
  },
});

/**
 * Upload PDF document to Convex storage
 * This is a helper mutation that can be called to store PDFs
 */
export const uploadChargePdf = mutation({
  args: {
    companyId: v.id("companiesHouseCompanies"),
    chargeId: v.string(),
    pdfData: v.string(), // Base64 encoded PDF data
    pdfUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Convert base64 to Uint8Array for Convex storage
      const binaryString = atob(args.pdfData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Upload to Convex storage using generateUploadUrl
      const uploadUrl = await ctx.storage.generateUploadUrl();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: blob,
      });
      
      if (!uploadResponse.ok) {
        throw new Error("Failed to upload PDF to Convex storage");
      }
      
      const responseText = await uploadResponse.text();
      let storageId: Id<"_storage">;
      try {
        const responseData = JSON.parse(responseText);
        storageId = responseData.storageId as Id<"_storage">;
      } catch {
        storageId = responseText.trim() as Id<"_storage">;
      }

      // Find the charge and update it with the storage ID
      const charges = await ctx.db
        .query("companiesHouseCharges")
        .withIndex("by_company", (q: any) => q.eq("companyId", args.companyId))
        .collect();

      const charge = charges.find((c) => c.chargeId === args.chargeId);
      if (charge) {
        await ctx.db.patch(charge._id, {
          pdfDocumentId: storageId,
          pdfUrl: args.pdfUrl,
          updatedAt: new Date().toISOString(),
        });
      }

      return storageId;
    } catch (error) {
      console.error("Error uploading PDF:", error);
      throw error;
    }
  },
});

// ── v1.2 prospect-intel hardening: single-company sync from CH API ──────────
// Called by the new companies.syncCompaniesHouse MCP tool to fetch + persist
// profile + charges + officers + PSCs for a single CH number. Replaces the
// "operator triggers sync manually" gap that bites every new prospect run.
//
// Architecture choice: this is a Convex action calling CH API directly via
// fetch (not via the Next /api/companies-house route). Requires
// COMPANIES_HOUSE_API_KEY in Convex env. The Next route is for batch sync;
// this is for single-company on-demand. Independent of NEXT_APP_URL.
//
// Auth to CH API: HTTP Basic with the API key as the username, empty password.

const CH_BASE_URL = "https://api.company-information.service.gov.uk";

async function chFetch<T>(path: string, apiKey: string): Promise<T | null> {
  const auth = btoa(`${apiKey}:`);
  const res = await fetch(`${CH_BASE_URL}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`CH API error ${res.status} on ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export const syncOneCompanyFromCHInternal = internalAction({
  args: { companyNumber: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      throw new Error("COMPANIES_HOUSE_API_KEY not set in Convex env");
    }

    const num = args.companyNumber.trim().toUpperCase();

    // Profile (canonical source of name, status, SIC codes, address)
    const profile = await chFetch<any>(`/company/${num}`, apiKey);
    if (!profile) {
      return {
        ok: false,
        companyNumber: num,
        reason: "company_not_found_on_companies_house",
      };
    }

    // Fetch charges + officers + PSCs. Each is upserted below via the
    // existing saveCharge/saveOfficer/savePSC paths (idempotent on their
    // natural keys). 404s return null (chFetch) — handled as "none".
    const chargesData = await chFetch<any>(`/company/${num}/charges?items_per_page=100`, apiKey);
    const officersData = await chFetch<any>(`/company/${num}/officers?items_per_page=100`, apiKey);
    const pscData = await chFetch<any>(
      `/company/${num}/persons-with-significant-control?items_per_page=100`,
      apiKey,
    );

    // Build the charges payload in the shape syncCompanyData expects
    const charges = (chargesData?.items ?? []).map((c: any) => ({
      chargeId: c.id ?? c.charge_number?.toString() ?? "",
      chargeNumber: typeof c.charge_number === "number" ? c.charge_number : undefined,
      chargeDate: c.delivered_on ?? c.created_on,
      chargeDescription: c.particulars?.description ?? c.classification?.description,
      chargeStatus: c.status,
      chargeeName: (c.persons_entitled ?? [])
        .map((p: any) => p.name)
        .filter(Boolean)
        .join("; ") || undefined,
    }));

    // Build address string
    const ro = profile.registered_office_address ?? {};
    const addressParts = [
      ro.premises,
      ro.address_line_1,
      ro.address_line_2,
      ro.locality,
      ro.region,
      ro.postal_code,
      ro.country,
    ].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(", ") : undefined;

    // Persist profile + charges. Returns the companiesHouseCompanies id,
    // which we need as the FK for officers + PSCs below.
    const companyId = await ctx.runMutation(api.companiesHouse.syncCompanyData, {
      companyNumber: num,
      companyName: profile.company_name ?? num,
      sicCodes: profile.sic_codes ?? [],
      address,
      registeredOfficeAddress: ro,
      incorporationDate: profile.date_of_creation,
      companyStatus: profile.company_status,
      charges,
    });

    // ── Officers ──────────────────────────────────────────────────────────
    // CH officer list items carry no top-level id; identity lives on
    // links.officer.appointments (e.g. "/officers/abc123.../appointments").
    // We persist that link verbatim (a later feature uses it as a join key)
    // AND derive a stable officerId from it for the upsert natural key. If the
    // link is somehow absent, fall back to a name+role+appointed_on composite
    // so the upsert stays deterministic. saveOfficer is idempotent on
    // (companyId, officerId).
    let officersCount = 0;
    for (const o of officersData?.items ?? []) {
      const appointmentsLink: string | undefined = o.links?.officer?.appointments;
      const officerId =
        appointmentsLink ??
        ([o.name, o.officer_role, o.appointed_on].filter(Boolean).join("|") ||
          o.name ||
          "unknown-officer");
      await ctx.runMutation(api.companiesHouse.saveOfficer, {
        officerId,
        companyId,
        name: o.name ?? "Unknown",
        officerRole: o.officer_role ?? "unknown",
        appointedOn: o.appointed_on,
        resignedOn: o.resigned_on,
        nationality: o.nationality,
        occupation: o.occupation,
        countryOfResidence: o.country_of_residence,
        address: o.address,
        dateOfBirth: o.date_of_birth
          ? { month: o.date_of_birth.month, year: o.date_of_birth.year }
          : undefined,
        appointmentsLink,
      });
      officersCount++;
    }

    // ── PSCs (persons with significant control) ─────────────────────────────
    // Identity from links.self (e.g. ".../persons-with-significant-control/
    // individual/xyz"). CH `kind` maps to our pscType union. savePSC is
    // idempotent on (companyId, pscId).
    let pscCount = 0;
    for (const p of pscData?.items ?? []) {
      const pscId: string =
        p.links?.self ??
        ([p.name, p.notified_on].filter(Boolean).join("|") ||
          p.name ||
          "unknown-psc");
      // Map CH `kind` → our union. Defaults to "individual" when unrecognised.
      const kind: string = p.kind ?? "";
      const pscType: "individual" | "corporate-entity" | "legal-person" =
        kind.includes("corporate-entity")
          ? "corporate-entity"
          : kind.includes("legal-person")
            ? "legal-person"
            : "individual";
      await ctx.runMutation(api.companiesHouse.savePSC, {
        pscId,
        companyId,
        pscType,
        name: p.name ?? "Unknown",
        nationality: p.nationality,
        dateOfBirth: p.date_of_birth
          ? { month: p.date_of_birth.month, year: p.date_of_birth.year }
          : undefined,
        address: p.address,
        naturesOfControl: p.natures_of_control,
        notifiableOn: p.notified_on,
        ceasedOn: p.ceased_on,
        identification: p.identification,
      });
      pscCount++;
    }

    return {
      ok: true,
      companyNumber: num,
      companyName: profile.company_name,
      status: profile.company_status,
      incorporationDate: profile.date_of_creation,
      sicCodes: profile.sic_codes ?? [],
      chargesCount: charges.length,
      officersCount,
      pscCount,
      message: `Synced ${num}: profile + ${charges.length} charges + ${officersCount} officers + ${pscCount} PSCs persisted.`,
    };
  },
});

// ── v1.x prospect-intel: Companies House NAME search ────────────────────────
// Resolves a free-text company name to ranked CH matches so the operator/skill
// can pick the right company_number before calling companies.syncCompaniesHouse.
// Read-only (no persistence). Same CH Basic auth as the profile/charges fetch
// (API key as username, empty password) via chFetch above.
//
// Endpoint: GET /search/companies?q={query}&items_per_page={limit}

export const searchCompaniesHouseInternal = internalAction({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      throw new Error("COMPANIES_HOUSE_API_KEY not set in Convex env");
    }

    const q = args.query.trim();
    if (!q) {
      return { ok: false, query: args.query, reason: "empty_query", results: [] };
    }

    // Clamp limit to CH's allowed range (1..100); default 20.
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);

    const path = `/search/companies?q=${encodeURIComponent(q)}&items_per_page=${limit}`;
    const data = await chFetch<any>(path, apiKey);

    const items = data?.items ?? [];
    const results = items.map((item: any) => ({
      company_number: item.company_number,
      title: item.title,
      company_status: item.company_status,
      date_of_creation: item.date_of_creation,
      address_snippet: item.address_snippet,
      // SIC codes when CH returns them on the search hit (not always present).
      sic_codes: item.sic_codes ?? undefined,
      company_type: item.company_type,
    }));

    return {
      ok: true,
      query: q,
      totalResults: data?.total_results ?? results.length,
      returnedResults: results.length,
      results,
    };
  },
});
