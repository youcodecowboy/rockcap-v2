// =============================================================================
// DATABASE PATTERNS GENERATOR
// =============================================================================
// Generates filename patterns from fileTypeDefinitions in the database.
// Replaces hardcoded FILENAME_PATTERNS with database-driven patterns.

import { FileTypeDefinition } from '../types';
import { FilenamePattern } from './types';

// =============================================================================
// PATTERN CACHE
// =============================================================================

let cachedPatterns: FilenamePattern[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the pattern cache
 * Call this when fileTypeDefinitions are updated
 */
export function clearPatternCache(): void {
  cachedPatterns = null;
  cacheTimestamp = 0;
}

/**
 * Check if the cache is still valid
 */
function isCacheValid(): boolean {
  if (!cachedPatterns) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

// =============================================================================
// PATTERN GENERATION
// =============================================================================

/**
 * Generate FilenamePattern objects from FileTypeDefinition array
 *
 * This creates patterns that can be used by the filename matcher
 * from the database-stored file type definitions.
 */
export function generatePatternsFromDefinitions(
  definitions: FileTypeDefinition[]
): FilenamePattern[] {
  const patterns: FilenamePattern[] = [];

  for (const def of definitions) {
    // Skip inactive definitions
    if (def.isActive === false) continue;

    // Get all keywords: base keywords + filename patterns + learned keywords
    const allKeywords = new Set<string>();

    // Add base keywords
    for (const kw of def.keywords || []) {
      allKeywords.add(kw.toLowerCase().trim());
    }

    // Add filename patterns (these are more specific)
    for (const fp of def.filenamePatterns || []) {
      allKeywords.add(fp.toLowerCase().trim());
    }

    // Add learned keywords
    for (const lk of def.learnedKeywords || []) {
      allKeywords.add(lk.keyword.toLowerCase().trim());
    }

    // Only create pattern if we have keywords
    if (allKeywords.size === 0) continue;

    // Determine folder from definition or fallback to category mapping
    const folder = def.targetFolderKey || getCategoryFolder(def.category);
    const level = def.targetLevel || getCategoryLevel(def.category);

    patterns.push({
      keywords: Array.from(allKeywords),
      fileType: def.fileType,
      category: def.category,
      folder,
      excludeIf: def.excludePatterns,
    });
  }

  return patterns;
}

/**
 * Get filename patterns, using cache if available
 *
 * @param definitions Optional definitions to use. If not provided, uses cached patterns.
 */
export function getFilenamePatterns(
  definitions?: FileTypeDefinition[]
): FilenamePattern[] {
  // If definitions provided, regenerate patterns
  if (definitions) {
    cachedPatterns = generatePatternsFromDefinitions(definitions);
    cacheTimestamp = Date.now();
    return cachedPatterns;
  }

  // Check cache
  if (isCacheValid() && cachedPatterns) {
    return cachedPatterns;
  }

  // No cache available and no definitions provided
  // Return empty array - caller should provide definitions
  return [];
}

/**
 * Sync patterns from definitions to memory cache
 */
export function syncPatternsToMemory(definitions: FileTypeDefinition[]): void {
  cachedPatterns = generatePatternsFromDefinitions(definitions);
  cacheTimestamp = Date.now();
}

// =============================================================================
// CATEGORY FALLBACK MAPPINGS
// =============================================================================

/**
 * Default folder mapping by category
 * Used when targetFolderKey is not set on a definition
 */
function getCategoryFolder(category: string): string {
  const categoryLower = category.toLowerCase();

  const folderMap: Record<string, string> = {
    kyc: 'kyc',
    appraisals: 'appraisals',
    plans: 'background',
    inspections: 'credit_submission',
    'professional reports': 'credit_submission',
    'loan terms': 'terms_comparison',
    'legal documents': 'background',
    'project documents': 'background',
    'financial documents': 'operational_model',
    insurance: 'credit_submission',
    communications: 'background_docs',
    warranties: 'post_completion',
    photographs: 'background',
    other: 'miscellaneous',
  };

  return folderMap[categoryLower] || 'miscellaneous';
}

/**
 * Default level mapping by category
 * Used when targetLevel is not set on a definition
 */
function getCategoryLevel(category: string): 'client' | 'project' {
  const categoryLower = category.toLowerCase();

  const clientCategories = new Set([
    'kyc',
    'communications',
  ]);

  return clientCategories.has(categoryLower) ? 'client' : 'project';
}

// =============================================================================
// MERGE WITH HARDCODED PATTERNS
// =============================================================================

/**
 * Merge database patterns with hardcoded patterns
 *
 * Database patterns take priority. Hardcoded patterns are used as fallback
 * for any file types not defined in the database.
 */
export function mergePatternsWithHardcoded(
  dbPatterns: FilenamePattern[],
  hardcodedPatterns: FilenamePattern[]
): FilenamePattern[] {
  // Create a set of file types from database
  const dbFileTypes = new Set(dbPatterns.map(p => p.fileType.toLowerCase()));

  // Filter hardcoded patterns to only include types not in database
  const fallbackPatterns = hardcodedPatterns.filter(
    p => !dbFileTypes.has(p.fileType.toLowerCase())
  );

  // Combine: database patterns first, then fallbacks
  return [...dbPatterns, ...fallbackPatterns];
}
