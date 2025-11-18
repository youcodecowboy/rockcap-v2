# Test Template Guide - Operating Model

## Overview

This guide explains how to test the placeholder mapping system using the simple operating model test template.

## Test Template Location

The test template is located at: `/public/test-template-operating.xlsx`

## Template Structure

The template contains a simple cost breakdown table with placeholders for:

1. **Site Costs** - `<site.costs.start>` to `<site.costs.end>`
   - Template row: `<site.costs.type>` | `<site.costs.amount>`
   - Subtotal: `<site.costs.subtotal>`

2. **Net Construction Costs** - `<construction.costs.start>` to `<construction.costs.end>`
   - Template row: `<construction.costs.type>` | `<construction.costs.amount>`
   - Subtotal: `<construction.costs.subtotal>`

3. **Professional Fees** - `<professional.fees.start>` to `<professional.fees.end>`
   - Template row: `<professional.fees.type>` | `<professional.fees.amount>`
   - Subtotal: `<professional.fees.subtotal>`

4. **Financing/Legal Fees** - `<financing.legal.fees.start>` to `<financing.legal.fees.end>`
   - Template row: `<financing.legal.fees.type>` | `<financing.legal.fees.amount>`
   - Subtotal: `<financing.legal.fees.subtotal>`

5. **Disposal Fees** - `<disposal.fees.start>` to `<disposal.fees.end>`
   - Template row: `<disposal.fees.type>` | `<disposal.fees.amount>`
   - Subtotal: `<disposal.fees.subtotal>`

6. **Total Costs** - `<total.cost>`

## How to Test

1. **Select a Project**: 
   - Go to the Modeling page
   - Select a project that has extracted Excel data (like "Lonnen Road" or "Crews Hill")

2. **Load the Template**:
   - Click the "Run Operating Model" button
   - The template will load and automatically populate with extracted data

3. **Verify Results**:
   - Check that placeholders are replaced with actual values
   - Verify that array data (cost items) are inserted correctly
   - Check that subtotals are populated
   - Verify that empty rows are cleaned up

4. **Check Console**:
   - Open browser console to see:
     - Matched placeholders
     - Unmatched placeholders (if any)
     - Cleanup report (rows hidden/deleted)

## Expected Behavior

### Successful Population:
- Placeholders like `<site.costs.type>` should be replaced with actual cost names
- Placeholders like `<site.costs.amount>` should be replaced with actual amounts
- Subtotal placeholders should show category subtotals
- Total cost placeholder should show the overall total
- Empty template rows should be removed/hidden

### Array Insertion:
- If there are 3 site costs in the extracted data, 3 rows should appear
- If there are 5 professional fees, 5 rows should appear
- Extra empty rows should be cleaned up

### Data Mapping:
- Data is mapped from `costCategories.siteCosts.items` → Site Costs section
- Data is mapped from `costCategories.professionalFees.items` → Professional Fees section
- And so on for each category

## Troubleshooting

### No Data Appearing:
- Check that the project has extracted data
- Check browser console for errors
- Verify that `costCategories` exists in the extracted data

### Placeholders Not Replaced:
- Check console for unmatched placeholders
- Verify placeholder spelling matches exactly (including angle brackets)
- Check that the data path exists in extracted data

### Array Not Inserting:
- Verify start and end markers are present
- Check that array data exists in `costCategories`
- Look for errors in console

## Next Steps

Once this simple template works correctly, we can:
1. Test with more complex templates
2. Add formulas that reference placeholders
3. Test with the full appraisal model template
4. Add more placeholder mappings as needed

