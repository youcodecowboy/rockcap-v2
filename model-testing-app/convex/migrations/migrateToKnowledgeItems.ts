/**
 * Migration: Convert existing intelligence data to knowledge items
 *
 * This migration reads from clientIntelligence and projectIntelligence tables
 * and creates corresponding entries in the new knowledgeItems table using
 * canonical field paths.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// Type for value inference
type ValueType = "string" | "number" | "currency" | "date" | "percentage" | "array" | "text" | "boolean";

// Helper to infer value type
function inferValueType(value: unknown, fieldPath: string): ValueType {
  if (value === null || value === undefined) return "string";

  if (Array.isArray(value)) return "array";

  if (typeof value === "boolean") return "boolean";

  if (typeof value === "number") {
    // Check if it's a currency field
    if (
      fieldPath.includes("cost") ||
      fieldPath.includes("value") ||
      fieldPath.includes("price") ||
      fieldPath.includes("amount") ||
      fieldPath.includes("worth") ||
      fieldPath.includes("assets") ||
      fieldPath.includes("gdv") ||
      fieldPath.includes("loan")
    ) {
      return "currency";
    }
    // Check if it's a percentage
    if (
      fieldPath.includes("ltv") ||
      fieldPath.includes("ltc") ||
      fieldPath.includes("margin") ||
      fieldPath.includes("rate") ||
      fieldPath.includes("percentage")
    ) {
      return "percentage";
    }
    return "number";
  }

  if (typeof value === "string") {
    // Check if it looks like a date
    if (fieldPath.includes("date") || fieldPath.includes("Date") || /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return "date";
    }
    // Check if it's a long text
    if (value.length > 200) return "text";
    return "string";
  }

  return "string";
}

// Helper to get category from field path
function getCategoryFromPath(fieldPath: string): string {
  const parts = fieldPath.split(".");
  return parts[0] || "custom";
}

// Helper to get human-readable label from field path
function getLabelFromPath(fieldPath: string): string {
  const parts = fieldPath.split(".");
  const lastPart = parts[parts.length - 1];

  // Convert camelCase to Title Case with spaces
  return lastPart
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Mapping from old client intelligence paths to new canonical paths
const CLIENT_FIELD_MAPPING: Record<string, string> = {
  // identity → company
  "identity.legalName": "company.name",
  "identity.tradingName": "company.tradingName",
  "identity.companyNumber": "company.registrationNumber",
  "identity.vatNumber": "company.vatNumber",
  "identity.incorporationDate": "company.incorporationDate",

  // primaryContact → contact
  "primaryContact.name": "contact.primaryName",
  "primaryContact.email": "contact.email",
  "primaryContact.phone": "contact.phone",
  "primaryContact.role": "contact.role",

  // addresses → company/contact
  "addresses.registered": "company.registeredAddress",
  "addresses.trading": "company.tradingAddress",
  "addresses.correspondence": "contact.personalAddress",

  // banking → financial
  "banking.bankName": "financial.bankName",

  // borrowerProfile → financial/experience
  "borrowerProfile.experienceLevel": "experience.level",
  "borrowerProfile.completedProjects": "experience.projectsCompleted",
  "borrowerProfile.totalDevelopmentValue": "experience.totalGDV",
  "borrowerProfile.netWorth": "financial.netWorth",
  "borrowerProfile.liquidAssets": "financial.liquidAssets",
};

// Mapping from old project intelligence paths to new canonical paths
const PROJECT_FIELD_MAPPING: Record<string, string> = {
  // overview → overview
  "overview.projectType": "overview.projectType",
  "overview.assetClass": "overview.assetClass",
  "overview.description": "overview.description",

  // location → location
  "location.siteAddress": "location.siteAddress",
  "location.postcode": "location.postcode",
  "location.localAuthority": "location.localAuthority",

  // financials → financials
  "financials.purchasePrice": "financials.purchasePrice",
  "financials.totalDevelopmentCost": "financials.totalDevelopmentCost",
  "financials.grossDevelopmentValue": "financials.gdv",
  "financials.profit": "financials.profit",
  "financials.profitMargin": "financials.profitMargin",
  "financials.loanAmount": "financials.loanAmount",
  "financials.ltv": "financials.ltv",
  "financials.ltgdv": "financials.ltc",

  // timeline → timeline
  "timeline.acquisitionDate": "timeline.acquisitionDate",
  "timeline.planningSubmissionDate": "timeline.planningSubmissionDate",
  "timeline.planningApprovalDate": "timeline.planningApprovalDate",
  "timeline.constructionStartDate": "timeline.constructionStart",
  "timeline.practicalCompletionDate": "timeline.practicalCompletion",

  // development → overview
  "development.totalUnits": "overview.unitCount",
  "development.totalSqFt": "overview.totalSqft",
  "development.planningStatus": "timeline.planningStatus",
};

// Helper to flatten nested objects
function flattenObject(
  obj: Record<string, unknown>,
  prefix = ""
): Array<{ path: string; value: unknown }> {
  const result: Array<{ path: string; value: unknown }> = [];

  for (const [key, value] of Object.entries(obj)) {
    const newPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && value !== undefined) {
      if (typeof value === "object" && !Array.isArray(value)) {
        // Recurse into nested objects
        result.push(...flattenObject(value as Record<string, unknown>, newPath));
      } else {
        result.push({ path: newPath, value });
      }
    }
  }

  return result;
}

// Migrate a single client's intelligence to knowledge items
export const migrateClientIntelligence = mutation({
  args: {
    clientId: v.id("clients"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const results = { added: 0, skipped: 0, errors: [] as string[] };

    // Get the client intelligence record
    const intelligence = await ctx.db
      .query("clientIntelligence")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .first();

    if (!intelligence) {
      return { success: true, message: "No intelligence found for client", ...results };
    }

    // Flatten all the nested fields
    const fieldsToProcess: Array<{ oldPath: string; value: unknown }> = [];

    // Process identity
    if (intelligence.identity) {
      flattenObject(intelligence.identity, "identity").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process primaryContact
    if (intelligence.primaryContact) {
      flattenObject(intelligence.primaryContact, "primaryContact").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process addresses
    if (intelligence.addresses) {
      flattenObject(intelligence.addresses, "addresses").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process banking
    if (intelligence.banking) {
      flattenObject(intelligence.banking, "banking").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process borrowerProfile
    if (intelligence.borrowerProfile) {
      flattenObject(intelligence.borrowerProfile, "borrowerProfile").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Also process evidence trail if available
    if (intelligence.evidenceTrail) {
      for (const evidence of intelligence.evidenceTrail) {
        if (!fieldsToProcess.some((f) => f.oldPath === evidence.fieldPath)) {
          fieldsToProcess.push({ oldPath: evidence.fieldPath, value: evidence.value });
        }
      }
    }

    // Also process extracted attributes
    if (intelligence.extractedAttributes) {
      for (const attr of intelligence.extractedAttributes) {
        fieldsToProcess.push({ oldPath: `custom.${attr.key}`, value: attr.value });
      }
    }

    // Convert to knowledge items
    for (const field of fieldsToProcess) {
      // Skip empty values
      if (field.value === null || field.value === undefined || field.value === "") {
        results.skipped++;
        continue;
      }

      // Map to canonical path
      const canonicalPath = CLIENT_FIELD_MAPPING[field.oldPath] || `custom.${field.oldPath.replace(/\./g, "_")}`;
      const isCanonical = CLIENT_FIELD_MAPPING[field.oldPath] !== undefined;
      const category = getCategoryFromPath(canonicalPath);
      const label = getLabelFromPath(canonicalPath);
      const valueType = inferValueType(field.value, canonicalPath);

      // Check if item already exists
      const existing = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_client_field", (q) =>
          q.eq("clientId", args.clientId).eq("fieldPath", canonicalPath)
        )
        .first();

      if (existing) {
        results.skipped++;
        continue;
      }

      if (!args.dryRun) {
        try {
          await ctx.db.insert("knowledgeItems", {
            clientId: args.clientId,
            fieldPath: canonicalPath,
            isCanonical,
            category,
            label,
            value: field.value,
            valueType,
            sourceType: "ai_extraction",
            originalLabel: field.oldPath,
            status: "active",
            addedAt: now,
            updatedAt: now,
            addedBy: "migration",
          });
          results.added++;
        } catch (error) {
          results.errors.push(`Failed to add ${canonicalPath}: ${error}`);
        }
      } else {
        results.added++;
      }
    }

    return {
      success: true,
      message: args.dryRun ? "Dry run completed" : "Migration completed",
      ...results,
    };
  },
});

// Migrate a single project's intelligence to knowledge items
export const migrateProjectIntelligence = mutation({
  args: {
    projectId: v.id("projects"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    const results = { added: 0, skipped: 0, errors: [] as string[] };

    // Get the project intelligence record
    const intelligence = await ctx.db
      .query("projectIntelligence")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!intelligence) {
      return { success: true, message: "No intelligence found for project", ...results };
    }

    // Flatten all the nested fields
    const fieldsToProcess: Array<{ oldPath: string; value: unknown }> = [];

    // Process overview
    if (intelligence.overview) {
      flattenObject(intelligence.overview, "overview").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process location
    if (intelligence.location) {
      flattenObject(intelligence.location, "location").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process financials
    if (intelligence.financials) {
      flattenObject(intelligence.financials, "financials").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process timeline
    if (intelligence.timeline) {
      flattenObject(intelligence.timeline, "timeline").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Process development
    if (intelligence.development) {
      flattenObject(intelligence.development, "development").forEach((f) =>
        fieldsToProcess.push({ oldPath: f.path, value: f.value })
      );
    }

    // Also process evidence trail if available
    if (intelligence.evidenceTrail) {
      for (const evidence of intelligence.evidenceTrail) {
        if (!fieldsToProcess.some((f) => f.oldPath === evidence.fieldPath)) {
          fieldsToProcess.push({ oldPath: evidence.fieldPath, value: evidence.value });
        }
      }
    }

    // Also process extracted attributes
    if (intelligence.extractedAttributes) {
      for (const attr of intelligence.extractedAttributes) {
        fieldsToProcess.push({ oldPath: `custom.${attr.key}`, value: attr.value });
      }
    }

    // Convert to knowledge items
    for (const field of fieldsToProcess) {
      // Skip empty values
      if (field.value === null || field.value === undefined || field.value === "") {
        results.skipped++;
        continue;
      }

      // Map to canonical path
      const canonicalPath = PROJECT_FIELD_MAPPING[field.oldPath] || `custom.${field.oldPath.replace(/\./g, "_")}`;
      const isCanonical = PROJECT_FIELD_MAPPING[field.oldPath] !== undefined;
      const category = getCategoryFromPath(canonicalPath);
      const label = getLabelFromPath(canonicalPath);
      const valueType = inferValueType(field.value, canonicalPath);

      // Check if item already exists
      const existing = await ctx.db
        .query("knowledgeItems")
        .withIndex("by_project_field", (q) =>
          q.eq("projectId", args.projectId).eq("fieldPath", canonicalPath)
        )
        .first();

      if (existing) {
        results.skipped++;
        continue;
      }

      if (!args.dryRun) {
        try {
          await ctx.db.insert("knowledgeItems", {
            projectId: args.projectId,
            fieldPath: canonicalPath,
            isCanonical,
            category,
            label,
            value: field.value,
            valueType,
            sourceType: "ai_extraction",
            originalLabel: field.oldPath,
            status: "active",
            addedAt: now,
            updatedAt: now,
            addedBy: "migration",
          });
          results.added++;
        } catch (error) {
          results.errors.push(`Failed to add ${canonicalPath}: ${error}`);
        }
      } else {
        results.added++;
      }
    }

    return {
      success: true,
      message: args.dryRun ? "Dry run completed" : "Migration completed",
      ...results,
    };
  },
});

// Migrate all clients and projects
export const migrateAllIntelligence = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const results = {
      clientsMigrated: 0,
      projectsMigrated: 0,
      itemsAdded: 0,
      itemsSkipped: 0,
      errors: [] as string[],
    };

    // Get all client intelligence records
    const clientIntelligence = await ctx.db.query("clientIntelligence").take(limit);

    for (const intel of clientIntelligence) {
      try {
        // Check if already migrated
        const existing = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_client", (q) => q.eq("clientId", intel.clientId))
          .first();

        if (existing) {
          continue;
        }

        // Run migration for this client (we can't call mutations from mutations,
        // so we'll inline the logic here in a production scenario)
        // For now, just count what needs to be done
        results.clientsMigrated++;
      } catch (error) {
        results.errors.push(`Client ${intel.clientId}: ${error}`);
      }
    }

    // Get all project intelligence records
    const projectIntelligence = await ctx.db.query("projectIntelligence").take(limit);

    for (const intel of projectIntelligence) {
      try {
        const existing = await ctx.db
          .query("knowledgeItems")
          .withIndex("by_project", (q) => q.eq("projectId", intel.projectId))
          .first();

        if (existing) {
          continue;
        }

        results.projectsMigrated++;
      } catch (error) {
        results.errors.push(`Project ${intel.projectId}: ${error}`);
      }
    }

    return {
      success: true,
      message: args.dryRun
        ? `Dry run: Would migrate ${results.clientsMigrated} clients and ${results.projectsMigrated} projects`
        : `Migration summary: ${results.clientsMigrated} clients, ${results.projectsMigrated} projects identified`,
      ...results,
    };
  },
});
