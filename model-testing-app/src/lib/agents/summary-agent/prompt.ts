// =============================================================================
// SUMMARY AGENT PROMPT
// =============================================================================
// This agent analyzes documents to extract structured information WITHOUT
// making classification decisions. It focuses on understanding WHAT the
// document is and WHAT information it contains.

import { TEXT_LIMITS } from '../config';

/**
 * Build the summary agent prompt
 */
export function buildSummaryPrompt(fileName: string, textContent: string): string {
  const truncatedContent = textContent.slice(0, TEXT_LIMITS.summaryContentLength);
  const wasTruncated = textContent.length > TEXT_LIMITS.summaryContentLength;

  return `You are a document analysis specialist. Your ONLY job is to ANALYZE and SUMMARIZE this document.
You must NOT classify or categorize - just extract information and describe what you see.

## DOCUMENT TO ANALYZE

**Filename:** ${fileName}

**Content:**
${truncatedContent}${wasTruncated ? '\n\n[Content truncated for analysis...]' : ''}

## YOUR TASK

Analyze this document thoroughly and extract all relevant information. Focus on UNDERSTANDING the document, not categorizing it.

Answer these questions in your analysis:
1. **WHAT** is this document? Describe it in your own words.
2. **WHO** is involved? Extract all names (people, companies, organizations).
3. **WHERE** is mentioned? Extract locations, addresses, properties.
4. **WHAT PROJECT(S)** are discussed? Extract project names.
5. **WHAT ARE THE KEY TERMS** used? (technical terms, industry jargon, important concepts)
6. **WHAT KEY DATES** are mentioned? ALWAYS include context for each date (e.g., "Report Date: Jan 2024", "Completion Date: Q4 2025", "Valuation Date: 15 March 2024")
7. **WHAT FINANCIAL FIGURES** or measurements are present? ALWAYS include context for each amount (e.g., "GDV: £5.2m", "Loan Amount: £3m", "Site Area: 2.5 acres")
8. **WHAT IS THE PURPOSE** of this document? Why does it exist?
9. **WHAT CHARACTERISTICS** does it have? (is it financial? legal? design? etc.)

## RESPONSE FORMAT

Respond with ONLY a JSON object:
{
  "documentDescription": "What this document IS in plain language (e.g., 'a design presentation for a residential development project')",
  "documentPurpose": "What this document is FOR (e.g., 'to present the architectural scheme to potential investors')",
  "entities": {
    "people": ["Name 1", "Name 2"],
    "companies": ["Company A", "Company B"],
    "locations": ["123 Main St, London", "Manchester"],
    "projects": ["Woodside Lofts", "Project X"]
  },
  "keyTerms": ["PBSA", "co-living", "GDV", "planning permission"],
  "keyDates": ["Report Date: March 2024", "Practical Completion: Q4 2025", "Planning Granted: Jan 2023"],
  "keyAmounts": ["GDV: £12.5m", "Loan Amount: £8m", "Total Units: 150", "Site Area: 45,000 sqft"],
  "executiveSummary": "2-3 sentence high-level summary of the document",
  "detailedSummary": "A full paragraph providing comprehensive summary of the document contents",
  "sectionBreakdown": ["Section 1: Introduction", "Section 2: Design Concept"],
  "documentCharacteristics": {
    "isFinancial": false,
    "isLegal": false,
    "isIdentity": false,
    "isReport": false,
    "isDesign": true,
    "isCorrespondence": false,
    "hasMultipleProjects": false,
    "isInternal": false
  },
  "rawContentType": "Your best description of the document type without using our taxonomy",
  "confidenceInAnalysis": 0.85
}

IMPORTANT:
- Be THOROUGH in extraction - capture all relevant information
- For rawContentType, use YOUR OWN WORDS to describe what this is (e.g., "developer portfolio showing past project experience", "passport biodata page", "building valuation report")
- If you're unsure about something, still include it with lower confidence
- Don't leave arrays empty if there IS relevant content - extract what you can`;
}

// =============================================================================
// FEW-SHOT EXAMPLES
// =============================================================================
// These examples help the model understand edge cases and improve accuracy

export interface SummaryExample {
  description: string;
  fileName: string;
  contentSample: string;
  expectedOutput: {
    documentDescription: string;
    documentPurpose: string;
    rawContentType: string;
    documentCharacteristics: {
      isFinancial: boolean;
      isLegal: boolean;
      isIdentity: boolean;
      isReport: boolean;
      isDesign: boolean;
      isCorrespondence: boolean;
      hasMultipleProjects: boolean;
      isInternal: boolean;
    };
  };
  reasoning: string;
}

export const SUMMARY_EXAMPLES: SummaryExample[] = [
  {
    description: 'Developer Track Record / CV',
    fileName: 'ACME_Developments_Track_Record_2024.pdf',
    contentSample: `ACME Developments Ltd
Track Record

Our Portfolio
We have successfully delivered over 15 residential and commercial developments...

Project 1: Riverside Apartments (2022)
- Location: Manchester
- 45 units, GDV £12.5m
- Completed on time and budget

Project 2: Victoria Business Park (2021)
- Location: Birmingham
- 25,000 sqft commercial
- GDV £8.2m`,
    expectedOutput: {
      documentDescription: 'Company portfolio showcasing completed development projects and experience',
      documentPurpose: 'Demonstrate development track record and capability to potential lenders or investors',
      rawContentType: 'developer track record / company portfolio showing past project experience',
      documentCharacteristics: {
        isFinancial: false,
        isLegal: false,
        isIdentity: false,
        isReport: false,
        isDesign: false,
        isCorrespondence: false,
        hasMultipleProjects: true,
        isInternal: false,
      },
    },
    reasoning: 'Multiple completed projects with GDV figures indicates a track record document, not a single project appraisal. The hasMultipleProjects flag is critical here.',
  },
  {
    description: 'Passport / ID Document',
    fileName: 'John_Smith_Passport.pdf',
    contentSample: `PASSPORT
UNITED KINGDOM OF GREAT BRITAIN AND NORTHERN IRELAND

Surname: SMITH
Given names: JOHN DAVID
Nationality: BRITISH CITIZEN
Date of birth: 15 MAR 1980
Sex: M
Place of birth: LONDON
Date of issue: 20 JUN 2020
Date of expiry: 20 JUN 2030
P<GBRSMITH<<JOHN<<DAVID<<<<<<<<<<<<<<<<<<<<<`,
    expectedOutput: {
      documentDescription: 'British passport biodata page showing personal identity information',
      documentPurpose: 'Provide official proof of identity and nationality for KYC verification',
      rawContentType: 'passport biodata page / identity document',
      documentCharacteristics: {
        isFinancial: false,
        isLegal: false,
        isIdentity: true,
        isReport: false,
        isDesign: false,
        isCorrespondence: false,
        hasMultipleProjects: false,
        isInternal: false,
      },
    },
    reasoning: 'MRZ code, passport header, and personal details clearly indicate this is an identity document. The isIdentity flag must be true.',
  },
  {
    description: 'RedBook Valuation Report',
    fileName: 'Valuation_Report_123_High_Street.pdf',
    contentSample: `VALUATION REPORT
Prepared in accordance with RICS Valuation - Global Standards 2022

Property Address: 123 High Street, London E1 2AB
Valuation Date: 15 March 2024
Instruction: Full Building Valuation

Market Value: £2,500,000
(Two Million Five Hundred Thousand Pounds)

This valuation has been prepared in accordance with the RICS Valuation...`,
    expectedOutput: {
      documentDescription: 'Professional RICS valuation report for a property',
      documentPurpose: 'Provide formal market value assessment for lending or sale purposes',
      rawContentType: 'RICS red book valuation report / property appraisal',
      documentCharacteristics: {
        isFinancial: true,
        isLegal: false,
        isIdentity: false,
        isReport: true,
        isDesign: false,
        isCorrespondence: false,
        hasMultipleProjects: false,
        isInternal: false,
      },
    },
    reasoning: 'RICS reference, market value statement, and formal valuation language indicate a professional valuation report. Both isFinancial and isReport should be true.',
  },
  {
    description: 'Development Appraisal Spreadsheet',
    fileName: 'Appraisal_Woodside_Development.xlsx',
    contentSample: `DEVELOPMENT APPRAISAL
Project: Woodside Lofts

REVENUE
Residential Sales: £15,200,000
Commercial: £2,800,000
Gross Development Value: £18,000,000

COSTS
Site Acquisition: £4,500,000
Construction: £8,200,000
Professional Fees: £820,000
Finance Costs: £1,200,000
Total Development Cost: £14,720,000

PROFIT
Developer Profit: £3,280,000
Profit on GDV: 18.2%
Profit on Cost: 22.3%`,
    expectedOutput: {
      documentDescription: 'Development appraisal showing financial feasibility analysis for a property project',
      documentPurpose: 'Assess financial viability and projected returns for a development scheme',
      rawContentType: 'development appraisal / feasibility study with financial projections',
      documentCharacteristics: {
        isFinancial: true,
        isLegal: false,
        isIdentity: false,
        isReport: false,
        isDesign: false,
        isCorrespondence: false,
        hasMultipleProjects: false,
        isInternal: false,
      },
    },
    reasoning: 'GDV, costs breakdown, and profit calculations indicate a development appraisal. This is financial analysis for a single project, not a track record.',
  },
  {
    description: 'Architectural Floor Plans',
    fileName: 'Floor_Plans_Rev_C.pdf',
    contentSample: `GROUND FLOOR PLAN
Scale 1:100 @ A1

Unit 1 - 2 Bed Flat - 75 sqm
- Living/Kitchen: 28 sqm
- Bedroom 1: 14 sqm
- Bedroom 2: 11 sqm
- Bathroom: 5 sqm

Unit 2 - 1 Bed Flat - 52 sqm
- Living/Kitchen: 22 sqm
- Bedroom: 12 sqm
- Bathroom: 4 sqm

Drawing No: A-100-03
Revision: C
Date: 15/02/2024
Architect: Smith & Jones Architects`,
    expectedOutput: {
      documentDescription: 'Architectural floor plan drawings showing unit layouts and dimensions',
      documentPurpose: 'Document building design and unit configurations for construction and planning',
      rawContentType: 'architectural floor plans / building drawings',
      documentCharacteristics: {
        isFinancial: false,
        isLegal: false,
        isIdentity: false,
        isReport: false,
        isDesign: true,
        isCorrespondence: false,
        hasMultipleProjects: false,
        isInternal: false,
      },
    },
    reasoning: 'Scale references, room dimensions, drawing numbers, and architect attribution indicate architectural drawings. The isDesign flag must be true.',
  },
];
