/**
 * XLSM Template Populator
 * 
 * Server-side utility for populating Excel templates (XLSM/XLSX) with codified data.
 * Uses xlsx-populate to preserve macros, styles, images, and charts.
 * 
 * This module is designed for "Quick Export" mode where we want to:
 * 1. Load an existing template file
 * 2. Replace only the placeholder cells with codified data
 * 3. Export the file while preserving everything else unchanged
 */

// xlsx-populate is a CommonJS module, we need to use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XlsxPopulate = require('xlsx-populate');

// Types for codified items (matching the schema from codifiedTemplatePopulator)
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
 * Result of XLSM population
 */
export interface XlsmPopulationResult {
  buffer: Buffer;
  stats: {
    totalPlaceholders: number;
    matched: number;
    unmatched: number;
    fallbacksInserted: number;
    placeholdersCleared: number;
  };
  matchedPlaceholders: string[];
  unmatchedPlaceholders: string[];
}

/**
 * Category fallback row tracking
 */
interface CategoryFallbackRow {
  sheetName: string;
  row: number;
  category: string;
  setNumber?: number;
  nameCell?: { col: number; address: string };
  valueCell?: { col: number; address: string };
}

/**
 * Pattern to match DEFAULT category fallback placeholders (no number suffix)
 * Format: <all.{category}.name> or <all.{category}.value>
 */
const CATEGORY_FALLBACK_PATTERN = /<all\.([a-z.]+)\.(name|value)>(?!\.\d)/gi;

/**
 * Pattern to match NUMBERED SET category fallback placeholders
 * Format: <all.{category}.name.{N}> or <all.{category}.value.{N}>
 */
const NUMBERED_SET_PATTERN = /<all\.([a-z.]+)\.(name|value)\.(\d+)>/gi;

/**
 * Map display category names to normalized forms
 */
const CATEGORY_NORMALIZATIONS: Record<string, string> = {
  // Site Costs / Land Acquisition
  'site costs': 'site.costs',
  'purchase costs': 'site.costs',
  'land costs': 'site.costs',
  'land acquisition': 'site.costs',
  'acquisition costs': 'site.costs',
  'site': 'site.costs',
  
  // Professional Fees (including common typos)
  'professional fees': 'professional.fees',
  'professional': 'professional.fees',
  'fees': 'professional.fees',
  'consultants': 'professional.fees',
  'consultant fees': 'professional.fees',
  'profesional fees': 'professional.fees',  // Typo: one 's'
  'profesional.fees': 'professional.fees',  // Typo: one 's' in placeholder format
  'profesional': 'professional.fees',       // Typo: one 's'
  'professioal fees': 'professional.fees',  // Typo: missing 'n'
  'professioal.fees': 'professional.fees',  // Typo: missing 'n' in placeholder format
  'professioal': 'professional.fees',       // Typo: missing 'n'
  
  // Construction Costs / Development Costs
  'construction costs': 'construction.costs',
  'net construction costs': 'construction.costs',
  'build costs': 'construction.costs',
  'construction': 'construction.costs',
  'building costs': 'construction.costs',
  'build': 'construction.costs',
  'development costs': 'construction.costs',  // Development costs often mean construction costs
  'development': 'construction.costs',
  'dev costs': 'construction.costs',
  
  // Financing Costs / Legal Fees (combined in extraction)
  'financing costs': 'financing.costs',
  'financing/legal fees': 'financing.costs',  // Extraction uses this combined form
  'financing.legal fees': 'financing.costs',
  'financing legal fees': 'financing.costs',
  'financing': 'financing.costs',
  'finance': 'financing.costs',
  'finance costs': 'financing.costs',
  'loan costs': 'financing.costs',
  'interest': 'financing.costs',
  'legal fees': 'financing.costs',  // Often combined with financing
  
  // Disposal Costs / Sales Costs / Disposal Fees
  'disposal costs': 'disposal.costs',
  'disposal fees': 'disposal.costs',  // Extraction uses "Disposal Fees"
  'disposal': 'disposal.costs',
  'sales costs': 'disposal.costs',
  'selling costs': 'disposal.costs',
  'marketing': 'disposal.costs',
  'marketing costs': 'disposal.costs',
  
  // Plots / Units
  'plots': 'plots',
  'plot': 'plots',
  'units': 'plots',
  'unit': 'plots',
  'houses': 'plots',
  'house': 'plots',
  'developments': 'plots',
  'homes': 'plots',
  'home': 'plots',
  'properties': 'plots',
  'property': 'plots',
  'dwellings': 'plots',
  
  // Revenue
  'revenue': 'revenue',
  'sales': 'revenue',
  'income': 'revenue',
  'gross development value': 'revenue',
  'gdv': 'revenue',
  
  // Profit
  'profit': 'profit',
  'profits': 'profit',
  'margin': 'profit',
  'returns': 'profit',
  
  // Other / Uncategorized
  'other': 'other',
  'uncategorized': 'other',
  'miscellaneous': 'other',
  'misc': 'other',
  'general': 'other',
};

/**
 * Normalize a category name to match fallback placeholder format
 */
function normalizeCategory(category: string): string {
  const lower = category.toLowerCase().trim();
  return CATEGORY_NORMALIZATIONS[lower] || lower.replace(/\s+/g, '.');
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
 * Format value for Excel cell
 */
function formatValueForExcel(value: any, dataType: string): any {
  if (value === null || value === undefined) {
    return '';
  }
  
  switch (dataType) {
    case 'currency':
      // Return as number - Excel will format it
      return typeof value === 'number' ? value : parseFloat(String(value)) || 0;
      
    case 'percentage':
      // Return as decimal (0.05 for 5%)
      const numVal = typeof value === 'number' ? value : parseFloat(String(value));
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
 * Get cell address from row and column indices (0-based)
 */
function getCellAddress(row: number, col: number): string {
  let colStr = '';
  let c = col;
  while (c >= 0) {
    colStr = String.fromCharCode((c % 26) + 65) + colStr;
    c = Math.floor(c / 26) - 1;
  }
  return colStr + (row + 1);
}

/**
 * Populate an XLSM/XLSX template with codified data
 * 
 * @param templateBuffer - The original template file as a Buffer
 * @param codifiedItems - Array of codified items to insert
 * @returns Promise with populated file buffer and statistics
 */
export async function populateXlsmTemplate(
  templateBuffer: Buffer,
  codifiedItems: CodifiedItem[]
): Promise<XlsmPopulationResult> {
  console.log('[XlsmPopulator] Starting population with', codifiedItems.length, 'items');
  
  // Load the workbook
  const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);
  
  // Build lookup from codified items
  const codeLookup = buildCodeLookup(codifiedItems);
  console.log('[XlsmPopulator] Code lookup has', codeLookup.size, 'entries');
  
  // Track statistics
  const matchedPlaceholders: string[] = [];
  const unmatchedPlaceholders: string[] = [];
  let fallbacksInserted = 0;
  
  // Track matched items globally (for fallback deduplication)
  const globalMatchedItemIds = new Set<string>();
  
  // Track fallback rows for category-based population
  const fallbackRows: CategoryFallbackRow[] = [];
  
  // Get all sheets
  const sheets = workbook.sheets();
  console.log('[XlsmPopulator] Processing', sheets.length, 'sheets');
  
  // Pattern to match any placeholder
  const placeholderPattern = /<([^<>]+)>/g;
  
  // PASS 1: Find all placeholders and replace specific codes
  for (const sheet of sheets) {
    const sheetName = sheet.name();
    console.log(`[XlsmPopulator] Processing sheet: ${sheetName}`);
    
    // Get the used range
    const usedRange = sheet.usedRange();
    if (!usedRange) {
      console.log(`[XlsmPopulator] Sheet ${sheetName} has no used range, skipping`);
      continue;
    }
    
    const startRow = usedRange.startCell().rowNumber();
    const endRow = usedRange.endCell().rowNumber();
    const startCol = usedRange.startCell().columnNumber();
    const endCol = usedRange.endCell().columnNumber();
    
    console.log(`[XlsmPopulator] Sheet ${sheetName} range: R${startRow}C${startCol} to R${endRow}C${endCol}`);
    
    // Iterate through all cells in the used range
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = sheet.cell(row, col);
        let cellValue = cell.value();
        
        // Handle Rich Text objects - xlsx-populate returns objects for formatted text
        // Rich Text objects have a text() method to get the plain text content
        if (cellValue !== undefined && cellValue !== null && typeof cellValue === 'object') {
          // Check if it's a RichText object (has text method or is array of text fragments)
          if (typeof cellValue.text === 'function') {
            cellValue = cellValue.text();
          } else if (Array.isArray(cellValue)) {
            // Rich text can be an array of fragments
            cellValue = cellValue.map((fragment: any) => {
              if (typeof fragment === 'string') return fragment;
              if (fragment && typeof fragment.text === 'function') return fragment.text();
              if (fragment && fragment.value) return fragment.value;
              return String(fragment);
            }).join('');
          } else if (cellValue.value !== undefined) {
            // Some objects have a value property
            cellValue = cellValue.value;
          } else {
            // Last resort: try to stringify and extract text
            const str = JSON.stringify(cellValue);
            // Look for text content in the JSON
            const textMatch = str.match(/"value":"([^"]+)"/);
            if (textMatch) {
              cellValue = textMatch[1];
            }
          }
        }
        
        // Handle hyperlinks - the display text might be different from value()
        if (cellValue === undefined || cellValue === null) {
          // Try getting the formula if value is empty
          const formula = cell.formula();
          if (formula && typeof formula === 'string') {
            cellValue = formula;
          }
        }
        
        // Skip empty cells or non-string values
        if (cellValue === undefined || cellValue === null) continue;
        const cellText = String(cellValue);
        
        if (!cellText.includes('<')) continue;
        
        // Reset regex
        placeholderPattern.lastIndex = 0;
        
        // Find all placeholders in this cell
        let match;
        let newValue = cellText;
        let hasReplacements = false;
        
        while ((match = placeholderPattern.exec(cellText)) !== null) {
          const placeholder = match[0];
          const placeholderInner = match[1];
          
          // Check if this is a NUMBERED SET fallback
          NUMBERED_SET_PATTERN.lastIndex = 0;
          const numberedMatch = NUMBERED_SET_PATTERN.exec(placeholder);
          
          if (numberedMatch) {
            // Track as fallback row for later processing
            const category = numberedMatch[1];
            const type = numberedMatch[2] as 'name' | 'value';
            const setNumber = parseInt(numberedMatch[3], 10);
            
            // Find or create fallback row entry
            let fallbackRow = fallbackRows.find(
              fr => fr.sheetName === sheetName && fr.row === row && 
                   fr.category === category && fr.setNumber === setNumber
            );
            
            if (!fallbackRow) {
              fallbackRow = { sheetName, row, category, setNumber };
              fallbackRows.push(fallbackRow);
            }
            
            if (type === 'name') {
              fallbackRow.nameCell = { col, address: getCellAddress(row - 1, col - 1) };
            } else {
              fallbackRow.valueCell = { col, address: getCellAddress(row - 1, col - 1) };
            }
            continue;
          }
          
          // Check if this is a DEFAULT category fallback
          CATEGORY_FALLBACK_PATTERN.lastIndex = 0;
          const fallbackMatch = CATEGORY_FALLBACK_PATTERN.exec(placeholder);
          
          if (fallbackMatch) {
            // Track as fallback row for later processing
            const category = fallbackMatch[1];
            const type = fallbackMatch[2] as 'name' | 'value';
            
            // Find or create fallback row entry
            let fallbackRow = fallbackRows.find(
              fr => fr.sheetName === sheetName && fr.row === row && 
                   fr.category === category && fr.setNumber === undefined
            );
            
            if (!fallbackRow) {
              fallbackRow = { sheetName, row, category };
              fallbackRows.push(fallbackRow);
            }
            
            if (type === 'name') {
              fallbackRow.nameCell = { col, address: getCellAddress(row - 1, col - 1) };
            } else {
              fallbackRow.valueCell = { col, address: getCellAddress(row - 1, col - 1) };
            }
            continue;
          }
          
          // Try to match as a specific code
          let item = codeLookup.get(placeholder);
          
          // Try case-insensitive match
          if (!item) {
            const placeholderLower = placeholder.toLowerCase();
            for (const [code, codeItem] of codeLookup.entries()) {
              if (code.toLowerCase() === placeholderLower) {
                item = codeItem;
                break;
              }
            }
          }
          
          // Also try matching without brackets
          if (!item) {
            item = codeLookup.get(placeholderInner);
            if (!item) {
              const innerLower = placeholderInner.toLowerCase();
              for (const [code, codeItem] of codeLookup.entries()) {
                if (code.toLowerCase() === innerLower) {
                  item = codeItem;
                  break;
                }
              }
            }
          }
          
          if (item) {
            const formattedValue = formatValueForExcel(item.value, item.dataType);
            
            // Replace in the cell value
            if (cellText === placeholder) {
              // Entire cell is the placeholder - replace with the value directly
              newValue = formattedValue;
              // Note: Not applying numberFormat to preserve template's cell styling
            } else {
              // Placeholder is part of a larger string
              newValue = newValue.replace(placeholder, String(formattedValue));
            }
            
            hasReplacements = true;
            globalMatchedItemIds.add(item.id);
            
            if (!matchedPlaceholders.includes(placeholder)) {
              matchedPlaceholders.push(placeholder);
            }
            
          } else {
            // Only add to unmatched if not a fallback pattern
            if (!unmatchedPlaceholders.includes(placeholder)) {
              unmatchedPlaceholders.push(placeholder);
            }
          }
        }
        
        // Update cell if we made replacements
        if (hasReplacements) {
          cell.value(newValue);
        }
      }
    }
  }
  
  // PASS 2: Process category fallbacks
  console.log(`[XlsmPopulator] Processing ${fallbackRows.length} fallback rows`);
  
  // Group items by normalized category
  const itemsByCategory = new Map<string, CodifiedItem[]>();
  const categoryMappingDebug: Record<string, { original: string; normalized: string; itemCount: number }> = {};
  
  codifiedItems.forEach(item => {
    if (item.mappingStatus !== 'confirmed' && item.mappingStatus !== 'matched') {
      console.log(`[XlsmPopulator] Skipping item "${item.originalName}" - status is "${item.mappingStatus}"`);
      return;
    }
    const normalizedCat = normalizeCategory(item.category);
    
    // Debug logging
    if (!categoryMappingDebug[item.category]) {
      categoryMappingDebug[item.category] = { original: item.category, normalized: normalizedCat, itemCount: 0 };
    }
    categoryMappingDebug[item.category].itemCount++;
    
    if (!itemsByCategory.has(normalizedCat)) {
      itemsByCategory.set(normalizedCat, []);
    }
    itemsByCategory.get(normalizedCat)!.push(item);
  });
  
  // Log category mapping summary
  const templateExpectedCategories = new Set<string>();
  fallbackRows.forEach(row => templateExpectedCategories.add(row.category));
  
  console.log('[XlsmPopulator] Category mapping:', 
    Object.values(categoryMappingDebug).map(({ original, normalized, itemCount }) => 
      `${original}→${normalized}(${itemCount})`
    ).join(', ')
  );
  console.log('[XlsmPopulator] Template expects:', Array.from(templateExpectedCategories).join(', '));
  
  // Sort fallback rows by sheet and row
  fallbackRows.sort((a, b) => {
    if (a.sheetName !== b.sheetName) return a.sheetName.localeCompare(b.sheetName);
    if (a.row !== b.row) return a.row - b.row;
    const aSet = a.setNumber ?? -1;
    const bSet = b.setNumber ?? -1;
    return aSet - bSet;
  });
  
  // Group fallback rows by sheet, category, and set
  const fallbackGroups = new Map<string, CategoryFallbackRow[]>();
  fallbackRows.forEach(row => {
    const key = `${row.sheetName}-${row.category}-${row.setNumber ?? 'default'}`;
    if (!fallbackGroups.has(key)) {
      fallbackGroups.set(key, []);
    }
    fallbackGroups.get(key)!.push(row);
  });
  
  // Process each group
  for (const [key, rows] of fallbackGroups) {
    const firstRow = rows[0];
    const isNumberedSet = firstRow.setNumber !== undefined;
    
    // Normalize the template category to handle typos (e.g., "profesional" vs "professional")
    const templateCategory = firstRow.category;
    const normalizedTemplateCategory = normalizeCategory(templateCategory);
    
    // Try both the raw template category and the normalized version
    let categoryItems = itemsByCategory.get(templateCategory) || [];
    if (categoryItems.length === 0 && normalizedTemplateCategory !== templateCategory) {
      categoryItems = itemsByCategory.get(normalizedTemplateCategory) || [];
    }
    
    // For default sets, exclude items already matched to specific placeholders
    const availableItems = isNumberedSet 
      ? [...categoryItems]
      : categoryItems.filter(item => !globalMatchedItemIds.has(item.id));
    
    const sheet = workbook.sheet(firstRow.sheetName);
    if (!sheet) continue;
    
    let itemIndex = 0;
    for (const row of rows) {
      if (itemIndex >= availableItems.length) break;
      
      const item = availableItems[itemIndex];
      
      // Fill name cell
      if (row.nameCell) {
        sheet.cell(row.row, row.nameCell.col).value(item.originalName);
      }
      
      // Fill value cell - trust template's existing number format for styling
      if (row.valueCell) {
        const formattedValue = formatValueForExcel(item.value, item.dataType);
        const valueCell = sheet.cell(row.row, row.valueCell.col);
        valueCell.value(formattedValue);
        // Note: Not applying numberFormat here to preserve template's cell styling
        // The template should already have appropriate formatting (currency, etc.)
      }
      
      fallbacksInserted++;
      itemIndex++;
    }
  }
  
  // PASS 3: Clear ALL remaining placeholders (comprehensive cleanup)
  console.log('[XlsmPopulator] PASS 3: Cleaning up remaining placeholders...');
  let placeholdersCleared = 0;
  
  // Pattern to match any placeholder format: <...>
  const anyPlaceholderPattern = /<[^<>]+>/g;
  
  for (const sheet of sheets) {
    const sheetName = sheet.name();
    const usedRange = sheet.usedRange();
    if (!usedRange) continue;
    
    const startRow = usedRange.startCell().rowNumber();
    const endRow = usedRange.endCell().rowNumber();
    const startCol = usedRange.startCell().columnNumber();
    const endCol = usedRange.endCell().columnNumber();
    
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const cell = sheet.cell(row, col);
        let cellValue = cell.value();
        
        // Handle Rich Text objects
        if (cellValue !== undefined && cellValue !== null && typeof cellValue === 'object') {
          if (typeof cellValue.text === 'function') {
            cellValue = cellValue.text();
          } else if (Array.isArray(cellValue)) {
            cellValue = cellValue.map((fragment: any) => {
              if (typeof fragment === 'string') return fragment;
              if (fragment && typeof fragment.text === 'function') return fragment.text();
              if (fragment && fragment.value) return fragment.value;
              return String(fragment);
            }).join('');
          } else if (cellValue.value !== undefined) {
            cellValue = cellValue.value;
          }
        }
        
        if (cellValue === undefined || cellValue === null) continue;
        const cellText = String(cellValue);
        
        // Check if cell contains any placeholder pattern
        if (anyPlaceholderPattern.test(cellText)) {
          // Reset regex lastIndex
          anyPlaceholderPattern.lastIndex = 0;
          
          // Clear the cell (replace entire content if it's just a placeholder, or remove placeholder from text)
          if (cellText.match(/^<[^<>]+>$/)) {
            // Entire cell is a placeholder - clear it
            cell.value('');
            placeholdersCleared++;
          } else {
            // Placeholder is part of larger text - remove just the placeholders
            const cleanedText = cellText.replace(anyPlaceholderPattern, '').trim();
            if (cleanedText !== cellText) {
              cell.value(cleanedText);
              placeholdersCleared++;
            }
          }
        }
      }
    }
  }
  
  console.log(`[XlsmPopulator] Cleared ${placeholdersCleared} remaining placeholder(s)`);
  
  // Filter out fallback patterns from unmatched list
  const filteredUnmatched = unmatchedPlaceholders.filter(
    p => !p.includes('<all.')
  );
  
  // Generate the output buffer
  const outputBuffer = await workbook.outputAsync();
  
  const stats = {
    totalPlaceholders: matchedPlaceholders.length + filteredUnmatched.length + fallbackRows.length,
    matched: matchedPlaceholders.length,
    unmatched: filteredUnmatched.length,
    fallbacksInserted,
    placeholdersCleared,
  };
  
  console.log('[XlsmPopulator] Population complete:', stats);
  
  return {
    buffer: Buffer.from(outputBuffer),
    stats,
    matchedPlaceholders,
    unmatchedPlaceholders: filteredUnmatched,
  };
}

/**
 * Load and populate an XLSM template from a URL
 * 
 * @param templateUrl - URL to fetch the template from
 * @param codifiedItems - Array of codified items to insert
 * @returns Promise with populated file buffer and statistics
 */
export async function populateXlsmFromUrl(
  templateUrl: string,
  codifiedItems: CodifiedItem[]
): Promise<XlsmPopulationResult> {
  console.log('[XlsmPopulator] Fetching template from URL:', templateUrl);
  
  // Fetch the template
  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  console.log('[XlsmPopulator] Template fetched, size:', buffer.length, 'bytes');
  
  return populateXlsmTemplate(buffer, codifiedItems);
}

