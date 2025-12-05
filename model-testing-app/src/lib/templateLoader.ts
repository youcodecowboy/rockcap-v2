import * as XLSX from 'xlsx';

export interface CellStyle {
  fill?: {
    fgColor?: { rgb?: string };
    bgColor?: { rgb?: string };
  };
  font?: {
    bold?: boolean;
    italic?: boolean;
    color?: { rgb?: string };
    sz?: number;
    name?: string;
  };
  border?: {
    top?: { style?: string; color?: { rgb?: string } };
    bottom?: { style?: string; color?: { rgb?: string } };
    left?: { style?: string; color?: { rgb?: string } };
    right?: { style?: string; color?: { rgb?: string } };
  };
  alignment?: {
    horizontal?: string;
    vertical?: string;
    wrapText?: boolean;
  };
  numFmt?: string;
}

export interface SheetData {
  name: string;
  data: any[][];
  formulas?: { [key: string]: string }; // Cell address to formula mapping
  styles?: { [key: string]: CellStyle }; // Cell address to style mapping
  columnWidths?: { [col: number]: number }; // Column index to width mapping
}

export interface WorkbookData {
  sheets: SheetData[];
}

export interface SheetMetadata {
  name: string;
  range?: { s: { r: number; c: number }; e: { r: number; c: number } };
  columnWidths?: { [col: number]: number };
}

export interface LazyWorkbookData {
  metadata: SheetMetadata[];
  workbook: any; // XLSX workbook object for lazy loading
  fileUrl: string; // Original file URL for reloading if needed
}

/**
 * Trim trailing empty rows from a sheet to optimize performance
 * Finds the last row with any non-empty content and removes all rows after it
 * Also checks for formulas and styles to ensure we don't trim rows with hidden content
 */
function trimEmptyRows(sheet: SheetData): SheetData {
  if (!sheet.data || sheet.data.length === 0) {
    return sheet;
  }

  const originalRowCount = sheet.data.length;
  
  // Find the last row with any non-empty content
  // Check both visible data and formulas/styles
  let lastRowWithContent = -1;
  for (let row = sheet.data.length - 1; row >= 0; row--) {
    const rowData = sheet.data[row];
    let hasContent = false;
    
    // Check if row has any visible content
    if (rowData && rowData.some(cell => {
      const cellValue = cell;
      return cellValue !== null && 
             cellValue !== undefined && 
             cellValue !== '' && 
             String(cellValue).trim() !== '';
    })) {
      hasContent = true;
    }
    
    // Also check if this row has any formulas
    if (!hasContent && sheet.formulas) {
      const rowHasFormula = Object.keys(sheet.formulas).some(cellAddress => {
        try {
          const cellRef = XLSX.utils.decode_cell(cellAddress);
          return cellRef.r === row;
        } catch {
          return false;
        }
      });
      if (rowHasFormula) {
        hasContent = true;
      }
    }
    
    // Also check if this row has any styles
    if (!hasContent && sheet.styles) {
      const rowHasStyle = Object.keys(sheet.styles).some(cellAddress => {
        try {
          const cellRef = XLSX.utils.decode_cell(cellAddress);
          return cellRef.r === row;
        } catch {
          return false;
        }
      });
      if (rowHasStyle) {
        hasContent = true;
      }
    }
    
    if (hasContent) {
      lastRowWithContent = row;
      break;
    }
  }
  
  // If no content found, keep at least one row (empty sheet)
  if (lastRowWithContent === -1) {
    lastRowWithContent = 0;
  }
  
  // Trim the data array to only include rows up to lastRowWithContent
  const trimmedData = sheet.data.slice(0, lastRowWithContent + 1);
  
  // Ensure we have valid data structure - at least one row
  if (trimmedData.length === 0) {
    console.warn(`[TemplateLoader] Warning: Sheet "${sheet.name}" would be empty after trimming, keeping at least one empty row`);
    trimmedData.push([]);
    lastRowWithContent = 0;
  }
  
  // Ensure all rows have consistent column structure
  // Find max column count - handle empty arrays properly
  const columnCounts = trimmedData.map(row => row ? row.length : 0);
  let maxCols = columnCounts.length > 0 ? Math.max(...columnCounts, 0) : 0;
  
  // Ensure at least one column (Handsontable needs at least one column)
  if (maxCols === 0) {
    maxCols = 1;
  }
  
  // Create new array with properly padded rows (don't mutate original)
  const normalizedData = trimmedData.map((row, index) => {
    if (!row || !Array.isArray(row)) {
      return new Array(maxCols).fill('');
    }
    // Create a new array with padding to avoid mutating original
    const paddedRow = [...row];
    while (paddedRow.length < maxCols) {
      paddedRow.push('');
    }
    return paddedRow;
  });
  
  // Filter formulas and styles to only include those for remaining rows
  const trimmedFormulas: { [key: string]: string } | undefined = sheet.formulas ? {} : undefined;
  const trimmedStyles: { [key: string]: CellStyle } | undefined = sheet.styles ? {} : undefined;
  
  if (sheet.formulas && trimmedFormulas) {
    Object.entries(sheet.formulas).forEach(([cellAddress, formula]) => {
      try {
        const cellRef = XLSX.utils.decode_cell(cellAddress);
        if (cellRef.r <= lastRowWithContent) {
          trimmedFormulas[cellAddress] = formula;
        }
      } catch {
        // Invalid cell address, skip
      }
    });
  }
  
  if (sheet.styles && trimmedStyles) {
    Object.entries(sheet.styles).forEach(([cellAddress, style]) => {
      try {
        const cellRef = XLSX.utils.decode_cell(cellAddress);
        if (cellRef.r <= lastRowWithContent) {
          trimmedStyles[cellAddress] = style;
        }
      } catch {
        // Invalid cell address, skip
      }
    });
  }
  
  const trimmedRowCount = normalizedData.length;
  const rowsRemoved = originalRowCount - trimmedRowCount;
  
  // Debug logging
  console.log(`[TemplateLoader] Trim results for "${sheet.name}":`, {
    originalRows: originalRowCount,
    trimmedRows: trimmedRowCount,
    rowsRemoved,
    maxCols,
    dataStructure: {
      isArray: Array.isArray(normalizedData),
      length: normalizedData.length,
      firstRowLength: normalizedData[0]?.length,
      lastRowLength: normalizedData[trimmedRowCount - 1]?.length,
      firstRowIsArray: Array.isArray(normalizedData[0]),
    }
  });
  
  if (rowsRemoved > 0) {
    console.log(`[TemplateLoader] Trimmed ${rowsRemoved} empty rows from "${sheet.name}" (${originalRowCount} → ${trimmedRowCount} rows)`);
  }
  
  // Final validation - ensure we have valid data
  let finalData = normalizedData;
  if (!finalData || finalData.length === 0) {
    console.error(`[TemplateLoader] ERROR: Sheet "${sheet.name}" has no data after trimming! Using fallback.`);
    finalData = [new Array(maxCols).fill('')];
  }
  
  // Final structure validation
  if (!Array.isArray(finalData)) {
    console.error(`[TemplateLoader] CRITICAL ERROR: Sheet "${sheet.name}" data is not an array!`, typeof finalData, finalData);
    finalData = [['']];
  }
  
  // Ensure every row is an array
  finalData = finalData.map((row, idx) => {
    if (!Array.isArray(row)) {
      console.warn(`[TemplateLoader] Row ${idx} in sheet "${sheet.name}" is not an array, fixing...`);
      return new Array(maxCols).fill('');
    }
    return row;
  });
  
  const result = {
    ...sheet,
    data: finalData,
    formulas: trimmedFormulas && Object.keys(trimmedFormulas).length > 0 ? trimmedFormulas : undefined,
    styles: trimmedStyles && Object.keys(trimmedStyles).length > 0 ? trimmedStyles : undefined,
  };
  
  console.log(`[TemplateLoader] Final sheet structure for "${sheet.name}":`, {
    dataLength: result.data.length,
    firstRowLength: result.data[0]?.length,
    allRowsAreArrays: result.data.every(row => Array.isArray(row)),
  });
  
  return result;
}

/**
 * Load and parse an Excel file from a URL
 * Preserves formulas and cell formatting
 */
export async function loadExcelTemplate(fileUrl: string): Promise<WorkbookData> {
  try {
    console.log('[TemplateLoader] Fetching template from URL:', fileUrl);
    
    // Fetch the Excel file
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
    }
    
    console.log('[TemplateLoader] Template fetched successfully, size:', response.headers.get('content-length'), 'bytes');
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('[TemplateLoader] ArrayBuffer created, size:', arrayBuffer.byteLength, 'bytes');
    
    // Parse with XLSX, preserving formulas and styles
    console.log('[TemplateLoader] Parsing Excel file...');
    const workbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      cellFormula: true, // Preserve formulas
      cellStyles: true,  // Preserve styles
      cellNF: true,      // Preserve number formats
      cellDates: true,   // Parse dates
    });
    
    console.log('[TemplateLoader] Excel parsed successfully. Sheet names:', workbook.SheetNames);
    console.log('[TemplateLoader] Number of sheets:', workbook.SheetNames.length);
    
    // Filter out hidden sheets - only process visible sheets
    // Excel stores sheet visibility in workbook.Workbook.Sheets array
    const visibleSheetNames = workbook.SheetNames.filter((sheetName: string) => {
      // Check workbook metadata for sheet visibility
      let isVisible = true;
      
      if (workbook.Workbook && workbook.Workbook.Sheets) {
        const sheetInfo = workbook.Workbook.Sheets.find((s: any) => s.name === sheetName) as any;
        if (sheetInfo) {
          // Sheet state: 'visible', 'hidden', or 'veryHidden'
          isVisible = sheetInfo.state === 'visible' || sheetInfo.state === undefined;
          if (!isVisible) {
            console.log(`[TemplateLoader] Skipping hidden sheet: "${sheetName}" (state: ${sheetInfo.state})`);
          }
        }
      }
      
      return isVisible;
    });
    
    console.log('[TemplateLoader] Visible sheets:', visibleSheetNames);
    console.log('[TemplateLoader] Number of visible sheets:', visibleSheetNames.length);
    
    const sheets: SheetData[] = [];
    
    // Process each visible sheet
    for (const sheetName of visibleSheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      
      // Get the range of the sheet
      const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      
      // Use the full range - don't limit for now to ensure all data loads
      const maxRow = range.e.r;
      const maxCol = range.e.c;
      
      console.log(`Processing sheet "${sheetName}": ${maxRow + 1} rows x ${maxCol + 1} cols`);
      
      // Convert sheet to 2D array, only storing non-empty cells
      const data: any[][] = [];
      const formulas: { [key: string]: string } = {};
      const styles: { [key: string]: CellStyle } = {};
      const columnWidths: { [col: number]: number } = {};
      
      // Extract column widths
      if (worksheet['!cols']) {
        worksheet['!cols'].forEach((col: any, index: number) => {
          if (col && index <= maxCol) {
            // Excel stores column widths in different formats
            // wpx = width in pixels, wch = width in characters
            if (col.wpx) {
              columnWidths[index] = col.wpx; // Use pixels directly
            } else if (col.wch) {
              columnWidths[index] = col.wch * 7; // Convert characters to approximate pixels
            } else if (col.width) {
              columnWidths[index] = col.width * 7; // Convert width to pixels
            }
          }
        });
      }
      
      // Build data array - optimized for large sheets
      for (let row = range.s.r; row <= maxRow; row++) {
        const rowData: any[] = [];
        
        for (let col = range.s.c; col <= maxCol; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          const cell = worksheet[cellAddress];
          
          if (cell) {
            // Store formula if it exists
            if (cell.f) {
              formulas[cellAddress] = cell.f;
              // For Handsontable, we need to store the formula with = prefix
              rowData.push(`=${cell.f}`);
            } else {
              // Store the cell value
              rowData.push(cell.v !== undefined ? cell.v : '');
            }
            
            // Extract cell styles if available
            if (cell.s) {
              const style: CellStyle = {};
              
              // Removed excessive debug logging for performance
              
              // Background color (fill)
              // XLSX stores fill color in different ways - check both
              if (cell.s.fill) {
                const fill = cell.s.fill;
                // Try fgColor first (most common)
                if (fill.fgColor) {
                  const rgb = fill.fgColor.rgb || fill.fgColor;
                  if (rgb) {
                    style.fill = {
                      fgColor: { rgb: typeof rgb === 'string' ? rgb : rgb.toString() }
                    };
                  }
                }
                // Also check bgColor
                if (fill.bgColor) {
                  const rgb = fill.bgColor.rgb || fill.bgColor;
                  if (rgb && !style.fill) {
                    style.fill = {
                      bgColor: { rgb: typeof rgb === 'string' ? rgb : rgb.toString() }
                    };
                  }
                }
              } else if (cell.s.fgColor) {
                // Fallback: direct fgColor property
                const rgb = cell.s.fgColor.rgb || cell.s.fgColor;
                if (rgb) {
                  style.fill = {
                    fgColor: { rgb: typeof rgb === 'string' ? rgb : rgb.toString() }
                  };
                }
              }
              
              // Font properties
              if (cell.s.font) {
                style.font = {};
                if (cell.s.font.bold !== undefined) style.font.bold = cell.s.font.bold;
                if (cell.s.font.italic !== undefined) style.font.italic = cell.s.font.italic;
                if (cell.s.font.color) {
                  const rgb = cell.s.font.color.rgb || cell.s.font.color;
                  if (rgb) {
                    style.font.color = { rgb: typeof rgb === 'string' ? rgb : rgb.toString() };
                  }
                }
                if (cell.s.font.sz) style.font.sz = cell.s.font.sz;
                if (cell.s.font.name) style.font.name = cell.s.font.name;
              }
              
              // Borders
              if (cell.s.border) {
                style.border = {};
                if (cell.s.border.top) style.border.top = cell.s.border.top;
                if (cell.s.border.bottom) style.border.bottom = cell.s.border.bottom;
                if (cell.s.border.left) style.border.left = cell.s.border.left;
                if (cell.s.border.right) style.border.right = cell.s.border.right;
              }
              
              // Alignment
              if (cell.s.alignment) {
                style.alignment = {
                  horizontal: cell.s.alignment.horizontal,
                  vertical: cell.s.alignment.vertical,
                  wrapText: cell.s.alignment.wrapText
                };
              }
              
              // Number format
              if (cell.s.numFmt) {
                style.numFmt = cell.s.numFmt;
              }
              
              if (Object.keys(style).length > 0) {
                styles[cellAddress] = style;
              }
            }
          } else {
            rowData.push('');
          }
        }
        data.push(rowData);
      }
      
      // Create sheet object
      const sheet: SheetData = {
        name: sheetName,
        data,
        formulas: Object.keys(formulas).length > 0 ? formulas : undefined,
        styles: Object.keys(styles).length > 0 ? styles : undefined,
        columnWidths: Object.keys(columnWidths).length > 0 ? columnWidths : undefined,
      };
      
      // Trim trailing empty rows to optimize performance
      const trimmedSheet = trimEmptyRows(sheet);
      sheets.push(trimmedSheet);
    }
    
    return { sheets };
  } catch (error) {
    console.error('Error loading Excel template:', error);
    throw new Error(`Failed to load Excel template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load only sheet metadata (names and ranges) without full data
 * This is much faster for workbooks with many sheets
 */
export async function loadExcelTemplateMetadata(fileUrl: string): Promise<LazyWorkbookData> {
  try {
    console.log('[TemplateLoader] Fetching template metadata from URL:', fileUrl);
    
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log('[TemplateLoader] ArrayBuffer created, size:', arrayBuffer.byteLength, 'bytes');
    
    // Parse with XLSX - minimal options for speed (no formulas/styles yet)
    const workbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      cellFormula: false, // Don't parse formulas yet
      cellStyles: false,  // Don't parse styles yet
      cellNF: false,      // Don't parse number formats yet
      cellDates: false,   // Don't parse dates yet
    });
    
    console.log('[TemplateLoader] Excel parsed for metadata. Sheet names:', workbook.SheetNames);
    
    // Filter out hidden sheets
    const visibleSheetNames = workbook.SheetNames.filter((sheetName: string) => {
      let isVisible = true;
      if (workbook.Workbook && workbook.Workbook.Sheets) {
        const sheetInfo: any = workbook.Workbook.Sheets.find((s: any) => s.name === sheetName);
        if (sheetInfo) {
          isVisible = sheetInfo.state === 'visible' || sheetInfo.state === undefined;
        }
      }
      return isVisible;
    });
    
    // Extract metadata only
    const metadata: SheetMetadata[] = [];
    for (const sheetName of visibleSheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
      
      const columnWidths: { [col: number]: number } = {};
      if (worksheet['!cols']) {
        worksheet['!cols'].forEach((col: any, index: number) => {
          if (col) {
            if (col.wpx) {
              columnWidths[index] = col.wpx;
            } else if (col.wch) {
              columnWidths[index] = col.wch * 7;
            } else if (col.width) {
              columnWidths[index] = col.width * 7;
            }
          }
        });
      }
      
      metadata.push({
        name: sheetName,
        range,
        columnWidths: Object.keys(columnWidths).length > 0 ? columnWidths : undefined,
      });
    }
    
    console.log(`[TemplateLoader] Metadata extracted for ${metadata.length} sheets`);
    
    // Re-parse with full options for lazy loading (we need formulas/styles when loading individual sheets)
    const fullWorkbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      cellFormula: true,
      cellStyles: true,
      cellNF: true,
      cellDates: true,
    });
    
    return {
      metadata,
      workbook: fullWorkbook, // Store full workbook for lazy loading
      fileUrl, // Store URL for potential reload
    };
  } catch (error) {
    console.error('Error loading Excel template metadata:', error);
    throw new Error(`Failed to load Excel template metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Load a single sheet's data on demand
 */
export function loadSheetData(
  workbook: any,
  sheetName: string,
  metadata: SheetMetadata
): SheetData {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }
  
  const range = metadata.range || (worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } });
  const maxRow = range.e.r;
  const maxCol = range.e.c;
  
  console.log(`[TemplateLoader] Loading sheet "${sheetName}": ${maxRow + 1} rows x ${maxCol + 1} cols`);
  
  const data: any[][] = [];
  const formulas: { [key: string]: string } = {};
  const styles: { [key: string]: CellStyle } = {};
  
  // Build data array
  for (let row = range.s.r; row <= maxRow; row++) {
    const rowData: any[] = [];
    for (let col = range.s.c; col <= maxCol; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        if (cell.f) {
          formulas[cellAddress] = cell.f;
          rowData.push(`=${cell.f}`);
        } else {
          rowData.push(cell.v !== undefined ? cell.v : '');
        }
        
        // Extract cell styles if available
        if (cell.s) {
          const style: CellStyle = {};
          
          // Background color
          if (cell.s.fill) {
            const fill = cell.s.fill;
            if (fill.fgColor) {
              const rgb = fill.fgColor.rgb || fill.fgColor;
              if (rgb) {
                style.fill = {
                  fgColor: { rgb: typeof rgb === 'string' ? rgb : rgb.toString() }
                };
              }
            }
            if (fill.bgColor) {
              const rgb = fill.bgColor.rgb || fill.bgColor;
              if (rgb && !style.fill) {
                style.fill = {
                  bgColor: { rgb: typeof rgb === 'string' ? rgb : rgb.toString() }
                };
              }
            }
          }
          
          // Font properties
          if (cell.s.font) {
            style.font = {};
            if (cell.s.font.bold !== undefined) style.font.bold = cell.s.font.bold;
            if (cell.s.font.italic !== undefined) style.font.italic = cell.s.font.italic;
            if (cell.s.font.color) {
              const rgb = cell.s.font.color.rgb || cell.s.font.color;
              if (rgb) {
                style.font.color = { rgb: typeof rgb === 'string' ? rgb : rgb.toString() };
              }
            }
            if (cell.s.font.sz) style.font.sz = cell.s.font.sz;
            if (cell.s.font.name) style.font.name = cell.s.font.name;
          }
          
          // Borders
          if (cell.s.border) {
            style.border = {};
            if (cell.s.border.top) style.border.top = cell.s.border.top;
            if (cell.s.border.bottom) style.border.bottom = cell.s.border.bottom;
            if (cell.s.border.left) style.border.left = cell.s.border.left;
            if (cell.s.border.right) style.border.right = cell.s.border.right;
          }
          
          // Alignment
          if (cell.s.alignment) {
            style.alignment = {
              horizontal: cell.s.alignment.horizontal,
              vertical: cell.s.alignment.vertical,
              wrapText: cell.s.alignment.wrapText
            };
          }
          
          // Number format
          if (cell.s.numFmt) {
            style.numFmt = cell.s.numFmt;
          }
          
          if (Object.keys(style).length > 0) {
            styles[cellAddress] = style;
          }
        }
      } else {
        rowData.push('');
      }
    }
    data.push(rowData);
  }
  
  // Create sheet object
  const sheet: SheetData = {
    name: sheetName,
    data,
    formulas: Object.keys(formulas).length > 0 ? formulas : undefined,
    styles: Object.keys(styles).length > 0 ? styles : undefined,
    columnWidths: metadata.columnWidths,
  };
  
  // Trim trailing empty rows to optimize performance
  return trimEmptyRows(sheet);
}

/**
 * Export options for enhanced Excel export
 */
export interface ExportOptions {
  hyperFormulaEngine?: any; // HyperFormula engine instance
  cellFormats?: Map<string, Map<string, any>>; // sheetName -> cellAddress -> format
  numberFormats?: Map<string, Map<string, any>>; // sheetName -> cellAddress -> numberFormat
  columnWidths?: Map<string, { [col: number]: number }>; // sheetName -> columnWidths
}

/**
 * Convert Handsontable data back to Excel format with full preservation
 */
export function exportToExcel(
  sheets: SheetData[], 
  fileName: string = 'export.xlsx',
  options: ExportOptions = {}
): void {
  try {
    const workbook = XLSX.utils.book_new();
    
    sheets.forEach(sheet => {
      // Convert 2D array to worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      
      // Preserve formulas from HyperFormula if available
      if (options.hyperFormulaEngine) {
        try {
          const sheetIndex = sheets.findIndex(s => s.name === sheet.name);
          if (sheetIndex !== -1) {
            // Get all cells and check for formulas
            sheet.data.forEach((row, rowIndex) => {
              row.forEach((cell, colIndex) => {
                try {
                  const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
                  const formula = options.hyperFormulaEngine.getCellFormula({
                    sheet: sheetIndex,
                    row: rowIndex,
                    col: colIndex,
                  });
                  
                  if (formula) {
                    // Set formula in worksheet
                    if (!worksheet[cellAddress]) {
                      worksheet[cellAddress] = {};
                    }
                    worksheet[cellAddress].f = formula;
                    // Remove the value since formula takes precedence
                    delete worksheet[cellAddress].v;
                  }
                } catch (error) {
                  // Cell might not have a formula, continue
                }
              });
            });
          }
        } catch (error) {
          console.warn('Error extracting formulas from HyperFormula:', error);
        }
      }
      
      // Preserve formulas from SheetData if available
      if (sheet.formulas) {
        Object.entries(sheet.formulas).forEach(([cellAddress, formula]) => {
          if (!worksheet[cellAddress]) {
            worksheet[cellAddress] = {};
          }
          // Remove leading = if present (XLSX expects formula without =)
          const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula;
          worksheet[cellAddress].f = cleanFormula;
          // Remove value since formula takes precedence
          delete worksheet[cellAddress].v;
        });
      }
      
      // Preserve cell styles
      const stylesToApply: { [key: string]: CellStyle } = {};
      
      // Merge styles from SheetData
      if (sheet.styles) {
        Object.assign(stylesToApply, sheet.styles);
      }
      
      // Merge styles from cellFormats Map
      if (options.cellFormats) {
        const sheetFormats = options.cellFormats.get(sheet.name);
        if (sheetFormats) {
          sheetFormats.forEach((format, cellAddress) => {
            if (!stylesToApply[cellAddress]) {
              stylesToApply[cellAddress] = {};
            }
            
            // Convert CellFormat to CellStyle
            if (format.backgroundColor) {
              stylesToApply[cellAddress].fill = {
                fgColor: { rgb: format.backgroundColor },
              };
            }
            if (format.textColor) {
              stylesToApply[cellAddress].font = {
                ...stylesToApply[cellAddress].font,
                color: { rgb: format.textColor },
              };
            }
            if (format.bold) {
              stylesToApply[cellAddress].font = {
                ...stylesToApply[cellAddress].font,
                bold: true,
              };
            }
            if (format.italic) {
              stylesToApply[cellAddress].font = {
                ...stylesToApply[cellAddress].font,
                italic: true,
              };
            }
            if (format.underline) {
              stylesToApply[cellAddress].font = {
                ...stylesToApply[cellAddress].font,
                underline: true,
              } as any;
            }
          });
        }
      }
      
      // Apply styles to worksheet
      Object.entries(stylesToApply).forEach(([cellAddress, style]) => {
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = {};
        }
        worksheet[cellAddress].s = convertStyleToXLSX(style);
      });
      
      // Preserve number formats
      const numberFormatsToApply: { [key: string]: string } = {};
      
      // Merge number formats from SheetData
      // (SheetData doesn't have number formats stored separately, they're in styles)
      
      // Merge number formats from numberFormats Map
      if (options.numberFormats) {
        const sheetNumberFormats = options.numberFormats.get(sheet.name);
        if (sheetNumberFormats) {
          sheetNumberFormats.forEach((numberFormat, cellAddress) => {
            numberFormatsToApply[cellAddress] = convertNumberFormatToExcel(numberFormat.type);
          });
        }
      }
      
      // Apply number formats
      Object.entries(numberFormatsToApply).forEach(([cellAddress, format]) => {
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = {};
        }
        if (!worksheet[cellAddress].s) {
          worksheet[cellAddress].s = {};
        }
        worksheet[cellAddress].s.numFmt = format;
        worksheet[cellAddress].z = format; // Also set z property for number format
      });
      
      // Preserve column widths
      let columnWidths: { [col: number]: number } | undefined;
      
      // Get from SheetData first
      if (sheet.columnWidths) {
        columnWidths = sheet.columnWidths;
      }
      
      // Override with options if provided
      if (options.columnWidths) {
        const sheetColumnWidths = options.columnWidths.get(sheet.name);
        if (sheetColumnWidths) {
          columnWidths = sheetColumnWidths;
        }
      }
      
      if (columnWidths) {
        // Convert to XLSX format (!cols array)
        const maxCol = Math.max(...Object.keys(columnWidths).map(k => parseInt(k, 10)));
        const cols: any[] = [];
        for (let col = 0; col <= maxCol; col++) {
          const width = columnWidths[col];
          if (width !== undefined) {
            // XLSX expects width in characters (wch) - convert from pixels
            // Approximate: 1 character ≈ 7 pixels
            cols[col] = { wch: width / 7 };
          }
        }
        if (cols.length > 0) {
          worksheet['!cols'] = cols;
        }
      }
      
      // Add the sheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });
    
    // Write the file
    XLSX.writeFile(workbook, fileName);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw new Error(`Failed to export to Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Export workbook to Excel and return as a Blob for uploading
 */
export async function exportToExcelBlob(
  sheets: SheetData[], 
  fileName: string = 'export.xlsx',
  options: ExportOptions = {}
): Promise<Blob | null> {
  try {
    const workbook = XLSX.utils.book_new();
    
    sheets.forEach(sheet => {
      // Convert 2D array to worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      
      // Preserve formulas from SheetData if available
      if (sheet.formulas) {
        Object.entries(sheet.formulas).forEach(([cellAddress, formula]) => {
          if (!worksheet[cellAddress]) {
            worksheet[cellAddress] = {};
          }
          // Remove leading = if present (XLSX expects formula without =)
          const cleanFormula = formula.startsWith('=') ? formula.substring(1) : formula;
          worksheet[cellAddress].f = cleanFormula;
          delete worksheet[cellAddress].v;
        });
      }
      
      // Preserve column widths
      if (sheet.columnWidths) {
        const maxCol = Math.max(...Object.keys(sheet.columnWidths).map(k => parseInt(k, 10)));
        const cols: any[] = [];
        for (let col = 0; col <= maxCol; col++) {
          const width = sheet.columnWidths[col];
          if (width !== undefined) {
            cols[col] = { wch: width / 7 };
          }
        }
        if (cols.length > 0) {
          worksheet['!cols'] = cols;
        }
      }
      
      // Add the sheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    });
    
    // Write to array buffer
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    
    // Create Blob
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    return blob;
  } catch (error) {
    console.error('Error creating Excel blob:', error);
    return null;
  }
}

/**
 * Convert CellStyle to XLSX format
 */
function convertStyleToXLSX(style: CellStyle): any {
  const xlsxStyle: any = {};
  
  if (style.fill) {
    xlsxStyle.fill = {};
    if (style.fill.fgColor?.rgb) {
      xlsxStyle.fill.fgColor = { rgb: style.fill.fgColor.rgb };
    }
    if (style.fill.bgColor?.rgb) {
      xlsxStyle.fill.bgColor = { rgb: style.fill.bgColor.rgb };
    }
  }
  
  if (style.font) {
    const fontStyle: any = {};
    if (style.font.bold !== undefined) fontStyle.bold = style.font.bold;
    if (style.font.italic !== undefined) fontStyle.italic = style.font.italic;
    const fontAny = style.font as any;
    if (fontAny.underline !== undefined) {
      fontStyle.underline = fontAny.underline;
    }
    if (Object.keys(fontStyle).length > 0) {
      xlsxStyle.font = fontStyle;
    }
    if (style.font.color?.rgb) {
      xlsxStyle.font.color = { rgb: style.font.color.rgb };
    }
    if (style.font.sz) xlsxStyle.font.sz = style.font.sz;
    if (style.font.name) xlsxStyle.font.name = style.font.name;
  }
  
  if (style.border) {
    xlsxStyle.border = {};
    if (style.border.top) xlsxStyle.border.top = style.border.top;
    if (style.border.bottom) xlsxStyle.border.bottom = style.border.bottom;
    if (style.border.left) xlsxStyle.border.left = style.border.left;
    if (style.border.right) xlsxStyle.border.right = style.border.right;
  }
  
  if (style.alignment) {
    xlsxStyle.alignment = {};
    if (style.alignment.horizontal) xlsxStyle.alignment.horizontal = style.alignment.horizontal;
    if (style.alignment.vertical) xlsxStyle.alignment.vertical = style.alignment.vertical;
    if (style.alignment.wrapText !== undefined) xlsxStyle.alignment.wrapText = style.alignment.wrapText;
  }
  
  if (style.numFmt) {
    xlsxStyle.numFmt = style.numFmt;
  }
  
  return xlsxStyle;
}

/**
 * Convert number format type to Excel format code
 */
function convertNumberFormatToExcel(formatType: string): string {
  const formatMap: { [key: string]: string } = {
    'currency': '$#,##0.00',
    'percentage': '0.00%',
    'number': '#,##0.00',
    'date': 'MM/DD/YYYY',
    'time': 'HH:MM:SS',
    'integer': '#,##0',
  };
  
  return formatMap[formatType] || 'General';
}

// =============================================================================
// OPTIMIZED JSON TEMPLATE LOADING
// =============================================================================

/**
 * Sheet data from the optimized template storage (JSON format)
 */
export interface OptimizedSheetData {
  _id?: string;
  name: string;
  data: any[][];
  styles?: Record<string, CellStyle>;
  formulas?: Record<string, string>;
  columnWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
  mergedCells?: any[];
  dimensions?: { rows: number; cols: number };
  storageUrl?: string; // If data is stored separately
}

/**
 * Template definition metadata from the new system
 */
export interface TemplateDefinitionData {
  _id: string;
  name: string;
  modelType: 'appraisal' | 'operating' | 'other';
  version: number;
  description?: string;
  coreSheetIds: string[];
  dynamicGroups: Array<{
    groupId: string;
    label: string;
    sheetIds: string[];
    min: number;
    max: number;
    defaultCount: number;
    namePlaceholder: string;
  }>;
  totalSheetCount: number;
  isActive: boolean;
}

/**
 * Load sheet data from a storage URL (for large sheets)
 */
export async function loadSheetFromStorageUrl(storageUrl: string): Promise<OptimizedSheetData> {
  try {
    console.log('[TemplateLoader] Fetching sheet from storage URL');
    const response = await fetch(storageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch sheet data: ${response.status}`);
    }
    const data = await response.json();
    console.log('[TemplateLoader] Sheet data loaded from storage');
    return data;
  } catch (error) {
    console.error('[TemplateLoader] Error loading sheet from storage:', error);
    throw error;
  }
}

/**
 * Convert OptimizedSheetData to SheetData format for Handsontable
 * This ensures compatibility with existing WorkbookEditor
 */
export function convertOptimizedToSheetData(optimized: OptimizedSheetData): SheetData {
  // The formats are already compatible, just ensure required fields
  const sheet: SheetData = {
    name: optimized.name,
    data: optimized.data || [['']],
    formulas: optimized.formulas,
    styles: optimized.styles,
    columnWidths: optimized.columnWidths,
  };

  // Apply trimming for consistency
  return trimEmptyRows(sheet);
}

/**
 * Load multiple sheets from optimized storage in parallel
 * Handles both inline and storage-based sheets
 */
export async function loadOptimizedSheets(
  sheetsData: OptimizedSheetData[]
): Promise<SheetData[]> {
  console.log(`[TemplateLoader] Loading ${sheetsData.length} optimized sheets`);

  const loadPromises = sheetsData.map(async (sheetData) => {
    // If sheet has a storage URL, fetch the data
    if (sheetData.storageUrl && !sheetData.data) {
      const fullData = await loadSheetFromStorageUrl(sheetData.storageUrl);
      return convertOptimizedToSheetData({
        ...sheetData,
        ...fullData,
      });
    }
    
    // Otherwise, convert directly
    return convertOptimizedToSheetData(sheetData);
  });

  const sheets = await Promise.all(loadPromises);
  console.log(`[TemplateLoader] Loaded ${sheets.length} sheets successfully`);
  
  return sheets;
}

/**
 * Generate sheets for a dynamic template with placeholder replacement
 * This is the core function for multi-site template generation
 * 
 * @param coreSheets - Sheets that are always included (no duplication)
 * @param dynamicSheets - Sheets that should be duplicated based on count
 * @param dynamicGroups - Configuration for each dynamic group
 * @param groupCounts - How many copies of each group to create (e.g., { "site": 3 })
 */
export function generateDynamicSheets(
  coreSheets: SheetData[],
  dynamicSheets: Map<string, SheetData[]>, // groupId -> sheets
  dynamicGroups: Array<{
    groupId: string;
    label: string;
    min: number;
    max: number;
    defaultCount: number;
    namePlaceholder: string;
  }>,
  groupCounts: Record<string, number>
): SheetData[] {
  console.log('[TemplateLoader] Generating dynamic sheets...');
  
  const resultSheets: SheetData[] = [];
  
  // Add all core sheets first (unchanged)
  resultSheets.push(...coreSheets);
  console.log(`[TemplateLoader] Added ${coreSheets.length} core sheets`);
  
  // Process each dynamic group
  for (const group of dynamicGroups) {
    const count = groupCounts[group.groupId] || group.defaultCount;
    const templateSheets = dynamicSheets.get(group.groupId) || [];
    
    if (templateSheets.length === 0) {
      console.warn(`[TemplateLoader] No template sheets found for group "${group.groupId}"`);
      continue;
    }
    
    console.log(`[TemplateLoader] Generating ${count} copies of group "${group.label}" (${templateSheets.length} sheets each)`);
    
    // Generate N copies of each sheet in this group
    for (let n = 1; n <= count; n++) {
      for (const templateSheet of templateSheets) {
        const newSheet = cloneSheetWithReplacement(
          templateSheet,
          group.namePlaceholder,
          n.toString()
        );
        resultSheets.push(newSheet);
      }
    }
  }
  
  console.log(`[TemplateLoader] Generated ${resultSheets.length} total sheets`);
  return resultSheets;
}

/**
 * Clone a sheet and replace all occurrences of a placeholder
 * Used for dynamic sheet generation (e.g., Site{N} -> Site1, Site2, etc.)
 */
function cloneSheetWithReplacement(
  sheet: SheetData,
  placeholder: string,
  replacement: string
): SheetData {
  // Replace in sheet name
  const newName = sheet.name.replace(new RegExp(escapeRegExp(placeholder), 'g'), replacement);
  
  // Deep clone the data array and replace placeholders in cell values
  const newData = sheet.data.map(row =>
    row.map(cell => {
      if (typeof cell === 'string') {
        return cell.replace(new RegExp(escapeRegExp(placeholder), 'g'), replacement);
      }
      return cell;
    })
  );
  
  // Replace placeholders in formulas
  let newFormulas: { [key: string]: string } | undefined;
  if (sheet.formulas) {
    newFormulas = {};
    for (const [cellAddress, formula] of Object.entries(sheet.formulas)) {
      newFormulas[cellAddress] = formula.replace(
        new RegExp(escapeRegExp(placeholder), 'g'),
        replacement
      );
    }
  }
  
  // Styles and column widths don't need replacement (they're structural)
  return {
    name: newName,
    data: newData,
    formulas: newFormulas,
    styles: sheet.styles ? { ...sheet.styles } : undefined,
    columnWidths: sheet.columnWidths ? { ...sheet.columnWidths } : undefined,
  };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate that a template is ready for dynamic generation
 * Checks that all dynamic sheets contain the expected placeholder
 */
export function validateDynamicTemplate(
  dynamicSheets: Map<string, SheetData[]>,
  dynamicGroups: Array<{
    groupId: string;
    namePlaceholder: string;
  }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const group of dynamicGroups) {
    const sheets = dynamicSheets.get(group.groupId) || [];
    
    for (const sheet of sheets) {
      // Check if sheet name contains placeholder
      if (!sheet.name.includes(group.namePlaceholder)) {
        errors.push(
          `Sheet "${sheet.name}" in group "${group.groupId}" does not contain placeholder "${group.namePlaceholder}" in its name`
        );
      }
      
      // Optionally check formulas for placeholder (just a warning, not an error)
      // Some templates might not have cross-sheet references with placeholders
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

