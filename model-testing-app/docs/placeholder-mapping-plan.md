# Placeholder-Based Data Mapping Implementation Plan

## Overview
This document outlines the implementation plan for Phase 2: Data Mapping using template placeholders instead of fixed cell references. This approach provides flexibility for variable data amounts and multiple insertion points.

## Key Concept: Template Placeholder System

**Approach**: Templates contain placeholder text like `<interest.rate>`, `<cost.category>`, `<property.name>` that are replaced with actual values from extracted data.

**Benefits**:
- Multiple cells can reference the same data source
- Variable amounts of array data (10 costs vs 40 costs)
- Template-driven mapping rather than hard-coded cell positions
- Normalized database fields as source
- **Prioritization system** for handling ambiguous matches

## Placeholder Format

- Simple values: `<interest.rate>`, `<property.name>`, `<total.cost>`
- Array items: `<costs.category>`, `<costs.amount>`, `<costs.notes>`
- Array ranges: `<costs.start>` ... `<costs.end>` (marks insertion range)

## Prioritization System

### Problem
When multiple data sources could match the same placeholder (e.g., `<expense.amount>` could match `cost_breakdown`, `professionalFees`, `constructionCosts`), we need a way to determine which one to use.

### Solution
Each placeholder mapping includes a `priority` number:
- **Higher priority** = more specific/preferred match
- **Lower priority** = generic/fallback match
- **Default priority** = 0 if not specified

### Selection Logic
1. Find all mappings that match the placeholder
2. Filter to mappings where data exists in extracted data
3. Sort by priority (descending)
4. If priorities equal, use first in config order
5. Use best match for replacement

### Example
```typescript
'<expense.amount>': [
  { source: 'cost_breakdown[].amount', priority: 5 },  // Generic - lower priority
  { source: 'professionalFees.total', priority: 7 },   // More specific - higher priority
  { source: 'constructionCosts.total', priority: 7 },  // Same priority, order matters
]
```

If `professionalFees.total` exists → use it (priority 7)
If not, but `constructionCosts.total` exists → use it (priority 7, but second in order)
If neither, but `cost_breakdown` exists → use it (priority 5, fallback)

## Implementation Tasks

### Task 1: Create Placeholder Mapper Core
**File**: `src/lib/placeholderMapper.ts`

**Interfaces**:
```typescript
interface PlaceholderMapping {
  placeholder: string;
  source: string;  // Normalized DB field path
  type: 'string' | 'number' | 'date' | 'boolean';
  format?: string;
  priority?: number;  // Higher = more important (default: 0)
}

interface PlaceholderMatch {
  cellAddress: { sheet: string; row: number; col: number };
  placeholder: string;
  fullText: string;  // Full cell content
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

// Replace placeholders with values
function replacePlaceholders(
  sheets: SheetData[],
  matches: PlaceholderMatch[],
  extractedData: ExtractedData,
  config: PlaceholderConfig
): SheetData[]

// Insert array data between markers
function insertArrayData(
  sheet: SheetData,
  arrayData: any[],
  startMarker: string,
  endMarker: string,
  rowTemplate: string,
  config: PlaceholderConfig
): SheetData

// Resolve formula placeholders to cell references
function resolveFormulaPlaceholders(
  formula: string,
  placeholderRanges: Map<string, string>
): string
```

### Task 2: Create Placeholder Configuration Library
**File**: `src/lib/placeholderConfigs.ts`

**Structure**:
```typescript
export interface PlaceholderConfig {
  [placeholder: string]: PlaceholderMapping | PlaceholderMapping[] | ArrayPlaceholderMapping;
}

export const STANDARD_PLACEHOLDERS: PlaceholderConfig = {
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
  
  // Array placeholders
  '<costs>': {
    source: 'cost_breakdown',
    priority: 5,  // Generic
    rowTemplate: '<costs.category> | <costs.amount> | <costs.notes>',
    startMarker: '<costs.start>',
    endMarker: '<costs.end>',
    fields: {
      '<costs.category>': 'category',
      '<costs.amount>': 'amount',
      '<costs.notes>': 'notes'
    }
  },
  
  '<professional.fees>': {
    source: 'professionalFees.items',
    priority: 8,  // More specific - higher priority
    rowTemplate: '<professional.fees.category> | <professional.fees.amount>',
    startMarker: '<professional.fees.start>',
    endMarker: '<professional.fees.end>',
    fields: {
      '<professional.fees.category>': 'category',
      '<professional.fees.amount>': 'amount'
    }
  }
};

// Model-specific configurations extend standard
export const APPRAISAL_MODEL_PLACEHOLDERS: PlaceholderConfig = {
  ...STANDARD_PLACEHOLDERS,
  // Appraisal-specific additions with priorities
};

export const OPERATING_MODEL_PLACEHOLDERS: PlaceholderConfig = {
  ...STANDARD_PLACEHOLDERS,
  // Operating-specific additions with priorities
};
```

### Task 3: Template Preparation Guide
**Documentation**: `docs/template-placeholder-guide.md`

**Template Marking**:
- Use `<field.name>` format for single values (can appear multiple times)
- Use `<array.field>` format for array items
- Mark insertion ranges: `<costs.start>` ... `<costs.end>`
- Formulas can reference placeholders: `=SUM(<costs.amount>)`

**Priority Guidelines**:
- Specific field names (e.g., `<professional.fees.amount>`) → priority 8-10
- Generic placeholders (e.g., `<expense.amount>`) → priority 5-7
- Fallback mappings → priority 1-4

**Example Template**:
```
Cell A1: "Interest Rate: <interest.rate>"
Cell B5: "<costs.start>"
Cell B6: "<costs.category> | <costs.amount> | <costs.notes>"
Cell B20: "<costs.end>"
Cell C10: "=SUM(<costs.amount>)"
```

### Task 4: Integration
**File**: `src/app/modeling/page.tsx`

**Changes**:
- When template loads, scan for placeholders
- Match placeholders to extracted data using prioritization
- Auto-populate template
- Show placeholder mapping status:
  - Which placeholders were found
  - Which mappings were selected (and why - priority level)
  - Which placeholders couldn't be matched (warnings)
- Allow manual "Refresh Data" button

### Task 5: Validation & Logging
**File**: `src/lib/placeholderMapper.ts`

**Features**:
- Log prioritization decisions (which match was selected and why)
- Warn about unmatched placeholders
- Show priority levels used in UI feedback
- Validate array insertion ranges are properly marked
- Handle missing data gracefully (leave placeholder or use default)

## Testing Scenarios

1. **Single Match**: Placeholder with one mapping → should use it
2. **Multiple Matches - Different Priorities**: Should use highest priority
3. **Multiple Matches - Same Priority**: Should use first in config order
4. **Missing High Priority**: Should fallback to lower priority
5. **No Matches**: Should warn user
6. **Variable Array Lengths**: 10 costs vs 40 costs → both work
7. **Multiple Insertion Points**: Same placeholder in multiple cells → all get replaced

## Benefits of Prioritization

1. **Eliminates Ambiguity**: Clear rules for which data source to use
2. **Flexible Fallbacks**: Can define multiple options with different priorities
3. **Specificity First**: More specific mappings take precedence
4. **Predictable Behavior**: Order-based tiebreaker ensures consistency
5. **Debugging**: Logging shows why each match was selected

## Complexity Assessment

**Added Complexity**: Low-Medium
- Simple priority number on each mapping
- Straightforward sorting logic
- Minimal performance impact

**Benefits**: High
- Prevents ambiguous mappings
- Enables flexible fallback scenarios
- Makes system more robust

**Conclusion**: The prioritization system adds minimal complexity while significantly improving the robustness and predictability of the mapping system. It's worth implementing.

