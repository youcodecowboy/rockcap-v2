import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Item Categories - CRUD functions for managing dynamic categories
 * Categories help organize item codes and improve LLM codification accuracy
 */

// Helper to normalize category name for matching
function normalizeCategory(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
}

// ============================================================================
// QUERIES
// ============================================================================

// Query: Get all categories
export const list = query({
  args: {
    includeSystem: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let categories;
    
    if (args.includeSystem === false) {
      categories = await ctx.db
        .query("itemCategories")
        .withIndex("by_system", (q) => q.eq("isSystem", false))
        .collect();
    } else {
      categories = await ctx.db.query("itemCategories").collect();
    }
    
    // Sort by displayOrder, then by name
    return categories.sort((a, b) => {
      const orderA = a.displayOrder ?? 999;
      const orderB = b.displayOrder ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });
  },
});

// Query: Get category by ID
export const get = query({
  args: { id: v.id("itemCategories") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Query: Get category by normalized name
export const getByNormalizedName = query({
  args: { normalizedName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("itemCategories")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", args.normalizedName))
      .first();
  },
});

// Query: Get all category names (for dropdowns)
export const getCategoryNames = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("itemCategories").collect();
    return categories
      .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999))
      .map(c => c.name);
  },
});

// Query: Get categories formatted for LLM prompt
export const getForLLMPrompt = query({
  args: {},
  handler: async (ctx) => {
    const categories = await ctx.db.query("itemCategories").collect();
    
    // Sort by displayOrder
    categories.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
    
    return categories.map(cat => ({
      name: cat.name,
      normalizedName: cat.normalizedName,
      description: cat.description,
      examples: cat.examples,
    }));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

// Mutation: Create a new category
export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    examples: v.array(v.string()),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const normalizedName = normalizeCategory(args.name);
    
    // Check if category with this normalized name already exists
    const existing = await ctx.db
      .query("itemCategories")
      .withIndex("by_normalized_name", (q) => q.eq("normalizedName", normalizedName))
      .first();
    
    if (existing) {
      throw new Error(`Category with name "${args.name}" already exists`);
    }
    
    const now = new Date().toISOString();
    
    const categoryId = await ctx.db.insert("itemCategories", {
      name: args.name.trim(),
      normalizedName,
      description: args.description.trim(),
      examples: args.examples.map(e => e.trim()).filter(Boolean),
      isSystem: false,
      displayOrder: args.displayOrder,
      createdAt: now,
      updatedAt: now,
    });
    
    return categoryId;
  },
});

// Mutation: Update a category
export const update = mutation({
  args: {
    id: v.id("itemCategories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    examples: v.optional(v.array(v.string())),
    displayOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const existing = await ctx.db.get(id);
    
    if (!existing) {
      throw new Error("Category not found");
    }
    
    const patchData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    
    if (updates.name !== undefined) {
      const newNormalizedName = normalizeCategory(updates.name);
      
      // Check if new name conflicts with another category
      const conflict = await ctx.db
        .query("itemCategories")
        .withIndex("by_normalized_name", (q) => q.eq("normalizedName", newNormalizedName))
        .first();
      
      if (conflict && conflict._id !== id) {
        throw new Error(`Category with name "${updates.name}" already exists`);
      }
      
      patchData.name = updates.name.trim();
      patchData.normalizedName = newNormalizedName;
    }
    
    if (updates.description !== undefined) {
      patchData.description = updates.description.trim();
    }
    
    if (updates.examples !== undefined) {
      patchData.examples = updates.examples.map(e => e.trim()).filter(Boolean);
    }
    
    if (updates.displayOrder !== undefined) {
      patchData.displayOrder = updates.displayOrder;
    }
    
    await ctx.db.patch(id, patchData);
    return id;
  },
});

// Mutation: Delete a category
export const remove = mutation({
  args: { id: v.id("itemCategories") },
  handler: async (ctx, args) => {
    const category = await ctx.db.get(args.id);
    
    if (!category) {
      throw new Error("Category not found");
    }
    
    if (category.isSystem) {
      throw new Error("Cannot delete system categories");
    }
    
    // Check if any item codes use this category
    const codesUsingCategory = await ctx.db
      .query("extractedItemCodes")
      .withIndex("by_category", (q) => q.eq("category", category.name))
      .first();
    
    if (codesUsingCategory) {
      throw new Error("Cannot delete category that has item codes assigned. Move or delete the codes first.");
    }
    
    await ctx.db.delete(args.id);
  },
});

// Mutation: Seed default system categories
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const defaultCategories = [
      {
        name: "Site Costs",
        normalizedName: "site.costs",
        description: "Costs related to land acquisition and site purchase. Includes the purchase price of land, stamp duty land tax (SDLT), finder's fees, and any other costs directly associated with acquiring the site.",
        examples: ["Site Purchase Price", "Stamp Duty", "SDLT", "Finders Fee", "Acquisition Costs", "Land Cost"],
        displayOrder: 1,
      },
      {
        name: "Professional Fees",
        normalizedName: "professional.fees",
        description: "Fees for professional services during the development process. Includes consultants, architects, engineers, surveyors, and regulatory approvals like building regulations and Section 106/CIL contributions.",
        examples: ["Engineers", "Architects", "Solicitors", "Building Regulations", "S106", "CIL", "Surveyors", "Planning Consultant", "Project Manager"],
        displayOrder: 2,
      },
      {
        name: "Construction Costs",
        normalizedName: "construction.costs",
        description: "Direct costs of construction and building works. Includes main contractor costs, groundworks, retaining works, external works, and all physical construction activities.",
        examples: ["Build Cost", "Construction", "Groundworks", "Retaining Works", "External Works", "Prelims", "Contingency"],
        displayOrder: 3,
      },
      {
        name: "Financing Costs",
        normalizedName: "financing.costs",
        description: "Costs related to project financing and loans. Includes interest on debt, arrangement fees, legal fees for financing, and any other borrowing costs.",
        examples: ["Interest Rate", "Arrangement Fee", "Finance Legal", "Loan Interest", "Funding Fee", "Exit Fee"],
        displayOrder: 4,
      },
      {
        name: "Disposal Costs",
        normalizedName: "disposal.costs",
        description: "Costs incurred when selling completed units or the development. Includes estate agent fees, legal fees for sales, marketing costs, and show home expenses.",
        examples: ["Agent Fee", "Sales Legal", "Marketing", "Show Home", "Estate Agent", "Disposal Legal"],
        displayOrder: 5,
      },
      {
        name: "Plots",
        normalizedName: "plots",
        description: "Individual plot or unit data within a development. Each plot represents a buildable unit with its own costs, revenues, and specifications.",
        examples: ["Plot 1", "Plot 2", "Unit A", "House Type 1", "Apartment 1"],
        displayOrder: 6,
      },
      {
        name: "Revenue",
        normalizedName: "revenue",
        description: "Income and sales figures from the development. Includes individual unit sales, total gross development value (GDV), and any other income sources.",
        examples: ["Total Sales", "GDV", "Unit Revenue", "Sale Price", "Income"],
        displayOrder: 7,
      },
      {
        name: "Other",
        normalizedName: "other",
        description: "Miscellaneous costs and items that don't fit into other categories. Use this for unique or one-off items specific to a particular development.",
        examples: ["Miscellaneous", "Sundry", "Other Costs"],
        displayOrder: 99,
      },
    ];
    
    const now = new Date().toISOString();
    let created = 0;
    let skipped = 0;
    
    for (const cat of defaultCategories) {
      // Check if already exists
      const existing = await ctx.db
        .query("itemCategories")
        .withIndex("by_normalized_name", (q) => q.eq("normalizedName", cat.normalizedName))
        .first();
      
      if (existing) {
        skipped++;
        continue;
      }
      
      await ctx.db.insert("itemCategories", {
        ...cat,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    
    return { created, skipped };
  },
});

// Mutation: Check if categories need seeding
export const checkAndSeed = mutation({
  args: {},
  handler: async (ctx) => {
    const count = await ctx.db.query("itemCategories").collect();
    
    if (count.length === 0) {
      // No categories exist, seed defaults
      const defaultCategories = [
        {
          name: "Site Costs",
          normalizedName: "site.costs",
          description: "Costs related to land acquisition and site purchase.",
          examples: ["Site Purchase Price", "Stamp Duty", "SDLT", "Finders Fee"],
          displayOrder: 1,
        },
        {
          name: "Professional Fees",
          normalizedName: "professional.fees",
          description: "Fees for professional services during development.",
          examples: ["Engineers", "Architects", "Solicitors", "Building Regulations"],
          displayOrder: 2,
        },
        {
          name: "Construction Costs",
          normalizedName: "construction.costs",
          description: "Direct costs of construction and building works.",
          examples: ["Build Cost", "Groundworks", "External Works", "Contingency"],
          displayOrder: 3,
        },
        {
          name: "Financing Costs",
          normalizedName: "financing.costs",
          description: "Costs related to project financing and loans.",
          examples: ["Interest Rate", "Arrangement Fee", "Loan Interest"],
          displayOrder: 4,
        },
        {
          name: "Disposal Costs",
          normalizedName: "disposal.costs",
          description: "Costs incurred when selling completed units.",
          examples: ["Agent Fee", "Sales Legal", "Marketing"],
          displayOrder: 5,
        },
        {
          name: "Plots",
          normalizedName: "plots",
          description: "Individual plot or unit data within a development.",
          examples: ["Plot 1", "Plot 2", "Unit A"],
          displayOrder: 6,
        },
        {
          name: "Revenue",
          normalizedName: "revenue",
          description: "Income and sales figures from the development.",
          examples: ["Total Sales", "GDV", "Sale Price"],
          displayOrder: 7,
        },
        {
          name: "Other",
          normalizedName: "other",
          description: "Miscellaneous costs not in other categories.",
          examples: ["Miscellaneous", "Sundry"],
          displayOrder: 99,
        },
      ];
      
      const now = new Date().toISOString();
      
      for (const cat of defaultCategories) {
        await ctx.db.insert("itemCategories", {
          ...cat,
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        });
      }
      
      return { seeded: true, count: defaultCategories.length };
    }
    
    return { seeded: false, count: count.length };
  },
});

