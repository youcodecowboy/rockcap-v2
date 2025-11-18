import { HyperFormula } from 'hyperformula';
import { SheetData } from './templateLoader';
import * as XLSX from 'xlsx';

export interface FormulaRegistrationResult {
  totalFormulas: number;
  successfullyRegistered: number;
  failedToRegister: number;
  errors: Array<{
    sheetName: string;
    cellAddress: string;
    formulaText: string;
    error: string;
  }>;
}

/**
 * Register all formulas from SheetData with HyperFormula engine
 * This ensures formulas are explicitly recognized even if buildFromSheets() didn't catch them
 */
export function registerFormulasWithEngine(
  engine: HyperFormula,
  sheets: SheetData[]
): FormulaRegistrationResult {
  const result: FormulaRegistrationResult = {
    totalFormulas: 0,
    successfullyRegistered: 0,
    failedToRegister: 0,
    errors: [],
  };

  sheets.forEach((sheet) => {
    // Get sheet ID in HyperFormula
    let sheetId: number;
    try {
      sheetId = engine.getSheetId(sheet.name);
    } catch (e) {
      console.warn(`[FormulaRegistrar] Sheet "${sheet.name}" not found in engine, skipping`);
      return;
    }

    // Register formulas from SheetData.formulas map
    if (sheet.formulas) {
      Object.entries(sheet.formulas).forEach(([cellAddress, formula]) => {
        try {
          const cellRef = XLSX.utils.decode_cell(cellAddress);
          
          // Check if already recognized (might have been recognized by buildFromSheets)
          const alreadyHasFormula = engine.doesCellHaveFormula({
            sheet: sheetId,
            row: cellRef.r,
            col: cellRef.c,
          });
          
          if (alreadyHasFormula) {
            // Already recognized, count as success
            result.totalFormulas++;
            result.successfullyRegistered++;
            return;
          }
          
          result.totalFormulas++;
          
          // HyperFormula expects formulas with = prefix when using setCellContents
          // The formula from Excel (cell.f) doesn't have =, so add it
          const formulaWithEquals = formula.startsWith('=') ? formula : `=${formula}`;
          
          // Get current cell value to compare
          let currentValue: any;
          try {
            currentValue = engine.getCellValue({
              sheet: sheetId,
              row: cellRef.r,
              col: cellRef.c,
            });
          } catch (e) {
            currentValue = null;
          }
          
          // Set the formula using setCellContents - HyperFormula will recognize = prefix
          engine.setCellContents(
            { sheet: sheetId, row: cellRef.r, col: cellRef.c },
            [[formulaWithEquals]]
          );
          
          // Verify it was registered
          const hasFormula = engine.doesCellHaveFormula({
            sheet: sheetId,
            row: cellRef.r,
            col: cellRef.c,
          });
          
          if (hasFormula) {
            result.successfullyRegistered++;
          } else {
            result.failedToRegister++;
            result.errors.push({
              sheetName: sheet.name,
              cellAddress,
              formulaText: `=${formula}`,
              error: 'Formula set but not recognized by engine',
            });
          }
        } catch (error) {
          result.totalFormulas++;
          result.failedToRegister++;
          result.errors.push({
            sheetName: sheet.name,
            cellAddress,
            formulaText: `=${formula}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }

    // Also check data array for formulas that might not be in formulas map
    sheet.data.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const cellValue = cell;
        
        // Check if this is a formula (starts with =)
        if (typeof cellValue === 'string' && cellValue.trim().startsWith('=')) {
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          
          // Skip if already in formulas map (already processed above)
          if (sheet.formulas && sheet.formulas[cellAddress]) {
            return;
          }
          
          result.totalFormulas++;
          
          try {
            // Ensure formula has = prefix (it should already from data array)
            const formulaWithEquals = cellValue.trim();
            
            // Check if already recognized
            const alreadyHasFormula = engine.doesCellHaveFormula({
              sheet: sheetId,
              row: rowIndex,
              col: colIndex,
            });
            
            if (!alreadyHasFormula) {
              // Set the formula - HyperFormula recognizes = prefix
              engine.setCellContents(
                { sheet: sheetId, row: rowIndex, col: colIndex },
                [[formulaWithEquals]]
              );
              
              // Verify registration
              const hasFormula = engine.doesCellHaveFormula({
                sheet: sheetId,
                row: rowIndex,
                col: colIndex,
              });
              
              if (hasFormula) {
                result.successfullyRegistered++;
              } else {
                result.failedToRegister++;
                result.errors.push({
                  sheetName: sheet.name,
                  cellAddress,
                  formulaText: cellValue,
                  error: 'Formula set but not recognized by engine',
                });
              }
            } else {
              // Already recognized, count as success
              result.successfullyRegistered++;
            }
          } catch (error) {
            result.failedToRegister++;
            result.errors.push({
              sheetName: sheet.name,
              cellAddress,
              formulaText: cellValue,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });
    });
  });

  return result;
}

/**
 * Log formula registration results
 */
export function logFormulaRegistrationResult(result: FormulaRegistrationResult): void {
  console.log('=== Formula Registration Results ===');
  console.log(`Total formulas: ${result.totalFormulas}`);
  console.log(`Successfully registered: ${result.successfullyRegistered} (${((result.successfullyRegistered / result.totalFormulas) * 100).toFixed(1)}%)`);
  console.log(`Failed to register: ${result.failedToRegister} (${((result.failedToRegister / result.totalFormulas) * 100).toFixed(1)}%)`);
  
  if (result.errors.length > 0) {
    console.warn('\n⚠️  Registration Errors:');
    result.errors.slice(0, 10).forEach(error => {
      console.warn(`  ${error.sheetName}!${error.cellAddress}: ${error.formulaText}`);
      console.warn(`    Error: ${error.error}`);
    });
    if (result.errors.length > 10) {
      console.warn(`  ... and ${result.errors.length - 10} more errors`);
    }
  }
  
  console.log('=====================================');
}

