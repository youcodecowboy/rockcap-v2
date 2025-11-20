import { SheetData } from './templateLoader';
import { ExtractedData } from '@/types';

/**
 * Placeholder mapping configuration
 */
export interface PlaceholderMapping {
  placeholder: string;  // e.g., "<interest.rate>"
  source: string;        // e.g., "financing.interestRate" (normalized DB field path)
  type: 'string' | 'number' | 'date' | 'boolean';
  format?: string;       // e.g., "currency", "percentage"
  priority?: number;     // Higher = more important (default: 0)
}

/**
 * Array placeholder mapping configuration
 */
export interface ArrayPlaceholderMapping {
  placeholder: string;   // e.g., "<costs>"
  source: string;         // e.g., "costs" or "costCategories.siteCosts.items"
  priority?: number;      // Higher = more important (default: 0)
  rowTemplate: string;    // e.g., "<costs.category> | <costs.amount> | <costs.notes>"
  startMarker: string;   // e.g., "<costs.start>"
  endMarker: string;     // e.g., "<costs.end>"
  fields: {              // Field mappings for array items
    [placeholder: string]: string; // e.g., "<costs.type>": "type"
  };
}

/**
 * Placeholder match found in a cell
 */
export interface PlaceholderMatch {
  cellAddress: { sheet: string; row: number; col: number };
  placeholder: string;
  fullText: string;  // Full cell content
}

/**
 * Placeholder configuration (can be single mapping or array of mappings for prioritization)
 */
export type PlaceholderConfig = {
  [key: string]: PlaceholderMapping | PlaceholderMapping[] | ArrayPlaceholderMapping;
};

/**
 * Cleanup options for unpopulated rows
 */
export interface CleanupOptions {
  mode: 'hide' | 'delete';  // Hide rows vs delete them
  preserveEmptyRows?: boolean;  // Keep rows that are completely empty (no placeholders)
}

/**
 * Result of placeholder population
 */
export interface PopulationResult {
  sheets: SheetData[];
  matchedPlaceholders: Map<string, string>; // placeholder -> source used
  unmatchedPlaceholders: string[];
  cleanupReport: {
    rowsHidden: number[];
    rowsDeleted: number[];
    sheetsAffected: string[];
  };
}

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined;
  
  // Handle array access like "costs[0].amount" or "costs[].amount"
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    
    // Handle array notation
    if (part.includes('[]')) {
      // This is an array reference - return the array itself
      const arrayKey = part.replace('[]', '');
      return current[arrayKey];
    }
    
    // Handle array index like "[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Check if data exists at the given path
 */
function hasData(extractedData: ExtractedData, source: string): boolean {
  const value = getNestedValue(extractedData, source);
  return value !== undefined && value !== null;
}

/**
 * Format value based on type and format
 */
function formatValue(value: any, type: string, format?: string): any {
  if (value === undefined || value === null) return value;
  
  switch (type) {
    case 'number':
      const num = typeof value === 'number' ? value : parseFloat(String(value));
      if (isNaN(num)) return value;
      
      if (format === 'percentage') {
        return num * 100; // Convert 0.045 to 4.5
      }
      if (format === 'currency') {
        return num; // Return as number, formatting handled by cell renderer
      }
      return num;
      
    case 'string':
      return String(value);
      
    case 'date':
      if (value instanceof Date) {
        return value.toISOString().split('T')[0]; // YYYY-MM-DD
      }
      return String(value);
      
    case 'boolean':
      return Boolean(value);
      
    default:
      return value;
  }
}

/**
 * Scan all cells in all sheets for placeholder patterns (<...>)
 */
export function scanForPlaceholders(sheets: SheetData[]): PlaceholderMatch[] {
  const matches: PlaceholderMatch[] = [];
  const placeholderPattern = /<([^>]+)>/g;
  
  sheets.forEach(sheet => {
    sheet.data.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const cellValue = String(cell || '');
        const placeholders = cellValue.match(placeholderPattern);
        
        if (placeholders) {
          placeholders.forEach(placeholder => {
            matches.push({
              cellAddress: {
                sheet: sheet.name,
                row: rowIndex,
                col: colIndex,
              },
              placeholder: placeholder,
              fullText: cellValue,
            });
          });
        }
      });
    });
  });
  
  return matches;
}

/**
 * Find all possible mappings for a placeholder
 */
export function findMappingsForPlaceholder(
  placeholder: string,
  config: PlaceholderConfig
): PlaceholderMapping[] {
  const mappings: PlaceholderMapping[] = [];
  
  // Check if there's a direct mapping
  const mapping = config[placeholder];
  
  if (!mapping) {
    return mappings;
  }
  
  // If it's an array, return all mappings
  if (Array.isArray(mapping)) {
    return mapping;
  }
  
  // If it's a single mapping, wrap it in array
  if ('source' in mapping && 'type' in mapping) {
    return [mapping as PlaceholderMapping];
  }
  
  return mappings;
}

/**
 * Select best match based on priority
 */
export function selectBestMatch(
  placeholder: string,
  mappings: PlaceholderMapping[],
  extractedData: ExtractedData
): PlaceholderMapping | null {
  if (mappings.length === 0) return null;
  
  // Filter to mappings with available data
  const validMappings = mappings.filter(m => hasData(extractedData, m.source));
  
  if (validMappings.length === 0) return null;
  
  // Sort by priority (descending), then maintain order
  validMappings.sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    if (priorityB !== priorityA) {
      return priorityB - priorityA; // Higher priority first
    }
    return 0; // Maintain original order if priorities equal
  });
  
  return validMappings[0];
}

/**
 * Replace placeholders in cell text with actual values
 */
function replacePlaceholderInText(
  text: string,
  placeholder: string,
  value: any
): string {
  // Replace all occurrences of the placeholder
  return text.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
}

/**
 * Replace simple placeholders (non-array) in sheets
 */
function replaceSimplePlaceholders(
  sheets: SheetData[],
  matches: PlaceholderMatch[],
  extractedData: ExtractedData,
  config: PlaceholderConfig
): { sheets: SheetData[]; matched: Map<string, string>; unmatched: string[] } {
  const matched = new Map<string, string>();
  const unmatched = new Set<string>();
  
  // Group matches by placeholder
  const matchesByPlaceholder = new Map<string, PlaceholderMatch[]>();
  matches.forEach(match => {
    if (!matchesByPlaceholder.has(match.placeholder)) {
      matchesByPlaceholder.set(match.placeholder, []);
    }
    matchesByPlaceholder.get(match.placeholder)!.push(match);
  });
  
  // Process each placeholder
  matchesByPlaceholder.forEach((matchList, placeholder) => {
    // Skip array placeholders (handled separately)
    if (placeholder.includes('.start>') || placeholder.includes('.end>')) {
      return;
    }
    
    // Find mappings for this placeholder
    const mappings = findMappingsForPlaceholder(placeholder, config);
    
    if (mappings.length === 0) {
      unmatched.add(placeholder);
      return;
    }
    
    // Select best match
    const bestMatch = selectBestMatch(placeholder, mappings, extractedData);
    
    if (!bestMatch) {
      unmatched.add(placeholder);
      return;
    }
    
    // Get value from extracted data
    const rawValue = getNestedValue(extractedData, bestMatch.source);
    const formattedValue = formatValue(rawValue, bestMatch.type, bestMatch.format);
    
    // Replace in all matching cells
    matchList.forEach(match => {
      const sheet = sheets.find(s => s.name === match.cellAddress.sheet);
      if (sheet) {
        const row = sheet.data[match.cellAddress.row];
        if (row) {
          const cellValue = String(row[match.cellAddress.col] || '');
          const newValue = replacePlaceholderInText(cellValue, placeholder, formattedValue);
          row[match.cellAddress.col] = newValue;
        }
      }
    });
    
    matched.set(placeholder, bestMatch.source);
  });
  
  return {
    sheets,
    matched,
    unmatched: Array.from(unmatched),
  };
}

/**
 * Insert array data between start and end markers
 */
function insertArrayData(
  sheets: SheetData[],
  extractedData: ExtractedData,
  arrayMapping: ArrayPlaceholderMapping
): { sheets: SheetData[]; insertedRows: number } {
  let insertedRows = 0;
  
  // Get array data from extracted data
  const arrayData = getNestedValue(extractedData, arrayMapping.source);
  
  if (!Array.isArray(arrayData) || arrayData.length === 0) {
    return { sheets, insertedRows: 0 };
  }
  
  // Find start and end markers in all sheets
  sheets.forEach(sheet => {
    let startRow = -1;
    let startCol = -1;
    let endRow = -1;
    let endCol = -1;
    
    // Find start marker
    for (let row = 0; row < sheet.data.length; row++) {
      for (let col = 0; col < sheet.data[row].length; col++) {
        const cellValue = String(sheet.data[row][col] || '');
        if (cellValue.includes(arrayMapping.startMarker)) {
          startRow = row;
          startCol = col;
        }
        if (cellValue.includes(arrayMapping.endMarker)) {
          endRow = row;
          endCol = col;
        }
      }
    }
    
    if (startRow === -1 || endRow === -1) {
      return; // Markers not found in this sheet
    }
    
    // Find template row (usually the row after start marker)
    const templateRowIndex = startRow + 1;
    if (templateRowIndex >= sheet.data.length) {
      return; // No template row
    }
    
    const templateRow = [...sheet.data[templateRowIndex]];
    
    // Calculate how many rows to insert
    const rowsToInsert = arrayData.length - (endRow - startRow - 1);
    
    if (rowsToInsert > 0) {
      // Insert rows before end marker
      for (let i = 0; i < rowsToInsert; i++) {
        sheet.data.splice(endRow, 0, new Array(templateRow.length).fill(''));
        insertedRows++;
      }
      // Update end row position
      endRow += rowsToInsert;
    }
    
    // Populate rows with array data
    arrayData.forEach((item, index) => {
      const targetRowIndex = startRow + 1 + index;
      if (targetRowIndex < endRow) {
        // Create new row based on template
        const newRow = templateRow.map(cell => {
          let cellValue = String(cell || '');
          
          // Replace field placeholders in template
          Object.entries(arrayMapping.fields).forEach(([placeholder, fieldPath]) => {
            const fieldValue = getNestedValue(item, fieldPath);
            if (fieldValue !== undefined && fieldValue !== null) {
              cellValue = replacePlaceholderInText(cellValue, placeholder, fieldValue);
            }
          });
          
          return cellValue;
        });
        
        sheet.data[targetRowIndex] = newRow;
      }
    });
    
    // Remove start and end markers
    const startCellValue = String(sheet.data[startRow][startCol] || '');
    sheet.data[startRow][startCol] = startCellValue.replace(arrayMapping.startMarker, '').trim();
    
    const endCellValue = String(sheet.data[endRow][endCol] || '');
    sheet.data[endRow][endCol] = endCellValue.replace(arrayMapping.endMarker, '').trim();
  });
  
  return { sheets, insertedRows };
}

/**
 * Convert row/col indices to Excel cell reference (e.g., A1, B5)
 */
function indicesToCellRef(row: number, col: number): string {
  // Convert column index to letters (0 = A, 1 = B, etc.)
  let colLetters = '';
  let colNum = col + 1; // Convert to 1-based
  
  while (colNum > 0) {
    colNum--;
    colLetters = String.fromCharCode(65 + (colNum % 26)) + colLetters;
    colNum = Math.floor(colNum / 26);
  }
  
  return `${colLetters}${row + 1}`; // Row is 1-based
}

/**
 * Find cell range for a placeholder pattern in a sheet
 * Returns the range as "A1:B5" format or null if not found
 */
function findPlaceholderRange(
  sheet: SheetData,
  placeholderPattern: string
): string | null {
  const pattern = new RegExp(placeholderPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  let minRow = Infinity;
  let maxRow = -1;
  let minCol = Infinity;
  let maxCol = -1;
  let found = false;
  
  sheet.data.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const cellValue = String(cell || '');
      if (pattern.test(cellValue)) {
        found = true;
        minRow = Math.min(minRow, rowIndex);
        maxRow = Math.max(maxRow, rowIndex);
        minCol = Math.min(minCol, colIndex);
        maxCol = Math.max(maxCol, colIndex);
      }
    });
  });
  
  if (!found) return null;
  
  const startRef = indicesToCellRef(minRow, minCol);
  const endRef = indicesToCellRef(maxRow, maxCol);
  
  // If single cell, return just that cell reference
  if (minRow === maxRow && minCol === maxCol) {
    return startRef;
  }
  
  return `${startRef}:${endRef}`;
}

/**
 * Resolve formula placeholders to cell references
 * 
 * This function looks for formulas containing placeholder references like
 * =SUM(<costs.amount>) and replaces them with actual cell ranges like =SUM(B6:B15)
 */
function resolveFormulaPlaceholders(
  sheets: SheetData[],
  placeholderRanges: Map<string, string>,
  arrayMappings: ArrayPlaceholderMapping[]
): SheetData[] {
  const formulaPattern = /^=/; // Formulas start with =
  const placeholderInFormulaPattern = /<([^>]+)>/g;
  
  sheets.forEach(sheet => {
    sheet.data.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const cellValue = String(cell || '');
        
        // Check if this is a formula
        if (!formulaPattern.test(cellValue)) {
          return;
        }
        
        // Find all placeholders in the formula
        const placeholders = cellValue.match(placeholderInFormulaPattern);
        if (!placeholders || placeholders.length === 0) {
          return;
        }
        
        let resolvedFormula = cellValue;
        
        // Replace each placeholder with its cell range
        placeholders.forEach(placeholder => {
          // Check if we have a direct range mapping
          let range = placeholderRanges.get(placeholder);
          
          // If not, try to find range by searching for the placeholder pattern
          if (!range) {
            // For array placeholders, try to find the range between start and end markers
            const arrayMapping = arrayMappings.find(m => 
              m.placeholder && placeholder.includes(m.placeholder.replace(/[<>]/g, ''))
            );
            
            if (arrayMapping) {
              // Find the range between start and end markers
              let startRow = -1;
              let startCol = -1;
              let endRow = -1;
              let endCol = -1;
              
              sheet.data.forEach((r, ri) => {
                r.forEach((c, ci) => {
                  const cv = String(c || '');
                  if (cv.includes(arrayMapping.startMarker)) {
                    startRow = ri;
                    startCol = ci;
                  }
                  if (cv.includes(arrayMapping.endMarker)) {
                    endRow = ri;
                    endCol = ci;
                  }
                });
              });
              
              if (startRow !== -1 && endRow !== -1 && startRow < endRow) {
                // Find the column that contains the field we're referencing
                // For now, use the start column + 1 (assuming data is in next column)
                const dataCol = startCol + 1;
                const dataStartRow = startRow + 1;
                const dataEndRow = endRow - 1;
                
                if (dataStartRow <= dataEndRow) {
                  range = `${indicesToCellRef(dataStartRow, dataCol)}:${indicesToCellRef(dataEndRow, dataCol)}`;
                }
              }
            } else {
              // Try to find the placeholder in the sheet
              const foundRange = findPlaceholderRange(sheet, placeholder);
              range = foundRange || undefined;
            }
          }
          
          // Replace placeholder with range (or leave as-is if not found)
          if (range) {
            resolvedFormula = resolvedFormula.replace(
              new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              range
            );
            // Store the mapping for future reference
            placeholderRanges.set(placeholder, range);
          }
        });
        
        // Update the cell with resolved formula
        row[colIndex] = resolvedFormula;
      });
    });
  });
  
  return sheets;
}

/**
 * Cleanup unpopulated rows (rows that still contain placeholders)
 */
export function cleanupUnpopulatedRows(
  sheets: SheetData[],
  options: CleanupOptions = { mode: 'hide' }
): { sheets: SheetData[]; report: PopulationResult['cleanupReport'] } {
  const placeholderPattern = /<[^>]+>/g;
  const report: PopulationResult['cleanupReport'] = {
    rowsHidden: [],
    rowsDeleted: [],
    sheetsAffected: [],
  };
  
  sheets.forEach(sheet => {
    const rowsToCleanup: number[] = [];
    
    // Scan rows for remaining placeholders
    sheet.data.forEach((row, rowIndex) => {
      const rowHasPlaceholder = row.some(cell => {
        const cellValue = String(cell || '');
        return placeholderPattern.test(cellValue);
      });
      
      // Check preserveEmptyRows option
      if (options.preserveEmptyRows) {
        const rowIsEmpty = row.every(cell => !cell || String(cell).trim() === '');
        if (rowIsEmpty) {
          return; // Skip empty rows
        }
      }
      
      if (rowHasPlaceholder) {
        rowsToCleanup.push(rowIndex);
      }
    });
    
    if (rowsToCleanup.length === 0) {
      return; // No cleanup needed for this sheet
    }
    
    report.sheetsAffected.push(sheet.name);
    
    if (options.mode === 'delete') {
      // Delete rows in reverse order to maintain indices
      rowsToCleanup.reverse().forEach(rowIndex => {
        sheet.data.splice(rowIndex, 1);
        report.rowsDeleted.push(rowIndex);
      });
    } else {
      // Hide rows (store indices for future use with Handsontable)
      rowsToCleanup.forEach(rowIndex => {
        report.rowsHidden.push(rowIndex);
      });
    }
  });
  
  return { sheets, report };
}

/**
 * Main function: Populate template with placeholders
 */
export function populateTemplateWithPlaceholders(
  sheets: SheetData[],
  extractedData: ExtractedData,
  config: PlaceholderConfig
): PopulationResult {
  // Deep copy sheets to avoid mutations
  const populatedSheets = sheets.map(sheet => ({
    ...sheet,
    data: sheet.data.map(row => [...row]),
  }));
  
  // Scan for all placeholders
  const allMatches = scanForPlaceholders(populatedSheets);
  
  // Separate simple placeholders from array markers
  const simpleMatches = allMatches.filter(
    m => !m.placeholder.includes('.start>') && !m.placeholder.includes('.end>')
  );
  
  // Replace simple placeholders
  const { sheets: sheetsAfterSimple, matched, unmatched } = replaceSimplePlaceholders(
    populatedSheets,
    simpleMatches,
    extractedData,
    config
  );
  
  // Handle array placeholders
  const arrayMappings: ArrayPlaceholderMapping[] = [];
  Object.entries(config).forEach(([key, mapping]) => {
    if (!Array.isArray(mapping) && 'startMarker' in mapping) {
      arrayMappings.push(mapping as ArrayPlaceholderMapping);
    }
  });
  
  let totalInsertedRows = 0;
  arrayMappings.forEach(arrayMapping => {
    const { insertedRows } = insertArrayData(
      sheetsAfterSimple,
      extractedData,
      arrayMapping
    );
    totalInsertedRows += insertedRows;
    matched.set(arrayMapping.placeholder, arrayMapping.source);
  });
  
  // Resolve formula placeholders
  const sheetsAfterFormulas = resolveFormulaPlaceholders(sheetsAfterSimple, matched, arrayMappings);
  
  // Cleanup unpopulated rows
  const { sheets: finalSheets, report } = cleanupUnpopulatedRows(sheetsAfterFormulas, {
    mode: 'hide',
  });
  
  return {
    sheets: finalSheets,
    matchedPlaceholders: matched,
    unmatchedPlaceholders: unmatched,
    cleanupReport: report,
  };
}

