<!-- 0325af48-5dd9-486c-a13c-ea925957ee96 236012a3-badf-43ec-9d88-8a629c1ba82e -->
# Remaining Excel Features Implementation Plan

## Status Summary

**Phase 1: Excel-like Features** - ✅ COMPLETED

- Number formatting toolbar
- Keyboard shortcuts modal  
- Enhanced context menus
- Formatting features

**Remaining Phases:**

- Phase 2: Data Mapping with Placeholders (2-3 days) - NOT STARTED
- Phase 3: Export Enhancement (2-3 days) - NOT STARTED
- Phase 4: Formula Results Storage (2-3 days) - NOT STARTED

---

## Phase 2: Data Mapping with Template Placeholders (Priority: HIGH)

### Goal

Automatically populate template cells using placeholder-based mapping (e.g., `<interest.rate>`) instead of fixed cell references. This provides flexibility for variable data amounts and multiple insertion points.

### Approach: Template Placeholder System

**Key Concept**: Templates contain placeholder text like `<interest.rate>`, `<cost.category>`, `<property.name>` that are replaced with actual values from extracted data. This allows:

- Multiple cells to reference the same data source
- Variable amounts of array data (10 costs vs 40 costs)
- Template-driven mapping rather than hard-coded cell positions
- Normalized database fields as source

**Placeholder Format**:

- Simple values: `<interest.rate>`, `<property.name>`, `<total.cost>`
- Array items: `<costs.category>`, `<costs.amount>`, `<costs.notes>`
- Array ranges: `<costs.start>` ... `<costs.end>` (marks insertion range)

### Tasks

#### 2.1 Create Placeholder-Based Mapper

**New File**: `src/lib/placeholderMapper.ts`

**Core Functions**:

```typescript
interface PlaceholderMapping {
  placeholder: string;  // e.g., "<interest.rate>"
  source: string;        // e.g., "financing.interestRate" (normalized DB field)
  type: 'string' | 'number' | 'date' | 'boolean';
  format?: string;       // e.g., "currency", "percentage"
  priority?: number;     // Higher = more important (default: 0), used when multiple sources match same placeholder
}

interface ArrayPlaceholderMapping {
  placeholder: string;   // e.g., "<costs>"
  source: string;        // e.g., "cost_breakdown"
  priority?: number;      // Higher = more important (default: 0)
  rowTemplate: string;   // e.g., "<costs.category> | <costs.amount> | <costs.notes>"
  startMarker: string;   // e.g., "<costs.start>"
  endMarker: string;     // e.g., "<costs.end>"
}

// Main function
function populateTemplateWithPlaceholders(
  sheets: SheetData[],
  extractedData: ExtractedData,
  mappings: PlaceholderMapping[],
  arrayMappings: ArrayPlaceholderMapping[]
): SheetData[]
```

**Implementation Steps**:

1. Scan all cells in all sheets for placeholder patterns (`<...>`)
2. Match placeholders to normalized data paths (may find multiple matches)
3. **Prioritize matches**: Sort by priority (higher first), then by config order if priorities equal
4. Select best match based on priority/order
5. Replace placeholders with actual values (find-and-replace approach)
6. For arrays, find start/end markers and insert rows dynamically
7. Handle formulas that reference placeholders (replace with cell refs after insertion)
8. **Cleanup unpopulated rows**: Hide or delete rows that still contain placeholders after population

#### 2.2 Create Placeholder Configuration Library

**New File**: `src/lib/placeholderConfigs.ts`

**Structure with Prioritization**:

```typescript
// Standardized placeholder definitions mapped to database fields
export const STANDARD_PLACEHOLDERS = {
  // Property info - specific mappings, high priority
  '<property.name>': { source: 'summary.property_name', type: 'string', priority: 10 },
  '<property.address>': { source: 'summary.property_address', type: 'string', priority: 10 },
  
  // Financial - specific mappings, high priority
  '<interest.rate>': { source: 'financing.interestRate', type: 'number', format: 'percentage', priority: 10 },
  '<loan.amount>': { source: 'financing.loanAmount', type: 'number', format: 'currency', priority: 10 },
  '<total.cost>': { source: 'summary.total_cost', type: 'number', format: 'currency', priority: 10 },
  
  // Multiple mappings with priorities - array format for ambiguous matches
  '<expense.amount>': [
    { source: 'professionalFees.total', type: 'number', format: 'currency', priority: 8 },  // Specific - high priority
    { source: 'constructionCosts.total', type: 'number', format: 'currency', priority: 8 },  // Same priority, second choice
    { source: 'cost_breakdown[].amount', type: 'number', format: 'currency', priority: 5 }   // Generic fallback
  ],
  
  // Array placeholders with priorities
  '<costs>': {
    source: 'cost_breakdown',
    priority: 5,  // Generic - lower priority
    fields: {
      '<costs.category>': 'category',
      '<costs.amount>': 'amount',
      '<costs.notes>': 'notes'
    }
  },
  
  '<professional.fees>': {
    source: 'professionalFees.items',
    priority: 8,  // More specific - higher priority
    fields: {
      '<professional.fees.category>': 'category',
      '<professional.fees.amount>': 'amount'
    }
  }
};

// Model-specific configurations
export const APPRAISAL_MODEL_PLACEHOLDERS = {
  ...STANDARD_PLACEHOLDERS,
  // Appraisal-specific additions
};

export const OPERATING_MODEL_PLACEHOLDERS = {
  ...STANDARD_PLACEHOLDERS,
  // Operating-specific additions
};
```

**Prioritization Guidelines**:
- Specific field names (e.g., `<professional.fees.amount>`) → priority 8-10
- Generic placeholders (e.g., `<expense.amount>`) → priority 5-7
- Fallback mappings → priority 1-4

#### 2.3 Template Preparation Guide

**Documentation**: Create guide for template creators

**Template Marking**:

- Use `<field.name>` format for single values (can appear multiple times)
- Use `<array.field>` format for array items
- Mark insertion ranges: `<costs.start>` ... `<costs.end>`
- Formulas can reference placeholders: `=SUM(<costs.amount>)`
- **Include extra rows**: Templates should start with more rows than average (e.g., 20 expense rows when average is 15) to accommodate variable data amounts

**Example Template Cell**:

```
Cell A1: "Interest Rate: <interest.rate>"
Cell B5: "<costs.start>"
Cell B6: "<costs.category> | <costs.amount> | <costs.notes>" (row template)
Cell B7-B25: Additional empty rows with placeholders (for variable data)
Cell B26: "<costs.end>"
Cell C10: "=SUM(<costs.amount>)"
```

#### 2.4 Implement Placeholder Scanner & Prioritization

**File**: `src/lib/placeholderMapper.ts`

**Functions**:

```typescript
function scanForPlaceholders(sheets: SheetData[]): PlaceholderMatch[] {
  // Scan all cells for <...> patterns
  // Return array of matches with cell location and placeholder text
}

// Find all possible mappings for a placeholder
function findMappingsForPlaceholder(
  placeholder: string,
  config: PlaceholderConfig
): PlaceholderMapping[]

// Select best match based on priority
function selectBestMatch(
  placeholder: string,
  mappings: PlaceholderMapping[],
  extractedData: ExtractedData
): PlaceholderMapping | null {
  // Filter to mappings with available data
  const validMappings = mappings.filter(m => hasData(extractedData, m.source));
  
  // Sort by priority (descending), then maintain order
  validMappings.sort((a, b) => {
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    if (priorityB !== priorityA) {
      return priorityB - priorityA; // Higher priority first
    }
    return 0; // Maintain original order if priorities equal
  });
  
  return validMappings[0] || null;
}

function replacePlaceholders(
  sheets: SheetData[],
  matches: PlaceholderMatch[],
  extractedData: ExtractedData,
  mappings: PlaceholderMapping[]
): SheetData[]
```

**Array Handling**:

```typescript
function insertArrayData(
  sheet: SheetData,
  arrayData: any[],
  startMarker: string,  // e.g., "<costs.start>"
  endMarker: string,   // e.g., "<costs.end>"
  rowTemplate: string  // e.g., "<costs.category> | <costs.amount>"
): SheetData
```

#### 2.5 Handle Formula Placeholders

**File**: `src/lib/placeholderMapper.ts`

**Challenge**: Formulas may reference placeholders that need to become cell references

**Solution**:

1. After replacing placeholders with values, scan formulas
2. Replace placeholder references with actual cell ranges
3. Example: `=SUM(<costs.amount>)` → `=SUM(B6:B15)` (after insertion)

**Function**:

```typescript
function resolveFormulaPlaceholders(
  formula: string,
  placeholderRanges: Map<string, string>
): string
```

#### 2.6 Integrate Auto-Population

**File**: `src/app/modeling/page.tsx`

**Changes**:

- When template loads, scan for placeholders
- Match placeholders to extracted data (using prioritization)
- Auto-populate template
- Run cleanup function to remove unpopulated rows
- Show placeholder mapping status to user
- Show cleanup summary (rows hidden/deleted)
- Allow manual "Refresh Data" button

**Integration Points**:

- `handleRunAppraisalModel()` - auto-populate after template load
- Show which placeholders were found/matched
- Show which placeholders couldn't be matched (warnings)
- Show cleanup actions taken

#### 2.7 Cleanup Unpopulated Rows

**File**: `src/lib/placeholderMapper.ts`

**Purpose**: Templates start with extra rows (e.g., 20 expense rows when average is 15). After population, clean up any rows that still contain placeholders to make sheets expand/contract to perfect size.

**Function**:

```typescript
interface CleanupOptions {
  mode: 'hide' | 'delete';  // Hide rows vs delete them
  preserveEmptyRows?: boolean;  // Keep rows that are completely empty (no placeholders)
}

function cleanupUnpopulatedRows(
  sheets: SheetData[],
  options: CleanupOptions = { mode: 'hide' }
): SheetData[]
```

**Implementation Logic**:

1. After placeholder replacement, scan all rows for remaining placeholders
2. Identify rows that still contain placeholder patterns (`<...>`)
3. For each unpopulated row:
   - If `mode: 'hide'`: Mark row as hidden (store hidden row indices)
   - If `mode: 'delete'`: Remove row from data array
4. Track which rows were cleaned up for reporting
5. Return cleaned sheets

**Use Cases**:
- Template has 20 expense rows, only 15 populated → hide/delete 5 empty rows
- Template has 10 cost categories, only 8 have data → hide/delete 2 empty rows
- Ensures final sheet size matches actual data

**Integration**:
- Run cleanup after placeholder replacement
- Show cleanup summary to user (e.g., "Cleaned up 5 unpopulated rows")
- Optionally allow user to toggle cleanup on/off

**Example Flow**:
1. Template loads with 20 expense rows (rows 6-25)
2. Data extraction finds 15 expenses
3. Placeholder replacement populates rows 6-20
4. Cleanup function identifies rows 21-25 still contain placeholders
5. Rows 21-25 are hidden/deleted
6. Final sheet has exactly 15 expense rows

#### 2.8 Validation & Error Handling

**File**: `src/lib/placeholderMapper.ts`

**Features**:

- Validate all placeholders have corresponding data
- Warn about unmatched placeholders
- Show priority levels used in UI feedback
- Log prioritization decisions for debugging
- Validate array insertion ranges are properly marked
- Handle missing data gracefully (leave placeholder or use default)
- Report cleanup actions (rows hidden/deleted)

#### 2.9 Testing

- Test with templates containing various placeholder types
- Test array insertion with variable amounts (10 vs 40 items)
- Test formulas with placeholder references
- Test multiple insertion points for same data
- Test prioritization system (multiple matches, priority selection)
- Test cleanup function (hide vs delete modes)
- Test cleanup with partially populated arrays (15 of 20 rows)
- Test error handling for missing data
- Test with real extracted data structures

---

## Phase 3: Export Enhancement (Priority: MEDIUM)

### Goal

Export to Excel preserving formulas, styles, formatting, and structure.

### Tasks

#### 3.1 Enhance exportToExcel Function

**File**: `src/lib/templateLoader.ts`

**Current Issues**:

- Formulas NOT preserved (uses `aoa_to_sheet` - values only)
- Styles NOT preserved
- Formatting NOT preserved
- Column widths NOT preserved
- User formatting NOT preserved

**Enhancements Needed**:

1. **Extract Formulas from HyperFormula**
```typescript
// Get formula for each cell
const formula = hyperFormulaEngine.getCellFormula({ sheet: 0, row: r, col: c });
if (formula) {
  cell.f = formula; // Add formula to cell object
}
```

2. **Preserve Cell Styles**
```typescript
// Convert Handsontable cell meta to XLSX style
const style = {
  fill: { fgColor: { rgb: backgroundColor } },
  font: { bold: isBold, color: { rgb: textColor } },
  alignment: { horizontal: 'left' | 'center' | 'right' }
};
cell.s = style;
```

3. **Preserve Number Formats**
```typescript
// Map number formats to Excel format codes
const formatMap = {
  'currency': '$#,##0.00',
  'percentage': '0.00%',
  'date': 'MM/DD/YYYY'
};
cell.z = formatMap[numberFormat.type];
```

4. **Preserve Column Widths**
```typescript
// Set column widths
worksheet['!cols'] = colWidths.map(width => ({ wch: width / 7 }));
```

5. **Preserve User Formatting**

- Merge `cellFormats` Map with Excel-loaded styles
- Apply FormattingToolbar styles (bold, italic, colors)
- Apply NumberFormatToolbar formats

#### 3.2 Update WorkbookEditor Export

**File**: `src/components/WorkbookEditor.tsx`

**Changes**:

- Pass HyperFormula engine instance to export function
- Pass `cellFormats` and `numberFormats` Maps
- Pass column widths
- Call enhanced `exportToExcel` with all metadata

#### 3.3 Update ExcelDataEditor Export  

**File**: `src/components/ExcelDataEditor.tsx`

**Changes**:

- Same as WorkbookEditor
- Ensure single-sheet exports work correctly

#### 3.4 Testing

- Export with formulas → verify formulas work in Excel
- Export with formatting → verify colors/styles preserved
- Export with number formats → verify formats preserved
- Export with column widths → verify widths preserved
- Open exported file in Excel → verify integrity

---

## Phase 4: Formula Results Storage (Priority: MEDIUM)

### Goal

Extract calculated formula results and store them in database for version tracking.

### Tasks

#### 4.1 Create Formula Results Extraction Function

**New File**: `src/lib/formulaResultsExtractor.ts`

**Functions**:

```typescript
interface FormulaResults {
  inputs: Map<string, CellValue>;  // Input cells (no formula)
  outputs: Map<string, CellValue>; // Output cells (formulas)
  allValues: Map<string, CellValue>; // All cells
}

function extractFormulaResults(
  engine: HyperFormula,
  sheets: SheetData[]
): FormulaResults

function classifyCells(
  engine: HyperFormula,
  sheetIndex: number
): { inputs: CellAddress[], outputs: CellAddress[] }
```

**Logic**:

- Use `doesCellHaveFormula()` to classify input vs output
- Use `getCellValue()` to extract calculated results
- Store as Map with cell addresses as keys (e.g., "Sheet1!B10")

#### 4.2 Create Database Schema

**File**: `convex/schema.ts`

**New Table**: `scenarioResults`

```typescript
scenarioResults: defineTable({
  scenarioId: v.id("scenarios"),
  version: v.number(),
  inputs: v.any(), // Map of input cell values
  outputs: v.any(), // Map of output cell values
  allValues: v.any(), // Complete snapshot
  extractedAt: v.string(),
})
```

#### 4.3 Create Convex Functions

**New File**: `convex/scenarioResults.ts`

**Functions**:

```typescript
// Save results
export const saveResults = mutation({
  args: {
    scenarioId: v.id("scenarios"),
    version: v.number(),
    inputs: v.any(),
    outputs: v.any(),
    allValues: v.any(),
  },
  handler: async (ctx, args) => { ... }
});

// Get results for version
export const getResults = query({
  args: { scenarioId: v.id("scenarios"), version: v.number() },
  handler: async (ctx, args) => { ... }
});

// Compare versions
export const compareVersions = query({
  args: { 
    scenarioId: v.id("scenarios"),
    version1: v.number(),
    version2: v.number()
  },
  handler: async (ctx, args) => { ... }
});
```

#### 4.4 Integrate Save Functionality

**File**: `src/components/WorkbookEditor.tsx`

**Changes**:

- On "Save Version" click, extract formula results
- Call `saveResults` mutation with extracted data
- Show success/error feedback

**Integration Points**:

- `handleSaveVersion()` in `modeling/page.tsx`
- Extract results before saving
- Store both file and results

#### 4.5 Add Results Display

**File**: `src/components/ModelOutputSummary.tsx` (or new component)

**Features**:

- Display key output values (totals, percentages)
- Show version comparison
- Highlight changes between versions

#### 4.6 Testing

- Extract results from simple formulas
- Extract results from complex cross-sheet formulas
- Save results to database
- Retrieve and display results
- Compare versions

---

## Implementation Order

1. **Phase 2** (Data Mapping with Placeholders) - Can start immediately
2. **Phase 3** (Export Enhancement) - Depends on Phase 1 (completed)
3. **Phase 4** (Formula Results) - Can be done in parallel with Phase 3

## Estimated Timeline

- Phase 2: 2-3 days (placeholder system adds some complexity but provides flexibility)
- Phase 3: 2-3 days  
- Phase 4: 2-3 days
- **Total**: 6-9 days

## Dependencies

- Phase 2: None (can start immediately)
- Phase 3: Requires Phase 1 (completed)
- Phase 4: None (can start immediately)

## Success Criteria

**Phase 2**:

- ✅ Placeholders found and replaced in templates
- ✅ Multiple insertion points work for same data
- ✅ Variable array lengths handled correctly (10 vs 40 items)
- ✅ Prioritization system selects best match when multiple sources available
- ✅ Formulas with placeholders resolve correctly
- ✅ Unpopulated rows cleaned up (hidden or deleted)
- ✅ Sheets expand/contract to match actual data size
- ✅ Validation catches unmatched placeholders
- ✅ User can manually trigger population

**Phase 3**:

- ✅ Exported Excel files contain working formulas
- ✅ All formatting preserved (colors, fonts, styles)
- ✅ Number formats preserved
- ✅ Column widths preserved
- ✅ Files open correctly in Excel

**Phase 4**:

- ✅ Formula results extracted correctly
- ✅ Results saved to database on "Save Version"
- ✅ Results queryable by version
- ✅ Version comparison works
- ✅ Key outputs displayed in UI

### To-dos

- [ ] Create placeholderMapper.ts with placeholder scanning and replacement logic
- [ ] Create placeholderConfigs.ts library mapping placeholders to normalized database fields
- [ ] Add priority system to placeholder mappings with sorting and selection logic
- [ ] Define priority levels in placeholderConfigs.ts for different mapping specificity
- [ ] Implement array data insertion with start/end markers and variable row counts
- [ ] Handle formula placeholders and convert them to cell references after insertion
- [ ] Create documentation guide for template creators on placeholder syntax
- [ ] Implement cleanup function to hide/delete unpopulated placeholder rows
- [ ] Integrate placeholder-based auto-population in modeling/page.tsx
- [ ] Add validation and error handling for unmatched placeholders and missing data
- [ ] Test placeholder system with variable data amounts and multiple insertion points
- [ ] Test prioritization system with multiple matches
- [ ] Test cleanup function with partially populated arrays
- [ ] Enhance exportToExcel to extract and preserve formulas from HyperFormula
- [ ] Preserve cell styles, formatting, and number formats in exports
- [ ] Preserve column widths, row heights, and merged cells in exports
- [ ] Update WorkbookEditor and ExcelDataEditor to pass all metadata to export
- [ ] Test exports open correctly in Excel with all formulas and formatting intact
- [ ] Create formulaResultsExtractor.ts to extract calculated values from HyperFormula
- [ ] Create scenarioResults table schema in Convex
- [ ] Create Convex functions for saving, retrieving, and comparing results
- [ ] Integrate formula extraction into 'Save Version' functionality
- [ ] Add UI component to display key output values and version comparisons
- [ ] Test formula extraction, storage, retrieval, and version comparison

