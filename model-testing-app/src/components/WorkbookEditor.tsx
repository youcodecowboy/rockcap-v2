'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import { HyperFormula } from 'hyperformula';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.css';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FormulaBar from './FormulaBar';
import { CellFormat } from './FormattingToolbar';
import { NumberFormat } from './NumberFormatToolbar';
import { SheetData, CellStyle } from '@/lib/templateLoader';
import * as XLSX from 'xlsx';
import { registerFormulasWithEngine, logFormulaRegistrationResult } from '@/lib/formulaRegistrar';
import { auditFormulaRecognition, logFormulaRecognitionReport } from '@/lib/formulaRecognitionAuditor';

// Register all Handsontable modules
registerAllModules();

interface WorkbookEditorProps {
  sheets: SheetData[];
  onDataChange?: (sheetName: string, data: any[][]) => void;
  readOnly?: boolean;
  activeSheet?: string; // Optional: control active sheet externally
  hideTabs?: boolean; // Optional: hide internal tabs when controlled externally
  onExportMetadataReady?: (metadata: {
    hyperFormulaEngine: HyperFormula | null;
    cellFormats: Map<string, Map<string, CellFormat>>;
    numberFormats: Map<string, Map<string, NumberFormat>>;
    columnWidths: Map<string, { [col: number]: number }>;
  }) => void;
}

export default function WorkbookEditor({ 
  sheets, 
  onDataChange, 
  readOnly = false, 
  activeSheet: externalActiveSheet, 
  hideTabs = false,
  onExportMetadataReady
}: WorkbookEditorProps) {
  // Debug: Log when component receives props
  useEffect(() => {
    console.log('[WorkbookEditor] Component mounted/updated with props:', {
      sheetsCount: sheets?.length,
      externalActiveSheet,
      hideTabs,
      readOnly,
      sheetsData: sheets?.map(s => ({ name: s.name, dataLength: s.data?.length })),
    });
  }, [sheets?.length, externalActiveSheet, hideTabs, readOnly]);
  
  const [internalActiveSheet, setInternalActiveSheet] = useState<string>(sheets[0]?.name || 'Sheet1');
  const activeSheet = externalActiveSheet || internalActiveSheet;
  const setActiveSheet = externalActiveSheet ? (() => {}) : setInternalActiveSheet;
  const [tableHeight, setTableHeight] = useState<number | undefined>(undefined); // Let it auto-calculate
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0); // Max zoom is 1.0 (100%)
  // Store cell formats: sheetName -> cellAddress -> format
  const [cellFormats, setCellFormats] = useState<Map<string, Map<string, CellFormat>>>(new Map());
  // Store number formats: sheetName -> cellAddress -> format
  const [numberFormats, setNumberFormats] = useState<Map<string, Map<string, NumberFormat>>>(new Map());
  // Store column widths: sheetName -> columnIndex -> width
  const [columnWidths, setColumnWidths] = useState<Map<string, { [col: number]: number }>>(new Map());
  
  const hotTableRefs = useRef<Map<string, any>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const formulaBarRef = useRef<any>(null);
  const hyperFormulaEngine = useRef<HyperFormula | null>(null);
  
  // Helper to check if Handsontable instance is ready
  const isInstanceReady = useCallback((ref: any): boolean => {
    if (!ref) return false;
    if (!ref.hotInstance) return false;
    try {
      // Check if instance is destroyed or not fully initialized
      if (ref.hotInstance.isDestroyed === true) return false;
      // Check if sheetMapping exists (indicates instance is fully initialized)
      if (!ref.hotInstance.view || !ref.hotInstance.view.wt) return false;
      return true;
    } catch (error) {
      return false;
    }
  }, []);
  const previousSelectedCell = useRef<{ row: number; col: number } | null>(null);
  const previousSelectedRange = useRef<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const isInitializing = useRef<boolean>(true);
  const onDataChangeRef = useRef(onDataChange);
  const lastUpdateTime = useRef<Map<string, number>>(new Map());
  
  // Calculate table height from container using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const calculateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Get the formula bar height
        const formulaBar = containerRef.current.querySelector('.formula-bar-wrapper');
        const formulaBarHeight = formulaBar ? formulaBar.getBoundingClientRect().height : 0;
        
        // Calculate available height for table (container height minus formula bar)
        const calculatedHeight = rect.height - formulaBarHeight;
        
        if (calculatedHeight > 0) {
          setTableHeight(prevHeight => {
            // Only update if height changed significantly (more than 10px difference)
            if (!prevHeight || Math.abs(prevHeight - calculatedHeight) > 10) {
              console.log('[WorkbookEditor] Calculated table height:', calculatedHeight, '(container:', rect.height, 'formula bar:', formulaBarHeight, ')');
              return calculatedHeight;
            }
            return prevHeight;
          });
        }
      }
    };

    // Use ResizeObserver for better accuracy
    const resizeObserver = new ResizeObserver(() => {
      calculateHeight();
    });

    resizeObserver.observe(containerRef.current);

    // Also calculate immediately and after delays
    calculateHeight();
    const timeoutId = setTimeout(calculateHeight, 100);
    const timeoutId2 = setTimeout(calculateHeight, 500);
    const timeoutId3 = setTimeout(calculateHeight, 1000);
    
    // Recalculate on window resize as backup
    window.addEventListener('resize', calculateHeight);
    
    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      clearTimeout(timeoutId3);
      window.removeEventListener('resize', calculateHeight);
    };
  }, [activeSheet]);

  // Refresh Handsontable dimensions when zoom changes
  useEffect(() => {
    // Small delay to ensure DOM has updated
    const timeoutId = setTimeout(() => {
      hotTableRefs.current.forEach((ref) => {
        if (isInstanceReady(ref)) {
          try {
            ref.hotInstance.refreshDimensions();
          } catch (error) {
            console.warn('Error refreshing Handsontable dimensions:', error);
          }
        }
      });
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [zoomLevel, tableHeight, isInstanceReady]);
  
  // Keep ref in sync with prop
  useEffect(() => {
    onDataChangeRef.current = onDataChange;
  }, [onDataChange]);
  
  // Track if we've already notified parent to prevent infinite loops
  const hasNotifiedExportMetadata = useRef(false);
  
  // Notify parent of export metadata when available
  useEffect(() => {
    if (onExportMetadataReady && hyperFormulaEngine.current && !hasNotifiedExportMetadata.current) {
      // Merge sheet column widths with user-set widths
      const mergedColumnWidths = new Map<string, { [col: number]: number }>();
      sheets.forEach(sheet => {
        const userWidths = columnWidths.get(sheet.name) || {};
        const sheetWidths = sheet.columnWidths || {};
        mergedColumnWidths.set(sheet.name, { ...sheetWidths, ...userWidths });
      });
      
      onExportMetadataReady({
        hyperFormulaEngine: hyperFormulaEngine.current,
        cellFormats,
        numberFormats,
        columnWidths: mergedColumnWidths,
      });
      
      hasNotifiedExportMetadata.current = true;
    }
  }, [onExportMetadataReady, cellFormats, numberFormats, columnWidths, sheets]);
  
  // Reset notification flag when sheets change significantly
  useEffect(() => {
    hasNotifiedExportMetadata.current = false;
  }, [sheets.length]);
  
  // Mark initialization as complete after first render
  useEffect(() => {
    if (sheets.length > 0) {
      setTimeout(() => {
        isInitializing.current = false;
      }, 100);
    }
  }, [sheets.length]);

  // Track sheet state to detect actual changes
  const previousSheetsStateRef = useRef<string>('');
  
  // Initialize HyperFormula engine with all sheets - optimized for large sheets
  useEffect(() => {
    if (sheets.length === 0) return;

    // Create a stable key from sheet names and data lengths to detect actual changes
    const currentSheetsState = sheets.map(s => `${s.name}:${s.data.length}`).sort().join('|');
    const sheetsStateChanged = previousSheetsStateRef.current !== currentSheetsState;
    const isFirstInit = !hyperFormulaEngine.current;
    
    // Only re-initialize if sheets actually changed (names or data) or if engine doesn't exist yet
    if (isFirstInit || sheetsStateChanged) {
      previousSheetsStateRef.current = currentSheetsState;
      
      // Mark as initializing when sheets change
      isInitializing.current = true;

      // Use requestIdleCallback or setTimeout to defer heavy computation
      const initEngine = () => {
        try {
          // Destroy existing engine if present
          if (hyperFormulaEngine.current) {
            try {
              hyperFormulaEngine.current.destroy();
            } catch (e) {
              // Ignore cleanup errors
            }
          }

          // Build sheets object for HyperFormula
          const sheetsData: { [key: string]: any[][] } = {};
          sheets.forEach(sheet => {
            // Only include sheets with data (skip empty placeholders)
            if (sheet.data && sheet.data.length > 0) {
              // Limit data size for HyperFormula - only include first 5000 rows per sheet for performance
              const maxRows = 5000;
              const limitedData = sheet.data.length > maxRows 
                ? sheet.data.slice(0, maxRows)
                : sheet.data;
              sheetsData[sheet.name] = limitedData;
            }
          });

          // Only create engine if we have sheets with data
          if (Object.keys(sheetsData).length > 0) {
            // Create HyperFormula engine with performance optimizations
            hyperFormulaEngine.current = HyperFormula.buildFromSheets(sheetsData, {
              // Disable some features for better performance with large sheets
              useArrayArithmetic: false,
              useColumnIndex: false,
            });

            // Explicitly register all formulas to ensure they're recognized
            // Only log on first initialization to avoid performance hit
            if (isFirstInit) {
              console.log('[WorkbookEditor] Registering formulas with HyperFormula engine...');
            }
            
            // Always register formulas, but only log on first init
            const registrationResult = registerFormulasWithEngine(hyperFormulaEngine.current, sheets);
            
            if (isFirstInit) {
              logFormulaRegistrationResult(registrationResult);

              // Audit formula recognition after registration (only on first init)
              console.log('[WorkbookEditor] Auditing formula recognition...');
              const auditReport = auditFormulaRecognition(hyperFormulaEngine.current, sheets);
              logFormulaRecognitionReport(auditReport);
            }
          }

          // Mark initialization complete after engine is created
          setTimeout(() => {
            isInitializing.current = false;
          }, 200);
        } catch (error) {
          console.error('Error initializing HyperFormula:', error);
          isInitializing.current = false;
        }
      };

      // Defer initialization to avoid blocking UI
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(initEngine, { timeout: 1000 });
      } else {
        setTimeout(initEngine, 100);
      }
    }
  }, [sheets]); // Depend on sheets array, but use ref to detect actual changes

  // No need to calculate height - using 100% height with flex layout instead

  const handleDataChange = useCallback((sheetName: string) => {
    return (changes: any[] | null, source: string) => {
      // Ignore programmatic changes and initial load
      if (source === 'loadData' || source === 'updateData' || source === 'Autofill.fill' || isInitializing.current) {
        return;
      }
      
      // Only handle user-initiated changes
      if (changes && changes.length > 0) {
        const now = Date.now();
        const lastUpdate = lastUpdateTime.current.get(sheetName) || 0;
        
        // Throttle updates - max once per 200ms per sheet
        if (now - lastUpdate < 200) {
          return;
        }
        
        const hotRef = hotTableRefs.current.get(sheetName);
        if (isInstanceReady(hotRef) && onDataChangeRef.current) {
          const newData = hotRef.hotInstance.getData();
          lastUpdateTime.current.set(sheetName, now);
          
          // Debounce to prevent rapid-fire updates
          setTimeout(() => {
            if (!isInitializing.current && onDataChangeRef.current) {
              onDataChangeRef.current(sheetName, newData);
            }
          }, 150);
        }
      }
    };
  }, []); // No dependencies - using refs

  // Helper function to get display value for formula bar (formula text if formula, otherwise cell value)
  const getFormulaBarDisplayValue = useCallback((row: number, col: number, sheetName?: string): string => {
    const targetSheet = sheetName || activeSheet;
    if (!targetSheet) return '';
    const hotRef = hotTableRefs.current.get(targetSheet);
    if (!isInstanceReady(hotRef)) return '';
    
    // Check if cell has a formula - if so, show formula text instead of evaluated value
    if (hyperFormulaEngine.current) {
      try {
        const currentSheet = sheets.find(s => s.name === targetSheet);
        if (currentSheet) {
          // targetSheet is guaranteed to be string here due to early return
          const sheetIdRaw = hyperFormulaEngine.current.getSheetId(targetSheet);
          if (sheetIdRaw === undefined) return '';
          // Convert to number if needed - HyperFormula expects number for sheet ID
          let sheetId: number;
          if (typeof sheetIdRaw === 'number') {
            sheetId = sheetIdRaw;
          } else if (typeof sheetIdRaw === 'string') {
            const parsed = parseInt(sheetIdRaw, 10);
            if (isNaN(parsed)) return '';
            sheetId = parsed;
          } else {
            return '';
          }
          // At this point, sheetId is definitely a number - use type assertion to satisfy TypeScript
          const sheetIdForApi = sheetId as any;
          const hasFormula = hyperFormulaEngine.current.doesCellHaveFormula({
            sheet: sheetIdForApi,
            row,
            col,
          });
          
          if (hasFormula) {
            // Get the formula text
            const formula = hyperFormulaEngine.current.getCellFormula({
              sheet: sheetId as any,
              row,
              col,
            });
            
            if (formula) {
              // Add = prefix if not present
              return formula.startsWith('=') ? formula : `=${formula}`;
            }
          }
        }
      } catch (error) {
        // Fallback to cell value if formula check fails
      }
    }
    
    // Not a formula or HyperFormula not available - show cell value
    try {
      if (isInstanceReady(hotRef) && hotRef.hotInstance) {
        const cellValue = hotRef.hotInstance.getDataAtCell(row, col);
        return cellValue !== null && cellValue !== undefined ? String(cellValue) : '';
      }
    } catch (error) {
      // Instance might not be ready yet
      console.warn('[WorkbookEditor] Error getting cell value:', error);
    }
    return '';
  }, [activeSheet, sheets, isInstanceReady]);

  const handleFormulaBarCommit = useCallback((value: string) => {
    if (!selectedCell) return;
    
    const hotRef = hotTableRefs.current.get(activeSheet);
    if (isInstanceReady(hotRef)) {
      hotRef.hotInstance.setDataAtCell(selectedCell.row, selectedCell.col, value);
    }
  }, [selectedCell, activeSheet, isInstanceReady]);

  const handleFormulaBarCancel = useCallback(() => {
    if (selectedCell) {
      const displayValue = getFormulaBarDisplayValue(selectedCell.row, selectedCell.col, activeSheet);
      setFormulaBarValue(displayValue);
    }
  }, [selectedCell, getFormulaBarDisplayValue, activeSheet]);

  // Get current cell format
  const getCurrentCellFormat = useCallback((): CellFormat => {
    if (!selectedCell) return {};
    const cellAddress = XLSX.utils.encode_cell({ r: selectedCell.row, c: selectedCell.col });
    const sheetFormats = cellFormats.get(activeSheet);
    return sheetFormats?.get(cellAddress) || {};
  }, [selectedCell, activeSheet, cellFormats]);

  // Get current number format
  const getCurrentNumberFormat = useCallback((): NumberFormat => {
    if (!selectedCell) return { type: 'general' };
    const cellAddress = XLSX.utils.encode_cell({ r: selectedCell.row, c: selectedCell.col });
    const sheetFormats = numberFormats.get(activeSheet);
    return sheetFormats?.get(cellAddress) || { type: 'general' };
  }, [selectedCell, activeSheet, numberFormats]);

  // Handle number format change - supports multi-cell selection
  const handleNumberFormatChange = useCallback((format: NumberFormat) => {
    if (!selectedCell) return;
    
    const hotRef = hotTableRefs.current.get(activeSheet);
    if (!isInstanceReady(hotRef)) return;
    
    const instance = hotRef.hotInstance;
    
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
      if (!newFormats.has(activeSheet)) {
        newFormats.set(activeSheet, new Map());
      }
      const sheetFormats = newFormats.get(activeSheet)!;
      
      cellsToFormat.forEach(({ row, col }) => {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        sheetFormats.set(cellAddress, format);
      });
      
      return newFormats;
    });

    // Apply number formatting to all selected cells with custom renderer
    cellsToFormat.forEach(({ row, col }) => {
      instance.setCellMeta(row, col, 'type', 'numeric');
      instance.setCellMeta(row, col, 'format', format);
      
      // Create custom renderer for number formatting
      instance.setCellMeta(row, col, 'renderer', function(this: any, instance: any, td: HTMLElement, row: number, col: number, prop: any, value: any, cellProperties: any) {
        // Use default numeric renderer first
        Handsontable.renderers.NumericRenderer.apply(this, arguments as any);
        
        // Get the format for this cell
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const sheetFormats = numberFormats.get(activeSheet);
        const cellFormat = sheetFormats?.get(cellAddress);
        
        if (cellFormat && value !== null && value !== undefined && value !== '') {
          const numValue = typeof value === 'number' ? value : parseFloat(value);
          
          if (!isNaN(numValue)) {
            let formattedValue = '';
            
            if (cellFormat.type === 'currency') {
              const decimals = cellFormat.decimals ?? 2;
              const symbol = cellFormat.currencySymbol || '$';
              const withSeparator = cellFormat.thousandsSeparator !== false;
              
              formattedValue = numValue.toFixed(decimals);
              if (withSeparator) {
                formattedValue = formattedValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              }
              formattedValue = symbol + formattedValue;
            } else if (cellFormat.type === 'percentage') {
              const decimals = cellFormat.decimals ?? 2;
              formattedValue = (numValue * 100).toFixed(decimals) + '%';
            } else if (cellFormat.type === 'number') {
              const decimals = cellFormat.decimals ?? 2;
              formattedValue = numValue.toFixed(decimals);
              if (cellFormat.thousandsSeparator !== false) {
                formattedValue = formattedValue.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
              }
            } else if (cellFormat.type === 'date') {
              const date = new Date(numValue);
              if (!isNaN(date.getTime())) {
                const format = cellFormat.dateFormat || 'MM/DD/YYYY';
                formattedValue = formatDate(date, format);
              } else {
                formattedValue = String(value);
              }
            } else {
              formattedValue = String(value);
            }
            
            td.textContent = formattedValue;
          }
        }
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
  }, [selectedCell, selectedRange, activeSheet]);

  // Handle formatting change - supports multi-cell selection
  const handleFormatChange = useCallback((format: CellFormat) => {
    if (!selectedCell) return;
    
    const hotRef = hotTableRefs.current.get(activeSheet);
    if (!isInstanceReady(hotRef)) return;
    
    const instance = hotRef.hotInstance;
    
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
      if (!newFormats.has(activeSheet)) {
        newFormats.set(activeSheet, new Map());
      }
      const sheetFormats = newFormats.get(activeSheet)!;
      
      cellsToFormat.forEach(({ row, col }) => {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        sheetFormats.set(cellAddress, format);
      });
      
      return newFormats;
    });

    // Apply formatting to all selected cells
    cellsToFormat.forEach(({ row, col }) => {
      instance.setCellMeta(row, col, 'renderer', function(this: any, instance: any, td: HTMLElement) {
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
  }, [selectedCell, selectedRange, activeSheet]);

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

  const currentSheet = sheets.find(s => s.name === activeSheet);
  
  // Debug logging
  useEffect(() => {
    console.log('[WorkbookEditor] Render:', {
      sheetsCount: sheets.length,
      activeSheet,
      currentSheetFound: !!currentSheet,
      currentSheetName: currentSheet?.name,
      currentSheetRows: currentSheet?.data?.length,
      currentSheetCols: currentSheet?.data?.[0]?.length
    });
  }, [sheets.length, activeSheet, currentSheet?.name]);

  if (!currentSheet) {
    console.warn('[WorkbookEditor] No current sheet found for:', activeSheet, 'Available sheets:', sheets.map(s => s.name));
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Sheet "{activeSheet}" not found</p>
      </div>
    );
  }
  
  // Check if sheet is empty (lazy loading placeholder)
  if (!currentSheet.data || currentSheet.data.length === 0) {
    console.warn('[WorkbookEditor] Sheet data is empty:', {
      sheetName: activeSheet,
      hasData: !!currentSheet.data,
      dataLength: currentSheet.data?.length,
      dataType: typeof currentSheet.data,
      isArray: Array.isArray(currentSheet.data),
    });
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
          <p className="text-gray-500">Loading sheet "{activeSheet}"...</p>
        </div>
      </div>
    );
  }
  
  // Additional validation - check if data structure is valid
  if (!Array.isArray(currentSheet.data)) {
    console.error('[WorkbookEditor] Sheet data is not an array!', {
      sheetName: activeSheet,
      dataType: typeof currentSheet.data,
      data: currentSheet.data,
    });
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">Error: Invalid data structure for sheet "{activeSheet}"</p>
      </div>
    );
  }
  
  // Check if first row is an array
  if (currentSheet.data.length > 0 && !Array.isArray(currentSheet.data[0])) {
    console.error('[WorkbookEditor] First row is not an array!', {
      sheetName: activeSheet,
      firstRowType: typeof currentSheet.data[0],
      firstRow: currentSheet.data[0],
    });
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">Error: Invalid row structure for sheet "{activeSheet}"</p>
      </div>
    );
  }
  
  console.log('[WorkbookEditor] Rendering table with data:', {
    sheetName: activeSheet,
    rows: currentSheet.data.length,
    cols: currentSheet.data[0]?.length,
    firstRowSample: currentSheet.data[0]?.slice(0, 3),
  });

  return (
    <div 
      className="flex flex-col h-full" 
      style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}
      ref={containerRef}
    >
      {/* Formula Bar Wrapper - NO ZOOM, fixed container with horizontal scroll */}
      <div className="formula-bar-wrapper" style={{ flexShrink: 0 }}>
        <FormulaBar
        ref={formulaBarRef}
        selectedCell={selectedCell}
        cellValue={formulaBarValue}
        onCommit={handleFormulaBarCommit}
        onCancel={handleFormulaBarCancel}
        readOnly={readOnly}
        sheetName={activeSheet}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        currentFormat={getCurrentCellFormat()}
        onFormatChange={handleFormatChange}
        currentNumberFormat={getCurrentNumberFormat()}
        onNumberFormatChange={handleNumberFormatChange}
        />
      </div>

      {/* Table Area - ZOOMED, in its own isolated context */}
      <div style={{ 
        flex: '1 1 0',
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
        minHeight: 0,
        height: '100%'
      }}>
      {/* Tabs and Content */}
      <Tabs 
        value={activeSheet} 
        onValueChange={setActiveSheet} 
        className="flex-1 flex flex-col overflow-hidden"
        style={{ isolation: 'isolate', contain: 'layout style' } as any}
      >
        {!hideTabs && sheets.length > 1 && (
          <div className="px-4 pt-2 border-b border-gray-200">
            <TabsList>
              {sheets.map(sheet => (
                <TabsTrigger key={sheet.name} value={sheet.name}>
                  {sheet.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        )}

        {sheets.filter(sheet => hideTabs || sheet.name === activeSheet).map(sheet => (
          <TabsContent 
            key={sheet.name} 
            value={sheet.name} 
            className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
            style={{ isolation: 'isolate', contain: 'layout style', width: '100%', maxWidth: '100%', minWidth: 0 } as any}
          >
            {/* Outer scroll container - maintains fixed size */}
            <div 
              className="h-full w-full"
              style={{
                overflow: 'hidden',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                height: '100%',
                contain: 'layout style paint',
                position: 'relative',
                boxSizing: 'border-box',
                flex: '1 1 0',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Inner zoom container - applies zoom */}
              <div 
                style={{
                  zoom: zoomLevel,
                  width: '100%',
                  height: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  minHeight: 0,
                  flex: 1,
                  overflow: 'auto',
                  position: 'relative'
                }}
              >
                <HotTable
                key={`${sheet.name}-${sheets.length}`}
                ref={(ref) => {
                  if (ref) {
                    // Store ref immediately - we'll check if instance is ready when using it
                    hotTableRefs.current.set(sheet.name, ref);
                  } else {
                    // Clean up ref when component unmounts
                    hotTableRefs.current.delete(sheet.name);
                  }
                }}
                data={sheet.data}
                colHeaders={true}
                rowHeaders={true}
                width="100%"
                height={tableHeight || 400}
                style={{ width: '100%', maxWidth: '100%', height: tableHeight ? `${tableHeight}px` : '100%', boxSizing: 'border-box' }}
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
                afterChange={handleDataChange(sheet.name)}
                afterSelection={(r: number, c: number, r2?: number, c2?: number) => {
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
                    
                    // Use setTimeout to ensure instance is ready
                    setTimeout(() => {
                      try {
                        // Use the sheet.name from the closure
                        const hotRef = hotTableRefs.current.get(sheet.name);
                        if (isInstanceReady(hotRef)) {
                          // Get display value (formula text if formula, otherwise cell value)
                          // Pass sheet.name explicitly to avoid activeSheet mismatch
                          const displayValue = getFormulaBarDisplayValue(r, c, sheet.name);
                          setFormulaBarValue(displayValue);
                        }
                      } catch (error) {
                        console.warn('[WorkbookEditor] Error updating formula bar:', error);
                      }
                    }, 0);
                  }
                }}
                contextMenu={!readOnly ? {
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
                    clear_formatting: {
                      name: 'Clear formatting',
                      callback: function() {
                        const instance = this;
                        const selected = instance.getSelected();
                        if (selected && selected.length > 0) {
                          const [r1, c1, r2, c2] = selected[0];
                          const sheetName = sheet.name;
                          
                          // Clear formatting for selected cells
                          setCellFormats(prev => {
                            const newFormats = new Map(prev);
                            if (!newFormats.has(sheetName)) return newFormats;
                            const sheetFormats = newFormats.get(sheetName)!;
                            
                            for (let row = r1; row <= r2; row++) {
                              for (let col = c1; col <= c2; col++) {
                                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                                sheetFormats.delete(cellAddress);
                              }
                            }
                            return newFormats;
                          });
                          
                          // Clear number formats
                          setNumberFormats(prev => {
                            const newFormats = new Map(prev);
                            if (!newFormats.has(sheetName)) return newFormats;
                            const sheetFormats = newFormats.get(sheetName)!;
                            
                            for (let row = r1; row <= r2; row++) {
                              for (let col = c1; col <= c2; col++) {
                                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                                sheetFormats.delete(cellAddress);
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
                autoColumnSize={false}
                afterColumnResize={(col: number, size: number) => {
                  // Track column width changes
                  setColumnWidths(prev => {
                    const newWidths = new Map(prev);
                    if (!newWidths.has(sheet.name)) {
                      newWidths.set(sheet.name, {});
                    }
                    const sheetWidths = newWidths.get(sheet.name)!;
                    sheetWidths[col] = size;
                    return newWidths;
                  });
                }}
                formulas={hyperFormulaEngine.current ? {
                  engine: hyperFormulaEngine.current,
                  sheetName: sheet.name
                } : undefined}
                stretchH="all"
                allowInsertRow={!readOnly}
                allowInsertColumn={!readOnly}
                allowRemoveRow={!readOnly}
                allowRemoveColumn={!readOnly}
                enterBeginsEditing={true}
                autoWrapRow={true}
                autoWrapCol={true}
                cells={(row: number, col: number) => {
                  const cellMeta: any = {};
                  const cellValue = sheet.data[row]?.[col];
                  
                  // Convert row/col to cell address (e.g., A1, B5)
                  const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                  
                  // Get user-applied formatting
                  const sheetFormats = cellFormats.get(sheet.name);
                  const userFormat = sheetFormats?.get(cellAddress);
                  
                  // Get number format
                  const sheetNumberFormats = numberFormats.get(sheet.name);
                  const numberFormat = sheetNumberFormats?.get(cellAddress);
                  
                  // Apply cell styles if available (from Excel file)
                  if (sheet.styles && sheet.styles[cellAddress]) {
                    const style: CellStyle = sheet.styles[cellAddress];
                    
                    // Custom renderer to apply styles
                    cellMeta.renderer = function(instance: any, td: HTMLElement) {
                      // Use default text renderer first
                      Handsontable.renderers.TextRenderer.apply(this, arguments as any);
                      
                      // Apply background color
                      if (style.fill?.fgColor?.rgb) {
                        // Excel stores colors as RGB hex (e.g., "FF0000" for red)
                        // Ensure it starts with # and handle different formats
                        const rgb = style.fill.fgColor.rgb;
                        td.style.backgroundColor = rgb.startsWith('#') ? rgb : `#${rgb}`;
                      }
                      
                      // Apply font styles
                      if (style.font) {
                        if (style.font.bold) {
                          td.style.fontWeight = 'bold';
                        }
                        if (style.font.italic) {
                          td.style.fontStyle = 'italic';
                        }
                        if (style.font.color?.rgb) {
                          const rgb = style.font.color.rgb;
                          td.style.color = rgb.startsWith('#') ? rgb : `#${rgb}`;
                        }
                        if (style.font.sz) {
                          td.style.fontSize = `${style.font.sz}pt`;
                        }
                        if (style.font.name) {
                          td.style.fontFamily = style.font.name;
                        }
                      }
                      
                      // Apply text alignment
                      if (style.alignment) {
                        if (style.alignment.horizontal) {
                          td.style.textAlign = style.alignment.horizontal as string;
                        }
                        if (style.alignment.vertical) {
                          td.style.verticalAlign = style.alignment.vertical as string;
                        }
                        if (style.alignment.wrapText) {
                          td.style.whiteSpace = 'normal';
                          td.style.wordWrap = 'break-word';
                        }
                      }
                      
                      // Apply borders
                      if (style.border) {
                        const borderStyle = '1px solid';
                        const borderColor = '#000000'; // Default black
                        
                        if (style.border.top) {
                          const topColor = style.border.top.color?.rgb;
                          td.style.borderTop = `${borderStyle} ${topColor ? (topColor.startsWith('#') ? topColor : `#${topColor}`) : borderColor}`;
                        }
                        if (style.border.bottom) {
                          const bottomColor = style.border.bottom.color?.rgb;
                          td.style.borderBottom = `${borderStyle} ${bottomColor ? (bottomColor.startsWith('#') ? bottomColor : `#${bottomColor}`) : borderColor}`;
                        }
                        if (style.border.left) {
                          const leftColor = style.border.left.color?.rgb;
                          td.style.borderLeft = `${borderStyle} ${leftColor ? (leftColor.startsWith('#') ? leftColor : `#${leftColor}`) : borderColor}`;
                        }
                        if (style.border.right) {
                          const rightColor = style.border.right.color?.rgb;
                          td.style.borderRight = `${borderStyle} ${rightColor ? (rightColor.startsWith('#') ? rightColor : `#${rightColor}`) : borderColor}`;
                        }
                      }
                      
                      // Mark formula cells
                      if (typeof cellValue === 'string' && cellValue.trim().startsWith('=')) {
                        td.setAttribute('data-formula', 'true');
                        // Only apply default formula styling if no custom background was set
                        if (!style.fill?.fgColor?.rgb && !userFormat?.backgroundColor) {
                          td.style.backgroundColor = '#e7f3ff';
                          td.style.color = '#0066cc';
                        }
                      }
                      
                      // Apply user formatting on top of Excel styles
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
                  } else if (typeof cellValue === 'string' && cellValue.trim().startsWith('=')) {
                    // Default formula styling if no custom styles
                    cellMeta.renderer = function(instance: any, td: HTMLElement) {
                      Handsontable.renderers.TextRenderer.apply(this, arguments as any);
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
                    // User formatting without Excel styles
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
                // Apply column widths if available, with minimum width
                colWidths={(col: number) => {
                  // Check user-set column widths first
                  const sheetColumnWidths = columnWidths.get(sheet.name);
                  if (sheetColumnWidths && sheetColumnWidths[col] !== undefined) {
                    return sheetColumnWidths[col];
                  }
                  // Fall back to sheet data
                  const customWidth = sheet.columnWidths?.[col];
                  // Ensure minimum width of 80px for usability, use custom width if larger
                  return customWidth && customWidth > 80 ? customWidth : 80;
                }}
                />
              </div>
            </div>
            </TabsContent>
        ))}
      </Tabs>
      </div>
    </div>
  );
}

