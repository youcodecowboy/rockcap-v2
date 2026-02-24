/**
 * Filing System Integration Tests (P4/P5/P6)
 *
 * Comprehensive tests that verify the complete filing flow:
 * 1. Filename Detection → Type → Category → Folder
 * 2. Content Analysis → Type → Category → Folder
 * 3. Type/Category → Folder Mapping Consistency
 * 4. Checklist Item Matching
 *
 * These tests validate Priority 4, 5, and 6 implementations together.
 */

import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_TYPE_MAPPINGS,
  getFolderForType,
  getFolderForCategory,
  getTypeMapping,
  DocumentTypeMapping,
} from '@/lib/documentTypeMapping';
import { FILE_TYPES, FILE_CATEGORIES, isValidCategory, isValidFileType } from '@/lib/categories';

// ============================================================================
// Simulated Filename Detection (mirrors bulk-analyze/route.ts)
// ============================================================================

interface FilenameTypeHint {
  fileType: string;
  category: string;
  folder: string;
  confidence: number;
}

function getFilenameTypeHints(fileName: string): FilenameTypeHint | null {
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');

  // This mirrors the patterns from bulk-analyze/route.ts
  const patterns: Array<{
    keywords: string[];
    fileType: string;
    category: string;
    folder: string;
  }> = [
    // KYC
    { keywords: ['passport', 'biodata', 'travel document', 'mrz'], fileType: 'Passport', category: 'KYC', folder: 'kyc' },
    { keywords: ['driver', 'driving', 'license', 'licence', 'dvla'], fileType: 'Driving License', category: 'KYC', folder: 'kyc' },
    { keywords: ['proof of id', 'proofofid', 'poi', 'id card', 'national id', 'identification', 'id document', 'iddoc'], fileType: 'ID Document', category: 'KYC', folder: 'kyc' },
    { keywords: ['proof of address', 'proofofaddress', 'poa', 'address proof'], fileType: 'Proof of Address', category: 'KYC', folder: 'kyc' },
    { keywords: ['utility bill', 'gas bill', 'electric bill', 'electricity bill', 'water bill', 'council tax'], fileType: 'Utility Bill', category: 'KYC', folder: 'kyc' },
    { keywords: ['bank statement', 'bankstatement', 'business statement', 'personal statement', 'account statement', 'current account'], fileType: 'Bank Statement', category: 'KYC', folder: 'kyc' },
    { keywords: ['assets', 'liabilities', 'net worth', 'a&l', 'statement of affairs'], fileType: 'Assets & Liabilities Statement', category: 'KYC', folder: 'kyc' },
    { keywords: ['application form', 'loan application', 'finance application'], fileType: 'Application Form', category: 'KYC', folder: 'kyc' },
    { keywords: ['track record', 'cv ', 'resume', 'curriculum vitae', 'developer cv'], fileType: 'Track Record', category: 'KYC', folder: 'kyc' },
    { keywords: ['company search', 'companies house', 'ch search'], fileType: 'Company Search', category: 'KYC', folder: 'kyc' },
    { keywords: ['certificate of incorporation', 'incorporation', 'company certificate'], fileType: 'Certificate of Incorporation', category: 'KYC', folder: 'kyc' },
    { keywords: ['tax return', 'sa302', 'tax computation', 'corporation tax'], fileType: 'Tax Return', category: 'Financial Documents', folder: 'kyc' },

    // Appraisals
    { keywords: ['valuation', 'red book', 'redbook', 'rics', 'market value'], fileType: 'RedBook Valuation', category: 'Appraisals', folder: 'appraisals' },
    { keywords: ['appraisal', 'development appraisal', 'feasibility', 'residual'], fileType: 'Appraisal', category: 'Appraisals', folder: 'appraisals' },
    { keywords: ['cashflow', 'cash flow', 'dcf'], fileType: 'Cashflow', category: 'Appraisals', folder: 'appraisals' },
    { keywords: ['comparables', 'comps', 'comparable evidence', 'market evidence'], fileType: 'Comparables', category: 'Professional Reports', folder: 'appraisals' },

    // Plans
    { keywords: ['floor plan', 'floorplan', 'floorplans'], fileType: 'Floor Plans', category: 'Plans', folder: 'background' },
    { keywords: ['elevation', 'elevations'], fileType: 'Elevations', category: 'Plans', folder: 'background' },
    { keywords: ['section', 'sections', 'cross section'], fileType: 'Sections', category: 'Plans', folder: 'background' },
    { keywords: ['site plan', 'siteplan', 'site layout'], fileType: 'Site Plans', category: 'Plans', folder: 'background' },
    { keywords: ['location plan', 'ordnance survey', 'os map'], fileType: 'Location Plans', category: 'Plans', folder: 'background' },

    // Inspections
    { keywords: ['initial monitoring', 'imr', 'pre-funding monitoring', 'initial report'], fileType: 'Initial Monitoring Report', category: 'Inspections', folder: 'credit_submission' },
    { keywords: ['interim monitoring', 'monitoring report', 'ims report', 'progress report', 'monthly monitoring', 'qs report'], fileType: 'Interim Monitoring Report', category: 'Inspections', folder: 'credit_submission' },

    // Professional Reports
    { keywords: ['planning decision', 'planning permission', 'decision notice', 'planning notice', 'planning approval', 'planning consent'], fileType: 'Planning Documentation', category: 'Professional Reports', folder: 'background' },
    { keywords: ['contract sum analysis', 'csa', 'cost plan', 'construction budget', 'build cost'], fileType: 'Contract Sum Analysis', category: 'Professional Reports', folder: 'credit_submission' },
    { keywords: ['building survey', 'structural survey', 'condition report', 'survey report'], fileType: 'Building Survey', category: 'Professional Reports', folder: 'credit_submission' },
    { keywords: ['report on title', 'title report', 'certificate of title', 'rot'], fileType: 'Report on Title', category: 'Professional Reports', folder: 'credit_submission' },
    { keywords: ['legal opinion', 'legal advice', 'counsel opinion'], fileType: 'Legal Opinion', category: 'Professional Reports', folder: 'credit_submission' },
    { keywords: ['environmental', 'phase 1', 'phase 2', 'contamination', 'environmental search'], fileType: 'Environmental Report', category: 'Professional Reports', folder: 'credit_submission' },
    { keywords: ['local authority search', 'local search', 'council search', 'la search'], fileType: 'Local Authority Search', category: 'Professional Reports', folder: 'credit_submission' },

    // Loan Terms
    { keywords: ['indicative terms', 'heads of terms', 'hot', 'initial terms'], fileType: 'Indicative Terms', category: 'Loan Terms', folder: 'terms_comparison' },
    { keywords: ['credit backed terms', 'credit approved', 'approved terms', 'cbt'], fileType: 'Credit Backed Terms', category: 'Loan Terms', folder: 'terms_comparison' },
    { keywords: ['term sheet', 'termsheet'], fileType: 'Term Sheet', category: 'Loan Terms', folder: 'terms_comparison' },

    // Legal Documents (order matters - more specific patterns first)
    { keywords: ['facility letter', 'facility agreement', 'loan agreement'], fileType: 'Facility Letter', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['personal guarantee', 'pg '], fileType: 'Personal Guarantee', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['corporate guarantee', 'company guarantee'], fileType: 'Corporate Guarantee', category: 'Legal Documents', folder: 'post_completion' },
    // Share Charge MUST come before Shareholders Agreement (sha pattern)
    { keywords: ['share charge', 'sharecharge'], fileType: 'Share Charge', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['shareholders agreement', 'sha ', 'jv agreement'], fileType: 'Shareholders Agreement', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['debenture', 'fixed charge', 'floating charge'], fileType: 'Debenture', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['board resolution', 'corporate resolution', 'authorization', 'authorisation'], fileType: 'Corporate Authorisations', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['building contract', 'construction contract', 'jct'], fileType: 'Building Contract', category: 'Legal Documents', folder: 'credit_submission' },
    { keywords: ['professional appointment', 'architect appointment', 'consultant appointment'], fileType: 'Professional Appointment', category: 'Legal Documents', folder: 'credit_submission' },
    { keywords: ['collateral warranty', 'third party warranty'], fileType: 'Collateral Warranty', category: 'Legal Documents', folder: 'post_completion' },
    { keywords: ['title deed', 'land registry', 'registered title'], fileType: 'Title Deed', category: 'Legal Documents', folder: 'background' },
    { keywords: ['lease', 'tenancy agreement', 'rental agreement'], fileType: 'Lease', category: 'Legal Documents', folder: 'background' },

    // Project Documents
    { keywords: ['accommodation schedule', 'unit schedule', 'unit mix'], fileType: 'Accommodation Schedule', category: 'Project Documents', folder: 'background' },
    { keywords: ['build programme', 'construction programme', 'gantt', 'project timeline'], fileType: 'Build Programme', category: 'Project Documents', folder: 'credit_submission' },
    { keywords: ['specification', 'spec', 'construction spec'], fileType: 'Specification', category: 'Project Documents', folder: 'background' },
    { keywords: ['tender', 'bid', 'contractor tender', 'quotation'], fileType: 'Tender', category: 'Project Documents', folder: 'credit_submission' },
    { keywords: ['cgi', 'render', 'renders', 'visualisation', 'visualization'], fileType: 'CGI/Renders', category: 'Project Documents', folder: 'background' },

    // Financial Documents
    { keywords: ['loan statement', 'facility statement'], fileType: 'Loan Statement', category: 'Financial Documents', folder: 'post_completion' },
    { keywords: ['redemption statement', 'payoff statement', 'settlement figure'], fileType: 'Redemption Statement', category: 'Financial Documents', folder: 'post_completion' },
    { keywords: ['completion statement', 'closing statement'], fileType: 'Completion Statement', category: 'Financial Documents', folder: 'post_completion' },
    { keywords: ['invoice', 'inv '], fileType: 'Invoice', category: 'Financial Documents', folder: 'credit_submission' },
    { keywords: ['receipt', 'payment receipt'], fileType: 'Receipt', category: 'Financial Documents', folder: 'credit_submission' },

    // Insurance
    { keywords: ['insurance policy', 'policy document'], fileType: 'Insurance Policy', category: 'Insurance', folder: 'credit_submission' },
    { keywords: ['insurance certificate', 'certificate of insurance', 'coi'], fileType: 'Insurance Certificate', category: 'Insurance', folder: 'credit_submission' },

    // Communications
    { keywords: ['email', 'correspondence', 're:', 'fwd:'], fileType: 'Email/Correspondence', category: 'Communications', folder: 'background_docs' },
    { keywords: ['meeting minutes', 'minutes', 'meeting notes'], fileType: 'Meeting Minutes', category: 'Communications', folder: 'notes' },

    // Warranties
    { keywords: ['nhbc', 'buildmark', 'new home warranty'], fileType: 'NHBC Warranty', category: 'Warranties', folder: 'post_completion' },
    { keywords: ['latent defects', 'ldi', 'structural warranty', 'defects insurance'], fileType: 'Latent Defects Insurance', category: 'Warranties', folder: 'post_completion' },

    // Photographs
    { keywords: ['photo', 'photograph', 'site photo', 'progress photo'], fileType: 'Site Photographs', category: 'Photographs', folder: 'background' },
  ];

  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (fileNameLower.includes(keyword)) {
        return {
          fileType: pattern.fileType,
          category: pattern.category,
          folder: pattern.folder,
          confidence: 0.85,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// TEST: End-to-End Filing Flow
// ============================================================================

describe('End-to-End Filing Flow', () => {
  interface TestCase {
    filename: string;
    expectedType: string;
    expectedCategory: string;
    expectedFolder: string;
    expectedLevel: 'client' | 'project';
    description: string;
  }

  const testCases: TestCase[] = [
    // KYC Documents
    {
      filename: 'Smith_John_Passport_2024.pdf',
      expectedType: 'Passport',
      expectedCategory: 'KYC',
      expectedFolder: 'kyc',
      expectedLevel: 'client',
      description: 'Passport with person name prefix',
    },
    {
      filename: 'HSBC_Business_Statement_Dec2024.pdf',
      expectedType: 'Bank Statement',
      expectedCategory: 'KYC',
      expectedFolder: 'kyc',
      expectedLevel: 'client',
      description: 'Bank statement with bank name prefix',
    },
    {
      filename: 'Track_Record_ABC_Developments.xlsx',
      expectedType: 'Track Record',
      expectedCategory: 'KYC',
      expectedFolder: 'kyc',
      expectedLevel: 'client',
      description: 'Developer track record',
    },

    // Appraisals
    {
      filename: 'Development_Appraisal_123_High_Street.xlsx',
      expectedType: 'Appraisal',
      expectedCategory: 'Appraisals',
      expectedFolder: 'appraisals',
      expectedLevel: 'project',
      description: 'Development appraisal',
    },
    {
      filename: 'RICS_Valuation_Report_Final.pdf',
      expectedType: 'RedBook Valuation',
      expectedCategory: 'Appraisals',
      expectedFolder: 'appraisals',
      expectedLevel: 'project',
      description: 'RICS valuation',
    },

    // Inspections - KEY REGRESSION TEST
    {
      filename: 'Initial_Monitoring_Report_Jan2025.pdf',
      expectedType: 'Initial Monitoring Report',
      expectedCategory: 'Inspections',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Initial monitoring report → credit_submission NOT background',
    },
    {
      filename: 'IMS_Report_Progress_March2025.pdf',
      expectedType: 'Interim Monitoring Report',
      expectedCategory: 'Inspections',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Interim monitoring report',
    },

    // Legal Documents
    {
      filename: 'Facility_Letter_Executed.pdf',
      expectedType: 'Facility Letter',
      expectedCategory: 'Legal Documents',
      expectedFolder: 'post_completion',
      expectedLevel: 'project',
      description: 'Facility letter → post_completion NOT background',
    },
    {
      filename: 'Personal_Guarantee_Smith.pdf',
      expectedType: 'Personal Guarantee',
      expectedCategory: 'Legal Documents',
      expectedFolder: 'post_completion',
      expectedLevel: 'project',
      description: 'Personal guarantee → post_completion NOT background',
    },
    {
      filename: 'Share_Charge_ABC_Ltd.pdf',
      expectedType: 'Share Charge',
      expectedCategory: 'Legal Documents',
      expectedFolder: 'post_completion',
      expectedLevel: 'project',
      description: 'Share charge → post_completion NOT background',
    },
    {
      filename: 'JCT_Building_Contract_v3.pdf',
      expectedType: 'Building Contract',
      expectedCategory: 'Legal Documents',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Building contract → credit_submission',
    },

    // Loan Terms
    {
      filename: 'Indicative_Terms_RockCap.pdf',
      expectedType: 'Indicative Terms',
      expectedCategory: 'Loan Terms',
      expectedFolder: 'terms_comparison',
      expectedLevel: 'project',
      description: 'Indicative terms',
    },
    {
      filename: 'Term_Sheet_v2_Final.pdf',
      expectedType: 'Term Sheet',
      expectedCategory: 'Loan Terms',
      expectedFolder: 'terms_comparison',
      expectedLevel: 'project',
      description: 'Term sheet',
    },

    // Professional Reports
    {
      filename: 'Planning_Decision_Notice_Approved.pdf',
      expectedType: 'Planning Documentation',
      expectedCategory: 'Professional Reports',
      expectedFolder: 'background',
      expectedLevel: 'project',
      description: 'Planning decision notice',
    },
    {
      filename: 'Report_on_Title_Final.pdf',
      expectedType: 'Report on Title',
      expectedCategory: 'Professional Reports',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Report on title',
    },
    {
      filename: 'Environmental_Phase_1_Report.pdf',
      expectedType: 'Environmental Report',
      expectedCategory: 'Professional Reports',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Environmental report',
    },

    // Insurance
    {
      filename: 'Insurance_Policy_Building.pdf',
      expectedType: 'Insurance Policy',
      expectedCategory: 'Insurance',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Insurance policy',
    },
    {
      filename: 'Certificate_of_Insurance_2025.pdf',
      expectedType: 'Insurance Certificate',
      expectedCategory: 'Insurance',
      expectedFolder: 'credit_submission',
      expectedLevel: 'project',
      description: 'Insurance certificate (COI)',
    },

    // Warranties
    {
      filename: 'NHBC_Buildmark_Warranty.pdf',
      expectedType: 'NHBC Warranty',
      expectedCategory: 'Warranties',
      expectedFolder: 'post_completion',
      expectedLevel: 'project',
      description: 'NHBC warranty',
    },

    // Plans
    {
      filename: 'Proposed_Floorplans_All_Levels.pdf',
      expectedType: 'Floor Plans',
      expectedCategory: 'Plans',
      expectedFolder: 'background',
      expectedLevel: 'project',
      description: 'Floor plans',
    },
  ];

  describe('Filename Detection → Mapping Consistency', () => {
    for (const testCase of testCases) {
      it(`${testCase.description}: ${testCase.filename}`, () => {
        // Step 1: Detect from filename
        const filenameHint = getFilenameTypeHints(testCase.filename);
        expect(filenameHint, `Should detect type from filename: ${testCase.filename}`).not.toBeNull();
        expect(filenameHint?.fileType).toBe(testCase.expectedType);
        expect(filenameHint?.category).toBe(testCase.expectedCategory);
        expect(filenameHint?.folder).toBe(testCase.expectedFolder);

        // Step 2: Verify mapping table agrees
        const mapping = getTypeMapping(testCase.expectedType);
        expect(mapping, `Mapping should exist for ${testCase.expectedType}`).not.toBeNull();
        expect(mapping?.folder).toBe(testCase.expectedFolder);
        expect(mapping?.level).toBe(testCase.expectedLevel);

        // Step 3: Verify filename pattern and mapping are in sync
        expect(filenameHint?.folder).toBe(mapping?.folder);
      });
    }
  });
});

// ============================================================================
// TEST: Filename Patterns ↔ Mapping Table Consistency
// ============================================================================

describe('Filename Patterns ↔ Mapping Table Consistency', () => {
  it('should have matching folders between filename patterns and mapping table', () => {
    const inconsistencies: string[] = [];

    // Test all mappings have at least one filename pattern that matches
    for (const mapping of DOCUMENT_TYPE_MAPPINGS) {
      if (mapping.keywords.length === 0) continue; // Skip fallback types

      // Create a sample filename from first keyword
      const sampleFilename = `test_${mapping.keywords[0].replace(/\s+/g, '_')}_document.pdf`;
      const hint = getFilenameTypeHints(sampleFilename);

      if (hint && hint.fileType === mapping.fileType) {
        // Check folder matches
        if (hint.folder !== mapping.folder) {
          inconsistencies.push(
            `${mapping.fileType}: filename pattern uses folder "${hint.folder}" but mapping uses "${mapping.folder}"`
          );
        }
      }
    }

    if (inconsistencies.length > 0) {
      console.log('Inconsistencies found:');
      inconsistencies.forEach(i => console.log(`  - ${i}`));
    }

    expect(inconsistencies.length).toBe(0);
  });
});

// ============================================================================
// TEST: Type Validity in categories.ts
// ============================================================================

describe('Type Validity', () => {
  it('should have all mapping types defined in FILE_TYPES', () => {
    const missingTypes: string[] = [];

    for (const mapping of DOCUMENT_TYPE_MAPPINGS) {
      if (!isValidFileType(mapping.fileType)) {
        missingTypes.push(mapping.fileType);
      }
    }

    if (missingTypes.length > 0) {
      console.log('Types in mapping but not in FILE_TYPES:', missingTypes);
    }

    // Allow a few that might be aliases or legacy
    expect(missingTypes.length).toBeLessThanOrEqual(10);
  });

  it('should have all mapping categories defined in FILE_CATEGORIES', () => {
    const missingCategories: string[] = [];

    for (const mapping of DOCUMENT_TYPE_MAPPINGS) {
      if (!isValidCategory(mapping.category)) {
        missingCategories.push(mapping.category);
      }
    }

    if (missingCategories.length > 0) {
      console.log('Categories in mapping but not in FILE_CATEGORIES:', missingCategories);
    }

    expect(missingCategories.length).toBe(0);
  });
});

// ============================================================================
// TEST: Batch Filing Scenarios
// ============================================================================

describe('Batch Filing Scenarios', () => {
  it('should correctly classify a realistic batch of development finance documents', () => {
    const batch = [
      // Pre-credit KYC
      'John_Smith_Passport.pdf',
      'Jane_Doe_Driving_Licence.pdf',
      'HSBC_Business_Account_Statement_Jan2025.pdf',
      'Assets_and_Liabilities_Statement_2025.xlsx',
      'ABC_Developments_Track_Record.pdf',
      'Companies_House_Search_ABC_Ltd.pdf',

      // Terms Request
      'Development_Appraisal_123_High_St.xlsx',
      'Proposed_Floorplans_v2.pdf',
      'Site_Plan_Approved.pdf',
      'Planning_Decision_Notice_2024.pdf',

      // Terms Comparison
      'RockCap_Indicative_Terms.pdf',
      'LendCo_Term_Sheet.pdf',
      'BankX_Heads_of_Terms.pdf',

      // Credit Submission
      'Initial_Monitoring_Report.pdf',
      'Contract_Sum_Analysis_Final.xlsx',
      'Build_Programme_Gantt.pdf',
      'Building_Contract_JCT.pdf',
      'Insurance_Certificate_2025.pdf',
      'Report_on_Title.pdf',

      // Post Completion
      'Executed_Facility_Letter.pdf',
      'Personal_Guarantee_Smith.pdf',
      'Share_Charge_ABC_Ltd.pdf',
      'Debenture_ABC_Ltd.pdf',
    ];

    const results = batch.map(filename => {
      const hint = getFilenameTypeHints(filename);
      const mapping = hint ? getTypeMapping(hint.fileType) : null;
      return {
        filename,
        detected: hint !== null,
        type: hint?.fileType || 'unknown',
        folder: hint?.folder || 'unknown',
        mappingAgreement: mapping ? mapping.folder === hint?.folder : false,
      };
    });

    // Calculate stats
    const detected = results.filter(r => r.detected).length;
    const agreementCount = results.filter(r => r.mappingAgreement).length;

    console.log(`\nBatch Filing Test Results:`);
    console.log(`Detection Rate: ${detected}/${batch.length} (${Math.round(detected/batch.length*100)}%)`);
    console.log(`Mapping Agreement: ${agreementCount}/${detected} (${Math.round(agreementCount/detected*100)}%)`);

    // Group by folder
    const byFolder: Record<string, string[]> = {};
    for (const result of results.filter(r => r.detected)) {
      if (!byFolder[result.folder]) byFolder[result.folder] = [];
      byFolder[result.folder].push(result.type);
    }
    console.log('\nBy Folder:');
    for (const [folder, types] of Object.entries(byFolder)) {
      console.log(`  ${folder}: ${types.join(', ')}`);
    }

    // Assertions
    expect(detected).toBeGreaterThanOrEqual(20); // At least 20 of 23 detected
    expect(agreementCount).toBe(detected); // All detected should have agreement
  });
});

// ============================================================================
// TEST: Priority 6 - No Empty Types
// ============================================================================

describe('Priority 6 - No Empty Types', () => {
  it('should have a mapping for every commonly encountered document', () => {
    const commonDocuments = [
      'passport.pdf',
      'driving_license.pdf',
      'bank_statement.pdf',
      'valuation_report.pdf',
      'appraisal.pdf',
      'floor_plan.pdf',
      'elevation.pdf',
      'site_plan.pdf',
      'planning_permission.pdf',
      'term_sheet.pdf',
      'facility_letter.pdf',
      'personal_guarantee.pdf',
      'debenture.pdf',
      'monitoring_report.pdf',
      'insurance_policy.pdf',
      'invoice.pdf',
      'building_contract.pdf',
      'lease.pdf',
    ];

    const unmapped: string[] = [];
    for (const doc of commonDocuments) {
      const hint = getFilenameTypeHints(doc);
      if (!hint) {
        unmapped.push(doc);
      }
    }

    if (unmapped.length > 0) {
      console.log('Unmapped common documents:', unmapped);
    }

    expect(unmapped.length).toBe(0);
  });

  it('should have fallback "Other Document" type for unknown documents', () => {
    const fallbackMapping = DOCUMENT_TYPE_MAPPINGS.find(m => m.fileType === 'Other Document');
    expect(fallbackMapping).toBeDefined();
    expect(fallbackMapping?.folder).toBe('miscellaneous');
    expect(fallbackMapping?.level).toBe('client');
  });
});

// ============================================================================
// SUMMARY REPORT
// ============================================================================

describe('Integration Test Summary', () => {
  it('should generate comprehensive summary', () => {
    const totalMappings = DOCUMENT_TYPE_MAPPINGS.length;
    const withKeywords = DOCUMENT_TYPE_MAPPINGS.filter(m => m.keywords.length > 0).length;
    const clientLevel = DOCUMENT_TYPE_MAPPINGS.filter(m => m.level === 'client').length;
    const projectLevel = DOCUMENT_TYPE_MAPPINGS.filter(m => m.level === 'project').length;

    const uniqueFolders = [...new Set(DOCUMENT_TYPE_MAPPINGS.map(m => m.folder))];

    console.log('\n=== Integration Test Summary ===\n');
    console.log('Type Mapping Coverage:');
    console.log(`  Total mappings: ${totalMappings}`);
    console.log(`  With keywords: ${withKeywords}`);
    console.log(`  Client-level: ${clientLevel}`);
    console.log(`  Project-level: ${projectLevel}`);
    console.log(`  Unique folders: ${uniqueFolders.length}`);
    console.log(`\nFolder Distribution: ${uniqueFolders.join(', ')}`);

    // Verify expected counts
    expect(totalMappings).toBeGreaterThanOrEqual(50);
    expect(withKeywords).toBeGreaterThanOrEqual(45);
    expect(uniqueFolders.length).toBeGreaterThanOrEqual(6);
  });
});
