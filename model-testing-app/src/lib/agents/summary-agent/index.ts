// =============================================================================
// SUMMARY AGENT MODULE
// =============================================================================
// Stage 1 of the document analysis pipeline.
// Analyzes documents to extract structured information WITHOUT classification.
// Output is used by the Classification Agent to make informed decisions.

import { DocumentSummary } from '../types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '../config';
import { fetchWithRetry, parseJsonResponse } from '../utils/retry';
import { buildSummaryPrompt } from './prompt';

export * from './types';
export { SUMMARY_EXAMPLES } from './prompt';

/**
 * Run the Summary Agent to analyze a document
 *
 * @param textContent - The extracted text content from the document
 * @param fileName - The original filename
 * @param apiKey - Together AI API key
 * @returns DocumentSummary with extracted information
 */
export async function runSummaryAgent(
  textContent: string,
  fileName: string,
  apiKey: string
): Promise<DocumentSummary> {
  const prompt = buildSummaryPrompt(fileName, textContent);

  try {
    const response = await fetchWithRetry(
      TOGETHER_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_CONFIG.analysis.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: MODEL_CONFIG.analysis.temperature,
          max_tokens: MODEL_CONFIG.analysis.maxTokens,
        }),
      },
      'Summary Agent'
    );

    if (!response.ok) {
      throw new Error(`Summary Agent API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      const parsed = parseJsonResponse(content);

      if (parsed) {
        // Ensure all required fields are present with proper defaults
        return normalizeDocumentSummary(parsed, fileName);
      }
    }
  } catch (error) {
    console.error('[Summary Agent] Error:', error);
  }

  // Fallback if API fails
  return createFallbackSummary(fileName);
}

/**
 * Normalize and validate the parsed summary response
 */
function normalizeDocumentSummary(parsed: any, fileName: string): DocumentSummary {
  return {
    documentDescription: parsed.documentDescription || 'Unable to determine',
    documentPurpose: parsed.documentPurpose || 'Unable to determine',
    entities: {
      people: Array.isArray(parsed.entities?.people) ? parsed.entities.people : [],
      companies: Array.isArray(parsed.entities?.companies) ? parsed.entities.companies : [],
      locations: Array.isArray(parsed.entities?.locations) ? parsed.entities.locations : [],
      projects: Array.isArray(parsed.entities?.projects) ? parsed.entities.projects : [],
    },
    keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
    keyDates: Array.isArray(parsed.keyDates) ? parsed.keyDates : [],
    keyAmounts: Array.isArray(parsed.keyAmounts) ? parsed.keyAmounts : [],
    executiveSummary: parsed.executiveSummary || 'No summary available',
    detailedSummary: parsed.detailedSummary || 'No detailed summary available',
    sectionBreakdown: Array.isArray(parsed.sectionBreakdown) ? parsed.sectionBreakdown : undefined,
    documentCharacteristics: {
      isFinancial: !!parsed.documentCharacteristics?.isFinancial,
      isLegal: !!parsed.documentCharacteristics?.isLegal,
      isIdentity: !!parsed.documentCharacteristics?.isIdentity,
      isReport: !!parsed.documentCharacteristics?.isReport,
      isDesign: !!parsed.documentCharacteristics?.isDesign,
      isCorrespondence: !!parsed.documentCharacteristics?.isCorrespondence,
      hasMultipleProjects: !!parsed.documentCharacteristics?.hasMultipleProjects,
      isInternal: !!parsed.documentCharacteristics?.isInternal,
    },
    rawContentType: parsed.rawContentType || 'Unknown document',
    confidenceInAnalysis: typeof parsed.confidenceInAnalysis === 'number' ? parsed.confidenceInAnalysis : 0.5,
  };
}

/**
 * Create a fallback summary when the API fails
 */
function createFallbackSummary(fileName: string): DocumentSummary {
  return {
    documentDescription: 'Unable to analyze document',
    documentPurpose: 'Unknown',
    entities: { people: [], companies: [], locations: [], projects: [] },
    keyTerms: [],
    keyDates: [],
    keyAmounts: [],
    executiveSummary: `Document: ${fileName}`,
    detailedSummary: 'Analysis failed - using fallback',
    sectionBreakdown: undefined,
    documentCharacteristics: {
      isFinancial: false,
      isLegal: false,
      isIdentity: false,
      isReport: false,
      isDesign: false,
      isCorrespondence: false,
      hasMultipleProjects: false,
      isInternal: false,
    },
    rawContentType: 'Unknown',
    confidenceInAnalysis: 0.1,
  };
}

/**
 * Create a fallback summary from basic text analysis (used when document has minimal text)
 */
export function createMinimalTextSummary(fileName: string, textContent: string): DocumentSummary {
  return {
    documentDescription: 'Document with limited extractable text (possibly scanned/image-based)',
    documentPurpose: 'Unknown - insufficient text for analysis',
    entities: { people: [], companies: [], locations: [], projects: [] },
    keyTerms: [],
    keyDates: [],
    keyAmounts: [],
    executiveSummary: `Document: ${fileName} - Limited text extracted`,
    detailedSummary: textContent.substring(0, 500),
    sectionBreakdown: undefined,
    documentCharacteristics: {
      isFinancial: false,
      isLegal: false,
      isIdentity: false,
      isReport: false,
      isDesign: false,
      isCorrespondence: false,
      hasMultipleProjects: false,
      isInternal: false,
    },
    rawContentType: 'Unknown (limited text)',
    confidenceInAnalysis: 0.2,
  };
}
