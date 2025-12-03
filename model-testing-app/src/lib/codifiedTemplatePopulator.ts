/**
 * Codified Template Populator
 * 
 * This module populates Excel templates using codified extraction data.
 * Unlike the legacy placeholderMapper which uses path-based lookups in extractedData,
 * this uses the direct itemCode → value mapping from codified items.
 */

import { SheetData } from './templateLoader';

// Types for codified items (matching the schema)
export interface CodifiedItem {
  id: string;
  originalName: string;
  itemCode?: string;
  suggestedCode?: string;
  value: any;
  dataType: string;
  category: string;
  mappingStatus: 'matched' | 'suggested' | 'pending_review' | 'confirmed' | 'unmatched';
  confidence: number;
}

/**
 * Result of template population with codified data
 */
export interface CodifiedPopulationResult {
  sheets: SheetData[];
  matchedPlaceholders: Map<string, { value: any; itemCode: string; originalName: string }>;
  unmatchedPlaceholders: string[];
  stats: {
    totalPlaceholders: number;
    matched: number;
    unmatched: number;
  };
}

/**
 * Placeholder found in a template cell
 */
interface PlaceholderMatch {
  sheetIndex: number;
  sheetName: string;
  row: number;
  col: number;
  placeholder: string;
  fullCellText: string;
}

/**
 * Scan all sheets for placeholders (text matching <...> pattern)
 */
function scanForPlaceholders(sheets: SheetData[]): PlaceholderMatch[] {
  const matches: PlaceholderMatch[] = [];
  const placeholderPattern = /<([^<>]+)>/g;
  
  sheets.forEach((sheet, sheetIndex) => {
    if (!sheet.data) return;
    
    sheet.data.forEach((row, rowIndex) => {
      if (!row) return;
      
      row.forEach((cell, colIndex) => {
        if (cell === null || cell === undefined) return;
        
        const cellText = String(cell);
        let match;
        
        // Reset regex state
        placeholderPattern.lastIndex = 0;
        
        while ((match = placeholderPattern.exec(cellText)) !== null) {
          matches.push({
            sheetIndex,
            sheetName: sheet.name,
            row: rowIndex,
            col: colIndex,
            placeholder: match[0], // Full match including < >
            fullCellText: cellText,
          });
        }
      });
    });
  });
  
  return matches;
}

/**
 * Build a lookup map from codified items
 * Maps itemCode (e.g., "<build.cost>") to the item data
 */
function buildCodeLookup(items: CodifiedItem[]): Map<string, CodifiedItem> {
  const lookup = new Map<string, CodifiedItem>();
  
  items.forEach(item => {
    // Only include confirmed or matched items
    if (item.mappingStatus === 'confirmed' || item.mappingStatus === 'matched') {
      if (item.itemCode) {
        lookup.set(item.itemCode, item);
        
        // Also add without angle brackets for flexible matching
        const codeWithoutBrackets = item.itemCode.replace(/^<|>$/g, '');
        lookup.set(codeWithoutBrackets, item);
      }
    }
  });
  
  return lookup;
}

/**
 * Format value for display in the template
 */
function formatValueForTemplate(value: any, dataType: string): any {
  if (value === null || value === undefined) {
    return '';
  }
  
  switch (dataType) {
    case 'currency':
      // Return as number - Excel/Handsontable will format it
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      
    case 'percentage':
      // Return as decimal (0.05 for 5%)
      const numVal = typeof value === 'number' ? value : parseFloat(String(value));
      // If it's already a small decimal, keep it; if it's like 5, convert to 0.05
      if (!isNaN(numVal)) {
        return numVal > 1 ? numVal / 100 : numVal;
      }
      return 0;
      
    case 'number':
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      
    case 'string':
    default:
      return String(value);
  }
}

/**
 * Populate template sheets with codified data
 * 
 * @param sheets - Template sheets to populate
 * @param codifiedItems - Codified items from the extraction
 * @returns Population result with updated sheets and match statistics
 */
export function populateTemplateWithCodifiedData(
  sheets: SheetData[],
  codifiedItems: CodifiedItem[]
): CodifiedPopulationResult {
  // Build lookup from codified items
  const codeLookup = buildCodeLookup(codifiedItems);
  
  console.log('[CodifiedPopulator] Building code lookup from', codifiedItems.length, 'items');
  console.log('[CodifiedPopulator] Lookup has', codeLookup.size, 'entries');
  
  // Log available codes for debugging
  const availableCodes = Array.from(codeLookup.keys()).filter(k => k.startsWith('<'));
  console.log('[CodifiedPopulator] Available codes:', availableCodes);
  
  // Scan for placeholders in templates
  const placeholderMatches = scanForPlaceholders(sheets);
  console.log('[CodifiedPopulator] Found', placeholderMatches.length, 'placeholder occurrences');
  
  // Get unique placeholders
  const uniquePlaceholders = new Set(placeholderMatches.map(m => m.placeholder));
  console.log('[CodifiedPopulator] Unique placeholders:', Array.from(uniquePlaceholders));
  
  // Track matches and unmatches
  const matchedPlaceholders = new Map<string, { value: any; itemCode: string; originalName: string }>();
  const unmatchedPlaceholders: string[] = [];
  
  // Deep copy sheets for modification
  const populatedSheets: SheetData[] = sheets.map(sheet => ({
    ...sheet,
    data: sheet.data ? sheet.data.map(row => row ? [...row] : []) : [],
  }));
  
  // Process each placeholder
  uniquePlaceholders.forEach(placeholder => {
    // Try to find a match in the code lookup
    const item = codeLookup.get(placeholder);
    
    if (item) {
      matchedPlaceholders.set(placeholder, {
        value: item.value,
        itemCode: item.itemCode || placeholder,
        originalName: item.originalName,
      });
      console.log('[CodifiedPopulator] Matched:', placeholder, '→', item.value, `(${item.originalName})`);
    } else {
      // Try case-insensitive match
      let found = false;
      const placeholderLower = placeholder.toLowerCase();
      
      for (const [code, codeItem] of codeLookup.entries()) {
        if (code.toLowerCase() === placeholderLower) {
          matchedPlaceholders.set(placeholder, {
            value: codeItem.value,
            itemCode: codeItem.itemCode || code,
            originalName: codeItem.originalName,
          });
          console.log('[CodifiedPopulator] Matched (case-insensitive):', placeholder, '→', codeItem.value);
          found = true;
          break;
        }
      }
      
      if (!found) {
        unmatchedPlaceholders.push(placeholder);
        console.log('[CodifiedPopulator] Unmatched:', placeholder);
      }
    }
  });
  
  // Replace placeholders in sheets
  placeholderMatches.forEach(match => {
    const matchInfo = matchedPlaceholders.get(match.placeholder);
    
    if (matchInfo) {
      const sheet = populatedSheets[match.sheetIndex];
      if (sheet.data && sheet.data[match.row]) {
        const currentValue = sheet.data[match.row][match.col];
        const currentText = String(currentValue || '');
        
        // Get the codified item for data type
        const item = codeLookup.get(match.placeholder);
        const formattedValue = formatValueForTemplate(matchInfo.value, item?.dataType || 'number');
        
        // Replace the placeholder in the cell
        if (currentText === match.placeholder) {
          // Cell contains only the placeholder - replace entirely
          sheet.data[match.row][match.col] = formattedValue;
        } else {
          // Cell contains placeholder within other text - string replace
          sheet.data[match.row][match.col] = currentText.replace(
            match.placeholder,
            String(formattedValue)
          );
        }
      }
    }
  });
  
  console.log('[CodifiedPopulator] Population complete:', {
    totalPlaceholders: uniquePlaceholders.size,
    matched: matchedPlaceholders.size,
    unmatched: unmatchedPlaceholders.length,
  });
  
  return {
    sheets: populatedSheets,
    matchedPlaceholders,
    unmatchedPlaceholders,
    stats: {
      totalPlaceholders: uniquePlaceholders.size,
      matched: matchedPlaceholders.size,
      unmatched: unmatchedPlaceholders.length,
    },
  };
}

/**
 * Convert CodifiedPopulationResult to the legacy PopulationResult format
 * for compatibility with existing UI components
 */
export function toLegacyPopulationResult(result: CodifiedPopulationResult): {
  sheets: SheetData[];
  matchedPlaceholders: Map<string, string>;
  unmatchedPlaceholders: string[];
  cleanupReport: {
    rowsHidden: number[];
    rowsDeleted: number[];
    sheetsAffected: string[];
  };
} {
  // Convert matched placeholders map to legacy format (placeholder -> source string)
  const legacyMatched = new Map<string, string>();
  result.matchedPlaceholders.forEach((info, placeholder) => {
    legacyMatched.set(placeholder, `codified:${info.itemCode}`);
  });
  
  return {
    sheets: result.sheets,
    matchedPlaceholders: legacyMatched,
    unmatchedPlaceholders: result.unmatchedPlaceholders,
    cleanupReport: {
      rowsHidden: [],
      rowsDeleted: [],
      sheetsAffected: [],
    },
  };
}

