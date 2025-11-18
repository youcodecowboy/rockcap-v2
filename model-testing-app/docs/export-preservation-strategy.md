# Export Preservation Strategy

## Overview
This document outlines the strategy for exporting Handsontable data to Excel while preserving formulas, styles, formatting, and structure.

## Current State Analysis

### Existing Export Implementation

Located in `src/lib/templateLoader.ts`:

```typescript
export function exportToExcel(sheets: SheetData[], fileName: string = 'export.xlsx'): void {
  try {
    const workbook = XLSX.utils.book_new();
    
    sheets.forEach(sheet => {
      // Convert 2D array to worksheet
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      
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
```

### Current Limitations

1. **Formulas NOT Preserved**: Uses `aoa_to_sheet` which only converts values
2. **Styles NOT Preserved**: No cell styling information exported
3. **Formatting NOT Preserved**: No number formats, colors, fonts exported
4. **Column Widths NOT Preserved**: Defaults to Excel's auto-width
5. **Row Heights NOT Preserved**: No height information
6. **Merged Cells NOT Preserved**: No merge information
7. **User Formatting NOT Preserved**: Formatting from FormattingToolbar lost

## XLSX.js (SheetJS) Capabilities

### Core Concepts

#### 1. Cell Objects
```typescript
interface CellObject {
  // Cell value
  v: any;  // Raw value
  w?: string;  // Formatted text
  t: 'n' | 's' | 'b' | 'd' | 'e';  // Type: number, string, boolean, date, error
  
  // Formula
  f?: string;  // Formula (without leading =)
  F?: string;  // Formula range (for array formulas)
  
  // Style
  s?: CellStyle;  // Cell style object
  
  // Number format
  z?: string;  // Number format string
}
```

#### 2. Cell Style Object
```typescript
interface CellStyle {
  // Fill (background color)
  fill?: {
    patternType?: 'solid' | 'none';
    fgColor?: { rgb: string };  // e.g., 'FFFF0000' for red
    bgColor?: { rgb: string };
  };
  
  // Font
  font?: {
    name?: string;  // e.g., 'Calibri'
    sz?: number;  // Size in points
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: { rgb: string };
  };
  
  // Border
  border?: {
    top?: { style: string; color: { rgb: string } };
    bottom?: { style: string; color: { rgb: string } };
    left?: { style: string; color: { rgb: string } };
    right?: { style: string; color: { rgb: string } };
  };
  
  // Alignment
  alignment?: {
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'center' | 'bottom';
    wrapText?: boolean;
  };
  
  // Number format
  numFmt?: string;
}
```

#### 3. Worksheet Properties
```typescript
interface Worksheet {
  // Cell data
  [cellAddress: string]: CellObject;  // e.g., 'A1', 'B2'
  
  // Range
  '!ref': string;  // e.g., 'A1:Z100'
  
  // Column widths
  '!cols'?: Array<{ wch: number }>;  // Width in characters
  
  // Row heights
  '!rows'?: Array<{ hpt: number }>;  // Height in points
  
  // Merged cells
  '!merges'?: Array<{ s: CellAddress; e: CellAddress }>;
  
  // Protection
  '!protect'?: WorksheetProtection;
}
```

## Enhanced Export Strategy

### Step 1: Preserve Formulas

#### Current Issue
Using `aoa_to_sheet` converts data to values only.

#### Solution
Build worksheet manually, preserving formula strings:

```typescript
function buildWorksheetWithFormulas(
  sheetData: SheetData
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  
  const range = {
    s: { r: 0, c: 0 },
    e: { r: sheetData.data.length - 1, c: 0 }
  };
  
  // Find max columns
  sheetData.data.forEach(row => {
    if (row.length - 1 > range.e.c) {
      range.e.c = row.length - 1;
    }
  });
  
  // Set range
  ws['!ref'] = XLSX.utils.encode_range(range);
  
  // Populate cells
  sheetData.data.forEach((row, r) => {
    row.forEach((cellValue, c) => {
      const cellAddress = XLSX.utils.encode_cell({ r, c });
      const cell: XLSX.CellObject = {};
      
      // Check if it's a formula
      if (typeof cellValue === 'string' && cellValue.startsWith('=')) {
        cell.f = cellValue.substring(1);  // Remove leading =
        cell.t = 'n';  // Assume numeric result
        // Note: v (value) will be calculated by Excel on open
      } else {
        // Regular value
        if (typeof cellValue === 'number') {
          cell.v = cellValue;
          cell.t = 'n';
        } else if (typeof cellValue === 'boolean') {
          cell.v = cellValue;
          cell.t = 'b';
        } else if (cellValue instanceof Date) {
          cell.v = cellValue;
          cell.t = 'd';
        } else {
          cell.v = cellValue !== null && cellValue !== undefined ? String(cellValue) : '';
          cell.t = 's';
        }
      }
      
      ws[cellAddress] = cell;
    });
  });
  
  return ws;
}
```

### Step 2: Preserve Loaded Styles

Styles are already loaded in `templateLoader.ts`:

```typescript
interface SheetData {
  name: string;
  data: any[][];
  formulas?: { [key: string]: string };
  styles?: { [key: string]: CellStyle };  // Already loaded!
  columnWidths?: { [col: number]: number };
}
```

Map these styles back to XLSX format:

```typescript
function applyLoadedStyles(
  ws: XLSX.WorkSheet,
  sheetData: SheetData
): void {
  if (!sheetData.styles) return;
  
  Object.entries(sheetData.styles).forEach(([cellAddress, style]) => {
    const cell = ws[cellAddress];
    if (!cell) return;
    
    // Map our CellStyle to XLSX CellStyle
    cell.s = convertToXLSXStyle(style);
  });
}

function convertToXLSXStyle(style: CellStyle): XLSX.CellStyle {
  const xlsxStyle: XLSX.CellStyle = {};
  
  // Fill (background)
  if (style.fill?.fgColor) {
    xlsxStyle.fill = {
      patternType: 'solid',
      fgColor: { rgb: style.fill.fgColor }
    };
  }
  
  // Font
  if (style.font) {
    xlsxStyle.font = {
      name: style.font.name,
      sz: style.font.sz,
      bold: style.font.bold,
      italic: style.font.italic,
      underline: style.font.underline,
      color: style.font.color ? { rgb: style.font.color } : undefined
    };
  }
  
  // Border
  if (style.border) {
    xlsxStyle.border = {
      top: style.border.top,
      bottom: style.border.bottom,
      left: style.border.left,
      right: style.border.right
    };
  }
  
  // Alignment
  if (style.alignment) {
    xlsxStyle.alignment = {
      horizontal: style.alignment.horizontal,
      vertical: style.alignment.vertical,
      wrapText: style.alignment.wrapText
    };
  }
  
  // Number format
  if (style.numFmt) {
    xlsxStyle.numFmt = style.numFmt;
  }
  
  return xlsxStyle;
}
```

### Step 3: Preserve User-Applied Formatting

User formatting from FormattingToolbar needs to be tracked:

```typescript
// In WorkbookEditor.tsx and ExcelDataEditor.tsx
const [cellFormats, setCellFormats] = useState<Map<string, Map<string, CellFormat>>>(new Map());

interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  backgroundColor?: string;
}
```

Convert to XLSX format on export:

```typescript
function applyUserFormatting(
  ws: XLSX.WorkSheet,
  cellFormats: Map<string, CellFormat>,
  sheetName: string
): void {
  cellFormats.forEach((format, cellAddress) => {
    const cell = ws[cellAddress];
    if (!cell) return;
    
    // Initialize style if not exists
    if (!cell.s) cell.s = {};
    
    // Apply user formatting
    if (format.bold || format.italic || format.underline || format.textColor) {
      if (!cell.s.font) cell.s.font = {};
      
      if (format.bold) cell.s.font.bold = true;
      if (format.italic) cell.s.font.italic = true;
      if (format.underline) cell.s.font.underline = true;
      if (format.textColor) {
        cell.s.font.color = { rgb: format.textColor.replace('#', '') };
      }
    }
    
    if (format.backgroundColor) {
      cell.s.fill = {
        patternType: 'solid',
        fgColor: { rgb: format.backgroundColor.replace('#', '') }
      };
    }
  });
}
```

### Step 4: Preserve Column Widths and Row Heights

```typescript
function applyColumnWidths(
  ws: XLSX.WorkSheet,
  columnWidths?: { [col: number]: number }
): void {
  if (!columnWidths) return;
  
  const cols: Array<{ wch: number }> = [];
  const maxCol = Math.max(...Object.keys(columnWidths).map(Number));
  
  for (let i = 0; i <= maxCol; i++) {
    const width = columnWidths[i];
    cols.push({ wch: width ? width / 7 : 10 });  // Convert pixels to characters (approx)
  }
  
  ws['!cols'] = cols;
}
```

### Step 5: Complete Enhanced Export Function

```typescript
export function exportToExcelEnhanced(
  sheets: SheetData[],
  userFormats: Map<string, Map<string, CellFormat>>,  // sheetName -> cellAddress -> format
  fileName: string = 'export.xlsx'
): void {
  try {
    const workbook = XLSX.utils.book_new();
    
    // Enable cellFormula mode
    workbook.Workbook = {
      Views: [{ RTL: false }]
    };
    
    sheets.forEach(sheet => {
      // Step 1: Build worksheet with formulas
      const ws = buildWorksheetWithFormulas(sheet);
      
      // Step 2: Apply loaded styles from original Excel
      if (sheet.styles) {
        applyLoadedStyles(ws, sheet);
      }
      
      // Step 3: Apply user formatting from toolbar
      const sheetFormats = userFormats.get(sheet.name);
      if (sheetFormats) {
        applyUserFormatting(ws, sheetFormats, sheet.name);
      }
      
      // Step 4: Apply column widths
      if (sheet.columnWidths) {
        applyColumnWidths(ws, sheet.columnWidths);
      }
      
      // Step 5: Apply any merged cells (if tracked)
      // TODO: Track merged cells from Handsontable
      
      // Add sheet to workbook
      XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
    });
    
    // Write file with cellFormula support
    XLSX.writeFile(workbook, fileName, {
      cellStyles: true,  // Enable style export
      bookSST: false,
      type: 'binary'
    });
    
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw new Error(`Failed to export to Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
```

## Integration with Components

### WorkbookEditor.tsx Changes

```typescript
const handleExport = () => {
  // Collect all sheet data with current edits
  const currentSheets: SheetData[] = sheets.map(sheet => {
    const hotRef = hotTableRefs.current.get(sheet.name);
    return {
      ...sheet,
      data: hotRef?.hotInstance?.getData() || sheet.data
    };
  });
  
  // Export with user formatting
  exportToExcelEnhanced(
    currentSheets,
    cellFormats,  // User-applied formatting
    `${activeSheet}-${new Date().toISOString().split('T')[0]}.xlsx`
  );
};
```

### ExcelDataEditor.tsx Changes

```typescript
const exportToExcel = () => {
  const instance = hotTableRef.current?.hotInstance;
  if (!instance) return;
  
  const currentData = instance.getData();
  
  const sheetData: SheetData = {
    name: 'Sheet1',
    data: currentData,
    // Include any loaded styles if available
    styles: {},  // TODO: Track from initial load
    columnWidths: {}  // TODO: Get from Handsontable
  };
  
  const formats = new Map<string, Map<string, CellFormat>>();
  formats.set('Sheet1', cellFormats);
  
  exportToExcelEnhanced(
    [sheetData],
    formats,
    `model-data-${new Date().toISOString().split('T')[0]}.xlsx`
  );
};
```

## Number Format Preservation

### Common Number Formats

```typescript
const NUMBER_FORMATS = {
  general: 'General',
  number: '0.00',
  currency: '$#,##0.00',
  accounting: '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)',
  percentage: '0.00%',
  fraction: '# ?/?',
  scientific: '0.00E+00',
  date: 'm/d/yyyy',
  time: 'h:mm:ss AM/PM',
  datetime: 'm/d/yyyy h:mm',
  text: '@',
  custom: ''  // User-defined
};
```

### Apply Number Format

```typescript
function applyNumberFormat(
  cell: XLSX.CellObject,
  format: string
): void {
  if (!cell.s) cell.s = {};
  cell.s.numFmt = format;
  cell.z = format;  // Alternative format property
}
```

## Handling HyperFormula

### Extract Formulas from HyperFormula Engine

```typescript
function extractFormulasFromEngine(
  engine: HyperFormula,
  sheetName: string,
  sheetIndex: number
): Map<string, string> {
  const formulas = new Map<string, string>();
  
  // Get sheet dimensions
  const sheetSize = engine.getSheetDimensions(sheetIndex);
  
  for (let row = 0; row < sheetSize.height; row++) {
    for (let col = 0; col < sheetSize.width; col++) {
      const cellAddress = { sheet: sheetIndex, row, col };
      
      // Check if cell has formula
      if (engine.doesCellHaveFormula(cellAddress)) {
        const formula = engine.getCellFormula(cellAddress);
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        
        if (formula) {
          formulas.set(cellRef, formula);
        }
      }
    }
  }
  
  return formulas;
}
```

### Apply Formulas to Worksheet

```typescript
function applyFormulasToWorksheet(
  ws: XLSX.WorkSheet,
  formulas: Map<string, string>
): void {
  formulas.forEach((formula, cellAddress) => {
    const cell = ws[cellAddress];
    if (!cell) {
      // Create cell if doesn't exist
      ws[cellAddress] = {
        f: formula,
        t: 'n'
      };
    } else {
      // Add formula to existing cell
      cell.f = formula;
    }
  });
}
```

## Validation and Testing

### Pre-Export Validation

```typescript
function validateExportData(sheets: SheetData[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  sheets.forEach(sheet => {
    // Check for empty sheets
    if (!sheet.data || sheet.data.length === 0) {
      warnings.push(`Sheet "${sheet.name}" is empty`);
    }
    
    // Check for formula syntax errors
    sheet.data.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (typeof cell === 'string' && cell.startsWith('=')) {
          // Basic formula validation
          if (cell.length === 1) {
            errors.push(`Invalid formula at ${XLSX.utils.encode_cell({ r, c })}`);
          }
        }
      });
    });
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

### Post-Export Verification

1. **Open in Excel**: Verify formulas calculate correctly
2. **Check Styles**: Verify colors, fonts, borders appear
3. **Check Formats**: Verify currency, percentages, dates format correctly
4. **Check Widths**: Verify columns are appropriate width
5. **Check Cross-References**: Verify sheet references work

## Performance Considerations

### Large Workbooks

- **Streaming**: For very large files, use streaming write
- **Compression**: Enable ZIP compression for XLSX
- **Memory**: Monitor memory usage for large exports
- **Progress**: Show progress indicator for slow exports

```typescript
function exportToExcelEnhancedWithProgress(
  sheets: SheetData[],
  userFormats: Map<string, Map<string, CellFormat>>,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const totalSheets = sheets.length;
      const workbook = XLSX.utils.book_new();
      
      sheets.forEach((sheet, index) => {
        // Build worksheet
        const ws = buildWorksheetWithFormulas(sheet);
        applyLoadedStyles(ws, sheet);
        // ... other processing
        
        XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
        
        // Report progress
        if (onProgress) {
          onProgress(((index + 1) / totalSheets) * 100);
        }
      });
      
      XLSX.writeFile(workbook, fileName, { cellStyles: true });
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}
```

## Error Handling

### Common Export Errors

1. **Invalid Sheet Names**: Contains invalid characters
2. **Formula Errors**: Malformed formulas
3. **File System Errors**: Permission denied, disk full
4. **Memory Errors**: File too large

### Error Recovery

```typescript
try {
  exportToExcelEnhanced(sheets, formats, fileName);
} catch (error) {
  if (error.message.includes('Invalid sheet name')) {
    // Sanitize sheet names and retry
    const sanitizedSheets = sheets.map(s => ({
      ...s,
      name: sanitizeSheetName(s.name)
    }));
    exportToExcelEnhanced(sanitizedSheets, formats, fileName);
  } else {
    // Show user-friendly error
    alert(`Failed to export: ${error.message}`);
  }
}
```

## Future Enhancements

1. **Export Templates**: Save export configurations
2. **Selective Export**: Export only specific sheets/ranges
3. **Format Presets**: Quick apply common formatting
4. **Export History**: Track exported versions
5. **Cloud Export**: Export directly to cloud storage
6. **PDF Export**: Convert to PDF via Excel API

## References

- [SheetJS Documentation](https://docs.sheetjs.com/)
- [XLSX Cell Styles](https://docs.sheetjs.com/docs/csf/cell#cell-styles)
- [XLSX Formula Support](https://docs.sheetjs.com/docs/csf/cell#data-types)
- [Handsontable Export Plugin](https://handsontable.com/docs/javascript-data-grid/export-to-csv/)
- Current implementation: `src/lib/templateLoader.ts`

