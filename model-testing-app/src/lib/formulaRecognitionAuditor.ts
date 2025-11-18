import { HyperFormula } from 'hyperformula';
import { SheetData } from './templateLoader';
import * as XLSX from 'xlsx';

export interface FormulaRecognitionReport {
  totalFormulasFound: number;
  formulasRecognized: number;
  formulasNotRecognized: number;
  unrecognizedFormulas: Array<{
    sheetName: string;
    cellAddress: string;
    formulaText: string;
    row: number;
    col: number;
  }>;
  recognizedFormulas: Array<{
    sheetName: string;
    cellAddress: string;
    formulaText: string;
    evaluatedValue: any;
  }>;
}

/**
 * Audit formula recognition in HyperFormula engine
 * Identifies which formulas are recognized vs appearing as plain text
 */
export function auditFormulaRecognition(
  engine: HyperFormula,
  sheets: SheetData[]
): FormulaRecognitionReport {
  const report: FormulaRecognitionReport = {
    totalFormulasFound: 0,
    formulasRecognized: 0,
    formulasNotRecognized: 0,
    unrecognizedFormulas: [],
    recognizedFormulas: [],
  };

  sheets.forEach((sheet, sheetIndex) => {
    // Find sheet index in HyperFormula (by name)
    let hfSheetIndex: number | null = null;
    try {
      hfSheetIndex = engine.getSheetId(sheet.name);
    } catch (e) {
      console.warn(`[FormulaAuditor] Sheet "${sheet.name}" not found in HyperFormula engine`);
      return;
    }

    if (hfSheetIndex === null) {
      console.warn(`[FormulaAuditor] Could not find sheet index for "${sheet.name}"`);
      return;
    }

    // Scan data array for formulas (cells starting with =)
    sheet.data.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        const cellValue = cell;
        
        // Check if this cell should be a formula
        if (typeof cellValue === 'string' && cellValue.trim().startsWith('=')) {
          report.totalFormulasFound++;
          
          const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
          const formulaText = cellValue;
          
          // Check if HyperFormula recognizes it as a formula
          try {
            const hasFormula = engine.doesCellHaveFormula({
              sheet: hfSheetIndex,
              row: rowIndex,
              col: colIndex,
            });

            if (hasFormula) {
              report.formulasRecognized++;
              
              // Try to get evaluated value
              try {
                const value = engine.getCellValue({
                  sheet: hfSheetIndex,
                  row: rowIndex,
                  col: colIndex,
                });
                
                report.recognizedFormulas.push({
                  sheetName: sheet.name,
                  cellAddress,
                  formulaText,
                  evaluatedValue: value,
                });
              } catch (e) {
                // Formula recognized but evaluation failed (might be #REF! etc.)
                report.recognizedFormulas.push({
                  sheetName: sheet.name,
                  cellAddress,
                  formulaText,
                  evaluatedValue: '#ERROR',
                });
              }
            } else {
              report.formulasNotRecognized++;
              report.unrecognizedFormulas.push({
                sheetName: sheet.name,
                cellAddress,
                formulaText,
                row: rowIndex,
                col: colIndex,
              });
            }
          } catch (e) {
            // Error checking formula - assume not recognized
            report.formulasNotRecognized++;
            report.unrecognizedFormulas.push({
              sheetName: sheet.name,
              cellAddress,
              formulaText,
              row: rowIndex,
              col: colIndex,
            });
          }
        }
      });
    });

    // Also check SheetData.formulas if available
    if (sheet.formulas) {
      Object.entries(sheet.formulas).forEach(([cellAddress, formula]) => {
        try {
          const cellRef = XLSX.utils.decode_cell(cellAddress);
          
          // Check if already counted in data array scan
          const alreadyCounted = sheet.data[cellRef.r]?.[cellRef.c]?.toString().startsWith('=');
          
          if (!alreadyCounted) {
            report.totalFormulasFound++;
            
            const hasFormula = engine.doesCellHaveFormula({
              sheet: hfSheetIndex,
              row: cellRef.r,
              col: cellRef.c,
            });

            if (hasFormula) {
              report.formulasRecognized++;
            } else {
              report.formulasNotRecognized++;
              report.unrecognizedFormulas.push({
                sheetName: sheet.name,
                cellAddress,
                formulaText: `=${formula}`,
                row: cellRef.r,
                col: cellRef.c,
              });
            }
          }
        } catch (e) {
          console.warn(`[FormulaAuditor] Error processing formula at ${cellAddress}:`, e);
        }
      });
    }
  });

  return report;
}

/**
 * Log formula recognition report to console
 */
export function logFormulaRecognitionReport(report: FormulaRecognitionReport): void {
  console.log('=== Formula Recognition Audit Report ===');
  console.log(`Total formulas found: ${report.totalFormulasFound}`);
  console.log(`Formulas recognized: ${report.formulasRecognized} (${((report.formulasRecognized / report.totalFormulasFound) * 100).toFixed(1)}%)`);
  console.log(`Formulas NOT recognized: ${report.formulasNotRecognized} (${((report.formulasNotRecognized / report.totalFormulasFound) * 100).toFixed(1)}%)`);
  
  if (report.unrecognizedFormulas.length > 0) {
    console.warn('\n⚠️  Unrecognized Formulas (showing as plain text):');
    report.unrecognizedFormulas.slice(0, 20).forEach(formula => {
      console.warn(`  ${formula.sheetName}!${formula.cellAddress}: ${formula.formulaText}`);
    });
    if (report.unrecognizedFormulas.length > 20) {
      console.warn(`  ... and ${report.unrecognizedFormulas.length - 20} more`);
    }
  }
  
  if (report.recognizedFormulas.length > 0) {
    console.log('\n✓ Recognized Formulas (first 10 examples):');
    report.recognizedFormulas.slice(0, 10).forEach(formula => {
      const valueStr = typeof formula.evaluatedValue === 'object' 
        ? JSON.stringify(formula.evaluatedValue) 
        : String(formula.evaluatedValue);
      console.log(`  ${formula.sheetName}!${formula.cellAddress}: ${formula.formulaText} → ${valueStr}`);
    });
  }
  
  console.log('==========================================');
}

