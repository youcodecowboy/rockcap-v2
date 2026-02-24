// =============================================================================
// CLASSIFICATION AGENT MODULE
// =============================================================================
// Stage 2 of the document analysis pipeline.
// Takes the Summary Agent's output and makes classification decisions.

import { DocumentSummary, ClassificationDecision, FolderInfo, FileTypeDefinition, FilenameTypeHint } from '../types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '../config';
import { fetchWithRetry, parseJsonResponse } from '../utils/retry';
import { buildClassificationPrompt } from './prompt';

export * from './types';
export { CLASSIFICATION_EXAMPLES } from './prompt';

/**
 * Run the Classification Agent to classify a document
 *
 * @param summary - The document summary from the Summary Agent
 * @param fileName - The original filename
 * @param fileTypes - Available file types to choose from
 * @param categories - Available categories to choose from
 * @param availableFolders - Available folders to file to
 * @param fileTypeDefinitions - Definitions for file type matching
 * @param filenameHint - Optional hint from filename pattern matching
 * @param apiKey - Together AI API key
 * @returns ClassificationDecision with fileType, category, folder, etc.
 */
export async function runClassificationAgent(
  summary: DocumentSummary,
  fileName: string,
  fileTypes: string[],
  categories: string[],
  availableFolders: FolderInfo[],
  fileTypeDefinitions: FileTypeDefinition[],
  filenameHint: FilenameTypeHint | null,
  apiKey: string
): Promise<ClassificationDecision> {
  const prompt = buildClassificationPrompt(
    summary,
    fileName,
    fileTypes,
    categories,
    availableFolders,
    fileTypeDefinitions,
    filenameHint
  );

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
          max_tokens: 800,
        }),
      },
      'Classification Agent'
    );

    if (!response.ok) {
      throw new Error(`Classification Agent API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      const parsed = parseJsonResponse(content);

      if (parsed) {
        return normalizeClassificationDecision(parsed, fileTypes, categories, availableFolders);
      }
    }
  } catch (error) {
    console.error('[Classification Agent] Error:', error);
  }

  // Fallback classification based on summary characteristics
  return createFallbackClassification(summary, availableFolders);
}

/**
 * Normalize and validate the parsed classification response
 */
function normalizeClassificationDecision(
  parsed: any,
  fileTypes: string[],
  categories: string[],
  availableFolders: FolderInfo[]
): ClassificationDecision {
  // Validate fileType is in list
  let finalType = parsed.fileType || 'Other';
  if (!fileTypes.includes(finalType)) {
    // Try case-insensitive match
    const caseMatch = fileTypes.find(t => t.toLowerCase() === finalType.toLowerCase());
    finalType = caseMatch || 'Other';
  }

  // Validate category
  let finalCategory = parsed.category || 'Other';
  if (!categories.includes(finalCategory)) {
    const caseMatch = categories.find(c => c.toLowerCase() === finalCategory.toLowerCase());
    finalCategory = caseMatch || 'Other';
  }

  // Validate folder
  let finalFolder = parsed.suggestedFolder || 'miscellaneous';
  if (!availableFolders.some(f => f.folderKey === finalFolder)) {
    const folderMatch = availableFolders.find(f =>
      f.folderKey.toLowerCase().includes(finalFolder.toLowerCase()) ||
      finalFolder.toLowerCase().includes(f.folderKey.toLowerCase())
    );
    finalFolder = folderMatch?.folderKey || 'miscellaneous';
  }

  return {
    fileType: finalType,
    category: finalCategory,
    suggestedFolder: finalFolder,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
    reasoning: parsed.reasoning || 'Classification based on document analysis',
    alternativeTypes: Array.isArray(parsed.alternativeTypes) ? parsed.alternativeTypes : undefined,
  };
}

/**
 * Create a fallback classification based on document characteristics
 */
function createFallbackClassification(
  summary: DocumentSummary,
  availableFolders: FolderInfo[]
): ClassificationDecision {
  let fallbackType = 'Other';
  let fallbackCategory = 'Other';
  let fallbackFolder = 'miscellaneous';

  if (summary.documentCharacteristics.isIdentity) {
    fallbackType = 'ID Document';
    fallbackCategory = 'KYC';
    fallbackFolder = 'kyc';
  } else if (summary.documentCharacteristics.isFinancial) {
    fallbackType = 'Financial Document';
    fallbackCategory = 'Financial Documents';
    fallbackFolder = 'operational_model';
  } else if (summary.documentCharacteristics.isLegal) {
    fallbackType = 'Legal Document';
    fallbackCategory = 'Legal Documents';
    fallbackFolder = 'background';
  } else if (summary.documentCharacteristics.hasMultipleProjects) {
    fallbackType = 'Track Record';
    fallbackCategory = 'KYC';
    fallbackFolder = 'kyc';
  } else if (summary.documentCharacteristics.isDesign) {
    fallbackType = 'Design Document';
    fallbackCategory = 'Plans';
    fallbackFolder = 'background';
  } else if (summary.documentCharacteristics.isReport) {
    fallbackType = 'Report';
    fallbackCategory = 'Professional Reports';
    fallbackFolder = 'credit_submission';
  }

  // Validate folder exists
  if (!availableFolders.some(f => f.folderKey === fallbackFolder)) {
    const fallbackFolderObj = availableFolders.find(f => f.folderKey === 'miscellaneous') ||
                              availableFolders[0];
    fallbackFolder = fallbackFolderObj?.folderKey || 'miscellaneous';
  }

  return {
    fileType: fallbackType,
    category: fallbackCategory,
    suggestedFolder: fallbackFolder,
    confidence: 0.4,
    reasoning: 'Fallback classification based on document characteristics',
  };
}
