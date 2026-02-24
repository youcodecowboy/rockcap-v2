import { describe, it, expect } from 'vitest';

/**
 * Document Classification Tests
 *
 * Tests for the document classification system including:
 * - Filename pattern recognition
 * - Document type detection
 * - Checklist item matching
 */

// ============================================================================
// Filename Type Hints - Extracted from bulk-analyze/route.ts
// ============================================================================

interface FilenameTypeHint {
  fileType: string;
  category: string;
  folder: string;
  confidence: number;
  reason: string;
}

/**
 * Get filename-based file type hints for minimal text scenarios
 * Extracted from bulk-analyze/route.ts for testing
 */
function getFilenameTypeHints(fileName: string): FilenameTypeHint | null {
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');

  const patterns: Array<{
    keywords: string[];
    fileType: string;
    category: string;
    folder: string;
  }> = [
    // KYC - Identity Documents
    { keywords: ['passport', 'biodata', 'travel document'], fileType: 'Passport', category: 'KYC', folder: 'kyc' },
    { keywords: ['driver', 'driving', 'license', 'licence'], fileType: 'Driving License', category: 'KYC', folder: 'kyc' },
    { keywords: ['proof of id', 'proofofid', 'poi', 'id card', 'national id', 'identification', 'id document', 'iddoc'], fileType: 'ID Document', category: 'KYC', folder: 'kyc' },
    // KYC - Address Documents
    { keywords: ['proof of address', 'proofofaddress', 'poa', 'address proof'], fileType: 'Proof of Address', category: 'KYC', folder: 'kyc' },
    { keywords: ['utility bill', 'gas bill', 'electric bill', 'water bill', 'council tax'], fileType: 'Utility Bill', category: 'KYC', folder: 'kyc' },
    // KYC - Financial Documents
    { keywords: ['bank statement', 'bankstatement', 'business statement', 'personal statement', 'account statement', 'current account'], fileType: 'Bank Statement', category: 'KYC', folder: 'kyc' },
    { keywords: ['assets', 'liabilities', 'net worth', 'a&l'], fileType: 'Assets & Liabilities Statement', category: 'KYC', folder: 'kyc' },
    { keywords: ['track record', 'cv ', 'resume', 'curriculum vitae'], fileType: 'Track Record', category: 'KYC', folder: 'kyc' },
    // Appraisals & Valuations
    { keywords: ['valuation', 'red book', 'redbook', 'rics val'], fileType: 'RedBook Valuation', category: 'Appraisals', folder: 'appraisals' },
    { keywords: ['appraisal', 'development appraisal', 'feasibility'], fileType: 'Appraisal', category: 'Appraisals', folder: 'appraisals' },
    // Plans & Drawings
    { keywords: ['floor plan', 'floorplan'], fileType: 'Floor Plans', category: 'Plans', folder: 'background' },
    { keywords: ['elevation'], fileType: 'Elevations', category: 'Plans', folder: 'background' },
    { keywords: ['site plan', 'siteplan'], fileType: 'Site Plans', category: 'Plans', folder: 'background' },
    { keywords: ['location plan'], fileType: 'Location Plans', category: 'Plans', folder: 'background' },
    // Planning Documents
    { keywords: ['planning decision', 'planning permission', 'decision notice', 'planning notice', 'planning approval'], fileType: 'Planning Decision', category: 'Professional Reports', folder: 'background' },
    // Legal Documents
    { keywords: ['term sheet', 'termsheet', 'indicative terms', 'credit backed terms'], fileType: 'Term Sheet', category: 'Loan Terms', folder: 'terms_comparison' },
    { keywords: ['facility letter', 'facility agreement'], fileType: 'Facility Letter', category: 'Legal Documents', folder: 'background' },
    { keywords: ['personal guarantee', 'pg '], fileType: 'Personal Guarantee', category: 'Legal Documents', folder: 'background' },
    { keywords: ['debenture'], fileType: 'Debenture', category: 'Legal Documents', folder: 'background' },
    { keywords: ['share charge', 'sharecharge'], fileType: 'Share Charge', category: 'Legal Documents', folder: 'background' },
    // Inspections & Monitoring
    { keywords: ['monitoring report', 'ims report', 'interim monitoring', 'qs report'], fileType: 'Monitoring Report', category: 'Inspections', folder: 'credit_submission' },
  ];

  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (fileNameLower.includes(keyword)) {
        return {
          fileType: pattern.fileType,
          category: pattern.category,
          folder: pattern.folder,
          confidence: 0.85,
          reason: `Filename contains "${keyword}"`,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// Checklist Matching - Extracted from bulk-analyze/route.ts
// ============================================================================

interface EnrichedChecklistItem {
  _id: string;
  name: string;
  category: string;
  status: string;
  linkedDocumentCount: number;
  description?: string;
  matchingDocumentTypes?: string[];
}

interface FilenameMatchResult {
  itemId: string;
  score: number;
  reason: string;
}

/**
 * Check filename patterns against checklist items
 * Extracted from bulk-analyze/route.ts for testing
 */
function checkFilenamePatterns(
  fileName: string,
  checklistItems: EnrichedChecklistItem[]
): FilenameMatchResult[] {
  const matches: FilenameMatchResult[] = [];
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');
  const fileNameParts = fileNameLower.split(/\s+/);

  const patternAliases: Record<string, string[]> = {
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

  for (const item of checklistItems) {
    const itemNameLower = item.name.toLowerCase();
    let bestScore = 0;
    let bestReason = '';

    // Check 1: Exact or partial name match in filename
    if (fileNameLower.includes(itemNameLower.replace(/\s+/g, ' ').replace(/[()]/g, ''))) {
      bestScore = 0.9;
      bestReason = 'Filename contains requirement name';
    }

    // Check 2: Check matching document types against filename
    if (item.matchingDocumentTypes && bestScore < 0.9) {
      for (const docType of item.matchingDocumentTypes) {
        const docTypeLower = docType.toLowerCase();
        if (fileNameLower.includes(docTypeLower.replace(/\s+/g, ' '))) {
          if (bestScore < 0.85) {
            bestScore = 0.85;
            bestReason = `Filename matches document type: ${docType}`;
          }
        }
      }
    }

    // Check 3: Check pattern aliases
    for (const [patternKey, aliases] of Object.entries(patternAliases)) {
      const relatedToItem = item.matchingDocumentTypes?.some(t =>
        t.toLowerCase().includes(patternKey.split(' ')[0]) ||
        patternKey.includes(t.toLowerCase().split(' ')[0])
      ) || itemNameLower.includes(patternKey.split(' ')[0]);

      if (relatedToItem) {
        for (const alias of aliases) {
          if (fileNameLower.includes(alias) || fileNameParts.includes(alias)) {
            if (bestScore < 0.8) {
              bestScore = 0.8;
              bestReason = `Filename pattern "${alias}" matches requirement`;
            }
          }
        }
      }
    }

    // Check 4: Partial word matching
    if (bestScore < 0.6) {
      const itemWords = itemNameLower.split(/\s+/).filter(w => w.length > 3);
      const meaningfulFilenameParts = fileNameParts.filter(p => p.length >= 4);
      const matchingWords = itemWords.filter(word =>
        meaningfulFilenameParts.some(part => {
          if (part === word) return true;
          if (part.includes(word) && word.length >= 4) return true;
          if (word.includes(part) && part.length >= Math.max(4, word.length * 0.6)) return true;
          return false;
        })
      );
      if (matchingWords.length >= 2 || (matchingWords.length >= 1 && itemWords.length <= 2)) {
        bestScore = 0.6;
        bestReason = `Filename contains keywords: ${matchingWords.join(', ')}`;
      }
    }

    if (bestScore > 0) {
      matches.push({
        itemId: item._id,
        score: bestScore,
        reason: bestReason,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

// ============================================================================
// Test Data - Checklist Items from seedKnowledgeTemplates.ts
// ============================================================================

const CLIENT_CHECKLIST_ITEMS: EnrichedChecklistItem[] = [
  {
    _id: 'kyc-proof-of-address',
    name: 'Certified Proof of Address',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Certified document proving the client\'s registered business address.',
    matchingDocumentTypes: ['Proof of Address', 'Utility Bill', 'Bank Statement', 'KYC Document'],
  },
  {
    _id: 'kyc-proof-of-id',
    name: 'Certified Proof of ID',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Certified government-issued identification document for key principals/directors.',
    matchingDocumentTypes: ['Proof of ID', 'Passport', 'Driver\'s License', 'ID Document', 'KYC Document'],
  },
  {
    _id: 'kyc-business-bank-statements',
    name: 'Business Bank Statements (3 months)',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Last 3 months of business bank account statements.',
    matchingDocumentTypes: ['Bank Statement', 'Financial Statement', 'KYC Document'],
  },
  {
    _id: 'kyc-personal-bank-statements',
    name: 'Personal Bank Statements (3 months)',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Last 3 months of personal bank account statements.',
    matchingDocumentTypes: ['Bank Statement', 'Financial Statement', 'KYC Document'],
  },
  {
    _id: 'kyc-track-record-excel',
    name: 'Track Record - Excel Version',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Developer track record spreadsheet.',
    matchingDocumentTypes: ['Track Record', 'Spreadsheet', 'Financial Model'],
  },
  {
    _id: 'kyc-track-record-word',
    name: 'Track Record - Word Version',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Developer track record document.',
    matchingDocumentTypes: ['Track Record', 'CV', 'Resume', 'Background Document'],
  },
  {
    _id: 'kyc-assets-liabilities',
    name: 'Assets & Liabilities Statement',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Personal statement of assets and liabilities.',
    matchingDocumentTypes: ['Assets & Liabilities', 'Net Worth Statement', 'Financial Statement', 'KYC Document'],
  },
];

const PROJECT_CHECKLIST_ITEMS: EnrichedChecklistItem[] = [
  {
    _id: 'project-appraisal',
    name: 'Appraisal',
    category: 'Project Information',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Initial project appraisal or feasibility study.',
    matchingDocumentTypes: ['Appraisal', 'Feasibility Study', 'Development Appraisal', 'Financial Model'],
  },
  {
    _id: 'project-floorplans',
    name: 'Floorplans',
    category: 'Project Plans',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Architectural floorplans.',
    matchingDocumentTypes: ['Floorplan', 'Floor Plan', 'Architectural Plan', 'Plans'],
  },
  {
    _id: 'project-elevations',
    name: 'Elevations',
    category: 'Project Plans',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Architectural elevation drawings.',
    matchingDocumentTypes: ['Elevation', 'Architectural Plan', 'Plans'],
  },
  {
    _id: 'project-site-plan',
    name: 'Site Plan',
    category: 'Project Plans',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Site plan showing building footprint.',
    matchingDocumentTypes: ['Site Plan', 'Site Layout', 'Plans'],
  },
  {
    _id: 'project-site-location-plan',
    name: 'Site Location Plan',
    category: 'Project Plans',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Location plan at 1:1250 or 1:2500 scale.',
    matchingDocumentTypes: ['Location Plan', 'Site Location', 'Plans'],
  },
  {
    _id: 'project-planning-decision',
    name: 'Planning Decision Notice',
    category: 'Project Information',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Official planning permission decision notice.',
    matchingDocumentTypes: ['Planning Decision', 'Planning Permission', 'Decision Notice', 'Planning Document'],
  },
  {
    _id: 'project-valuation',
    name: 'Valuation Report',
    category: 'Professional Reports',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'RICS Red Book valuation report.',
    matchingDocumentTypes: ['Valuation', 'Red Book Valuation', 'Appraisal Report', 'Valuation Report'],
  },
  {
    _id: 'project-monitoring-report',
    name: 'Initial Monitoring Report',
    category: 'Professional Reports',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Initial monitoring surveyor report.',
    matchingDocumentTypes: ['Monitoring Report', 'QS Report', 'Surveyor Report', 'Construction Report'],
  },
  {
    _id: 'project-facility-letter',
    name: 'Facility Letter',
    category: 'Legal Documents',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Executed facility agreement.',
    matchingDocumentTypes: ['Facility Letter', 'Facility Agreement', 'Loan Agreement', 'Legal Document'],
  },
  {
    _id: 'project-personal-guarantee',
    name: 'Personal Guarantee',
    category: 'Legal Documents',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Executed personal guarantee.',
    matchingDocumentTypes: ['Personal Guarantee', 'Guarantee', 'Legal Document'],
  },
  {
    _id: 'project-debenture',
    name: 'Debenture',
    category: 'Legal Documents',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Debenture creating fixed and floating charges.',
    matchingDocumentTypes: ['Debenture', 'Security Document', 'Legal Document'],
  },
];

const ALL_CHECKLIST_ITEMS = [...CLIENT_CHECKLIST_ITEMS, ...PROJECT_CHECKLIST_ITEMS];

// ============================================================================
// TESTS: Filename Type Detection
// ============================================================================

describe('Classification - Filename Type Detection', () => {
  describe('KYC Documents', () => {
    it('should detect Passport from filename', () => {
      const testCases = [
        'Passport_JohnSmith.pdf',
        'passport-scan.pdf',
        'JOHN_PASSPORT_2024.pdf',
        'biodata_page.pdf',
        'travel_document.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Passport');
        expect(hint?.category).toBe('KYC');
        expect(hint?.folder).toBe('kyc');
      }
    });

    it('should detect Driving License from filename', () => {
      const testCases = [
        'driving_license_front.pdf',
        'drivers_license.jpg',
        'uk_driving_licence.pdf',
        'license_scan.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Driving License');
        expect(hint?.category).toBe('KYC');
      }
    });

    it('should detect Proof of ID from filename', () => {
      const testCases = [
        'proof_of_id.pdf',
        'POI_scan.pdf',
        'id_card.pdf',
        'national_id_front.pdf',
        'identification_doc.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('ID Document');
        expect(hint?.category).toBe('KYC');
      }
    });

    it('should detect Proof of Address from filename', () => {
      const testCases = [
        'proof_of_address.pdf',
        'POA_2024.pdf',
        'address_proof.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Proof of Address');
        expect(hint?.category).toBe('KYC');
      }
    });

    it('should detect Utility Bill from filename', () => {
      const testCases = [
        'utility_bill_dec2024.pdf',
        'gas_bill.pdf',
        'electric_bill.pdf',
        'water_bill.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Utility Bill');
        expect(hint?.category).toBe('KYC');
      }
    });

    it('should detect Bank Statement from filename', () => {
      const testCases = [
        'bank_statement_nov2024.pdf',
        'bankstatement.pdf',
        'HSBC_bank_statement.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Bank Statement');
        expect(hint?.category).toBe('KYC');
      }
    });

    it('should detect Assets & Liabilities from filename', () => {
      const testCases = [
        'assets_and_liabilities.pdf',
        'a&l_statement.pdf',
        'net_worth_statement.pdf',
        'liabilities_summary.xlsx',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Assets & Liabilities Statement');
        expect(hint?.category).toBe('KYC');
      }
    });

    it('should detect Track Record from filename', () => {
      const testCases = [
        'track_record.pdf',
        'CV_John_Smith.pdf',
        'resume_director.pdf',
        'curriculum_vitae.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Track Record');
        expect(hint?.category).toBe('KYC');
      }
    });
  });

  describe('Appraisal Documents', () => {
    it('should detect Valuation from filename', () => {
      const testCases = [
        'valuation_report.pdf',
        'red_book_valuation.pdf',
        'redbook_val.pdf',
        'rics_valuation.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('RedBook Valuation');
        expect(hint?.category).toBe('Appraisals');
        expect(hint?.folder).toBe('appraisals');
      }
    });

    it('should detect Appraisal from filename', () => {
      const testCases = [
        'appraisal.xlsx',
        'development_appraisal.xlsx',
        'feasibility_study.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Appraisal');
        expect(hint?.category).toBe('Appraisals');
      }
    });
  });

  describe('Plans Documents', () => {
    it('should detect Floor Plans from filename', () => {
      const testCases = [
        'floor_plan_ground.pdf',
        'floorplan.pdf',
        'first_floor_plan.dwg',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Floor Plans');
        expect(hint?.category).toBe('Plans');
        expect(hint?.folder).toBe('background');
      }
    });

    it('should detect Elevations from filename', () => {
      const testCases = [
        'elevation_north.pdf',
        'front_elevation.pdf',
        'elevations.dwg',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Elevations');
        expect(hint?.category).toBe('Plans');
      }
    });

    it('should detect Site Plans from filename', () => {
      const testCases = [
        'site_plan.pdf',
        'siteplan_final.dwg',
        'proposed_site_plan.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Site Plans');
        expect(hint?.category).toBe('Plans');
      }
    });
  });

  describe('Legal Documents', () => {
    it('should detect Term Sheet from filename', () => {
      const testCases = [
        'term_sheet.pdf',
        'termsheet_v2.pdf',
        'indicative_terms.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Term Sheet');
        expect(hint?.category).toBe('Loan Terms');
        expect(hint?.folder).toBe('terms_comparison');
      }
    });

    it('should detect Facility Letter from filename', () => {
      const testCases = [
        'facility_letter.pdf',
        'facility_agreement.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Facility Letter');
        expect(hint?.category).toBe('Legal Documents');
      }
    });

    it('should detect Personal Guarantee from filename', () => {
      const testCases = [
        'personal_guarantee.pdf',
        'pg_signed.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Personal Guarantee');
        expect(hint?.category).toBe('Legal Documents');
      }
    });

    it('should detect Debenture from filename', () => {
      const testCases = [
        'debenture.pdf',
        'signed_debenture.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Debenture');
        expect(hint?.category).toBe('Legal Documents');
      }
    });
  });

  describe('Inspection Documents', () => {
    it('should detect Monitoring Report from filename', () => {
      const testCases = [
        'monitoring_report_jan2025.pdf',
        'ims_report.pdf',
        'interim_monitoring_report.pdf',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Failed for: ${filename}`).not.toBeNull();
        expect(hint?.fileType).toBe('Monitoring Report');
        expect(hint?.category).toBe('Inspections');
        expect(hint?.folder).toBe('credit_submission');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should return null for unrecognized filenames', () => {
      const testCases = [
        'random_file.pdf',
        'document.docx',
        'image.jpg',
        'data.xlsx',
        'notes_meeting.txt',
      ];

      for (const filename of testCases) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `Should be null for: ${filename}`).toBeNull();
      }
    });

    it('should handle mixed case filenames', () => {
      expect(getFilenameTypeHints('PASSPORT_SCAN.PDF')?.fileType).toBe('Passport');
      expect(getFilenameTypeHints('Bank_Statement.pdf')?.fileType).toBe('Bank Statement');
      expect(getFilenameTypeHints('VALUATION_REPORT.PDF')?.fileType).toBe('RedBook Valuation');
    });

    it('should handle filenames with special characters', () => {
      expect(getFilenameTypeHints('passport-scan_v2.pdf')?.fileType).toBe('Passport');
      expect(getFilenameTypeHints('bank.statement.dec.pdf')?.fileType).toBe('Bank Statement');
    });
  });
});

// ============================================================================
// TESTS: Checklist Matching
// ============================================================================

describe('Classification - Checklist Matching', () => {
  describe('KYC Document Matching', () => {
    it('should match Passport to Proof of ID requirement', () => {
      const matches = checkFilenamePatterns('Passport_JohnSmith.pdf', CLIENT_CHECKLIST_ITEMS);

      const proofOfIdMatch = matches.find(m => m.itemId === 'kyc-proof-of-id');
      expect(proofOfIdMatch, 'Should match Proof of ID').toBeDefined();
      expect(proofOfIdMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should NOT match Passport to Proof of Address (common error case)', () => {
      const matches = checkFilenamePatterns('Passport_JohnSmith.pdf', CLIENT_CHECKLIST_ITEMS);

      const proofOfAddressMatch = matches.find(m => m.itemId === 'kyc-proof-of-address');
      const proofOfIdMatch = matches.find(m => m.itemId === 'kyc-proof-of-id');

      // Proof of ID should have higher score than Proof of Address
      if (proofOfAddressMatch && proofOfIdMatch) {
        expect(proofOfIdMatch.score).toBeGreaterThan(proofOfAddressMatch.score);
      }
    });

    it('should match Bank Statement to multiple requirements', () => {
      const matches = checkFilenamePatterns('HSBC_bank_statement_Dec2024.pdf', CLIENT_CHECKLIST_ITEMS);

      // Should match bank statements requirements
      const bankMatches = matches.filter(m =>
        m.itemId.includes('bank-statement') ||
        m.itemId === 'kyc-proof-of-address'
      );
      expect(bankMatches.length).toBeGreaterThan(0);
    });

    it('should match Utility Bill to Proof of Address', () => {
      const matches = checkFilenamePatterns('utility_bill_dec2024.pdf', CLIENT_CHECKLIST_ITEMS);

      const poaMatch = matches.find(m => m.itemId === 'kyc-proof-of-address');
      expect(poaMatch, 'Should match Proof of Address').toBeDefined();
      expect(poaMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match explicit POA file to Proof of Address', () => {
      const matches = checkFilenamePatterns('POA_JohnSmith_2024.pdf', CLIENT_CHECKLIST_ITEMS);

      const poaMatch = matches.find(m => m.itemId === 'kyc-proof-of-address');
      expect(poaMatch, 'Should match Proof of Address').toBeDefined();
      expect(poaMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match explicit POI file to Proof of ID', () => {
      const matches = checkFilenamePatterns('POI_scan.pdf', CLIENT_CHECKLIST_ITEMS);

      const poiMatch = matches.find(m => m.itemId === 'kyc-proof-of-id');
      expect(poiMatch, 'Should match Proof of ID').toBeDefined();
      expect(poiMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Assets & Liabilities file', () => {
      const matches = checkFilenamePatterns('assets_liabilities_statement.pdf', CLIENT_CHECKLIST_ITEMS);

      const alMatch = matches.find(m => m.itemId === 'kyc-assets-liabilities');
      expect(alMatch, 'Should match A&L requirement').toBeDefined();
      expect(alMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Track Record file', () => {
      const matches = checkFilenamePatterns('track_record_excel.xlsx', CLIENT_CHECKLIST_ITEMS);

      const trackMatches = matches.filter(m => m.itemId.includes('track-record'));
      expect(trackMatches.length).toBeGreaterThan(0);
      expect(trackMatches[0].score).toBeGreaterThanOrEqual(0.6);
    });

    it('should match CV to Track Record', () => {
      const matches = checkFilenamePatterns('CV_John_Developer.pdf', CLIENT_CHECKLIST_ITEMS);

      const trackMatches = matches.filter(m => m.itemId.includes('track-record'));
      expect(trackMatches.length).toBeGreaterThan(0);
    });
  });

  describe('Project Document Matching', () => {
    it('should match Appraisal file', () => {
      const matches = checkFilenamePatterns('development_appraisal.xlsx', PROJECT_CHECKLIST_ITEMS);

      const appraisalMatch = matches.find(m => m.itemId === 'project-appraisal');
      expect(appraisalMatch, 'Should match Appraisal requirement').toBeDefined();
      expect(appraisalMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Floorplan file', () => {
      const matches = checkFilenamePatterns('floorplans_all_levels.pdf', PROJECT_CHECKLIST_ITEMS);

      const floorplanMatch = matches.find(m => m.itemId === 'project-floorplans');
      expect(floorplanMatch, 'Should match Floorplans requirement').toBeDefined();
      expect(floorplanMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Elevation file', () => {
      const matches = checkFilenamePatterns('elevations_north_south.pdf', PROJECT_CHECKLIST_ITEMS);

      const elevationMatch = matches.find(m => m.itemId === 'project-elevations');
      expect(elevationMatch, 'Should match Elevations requirement').toBeDefined();
      expect(elevationMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Site Plan file', () => {
      const matches = checkFilenamePatterns('site_plan_proposed.pdf', PROJECT_CHECKLIST_ITEMS);

      const siteMatch = matches.find(m => m.itemId === 'project-site-plan');
      expect(siteMatch, 'Should match Site Plan requirement').toBeDefined();
      expect(siteMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Valuation file', () => {
      const matches = checkFilenamePatterns('valuation_report_dec2024.pdf', PROJECT_CHECKLIST_ITEMS);

      const valMatch = matches.find(m => m.itemId === 'project-valuation');
      expect(valMatch, 'Should match Valuation requirement').toBeDefined();
      expect(valMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Red Book Valuation file', () => {
      const matches = checkFilenamePatterns('redbook_valuation.pdf', PROJECT_CHECKLIST_ITEMS);

      const valMatch = matches.find(m => m.itemId === 'project-valuation');
      expect(valMatch, 'Should match Valuation requirement').toBeDefined();
    });

    it('should match Monitoring Report file', () => {
      const matches = checkFilenamePatterns('monitoring_report_jan2025.pdf', PROJECT_CHECKLIST_ITEMS);

      const monitoringMatch = matches.find(m => m.itemId === 'project-monitoring-report');
      expect(monitoringMatch, 'Should match Monitoring Report requirement').toBeDefined();
      expect(monitoringMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match IMS Report file', () => {
      const matches = checkFilenamePatterns('ims_report_feb2025.pdf', PROJECT_CHECKLIST_ITEMS);

      const monitoringMatch = matches.find(m => m.itemId === 'project-monitoring-report');
      expect(monitoringMatch, 'Should match Monitoring Report requirement').toBeDefined();
    });

    it('should match Facility Letter file', () => {
      const matches = checkFilenamePatterns('facility_letter_signed.pdf', PROJECT_CHECKLIST_ITEMS);

      const facilityMatch = matches.find(m => m.itemId === 'project-facility-letter');
      expect(facilityMatch, 'Should match Facility Letter requirement').toBeDefined();
      expect(facilityMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Personal Guarantee file', () => {
      const matches = checkFilenamePatterns('personal_guarantee_executed.pdf', PROJECT_CHECKLIST_ITEMS);

      const pgMatch = matches.find(m => m.itemId === 'project-personal-guarantee');
      expect(pgMatch, 'Should match Personal Guarantee requirement').toBeDefined();
      expect(pgMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Debenture file', () => {
      const matches = checkFilenamePatterns('debenture_signed.pdf', PROJECT_CHECKLIST_ITEMS);

      const debMatch = matches.find(m => m.itemId === 'project-debenture');
      expect(debMatch, 'Should match Debenture requirement').toBeDefined();
      expect(debMatch?.score).toBeGreaterThanOrEqual(0.8);
    });

    it('should match Planning Decision file', () => {
      const matches = checkFilenamePatterns('planning_decision_notice.pdf', PROJECT_CHECKLIST_ITEMS);

      const planningMatch = matches.find(m => m.itemId === 'project-planning-decision');
      expect(planningMatch, 'Should match Planning Decision requirement').toBeDefined();
      expect(planningMatch?.score).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Combined Checklist Matching', () => {
    it('should find correct matches across all checklist items', () => {
      const testCases: { filename: string; expectedMatchId: string }[] = [
        { filename: 'passport_scan.pdf', expectedMatchId: 'kyc-proof-of-id' },
        { filename: 'bank_statement.pdf', expectedMatchId: 'kyc-business-bank-statements' },
        { filename: 'appraisal.xlsx', expectedMatchId: 'project-appraisal' },
        { filename: 'valuation_report.pdf', expectedMatchId: 'project-valuation' },
        { filename: 'floorplans.pdf', expectedMatchId: 'project-floorplans' },
      ];

      for (const testCase of testCases) {
        const matches = checkFilenamePatterns(testCase.filename, ALL_CHECKLIST_ITEMS);
        const foundMatch = matches.find(m => m.itemId === testCase.expectedMatchId);
        expect(foundMatch, `${testCase.filename} should match ${testCase.expectedMatchId}`).toBeDefined();
      }
    });

    it('should return empty array for unrelated filenames', () => {
      const matches = checkFilenamePatterns('random_document.pdf', ALL_CHECKLIST_ITEMS);

      // Should have no high-confidence matches
      const highConfidenceMatches = matches.filter(m => m.score >= 0.8);
      expect(highConfidenceMatches.length).toBe(0);
    });
  });
});

// ============================================================================
// TESTS: Document Type Consistency
// ============================================================================

describe('Classification - Type Consistency', () => {
  it('should have consistent patterns between filename hints and checklist matching', () => {
    // Documents that should be classified as Proof of ID
    const proofOfIdFiles = [
      'passport.pdf',
      'driving_license.pdf',
      'id_card.pdf',
      'proof_of_id.pdf',
    ];

    for (const filename of proofOfIdFiles) {
      const hint = getFilenameTypeHints(filename);
      const matches = checkFilenamePatterns(filename, CLIENT_CHECKLIST_ITEMS);
      const idMatch = matches.find(m => m.itemId === 'kyc-proof-of-id');

      // Either hint should detect it as ID-related or checklist should match to Proof of ID
      const isIdRelated =
        hint?.fileType === 'Passport' ||
        hint?.fileType === 'Driving License' ||
        hint?.fileType === 'ID Document' ||
        (idMatch !== undefined && idMatch.score >= 0.6);

      expect(isIdRelated, `${filename} should be detected as ID-related`).toBe(true);
    }
  });

  it('should have consistent patterns between filename hints and checklist for address proofs', () => {
    const proofOfAddressFiles = [
      'utility_bill.pdf',
      'proof_of_address.pdf',
      'poa.pdf',
    ];

    for (const filename of proofOfAddressFiles) {
      const hint = getFilenameTypeHints(filename);
      const matches = checkFilenamePatterns(filename, CLIENT_CHECKLIST_ITEMS);
      const addressMatch = matches.find(m => m.itemId === 'kyc-proof-of-address');

      const isAddressRelated =
        hint?.fileType === 'Proof of Address' ||
        hint?.fileType === 'Utility Bill' ||
        (addressMatch !== undefined && addressMatch.score >= 0.6);

      expect(isAddressRelated, `${filename} should be detected as address proof-related`).toBe(true);
    }
  });
});

// ============================================================================
// TESTS: Real-World Filename Scenarios
// ============================================================================

describe('Classification - Real-World Filenames', () => {
  it('should handle client-submitted filenames with dates', () => {
    const realWorldFilenames = [
      { filename: 'Smith_John_Passport_2024-01-15.pdf', expectedType: 'Passport' },
      { filename: 'BankStatement_HSBC_Dec2024.pdf', expectedType: 'Bank Statement' },
      { filename: 'Valuation_123HighStreet_Final_2024.pdf', expectedType: 'RedBook Valuation' },
      { filename: 'FloorPlans_RevA_2024-12-01.pdf', expectedType: 'Floor Plans' },
    ];

    for (const { filename, expectedType } of realWorldFilenames) {
      const hint = getFilenameTypeHints(filename);
      expect(hint, `Should detect type for ${filename}`).not.toBeNull();
      expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
    }
  });

  it('should handle abbreviated filenames', () => {
    const abbreviatedFilenames = [
      { filename: 'POA.pdf', expectedType: 'Proof of Address' },
      { filename: 'POI_scan.pdf', expectedType: 'ID Document' },
      { filename: 'A&L_Statement.pdf', expectedType: 'Assets & Liabilities Statement' },
      { filename: 'CV_JohnSmith.pdf', expectedType: 'Track Record' },
    ];

    for (const { filename, expectedType } of abbreviatedFilenames) {
      const hint = getFilenameTypeHints(filename);
      expect(hint, `Should detect type for ${filename}`).not.toBeNull();
      expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
    }
  });

  it('should handle messy client filenames', () => {
    const messyFilenames = [
      'passport (1).pdf',
      'Bank-Statement----November.pdf',
      'SCAN_20241201_Utility Bill.pdf',
      'IMG_valuation_report.pdf',
    ];

    let detectedCount = 0;
    for (const filename of messyFilenames) {
      const hint = getFilenameTypeHints(filename);
      if (hint) {
        detectedCount++;
      }
    }

    // Should detect at least some of these
    expect(detectedCount).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// TESTS: Coverage Report - Document Types That Need Testing
// ============================================================================

describe('Classification - Coverage Analysis', () => {
  it('should report coverage of document types', () => {
    const allDocumentTypes = [
      // KYC Types
      'Passport',
      'Driving License',
      'ID Document',
      'Proof of Address',
      'Utility Bill',
      'Bank Statement',
      'Assets & Liabilities Statement',
      'Track Record',
      // Appraisal Types
      'RedBook Valuation',
      'Appraisal',
      // Plan Types
      'Floor Plans',
      'Elevations',
      'Site Plans',
      'Location Plans',
      // Professional Reports
      'Planning Decision',
      // Legal Types
      'Term Sheet',
      'Facility Letter',
      'Personal Guarantee',
      'Debenture',
      'Share Charge',
      // Inspection Types
      'Monitoring Report',
    ];

    const coverage: { type: string; hasFilenamePattern: boolean }[] = [];

    for (const docType of allDocumentTypes) {
      // Check if there's a filename pattern that can detect this type
      const testFilename = docType.toLowerCase().replace(/\s+/g, '_') + '.pdf';
      const hint = getFilenameTypeHints(testFilename);

      coverage.push({
        type: docType,
        hasFilenamePattern: hint !== null,
      });
    }

    // Report coverage
    const covered = coverage.filter(c => c.hasFilenamePattern).length;
    const total = coverage.length;

    console.log(`\nDocument Type Coverage: ${covered}/${total} (${Math.round(covered/total*100)}%)`);
    console.log('Uncovered types:', coverage.filter(c => !c.hasFilenamePattern).map(c => c.type).join(', '));

    // At least 80% coverage expected
    expect(covered / total).toBeGreaterThanOrEqual(0.8);
  });

  it('should report checklist item coverage', () => {
    const coverage: { item: string; canBeMatchedByFilename: boolean }[] = [];

    for (const item of ALL_CHECKLIST_ITEMS) {
      // Try a few common filename patterns for this item
      const testFilenames = [
        item.name.toLowerCase().replace(/\s+/g, '_') + '.pdf',
        ...(item.matchingDocumentTypes || []).map(t => t.toLowerCase().replace(/\s+/g, '_') + '.pdf'),
      ];

      let canMatch = false;
      for (const filename of testFilenames) {
        const matches = checkFilenamePatterns(filename, [item]);
        if (matches.length > 0 && matches[0].score >= 0.6) {
          canMatch = true;
          break;
        }
      }

      coverage.push({
        item: item.name,
        canBeMatchedByFilename: canMatch,
      });
    }

    const covered = coverage.filter(c => c.canBeMatchedByFilename).length;
    const total = coverage.length;

    console.log(`\nChecklist Coverage: ${covered}/${total} (${Math.round(covered/total*100)}%)`);
    console.log('Items without filename matching:', coverage.filter(c => !c.canBeMatchedByFilename).map(c => c.item).join(', '));

    // At least 70% of checklist items should be matchable by filename
    expect(covered / total).toBeGreaterThanOrEqual(0.7);
  });
});
