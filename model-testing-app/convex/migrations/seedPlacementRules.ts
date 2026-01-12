import { internalMutation } from "../_generated/server";

/**
 * Migration: Seed Default Document Placement Rules
 * 
 * Creates default rules for mapping document types to target folders.
 * Rules are specific to each client type (borrower vs lender).
 * 
 * Run with: npx convex run migrations/seedPlacementRules:seedPlacementRules
 */

// Borrower document placement rules
const BORROWER_RULES = [
  // Appraisals (project level)
  { documentType: "Red Book Valuation", category: "Appraisals", targetFolderKey: "appraisals", targetLevel: "project", priority: 100 },
  { documentType: "RICS Valuation", category: "Appraisals", targetFolderKey: "appraisals", targetLevel: "project", priority: 100 },
  { documentType: "Report", category: "Appraisals", targetFolderKey: "appraisals", targetLevel: "project", priority: 50 },
  
  // Terms (project level)
  { documentType: "Term Sheet", category: "Terms", targetFolderKey: "terms_comparison", targetLevel: "project", priority: 100 },
  
  // Credit (project level)
  { documentType: "Credit Memo", category: "Credit", targetFolderKey: "credit_submission", targetLevel: "project", priority: 100 },
  
  // Financial (project level)
  { documentType: "Operating Statement", category: "Financial", targetFolderKey: "operational_model", targetLevel: "project", priority: 100 },
  { documentType: "Financial Model", category: "Financial", targetFolderKey: "operational_model", targetLevel: "project", priority: 100 },
  
  // Legal/Contracts (project level - background)
  { documentType: "Contract", category: "Legal", targetFolderKey: "background", targetLevel: "project", priority: 80 },
  { documentType: "Agreement", category: "Legal", targetFolderKey: "background", targetLevel: "project", priority: 80 },
  
  // KYC (client level)
  { documentType: "KYC Document", category: "KYC", targetFolderKey: "kyc", targetLevel: "client", priority: 100 },
  
  // Correspondence (project level - notes)
  { documentType: "Correspondence", category: "Correspondence", targetFolderKey: "notes", targetLevel: "project", priority: 60 },
  { documentType: "Invoice", category: "Financial", targetFolderKey: "post_completion", targetLevel: "project", priority: 50 },
  
  // Notes (project level)
  { documentType: "Note", category: "Notes", targetFolderKey: "notes", targetLevel: "project", priority: 100 },
  
  // Default fallback
  { documentType: "Other", category: "Other", targetFolderKey: "miscellaneous", targetLevel: "client", priority: 1 },
];

// Lender document placement rules
const LENDER_RULES = [
  // Term Sheets (project level)
  { documentType: "Term Sheet", category: "Terms", targetFolderKey: "term_sheets", targetLevel: "project", priority: 100 },
  
  // Facility Documents (project level)
  { documentType: "Contract", category: "Legal", targetFolderKey: "facility_documents", targetLevel: "project", priority: 80 },
  { documentType: "Agreement", category: "Legal", targetFolderKey: "facility_documents", targetLevel: "project", priority: 80 },
  
  // Security Documents (project level)
  { documentType: "Red Book Valuation", category: "Appraisals", targetFolderKey: "security_documents", targetLevel: "project", priority: 100 },
  { documentType: "RICS Valuation", category: "Appraisals", targetFolderKey: "security_documents", targetLevel: "project", priority: 100 },
  
  // Monitoring Reports (project level)
  { documentType: "Report", category: "Appraisals", targetFolderKey: "monitoring_reports", targetLevel: "project", priority: 50 },
  { documentType: "Operating Statement", category: "Financial", targetFolderKey: "monitoring_reports", targetLevel: "project", priority: 80 },
  { documentType: "Financial Model", category: "Financial", targetFolderKey: "monitoring_reports", targetLevel: "project", priority: 80 },
  
  // Credit (project level - facility documents)
  { documentType: "Credit Memo", category: "Credit", targetFolderKey: "facility_documents", targetLevel: "project", priority: 90 },
  
  // KYC (client level)
  { documentType: "KYC Document", category: "KYC", targetFolderKey: "kyc", targetLevel: "client", priority: 100 },
  
  // Correspondence (project level)
  { documentType: "Correspondence", category: "Correspondence", targetFolderKey: "correspondence", targetLevel: "project", priority: 100 },
  
  // Notes (project level - correspondence)
  { documentType: "Note", category: "Notes", targetFolderKey: "correspondence", targetLevel: "project", priority: 60 },
  
  // Invoice (project level - drawdown)
  { documentType: "Invoice", category: "Financial", targetFolderKey: "drawdown_requests", targetLevel: "project", priority: 50 },
  
  // Default fallback
  { documentType: "Other", category: "Other", targetFolderKey: "miscellaneous", targetLevel: "project", priority: 1 },
];

export const seedPlacementRules = internalMutation({
  handler: async (ctx) => {
    const now = new Date().toISOString();
    const results = {
      borrowerRulesCreated: 0,
      lenderRulesCreated: 0,
      rulesCleared: 0,
    };

    // Clear existing rules
    const existingRules = await ctx.db.query("documentPlacementRules").collect();
    if (existingRules.length > 0) {
      console.log("Clearing existing placement rules...");
      for (const rule of existingRules) {
        await ctx.db.delete(rule._id);
        results.rulesCleared++;
      }
    }

    // Create Borrower rules
    for (const rule of BORROWER_RULES) {
      await ctx.db.insert("documentPlacementRules", {
        clientType: "borrower",
        documentType: rule.documentType,
        category: rule.category,
        targetFolderKey: rule.targetFolderKey,
        targetLevel: rule.targetLevel as "client" | "project",
        priority: rule.priority,
        description: `Default rule: ${rule.documentType} files to ${rule.targetFolderKey}`,
        createdAt: now,
        updatedAt: now,
      });
      results.borrowerRulesCreated++;
    }
    console.log(`Created ${results.borrowerRulesCreated} Borrower placement rules`);

    // Create Lender rules
    for (const rule of LENDER_RULES) {
      await ctx.db.insert("documentPlacementRules", {
        clientType: "lender",
        documentType: rule.documentType,
        category: rule.category,
        targetFolderKey: rule.targetFolderKey,
        targetLevel: rule.targetLevel as "client" | "project",
        priority: rule.priority,
        description: `Default rule: ${rule.documentType} files to ${rule.targetFolderKey}`,
        createdAt: now,
        updatedAt: now,
      });
      results.lenderRulesCreated++;
    }
    console.log(`Created ${results.lenderRulesCreated} Lender placement rules`);

    console.log("=== Placement Rules Seeding Complete ===");
    console.log(JSON.stringify(results, null, 2));

    return results;
  },
});
