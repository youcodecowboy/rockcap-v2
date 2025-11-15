// File categories for real estate financing company
export const FILE_CATEGORIES = [
  'Loan Applications',
  'Loan Terms',
  'Property Documents',
  'Financial Statements',
  'Legal Documents',
  'Appraisals',
  'Inspections',
  'Closing Documents',
  'Communications',
  'Contracts',
  'Insurance',
  'Tax Documents',
  'General',
] as const;

export type FileCategory = typeof FILE_CATEGORIES[number];

// File types commonly seen in real estate financing
export const FILE_TYPES = [
  'Loan Application',
  'Property Deed',
  'Title Report',
  'Appraisal Report',
  'Inspection Report',
  'Financial Statement',
  'Tax Return',
  'Bank Statement',
  'Credit Report',
  'Purchase Agreement',
  'Lease Agreement',
  'Email',
  'Meeting Transcript',
  'Chat Transcript',
  'Contract',
  'Invoice',
  'Insurance Policy',
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

