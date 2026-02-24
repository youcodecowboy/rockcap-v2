import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ============================================================================
// CLIENT INTELLIGENCE - QUERIES
// ============================================================================

/**
 * Get client intelligence by client ID
 * Returns null if not found (use getOrCreate for auto-creation)
 */
export const getClientIntelligence = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();
  },
});

/**
 * Get project intelligence by project ID
 * Returns null if not found (use getOrCreate for auto-creation)
 */
export const getProjectIntelligence = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();
  },
});

/**
 * Get client intelligence or create if not exists
 */
export const getOrCreateClientIntelligence = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    if (existing) {
      return existing;
    }

    // Return a default structure (actual creation happens via mutation)
    const client = await ctx.db.get(args.clientId);
    return {
      _id: null,
      clientId: args.clientId,
      clientType: client?.type || "borrower",
      identity: null,
      primaryContact: null,
      addresses: null,
      banking: null,
      keyPeople: null,
      lenderProfile: null,
      borrowerProfile: null,
      aiSummary: null,
      projectSummaries: null,
      customFields: null,
      fieldSources: null,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: null,
      version: 0,
    };
  },
});

/**
 * Get project intelligence or create if not exists
 */
export const getOrCreateProjectIntelligence = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      return existing;
    }

    // Return a default structure (actual creation happens via mutation)
    return {
      _id: null,
      projectId: args.projectId,
      overview: null,
      location: null,
      financials: null,
      timeline: null,
      development: null,
      keyParties: null,
      dataLibrarySummary: null,
      aiSummary: null,
      customFields: null,
      fieldSources: null,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: null,
      version: 0,
    };
  },
});

/**
 * Search lenders by criteria
 */
export const searchLenders = query({
  args: {
    dealSize: v.optional(v.number()),
    propertyType: v.optional(v.string()),
    loanType: v.optional(v.string()),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all lender intelligence records
    const allLenders = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client_type", (q) => q.eq("clientType", "lender"))
      .collect();

    // Filter by criteria
    let filtered = allLenders;

    if (args.dealSize !== undefined) {
      filtered = filtered.filter((lender) => {
        const profile = lender.lenderProfile;
        if (!profile) return false;
        const min = profile.dealSizeMin ?? 0;
        const max = profile.dealSizeMax ?? Infinity;
        return args.dealSize! >= min && args.dealSize! <= max;
      });
    }

    if (args.propertyType) {
      filtered = filtered.filter((lender) => {
        const types = lender.lenderProfile?.propertyTypes;
        if (!types || types.length === 0) return true; // No restriction
        return types.some(
          (t) => t.toLowerCase() === args.propertyType!.toLowerCase()
        );
      });
    }

    if (args.loanType) {
      filtered = filtered.filter((lender) => {
        const types = lender.lenderProfile?.loanTypes;
        if (!types || types.length === 0) return true; // No restriction
        return types.some(
          (t) => t.toLowerCase() === args.loanType!.toLowerCase()
        );
      });
    }

    if (args.region) {
      filtered = filtered.filter((lender) => {
        const regions = lender.lenderProfile?.geographicRegions;
        if (!regions || regions.length === 0) return true; // No restriction
        return regions.some(
          (r) =>
            r.toLowerCase() === args.region!.toLowerCase() ||
            r.toLowerCase() === "uk-wide" ||
            r.toLowerCase() === "nationwide"
        );
      });
    }

    // Enrich with client data
    const enriched = await Promise.all(
      filtered.map(async (intel) => {
        const client = await ctx.db.get(intel.clientId);
        return {
          ...intel,
          clientName: client?.name,
          clientStatus: client?.status,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get all client intelligence records (for admin/search)
 */
export const listClientIntelligence = query({
  args: {
    clientType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.clientType) {
      return await ctx.db
        .query("clientIntelligence")
        .withIndex("by_client_type", (q) => q.eq("clientType", args.clientType!))
        .collect();
    }
    return await ctx.db.query("clientIntelligence").collect();
  },
});

// ============================================================================
// CLIENT INTELLIGENCE - MUTATIONS
// ============================================================================

/**
 * Initialize client intelligence when a client is created
 */
export const initializeClientIntelligence = mutation({
  args: {
    clientId: v.id("clients"),
    clientType: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = new Date().toISOString();

    // Get client data to pre-populate
    const client = await ctx.db.get(args.clientId);

    const intelligenceId = await ctx.db.insert("clientIntelligence", {
      clientId: args.clientId,
      clientType: args.clientType || client?.type || "borrower",
      identity: client
        ? {
            legalName: client.name,
            tradingName: client.companyName,
          }
        : undefined,
      primaryContact: client?.email
        ? {
            email: client.email,
            phone: client.phone,
          }
        : undefined,
      addresses: client?.address
        ? {
            registered: [
              client.address,
              client.city,
              client.state,
              client.zip,
              client.country,
            ]
              .filter(Boolean)
              .join(", "),
          }
        : undefined,
      lastUpdated: now,
      lastUpdatedBy: "system",
      version: 1,
    });

    return intelligenceId;
  },
});

/**
 * Initialize project intelligence when a project is created
 */
export const initializeProjectIntelligence = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // Check if already exists
    const existing = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = new Date().toISOString();

    // Get project data to pre-populate
    const project = await ctx.db.get(args.projectId);

    // Build key parties from clientRoles
    let keyParties: any = undefined;
    if (project?.clientRoles && project.clientRoles.length > 0) {
      keyParties = {};
      for (const role of project.clientRoles) {
        const client = await ctx.db.get(role.clientId as Id<"clients">);
        if (client) {
          const partyData = {
            clientId: role.clientId as Id<"clients">,
            name: client.name,
            contactName: client.name,
            contactEmail: client.email,
          };

          if (role.role.toLowerCase() === "borrower") {
            keyParties.borrower = partyData;
          } else if (role.role.toLowerCase() === "lender") {
            keyParties.lender = partyData;
          }
        }
      }
    }

    const intelligenceId = await ctx.db.insert("projectIntelligence", {
      projectId: args.projectId,
      overview: project?.description
        ? {
            description: project.description,
            currentPhase: project.lifecycleStage,
          }
        : undefined,
      location: project?.address
        ? {
            siteAddress: [
              project.address,
              project.city,
              project.state,
              project.zip,
            ]
              .filter(Boolean)
              .join(", "),
            postcode: project.zip,
            region: project.state,
          }
        : undefined,
      financials: project?.loanAmount
        ? {
            loanAmount: project.loanAmount,
            interestRate: project.interestRate,
          }
        : undefined,
      timeline:
        project?.startDate || project?.endDate
          ? {
              constructionStartDate: project.startDate,
              practicalCompletionDate: project.expectedCompletionDate,
            }
          : undefined,
      keyParties,
      lastUpdated: now,
      lastUpdatedBy: "system",
      version: 1,
    });

    return intelligenceId;
  },
});

/**
 * Update client intelligence (partial update)
 */
export const updateClientIntelligence = mutation({
  args: {
    clientId: v.id("clients"),
    identity: v.optional(
      v.object({
        legalName: v.optional(v.string()),
        tradingName: v.optional(v.string()),
        companyNumber: v.optional(v.string()),
        vatNumber: v.optional(v.string()),
        incorporationDate: v.optional(v.string()),
      })
    ),
    primaryContact: v.optional(
      v.object({
        name: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        role: v.optional(v.string()),
      })
    ),
    addresses: v.optional(
      v.object({
        registered: v.optional(v.string()),
        trading: v.optional(v.string()),
        correspondence: v.optional(v.string()),
      })
    ),
    banking: v.optional(
      v.object({
        bankName: v.optional(v.string()),
        accountName: v.optional(v.string()),
        accountNumber: v.optional(v.string()),
        sortCode: v.optional(v.string()),
        iban: v.optional(v.string()),
        swift: v.optional(v.string()),
      })
    ),
    keyPeople: v.optional(
      v.array(
        v.object({
          name: v.string(),
          role: v.optional(v.string()),
          email: v.optional(v.string()),
          phone: v.optional(v.string()),
          isDecisionMaker: v.optional(v.boolean()),
          notes: v.optional(v.string()),
        })
      )
    ),
    lenderProfile: v.optional(
      v.object({
        dealSizeMin: v.optional(v.number()),
        dealSizeMax: v.optional(v.number()),
        preferredDealSize: v.optional(v.number()),
        propertyTypes: v.optional(v.array(v.string())),
        loanTypes: v.optional(v.array(v.string())),
        geographicRegions: v.optional(v.array(v.string())),
        typicalLTV: v.optional(v.number()),
        typicalInterestRate: v.optional(
          v.object({
            min: v.optional(v.number()),
            max: v.optional(v.number()),
          })
        ),
        typicalTermMonths: v.optional(
          v.object({
            min: v.optional(v.number()),
            max: v.optional(v.number()),
          })
        ),
        specializations: v.optional(v.array(v.string())),
        restrictions: v.optional(v.array(v.string())),
        decisionSpeed: v.optional(v.string()),
        relationshipNotes: v.optional(v.string()),
      })
    ),
    borrowerProfile: v.optional(
      v.object({
        experienceLevel: v.optional(v.string()),
        completedProjects: v.optional(v.number()),
        totalDevelopmentValue: v.optional(v.number()),
        preferredPropertyTypes: v.optional(v.array(v.string())),
        preferredRegions: v.optional(v.array(v.string())),
        netWorth: v.optional(v.number()),
        liquidAssets: v.optional(v.number()),
      })
    ),
    aiSummary: v.optional(
      v.object({
        executiveSummary: v.optional(v.string()),
        keyFacts: v.optional(v.array(v.string())),
        recentUpdates: v.optional(
          v.array(
            v.object({
              date: v.string(),
              update: v.string(),
            })
          )
        ),
      })
    ),
    customFields: v.optional(v.any()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clientId, updatedBy, ...updates } = args;
    const now = new Date().toISOString();

    // Get existing or create new
    let existing = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .first();

    if (!existing) {
      // Get client type
      const client = await ctx.db.get(clientId);
      const intelligenceId = await ctx.db.insert("clientIntelligence", {
        clientId,
        clientType: client?.type || "borrower",
        ...updates,
        lastUpdated: now,
        lastUpdatedBy: updatedBy || "user",
        version: 1,
      });
      return intelligenceId;
    }

    // Merge updates with existing data
    const mergedUpdates: any = {};

    // For each field, merge if it's an object, replace if it's an array or primitive
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        // Merge objects
        const existingValue = (existing as any)[key] || {};
        mergedUpdates[key] = { ...existingValue, ...value };
      } else {
        // Replace arrays and primitives
        mergedUpdates[key] = value;
      }
    }

    await ctx.db.patch(existing._id, {
      ...mergedUpdates,
      lastUpdated: now,
      lastUpdatedBy: updatedBy || "user",
      version: existing.version + 1,
    });

    return existing._id;
  },
});

/**
 * Update project intelligence (partial update)
 */
export const updateProjectIntelligence = mutation({
  args: {
    projectId: v.id("projects"),
    overview: v.optional(
      v.object({
        projectType: v.optional(v.string()),
        assetClass: v.optional(v.string()),
        description: v.optional(v.string()),
        currentPhase: v.optional(v.string()),
      })
    ),
    location: v.optional(
      v.object({
        siteAddress: v.optional(v.string()),
        postcode: v.optional(v.string()),
        localAuthority: v.optional(v.string()),
        region: v.optional(v.string()),
        coordinates: v.optional(
          v.object({
            lat: v.number(),
            lng: v.number(),
          })
        ),
      })
    ),
    financials: v.optional(
      v.object({
        purchasePrice: v.optional(v.number()),
        totalDevelopmentCost: v.optional(v.number()),
        grossDevelopmentValue: v.optional(v.number()),
        profit: v.optional(v.number()),
        profitMargin: v.optional(v.number()),
        loanAmount: v.optional(v.number()),
        ltv: v.optional(v.number()),
        ltgdv: v.optional(v.number()),
        interestRate: v.optional(v.number()),
        arrangementFee: v.optional(v.number()),
        exitFee: v.optional(v.number()),
      })
    ),
    timeline: v.optional(
      v.object({
        acquisitionDate: v.optional(v.string()),
        planningSubmissionDate: v.optional(v.string()),
        planningApprovalDate: v.optional(v.string()),
        constructionStartDate: v.optional(v.string()),
        practicalCompletionDate: v.optional(v.string()),
        salesCompletionDate: v.optional(v.string()),
        loanMaturityDate: v.optional(v.string()),
      })
    ),
    development: v.optional(
      v.object({
        totalUnits: v.optional(v.number()),
        unitBreakdown: v.optional(
          v.array(
            v.object({
              type: v.string(),
              count: v.number(),
              avgSize: v.optional(v.number()),
              avgValue: v.optional(v.number()),
            })
          )
        ),
        totalSqFt: v.optional(v.number()),
        siteArea: v.optional(v.number()),
        planningReference: v.optional(v.string()),
        planningStatus: v.optional(v.string()),
      })
    ),
    keyParties: v.optional(
      v.object({
        borrower: v.optional(
          v.object({
            clientId: v.optional(v.id("clients")),
            name: v.optional(v.string()),
            contactName: v.optional(v.string()),
            contactEmail: v.optional(v.string()),
          })
        ),
        lender: v.optional(
          v.object({
            clientId: v.optional(v.id("clients")),
            name: v.optional(v.string()),
            contactName: v.optional(v.string()),
            contactEmail: v.optional(v.string()),
          })
        ),
        solicitor: v.optional(
          v.object({
            firm: v.optional(v.string()),
            contactName: v.optional(v.string()),
            contactEmail: v.optional(v.string()),
          })
        ),
        valuer: v.optional(
          v.object({
            firm: v.optional(v.string()),
            contactName: v.optional(v.string()),
          })
        ),
        architect: v.optional(
          v.object({
            firm: v.optional(v.string()),
            contactName: v.optional(v.string()),
          })
        ),
        contractor: v.optional(
          v.object({
            firm: v.optional(v.string()),
            contactName: v.optional(v.string()),
            contractValue: v.optional(v.number()),
          })
        ),
        monitoringSurveyor: v.optional(
          v.object({
            firm: v.optional(v.string()),
            contactName: v.optional(v.string()),
          })
        ),
      })
    ),
    aiSummary: v.optional(
      v.object({
        executiveSummary: v.optional(v.string()),
        keyFacts: v.optional(v.array(v.string())),
        risks: v.optional(v.array(v.string())),
        recentUpdates: v.optional(
          v.array(
            v.object({
              date: v.string(),
              update: v.string(),
            })
          )
        ),
      })
    ),
    customFields: v.optional(v.any()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { projectId, updatedBy, ...updates } = args;
    const now = new Date().toISOString();

    // Get existing or create new
    let existing = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();

    if (!existing) {
      const intelligenceId = await ctx.db.insert("projectIntelligence", {
        projectId,
        ...updates,
        lastUpdated: now,
        lastUpdatedBy: updatedBy || "user",
        version: 1,
      });
      return intelligenceId;
    }

    // Merge updates with existing data
    const mergedUpdates: any = {};

    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const existingValue = (existing as any)[key] || {};
        mergedUpdates[key] = { ...existingValue, ...value };
      } else {
        mergedUpdates[key] = value;
      }
    }

    await ctx.db.patch(existing._id, {
      ...mergedUpdates,
      lastUpdated: now,
      lastUpdatedBy: updatedBy || "user",
      version: existing.version + 1,
    });

    return existing._id;
  },
});

// ============================================================================
// DATA LIBRARY SYNC
// ============================================================================

/**
 * Category mappings for Data Library sync
 */
const CATEGORY_MAPPINGS: Record<string, string> = {
  "site costs": "landCost",
  "land costs": "landCost",
  "site purchase": "landCost",
  "land purchase": "landCost",
  "build costs": "constructionCost",
  "construction costs": "constructionCost",
  "construction": "constructionCost",
  "hard costs": "constructionCost",
  "professional fees": "professionalFees",
  "professional costs": "professionalFees",
  "soft costs": "professionalFees",
  "contingency": "contingency",
  "contingencies": "contingency",
  "finance costs": "financeCosts",
  "financing costs": "financeCosts",
  "interest": "financeCosts",
  "sales costs": "salesCosts",
  "selling costs": "salesCosts",
  "disposal costs": "salesCosts",
};

/**
 * Sync Data Library aggregates to Project Intelligence
 * Only includes confirmed data items, excluding subtotals from totals
 */
export const syncDataLibraryToIntelligence = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Get all project data items (merged/confirmed data only - these are in projectDataItems)
    const dataItems = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    if (dataItems.length === 0) {
      return null;
    }

    // Aggregate by category - EXCLUDING subtotals from totals
    const categoryAggregates: Record<
      string,
      { total: number; itemCount: number; subtotalCount: number }
    > = {};
    const mappedTotals: Record<string, number> = {
      landCost: 0,
      constructionCost: 0,
      professionalFees: 0,
      contingency: 0,
      financeCosts: 0,
      salesCosts: 0,
    };

    let totalDevelopmentCost = 0;
    const uniqueDocuments = new Set<string>();

    for (const item of dataItems) {
      const value = item.currentValueNormalized || 0;
      const category = item.category;
      const isSubtotal = item.isSubtotal === true;

      // Track unique source documents
      uniqueDocuments.add(item.currentSourceDocumentId);

      // Initialize category aggregate
      if (!categoryAggregates[category]) {
        categoryAggregates[category] = { total: 0, itemCount: 0, subtotalCount: 0 };
      }
      
      // Always count items
      categoryAggregates[category].itemCount += 1;
      
      // Skip subtotals from total calculations to avoid double-counting
      if (isSubtotal) {
        categoryAggregates[category].subtotalCount += 1;
        continue;
      }

      // Add to category total (non-subtotals only)
      categoryAggregates[category].total += value;

      // Map to standardized fields (non-subtotals only)
      const normalizedCategory = category.toLowerCase();
      for (const [pattern, field] of Object.entries(CATEGORY_MAPPINGS)) {
        if (normalizedCategory.includes(pattern)) {
          mappedTotals[field] += value;
          break;
        }
      }

      // Sum total development cost (non-subtotals only)
      totalDevelopmentCost += value;
    }

    // Build category totals array
    const categoryTotals = Object.entries(categoryAggregates).map(
      ([category, data]) => ({
        category,
        total: data.total,
        itemCount: data.itemCount,
      })
    );

    // Build dataLibrarySummary
    const dataLibrarySummary = {
      categoryTotals,
      totalDevelopmentCost,
      landCost: mappedTotals.landCost || undefined,
      constructionCost: mappedTotals.constructionCost || undefined,
      professionalFees: mappedTotals.professionalFees || undefined,
      contingency: mappedTotals.contingency || undefined,
      financeCosts: mappedTotals.financeCosts || undefined,
      salesCosts: mappedTotals.salesCosts || undefined,
      lastSyncedAt: now,
      sourceDocumentCount: uniqueDocuments.size,
      totalItemCount: dataItems.length,
    };

    // Get or create project intelligence
    let existing = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!existing) {
      // Create new project intelligence with data library summary
      const intelligenceId = await ctx.db.insert("projectIntelligence", {
        projectId: args.projectId,
        dataLibrarySummary,
        financials: {
          totalDevelopmentCost,
        },
        lastUpdated: now,
        lastUpdatedBy: "data-library-sync",
        version: 1,
      });
      return intelligenceId;
    }

    // Update existing
    await ctx.db.patch(existing._id, {
      dataLibrarySummary,
      financials: {
        ...(existing.financials || {}),
        totalDevelopmentCost,
      },
      lastUpdated: now,
      lastUpdatedBy: "data-library-sync",
      version: existing.version + 1,
    });

    return existing._id;
  },
});

/**
 * Internal mutation for scheduled sync (can be called from other mutations)
 */
export const internalSyncDataLibrary = internalMutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    // Same logic as syncDataLibraryToIntelligence - excludes subtotals
    const now = new Date().toISOString();

    const dataItems = await ctx.db
      .query("projectDataItems")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    if (dataItems.length === 0) {
      return null;
    }

    const categoryAggregates: Record<
      string,
      { total: number; itemCount: number; subtotalCount: number }
    > = {};
    const mappedTotals: Record<string, number> = {
      landCost: 0,
      constructionCost: 0,
      professionalFees: 0,
      contingency: 0,
      financeCosts: 0,
      salesCosts: 0,
    };

    let totalDevelopmentCost = 0;
    const uniqueDocuments = new Set<string>();

    for (const item of dataItems) {
      const value = item.currentValueNormalized || 0;
      const category = item.category;
      const isSubtotal = item.isSubtotal === true;

      uniqueDocuments.add(item.currentSourceDocumentId);

      if (!categoryAggregates[category]) {
        categoryAggregates[category] = { total: 0, itemCount: 0, subtotalCount: 0 };
      }
      
      categoryAggregates[category].itemCount += 1;
      
      // Skip subtotals from totals
      if (isSubtotal) {
        categoryAggregates[category].subtotalCount += 1;
        continue;
      }

      categoryAggregates[category].total += value;

      const normalizedCategory = category.toLowerCase();
      for (const [pattern, field] of Object.entries(CATEGORY_MAPPINGS)) {
        if (normalizedCategory.includes(pattern)) {
          mappedTotals[field] += value;
          break;
        }
      }

      totalDevelopmentCost += value;
    }

    const categoryTotals = Object.entries(categoryAggregates).map(
      ([category, data]) => ({
        category,
        total: data.total,
        itemCount: data.itemCount,
      })
    );

    const dataLibrarySummary = {
      categoryTotals,
      totalDevelopmentCost,
      landCost: mappedTotals.landCost || undefined,
      constructionCost: mappedTotals.constructionCost || undefined,
      professionalFees: mappedTotals.professionalFees || undefined,
      contingency: mappedTotals.contingency || undefined,
      financeCosts: mappedTotals.financeCosts || undefined,
      salesCosts: mappedTotals.salesCosts || undefined,
      lastSyncedAt: now,
      sourceDocumentCount: uniqueDocuments.size,
      totalItemCount: dataItems.length,
    };

    let existing = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!existing) {
      const intelligenceId = await ctx.db.insert("projectIntelligence", {
        projectId: args.projectId,
        dataLibrarySummary,
        financials: {
          totalDevelopmentCost,
        },
        lastUpdated: now,
        lastUpdatedBy: "data-library-sync",
        version: 1,
      });
      return intelligenceId;
    }

    await ctx.db.patch(existing._id, {
      dataLibrarySummary,
      financials: {
        ...(existing.financials || {}),
        totalDevelopmentCost,
      },
      lastUpdated: now,
      lastUpdatedBy: "data-library-sync",
      version: existing.version + 1,
    });

    return existing._id;
  },
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Add a recent update to client intelligence
 */
export const addClientUpdate = mutation({
  args: {
    clientId: v.id("clients"),
    update: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    if (!existing) {
      return null;
    }

    const currentUpdates = existing.aiSummary?.recentUpdates || [];
    const newUpdates = [
      { date: now, update: args.update },
      ...currentUpdates.slice(0, 9), // Keep last 10 updates
    ];

    await ctx.db.patch(existing._id, {
      aiSummary: {
        ...(existing.aiSummary || {}),
        recentUpdates: newUpdates,
      },
      lastUpdated: now,
      version: existing.version + 1,
    });

    return existing._id;
  },
});

/**
 * Add a recent update to project intelligence
 */
export const addProjectUpdate = mutation({
  args: {
    projectId: v.id("projects"),
    update: v.string(),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!existing) {
      return null;
    }

    const currentUpdates = existing.aiSummary?.recentUpdates || [];
    const newUpdates = [
      { date: now, update: args.update },
      ...currentUpdates.slice(0, 9),
    ];

    await ctx.db.patch(existing._id, {
      aiSummary: {
        ...(existing.aiSummary || {}),
        recentUpdates: newUpdates,
      },
      lastUpdated: now,
      version: existing.version + 1,
    });

    return existing._id;
  },
});

/**
 * Update project summaries and aggregate data on client intelligence when projects change
 * Pulls data from all projects associated with this client
 */
export const syncProjectSummariesToClient = mutation({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Get all projects where this client has a role
    const allProjects = await ctx.db.query("projects").collect();
    const clientProjects = allProjects.filter((p) =>
      p.clientRoles?.some((cr) => cr.clientId === args.clientId)
    );

    // Aggregate data across all client projects
    let totalDevelopmentCostAllProjects = 0;
    let totalItemCount = 0;
    const uniqueDocuments = new Set<string>();
    const aggregateCategoryTotals: Record<string, { total: number; itemCount: number }> = {};

    // Build project summaries with data
    const projectSummaries = await Promise.all(
      clientProjects.map(async (project) => {
        const role = project.clientRoles.find(
          (cr) => cr.clientId === args.clientId
        );

        // Get data items for this project (excluding subtotals from totals)
        const dataItems = await ctx.db
          .query("projectDataItems")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.neq(q.field("isDeleted"), true))
          .collect();

        let projectTotalDevCost = 0;
        const projectCategories = new Set<string>();

        for (const item of dataItems) {
          const isSubtotal = item.isSubtotal === true;
          const value = item.currentValueNormalized || 0;
          
          projectCategories.add(item.category);
          
          // Track unique documents
          uniqueDocuments.add(item.currentSourceDocumentId);
          
          // Skip subtotals from totals
          if (isSubtotal) continue;
          
          projectTotalDevCost += value;
          totalItemCount += 1;

          // Add to aggregate category totals
          if (!aggregateCategoryTotals[item.category]) {
            aggregateCategoryTotals[item.category] = { total: 0, itemCount: 0 };
          }
          aggregateCategoryTotals[item.category].total += value;
          aggregateCategoryTotals[item.category].itemCount += 1;
        }

        totalDevelopmentCostAllProjects += projectTotalDevCost;

        return {
          projectId: project._id,
          projectName: project.name,
          role: role?.role || "unknown",
          status: project.status,
          loanAmount: project.loanAmount,
          lastUpdate: now,
          dataSummary: dataItems.length > 0 ? {
            totalDevelopmentCost: projectTotalDevCost,
            itemCount: dataItems.filter(i => !i.isSubtotal).length,
            categoryCount: projectCategories.size,
          } : undefined,
        };
      })
    );

    // Build aggregate category totals array
    const categoryTotals = Object.entries(aggregateCategoryTotals).map(
      ([category, data]) => ({
        category,
        total: data.total,
        itemCount: data.itemCount,
      })
    );

    // Build the data library aggregate
    const dataLibraryAggregate = totalItemCount > 0 ? {
      totalDevelopmentCostAllProjects,
      totalItemCount,
      totalDocumentCount: uniqueDocuments.size,
      projectCount: clientProjects.length,
      categoryTotals,
      lastSyncedAt: now,
    } : undefined;

    // Get or create client intelligence
    let existing = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    if (!existing) {
      const client = await ctx.db.get(args.clientId);
      const intelligenceId = await ctx.db.insert("clientIntelligence", {
        clientId: args.clientId,
        clientType: client?.type || "borrower",
        projectSummaries,
        dataLibraryAggregate,
        lastUpdated: now,
        lastUpdatedBy: "project-sync",
        version: 1,
      });
      return intelligenceId;
    }

    await ctx.db.patch(existing._id, {
      projectSummaries,
      dataLibraryAggregate,
      lastUpdated: now,
      version: existing.version + 1,
    });

    return existing._id;
  },
});

// ============================================================================
// INTELLIGENCE EXTRACTION JOBS
// ============================================================================

/**
 * Create an intelligence extraction job when a document is filed
 */
export const createIntelligenceExtractionJob = mutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.optional(v.id("projects")),
    clientId: v.optional(v.id("clients")),
    documentName: v.string(),
    documentType: v.optional(v.string()),
    documentCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Check if job already exists for this document
    const existing = await ctx.db
      .query("intelligenceExtractionJobs")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .first();

    if (existing) {
      // Reset job if it failed previously
      if (existing.status === "failed") {
        await ctx.db.patch(existing._id, {
          status: "pending",
          error: undefined,
          attempts: 0,
          updatedAt: now,
        });
        return existing._id;
      }
      return existing._id;
    }

    const jobId = await ctx.db.insert("intelligenceExtractionJobs", {
      documentId: args.documentId,
      projectId: args.projectId,
      clientId: args.clientId,
      documentName: args.documentName,
      documentType: args.documentType,
      documentCategory: args.documentCategory,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
      updatedAt: now,
    });

    return jobId;
  },
});

/**
 * Get the next pending intelligence extraction job
 */
export const getNextPendingIntelligenceJob = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("intelligenceExtractionJobs")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .first();
  },
});

/**
 * Get intelligence extraction jobs by status
 */
export const listIntelligenceExtractionJobs = query({
  args: {
    status: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    clientId: v.optional(v.id("clients")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let jobs;

    if (args.status) {
      jobs = await ctx.db.query("intelligenceExtractionJobs")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .collect();
    } else if (args.projectId) {
      jobs = await ctx.db.query("intelligenceExtractionJobs")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else if (args.clientId) {
      jobs = await ctx.db.query("intelligenceExtractionJobs")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect();
    } else {
      jobs = await ctx.db.query("intelligenceExtractionJobs").collect();
    }

    return args.limit ? jobs.slice(0, args.limit) : jobs;
  },
});

/**
 * Update intelligence extraction job status
 */
export const updateIntelligenceJobStatus = mutation({
  args: {
    jobId: v.id("intelligenceExtractionJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    extractedFields: v.optional(v.array(v.object({
      fieldPath: v.string(),
      value: v.any(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
      pageNumber: v.optional(v.number()),
    }))),
    extractedAttributes: v.optional(v.array(v.object({
      key: v.string(),
      value: v.any(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
    }))),
    aiInsights: v.optional(v.object({
      keyFindings: v.optional(v.array(v.string())),
      risks: v.optional(v.array(v.object({
        risk: v.string(),
        severity: v.optional(v.string()),
      }))),
    })),
    mergeResult: v.optional(v.object({
      fieldsAdded: v.optional(v.number()),
      fieldsUpdated: v.optional(v.number()),
      fieldsSkipped: v.optional(v.number()),
      attributesAdded: v.optional(v.number()),
      insightsAdded: v.optional(v.number()),
    })),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const job = await ctx.db.get(args.jobId);

    if (!job) {
      throw new Error("Job not found");
    }

    const updates: any = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "processing") {
      updates.attempts = job.attempts + 1;
      updates.lastAttemptAt = now;
    }

    if (args.status === "completed") {
      updates.completedAt = now;
    }

    if (args.extractedFields !== undefined) {
      updates.extractedFields = args.extractedFields;
    }

    if (args.extractedAttributes !== undefined) {
      updates.extractedAttributes = args.extractedAttributes;
    }

    if (args.aiInsights !== undefined) {
      updates.aiInsights = args.aiInsights;
    }

    if (args.mergeResult !== undefined) {
      updates.mergeResult = args.mergeResult;
    }

    if (args.error !== undefined) {
      updates.error = args.error;
    }

    await ctx.db.patch(args.jobId, updates);
    return args.jobId;
  },
});

/**
 * Merge extracted intelligence into client/project intelligence
 * Uses confidence-based merge: new data is added if confidence is higher than existing
 */
export const mergeExtractedIntelligence = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    clientId: v.optional(v.id("clients")),
    documentId: v.id("documents"),
    documentName: v.string(),
    extractedFields: v.array(v.object({
      fieldPath: v.string(),
      value: v.any(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
      pageNumber: v.optional(v.number()),
    })),
    extractedAttributes: v.optional(v.array(v.object({
      key: v.string(),
      value: v.any(),
      confidence: v.number(),
      sourceText: v.optional(v.string()),
    }))),
    aiInsights: v.optional(v.object({
      keyFindings: v.optional(v.array(v.string())),
      risks: v.optional(v.array(v.object({
        risk: v.string(),
        severity: v.optional(v.string()),
      }))),
    })),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const mergeResult = {
      fieldsAdded: 0,
      fieldsUpdated: 0,
      fieldsSkipped: 0,
      attributesAdded: 0,
      insightsAdded: 0,
    };

    // Determine target (project or client intelligence)
    if (args.projectId) {
      // Merge into project intelligence
      let projectIntel = await ctx.db
        .query("projectIntelligence")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .first();

      if (!projectIntel) {
        // Create new project intelligence
        const intelId = await ctx.db.insert("projectIntelligence", {
          projectId: args.projectId,
          evidenceTrail: [],
          extractedAttributes: [],
          lastUpdated: now,
          lastUpdatedBy: "intelligence-extraction",
          version: 1,
        });
        projectIntel = await ctx.db.get(intelId);
      }

      if (!projectIntel) return mergeResult;

      // Current evidence trail and attributes
      const existingEvidence = projectIntel.evidenceTrail || [];
      const existingAttributes = projectIntel.extractedAttributes || [];
      const existingInsights = projectIntel.aiInsights || {};

      // Build a map of existing field confidences
      const existingConfidenceMap = new Map<string, number>();
      for (const ev of existingEvidence) {
        existingConfidenceMap.set(ev.fieldPath, ev.confidence);
      }

      // Process extracted fields
      const newEvidenceTrail = [...existingEvidence];
      const fieldsToUpdate: Record<string, any> = {};

      for (const field of args.extractedFields) {
        const existingConfidence = existingConfidenceMap.get(field.fieldPath) || 0;

        if (field.confidence > existingConfidence) {
          // Add to evidence trail
          const newEvidence = {
            fieldPath: field.fieldPath,
            value: field.value,
            confidence: field.confidence,
            sourceDocumentId: args.documentId,
            sourceDocumentName: args.documentName,
            sourceText: field.sourceText,
            pageNumber: field.pageNumber,
            extractedAt: now,
            method: "ai_extraction" as const,
          };

          // Remove old evidence for this field if exists
          const existingIdx = newEvidenceTrail.findIndex(
            (e) => e.fieldPath === field.fieldPath
          );
          if (existingIdx >= 0) {
            newEvidenceTrail.splice(existingIdx, 1);
            mergeResult.fieldsUpdated++;
          } else {
            mergeResult.fieldsAdded++;
          }
          newEvidenceTrail.push(newEvidence);

          // Parse field path and set value (e.g., "financials.loanAmount")
          const parts = field.fieldPath.split(".");
          if (parts.length === 2) {
            const [section, key] = parts;
            if (!fieldsToUpdate[section]) {
              fieldsToUpdate[section] = { ...((projectIntel as any)[section] || {}) };
            }
            fieldsToUpdate[section][key] = field.value;
          }
        } else {
          mergeResult.fieldsSkipped++;
        }
      }

      // Process extracted attributes
      const newAttributes = [...existingAttributes];
      if (args.extractedAttributes) {
        for (const attr of args.extractedAttributes) {
          const existingAttr = newAttributes.find((a) => a.key === attr.key);
          if (!existingAttr || attr.confidence > existingAttr.confidence) {
            if (existingAttr) {
              const idx = newAttributes.indexOf(existingAttr);
              newAttributes.splice(idx, 1);
            }
            newAttributes.push({
              key: attr.key,
              value: attr.value,
              confidence: attr.confidence,
              sourceDocumentId: args.documentId,
              sourceText: attr.sourceText,
              extractedAt: now,
            });
            mergeResult.attributesAdded++;
          }
        }
      }

      // Process AI insights (append, don't replace)
      const newInsights = { ...existingInsights };
      if (args.aiInsights) {
        if (args.aiInsights.keyFindings) {
          const existingFindings = new Set(newInsights.keyFindings || []);
          for (const finding of args.aiInsights.keyFindings) {
            if (!existingFindings.has(finding)) {
              if (!newInsights.keyFindings) newInsights.keyFindings = [];
              newInsights.keyFindings.push(finding);
              mergeResult.insightsAdded++;
            }
          }
        }
        if (args.aiInsights.risks) {
          const existingRisks = new Set(
            (newInsights.risks || []).map((r: any) => r.risk)
          );
          for (const risk of args.aiInsights.risks) {
            if (!existingRisks.has(risk.risk)) {
              if (!newInsights.risks) newInsights.risks = [];
              newInsights.risks.push({
                risk: risk.risk,
                severity: risk.severity,
                sourceDocumentId: args.documentId,
              });
              mergeResult.insightsAdded++;
            }
          }
        }
        newInsights.lastAnalyzedAt = now;
      }

      // Update project intelligence
      await ctx.db.patch(projectIntel._id, {
        ...fieldsToUpdate,
        evidenceTrail: newEvidenceTrail,
        extractedAttributes: newAttributes,
        aiInsights: newInsights,
        lastUpdated: now,
        lastUpdatedBy: "intelligence-extraction",
        version: projectIntel.version + 1,
      });
    }

    // Handle client intelligence merge (similar logic)
    if (args.clientId) {
      let clientIntel = await ctx.db
        .query("clientIntelligence")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId!))
        .first();

      if (!clientIntel) {
        const client = await ctx.db.get(args.clientId);
        const intelId = await ctx.db.insert("clientIntelligence", {
          clientId: args.clientId,
          clientType: client?.type || "borrower",
          evidenceTrail: [],
          extractedAttributes: [],
          lastUpdated: now,
          lastUpdatedBy: "intelligence-extraction",
          version: 1,
        });
        clientIntel = await ctx.db.get(intelId);
      }

      if (!clientIntel) return mergeResult;

      // Define which top-level sections belong in clientIntelligence schema
      // Fields like overview, location, development, timeline, financials are PROJECT-level fields
      const CLIENT_INTEL_ALLOWED_SECTIONS = new Set([
        "identity",
        "primaryContact",
        "addresses",
        "banking",
        "keyPeople",
        "lenderProfile",
        "borrowerProfile",
        "aiSummary",
        "projectSummaries",
        "dataLibraryAggregate",
        "customFields",
      ]);

      const existingEvidence = clientIntel.evidenceTrail || [];
      const existingAttributes = clientIntel.extractedAttributes || [];
      const existingInsights = clientIntel.aiInsights || {};

      const existingConfidenceMap = new Map<string, number>();
      for (const ev of existingEvidence) {
        existingConfidenceMap.set(ev.fieldPath, ev.confidence);
      }

      const newEvidenceTrail = [...existingEvidence];
      const fieldsToUpdate: Record<string, any> = {};

      for (const field of args.extractedFields) {
        // Skip fields that don't belong in clientIntelligence (project-level fields)
        const fieldSection = field.fieldPath.split(".")[0];
        if (!CLIENT_INTEL_ALLOWED_SECTIONS.has(fieldSection)) {
          continue; // Skip project-level fields like overview, location, development, timeline
        }
        const existingConfidence = existingConfidenceMap.get(field.fieldPath) || 0;

        if (field.confidence > existingConfidence) {
          const newEvidence = {
            fieldPath: field.fieldPath,
            value: field.value,
            confidence: field.confidence,
            sourceDocumentId: args.documentId,
            sourceDocumentName: args.documentName,
            sourceText: field.sourceText,
            pageNumber: field.pageNumber,
            extractedAt: now,
            method: "ai_extraction" as const,
          };

          const existingIdx = newEvidenceTrail.findIndex(
            (e) => e.fieldPath === field.fieldPath
          );
          if (existingIdx >= 0) {
            newEvidenceTrail.splice(existingIdx, 1);
            mergeResult.fieldsUpdated++;
          } else {
            mergeResult.fieldsAdded++;
          }
          newEvidenceTrail.push(newEvidence);

          const parts = field.fieldPath.split(".");
          if (parts.length === 2) {
            const [section, key] = parts;
            if (!fieldsToUpdate[section]) {
              fieldsToUpdate[section] = { ...((clientIntel as any)[section] || {}) };
            }
            fieldsToUpdate[section][key] = field.value;
          }
        } else {
          mergeResult.fieldsSkipped++;
        }
      }

      const newAttributes = [...existingAttributes];
      if (args.extractedAttributes) {
        for (const attr of args.extractedAttributes) {
          const existingAttr = newAttributes.find((a) => a.key === attr.key);
          if (!existingAttr || attr.confidence > existingAttr.confidence) {
            if (existingAttr) {
              const idx = newAttributes.indexOf(existingAttr);
              newAttributes.splice(idx, 1);
            }
            newAttributes.push({
              key: attr.key,
              value: attr.value,
              confidence: attr.confidence,
              sourceDocumentId: args.documentId,
              sourceText: attr.sourceText,
              extractedAt: now,
            });
            mergeResult.attributesAdded++;
          }
        }
      }

      const newInsights = { ...existingInsights };
      if (args.aiInsights) {
        if (args.aiInsights.keyFindings) {
          const existingFindings = new Set(newInsights.keyFindings || []);
          for (const finding of args.aiInsights.keyFindings) {
            if (!existingFindings.has(finding)) {
              if (!newInsights.keyFindings) newInsights.keyFindings = [];
              newInsights.keyFindings.push(finding);
              mergeResult.insightsAdded++;
            }
          }
        }
        if (args.aiInsights.risks) {
          const existingRisks = new Set(
            (newInsights.risks || []).map((r: any) => r.risk)
          );
          for (const risk of args.aiInsights.risks) {
            if (!existingRisks.has(risk.risk)) {
              if (!newInsights.risks) newInsights.risks = [];
              newInsights.risks.push({
                risk: risk.risk,
                severity: risk.severity,
                sourceDocumentId: args.documentId,
              });
              mergeResult.insightsAdded++;
            }
          }
        }
        newInsights.lastAnalyzedAt = now;
      }

      await ctx.db.patch(clientIntel._id, {
        ...fieldsToUpdate,
        evidenceTrail: newEvidenceTrail,
        extractedAttributes: newAttributes,
        aiInsights: newInsights,
        lastUpdated: now,
        lastUpdatedBy: "intelligence-extraction",
        version: clientIntel.version + 1,
      });
    }

    return mergeResult;
  },
});

// ============================================================================
// ADD DOCUMENT ANALYSIS TO INTELLIGENCE
// ============================================================================

/**
 * Add a document's analysis data to client/project intelligence
 * This is used for documents that were uploaded directly (not via bulk upload)
 * and later analyzed via the doc library.
 */
export const addDocumentToIntelligence = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();

    // Get the document
    const document = await ctx.db.get(args.documentId);
    if (!document) {
      throw new Error("Document not found");
    }

    // Check if document has analysis
    if (!document.documentAnalysis) {
      throw new Error("Document has no analysis data. Please analyze the document first.");
    }

    // Check if already added
    if (document.addedToIntelligence) {
      return { success: true, alreadyAdded: true };
    }

    // Determine target - must have clientId to add to intelligence
    const clientId = document.clientId;
    const projectId = document.projectId;

    if (!clientId) {
      throw new Error("Document must be associated with a client to add to intelligence. Move the document to a client first.");
    }

    const analysis = document.documentAnalysis;
    const result = {
      attributesAdded: 0,
      insightsAdded: 0,
      updateAdded: false,
    };

    // Build extracted attributes from the analysis
    const attributesToAdd: Array<{
      key: string;
      value: any;
      confidence: number;
      sourceText?: string;
    }> = [];

    // Add entities as attributes
    if (analysis.entities.people.length > 0) {
      attributesToAdd.push({
        key: "people_mentioned",
        value: analysis.entities.people,
        confidence: analysis.confidenceInAnalysis,
        sourceText: `Extracted from ${document.fileName}`,
      });
    }

    if (analysis.entities.companies.length > 0) {
      attributesToAdd.push({
        key: "companies_mentioned",
        value: analysis.entities.companies,
        confidence: analysis.confidenceInAnalysis,
        sourceText: `Extracted from ${document.fileName}`,
      });
    }

    if (analysis.entities.locations.length > 0) {
      attributesToAdd.push({
        key: "locations_mentioned",
        value: analysis.entities.locations,
        confidence: analysis.confidenceInAnalysis,
        sourceText: `Extracted from ${document.fileName}`,
      });
    }

    // Add key amounts
    if (analysis.keyAmounts.length > 0) {
      attributesToAdd.push({
        key: "key_amounts",
        value: analysis.keyAmounts,
        confidence: analysis.confidenceInAnalysis,
        sourceText: `Extracted from ${document.fileName}`,
      });
    }

    // Add key dates
    if (analysis.keyDates.length > 0) {
      attributesToAdd.push({
        key: "key_dates",
        value: analysis.keyDates,
        confidence: analysis.confidenceInAnalysis,
        sourceText: `Extracted from ${document.fileName}`,
      });
    }

    // Add key terms
    if (analysis.keyTerms.length > 0) {
      attributesToAdd.push({
        key: "key_terms",
        value: analysis.keyTerms,
        confidence: analysis.confidenceInAnalysis,
        sourceText: `Extracted from ${document.fileName}`,
      });
    }

    // Build the update message
    const updateMessage = `New document analyzed: "${document.fileName}" - ${analysis.documentDescription}. ${analysis.executiveSummary}`;

    // Determine if we're updating project or client intelligence
    if (projectId) {
      // Update project intelligence
      let projectIntel = await ctx.db
        .query("projectIntelligence")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .first();

      if (!projectIntel) {
        // Create project intelligence
        const intelId = await ctx.db.insert("projectIntelligence", {
          projectId,
          evidenceTrail: [],
          extractedAttributes: [],
          aiSummary: {
            executiveSummary: analysis.executiveSummary,
            recentUpdates: [{ date: now, update: updateMessage }],
          },
          lastUpdated: now,
          lastUpdatedBy: "document-analysis",
          version: 1,
        });
        projectIntel = await ctx.db.get(intelId);
        result.updateAdded = true;
      } else {
        // Update existing project intelligence
        const existingAttributes = projectIntel.extractedAttributes || [];
        const newAttributes = [...existingAttributes];

        // Add new attributes (merge with existing)
        for (const attr of attributesToAdd) {
          const existingIdx = newAttributes.findIndex((a: any) => a.key === attr.key);
          if (existingIdx >= 0) {
            // Merge arrays if both are arrays
            const existing = newAttributes[existingIdx] as any;
            if (Array.isArray(existing.value) && Array.isArray(attr.value)) {
              const combined = [...new Set([...existing.value, ...attr.value])];
              newAttributes[existingIdx] = { ...existing, value: combined };
            }
          } else {
            newAttributes.push({
              ...attr,
              sourceDocumentId: args.documentId,
              extractedAt: now,
            });
            result.attributesAdded++;
          }
        }

        // Update aiSummary with recent update
        const existingUpdates = projectIntel.aiSummary?.recentUpdates || [];
        const newUpdates = [
          { date: now, update: updateMessage },
          ...existingUpdates.slice(0, 9), // Keep last 10
        ];

        await ctx.db.patch(projectIntel._id, {
          extractedAttributes: newAttributes,
          aiSummary: {
            ...(projectIntel.aiSummary || {}),
            recentUpdates: newUpdates,
          },
          lastUpdated: now,
          lastUpdatedBy: "document-analysis",
          version: projectIntel.version + 1,
        });
        result.updateAdded = true;
      }
    } else {
      // Update client intelligence (for base documents without project)
      let clientIntel = await ctx.db
        .query("clientIntelligence")
        .withIndex("by_client", (q) => q.eq("clientId", clientId))
        .first();

      if (!clientIntel) {
        // Get client for type
        const client = await ctx.db.get(clientId);
        const clientType = client?.type || "borrower";

        // Create client intelligence
        const intelId = await ctx.db.insert("clientIntelligence", {
          clientId,
          clientType,
          evidenceTrail: [],
          extractedAttributes: [],
          aiSummary: {
            executiveSummary: analysis.executiveSummary,
            recentUpdates: [{ date: now, update: updateMessage }],
          },
          lastUpdated: now,
          lastUpdatedBy: "document-analysis",
          version: 1,
        });
        clientIntel = await ctx.db.get(intelId);
        result.updateAdded = true;
      } else {
        // Update existing client intelligence
        const existingAttributes = clientIntel.extractedAttributes || [];
        const newAttributes = [...existingAttributes];

        // Add new attributes (merge with existing)
        for (const attr of attributesToAdd) {
          const existingIdx = newAttributes.findIndex((a: any) => a.key === attr.key);
          if (existingIdx >= 0) {
            // Merge arrays if both are arrays
            const existing = newAttributes[existingIdx] as any;
            if (Array.isArray(existing.value) && Array.isArray(attr.value)) {
              const combined = [...new Set([...existing.value, ...attr.value])];
              newAttributes[existingIdx] = { ...existing, value: combined };
            }
          } else {
            newAttributes.push({
              ...attr,
              sourceDocumentId: args.documentId,
              extractedAt: now,
            });
            result.attributesAdded++;
          }
        }

        // Update aiSummary with recent update
        const existingUpdates = clientIntel.aiSummary?.recentUpdates || [];
        const newUpdates = [
          { date: now, update: updateMessage },
          ...existingUpdates.slice(0, 9), // Keep last 10
        ];

        await ctx.db.patch(clientIntel._id, {
          extractedAttributes: newAttributes,
          aiSummary: {
            ...(clientIntel.aiSummary || {}),
            recentUpdates: newUpdates,
          },
          lastUpdated: now,
          lastUpdatedBy: "document-analysis",
          version: clientIntel.version + 1,
        });
        result.updateAdded = true;
      }
    }

    // Mark document as added to intelligence
    await ctx.db.patch(args.documentId, {
      addedToIntelligence: true,
    });

    return { success: true, ...result };
  },
});
