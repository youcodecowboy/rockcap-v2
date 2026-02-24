// =============================================================================
// CLASSIFICATION AGENT PROMPT
// =============================================================================
// This agent takes the Summary Agent's output and makes classification decisions.
// It determines fileType, category, and suggested folder.

import { DocumentSummary, FolderInfo, FileTypeDefinition, FilenameTypeHint } from '../types';

/**
 * Build guidance text from relevant file type definitions
 */
function buildFileTypeGuidance(
  summary: DocumentSummary,
  definitions: FileTypeDefinition[]
): string {
  // Find definitions that match keywords in the summary
  const summaryText = `${summary.rawContentType} ${summary.documentDescription} ${summary.executiveSummary}`.toLowerCase();

  const relevantDefs = definitions
    .filter(def => {
      return def.keywords?.some(k => summaryText.includes(k.toLowerCase())) ||
             summaryText.includes(def.fileType.toLowerCase());
    })
    .slice(0, 8);

  if (relevantDefs.length === 0) {
    return 'No specific guidance available - use your judgment based on the available types.';
  }

  return relevantDefs.map(def =>
    `**${def.fileType}** (${def.category}):\n` +
    `  Description: ${def.description?.substring(0, 200) || 'N/A'}\n` +
    `  Key indicators: ${def.identificationRules?.slice(0, 3).join('; ') || 'N/A'}`
  ).join('\n\n');
}

/**
 * Build the classification agent prompt
 */
export function buildClassificationPrompt(
  summary: DocumentSummary,
  fileName: string,
  fileTypes: string[],
  categories: string[],
  availableFolders: FolderInfo[],
  fileTypeDefinitions: FileTypeDefinition[],
  filenameHint: FilenameTypeHint | null
): string {
  const fileTypeGuidance = buildFileTypeGuidance(summary, fileTypeDefinitions);

  return `You are a document classification specialist for a real estate lending firm.
You will receive a SUMMARY of a document (already analyzed by another agent) and must classify it.

## DOCUMENT SUMMARY (from Analysis Agent)

**Filename:** ${fileName}

**Document Description:** ${summary.documentDescription}
**Document Purpose:** ${summary.documentPurpose}
**AI's Raw Content Type Assessment:** ${summary.rawContentType}

**Entities Found:**
- People: ${summary.entities.people.length > 0 ? summary.entities.people.join(', ') : 'None identified'}
- Companies: ${summary.entities.companies.length > 0 ? summary.entities.companies.join(', ') : 'None identified'}
- Locations: ${summary.entities.locations.length > 0 ? summary.entities.locations.join(', ') : 'None identified'}
- Projects: ${summary.entities.projects.length > 0 ? summary.entities.projects.join(', ') : 'None identified'}

**Key Terms:** ${summary.keyTerms.length > 0 ? summary.keyTerms.join(', ') : 'None identified'}
**Key Amounts:** ${summary.keyAmounts.length > 0 ? summary.keyAmounts.join(', ') : 'None identified'}

**Document Characteristics:**
- Financial content: ${summary.documentCharacteristics.isFinancial}
- Legal document: ${summary.documentCharacteristics.isLegal}
- Identity/KYC: ${summary.documentCharacteristics.isIdentity}
- Professional report: ${summary.documentCharacteristics.isReport}
- Design/Architectural: ${summary.documentCharacteristics.isDesign}
- Correspondence: ${summary.documentCharacteristics.isCorrespondence}
- Multi-project portfolio: ${summary.documentCharacteristics.hasMultipleProjects}

**Executive Summary:** ${summary.executiveSummary}

**Detailed Summary:** ${summary.detailedSummary}
${filenameHint ? `
**Filename Pattern Hint:** The filename suggests this might be: ${filenameHint.fileType} (${filenameHint.category})
Reason: ${filenameHint.reason}
Note: This is just a hint - use the full summary to make your decision.` : ''}

## CLASSIFICATION GUIDANCE

Relevant file types based on document content:

${fileTypeGuidance}

## AVAILABLE OPTIONS

**File Types (choose the MOST SPECIFIC match):**
${fileTypes.join(', ')}

**Categories:**
${categories.join(', ')}

**Folders:**
${availableFolders.map(f => `- ${f.folderKey} (${f.level}): ${f.name}`).join('\n')}

## CLASSIFICATION RULES

1. **Match rawContentType to fileType**: The AI's "rawContentType" assessment is your best guide
   - "developer portfolio showing past project experience" → "Track Record"
   - "passport biodata page" → "Passport"
   - "building valuation report" → "RedBook Valuation"
   - "design presentation for development" → could be "Floor Plans", "Elevations", or "Track Record" depending on content

2. **Use characteristics to narrow down**:
   - isIdentity=true → KYC category, kyc folder
   - isFinancial=true + appraisal terms → Appraisals category
   - isLegal=true → Legal Documents category
   - isDesign=true → Plans category or Project Documents
   - hasMultipleProjects=true + company experience → likely "Track Record"

3. **Consider purpose**: What is the document FOR?
   - Demonstrating company capability → Track Record
   - Providing property value → Valuation/Appraisal
   - Showing building design → Floor Plans/Elevations
   - Identity verification → Passport/Driving License

4. **Avoid "Other"**: Only use "Other" if truly unidentifiable. If the summary is clear, classify accordingly.

## OUTPUT

Respond with ONLY a JSON object:
{
  "fileType": "The specific file type from the list",
  "category": "The category from the list",
  "suggestedFolder": "The folder key",
  "confidence": 0.85,
  "reasoning": "2-3 sentences explaining why this classification is correct based on the summary",
  "alternativeTypes": [
    { "type": "Alternative Type", "confidence": 0.65, "reason": "Why this could also apply" }
  ]
}`;
}

// =============================================================================
// CLASSIFICATION EXAMPLES
// =============================================================================

export interface ClassificationExample {
  description: string;
  summary: {
    rawContentType: string;
    documentCharacteristics: {
      isFinancial: boolean;
      hasMultipleProjects: boolean;
      isIdentity: boolean;
      isLegal: boolean;
      isDesign: boolean;
    };
    keyTerms: string[];
  };
  expectedDecision: {
    fileType: string;
    category: string;
    folder: string;
  };
  reasoning: string;
}

export const CLASSIFICATION_EXAMPLES: ClassificationExample[] = [
  {
    description: 'Developer Track Record',
    summary: {
      rawContentType: 'developer track record / company portfolio showing past project experience',
      documentCharacteristics: {
        isFinancial: false,
        hasMultipleProjects: true,
        isIdentity: false,
        isLegal: false,
        isDesign: false,
      },
      keyTerms: ['GDV', 'completion', 'development', 'portfolio'],
    },
    expectedDecision: {
      fileType: 'Track Record',
      category: 'KYC',
      folder: 'kyc',
    },
    reasoning: 'hasMultipleProjects=true combined with "track record" in rawContentType indicates this is a Track Record document for KYC purposes.',
  },
  {
    description: 'Passport',
    summary: {
      rawContentType: 'passport biodata page / identity document',
      documentCharacteristics: {
        isFinancial: false,
        hasMultipleProjects: false,
        isIdentity: true,
        isLegal: false,
        isDesign: false,
      },
      keyTerms: ['passport', 'nationality', 'date of birth'],
    },
    expectedDecision: {
      fileType: 'Passport',
      category: 'KYC',
      folder: 'kyc',
    },
    reasoning: 'isIdentity=true and "passport" in rawContentType clearly indicates a Passport document.',
  },
  {
    description: 'Valuation Report',
    summary: {
      rawContentType: 'RICS red book valuation report / property appraisal',
      documentCharacteristics: {
        isFinancial: true,
        hasMultipleProjects: false,
        isIdentity: false,
        isLegal: false,
        isDesign: false,
      },
      keyTerms: ['RICS', 'market value', 'valuation'],
    },
    expectedDecision: {
      fileType: 'RedBook Valuation',
      category: 'Appraisals',
      folder: 'appraisals',
    },
    reasoning: 'RICS reference and "valuation" keywords indicate a professional RedBook Valuation.',
  },
  {
    description: 'Floor Plans',
    summary: {
      rawContentType: 'architectural floor plans / building drawings',
      documentCharacteristics: {
        isFinancial: false,
        hasMultipleProjects: false,
        isIdentity: false,
        isLegal: false,
        isDesign: true,
      },
      keyTerms: ['floor plan', 'scale', 'sqm', 'architect'],
    },
    expectedDecision: {
      fileType: 'Floor Plans',
      category: 'Plans',
      folder: 'background',
    },
    reasoning: 'isDesign=true with "floor plans" in rawContentType indicates architectural Floor Plans.',
  },
];
