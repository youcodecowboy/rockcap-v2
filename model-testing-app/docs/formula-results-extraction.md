# Formula Result Extraction

## Overview
This document outlines the strategy for extracting calculated results from HyperFormula and storing them in the database for version tracking and comparison.

## HyperFormula API Overview

### Core Concepts

**HyperFormula Engine**: Calculation engine that manages formulas across sheets

**Sheet Indexes**: Sheets are referenced by index (0, 1, 2, ...) and optionally by name

**Cell Addresses**: Cells referenced as `{ sheet: number, row: number, col: number }`

### Key API Methods

#### 1. getCellValue()
Get the calculated value of a cell:

```typescript
getCellValue(cellAddress: SimpleCellAddress): CellValue

interface SimpleCellAddress {
  sheet: number;
  row: number;
  col: number;
}

type CellValue = number | string | boolean | null | DetailedCellError
```

**Use Case**: Get computed result of a formula cell

**Example**:
```typescript
const value = engine.getCellValue({ sheet: 0, row: 10, col: 5 });
// Returns: 125000 (calculated from =SUM(B5:B10))
```

#### 2. getCellFormula()
Get the formula string of a cell:

```typescript
getCellFormula(cellAddress: SimpleCellAddress): string | undefined
```

**Use Case**: Determine if a cell contains a formula

**Example**:
```typescript
const formula = engine.getCellFormula({ sheet: 0, row: 10, col: 5 });
// Returns: "SUM(B5:B10)" (without leading =)
```

#### 3. doesCellHaveFormula()
Check if a cell contains a formula:

```typescript
doesCellHaveFormula(cellAddress: SimpleCellAddress): boolean
```

**Use Case**: Filter cells to only process formula cells

#### 4. getSheetValues()
Get all values from a sheet at once:

```typescript
getSheetValues(sheetId: number): CellValue[][]
```

**Use Case**: Bulk extraction of all calculated values

**Example**:
```typescript
const allValues = engine.getSheetValues(0);
// Returns: [[val1, val2, ...], [val3, val4, ...], ...]
```

#### 5. getSheetDimensions()
Get the size of a sheet:

```typescript
getSheetDimensions(sheetId: number): { width: number; height: number }
```

**Use Case**: Determine iteration bounds

#### 6. getCellSerialized()
Get complete cell information:

```typescript
getCellSerialized(cellAddress: SimpleCellAddress): {
  value: CellValue;
  formula?: string;
  // ... other metadata
}
```

### Error Handling

#### Cell Errors
```typescript
enum ErrorType {
  DIV_BY_ZERO = '#DIV/0!',
  ERROR = '#ERROR!',
  NA = '#N/A',
  NAME = '#NAME?',
  NULL = '#NULL!',
  NUM = '#NUM!',
  REF = '#REF!',
  VALUE = '#VALUE!'
}

interface DetailedCellError {
  type: ErrorType;
  message?: string;
}
```

**Handling**:
```typescript
const value = engine.getCellValue(cellAddress);

if (value !== null && typeof value === 'object' && 'type' in value) {
  // It's an error
  console.warn(`Cell error: ${value.type} - ${value.message}`);
  return null;
}
```

## Extraction Strategy

### Goals

1. **Extract Calculated Results**: Get all formula outputs after calculation
2. **Separate Inputs from Outputs**: Identify which cells are inputs vs calculated
3. **Store in Database**: Save to `modelRuns.outputs`
4. **Enable Comparison**: Allow version-to-version comparison
5. **Performance**: Extract efficiently for large sheets

### Cell Classification

#### Input Cells
- User-entered values (numbers, text, dates)
- Loaded from extracted data via mapping
- No formulas

#### Formula Cells
- Contain formulas (start with =)
- Calculate based on inputs and other formulas
- These are our **outputs**

#### Mixed Cells
- May contain either input or formula depending on user action
- Track changes to determine type

### Data Structure for Storage

```typescript
// In modelRuns table
interface ModelRun {
  scenarioId: Id<"scenarios">;
  modelType: 'appraisal' | 'operating' | 'other';
  version: number;
  versionName?: string;
  
  // Input data (what user entered or was mapped)
  inputs: ModelInputs;
  
  // Calculated results (formula outputs)
  outputs: ModelOutputs;
  
  status: 'pending' | 'running' | 'completed' | 'error';
  runAt: string;
  metadata?: any;
}

interface ModelInputs {
  sheets: {
    [sheetName: string]: {
      cells: {
        [cellAddress: string]: {
          value: any;
          type: 'string' | 'number' | 'date' | 'boolean';
        };
      };
    };
  };
}

interface ModelOutputs {
  sheets: {
    [sheetName: string]: {
      formulas: {
        [cellAddress: string]: {
          formula: string;  // The formula itself
          value: any;  // Calculated result
          error?: string;  // If formula has error
        };
      };
      summary?: {
        // Key metrics for quick access
        totalCost?: number;
        totalRevenue?: number;
        netIncome?: number;
        roi?: number;
        // ... other key metrics
      };
    };
  };
  timestamp: string;  // When calculations were run
}
```

### Extraction Implementation

#### 1. Extract All Formula Results

```typescript
function extractFormulaResults(
  engine: HyperFormula,
  sheetName: string,
  sheetIndex: number
): Record<string, FormulaResult> {
  const results: Record<string, FormulaResult> = {};
  
  // Get sheet dimensions
  const dimensions = engine.getSheetDimensions(sheetIndex);
  
  // Iterate through all cells
  for (let row = 0; row < dimensions.height; row++) {
    for (let col = 0; col < dimensions.width; col++) {
      const cellAddress = { sheet: sheetIndex, row, col };
      
      // Check if cell has formula
      if (engine.doesCellHaveFormula(cellAddress)) {
        const formula = engine.getCellFormula(cellAddress);
        const value = engine.getCellValue(cellAddress);
        
        const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
        
        results[cellRef] = {
          formula: formula || '',
          value: serializeCellValue(value),
          error: isErrorValue(value) ? String(value) : undefined
        };
      }
    }
  }
  
  return results;
}

interface FormulaResult {
  formula: string;
  value: any;
  error?: string;
}

function serializeCellValue(value: CellValue): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'type' in value) {
    // It's an error
    return null;
  }
  return value;
}

function isErrorValue(value: CellValue): boolean {
  return value !== null && typeof value === 'object' && 'type' in value;
}
```

#### 2. Extract Input Values

```typescript
function extractInputValues(
  sheets: SheetData[]
): Record<string, Record<string, InputValue>> {
  const inputs: Record<string, Record<string, InputValue>> = {};
  
  sheets.forEach(sheet => {
    inputs[sheet.name] = {};
    
    sheet.data.forEach((row, r) => {
      row.forEach((cell, c) => {
        // Skip formula cells
        if (typeof cell === 'string' && cell.startsWith('=')) {
          return;
        }
        
        // Only store non-empty input cells
        if (cell !== null && cell !== undefined && cell !== '') {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          
          inputs[sheet.name][cellRef] = {
            value: cell,
            type: typeof cell
          };
        }
      });
    });
  });
  
  return inputs;
}

interface InputValue {
  value: any;
  type: string;
}
```

#### 3. Extract Key Metrics (Summary)

```typescript
function extractKeyMetrics(
  engine: HyperFormula,
  sheetName: string,
  sheetIndex: number,
  metricCells: Record<string, string>  // metric name -> cell address
): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};
  
  Object.entries(metricCells).forEach(([metricName, cellAddress]) => {
    const { row, col } = XLSX.utils.decode_cell(cellAddress);
    const value = engine.getCellValue({ sheet: sheetIndex, row, col });
    
    metrics[metricName] = typeof value === 'number' ? value : null;
  });
  
  return metrics;
}

// Example configuration for appraisal model
const APPRAISAL_KEY_METRICS = {
  'Appraisal Summary': {
    totalCost: 'B21',
    totalRevenue: 'B35',
    netIncome: 'B40',
    roi: 'B41'
  }
};
```

#### 4. Complete Extraction Function

```typescript
export function extractModelResults(
  engine: HyperFormula | null,
  sheets: SheetData[],
  sheetNameToIndex: Map<string, number>,
  keyMetrics?: Record<string, Record<string, string>>
): { inputs: ModelInputs; outputs: ModelOutputs } {
  if (!engine) {
    throw new Error('HyperFormula engine not available');
  }
  
  const inputs: ModelInputs = {
    sheets: {}
  };
  
  const outputs: ModelOutputs = {
    sheets: {},
    timestamp: new Date().toISOString()
  };
  
  // Extract inputs
  const inputValues = extractInputValues(sheets);
  Object.entries(inputValues).forEach(([sheetName, cells]) => {
    inputs.sheets[sheetName] = { cells };
  });
  
  // Extract outputs (formulas)
  sheets.forEach(sheet => {
    const sheetIndex = sheetNameToIndex.get(sheet.name);
    if (sheetIndex === undefined) return;
    
    const formulas = extractFormulaResults(engine, sheet.name, sheetIndex);
    
    outputs.sheets[sheet.name] = {
      formulas
    };
    
    // Extract key metrics if configured
    if (keyMetrics && keyMetrics[sheet.name]) {
      outputs.sheets[sheet.name].summary = extractKeyMetrics(
        engine,
        sheet.name,
        sheetIndex,
        keyMetrics[sheet.name]
      );
    }
  });
  
  return { inputs, outputs };
}
```

## Integration with Save Flow

### In WorkbookEditor.tsx

Add method to extract results:

```typescript
const extractCurrentResults = useCallback((): { inputs: ModelInputs; outputs: ModelOutputs } | null => {
  if (!hyperFormulaEngine.current) return null;
  
  // Build sheet name to index map
  const sheetNameToIndex = new Map<string, number>();
  sheets.forEach((sheet, index) => {
    sheetNameToIndex.set(sheet.name, index);
  });
  
  // Get current data from all sheets
  const currentSheets: SheetData[] = sheets.map(sheet => {
    const hotRef = hotTableRefs.current.get(sheet.name);
    return {
      ...sheet,
      data: hotRef?.hotInstance?.getData() || sheet.data
    };
  });
  
  // Extract results
  return extractModelResults(
    hyperFormulaEngine.current,
    currentSheets,
    sheetNameToIndex,
    APPRAISAL_KEY_METRICS  // Pass metrics config
  );
}, [sheets]);
```

Expose to parent:

```typescript
interface WorkbookEditorProps {
  sheets: SheetData[];
  onDataChange?: (sheetName: string, data: any[][]) => void;
  readOnly?: boolean;
  activeSheet?: string;
  hideTabs?: boolean;
  onExtractResults?: () => { inputs: ModelInputs; outputs: ModelOutputs } | null;  // NEW
}

// In component
useEffect(() => {
  if (onExtractResults) {
    // Provide extraction function to parent
    onExtractResults.current = extractCurrentResults;
  }
}, [onExtractResults, extractCurrentResults]);
```

### In modeling/page.tsx

Handle save with results:

```typescript
const workbookExtractRef = useRef<(() => { inputs: ModelInputs; outputs: ModelOutputs } | null) | null>(null);

const handleSaveVersion = async (versionData: { 
  modelType: string; 
  version: number; 
  versionName?: string;
}) => {
  if (!selectedScenarioId) return;
  
  // Extract results
  const results = workbookExtractRef.current?.();
  
  if (!results) {
    alert('Failed to extract model results');
    return;
  }
  
  try {
    await saveVersion({
      scenarioId: selectedScenarioId,
      modelType: versionData.modelType,
      version: versionData.version,
      versionName: versionData.versionName,
      inputs: results.inputs,
      outputs: results.outputs,
      runBy: 'current-user'  // TODO: Get from auth
    });
    
    alert('Version saved successfully');
  } catch (error) {
    console.error('Failed to save version:', error);
    alert('Failed to save version');
  }
};

// Pass to WorkbookEditor
<WorkbookEditor
  sheets={templateSheets}
  onDataChange={handleWorkbookDataChange}
  onExtractResults={workbookExtractRef}
/>
```

## Displaying Results

### ModelOutputSummary Component Enhancement

```typescript
interface ModelOutputSummaryProps {
  scenarioName?: string;
  modelType: string;
  version?: number;
  versionName?: string;
  outputs?: ModelOutputs;  // NEW: Pass the outputs
}

export function ModelOutputSummary({ 
  scenarioName, 
  modelType, 
  version, 
  versionName,
  outputs 
}: ModelOutputSummaryProps) {
  if (!outputs) {
    return <div>No results available</div>;
  }
  
  // Display key metrics
  const summaries = Object.entries(outputs.sheets).map(([sheetName, sheetData]) => {
    if (!sheetData.summary) return null;
    
    return (
      <div key={sheetName} className="sheet-summary">
        <h3>{sheetName}</h3>
        <div className="metrics">
          {Object.entries(sheetData.summary).map(([metric, value]) => (
            <div key={metric} className="metric">
              <span className="metric-name">{formatMetricName(metric)}</span>
              <span className="metric-value">{formatMetricValue(value, metric)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  });
  
  return (
    <div className="model-output-summary">
      <h2>Model Results</h2>
      <div className="version-info">
        <span>Version {version}</span>
        {versionName && <span> - {versionName}</span>}
      </div>
      {summaries}
    </div>
  );
}
```

## Version Comparison

### Compare Two Versions

```typescript
interface ComparisonResult {
  metric: string;
  version1Value: number | null;
  version2Value: number | null;
  difference: number | null;
  percentChange: number | null;
}

function compareVersions(
  outputs1: ModelOutputs,
  outputs2: ModelOutputs
): Record<string, ComparisonResult[]> {
  const comparisons: Record<string, ComparisonResult[]> = {};
  
  // Compare each sheet
  Object.keys(outputs1.sheets).forEach(sheetName => {
    if (!outputs2.sheets[sheetName]) return;
    
    const summary1 = outputs1.sheets[sheetName].summary;
    const summary2 = outputs2.sheets[sheetName].summary;
    
    if (!summary1 || !summary2) return;
    
    const sheetComparisons: ComparisonResult[] = [];
    
    Object.keys(summary1).forEach(metric => {
      const val1 = summary1[metric];
      const val2 = summary2[metric];
      
      if (val1 === null || val2 === null) return;
      
      const difference = val2 - val1;
      const percentChange = val1 !== 0 ? (difference / val1) * 100 : null;
      
      sheetComparisons.push({
        metric,
        version1Value: val1,
        version2Value: val2,
        difference,
        percentChange
      });
    });
    
    comparisons[sheetName] = sheetComparisons;
  });
  
  return comparisons;
}
```

## Performance Optimization

### Strategies

1. **Lazy Extraction**: Only extract when saving, not on every change
2. **Selective Extraction**: Only extract changed sheets
3. **Caching**: Cache last extraction result
4. **Batch Processing**: Extract multiple cells in batches
5. **Worker Threads**: Use web workers for large extractions

### Optimized Extraction

```typescript
function extractFormulaResultsOptimized(
  engine: HyperFormula,
  sheetIndex: number,
  cellsOfInterest?: Set<string>  // Only extract these cells
): Record<string, FormulaResult> {
  const results: Record<string, FormulaResult> = {};
  
  if (cellsOfInterest) {
    // Extract only specific cells
    cellsOfInterest.forEach(cellRef => {
      const { row, col } = XLSX.utils.decode_cell(cellRef);
      const cellAddress = { sheet: sheetIndex, row, col };
      
      if (engine.doesCellHaveFormula(cellAddress)) {
        const formula = engine.getCellFormula(cellAddress);
        const value = engine.getCellValue(cellAddress);
        
        results[cellRef] = {
          formula: formula || '',
          value: serializeCellValue(value),
          error: isErrorValue(value) ? String(value) : undefined
        };
      }
    });
  } else {
    // Extract all cells (full extraction)
    const dimensions = engine.getSheetDimensions(sheetIndex);
    
    for (let row = 0; row < dimensions.height; row++) {
      for (let col = 0; col < dimensions.width; col++) {
        const cellAddress = { sheet: sheetIndex, row, col };
        
        if (engine.doesCellHaveFormula(cellAddress)) {
          const formula = engine.getCellFormula(cellAddress);
          const value = engine.getCellValue(cellAddress);
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
          
          results[cellRef] = {
            formula: formula || '',
            value: serializeCellValue(value),
            error: isErrorValue(value) ? String(value) : undefined
          };
        }
      }
    }
  }
  
  return results;
}
```

## Error Handling

### Handle Calculation Errors

```typescript
function extractWithErrorHandling(
  engine: HyperFormula,
  sheets: SheetData[],
  sheetNameToIndex: Map<string, number>
): { 
  inputs: ModelInputs; 
  outputs: ModelOutputs; 
  errors: ExtractionError[] 
} {
  const errors: ExtractionError[] = [];
  
  try {
    // ... extraction logic
    
    // Check for formula errors
    sheets.forEach(sheet => {
      const sheetIndex = sheetNameToIndex.get(sheet.name);
      if (sheetIndex === undefined) return;
      
      const dimensions = engine.getSheetDimensions(sheetIndex);
      
      for (let row = 0; row < dimensions.height; row++) {
        for (let col = 0; col < dimensions.width; col++) {
          const cellAddress = { sheet: sheetIndex, row, col };
          const value = engine.getCellValue(cellAddress);
          
          if (isErrorValue(value)) {
            errors.push({
              sheet: sheet.name,
              cell: XLSX.utils.encode_cell({ r: row, c: col }),
              error: String(value),
              formula: engine.getCellFormula(cellAddress)
            });
          }
        }
      }
    });
    
  } catch (error) {
    errors.push({
      sheet: 'global',
      cell: 'N/A',
      error: error.message,
      formula: undefined
    });
  }
  
  return { inputs, outputs, errors };
}

interface ExtractionError {
  sheet: string;
  cell: string;
  error: string;
  formula?: string;
}
```

## Testing Strategy

1. **Unit Tests**: Test extraction functions independently
2. **Integration Tests**: Test full save/load cycle
3. **Edge Cases**: Empty sheets, error formulas, circular references
4. **Performance Tests**: Large sheets (1000+ rows)
5. **Comparison Tests**: Verify version comparison accuracy

## Future Enhancements

1. **Incremental Extraction**: Only extract changed cells
2. **Delta Storage**: Store only changes between versions
3. **Compression**: Compress large output data
4. **Audit Trail**: Track who changed what
5. **Formula Dependency Graph**: Visualize dependencies
6. **What-If Analysis**: Quick scenario adjustments

## References

- [HyperFormula API Documentation](https://hyperformula.handsontable.com/api/)
- [HyperFormula getCellValue](https://hyperformula.handsontable.com/api/classes/hyperformula.html#getcellvalue)
- [HyperFormula getCellFormula](https://hyperformula.handsontable.com/api/classes/hyperformula.html#getcellformula)
- Current schema: `convex/schema.ts`
- Current modelRuns: `convex/modelRuns.ts`

