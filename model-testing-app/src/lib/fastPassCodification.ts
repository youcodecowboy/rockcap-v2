/**
 * Fast Pass Codification Engine
 * 
 * This module handles the first pass of codification that runs immediately after extraction.
 * It performs instant alias dictionary lookups to match extracted items to canonical codes.
 * 
 * Key characteristics:
 * - No LLM calls (instant, free)
 * - Exact and fuzzy matching against alias dictionary
 * - Results in "matched" or "pending_review" status
 * - Runs in ~50ms even for large extractions
 */

import { ExtractedData } from '@/types';

// Types for Fast Pass
export interface ExtractedItem {
  type: string;        // Original name from extraction (e.g., "Site Purchase Price")
  amount: number;      // The value
  currency?: string;   // Currency if detected
  category?: string;   // Category from extraction
}

export interface AliasMatch {
  canonicalCode: string;
  canonicalCodeId: string;
  confidence: number;
  source: string;
}

export interface CodifiedItem {
  id: string;
  originalName: string;
  itemCode?: string;
  suggestedCode?: string;
  suggestedCodeId?: string;
  value: any;
  dataType: string;
  category: string;
  mappingStatus: 'matched' | 'suggested' | 'pending_review' | 'confirmed' | 'unmatched';
  confidence: number;
}

export interface FastPassResult {
  items: CodifiedItem[];
  stats: {
    matched: number;
    pendingReview: number;
    total: number;
  };
}

export interface AliasLookupMap {
  [normalizedAlias: string]: AliasMatch;
}

/**
 * Patterns to strip from names before matching (internal normalization only)
 * The original name is preserved for user display
 */
const STRIP_PATTERNS: RegExp[] = [
  /\d+(\.\d+)?%/g,                      // Percentages: 7.5%, 10%
  /x\s?\d+/gi,                           // Quantities: x4, x 12
  /\(\d+\s*bed(room)?s?\)/gi,            // (5 bed), (3 bedrooms)
  /-\s*\d+\s*bed(room)?s?(\s+\w+)?/gi,   // - 5 bed, - 5 bedroom detached
  /\d+\s*bed(room)?s?(\s+\w+)?/gi,       // 5 bed detached, 3 bedroom semi
  /\([^)]*\)/g,                          // Anything in parentheses: (notes), (x2)
  /\s*(detached|semi-detached|semi|terraced|apartment|flat|house)\s*/gi, // Property types
];

/**
 * Common plural → singular mappings for normalization
 * These handle variations like "interest.rates" → "interest.rate"
 */
const PLURAL_TO_SINGULAR: Record<string, string> = {
  'costs': 'cost',
  'rates': 'rate',
  'fees': 'fee',
  'works': 'work',
  'duties': 'duty',
  'charges': 'charge',
  'expenses': 'expense',
  'payments': 'payment',
  'amounts': 'amount',
  'values': 'value',
  'prices': 'price',
  'totals': 'total',
  'sales': 'sale',
  'profits': 'profit',
  'loans': 'loan',
  'units': 'unit',
  'plots': 'plot',
  'sites': 'site',
  'buildings': 'building',
  'services': 'service',
  'externals': 'external',
  'utilities': 'utility',
  'preliminaries': 'preliminary',
  'prelims': 'prelim',
};

/**
 * Normalize a single word (handle plurals)
 */
function normalizeWord(word: string): string {
  const lower = word.toLowerCase();
  return PLURAL_TO_SINGULAR[lower] || lower;
}

/**
 * Normalize text for alias matching (internal use only)
 * - Lowercase, trim, collapse whitespace
 * - Strip percentages, bed counts, property types
 * - Convert plurals to singular
 * - Normalize separators (dots, underscores, hyphens → spaces)
 * 
 * NOTE: The original name is preserved in CodifiedItem.originalName for user display
 */
export function normalizeText(text: string): string {
  // Start with lowercase and trim
  let normalized = text.toLowerCase().trim();
  
  // Apply strip patterns to remove noise
  for (const pattern of STRIP_PATTERNS) {
    normalized = normalized.replace(pattern, ' ');
  }
  
  // Replace common separators with spaces
  normalized = normalized.replace(/[._-]+/g, ' ');
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Split into words and normalize each (plurals → singular)
  const words = normalized.split(' ');
  const normalizedWords = words.map(normalizeWord);
  
  // Rejoin with spaces
  return normalizedWords.join(' ');
}

/**
 * Check if an item name appears to be a compound item
 * (contains multiple categories combined)
 */
export function isCompoundItem(text: string): boolean {
  // Check for common compound separators
  return /[&,\/]|(\s+and\s+)/i.test(text);
}

/**
 * Generate a unique ID for a codified item
 */
function generateItemId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Detect data type from value and context
 */
function detectDataType(value: any, currency?: string): string {
  if (currency) {
    return 'currency';
  }
  if (typeof value === 'number') {
    // Check if it looks like a percentage (0-1 range or explicit percentage)
    if (value >= 0 && value <= 1 && value !== Math.floor(value)) {
      return 'percentage';
    }
    return 'number';
  }
  if (typeof value === 'string') {
    return 'string';
  }
  return 'string';
}

/**
 * Build alias lookup map from database aliases
 * This creates a normalized lookup for O(1) matching
 */
export function buildAliasLookupMap(aliases: Array<{
  aliasNormalized: string;
  canonicalCode: string;
  canonicalCodeId: string;
  confidence: number;
  source: string;
}>): AliasLookupMap {
  const map: AliasLookupMap = {};
  
  aliases.forEach(alias => {
    const existing = map[alias.aliasNormalized];
    // Keep highest confidence match for each normalized alias
    if (!existing || alias.confidence > existing.confidence) {
      map[alias.aliasNormalized] = {
        canonicalCode: alias.canonicalCode,
        canonicalCodeId: alias.canonicalCodeId,
        confidence: alias.confidence,
        source: alias.source,
      };
    }
  });
  
  return map;
}

/**
 * Extract items from ExtractedData into a flat list
 */
export function extractItemsFromData(extractedData: ExtractedData): ExtractedItem[] {
  const items: ExtractedItem[] = [];
  const currency = extractedData.detectedCurrency || 'GBP';
  
  // Extract from costs array
  if (extractedData.costs && Array.isArray(extractedData.costs)) {
    extractedData.costs.forEach(cost => {
      if (cost.type && cost.amount !== undefined) {
        items.push({
          type: cost.type,
          amount: cost.amount,
          currency: cost.currency || currency,
          category: cost.category || 'Uncategorized',
        });
      }
    });
  }
  
  // Extract from costCategories if costs array is empty or not comprehensive
  if (extractedData.costCategories) {
    const categories: Record<string, string> = {
      siteCosts: 'Site Costs',
      netConstructionCosts: 'Construction Costs',
      professionalFees: 'Professional Fees',
      financingLegalFees: 'Financing Costs',
      disposalFees: 'Disposal Costs',
    };
    
    Object.entries(extractedData.costCategories).forEach(([key, catData]) => {
      if (catData?.items && Array.isArray(catData.items)) {
        const categoryName = categories[key] || key;
        catData.items.forEach((item: any) => {
          // Check if this item already exists in items array
          const exists = items.some(i => 
            normalizeText(i.type) === normalizeText(item.type) &&
            i.amount === item.amount
          );
          
          if (!exists && item.type && item.amount !== undefined) {
            items.push({
              type: item.type,
              amount: item.amount,
              currency: item.currency || catData.currency || currency,
              category: categoryName,
            });
          }
        });
      }
    });
  }
  
  // Extract financing info
  if (extractedData.financing) {
    if (extractedData.financing.loanAmount) {
      items.push({
        type: 'Loan Amount',
        amount: extractedData.financing.loanAmount,
        currency: extractedData.financing.currency || currency,
        category: 'Financing',
      });
    }
    if (extractedData.financing.interestRate !== undefined) {
      items.push({
        type: 'Interest Rate',
        amount: extractedData.financing.interestRate,
        category: 'Financing',
      });
    }
  }
  
  // Extract plots
  if (extractedData.plots && Array.isArray(extractedData.plots)) {
    extractedData.plots.forEach(plot => {
      if (plot.name && plot.cost !== undefined) {
        items.push({
          type: `Plot: ${plot.name}`,
          amount: plot.cost,
          currency: plot.currency || currency,
          category: 'Plots',
        });
      }
    });
  }
  
  // Extract revenue
  if (extractedData.revenue?.totalSales) {
    items.push({
      type: 'Total Sales',
      amount: extractedData.revenue.totalSales,
      currency: extractedData.revenue.currency || currency,
      category: 'Revenue',
    });
  }
  
  // Extract profit
  if (extractedData.profit?.total) {
    items.push({
      type: 'Total Profit',
      amount: extractedData.profit.total,
      currency: extractedData.profit.currency || currency,
      category: 'Profit',
    });
  }
  
  // Extract units
  if (extractedData.units?.count) {
    items.push({
      type: 'Unit Count',
      amount: extractedData.units.count,
      category: 'Units',
    });
  }
  
  return items;
}

/**
 * Run Fast Pass codification
 * 
 * @param extractedData - The extracted data from the spreadsheet
 * @param aliasLookup - Pre-built alias lookup map
 * @returns FastPassResult with codified items and stats
 */
export function runFastPass(
  extractedData: ExtractedData,
  aliasLookup: AliasLookupMap
): FastPassResult {
  // Extract items from the data
  const extractedItems = extractItemsFromData(extractedData);
  
  let matchedCount = 0;
  let pendingCount = 0;
  
  // Process each item
  const codifiedItems: CodifiedItem[] = extractedItems.map(item => {
    const normalized = normalizeText(item.type);
    const match = aliasLookup[normalized];
    
    const codifiedItem: CodifiedItem = {
      id: generateItemId(),
      originalName: item.type,
      value: item.amount,
      dataType: detectDataType(item.amount, item.currency),
      category: item.category || 'Uncategorized',
      mappingStatus: 'pending_review',
      confidence: 0,
    };
    
    if (match) {
      // Found a match in alias dictionary
      codifiedItem.itemCode = match.canonicalCode;
      codifiedItem.mappingStatus = 'matched';
      codifiedItem.confidence = match.confidence;
      matchedCount++;
    } else {
      // No match - needs Smart Pass
      codifiedItem.mappingStatus = 'pending_review';
      pendingCount++;
    }
    
    return codifiedItem;
  });
  
  return {
    items: codifiedItems,
    stats: {
      matched: matchedCount,
      pendingReview: pendingCount,
      total: codifiedItems.length,
    },
  };
}

/**
 * Run Fast Pass with fuzzy matching
 * 
 * This version also attempts fuzzy matching for items that don't have exact matches.
 * Fuzzy matching uses Levenshtein distance for similarity.
 * 
 * @param extractedData - The extracted data from the spreadsheet
 * @param aliasLookup - Pre-built alias lookup map
 * @param fuzzyThreshold - Similarity threshold for fuzzy matches (0-1, default 0.85)
 * @returns FastPassResult with codified items and stats
 */
export function runFastPassWithFuzzy(
  extractedData: ExtractedData,
  aliasLookup: AliasLookupMap,
  fuzzyThreshold: number = 0.85
): FastPassResult {
  const extractedItems = extractItemsFromData(extractedData);
  const aliasKeys = Object.keys(aliasLookup);
  
  let matchedCount = 0;
  let pendingCount = 0;
  
  const codifiedItems: CodifiedItem[] = extractedItems.map(item => {
    const normalized = normalizeText(item.type);
    
    // First try exact match
    let match = aliasLookup[normalized];
    let matchType: 'exact' | 'fuzzy' | 'none' = match ? 'exact' : 'none';
    
    // If no exact match, try fuzzy matching
    if (!match && aliasKeys.length > 0) {
      let bestMatch: { key: string; similarity: number } | null = null;
      
      for (const aliasKey of aliasKeys) {
        const similarity = calculateSimilarity(normalized, aliasKey);
        if (similarity >= fuzzyThreshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { key: aliasKey, similarity };
          }
        }
      }
      
      if (bestMatch) {
        match = aliasLookup[bestMatch.key];
        matchType = 'fuzzy';
        // Reduce confidence for fuzzy matches
        match = {
          ...match,
          confidence: match.confidence * bestMatch.similarity,
        };
      }
    }
    
    const codifiedItem: CodifiedItem = {
      id: generateItemId(),
      originalName: item.type,
      value: item.amount,
      dataType: detectDataType(item.amount, item.currency),
      category: item.category || 'Uncategorized',
      mappingStatus: 'pending_review',
      confidence: 0,
    };
    
    if (match) {
      codifiedItem.itemCode = match.canonicalCode;
      codifiedItem.mappingStatus = 'matched';
      codifiedItem.confidence = match.confidence;
      matchedCount++;
    } else {
      codifiedItem.mappingStatus = 'pending_review';
      pendingCount++;
    }
    
    return codifiedItem;
  });
  
  return {
    items: codifiedItems,
    stats: {
      matched: matchedCount,
      pendingReview: pendingCount,
      total: codifiedItems.length,
    },
  };
}

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 and 1 (1 = identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Create distance matrix
  const matrix: number[][] = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  
  return 1 - distance / maxLen;
}

