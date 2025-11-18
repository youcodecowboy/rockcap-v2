# Template Placeholder Guide

This guide explains how to create Excel templates with placeholders that will be automatically populated with extracted data.

## Overview

Templates use placeholder text (e.g., `<interest.rate>`, `<costs.type>`) that gets replaced with actual values from extracted data. This allows:

- Multiple cells to reference the same data source
- Variable amounts of array data (10 costs vs 40 costs)
- Template-driven mapping rather than hard-coded cell positions
- Automatic cleanup of unpopulated rows

## Placeholder Format

Placeholders use angle brackets: `<placeholder.name>`

### Simple Values

Single values that appear in one or more cells:

```
<interest.rate>        → Interest rate percentage
<loan.amount>          → Loan amount
<property.name>        → Property name
<total.cost>           → Total cost
<profit.total>         → Total profit
<units.count>          → Number of units
```

**Example Usage:**
```
Cell A1: "Interest Rate: <interest.rate>%"
Cell B5: <loan.amount>
Cell C10: "Total: <total.cost>"
```

### Array Placeholders

For arrays of data (costs, plots, etc.), use start/end markers and field placeholders:

**Structure:**
```
<array.start>          → Marks where array insertion begins
<array.field>          → Field placeholders in template row
<array.end>            → Marks where array insertion ends
```

**Example - Costs Array:**
```
Cell B5:  <costs.start>
Cell B6:  <costs.type> | <costs.amount> | <costs.category>
Cell B7:  (empty row with same template)
Cell B8:  (empty row with same template)
...       (more empty rows - template should have extra rows)
Cell B25: <costs.end>
```

**Important:** Include extra rows in your template (e.g., 20 rows when average is 15) to accommodate variable data amounts. Unpopulated rows will be automatically cleaned up.

### Formula Placeholders

Formulas can reference placeholders that will be resolved to cell ranges:

```
=SUM(<costs.amount>)           → Becomes =SUM(B6:B15) after insertion
=AVERAGE(<plots.cost>)         → Becomes =AVERAGE(C10:C13) after insertion
=<total.cost> - <total.revenue> → Becomes =D5 - D10 after replacement
```

**Note:** Formula placeholders are resolved after array insertion, so they can reference dynamically inserted ranges.

## Available Placeholders

### Property Information
- `<property.name>` - Property name
- `<property.address>` - Property address

### Financial Data
- `<interest.rate>` - Interest rate (as decimal, e.g., 0.045)
- `<interest.percentage>` - Interest rate (as percentage, e.g., 4.5)
- `<loan.amount>` - Loan amount
- `<total.cost>` - Total cost
- `<total.revenue>` - Total revenue
- `<profit.total>` - Total profit
- `<profit.percentage>` - Profit percentage

### Cost Arrays
- `<costs>` - Generic costs array
  - `<costs.start>` / `<costs.end>` - Array markers
  - `<costs.type>` - Cost type/name
  - `<costs.amount>` - Cost amount
  - `<costs.category>` - Cost category

- `<professional.fees>` - Professional fees array
  - `<professional.fees.start>` / `<professional.fees.end>` - Array markers
  - `<professional.fees.type>` - Fee type
  - `<professional.fees.amount>` - Fee amount

- `<site.costs>` - Site costs array
  - `<site.costs.start>` / `<site.costs.end>` - Array markers
  - `<site.costs.type>` - Cost type
  - `<site.costs.amount>` - Cost amount

- `<construction.costs>` - Construction costs array
  - `<construction.costs.start>` / `<construction.costs.end>` - Array markers
  - `<construction.costs.type>` - Cost type
  - `<construction.costs.amount>` - Cost amount

### Plots Array
- `<plots>` - Plots array
  - `<plots.start>` / `<plots.end>` - Array markers
  - `<plots.name>` - Plot name
  - `<plots.cost>` - Plot cost
  - `<plots.squareFeet>` - Square footage

### Units
- `<units.count>` - Number of units
- `<units.type>` - Unit type (e.g., "units", "houses", "developments")

## Template Creation Best Practices

### 1. Include Extra Rows

Always include more rows than the average data amount:

```
✅ Good: 20 expense rows when average is 15
❌ Bad: Exactly 15 expense rows
```

Unpopulated rows will be automatically cleaned up.

### 2. Use Clear Markers

Make start/end markers easy to identify:

```
✅ Good: <costs.start> and <costs.end> in separate cells
❌ Bad: Mixing markers with other content in same cell
```

### 3. Template Row Structure

The row between start and end markers serves as the template:

```
<costs.start>
<costs.type> | <costs.amount> | <costs.category>  ← Template row
(empty row - will be populated)
(empty row - will be populated)
...
<costs.end>
```

### 4. Formula Placement

Place formulas after array insertion areas:

```
<costs.start>
<costs.type> | <costs.amount>
...
<costs.end>
=SUM(<costs.amount>)  ← Formula references the array
```

### 5. Multiple Insertion Points

You can use the same placeholder multiple times:

```
Sheet1, Cell A1: <total.cost>
Sheet2, Cell B5: <total.cost>
Both will be populated with the same value
```

## Example Template Structure

```
Sheet: "Summary"
A1: "Property: <property.name>"
A2: "Address: <property.address>"
A5: "Interest Rate: <interest.rate>%"
A6: "Loan Amount: <loan.amount>"

Sheet: "Costs"
A1: "Cost Breakdown"
A3: <costs.start>
A4: <costs.type> | <costs.amount> | <costs.category>
A5: (empty - template row)
A6: (empty - template row)
... (more empty rows)
A23: <costs.end>
A24: "Total: =SUM(<costs.amount>)"

Sheet: "Plots"
A1: "Plots"
A3: <plots.start>
A4: <plots.name> | <plots.cost> | <plots.squareFeet>
A5: (empty - template row)
... (more empty rows)
A15: <plots.end>
```

## Data Mapping

Placeholders are mapped to normalized database fields. The system uses a prioritization system:

- **High Priority (8-10)**: Specific field names like `<professional.fees.amount>`
- **Medium Priority (5-7)**: Generic placeholders like `<expense.amount>`
- **Low Priority (1-4)**: Fallback mappings

When multiple data sources match a placeholder, the highest priority match with available data is used.

## Troubleshooting

### Placeholders Not Replaced

1. Check placeholder spelling (must match exactly, including angle brackets)
2. Verify extracted data contains the corresponding field
3. Check console for unmatched placeholder warnings

### Array Not Inserting

1. Ensure start and end markers are present
2. Verify template row structure matches field placeholders
3. Check that array data exists in extracted data

### Formulas Not Resolving

1. Ensure formulas reference placeholders correctly
2. Place formulas after array insertion areas
3. Check that referenced arrays were successfully inserted

### Too Many/Few Rows

1. Template should have extra rows (will be cleaned up automatically)
2. Check cleanup report in population status bar
3. Verify array data amount matches expectations

## Advanced Usage

### Custom Placeholders

To add custom placeholders, update `placeholderConfigs.ts`:

```typescript
export const STANDARD_PLACEHOLDERS = {
  '<custom.field>': {
    source: 'custom.path.to.data',
    type: 'number',
    format: 'currency',
    priority: 8,
  },
};
```

### Model-Specific Placeholders

Different models can have different placeholder sets:

- `APPRAISAL_MODEL_PLACEHOLDERS` - For appraisal models
- `OPERATING_MODEL_PLACEHOLDERS` - For operating models

Add model-specific placeholders to these configs.

## Support

For questions or issues with template placeholders, check:
1. Console logs for population results
2. Population status bar for matched/unmatched counts
3. Template placeholder guide (this document)

