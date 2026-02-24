// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

// API Endpoints
export const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Model Configuration
export const MODEL_CONFIG = {
  // Together AI models for bulk analysis
  analysis: {
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    temperature: 0.2,
    maxTokens: 2000,
  },
  // OpenAI models for critic agent (stronger reasoning)
  critic: {
    model: 'gpt-4o',
    temperature: 0.1,
    maxTokens: 800,
  },
} as const;

// Retry Configuration
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
} as const;

// Confidence Thresholds
export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,    // No review needed
  medium: 0.65,  // Review recommended
  low: 0.0,      // Review required
} as const;

// Text Processing Limits
export const TEXT_LIMITS = {
  maxTextLength: 32000,           // ~8000 tokens
  summarizationThreshold: 40000,  // Trigger smart summarization
  minimalTextThreshold: 200,      // Below this = likely scanned doc
  summaryContentLength: 40000,    // Max content for summary agent
  classificationContentLength: 8000, // Max content for classification
} as const;

// Category to Folder Mapping (fallback)
export const CATEGORY_FOLDER_MAP: Record<string, { folder: string; level: 'client' | 'project' }> = {
  'KYC': { folder: 'kyc', level: 'client' },
  'Appraisals': { folder: 'appraisals', level: 'project' },
  'Plans': { folder: 'background', level: 'project' },
  'Loan Terms': { folder: 'terms_comparison', level: 'project' },
  'Legal Documents': { folder: 'background', level: 'project' },
  'Financial Documents': { folder: 'operational_model', level: 'project' },
  'Inspections': { folder: 'credit_submission', level: 'project' },
  'Professional Reports': { folder: 'credit_submission', level: 'project' },
  'Project Documents': { folder: 'background', level: 'project' },
  'Insurance': { folder: 'credit_submission', level: 'project' },
  'Communications': { folder: 'background_docs', level: 'client' },
  'Warranties': { folder: 'post_completion', level: 'project' },
  'Photographs': { folder: 'background', level: 'project' },
  'Other': { folder: 'miscellaneous', level: 'client' },
} as const;

// Default Folders (when database fetch fails)
export const DEFAULT_FOLDERS = [
  { folderKey: 'background', name: 'Background', level: 'project' as const },
  { folderKey: 'terms_comparison', name: 'Terms Comparison', level: 'project' as const },
  { folderKey: 'credit_submission', name: 'Credit Submission', level: 'project' as const },
  { folderKey: 'appraisals', name: 'Appraisals', level: 'project' as const },
  { folderKey: 'notes', name: 'Notes', level: 'project' as const },
  { folderKey: 'operational_model', name: 'Operational Model', level: 'project' as const },
  { folderKey: 'post_completion', name: 'Post Completion', level: 'project' as const },
  { folderKey: 'kyc', name: 'KYC', level: 'client' as const },
  { folderKey: 'background_docs', name: 'Background Docs', level: 'client' as const },
  { folderKey: 'miscellaneous', name: 'Miscellaneous', level: 'client' as const },
];

// Default File Types (when database fetch fails)
export const DEFAULT_FILE_TYPES = [
  'Appraisal', 'RedBook Valuation', 'Cashflow',
  'Floor Plans', 'Elevations', 'Sections', 'Site Plans', 'Location Plans',
  'Initial Monitoring Report', 'Interim Monitoring Report', 'Planning Documentation',
  'Contract Sum Analysis', 'Comparables', 'Building Survey', 'Report on Title',
  'Legal Opinion', 'Environmental Report', 'Local Authority Search',
  'Passport', 'Driving License', 'Utility Bill', 'Bank Statement',
  'Application Form', 'Assets & Liabilities Statement', 'Track Record',
  'Certificate of Incorporation', 'Company Search', 'Tax Return',
  'Indicative Terms', 'Credit Backed Terms',
  'Facility Letter', 'Personal Guarantee', 'Corporate Guarantee',
  'Terms & Conditions', 'Shareholders Agreement', 'Share Charge',
  'Debenture', 'Corporate Authorisations', 'Building Contract',
  'Professional Appointment', 'Collateral Warranty', 'Title Deed', 'Lease',
  'Accommodation Schedule', 'Build Programme',
  'Loan Statement', 'Redemption Statement', 'Completion Statement',
  'Invoice', 'Receipt', 'Insurance Policy', 'Insurance Certificate',
  'Email/Correspondence', 'Meeting Minutes',
  'NHBC Warranty', 'Latent Defects Insurance', 'Site Photographs',
  'Other',
];

// Default Categories (when database fetch fails)
export const DEFAULT_CATEGORIES = [
  'Appraisals', 'Plans', 'Inspections', 'Professional Reports',
  'KYC', 'Loan Terms', 'Legal Documents', 'Project Documents',
  'Financial Documents', 'Insurance', 'Communications', 'Warranties',
  'Photographs', 'Other',
];

// Type Abbreviation Map for document naming
export const TYPE_ABBREVIATIONS: Record<string, string> = {
  'Appraisals': 'APR',
  'Plans': 'PLN',
  'Inspections': 'INS',
  'Professional Reports': 'RPT',
  'KYC': 'KYC',
  'Loan Terms': 'TRM',
  'Legal Documents': 'LEG',
  'Project Documents': 'PRJ',
  'Financial Documents': 'FIN',
  'Insurance': 'INS',
  'Communications': 'COM',
  'Warranties': 'WAR',
  'Photographs': 'PHO',
  'Other': 'OTH',
};

/**
 * Get type abbreviation for a category
 */
export function getTypeAbbreviation(category: string): string {
  return TYPE_ABBREVIATIONS[category] || 'DOC';
}
