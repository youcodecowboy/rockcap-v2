# Data Mapping Strategy

## Overview
This document outlines the strategy for mapping extracted data from uploaded Excel files to template cells in appraisal and operating models.

## Current State Analysis

### Existing Infrastructure

#### 1. dataMapper.ts
Located at `src/lib/dataMapper.ts`, provides:

```typescript
interface DataMappingConfig {
  [sheetName: string]: {
    [cellRef: string]: {
      source: string;  // Dot-notation path (e.g., "project.totalCost")
      type: 'string' | 'number' | 'date' | 'boolean';
      format?: string;  // Optional formatting
    };
  };
}

function populateTemplate(
  sheets: Array<{ name: string; data: any[][] }>,
  projectData: any,
  mapping: DataMappingConfig
): Array<{ name: string; data: any[][] }>
```

**Capabilities:**
- Maps data using dot-notation paths
- Type conversion (string, number, date, boolean)
- Cell reference parsing (e.g., "B5" → {row: 4, col: 1})
- Multi-sheet support

**Limitations:**
- Designed for simple object paths
- No array or complex data structure handling
- No validation or error recovery
- Static mapping configuration

#### 2. dataExtraction.ts
Located at `src/lib/dataExtraction.ts`, provides:

```typescript
interface ExtractedData {
  summary?: {
    property_name?: string;
    property_address?: string;
    total_cost?: number;
    // ... more fields
  };
  cost_breakdown?: Array<{
    category: string;
    amount: number;
    notes?: string;
  }>;
  revenue_projections?: Array<{
    year: number;
    amount: number;
    // ... more fields
  }>;
  // ... more structured data
}
```

**Capabilities:**
- Extracts structured data from Excel using AI
- Provides confidence scores
- Returns well-structured JSON

## Data Mapping Requirements

### 1. Source Data Structures

#### From Extracted Excel Files
```typescript
interface ExtractedData {
  summary: {
    property_name: string;
    property_address: string;
    total_cost: number;
    total_revenue: number;
    // ... more summary fields
  };
  
  cost_breakdown: Array<{
    category: string;
    amount: number;
    percentage?: number;
    notes?: string;
  }>;
  
  revenue_projections: Array<{
    year: number;
    revenue: number;
    expenses: number;
    net_income: number;
  }>;
  
  // Add more as needed
}
```

#### To Template Cells
Templates have specific cell locations for:
- Input values (costs, revenues, dates)
- Labels and headers
- Calculation cells (formulas - don't overwrite)

### 2. Mapping Types

#### Simple Value Mapping
```typescript
// Map single value to single cell
{
  'Sheet1': {
    'A2': {
      source: 'summary.property_name',
      type: 'string'
    },
    'B5': {
      source: 'summary.total_cost',
      type: 'number',
      format: 'currency'
    }
  }
}
```

#### Array Mapping (NEW)
```typescript
// Map array of values to cell range
{
  'Sheet1': {
    'A10:A15': {
      source: 'cost_breakdown',
      sourceKey: 'category',  // Which field to use
      type: 'string',
      direction: 'vertical'  // or 'horizontal'
    },
    'B10:B15': {
      source: 'cost_breakdown',
      sourceKey: 'amount',
      type: 'number',
      format: 'currency'
    }
  }
}
```

#### Calculated/Derived Mapping (NEW)
```typescript
// Map calculated value
{
  'Sheet1': {
    'C5': {
      source: 'cost_breakdown',
      transform: (data) => data.reduce((sum, item) => sum + item.amount, 0),
      type: 'number',
      format: 'currency'
    }
  }
}
```

## Extended Data Mapper Implementation

### Enhanced Interface

```typescript
interface CellRange {
  start: string;  // e.g., 'A10'
  end: string;    // e.g., 'A15'
}

interface MappingRule {
  // Existing fields
  source: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array';
  format?: string;
  
  // New fields for arrays
  sourceKey?: string;  // For array items, which property to use
  direction?: 'vertical' | 'horizontal';
  
  // New fields for transformations
  transform?: (data: any) => any;
  
  // New fields for validation
  validate?: (value: any) => boolean;
  required?: boolean;
  default?: any;
}

interface ExtendedDataMappingConfig {
  [sheetName: string]: {
    [cellRefOrRange: string]: MappingRule;
  };
}
```

### Key Functions to Add

#### 1. Parse Cell Range
```typescript
function parseCellRange(rangeStr: string): CellRange | null {
  const match = rangeStr.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
  if (!match) return null;
  
  return {
    start: match[1],
    end: match[2]
  };
}
```

#### 2. Expand Range to Cells
```typescript
function expandRange(range: CellRange): string[] {
  const start = cellRefToIndices(range.start);
  const end = cellRefToIndices(range.end);
  
  const cells: string[] = [];
  for (let row = start.row; row <= end.row; row++) {
    for (let col = start.col; col <= end.col; col++) {
      cells.push(XLSX.utils.encode_cell({ r: row, c: col }));
    }
  }
  
  return cells;
}
```

#### 3. Map Array Data
```typescript
function mapArrayToRange(
  arrayData: any[],
  range: CellRange,
  sourceKey: string,
  direction: 'vertical' | 'horizontal'
): Map<string, any> {
  const cellMap = new Map<string, any>();
  const start = cellRefToIndices(range.start);
  
  arrayData.forEach((item, index) => {
    const value = sourceKey ? item[sourceKey] : item;
    
    const cellRef = direction === 'vertical'
      ? XLSX.utils.encode_cell({ r: start.row + index, c: start.col })
      : XLSX.utils.encode_cell({ r: start.row, c: start.col + index });
    
    cellMap.set(cellRef, value);
  });
  
  return cellMap;
}
```

#### 4. Enhanced populateTemplate
```typescript
export function populateTemplateExtended(
  sheets: SheetData[],
  extractedData: ExtractedData,
  mapping: ExtendedDataMappingConfig
): SheetData[] {
  const populatedSheets = sheets.map(sheet => ({
    ...sheet,
    data: sheet.data.map(row => [...row])
  }));
  
  Object.entries(mapping).forEach(([sheetName, cellMappings]) => {
    const sheet = populatedSheets.find(s => s.name === sheetName);
    if (!sheet) {
      console.warn(`Sheet "${sheetName}" not found`);
      return;
    }
    
    Object.entries(cellMappings).forEach(([cellRefOrRange, rule]) => {
      try {
        // Check if it's a range
        const range = parseCellRange(cellRefOrRange);
        
        if (range && rule.type === 'array') {
          // Handle array mapping
          const arrayData = getNestedValue(extractedData, rule.source);
          if (!Array.isArray(arrayData)) {
            console.warn(`Source "${rule.source}" is not an array`);
            return;
          }
          
          const cellMap = mapArrayToRange(
            arrayData,
            range,
            rule.sourceKey || '',
            rule.direction || 'vertical'
          );
          
          cellMap.forEach((value, cellRef) => {
            const { row, col } = cellRefToIndices(cellRef);
            ensureCellExists(sheet, row, col);
            sheet.data[row][col] = formatValue(value, rule);
          });
          
        } else {
          // Handle single cell mapping
          const { row, col } = cellRefToIndices(cellRefOrRange);
          ensureCellExists(sheet, row, col);
          
          let value = getNestedValue(extractedData, rule.source);
          
          // Apply transformation if provided
          if (rule.transform) {
            value = rule.transform(value);
          }
          
          // Apply validation if provided
          if (rule.validate && !rule.validate(value)) {
            console.warn(`Validation failed for ${cellRefOrRange}`);
            value = rule.default;
          }
          
          // Use default if value is missing and required
          if ((value === undefined || value === null) && rule.required) {
            value = rule.default;
          }
          
          sheet.data[row][col] = formatValue(value, rule);
        }
      } catch (error) {
        console.error(`Error mapping ${cellRefOrRange} in ${sheetName}:`, error);
      }
    });
  });
  
  return populatedSheets;
}
```

#### 5. Utility Functions
```typescript
function ensureCellExists(sheet: SheetData, row: number, col: number): void {
  while (sheet.data.length <= row) {
    sheet.data.push([]);
  }
  while (sheet.data[row].length <= col) {
    sheet.data[row].push('');
  }
}

function formatValue(value: any, rule: MappingRule): any {
  if (value === undefined || value === null) return '';
  
  switch (rule.type) {
    case 'number':
      return typeof value === 'number' ? value : parseFloat(value);
    case 'string':
      return String(value);
    case 'date':
      return value instanceof Date ? value.toISOString() : value;
    case 'boolean':
      return Boolean(value);
    default:
      return value;
  }
}
```

## Mapping Configuration Examples

### Appraisal Model Mapping

```typescript
export const APPRAISAL_MODEL_MAPPING_EXTENDED: ExtendedDataMappingConfig = {
  'Appraisal Summary': {
    // Simple mappings
    'B2': {
      source: 'summary.property_name',
      type: 'string',
      required: true
    },
    'B3': {
      source: 'summary.property_address',
      type: 'string',
      required: true
    },
    'B4': {
      source: 'summary.total_cost',
      type: 'number',
      format: 'currency'
    },
    
    // Array mapping - cost categories
    'A10:A20': {
      source: 'cost_breakdown',
      sourceKey: 'category',
      type: 'array',
      direction: 'vertical'
    },
    'B10:B20': {
      source: 'cost_breakdown',
      sourceKey: 'amount',
      type: 'array',
      direction: 'vertical',
      format: 'currency'
    },
    
    // Calculated value
    'B21': {
      source: 'cost_breakdown',
      transform: (data) => {
        if (!Array.isArray(data)) return 0;
        return data.reduce((sum, item) => sum + (item.amount || 0), 0);
      },
      type: 'number',
      format: 'currency'
    }
  },
  
  'Revenue Projections': {
    // Year labels
    'A5:A15': {
      source: 'revenue_projections',
      sourceKey: 'year',
      type: 'array',
      direction: 'vertical'
    },
    // Revenue amounts
    'B5:B15': {
      source: 'revenue_projections',
      sourceKey: 'revenue',
      type: 'array',
      direction: 'vertical',
      format: 'currency'
    },
    // Expenses
    'C5:C15': {
      source: 'revenue_projections',
      sourceKey: 'expenses',
      type: 'array',
      direction: 'vertical',
      format: 'currency'
    }
  }
};
```

### Operating Model Mapping

```typescript
export const OPERATING_MODEL_MAPPING_EXTENDED: ExtendedDataMappingConfig = {
  'Operating Assumptions': {
    'B2': {
      source: 'summary.property_name',
      type: 'string',
      required: true
    },
    'B5': {
      source: 'operating.occupancy_rate',
      type: 'number',
      format: 'percentage',
      validate: (val) => val >= 0 && val <= 1,
      default: 0.95
    },
    // ... more mappings
  }
};
```

## Data Validation Strategy

### Pre-Mapping Validation

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validateExtractedData(
  data: ExtractedData,
  mapping: ExtendedDataMappingConfig
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };
  
  // Check required fields
  // Check data types
  // Check value ranges
  // Check array lengths
  
  return result;
}
```

### Post-Mapping Verification

```typescript
function verifyMappedData(
  sheets: SheetData[],
  mapping: ExtendedDataMappingConfig
): ValidationResult {
  // Verify all expected cells are populated
  // Check for overwritten formulas (error)
  // Check for empty required cells
  
  return result;
}
```

## Error Handling

### Strategies

1. **Graceful Degradation**: Use defaults for missing data
2. **User Notification**: Show mapping errors in UI
3. **Partial Success**: Continue mapping even if some cells fail
4. **Logging**: Detailed console logs for debugging

### Error Types

- `MissingDataError`: Required source data not found
- `TypeMismatchError`: Data type doesn't match expected
- `RangeOverflowError`: Array data exceeds cell range
- `FormulaOverwriteError`: Attempted to overwrite formula cell

## UI for Mapping Management

### Features Needed

1. **Mapping Configuration UI**
   - Visual cell selector
   - Data source dropdown
   - Type and format selection
   - Preview before applying

2. **Mapping Templates**
   - Save mapping configurations
   - Load predefined mappings
   - Share mappings between projects

3. **Import Preview**
   - Show before/after comparison
   - Highlight mapped cells
   - Show validation errors/warnings

4. **Manual Adjustment**
   - Allow users to adjust mappings
   - Override individual cells
   - Add custom transformations

## Integration with Existing Workflow

### Updated Flow

1. User uploads Excel file → Extract data
2. User clicks "Run Appraisal Model" → Load template
3. **NEW**: Auto-populate template with extracted data using mapping
4. User reviews and adjusts data in WorkbookEditor
5. Formulas automatically calculate
6. User saves version with inputs and outputs

### Code Integration Points

**In `modeling/page.tsx`:**
```typescript
const handleRunAppraisalModel = async () => {
  // Load template
  const workbook = await loadExcelTemplate(templateUrl);
  
  // NEW: Apply data mapping if extracted data exists
  if (effectiveExtractedData) {
    const mappedWorkbook = populateTemplateExtended(
      workbook.sheets,
      effectiveExtractedData,
      APPRAISAL_MODEL_MAPPING_EXTENDED
    );
    setTemplateSheets(mappedWorkbook);
  } else {
    setTemplateSheets(workbook.sheets);
  }
};
```

## Performance Considerations

- **Lazy Mapping**: Only map visible sheets initially
- **Batch Updates**: Group cell updates for efficiency
- **Caching**: Cache mapping configurations
- **Validation**: Validate once before mapping, not per-cell

## Testing Strategy

1. **Unit Tests**: Test mapping functions individually
2. **Integration Tests**: Test full mapping workflow
3. **Edge Cases**: Empty data, malformed data, large arrays
4. **Performance Tests**: Large datasets, complex mappings

## Future Enhancements

1. **Smart Mapping**: AI-assisted mapping suggestions
2. **Conditional Mapping**: Map based on data conditions
3. **Multi-Source**: Combine data from multiple sources
4. **Mapping History**: Track and revert mapping changes
5. **Template Versioning**: Handle template structure changes

## References

- Existing `dataMapper.ts`
- Existing `dataExtraction.ts`
- XLSX.js documentation
- Handsontable data loading patterns

