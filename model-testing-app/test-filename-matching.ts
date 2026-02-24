/**
 * Unit test for the filename pattern matching function
 * Run with: npx tsx test-filename-matching.ts
 */

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

// Copy of the function from bulk-analyze/route.ts
function checkFilenamePatterns(
  fileName: string,
  checklistItems: EnrichedChecklistItem[]
): FilenameMatchResult[] {
  const matches: FilenameMatchResult[] = [];
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');
  const fileNameParts = fileNameLower.split(/\s+/);

  const patternAliases: Record<string, string[]> = {
    'proof of address': ['poa', 'proof of address', 'proofofaddress', 'address proof', 'utility', 'utility bill', 'bank statement'],
    'proof of id': ['poi', 'proof of id', 'proofofid', 'id proof', 'passport', 'drivers license', 'driving license', 'id doc', 'identification'],
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

    if (fileNameLower.includes(itemNameLower.replace(/\s+/g, ' ').replace(/[()]/g, ''))) {
      bestScore = 0.9;
      bestReason = 'Filename contains requirement name';
    }

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

    if (bestScore < 0.6) {
      const itemWords = itemNameLower.split(/\s+/).filter(w => w.length > 3);
      const matchingWords = itemWords.filter(word =>
        fileNameParts.some(part => part.includes(word) || word.includes(part))
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

// Mock checklist items based on Kristian Hansen's actual checklist
const MOCK_CHECKLIST: EnrichedChecklistItem[] = [
  {
    _id: 'vd7b13pf1cmve6tgxvyt7f717s7z4dgn',
    name: 'Certified Proof of Address',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Certified document proving the client\'s registered business address.',
    matchingDocumentTypes: ['Proof of Address', 'Utility Bill', 'Bank Statement', 'KYC Document'],
  },
  {
    _id: 'vd75f5fwmv17yc1rhm6t2h3azn7z51v6',
    name: 'Certified Proof of ID',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Certified government-issued identification document.',
    matchingDocumentTypes: ['Proof of ID', 'Passport', 'Driver\'s License', 'ID Document', 'KYC Document'],
  },
  {
    _id: 'vd796vc5cxy5vz43bmyxswxc817z40v4',
    name: 'Business Bank Statements (3 months)',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Last 3 months of business bank account statements.',
    matchingDocumentTypes: ['Bank Statement', 'Financial Statement', 'KYC Document'],
  },
  {
    _id: 'vd7223z3ps8tfh1eb0re9fgk317z4wne',
    name: 'Personal Bank Statements (3 months)',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Last 3 months of personal bank account statements.',
    matchingDocumentTypes: ['Bank Statement', 'Financial Statement', 'KYC Document'],
  },
  {
    _id: 'vd79z1xnfyhe0v86e6jr0v9reh7z4t3e',
    name: 'Track Record - Excel Version',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Developer track record spreadsheet.',
    matchingDocumentTypes: ['Track Record', 'Spreadsheet', 'Financial Model'],
  },
  {
    _id: 'vd74rwzz4b1drdc80z43a589v97z58dw',
    name: 'Track Record - Word Version',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Developer track record document.',
    matchingDocumentTypes: ['Track Record', 'CV', 'Resume', 'Background Document'],
  },
  {
    _id: 'vd7d9twj7rrr83raet6zhe3pds7z4qj8',
    name: 'Assets & Liabilities Statement',
    category: 'KYC',
    status: 'missing',
    linkedDocumentCount: 0,
    description: 'Personal statement of assets and liabilities.',
    matchingDocumentTypes: ['Assets & Liabilities', 'Net Worth Statement', 'Financial Statement', 'KYC Document'],
  },
];

// Test cases
interface TestCase {
  filename: string;
  expectedMatches: { name: string; minScore: number }[];
}

const TEST_CASES: TestCase[] = [
  // Test 1: Explicit proof of address in filename
  {
    filename: 'Hansen_ProofOfAddress_UtilityBill_Jan2026.pdf',
    expectedMatches: [
      { name: 'Certified Proof of Address', minScore: 0.8 },
    ],
  },
  // Test 2: POA abbreviation
  {
    filename: 'POA_Hansen_Dec2025.pdf',
    expectedMatches: [
      { name: 'Certified Proof of Address', minScore: 0.7 },
    ],
  },
  // Test 3: Utility Bill (should match proof of address)
  {
    filename: 'British_Gas_Utility_Bill.pdf',
    expectedMatches: [
      { name: 'Certified Proof of Address', minScore: 0.7 },
    ],
  },
  // Test 4: Passport (should match proof of ID)
  {
    filename: 'Passport_KHansen_Scan.pdf',
    expectedMatches: [
      { name: 'Certified Proof of ID', minScore: 0.8 },
    ],
  },
  // Test 5: Driving license
  {
    filename: 'Drivers_License_Hansen.pdf',
    expectedMatches: [
      { name: 'Certified Proof of ID', minScore: 0.7 },
    ],
  },
  // Test 6: Bank statement (should match multiple items)
  {
    filename: 'HSBC_Bank_Statement_Dec2025.pdf',
    expectedMatches: [
      { name: 'Business Bank Statements (3 months)', minScore: 0.7 },
      { name: 'Personal Bank Statements (3 months)', minScore: 0.7 },
      { name: 'Certified Proof of Address', minScore: 0.7 },
    ],
  },
  // Test 7: Assets & Liabilities abbreviation
  {
    filename: 'AL_Statement_Hansen_2026.pdf',
    expectedMatches: [
      { name: 'Assets & Liabilities Statement', minScore: 0.7 },
    ],
  },
  // Test 8: Net worth statement (should match A&L)
  {
    filename: 'Net_Worth_Statement.pdf',
    expectedMatches: [
      { name: 'Assets & Liabilities Statement', minScore: 0.7 },
    ],
  },
  // Test 9: Track record / CV
  {
    filename: 'Hansen_Developer_CV.pdf',
    expectedMatches: [
      { name: 'Track Record - Word Version', minScore: 0.7 },
    ],
  },
  // Test 10: Track record spreadsheet
  {
    filename: 'Track_Record_Hansen.xlsx',
    expectedMatches: [
      { name: 'Track Record - Excel Version', minScore: 0.7 },
      { name: 'Track Record - Word Version', minScore: 0.7 },
    ],
  },
  // Test 11: Proof of ID explicit
  {
    filename: 'Proof_Of_ID_Hansen.pdf',
    expectedMatches: [
      { name: 'Certified Proof of ID', minScore: 0.8 },
    ],
  },
  // Test 12: No match expected (random filename)
  {
    filename: 'Meeting_Notes_Jan2026.pdf',
    expectedMatches: [],
  },
];

function runTests() {
  console.log('=' .repeat(60));
  console.log('FILENAME PATTERN MATCHING TEST SUITE');
  console.log('Testing Priority 2.4: Filename Pattern Pre-Check');
  console.log('='.repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const testCase of TEST_CASES) {
    console.log(`\nTest: ${testCase.filename}`);
    console.log('-'.repeat(50));

    const matches = checkFilenamePatterns(testCase.filename, MOCK_CHECKLIST);

    let testPassed = true;
    const matchResults: string[] = [];

    // Check expected matches
    for (const expected of testCase.expectedMatches) {
      const foundMatch = matches.find(m => {
        const item = MOCK_CHECKLIST.find(i => i._id === m.itemId);
        return item?.name === expected.name;
      });

      if (foundMatch) {
        const meetsMinScore = foundMatch.score >= expected.minScore;
        if (meetsMinScore) {
          matchResults.push(`  ✅ "${expected.name}" matched with ${(foundMatch.score * 100).toFixed(0)}% (min: ${(expected.minScore * 100).toFixed(0)}%)`);
          matchResults.push(`     Reason: ${foundMatch.reason}`);
        } else {
          matchResults.push(`  ⚠️ "${expected.name}" matched but score too low: ${(foundMatch.score * 100).toFixed(0)}% < ${(expected.minScore * 100).toFixed(0)}%`);
          testPassed = false;
        }
      } else {
        matchResults.push(`  ❌ "${expected.name}" NOT matched (expected match)`);
        testPassed = false;
      }
    }

    // Show unexpected matches
    const unexpectedMatches = matches.filter(m => {
      const item = MOCK_CHECKLIST.find(i => i._id === m.itemId);
      return !testCase.expectedMatches.some(e => e.name === item?.name);
    });

    for (const unexpected of unexpectedMatches) {
      const item = MOCK_CHECKLIST.find(i => i._id === unexpected.itemId);
      matchResults.push(`  ℹ️ Also matched: "${item?.name}" (${(unexpected.score * 100).toFixed(0)}%)`);
    }

    // Handle expected no-match case
    if (testCase.expectedMatches.length === 0 && matches.length === 0) {
      matchResults.push(`  ✅ Correctly returned no matches`);
    } else if (testCase.expectedMatches.length === 0 && matches.length > 0) {
      matchResults.push(`  ⚠️ Expected no matches but found ${matches.length}`);
      testPassed = false;
    }

    for (const result of matchResults) {
      console.log(result);
    }

    console.log(`\n  Result: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);

    if (testPassed) {
      passed++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total tests: ${TEST_CASES.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Success rate: ${((passed / TEST_CASES.length) * 100).toFixed(0)}%`);

  if (failed === 0) {
    console.log('\n🎉 All filename pattern matching tests passed!');
  } else {
    console.log(`\n⚠️ ${failed} test(s) need attention.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
