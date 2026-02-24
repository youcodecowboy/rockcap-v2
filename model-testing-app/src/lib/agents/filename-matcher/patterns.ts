// =============================================================================
// FILENAME PATTERN DEFINITIONS
// =============================================================================
// These patterns map filename keywords to file type/category/folder classifications
// The `excludeIf` array prevents false positives for specific contexts

import { FilenamePattern } from './types';

export const FILENAME_PATTERNS: FilenamePattern[] = [
  // =========================================================================
  // KYC - Identity Documents (Client-Level → kyc folder)
  // =========================================================================
  { keywords: ['passport', 'biodata', 'travel document', 'mrz'], fileType: 'Passport', category: 'KYC', folder: 'kyc', excludeIf: ['photo', 'background', 'template', 'guide', 'instructions'] },
  { keywords: ['driver', 'driving', 'license', 'licence', 'dvla'], fileType: 'Driving License', category: 'KYC', folder: 'kyc', excludeIf: ['software', 'directions', 'template', 'guide', 'manual', 'key'] },
  { keywords: ['proof of id', 'proofofid', 'poi', 'id card', 'national id', 'identification', 'id document', 'iddoc'], fileType: 'ID Document', category: 'KYC', folder: 'kyc' },

  // KYC - Address Documents
  { keywords: ['proof of address', 'proofofaddress', 'poa', 'address proof'], fileType: 'Proof of Address', category: 'KYC', folder: 'kyc' },
  { keywords: ['utility bill', 'gas bill', 'electric bill', 'electricity bill', 'water bill', 'council tax'], fileType: 'Utility Bill', category: 'KYC', folder: 'kyc' },

  // KYC - Financial Documents
  { keywords: ['bank statement', 'bankstatement', 'business statement', 'personal statement', 'account statement', 'current account'], fileType: 'Bank Statement', category: 'KYC', folder: 'kyc' },
  { keywords: ['assets', 'liabilities', 'net worth', 'a&l', 'statement of affairs'], fileType: 'Assets & Liabilities Statement', category: 'KYC', folder: 'kyc' },
  { keywords: ['application form', 'loan application', 'finance application'], fileType: 'Application Form', category: 'KYC', folder: 'kyc' },
  { keywords: ['track record', 'trackrecord', 'cv ', 'resume', 'curriculum vitae', 'developer cv'], fileType: 'Track Record', category: 'KYC', folder: 'kyc' },
  { keywords: ['company search', 'companies house', 'ch search'], fileType: 'Company Search', category: 'KYC', folder: 'kyc' },
  { keywords: ['certificate of incorporation', 'incorporation', 'company certificate'], fileType: 'Certificate of Incorporation', category: 'KYC', folder: 'kyc' },
  { keywords: ['tax return', 'sa302', 'tax computation', 'corporation tax'], fileType: 'Tax Return', category: 'Financial Documents', folder: 'kyc' },

  // =========================================================================
  // APPRAISALS - Project-Level → appraisals folder
  // =========================================================================
  { keywords: ['valuation', 'red book', 'redbook', 'rics', 'market value'], fileType: 'RedBook Valuation', category: 'Appraisals', folder: 'appraisals', excludeIf: ['methodology', 'guide', 'template', 'manual', 'training', 'instructions'] },
  { keywords: ['appraisal', 'development appraisal', 'feasibility', 'residual'], fileType: 'Appraisal', category: 'Appraisals', folder: 'appraisals' },
  { keywords: ['cashflow', 'cash flow', 'dcf'], fileType: 'Cashflow', category: 'Appraisals', folder: 'appraisals' },
  { keywords: ['comparables', 'comps', 'comparable evidence', 'market evidence'], fileType: 'Comparables', category: 'Professional Reports', folder: 'appraisals' },

  // =========================================================================
  // PLANS - Project-Level → background folder
  // =========================================================================
  { keywords: ['floor plan', 'floorplan', 'floorplans'], fileType: 'Floor Plans', category: 'Plans', folder: 'background', excludeIf: ['discussion', 'notes', 'meeting', 'template', 'guide', 'review'] },
  { keywords: ['elevation', 'elevations'], fileType: 'Elevations', category: 'Plans', folder: 'background' },
  { keywords: ['section', 'sections', 'cross section'], fileType: 'Sections', category: 'Plans', folder: 'background' },
  { keywords: ['site plan', 'siteplan', 'site layout'], fileType: 'Site Plans', category: 'Plans', folder: 'background' },
  { keywords: ['location plan', 'ordnance survey', 'os map'], fileType: 'Location Plans', category: 'Plans', folder: 'background' },

  // =========================================================================
  // INSPECTIONS - Project-Level → credit_submission folder
  // =========================================================================
  { keywords: ['initial monitoring', 'imr', 'pre-funding monitoring', 'initial report'], fileType: 'Initial Monitoring Report', category: 'Inspections', folder: 'credit_submission' },
  { keywords: ['interim monitoring', 'monitoring report', 'ims report', 'progress report', 'monthly monitoring', 'qs report'], fileType: 'Interim Monitoring Report', category: 'Inspections', folder: 'credit_submission' },

  // =========================================================================
  // PROFESSIONAL REPORTS - Project-Level → credit_submission or background
  // =========================================================================
  { keywords: ['planning decision', 'planning permission', 'decision notice', 'planning notice', 'planning approval', 'planning consent'], fileType: 'Planning Documentation', category: 'Professional Reports', folder: 'background' },
  { keywords: ['contract sum analysis', 'csa', 'cost plan', 'construction budget', 'build cost'], fileType: 'Contract Sum Analysis', category: 'Professional Reports', folder: 'credit_submission' },
  { keywords: ['building survey', 'structural survey', 'condition report', 'survey report'], fileType: 'Building Survey', category: 'Professional Reports', folder: 'credit_submission' },
  { keywords: ['report on title', 'title report', 'certificate of title', 'rot'], fileType: 'Report on Title', category: 'Professional Reports', folder: 'credit_submission' },
  { keywords: ['legal opinion', 'legal advice', 'counsel opinion'], fileType: 'Legal Opinion', category: 'Professional Reports', folder: 'credit_submission' },
  { keywords: ['environmental', 'phase 1', 'phase 2', 'contamination', 'environmental search'], fileType: 'Environmental Report', category: 'Professional Reports', folder: 'credit_submission' },
  { keywords: ['local authority search', 'local search', 'council search', 'la search'], fileType: 'Local Authority Search', category: 'Professional Reports', folder: 'credit_submission' },

  // =========================================================================
  // LOAN TERMS - Project-Level → terms_comparison folder
  // =========================================================================
  { keywords: ['indicative terms', 'heads of terms', 'hot', 'initial terms'], fileType: 'Indicative Terms', category: 'Loan Terms', folder: 'terms_comparison' },
  { keywords: ['credit backed terms', 'credit approved', 'approved terms', 'cbt'], fileType: 'Credit Backed Terms', category: 'Loan Terms', folder: 'terms_comparison' },
  { keywords: ['term sheet', 'termsheet'], fileType: 'Term Sheet', category: 'Loan Terms', folder: 'terms_comparison' },

  // =========================================================================
  // LEGAL DOCUMENTS - Project-Level → post_completion or credit_submission
  // =========================================================================
  { keywords: ['facility letter', 'facility agreement', 'loan agreement'], fileType: 'Facility Letter', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['personal guarantee', 'pg '], fileType: 'Personal Guarantee', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['corporate guarantee', 'company guarantee'], fileType: 'Corporate Guarantee', category: 'Legal Documents', folder: 'post_completion' },
  // Share Charge MUST come before Shareholders Agreement (sha pattern is too broad)
  { keywords: ['share charge', 'sharecharge'], fileType: 'Share Charge', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['shareholders agreement', 'sha ', 'jv agreement'], fileType: 'Shareholders Agreement', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['debenture', 'fixed charge', 'floating charge'], fileType: 'Debenture', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['board resolution', 'corporate resolution', 'authorization', 'authorisation'], fileType: 'Corporate Authorisations', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['building contract', 'construction contract', 'jct'], fileType: 'Building Contract', category: 'Legal Documents', folder: 'credit_submission' },
  { keywords: ['professional appointment', 'architect appointment', 'consultant appointment'], fileType: 'Professional Appointment', category: 'Legal Documents', folder: 'credit_submission' },
  { keywords: ['collateral warranty', 'third party warranty'], fileType: 'Collateral Warranty', category: 'Legal Documents', folder: 'post_completion' },
  { keywords: ['title deed', 'land registry', 'registered title'], fileType: 'Title Deed', category: 'Legal Documents', folder: 'background' },
  { keywords: ['lease', 'tenancy agreement', 'rental agreement'], fileType: 'Lease', category: 'Legal Documents', folder: 'background' },

  // =========================================================================
  // PROJECT DOCUMENTS - Project-Level → background or credit_submission
  // =========================================================================
  { keywords: ['accommodation schedule', 'unit schedule', 'unit mix'], fileType: 'Accommodation Schedule', category: 'Project Documents', folder: 'background' },
  { keywords: ['build programme', 'construction programme', 'gantt', 'project timeline'], fileType: 'Build Programme', category: 'Project Documents', folder: 'credit_submission' },
  { keywords: ['specification', 'spec', 'construction spec'], fileType: 'Specification', category: 'Project Documents', folder: 'background' },
  { keywords: ['tender', 'bid', 'contractor tender', 'quotation'], fileType: 'Tender', category: 'Project Documents', folder: 'credit_submission' },
  { keywords: ['cgi', 'render', 'renders', 'visualisation', 'visualization'], fileType: 'CGI/Renders', category: 'Project Documents', folder: 'background' },

  // =========================================================================
  // FINANCIAL DOCUMENTS - Project-Level → post_completion or credit_submission
  // =========================================================================
  { keywords: ['loan statement', 'facility statement'], fileType: 'Loan Statement', category: 'Financial Documents', folder: 'post_completion' },
  { keywords: ['redemption statement', 'payoff statement', 'settlement figure'], fileType: 'Redemption Statement', category: 'Financial Documents', folder: 'post_completion' },
  { keywords: ['completion statement', 'closing statement'], fileType: 'Completion Statement', category: 'Financial Documents', folder: 'post_completion' },
  { keywords: ['invoice', 'inv '], fileType: 'Invoice', category: 'Financial Documents', folder: 'credit_submission', excludeIf: ['template', 'guide', 'blank', 'sample', 'example'] },
  { keywords: ['receipt', 'payment receipt'], fileType: 'Receipt', category: 'Financial Documents', folder: 'credit_submission' },

  // =========================================================================
  // INSURANCE - Project-Level → credit_submission
  // =========================================================================
  { keywords: ['insurance policy', 'policy document'], fileType: 'Insurance Policy', category: 'Insurance', folder: 'credit_submission' },
  { keywords: ['insurance certificate', 'certificate of insurance', 'coi'], fileType: 'Insurance Certificate', category: 'Insurance', folder: 'credit_submission' },

  // =========================================================================
  // COMMUNICATIONS - Client-Level → background_docs
  // =========================================================================
  { keywords: ['email', 'correspondence', 're:', 'fwd:'], fileType: 'Email/Correspondence', category: 'Communications', folder: 'background_docs' },
  { keywords: ['meeting minutes', 'minutes', 'meeting notes'], fileType: 'Meeting Minutes', category: 'Communications', folder: 'notes' },

  // =========================================================================
  // WARRANTIES - Project-Level → post_completion
  // =========================================================================
  { keywords: ['nhbc', 'buildmark', 'new home warranty'], fileType: 'NHBC Warranty', category: 'Warranties', folder: 'post_completion' },
  { keywords: ['latent defects', 'ldi', 'structural warranty', 'defects insurance'], fileType: 'Latent Defects Insurance', category: 'Warranties', folder: 'post_completion' },

  // =========================================================================
  // PHOTOGRAPHS - Project-Level → background
  // =========================================================================
  { keywords: ['photo', 'photograph', 'site photo', 'progress photo'], fileType: 'Site Photographs', category: 'Photographs', folder: 'background' },
];

// Pattern aliases for checklist matching
export const CHECKLIST_PATTERN_ALIASES: Record<string, string[]> = {
  'proof of address': ['poa', 'proof of address', 'proofofaddress', 'address proof', 'utility', 'utility bill', 'bank statement'],
  'proof of id': ['poi', 'proof of id', 'proofofid', 'id proof', 'passport', 'drivers license', 'driving license', 'id doc', 'identification', 'biodata', 'id card', 'national id'],
  'bank statement': ['bank statement', 'bankstatement', 'bank', 'statement', 'bs'],
  'assets & liabilities': ['assets', 'liabilities', 'a&l', 'al statement', 'assets and liabilities', 'net worth'],
  'track record': ['track record', 'trackrecord', 'cv', 'resume', 'experience', 'portfolio'],
  'appraisal': ['appraisal', 'feasibility', 'development appraisal', 'da'],
  'valuation': ['valuation', 'val', 'red book', 'redbook', 'rics'],
  'floorplan': ['floorplan', 'floor plan', 'floorplans', 'floor plans', 'fp'],
  'elevation': ['elevation', 'elevations', 'elev'],
  'site plan': ['site plan', 'siteplan', 'sp', 'site layout'],
  'planning': ['planning', 'planning decision', 'planning permission', 'pp'],
  'monitoring': ['monitoring', 'ims', 'monitoring report', 'ms report'],
  'personal guarantee': ['pg', 'personal guarantee', 'guarantee'],
  'facility': ['facility', 'facility letter', 'fa', 'loan agreement'],
  'debenture': ['debenture', 'deb'],
  'share charge': ['share charge', 'sharecharge', 'sc'],
};
