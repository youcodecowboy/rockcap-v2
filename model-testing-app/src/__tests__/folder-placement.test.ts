/**
 * Folder Placement Tests
 *
 * Tests the authoritative Type → Category → Folder mapping system
 * to ensure documents are filed to the correct folders.
 *
 * This addresses the issue where documents get correct type/category
 * but are filed to the wrong folder.
 */

import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_TYPE_MAPPINGS,
  getFolderForType,
  getFolderForCategory,
  getTypeMapping,
  getTypesForCategory,
  getAllCategories,
  getAllFileTypes,
  CATEGORY_FOLDER_DEFAULTS,
  DocumentTypeMapping,
} from '@/lib/documentTypeMapping';

// ============================================================================
// TEST: Mapping Table Completeness
// ============================================================================

describe('Document Type Mapping - Completeness', () => {
  it('should have at least 50 document types defined', () => {
    expect(DOCUMENT_TYPE_MAPPINGS.length).toBeGreaterThanOrEqual(50);
    console.log(`Total document types defined: ${DOCUMENT_TYPE_MAPPINGS.length}`);
  });

  it('should have all required fields for each mapping', () => {
    for (const mapping of DOCUMENT_TYPE_MAPPINGS) {
      expect(mapping.fileType, `Missing fileType in mapping`).toBeDefined();
      expect(mapping.category, `Missing category for ${mapping.fileType}`).toBeDefined();
      expect(mapping.folder, `Missing folder for ${mapping.fileType}`).toBeDefined();
      expect(mapping.level, `Missing level for ${mapping.fileType}`).toMatch(/^(client|project)$/);
      expect(mapping.description, `Missing description for ${mapping.fileType}`).toBeDefined();
      expect(Array.isArray(mapping.keywords), `keywords should be array for ${mapping.fileType}`).toBe(true);
    }
  });

  it('should have no duplicate file types', () => {
    const fileTypes = DOCUMENT_TYPE_MAPPINGS.map(m => m.fileType.toLowerCase());
    const uniqueTypes = new Set(fileTypes);
    expect(uniqueTypes.size).toBe(fileTypes.length);
  });

  it('should cover all expected categories', () => {
    const categories = getAllCategories();
    const expectedCategories = [
      'KYC',
      'Appraisals',
      'Plans',
      'Inspections',
      'Professional Reports',
      'Loan Terms',
      'Legal Documents',
      'Project Documents',
      'Financial Documents',
      'Insurance',
      'Communications',
      'Warranties',
      'Photographs',
      'General',
    ];

    for (const expected of expectedCategories) {
      expect(categories, `Missing category: ${expected}`).toContain(expected);
    }
    console.log(`Categories covered: ${categories.length}`);
  });
});

// ============================================================================
// TEST: Folder Assignment by Type
// ============================================================================

describe('Folder Assignment - By Document Type', () => {
  // KYC Documents → kyc folder (client-level)
  describe('KYC Documents', () => {
    const kycTypes = [
      'Passport',
      'Driving License',
      'ID Document',
      'Proof of Address',
      'Utility Bill',
      'Bank Statement',
      'Assets & Liabilities Statement',
      'Application Form',
      'Track Record',
      'Company Search',
      'Certificate of Incorporation',
    ];

    for (const type of kycTypes) {
      it(`${type} → kyc folder (client-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('kyc');
        expect(result?.level).toBe('client');
      });
    }
  });

  // Appraisals → appraisals folder (project-level)
  describe('Appraisals', () => {
    const appraisalTypes = ['Appraisal', 'RedBook Valuation', 'Cashflow'];

    for (const type of appraisalTypes) {
      it(`${type} → appraisals folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('appraisals');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Plans → background folder (project-level)
  describe('Plans', () => {
    const planTypes = ['Floor Plans', 'Elevations', 'Sections', 'Site Plans', 'Location Plans'];

    for (const type of planTypes) {
      it(`${type} → background folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('background');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Inspections → credit_submission folder (project-level)
  describe('Inspections', () => {
    const inspectionTypes = ['Initial Monitoring Report', 'Interim Monitoring Report'];

    for (const type of inspectionTypes) {
      it(`${type} → credit_submission folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('credit_submission');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Loan Terms → terms_comparison folder (project-level)
  describe('Loan Terms', () => {
    const loanTermTypes = ['Indicative Terms', 'Credit Backed Terms', 'Term Sheet'];

    for (const type of loanTermTypes) {
      it(`${type} → terms_comparison folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('terms_comparison');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Legal Documents - Post Completion → post_completion folder
  describe('Legal Documents - Post Completion', () => {
    const postCompletionLegal = [
      'Facility Letter',
      'Personal Guarantee',
      'Corporate Guarantee',
      'Shareholders Agreement',
      'Share Charge',
      'Debenture',
      'Corporate Authorisations',
      'Collateral Warranty',
    ];

    for (const type of postCompletionLegal) {
      it(`${type} → post_completion folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('post_completion');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Legal Documents - Credit Submission → credit_submission folder
  describe('Legal Documents - Credit Submission', () => {
    const creditSubmissionLegal = ['Building Contract', 'Professional Appointment'];

    for (const type of creditSubmissionLegal) {
      it(`${type} → credit_submission folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('credit_submission');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Legal Documents - Background → background folder
  describe('Legal Documents - Background', () => {
    const backgroundLegal = ['Title Deed', 'Lease'];

    for (const type of backgroundLegal) {
      it(`${type} → background folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('background');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Insurance → credit_submission folder
  describe('Insurance', () => {
    const insuranceTypes = ['Insurance Policy', 'Insurance Certificate'];

    for (const type of insuranceTypes) {
      it(`${type} → credit_submission folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('credit_submission');
        expect(result?.level).toBe('project');
      });
    }
  });

  // Warranties → post_completion folder
  describe('Warranties', () => {
    const warrantyTypes = ['NHBC Warranty', 'Latent Defects Insurance'];

    for (const type of warrantyTypes) {
      it(`${type} → post_completion folder (project-level)`, () => {
        const result = getFolderForType(type);
        expect(result).not.toBeNull();
        expect(result?.folder).toBe('post_completion');
        expect(result?.level).toBe('project');
      });
    }
  });
});

// ============================================================================
// TEST: Category-Based Folder Defaults
// ============================================================================

describe('Category-Based Folder Defaults', () => {
  it('should have defaults for all categories', () => {
    const categories = getAllCategories();
    for (const category of categories) {
      const result = getFolderForCategory(category);
      expect(result, `Missing default for category: ${category}`).toBeDefined();
      expect(result.folder).toBeDefined();
      expect(result.level).toMatch(/^(client|project)$/);
    }
  });

  const categoryExpectations: Array<{ category: string; folder: string; level: 'client' | 'project' }> = [
    { category: 'KYC', folder: 'kyc', level: 'client' },
    { category: 'Appraisals', folder: 'appraisals', level: 'project' },
    { category: 'Plans', folder: 'background', level: 'project' },
    { category: 'Inspections', folder: 'credit_submission', level: 'project' },
    { category: 'Professional Reports', folder: 'credit_submission', level: 'project' },
    { category: 'Loan Terms', folder: 'terms_comparison', level: 'project' },
    { category: 'Legal Documents', folder: 'post_completion', level: 'project' },
    { category: 'Project Documents', folder: 'background', level: 'project' },
    { category: 'Financial Documents', folder: 'post_completion', level: 'project' },
    { category: 'Insurance', folder: 'credit_submission', level: 'project' },
    { category: 'Communications', folder: 'background_docs', level: 'client' },
    { category: 'Warranties', folder: 'post_completion', level: 'project' },
    { category: 'Photographs', folder: 'background', level: 'project' },
    { category: 'General', folder: 'miscellaneous', level: 'client' },
  ];

  for (const { category, folder, level } of categoryExpectations) {
    it(`Category "${category}" defaults to folder "${folder}" (${level}-level)`, () => {
      const result = getFolderForCategory(category);
      expect(result.folder).toBe(folder);
      expect(result.level).toBe(level);
    });
  }
});

// ============================================================================
// TEST: Fallback Behavior
// ============================================================================

describe('Fallback Behavior', () => {
  it('should return miscellaneous for unknown types', () => {
    const result = getFolderForType('Unknown Document Type');
    expect(result).not.toBeNull();
    expect(result?.folder).toBe('miscellaneous');
    expect(result?.level).toBe('client');
  });

  it('should use category fallback when type is unknown but category is known', () => {
    const result = getFolderForType('Some Unknown Type', 'Appraisals');
    expect(result).not.toBeNull();
    expect(result?.folder).toBe('appraisals');
    expect(result?.level).toBe('project');
  });

  it('should return miscellaneous for unknown category', () => {
    const result = getFolderForCategory('Unknown Category');
    expect(result.folder).toBe('miscellaneous');
    expect(result.level).toBe('client');
  });
});

// ============================================================================
// TEST: Specific Problem Cases (Regression Tests)
// ============================================================================

describe('Regression Tests - Previously Problematic Cases', () => {
  it('Initial Monitoring Report should go to credit_submission, not background', () => {
    const result = getFolderForType('Initial Monitoring Report');
    expect(result?.folder).toBe('credit_submission');
    expect(result?.folder).not.toBe('background');
  });

  it('Interim Monitoring Report should go to credit_submission', () => {
    const result = getFolderForType('Interim Monitoring Report');
    expect(result?.folder).toBe('credit_submission');
  });

  it('Facility Letter should go to post_completion, not background', () => {
    const result = getFolderForType('Facility Letter');
    expect(result?.folder).toBe('post_completion');
    expect(result?.folder).not.toBe('background');
  });

  it('Personal Guarantee should go to post_completion, not background', () => {
    const result = getFolderForType('Personal Guarantee');
    expect(result?.folder).toBe('post_completion');
    expect(result?.folder).not.toBe('background');
  });

  it('Share Charge should go to post_completion, not background', () => {
    const result = getFolderForType('Share Charge');
    expect(result?.folder).toBe('post_completion');
    expect(result?.folder).not.toBe('background');
  });

  it('Debenture should go to post_completion, not background', () => {
    const result = getFolderForType('Debenture');
    expect(result?.folder).toBe('post_completion');
    expect(result?.folder).not.toBe('background');
  });

  it('Planning Documentation should go to background', () => {
    const result = getFolderForType('Planning Documentation');
    expect(result?.folder).toBe('background');
  });

  it('Term Sheet should go to terms_comparison', () => {
    const result = getFolderForType('Term Sheet');
    expect(result?.folder).toBe('terms_comparison');
  });
});

// ============================================================================
// TEST: Client-Level vs Project-Level Segregation
// ============================================================================

describe('Client-Level vs Project-Level Document Segregation', () => {
  it('should have all KYC documents as client-level', () => {
    const kycTypes = getTypesForCategory('KYC');
    for (const mapping of kycTypes) {
      expect(mapping.level, `${mapping.fileType} should be client-level`).toBe('client');
    }
  });

  it('should have all Appraisals as project-level', () => {
    const appraisalTypes = getTypesForCategory('Appraisals');
    for (const mapping of appraisalTypes) {
      expect(mapping.level, `${mapping.fileType} should be project-level`).toBe('project');
    }
  });

  it('should have all Plans as project-level', () => {
    const planTypes = getTypesForCategory('Plans');
    for (const mapping of planTypes) {
      expect(mapping.level, `${mapping.fileType} should be project-level`).toBe('project');
    }
  });

  it('should have all Loan Terms as project-level', () => {
    const loanTermTypes = getTypesForCategory('Loan Terms');
    for (const mapping of loanTermTypes) {
      expect(mapping.level, `${mapping.fileType} should be project-level`).toBe('project');
    }
  });

  it('should have most Communications as client-level (except Meeting Minutes)', () => {
    const commTypes = getTypesForCategory('Communications');
    const emailCorrespondence = commTypes.find(m => m.fileType === 'Email/Correspondence');
    expect(emailCorrespondence?.level).toBe('client');
  });
});

// ============================================================================
// TEST: Keywords Coverage
// ============================================================================

describe('Keywords Coverage', () => {
  it('should have keywords for all document types except fallback', () => {
    const typesWithoutKeywords = DOCUMENT_TYPE_MAPPINGS.filter(
      m => m.keywords.length === 0 && m.fileType !== 'Other Document'
    );

    if (typesWithoutKeywords.length > 0) {
      console.log('Types missing keywords:', typesWithoutKeywords.map(m => m.fileType));
    }

    expect(typesWithoutKeywords.length).toBe(0);
  });

  it('should have at least 2 keywords per type (for better matching)', () => {
    const typesWithFewKeywords = DOCUMENT_TYPE_MAPPINGS.filter(
      m => m.keywords.length < 2 && m.fileType !== 'Other Document'
    );

    if (typesWithFewKeywords.length > 0) {
      console.log('Types with <2 keywords:', typesWithFewKeywords.map(m => `${m.fileType}: ${m.keywords.join(', ')}`));
    }

    // Allow a few exceptions but flag them
    expect(typesWithFewKeywords.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================================
// TEST: Folder Key Validity
// ============================================================================

describe('Folder Key Validity', () => {
  // Valid folder keys from seedFolderTemplates.ts
  const validClientFolders = ['kyc', 'background', 'background_docs', 'miscellaneous'];
  const validProjectFolders = [
    'background',
    'terms_comparison',
    'terms_request',
    'credit_submission',
    'post_completion',
    'appraisals',
    'notes',
    'operational_model',
    'miscellaneous',
  ];

  it('should use valid client-level folder keys', () => {
    const clientMappings = DOCUMENT_TYPE_MAPPINGS.filter(m => m.level === 'client');
    for (const mapping of clientMappings) {
      expect(
        validClientFolders,
        `Invalid client folder key "${mapping.folder}" for ${mapping.fileType}`
      ).toContain(mapping.folder);
    }
  });

  it('should use valid project-level folder keys', () => {
    const projectMappings = DOCUMENT_TYPE_MAPPINGS.filter(m => m.level === 'project');
    for (const mapping of projectMappings) {
      expect(
        validProjectFolders,
        `Invalid project folder key "${mapping.folder}" for ${mapping.fileType}`
      ).toContain(mapping.folder);
    }
  });
});

// ============================================================================
// COVERAGE REPORT
// ============================================================================

describe('Coverage Report', () => {
  it('should generate a coverage summary', () => {
    const categories = getAllCategories();
    const types = getAllFileTypes();

    const byCategory: Record<string, number> = {};
    const byFolder: Record<string, number> = {};
    const byLevel: Record<string, number> = { client: 0, project: 0 };

    for (const mapping of DOCUMENT_TYPE_MAPPINGS) {
      byCategory[mapping.category] = (byCategory[mapping.category] || 0) + 1;
      byFolder[mapping.folder] = (byFolder[mapping.folder] || 0) + 1;
      byLevel[mapping.level]++;
    }

    console.log('\n=== Document Type Mapping Coverage Report ===\n');
    console.log(`Total Types: ${types.length}`);
    console.log(`Total Categories: ${categories.length}`);
    console.log('\nTypes by Category:');
    for (const [category, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${category}: ${count}`);
    }
    console.log('\nTypes by Folder:');
    for (const [folder, count] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${folder}: ${count}`);
    }
    console.log('\nTypes by Level:');
    console.log(`  Client-level: ${byLevel.client}`);
    console.log(`  Project-level: ${byLevel.project}`);

    // Assertions
    expect(types.length).toBeGreaterThanOrEqual(50);
    expect(categories.length).toBeGreaterThanOrEqual(10);
    expect(byLevel.client).toBeGreaterThan(0);
    expect(byLevel.project).toBeGreaterThan(0);
  });
});
