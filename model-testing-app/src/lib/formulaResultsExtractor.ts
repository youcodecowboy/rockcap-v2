import { HyperFormula } from 'hyperformula';
import { SheetData } from './templateLoader';

/**
 * Cell address in format "Sheet1!A1" or "A1"
 */
export type CellAddress = string;

/**
 * Cell value (can be number, string, boolean, etc.)
 */
export type CellValue = any;

/**
 * Extracted formula results
 */
export interface FormulaResults {
  inputs: Map<CellAddress, CellValue>;  // Input cells (no formula)
  outputs: Map<CellAddress, CellValue>; // Output cells (formulas)
  allValues: Map<CellAddress, CellValue>; // All cells
}

/**
 * Classify cells as inputs (no formula) or outputs (has formula)
 */
export function classifyCells(
  engine: HyperFormula,
  sheetIndex: number,
  sheetName: string,
  data: any[][]
): { inputs: CellAddress[], outputs: CellAddress[] } {
  const inputs: CellAddress[] = [];
  const outputs: CellAddress[] = [];
  
  data.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      try {
        const hasFormula = engine.doesCellHaveFormula({
          sheet: sheetIndex,
          row: rowIndex,
          col: colIndex,
        });
        
        const cellAddress = `${sheetName}!${colToLetter(colIndex)}${rowIndex + 1}`;
        
        if (hasFormula) {
          outputs.push(cellAddress);
        } else {
          // Only include non-empty cells as inputs
          if (cell !== null && cell !== undefined && cell !== '') {
            inputs.push(cellAddress);
          }
        }
      } catch (error) {
        // Cell might not exist in engine, skip
      }
    });
  });
  
  return { inputs, outputs };
}

/**
 * Convert column index to letter (0 = A, 1 = B, etc.)
 */
function colToLetter(col: number): string {
  let result = '';
  col += 1; // Convert to 1-based
  
  while (col > 0) {
    col--;
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26);
  }
  
  return result;
}

/**
 * Extract formula results from HyperFormula engine
 */
export function extractFormulaResults(
  engine: HyperFormula,
  sheets: SheetData[]
): FormulaResults {
  const inputs = new Map<CellAddress, CellValue>();
  const outputs = new Map<CellAddress, CellValue>();
  const allValues = new Map<CellAddress, CellValue>();
  
  sheets.forEach((sheet, sheetIndex) => {
    try {
      // Classify cells
      const { inputs: inputAddresses, outputs: outputAddresses } = classifyCells(
        engine,
        sheetIndex,
        sheet.name,
        sheet.data
      );
      
      // Extract input values
      inputAddresses.forEach(address => {
        const [sheetName, cellRef] = address.split('!');
        const { row, col } = parseCellRef(cellRef);
        
        try {
          const value = engine.getCellValue({
            sheet: sheetIndex,
            row,
            col,
          });
          
          inputs.set(address, value);
          allValues.set(address, value);
        } catch (error) {
          // Cell might not exist, use raw data
          const value = sheet.data[row]?.[col];
          if (value !== null && value !== undefined && value !== '') {
            inputs.set(address, value);
            allValues.set(address, value);
          }
        }
      });
      
      // Extract output values (formula results)
      outputAddresses.forEach(address => {
        const [sheetName, cellRef] = address.split('!');
        const { row, col } = parseCellRef(cellRef);
        
        try {
          const value = engine.getCellValue({
            sheet: sheetIndex,
            row,
            col,
          });
          
          outputs.set(address, value);
          allValues.set(address, value);
        } catch (error) {
          // Formula might have error, try to get raw value
          const value = sheet.data[row]?.[col];
          if (value !== null && value !== undefined) {
            outputs.set(address, value);
            allValues.set(address, value);
          }
        }
      });
    } catch (error) {
      console.error(`Error extracting results from sheet ${sheet.name}:`, error);
    }
  });
  
  return {
    inputs,
    outputs,
    allValues,
  };
}

/**
 * Parse cell reference (e.g., "A1" -> { row: 0, col: 0 })
 */
function parseCellRef(cellRef: string): { row: number; col: number } {
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
  col -= 1; // Convert to 0-based
  
  const row = rowNumber - 1; // Convert to 0-based
  
  return { row, col };
}

/**
 * Convert FormulaResults to plain objects for storage
 */
export function serializeFormulaResults(results: FormulaResults): {
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  allValues: Record<string, any>;
} {
  return {
    inputs: Object.fromEntries(results.inputs),
    outputs: Object.fromEntries(results.outputs),
    allValues: Object.fromEntries(results.allValues),
  };
}

/**
 * Deserialize plain objects back to FormulaResults
 */
export function deserializeFormulaResults(data: {
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  allValues: Record<string, any>;
}): FormulaResults {
  return {
    inputs: new Map(Object.entries(data.inputs)),
    outputs: new Map(Object.entries(data.outputs)),
    allValues: new Map(Object.entries(data.allValues)),
  };
}

