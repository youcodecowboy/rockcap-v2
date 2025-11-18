# Implementation Roadmap

## Overview
This document provides a phased implementation plan for Excel-like enhancements, data mapping, export preservation, and formula results storage.

## Phase 1: Excel-like Features (Priority: HIGH)

### Goal
Enhance user experience with Excel-like keyboard shortcuts, copy/paste, undo/redo, and fill handle.

### Timeline
Estimated: 1-2 days

### Tasks

#### 1.1 Enable Core Handsontable Plugins

**File**: `src/components/WorkbookEditor.tsx` and `src/components/ExcelDataEditor.tsx`

**Changes**:
```typescript
<HotTable
  // Enable Excel-like features
  copyPaste={true}
  undo={true}
  fillHandle={true}
  comments={true}
  customBorders={true}
  filters={!readOnly}
  dropdownMenu={!readOnly}
  
  // Configure plugins
  fillHandle={{
    direction: 'vertical',
    autoInsertRow: true,
    autoInsertColumn: !readOnly
  }}
  
  // Existing props...
/>
```

**Testing**:
- Ctrl+C/Ctrl+V works
- Ctrl+Z/Ctrl+Y undoes/redoes
- Fill handle drags correctly
- Tab/Enter navigation works

#### 1.2 Add Number Formatting Toolbar

**New Component**: `src/components/NumberFormatToolbar.tsx`

**Features**:
- Currency format
- Percentage format
- Decimal places selector
- Thousands separator toggle
- Date format options

**Integration**:
Add next to FormattingToolbar in FormulaBar

**Testing**:
- Format changes apply correctly
- Formats preserved on save
- Formats exported to Excel

#### 1.3 Enhanced Context Menu

**File**: `src/components/WorkbookEditor.tsx` and `src/components/ExcelDataEditor.tsx`

**Changes**:
```typescript
contextMenu: {
  items: {
    row_above: { name: 'Insert row above' },
    row_below: { name: 'Insert row below' },
    col_left: { name: 'Insert column left' },
    col_right: { name: 'Insert column right' },
    remove_row: { name: 'Remove row' },
    remove_col: { name: 'Remove column' },
    separator1: '---------',
    copy: { name: 'Copy' },
    cut: { name: 'Cut' },
    paste: { name: 'Paste' },
    separator2: '---------',
    add_comment: { name: 'Add comment' },
    custom_borders: { name: 'Add border' },
    clear_formatting: { name: 'Clear formatting' }
  }
}
```

**Testing**:
- All menu items appear
- Actions work correctly
- Custom items integrate with existing features

#### 1.4 Keyboard Shortcuts Help Modal

**New Component**: `src/components/KeyboardShortcutsModal.tsx`

**Features**:
- List all shortcuts
- Search shortcuts
- Categorized (Navigation, Editing, Formatting)
- Accessible via "?" or Help button

**Integration**:
Add button to FormulaBar or toolbar

### Completion Criteria
- [ ] All core plugins enabled
- [ ] Number formatting works
- [ ] Context menu enhanced
- [ ] Help modal created
- [ ] All tests pass

---

## Phase 2: Data Mapping with Template Placeholders (Priority: HIGH)

### Goal
Automatically populate template cells using placeholder-based mapping (e.g., `<interest.rate>`) instead of fixed cell references. This provides flexibility for variable data amounts, multiple insertion points, and prioritization for ambiguous matches.

### Approach: Template Placeholder System

**Key Concept**: Templates contain placeholder text like `<interest.rate>`, `<cost.category>`, `<property.name>` that are replaced with actual values from extracted data. This allows:
- Multiple cells to reference the same data source
- Variable amounts of array data (10 costs vs 40 costs)
- Template-driven mapping rather than hard-coded cell positions
- Normalized database fields as source
- **Prioritization system** for handling ambiguous matches

### Timeline
Estimated: 2-3 days

### Tasks

#### 2.1 Create Placeholder-Based Mapper

**New File**: `src/lib/placeholderMapper.ts`

**Interfaces**:
```typescript
interface PlaceholderMapping {
  placeholder: string;  // e.g., "<interest.rate>"
  source: string;        // e.g., "financing.interestRate" (normalized DB field)
  type: 'string' | 'number' | 'date' | 'boolean';
  format?: string;       // e.g., "currency", "percentage"
  priority?: number;     // Higher = more important (default: 0), used when multiple sources match
}

interface ArrayPlaceholderMapping {
  placeholder: string;
  source: string;
  priority?: number;
  rowTemplate: string;
  startMarker: string;
  endMarker: string;
}
```

**Core Functions**:
```typescript
// Scan all cells for placeholder patterns
function scanForPlaceholders(sheets: SheetData[]): PlaceholderMatch[]

// Find all possible mappings for a placeholder
function findMappingsForPlaceholder(placeholder: string, config: PlaceholderConfig): PlaceholderMapping[]

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

// Replace placeholders with values
function replacePlaceholders(...)

// Insert array data between markers
function insertArrayData(...)

// Resolve formula placeholders to cell references
function resolveFormulaPlaceholders(...)
```

**Testing**:
- Placeholder scanning works
- Prioritization selects correct match
- Array insertion works with variable lengths
- Formula resolution works

#### 2.2 Create Placeholder Configuration Library

**New File**: `src/lib/placeholderConfigs.ts`

**Structure with Prioritization**:
```typescript
export const STANDARD_PLACEHOLDERS = {
  // Specific mappings - high priority
  '<property.name>': { 
    source: 'summary.property_name', 
    type: 'string', 
    priority: 10 
  },
  
  '<interest.rate>': { 
    source: 'financing.interestRate', 
    type: 'number', 
    format: 'percentage', 
    priority: 10 
  },
  
  // Multiple mappings with priorities - array format
  '<expense.amount>': [
    { 
      source: 'professionalFees.total', 
      type: 'number', 
      format: 'currency', 
      priority: 8  // High priority - specific
    },
    { 
      source: 'constructionCosts.total', 
      type: 'number', 
      format: 'currency', 
      priority: 8  // Same priority, second choice
    },
    { 
      source: 'cost_breakdown[].amount', 
      type: 'number', 
      format: 'currency', 
      priority: 5  // Lower priority - generic fallback
    }
  ],
  
  // Array placeholders with priorities
  '<costs>': {
    source: 'cost_breakdown',
    priority: 5,  // Generic
    rowTemplate: '<costs.category> | <costs.amount> | <costs.notes>',
    startMarker: '<costs.start>',
    endMarker: '<costs.end>'
  },
  
  '<professional.fees>': {
    source: 'professionalFees.items',
    priority: 8,  // More specific - higher priority
    rowTemplate: '<professional.fees.category> | <professional.fees.amount>',
    startMarker: '<professional.fees.start>',
    endMarker: '<professional.fees.end>'
  }
};
```

**Prioritization Guidelines**:
- Specific field names (e.g., `<professional.fees.amount>`) → priority 8-10
- Generic placeholders (e.g., `<expense.amount>`) → priority 5-7
- Fallback mappings → priority 1-4

**Testing**:
- Configurations cover all expected fields
- Priorities are appropriately set
- Types and formats are correct

#### 2.3 Template Preparation Guide

**Documentation**: Create guide for template creators

**Template Marking**:
- Use `<field.name>` format for single values (can appear multiple times)
- Use `<array.field>` format for array items
- Mark insertion ranges: `<costs.start>` ... `<costs.end>`
- Formulas can reference placeholders: `=SUM(<costs.amount>)`

**Example Template**:
```
Cell A1: "Interest Rate: <interest.rate>"
Cell B5: "<costs.start>"
Cell B6: "<costs.category> | <costs.amount> | <costs.notes>" (row template)
Cell B20: "<costs.end>"
Cell C10: "=SUM(<costs.amount>)"
```

#### 2.4 Integrate with Model Loading

**File**: `src/app/modeling/page.tsx`

**Changes**:
```typescript
const handleRunAppraisalModel = async () => {
  // Load template
  const workbook = await loadExcelTemplate(templateUrl);
  
  // Apply placeholder-based mapping if extracted data exists
  if (effectiveExtractedData) {
    const mappedWorkbook = populateTemplateWithPlaceholders(
      workbook.sheets,
      effectiveExtractedData,
      STANDARD_PLACEHOLDERS
    );
    setTemplateSheets(mappedWorkbook);
  } else {
    setTemplateSheets(workbook.sheets);
  }
};
```

**UI Feedback**:
- Show which placeholders were found
- Show which mappings were selected (and priority level used)
- Show which placeholders couldn't be matched (warnings)
- Allow manual "Refresh Data" button

**Testing**:
- Placeholders found and replaced correctly
- Prioritization works (selects best match)
- Missing data handled gracefully
- Validation errors shown
- User can review before proceeding

#### 2.5 Prioritization System Implementation

**File**: `src/lib/placeholderMapper.ts`

**Features**:
- Each placeholder mapping can have a `priority` number (default: 0)
- Higher priority = more specific/preferred match
- When multiple data sources match same placeholder:
  1. Filter to sources that have data available
  2. Sort by priority (descending)
  3. If priorities equal, use first in config order
  4. Use best match for replacement
- Log which match was selected (for debugging)

**Use Cases**:
- Generic `<expense.amount>` (priority: 5) vs specific `<professional.fees.amount>` (priority: 8)
- Multiple cost categories that could match `<costs>` - use most specific first
- Fallback scenarios: if high-priority source missing, use lower-priority alternative

**Example Selection Logic**:
```typescript
// Placeholder: '<expense.amount>'
// Available mappings:
// - professionalFees.total (priority: 8, data exists: true)
// - constructionCosts.total (priority: 8, data exists: true)
// - cost_breakdown[].amount (priority: 5, data exists: true)

// Result: Select professionalFees.total (priority 8, first in order)
```

#### 2.6 Mapping Validation and Error Handling

**File**: `src/lib/placeholderMapper.ts`

**Features**:
- Validate all placeholders have corresponding data
- Warn about unmatched placeholders
- Show priority levels used in UI feedback
- Log prioritization decisions for debugging
- Validate array insertion ranges are properly marked
- Handle missing data gracefully (leave placeholder or use default)

#### 2.7 Mapping Preview UI (Optional)

**New Component**: `src/components/MappingPreview.tsx`

**Features**:
- Show before/after comparison
- Highlight mapped cells
- Show validation errors
- Allow manual adjustments

**Testing**:
- Preview shows correctly
- User can make adjustments
- Changes apply correctly

### Completion Criteria
- [ ] Placeholder mapper created with scanning and replacement logic
- [ ] Placeholder configuration library created with prioritization
- [ ] Array data insertion with start/end markers implemented
- [ ] Formula placeholder resolution implemented
- [ ] Prioritization system working (selects best match based on priority)
- [ ] Integration with model loading complete
- [ ] Validation and error handling works
- [ ] Template preparation guide created
- [ ] All tests pass (including variable array lengths and multiple insertion points)

---

## Phase 3: Export Enhancement (Priority: MEDIUM)

### Goal
Export to Excel preserving all formulas, styles, formatting, and structure.

### Timeline
Estimated: 2-3 days

### Tasks

#### 3.1 Enhance Export Function

**File**: `src/lib/templateLoader.ts`

**Replace `exportToExcel` with `exportToExcelEnhanced`**:

Key functions to add:
1. `buildWorksheetWithFormulas(sheetData: SheetData): XLSX.WorkSheet`
2. `applyLoadedStyles(ws: XLSX.WorkSheet, sheetData: SheetData): void`
3. `applyUserFormatting(ws: XLSX.WorkSheet, cellFormats: Map<string, CellFormat>): void`
4. `applyColumnWidths(ws: XLSX.WorkSheet, columnWidths?: { [col: number]: number }): void`
5. `convertToXLSXStyle(style: CellStyle): XLSX.CellStyle`

**Testing**:
- Formulas preserved
- Styles preserved
- User formatting preserved
- Column widths correct

#### 3.2 Integrate Enhanced Export with WorkbookEditor

**File**: `src/components/WorkbookEditor.tsx`

**Changes**:
```typescript
const handleExport = () => {
  const currentSheets: SheetData[] = sheets.map(sheet => {
    const hotRef = hotTableRefs.current.get(sheet.name);
    return {
      ...sheet,
      data: hotRef?.hotInstance?.getData() || sheet.data
    };
  });
  
  exportToExcelEnhanced(
    currentSheets,
    cellFormats,
    `${activeSheet}-${new Date().toISOString().split('T')[0]}.xlsx`
  );
};
```

**Testing**:
- Export button works
- File downloads correctly
- File opens in Excel without errors

#### 3.3 Integrate Enhanced Export with ExcelDataEditor

**File**: `src/components/ExcelDataEditor.tsx`

**Changes**:
Similar to WorkbookEditor but for single sheet

**Testing**:
- Export works for single sheet
- Formatting preserved

#### 3.4 Export Validation

**File**: `src/lib/templateLoader.ts`

**Add Function**: `validateExportData(sheets: SheetData[]): ValidationResult`

**Features**:
- Check for invalid formulas
- Check for empty sheets
- Check for invalid sheet names

**Testing**:
- Validation catches errors
- User notified of issues

#### 3.5 Export Progress Indicator (Optional)

**Feature**: Show progress for large exports

**Implementation**: `exportToExcelEnhancedWithProgress(...)`

**Testing**:
- Progress shows correctly
- Large files export successfully

### Completion Criteria
- [ ] Enhanced export function created
- [ ] Formulas preserved
- [ ] Styles preserved
- [ ] User formatting preserved
- [ ] Integration complete for both editors
- [ ] Validation works
- [ ] All tests pass

---

## Phase 4: Formula Results Storage (Priority: MEDIUM)

### Goal
Extract calculated results from HyperFormula and store in database for version tracking.

### Timeline
Estimated: 2-3 days

### Tasks

#### 4.1 Create Result Extraction Functions

**New File**: `src/lib/formulaExtraction.ts`

**Functions**:
1. `extractFormulaResults(engine, sheetName, sheetIndex): Record<string, FormulaResult>`
2. `extractInputValues(sheets): Record<string, Record<string, InputValue>>`
3. `extractKeyMetrics(engine, sheetName, sheetIndex, metricCells): Record<string, number | null>`
4. `extractModelResults(engine, sheets, sheetNameToIndex, keyMetrics): { inputs, outputs }`

**Testing**:
- Extraction works for all cell types
- Formulas extracted correctly
- Values calculated correctly
- Errors handled properly

#### 4.2 Define Key Metrics Configurations

**File**: `src/lib/metricConfigurations.ts` (NEW)

**Content**:
```typescript
export const APPRAISAL_KEY_METRICS = {
  'Appraisal Summary': {
    totalCost: 'B21',
    totalRevenue: 'B35',
    netIncome: 'B40',
    roi: 'B41'
  }
};

export const OPERATING_KEY_METRICS = {
  'Operating Assumptions': {
    occupancyRate: 'B5',
    operatingExpenses: 'B15',
    noi: 'B20'
  }
};
```

**Testing**:
- Metrics match actual template cells
- All key metrics defined

#### 4.3 Integrate Extraction with WorkbookEditor

**File**: `src/components/WorkbookEditor.tsx`

**Add Method**:
```typescript
const extractCurrentResults = useCallback((): { inputs, outputs } | null => {
  if (!hyperFormulaEngine.current) return null;
  
  const sheetNameToIndex = new Map<string, number>();
  sheets.forEach((sheet, index) => {
    sheetNameToIndex.set(sheet.name, index);
  });
  
  const currentSheets = sheets.map(sheet => {
    const hotRef = hotTableRefs.current.get(sheet.name);
    return {
      ...sheet,
      data: hotRef?.hotInstance?.getData() || sheet.data
    };
  });
  
  return extractModelResults(
    hyperFormulaEngine.current,
    currentSheets,
    sheetNameToIndex,
    APPRAISAL_KEY_METRICS
  );
}, [sheets]);
```

**Expose via prop**: `onExtractResults`

**Testing**:
- Extraction called on save
- Results structured correctly
- No performance issues

#### 4.4 Update Save Flow in modeling/page.tsx

**File**: `src/app/modeling/page.tsx`

**Changes**:
```typescript
const workbookExtractRef = useRef<(() => { inputs, outputs } | null) | null>(null);

const handleSaveVersion = async (versionData) => {
  const results = workbookExtractRef.current?.();
  
  if (!results) {
    alert('Failed to extract model results');
    return;
  }
  
  await saveVersion({
    scenarioId: selectedScenarioId,
    modelType: versionData.modelType,
    version: versionData.version,
    versionName: versionData.versionName,
    inputs: results.inputs,
    outputs: results.outputs
  });
};
```

**Testing**:
- Save includes inputs and outputs
- Data persists in database
- Can retrieve saved results

#### 4.5 Enhance ModelOutputSummary Component

**File**: `src/components/ModelOutputSummary.tsx`

**Changes**:
- Accept `outputs` prop
- Display key metrics
- Format values appropriately
- Show calculation timestamp

**Testing**:
- Summary displays correctly
- Metrics formatted properly
- Handles missing data

#### 4.6 Version Comparison Feature (Optional)

**New Component**: `src/components/VersionComparison.tsx`

**Features**:
- Select two versions to compare
- Show side-by-side metrics
- Calculate differences and % changes
- Highlight significant changes

**Testing**:
- Comparison calculates correctly
- UI clear and intuitive

### Completion Criteria
- [ ] Extraction functions created
- [ ] Metrics configurations defined
- [ ] Integration with WorkbookEditor complete
- [ ] Save flow updated
- [ ] ModelOutputSummary enhanced
- [ ] Version comparison created (optional)
- [ ] All tests pass

---

## Cross-Phase Tasks

### Documentation
- [ ] Update README with new features
- [ ] Document data mapping process
- [ ] Document export capabilities
- [ ] Document version tracking

### Testing
- [ ] Unit tests for all new functions
- [ ] Integration tests for workflows
- [ ] E2E tests for critical paths
- [ ] Performance tests for large datasets

### Code Quality
- [ ] Linting passes
- [ ] Type safety (TypeScript)
- [ ] Error handling comprehensive
- [ ] Logging appropriate

### User Experience
- [ ] Loading states for async operations
- [ ] Error messages user-friendly
- [ ] Success feedback clear
- [ ] Help/documentation accessible

---

## Dependencies and Prerequisites

### External Libraries
- Handsontable: Already installed
- HyperFormula: Already installed
- XLSX (SheetJS): Already installed
- Lucide React: Already installed (for icons)

### Internal Dependencies
- Existing `dataMapper.ts`
- Existing `templateLoader.ts`
- Existing `WorkbookEditor.tsx`
- Existing `ExcelDataEditor.tsx`
- Existing `modelRuns.ts` (Convex)
- Existing `scenarios.ts` (Convex)

### No Breaking Changes
All enhancements should be additive and backward-compatible

---

## Risk Mitigation

### Performance Risks
**Risk**: Large sheets slow down extraction/export
**Mitigation**: 
- Implement lazy loading
- Add progress indicators
- Optimize extraction algorithms
- Test with realistic data sizes

### Data Loss Risks
**Risk**: Formatting or formulas lost during save/export
**Mitigation**:
- Comprehensive testing
- Validation before save
- Backup before operations
- User confirmation for destructive actions

### User Confusion Risks
**Risk**: New features overwhelming
**Mitigation**:
- Clear UI/UX design
- Help documentation
- Tooltips and hints
- Progressive disclosure

### Integration Risks
**Risk**: Breaking existing functionality
**Mitigation**:
- Feature flags
- Gradual rollout
- Comprehensive testing
- Rollback plan

---

## Post-Implementation

### Monitoring
- Track feature usage
- Monitor performance
- Collect user feedback
- Log errors

### Iteration
- Refine based on feedback
- Optimize performance
- Add requested features
- Fix bugs promptly

### Future Enhancements
- AI-assisted data mapping
- Template versioning
- Cloud export options
- Real-time collaboration
- Advanced formula debugging
- Scenario analysis tools

---

## Success Metrics

### Functional
- ✅ All keyboard shortcuts work
- ✅ Data mapping successful rate > 95%
- ✅ Export preserves 100% of formulas
- ✅ Formula results accurately extracted
- ✅ Version comparison accurate

### Performance
- Loading time < 2 seconds for typical template
- Export time < 5 seconds for typical model
- Extraction time < 3 seconds
- No UI freezing during operations

### User Experience
- User satisfaction > 4/5
- Feature adoption > 70%
- Support tickets < 10/month
- Positive feedback in reviews

---

## Timeline Summary

| Phase | Duration | Priority | Dependencies |
|-------|----------|----------|--------------|
| Phase 1: Excel-like Features | 1-2 days | HIGH | None |
| Phase 2: Data Mapping | 2-3 days | HIGH | None |
| Phase 3: Export Enhancement | 2-3 days | MEDIUM | Phase 1 |
| Phase 4: Formula Results | 2-3 days | MEDIUM | None |
| **Total** | **7-11 days** | | |

### Parallel Work Possible
- Phase 1 and Phase 2 can be done in parallel
- Phase 3 and Phase 4 can be done in parallel after Phase 1

### Optimistic Timeline
7 days with 2 developers working in parallel

### Realistic Timeline
10-11 days with 1 developer or accounting for bugs/revisions

---

## Next Steps

1. Review and approve this roadmap
2. Set up task tracking (already done via todos)
3. Begin Phase 1 implementation
4. Daily standups to track progress
5. Testing after each phase
6. User acceptance testing before deployment

