import { describe, it, expect } from 'vitest';

/**
 * Content-to-Filing Decision Tests
 *
 * These tests simulate the full classification flow:
 * 1. Document content/summary → File Type detection
 * 2. File Type → Category assignment
 * 3. Category → Folder placement
 * 4. Content → Checklist matching
 *
 * Each test provides realistic document content that the AI would summarize,
 * and verifies the expected classification outcome.
 */

// ============================================================================
// Classification Decision Logic - Simulates route.ts behavior
// ============================================================================

interface ClassificationDecision {
  fileType: string;
  category: string;
  suggestedFolder: string;
  targetLevel: 'client' | 'project';
  confidence: number;
  checklistMatches: string[];
}

// Document type to category mapping
const TYPE_TO_CATEGORY: Record<string, string> = {
  // KYC
  'Passport': 'KYC',
  'Driving License': 'KYC',
  'ID Document': 'KYC',
  'Proof of Address': 'KYC',
  'Utility Bill': 'KYC',
  'Bank Statement': 'KYC',
  'Assets & Liabilities Statement': 'KYC',
  'Track Record': 'KYC',
  // Appraisals
  'RedBook Valuation': 'Appraisals',
  'Appraisal': 'Appraisals',
  // Plans
  'Floor Plans': 'Plans',
  'Elevations': 'Plans',
  'Site Plans': 'Plans',
  'Location Plans': 'Plans',
  // Professional Reports
  'Planning Decision': 'Professional Reports',
  'Monitoring Report': 'Inspections',
  // Legal Documents
  'Term Sheet': 'Loan Terms',
  'Facility Letter': 'Legal Documents',
  'Personal Guarantee': 'Legal Documents',
  'Debenture': 'Legal Documents',
  'Share Charge': 'Legal Documents',
};

// Category to folder mapping
const CATEGORY_TO_FOLDER: Record<string, { folder: string; level: 'client' | 'project' }> = {
  'KYC': { folder: 'kyc', level: 'client' },
  'Appraisals': { folder: 'appraisals', level: 'project' },
  'Plans': { folder: 'background', level: 'project' },
  'Professional Reports': { folder: 'background', level: 'project' },
  'Inspections': { folder: 'credit_submission', level: 'project' },
  'Loan Terms': { folder: 'terms_comparison', level: 'project' },
  'Legal Documents': { folder: 'background', level: 'project' },
};

// File type to checklist item mapping
const TYPE_TO_CHECKLIST: Record<string, string[]> = {
  'Passport': ['kyc-proof-of-id'],
  'Driving License': ['kyc-proof-of-id'],
  'ID Document': ['kyc-proof-of-id'],
  'Proof of Address': ['kyc-proof-of-address'],
  'Utility Bill': ['kyc-proof-of-address'],
  'Bank Statement': ['kyc-business-bank-statements', 'kyc-personal-bank-statements'],
  'Assets & Liabilities Statement': ['kyc-assets-liabilities'],
  'Track Record': ['kyc-track-record-excel', 'kyc-track-record-word'],
  'RedBook Valuation': ['project-valuation'],
  'Appraisal': ['project-appraisal'],
  'Floor Plans': ['project-floorplans'],
  'Elevations': ['project-elevations'],
  'Site Plans': ['project-site-plan'],
  'Location Plans': ['project-site-location-plan'],
  'Planning Decision': ['project-planning-decision'],
  'Monitoring Report': ['project-monitoring-report'],
  'Facility Letter': ['project-facility-letter'],
  'Personal Guarantee': ['project-personal-guarantee'],
  'Debenture': ['project-debenture'],
};

/**
 * Simulate content-based classification
 * This mimics how the AI would classify based on document content
 */
function classifyFromContent(
  summary: string,
  detectedKeywords: string[]
): ClassificationDecision | null {
  // Priority-ordered document type detection rules
  // Each rule has required keywords (must match at least one) and optional boost keywords
  const detectionRules: Array<{
    keywords: string[];
    fileType: string;
    weight: number; // Higher weight = more specific match
  }> = [
    // Identity Documents (specific to general)
    { keywords: ['passport', 'biodata', 'mrz', 'travel document'], fileType: 'Passport', weight: 10 },
    { keywords: ['driving licence', 'driving license', 'dvla', 'driver license'], fileType: 'Driving License', weight: 10 },
    { keywords: ['national id', 'id card', 'identity card'], fileType: 'ID Document', weight: 8 },
    // Address Documents
    { keywords: ['council tax', 'utility bill', 'gas bill', 'electricity bill', 'water bill'], fileType: 'Utility Bill', weight: 10 },
    { keywords: ['proof of address'], fileType: 'Proof of Address', weight: 8 },
    // Financial Documents
    { keywords: ['bank statement', 'account statement', 'transaction history', 'balance summary', 'current account'], fileType: 'Bank Statement', weight: 10 },
    { keywords: ['assets and liabilities', 'net worth', 'asset schedule'], fileType: 'Assets & Liabilities Statement', weight: 10 },
    { keywords: ['track record', 'development history', 'project portfolio', 'curriculum vitae', 'completed projects'], fileType: 'Track Record', weight: 10 },
    // Valuations & Appraisals
    { keywords: ['rics', 'red book', 'valuation report', 'property valuation', 'market value assessment'], fileType: 'RedBook Valuation', weight: 12 },
    { keywords: ['development appraisal', 'feasibility', 'residual valuation', 'gross development value', 'profit on cost'], fileType: 'Appraisal', weight: 11 },
    // Plans
    { keywords: ['floor plan', 'floorplan', 'internal layout', 'room layout'], fileType: 'Floor Plans', weight: 10 },
    { keywords: ['elevation drawing', 'elevation', 'front elevation', 'rear elevation', 'external appearance'], fileType: 'Elevations', weight: 10 },
    { keywords: ['site plan', 'plot layout', 'building footprint'], fileType: 'Site Plans', weight: 10 },
    { keywords: ['location plan', 'ordnance survey', 'os map'], fileType: 'Location Plans', weight: 10 },
    // Planning
    { keywords: ['planning decision', 'planning permission', 'decision notice', 'approval granted', 'planning consent'], fileType: 'Planning Decision', weight: 12 },
    // Monitoring
    { keywords: ['monitoring report', 'ims report', 'construction progress', 'build progress', 'site inspection'], fileType: 'Monitoring Report', weight: 11 },
    // Legal Documents
    { keywords: ['term sheet', 'indicative terms', 'loan terms', 'proposed terms'], fileType: 'Term Sheet', weight: 10 },
    { keywords: ['facility letter', 'facility agreement', 'loan agreement', 'credit facility'], fileType: 'Facility Letter', weight: 10 },
    { keywords: ['personal guarantee', 'guarantor unconditionally'], fileType: 'Personal Guarantee', weight: 10 },
    { keywords: ['debenture', 'fixed charge', 'floating charge'], fileType: 'Debenture', weight: 10 },
    { keywords: ['share charge', 'charge over shares'], fileType: 'Share Charge', weight: 10 },
  ];

  const summaryLower = summary.toLowerCase();
  const keywordsLower = detectedKeywords.map(k => k.toLowerCase());

  // Score each rule and find best match
  let bestMatch: { fileType: string; score: number } | null = null;

  for (const rule of detectionRules) {
    let score = 0;

    for (const keyword of rule.keywords) {
      // Check if keyword appears in summary (exact phrase match)
      if (summaryLower.includes(keyword)) {
        score += rule.weight;
      }
      // Check if keyword appears in provided keywords
      if (keywordsLower.some(k => k === keyword || k.includes(keyword) || keyword.includes(k))) {
        score += rule.weight * 1.5; // Boost for explicit keyword match
      }
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { fileType: rule.fileType, score };
    }
  }

  if (!bestMatch) {
    return null;
  }

  const category = TYPE_TO_CATEGORY[bestMatch.fileType] || 'Other';
  const folderInfo = CATEGORY_TO_FOLDER[category] || { folder: 'miscellaneous', level: 'client' as const };
  const checklistMatches = TYPE_TO_CHECKLIST[bestMatch.fileType] || [];

  return {
    fileType: bestMatch.fileType,
    category,
    suggestedFolder: folderInfo.folder,
    targetLevel: folderInfo.level,
    confidence: Math.min(0.5 + (bestMatch.score * 0.02), 0.95),
    checklistMatches,
  };
}

// ============================================================================
// TEST DATA: Realistic Document Content Samples
// ============================================================================

interface DocumentSample {
  name: string;
  filename: string;
  summary: string;
  keywords: string[];
  expectedFileType: string;
  expectedCategory: string;
  expectedFolder: string;
  expectedLevel: 'client' | 'project';
  expectedChecklistIds: string[];
}

const DOCUMENT_SAMPLES: DocumentSample[] = [
  // =========================================================================
  // KYC - Identity Documents
  // =========================================================================
  {
    name: 'UK Passport',
    filename: 'John_Smith_Passport.pdf',
    summary: 'This is a scanned copy of a United Kingdom passport. The document shows the biodata page containing the holder\'s photograph, full name "John Alexander Smith", date of birth, passport number, and expiry date. The MRZ (Machine Readable Zone) is visible at the bottom of the page.',
    keywords: ['passport', 'biodata', 'mrz', 'united kingdom'],
    expectedFileType: 'Passport',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-proof-of-id'],
  },
  {
    name: 'UK Driving Licence',
    filename: 'DrivingLicence_Front.pdf',
    summary: 'This is a photocard driving licence issued by the DVLA. It shows the holder\'s name, address, date of birth, and licence categories. The document includes a photograph and signature of the holder.',
    keywords: ['driving licence', 'dvla', 'photocard'],
    expectedFileType: 'Driving License',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-proof-of-id'],
  },

  // =========================================================================
  // KYC - Address Documents
  // =========================================================================
  {
    name: 'Council Tax Bill',
    filename: 'CouncilTax_2024.pdf',
    summary: 'This is a Council Tax bill from Westminster City Council dated January 2024. The bill is addressed to Mr John Smith at 123 High Street, London SW1A 1AA. It shows the council tax band, annual charge, and payment schedule.',
    keywords: ['council tax', 'bill', 'address'],
    expectedFileType: 'Utility Bill',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-proof-of-address'],
  },
  {
    name: 'Gas Utility Bill',
    filename: 'BritishGas_Statement_Dec2024.pdf',
    summary: 'This is a British Gas utility bill for the property at 45 Oak Avenue, Manchester M1 2AB. The statement covers the period November to December 2024 and shows gas consumption, charges, and the customer account number.',
    keywords: ['gas bill', 'utility', 'british gas'],
    expectedFileType: 'Utility Bill',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-proof-of-address'],
  },

  // =========================================================================
  // KYC - Financial Documents
  // =========================================================================
  {
    name: 'Business Bank Statement',
    filename: 'HSBC_Business_Statement_Dec2024.pdf',
    summary: 'This is an HSBC UK Business Banking account statement for ABC Developments Ltd. The statement covers the period 1-31 December 2024 and shows opening balance of £125,000, transaction history including property sales receipts and construction payments, and closing balance of £187,500.',
    keywords: ['bank statement', 'hsbc', 'business banking', 'transaction history'],
    expectedFileType: 'Bank Statement',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-business-bank-statements', 'kyc-personal-bank-statements'],
  },
  {
    name: 'Personal Bank Statement',
    filename: 'NatWest_Personal_Statement_Nov2024.pdf',
    summary: 'This is a NatWest personal current account statement for Mr John Smith. The statement shows the account balance summary, incoming salary payments, outgoing direct debits, and a closing balance. The period covered is November 2024.',
    keywords: ['bank statement', 'personal', 'natwest', 'balance summary'],
    expectedFileType: 'Bank Statement',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-business-bank-statements', 'kyc-personal-bank-statements'],
  },
  {
    name: 'Assets & Liabilities Statement',
    filename: 'Assets_Liabilities_JohnSmith.pdf',
    summary: 'This is a Personal Statement of Assets and Liabilities for John Smith dated January 2025. Assets include: residential property valued at £850,000, investment portfolio £320,000, cash savings £150,000, and pension £480,000. Liabilities include: residential mortgage £420,000, car finance £25,000. Net worth statement shows total net assets of £1,355,000.',
    keywords: ['assets and liabilities', 'net worth', 'personal wealth'],
    expectedFileType: 'Assets & Liabilities Statement',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-assets-liabilities'],
  },
  {
    name: 'Developer Track Record',
    filename: 'Track_Record_ABCDevelopments.pdf',
    summary: 'This is a development track record document for ABC Developments Ltd. It details 8 completed projects over the past 5 years including: 12-unit scheme in Hackney (GDV £4.2m), 6-unit conversion in Islington (GDV £2.8m), and a 24-unit new build in Croydon (GDV £8.5m). Each project lists the purchase price, development costs, sale prices achieved, and profit margins.',
    keywords: ['track record', 'development history', 'project portfolio', 'completed projects'],
    expectedFileType: 'Track Record',
    expectedCategory: 'KYC',
    expectedFolder: 'kyc',
    expectedLevel: 'client',
    expectedChecklistIds: ['kyc-track-record-excel', 'kyc-track-record-word'],
  },

  // =========================================================================
  // Appraisals & Valuations
  // =========================================================================
  {
    name: 'RICS Red Book Valuation',
    filename: 'Valuation_Report_123HighStreet.pdf',
    summary: 'This is a RICS Red Book Valuation Report prepared by Smith & Partners Chartered Surveyors. The property at 123 High Street, London SE1 2AB has been valued on the basis of Market Value. The report concludes a 90-day Market Value of £8,500,000 and a Gross Development Value of £12,200,000 upon completion of the proposed development. The valuation is prepared in accordance with RICS Valuation - Global Standards.',
    keywords: ['rics', 'red book', 'market value', 'valuation report', 'gdv'],
    expectedFileType: 'RedBook Valuation',
    expectedCategory: 'Appraisals',
    expectedFolder: 'appraisals',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-valuation'],
  },
  {
    name: 'Development Appraisal',
    filename: 'Development_Appraisal_Final.xlsx',
    summary: 'This is a development appraisal spreadsheet for the proposed residential scheme at 45 Oak Road. The appraisal shows: Land Cost £1,800,000, Construction Costs £4,200,000, Professional Fees £350,000, Finance Costs £520,000, Total Development Cost £6,870,000. With a Gross Development Value of £9,500,000, the residual land value is £1,600,000 and profit on cost is 23.5%.',
    keywords: ['development appraisal', 'residual valuation', 'gdv', 'gross development value', 'feasibility'],
    expectedFileType: 'Appraisal',
    expectedCategory: 'Appraisals',
    expectedFolder: 'appraisals',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-appraisal'],
  },

  // =========================================================================
  // Plans & Drawings
  // =========================================================================
  {
    name: 'Ground Floor Plan',
    filename: 'Floorplans_GroundFloor.pdf',
    summary: 'This is an architectural floor plan drawing showing the ground floor layout of the proposed development. The drawing is at 1:100 scale and shows the internal layout including: 2 x 1-bed units (45 sqm each), communal entrance hall, bin store, and cycle storage. Room dimensions and door swings are annotated.',
    keywords: ['floor plan', 'internal layout', 'room layout', 'architectural drawing'],
    expectedFileType: 'Floor Plans',
    expectedCategory: 'Plans',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-floorplans'],
  },
  {
    name: 'Building Elevations',
    filename: 'Elevations_AllSides.pdf',
    summary: 'This drawing sheet shows the proposed building elevations from all four sides: front (north), rear (south), and both side elevations. The building is a three-storey residential development with a contemporary design featuring brick facades, aluminium windows, and a flat roof with parapet. The drawings indicate finished floor levels and overall building height of 9.8m.',
    keywords: ['elevation drawing', 'front elevation', 'rear elevation', 'external appearance'],
    expectedFileType: 'Elevations',
    expectedCategory: 'Plans',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-elevations'],
  },
  {
    name: 'Site Plan',
    filename: 'Site_Plan_Proposed.pdf',
    summary: 'This is a site plan drawing at 1:200 scale showing the proposed development within its site boundary. The drawing shows: building footprint, access road, 12 car parking spaces, landscaped areas, bin collection point, and boundary treatments. The site area is 0.25 acres.',
    keywords: ['site plan', 'site layout', 'building footprint', 'plot layout'],
    expectedFileType: 'Site Plans',
    expectedCategory: 'Plans',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-site-plan'],
  },
  {
    name: 'Site Location Plan',
    filename: 'Location_Plan_OS.pdf',
    summary: 'This is a site location plan based on Ordnance Survey mapping at 1:1250 scale. The site at 45 Oak Road is outlined in red and the surrounding area shown in context. The plan shows nearby roads, adjacent properties, and the site\'s position relative to the local area.',
    keywords: ['location plan', 'os map', 'ordnance survey', 'site context'],
    expectedFileType: 'Location Plans',
    expectedCategory: 'Plans',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-site-location-plan'],
  },

  // =========================================================================
  // Planning Documents
  // =========================================================================
  {
    name: 'Planning Decision Notice',
    filename: 'Planning_Decision_Notice.pdf',
    summary: 'This is a Planning Decision Notice from Southwark Council. Application Reference: 24/AP/1234. The application for full planning permission for the demolition of existing buildings and erection of a 3-storey building comprising 12 residential units has been GRANTED subject to 18 conditions. The decision date is 15 December 2024.',
    keywords: ['planning decision', 'planning permission', 'approval granted', 'decision notice'],
    expectedFileType: 'Planning Decision',
    expectedCategory: 'Professional Reports',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-planning-decision'],
  },

  // =========================================================================
  // Monitoring & Inspections
  // =========================================================================
  {
    name: 'Initial Monitoring Report',
    filename: 'IMS_Report_Jan2025.pdf',
    summary: 'This is an Initial Monitoring Surveyor Report prepared by QS Associates for the development at 123 High Street. The report assesses the proposed construction works and verifies the cost plan. Build costs are assessed at £4,250,000 (including contingency) over a 14-month programme. The contractor is ABC Construction Ltd. The report recommends monthly drawdown inspections.',
    keywords: ['monitoring report', 'ims report', 'construction progress', 'build progress', 'site inspection'],
    expectedFileType: 'Monitoring Report',
    expectedCategory: 'Inspections',
    expectedFolder: 'credit_submission',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-monitoring-report'],
  },

  // =========================================================================
  // Legal Documents
  // =========================================================================
  {
    name: 'Term Sheet',
    filename: 'Term_Sheet_v3.pdf',
    summary: 'This is an Indicative Term Sheet for a senior development loan. Borrower: ABC Developments Ltd. Facility Amount: £4,500,000. Term: 18 months. Interest Rate: 9.5% per annum (rolled up). Arrangement Fee: 1.5%. Exit Fee: 1.0%. Security: First legal charge over the property, personal guarantees from directors.',
    keywords: ['term sheet', 'indicative terms', 'loan terms', 'facility amount'],
    expectedFileType: 'Term Sheet',
    expectedCategory: 'Loan Terms',
    expectedFolder: 'terms_comparison',
    expectedLevel: 'project',
    expectedChecklistIds: [],
  },
  {
    name: 'Facility Letter',
    filename: 'Facility_Letter_Executed.pdf',
    summary: 'This is an executed Facility Letter between RockCap Finance Ltd and ABC Developments Ltd for a senior secured development loan facility of £4,500,000. The document sets out the terms and conditions of the loan including: purpose, availability, repayment, interest, fees, representations, covenants, and events of default.',
    keywords: ['facility letter', 'facility agreement', 'loan agreement', 'credit facility'],
    expectedFileType: 'Facility Letter',
    expectedCategory: 'Legal Documents',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-facility-letter'],
  },
  {
    name: 'Personal Guarantee',
    filename: 'Personal_Guarantee_JohnSmith.pdf',
    summary: 'This is a Personal Guarantee given by John Smith in favour of RockCap Finance Ltd. The Guarantor unconditionally guarantees the payment and performance of all obligations of ABC Developments Ltd under the Facility Agreement up to a maximum of £2,000,000 plus interest, costs and expenses.',
    keywords: ['personal guarantee', 'guarantor', 'guarantee agreement'],
    expectedFileType: 'Personal Guarantee',
    expectedCategory: 'Legal Documents',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-personal-guarantee'],
  },
  {
    name: 'Debenture',
    filename: 'Debenture_ABC_Ltd.pdf',
    summary: 'This is a Debenture granted by ABC Developments Ltd in favour of RockCap Finance Ltd. The Debenture creates: (a) a first fixed charge over the Property at 123 High Street, (b) a first fixed charge over book debts and receivables, (c) a first floating charge over all other assets and undertaking of the Company.',
    keywords: ['debenture', 'fixed charge', 'floating charge', 'security interest'],
    expectedFileType: 'Debenture',
    expectedCategory: 'Legal Documents',
    expectedFolder: 'background',
    expectedLevel: 'project',
    expectedChecklistIds: ['project-debenture'],
  },
];

// ============================================================================
// TESTS: Content to Filing Decision
// ============================================================================

describe('Content-to-Filing Decision Tests', () => {
  describe('KYC - Identity Documents', () => {
    const identityDocs = DOCUMENT_SAMPLES.filter(d =>
      ['Passport', 'Driving License', 'ID Document'].includes(d.expectedFileType)
    );

    for (const doc of identityDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
        expect(decision?.targetLevel).toBe(doc.expectedLevel);

        // Check checklist matching
        for (const expectedId of doc.expectedChecklistIds) {
          expect(decision?.checklistMatches).toContain(expectedId);
        }
      });
    }
  });

  describe('KYC - Address Documents', () => {
    const addressDocs = DOCUMENT_SAMPLES.filter(d =>
      ['Proof of Address', 'Utility Bill'].includes(d.expectedFileType)
    );

    for (const doc of addressDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
        expect(decision?.targetLevel).toBe(doc.expectedLevel);
      });
    }
  });

  describe('KYC - Financial Documents', () => {
    const financialDocs = DOCUMENT_SAMPLES.filter(d =>
      ['Bank Statement', 'Assets & Liabilities Statement', 'Track Record'].includes(d.expectedFileType)
    );

    for (const doc of financialDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
      });
    }
  });

  describe('Appraisals & Valuations', () => {
    const appraisalDocs = DOCUMENT_SAMPLES.filter(d =>
      ['RedBook Valuation', 'Appraisal'].includes(d.expectedFileType)
    );

    for (const doc of appraisalDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
        expect(decision?.targetLevel).toBe(doc.expectedLevel);
      });
    }
  });

  describe('Plans & Drawings', () => {
    const planDocs = DOCUMENT_SAMPLES.filter(d =>
      ['Floor Plans', 'Elevations', 'Site Plans', 'Location Plans'].includes(d.expectedFileType)
    );

    for (const doc of planDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
      });
    }
  });

  describe('Planning Documents', () => {
    const planningDocs = DOCUMENT_SAMPLES.filter(d =>
      d.expectedFileType === 'Planning Decision'
    );

    for (const doc of planningDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
      });
    }
  });

  describe('Monitoring & Inspections', () => {
    const monitoringDocs = DOCUMENT_SAMPLES.filter(d =>
      d.expectedFileType === 'Monitoring Report'
    );

    for (const doc of monitoringDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
      });
    }
  });

  describe('Legal Documents', () => {
    const legalDocs = DOCUMENT_SAMPLES.filter(d =>
      ['Term Sheet', 'Facility Letter', 'Personal Guarantee', 'Debenture', 'Share Charge'].includes(d.expectedFileType)
    );

    for (const doc of legalDocs) {
      it(`should correctly classify ${doc.name}`, () => {
        const decision = classifyFromContent(doc.summary, doc.keywords);

        expect(decision, `Should classify ${doc.name}`).not.toBeNull();
        expect(decision?.fileType).toBe(doc.expectedFileType);
        expect(decision?.category).toBe(doc.expectedCategory);
        expect(decision?.suggestedFolder).toBe(doc.expectedFolder);
      });
    }
  });
});

// ============================================================================
// TESTS: Full Filing Decision Flow
// ============================================================================

describe('Full Filing Decision Flow', () => {
  it('should produce consistent decisions for all document samples', () => {
    const results = DOCUMENT_SAMPLES.map(doc => {
      const decision = classifyFromContent(doc.summary, doc.keywords);
      return {
        name: doc.name,
        expectedType: doc.expectedFileType,
        actualType: decision?.fileType,
        expectedFolder: doc.expectedFolder,
        actualFolder: decision?.suggestedFolder,
        matches: decision?.fileType === doc.expectedFileType &&
                 decision?.suggestedFolder === doc.expectedFolder,
      };
    });

    const totalSamples = results.length;
    const matchingResults = results.filter(r => r.matches).length;

    console.log(`\n=== Filing Decision Accuracy ===`);
    console.log(`Total: ${matchingResults}/${totalSamples} (${Math.round(matchingResults/totalSamples*100)}%)`);

    const mismatches = results.filter(r => !r.matches);
    if (mismatches.length > 0) {
      console.log('\nMismatches:');
      mismatches.forEach(m => {
        console.log(`- ${m.name}: expected ${m.expectedType}/${m.expectedFolder}, got ${m.actualType}/${m.actualFolder}`);
      });
    }

    // All samples should match
    expect(matchingResults).toBe(totalSamples);
  });

  it('should correctly route all document types to their folders', () => {
    const folderRouting: Record<string, string[]> = {};

    for (const doc of DOCUMENT_SAMPLES) {
      const decision = classifyFromContent(doc.summary, doc.keywords);
      const folder = decision?.suggestedFolder || 'unknown';

      if (!folderRouting[folder]) {
        folderRouting[folder] = [];
      }
      folderRouting[folder].push(doc.expectedFileType);
    }

    console.log('\n=== Folder Routing ===');
    for (const [folder, types] of Object.entries(folderRouting)) {
      console.log(`${folder}: ${[...new Set(types)].join(', ')}`);
    }

    // Verify expected folder assignments
    expect(folderRouting['kyc']).toBeDefined();
    expect(folderRouting['appraisals']).toBeDefined();
    expect(folderRouting['background']).toBeDefined();
    expect(folderRouting['terms_comparison']).toBeDefined();
    expect(folderRouting['credit_submission']).toBeDefined();
  });

  it('should map document types to correct checklist items', () => {
    const checklistCoverage: Record<string, string[]> = {};

    for (const doc of DOCUMENT_SAMPLES) {
      const decision = classifyFromContent(doc.summary, doc.keywords);

      for (const checklistId of decision?.checklistMatches || []) {
        if (!checklistCoverage[checklistId]) {
          checklistCoverage[checklistId] = [];
        }
        checklistCoverage[checklistId].push(doc.expectedFileType);
      }
    }

    console.log('\n=== Checklist Coverage ===');
    for (const [itemId, types] of Object.entries(checklistCoverage)) {
      console.log(`${itemId}: ${[...new Set(types)].join(', ')}`);
    }

    // Verify key checklist items have coverage
    expect(checklistCoverage['kyc-proof-of-id']).toBeDefined();
    expect(checklistCoverage['kyc-proof-of-address']).toBeDefined();
    expect(checklistCoverage['project-valuation']).toBeDefined();
    expect(checklistCoverage['project-appraisal']).toBeDefined();
  });
});

// ============================================================================
// TESTS: Edge Cases in Content Classification
// ============================================================================

describe('Content Classification Edge Cases', () => {
  it('should handle documents with multiple possible classifications', () => {
    // Bank statement could be used for both bank statements checklist AND proof of address
    const bankStatementSummary = 'This is a bank statement showing the account holder\'s address and transaction history.';
    const decision = classifyFromContent(bankStatementSummary, ['bank statement', 'address']);

    expect(decision?.fileType).toBe('Bank Statement');
    // Bank statements are primarily classified as bank statements, not POA
  });

  it('should prefer more specific classifications', () => {
    // RICS valuation should be RedBook Valuation, not generic Appraisal
    const valuationSummary = 'This RICS Red Book valuation report provides the market value assessment.';
    const decision = classifyFromContent(valuationSummary, ['rics', 'red book', 'valuation']);

    expect(decision?.fileType).toBe('RedBook Valuation');
  });

  it('should handle minimal content gracefully', () => {
    // Very short summary with clear keyword
    const minimalSummary = 'Passport scan.';
    const decision = classifyFromContent(minimalSummary, ['passport']);

    expect(decision?.fileType).toBe('Passport');
  });

  it('should handle ambiguous content by using keywords', () => {
    // Ambiguous summary but clear filename hint
    const ambiguousSummary = 'This is a scanned document showing personal information.';
    const decision = classifyFromContent(ambiguousSummary, ['driving licence']);

    expect(decision?.fileType).toBe('Driving License');
  });
});
