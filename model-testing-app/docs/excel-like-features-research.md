# Excel-like Quality of Life Features Research

## Overview
This document outlines Excel-like features available in Handsontable and how to implement them for a seamless user experience.

## 1. Keyboard Shortcuts

### Built-in Handsontable Shortcuts
Handsontable provides many Excel-like keyboard shortcuts out of the box:

- **Ctrl+C / Cmd+C**: Copy selected cells
- **Ctrl+V / Cmd+V**: Paste copied cells
- **Ctrl+X / Cmd+X**: Cut selected cells
- **Ctrl+Z / Cmd+Z**: Undo last action
- **Ctrl+Y / Cmd+Y**: Redo last undone action
- **Tab**: Move to next cell (right)
- **Shift+Tab**: Move to previous cell (left)
- **Enter**: Move to cell below
- **Shift+Enter**: Move to cell above
- **Arrow keys**: Navigate between cells
- **Ctrl+Arrow**: Jump to edge of data region
- **Delete / Backspace**: Clear cell content
- **F2**: Enter edit mode on selected cell

### Configuration
Enable keyboard shortcuts through plugins:

```javascript
const hot = new Handsontable(container, {
  // Enable copy/paste functionality
  copyPaste: true,
  
  // Enable undo/redo
  undo: true,
  
  // Enable fill handle (drag to fill)
  fillHandle: true,
  
  // Other settings...
});
```

## 2. Copy/Paste Plugin

### Features
- Copy/paste between cells
- Copy/paste to/from external applications (Excel, Google Sheets)
- Preserve cell formatting during paste
- Smart paste detection (CSV, TSV, plain text)

### Configuration Options
```javascript
copyPaste: {
  columnsLimit: 1000,  // Max columns to copy
  rowsLimit: 1000,     // Max rows to copy
  pasteMode: 'overwrite',  // or 'shift_down', 'shift_right'
  uiContainer: document.body
}
```

### Paste Modes
- `overwrite`: Replace existing data
- `shift_down`: Insert and push cells down
- `shift_right`: Insert and push cells right

## 3. Undo/Redo Plugin

### Features
- Unlimited undo/redo stack
- Tracks all changes (data, structure, formatting)
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y)

### Configuration
```javascript
undoRedo: {
  stepsLimit: 100  // Maximum undo/redo steps to keep in memory
}
```

### Programmatic Control
```javascript
const undoRedoPlugin = hot.getPlugin('undoRedo');

undoRedoPlugin.undo();  // Undo last action
undoRedoPlugin.redo();  // Redo last undone action
undoRedoPlugin.clear();  // Clear undo/redo stack
undoRedoPlugin.isUndoAvailable();  // Check if undo is available
undoRedoPlugin.isRedoAvailable();  // Check if redo is available
```

## 4. Fill Handle Plugin

### Features
- Drag to fill cells horizontally or vertically
- Smart fill patterns (numbers, dates, formulas)
- Auto-increment sequences

### Configuration
```javascript
fillHandle: {
  direction: 'vertical',  // or 'horizontal'
  autoInsertRow: true,    // Auto-insert rows when dragging beyond bottom
  autoInsertColumn: true  // Auto-insert columns when dragging beyond right
}

// Or simple boolean for default behavior
fillHandle: true
```

### Smart Fill Patterns
Handsontable automatically detects patterns:
- Numbers: 1, 2, 3... → 4, 5, 6...
- Dates: Jan 1, Jan 2... → Jan 3, Jan 4...
- Formulas: =A1+B1 → =A2+B2 (relative references)

## 5. Cell Navigation

### Configuration
Navigation is enabled by default. Customize with:

```javascript
enterMoves: { row: 1, col: 0 },  // Move down on Enter
tabMoves: { row: 0, col: 1 },    // Move right on Tab
autoWrapRow: true,                // Wrap to next row at end
autoWrapCol: true                 // Wrap to next column at end
```

### Advanced Navigation
```javascript
// Jump to specific cell programmatically
hot.selectCell(row, col);

// Select range
hot.selectCell(startRow, startCol, endRow, endCol);

// Get current selection
const selected = hot.getSelected();
```

## 6. Cell Selection Improvements

### Multi-Select
Enable non-contiguous cell selection:

```javascript
selectionMode: 'multiple',  // Enable Ctrl+Click multi-select
fragmentSelection: true,    // Enable selection of non-contiguous ranges
```

### Selection Modes
- `'single'`: Only one cell at a time
- `'range'`: Select rectangular ranges
- `'multiple'`: Multiple non-contiguous ranges

## 7. Number Formatting

### Built-in Numeric Renderer
```javascript
columns: [
  {
    type: 'numeric',
    numericFormat: {
      pattern: '$0,0.00',  // Currency format
      culture: 'en-US'
    }
  }
]
```

### Custom Renderers
```javascript
function currencyRenderer(instance, td, row, col, prop, value, cellProperties) {
  Handsontable.renderers.NumericRenderer.apply(this, arguments);
  
  if (value !== null && value !== undefined) {
    td.innerHTML = `$${parseFloat(value).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
  }
  
  if (value < 0) {
    td.style.color = 'red';
  }
}

// Apply to column
columns: [
  { renderer: currencyRenderer }
]
```

### Common Format Patterns
- Currency: `$0,0.00`
- Percentage: `0.00%`
- Thousands: `0,0`
- Decimal: `0.00`
- Scientific: `0.00e+0`

## 8. Auto-complete and Data Validation

### Autocomplete
```javascript
columns: [
  {
    type: 'autocomplete',
    source: ['Option 1', 'Option 2', 'Option 3'],
    strict: true,  // Only allow values from source
    allowInvalid: false
  }
]
```

### Dropdown
```javascript
columns: [
  {
    type: 'dropdown',
    source: ['Yes', 'No', 'Maybe']
  }
]
```

### Custom Validation
```javascript
columns: [
  {
    validator: function(value, callback) {
      if (value > 0 && value < 100) {
        callback(true);  // Valid
      } else {
        callback(false);  // Invalid
      }
    },
    allowInvalid: false
  }
]
```

## 9. Comments Plugin

### Enable Comments
```javascript
comments: true,

// Or with configuration
comments: {
  displayDelay: 250  // Delay before showing comment tooltip
}
```

### Programmatic Comment Management
```javascript
const commentsPlugin = hot.getPlugin('comments');

// Add comment
commentsPlugin.setCommentAtCell(row, col, 'This is a comment');

// Get comment
const comment = commentsPlugin.getCommentAtCell(row, col);

// Remove comment
commentsPlugin.removeCommentAtCell(row, col);

// Show editor
commentsPlugin.showAtCell(row, col);
```

## 10. Freeze Panes (Fixed Rows/Columns)

### Configuration
```javascript
fixedRowsTop: 1,     // Freeze top row (headers)
fixedRowsBottom: 0,  // Freeze bottom rows
fixedColumnsStart: 1 // Freeze left column (row headers)
```

### Use Cases
- Keep headers visible while scrolling
- Lock row labels in place
- Create frozen summary rows

## 11. Custom Borders

### Enable Plugin
```javascript
customBorders: true,

// Or with predefined borders
customBorders: [
  {
    range: {
      from: { row: 1, col: 1 },
      to: { row: 3, col: 3 }
    },
    top: { width: 2, color: '#000' },
    left: { width: 2, color: '#000' },
    bottom: { width: 2, color: '#000' },
    right: { width: 2, color: '#000' }
  }
]
```

### Programmatic Border Management
```javascript
const customBordersPlugin = hot.getPlugin('customBorders');

customBordersPlugin.setBorders([[1, 1, 3, 3]], {
  top: { width: 2, color: 'red' },
  left: { width: 2, color: 'red' },
  bottom: { width: 2, color: 'red' },
  right: { width: 2, color: 'red' }
});

hot.render();  // Apply changes
```

## 12. Merge Cells

### Enable Plugin
```javascript
mergeCells: true,

// Or with predefined merges
mergeCells: [
  { row: 0, col: 0, rowspan: 2, colspan: 2 }
]
```

### Programmatic Merge
```javascript
const mergeCellsPlugin = hot.getPlugin('mergeCells');

// Merge cells
mergeCellsPlugin.merge(startRow, startCol, endRow, endCol);

// Unmerge
mergeCellsPlugin.unmerge(row, col);
```

## 13. Filters Plugin

### Enable Column Filters
```javascript
filters: true,
dropdownMenu: true  // Show filter menu in headers
```

### Programmatic Filtering
```javascript
const filtersPlugin = hot.getPlugin('filters');

// Add condition
filtersPlugin.addCondition(columnIndex, 'gt', [100]);  // Greater than 100

// Apply filters
filtersPlugin.filter();

// Clear filters
filtersPlugin.clearConditions();
```

## Implementation Recommendations

### For WorkbookEditor.tsx and ExcelDataEditor.tsx

1. **Enable Core Plugins**
```javascript
<HotTable
  copyPaste={true}
  undo={true}
  fillHandle={true}
  comments={true}
  customBorders={true}
  mergeCells={false}  // Can interfere with formulas
  filters={!readOnly}
  dropdownMenu={!readOnly}
  // ... other props
/>
```

2. **Add Keyboard Shortcuts Help**
Create a help modal or tooltip showing available shortcuts

3. **Number Formatting UI**
Add a formatting toolbar with options for:
- Currency
- Percentage
- Thousands separator
- Decimal places

4. **Context Menu Enhancement**
Extend context menu with:
- Format cells
- Insert comment
- Add border
- Clear formatting

## Performance Considerations

- **Large Datasets**: Enable virtual rendering
- **Undo/Redo**: Limit stack size for memory efficiency
- **Filters**: Use server-side filtering for large datasets
- **Auto-save**: Debounce save operations

## Browser Compatibility

All features work on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (with touch support)

## References

- [Handsontable Documentation](https://handsontable.com/docs/)
- [Keyboard Shortcuts](https://handsontable.com/docs/javascript-data-grid/keyboard-shortcuts/)
- [Copy/Paste Plugin](https://handsontable.com/docs/javascript-data-grid/copy-paste/)
- [Undo/Redo Plugin](https://handsontable.com/docs/javascript-data-grid/undo-redo/)
- [Fill Handle](https://handsontable.com/docs/javascript-data-grid/autofill-values/)
- [Cell Types](https://handsontable.com/docs/javascript-data-grid/cell-type/)

