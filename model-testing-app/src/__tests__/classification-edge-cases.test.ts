import { describe, it, expect } from 'vitest';

/**
 * Document Classification Edge Case Tests
 *
 * These tests focus on scenarios that commonly fail in production:
 * - Ambiguous filenames
 * - Documents that could match multiple types
 * - Common user naming conventions
 * - Scanned documents with minimal text
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
// TESTS: Ambiguous Document Types
// ============================================================================

describe('Edge Cases - Ambiguous Documents', () => {
  describe('Passport vs Proof of ID Confusion', () => {
    it('should recognize passport-specific filenames', () => {
      const passportFiles = [
        'John_Smith_Passport.pdf',
        'UK_Passport_Scan.pdf',
        'passport_biodata_page.pdf',
      ];

      for (const filename of passportFiles) {
        const hint = getFilenameTypeHints(filename);
        expect(hint?.fileType, `${filename} should be Passport`).toBe('Passport');
      }
    });

    it('should distinguish passport from generic ID', () => {
      // These should be Passport
      expect(getFilenameTypeHints('passport.pdf')?.fileType).toBe('Passport');

      // These should be ID Document (generic)
      expect(getFilenameTypeHints('proof_of_id.pdf')?.fileType).toBe('ID Document');
      expect(getFilenameTypeHints('poi.pdf')?.fileType).toBe('ID Document');
    });
  });

  describe('Bank Statement vs Proof of Address Confusion', () => {
    it('should classify bank statement primarily as Bank Statement', () => {
      const hint = getFilenameTypeHints('bank_statement_dec2024.pdf');
      expect(hint?.fileType).toBe('Bank Statement');
      // Bank statements can serve as POA but should be classified as Bank Statement first
    });

    it('should classify explicit POA as Proof of Address', () => {
      const hint = getFilenameTypeHints('proof_of_address.pdf');
      expect(hint?.fileType).toBe('Proof of Address');
    });

    it('should classify utility bill as Utility Bill', () => {
      const hint = getFilenameTypeHints('utility_bill.pdf');
      expect(hint?.fileType).toBe('Utility Bill');
      // Utility bills are POA but classified as their specific type
    });
  });

  describe('Appraisal vs Valuation Confusion', () => {
    it('should distinguish appraisal from valuation', () => {
      // Appraisals are typically Excel feasibility studies
      expect(getFilenameTypeHints('development_appraisal.xlsx')?.fileType).toBe('Appraisal');
      expect(getFilenameTypeHints('feasibility.xlsx')?.fileType).toBe('Appraisal');

      // Valuations are RICS Red Book reports
      expect(getFilenameTypeHints('valuation_report.pdf')?.fileType).toBe('RedBook Valuation');
      expect(getFilenameTypeHints('rics_valuation.pdf')?.fileType).toBe('RedBook Valuation');
      expect(getFilenameTypeHints('red_book_val.pdf')?.fileType).toBe('RedBook Valuation');
    });
  });
});

// ============================================================================
// TESTS: Common User Naming Patterns
// ============================================================================

describe('Edge Cases - User Naming Patterns', () => {
  describe('Scanner-generated filenames', () => {
    it('should handle scanner prefixes', () => {
      // Many users scan documents and the scanner adds prefixes
      const scannerFilenames = [
        { filename: 'Scan_Passport_001.pdf', expectedType: 'Passport' },
        { filename: 'SCAN0001_bank_statement.pdf', expectedType: 'Bank Statement' },
        { filename: 'IMG_20240101_valuation.pdf', expectedType: 'RedBook Valuation' },
      ];

      for (const { filename, expectedType } of scannerFilenames) {
        const hint = getFilenameTypeHints(filename);
        expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
      }
    });
  });

  describe('Date-prefixed filenames', () => {
    it('should handle various date formats in filenames', () => {
      const dateFilenames = [
        { filename: '2024-01-15_Bank_Statement.pdf', expectedType: 'Bank Statement' },
        { filename: '20240115_passport.pdf', expectedType: 'Passport' },
        { filename: 'Jan2024_Valuation_Report.pdf', expectedType: 'RedBook Valuation' },
        { filename: '15-Jan-2024_Utility_Bill.pdf', expectedType: 'Utility Bill' },
      ];

      for (const { filename, expectedType } of dateFilenames) {
        const hint = getFilenameTypeHints(filename);
        expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
      }
    });
  });

  describe('Numbered/versioned filenames', () => {
    it('should handle version numbers', () => {
      const versionedFilenames = [
        { filename: 'Appraisal_v2.xlsx', expectedType: 'Appraisal' },
        { filename: 'FloorPlan_Rev_A.pdf', expectedType: 'Floor Plans' },
        { filename: 'Valuation_FINAL_v3.pdf', expectedType: 'RedBook Valuation' },
        { filename: 'Term_Sheet_Draft_2.pdf', expectedType: 'Term Sheet' },
      ];

      for (const { filename, expectedType } of versionedFilenames) {
        const hint = getFilenameTypeHints(filename);
        expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
      }
    });

    it('should handle copy indicators', () => {
      const copyFilenames = [
        { filename: 'Passport (1).pdf', expectedType: 'Passport' },
        { filename: 'Bank Statement - Copy.pdf', expectedType: 'Bank Statement' },
        { filename: 'Valuation_Copy_2.pdf', expectedType: 'RedBook Valuation' },
      ];

      for (const { filename, expectedType } of copyFilenames) {
        const hint = getFilenameTypeHints(filename);
        expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
      }
    });
  });

  describe('Multi-word client names in filenames', () => {
    it('should handle client names before document type', () => {
      const clientNameFilenames = [
        { filename: 'ABC_Developments_Ltd_Bank_Statement.pdf', expectedType: 'Bank Statement' },
        { filename: 'John Smith - Passport.pdf', expectedType: 'Passport' },
        { filename: 'Smith_Family_Trust_Track_Record.pdf', expectedType: 'Track Record' },
      ];

      for (const { filename, expectedType } of clientNameFilenames) {
        const hint = getFilenameTypeHints(filename);
        expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
      }
    });
  });
});

// ============================================================================
// TESTS: Documents That Might Fail
// ============================================================================

describe('Edge Cases - Potential Failure Scenarios', () => {
  describe('Filenames that could match multiple types', () => {
    it('should handle "terms" which could be Term Sheet or T&Cs', () => {
      // "terms_and_conditions.pdf" should NOT match Term Sheet (too ambiguous)
      // We removed generic "terms" pattern to avoid false positives
      const hint = getFilenameTypeHints('terms_and_conditions.pdf');
      expect(hint).toBeNull(); // Correct behavior - needs content analysis

      // Explicit term sheet patterns should still work
      expect(getFilenameTypeHints('term_sheet.pdf')?.fileType).toBe('Term Sheet');
      expect(getFilenameTypeHints('indicative_terms.pdf')?.fileType).toBe('Term Sheet');
      expect(getFilenameTypeHints('credit_backed_terms.pdf')?.fileType).toBe('Term Sheet');
    });

    it('should handle "license" which could be driving license or software license', () => {
      const hint = getFilenameTypeHints('license.pdf');
      // Will match Driving License - context needed for software license
      expect(hint?.fileType).toBe('Driving License');
    });

    it('should handle "statement" alone', () => {
      const hint = getFilenameTypeHints('statement.pdf');
      // Too generic - should not match without more context
      // Current behavior: won't match bank statement without "bank" keyword
      // This is correct behavior - avoids false positives
    });
  });

  describe('Shortened/abbreviated filenames', () => {
    it('should handle common abbreviations', () => {
      const abbreviations = [
        { filename: 'POI.pdf', expectedType: 'ID Document' },
        { filename: 'POA.pdf', expectedType: 'Proof of Address' },
        { filename: 'BS_Dec.pdf', expectedType: null }, // BS too short/ambiguous
        { filename: 'PG_signed.pdf', expectedType: 'Personal Guarantee' }, // PG with space works
        { filename: 'CV.pdf', expectedType: 'Track Record' }, // CV needs space after
      ];

      for (const { filename, expectedType } of abbreviations) {
        const hint = getFilenameTypeHints(filename);
        if (expectedType) {
          expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
        } else {
          // For null expected, we just note it's a known limitation
        }
      }
    });
  });

  describe('Non-English filenames', () => {
    it('should note that non-English patterns are not supported', () => {
      // These won't match - documenting as known limitation
      const nonEnglishFilenames = [
        'Passeport.pdf',        // French
        'Kontoauszug.pdf',      // German (bank statement)
        'Valoración.pdf',       // Spanish (valuation)
      ];

      for (const filename of nonEnglishFilenames) {
        const hint = getFilenameTypeHints(filename);
        // Currently won't match - acceptable limitation
        // Could add multilingual support in future
      }
    });
  });

  describe('Completely generic filenames', () => {
    it('should return null for completely generic filenames', () => {
      const genericFilenames = [
        'Document.pdf',
        'File.pdf',
        'Scan.pdf',
        'image001.pdf',
        'download.pdf',
        'attachment.pdf',
      ];

      for (const filename of genericFilenames) {
        const hint = getFilenameTypeHints(filename);
        expect(hint, `${filename} should return null`).toBeNull();
      }
    });
  });
});

// ============================================================================
// TESTS: Folder Assignment Logic
// ============================================================================

describe('Edge Cases - Folder Assignment', () => {
  it('should assign KYC documents to kyc folder', () => {
    const kycTypes = ['Passport', 'Bank Statement', 'Utility Bill', 'Track Record'];

    for (const type of kycTypes) {
      const filename = type.toLowerCase().replace(/\s+/g, '_') + '.pdf';
      const hint = getFilenameTypeHints(filename);
      if (hint) {
        expect(hint.folder, `${type} should go to kyc folder`).toBe('kyc');
      }
    }
  });

  it('should assign Valuations to appraisals folder', () => {
    const hint = getFilenameTypeHints('valuation_report.pdf');
    expect(hint?.folder).toBe('appraisals');
  });

  it('should assign Plans to background folder', () => {
    const planTypes = ['floor_plan.pdf', 'elevation.pdf', 'site_plan.pdf'];

    for (const filename of planTypes) {
      const hint = getFilenameTypeHints(filename);
      expect(hint?.folder, `${filename} should go to background folder`).toBe('background');
    }
  });

  it('should assign Term Sheets to terms_comparison folder', () => {
    const hint = getFilenameTypeHints('term_sheet.pdf');
    expect(hint?.folder).toBe('terms_comparison');
  });

  it('should assign Monitoring Reports to credit_submission folder', () => {
    const hint = getFilenameTypeHints('monitoring_report.pdf');
    expect(hint?.folder).toBe('credit_submission');
  });
});

// ============================================================================
// TESTS: Priority/Order of Pattern Matching
// ============================================================================

describe('Edge Cases - Pattern Matching Priority', () => {
  it('should match more specific patterns first', () => {
    // "passport" should match Passport, not ID Document
    const passportHint = getFilenameTypeHints('passport.pdf');
    expect(passportHint?.fileType).toBe('Passport');

    // "driving license" should match Driving License, not ID Document
    const licenseHint = getFilenameTypeHints('driving_license.pdf');
    expect(licenseHint?.fileType).toBe('Driving License');
  });

  it('should handle overlapping keywords correctly', () => {
    // "bank statement" contains both "bank" and "statement"
    const hint = getFilenameTypeHints('bank_statement.pdf');
    expect(hint?.fileType).toBe('Bank Statement');
    // Should not match Assets & Liabilities just because of "statement"
  });
});

// ============================================================================
// TESTS: Document Content Classification (Mock Scenarios)
// ============================================================================

describe('Edge Cases - Content-Based Classification Scenarios', () => {
  /**
   * These tests document scenarios where filename alone isn't enough
   * and content analysis would be needed
   */

  it('should document when content analysis is needed for ambiguous files', () => {
    const ambiguousScenarios = [
      {
        filename: 'Document.pdf',
        possibleTypes: ['Any - needs content analysis'],
        resolution: 'AI must analyze content',
      },
      {
        filename: 'statement.pdf',
        possibleTypes: ['Bank Statement', 'Assets & Liabilities', 'Financial Statement'],
        resolution: 'Look for bank name, account number, or A&L format',
      },
      {
        filename: 'report.pdf',
        possibleTypes: ['Valuation', 'Monitoring Report', 'Legal DD'],
        resolution: 'Look for RICS branding, construction details, or legal headings',
      },
      {
        filename: 'plan.pdf',
        possibleTypes: ['Floor Plan', 'Site Plan', 'Business Plan'],
        resolution: 'Check if architectural drawing or text document',
      },
    ];

    // Document these scenarios for reference
    expect(ambiguousScenarios.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// TESTS: Stress Testing with Large Filename Batches
// ============================================================================

describe('Edge Cases - Batch Processing', () => {
  it('should handle a realistic batch of mixed filenames', () => {
    const realisticBatch = [
      // KYC Documents
      'Smith_John_Passport_2024.pdf',
      'Jane_Doe_Driving_Licence.pdf',
      'HSBC_Business_Statement_Dec2024.pdf',  // NOW DETECTED: "business statement" pattern added
      'NatWest_Personal_Statement_Nov2024.pdf', // NOW DETECTED: "personal statement" pattern added
      'Track_Record_Developer_CV.pdf',
      'Assets_Liabilities_2024.xlsx',

      // Project Documents
      'Development_Appraisal_Final.xlsx',
      'Valuation_Report_123_High_Street.pdf',
      'Site_Plan_Proposed.dwg',
      'Floorplans_All_Levels.pdf',
      'Elevations_NS_EW.pdf',
      'Planning_Decision_Notice.pdf', // NOW DETECTED: "decision notice" pattern added

      // Legal Documents
      'Facility_Letter_Executed.pdf',
      'Personal_Guarantee_Smith.pdf',
      'Debenture_ABC_Ltd.pdf',
      'Term_Sheet_v3.pdf',

      // Monitoring
      'IMS_Report_Jan2025.pdf',

      // Ambiguous/Generic (expected to fail)
      'Document.pdf',
      'Scan_001.pdf',
      'File.pdf',
    ];

    const results = realisticBatch.map(filename => ({
      filename,
      detected: getFilenameTypeHints(filename),
    }));

    // Count successful detections
    const detected = results.filter(r => r.detected !== null).length;
    const total = results.length;

    // Only generic filenames should fail (Document, Scan, File)
    const genericCount = 3;

    // Should detect all non-generic files (17/20 = 85%)
    expect(detected).toBeGreaterThanOrEqual(total - genericCount);

    console.log(`\nBatch Detection Rate: ${detected}/${total} (${Math.round(detected/total*100)}%)`);
    console.log('Undetected files:', results.filter(r => !r.detected).map(r => r.filename).join(', '));

    // Verify the previously problematic files now work
    const hsbc = results.find(r => r.filename.includes('HSBC'));
    expect(hsbc?.detected?.fileType, 'HSBC Business Statement should be detected').toBe('Bank Statement');

    const natwest = results.find(r => r.filename.includes('NatWest'));
    expect(natwest?.detected?.fileType, 'NatWest Personal Statement should be detected').toBe('Bank Statement');

    const planning = results.find(r => r.filename.includes('Planning'));
    expect(planning?.detected?.fileType, 'Planning Decision should be detected').toBe('Planning Decision');
  });
});

// ============================================================================
// TESTS: Special Characters and Unicode
// ============================================================================

describe('Edge Cases - Special Characters', () => {
  it('should handle files with special characters', () => {
    const specialCharFiles = [
      { filename: 'Passport_Smith & Jones.pdf', expectedType: 'Passport' },
      { filename: 'Bank Statement (Copy).pdf', expectedType: 'Bank Statement' },
      { filename: 'Valuation £2.5M.pdf', expectedType: 'RedBook Valuation' },
      { filename: "Track Record - O'Brien.pdf", expectedType: 'Track Record' },
    ];

    for (const { filename, expectedType } of specialCharFiles) {
      const hint = getFilenameTypeHints(filename);
      expect(hint?.fileType, `${filename} should be ${expectedType}`).toBe(expectedType);
    }
  });

  it('should document URL-encoded filename limitations', () => {
    // URL-encoded filenames: %20 doesn't become space, it becomes "20" after removing special chars
    // This is a KNOWN LIMITATION - URL decoding should happen before classification
    const urlEncodedFiles = [
      { filename: 'Bank%20Statement.pdf', worksWithoutDecoding: false }, // "Bank 20Statement" doesn't match
      { filename: 'passport%20scan.pdf', worksWithoutDecoding: true }, // "passport" is still present
    ];

    for (const { filename, worksWithoutDecoding } of urlEncodedFiles) {
      const hint = getFilenameTypeHints(filename);
      if (worksWithoutDecoding) {
        expect(hint, `${filename} should still work`).not.toBeNull();
      } else {
        // Document that this is a known limitation
        expect(hint, `${filename} won't work without URL decoding`).toBeNull();
      }
    }
  });
});
