// =============================================================================
// CRITIC AGENT MODULE
// =============================================================================
// Final decision-making agent that reviews all signals and applies learned
// corrections from the feedback loop. Uses OpenAI GPT-4o for stronger reasoning.

import {
  CriticAgentInput,
  CriticAgentOutput,
  DocumentSummary,
  FolderInfo,
  EnrichedChecklistItem,
  ConsolidatedRule,
  TargetedCorrection,
  ConfusionPair,
  CorrectionContextTier,
  PastCorrection,
} from '../types';
import { OPENAI_API_URL, MODEL_CONFIG } from '../config';
import { fetchWithRetry, parseJsonResponse } from '../utils/retry';

export type { CriticAgentInput, CriticAgentOutput };

// =============================================================================
// SMART CORRECTION RETRIEVAL SYSTEM
// =============================================================================
// Uses tiered approach to minimize context size while maximizing learning:
// - High confidence (>0.85): No corrections needed
// - Medium confidence (0.65-0.85): Consolidated rules only (~100 tokens)
// - Low confidence (<0.65): Targeted corrections for specific confusion pairs
// - Very low confidence (<0.5): Full correction context

/**
 * Determine which tier of correction context to use based on confidence
 */
export function determineCorrectionTier(
  confidence: number,
  hasAlternatives: boolean = false
): CorrectionContextTier {
  if (confidence > 0.85 && !hasAlternatives) {
    return 'none';
  }
  if (confidence >= 0.65) {
    return 'consolidated';
  }
  if (confidence >= 0.5) {
    return 'targeted';
  }
  return 'full';
}

/**
 * Identify confusion pairs from classification alternatives
 * Returns the types the AI is uncertain between
 */
export function extractConfusionPairs(
  classification: {
    fileType: string;
    category: string;
    alternativeTypes?: Array<{ type: string; confidence: number }>;
  }
): ConfusionPair[] {
  const pairs: ConfusionPair[] = [];

  // If we have alternatives, those are the confusion points
  if (classification.alternativeTypes && classification.alternativeTypes.length > 0) {
    const fileTypeOptions = [
      classification.fileType,
      ...classification.alternativeTypes.map(a => a.type)
    ].filter((t, i, arr) => arr.indexOf(t) === i); // dedupe

    if (fileTypeOptions.length > 1) {
      pairs.push({
        field: 'fileType',
        options: fileTypeOptions.slice(0, 3), // Limit to top 3
      });
    }
  }

  // Common confusion patterns to check
  const commonConfusions: Record<string, string[]> = {
    'Other': ['Track Record', 'Bank Statement', 'ID Document'],
    'Track Record': ['Other', 'Appraisal'],
    'Proof of Address': ['Bank Statement', 'Utility Bill'],
    'ID Document': ['Passport', 'Driving License'],
  };

  // If the current type has known confusion partners, add them
  const confusionPartners = commonConfusions[classification.fileType];
  if (confusionPartners && !pairs.find(p => p.field === 'fileType')) {
    pairs.push({
      field: 'fileType',
      options: [classification.fileType, ...confusionPartners].slice(0, 4),
    });
  }

  return pairs;
}

/**
 * Build COMPACT consolidated rules context (~100 tokens)
 * Shows aggregated patterns like "Other → Track Record (12x)"
 */
export function buildConsolidatedRulesContext(
  rules: ConsolidatedRule[]
): string {
  if (!rules || rules.length === 0) {
    return '';
  }

  // Sort by correction count (most common first)
  const sorted = [...rules].sort((a, b) => b.correctionCount - a.correctionCount);

  // Take top 5 most common rules
  const topRules = sorted.slice(0, 5);

  const rulesText = topRules.map(r =>
    `• ${r.fromValue} → ${r.toValue} (${r.correctionCount}x, ~${Math.round(r.averageConfidence * 100)}% conf)`
  ).join('\n');

  return `
## LEARNED PATTERNS (from ${rules.reduce((sum, r) => sum + r.correctionCount, 0)} past corrections)
${rulesText}

⚠️ If your classification matches a "from" value above, consider the learned "to" value.
`;
}

/**
 * Build TARGETED corrections context for specific confusion pairs (~200-400 tokens)
 * Only includes corrections relevant to the specific types we're uncertain between
 */
export function buildTargetedCorrectionsContext(
  corrections: PastCorrection[],
  confusionPairs: ConfusionPair[]
): string {
  if (!corrections || corrections.length === 0 || confusionPairs.length === 0) {
    return '';
  }

  // Filter corrections that match our confusion pairs
  const relevantCorrections = corrections.filter(c => {
    return confusionPairs.some(pair => {
      if (pair.field === 'fileType') {
        return pair.options.includes(c.aiPrediction.fileType) ||
               (c.userCorrection.fileType && pair.options.includes(c.userCorrection.fileType));
      }
      if (pair.field === 'category') {
        return pair.options.includes(c.aiPrediction.category) ||
               (c.userCorrection.category && pair.options.includes(c.userCorrection.category));
      }
      return false;
    });
  });

  if (relevantCorrections.length === 0) {
    return '';
  }

  // Take top 3 most relevant
  const topCorrections = relevantCorrections
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);

  const pairsText = confusionPairs.map(p =>
    `${p.field}: ${p.options.join(' vs ')}`
  ).join(', ');

  const correctionsText = topCorrections.map((c, i) => {
    const changes = [];
    if (c.userCorrection.fileType) {
      changes.push(`fileType: "${c.aiPrediction.fileType}" → "${c.userCorrection.fileType}"`);
    }
    if (c.userCorrection.category) {
      changes.push(`category: "${c.aiPrediction.category}" → "${c.userCorrection.category}"`);
    }
    return `${i + 1}. **${c.fileName}**: ${changes.join(', ')}`;
  }).join('\n');

  return `
## TARGETED CORRECTIONS (for your uncertainty: ${pairsText})
These past corrections are specifically relevant to what you're uncertain about:

${correctionsText}

⚠️ Apply these learned corrections if the current document is similar.
`;
}

/**
 * Build corrections context for self-teaching feedback loop
 */
function buildCorrectionsContext(pastCorrections: CriticAgentInput['pastCorrections']): string {
  if (!pastCorrections || pastCorrections.length === 0) {
    return '';
  }

  const correctionsText = pastCorrections.map((c, i) => {
    const correctionDetails = [];
    if (c.userCorrection.fileType) {
      correctionDetails.push(`fileType: "${c.aiPrediction.fileType}" → "${c.userCorrection.fileType}"`);
    }
    if (c.userCorrection.category) {
      correctionDetails.push(`category: "${c.aiPrediction.category}" → "${c.userCorrection.category}"`);
    }
    if (c.userCorrection.targetFolder) {
      correctionDetails.push(`folder: "${c.aiPrediction.targetFolder}" → "${c.userCorrection.targetFolder}"`);
    }
    if (c.userCorrection.checklistItems && c.userCorrection.checklistItems.length > 0) {
      const aiSuggested = c.aiPrediction.suggestedChecklistItems?.map(s => s.itemName).join(', ') || 'none';
      const userSelected = c.userCorrection.checklistItems.map(i => i.itemName).join(', ');
      correctionDetails.push(`checklist: [${aiSuggested}] → [${userSelected}]`);
    }

    return `### Correction ${i + 1} (Relevance: ${(c.relevanceScore * 100).toFixed(0)}%)
- **Why relevant:** ${c.matchReason}
- **Similar filename:** ${c.fileName}
- **Corrections:** ${correctionDetails.join(', ')}`;
  }).join('\n\n');

  return `
## LEARNING FROM PAST MISTAKES
I have made classification errors in the past for similar documents. Here are relevant corrections I should consider:

${correctionsText}

⚠️ INSTRUCTION: If the current document is similar to any of these past mistakes, I MUST apply the learned correction. I should explicitly state in my reasoning if I am applying a learned correction.
`;
}

/**
 * Build enhanced summary section from DocumentSummary
 */
function buildSummarySection(input: CriticAgentInput): string {
  if (!input.documentSummary) {
    return input.summary;
  }

  const ds = input.documentSummary;
  return `**Document Description:** ${ds.documentDescription}
**Document Purpose:** ${ds.documentPurpose}
**AI's Raw Assessment:** ${ds.rawContentType}

**Entities:**
- People: ${ds.entities.people.length > 0 ? ds.entities.people.join(', ') : 'None'}
- Companies: ${ds.entities.companies.length > 0 ? ds.entities.companies.join(', ') : 'None'}
- Locations: ${ds.entities.locations.length > 0 ? ds.entities.locations.join(', ') : 'None'}
- Projects: ${ds.entities.projects.length > 0 ? ds.entities.projects.join(', ') : 'None'}

**Key Terms:** ${ds.keyTerms.length > 0 ? ds.keyTerms.join(', ') : 'None'}
**Key Amounts:** ${ds.keyAmounts.length > 0 ? ds.keyAmounts.join(', ') : 'None'}

**Document Characteristics:**
- Is Financial: ${ds.documentCharacteristics.isFinancial}
- Is Legal: ${ds.documentCharacteristics.isLegal}
- Is Identity/KYC: ${ds.documentCharacteristics.isIdentity}
- Is Professional Report: ${ds.documentCharacteristics.isReport}
- Is Design/Architectural: ${ds.documentCharacteristics.isDesign}
- Has Multiple Projects (Portfolio): ${ds.documentCharacteristics.hasMultipleProjects}

**Executive Summary:** ${ds.executiveSummary}

**Detailed Summary:** ${ds.detailedSummary}`;
}

/**
 * Build smart corrections context based on tier
 */
function buildSmartCorrectionsContext(input: CriticAgentInput): string {
  const tier = input.correctionTier || determineCorrectionTier(
    input.initialClassification.confidence,
    !!input.initialClassification.alternativeTypes?.length
  );

  switch (tier) {
    case 'none':
      // High confidence, no corrections needed
      return '';

    case 'consolidated':
      // Medium confidence, just show aggregated patterns
      if (input.consolidatedRules && input.consolidatedRules.length > 0) {
        return buildConsolidatedRulesContext(input.consolidatedRules);
      }
      // Fallback: build from pastCorrections if available
      return '';

    case 'targeted':
      // Low confidence, show corrections for specific confusion pairs
      if (input.confusionPairs && input.pastCorrections) {
        return buildTargetedCorrectionsContext(input.pastCorrections, input.confusionPairs);
      }
      // Fallback to consolidated if we have them
      if (input.consolidatedRules && input.consolidatedRules.length > 0) {
        return buildConsolidatedRulesContext(input.consolidatedRules);
      }
      return '';

    case 'full':
    default:
      // Very low confidence, use full corrections
      return buildCorrectionsContext(input.pastCorrections);
  }
}

/**
 * Build the critic agent prompt
 */
function buildCriticPrompt(input: CriticAgentInput): string {
  const correctionsContext = buildSmartCorrectionsContext(input);
  const summarySection = buildSummarySection(input);

  return `You are the FINAL DECISION MAKER for document classification with SELF-IMPROVEMENT capabilities. Your job is to review all signals and make a coherent, reasoned final decision.
${correctionsContext}

## INPUT DATA

**Filename:** ${input.fileName}

${summarySection}
${input.classificationReasoning ? `
**Classification Agent Reasoning:** ${input.classificationReasoning}
` : ''}
**Initial Classification:**
- File Type: ${input.initialClassification.fileType}
- Category: ${input.initialClassification.category}
- Folder: ${input.initialClassification.suggestedFolder}
- Confidence: ${(input.initialClassification.confidence * 100).toFixed(0)}%

**Filename Analysis Hint:**
${input.filenameHint ? `Detected: ${input.filenameHint.fileType} (${input.filenameHint.category}) - ${input.filenameHint.reason}` : 'No clear filename patterns detected'}

**Current Checklist Matches (from prior agents - MAY BE WRONG, you should OVERRIDE if incorrect):**
${input.checklistMatches.length > 0
  ? input.checklistMatches.map(m => `- ${m.itemName} (${(m.confidence * 100).toFixed(0)}%): ${m.reasoning || 'No reason'}`).join('\n')
  : 'No matches suggested'}

⚠️ IMPORTANT: Prior agents sometimes make OBVIOUS MISTAKES. If the document is clearly a PASSPORT/ID but prior agents matched "Proof of Address", YOU MUST CORRECT THIS. Trust your analysis of fileType, not blindly accept prior matches.

**Available File Types:** ${input.availableFileTypes.slice(0, 20).join(', ')}${input.availableFileTypes.length > 20 ? '...' : ''}

**Available Folders:**
${input.availableFolders.map(f => `- ${f.folderKey} (${f.level}): ${f.name}`).join('\n')}

**Available Checklist Items (missing/pending only):**
${input.availableChecklistItems
  .filter(i => i.status === 'missing' || i.status === 'pending_review')
  .slice(0, 15)
  .map(i => `- [${i._id}] ${i.name} (${i.category}) - Matches: ${i.matchingDocumentTypes?.join(', ') || 'unspecified'}`)
  .join('\n')}

## YOUR TASK

Review ALL the signals above and make the FINAL classification decision. Your key responsibilities:

1. **CONSISTENCY CHECK**: Does the summary describe a document type that differs from the initial classification?
   - If summary says "passport" or "biodata" → fileType MUST be "Passport", category "KYC"
   - If summary says "bank statement" → fileType MUST be "Bank Statement"
   - If summary says "valuation" or "RICS" → fileType MUST be "RedBook Valuation" or similar

2. **FIX "Other" CLASSIFICATIONS**: If initial classification is "Other" but the summary clearly identifies a document type, CORRECT IT.

3. **CHECKLIST MATCHING - THIS IS CRITICAL**:

   USE THIS LOOKUP TABLE BASED ON YOUR FINAL fileType:

   | Your fileType | MUST Match Checklist Item Containing |
   |---------------|--------------------------------------|
   | Passport      | "Proof of ID" or "Certified Proof of ID" |
   | Driving License | "Proof of ID" or "Certified Proof of ID" |
   | ID Document   | "Proof of ID" or "Certified Proof of ID" |
   | Utility Bill  | "Proof of Address" |
   | Bank Statement | "Bank Statement" (and optionally "Proof of Address") |
   | Valuation     | "Valuation" |
   | Appraisal     | "Appraisal" |
   | Track Record  | "Track Record" |

   CRITICAL RULES:
   - A PASSPORT is PROOF OF IDENTITY, NOT PROOF OF ADDRESS
   - If fileType="Passport" and prior agents matched "Proof of Address", that is WRONG - fix it!
   - Find the checklist item ID from the available list that contains "Proof of ID" or "ID" in its name

4. **FOLDER SELECTION**: Ensure the folder matches the document type:
   - KYC documents (ID, passports, address proofs, bank statements) → "kyc" folder
   - Valuations/Appraisals → "appraisals" folder
   - Financial models → "operational_model" folder
   - If unsure, use "miscellaneous"

## OUTPUT

Respond with ONLY a JSON object:
{
  "fileType": "Final file type - MUST be specific, not 'Other' if identifiable",
  "category": "Final category",
  "suggestedFolder": "Must be one of the available folder keys",
  "confidence": 0.85,
  "reasoning": "2-3 sentence explanation of your decision, especially if you changed anything or applied a learned correction",
  "checklistMatches": [
    { "itemId": "exact_id", "confidence": 0.90, "reasoning": "Why this matches" }
  ],
  "correctionInfluence": {
    "appliedCorrections": ["List correction numbers applied, e.g., 'Correction 1', or empty array if none"],
    "reasoning": "Why I applied these corrections (or 'No relevant past corrections' if none applied)"
  }
}

IMPORTANT:
- Return empty checklistMatches array [] if no items match
- Be DECISIVE - if you can identify the document type from the summary, commit to it
- Your checklistMatches should ONLY include items from the available checklist items list above
- If past corrections were provided, state in reasoning whether you applied any of them`;
}

/**
 * Run the Critic Agent for final decision making
 */
export async function runCriticAgent(
  input: CriticAgentInput,
  openaiApiKey: string
): Promise<CriticAgentOutput | null> {
  if (!openaiApiKey) {
    console.warn('[Critic Agent] OpenAI API key not configured, skipping critic pass');
    return null;
  }

  const prompt = buildCriticPrompt(input);

  try {
    const response = await fetchWithRetry(
      OPENAI_API_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: MODEL_CONFIG.critic.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: MODEL_CONFIG.critic.temperature,
          max_tokens: MODEL_CONFIG.critic.maxTokens,
        }),
      },
      'Critic Agent (OpenAI)'
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[Critic Agent] OpenAI API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (content) {
      const parsed = parseJsonResponse(content);

      if (parsed && parsed.fileType && parsed.category && parsed.suggestedFolder) {
        return normalizeCriticOutput(parsed, input);
      }
    }
  } catch (error) {
    console.warn('[Critic Agent] Error:', error);
  }

  return null;
}

/**
 * Normalize and validate the critic agent output
 */
function normalizeCriticOutput(parsed: any, input: CriticAgentInput): CriticAgentOutput {
  // Validate folder exists
  let suggestedFolder = parsed.suggestedFolder;
  const folderValid = input.availableFolders.some(f => f.folderKey === suggestedFolder);
  if (!folderValid) {
    const folderMatch = input.availableFolders.find(f =>
      f.folderKey.toLowerCase().includes(suggestedFolder.toLowerCase()) ||
      suggestedFolder.toLowerCase().includes(f.folderKey.toLowerCase())
    );
    suggestedFolder = folderMatch?.folderKey || 'miscellaneous';
  }

  // Validate checklist matches
  const validChecklistMatches = (parsed.checklistMatches || [])
    .filter((m: any) =>
      m.itemId &&
      typeof m.confidence === 'number' &&
      input.availableChecklistItems.some(ci => ci._id === m.itemId)
    )
    .map((m: any) => ({
      itemId: m.itemId,
      confidence: Math.min(Math.max(m.confidence, 0), 1),
      reasoning: m.reasoning || 'Matched by critic agent',
    }));

  // Parse correction influence
  const correctionInfluence = parsed.correctionInfluence ? {
    appliedCorrections: Array.isArray(parsed.correctionInfluence.appliedCorrections)
      ? parsed.correctionInfluence.appliedCorrections
      : [],
    reasoning: parsed.correctionInfluence.reasoning || 'No correction influence data',
  } : undefined;

  return {
    fileType: parsed.fileType,
    category: parsed.category,
    suggestedFolder,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
    reasoning: parsed.reasoning || 'Critic agent review',
    checklistMatches: validChecklistMatches,
    correctionInfluence,
  };
}

/**
 * Determine if the critic agent should be run
 */
export function shouldRunCriticAgent(
  classification: { fileType: string; category: string; confidence: number },
  filenameHint: { fileType: string } | null
): boolean {
  return (
    classification.fileType === 'Other' ||
    classification.category === 'Other' ||
    classification.confidence < 0.8 ||
    (filenameHint !== null && classification.fileType !== filenameHint.fileType)
  );
}
