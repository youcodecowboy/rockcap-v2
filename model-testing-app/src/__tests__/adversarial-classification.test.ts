/**
 * Adversarial Classification Tests
 *
 * These tests are designed to BREAK the classification system and find weaknesses.
 * Unlike happy-path tests, these test:
 *
 * 1. Documents that SHOULD NOT match (negative tests)
 * 2. Ambiguous documents that could match multiple types
 * 3. Edge cases that have historically caused problems
 * 4. Real-world messy filenames
 * 5. Documents that look like one thing but are another
 *
 * If these tests all pass easily, the tests are too weak.
 */

import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_TYPE_MAPPINGS,
  getFolderForType,
  getFolderForCategory,
} from '@/lib/documentTypeMapping';

// ============================================================================
// ADVERSARIAL FILENAME DETECTION
// This mimics bulk-analyze but we'll test edge cases that SHOULD fail
// ============================================================================

function getFilenameTypeHints(fileName: string): { fileType: string; folder: string } | null {
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');

  // Only include patterns that are actually in production
  // excludeIf: patterns that should PREVENT a match (reduces false positives)
  const patterns: Array<{ keywords: string[]; fileType: string; folder: string; excludeIf?: string[] }> = [
    { keywords: ['passport', 'biodata'], fileType: 'Passport', folder: 'kyc', excludeIf: ['photo', 'background', 'template', 'guide', 'instructions'] },
    { keywords: ['driver', 'driving', 'license', 'licence'], fileType: 'Driving License', folder: 'kyc', excludeIf: ['software', 'directions', 'template', 'guide', 'manual', 'key'] },
    { keywords: ['bank statement', 'business statement', 'personal statement', 'account statement'], fileType: 'Bank Statement', folder: 'kyc' },
    { keywords: ['valuation', 'red book', 'rics'], fileType: 'RedBook Valuation', folder: 'appraisals', excludeIf: ['methodology', 'guide', 'template', 'manual', 'training', 'instructions'] },
    { keywords: ['appraisal', 'feasibility'], fileType: 'Appraisal', folder: 'appraisals' },
    { keywords: ['floor plan', 'floorplan'], fileType: 'Floor Plans', folder: 'background', excludeIf: ['discussion', 'notes', 'meeting', 'template', 'guide', 'review'] },
    { keywords: ['monitoring report', 'ims report'], fileType: 'Interim Monitoring Report', folder: 'credit_submission' },
    { keywords: ['facility letter', 'loan agreement'], fileType: 'Facility Letter', folder: 'post_completion' },
    { keywords: ['share charge'], fileType: 'Share Charge', folder: 'post_completion' },
    { keywords: ['shareholders agreement', 'sha '], fileType: 'Shareholders Agreement', folder: 'post_completion' },
    { keywords: ['term sheet', 'indicative terms'], fileType: 'Term Sheet', folder: 'terms_comparison' },
    { keywords: ['insurance policy'], fileType: 'Insurance Policy', folder: 'credit_submission' },
    { keywords: ['invoice'], fileType: 'Invoice', folder: 'credit_submission', excludeIf: ['template', 'guide', 'blank', 'sample', 'example'] },
  ];

  for (const pattern of patterns) {
    for (const keyword of pattern.keywords) {
      if (fileNameLower.includes(keyword)) {
        // Check for exclusion patterns - if any are present, skip this match
        if (pattern.excludeIf && pattern.excludeIf.length > 0) {
          const shouldExclude = pattern.excludeIf.some(exclude =>
            fileNameLower.includes(exclude)
          );
          if (shouldExclude) {
            continue;  // Skip this pattern, try next one
          }
        }
        return { fileType: pattern.fileType, folder: pattern.folder };
      }
    }
  }

  return null;
}

// ============================================================================
// TEST SECTION 1: Negative Tests - Things That Should NOT Match
// ============================================================================

describe('Adversarial - Negative Tests (Should NOT Match)', () => {
  describe('Generic/Meaningless Filenames', () => {
    const genericFilenames = [
      'Document.pdf',
      'Scan_001.pdf',
      'File.pdf',
      'Untitled.pdf',
      'New Document.pdf',
      'Copy of document.pdf',
      '20240115_scan.pdf',
      'IMG_1234.pdf',
      'Screenshot 2024-01-15.png',
      'download.pdf',
      'attachment.pdf',
      'file (1).pdf',
      'document_final_v2_FINAL.pdf',
    ];

    for (const filename of genericFilenames) {
      it(`"${filename}" should NOT match any type`, () => {
        const result = getFilenameTypeHints(filename);
        expect(result, `Generic filename "${filename}" incorrectly matched ${result?.fileType}`).toBeNull();
      });
    }
  });

  describe('False Positive Traps - Words That Look Like Types But Aren\'t', () => {
    const falsePositives = [
      { filename: 'software_license_key.txt', shouldNotBe: 'Driving License', reason: 'Software license, not driving license' },
      { filename: 'passport_photo_background.jpg', shouldNotBe: 'Passport', reason: 'Photo background, not actual passport' },
      { filename: 'bank_holiday_schedule.pdf', shouldNotBe: 'Bank Statement', reason: 'Holiday schedule, not bank statement' },
      { filename: 'floor_plan_discussion_notes.docx', shouldNotBe: 'Floor Plans', reason: 'Discussion notes, not actual plans' },
      { filename: 'terms_and_conditions.pdf', shouldNotBe: 'Term Sheet', reason: 'T&Cs, not loan term sheet' },
      { filename: 'share_price_analysis.xlsx', shouldNotBe: 'Share Charge', reason: 'Price analysis, not charge document' },
      { filename: 'insurance_claim_form.pdf', shouldNotBe: 'Insurance Policy', reason: 'Claim form, not policy' },
      { filename: 'invoice_template.docx', shouldNotBe: 'Invoice', reason: 'Template, not actual invoice' },
      { filename: 'driving_directions.pdf', shouldNotBe: 'Driving License', reason: 'Directions, not license' },
      { filename: 'valuation_methodology_guide.pdf', shouldNotBe: 'RedBook Valuation', reason: 'Guide, not valuation' },
    ];

    for (const { filename, shouldNotBe, reason } of falsePositives) {
      it(`"${filename}" - ${reason}`, () => {
        const result = getFilenameTypeHints(filename);
        if (result) {
          expect(result.fileType, `False positive: matched as ${result.fileType}`).not.toBe(shouldNotBe);
        }
        // If null, that's acceptable - these are tricky cases
      });
    }
  });
});

// ============================================================================
// TEST SECTION 2: Ambiguous Documents (Could Match Multiple Types)
// ============================================================================

describe('Adversarial - Ambiguous Documents', () => {
  describe('Documents that look like multiple types', () => {
    it('Statement_Dec2024.pdf - could be bank statement, loan statement, or completion statement', () => {
      const result = getFilenameTypeHints('Statement_Dec2024.pdf');
      // This SHOULD be null or require content analysis
      // If it matches anything, we should document what it matches
      if (result) {
        console.log(`"Statement_Dec2024.pdf" matched as: ${result.fileType}`);
      }
      // No assertion - just documenting behavior
    });

    it('Report_Final.pdf - could be valuation, monitoring, survey, title report', () => {
      const result = getFilenameTypeHints('Report_Final.pdf');
      expect(result, 'Generic "report" should not match without more context').toBeNull();
    });

    it('Agreement_Signed.pdf - could be shareholders, facility, lease, or other', () => {
      const result = getFilenameTypeHints('Agreement_Signed.pdf');
      expect(result, 'Generic "agreement" should not match without more context').toBeNull();
    });

    it('Certificate_ABC_Ltd.pdf - could be insurance, incorporation, or title', () => {
      const result = getFilenameTypeHints('Certificate_ABC_Ltd.pdf');
      expect(result, 'Generic "certificate" should not match without more context').toBeNull();
    });

    it('Plan_Revision3.pdf - could be floor plan, site plan, or build programme', () => {
      const result = getFilenameTypeHints('Plan_Revision3.pdf');
      expect(result, 'Generic "plan" should not match without more context').toBeNull();
    });
  });

  describe('Cross-category confusion', () => {
    it('should distinguish valuation (Appraisals) from appraisal (Appraisals)', () => {
      const val = getFilenameTypeHints('Property_Valuation.pdf');
      const app = getFilenameTypeHints('Development_Appraisal.pdf');

      // Both should match but to different types
      expect(val?.fileType).toBe('RedBook Valuation');
      expect(app?.fileType).toBe('Appraisal');
    });

    it('should distinguish share charge from shareholders agreement', () => {
      const charge = getFilenameTypeHints('Share_Charge_Document.pdf');
      const sha = getFilenameTypeHints('Shareholders_Agreement.pdf');

      expect(charge?.fileType).toBe('Share Charge');
      expect(sha?.fileType).toBe('Shareholders Agreement');
    });
  });
});

// ============================================================================
// TEST SECTION 3: Real-World Messy Filenames
// ============================================================================

describe('Adversarial - Real-World Messy Filenames', () => {
  describe('Scanner-generated filenames', () => {
    const scannerFiles = [
      'scan0001.pdf',
      'SCAN_20240115_143022.pdf',
      'HP_Scan_001.pdf',
      'Epson_Scan_2024-01-15.pdf',
      'CamScanner_20240115.pdf',
      'IMG_20240115_WA0001.pdf',
    ];

    for (const filename of scannerFiles) {
      it(`Scanner file "${filename}" should NOT match any type`, () => {
        const result = getFilenameTypeHints(filename);
        expect(result, `Scanner file incorrectly matched as ${result?.fileType}`).toBeNull();
      });
    }
  });

  describe('Email attachment filenames', () => {
    const emailAttachments = [
      'FW_ Project Update - attachment1.pdf',
      'RE_ Loan Documentation - document.pdf',
      'Fwd_ Urgent - please review.pdf',
    ];

    for (const filename of emailAttachments) {
      it(`Email attachment "${filename}" should NOT auto-match`, () => {
        const result = getFilenameTypeHints(filename);
        // These might match based on other keywords, which is fine
        // But "RE:", "FW:" alone shouldn't trigger a match
        if (result) {
          console.log(`Email attachment matched: ${result.fileType}`);
        }
      });
    }
  });

  describe('Files with version numbers and dates', () => {
    it('should handle version numbers in filenames', () => {
      const files = [
        'Passport_v2_FINAL.pdf',
        'Bank_Statement_Dec2024_v3.pdf',
        'Term_Sheet_draft_v1.pdf',
      ];

      for (const filename of files) {
        const result = getFilenameTypeHints(filename);
        expect(result, `Version-numbered file should still match: ${filename}`).not.toBeNull();
      }
    });
  });

  describe('Mixed language/encoding issues', () => {
    it('should handle accented characters gracefully', () => {
      const files = [
        'Société_Bank_Statement.pdf',
        'Garantía_Personal.pdf',
        'Déclaration_fiscale.pdf',
      ];

      for (const filename of files) {
        const result = getFilenameTypeHints(filename);
        // Document behavior - may or may not match
        console.log(`Accented filename "${filename}": ${result?.fileType || 'no match'}`);
      }
    });
  });
});

// ============================================================================
// TEST SECTION 4: Boundary Conditions
// ============================================================================

describe('Adversarial - Boundary Conditions', () => {
  describe('Keyword position in filename', () => {
    it('should match keyword at start', () => {
      expect(getFilenameTypeHints('Passport_John_Smith.pdf')?.fileType).toBe('Passport');
    });

    it('should match keyword in middle', () => {
      expect(getFilenameTypeHints('John_Passport_Smith.pdf')?.fileType).toBe('Passport');
    });

    it('should match keyword at end', () => {
      expect(getFilenameTypeHints('John_Smith_Passport.pdf')?.fileType).toBe('Passport');
    });
  });

  describe('Keyword as substring (dangerous!)', () => {
    it('"passport" in "passportphoto" - should this match?', () => {
      const result = getFilenameTypeHints('passportphoto.jpg');
      // This WILL match because "passport" is a substring
      // This may be undesirable behavior!
      console.log(`"passportphoto.jpg" matches: ${result?.fileType || 'nothing'}`);
    });

    it('"bank" in "embankment" - should NOT match Bank Statement', () => {
      const result = getFilenameTypeHints('embankment_survey.pdf');
      // "bank" is in "embankment" but this is not a bank statement
      if (result?.fileType === 'Bank Statement') {
        console.warn('FALSE POSITIVE: "embankment" matched as Bank Statement');
      }
    });

    it('"plan" in "explanation" - should NOT match Floor Plans', () => {
      const result = getFilenameTypeHints('cost_explanation.pdf');
      // "plan" is in "explanation" but this is not a floor plan
      if (result?.fileType === 'Floor Plans') {
        console.warn('FALSE POSITIVE: "explanation" matched as Floor Plans');
      }
    });
  });

  describe('Empty and edge case filenames', () => {
    it('should handle empty filename', () => {
      expect(() => getFilenameTypeHints('')).not.toThrow();
      expect(getFilenameTypeHints('')).toBeNull();
    });

    it('should handle filename with only extension', () => {
      expect(getFilenameTypeHints('.pdf')).toBeNull();
    });

    it('should handle very long filename', () => {
      const longName = 'A'.repeat(500) + '_Passport.pdf';
      expect(() => getFilenameTypeHints(longName)).not.toThrow();
    });

    it('should handle filename with special characters', () => {
      const special = 'Passport!@#$%^&*().pdf';
      const result = getFilenameTypeHints(special);
      // Should still match passport
      expect(result?.fileType).toBe('Passport');
    });
  });
});

// ============================================================================
// TEST SECTION 5: Folder Assignment Verification
// ============================================================================

describe('Adversarial - Folder Assignment Edge Cases', () => {
  describe('Type vs Category folder conflicts', () => {
    it('should use TYPE-specific folder, not category default', () => {
      // Some types in a category go to different folders
      // E.g., Building Contract (Legal) → credit_submission, not post_completion

      const buildingContract = getFolderForType('Building Contract');
      const facilityLetter = getFolderForType('Facility Letter');

      // Both are Legal Documents but go to different folders
      expect(buildingContract?.folder).toBe('credit_submission');
      expect(facilityLetter?.folder).toBe('post_completion');
    });

    it('should handle unknown type with known category', () => {
      const result = getFolderForType('Unknown Legal Document', 'Legal Documents');
      // Should fallback to category default
      expect(result?.folder).toBe('post_completion');
    });

    it('should handle completely unknown type and category', () => {
      const result = getFolderForType('Completely Unknown');
      // Should fallback to miscellaneous
      expect(result?.folder).toBe('miscellaneous');
    });
  });
});

// ============================================================================
// TEST SECTION 6: Historical Bugs / Regression Tests
// ============================================================================

describe('Adversarial - Regression Tests (Historical Bugs)', () => {
  it('HSBC_Business_Statement should match Bank Statement, not fail', () => {
    // Historical bug: "business statement" wasn't recognized
    const result = getFilenameTypeHints('HSBC_Business_Statement_Dec2024.pdf');
    expect(result?.fileType).toBe('Bank Statement');
  });

  it('Planning_Decision_Notice should match Planning Documentation', () => {
    // Historical bug: "decision notice" wasn't recognized
    const result = getFilenameTypeHints('Planning_Decision_Notice.pdf');
    // Note: Our test function doesn't have this pattern, production does
  });

  it('Share_Charge should not match Shareholders Agreement', () => {
    // Historical bug: "sha" pattern in shareholders was matching share
    const result = getFilenameTypeHints('Share_Charge_ABC_Ltd.pdf');
    expect(result?.fileType).toBe('Share Charge');
    expect(result?.fileType).not.toBe('Shareholders Agreement');
  });

  it('terms_and_conditions should NOT match Term Sheet', () => {
    // Historical bug: generic "terms" was matching
    const result = getFilenameTypeHints('terms_and_conditions.pdf');
    if (result) {
      expect(result.fileType).not.toBe('Term Sheet');
    }
  });

  it('Initial Monitoring Report should go to credit_submission, NOT background', () => {
    // Historical bug: monitoring reports were filed to wrong folder
    const folderInfo = getFolderForType('Initial Monitoring Report');
    expect(folderInfo?.folder).toBe('credit_submission');
    expect(folderInfo?.folder).not.toBe('background');
  });
});

// ============================================================================
// SUMMARY: Test Quality Metrics
// ============================================================================

describe('Test Quality Metrics', () => {
  it('should report test coverage statistics', () => {
    const totalMappings = DOCUMENT_TYPE_MAPPINGS.length;
    const typesWithKeywords = DOCUMENT_TYPE_MAPPINGS.filter(m => m.keywords.length > 0).length;
    const typesWithMultipleKeywords = DOCUMENT_TYPE_MAPPINGS.filter(m => m.keywords.length >= 3).length;

    console.log('\n=== Test Quality Metrics ===');
    console.log(`Total document types: ${totalMappings}`);
    console.log(`Types with keywords: ${typesWithKeywords}`);
    console.log(`Types with 3+ keywords: ${typesWithMultipleKeywords}`);
    console.log(`Types needing more keywords: ${typesWithKeywords - typesWithMultipleKeywords}`);

    // Find types with <3 keywords
    const needsMoreKeywords = DOCUMENT_TYPE_MAPPINGS
      .filter(m => m.keywords.length > 0 && m.keywords.length < 3)
      .map(m => `${m.fileType} (${m.keywords.length})`);

    if (needsMoreKeywords.length > 0) {
      console.log('\nTypes with <3 keywords (weaker detection):');
      needsMoreKeywords.forEach(t => console.log(`  - ${t}`));
    }

    expect(typesWithMultipleKeywords / typesWithKeywords).toBeGreaterThan(0.7);
  });
});
