// =============================================================================
// VALIDATION UTILITIES FOR TYPE/CATEGORY/FOLDER MATCHING
// =============================================================================

import { FolderInfo, FileTypeDefinition } from '../types';
import { CATEGORY_FOLDER_MAP } from '../config';

/**
 * Find the best matching file type using semantic similarity
 */
export function findBestTypeMatch(
  aiType: string,
  documentSummary: string,
  availableTypes: string[],
  definitions: FileTypeDefinition[]
): { fileType: string; confidence: number } {
  const typeLower = aiType.toLowerCase();
  const summaryLower = documentSummary.toLowerCase();

  // 1. Exact match (case-insensitive)
  const exactMatch = availableTypes.find(t => t.toLowerCase() === typeLower);
  if (exactMatch) {
    return { fileType: exactMatch, confidence: 1.0 };
  }

  // 2. Partial match in type name
  const partialMatch = availableTypes.find(t =>
    t.toLowerCase().includes(typeLower) || typeLower.includes(t.toLowerCase())
  );
  if (partialMatch) {
    return { fileType: partialMatch, confidence: 0.9 };
  }

  // 3. Keyword match from definitions
  for (const def of definitions) {
    const keywordMatch = def.keywords.some(kw =>
      summaryLower.includes(kw.toLowerCase()) ||
      typeLower.includes(kw.toLowerCase())
    );
    if (keywordMatch && availableTypes.includes(def.fileType)) {
      return { fileType: def.fileType, confidence: 0.8 };
    }
  }

  // 4. Word overlap match
  const aiWords = typeLower.split(/[\s_-]+/).filter(w => w.length > 2);
  let bestMatch = { fileType: 'Other', confidence: 0 };

  for (const type of availableTypes) {
    const typeWords = type.toLowerCase().split(/[\s_-]+/).filter(w => w.length > 2);
    const overlap = aiWords.filter(w => typeWords.some(tw => tw.includes(w) || w.includes(tw)));
    const score = overlap.length / Math.max(aiWords.length, typeWords.length);

    if (score > bestMatch.confidence && score > 0.3) {
      bestMatch = { fileType: type, confidence: score };
    }
  }

  return bestMatch.confidence > 0.3 ? bestMatch : { fileType: 'Other', confidence: 0.3 };
}

/**
 * Find the best matching category using semantic similarity
 */
export function findBestCategoryMatch(
  aiCategory: string,
  documentSummary: string,
  availableCategories: string[],
  definitions: FileTypeDefinition[]
): string {
  const categoryLower = aiCategory.toLowerCase();

  // 1. Exact match (case-insensitive)
  const exactMatch = availableCategories.find(c => c.toLowerCase() === categoryLower);
  if (exactMatch) {
    return exactMatch;
  }

  // 2. Partial match
  const partialMatch = availableCategories.find(c =>
    c.toLowerCase().includes(categoryLower) || categoryLower.includes(c.toLowerCase())
  );
  if (partialMatch) {
    return partialMatch;
  }

  // 3. Keyword-based inference from summary
  const summaryLower = documentSummary.toLowerCase();
  const categoryKeywords: Record<string, string[]> = {
    'KYC': ['passport', 'id', 'identity', 'kyc', 'proof of', 'bank statement', 'track record'],
    'Appraisals': ['valuation', 'appraisal', 'rics', 'red book', 'market value'],
    'Plans': ['floor plan', 'elevation', 'section', 'site plan', 'architectural'],
    'Legal Documents': ['agreement', 'contract', 'legal', 'guarantee', 'debenture'],
    'Financial Documents': ['statement', 'invoice', 'receipt', 'financial'],
    'Professional Reports': ['report', 'survey', 'inspection', 'monitoring'],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (availableCategories.includes(category)) {
      const hasKeyword = keywords.some(kw => summaryLower.includes(kw));
      if (hasKeyword) {
        return category;
      }
    }
  }

  return 'Other';
}

/**
 * Match a category to an appropriate folder
 */
export function matchCategoryToFolder(
  category: string,
  availableFolders: FolderInfo[]
): { folderKey: string; level: 'client' | 'project' } {
  // 1. Check category-folder map
  const mapping = CATEGORY_FOLDER_MAP[category];
  if (mapping) {
    const folderExists = availableFolders.some(f => f.folderKey === mapping.folder);
    if (folderExists) {
      return { folderKey: mapping.folder, level: mapping.level };
    }
  }

  // 2. Try to find a folder with similar name
  const categoryLower = category.toLowerCase().replace(/\s+/g, '_');
  const similarFolder = availableFolders.find(f =>
    f.folderKey.toLowerCase().includes(categoryLower) ||
    categoryLower.includes(f.folderKey.toLowerCase())
  );
  if (similarFolder) {
    return { folderKey: similarFolder.folderKey, level: similarFolder.level };
  }

  // 3. Default to miscellaneous
  const miscFolder = availableFolders.find(f => f.folderKey === 'miscellaneous');
  if (miscFolder) {
    return { folderKey: 'miscellaneous', level: 'client' };
  }

  // 4. Last resort - first available folder
  if (availableFolders.length > 0) {
    return { folderKey: availableFolders[0].folderKey, level: availableFolders[0].level };
  }

  return { folderKey: 'miscellaneous', level: 'client' };
}

/**
 * Validate and correct a folder selection
 */
export function validateFolder(
  suggestedFolder: string,
  category: string,
  availableFolders: FolderInfo[]
): { folderKey: string; level: 'client' | 'project' } {
  // Check if suggested folder exists
  const folder = availableFolders.find(f => f.folderKey === suggestedFolder);
  if (folder) {
    return { folderKey: folder.folderKey, level: folder.level };
  }

  // Try case-insensitive match
  const caseMatch = availableFolders.find(f =>
    f.folderKey.toLowerCase() === suggestedFolder.toLowerCase()
  );
  if (caseMatch) {
    return { folderKey: caseMatch.folderKey, level: caseMatch.level };
  }

  // Try partial match
  const partialMatch = availableFolders.find(f =>
    f.folderKey.toLowerCase().includes(suggestedFolder.toLowerCase()) ||
    suggestedFolder.toLowerCase().includes(f.folderKey.toLowerCase())
  );
  if (partialMatch) {
    return { folderKey: partialMatch.folderKey, level: partialMatch.level };
  }

  // Fall back to category-based mapping
  return matchCategoryToFolder(category, availableFolders);
}

/**
 * Validate a file type against available types
 */
export function validateFileType(
  fileType: string,
  availableTypes: string[]
): string {
  // Exact match
  if (availableTypes.includes(fileType)) {
    return fileType;
  }

  // Case-insensitive match
  const caseMatch = availableTypes.find(t => t.toLowerCase() === fileType.toLowerCase());
  if (caseMatch) {
    return caseMatch;
  }

  return 'Other';
}

/**
 * Validate a category against available categories
 */
export function validateCategory(
  category: string,
  availableCategories: string[]
): string {
  // Exact match
  if (availableCategories.includes(category)) {
    return category;
  }

  // Case-insensitive match
  const caseMatch = availableCategories.find(c => c.toLowerCase() === category.toLowerCase());
  if (caseMatch) {
    return caseMatch;
  }

  return 'Other';
}
