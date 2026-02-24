// =============================================================================
// CHECKLIST MATCHING AGENT MODULE
// =============================================================================
// Matches documents to checklist requirements based on content and filename.

import { EnrichedChecklistItem, FilenameMatchResult } from '../types';
import { TOGETHER_API_URL, MODEL_CONFIG } from '../config';
import { fetchWithRetry, parseJsonResponse } from '../utils/retry';

export interface ChecklistAgentMatch {
  itemId: string;
  confidence: number;
  reasoning: string;
}

/**
 * Build the checklist matching prompt
 */
function buildChecklistPrompt(
  textContent: string,
  fileName: string,
  fileType: string,
  category: string,
  checklistItems: EnrichedChecklistItem[],
  filenameMatches: FilenameMatchResult[]
): string {
  const itemDescriptions = checklistItems.map(item => {
    const filenameMatch = filenameMatches.find(m => m.itemId === item._id);
    const matchHint = filenameMatch
      ? ` [FILENAME HINT: ${filenameMatch.reason} - score ${filenameMatch.score.toFixed(2)}]`
      : '';

    return `ID: ${item._id}
Name: ${item.name}
Category: ${item.category}
Description: ${item.description || 'No description'}
Acceptable Document Types: ${item.matchingDocumentTypes?.join(', ') || 'Not specified'}${matchHint}`;
  }).join('\n\n');

  return `You are a document-to-checklist matching specialist. Your ONLY task is to match this document to checklist requirements.

DOCUMENT ANALYSIS:
- Filename: ${fileName}
- Classified as: ${fileType} (Category: ${category})
- Content preview (first 8000 chars):
${textContent.slice(0, 8000)}

CHECKLIST REQUIREMENTS TO MATCH AGAINST:
${itemDescriptions}

MATCHING RULES (BE GENEROUS - users expect clear matches to work):
1. If filename explicitly contains a requirement name or its aliases → HIGH confidence (0.85+)
2. If document TYPE matches an item's "Acceptable Document Types" → MEDIUM-HIGH confidence (0.75+)
3. If document content clearly serves the purpose described → MEDIUM confidence (0.65+)
4. If there's reasonable semantic similarity → suggest with LOWER confidence (0.50-0.65)

EXAMPLES OF MATCHES:
- "Smith_ProofOfAddress_Dec2024.pdf" → "Certified Proof of Address" (0.90)
- "Passport_JohnSmith.pdf" → "Certified Proof of ID" (0.90)
- A utility bill PDF → "Certified Proof of Address" (0.85)
- A bank statement PDF → Could match "Business Bank Statements" OR "Proof of Address" (suggest both)
- A valuation report → "Valuation Report" (0.90)
- An appraisal spreadsheet → "Appraisal" (0.85)

IMPORTANT: If [FILENAME HINT] scores are provided, use them as strong signals - don't contradict clear filename matches.

Return ONLY a JSON array of matches:
[
  { "itemId": "exact_id_from_above", "confidence": 0.85, "reasoning": "Brief explanation" }
]

Return [] if no reasonable matches. You MAY return multiple matches if the document could fulfill multiple requirements.`;
}

/**
 * Run the Checklist Matching Agent
 */
export async function runChecklistMatchingAgent(
  textContent: string,
  fileName: string,
  fileType: string,
  category: string,
  checklistItems: EnrichedChecklistItem[],
  filenameMatches: FilenameMatchResult[],
  apiKey: string
): Promise<ChecklistAgentMatch[]> {
  // Only include missing/pending items
  const eligibleItems = checklistItems.filter(
    item => item.status === 'missing' || item.status === 'pending_review'
  );

  if (eligibleItems.length === 0) {
    return [];
  }

  const prompt = buildChecklistPrompt(
    textContent,
    fileName,
    fileType,
    category,
    eligibleItems,
    filenameMatches
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
      'Checklist Agent'
    );

    if (!response.ok) {
      console.warn('[Checklist Agent] API error, returning filename matches only');
      return createFallbackFromFilenameMatches(filenameMatches);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      const parsed = parseJsonResponse(content);

      if (Array.isArray(parsed)) {
        // Validate and clean results
        return parsed
          .filter((m: any) =>
            m.itemId &&
            typeof m.confidence === 'number' &&
            eligibleItems.some(item => item._id === m.itemId)
          )
          .map((m: any) => ({
            itemId: m.itemId,
            confidence: Math.min(Math.max(m.confidence, 0), 1),
            reasoning: m.reasoning || 'Matched by checklist agent',
          }));
      }
    }
  } catch (error) {
    console.warn('[Checklist Agent] Error:', error);
  }

  // Fall back to filename matches
  return createFallbackFromFilenameMatches(filenameMatches);
}

/**
 * Create fallback matches from filename pattern matches
 */
function createFallbackFromFilenameMatches(filenameMatches: FilenameMatchResult[]): ChecklistAgentMatch[] {
  return filenameMatches
    .filter(m => m.score >= 0.6)
    .map(m => ({
      itemId: m.itemId,
      confidence: m.score,
      reasoning: m.reason,
    }));
}

/**
 * Merge checklist matches from multiple sources
 */
export function mergeChecklistMatches(
  existingMatches: ChecklistAgentMatch[],
  newMatches: ChecklistAgentMatch[],
  checklistItems: EnrichedChecklistItem[]
): ChecklistAgentMatch[] {
  const mergedMatches = [...existingMatches];

  for (const newMatch of newMatches) {
    const existingIndex = mergedMatches.findIndex(m => m.itemId === newMatch.itemId);
    if (existingIndex >= 0) {
      // Keep higher confidence
      if (newMatch.confidence > mergedMatches[existingIndex].confidence) {
        mergedMatches[existingIndex] = newMatch;
      }
    } else {
      mergedMatches.push(newMatch);
    }
  }

  // Sort by confidence descending and filter low-confidence matches
  return mergedMatches
    .filter(m => m.confidence >= 0.50)
    .sort((a, b) => b.confidence - a.confidence);
}
