import { mutation } from "../_generated/server";

/**
 * Seed Knowledge Library Requirement Templates
 * 
 * This migration seeds the default document requirement templates for different client types.
 * Starting with the "borrower" client type based on RockCap's requirements.
 * 
 * Run with: npx convex run migrations/seedKnowledgeTemplates:seed
 */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();
    
    // Check if templates already exist for borrower
    const existingBorrower = await ctx.db
      .query("knowledgeRequirementTemplates")
      .withIndex("by_client_type", (q) => q.eq("clientType", "borrower"))
      .first();
    
    if (existingBorrower) {
      console.log("Borrower templates already exist, skipping seed");
      return { success: true, message: "Templates already exist", created: 0 };
    }

    // =========================================================================
    // BORROWER - CLIENT-LEVEL REQUIREMENTS (KYC)
    // =========================================================================
    const borrowerClientRequirements = [
      {
        id: "kyc-proof-of-address",
        name: "Certified Proof of Address",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Certified document proving the client's registered business address. Must be dated within the last 3 months.",
        matchingDocumentTypes: ["Proof of Address", "Utility Bill", "Bank Statement", "KYC Document"],
        order: 1,
      },
      {
        id: "kyc-proof-of-id",
        name: "Certified Proof of ID",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Certified government-issued identification document for key principals/directors.",
        matchingDocumentTypes: ["Proof of ID", "Passport", "Driver's License", "ID Document", "KYC Document"],
        order: 2,
      },
      {
        id: "kyc-business-bank-statements",
        name: "Business Bank Statements (3 months)",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Last 3 months of business bank account statements showing trading activity and cash flow.",
        matchingDocumentTypes: ["Bank Statement", "Financial Statement", "KYC Document"],
        order: 3,
      },
      {
        id: "kyc-personal-bank-statements",
        name: "Personal Bank Statements (3 months)",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Last 3 months of personal bank account statements for key principals/guarantors.",
        matchingDocumentTypes: ["Bank Statement", "Financial Statement", "KYC Document"],
        order: 4,
      },
      {
        id: "kyc-track-record-excel",
        name: "Track Record - Excel Version",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Developer track record spreadsheet showing previous projects, completion dates, and outcomes.",
        matchingDocumentTypes: ["Track Record", "Spreadsheet", "Financial Model"],
        order: 5,
      },
      {
        id: "kyc-track-record-word",
        name: "Track Record - Word Version",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Developer track record document with detailed project descriptions and references.",
        matchingDocumentTypes: ["Track Record", "CV", "Resume", "Background Document"],
        order: 6,
      },
      {
        id: "kyc-assets-liabilities",
        name: "Assets & Liabilities Statement",
        category: "KYC",
        phaseRequired: "credit_submission" as const,
        priority: "required" as const,
        description: "Personal statement of assets and liabilities for key principals/guarantors.",
        matchingDocumentTypes: ["Assets & Liabilities", "Net Worth Statement", "Financial Statement", "KYC Document"],
        order: 7,
      },
    ];

    // =========================================================================
    // BORROWER - PROJECT-LEVEL REQUIREMENTS
    // =========================================================================
    const borrowerProjectRequirements = [
      // Project/Deal Information - Required for Indicative Terms
      {
        id: "project-appraisal",
        name: "Appraisal",
        category: "Project Information",
        phaseRequired: "indicative_terms" as const,
        priority: "required" as const,
        description: "Initial project appraisal or feasibility study showing development costs, GDV, and projected returns.",
        matchingDocumentTypes: ["Appraisal", "Feasibility Study", "Development Appraisal", "Financial Model"],
        order: 1,
      },
      {
        id: "project-floorplans",
        name: "Floorplans",
        category: "Project Plans",
        phaseRequired: "indicative_terms" as const,
        priority: "required" as const,
        description: "Architectural floorplans showing layout, dimensions, and room configurations for all units.",
        matchingDocumentTypes: ["Floorplan", "Floor Plan", "Architectural Plan", "Plans"],
        order: 2,
      },
      {
        id: "project-elevations",
        name: "Elevations",
        category: "Project Plans",
        phaseRequired: "indicative_terms" as const,
        priority: "required" as const,
        description: "Architectural elevation drawings showing the external appearance from all sides.",
        matchingDocumentTypes: ["Elevation", "Architectural Plan", "Plans"],
        order: 3,
      },
      {
        id: "project-site-plan",
        name: "Site Plan",
        category: "Project Plans",
        phaseRequired: "indicative_terms" as const,
        priority: "required" as const,
        description: "Site plan showing the building footprint, access, parking, and landscaping within the site boundary.",
        matchingDocumentTypes: ["Site Plan", "Site Layout", "Plans"],
        order: 4,
      },
      {
        id: "project-site-location-plan",
        name: "Site Location Plan",
        category: "Project Plans",
        phaseRequired: "indicative_terms" as const,
        priority: "required" as const,
        description: "Location plan showing the site in context with surrounding area, typically at 1:1250 or 1:2500 scale.",
        matchingDocumentTypes: ["Location Plan", "Site Location", "Plans"],
        order: 5,
      },
      {
        id: "project-planning-decision",
        name: "Planning Decision Notice",
        category: "Project Information",
        phaseRequired: "credit_submission" as const,
        priority: "nice_to_have" as const,
        description: "Official planning permission decision notice from the local authority. Nice to have for terms request, required for credit submission.",
        matchingDocumentTypes: ["Planning Decision", "Planning Permission", "Decision Notice", "Planning Document"],
        order: 6,
      },
      {
        id: "project-scheme-brief",
        name: "Scheme Brief / Background",
        category: "Project Information",
        phaseRequired: "indicative_terms" as const,
        priority: "nice_to_have" as const,
        description: "Project background document describing the development concept, target market, and key features.",
        matchingDocumentTypes: ["Scheme Brief", "Project Brief", "Background", "Executive Summary"],
        order: 7,
      },
      
      // Professional Reports - Post Credit Submission
      {
        id: "project-valuation",
        name: "Valuation Report",
        category: "Professional Reports",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "RICS Red Book valuation report prepared by an approved panel valuer.",
        matchingDocumentTypes: ["Valuation", "Red Book Valuation", "Appraisal Report", "Valuation Report"],
        order: 8,
      },
      {
        id: "project-monitoring-report",
        name: "Initial Monitoring Report",
        category: "Professional Reports",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Initial monitoring surveyor report assessing build costs and construction timeline.",
        matchingDocumentTypes: ["Monitoring Report", "QS Report", "Surveyor Report", "Construction Report"],
        order: 9,
      },
      {
        id: "project-legal-dd",
        name: "Legal Due Diligence",
        category: "Professional Reports",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Legal due diligence report covering title, planning, and regulatory matters.",
        matchingDocumentTypes: ["Legal DD", "Due Diligence", "Legal Report"],
        order: 10,
      },
      {
        id: "project-report-on-title",
        name: "Report on Title",
        category: "Professional Reports",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Solicitor's report on title confirming ownership and any encumbrances.",
        matchingDocumentTypes: ["Report on Title", "Title Report", "Certificate of Title", "Legal Report"],
        order: 11,
      },
      {
        id: "project-facility-letter",
        name: "Facility Letter",
        category: "Legal Documents",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Executed facility agreement setting out the loan terms and conditions.",
        matchingDocumentTypes: ["Facility Letter", "Facility Agreement", "Loan Agreement", "Legal Document"],
        order: 12,
      },
      {
        id: "project-personal-guarantee",
        name: "Personal Guarantee",
        category: "Legal Documents",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Executed personal guarantee from key principals/shareholders.",
        matchingDocumentTypes: ["Personal Guarantee", "Guarantee", "Legal Document"],
        order: 13,
      },
      {
        id: "project-share-charge",
        name: "Share Charge",
        category: "Legal Documents",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Share charge over the borrower company's shares.",
        matchingDocumentTypes: ["Share Charge", "Charge", "Security Document", "Legal Document"],
        order: 14,
      },
      {
        id: "project-debenture",
        name: "Debenture",
        category: "Legal Documents",
        phaseRequired: "post_credit" as const,
        priority: "required" as const,
        description: "Debenture creating fixed and floating charges over the borrower's assets.",
        matchingDocumentTypes: ["Debenture", "Security Document", "Legal Document"],
        order: 15,
      },
    ];

    // Insert client-level template for borrower
    await ctx.db.insert("knowledgeRequirementTemplates", {
      clientType: "borrower",
      level: "client",
      requirements: borrowerClientRequirements,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    // Insert project-level template for borrower
    await ctx.db.insert("knowledgeRequirementTemplates", {
      clientType: "borrower",
      level: "project",
      requirements: borrowerProjectRequirements,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    });

    console.log("Successfully seeded borrower knowledge templates");
    console.log(`- Client-level: ${borrowerClientRequirements.length} requirements`);
    console.log(`- Project-level: ${borrowerProjectRequirements.length} requirements`);

    return {
      success: true,
      message: "Seeded borrower knowledge templates",
      created: 2,
      clientRequirements: borrowerClientRequirements.length,
      projectRequirements: borrowerProjectRequirements.length,
    };
  },
});

/**
 * Clear all knowledge templates (for testing/reset)
 * Run with: npx convex run migrations/seedKnowledgeTemplates:clear
 */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const templates = await ctx.db.query("knowledgeRequirementTemplates").collect();
    
    for (const template of templates) {
      await ctx.db.delete(template._id);
    }

    console.log(`Deleted ${templates.length} knowledge templates`);
    return { success: true, deleted: templates.length };
  },
});
