// =============================================================================
// VERIFICATION AGENT MODULE
// =============================================================================
// Validates classification decisions, especially for low-confidence results.

import { BulkAnalysisResult, FolderInfo } from '../types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '../config';
import { fetchWithRetry, parseJsonResponse } from '../utils/retry';

export interface VerificationResult {
  verified: boolean;
  adjustedClassification?: Partial<BulkAnalysisResult>;
  notes: string;
}

/**
 * Build the verification prompt
 */
function buildVerificationPrompt(
  classification: BulkAnalysisResult,
  textSample: string,
  fileName: string,
  availableFolders: FolderInfo[]
): string {
  return `You are a document classification verifier. Review this classification decision and verify it is correct.

PROPOSED CLASSIFICATION:
- File Type: ${classification.fileType}
- Category: ${classification.category}
- Folder: ${classification.suggestedFolder}
- Confidence: ${classification.confidence}
- Summary: ${classification.summary}

AVAILABLE FOLDERS (classification MUST use one of these):
${availableFolders.map(f => `- ${f.folderKey} (${f.level} level): ${f.name}`).join('\n')}

FILE NAME: ${fileName}

DOCUMENT EXCERPT (first 5000 chars):
${textSample.slice(0, 5000)}

VERIFICATION TASKS:
1. Does the fileType accurately describe this document?
2. Does the category make sense for this content?
3. Is the suggested folder appropriate AND does it exist in the available folders list?
4. Does the confidence score seem reasonable?

Respond in JSON:
{
  "verified": true/false,
  "adjustments": {
    "fileType": "only if needs change",
    "category": "only if needs change",
    "suggestedFolder": "only if needs change - MUST be from available folders",
    "confidence": 0.85
  },
  "notes": "Brief explanation of verification decision"
}`;
}

/**
 * Run the Verification Agent to validate a classification
 */
export async function runVerificationAgent(
  classification: BulkAnalysisResult,
  textContent: string,
  fileName: string,
  availableFolders: FolderInfo[],
  apiKey: string
): Promise<VerificationResult> {
  const prompt = buildVerificationPrompt(classification, textContent, fileName, availableFolders);

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
          temperature: 0.1,
          max_tokens: 500,
        }),
      },
      'Verification Agent'
    );

    if (!response.ok) {
      return { verified: true, notes: 'Verification skipped - API error' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      const parsed = parseJsonResponse(content);

      if (parsed) {
        // Validate that suggested folder exists
        if (parsed.adjustments?.suggestedFolder) {
          const folderExists = availableFolders.some(f => f.folderKey === parsed.adjustments.suggestedFolder);
          if (!folderExists) {
            parsed.adjustments.suggestedFolder = undefined;
          }
        }

        return {
          verified: parsed.verified ?? true,
          adjustedClassification: parsed.adjustments,
          notes: parsed.notes || 'Verification complete',
        };
      }
    }
  } catch (error) {
    console.warn('[Verification Agent] Error:', error);
  }

  return { verified: true, notes: 'Verification skipped - parse error' };
}

/**
 * Apply verification adjustments to a classification result
 */
export function applyVerificationAdjustments(
  classification: BulkAnalysisResult,
  verification: VerificationResult,
  availableFolders: FolderInfo[]
): BulkAnalysisResult {
  if (!verification.adjustedClassification) {
    return classification;
  }

  const adj = verification.adjustedClassification;
  const result = { ...classification };

  if (adj.fileType) result.fileType = adj.fileType;
  if (adj.category) result.category = adj.category;

  if (adj.suggestedFolder) {
    // Validate adjusted folder exists
    const folderExists = availableFolders.some(f => f.folderKey === adj.suggestedFolder);
    if (folderExists) {
      result.suggestedFolder = adj.suggestedFolder;
      const matchedFolder = availableFolders.find(f => f.folderKey === adj.suggestedFolder);
      if (matchedFolder) {
        result.targetLevel = matchedFolder.level;
      }
    }
  }

  if (typeof adj.confidence === 'number') {
    result.confidence = adj.confidence;
  }

  // Update verification notes
  result.verificationNotes = verification.notes;
  result.verificationPassed = verification.verified;

  return result;
}
