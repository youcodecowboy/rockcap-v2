/**
 * Codified Template Populator
 * 
 * This module populates Excel templates using codified extraction data.
 * Unlike the legacy placeholderMapper which uses path-based lookups in extractedData,
 * this uses the direct itemCode → value mapping from codified items.
 * 
 * Supports two types of placeholders:
 * 1. Specific codes: <engineers>, <stamp.duty> - matched directly by item code
 * 2. Category fallbacks: <all.professional.fees.name>, <all.professional.fees.value>
 *    - Paired placeholders filled with unmatched items from that category (FIFO by row)
 *    - Multiple rows with the same pattern are filled sequentially
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
  isComputedTotal?: boolean; // Flag for computed category totals - excluded from fallbacks
}

// Types for project data items (from unified library with computed totals)
export interface ProjectDataItem {
  _id: string;
  projectId: string;
  itemCode: string;
  category: string;
  originalName: string;
  currentValue: any;
  currentValueNormalized: number;
  currentSourceDocumentId: string;
  currentSourceDocumentName: string;
  currentDataType: string;
  lastUpdatedAt: string;
  lastUpdatedBy: 'extraction' | 'manual';
  hasMultipleSources: boolean;
  valueHistory: any[];
  isDeleted?: boolean;
  isComputed?: boolean;
  computedFromCategory?: string;
  computedItemCount?: number;
  computedTotal?: number;
}

/**
 * Merge computed category totals from projectDataLibrary into codified items
 * This allows placeholders like <total.construction.costs> to be populated
 * 
 * @param codifiedItems - Original codified items from extraction
 * @param projectDataItems - Project data items including computed totals
 * @returns Combined array with computed totals converted to CodifiedItem format
 */
export function mergeComputedTotals(
  codifiedItems: CodifiedItem[],
  projectDataItems: ProjectDataItem[]
): CodifiedItem[] {
  // Filter to only computed totals
  const computedTotals = projectDataItems.filter(
    item => item.isComputed || (item.itemCode && item.itemCode.startsWith('<total.'))
  );
  
  if (computedTotals.length === 0) {
    console.log('[mergeComputedTotals] No computed totals found in project data');
    return codifiedItems;
  }
  
  console.log(`[mergeComputedTotals] Found ${computedTotals.length} computed totals to merge`);
  
  // Convert computed totals to CodifiedItem format
  const convertedTotals: CodifiedItem[] = computedTotals.map(item => ({
    id: String(item._id),
    originalName: item.originalName,
    itemCode: item.itemCode,
    value: item.currentValue,
    dataType: item.currentDataType || 'currency',
    category: item.category,
    mappingStatus: 'matched' as const, // Mark as matched so populator includes it
    confidence: 1.0,
    isComputedTotal: true, // Mark as computed total - should NOT be used in category fallbacks
  }));
  
  // Log what we're adding
  convertedTotals.forEach(item => {
    console.log(`[mergeComputedTotals] Adding: ${item.itemCode} = ${item.value} (${item.originalName})`);
  });
  
  // Return combined array - codified items first, then computed totals
  return [...codifiedItems, ...convertedTotals];
}

/**
 * Overflow item that couldn't be inserted
 */
export interface OverflowItem {
  originalName: string;
  value: any;
  category: string;
}

/**
 * Category overflow info
 */
export interface CategoryOverflow {
  category: string;
  normalizedCategory: string;
  items: OverflowItem[];
  slotsAvailable: number;
  itemsInserted: number;
}

/**
 * Result of template population with codified data
 */
export interface CodifiedPopulationResult {
  sheets: SheetData[];
  matchedPlaceholders: Map<string, { value: any; itemCode: string; originalName: string }>;
  unmatchedPlaceholders: string[];
  fallbacksUsed: Map<string, { name: string; value: any }[]>; // category -> items inserted
  overflowItems: CategoryOverflow[]; // Items that couldn't fit in fallback slots
  stats: {
    totalPlaceholders: number;
    matched: number;
    unmatched: number;
    fallbacksInserted: number;
    overflowCount: number;
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
 * Category fallback row - a row containing paired name/value placeholders
 */
interface CategoryFallbackRow {
  sheetIndex: number;
  sheetName: string;
  row: number;
  category: string;
  setNumber?: number; // undefined = default set (per-sheet deduplication), number = numbered set (full copy)
  namePlaceholder?: { col: number; placeholder: string };
  valuePlaceholder?: { col: number; placeholder: string };
}

/**
 * Pattern to match DEFAULT category fallback placeholders (no number suffix)
 * Format: <all.{category}.name> or <all.{category}.value>
 * Examples: <all.professional.fees.name>, <all.site.costs.value>
 * 
 * NOTE: Uses negative lookahead (?!\.\d) to exclude numbered sets
 */
const CATEGORY_FALLBACK_PATTERN = /<all\.([a-z.]+)\.(name|value)>(?!\.\d)/gi;

/**
 * Pattern to match NUMBERED SET category fallback placeholders
 * Format: <all.{category}.name.{N}> or <all.{category}.value.{N}>
 * Examples: <all.professional.fees.name.1>, <all.plots.value.2>
 * 
 * Numbered sets get ALL items (full copy, no deduplication based on specific placements)
 */
const NUMBERED_SET_PATTERN = /<all\.([a-z.]+)\.(name|value)\.(\d+)>/gi;

/**
 * Map display category names to normalized forms
 * This comprehensive mapping handles various ways categories appear in extractions
 */
const CATEGORY_NORMALIZATIONS: Record<string, string> = {
  // Site Costs / Land Acquisition
  'site costs': 'site.costs',
  'purchase costs': 'site.costs',
  'land costs': 'site.costs',
  'land acquisition': 'site.costs',
  'acquisition costs': 'site.costs',
  'site': 'site.costs',
  
  // Professional Fees
  'professional fees': 'professional.fees',
  'professional': 'professional.fees',
  'fees': 'professional.fees',
  'consultants': 'professional.fees',
  'consultant fees': 'professional.fees',
  
  // Construction Costs / Development Costs / Build Budget
  'construction costs': 'construction.costs',
  'net construction costs': 'construction.costs',
  'build costs': 'construction.costs',
  'construction': 'construction.costs',
  'building costs': 'construction.costs',
  'build': 'construction.costs',
  'development costs': 'construction.costs',
  'development': 'construction.costs',
  'dev costs': 'construction.costs',
  'construction budget': 'construction.costs',
  'build budget': 'construction.costs',
  'dev budget': 'construction.costs',
  'development budget': 'construction.costs',
  
  // Financing Costs
  'financing costs': 'financing.costs',
  'financing/legal fees': 'financing.costs',
  'financing': 'financing.costs',
  'finance': 'financing.costs',
  'finance costs': 'financing.costs',
  'loan costs': 'financing.costs',
  'interest': 'financing.costs',
  
  // Disposal Costs / Sales Costs
  'disposal costs': 'disposal.costs',
  'disposal fees': 'disposal.costs',
  'disposal': 'disposal.costs',
  'sales costs': 'disposal.costs',
  'selling costs': 'disposal.costs',
  'marketing': 'disposal.costs',
  
  // Plots / Units / Development
  'plots': 'plots',
  'plot': 'plots',
  'units': 'plots',
  'unit': 'plots',
  'houses': 'plots',
  'house': 'plots',
  'development': 'plots',
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
 * Scan all sheets for placeholders
 * Separates regular placeholders from category fallback placeholders
 * Groups category fallbacks by row for paired matching
 * 
 * Detects two types of category fallbacks:
 * 1. Default fallbacks: <all.category.name> - per-sheet deduplication
 * 2. Numbered sets: <all.category.name.1> - full copy, no deduplication
 */
function scanForPlaceholders(sheets: SheetData[]): {
  regular: PlaceholderMatch[];
  fallbackRows: CategoryFallbackRow[];
} {
  const regular: PlaceholderMatch[] = [];
  // Key format: "sheetIndex-row-category-setNumber" where setNumber is 'default' or a number
  const fallbackMap = new Map<string, CategoryFallbackRow>();
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
          const placeholder = match[0];
          
          // First, check if this is a NUMBERED SET placeholder
          NUMBERED_SET_PATTERN.lastIndex = 0;
          const numberedMatch = NUMBERED_SET_PATTERN.exec(placeholder);
          
          if (numberedMatch) {
            const category = numberedMatch[1]; // e.g., "professional.fees"
            const type = numberedMatch[2] as 'name' | 'value';
            const setNumber = parseInt(numberedMatch[3], 10); // e.g., 1, 2, 3
            const rowKey = `${sheetIndex}-${rowIndex}-${category}-${setNumber}`;
            
            // Get or create the row entry for this numbered set
            if (!fallbackMap.has(rowKey)) {
              fallbackMap.set(rowKey, {
                sheetIndex,
                sheetName: sheet.name,
                row: rowIndex,
                category,
                setNumber, // Numbered set gets full copy
              });
            }
            
            const rowEntry = fallbackMap.get(rowKey)!;
            if (type === 'name') {
              rowEntry.namePlaceholder = { col: colIndex, placeholder };
            } else {
              rowEntry.valuePlaceholder = { col: colIndex, placeholder };
            }
          } else {
            // Check if this is a DEFAULT fallback placeholder (no number)
            CATEGORY_FALLBACK_PATTERN.lastIndex = 0;
            const fallbackMatch = CATEGORY_FALLBACK_PATTERN.exec(placeholder);
            
            if (fallbackMatch) {
              const category = fallbackMatch[1]; // e.g., "professional.fees"
              const type = fallbackMatch[2] as 'name' | 'value';
              const rowKey = `${sheetIndex}-${rowIndex}-${category}-default`;
              
              // Get or create the row entry for default set
              if (!fallbackMap.has(rowKey)) {
                fallbackMap.set(rowKey, {
                  sheetIndex,
                  sheetName: sheet.name,
                  row: rowIndex,
                  category,
                  // setNumber is undefined for default sets (per-sheet deduplication)
                });
              }
              
              const rowEntry = fallbackMap.get(rowKey)!;
              if (type === 'name') {
                rowEntry.namePlaceholder = { col: colIndex, placeholder };
              } else {
                rowEntry.valuePlaceholder = { col: colIndex, placeholder };
              }
            } else {
              // Regular placeholder (specific code)
              regular.push({
                sheetIndex,
                sheetName: sheet.name,
                row: rowIndex,
                col: colIndex,
                placeholder,
                fullCellText: cellText,
              });
            }
          }
        }
      });
    });
  });
  
  // Convert map to array, sorted by sheet then row for deterministic order
  const fallbackRows = Array.from(fallbackMap.values()).sort((a, b) => {
    if (a.sheetIndex !== b.sheetIndex) return a.sheetIndex - b.sheetIndex;
    if (a.row !== b.row) return a.row - b.row;
    // For same sheet/row, sort numbered sets after default
    const aSet = a.setNumber ?? -1;
    const bSet = b.setNumber ?? -1;
    return aSet - bSet;
  });
  
  return { regular, fallbackRows };
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
 * Population happens in two passes:
 * 1. Specific codes: <engineers>, <stamp.duty> - matched directly by item code (PRIORITY)
 * 2. Category fallbacks: <all.professional.fees.name>, <all.professional.fees.value>
 *    - Filled with remaining unmatched items from that category
 *    - Rows are filled sequentially (top to bottom) FIFO
 * 
 * @param sheets - Template sheets to populate
 * @param codifiedItems - Codified items from the extraction
 * @returns Population result with updated sheets and match statistics
 */
export function populateTemplateWithCodifiedData(
  sheets: SheetData[],
  codifiedItems: CodifiedItem[]
): CodifiedPopulationResult {
  // ========================================================================
  // DETAILED POPULATION SUMMARY (for debugging)
  // ========================================================================
  console.log('\n[CodifiedPopulator] ==========================================');
  console.log('[CodifiedPopulator]          POPULATION SUMMARY');
  console.log('[CodifiedPopulator] ==========================================');
  console.log('[CodifiedPopulator] Total items:', codifiedItems.length);
  
  // Count by status
  const statusCounts: Record<string, number> = {
    matched: 0,
    confirmed: 0,
    suggested: 0,
    pending_review: 0,
    unmatched: 0,
  };
  codifiedItems.forEach(item => {
    statusCounts[item.mappingStatus] = (statusCounts[item.mappingStatus] || 0) + 1;
  });
  console.log('[CodifiedPopulator] By status:', statusCounts);
  console.log(`[CodifiedPopulator]   ✓ Usable (matched+confirmed): ${statusCounts.matched + statusCounts.confirmed}`);
  console.log(`[CodifiedPopulator]   ⏳ Not usable (suggested+pending+unmatched): ${statusCounts.suggested + statusCounts.pending_review + statusCounts.unmatched}`);
  
  // Count by raw category (before normalization)
  const rawCategoryCounts: Record<string, number> = {};
  codifiedItems.forEach(item => {
    rawCategoryCounts[item.category] = (rawCategoryCounts[item.category] || 0) + 1;
  });
  console.log('[CodifiedPopulator] By raw category:');
  Object.entries(rawCategoryCounts).forEach(([cat, count]) => {
    const normalized = normalizeCategory(cat);
    console.log(`[CodifiedPopulator]   "${cat}" (${count} items) → normalizes to "${normalized}"`);
  });
  
  // Count usable items by normalized category
  const usableByNormalizedCategory: Record<string, number> = {};
  codifiedItems.forEach(item => {
    if (item.mappingStatus === 'confirmed' || item.mappingStatus === 'matched') {
      const normalized = normalizeCategory(item.category);
      usableByNormalizedCategory[normalized] = (usableByNormalizedCategory[normalized] || 0) + 1;
    }
  });
  console.log('[CodifiedPopulator] Usable items by normalized category:');
  Object.entries(usableByNormalizedCategory).forEach(([cat, count]) => {
    console.log(`[CodifiedPopulator]   "${cat}": ${count} items ready for fallback`);
  });
  console.log('[CodifiedPopulator] ==========================================\n');
  
  // Build lookup from codified items
  const codeLookup = buildCodeLookup(codifiedItems);
  
  console.log('[CodifiedPopulator] Building code lookup from', codifiedItems.length, 'items');
  console.log('[CodifiedPopulator] Lookup has', codeLookup.size, 'entries');
  
  // Log available codes for debugging
  const availableCodes = Array.from(codeLookup.keys()).filter(k => k.startsWith('<'));
  console.log('[CodifiedPopulator] Available codes:', availableCodes);
  
  // Scan for placeholders in templates (separates regular from fallbacks)
  const { regular: regularMatches, fallbackRows } = scanForPlaceholders(sheets);
  console.log('[CodifiedPopulator] Found', regularMatches.length, 'regular placeholders');
  console.log('[CodifiedPopulator] Found', fallbackRows.length, 'fallback rows');
  
  // Debug: Log fallback rows
  if (fallbackRows.length > 0) {
    console.log('[CodifiedPopulator] Fallback row details:');
    fallbackRows.forEach(row => {
      console.log(`  Sheet ${row.sheetIndex} (${row.sheetName}), Row ${row.row}: category="${row.category}"`,
        row.namePlaceholder ? `name@col${row.namePlaceholder.col}` : 'no-name',
        row.valuePlaceholder ? `value@col${row.valuePlaceholder.col}` : 'no-value'
      );
    });
  }
  
  // Get unique regular placeholders
  const uniquePlaceholders = new Set(regularMatches.map(m => m.placeholder));
  console.log('[CodifiedPopulator] Unique regular placeholders:', Array.from(uniquePlaceholders));
  
  // Track matches and unmatches
  const matchedPlaceholders = new Map<string, { value: any; itemCode: string; originalName: string }>();
  const unmatchedPlaceholders: string[] = [];
  
  // ========================================================================
  // PER-SHEET TRACKING: Track which items are matched to specific placeholders on each sheet
  // This enables per-sheet deduplication for default fallbacks
  // ========================================================================
  const matchedItemIdsBySheet = new Map<number, Set<string>>(); // sheetIndex -> Set of item IDs
  const globalMatchedItemIds = new Set<string>(); // All items matched to any specific placeholder
  
  // Initialize per-sheet sets
  sheets.forEach((_, idx) => {
    matchedItemIdsBySheet.set(idx, new Set<string>());
  });
  
  // Deep copy sheets for modification
  const populatedSheets: SheetData[] = sheets.map(sheet => ({
    ...sheet,
    data: sheet.data ? sheet.data.map(row => row ? [...row] : []) : [],
  }));
  
  // ========================================================================
  // PASS 1: Match specific codes (regular placeholders) - PRIORITY
  // Fills ALL occurrences of specific codes everywhere, unlimited
  // ========================================================================
  uniquePlaceholders.forEach(placeholder => {
    // Try to find a match in the code lookup
    const item = codeLookup.get(placeholder);
    
    if (item) {
      matchedPlaceholders.set(placeholder, {
        value: item.value,
        itemCode: item.itemCode || placeholder,
        originalName: item.originalName,
      });
      globalMatchedItemIds.add(item.id);
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
          globalMatchedItemIds.add(codeItem.id);
          console.log('[CodifiedPopulator] Matched (case-insensitive):', placeholder, '→', codeItem.value);
          found = true;
          break;
        }
      }
      
      if (!found) {
        unmatchedPlaceholders.push(placeholder);
        console.log('[CodifiedPopulator] Unmatched placeholder:', placeholder);
      }
    }
  });
  
  // Replace regular placeholders in sheets AND track per-sheet matches
  regularMatches.forEach(match => {
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
          sheet.data[match.row][match.col] = formattedValue;
        } else {
          sheet.data[match.row][match.col] = currentText.replace(
            match.placeholder,
            String(formattedValue)
          );
        }
        
        // Track that this item was used on this specific sheet
        if (item) {
          matchedItemIdsBySheet.get(match.sheetIndex)?.add(item.id);
          console.log(`[CodifiedPopulator] Item "${item.originalName}" matched on sheet ${match.sheetIndex}`);
        }
      }
    }
  });
  
  // Log per-sheet matches for debugging
  console.log('[CodifiedPopulator] Per-sheet matched items:');
  matchedItemIdsBySheet.forEach((itemIds, sheetIdx) => {
    if (itemIds.size > 0) {
      console.log(`  Sheet ${sheetIdx}: ${itemIds.size} items matched to specific placeholders`);
    }
  });
  
  // ========================================================================
  // PASS 2: Build category item pools for fallbacks
  // ALL confirmed/matched items grouped by normalized category
  // ========================================================================
  const allItemsByCategory = new Map<string, CodifiedItem[]>();
  
  codifiedItems.forEach(item => {
    // Only include confirmed or matched items
    if (item.mappingStatus !== 'confirmed' && item.mappingStatus !== 'matched') {
      console.log(`[CodifiedPopulator] Skipping "${item.originalName}" - status is "${item.mappingStatus}" (need confirmed or matched)`);
      return;
    }
    
    // Skip computed totals - they only match specific <total.X> placeholders, not category fallbacks
    if (item.isComputedTotal) {
      console.log(`[CodifiedPopulator] Skipping computed total "${item.originalName}" from fallback pool`);
      return;
    }
    
    // Debug: Show full item details for plots
    if (item.originalName.toLowerCase().includes('plot') || item.category?.toLowerCase().includes('plot')) {
      console.log(`[CodifiedPopulator] 🔍 PLOT ITEM DETAILS:`, {
        originalName: item.originalName,
        itemCode: item.itemCode,
        category: item.category,
        mappingStatus: item.mappingStatus,
        value: item.value,
      });
    }
    
    const normalizedCat = normalizeCategory(item.category);
    console.log(`[CodifiedPopulator] Item "${item.originalName}" category: "${item.category}" -> normalized: "${normalizedCat}"`);
    
    if (!allItemsByCategory.has(normalizedCat)) {
      allItemsByCategory.set(normalizedCat, []);
    }
    allItemsByCategory.get(normalizedCat)!.push(item);
  });
  
  console.log('[CodifiedPopulator] All usable items by category:');
  allItemsByCategory.forEach((items, cat) => {
    console.log(`  "${cat}": ${items.length} items - ${items.map(i => i.originalName).join(', ')}`);
  });
  
  // Debug: Log all unique raw categories from items (before normalization)
  const rawCategories = new Set(codifiedItems.map(i => i.category));
  console.log('[CodifiedPopulator] Raw categories in data:', Array.from(rawCategories));
  
  // ========================================================================
  // PASS 3: Fill category fallback rows with advanced priority rules
  // 
  // TWO TYPES OF FALLBACKS:
  // 1. DEFAULT SETS (setNumber undefined): Per-sheet deduplication
  //    - Items matched to specific placeholders ON THIS SHEET are excluded
  //    - Same item CAN appear on different sheets
  // 2. NUMBERED SETS (setNumber = 1, 2, etc.): Full copy, no exclusions
  //    - Gets ALL items regardless of specific placements
  //    - Independent copies of the full category
  // ========================================================================
  
  // Group fallback rows by sheet, then category, then set
  // Structure: Map<sheetIndex, Map<category, Map<setKey, CategoryFallbackRow[]>>>
  // where setKey is 'default' or the set number as string
  const fallbacksBySheetCategorySet = new Map<number, Map<string, Map<string, CategoryFallbackRow[]>>>();
  
  fallbackRows.forEach(row => {
    if (!fallbacksBySheetCategorySet.has(row.sheetIndex)) {
      fallbacksBySheetCategorySet.set(row.sheetIndex, new Map());
    }
    const sheetMap = fallbacksBySheetCategorySet.get(row.sheetIndex)!;
    
    if (!sheetMap.has(row.category)) {
      sheetMap.set(row.category, new Map());
    }
    const categoryMap = sheetMap.get(row.category)!;
    
    const setKey = row.setNumber !== undefined ? String(row.setNumber) : 'default';
    if (!categoryMap.has(setKey)) {
      categoryMap.set(setKey, []);
    }
    categoryMap.get(setKey)!.push(row);
  });
  
  // Track fallbacks used and overflow
  const fallbacksUsed = new Map<string, { name: string; value: any }[]>();
  const overflowItems: CategoryOverflow[] = [];
  let totalFallbacksInserted = 0;
  
  // Debug: Log fallback structure
  console.log('[CodifiedPopulator] Fallback structure (by sheet, category, set):');
  fallbacksBySheetCategorySet.forEach((categoryMap, sheetIdx) => {
    console.log(`  Sheet ${sheetIdx}:`);
    categoryMap.forEach((setMap, category) => {
      setMap.forEach((rows, setKey) => {
        const setType = setKey === 'default' ? '(default - per-sheet dedup)' : `(set ${setKey} - full copy)`;
        console.log(`    "${category}" ${setType}: ${rows.length} rows`);
      });
    });
  });
  
  // Debug: Check specifically for plots
  console.log('[CodifiedPopulator] 🔍 PLOTS DEBUG:');
  console.log('  - All items with "plots" category:', allItemsByCategory.get('plots')?.length || 0);
  console.log('  - All categories in allItemsByCategory:', Array.from(allItemsByCategory.keys()));
  
  // Process each sheet's fallbacks
  fallbacksBySheetCategorySet.forEach((categoryMap, sheetIdx) => {
    const sheetMatchedIds = matchedItemIdsBySheet.get(sheetIdx) || new Set<string>();
    console.log(`[CodifiedPopulator] Processing sheet ${sheetIdx} (${sheetMatchedIds.size} items matched to specific placeholders)`);
    
    categoryMap.forEach((setMap, category) => {
      const allCategoryItems = allItemsByCategory.get(category) || [];
      
      setMap.forEach((categoryRows, setKey) => {
        const isNumberedSet = setKey !== 'default';
        
        // Determine which items to use based on set type
        let availableItems: CodifiedItem[];
        
        if (isNumberedSet) {
          // NUMBERED SETS: Include ALL items (full copy, no deduplication)
          availableItems = [...allCategoryItems];
          console.log(`[CodifiedPopulator] Sheet ${sheetIdx}, "${category}" SET ${setKey}: Using ALL ${availableItems.length} items (full copy)`);
        } else {
          // DEFAULT SET: Exclude items matched to specific placeholders ON THIS SHEET
          availableItems = allCategoryItems.filter(item => !sheetMatchedIds.has(item.id));
          const excludedCount = allCategoryItems.length - availableItems.length;
          console.log(`[CodifiedPopulator] Sheet ${sheetIdx}, "${category}" DEFAULT: ${availableItems.length} items (${excludedCount} excluded - matched on this sheet)`);
        }
        
        const insertedItems: { name: string; value: any }[] = [];
        let itemIndex = 0;
        
        // Fill rows sequentially (top to bottom, already sorted)
        categoryRows.forEach((rowEntry) => {
          if (itemIndex < availableItems.length) {
            const item = availableItems[itemIndex];
            
            // Fill the name placeholder
            if (rowEntry.namePlaceholder) {
              const sheet = populatedSheets[rowEntry.sheetIndex];
              if (sheet.data && sheet.data[rowEntry.row]) {
                sheet.data[rowEntry.row][rowEntry.namePlaceholder.col] = item.originalName;
              }
            }
            
            // Fill the value placeholder
            if (rowEntry.valuePlaceholder) {
              const sheet = populatedSheets[rowEntry.sheetIndex];
              if (sheet.data && sheet.data[rowEntry.row]) {
                const formattedValue = formatValueForTemplate(item.value, item.dataType);
                sheet.data[rowEntry.row][rowEntry.valuePlaceholder.col] = formattedValue;
              }
            }
            
            insertedItems.push({ name: item.originalName, value: item.value });
            totalFallbacksInserted++;
            itemIndex++;
            
            const setLabel = isNumberedSet ? `set ${setKey}` : 'default';
            console.log(`[CodifiedPopulator] Sheet ${sheetIdx}, ${setLabel} row ${rowEntry.row}: "${item.originalName}" = ${item.value}`);
          }
          // NOTE: Unfilled rows are left as-is (placeholders remain for manual cleanup)
        });
        
        // Track usage with unique key including sheet and set
        const usageKey = `${category}-sheet${sheetIdx}-${setKey}`;
        if (insertedItems.length > 0) {
          fallbacksUsed.set(usageKey, insertedItems);
        }
        
        // Track overflow items (items that didn't fit in this specific set)
        if (itemIndex < availableItems.length) {
          const overflowItemsList = availableItems.slice(itemIndex).map(item => ({
            originalName: item.originalName,
            value: item.value,
            category: item.category,
          }));
          
          overflowItems.push({
            category: availableItems[0]?.category || category,
            normalizedCategory: category,
            items: overflowItemsList,
            slotsAvailable: categoryRows.length,
            itemsInserted: itemIndex,
          });
          
          const setLabel = isNumberedSet ? `set ${setKey}` : 'default';
          console.log(`[CodifiedPopulator] Overflow in sheet ${sheetIdx} "${category}" ${setLabel}: ${overflowItemsList.length} items couldn't fit`);
        }
      });
    });
  });
  
  // ========================================================================
  // Summary
  // ========================================================================
  const totalOverflow = overflowItems.reduce((sum, cat) => sum + cat.items.length, 0);
  
  // Count total fallback placeholders
  const totalFallbackPlaceholders = fallbackRows.reduce((sum, row) => {
    return sum + (row.namePlaceholder ? 1 : 0) + (row.valuePlaceholder ? 1 : 0);
  }, 0);
  
  console.log('[CodifiedPopulator] Population complete:', {
    totalPlaceholders: uniquePlaceholders.size + totalFallbackPlaceholders,
    matched: matchedPlaceholders.size,
    unmatched: unmatchedPlaceholders.length,
    fallbacksInserted: totalFallbacksInserted,
    overflow: totalOverflow,
  });
  
  return {
    sheets: populatedSheets,
    matchedPlaceholders,
    unmatchedPlaceholders,
    fallbacksUsed,
    overflowItems,
    stats: {
      totalPlaceholders: uniquePlaceholders.size + totalFallbackPlaceholders,
      matched: matchedPlaceholders.size,
      unmatched: unmatchedPlaceholders.length,
      fallbacksInserted: totalFallbacksInserted,
      overflowCount: totalOverflow,
    },
  };
}

/**
 * Clear unused placeholders from sheets
 * This removes any remaining <...> patterns that weren't populated
 * 
 * @param sheets - Sheets to clean up
 * @returns Cleaned sheets and count of placeholders cleared
 */
export function clearUnusedPlaceholders(sheets: SheetData[]): {
  sheets: SheetData[];
  clearedCount: number;
  clearedPlaceholders: string[];
} {
  const placeholderPattern = /<[^<>]+>/g;
  let clearedCount = 0;
  const clearedPlaceholders: string[] = [];
  
  // Deep copy sheets for modification
  const cleanedSheets: SheetData[] = sheets.map(sheet => ({
    ...sheet,
    data: sheet.data ? sheet.data.map(row => row ? [...row] : []) : [],
  }));
  
  cleanedSheets.forEach(sheet => {
    if (!sheet.data) return;
    
    sheet.data.forEach((row, rowIndex) => {
      if (!row) return;
      
      row.forEach((cell, colIndex) => {
        if (cell === null || cell === undefined) return;
        
        const cellText = String(cell);
        const matches = cellText.match(placeholderPattern);
        
        if (matches && matches.length > 0) {
          // Clear the cell
          sheet.data[rowIndex][colIndex] = '';
          clearedCount += matches.length;
          matches.forEach(m => {
            if (!clearedPlaceholders.includes(m)) {
              clearedPlaceholders.push(m);
            }
          });
        }
      });
    });
  });
  
  console.log(`[CodifiedPopulator] Cleared ${clearedCount} unused placeholders:`, clearedPlaceholders);
  
  return {
    sheets: cleanedSheets,
    clearedCount,
    clearedPlaceholders,
  };
}

/**
 * Count remaining placeholders in sheets
 * Useful for showing user what's still unfilled before cleanup
 * Detects both default category fallbacks and numbered sets
 */
export function countRemainingPlaceholders(sheets: SheetData[]): {
  total: number;
  byCategory: Map<string, number>;
  byNumberedSet: Map<string, number>; // category-setNumber -> count
  specific: string[];
} {
  const placeholderPattern = /<([^<>]+)>/g;
  const byCategory = new Map<string, number>();
  const byNumberedSet = new Map<string, number>();
  const specific: string[] = [];
  let total = 0;
  
  sheets.forEach(sheet => {
    if (!sheet.data) return;
    
    sheet.data.forEach(row => {
      if (!row) return;
      
      row.forEach(cell => {
        if (cell === null || cell === undefined) return;
        
        const cellText = String(cell);
        let match;
        placeholderPattern.lastIndex = 0;
        
        while ((match = placeholderPattern.exec(cellText)) !== null) {
          total++;
          const placeholder = match[0];
          
          // First check for numbered set
          NUMBERED_SET_PATTERN.lastIndex = 0;
          const numberedMatch = NUMBERED_SET_PATTERN.exec(placeholder);
          
          if (numberedMatch) {
            const category = numberedMatch[1];
            const setNumber = numberedMatch[3];
            const key = `${category}-set${setNumber}`;
            byNumberedSet.set(key, (byNumberedSet.get(key) || 0) + 1);
          } else {
            // Check if default category fallback
            CATEGORY_FALLBACK_PATTERN.lastIndex = 0;
            const fallbackMatch = CATEGORY_FALLBACK_PATTERN.exec(placeholder);
            
            if (fallbackMatch) {
              const category = fallbackMatch[1];
              byCategory.set(category, (byCategory.get(category) || 0) + 1);
            } else {
              if (!specific.includes(placeholder)) {
                specific.push(placeholder);
              }
            }
          }
        }
      });
    });
  });
  
  return { total, byCategory, byNumberedSet, specific };
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
  fallbacksUsed?: Map<string, { name: string; value: any }[]>;
  overflowItems?: CategoryOverflow[];
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
    fallbacksUsed: result.fallbacksUsed,
    overflowItems: result.overflowItems,
  };
}

/**
 * Get a summary of overflow items for display in UI
 */
export function getOverflowSummary(result: CodifiedPopulationResult): string[] {
  if (!result.overflowItems || result.overflowItems.length === 0) {
    return [];
  }
  
  return result.overflowItems.map(overflow => {
    const itemNames = overflow.items.slice(0, 3).map(i => `"${i.originalName}"`);
    const moreCount = overflow.items.length - 3;
    const itemsList = moreCount > 0 
      ? `${itemNames.join(', ')} +${moreCount} more`
      : itemNames.join(', ');
    
    return `${overflow.category}: ${overflow.items.length} item(s) couldn't fit (${itemsList})`;
  });
}
