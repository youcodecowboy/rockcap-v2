import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// =============================================================================
// TEMPLATE SHEETS - CRUD Operations
// =============================================================================

// Note: All sheet data is stored inline for simplicity.
// Convex documents can be up to 1MB, which is sufficient for most sheets.
// For extremely large sheets (>1MB), consider splitting data across multiple documents.

/**
 * Get all sheets for a template (metadata only)
 */
export const listByTemplate = query({
  args: {
    templateId: v.id("templateDefinitions"),
  },
  handler: async (ctx, args) => {
    const sheets = await ctx.db
      .query("templateSheets")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .collect();

    // Sort by order and return metadata only
    return sheets
      .sort((a, b) => a.order - b.order)
      .map(sheet => ({
        _id: sheet._id,
        templateId: sheet.templateId,
        name: sheet.name,
        order: sheet.order,
        type: sheet.type,
        groupId: sheet.groupId,
        dimensions: sheet.dimensions,
        hasFormulas: sheet.hasFormulas,
        hasStyles: sheet.hasStyles,
        hasMergedCells: sheet.hasMergedCells,
        estimatedSizeBytes: sheet.estimatedSizeBytes,
        hasInlineData: !!sheet.inlineData,
        hasStorageData: !!sheet.dataStorageId,
      }));
  },
});

/**
 * Get a single sheet by ID (full data)
 */
export const getById = query({
  args: {
    sheetId: v.id("templateSheets"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sheetId);
  },
});

/**
 * Get sheet data (handles both inline and storage)
 * Returns the full sheet data ready for Handsontable
 */
export const getSheetData = query({
  args: {
    sheetId: v.id("templateSheets"),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet) return null;

    // If inline data exists, return it directly
    if (sheet.inlineData) {
      return {
        name: sheet.name,
        data: sheet.inlineData.data,
        styles: sheet.inlineData.styles || {},
        formulas: sheet.inlineData.formulas || {},
        columnWidths: sheet.inlineData.columnWidths || {},
        rowHeights: sheet.inlineData.rowHeights || {},
        mergedCells: sheet.inlineData.mergedCells || [],
        dimensions: sheet.dimensions,
      };
    }

    // If stored in file storage, return storage URL for client to fetch
    if (sheet.dataStorageId) {
      const url = await ctx.storage.getUrl(sheet.dataStorageId);
      return {
        name: sheet.name,
        storageUrl: url,
        dimensions: sheet.dimensions,
      };
    }

    // No data available
    return null;
  },
});

/**
 * Get multiple sheets' data in parallel
 * Optimized for loading multiple sheets at once
 */
export const getMultipleSheetsData = query({
  args: {
    sheetIds: v.array(v.id("templateSheets")),
  },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.sheetIds.map(async (sheetId) => {
        const sheet = await ctx.db.get(sheetId);
        if (!sheet) return null;

        if (sheet.inlineData) {
          return {
            _id: sheet._id,
            name: sheet.name,
            data: sheet.inlineData.data,
            styles: sheet.inlineData.styles || {},
            formulas: sheet.inlineData.formulas || {},
            columnWidths: sheet.inlineData.columnWidths || {},
            rowHeights: sheet.inlineData.rowHeights || {},
            mergedCells: sheet.inlineData.mergedCells || [],
            dimensions: sheet.dimensions,
          };
        }

        if (sheet.dataStorageId) {
          const url = await ctx.storage.getUrl(sheet.dataStorageId);
          return {
            _id: sheet._id,
            name: sheet.name,
            storageUrl: url,
            dimensions: sheet.dimensions,
          };
        }

        return null;
      })
    );

    return results.filter(Boolean);
  },
});

/**
 * Create a new template sheet
 */
export const create = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
    name: v.string(),
    order: v.number(),
    type: v.union(v.literal("core"), v.literal("dynamic")),
    groupId: v.optional(v.string()),
    // Sheet data
    data: v.any(), // Cell data (any[][] format)
    styles: v.optional(v.any()),
    formulas: v.optional(v.any()),
    columnWidths: v.optional(v.any()),
    rowHeights: v.optional(v.any()),
    mergedCells: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const now = new Date().toISOString();

    // Calculate dimensions
    const rows = args.data?.length || 0;
    const cols = args.data?.[0]?.length || 0;

    // Check if data has formulas and styles
    const hasFormulas = args.formulas && Object.keys(args.formulas).length > 0;
    const hasStyles = args.styles && Object.keys(args.styles).length > 0;
    const hasMergedCells = args.mergedCells && args.mergedCells.length > 0;

    // Estimate size (approximate)
    const dataStr = JSON.stringify({
      data: args.data,
      styles: args.styles,
      formulas: args.formulas,
      columnWidths: args.columnWidths,
      rowHeights: args.rowHeights,
      mergedCells: args.mergedCells,
    });
    const estimatedSizeBytes = dataStr.length * 2; // Approximate UTF-16 size

    // Store inline (all sheets stored inline for simplicity)
    const inlineData = {
      data: args.data,
      styles: args.styles,
      formulas: args.formulas,
      columnWidths: args.columnWidths,
      rowHeights: args.rowHeights,
      mergedCells: args.mergedCells,
    };

    const sheetId = await ctx.db.insert("templateSheets", {
      templateId: args.templateId,
      name: args.name,
      order: args.order,
      type: args.type,
      groupId: args.groupId,
      inlineData,
      dataStorageId: undefined,
      dimensions: { rows, cols },
      hasFormulas,
      hasStyles,
      hasMergedCells,
      estimatedSizeBytes,
      createdAt: now,
      updatedAt: now,
    });

    return sheetId;
  },
});

/**
 * Batch create multiple sheets at once
 * Optimized for template upload
 */
export const batchCreate = mutation({
  args: {
    templateId: v.id("templateDefinitions"),
    sheets: v.array(v.object({
      name: v.string(),
      order: v.number(),
      type: v.union(v.literal("core"), v.literal("dynamic")),
      groupId: v.optional(v.string()),
      data: v.any(),
      styles: v.optional(v.any()),
      formulas: v.optional(v.any()),
      columnWidths: v.optional(v.any()),
      rowHeights: v.optional(v.any()),
      mergedCells: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    const now = new Date().toISOString();
    const sheetIds: Id<"templateSheets">[] = [];
    const coreSheetIds: Id<"templateSheets">[] = [];
    const dynamicSheetsByGroup: Record<string, Id<"templateSheets">[]> = {};

    for (const sheetData of args.sheets) {
      // Calculate dimensions
      const rows = sheetData.data?.length || 0;
      const cols = sheetData.data?.[0]?.length || 0;

      // Check features
      const hasFormulas = sheetData.formulas && Object.keys(sheetData.formulas).length > 0;
      const hasStyles = sheetData.styles && Object.keys(sheetData.styles).length > 0;
      const hasMergedCells = sheetData.mergedCells && sheetData.mergedCells.length > 0;

      // Estimate size
      const dataStr = JSON.stringify({
        data: sheetData.data,
        styles: sheetData.styles,
        formulas: sheetData.formulas,
        columnWidths: sheetData.columnWidths,
        rowHeights: sheetData.rowHeights,
        mergedCells: sheetData.mergedCells,
      });
      const estimatedSizeBytes = dataStr.length * 2;

      // Store inline
      const inlineData = {
        data: sheetData.data,
        styles: sheetData.styles,
        formulas: sheetData.formulas,
        columnWidths: sheetData.columnWidths,
        rowHeights: sheetData.rowHeights,
        mergedCells: sheetData.mergedCells,
      };

      const sheetId = await ctx.db.insert("templateSheets", {
        templateId: args.templateId,
        name: sheetData.name,
        order: sheetData.order,
        type: sheetData.type,
        groupId: sheetData.groupId,
        inlineData,
        dataStorageId: undefined,
        dimensions: { rows, cols },
        hasFormulas,
        hasStyles,
        hasMergedCells,
        estimatedSizeBytes,
        createdAt: now,
        updatedAt: now,
      });

      sheetIds.push(sheetId);

      // Track core vs dynamic sheets
      if (sheetData.type === "core") {
        coreSheetIds.push(sheetId);
      } else if (sheetData.groupId) {
        if (!dynamicSheetsByGroup[sheetData.groupId]) {
          dynamicSheetsByGroup[sheetData.groupId] = [];
        }
        dynamicSheetsByGroup[sheetData.groupId].push(sheetId);
      }
    }

    return {
      sheetIds,
      coreSheetIds,
      dynamicSheetsByGroup,
    };
  },
});

/**
 * Update sheet metadata (not data)
 */
export const updateMetadata = mutation({
  args: {
    sheetId: v.id("templateSheets"),
    name: v.optional(v.string()),
    order: v.optional(v.number()),
    type: v.optional(v.union(v.literal("core"), v.literal("dynamic"))),
    groupId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet) {
      throw new Error("Sheet not found");
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.order !== undefined) updates.order = args.order;
    if (args.type !== undefined) updates.type = args.type;
    if (args.groupId !== undefined) updates.groupId = args.groupId;

    await ctx.db.patch(args.sheetId, updates);
    return args.sheetId;
  },
});

/**
 * Update sheet data
 */
export const updateData = mutation({
  args: {
    sheetId: v.id("templateSheets"),
    data: v.any(),
    styles: v.optional(v.any()),
    formulas: v.optional(v.any()),
    columnWidths: v.optional(v.any()),
    rowHeights: v.optional(v.any()),
    mergedCells: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet) {
      throw new Error("Sheet not found");
    }

    const now = new Date().toISOString();

    // Calculate new dimensions
    const rows = args.data?.length || 0;
    const cols = args.data?.[0]?.length || 0;

    // Check features
    const hasFormulas = args.formulas && Object.keys(args.formulas).length > 0;
    const hasStyles = args.styles && Object.keys(args.styles).length > 0;
    const hasMergedCells = args.mergedCells && args.mergedCells.length > 0;

    // Estimate size
    const dataStr = JSON.stringify({
      data: args.data,
      styles: args.styles,
      formulas: args.formulas,
      columnWidths: args.columnWidths,
      rowHeights: args.rowHeights,
      mergedCells: args.mergedCells,
    });
    const estimatedSizeBytes = dataStr.length * 2;

    // Clean up old storage if exists
    if (sheet.dataStorageId) {
      await ctx.storage.delete(sheet.dataStorageId);
    }

    // Store inline
    const inlineData = {
      data: args.data,
      styles: args.styles,
      formulas: args.formulas,
      columnWidths: args.columnWidths,
      rowHeights: args.rowHeights,
      mergedCells: args.mergedCells,
    };

    await ctx.db.patch(args.sheetId, {
      inlineData,
      dataStorageId: undefined,
      dimensions: { rows, cols },
      hasFormulas,
      hasStyles,
      hasMergedCells,
      estimatedSizeBytes,
      updatedAt: now,
    });

    return args.sheetId;
  },
});

/**
 * Delete a single sheet
 */
export const deleteSheet = mutation({
  args: {
    sheetId: v.id("templateSheets"),
  },
  handler: async (ctx, args) => {
    const sheet = await ctx.db.get(args.sheetId);
    if (!sheet) {
      throw new Error("Sheet not found");
    }

    // Delete file storage if exists
    if (sheet.dataStorageId) {
      await ctx.storage.delete(sheet.dataStorageId);
    }

    await ctx.db.delete(args.sheetId);
    return { deleted: true };
  },
});

/**
 * Clone a sheet (for dynamic sheet generation)
 * Creates a copy with name replacement
 */
export const cloneSheet = mutation({
  args: {
    sourceSheetId: v.id("templateSheets"),
    newTemplateId: v.optional(v.id("templateDefinitions")), // If cloning to different template
    newName: v.string(),
    newOrder: v.number(),
    replacements: v.optional(v.array(v.object({
      find: v.string(),
      replace: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    const sourceSheet = await ctx.db.get(args.sourceSheetId);
    if (!sourceSheet) {
      throw new Error("Source sheet not found");
    }

    const now = new Date().toISOString();
    const targetTemplateId = args.newTemplateId || sourceSheet.templateId;

    // Get source data
    let sheetData = sourceSheet.inlineData;
    
    if (!sheetData && sourceSheet.dataStorageId) {
      // Fetch from storage
      const url = await ctx.storage.getUrl(sourceSheet.dataStorageId);
      if (url) {
        const response = await fetch(url);
        sheetData = await response.json();
      }
    }

    if (!sheetData) {
      throw new Error("Source sheet has no data");
    }

    // Apply replacements to formulas if any
    let newFormulas = sheetData.formulas;
    if (args.replacements && newFormulas) {
      const formulasStr = JSON.stringify(newFormulas);
      let result = formulasStr;
      for (const { find, replace } of args.replacements) {
        result = result.split(find).join(replace);
      }
      newFormulas = JSON.parse(result);
    }

    // Apply replacements to data (cell values) if any
    let newData = sheetData.data;
    if (args.replacements && newData) {
      const dataStr = JSON.stringify(newData);
      let result = dataStr;
      for (const { find, replace } of args.replacements) {
        result = result.split(find).join(replace);
      }
      newData = JSON.parse(result);
    }

    // Calculate size
    const dataStr = JSON.stringify({
      data: newData,
      styles: sheetData.styles,
      formulas: newFormulas,
      columnWidths: sheetData.columnWidths,
      rowHeights: sheetData.rowHeights,
      mergedCells: sheetData.mergedCells,
    });
    const estimatedSizeBytes = dataStr.length * 2;

    // Store inline
    const inlineData = {
      data: newData,
      styles: sheetData.styles,
      formulas: newFormulas,
      columnWidths: sheetData.columnWidths,
      rowHeights: sheetData.rowHeights,
      mergedCells: sheetData.mergedCells,
    };

    const newSheetId = await ctx.db.insert("templateSheets", {
      templateId: targetTemplateId,
      name: args.newName,
      order: args.newOrder,
      type: "core", // Cloned sheets become core (no longer templates)
      groupId: undefined, // Clear group ID
      inlineData,
      dataStorageId: undefined,
      dimensions: sourceSheet.dimensions,
      hasFormulas: sourceSheet.hasFormulas,
      hasStyles: sourceSheet.hasStyles,
      hasMergedCells: sourceSheet.hasMergedCells,
      estimatedSizeBytes,
      createdAt: now,
      updatedAt: now,
    });

    return newSheetId;
  },
});

