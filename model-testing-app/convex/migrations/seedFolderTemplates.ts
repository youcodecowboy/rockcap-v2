import { internalMutation } from "../_generated/server";

/**
 * Migration: Seed Default Folder Templates
 * 
 * Creates default folder templates for Borrower and Lender client types.
 * Each template defines the folder structure for client-level and project-level folders.
 * 
 * Run with: npx convex run migrations/seedFolderTemplates:seedFolderTemplates
 */

// Borrower client-level folders
const BORROWER_CLIENT_FOLDERS = [
  { name: "Background", folderKey: "background", order: 1, description: "Parent folder for KYC and background documents" },
  { name: "KYC", folderKey: "kyc", parentKey: "background", order: 2, description: "Know Your Customer documents" },
  { name: "Background Docs", folderKey: "background_docs", parentKey: "background", order: 3, description: "Background documentation" },
  { name: "Miscellaneous", folderKey: "miscellaneous", order: 4, description: "Unclassified or pending files" },
];

// Borrower project-level folders
const BORROWER_PROJECT_FOLDERS = [
  { name: "Background", folderKey: "background", order: 1, description: "Project background documents" },
  { name: "Terms Comparison", folderKey: "terms_comparison", order: 2, description: "Loan term comparisons and analysis" },
  { name: "Terms Request", folderKey: "terms_request", order: 3, description: "Term requests and negotiations" },
  { name: "Credit Submission", folderKey: "credit_submission", order: 4, description: "Credit application and submission documents" },
  { name: "Post-completion Documents", folderKey: "post_completion", order: 5, description: "Documents after project completion" },
  { name: "Appraisals", folderKey: "appraisals", order: 6, description: "Property valuations and appraisals" },
  { name: "Notes", folderKey: "notes", order: 7, description: "Internal notes and memos" },
  { name: "Operational Model", folderKey: "operational_model", order: 8, description: "Financial and operational models" },
];

// Lender client-level folders
const LENDER_CLIENT_FOLDERS = [
  { name: "KYC", folderKey: "kyc", order: 1, description: "Know Your Customer documents" },
  { name: "Agreements", folderKey: "agreements", order: 2, description: "Master agreements and contracts" },
  { name: "Correspondence", folderKey: "correspondence", order: 3, description: "General correspondence" },
  { name: "Miscellaneous", folderKey: "miscellaneous", order: 4, description: "Unclassified or pending files" },
];

// Lender project-level folders
const LENDER_PROJECT_FOLDERS = [
  { name: "Term Sheets", folderKey: "term_sheets", order: 1, description: "Loan term sheets" },
  { name: "Facility Documents", folderKey: "facility_documents", order: 2, description: "Facility agreements and documents" },
  { name: "Security Documents", folderKey: "security_documents", order: 3, description: "Security and collateral documents" },
  { name: "Drawdown Requests", folderKey: "drawdown_requests", order: 4, description: "Drawdown requests and approvals" },
  { name: "Monitoring Reports", folderKey: "monitoring_reports", order: 5, description: "Progress and monitoring reports" },
  { name: "Correspondence", folderKey: "correspondence", order: 6, description: "Project-specific correspondence" },
  { name: "Miscellaneous", folderKey: "miscellaneous", order: 7, description: "Unclassified or pending files" },
];

export const seedFolderTemplates = internalMutation({
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const results = {
      templatesCreated: 0,
      templatesSkipped: 0,
    };

    // Check if templates already exist
    const existingTemplates = await ctx.db.query("folderTemplates").collect();
    if (existingTemplates.length > 0) {
      console.log("Folder templates already exist, clearing them first...");
      for (const template of existingTemplates) {
        await ctx.db.delete(template._id);
      }
    }

    // Create Borrower client-level template
    await ctx.db.insert("folderTemplates", {
      clientType: "borrower",
      level: "client",
      folders: BORROWER_CLIENT_FOLDERS,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    results.templatesCreated++;
    console.log("Created Borrower client-level folder template");

    // Create Borrower project-level template
    await ctx.db.insert("folderTemplates", {
      clientType: "borrower",
      level: "project",
      folders: BORROWER_PROJECT_FOLDERS,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    results.templatesCreated++;
    console.log("Created Borrower project-level folder template");

    // Create Lender client-level template
    await ctx.db.insert("folderTemplates", {
      clientType: "lender",
      level: "client",
      folders: LENDER_CLIENT_FOLDERS,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    results.templatesCreated++;
    console.log("Created Lender client-level folder template");

    // Create Lender project-level template
    await ctx.db.insert("folderTemplates", {
      clientType: "lender",
      level: "project",
      folders: LENDER_PROJECT_FOLDERS,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });
    results.templatesCreated++;
    console.log("Created Lender project-level folder template");

    console.log("=== Folder Templates Seeding Complete ===");
    console.log(JSON.stringify(results, null, 2));

    return results;
  },
});
