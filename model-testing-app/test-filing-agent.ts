/**
 * Filing Agent Test Script
 *
 * Tests the Priority 1 (Filing Accuracy) and Priority 2 (Checklist Matching) improvements
 *
 * Run with: npx tsx test-filing-agent.ts
 */

import FormData from 'form-data';

const API_URL = 'http://localhost:3000/api/bulk-analyze';
const CLIENT_ID = 'j57cqxv3x7ces9wmwy8rp8qgjd7z3n79'; // Kristian Hansen

// Test cases with expected results
interface TestCase {
  name: string;
  fileName: string;
  content: string;
  expectedFileType: string[];      // Acceptable file types
  expectedFolder: string[];        // Acceptable folders
  expectedChecklistMatch?: string; // Expected checklist item name to match
  expectedMinConfidence?: number;
}

const TEST_CASES: TestCase[] = [
  // Test 1: Clearly labeled Proof of Address
  {
    name: 'Proof of Address - Utility Bill',
    fileName: 'Hansen_ProofOfAddress_UtilityBill_Jan2026.pdf',
    content: `
      BRITISH GAS
      UTILITY BILL - ELECTRICITY

      Account Holder: Kristian Hansen
      Service Address: 45 Mayfair Court, London W1K 4QT

      Statement Period: December 2025
      Amount Due: £127.45

      This statement serves as proof of residence at the above address.
    `,
    expectedFileType: ['Utility Bill', 'Proof of Address', 'KYC Document'],
    expectedFolder: ['kyc'],
    expectedChecklistMatch: 'Certified Proof of Address',
  },

  // Test 2: Bank Statement (should match multiple checklist items)
  {
    name: 'Bank Statement - Business',
    fileName: 'KristianHansen_BusinessBankStatement_Dec2025.pdf',
    content: `
      HSBC BUSINESS BANKING
      MONTHLY STATEMENT

      Account Name: Hansen Property Development Ltd
      Account Number: 12345678
      Sort Code: 40-01-01

      Statement Period: 01 December 2025 - 31 December 2025

      Opening Balance: £125,450.00
      Closing Balance: £187,320.50

      TRANSACTIONS:
      01/12 - Property Sale Deposit    +£75,000.00
      05/12 - Contractor Payment       -£12,500.00
      15/12 - VAT Refund               +£8,370.50
      20/12 - Insurance Premium        -£1,200.00

      Business trading activity statement for loan application purposes.
    `,
    expectedFileType: ['Bank Statement', 'Financial Statement'],
    expectedFolder: ['kyc'],
    expectedChecklistMatch: 'Business Bank Statements (3 months)',
  },

  // Test 3: Passport scan (ID document)
  {
    name: 'Passport - ID Document',
    fileName: 'Passport_KHansen_Scan.pdf',
    content: `
      UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND

      PASSPORT

      Surname: HANSEN
      Given Names: KRISTIAN JAMES
      Nationality: BRITISH CITIZEN
      Date of Birth: 15 MAR 1985
      Place of Birth: LONDON
      Date of Issue: 10 JAN 2020
      Date of Expiry: 10 JAN 2030
      Passport No: 123456789

      [PHOTO]

      Machine Readable Zone
      P<GBRHANSEN<<KRISTIAN<JAMES<<<<<<<<<<<<<<<<
    `,
    expectedFileType: ['Passport', 'Proof of ID', 'ID Document'],
    expectedFolder: ['kyc'],
    expectedChecklistMatch: 'Certified Proof of ID',
  },

  // Test 4: Assets & Liabilities Statement
  {
    name: 'Assets & Liabilities',
    fileName: 'AL_Statement_Hansen_2026.pdf',
    content: `
      PERSONAL STATEMENT OF ASSETS AND LIABILITIES

      Name: Kristian Hansen
      Date: January 2026

      ASSETS:
      Property - Primary Residence: £1,250,000
      Property - Investment (2 units): £850,000
      Cash & Savings: £325,000
      Investment Portfolio: £180,000
      Pension: £420,000
      Vehicle: £45,000

      TOTAL ASSETS: £3,070,000

      LIABILITIES:
      Primary Mortgage: £450,000
      Investment Property Loan: £320,000
      Credit Cards: £5,000

      TOTAL LIABILITIES: £775,000

      NET WORTH: £2,295,000

      I confirm this statement is true and accurate.

      Signed: Kristian Hansen
      Date: 15 January 2026
    `,
    expectedFileType: ['Assets & Liabilities', 'Net Worth Statement', 'Financial Statement'],
    expectedFolder: ['kyc'],
    expectedChecklistMatch: 'Assets & Liabilities Statement',
  },

  // Test 5: Developer Track Record
  {
    name: 'Track Record - CV Style',
    fileName: 'Hansen_Developer_TrackRecord.pdf',
    content: `
      DEVELOPER TRACK RECORD
      KRISTIAN HANSEN

      SUMMARY:
      Experienced property developer with 15+ years in residential development.
      Total completed schemes: 12
      Total GDV delivered: £85 million

      COMPLETED PROJECTS:

      1. Riverside Apartments, Chelsea (2023)
         - 24 luxury apartments
         - GDV: £18.5m
         - Completed on time and budget
         - Funded by: Lloyds Bank

      2. Victorian Conversion, Hampstead (2022)
         - 8 period flats
         - GDV: £6.2m
         - Completed 2 months early
         - Funded by: Close Brothers

      3. New Build Scheme, Wandsworth (2021)
         - 16 houses
         - GDV: £12.8m
         - All units sold off-plan
         - Funded by: OakNorth

      CURRENT PROJECTS:
      - Mayfair Refurbishment (in progress)
      - Kensington Development (planning)

      REFERENCES:
      Available upon request
    `,
    expectedFileType: ['Track Record', 'CV', 'Resume', 'Background Document'],
    expectedFolder: ['kyc', 'background_docs'],
    expectedChecklistMatch: 'Track Record - Word Version',
  },

  // Test 6: Valuation Report (should go to appraisals if project exists)
  {
    name: 'Valuation Report',
    fileName: 'RedBook_Valuation_123HighSt.pdf',
    content: `
      RICS RED BOOK VALUATION REPORT

      Property: 123 High Street, London SW1
      Client: Hansen Property Development Ltd
      Valuation Date: 10 January 2026

      VALUATION:
      Market Value (as is): £2,450,000
      Market Value (as proposed): £4,200,000
      Gross Development Value: £5,800,000

      PROPERTY DESCRIPTION:
      A substantial Victorian property currently configured as 4 flats,
      with planning consent for conversion to 8 luxury apartments.

      Site Area: 0.25 acres
      GIA (current): 4,500 sq ft
      GIA (proposed): 7,200 sq ft

      This valuation has been prepared in accordance with the RICS
      Valuation - Global Standards 2022 (Red Book).

      Signed: J. Smith MRICS
      Date: 10 January 2026
    `,
    expectedFileType: ['Valuation', 'RedBook Valuation', 'Valuation Report'],
    expectedFolder: ['miscellaneous', 'background'], // At client level, no project
  },
];

// Create a mock PDF-like blob
function createMockPDF(content: string): Blob {
  // Create a simple text file that simulates extracted PDF content
  return new Blob([content], { type: 'application/pdf' });
}

async function runTest(testCase: TestCase): Promise<{
  passed: boolean;
  details: {
    fileType: { expected: string[]; actual: string; passed: boolean };
    folder: { expected: string[]; actual: string; passed: boolean };
    checklistMatch: { expected: string | undefined; actual: string | undefined; confidence: number | undefined; passed: boolean };
    confidence: number;
    filenameMatches?: any[];
  };
}> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${testCase.name}`);
  console.log(`File: ${testCase.fileName}`);
  console.log('='.repeat(60));

  const formData = new FormData();

  // Create a mock file
  const mockFile = Buffer.from(testCase.content);
  formData.append('file', mockFile, {
    filename: testCase.fileName,
    contentType: 'application/pdf',
  });
  formData.append('clientId', CLIENT_ID);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData as any,
      headers: formData.getHeaders?.() || {},
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`API Error: ${response.status} - ${error}`);
      return {
        passed: false,
        details: {
          fileType: { expected: testCase.expectedFileType, actual: 'ERROR', passed: false },
          folder: { expected: testCase.expectedFolder, actual: 'ERROR', passed: false },
          checklistMatch: { expected: testCase.expectedChecklistMatch, actual: undefined, confidence: undefined, passed: false },
          confidence: 0,
        },
      };
    }

    const result = await response.json();

    if (!result.success) {
      console.error('API returned failure:', result);
      return {
        passed: false,
        details: {
          fileType: { expected: testCase.expectedFileType, actual: 'FAILED', passed: false },
          folder: { expected: testCase.expectedFolder, actual: 'FAILED', passed: false },
          checklistMatch: { expected: testCase.expectedChecklistMatch, actual: undefined, confidence: undefined, passed: false },
          confidence: 0,
        },
      };
    }

    const { result: analysisResult } = result;

    // Check file type
    const fileTypePassed = testCase.expectedFileType.some(
      expected => analysisResult.fileType.toLowerCase().includes(expected.toLowerCase()) ||
                  expected.toLowerCase().includes(analysisResult.fileType.toLowerCase())
    );

    // Check folder
    const folderPassed = testCase.expectedFolder.includes(analysisResult.suggestedFolder);

    // Check checklist match
    let checklistPassed = true;
    let matchedItem: string | undefined;
    let matchConfidence: number | undefined;

    if (testCase.expectedChecklistMatch) {
      const matches = analysisResult.suggestedChecklistItems || [];
      const found = matches.find((m: any) =>
        m.itemName?.toLowerCase().includes(testCase.expectedChecklistMatch!.toLowerCase()) ||
        testCase.expectedChecklistMatch!.toLowerCase().includes(m.itemName?.toLowerCase())
      );

      checklistPassed = !!found;
      matchedItem = found?.itemName;
      matchConfidence = found?.confidence;
    }

    const overallPassed = fileTypePassed && folderPassed && checklistPassed;

    // Output results
    console.log(`\nRESULTS:`);
    console.log(`  File Type: ${analysisResult.fileType} ${fileTypePassed ? '✅' : '❌'}`);
    console.log(`    Expected one of: ${testCase.expectedFileType.join(', ')}`);
    console.log(`  Folder: ${analysisResult.suggestedFolder} ${folderPassed ? '✅' : '❌'}`);
    console.log(`    Expected one of: ${testCase.expectedFolder.join(', ')}`);
    console.log(`  Confidence: ${(analysisResult.confidence * 100).toFixed(0)}% (${analysisResult.confidenceFlag})`);

    if (testCase.expectedChecklistMatch) {
      console.log(`  Checklist Match: ${matchedItem || 'NONE'} ${checklistPassed ? '✅' : '❌'}`);
      console.log(`    Expected: ${testCase.expectedChecklistMatch}`);
      if (matchConfidence) {
        console.log(`    Match Confidence: ${(matchConfidence * 100).toFixed(0)}%`);
      }
    }

    if (analysisResult.suggestedChecklistItems?.length > 0) {
      console.log(`\n  All Checklist Suggestions:`);
      for (const item of analysisResult.suggestedChecklistItems) {
        console.log(`    - ${item.itemName} (${(item.confidence * 100).toFixed(0)}%): ${item.reasoning || 'No reason'}`);
      }
    }

    if (analysisResult.verificationNotes) {
      console.log(`\n  Verification: ${analysisResult.verificationPassed ? '✅' : '⚠️'}`);
      console.log(`    ${analysisResult.verificationNotes}`);
    }

    console.log(`\n  OVERALL: ${overallPassed ? '✅ PASSED' : '❌ FAILED'}`);

    return {
      passed: overallPassed,
      details: {
        fileType: { expected: testCase.expectedFileType, actual: analysisResult.fileType, passed: fileTypePassed },
        folder: { expected: testCase.expectedFolder, actual: analysisResult.suggestedFolder, passed: folderPassed },
        checklistMatch: { expected: testCase.expectedChecklistMatch, actual: matchedItem, confidence: matchConfidence, passed: checklistPassed },
        confidence: analysisResult.confidence,
      },
    };

  } catch (error) {
    console.error(`Test error:`, error);
    return {
      passed: false,
      details: {
        fileType: { expected: testCase.expectedFileType, actual: 'ERROR', passed: false },
        folder: { expected: testCase.expectedFolder, actual: 'ERROR', passed: false },
        checklistMatch: { expected: testCase.expectedChecklistMatch, actual: undefined, confidence: undefined, passed: false },
        confidence: 0,
      },
    };
  }
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('FILING AGENT TEST SUITE');
  console.log('Testing Priority 1 (Filing Accuracy) & Priority 2 (Checklist Matching)');
  console.log('='.repeat(60));
  console.log(`\nClient: Kristian Hansen (${CLIENT_ID})`);
  console.log(`Running ${TEST_CASES.length} test cases...\n`);

  const results: { testCase: TestCase; result: Awaited<ReturnType<typeof runTest>> }[] = [];

  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase);
    results.push({ testCase, result });

    // Small delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.result.passed).length;
  const failed = results.filter(r => !r.result.passed).length;

  console.log(`\nTotal: ${results.length} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(0)}%`);

  if (failed > 0) {
    console.log(`\nFailed Tests:`);
    for (const { testCase, result } of results.filter(r => !r.result.passed)) {
      console.log(`  - ${testCase.name}`);
      if (!result.details.fileType.passed) {
        console.log(`    File Type: got "${result.details.fileType.actual}", expected one of: ${result.details.fileType.expected.join(', ')}`);
      }
      if (!result.details.folder.passed) {
        console.log(`    Folder: got "${result.details.folder.actual}", expected one of: ${result.details.folder.expected.join(', ')}`);
      }
      if (!result.details.checklistMatch.passed) {
        console.log(`    Checklist: got "${result.details.checklistMatch.actual || 'none'}", expected "${result.details.checklistMatch.expected}"`);
      }
    }
  }

  // Checklist matching stats
  const checklistTests = results.filter(r => r.testCase.expectedChecklistMatch);
  const checklistPassed = checklistTests.filter(r => r.result.details.checklistMatch.passed).length;

  console.log(`\nChecklist Matching Performance:`);
  console.log(`  Tests with expected match: ${checklistTests.length}`);
  console.log(`  Correctly matched: ${checklistPassed}`);
  console.log(`  Match Rate: ${((checklistPassed / checklistTests.length) * 100).toFixed(0)}%`);

  const avgConfidence = checklistTests
    .filter(r => r.result.details.checklistMatch.confidence)
    .reduce((sum, r) => sum + (r.result.details.checklistMatch.confidence || 0), 0) / checklistPassed || 0;

  console.log(`  Average Match Confidence: ${(avgConfidence * 100).toFixed(0)}%`);
}

main().catch(console.error);
