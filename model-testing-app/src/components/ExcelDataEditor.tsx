'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import { HyperFormula } from 'hyperformula';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.css';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import FormulaBar from './FormulaBar';
import { CellFormat } from './FormattingToolbar';
import { NumberFormat } from './NumberFormatToolbar';

// Register all Handsontable modules
registerAllModules();

interface ExcelDataEditorProps {
  data?: any; // extractedData from document or scenario data
  onDataChange?: (data: any[][]) => void;
  readOnly?: boolean;
}

export default function ExcelDataEditor({ data, onDataChange, readOnly = false }: ExcelDataEditorProps) {
  const hotTableRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const formulaBarRef = useRef<any>(null);
  const [hotData, setHotData] = useState<any[][]>([]);
  const [tableHeight, setTableHeight] = useState<number>(400);
  const isUpdatingFromProps = useRef(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Formula bar state
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState<string>('');
  const [isEditingInFormulaBar, setIsEditingInFormulaBar] = useState(false);
  const previousSelectedCell = useRef<{ row: number; col: number } | null>(null);
  const previousSelectedRange = useRef<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const isClickingForReference = useRef(false);
  
  // Formatting and zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // Max zoom is 1.0 (100%)
  const [cellFormats, setCellFormats] = useState<Map<string, CellFormat>>(new Map());
  const [numberFormats, setNumberFormats] = useState<Map<string, NumberFormat>>(new Map());

  // Convert extractedData to 2D array format for Handsontable
  useEffect(() => {
    if (data) {
      const converted = convertExtractedDataToArray(data);
      isUpdatingFromProps.current = true;
      setHotData(converted);
      // Reset flag after a short delay to allow Handsontable to update
      setTimeout(() => {
        isUpdatingFromProps.current = false;
      }, 100);
    } else {
      // Default empty spreadsheet
      isUpdatingFromProps.current = true;
      setHotData([['']]);
      setTimeout(() => {
        isUpdatingFromProps.current = false;
      }, 100);
    }
  }, [data]);

  const convertExtractedDataToArray = (extractedData: any): any[][] => {
    const rows: any[][] = [];
    
    // Header row
    rows.push(['Category', 'Item', 'Amount', 'Currency', 'Notes']);
    
    // Cost Categories
    if (extractedData.costCategories) {
      Object.entries(extractedData.costCategories).forEach(([category, catData]: [string, any]) => {
        if (catData?.items && Array.isArray(catData.items)) {
          catData.items.forEach((item: any) => {
            rows.push([
              category,
              item.type || '',
              item.amount || 0,
              item.currency || extractedData.detectedCurrency || '',
              ''
            ]);
          });
          // Subtotal row
          if (catData.subtotal) {
            rows.push([
              category,
              'Subtotal',
              catData.subtotal,
              catData.currency || extractedData.detectedCurrency || '',
              ''
            ]);
          }
        }
      });
    }
    
    // Costs (if not in categories)
    if (extractedData.costs && Array.isArray(extractedData.costs)) {
      extractedData.costs.forEach((cost: any) => {
        rows.push([
          cost.category || '',
          cost.type || '',
          cost.amount || 0,
          cost.currency || extractedData.detectedCurrency || '',
          ''
        ]);
      });
    }
    
    // Plots
    if (extractedData.plots && Array.isArray(extractedData.plots)) {
      extractedData.plots.forEach((plot: any) => {
        rows.push([
          'Plot',
          plot.name || '',
          plot.cost || 0,
          plot.currency || extractedData.detectedCurrency || '',
          plot.squareFeet ? `${plot.squareFeet} sq ft` : ''
        ]);
      });
    }
    
    // Financing
    if (extractedData.financing) {
      if (extractedData.financing.loanAmount) {
        rows.push([
          'Financing',
          'Loan Amount',
          extractedData.financing.loanAmount,
          extractedData.financing.currency || extractedData.detectedCurrency || '',
          ''
        ]);
      }
      if (extractedData.financing.interestRate || extractedData.financing.interestPercentage) {
        const rate = extractedData.financing.interestPercentage || 
                     (extractedData.financing.interestRate ? extractedData.financing.interestRate * 100 : 0);
        rows.push([
          'Financing',
          'Interest Rate',
          rate,
          '%',
          ''
        ]);
      }
    }
    
    // Units
    if (extractedData.units) {
      rows.push([
        'Units',
        extractedData.units.type || 'Units',
        extractedData.units.count || 0,
        '',
        extractedData.units.costPerUnit ? `Cost per unit: ${extractedData.units.costPerUnit}` : ''
      ]);
    }
    
    // Revenue
    if (extractedData.revenue) {
      if (extractedData.revenue.totalSales) {
        rows.push([
          'Revenue',
          'Total Sales',
          extractedData.revenue.totalSales,
          extractedData.revenue.currency || extractedData.detectedCurrency || '',
          ''
        ]);
      }
      if (extractedData.revenue.salesPerUnit) {
        rows.push([
          'Revenue',
          'Sales Per Unit',
          extractedData.revenue.salesPerUnit,
          extractedData.revenue.currency || extractedData.detectedCurrency || '',
          ''
        ]);
      }
    }
    
    // Totals
    if (extractedData.costsTotal) {
      rows.push([
        'TOTAL',
        'Total Costs',
        extractedData.costsTotal.amount,
        extractedData.costsTotal.currency || extractedData.detectedCurrency || '',
        ''
      ]);
    }
    
    // If no data, return empty spreadsheet
    if (rows.length === 1) {
      return [['']];
    }
    
    return rows;
  };

  const handleChange = useCallback((changes: any[] | null, source: string) => {
    // Skip if updating from props or if source is loadData
    if (isUpdatingFromProps.current || source === 'loadData' || !hotTableRef.current) {
      return;
    }
    
    // Update formula bar if cell changed matches selected cell
    if (selectedCell && changes && changes.length > 0) {
      const [row, col] = changes[0];
      if (row === selectedCell.row && col === selectedCell.col) {
        const instance = hotTableRef.current?.hotInstance;
        if (instance) {
          const cellValue = instance.getDataAtCell(row, col);
          setFormulaBarValue(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
        }
      }
    }
    
    // Clear existing debounce timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    
    // Debounce the callback to prevent rapid updates
    debounceTimer.current = setTimeout(() => {
      const instance = hotTableRef.current?.hotInstance;
      if (instance && onDataChange) {
        const newData = instance.getData();
        onDataChange(newData);
      }
    }, 300); // 300ms debounce
  }, [onDataChange, selectedCell]);
  
  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  // Calculate table height based on container
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const newHeight = Math.max(400, rect.height - 10); // Minimum 400px, subtract padding
        setTableHeight(newHeight);
      }
    };
    
    updateHeight();
    
    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    window.addEventListener('resize', updateHeight);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Prevent native browser context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Prevent native context menu in Handsontable area
      if (target.closest('.handsontable')) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('contextmenu', handleContextMenu, true);
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, []);

  // Formula bar handlers
  const handleFormulaBarCommit = useCallback((value: string) => {
    if (!selectedCell || !hotTableRef.current?.hotInstance) return;
    
    const instance = hotTableRef.current.hotInstance;
    instance.setDataAtCell(selectedCell.row, selectedCell.col, value);
    setIsEditingInFormulaBar(false);
  }, [selectedCell]);

  const handleFormulaBarCancel = useCallback(() => {
    setIsEditingInFormulaBar(false);
    // Restore original cell value in formula bar
    if (selectedCell && hotTableRef.current?.hotInstance) {
      const instance = hotTableRef.current.hotInstance;
      const cellValue = instance.getDataAtCell(selectedCell.row, selectedCell.col);
      setFormulaBarValue(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
    }
  }, [selectedCell]);

  // Get current cell format
  const getCurrentCellFormat = useCallback((): CellFormat => {
    if (!selectedCell) return {};
    const cellAddress = XLSX.utils.encode_cell({ r: selectedCell.row, c: selectedCell.col });
    return cellFormats.get(cellAddress) || {};
  }, [selectedCell, cellFormats]);

  // Get current number format
  const getCurrentNumberFormat = useCallback((): NumberFormat => {
    if (!selectedCell) return { type: 'general' };
    const cellAddress = XLSX.utils.encode_cell({ r: selectedCell.row, c: selectedCell.col });
    return numberFormats.get(cellAddress) || { type: 'general' };
  }, [selectedCell, numberFormats]);

  // Handle number format change - supports multi-cell selection
  const handleNumberFormatChange = useCallback((format: NumberFormat) => {
    if (!selectedCell || !hotTableRef.current?.hotInstance) return;
    
    const instance = hotTableRef.current.hotInstance;
    
    // Determine which cells to format
    let cellsToFormat: Array<{ row: number; col: number }> = [];
    
    if (selectedRange && (selectedRange.startRow !== selectedRange.endRow || selectedRange.startCol !== selectedRange.endCol)) {
      // Multi-cell selection - format all cells in range
      const minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
      const maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
      const minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
      const maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);
      
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          cellsToFormat.push({ row, col });
        }
      }
    } else {
      // Single cell selection
      cellsToFormat.push({ row: selectedCell.row, col: selectedCell.col });
    }
    
    // Update number format state for all cells
    setNumberFormats(prev => {
      const newFormats = new Map(prev);
      
      cellsToFormat.forEach(({ row, col }) => {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        newFormats.set(cellAddress, format);
      });
      
      return newFormats;
    });

    // Apply number formatting to all selected cells
    cellsToFormat.forEach(({ row, col }) => {
      instance.setCellMeta(row, col, 'type', 'numeric');
      instance.setCellMeta(row, col, 'format', format);
    });

    // Render to apply formatting - use setTimeout to preserve selection
    setTimeout(() => {
      instance.render();
      // Restore selection after render
      if (selectedRange) {
        instance.selectCell(
          selectedRange.startRow, 
          selectedRange.startCol, 
          selectedRange.endRow, 
          selectedRange.endCol
        );
      } else if (selectedCell) {
        instance.selectCell(selectedCell.row, selectedCell.col);
      }
    }, 0);
  }, [selectedCell, selectedRange]);

  // Handle formatting change - supports multi-cell selection
  const handleFormatChange = useCallback((format: CellFormat) => {
    if (!selectedCell) return;
    
    const instance = hotTableRef.current?.hotInstance;
    if (!instance) return;
    
    // Determine which cells to format
    let cellsToFormat: Array<{ row: number; col: number }> = [];
    
    if (selectedRange && (selectedRange.startRow !== selectedRange.endRow || selectedRange.startCol !== selectedRange.endCol)) {
      // Multi-cell selection - format all cells in range
      const minRow = Math.min(selectedRange.startRow, selectedRange.endRow);
      const maxRow = Math.max(selectedRange.startRow, selectedRange.endRow);
      const minCol = Math.min(selectedRange.startCol, selectedRange.endCol);
      const maxCol = Math.max(selectedRange.startCol, selectedRange.endCol);
      
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          cellsToFormat.push({ row, col });
        }
      }
    } else {
      // Single cell selection
      cellsToFormat.push({ row: selectedCell.row, col: selectedCell.col });
    }
    
    // Update format state for all cells
    setCellFormats(prev => {
      const newFormats = new Map(prev);
      
      cellsToFormat.forEach(({ row, col }) => {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        newFormats.set(cellAddress, format);
      });
      
      return newFormats;
    });

    // Apply formatting to all selected cells
    cellsToFormat.forEach(({ row, col }) => {
      instance.setCellMeta(row, col, 'renderer', function(instance: any, td: HTMLElement) {
        // Use default text renderer first
        Handsontable.renderers.TextRenderer.apply(this, arguments as any);
    
        // Apply formatting
        if (format.bold) td.style.fontWeight = 'bold';
        if (format.italic) td.style.fontStyle = 'italic';
        if (format.underline) td.style.textDecoration = 'underline';
        if (format.textColor) td.style.color = format.textColor;
        if (format.backgroundColor) td.style.backgroundColor = format.backgroundColor;
      });
    });

    // Render to apply formatting - use setTimeout to preserve selection
    setTimeout(() => {
      instance.render();
      // Restore selection after render
      if (selectedRange) {
        instance.selectCell(
          selectedRange.startRow, 
          selectedRange.startCol, 
          selectedRange.endRow, 
          selectedRange.endCol
        );
      } else if (selectedCell) {
        instance.selectCell(selectedCell.row, selectedCell.col);
      }
    }, 0);
  }, [selectedCell, selectedRange]);

  // Helper function to format dates
  const formatDate = (date: Date, format: string): string => {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    switch (format) {
      case 'MM/DD/YYYY':
        return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
      case 'DD/MM/YYYY':
        return `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      case 'MMM DD, YYYY':
        return `${monthNames[month - 1]} ${day}, ${year}`;
      case 'DD MMM YYYY':
        return `${day} ${monthNames[month - 1]} ${year}`;
      default:
        return date.toLocaleDateString();
    }
  };

  // Helper function to format numbers based on NumberFormat
  const formatNumberValue = (value: any, numberFormat: NumberFormat | undefined): string | null => {
    if (!numberFormat || numberFormat.type === 'general') return null;
    
    if (value === null || value === undefined || value === '') return null;
    
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue)) return null;
    
    if (numberFormat.type === 'currency') {
      const decimals = numberFormat.decimals ?? 2;
      const symbol = numberFormat.currencySymbol || '$';
      const withSeparator = numberFormat.thousandsSeparator !== false;
      
      let formattedValue = numValue.toFixed(decimals);
      if (withSeparator) {
        const parts = formattedValue.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formattedValue = parts.join('.');
      }
      return symbol + formattedValue;
    } else if (numberFormat.type === 'percentage') {
      const decimals = numberFormat.decimals ?? 2;
      return (numValue * 100).toFixed(decimals) + '%';
    } else if (numberFormat.type === 'number') {
      const decimals = numberFormat.decimals ?? 2;
      let formattedValue = numValue.toFixed(decimals);
      if (numberFormat.thousandsSeparator !== false) {
        const parts = formattedValue.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        formattedValue = parts.join('.');
      }
      return formattedValue;
    } else if (numberFormat.type === 'date') {
      const date = new Date(numValue);
      if (!isNaN(date.getTime())) {
        const format = numberFormat.dateFormat || 'MM/DD/YYYY';
        return formatDate(date, format);
      }
    }
    
    return null;
  };

  return (
    <div className="flex flex-col h-full" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      {/* Formula Bar Wrapper - NO ZOOM, fixed container with horizontal scroll */}
      <div className="formula-bar-wrapper">
      <FormulaBar
        ref={formulaBarRef}
        selectedCell={selectedCell}
        cellValue={formulaBarValue}
        onCommit={handleFormulaBarCommit}
        onCancel={handleFormulaBarCancel}
        readOnly={readOnly}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        currentFormat={getCurrentCellFormat()}
        onFormatChange={handleFormatChange}
        currentNumberFormat={getCurrentNumberFormat()}
        onNumberFormatChange={handleNumberFormatChange}
      />
      </div>
      
      <div className="flex items-center justify-between p-2 border-b border-gray-200">
        <div className="text-xs text-gray-500">
          Tip: Use formulas like <code className="px-1 py-0.5 bg-gray-100 rounded">=SUM(A1:A5)</code>
        </div>
      </div>
      
      {/* Table Area - ZOOMED, in its own isolated context */}
      <div style={{ 
        flex: 1, 
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0
      }}>
      {/* Outer scroll container - maintains fixed size */}
      <div 
        className="flex-1 relative" 
        style={{ 
          height: '100%', 
          minHeight: 0,
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          overflow: 'auto',
          maxHeight: '100%',
          contain: 'layout style paint',
          boxSizing: 'border-box',
          flexShrink: 1,
          flexBasis: 0
        }}
      >
        {/* Inner zoom container - applies zoom */}
        <div 
          ref={containerRef}
          style={{
            zoom: zoomLevel,
            width: '100%',
            height: '100%',
            minWidth: 0,
            maxWidth: '100%'
          }}
        >
        <HotTable
          ref={hotTableRef}
          data={hotData}
          colHeaders={true}
          rowHeaders={true}
          width="100%"
          height={tableHeight}
          style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
          licenseKey="non-commercial-and-evaluation"
          readOnly={readOnly}
          // Enable Excel-like features (carefully to avoid conflicts)
          copyPaste={true}
          undo={true}
          fillHandle={readOnly ? false : {
            direction: 'vertical',
            autoInsertRow: true
          }}
          comments={false}
          customBorders={false}
          afterChange={handleChange}
          afterSelection={(r: number, c: number, r2?: number, c2?: number) => {
            // Don't update selection when in formula mode
            const isInFormulaMode = formulaBarRef.current?.isFormulaMode?.();
            if (isInFormulaMode) {
              return; // Ignore selection changes during formula mode
            }
            
            // r2 and c2 are the end coordinates of the selection (for multi-cell selection)
            const endRow = r2 !== undefined ? r2 : r;
            const endCol = c2 !== undefined ? c2 : c;
            
            const newRange = { startRow: r, startCol: c, endRow, endCol };
            
            // Check if cell or range actually changed to prevent infinite loops
            const cellChanged = !previousSelectedCell.current || 
                previousSelectedCell.current.row !== r || 
                previousSelectedCell.current.col !== c;
            
            const rangeChanged = !previousSelectedRange.current ||
                previousSelectedRange.current.startRow !== r ||
                previousSelectedRange.current.startCol !== c ||
                previousSelectedRange.current.endRow !== endRow ||
                previousSelectedRange.current.endCol !== endCol;
            
            if (cellChanged || rangeChanged) {
              previousSelectedCell.current = { row: r, col: c };
              previousSelectedRange.current = newRange;
              setSelectedCell({ row: r, col: c });
              setSelectedRange(newRange);
              
              // Update formula bar value
              const instance = hotTableRef.current?.hotInstance;
              if (instance) {
                const cellValue = instance.getDataAtCell(r, c);
                setFormulaBarValue(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
              }
            }
          }}
          afterSelectionEnd={(r: number, c: number, r2: number, c2: number) => {
            // Update editing state based on formula mode
            if (formulaBarRef.current?.isFormulaMode?.()) {
              setIsEditingInFormulaBar(true);
            } else {
              setIsEditingInFormulaBar(false);
            }
          }}
          beforeOnCellMouseDown={(event: MouseEvent, coords: any, td: HTMLElement) => {
            console.log('beforeOnCellMouseDown triggered'); // Debug
            
            const isInFormulaMode = formulaBarRef.current?.isFormulaMode?.();
            console.log('isFormulaMode:', isInFormulaMode); // Debug
            console.log('selectedCell:', selectedCell); // Debug
            
            if (isInFormulaMode && selectedCell) {
              console.log('Inside formula mode block'); // Debug
              
              // Completely block cell selection during formula mode
              event.stopImmediatePropagation();
              event.preventDefault();
              
              const instance = hotTableRef.current?.hotInstance;
              if (!instance) {
                console.log('No instance'); // Debug
                return false;
              }
              
              const cellCoords = instance.getCoords(td);
              console.log('cellCoords:', cellCoords); // Debug
              
              // cellCoords is a CellCoords object with .row and .col properties, not an array!
              if (!cellCoords || cellCoords.row === undefined || cellCoords.col === undefined) {
                console.log('Invalid cellCoords'); // Debug
                return false;
              }
              
              const row = cellCoords.row;
              const col = cellCoords.col;
              
              console.log('row:', row, 'col:', col); // Debug
              
              // Get cell reference
              const getColumnLetter = (colIndex: number): string => {
                let result = '';
                colIndex += 1;
                while (colIndex > 0) {
                  colIndex -= 1;
                  result = String.fromCharCode(65 + (colIndex % 26)) + result;
                  colIndex = Math.floor(colIndex / 26);
                }
                return result;
              };
              const colLetter = getColumnLetter(col);
              const cellRef = `${colLetter}${row + 1}`;
              
              console.log('Adding cell reference:', cellRef); // Debug
              
              // Add to formula bar
              if (formulaBarRef.current) {
                console.log('Calling appendText'); // Debug
                formulaBarRef.current.appendText(cellRef);
              } else {
                console.log('No formulaBarRef'); // Debug
              }
              
              return false; // Block selection
            }
            
            console.log('Not in formula mode, returning true'); // Debug
            return true;
          }}
          afterOnCellMouseUp={(event: MouseEvent, coords: any, td: HTMLElement) => {
            const isInFormulaMode = formulaBarRef.current?.isFormulaMode?.();
            
            if (isInFormulaMode && selectedCell) {
              // After mouse up, immediately refocus the formula bar to prevent blur commit
              if (formulaBarRef.current) {
                formulaBarRef.current.focus();
              }
            }
          }}
          contextMenu={!readOnly ? {
            items: {
              row_above: {
                name: 'Insert row above'
              },
              row_below: {
                name: 'Insert row below'
              },
              col_left: {
                name: 'Insert column left'
              },
              col_right: {
                name: 'Insert column right'
              },
              remove_row: {
                name: 'Remove row'
              },
              remove_col: {
                name: 'Remove column'
              },
              separator1: '---------',
              copy: {
                name: 'Copy'
              },
              cut: {
                name: 'Cut'
              },
              paste: {
                name: 'Paste'
              },
              separator2: '---------',
              clear_formatting: {
                name: 'Clear formatting',
                callback: function() {
                  const instance = this;
                  const selected = instance.getSelected();
                  if (selected && selected.length > 0) {
                    const [r1, c1, r2, c2] = selected[0];
                    
                    // Clear formatting for selected cells
                    setCellFormats(prev => {
                      const newFormats = new Map(prev);
                      
                      for (let row = r1; row <= r2; row++) {
                        for (let col = c1; col <= c2; col++) {
                          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                          newFormats.delete(cellAddress);
                        }
                      }
                      return newFormats;
                    });
                    
                    // Clear number formats
                    setNumberFormats(prev => {
                      const newFormats = new Map(prev);
                      
                      for (let row = r1; row <= r2; row++) {
                        for (let col = c1; col <= c2; col++) {
                          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                          newFormats.delete(cellAddress);
                          instance.setCellMeta(row, col, 'type', 'text');
                        }
                      }
                      return newFormats;
                    });
                    
                    instance.render();
                  }
                }
              }
            }
          } : false}
          manualColumnResize={true}
          manualRowResize={true}
          formulas={{
            engine: HyperFormula,
            sheetName: 'Sheet1'
          }}
          stretchH="all"
          className="handsontable-container"
          allowInsertRow={!readOnly}
          allowInsertColumn={!readOnly}
          allowRemoveRow={!readOnly}
          allowRemoveColumn={!readOnly}
          enterBeginsEditing={true}
          fillHandle={!readOnly}
          autoWrapRow={true}
          autoWrapCol={true}
          cells={(row: number, col: number) => {
            const cellMeta: any = {};
            const cellValue = hotData[row]?.[col];
            const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
            const userFormat = cellFormats.get(cellAddress);
            const numberFormat = numberFormats.get(cellAddress);
            
            // Check if this cell contains a formula
            if (typeof cellValue === 'string' && cellValue.trim().startsWith('=')) {
              cellMeta.renderer = function(instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any, cellProperties: any) {
                // Use default text renderer
                Handsontable.renderers.TextRenderer.apply(this, arguments as any);
                // Then style it for formulas - Excel-like blue background
                if (!userFormat?.backgroundColor) {
                td.style.backgroundColor = '#e7f3ff';
                td.style.color = '#0066cc';
                }
                td.style.fontStyle = 'italic';
                td.setAttribute('data-formula', 'true');
                
                // Apply user formatting
                if (userFormat) {
                  if (userFormat.bold) td.style.fontWeight = 'bold';
                  if (userFormat.italic) td.style.fontStyle = 'italic';
                  if (userFormat.underline) td.style.textDecoration = 'underline';
                  if (userFormat.textColor) td.style.color = userFormat.textColor;
                  if (userFormat.backgroundColor) td.style.backgroundColor = userFormat.backgroundColor;
                }
                
                // Apply number formatting
                const formattedNumber = formatNumberValue(instance.getDataAtCell(row, col), numberFormat);
                if (formattedNumber !== null) {
                  td.textContent = formattedNumber;
                }
              };
            } else if (userFormat || numberFormat) {
              // User formatting without formula
              cellMeta.renderer = function(instance: any, td: HTMLElement) {
                Handsontable.renderers.TextRenderer.apply(this, arguments as any);
                if (userFormat) {
                  if (userFormat.bold) td.style.fontWeight = 'bold';
                  if (userFormat.italic) td.style.fontStyle = 'italic';
                  if (userFormat.underline) td.style.textDecoration = 'underline';
                  if (userFormat.textColor) td.style.color = userFormat.textColor;
                  if (userFormat.backgroundColor) td.style.backgroundColor = userFormat.backgroundColor;
                }
                
                // Apply number formatting
                const formattedNumber = formatNumberValue(instance.getDataAtCell(row, col), numberFormat);
                if (formattedNumber !== null) {
                  td.textContent = formattedNumber;
                }
              };
            }
            return cellMeta;
          }}
          afterFormulasValuesUpdate={() => {
            // Style formula cells after formulas are calculated - use requestAnimationFrame to avoid scroll reset
            requestAnimationFrame(() => {
              if (hotTableRef.current?.hotInstance) {
                const instance = hotTableRef.current.hotInstance;
                const formulasPlugin = instance.getPlugin('formulas');
                if (formulasPlugin) {
                  try {
                    const data = instance.getData();
                    data.forEach((row: any[], rowIndex: number) => {
                      row.forEach((cellValue: any, colIndex: number) => {
                        // Check source data for formulas
                        try {
                          const sourceData = instance.getSourceDataAtCell(rowIndex, colIndex);
                          if (typeof sourceData === 'string' && sourceData.trim().startsWith('=')) {
                            const cell = instance.getCell(rowIndex, colIndex);
                            if (cell) {
                              (cell as HTMLElement).style.backgroundColor = '#e7f3ff';
                              (cell as HTMLElement).style.color = '#0066cc';
                              (cell as HTMLElement).style.fontStyle = 'italic';
                              (cell as HTMLElement).setAttribute('data-formula', 'true');
                            }
                          }
                        } catch (e) {
                          // Ignore errors
                        }
                      });
                    });
                  } catch (e) {
                    // Ignore errors
                  }
                }
              }
            });
          }}
          afterRender={(isForced: boolean) => {
            // Style formula cells after render - but don't force re-render or reset scroll
            if (!isForced && hotTableRef.current?.hotInstance) {
              const instance = hotTableRef.current.hotInstance;
              // Save scroll position
              const scrollTop = instance.rootElement.querySelector('.ht_master .wtHolder')?.scrollTop || 0;
              
              requestAnimationFrame(() => {
                if (hotTableRef.current?.hotInstance) {
                  const instance = hotTableRef.current.hotInstance;
                  try {
                    const data = instance.getData();
                    data.forEach((row: any[], rowIndex: number) => {
                      row.forEach((cellValue: any, colIndex: number) => {
                        // Check source data for formulas
                        try {
                          const sourceData = instance.getSourceDataAtCell(rowIndex, colIndex);
                          if (typeof sourceData === 'string' && sourceData.trim().startsWith('=')) {
                            const cell = instance.getCell(rowIndex, colIndex);
                            if (cell) {
                              (cell as HTMLElement).style.backgroundColor = '#e7f3ff';
                              (cell as HTMLElement).style.color = '#0066cc';
                              (cell as HTMLElement).style.fontStyle = 'italic';
                              (cell as HTMLElement).setAttribute('data-formula', 'true');
                            }
                          }
                        } catch (e) {
                          // Ignore errors
                        }
                      });
                    });
                    
                    // Restore scroll position
                    const holder = instance.rootElement.querySelector('.ht_master .wtHolder') as HTMLElement;
                    if (holder && scrollTop > 0) {
                      holder.scrollTop = scrollTop;
                    }
                  } catch (e) {
                    // Ignore errors
                  }
                }
              });
            }
          }}
        />
        </div>
      </div>
      </div>
    </div>
  );
}

