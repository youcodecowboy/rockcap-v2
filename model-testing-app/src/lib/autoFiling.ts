import { AnalysisResult } from '@/types';

/**
 * Determines if a file should be auto-filed based on analysis results
 * Auto-files documents with high confidence and exact matches
 * UPDATED: Requires 90%+ confidence AND exact client match
 */
export function shouldAutoFile(analysisResult: AnalysisResult): boolean {
  // Must have high confidence (>=0.9 / 90%)
  if (analysisResult.confidence < 0.9) {
    return false;
  }

  // Must have exact client match (not just suggested)
  // Even with high confidence, if no client is identified, require confirmation
  if (!analysisResult.clientId || !analysisResult.clientName) {
    return false;
  }

  // If project is mentioned, must have exact match (not just suggested)
  if (analysisResult.suggestedProjectName && !analysisResult.projectId) {
    return false;
  }

  // No suggested names means exact matches were found
  if (analysisResult.suggestedClientName || analysisResult.suggestedProjectName) {
    return false;
  }

  return true;
}

/**
 * Determines if a file needs manual confirmation
 * UPDATED: Anything below 90% confidence requires human input
 */
export function needsConfirmation(analysisResult: AnalysisResult): boolean {
  // If it should auto-file, it doesn't need confirmation
  if (shouldAutoFile(analysisResult)) {
    return false;
  }

  // CRITICAL: Anything below 90% confidence requires human confirmation
  if (analysisResult.confidence < 0.9) {
    return true;
  }

  // Even with high confidence, if no client is identified, needs confirmation
  // This prevents auto-filing as "internal document" without user approval
  if (!analysisResult.clientId) {
    return true;
  }

  // If there are suggested names (potential new clients/projects), needs confirmation
  if (analysisResult.suggestedClientName || analysisResult.suggestedProjectName) {
    return true;
  }

  // If project is suggested but not matched, needs confirmation
  if (analysisResult.suggestedProjectName && !analysisResult.projectId) {
    return true;
  }

  return false;
}

