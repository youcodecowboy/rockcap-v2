import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { getAuthenticatedUser } from "./authHelpers";
import { internal } from "./_generated/api";

/**
 * Get all active file type definitions
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const definitions = await ctx.db
      .query("fileTypeDefinitions")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    return definitions.sort((a, b) => {
      // Sort by category first, then by file type name
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.fileType.localeCompare(b.fileType);
    });
  },
});

/**
 * Get all file type definitions (including inactive)
 */
export const getAllIncludingInactive = query({
  args: {},
  handler: async (ctx) => {
    const definitions = await ctx.db
      .query("fileTypeDefinitions")
      .collect();
    
    return definitions.sort((a, b) => {
      // Sort by category first, then by file type name
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.fileType.localeCompare(b.fileType);
    });
  },
});

/**
 * Get a single file type definition by ID
 */
export const getById = query({
  args: { id: v.id("fileTypeDefinitions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get file type definitions by category
 */
export const getByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("fileTypeDefinitions")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

/**
 * Create a new file type definition
 */
export const create = mutation({
  args: {
    fileType: v.string(),
    category: v.string(),
    parentType: v.optional(v.string()),
    description: v.string(),
    keywords: v.array(v.string()),
    identificationRules: v.array(v.string()),
    categoryRules: v.optional(v.string()),
    exampleFileStorageId: v.optional(v.id("_storage")),
    exampleFileName: v.optional(v.string()),
    // Deterministic verification fields
    targetFolderKey: v.optional(v.string()),
    targetLevel: v.optional(v.union(v.literal("client"), v.literal("project"))),
    filenamePatterns: v.optional(v.array(v.string())),
    excludePatterns: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    const userId = user._id;

    // Validate description is at least 100 words
    const wordCount = args.description.trim().split(/\s+/).length;
    if (wordCount < 100) {
      throw new Error(`Description must be at least 100 words. Current: ${wordCount} words.`);
    }

    const now = new Date().toISOString();

    const id = await ctx.db.insert("fileTypeDefinitions", {
      fileType: args.fileType,
      category: args.category,
      parentType: args.parentType,
      description: args.description,
      keywords: args.keywords,
      identificationRules: args.identificationRules,
      categoryRules: args.categoryRules,
      exampleFileStorageId: args.exampleFileStorageId,
      exampleFileName: args.exampleFileName,
      isSystemDefault: false,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      // Deterministic verification fields
      targetFolderKey: args.targetFolderKey,
      targetLevel: args.targetLevel,
      filenamePatterns: args.filenamePatterns,
      excludePatterns: args.excludePatterns,
    });

    return id;
  },
});

/**
 * Update an existing file type definition
 */
export const update = mutation({
  args: {
    id: v.id("fileTypeDefinitions"),
    fileType: v.optional(v.string()),
    category: v.optional(v.string()),
    parentType: v.optional(v.string()),
    description: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    identificationRules: v.optional(v.array(v.string())),
    categoryRules: v.optional(v.string()),
    exampleFileStorageId: v.optional(v.id("_storage")),
    exampleFileName: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    // Deterministic verification fields
    targetFolderKey: v.optional(v.string()),
    targetLevel: v.optional(v.union(v.literal("client"), v.literal("project"))),
    filenamePatterns: v.optional(v.array(v.string())),
    excludePatterns: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    // Prevent editing system defaults
    if (existing.isSystemDefault) {
      throw new Error("Cannot edit system default file type definitions");
    }

    // Validate description if provided
    if (args.description !== undefined) {
      const wordCount = args.description.trim().split(/\s+/).length;
      if (wordCount < 100) {
        throw new Error(`Description must be at least 100 words. Current: ${wordCount} words.`);
      }
    }

    const updates: any = {
      updatedAt: new Date().toISOString(),
    };

    if (args.fileType !== undefined) updates.fileType = args.fileType;
    if (args.category !== undefined) updates.category = args.category;
    if (args.parentType !== undefined) updates.parentType = args.parentType;
    if (args.description !== undefined) updates.description = args.description;
    if (args.keywords !== undefined) updates.keywords = args.keywords;
    if (args.identificationRules !== undefined) updates.identificationRules = args.identificationRules;
    if (args.categoryRules !== undefined) updates.categoryRules = args.categoryRules;
    if (args.exampleFileStorageId !== undefined) updates.exampleFileStorageId = args.exampleFileStorageId;
    if (args.exampleFileName !== undefined) updates.exampleFileName = args.exampleFileName;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    // Deterministic verification fields
    if (args.targetFolderKey !== undefined) updates.targetFolderKey = args.targetFolderKey;
    if (args.targetLevel !== undefined) updates.targetLevel = args.targetLevel;
    if (args.filenamePatterns !== undefined) updates.filenamePatterns = args.filenamePatterns;
    if (args.excludePatterns !== undefined) updates.excludePatterns = args.excludePatterns;

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

/**
 * Delete a file type definition (soft delete by setting isActive to false)
 */
export const remove = mutation({
  args: { id: v.id("fileTypeDefinitions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    // Prevent deleting system defaults
    if (existing.isSystemDefault) {
      throw new Error("Cannot delete system default file type definitions");
    }

    // Soft delete by setting isActive to false
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    return args.id;
  },
});

/**
 * Hard delete a file type definition (only for non-system defaults)
 */
export const hardDelete = mutation({
  args: { id: v.id("fileTypeDefinitions") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    // Prevent deleting system defaults
    if (existing.isSystemDefault) {
      throw new Error("Cannot delete system default file type definitions");
    }

    await ctx.db.delete(args.id);
    return args.id;
  },
});

/**
 * Add a learned keyword to a file type definition
 * Called by the keyword learning service when corrections reach threshold
 */
export const addLearnedKeyword = mutation({
  args: {
    definitionId: v.id("fileTypeDefinitions"),
    keyword: v.string(),
    source: v.union(v.literal("correction"), v.literal("manual")),
    correctionCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.definitionId);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    const now = new Date().toISOString();
    const newLearnedKeyword = {
      keyword: args.keyword.toLowerCase().trim(),
      source: args.source,
      addedAt: now,
      correctionCount: args.correctionCount,
    };

    // Get existing learned keywords or initialize empty array
    const learnedKeywords = existing.learnedKeywords || [];

    // Check if keyword already exists
    const keywordExists = learnedKeywords.some(
      (lk) => lk.keyword.toLowerCase() === newLearnedKeyword.keyword
    );

    if (keywordExists) {
      // Update existing keyword's correction count
      const updatedKeywords = learnedKeywords.map((lk) =>
        lk.keyword.toLowerCase() === newLearnedKeyword.keyword
          ? { ...lk, correctionCount: args.correctionCount, addedAt: now }
          : lk
      );
      await ctx.db.patch(args.definitionId, {
        learnedKeywords: updatedKeywords,
        lastLearnedAt: now,
        updatedAt: now,
      });
    } else {
      // Add new keyword
      await ctx.db.patch(args.definitionId, {
        learnedKeywords: [...learnedKeywords, newLearnedKeyword],
        lastLearnedAt: now,
        updatedAt: now,
      });
    }

    return args.definitionId;
  },
});

/**
 * Remove a learned keyword from a file type definition
 * Called when user "undoes" an auto-learned keyword
 */
export const removeLearnedKeyword = mutation({
  args: {
    definitionId: v.id("fileTypeDefinitions"),
    keyword: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.definitionId);
    if (!existing) {
      throw new Error("File type definition not found");
    }

    const learnedKeywords = existing.learnedKeywords || [];
    const filteredKeywords = learnedKeywords.filter(
      (lk) => lk.keyword.toLowerCase() !== args.keyword.toLowerCase()
    );

    await ctx.db.patch(args.definitionId, {
      learnedKeywords: filteredKeywords,
      updatedAt: new Date().toISOString(),
    });

    return args.definitionId;
  },
});

/**
 * Get file URL from storage ID for example files
 */
export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Public wrapper to seed file type definitions (calls internal migration)
 * This can be called from the UI to initialize the database
 */
export const seedDefinitions = mutation({
  args: {},
  handler: async (ctx): Promise<{ skipped: boolean; count: number; message: string }> => {
    await getAuthenticatedUser(ctx); // Ensure user is authenticated
    
    // Check if definitions already exist
    const existing = await ctx.db.query("fileTypeDefinitions").collect();
    if (existing.length > 0) {
      return { skipped: true, count: existing.length, message: 'File type definitions already exist' };
    }

    // Call the internal migration
    // @ts-ignore - Known TypeScript type instantiation depth issue with Convex
    const result = await ctx.runMutation(internal.migrations.seedFileTypeDefinitions.seedFileTypeDefinitions, {}) as { skipped: boolean; count: number };
    
    return { 
      ...result, 
      message: result.skipped 
        ? 'File type definitions already exist' 
        : `Successfully seeded ${result.count} file type definitions` 
    };
  },
});

/**
 * Sync file type definitions - adds missing types without duplicating
 * This can be called on existing databases to add new document types
 */
export const syncDefinitions = mutation({
  args: {
    updateExisting: v.optional(v.boolean()), // If true, update existing definitions with new keywords/rules
  },
  handler: async (ctx, args): Promise<{ added: number; updated: number; skipped: number; message: string }> => {
    await getAuthenticatedUser(ctx); // Ensure user is authenticated
    
    // Get existing definitions
    const existing = await ctx.db.query("fileTypeDefinitions").collect();
    const existingByType = new Map(existing.map(d => [d.fileType.toLowerCase(), d]));
    
    // All the latest definitions we want to ensure exist
    const latestDefinitions = getLatestDefinitions();
    
    const now = new Date().toISOString();
    // System defaults don't have a user - createdBy is optional
    let added = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const def of latestDefinitions) {
      const existingDef = existingByType.get(def.fileType.toLowerCase());
      
      if (!existingDef) {
        // Add new definition
        await ctx.db.insert("fileTypeDefinitions", {
          ...def,
          isSystemDefault: true,
          isActive: true,
          // createdBy omitted for system defaults
          createdAt: now,
          updatedAt: now,
        });
        added++;
      } else if (args.updateExisting && existingDef.isSystemDefault) {
        // Update existing system default with new keywords/rules
        await ctx.db.patch(existingDef._id, {
          keywords: def.keywords,
          identificationRules: def.identificationRules,
          categoryRules: def.categoryRules,
          description: def.description,
          updatedAt: now,
        });
        updated++;
      } else {
        skipped++;
      }
    }
    
    return {
      added,
      updated,
      skipped,
      message: `Sync complete: ${added} added, ${updated} updated, ${skipped} already existed`,
    };
  },
});

/**
 * Admin sync function - no auth required
 * For CLI/admin use only: npx convex run fileTypeDefinitions:adminSyncDefinitions
 */
export const adminSyncDefinitions = mutation({
  args: {
    updateExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ added: number; updated: number; skipped: number; message: string }> => {
    // Get existing definitions
    const existing = await ctx.db.query("fileTypeDefinitions").collect();
    const existingByType = new Map(existing.map(d => [d.fileType.toLowerCase(), d]));

    // All the latest definitions we want to ensure exist
    const latestDefinitions = getLatestDefinitions();

    const now = new Date().toISOString();
    // System defaults don't have a user - createdBy is optional
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const def of latestDefinitions) {
      const existingDef = existingByType.get(def.fileType.toLowerCase());

      if (!existingDef) {
        // Add new definition
        await ctx.db.insert("fileTypeDefinitions", {
          ...def,
          isSystemDefault: true,
          isActive: true,
          // createdBy omitted for system defaults
          createdAt: now,
          updatedAt: now,
        });
        added++;
      } else if (args.updateExisting && existingDef.isSystemDefault) {
        // Update existing system default with new keywords/rules
        await ctx.db.patch(existingDef._id, {
          keywords: def.keywords,
          identificationRules: def.identificationRules,
          categoryRules: def.categoryRules,
          description: def.description,
          updatedAt: now,
        });
        updated++;
      } else {
        skipped++;
      }
    }

    return {
      added,
      updated,
      skipped,
      message: `Sync complete: ${added} added, ${updated} updated, ${skipped} already existed`,
    };
  },
});

/**
 * Returns all the latest document type definitions
 * This is used by syncDefinitions to add missing types
 */
function getLatestDefinitions() {
  return [
    // APPRAISALS
    {
      fileType: 'Appraisal',
      category: 'Appraisals',
      keywords: ['appraisal', 'appraisal report', 'property appraisal', 'valuation', 'property value', 'market value assessment'],
      description: 'Appraisals are formal property valuation documents that assess the market value of real estate assets. These documents are prepared by qualified appraisers or valuers and provide an independent assessment of property worth for lending, insurance, or investment purposes. Appraisals typically contain property descriptions including location, size, condition, and features. They include market analysis comparing the subject property to similar properties in the area.',
      identificationRules: ['Look for "Appraisal" or "Valuation" in the document title', 'Contains property description with address and size', 'Includes market analysis or comparable data', 'Provides a formal opinion of value'],
      categoryRules: 'Appraisals should be categorized under "Appraisals".',
    },
    {
      fileType: 'RedBook Valuation',
      category: 'Appraisals',
      keywords: ['rics', 'royal institution of chartered surveyors', 'valuation report', 'chartered surveyor', 'redbook', 'red book', 'vps', 'vpga'],
      description: 'RICS RedBook valuation reports are professional property valuations conducted by RICS qualified surveyors following RedBook standards. These are formal, standardized appraisals used for lending, financial reporting, and professional purposes. Most RICS valuations follow RedBook standards even if "RedBook" is not explicitly mentioned.',
      identificationRules: ['Look for "RICS" or "Royal Institution of Chartered Surveyors" branding', 'Contains formal valuation methodology section', 'Provides formal "Market Value" figure', 'Contains surveyor professional qualifications'],
      categoryRules: 'RedBook valuations should be categorized under "Appraisals".',
    },
    {
      fileType: 'Cashflow',
      category: 'Appraisals',
      keywords: ['cashflow', 'cash flow', 'dcf', 'discounted cash flow', 'projected cashflow', 'rental income projection', 'net operating income', 'noi'],
      description: 'Cashflow documents are financial projections showing expected income and expenses for a property or development project over time. They demonstrate financial viability and expected returns. Cashflows typically include projected rental income, operating expenses, debt service, and net cash flows over multiple periods.',
      identificationRules: ['Look for "Cashflow" or "DCF" in title', 'Contains projected income and expense figures', 'Includes rental income projections', 'Often presented in tabular format showing periods'],
      categoryRules: 'Cashflow documents should be categorized under "Appraisals".',
    },
    // PLANS
    {
      fileType: 'Floor Plans',
      category: 'Plans',
      keywords: ['floor plan', 'floor plans', 'floorplan', 'ground floor', 'first floor', 'layout', 'room layout', 'gifa', 'gia', 'nia'],
      description: 'Floor Plans are architectural drawings showing the horizontal layout of a building at a specific level. They display the arrangement of rooms, walls, doors, windows from a bird\'s eye view. Floor plans are essential for understanding property configuration and calculating floor areas.',
      identificationRules: ['Look for "Floor Plan" or floor references (Ground Floor, First Floor)', 'Shows horizontal layout with rooms and walls', 'Includes room names and dimensions', 'Contains scale information'],
      categoryRules: 'Floor Plans should be categorized under "Plans".',
    },
    {
      fileType: 'Elevations',
      category: 'Plans',
      keywords: ['elevation', 'elevations', 'front elevation', 'rear elevation', 'side elevation', 'north elevation', 'south elevation', 'facade'],
      description: 'Elevations are architectural drawings showing the external vertical faces of a building. They display the exterior appearance including windows, doors, roof lines from a straight-on view. Elevations are essential for planning applications and construction.',
      identificationRules: ['Look for "Elevation" or compass directions (North, South)', 'Shows external vertical view of building', 'Displays windows, doors, roof line', 'Contains height dimensions'],
      categoryRules: 'Elevations should be categorized under "Plans".',
    },
    {
      fileType: 'Sections',
      category: 'Plans',
      keywords: ['section', 'sections', 'cross section', 'building section', 'section a-a', 'internal heights', 'ceiling heights'],
      description: 'Sections are architectural drawings showing a building cut through vertically, revealing internal structure and heights. They display floor-to-ceiling heights, stair configurations, and roof structures.',
      identificationRules: ['Look for "Section" with reference letters (A-A, B-B)', 'Shows building cut through vertically', 'Displays floor-to-ceiling heights', 'Shows stairs and roof structure'],
      categoryRules: 'Sections should be categorized under "Plans".',
    },
    {
      fileType: 'Site Plans',
      category: 'Plans',
      keywords: ['site plan', 'site layout', 'block plan', 'plot plan', 'site boundary', 'red line boundary', 'parking layout'],
      description: 'Site Plans show the arrangement of buildings and features on a piece of land. They display the relationship between buildings, roads, parking, landscaping, and boundaries.',
      identificationRules: ['Look for "Site Plan" or "Site Layout"', 'Shows building footprint within a plot', 'Displays site boundaries', 'Includes access roads and parking'],
      categoryRules: 'Site Plans should be categorized under "Plans".',
    },
    {
      fileType: 'Location Plans',
      category: 'Plans',
      keywords: ['location plan', 'site location', 'ordnance survey', 'os map', '1:1250', '1:2500', 'wider context'],
      description: 'Location Plans are maps showing the wider geographic context of a property or development site. They display the site in relation to surrounding roads, buildings, and landmarks.',
      identificationRules: ['Look for "Location Plan"', 'Shows wider geographic area', 'Uses Ordnance Survey mapping', 'Site outlined in red'],
      categoryRules: 'Location Plans should be categorized under "Plans".',
    },
    // INSPECTIONS
    {
      fileType: 'Initial Monitoring Report',
      category: 'Inspections',
      keywords: ['initial monitoring report', 'initial monitoring', 'monitoring surveyor', 'pre-funding monitoring', 'due diligence monitoring'],
      description: 'Initial Monitoring Reports are formal due diligence reports prepared before a project is funded. They assess construction costs, timelines, and project viability to inform funding decisions.',
      identificationRules: ['Look for "Initial Monitoring Report"', 'Contains construction cost estimates', 'Includes project timeline', 'Prepared before funding'],
      categoryRules: 'Initial Monitoring Reports should be categorized under "Inspections".',
    },
    {
      fileType: 'Interim Monitoring Report',
      category: 'Inspections',
      keywords: ['interim monitoring report', 'interim monitoring', 'monthly monitoring', 'progress monitoring', 'drawdown monitoring'],
      description: 'Interim Monitoring Reports are monthly progress reports prepared during construction to sign off on funding for additional construction works.',
      identificationRules: ['Look for "Interim Monitoring Report"', 'Contains progress updates', 'Authorizes funding release', 'Includes percentage completion'],
      categoryRules: 'Interim Monitoring Reports should be categorized under "Inspections".',
    },
    // PROFESSIONAL REPORTS
    {
      fileType: 'Planning Documentation',
      category: 'Professional Reports',
      keywords: ['planning permission', 'planning approval', 'decision notice', 'planning consent', 'section 106', 's106', 'cil'],
      description: 'Planning Documentation includes official documents related to planning permissions and approvals for development projects. They are issued by Local Planning Authorities.',
      identificationRules: ['Look for "Planning Permission" or "Decision Notice"', 'Contains planning reference numbers', 'Issued by Local Planning Authority', 'Lists conditions attached'],
      categoryRules: 'Planning Documentation should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Contract Sum Analysis',
      category: 'Professional Reports',
      keywords: ['contract sum analysis', 'csa', 'cost plan', 'budget', 'construction budget', 'bill of quantities', 'boq'],
      description: 'Contract Sum Analysis documents provide detailed breakdowns of construction costs for development projects. Also known as Cost Plans or Budgets.',
      identificationRules: ['Look for "Contract Sum Analysis" or "Cost Plan"', 'Contains itemized cost breakdown', 'Includes preliminaries and contingency', 'Shows total construction cost'],
      categoryRules: 'Contract Sum Analysis should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Comparables',
      category: 'Professional Reports',
      keywords: ['comparables', 'comps', 'comparable evidence', 'rental comparables', 'sales comparables', 'market evidence'],
      description: 'Comparables documents provide market evidence of rental values or sales prices for similar properties. Used to support valuations and investment decisions.',
      identificationRules: ['Look for "Comparables" or "Market Evidence"', 'Contains data on similar properties', 'Shows transaction dates and values', 'May be part of an appraisal'],
      categoryRules: 'Comparables should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Building Survey',
      category: 'Professional Reports',
      keywords: ['building survey', 'structural survey', 'condition report', 'defects report', 'homebuyers report', 'dilapidation', 'survey report'],
      description: 'Building Surveys are detailed inspections of a property\'s condition by a qualified surveyor. They identify structural issues, defects, repairs needed, and maintenance requirements. More comprehensive than basic valuations, they cover foundations, roof, walls, damp, and services.',
      identificationRules: ['Look for "Building Survey" or "Condition Report"', 'Contains section on structural elements', 'Describes defects and repairs needed', 'Prepared by chartered surveyor (RICS)'],
      categoryRules: 'Building Surveys should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Report on Title',
      category: 'Professional Reports',
      keywords: ['report on title', 'title report', 'certificate of title', 'legal report', 'property report', 'cot', 'rot'],
      description: 'Report on Title is a legal document prepared by solicitors confirming a property\'s legal ownership status, encumbrances, rights of way, covenants, and any title defects. Essential for lender due diligence confirming clear title for security purposes.',
      identificationRules: ['Look for "Report on Title" or "Certificate of Title"', 'Prepared by solicitors', 'Confirms ownership and tenure', 'Lists covenants, easements, restrictions'],
      categoryRules: 'Reports on Title should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Legal Opinion',
      category: 'Professional Reports',
      keywords: ['legal opinion', 'counsel opinion', 'legal advice', 'memorandum of advice', 'barrister opinion', 'qc opinion'],
      description: 'Legal Opinions are formal written advice from lawyers or barristers on specific legal matters. They provide analysis of legal issues, risks, and recommended courses of action. May be required for complex transactions or disputes.',
      identificationRules: ['Look for "Legal Opinion" or "Opinion"', 'Prepared by solicitor or barrister', 'Addresses specific legal question', 'Contains legal analysis and conclusion'],
      categoryRules: 'Legal Opinions should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Environmental Report',
      category: 'Professional Reports',
      keywords: ['environmental report', 'phase 1', 'phase 2', 'contamination', 'ground investigation', 'geo-environmental', 'site investigation'],
      description: 'Environmental Reports assess environmental risks and contamination at a property. Phase 1 involves desk study and site walkover; Phase 2 involves intrusive ground investigation. Required by lenders to assess environmental liability risks.',
      identificationRules: ['Look for "Environmental Report" or "Phase 1/2"', 'Assesses contamination risk', 'Contains site history research', 'May include soil/water testing results'],
      categoryRules: 'Environmental Reports should be categorized under "Professional Reports".',
    },
    {
      fileType: 'Local Authority Search',
      category: 'Professional Reports',
      keywords: ['local authority search', 'local search', 'con29', 'llc1', 'planning search', 'roads search', 'drainage search'],
      description: 'Local Authority Searches (CON29, LLC1) reveal information from the local council about a property including planning history, building control, roads, drainage, and other public matters that could affect the property.',
      identificationRules: ['Look for "Local Authority Search" or "CON29"', 'Contains planning information', 'Shows road adoption status', 'Lists building control records'],
      categoryRules: 'Local Authority Searches should be categorized under "Professional Reports".',
    },
    // KYC
    {
      fileType: 'Passport',
      category: 'KYC',
      keywords: ['passport', 'travel document', 'identity document', 'passport number', 'mrz', 'machine readable zone'],
      description: 'Passports are official government-issued identity documents used for international travel and personal identification. Primary documents for KYC verification.',
      identificationRules: ['Passport booklet format or photo page scan', 'Contains photograph of holder', 'Shows name, date of birth, nationality', 'Has machine-readable zone (MRZ)'],
      categoryRules: 'Passports should be categorized under "KYC".',
    },
    {
      fileType: 'Driving License',
      category: 'KYC',
      keywords: ['driving licence', 'driving license', 'driver licence', 'dvla', 'licence number', 'photo card'],
      description: 'Driving Licenses are government-issued documents authorizing individuals to operate motor vehicles. Serve as photo identification for KYC verification.',
      identificationRules: ['Driving licence format (card or paper)', 'Contains photograph of holder', 'Shows name, date of birth, address', 'Includes licence number'],
      categoryRules: 'Driving Licenses should be categorized under "KYC".',
    },
    {
      fileType: 'Utility Bill',
      category: 'KYC',
      keywords: ['utility bill', 'electricity bill', 'gas bill', 'water bill', 'council tax', 'phone bill', 'proof of address'],
      description: 'Utility Bills are periodic statements from utility providers showing charges for services. Commonly used as proof of address for KYC verification.',
      identificationRules: ['Utility provider branding', 'Contains customer name and address', 'Shows account number', 'Includes billing period and date'],
      categoryRules: 'Utility Bills should be categorized under "KYC".',
    },
    {
      fileType: 'Bank Statement',
      category: 'KYC',
      keywords: ['bank statement', 'account statement', 'current account', 'transaction history', 'sort code', 'account number'],
      description: 'Bank Statements are periodic documents showing account activity, transactions, and balances. Used for KYC verification as proof of address and financial due diligence.',
      identificationRules: ['Bank or building society branding', 'Contains account holder name and address', 'Shows account number and sort code', 'Lists transactions'],
      categoryRules: 'Bank Statements should be categorized under "KYC".',
    },
    {
      fileType: 'Application Form',
      category: 'KYC',
      keywords: ['application form', 'loan application', 'finance application', 'credit application', 'kyc form'],
      description: 'Application Forms collect information from customers applying for finance or services. They capture personal and business details required for KYC compliance.',
      identificationRules: ['Contains structured fields for information', 'Requests name, address, identification', 'Contains declarations and signature', 'Often multiple pages'],
      categoryRules: 'Application Forms should be categorized under "KYC".',
    },
    {
      fileType: 'Assets & Liabilities Statement',
      category: 'KYC',
      keywords: ['assets and liabilities', 'assets & liabilities', 'personal assets', 'net worth', 'statement of affairs'],
      description: 'Assets & Liabilities Statements show an individual\'s or company\'s financial position listing assets and liabilities to calculate net worth.',
      identificationRules: ['Lists assets with values', 'Lists liabilities with amounts', 'Shows total assets and liabilities', 'Calculates net worth'],
      categoryRules: 'Assets & Liabilities Statements should be categorized under "KYC".',
    },
    {
      fileType: 'Track Record',
      category: 'KYC',
      keywords: ['track record', 'project experience', 'portfolio', 'development experience', 'cv', 'curriculum vitae', 'resume', 'case study', 'case studies', 'project history', 'completed projects', 'development history', 'background', 'company profile', 'experience', 'credentials'],
      description: 'Track Record documents demonstrate a developer\'s, sponsor\'s, or principal\'s experience in property development or construction. These can include portfolios of completed projects, CVs showing relevant experience, case studies of past developments, or company profiles highlighting project history. Track records are critical for assessing borrower capability and are typically required during KYC/due diligence. They may include project descriptions, timelines, budgets vs actuals, images of completed works, testimonials, or references. In real estate lending, track record is a key credit consideration alongside financial strength.',
      identificationRules: ['Look for "Track Record", "Portfolio", "CV", "Experience", or "Company Profile" in title', 'Contains descriptions of past projects or developments', 'Shows multiple projects with dates and outcomes', 'Includes developer or company credentials', 'May contain images of completed developments'],
      categoryRules: 'Track Record documents should be categorized under "KYC".',
    },
    {
      fileType: 'Certificate of Incorporation',
      category: 'KYC',
      keywords: ['certificate of incorporation', 'incorporation certificate', 'companies house', 'company formation', 'registered company', 'company number', 'incorporation'],
      description: 'Certificate of Incorporation is an official document from Companies House (UK) or equivalent registrar confirming a company\'s legal formation. It contains the company name, registration number, date of incorporation, and type of company. This is a fundamental KYC document establishing the legal existence of a corporate borrower or guarantor.',
      identificationRules: ['Look for "Certificate of Incorporation"', 'Contains company registration number', 'Issued by Companies House or registrar', 'Shows date of incorporation'],
      categoryRules: 'Certificates of Incorporation should be categorized under "KYC".',
    },
    {
      fileType: 'Company Search',
      category: 'KYC',
      keywords: ['company search', 'companies house search', 'company check', 'due diligence', 'corporate search', 'company report', 'credit check', 'company profile'],
      description: 'Company Search reports provide detailed information about a company including directors, shareholders, filed accounts, charges registered, and incorporation details. These are obtained from Companies House or commercial providers for due diligence and KYC purposes.',
      identificationRules: ['Look for "Company Search" or company information report', 'Contains director and shareholder details', 'Shows filed accounts summary', 'Lists charges and mortgages', 'Includes company registration details'],
      categoryRules: 'Company Searches should be categorized under "KYC".',
    },
    {
      fileType: 'Tax Return',
      category: 'KYC',
      keywords: ['tax return', 'sa100', 'self assessment', 'hmrc', 'tax computation', 'corporation tax', 'ct600', 'income tax', 'tax filing'],
      description: 'Tax Returns are documents filed with tax authorities (HMRC in UK) showing income, deductions, and tax liability. Personal tax returns (SA100) show individual income sources while corporation tax returns (CT600) show company profits. These verify income and financial status for lending purposes.',
      identificationRules: ['Look for "Tax Return", "SA100", "CT600", or HMRC references', 'Contains income and deduction figures', 'Shows tax year or accounting period', 'Includes tax calculations'],
      categoryRules: 'Tax Returns should be categorized under "KYC".',
    },
    // LOAN TERMS
    {
      fileType: 'Indicative Terms',
      category: 'Loan Terms',
      keywords: ['indicative terms', 'heads of terms', 'development finance', 'bridging loan', 'ltgdv', 'in principle'],
      description: 'Indicative Terms (Heads of Terms) are preliminary loan offers outlining proposed terms including facility amounts, interest rates, and fees. Subject to due diligence.',
      identificationRules: ['Look for "Indicative Terms" or "Heads of Terms"', 'Contains loan amounts and terms', 'Includes interest rates and fees', 'States "in principle" or subject to approval'],
      categoryRules: 'Indicative Terms should be categorized under "Loan Terms".',
    },
    {
      fileType: 'Credit Backed Terms',
      category: 'Loan Terms',
      keywords: ['credit backed terms', 'credit approved', 'credit committee approved', 'approved terms', 'committed terms'],
      description: 'Credit Backed Terms are loan terms that have received formal credit committee approval, moving beyond indicative offers to committed terms.',
      identificationRules: ['Look for "Credit Backed" or "Credit Approved"', 'Contains credit committee approval statement', 'Includes specific facility details', 'More formal than indicative terms'],
      categoryRules: 'Credit Backed Terms should be categorized under "Loan Terms".',
    },
    // LEGAL DOCUMENTS
    {
      fileType: 'Facility Letter',
      category: 'Legal Documents',
      keywords: ['facility letter', 'facility agreement', 'loan agreement', 'credit agreement', 'drawdown', 'repayment schedule'],
      description: 'Facility Letters (Loan Agreements) are formal legal documents establishing the terms and conditions of a loan between lender and borrower. Binding contracts.',
      identificationRules: ['Look for "Facility Letter" or "Loan Agreement"', 'Contains formal legal language', 'Sets out loan amount and interest', 'Contains conditions precedent'],
      categoryRules: 'Facility Letters should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Personal Guarantee',
      category: 'Legal Documents',
      keywords: ['personal guarantee', 'pg', 'guarantor', 'joint and several', 'director guarantee'],
      description: 'Personal Guarantees are legal documents where an individual agrees to be personally responsible for a borrower\'s obligations if they default.',
      identificationRules: ['Look for "Personal Guarantee"', 'Names individual guarantor', 'References underlying loan', 'Executed as a deed'],
      categoryRules: 'Personal Guarantees should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Corporate Guarantee',
      category: 'Legal Documents',
      keywords: ['corporate guarantee', 'company guarantee', 'group guarantee', 'parent company guarantee'],
      description: 'Corporate Guarantees are legal documents where a company agrees to be responsible for another entity\'s obligations.',
      identificationRules: ['Look for "Corporate Guarantee"', 'Names corporate guarantor', 'References underlying loan', 'Requires board authorization'],
      categoryRules: 'Corporate Guarantees should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Terms & Conditions',
      category: 'Legal Documents',
      keywords: ['terms and conditions', 'terms & conditions', 't&c', 'standard terms', 'general conditions'],
      description: 'Terms & Conditions are standard legal documents setting out rules and requirements that apply to a business relationship or service.',
      identificationRules: ['Look for "Terms & Conditions"', 'Contains standardized provisions', 'Includes definitions', 'Sets out general obligations'],
      categoryRules: 'Terms & Conditions should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Shareholders Agreement',
      category: 'Legal Documents',
      keywords: ['shareholders agreement', 'shareholder agreement', 'sha', 'joint venture agreement', 'drag along', 'tag along'],
      description: 'Shareholders Agreements are contracts between shareholders setting out how a company will be operated and shareholders\' rights.',
      identificationRules: ['Look for "Shareholders Agreement"', 'Names company and shareholders', 'Contains governance provisions', 'Includes share transfer restrictions'],
      categoryRules: 'Shareholders Agreements should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Share Charge',
      category: 'Legal Documents',
      keywords: ['share charge', 'charge over shares', 'share security', 'equity pledge', 'share pledge'],
      description: 'Share Charges are security documents where shares in a company are pledged as collateral for a loan.',
      identificationRules: ['Look for "Share Charge"', 'Names chargor and chargee', 'Identifies shares being charged', 'References share certificates'],
      categoryRules: 'Share Charges should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Debenture',
      category: 'Legal Documents',
      keywords: ['debenture', 'fixed charge', 'floating charge', 'all assets charge', 'crystallization'],
      description: 'Debentures are security documents that create fixed and/or floating charges over a company\'s assets.',
      identificationRules: ['Look for "Debenture"', 'Creates fixed and/or floating charges', 'Contains schedules of assets', 'Requires Companies House registration'],
      categoryRules: 'Debentures should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Corporate Authorisations',
      category: 'Legal Documents',
      keywords: ['board resolution', 'board minutes', 'corporate resolution', 'directors resolution', 'signing authority'],
      description: 'Corporate Authorisations evidence that a company has properly authorized a transaction or signing of documents. Include board resolutions and certificates.',
      identificationRules: ['Look for "Board Resolution" or "Authorization"', 'Names company and date', 'Approves specific transaction', 'Names authorized signatories'],
      categoryRules: 'Corporate Authorisations should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Building Contract',
      category: 'Legal Documents',
      keywords: ['building contract', 'construction contract', 'jct', 'jct contract', 'design and build', 'd&b', 'minor works', 'intermediate building contract', 'standard building contract', 'mw', 'ic', 'sbc', 'contractor agreement', 'main contract', 'works contract'],
      description: 'Building Contracts are legal agreements between property owners, developers, or employers and contractors for the execution of construction works. The most common form in the UK is the JCT (Joint Contracts Tribunal) suite of contracts, which includes various editions tailored to different project sizes and procurement methods. JCT Minor Works (MW) is used for smaller projects without complex design requirements. JCT Intermediate Building Contract (IC) suits medium-sized projects with moderate complexity. JCT Standard Building Contract (SBC) is for larger, more complex construction projects. JCT Design & Build (D&B) is used when the contractor takes responsibility for both design and construction. These contracts define the scope of works, contract sum, payment schedules, practical completion dates, defects liability periods, and mechanisms for variations, extensions of time, and dispute resolution. Building contracts also establish the roles of contract administrators, architects, and quantity surveyors in overseeing the works.',
      identificationRules: ['Look for "Building Contract", "JCT", or "Construction Contract" in the title', 'Contains articles of agreement and conditions of contract', 'References contract sum or contract price', 'Includes completion date and defects liability period', 'Contains provisions for variations and extensions of time'],
      categoryRules: 'Building Contracts should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Professional Appointment',
      category: 'Legal Documents',
      keywords: ['professional appointment', 'appointment', 'consultant appointment', 'architect appointment', 'qs appointment', 'engineer appointment', 'novation'],
      description: 'Professional Appointments are contracts between clients and professional consultants such as architects, engineers, quantity surveyors, and project managers. They define the scope of services, fees, insurance requirements, and duties. Important for lender due diligence to ensure appropriate professional team.',
      identificationRules: ['Look for "Appointment" or "Engagement Letter"', 'Names consultant and client', 'Defines scope of services', 'Contains fee structure and payment terms'],
      categoryRules: 'Professional Appointments should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Collateral Warranty',
      category: 'Legal Documents',
      keywords: ['collateral warranty', 'warranty', 'duty of care', 'step in rights', 'third party rights'],
      description: 'Collateral Warranties are agreements where contractors or professionals provide a duty of care to third parties such as funders or purchasers. They give lenders direct rights against consultants/contractors and step-in rights if the developer defaults.',
      identificationRules: ['Look for "Collateral Warranty"', 'Names beneficiary (funder/purchaser)', 'Contains duty of care provisions', 'Includes step-in rights'],
      categoryRules: 'Collateral Warranties should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Title Deed',
      category: 'Legal Documents',
      keywords: ['title deed', 'title register', 'land registry', 'official copy', 'title absolute', 'title information document', 'tid'],
      description: 'Title Deeds are legal documents evidencing ownership of property. In England and Wales, registered land has a Title Register at Land Registry. Official copies of title show the owner, property description, charges, and restrictions.',
      identificationRules: ['Look for "Title Register" or Land Registry document', 'Contains title number', 'Shows registered proprietor', 'Lists charges and restrictions'],
      categoryRules: 'Title Deeds should be categorized under "Legal Documents".',
    },
    {
      fileType: 'Lease',
      category: 'Legal Documents',
      keywords: ['lease', 'tenancy agreement', 'leasehold', 'rental agreement', 'commercial lease', 'residential lease', 'asl', 'ast'],
      description: 'Leases are contracts granting rights to occupy property for a specified term. Include commercial leases, residential ASTs (Assured Shorthold Tenancies), and long leases. Key for investment properties showing rental income and tenant obligations.',
      identificationRules: ['Look for "Lease" or "Tenancy Agreement"', 'Contains term/duration', 'Shows rent and review provisions', 'Names landlord and tenant'],
      categoryRules: 'Leases should be categorized under "Legal Documents".',
    },
    // PROJECT DOCUMENTS
    {
      fileType: 'Accommodation Schedule',
      category: 'Project Documents',
      keywords: ['accommodation schedule', 'unit schedule', 'unit mix', 'apartment schedule', 'flat schedule', 'bedroom mix'],
      description: 'Accommodation Schedules list all units in a development with their specifications. Provide breakdown of unit types, sizes, and configuration.',
      identificationRules: ['Look for "Accommodation Schedule" or "Unit Schedule"', 'Contains list of units', 'Shows unit types and sizes', 'Includes floor areas'],
      categoryRules: 'Accommodation Schedules should be categorized under "Project Documents".',
    },
    {
      fileType: 'Build Programme',
      category: 'Project Documents',
      keywords: ['build programme', 'construction programme', 'gantt chart', 'project timeline', 'construction schedule', 'milestone schedule'],
      description: 'Build Programmes show the timeline for construction works, illustrating sequence and duration of activities from start to completion.',
      identificationRules: ['Look for "Build Programme" or "Construction Programme"', 'Contains timeline of activities', 'Often Gantt chart format', 'Shows key milestones'],
      categoryRules: 'Build Programmes should be categorized under "Project Documents".',
    },
    // FINANCIAL DOCUMENTS
    {
      fileType: 'Loan Statement',
      category: 'Financial Documents',
      keywords: ['loan statement', 'facility statement', 'loan account', 'outstanding balance', 'interest accrued'],
      description: 'Loan Statements show the current position of a loan account including amounts drawn, interest accrued, and outstanding balance.',
      identificationRules: ['Look for "Loan Statement"', 'Shows outstanding balance', 'Contains transaction history', 'Includes interest calculations'],
      categoryRules: 'Loan Statements should be categorized under "Financial Documents".',
    },
    {
      fileType: 'Redemption Statement',
      category: 'Financial Documents',
      keywords: ['redemption statement', 'redemption figure', 'payoff statement', 'settlement figure', 'early repayment'],
      description: 'Redemption Statements show the exact amount required to fully repay and close a loan on a specific date.',
      identificationRules: ['Look for "Redemption Statement"', 'Shows total amount to repay', 'Includes redemption date', 'Breaks down principal and interest'],
      categoryRules: 'Redemption Statements should be categorized under "Financial Documents".',
    },
    {
      fileType: 'Completion Statement',
      category: 'Financial Documents',
      keywords: ['completion statement', 'settlement statement', 'completion figures', 'closing statement', 'apportionment'],
      description: 'Completion Statements are financial documents for property transactions showing all amounts due on completion.',
      identificationRules: ['Look for "Completion Statement"', 'Shows financial summary of transaction', 'Includes purchase price', 'Contains apportionments'],
      categoryRules: 'Completion Statements should be categorized under "Financial Documents".',
    },
    {
      fileType: 'Invoice',
      category: 'Financial Documents',
      keywords: ['invoice', 'bill', 'payment request', 'vat invoice', 'sales invoice', 'tax invoice'],
      description: 'Invoices are documents requesting payment for goods or services provided. In construction, contractor invoices (applications for payment) are submitted monthly based on work completed. Include VAT details, payment terms, and breakdown of charges.',
      identificationRules: ['Look for "Invoice"', 'Contains invoice number', 'Shows amounts due and VAT', 'Has payment due date'],
      categoryRules: 'Invoices should be categorized under "Financial Documents".',
    },
    {
      fileType: 'Receipt',
      category: 'Financial Documents',
      keywords: ['receipt', 'payment receipt', 'proof of payment', 'payment confirmation', 'remittance'],
      description: 'Receipts are documents confirming payment has been received. They evidence that funds have been transferred and debts discharged. Important for tracking drawdowns and professional fee payments.',
      identificationRules: ['Look for "Receipt" or "Payment Confirmation"', 'Shows amount received', 'Contains date of payment', 'References invoice or transaction'],
      categoryRules: 'Receipts should be categorized under "Financial Documents".',
    },
    // INSURANCE
    {
      fileType: 'Insurance Policy',
      category: 'Insurance',
      keywords: ['insurance policy', 'policy schedule', 'cover note', 'public liability', 'professional indemnity', 'contractors all risk', 'car insurance', 'building insurance'],
      description: 'Insurance Policies are contracts providing coverage against specified risks. In construction lending, key policies include CAR (Contractors All Risk), Professional Indemnity, and Public Liability. The policy document contains terms, coverage limits, exclusions, and premium details.',
      identificationRules: ['Look for "Insurance Policy" or "Policy Schedule"', 'Names insured and insurer', 'Shows coverage limits', 'Contains policy number and dates'],
      categoryRules: 'Insurance Policies should be categorized under "Insurance".',
    },
    {
      fileType: 'Insurance Certificate',
      category: 'Insurance',
      keywords: ['insurance certificate', 'certificate of insurance', 'coi', 'insurance endorsement', 'noted interest'],
      description: 'Insurance Certificates are summary documents evidencing that insurance is in place. Often issued to third parties (like lenders) to confirm coverage exists. May show lender noted as interested party.',
      identificationRules: ['Look for "Certificate of Insurance"', 'Confirms coverage is in place', 'Shows policy limits', 'May name additional interested parties'],
      categoryRules: 'Insurance Certificates should be categorized under "Insurance".',
    },
    // COMMUNICATIONS
    {
      fileType: 'Email/Correspondence',
      category: 'Communications',
      keywords: ['email', 'correspondence', 'letter', 'memo', 'memorandum', 'communication'],
      description: 'Emails and Correspondence are written communications between parties. May include important project updates, instructions, negotiations, or formal notices. Filed for record-keeping and audit trail purposes.',
      identificationRules: ['Email format with headers', 'Contains to/from addresses', 'Has date and subject', 'Letter format with letterhead'],
      categoryRules: 'Emails and Correspondence should be categorized under "Communications".',
    },
    {
      fileType: 'Meeting Minutes',
      category: 'Communications',
      keywords: ['meeting minutes', 'minutes', 'meeting notes', 'action points', 'progress meeting', 'site meeting'],
      description: 'Meeting Minutes are formal records of discussions and decisions from meetings. In construction, progress meetings track project status, issues, and actions. Important for documenting project history and accountability.',
      identificationRules: ['Look for "Minutes" or "Meeting Notes"', 'Contains date and attendees', 'Lists discussion items', 'Shows action points'],
      categoryRules: 'Meeting Minutes should be categorized under "Communications".',
    },
    // WARRANTIES
    {
      fileType: 'NHBC Warranty',
      category: 'Warranties',
      keywords: ['nhbc', 'buildmark', 'structural warranty', 'new home warranty', 'premier guarantee', 'labc'],
      description: 'NHBC Warranty (Buildmark) is a 10-year structural warranty for new homes provided by the National House Building Council. It covers structural defects and provides protection to buyers and lenders. Other warranty providers include Premier Guarantee and LABC.',
      identificationRules: ['Look for "NHBC" or "Buildmark"', 'Shows policy number', 'Confirms cover start date', 'Lists covered properties/units'],
      categoryRules: 'NHBC Warranties should be categorized under "Warranties".',
    },
    {
      fileType: 'Latent Defects Insurance',
      category: 'Warranties',
      keywords: ['latent defects', 'ldi', 'inherent defects', 'structural defects insurance', 'building warranty'],
      description: 'Latent Defects Insurance (LDI) provides cover against structural defects that become apparent after construction. Similar to NHBC but often used for commercial properties or where NHBC is unavailable. Typically 10-12 year policies.',
      identificationRules: ['Look for "Latent Defects Insurance"', 'Covers structural elements', 'Shows policy period (typically 10+ years)', 'Lists insured perils'],
      categoryRules: 'Latent Defects Insurance should be categorized under "Warranties".',
    },
    // PHOTOGRAPHS
    {
      fileType: 'Site Photographs',
      category: 'Photographs',
      keywords: ['site photos', 'photographs', 'images', 'progress photos', 'construction photos', 'site visit photos'],
      description: 'Site Photographs document the condition and progress of construction works. Used by monitoring surveyors, lenders, and project teams to track construction milestones, verify work completion, and maintain visual records.',
      identificationRules: ['Image files (JPG, PNG, etc.)', 'Shows construction site', 'May have date stamps', 'Often grouped by visit date'],
      categoryRules: 'Site Photographs should be categorized under "Photographs".',
    },
  ];
}

