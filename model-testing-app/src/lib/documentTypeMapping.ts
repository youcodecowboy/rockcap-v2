/**
 * Document Type → Category → Folder Mapping
 *
 * This is the authoritative mapping that determines:
 * 1. Which category each document type belongs to
 * 2. Which folder the document should be filed to
 * 3. Whether it's a client-level or project-level document
 *
 * Used by:
 * - bulk-analyze/route.ts for filing decisions
 * - Tests for validation
 * - UI for folder suggestions
 */

export interface DocumentTypeMapping {
  fileType: string;
  category: string;
  folder: string;
  level: 'client' | 'project';
  description: string;
  keywords: string[];
}

/**
 * Complete mapping of all document types to their filing locations
 *
 * Folder keys reference the folder templates in seedFolderTemplates.ts:
 *
 * BORROWER CLIENT-LEVEL:
 * - kyc: KYC documents (nested under background)
 * - background_docs: Background documentation (nested under background)
 * - miscellaneous: Unclassified files
 *
 * BORROWER PROJECT-LEVEL:
 * - background: Project background documents
 * - terms_comparison: Loan term comparisons
 * - terms_request: Term requests and negotiations
 * - credit_submission: Credit application documents
 * - post_completion: Post-completion documents
 * - appraisals: Property valuations
 * - notes: Internal notes
 * - operational_model: Financial models
 */
export const DOCUMENT_TYPE_MAPPINGS: DocumentTypeMapping[] = [
  // =========================================================================
  // KYC CATEGORY - Client-Level Documents
  // =========================================================================
  {
    fileType: 'Passport',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Government-issued passport for identity verification',
    keywords: ['passport', 'biodata', 'travel document', 'mrz'],
  },
  {
    fileType: 'Driving License',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Government-issued driving license',
    keywords: ['driving licence', 'driving license', 'driver', 'dvla', 'license', 'licence'],
  },
  {
    fileType: 'ID Document',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Generic identity document (national ID, etc.)',
    keywords: ['proof of id', 'proofofid', 'poi', 'id card', 'national id', 'identification', 'id document', 'iddoc'],
  },
  {
    fileType: 'Proof of Address',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Generic proof of address document',
    keywords: ['proof of address', 'proofofaddress', 'poa', 'address proof'],
  },
  {
    fileType: 'Utility Bill',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Utility bill for address verification',
    keywords: ['utility bill', 'gas bill', 'electric bill', 'electricity bill', 'water bill', 'council tax'],
  },
  {
    fileType: 'Bank Statement',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Bank statement for financial verification',
    keywords: ['bank statement', 'bankstatement', 'business statement', 'personal statement', 'account statement', 'current account'],
  },
  {
    fileType: 'Assets & Liabilities Statement',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Statement of personal/company assets and liabilities',
    keywords: ['assets', 'liabilities', 'net worth', 'a&l', 'statement of affairs'],
  },
  {
    fileType: 'Application Form',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Loan or finance application form',
    keywords: ['application form', 'loan application', 'finance application'],
  },
  {
    fileType: 'Track Record',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Developer track record / CV showing previous projects',
    keywords: ['track record', 'cv', 'resume', 'curriculum vitae', 'development history', 'project portfolio'],
  },
  {
    fileType: 'Company Search',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Companies House search results',
    keywords: ['company search', 'companies house', 'company check', 'ch search'],
  },
  {
    fileType: 'Certificate of Incorporation',
    category: 'KYC',
    folder: 'kyc',
    level: 'client',
    description: 'Company incorporation certificate',
    keywords: ['certificate of incorporation', 'incorporation', 'company certificate', 'formation certificate'],
  },

  // =========================================================================
  // APPRAISALS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Appraisal',
    category: 'Appraisals',
    folder: 'appraisals',
    level: 'project',
    description: 'Development appraisal / feasibility study',
    keywords: ['appraisal', 'development appraisal', 'feasibility', 'residual valuation'],
  },
  {
    fileType: 'RedBook Valuation',
    category: 'Appraisals',
    folder: 'appraisals',
    level: 'project',
    description: 'RICS Red Book valuation report',
    keywords: ['valuation', 'red book', 'redbook', 'rics', 'market value', 'property valuation'],
  },
  {
    fileType: 'Cashflow',
    category: 'Appraisals',
    folder: 'appraisals',
    level: 'project',
    description: 'Cash flow projection or analysis',
    keywords: ['cashflow', 'cash flow', 'dcf', 'discounted cash flow'],
  },

  // =========================================================================
  // PLANS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Floor Plans',
    category: 'Plans',
    folder: 'background',
    level: 'project',
    description: 'Architectural floor plans',
    keywords: ['floor plan', 'floorplan', 'floorplans', 'internal layout', 'room layout'],
  },
  {
    fileType: 'Elevations',
    category: 'Plans',
    folder: 'background',
    level: 'project',
    description: 'Architectural elevation drawings',
    keywords: ['elevation', 'elevations', 'front elevation', 'rear elevation', 'external appearance'],
  },
  {
    fileType: 'Sections',
    category: 'Plans',
    folder: 'background',
    level: 'project',
    description: 'Architectural section drawings',
    keywords: ['section', 'sections', 'cross section', 'building section'],
  },
  {
    fileType: 'Site Plans',
    category: 'Plans',
    folder: 'background',
    level: 'project',
    description: 'Site layout plans',
    keywords: ['site plan', 'siteplan', 'site layout', 'plot plan'],
  },
  {
    fileType: 'Location Plans',
    category: 'Plans',
    folder: 'background',
    level: 'project',
    description: 'Site location / OS map plans',
    keywords: ['location plan', 'ordnance survey', 'os map', 'site location'],
  },

  // =========================================================================
  // INSPECTIONS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Initial Monitoring Report',
    category: 'Inspections',
    folder: 'credit_submission',
    level: 'project',
    description: 'Pre-funding monitoring surveyor report',
    keywords: ['initial monitoring', 'imr', 'ims initial', 'pre-funding monitoring', 'initial report'],
  },
  {
    fileType: 'Interim Monitoring Report',
    category: 'Inspections',
    folder: 'credit_submission',
    level: 'project',
    description: 'Monthly/interim progress monitoring report',
    keywords: ['interim monitoring', 'monitoring report', 'ims report', 'progress report', 'monthly monitoring', 'qs report'],
  },

  // =========================================================================
  // PROFESSIONAL REPORTS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Planning Documentation',
    category: 'Professional Reports',
    folder: 'background',
    level: 'project',
    description: 'Planning permission, decision notices, consents',
    keywords: ['planning decision', 'planning permission', 'decision notice', 'planning notice', 'planning approval', 'planning consent'],
  },
  {
    fileType: 'Contract Sum Analysis',
    category: 'Professional Reports',
    folder: 'credit_submission',
    level: 'project',
    description: 'Detailed construction cost breakdown',
    keywords: ['contract sum analysis', 'csa', 'cost plan', 'budget', 'construction budget', 'build cost'],
  },
  {
    fileType: 'Comparables',
    category: 'Professional Reports',
    folder: 'appraisals',
    level: 'project',
    description: 'Market comparable evidence',
    keywords: ['comparables', 'comps', 'comparable evidence', 'market evidence'],
  },
  {
    fileType: 'Building Survey',
    category: 'Professional Reports',
    folder: 'credit_submission',
    level: 'project',
    description: 'Structural or condition survey',
    keywords: ['building survey', 'structural survey', 'condition report', 'survey report'],
  },
  {
    fileType: 'Report on Title',
    category: 'Professional Reports',
    folder: 'credit_submission',
    level: 'project',
    description: 'Solicitor report on property title',
    keywords: ['report on title', 'title report', 'certificate of title', 'rot'],
  },
  {
    fileType: 'Legal Opinion',
    category: 'Professional Reports',
    folder: 'credit_submission',
    level: 'project',
    description: 'Legal advice letter or opinion',
    keywords: ['legal opinion', 'legal advice', 'counsel opinion', 'legal memo'],
  },
  {
    fileType: 'Environmental Report',
    category: 'Professional Reports',
    folder: 'credit_submission',
    level: 'project',
    description: 'Phase 1/2 environmental assessment',
    keywords: ['environmental', 'phase 1', 'phase 2', 'contamination', 'environmental search', 'environmental report'],
  },
  {
    fileType: 'Local Authority Search',
    category: 'Professional Reports',
    folder: 'credit_submission',
    level: 'project',
    description: 'Council/local authority searches',
    keywords: ['local authority search', 'local search', 'council search', 'la search'],
  },

  // =========================================================================
  // LOAN TERMS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Indicative Terms',
    category: 'Loan Terms',
    folder: 'terms_comparison',
    level: 'project',
    description: 'Initial/indicative loan terms',
    keywords: ['indicative terms', 'heads of terms', 'hot', 'initial terms'],
  },
  {
    fileType: 'Credit Backed Terms',
    category: 'Loan Terms',
    folder: 'terms_comparison',
    level: 'project',
    description: 'Credit-approved loan terms',
    keywords: ['credit backed terms', 'credit approved', 'approved terms', 'cbt'],
  },
  {
    fileType: 'Term Sheet',
    category: 'Loan Terms',
    folder: 'terms_comparison',
    level: 'project',
    description: 'Loan term sheet',
    keywords: ['term sheet', 'termsheet'],
  },

  // =========================================================================
  // LEGAL DOCUMENTS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Facility Letter',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Executed facility/loan agreement',
    keywords: ['facility letter', 'facility agreement', 'loan agreement', 'credit agreement'],
  },
  {
    fileType: 'Personal Guarantee',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Personal guarantee from directors/shareholders',
    keywords: ['personal guarantee', 'pg', 'guarantor'],
  },
  {
    fileType: 'Corporate Guarantee',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Corporate/company guarantee',
    keywords: ['corporate guarantee', 'company guarantee', 'group guarantee'],
  },
  {
    fileType: 'Terms & Conditions',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Standard terms and conditions',
    keywords: ['terms and conditions', 't&c', 'standard terms'],
  },
  {
    fileType: 'Shareholders Agreement',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Shareholders/JV agreement',
    keywords: ['shareholders agreement', 'sha', 'jv agreement', 'joint venture'],
  },
  {
    fileType: 'Share Charge',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Charge over company shares',
    keywords: ['share charge', 'sharecharge', 'charge over shares'],
  },
  {
    fileType: 'Debenture',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Fixed and floating charge debenture',
    keywords: ['debenture', 'fixed charge', 'floating charge'],
  },
  {
    fileType: 'Corporate Authorisations',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Board resolutions and corporate authorizations',
    keywords: ['board resolution', 'corporate resolution', 'authorization', 'authorisation'],
  },
  {
    fileType: 'Building Contract',
    category: 'Legal Documents',
    folder: 'credit_submission',
    level: 'project',
    description: 'JCT or other construction contract',
    keywords: ['building contract', 'construction contract', 'jct', 'design and build'],
  },
  {
    fileType: 'Professional Appointment',
    category: 'Legal Documents',
    folder: 'credit_submission',
    level: 'project',
    description: 'Architect/QS/consultant appointment',
    keywords: ['professional appointment', 'architect appointment', 'consultant appointment', 'qs appointment'],
  },
  {
    fileType: 'Collateral Warranty',
    category: 'Legal Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Third party collateral warranty',
    keywords: ['collateral warranty', 'warranty', 'third party warranty'],
  },
  {
    fileType: 'Title Deed',
    category: 'Legal Documents',
    folder: 'background',
    level: 'project',
    description: 'Land Registry title documents',
    keywords: ['title deed', 'land registry', 'title document', 'registered title'],
  },
  {
    fileType: 'Lease',
    category: 'Legal Documents',
    folder: 'background',
    level: 'project',
    description: 'Lease or tenancy agreement',
    keywords: ['lease', 'tenancy agreement', 'rental agreement', 'leasehold'],
  },

  // =========================================================================
  // PROJECT DOCUMENTS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Accommodation Schedule',
    category: 'Project Documents',
    folder: 'background',
    level: 'project',
    description: 'Unit/accommodation schedule',
    keywords: ['accommodation schedule', 'unit schedule', 'unit mix', 'bedroom mix'],
  },
  {
    fileType: 'Build Programme',
    category: 'Project Documents',
    folder: 'credit_submission',
    level: 'project',
    description: 'Construction programme/timeline',
    keywords: ['build programme', 'construction programme', 'gantt', 'project timeline', 'milestone'],
  },
  {
    fileType: 'Specification',
    category: 'Project Documents',
    folder: 'background',
    level: 'project',
    description: 'Construction specification document',
    keywords: ['specification', 'spec', 'construction spec', 'build spec'],
  },
  {
    fileType: 'Tender',
    category: 'Project Documents',
    folder: 'credit_submission',
    level: 'project',
    description: 'Contractor tender/bid',
    keywords: ['tender', 'bid', 'contractor tender', 'quote', 'quotation'],
  },
  {
    fileType: 'CGI/Renders',
    category: 'Project Documents',
    folder: 'background',
    level: 'project',
    description: 'Marketing CGIs and renders',
    keywords: ['cgi', 'render', 'renders', 'visualisation', 'visualization', 'marketing image'],
  },

  // =========================================================================
  // FINANCIAL DOCUMENTS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Loan Statement',
    category: 'Financial Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Loan account statement',
    keywords: ['loan statement', 'facility statement', 'loan account'],
  },
  {
    fileType: 'Redemption Statement',
    category: 'Financial Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Loan redemption/payoff statement',
    keywords: ['redemption statement', 'payoff statement', 'settlement figure'],
  },
  {
    fileType: 'Completion Statement',
    category: 'Financial Documents',
    folder: 'post_completion',
    level: 'project',
    description: 'Transaction completion statement',
    keywords: ['completion statement', 'closing statement', 'settlement statement'],
  },
  {
    fileType: 'Invoice',
    category: 'Financial Documents',
    folder: 'credit_submission',
    level: 'project',
    description: 'Contractor or professional fee invoice',
    keywords: ['invoice', 'inv', 'bill', 'payment request'],
  },
  {
    fileType: 'Receipt',
    category: 'Financial Documents',
    folder: 'credit_submission',
    level: 'project',
    description: 'Payment receipt',
    keywords: ['receipt', 'payment receipt', 'proof of payment'],
  },
  {
    fileType: 'Tax Return',
    category: 'Financial Documents',
    folder: 'kyc',
    level: 'client',
    description: 'Personal or company tax return',
    keywords: ['tax return', 'sa302', 'tax computation', 'corporation tax'],
  },

  // =========================================================================
  // INSURANCE CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Insurance Policy',
    category: 'Insurance',
    folder: 'credit_submission',
    level: 'project',
    description: 'Building, contractor, or liability insurance policy',
    keywords: ['insurance policy', 'insurance', 'policy document', 'coverage'],
  },
  {
    fileType: 'Insurance Certificate',
    category: 'Insurance',
    folder: 'credit_submission',
    level: 'project',
    description: 'Certificate of insurance',
    keywords: ['insurance certificate', 'certificate of insurance', 'coi', 'proof of insurance'],
  },

  // =========================================================================
  // COMMUNICATIONS CATEGORY - Client-Level Documents
  // =========================================================================
  {
    fileType: 'Email/Correspondence',
    category: 'Communications',
    folder: 'background_docs',
    level: 'client',
    description: 'Email threads and correspondence',
    keywords: ['email', 'correspondence', 'letter', 'memo', 're:', 'fwd:'],
  },
  {
    fileType: 'Meeting Minutes',
    category: 'Communications',
    folder: 'notes',
    level: 'project',
    description: 'Meeting notes and minutes',
    keywords: ['meeting minutes', 'minutes', 'meeting notes', 'board minutes'],
  },

  // =========================================================================
  // WARRANTIES CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'NHBC Warranty',
    category: 'Warranties',
    folder: 'post_completion',
    level: 'project',
    description: 'NHBC Buildmark warranty',
    keywords: ['nhbc', 'buildmark', 'nhbc warranty', 'new home warranty'],
  },
  {
    fileType: 'Latent Defects Insurance',
    category: 'Warranties',
    folder: 'post_completion',
    level: 'project',
    description: 'Latent defects insurance (LDI) policy',
    keywords: ['latent defects', 'ldi', 'structural warranty', 'defects insurance'],
  },

  // =========================================================================
  // PHOTOGRAPHS CATEGORY - Project-Level Documents
  // =========================================================================
  {
    fileType: 'Site Photographs',
    category: 'Photographs',
    folder: 'background',
    level: 'project',
    description: 'Site photos and progress images',
    keywords: ['photo', 'photograph', 'site photo', 'progress photo', 'image', 'picture'],
  },

  // =========================================================================
  // GENERAL/OTHER - Fallback
  // =========================================================================
  {
    fileType: 'Other Document',
    category: 'General',
    folder: 'miscellaneous',
    level: 'client',
    description: 'Unclassified document - needs review',
    keywords: [],
  },
];

/**
 * Get folder mapping for a specific document type and category
 */
export function getFolderForType(fileType: string, category?: string): { folder: string; level: 'client' | 'project' } | null {
  const mapping = DOCUMENT_TYPE_MAPPINGS.find(m =>
    m.fileType.toLowerCase() === fileType.toLowerCase()
  );

  if (mapping) {
    return { folder: mapping.folder, level: mapping.level };
  }

  // If type not found but category is provided, try category-based fallback
  if (category) {
    const categoryMapping = DOCUMENT_TYPE_MAPPINGS.find(m =>
      m.category.toLowerCase() === category.toLowerCase()
    );
    if (categoryMapping) {
      return { folder: categoryMapping.folder, level: categoryMapping.level };
    }
  }

  // Default fallback
  return { folder: 'miscellaneous', level: 'client' };
}

/**
 * Get the complete mapping for a document type
 */
export function getTypeMapping(fileType: string): DocumentTypeMapping | null {
  return DOCUMENT_TYPE_MAPPINGS.find(m =>
    m.fileType.toLowerCase() === fileType.toLowerCase()
  ) || null;
}

/**
 * Get all types for a specific category
 */
export function getTypesForCategory(category: string): DocumentTypeMapping[] {
  return DOCUMENT_TYPE_MAPPINGS.filter(m =>
    m.category.toLowerCase() === category.toLowerCase()
  );
}

/**
 * Get all unique categories
 */
export function getAllCategories(): string[] {
  return [...new Set(DOCUMENT_TYPE_MAPPINGS.map(m => m.category))];
}

/**
 * Get all unique file types
 */
export function getAllFileTypes(): string[] {
  return DOCUMENT_TYPE_MAPPINGS.map(m => m.fileType);
}

/**
 * Category to folder mapping (for when only category is known)
 */
export const CATEGORY_FOLDER_DEFAULTS: Record<string, { folder: string; level: 'client' | 'project' }> = {
  'KYC': { folder: 'kyc', level: 'client' },
  'Appraisals': { folder: 'appraisals', level: 'project' },
  'Plans': { folder: 'background', level: 'project' },
  'Inspections': { folder: 'credit_submission', level: 'project' },
  'Professional Reports': { folder: 'credit_submission', level: 'project' },
  'Loan Terms': { folder: 'terms_comparison', level: 'project' },
  'Legal Documents': { folder: 'post_completion', level: 'project' },
  'Project Documents': { folder: 'background', level: 'project' },
  'Financial Documents': { folder: 'post_completion', level: 'project' },
  'Insurance': { folder: 'credit_submission', level: 'project' },
  'Communications': { folder: 'background_docs', level: 'client' },
  'Warranties': { folder: 'post_completion', level: 'project' },
  'Photographs': { folder: 'background', level: 'project' },
  'General': { folder: 'miscellaneous', level: 'client' },
  'Other': { folder: 'miscellaneous', level: 'client' },
};

/**
 * Get folder for a category (fallback when type is unknown)
 */
export function getFolderForCategory(category: string): { folder: string; level: 'client' | 'project' } {
  return CATEGORY_FOLDER_DEFAULTS[category] || { folder: 'miscellaneous', level: 'client' };
}
