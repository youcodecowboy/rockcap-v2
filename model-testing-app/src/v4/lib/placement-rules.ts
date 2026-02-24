// =============================================================================
// V4 DETERMINISTIC PLACEMENT RULES
// =============================================================================
// Maps classified documents to their correct storage location.
// This is the POST-PROCESSING step after Claude classifies a document.
//
// The model suggests a folder, but placement rules have final authority.
// This ensures consistency regardless of model behavior.
//
// Rules are organized by:
// 1. Category → folder mapping (primary)
// 2. Client type overrides (e.g., "lender" vs "borrower" see different folders)
// 3. Target level (client vs project)
//
// When adding new rules:
// - Add to CATEGORY_PLACEMENT for standard category→folder mapping
// - Add to CLIENT_TYPE_OVERRIDES for client-type-specific routing
// - Add to FILE_TYPE_OVERRIDES for specific file types that break the category rule

import type { DocumentClassification, ClientContext } from '../types';

// =============================================================================
// PLACEMENT RESULT
// =============================================================================

export interface PlacementResult {
  /** Resolved folder key (e.g., "appraisals", "kyc") */
  folderKey: string;
  /** Display name for the folder */
  folderName: string;
  /** Whether this belongs at client or project level */
  targetLevel: 'client' | 'project';
  /** Whether the model's suggestion was overridden */
  wasOverridden: boolean;
  /** Reason for the placement decision */
  reason: string;
}

// =============================================================================
// STANDARD FOLDER DEFINITIONS
// =============================================================================

/** All possible folders in the system */
export const FOLDER_DEFINITIONS: Record<string, { name: string; level: 'client' | 'project'; description: string }> = {
  // Client-level folders
  'background': { name: 'Background', level: 'client', description: 'Client background documents and general info' },
  'kyc': { name: 'KYC', level: 'client', description: 'Know Your Customer / identity documents' },
  'background_docs': { name: 'Background Docs', level: 'client', description: 'Additional background documentation' },
  'miscellaneous': { name: 'Miscellaneous', level: 'client', description: 'Uncategorized documents' },

  // Project-level folders
  'appraisals': { name: 'Appraisals', level: 'project', description: 'Valuations, appraisals, surveys, plans' },
  'terms_comparison': { name: 'Terms Comparison', level: 'project', description: 'Loan terms, facility letters, legal docs' },
  'terms_request': { name: 'Terms Request', level: 'project', description: 'Outgoing terms and proposals' },
  'credit_submission': { name: 'Credit Submission', level: 'project', description: 'Credit papers and submissions' },
  'post_completion': { name: 'Post Completion', level: 'project', description: 'Post-completion docs, insurance, monitoring' },
  'notes': { name: 'Notes', level: 'project', description: 'Meeting notes, correspondence, memos' },
  'operational_model': { name: 'Operational Model', level: 'project', description: 'Financial models, cashflows, projections' },
};

// =============================================================================
// CATEGORY → FOLDER MAPPING (Primary rules)
// =============================================================================

/** Default category-to-folder mapping. Most documents follow this. */
const CATEGORY_PLACEMENT: Record<string, { folderKey: string; targetLevel: 'client' | 'project' }> = {
  // Project-level categories
  'Appraisals':           { folderKey: 'appraisals', targetLevel: 'project' },
  'Legal Documents':      { folderKey: 'terms_comparison', targetLevel: 'project' },
  'Loan Terms':           { folderKey: 'terms_comparison', targetLevel: 'project' },
  'Inspections':          { folderKey: 'post_completion', targetLevel: 'project' },
  'Professional Reports': { folderKey: 'appraisals', targetLevel: 'project' },
  'Plans':                { folderKey: 'appraisals', targetLevel: 'project' },
  'Insurance':            { folderKey: 'post_completion', targetLevel: 'project' },
  'Photographs':          { folderKey: 'appraisals', targetLevel: 'project' },

  // Client-level categories
  'KYC':                  { folderKey: 'kyc', targetLevel: 'client' },
  'Communications':       { folderKey: 'notes', targetLevel: 'project' },
  'Financial Documents':  { folderKey: 'background', targetLevel: 'client' },

  // Fallback
  'Other':                { folderKey: 'miscellaneous', targetLevel: 'client' },
};

// =============================================================================
// FILE TYPE OVERRIDES (Specific file types that break the category rule)
// =============================================================================

/** Specific file types that need different placement than their category default */
const FILE_TYPE_OVERRIDES: Record<string, { folderKey: string; targetLevel: 'client' | 'project' }> = {
  // Cashflows go to operational_model, not appraisals
  'Cashflow':                  { folderKey: 'operational_model', targetLevel: 'project' },

  // Bank statements can be KYC (client) or financial background
  'Bank Statement':            { folderKey: 'kyc', targetLevel: 'client' },

  // Facility letters are legal docs but go to terms_comparison
  'Facility Letter':           { folderKey: 'terms_comparison', targetLevel: 'project' },

  // Personal guarantees go to terms_comparison (part of the deal)
  'Personal Guarantee':        { folderKey: 'terms_comparison', targetLevel: 'project' },

  // Monitoring reports go to post_completion
  'Initial Monitoring Report': { folderKey: 'post_completion', targetLevel: 'project' },
  'Interim Monitoring Report': { folderKey: 'post_completion', targetLevel: 'project' },

  // Insurance documents go to post_completion
  'Insurance Policy':          { folderKey: 'post_completion', targetLevel: 'project' },
  'Insurance Certificate':     { folderKey: 'post_completion', targetLevel: 'project' },

  // Tax returns are KYC
  'Tax Return':                { folderKey: 'kyc', targetLevel: 'client' },

  // Certificate of incorporation is KYC
  'Certificate of Incorporation': { folderKey: 'kyc', targetLevel: 'client' },

  // Invoices go to operational model if project-level
  'Invoice':                   { folderKey: 'operational_model', targetLevel: 'project' },
};

// =============================================================================
// CLIENT TYPE OVERRIDES
// =============================================================================

/** Client-type-specific overrides. Some documents route differently for lenders vs borrowers. */
const CLIENT_TYPE_OVERRIDES: Record<string, Record<string, { folderKey: string; targetLevel: 'client' | 'project' }>> = {
  // For lender clients, loan terms go to terms_request (outgoing)
  'lender': {
    'Indicative Terms':      { folderKey: 'terms_request', targetLevel: 'project' },
    'Credit Backed Terms':   { folderKey: 'terms_request', targetLevel: 'project' },
  },
  // For borrower clients, loan terms go to terms_comparison (incoming)
  'borrower': {
    'Indicative Terms':      { folderKey: 'terms_comparison', targetLevel: 'project' },
    'Credit Backed Terms':   { folderKey: 'terms_comparison', targetLevel: 'project' },
  },
};

// =============================================================================
// MAIN PLACEMENT FUNCTION
// =============================================================================

/**
 * Resolve the final placement for a classified document.
 *
 * Priority order:
 * 1. Client type override (if clientType provided)
 * 2. File type override (specific fileType → folder)
 * 3. Category default (category → folder)
 * 4. Model suggestion (if no rule matches)
 * 5. Fallback to miscellaneous
 */
export function resolvePlacement(
  classification: DocumentClassification,
  clientContext: ClientContext,
): PlacementResult {
  const { fileType, category, suggestedFolder, targetLevel: modelTargetLevel } = classification.classification;
  const clientType = clientContext.clientType?.toLowerCase();

  // Priority 1: Client type override
  if (clientType && CLIENT_TYPE_OVERRIDES[clientType]?.[fileType]) {
    const override = CLIENT_TYPE_OVERRIDES[clientType][fileType];
    const folder = FOLDER_DEFINITIONS[override.folderKey];
    return {
      folderKey: override.folderKey,
      folderName: folder?.name || override.folderKey,
      targetLevel: override.targetLevel,
      wasOverridden: override.folderKey !== suggestedFolder,
      reason: `Client type "${clientType}" routes "${fileType}" to ${override.folderKey}`,
    };
  }

  // Priority 2: File type override
  if (FILE_TYPE_OVERRIDES[fileType]) {
    const override = FILE_TYPE_OVERRIDES[fileType];
    const folder = FOLDER_DEFINITIONS[override.folderKey];
    return {
      folderKey: override.folderKey,
      folderName: folder?.name || override.folderKey,
      targetLevel: override.targetLevel,
      wasOverridden: override.folderKey !== suggestedFolder,
      reason: `File type "${fileType}" has specific placement rule → ${override.folderKey}`,
    };
  }

  // Priority 3: Category default
  if (CATEGORY_PLACEMENT[category]) {
    const placement = CATEGORY_PLACEMENT[category];
    const folder = FOLDER_DEFINITIONS[placement.folderKey];
    return {
      folderKey: placement.folderKey,
      folderName: folder?.name || placement.folderKey,
      targetLevel: placement.targetLevel,
      wasOverridden: placement.folderKey !== suggestedFolder,
      reason: `Category "${category}" maps to ${placement.folderKey}`,
    };
  }

  // Priority 4: Use model's suggestion if it matches a known folder
  if (suggestedFolder && FOLDER_DEFINITIONS[suggestedFolder]) {
    const folder = FOLDER_DEFINITIONS[suggestedFolder];
    return {
      folderKey: suggestedFolder,
      folderName: folder.name,
      targetLevel: folder.level,
      wasOverridden: false,
      reason: `Using model suggestion: ${suggestedFolder}`,
    };
  }

  // Priority 5: Fallback
  return {
    folderKey: 'miscellaneous',
    folderName: 'Miscellaneous',
    targetLevel: 'client',
    wasOverridden: true,
    reason: `No placement rule for "${fileType}" (${category}). Defaulting to miscellaneous.`,
  };
}

// =============================================================================
// BATCH PLACEMENT
// =============================================================================

/**
 * Resolve placement for all documents in a batch result.
 * Returns a map of documentIndex → PlacementResult.
 */
export function resolveBatchPlacement(
  classifications: DocumentClassification[],
  clientContext: ClientContext,
): Map<number, PlacementResult> {
  const placements = new Map<number, PlacementResult>();

  for (const cls of classifications) {
    placements.set(cls.documentIndex, resolvePlacement(cls, clientContext));
  }

  return placements;
}

// =============================================================================
// TYPE ABBREVIATION (for document naming)
// =============================================================================

/** Map file type to abbreviation for document naming convention */
export function getTypeAbbreviation(fileType: string): string {
  const ABBREVIATIONS: Record<string, string> = {
    'RedBook Valuation': 'VAL',
    'Appraisal': 'APPRAISAL',
    'Cashflow': 'CASHFLOW',
    'Passport': 'PASSPORT',
    'Driving License': 'DLICENSE',
    'Bank Statement': 'BANKSTMT',
    'Utility Bill': 'UTILITY',
    'Certificate of Incorporation': 'CERTINC',
    'Tax Return': 'TAXRETURN',
    'Facility Letter': 'FACILITY',
    'Title Deed': 'TITLEDEED',
    'Personal Guarantee': 'PG',
    'Indicative Terms': 'INDTERMS',
    'Credit Backed Terms': 'CBTTERMS',
    'Initial Monitoring Report': 'IMR',
    'Interim Monitoring Report': 'INTMR',
    'Building Survey': 'BLDGSURVEY',
    'Report on Title': 'ROT',
    'Floor Plans': 'FLRPLAN',
    'Site Plans': 'SITEPLAN',
    'Insurance Policy': 'INSPOLICY',
    'Insurance Certificate': 'INSCERT',
    'Invoice': 'INVOICE',
    'Email/Correspondence': 'EMAIL',
    'Site Photographs': 'PHOTO',
  };

  return ABBREVIATIONS[fileType] || fileType.toUpperCase().replace(/\s+/g, '').slice(0, 10);
}
