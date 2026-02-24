// =============================================================================
// FILENAME MATCHER MODULE
// =============================================================================
// Provides filename-based document type hints and checklist matching

import { FilenameTypeHint, FilenameMatchResult } from './types';
import { FILENAME_PATTERNS, CHECKLIST_PATTERN_ALIASES } from './patterns';
import { EnrichedChecklistItem } from '../types';

export * from './types';
export { FILENAME_PATTERNS, CHECKLIST_PATTERN_ALIASES } from './patterns';

/**
 * Get file type hints based on filename patterns
 * Returns a hint if the filename matches known document type patterns
 */
export function getFilenameTypeHints(fileName: string): FilenameTypeHint | null {
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');

  for (const pattern of FILENAME_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (fileNameLower.includes(keyword)) {
        // Check for exclusion patterns - if any are present, skip this match
        if (pattern.excludeIf && pattern.excludeIf.length > 0) {
          const shouldExclude = pattern.excludeIf.some(exclude =>
            fileNameLower.includes(exclude)
          );
          if (shouldExclude) {
            continue; // Skip this pattern, try next one
          }
        }

        return {
          fileType: pattern.fileType,
          category: pattern.category,
          folder: pattern.folder,
          confidence: 0.85,
          reason: `Filename contains "${keyword}"`,
        };
      }
    }
  }

  return null;
}

/**
 * Check filename against checklist items for potential matches
 * Returns an array of matches sorted by score (highest first)
 */
export function checkFilenamePatterns(
  fileName: string,
  checklistItems: EnrichedChecklistItem[]
): FilenameMatchResult[] {
  const matches: FilenameMatchResult[] = [];
  const fileNameLower = fileName.toLowerCase().replace(/[_\-\.]/g, ' ');
  const fileNameParts = fileNameLower.split(/\s+/);

  for (const item of checklistItems) {
    const itemNameLower = item.name.toLowerCase();
    let bestScore = 0;
    let bestReason = '';

    // Check 1: Exact or partial name match in filename
    if (fileNameLower.includes(itemNameLower.replace(/\s+/g, ' ').replace(/[()]/g, ''))) {
      bestScore = 0.9;
      bestReason = 'Filename contains requirement name';
    }

    // Check 2: Check matching document types against filename
    if (item.matchingDocumentTypes && bestScore < 0.9) {
      for (const docType of item.matchingDocumentTypes) {
        const docTypeLower = docType.toLowerCase();
        if (fileNameLower.includes(docTypeLower.replace(/\s+/g, ' '))) {
          if (bestScore < 0.85) {
            bestScore = 0.85;
            bestReason = `Filename matches document type: ${docType}`;
          }
        }
      }
    }

    // Check 3: Check pattern aliases
    for (const [patternKey, aliases] of Object.entries(CHECKLIST_PATTERN_ALIASES)) {
      // Does this pattern relate to this checklist item?
      const relatedToItem = item.matchingDocumentTypes?.some(t =>
        t.toLowerCase().includes(patternKey.split(' ')[0]) ||
        patternKey.includes(t.toLowerCase().split(' ')[0])
      ) || itemNameLower.includes(patternKey.split(' ')[0]);

      if (relatedToItem) {
        for (const alias of aliases) {
          if (fileNameLower.includes(alias) || fileNameParts.includes(alias)) {
            if (bestScore < 0.8) {
              bestScore = 0.8;
              bestReason = `Filename pattern "${alias}" matches requirement`;
            }
          }
        }
      }
    }

    // Check 4: Partial word matching (with stricter rules to avoid false positives)
    if (bestScore < 0.6) {
      const itemWords = itemNameLower.split(/\s+/).filter(w => w.length > 3);
      // Filter filename parts to only meaningful words (4+ chars) to avoid false positives
      const meaningfulFilenameParts = fileNameParts.filter(p => p.length >= 4);
      const matchingWords = itemWords.filter(word =>
        meaningfulFilenameParts.some(part => {
          // Only match if there's substantial overlap (not just substring)
          // Either exact match, or the part is at least 60% of the word length
          if (part === word) return true;
          if (part.includes(word) && word.length >= 4) return true;
          if (word.includes(part) && part.length >= Math.max(4, word.length * 0.6)) return true;
          return false;
        })
      );
      if (matchingWords.length >= 2 || (matchingWords.length >= 1 && itemWords.length <= 2)) {
        bestScore = 0.6;
        bestReason = `Filename contains keywords: ${matchingWords.join(', ')}`;
      }
    }

    if (bestScore > 0) {
      matches.push({
        itemId: item._id,
        score: bestScore,
        reason: bestReason,
      });
    }
  }

  // Sort by score descending
  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Enrich checklist items with filename match information
 */
export function enrichChecklistItemsWithFilenameMatches(
  checklistItems: EnrichedChecklistItem[],
  fileName: string
): EnrichedChecklistItem[] {
  const filenameMatches = checkFilenamePatterns(fileName, checklistItems);

  return checklistItems.map(item => {
    const match = filenameMatches.find(m => m.itemId === item._id);
    return {
      ...item,
      filenameMatchScore: match?.score,
      filenameMatchReason: match?.reason,
    };
  });
}
