// File categories for real estate financing company
// Updated to match the document taxonomy in fileTypeDefinitions
export const FILE_CATEGORIES = [
  // Primary categories matching the document type library
  'Appraisals',
  'Plans',
  'Inspections',
  'Professional Reports',
  'KYC',
  'Loan Terms',
  'Legal Documents',
  'Project Documents',
  'Financial Documents',
  'Insurance',
  'Communications',
  'Warranties',
  'Photographs',
  // Legacy/Additional categories for backwards compatibility
  'Loan Applications',
  'Property Documents',
  'Financial Statements',
  'Closing Documents',
  'Contracts',
  'Tax Documents',
  'General',
  'Other',
] as const;

export type FileCategory = typeof FILE_CATEGORIES[number];

// File types commonly seen in real estate financing
// Updated to match the comprehensive document type library
export const FILE_TYPES = [
  // Appraisals
  'Appraisal',
  'RedBook Valuation',
  'Cashflow',
  // Plans
  'Floor Plans',
  'Elevations',
  'Sections',
  'Site Plans',
  'Location Plans',
  // Inspections
  'Initial Monitoring Report',
  'Interim Monitoring Report',
  // Professional Reports
  'Planning Documentation',
  'Contract Sum Analysis',
  'Comparables',
  'Building Survey',
  'Report on Title',
  'Legal Opinion',
  'Environmental Report',
  'Local Authority Search',
  // KYC
  'Passport',
  'Driving License',
  'ID Document',
  'Proof of Address',
  'Utility Bill',
  'Bank Statement',
  'Application Form',
  'Assets & Liabilities Statement',
  'Track Record',
  'Company Search',
  'Certificate of Incorporation',
  // Loan Terms
  'Indicative Terms',
  'Credit Backed Terms',
  'Term Sheet',
  // Legal Documents
  'Facility Letter',
  'Personal Guarantee',
  'Corporate Guarantee',
  'Terms & Conditions',
  'Shareholders Agreement',
  'Share Charge',
  'Debenture',
  'Corporate Authorisations',
  'Building Contract',
  'Professional Appointment',
  'Collateral Warranty',
  'Title Deed',
  'Lease',
  // Project Documents
  'Accommodation Schedule',
  'Build Programme',
  'Specification',
  'Tender',
  'CGI/Renders',
  // Financial Documents
  'Loan Statement',
  'Redemption Statement',
  'Completion Statement',
  'Invoice',
  'Receipt',
  'Tax Return',
  // Insurance
  'Insurance Policy',
  'Insurance Certificate',
  // Communications
  'Email/Correspondence',
  'Meeting Minutes',
  // Warranties
  'NHBC Warranty',
  'Latent Defects Insurance',
  // Photographs
  'Site Photographs',
  // General/Fallback
  'Other Document',
  // Legacy types for backwards compatibility
  'Loan Application',
  'Property Deed',
  'Title Report',
  'Appraisal Report',
  'Inspection Report',
  'Financial Statement',
  'Credit Report',
  'Purchase Agreement',
  'Lease Agreement',
  'Email',
  'Meeting Transcript',
  'Chat Transcript',
  'Contract',
  'Closing Statement',
  'HUD-1 Settlement',
  'W-9 Form',
  '1099 Form',
  'Other',
] as const;

export type FileType = typeof FILE_TYPES[number];

export function isValidCategory(category: string): category is FileCategory {
  return FILE_CATEGORIES.includes(category as FileCategory);
}

export function isValidFileType(fileType: string): fileType is FileType {
  return FILE_TYPES.includes(fileType as FileType);
}
