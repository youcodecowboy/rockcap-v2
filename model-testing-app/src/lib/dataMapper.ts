// Utility to map project data to Excel template cells

export interface DataMappingConfig {
  [sheetName: string]: {
    [cellRef: string]: {
      source: string; // Dot-notation path to data (e.g., "project.totalCost")
      type: 'string' | 'number' | 'date' | 'boolean';
      format?: string; // Optional formatting (e.g., currency, date format)
    };
  };
}

/**
 * Get nested value from object using dot notation
 * Example: getNestedValue({project: {name: 'Test'}}, 'project.name') => 'Test'
 */
export function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, prop) => current?.[prop], obj);
}

/**
 * Convert cell reference (e.g., "B5") to row/col indices
 */
export function cellRefToIndices(cellRef: string): { row: number; col: number } {
  const match = cellRef.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid cell reference: ${cellRef}`);
  }
  
  const colLetters = match[1];
  const rowNumber = parseInt(match[2], 10);
  
  // Convert column letters to index
  let col = 0;
  for (let i = 0; i < colLetters.length; i++) {
    col = col * 26 + (colLetters.charCodeAt(i) - 65 + 1);
  }
  col -= 1; // Convert to 0-based index
  
  const row = rowNumber - 1; // Convert to 0-based index
  
  return { row, col };
}

/**
 * Populate template cells with data from project
 */
export function populateTemplate(
  sheets: Array<{ name: string; data: any[][] }>,
  projectData: any,
  mapping: DataMappingConfig
): Array<{ name: string; data: any[][] }> {
  // Create a deep copy of sheets to avoid mutations
  const populatedSheets = sheets.map(sheet => ({
    ...sheet,
    data: sheet.data.map(row => [...row]),
  }));
  
  // Iterate through mapping config
  Object.entries(mapping).forEach(([sheetName, cellMappings]) => {
    const sheet = populatedSheets.find(s => s.name === sheetName);
    if (!sheet) {
      console.warn(`Sheet "${sheetName}" not found in template`);
      return;
    }
    
    Object.entries(cellMappings).forEach(([cellRef, config]) => {
      try {
        const { row, col } = cellRefToIndices(cellRef);
        
        // Ensure the data array has enough rows
        while (sheet.data.length <= row) {
          sheet.data.push([]);
        }
        
        // Ensure the row has enough columns
        while (sheet.data[row].length <= col) {
          sheet.data[row].push('');
        }
        
        // Get value from project data
        const value = getNestedValue(projectData, config.source);
        
        // Type conversion and formatting
        let formattedValue = value;
        
        if (value !== undefined && value !== null) {
          switch (config.type) {
            case 'number':
              formattedValue = typeof value === 'number' ? value : parseFloat(value);
              break;
            case 'string':
              formattedValue = String(value);
              break;
            case 'date':
              formattedValue = value instanceof Date ? value.toISOString() : value;
              break;
            case 'boolean':
              formattedValue = Boolean(value);
              break;
          }
        }
        
        // Set the cell value
        sheet.data[row][col] = formattedValue;
      } catch (error) {
        console.error(`Error mapping cell ${cellRef} in sheet ${sheetName}:`, error);
      }
    });
  });
  
  return populatedSheets;
}

/**
 * Example mapping configuration for appraisal model
 */
export const APPRAISAL_MODEL_MAPPING: DataMappingConfig = {
  'Sheet1': {
    'A2': { source: 'project.name', type: 'string' },
    'B2': { source: 'project.address', type: 'string' },
    'A5': { source: 'project.totalCost', type: 'number' },
    'B5': { source: 'project.revenue', type: 'number' },
  },
};

/**
 * Example mapping configuration for operating model
 */
export const OPERATING_MODEL_MAPPING: DataMappingConfig = {
  'Sheet1': {
    'A2': { source: 'project.name', type: 'string' },
    'A5': { source: 'project.operatingExpenses', type: 'number' },
    'B5': { source: 'project.operatingIncome', type: 'number' },
  },
};

