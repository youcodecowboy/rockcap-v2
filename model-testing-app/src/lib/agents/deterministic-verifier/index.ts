// =============================================================================
// DETERMINISTIC VERIFIER MODULE
// =============================================================================
// Replaces the LLM-based Verification Agent with deterministic keyword scoring.
// Uses fileTypeDefinitions.keywords and learned patterns to verify classifications.

import { DocumentSummary, FileTypeDefinition, FolderInfo } from '../types';
import { ConsolidatedRule } from '../types';

// =============================================================================
// TYPES
// =============================================================================

export interface DeterministicVerifierInput {
  documentSummary: DocumentSummary;
  classificationResult: {
    fileType: string;
    category: string;
    suggestedFolder: string;
    confidence: number;
    reasoning?: string;
  };
  fileName: string;
  fileTypeDefinitions: FileTypeDefinition[];
  consolidatedRules: ConsolidatedRule[];
  availableFolders: FolderInfo[];
}

export interface KeywordScore {
  fileType: string;
  category: string;
  targetFolder?: string;
  score: number;
  matchedKeywords: string[];
  matchedFilenamePatterns: string[];
  matchedLearnedKeywords: string[];
  penalizedByExclusions: boolean;
  correctionBoost: boolean;
}

export interface VerificationResult {
  verified: boolean;
  adjustedClassification?: {
    fileType?: string;
    category?: string;
    suggestedFolder?: string;
    confidence?: number;
  };
  notes: string;
  scores?: KeywordScore[];
}

// =============================================================================
// SCORING WEIGHTS
// =============================================================================

const WEIGHTS = {
  keyTermMatch: 0.4,      // Keyword found in extracted keyTerms
  summaryMatch: 0.3,      // Keyword found in summary text
  filenameMatch: 0.3,     // Keyword found in filename
  filenamePatternBonus: 0.3, // Bonus for explicit filename pattern match
  exclusionPenalty: 0.5,  // Multiply score by this if exclusion pattern matches
  correctionBoost: 0.2,   // Boost for matching learned correction patterns
  learnedKeywordBoost: 0.15, // Boost for matching auto-learned keywords
};

// Minimum score to consider a deterministic match significant
const MIN_SIGNIFICANT_SCORE = 0.4;

// Score difference needed to suggest changing the LLM's classification
const SCORE_DIFFERENCE_THRESHOLD = 0.25;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize text for matching: lowercase, remove special chars, trim
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_\-\.]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a keyword is present in a text
 */
function containsKeyword(text: string, keyword: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);

  // Check for word boundary match to avoid false positives
  // e.g., "red book" should match "red book valuation" but not "bred booklet"
  const regex = new RegExp(`\\b${normalizedKeyword.replace(/\s+/g, '\\s+')}\\b`, 'i');
  return regex.test(normalizedText);
}

/**
 * Check if any exclusion pattern matches the filename
 */
function hasExclusionMatch(fileName: string, excludePatterns?: string[]): boolean {
  if (!excludePatterns || excludePatterns.length === 0) return false;

  const normalizedFilename = normalizeText(fileName);
  return excludePatterns.some(pattern =>
    containsKeyword(normalizedFilename, pattern)
  );
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Score how well a document matches a file type definition
 */
export function scoreFileTypeMatch(
  documentSummary: DocumentSummary,
  fileName: string,
  definition: FileTypeDefinition,
  consolidatedRules: ConsolidatedRule[]
): KeywordScore {
  const matchedKeywords: string[] = [];
  const matchedFilenamePatterns: string[] = [];
  const matchedLearnedKeywords: string[] = [];

  // Combine all searchable text
  const keyTermsText = documentSummary.keyTerms?.join(' ') || '';
  const summaryText = `${documentSummary.executiveSummary || ''} ${documentSummary.detailedSummary || ''} ${documentSummary.rawContentType || ''}`;
  const normalizedFilename = normalizeText(fileName);

  // Get all keywords to check (base + learned)
  const baseKeywords = definition.keywords || [];
  const learnedKeywords = (definition.learnedKeywords || []).map(lk => lk.keyword);
  const filenamePatterns = definition.filenamePatterns || [];

  let keyTermScore = 0;
  let summaryScore = 0;
  let filenameScore = 0;

  // Score base keywords
  for (const keyword of baseKeywords) {
    let matched = false;

    // Check keyTerms (highest weight)
    if (containsKeyword(keyTermsText, keyword)) {
      keyTermScore++;
      matched = true;
    }

    // Check summary text
    if (containsKeyword(summaryText, keyword)) {
      summaryScore++;
      matched = true;
    }

    // Check filename
    if (containsKeyword(normalizedFilename, keyword)) {
      filenameScore++;
      matched = true;
    }

    if (matched) {
      matchedKeywords.push(keyword);
    }
  }

  // Score learned keywords
  for (const keyword of learnedKeywords) {
    if (containsKeyword(keyTermsText, keyword) ||
        containsKeyword(summaryText, keyword) ||
        containsKeyword(normalizedFilename, keyword)) {
      matchedLearnedKeywords.push(keyword);
    }
  }

  // Score filename patterns (explicit patterns for this type)
  for (const pattern of filenamePatterns) {
    if (containsKeyword(normalizedFilename, pattern)) {
      matchedFilenamePatterns.push(pattern);
    }
  }

  // Calculate base score
  const totalKeywords = baseKeywords.length || 1;
  const normalizedKeyTermScore = (keyTermScore / totalKeywords) * WEIGHTS.keyTermMatch;
  const normalizedSummaryScore = (summaryScore / totalKeywords) * WEIGHTS.summaryMatch;
  const normalizedFilenameScore = (filenameScore / totalKeywords) * WEIGHTS.filenameMatch;

  let score = normalizedKeyTermScore + normalizedSummaryScore + normalizedFilenameScore;

  // Add filename pattern bonus
  if (matchedFilenamePatterns.length > 0) {
    score += WEIGHTS.filenamePatternBonus;
  }

  // Add learned keyword boost
  if (matchedLearnedKeywords.length > 0) {
    score += WEIGHTS.learnedKeywordBoost * Math.min(matchedLearnedKeywords.length, 3);
  }

  // Check for exclusion penalty
  const penalized = hasExclusionMatch(fileName, definition.excludePatterns);
  if (penalized) {
    score *= WEIGHTS.exclusionPenalty;
  }

  // Check for correction boost from consolidated rules
  // If there's a rule that says "X → this type", boost the score
  let correctionBoost = false;
  for (const rule of consolidatedRules) {
    if (rule.toValue === definition.fileType && rule.correctionCount >= 2) {
      score += WEIGHTS.correctionBoost;
      correctionBoost = true;
      break;
    }
  }

  return {
    fileType: definition.fileType,
    category: definition.category,
    targetFolder: definition.targetFolderKey,
    score: Math.min(score, 1.0), // Cap at 1.0
    matchedKeywords,
    matchedFilenamePatterns,
    matchedLearnedKeywords,
    penalizedByExclusions: penalized,
    correctionBoost,
  };
}

/**
 * Score all file type definitions and return sorted results
 */
export function scoreAllFileTypes(
  documentSummary: DocumentSummary,
  fileName: string,
  definitions: FileTypeDefinition[],
  consolidatedRules: ConsolidatedRule[]
): KeywordScore[] {
  const scores = definitions
    .filter(def => def.isActive !== false)
    .map(def => scoreFileTypeMatch(documentSummary, fileName, def, consolidatedRules))
    .filter(score => score.score > 0)
    .sort((a, b) => b.score - a.score);

  return scores;
}

// =============================================================================
// MAIN VERIFICATION FUNCTION
// =============================================================================

/**
 * Run deterministic verification on a classification result
 *
 * This function:
 * 1. Scores all file type definitions against the document
 * 2. Compares the top deterministic score with the LLM's classification
 * 3. If there's a significant mismatch, suggests an adjustment
 */
export function runDeterministicVerification(
  input: DeterministicVerifierInput
): VerificationResult {
  const {
    documentSummary,
    classificationResult,
    fileName,
    fileTypeDefinitions,
    consolidatedRules,
    availableFolders,
  } = input;

  // Score all file types
  const scores = scoreAllFileTypes(
    documentSummary,
    fileName,
    fileTypeDefinitions,
    consolidatedRules
  );

  // If no significant scores, verify the LLM's classification
  if (scores.length === 0 || scores[0].score < MIN_SIGNIFICANT_SCORE) {
    return {
      verified: true,
      notes: `Deterministic verification: No strong keyword matches found. LLM classification accepted.`,
      scores,
    };
  }

  const topScore = scores[0];
  const llmFileType = classificationResult.fileType;

  // Find the LLM's classification in our scores
  const llmScore = scores.find(s => s.fileType === llmFileType);
  const llmScoreValue = llmScore?.score || 0;

  // Check if the top deterministic score significantly differs from LLM
  const scoreDifference = topScore.score - llmScoreValue;

  if (topScore.fileType === llmFileType) {
    // LLM and deterministic agree
    return {
      verified: true,
      notes: `Deterministic verification: Confirmed "${llmFileType}" (score: ${topScore.score.toFixed(2)}, keywords: ${topScore.matchedKeywords.slice(0, 3).join(', ')})`,
      scores,
    };
  }

  if (scoreDifference > SCORE_DIFFERENCE_THRESHOLD && topScore.score >= MIN_SIGNIFICANT_SCORE) {
    // Deterministic scoring suggests a different classification
    // Validate the suggested folder exists
    let suggestedFolder = topScore.targetFolder;
    if (suggestedFolder) {
      const folderExists = availableFolders.some(f => f.folderKey === suggestedFolder);
      if (!folderExists) {
        suggestedFolder = undefined;
      }
    }

    return {
      verified: false,
      adjustedClassification: {
        fileType: topScore.fileType,
        category: topScore.category,
        suggestedFolder,
        confidence: Math.min(topScore.score + 0.1, 0.95), // Boost confidence slightly
      },
      notes: `Deterministic verification: Suggesting "${topScore.fileType}" instead of "${llmFileType}" (deterministic score: ${topScore.score.toFixed(2)} vs ${llmScoreValue.toFixed(2)}, keywords: ${topScore.matchedKeywords.slice(0, 3).join(', ')}${topScore.matchedLearnedKeywords.length > 0 ? `, learned: ${topScore.matchedLearnedKeywords.join(', ')}` : ''})`,
      scores,
    };
  }

  // Scores are close - accept LLM's classification but note the alternative
  return {
    verified: true,
    notes: `Deterministic verification: Accepted "${llmFileType}" (score: ${llmScoreValue.toFixed(2)}). Alternative: "${topScore.fileType}" (score: ${topScore.score.toFixed(2)})`,
    scores,
  };
}

/**
 * Check if deterministic verification should suggest running the critic agent
 * Returns true if there's significant uncertainty between top candidates
 */
export function shouldRunCritic(scores: KeywordScore[]): boolean {
  if (scores.length < 2) return false;

  const [first, second] = scores;
  const scoreDiff = first.score - second.score;

  // If top two scores are very close, critic might help
  return scoreDiff < 0.15 && first.score >= MIN_SIGNIFICANT_SCORE;
}
