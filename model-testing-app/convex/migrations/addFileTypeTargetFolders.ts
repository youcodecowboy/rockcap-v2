import { internalMutation } from "../_generated/server";

/**
 * Migration: Add target folder and filename patterns to existing file type definitions
 *
 * This migration populates the new deterministic verification fields:
 * - targetFolderKey: Where documents of this type should be filed
 * - targetLevel: client or project level
 * - filenamePatterns: Keywords for filename-based matching
 * - excludePatterns: Patterns to prevent false positives
 *
 * Data is sourced from the hardcoded FILENAME_PATTERNS in patterns.ts
 */

// Pattern mappings from src/lib/agents/filename-matcher/patterns.ts
// Converted to a lookup table for the migration
const PATTERN_MAPPINGS: Record<
  string,
  {
    folder: string;
    level: "client" | "project";
    filenamePatterns: string[];
    excludePatterns?: string[];
  }
> = {
  // KYC - Identity Documents
  Passport: {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["passport", "biodata", "travel document", "mrz"],
    excludePatterns: ["photo", "background", "template", "guide", "instructions"],
  },
  "Driving License": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["driver", "driving", "license", "licence", "dvla"],
    excludePatterns: ["software", "directions", "template", "guide", "manual", "key"],
  },
  "ID Document": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["proof of id", "proofofid", "poi", "id card", "national id", "identification", "id document", "iddoc"],
  },
  "Proof of Address": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["proof of address", "proofofaddress", "poa", "address proof"],
  },
  "Utility Bill": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["utility bill", "gas bill", "electric bill", "electricity bill", "water bill", "council tax"],
  },
  "Bank Statement": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["bank statement", "bankstatement", "business statement", "personal statement", "account statement", "current account"],
  },
  "Assets & Liabilities Statement": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["assets", "liabilities", "net worth", "a&l", "statement of affairs"],
  },
  "Application Form": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["application form", "loan application", "finance application"],
  },
  "Track Record": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["track record", "trackrecord", "cv ", "resume", "curriculum vitae", "developer cv"],
  },
  "Company Search": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["company search", "companies house", "ch search"],
  },
  "Certificate of Incorporation": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["certificate of incorporation", "incorporation", "company certificate"],
  },
  "Tax Return": {
    folder: "kyc",
    level: "client",
    filenamePatterns: ["tax return", "sa302", "tax computation", "corporation tax"],
  },

  // Appraisals
  "RedBook Valuation": {
    folder: "appraisals",
    level: "project",
    filenamePatterns: ["valuation", "red book", "redbook", "rics", "market value"],
    excludePatterns: ["methodology", "guide", "template", "manual", "training", "instructions"],
  },
  Appraisal: {
    folder: "appraisals",
    level: "project",
    filenamePatterns: ["appraisal", "development appraisal", "feasibility", "residual"],
  },
  Cashflow: {
    folder: "appraisals",
    level: "project",
    filenamePatterns: ["cashflow", "cash flow", "dcf"],
  },
  Comparables: {
    folder: "appraisals",
    level: "project",
    filenamePatterns: ["comparables", "comps", "comparable evidence", "market evidence"],
  },

  // Plans
  "Floor Plans": {
    folder: "background",
    level: "project",
    filenamePatterns: ["floor plan", "floorplan", "floorplans"],
    excludePatterns: ["discussion", "notes", "meeting", "template", "guide", "review"],
  },
  Elevations: {
    folder: "background",
    level: "project",
    filenamePatterns: ["elevation", "elevations"],
  },
  Sections: {
    folder: "background",
    level: "project",
    filenamePatterns: ["section", "sections", "cross section"],
  },
  "Site Plans": {
    folder: "background",
    level: "project",
    filenamePatterns: ["site plan", "siteplan", "site layout"],
  },
  "Location Plans": {
    folder: "background",
    level: "project",
    filenamePatterns: ["location plan", "ordnance survey", "os map"],
  },

  // Inspections
  "Initial Monitoring Report": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["initial monitoring", "imr", "pre-funding monitoring", "initial report"],
  },
  "Interim Monitoring Report": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["interim monitoring", "monitoring report", "ims report", "progress report", "monthly monitoring", "qs report"],
  },

  // Professional Reports
  "Planning Documentation": {
    folder: "background",
    level: "project",
    filenamePatterns: ["planning decision", "planning permission", "decision notice", "planning notice", "planning approval", "planning consent"],
  },
  "Contract Sum Analysis": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["contract sum analysis", "csa", "cost plan", "construction budget", "build cost"],
  },
  "Building Survey": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["building survey", "structural survey", "condition report", "survey report"],
  },
  "Report on Title": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["report on title", "title report", "certificate of title", "rot"],
  },
  "Legal Opinion": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["legal opinion", "legal advice", "counsel opinion"],
  },
  "Environmental Report": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["environmental", "phase 1", "phase 2", "contamination", "environmental search"],
  },
  "Local Authority Search": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["local authority search", "local search", "council search", "la search"],
  },

  // Loan Terms
  "Indicative Terms": {
    folder: "terms_comparison",
    level: "project",
    filenamePatterns: ["indicative terms", "heads of terms", "hot", "initial terms"],
  },
  "Credit Backed Terms": {
    folder: "terms_comparison",
    level: "project",
    filenamePatterns: ["credit backed terms", "credit approved", "approved terms", "cbt"],
  },
  "Term Sheet": {
    folder: "terms_comparison",
    level: "project",
    filenamePatterns: ["term sheet", "termsheet"],
  },

  // Legal Documents
  "Facility Letter": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["facility letter", "facility agreement", "loan agreement"],
  },
  "Personal Guarantee": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["personal guarantee", "pg "],
  },
  "Corporate Guarantee": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["corporate guarantee", "company guarantee"],
  },
  "Share Charge": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["share charge", "sharecharge"],
  },
  "Shareholders Agreement": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["shareholders agreement", "sha ", "jv agreement"],
  },
  Debenture: {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["debenture", "fixed charge", "floating charge"],
  },
  "Corporate Authorisations": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["board resolution", "corporate resolution", "authorization", "authorisation"],
  },
  "Building Contract": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["building contract", "construction contract", "jct"],
  },
  "Professional Appointment": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["professional appointment", "architect appointment", "consultant appointment"],
  },
  "Collateral Warranty": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["collateral warranty", "third party warranty"],
  },
  "Title Deed": {
    folder: "background",
    level: "project",
    filenamePatterns: ["title deed", "land registry", "registered title"],
  },
  Lease: {
    folder: "background",
    level: "project",
    filenamePatterns: ["lease", "tenancy agreement", "rental agreement"],
  },

  // Project Documents
  "Accommodation Schedule": {
    folder: "background",
    level: "project",
    filenamePatterns: ["accommodation schedule", "unit schedule", "unit mix"],
  },
  "Build Programme": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["build programme", "construction programme", "gantt", "project timeline"],
  },
  Specification: {
    folder: "background",
    level: "project",
    filenamePatterns: ["specification", "spec", "construction spec"],
  },
  Tender: {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["tender", "bid", "contractor tender", "quotation"],
  },
  "CGI/Renders": {
    folder: "background",
    level: "project",
    filenamePatterns: ["cgi", "render", "renders", "visualisation", "visualization"],
  },

  // Financial Documents
  "Loan Statement": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["loan statement", "facility statement"],
  },
  "Redemption Statement": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["redemption statement", "payoff statement", "settlement figure"],
  },
  "Completion Statement": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["completion statement", "closing statement"],
  },
  Invoice: {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["invoice", "inv "],
    excludePatterns: ["template", "guide", "blank", "sample", "example"],
  },
  Receipt: {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["receipt", "payment receipt"],
  },

  // Insurance
  "Insurance Policy": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["insurance policy", "policy document"],
  },
  "Insurance Certificate": {
    folder: "credit_submission",
    level: "project",
    filenamePatterns: ["insurance certificate", "certificate of insurance", "coi"],
  },

  // Communications
  "Email/Correspondence": {
    folder: "background_docs",
    level: "client",
    filenamePatterns: ["email", "correspondence", "re:", "fwd:"],
  },
  "Meeting Minutes": {
    folder: "notes",
    level: "project",
    filenamePatterns: ["meeting minutes", "minutes", "meeting notes"],
  },

  // Warranties
  "NHBC Warranty": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["nhbc", "buildmark", "new home warranty"],
  },
  "Latent Defects Insurance": {
    folder: "post_completion",
    level: "project",
    filenamePatterns: ["latent defects", "ldi", "structural warranty", "defects insurance"],
  },

  // Photographs
  "Site Photographs": {
    folder: "background",
    level: "project",
    filenamePatterns: ["photo", "photograph", "site photo", "progress photo"],
  },
};

/**
 * Run the migration to add target folder data to existing file type definitions
 */
export const addFileTypeTargetFolders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const definitions = await ctx.db.query("fileTypeDefinitions").collect();
    const now = new Date().toISOString();

    let updated = 0;
    let skipped = 0;

    for (const def of definitions) {
      // Look up the pattern mapping for this file type
      const mapping = PATTERN_MAPPINGS[def.fileType];

      if (!mapping) {
        // No mapping found - skip
        skipped++;
        continue;
      }

      // Check if already has target folder data
      if (def.targetFolderKey && def.filenamePatterns) {
        skipped++;
        continue;
      }

      // Update with the mapping data
      await ctx.db.patch(def._id, {
        targetFolderKey: def.targetFolderKey || mapping.folder,
        targetLevel: def.targetLevel || mapping.level,
        filenamePatterns: def.filenamePatterns || mapping.filenamePatterns,
        excludePatterns: def.excludePatterns || mapping.excludePatterns,
        updatedAt: now,
      });

      updated++;
    }

    return {
      updated,
      skipped,
      total: definitions.length,
      message: `Migration complete: ${updated} updated, ${skipped} skipped`,
    };
  },
});
