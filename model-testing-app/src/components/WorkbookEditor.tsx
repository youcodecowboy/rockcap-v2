'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import { HyperFormula, ExportedCellChange } from 'hyperformula';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.css';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FormulaBar from './FormulaBar';
import { CellFormat } from './FormattingToolbar';
import { NumberFormat } from './NumberFormatToolbar';
import { SheetData, CellStyle } from '@/lib/templateLoader';
import * as XLSX from 'xlsx';
import { HyperFormulaService, createHyperFormulaService } from '@/lib/hyperFormulaService';
// Import custom formula editor with autocomplete
import '@/components/FormulaEditor';

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
  const [tableHeight, setTableHeight] = useState<number | undefined>(undefined);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const [formulaBarValue, setFormulaBarValue] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [cellFormats, setCellFormats] = useState<Map<string, Map<string, CellFormat>>>(new Map());
  const [numberFormats, setNumberFormats] = useState<Map<string, Map<string, NumberFormat>>>(new Map());
  const [columnWidths, setColumnWidths] = useState<Map<string, { [col: number]: number }>>(new Map());
  
  // NEW: HyperFormulaService-based state
  const [isEngineReady, setIsEngineReady] = useState<boolean>(false);
  const hyperFormulaServiceRef = useRef<HyperFormulaService | null>(null);
  
  // PERFORMANCE: Pre-computed cell metadata from sheet.styles
  // This avoids expensive style lookups and renderer creation in the cells() callback
  const precomputedStyleMeta = useMemo(() => {
    const metaMap = new Map<string, Map<string, { renderer: any; hasStyle: boolean }>>();
    
    if (!sheets || sheets.length === 0) return metaMap;
    
    sheets.forEach(sheet => {
      if (!sheet.styles || Object.keys(sheet.styles).length === 0) return;
      
      const sheetMeta = new Map<string, { renderer: any; hasStyle: boolean }>();
      
      // Pre-build renderers for cells with Excel styles
      Object.entries(sheet.styles).forEach(([cellAddress, style]) => {
        // Create a renderer function that applies the pre-computed style
        const renderer = function(
          this: any,
          instance: any, 
          td: HTMLElement, 
          row: number, 
          col: number, 
          prop: any, 
          value: any, 
          cellProperties: any
        ) {
          Handsontable.renderers.TextRenderer.apply(this, arguments as any);
          
          // Apply Excel styles
          if ((style as CellStyle).fill?.fgColor?.rgb) {
            const rgb = (style as CellStyle).fill!.fgColor!.rgb!;
            td.style.backgroundColor = rgb.startsWith('#') ? rgb : `#${rgb}`;
          }
          
          if ((style as CellStyle).font) {
            const font = (style as CellStyle).font!;
            if (font.bold) td.style.fontWeight = 'bold';
            if (font.italic) td.style.fontStyle = 'italic';
            if (font.color?.rgb) {
              const rgb = font.color.rgb;
              td.style.color = rgb.startsWith('#') ? rgb : `#${rgb}`;
            }
            if (font.sz) td.style.fontSize = `${font.sz}pt`;
            if (font.name) td.style.fontFamily = font.name;
          }
          
          if ((style as CellStyle).alignment) {
            const alignment = (style as CellStyle).alignment!;
            if (alignment.horizontal) td.style.textAlign = alignment.horizontal as string;
            if (alignment.vertical) td.style.verticalAlign = alignment.vertical as string;
            if (alignment.wrapText) {
              td.style.whiteSpace = 'normal';
              td.style.wordWrap = 'break-word';
            }
          }
          
          if ((style as CellStyle).border) {
            const border = (style as CellStyle).border!;
            const borderStyle = '1px solid';
            const borderColor = '#000000';
            
            if (border.top) {
              const topColor = border.top.color?.rgb;
              td.style.borderTop = `${borderStyle} ${topColor ? (topColor.startsWith('#') ? topColor : `#${topColor}`) : borderColor}`;
            }
            if (border.bottom) {
              const bottomColor = border.bottom.color?.rgb;
              td.style.borderBottom = `${borderStyle} ${bottomColor ? (bottomColor.startsWith('#') ? bottomColor : `#${bottomColor}`) : borderColor}`;
            }
            if (border.left) {
              const leftColor = border.left.color?.rgb;
              td.style.borderLeft = `${borderStyle} ${leftColor ? (leftColor.startsWith('#') ? leftColor : `#${leftColor}`) : borderColor}`;
            }
            if (border.right) {
              const rightColor = border.right.color?.rgb;
              td.style.borderRight = `${borderStyle} ${rightColor ? (rightColor.startsWith('#') ? rightColor : `#${rightColor}`) : borderColor}`;
            }
          }
        };
        
        sheetMeta.set(cellAddress, { renderer, hasStyle: true });
      });
      
      metaMap.set(sheet.name, sheetMeta);
    });
    
    console.log('[WorkbookEditor] Pre-computed style metadata for', metaMap.size, 'sheets');
    return metaMap;
  }, [sheets]);
  
  const hotTableRefs = useRef<Map<string, any>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const formulaBarRef = useRef<any>(null);
  const previousSelectedCell = useRef<{ row: number; col: number } | null>(null);
  const previousSelectedRange = useRef<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);
  const isInitializing = useRef<boolean>(true);
  const onDataChangeRef = useRef(onDataChange);
  const lastUpdateTime = useRef<Map<string, number>>(new Map());
  // Ref to store the cell being edited - persists even if Handsontable loses selection
  const editingCellRef = useRef<{ row: number; col: number; sheetName: string } | null>(null);
  
  // Helper to check if Handsontable instance is ready
  const isInstanceReady = useCallback((ref: any): boolean => {
    if (!ref) return false;
    if (!ref.hotInstance) return false;
    try {
      if (ref.hotInstance.isDestroyed === true) return false;
      if (!ref.hotInstance.view || !ref.hotInstance.view.wt) return false;
      return true;
    } catch (error) {
      return false;
    }
  }, []);
  
  // Track previous active sheet to detect changes
  const previousActiveSheet = useRef<string>(activeSheet);
  
  // PERFORMANCE: Sheet switch optimization
  // Clear editing context when switching sheets to avoid stale state
  useEffect(() => {
    // Only run when sheet actually changes (not on initial mount)
    if (previousActiveSheet.current !== activeSheet && previousActiveSheet.current !== '') {
      console.log('[WorkbookEditor] Sheet switch detected:', previousActiveSheet.current, '->', activeSheet);
      
      // Clear editing context - user is switching context
      editingCellRef.current = null;
      setFormulaBarValue('');
      setSelectedCell(null);
      setSelectedRange(null);
      previousSelectedCell.current = null;
      previousSelectedRange.current = null;
      
      // Batch any pending operations on the new sheet's instance
      const hotRef = hotTableRefs.current.get(activeSheet);
      if (hotRef?.hotInstance && !hotRef.hotInstance.isDestroyed) {
        try {
          hotRef.hotInstance.batch(() => {
            // No-op batch - just ensures any pending renders are grouped
          });
        } catch (e) {
          // Instance might not be fully ready
        }
      }
    }
    
    previousActiveSheet.current = activeSheet;
  }, [activeSheet]);
  
  // Calculate table height from container using ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    const calculateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const formulaBar = containerRef.current.querySelector('.formula-bar-wrapper');
        const formulaBarHeight = formulaBar ? formulaBar.getBoundingClientRect().height : 0;
        const calculatedHeight = rect.height - formulaBarHeight;
        
        if (calculatedHeight > 0) {
          setTableHeight(prevHeight => {
            if (!prevHeight || Math.abs(prevHeight - calculatedHeight) > 10) {
              console.log('[WorkbookEditor] Calculated table height:', calculatedHeight);
              return calculatedHeight;
            }
            return prevHeight;
          });
        }
      }
    };

    const resizeObserver = new ResizeObserver(() => calculateHeight());
    resizeObserver.observe(containerRef.current);

    calculateHeight();
    const timeoutId = setTimeout(calculateHeight, 100);
    const timeoutId2 = setTimeout(calculateHeight, 500);
    
    window.addEventListener('resize', calculateHeight);
    
    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
      clearTimeout(timeoutId2);
      window.removeEventListener('resize', calculateHeight);
    };
  }, [activeSheet]);

  // Refresh Handsontable dimensions when zoom changes
  useEffect(() => {
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
    if (onExportMetadataReady && isEngineReady && hyperFormulaServiceRef.current && !hasNotifiedExportMetadata.current) {
      const mergedColumnWidths = new Map<string, { [col: number]: number }>();
      sheets.forEach(sheet => {
        const userWidths = columnWidths.get(sheet.name) || {};
        const sheetWidths = sheet.columnWidths || {};
        mergedColumnWidths.set(sheet.name, { ...sheetWidths, ...userWidths });
      });
      
      onExportMetadataReady({
        hyperFormulaEngine: hyperFormulaServiceRef.current.getEngine(),
        cellFormats,
        numberFormats,
        columnWidths: mergedColumnWidths,
      });
      
      hasNotifiedExportMetadata.current = true;
    }
  }, [onExportMetadataReady, cellFormats, numberFormats, columnWidths, sheets, isEngineReady]);
  
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
  
  // REFACTORED: Initialize HyperFormula engine using HyperFormulaService
  // This is now SYNCHRONOUS to ensure engine is ready before HotTable renders
  useEffect(() => {
    if (sheets.length === 0) return;

    // Create a stable key from sheet names and data lengths to detect actual changes
    const currentSheetsState = sheets.map(s => `${s.name}:${s.data?.length || 0}`).sort().join('|');
    const sheetsStateChanged = previousSheetsStateRef.current !== currentSheetsState;
    const isFirstInit = !hyperFormulaServiceRef.current;
    
    // Only re-initialize if sheets actually changed or if service doesn't exist yet
    if (isFirstInit || sheetsStateChanged) {
      previousSheetsStateRef.current = currentSheetsState;
      isInitializing.current = true;
      setIsEngineReady(false);

      // Clean up existing service
      if (hyperFormulaServiceRef.current) {
        hyperFormulaServiceRef.current.destroy();
        hyperFormulaServiceRef.current = null;
      }

      // Filter out sheets with no data
      const sheetsWithData = sheets.filter(s => s.data && s.data.length > 0);
      
      if (sheetsWithData.length === 0) {
        console.warn('[WorkbookEditor] No sheets with data found');
        isInitializing.current = false;
        return;
      }

      // Create new HyperFormulaService - SYNCHRONOUS initialization
      const service = createHyperFormulaService({
        licenseKey: 'gpl-v3',
        useColumnIndex: true,
        // No row limit - we need all data for formulas to work correctly
      });

      const initResult = service.initFromSheets(sheetsWithData);
      
      if (initResult.success) {
        hyperFormulaServiceRef.current = service;
        
        // Subscribe to formula value updates for bidirectional sync
        service.onValuesUpdated((changes: ExportedCellChange[]) => {
          // This is called when HyperFormula recalculates formulas
          // Update Handsontable display with new calculated values
          changes.forEach(change => {
            const sheetName = service.getSheetNames()[change.address.sheet];
            if (!sheetName) return;
            
            const hotRef = hotTableRefs.current.get(sheetName);
            if (isInstanceReady(hotRef)) {
              try {
                // Use setDataAtCell with 'formula' source to avoid triggering afterChange again
                hotRef.hotInstance.setDataAtCell(
                  change.address.row,
                  change.address.col,
                  change.newValue,
                  'formulaUpdate'
                );
              } catch (e) {
                // Ignore - instance might not be ready
              }
            }
          });
        });
        
        console.log('[WorkbookEditor] HyperFormula engine initialized successfully:', {
          sheets: initResult.sheetsRegistered,
          errors: initResult.errors,
        });
        
        // Set engine ready state - this triggers re-render with formulas prop
        setIsEngineReady(true);
      } else {
        console.error('[WorkbookEditor] Failed to initialize HyperFormula:', initResult.errors);
      }

      // Mark initialization complete
      setTimeout(() => {
        isInitializing.current = false;
      }, 200);
    }
  }, [sheets]);

  // Cleanup HyperFormulaService on unmount
  useEffect(() => {
    return () => {
      setIsEngineReady(false);
      
      // Clear references in Handsontable instances BEFORE destroying service
      hotTableRefs.current.forEach((ref) => {
        if (ref?.hotInstance) {
          try {
            const formulasPlugin = ref.hotInstance.getPlugin?.('formulas');
            if (formulasPlugin && formulasPlugin.engine) {
              formulasPlugin.engine = null;
            }
          } catch (e) {
            // Ignore
          }
        }
      });
      
      if (hyperFormulaServiceRef.current) {
        hyperFormulaServiceRef.current.destroy();
        hyperFormulaServiceRef.current = null;
      }
      
      hotTableRefs.current.clear();
    };
  }, []);

  // REFACTORED: Handle data changes with bidirectional sync to HyperFormula
  const handleDataChange = useCallback((sheetName: string) => {
    return (changes: Handsontable.CellChange[] | null, source: string) => {
      // Ignore programmatic changes and formula updates
      if (source === 'loadData' || source === 'updateData' || source === 'Autofill.fill' || 
          source === 'formulaUpdate' || isInitializing.current) {
        return;
      }
      
      if (changes && changes.length > 0) {
        const now = Date.now();
        const lastUpdate = lastUpdateTime.current.get(sheetName) || 0;
        
        // Throttle updates - max once per 200ms per sheet
        if (now - lastUpdate < 200) {
          return;
        }
        
        // CRITICAL: Sync changes to HyperFormula engine
        if (hyperFormulaServiceRef.current?.isReady()) {
          const synced = hyperFormulaServiceRef.current.syncCellChanges(
            sheetName,
            changes.map(c => [c[0], c[1] as number, c[2], c[3]])
          );
          console.log(`[WorkbookEditor] Synced ${synced} cell changes to HyperFormula for sheet "${sheetName}"`);
        }
        
        const hotRef = hotTableRefs.current.get(sheetName);
        if (isInstanceReady(hotRef) && onDataChangeRef.current) {
          const newData = hotRef.hotInstance.getData();
          lastUpdateTime.current.set(sheetName, now);
          
          setTimeout(() => {
            if (!isInitializing.current && onDataChangeRef.current) {
              onDataChangeRef.current(sheetName, newData);
            }
          }, 150);
        }
      }
    };
  }, [isInstanceReady]);

  // Helper function to get display value for formula bar
  const getFormulaBarDisplayValue = useCallback((row: number, col: number, sheetName?: string): string => {
    const targetSheet = sheetName || activeSheet;
    if (!targetSheet) return '';
    
    const hotRef = hotTableRefs.current.get(targetSheet);
    if (!isInstanceReady(hotRef)) return '';
    
    // Check if cell has a formula using the service
    if (hyperFormulaServiceRef.current?.isReady()) {
      try {
        const hasFormula = hyperFormulaServiceRef.current.doesCellHaveFormula(targetSheet, row, col);
        
        if (hasFormula) {
          const formula = hyperFormulaServiceRef.current.getCellFormula(targetSheet, row, col);
          if (formula) {
            return formula.startsWith('=') ? formula : `=${formula}`;
          }
        }
      } catch (error) {
        // Fallback to cell value
      }
    }
    
    // Not a formula - show cell value
    try {
      if (isInstanceReady(hotRef) && hotRef.hotInstance) {
        const cellValue = hotRef.hotInstance.getDataAtCell(row, col);
        return cellValue !== null && cellValue !== undefined ? String(cellValue) : '';
      }
    } catch (error) {
      console.warn('[WorkbookEditor] Error getting cell value:', error);
    }
    return '';
  }, [activeSheet, isInstanceReady]);

  const handleFormulaBarCommit = useCallback((value: string) => {
    // Use editingCellRef if available (persists even when Handsontable loses selection)
    // Fall back to selectedCell state
    const targetCell = editingCellRef.current || (selectedCell ? { ...selectedCell, sheetName: activeSheet } : null);
    if (!targetCell) {
      console.warn('[WorkbookEditor] No target cell for formula bar commit');
      return;
    }
    
    console.log('[WorkbookEditor] Formula bar commit:', { targetCell, value });
    
    const hotRef = hotTableRefs.current.get(targetCell.sheetName);
    
    // Debug: Check what's happening with the ref
    console.log('[WorkbookEditor] hotRef lookup:', {
      sheetName: targetCell.sheetName,
      hotRefExists: !!hotRef,
      hotInstance: hotRef?.hotInstance ? 'exists' : 'missing',
      isDestroyed: hotRef?.hotInstance?.isDestroyed,
      hasView: !!hotRef?.hotInstance?.view,
      allSheetNames: Array.from(hotTableRefs.current.keys())
    });
    
    if (isInstanceReady(hotRef)) {
      const instance = hotRef.hotInstance;
      
      // Set the cell value in Handsontable
      instance.setDataAtCell(targetCell.row, targetCell.col, value);
      
      // IMMEDIATELY update parent state (bypass the 150ms throttle delay)
      // This prevents race conditions where React re-renders with old data
      if (onDataChangeRef.current) {
        const newData = instance.getData();
        console.log('[WorkbookEditor] Immediately notifying parent of data change');
        onDataChangeRef.current(targetCell.sheetName, newData);
      }
      
      // Sync to HyperFormula if ready
      if (hyperFormulaServiceRef.current?.isReady()) {
        hyperFormulaServiceRef.current.syncCellChanges(
          targetCell.sheetName,
          [[targetCell.row, targetCell.col, null, value]]
        );
      }
      
      // Update formula bar to show the committed value
      setFormulaBarValue(value);
    } else {
      // Fallback: Try to use the instance directly even if view check fails
      // The view check might be too strict for our use case
      if (hotRef?.hotInstance && !hotRef.hotInstance.isDestroyed) {
        console.log('[WorkbookEditor] Using fallback - instance exists but view check failed');
        const instance = hotRef.hotInstance;
        
        try {
          instance.setDataAtCell(targetCell.row, targetCell.col, value);
          
          if (onDataChangeRef.current) {
            const newData = instance.getData();
            onDataChangeRef.current(targetCell.sheetName, newData);
          }
          
          if (hyperFormulaServiceRef.current?.isReady()) {
            hyperFormulaServiceRef.current.syncCellChanges(
              targetCell.sheetName,
              [[targetCell.row, targetCell.col, null, value]]
            );
          }
          
          setFormulaBarValue(value);
          console.log('[WorkbookEditor] Fallback commit successful');
        } catch (error) {
          console.error('[WorkbookEditor] Fallback commit failed:', error);
        }
      } else {
        console.warn('[WorkbookEditor] HotTable instance not ready for commit - no fallback available');
      }
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
  // FIXED: Store format directly in cell metadata to avoid closure issues
  const handleNumberFormatChange = useCallback((format: NumberFormat) => {
    if (!selectedCell) return;
    
    const hotRef = hotTableRefs.current.get(activeSheet);
    // Use fallback: check if instance exists and isn't destroyed (same fix as formula bar)
    const instance = hotRef?.hotInstance;
    if (!instance || instance.isDestroyed) {
      console.warn('[WorkbookEditor] Cannot apply number format - instance not ready');
      return;
    }
    
    let cellsToFormat: Array<{ row: number; col: number }> = [];
    
    if (selectedRange && (selectedRange.startRow !== selectedRange.endRow || selectedRange.startCol !== selectedRange.endCol)) {
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
      cellsToFormat.push({ row: selectedCell.row, col: selectedCell.col });
    }
    
    // Update state for export/persistence
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

    // Apply format to cells - store format in cell metadata directly
    // The renderer in cells() callback will read from cellProperties to get the latest format
    cellsToFormat.forEach(({ row, col }) => {
      // Store the format directly in cell metadata - this is available in cellProperties
      instance.setCellMeta(row, col, 'numberFormat', format);
      instance.setCellMeta(row, col, 'type', 'numeric');
    });

    setTimeout(() => {
      instance.render();
      if (selectedRange) {
        instance.selectCell(selectedRange.startRow, selectedRange.startCol, selectedRange.endRow, selectedRange.endCol);
      } else if (selectedCell) {
        instance.selectCell(selectedCell.row, selectedCell.col);
      }
    }, 0);
  }, [selectedCell, selectedRange, activeSheet, isInstanceReady]);

  // Helper function to convert color hex to CSS class name
  const colorToClassName = (hexColor: string | undefined, prefix: 'color' | 'bg'): string | null => {
    if (!hexColor) return null;
    const colorMap: Record<string, string> = {
      '#000000': 'black',
      '#ffffff': 'white', '#FFFFFF': 'white',
      '#ff0000': 'red', '#FF0000': 'red', '#dc2626': 'red',
      '#ffa500': 'orange', '#ea580c': 'orange',
      '#ffff00': 'yellow', '#FFFF00': 'yellow', '#ca8a04': 'yellow',
      '#00ff00': 'green', '#00FF00': 'green', '#008000': 'green', '#16a34a': 'green',
      '#0000ff': 'blue', '#0000FF': 'blue', '#000080': 'blue', '#2563eb': 'blue',
      '#800080': 'purple', '#9333ea': 'purple', '#ff00ff': 'purple', '#FF00FF': 'purple',
      '#008080': 'green', '#00ffff': 'blue', '#00FFFF': 'blue',
      '#800000': 'red',
      '#808000': 'yellow',
      '#c0c0c0': 'gray', '#C0C0C0': 'gray', '#808080': 'gray',
      '#db2777': 'pink',
    };
    const colorName = colorMap[hexColor.toLowerCase()] || colorMap[hexColor];
    if (colorName) {
      return prefix === 'color' ? `cell-color-${colorName}` : `cell-bg-${colorName}`;
    }
    return null;
  };

  // Handle formatting change - supports multi-cell selection
  // Uses className approach for Handsontable to apply styling automatically
  const handleFormatChange = useCallback((format: CellFormat) => {
    if (!selectedCell) return;
    
    const hotRef = hotTableRefs.current.get(activeSheet);
    // Use fallback: check if instance exists and isn't destroyed (same fix as formula bar)
    const instance = hotRef?.hotInstance;
    if (!instance || instance.isDestroyed) {
      console.warn('[WorkbookEditor] Cannot apply cell format - instance not ready');
      return;
    }
    
    let cellsToFormat: Array<{ row: number; col: number }> = [];
    
    if (selectedRange && (selectedRange.startRow !== selectedRange.endRow || selectedRange.startCol !== selectedRange.endCol)) {
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
      cellsToFormat.push({ row: selectedCell.row, col: selectedCell.col });
    }
    
    // Update state for export/persistence
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

    // Build className string from format
    const classes: string[] = [];
    if (format.bold) classes.push('cell-bold');
    if (format.italic) classes.push('cell-italic');
    if (format.underline) classes.push('cell-underline');
    
    const textColorClass = colorToClassName(format.textColor, 'color');
    if (textColorClass) classes.push(textColorClass);
    
    const bgColorClass = colorToClassName(format.backgroundColor, 'bg');
    if (bgColorClass) classes.push(bgColorClass);
    
    const className = classes.join(' ');

    console.log('[WorkbookEditor] Applying format:', { 
      format, 
      className, 
      cellsToFormat,
      classes 
    });

    // Apply className to cells - Handsontable will automatically apply these CSS classes
    cellsToFormat.forEach(({ row, col }) => {
      // Store the format for export purposes
      instance.setCellMeta(row, col, 'cellFormat', format);
      // Set className for Handsontable to apply CSS automatically
      instance.setCellMeta(row, col, 'className', className || undefined);
      
      // Debug: verify the meta was set
      const meta = instance.getCellMeta(row, col);
      console.log('[WorkbookEditor] Cell meta after setCellMeta:', { 
        row, col, 
        className: meta.className,
        cellFormat: meta.cellFormat 
      });
    });

    setTimeout(() => {
      instance.render();
      
      // Debug: Check if className persists after render
      if (cellsToFormat.length > 0) {
        const { row, col } = cellsToFormat[0];
        const metaAfterRender = instance.getCellMeta(row, col);
        console.log('[WorkbookEditor] Cell meta AFTER render:', { 
          row, col, 
          className: metaAfterRender.className 
        });
      }
      
      if (selectedRange) {
        instance.selectCell(selectedRange.startRow, selectedRange.startCol, selectedRange.endRow, selectedRange.endCol);
      } else if (selectedCell) {
        instance.selectCell(selectedCell.row, selectedCell.col);
      }
    }, 0);
  }, [selectedCell, selectedRange, activeSheet, isInstanceReady]);

  // Helper function to convert Excel serial date to JavaScript Date
  // Excel dates are stored as days since Jan 1, 1900 (with a bug treating 1900 as leap year)
  const excelSerialToDate = (serial: number): Date | null => {
    if (serial < 1) return null;
    
    // Excel's epoch is Jan 1, 1900, but it has a bug where it thinks 1900 was a leap year
    // So we need to adjust for dates after Feb 28, 1900
    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (to account for the 1900 bug)
    const date = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
    return date;
  };

  // Helper function to format dates (used in cells function)
  const formatDate = (date: Date, format: string): string => {
    return formatDateValue(date, format);
  };

  // Helper function to format dates with various formats
  const formatDateValue = (date: Date, format: string): string => {
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

  // Get formulas config for a sheet - uses HyperFormulaService
  const getFormulasConfig = useCallback((sheetName: string) => {
    if (!isEngineReady || !hyperFormulaServiceRef.current) {
      return undefined;
    }
    return hyperFormulaServiceRef.current.getFormulasConfig(sheetName);
  }, [isEngineReady]);

  const currentSheet = sheets.find(s => s.name === activeSheet);
  
  // Debug logging
  useEffect(() => {
    console.log('[WorkbookEditor] Render:', {
      sheetsCount: sheets.length,
      activeSheet,
      currentSheetFound: !!currentSheet,
      currentSheetName: currentSheet?.name,
      currentSheetRows: currentSheet?.data?.length,
      currentSheetCols: currentSheet?.data?.[0]?.length,
      isEngineReady,
      serviceStats: hyperFormulaServiceRef.current?.getStats(),
    });
  }, [sheets.length, activeSheet, currentSheet?.name, isEngineReady]);

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
  
  // Validate data structure
  if (!Array.isArray(currentSheet.data)) {
    console.error('[WorkbookEditor] Sheet data is not an array!');
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">Error: Invalid data structure for sheet "{activeSheet}"</p>
      </div>
    );
  }
  
  if (currentSheet.data.length > 0 && !Array.isArray(currentSheet.data[0])) {
    console.error('[WorkbookEditor] First row is not an array!');
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
    formulasConfigAvailable: !!getFormulasConfig(activeSheet),
  });

  return (
    <div 
      className="flex flex-col h-full" 
      style={{ width: '100%', maxWidth: '100%', overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}
      ref={containerRef}
    >
      {/* Formula Bar Wrapper */}
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

      {/* Table Area */}
      <div style={{ 
        flex: '1 1 0',
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
        minHeight: 0,
        height: '100%'
      }}>
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
              {/* Table container - zoom is handled via rowHeights/colWidths/font-size, not CSS transforms */}
              <div 
                className={`h-full w-full zoom-level-${Math.round(zoomLevel * 100)}`}
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
                  {/* CRITICAL: Only render HotTable when engine is ready */}
                  {sheet.data && sheet.data.length > 0 && (
                    <HotTable
                      key={`${sheet.name}-${sheets.length}-${isEngineReady ? 'ready' : 'pending'}`}
                      ref={(ref) => {
                        if (ref) {
                          hotTableRefs.current.set(sheet.name, ref);
                        } else {
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
                      // PERFORMANCE: Optimized viewport rendering for large spreadsheets
                      // Reduced from 100/15 to 50/10 to decrease initial render load
                      viewportRowRenderingOffset={50}
                      viewportColumnRenderingOffset={10}
                      renderAllRows={false}
                      renderAllColumns={false}
                      // Excel-like features
                      copyPaste={true}
                      undo={true}
                      fillHandle={readOnly ? false : {
                        direction: 'vertical',
                        autoInsertRow: true
                      }}
                      comments={false}
                      // CRITICAL: Keep cell selected when clicking outside (e.g., on formula bar)
                      outsideClickDeselects={false}
                      customBorders={false}
                      afterChange={handleDataChange(sheet.name)}
                      afterSelection={(r: number, c: number, r2?: number, c2?: number) => {
                        // Don't update selection when in formula mode - we're inserting cell references
                        const isFormulaBarMode = formulaBarRef.current?.isFormulaMode?.();
                        
                        // Also check cell editor
                        const hotRef = hotTableRefs.current.get(sheet.name);
                        const instance = hotRef?.hotInstance;
                        let isCellEditorFormulaMode = false;
                        if (instance) {
                          const activeEditor = instance.getActiveEditor();
                          if (activeEditor && activeEditor.isOpened()) {
                            const editorValue = activeEditor.getValue?.() || activeEditor.TEXTAREA?.value || '';
                            isCellEditorFormulaMode = typeof editorValue === 'string' && editorValue.startsWith('=');
                          }
                        }
                        
                        if (isFormulaBarMode || isCellEditorFormulaMode) {
                          return; // Skip selection changes during formula mode
                        }
                        
                        const endRow = r2 !== undefined ? r2 : r;
                        const endCol = c2 !== undefined ? c2 : c;
                        
                        const newRange = { startRow: r, startCol: c, endRow, endCol };
                        
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
                          
                          // Store the editing cell in ref - persists even if Handsontable loses focus
                          editingCellRef.current = { row: r, col: c, sheetName: sheet.name };
                          
                          // FIXED: Get value DIRECTLY from ref, avoiding closure issues
                          // Get the ref for this specific sheet
                          const hotRef = hotTableRefs.current.get(sheet.name);
                          if (hotRef?.hotInstance) {
                            try {
                              const instance = hotRef.hotInstance;
                              // First check if it's a formula via HyperFormula
                              let displayValue = '';
                              if (hyperFormulaServiceRef.current?.isReady()) {
                                try {
                                  const hasFormula = hyperFormulaServiceRef.current.doesCellHaveFormula(sheet.name, r, c);
                                  if (hasFormula) {
                                    const formula = hyperFormulaServiceRef.current.getCellFormula(sheet.name, r, c);
                                    if (formula) {
                                      displayValue = formula.startsWith('=') ? formula : `=${formula}`;
                                    }
                                  }
                                } catch (e) {
                                  // Fallback to cell value
                                }
                              }
                              
                              // If not a formula, get the cell value directly
                              if (!displayValue) {
                                const cellValue = instance.getDataAtCell(r, c);
                                displayValue = cellValue !== null && cellValue !== undefined ? String(cellValue) : '';
                              }
                              
                              setFormulaBarValue(displayValue);
                            } catch (error) {
                              console.warn('[WorkbookEditor] Error updating formula bar:', error);
                            }
                          }
                        }
                      }}
                      beforeOnCellMouseDown={(event: MouseEvent, coords: any, td: HTMLElement) => {
                        // Check if we're in formula mode - either in formula bar OR in cell editor
                        const isFormulaBarMode = formulaBarRef.current?.isFormulaMode?.();
                        
                        // Also check if cell editor is active and editing a formula
                        const hotRef = hotTableRefs.current.get(sheet.name);
                        const instance = hotRef?.hotInstance;
                        let isCellEditorFormulaMode = false;
                        
                        if (instance) {
                          const activeEditor = instance.getActiveEditor();
                          if (activeEditor && activeEditor.isOpened()) {
                            // Check if the editor value starts with '='
                            const editorValue = activeEditor.getValue?.() || activeEditor.TEXTAREA?.value || '';
                            isCellEditorFormulaMode = typeof editorValue === 'string' && editorValue.startsWith('=');
                          }
                        }
                        
                        const isInFormulaMode = isFormulaBarMode || isCellEditorFormulaMode;
                        
                        if (isInFormulaMode && (selectedCell || isCellEditorFormulaMode)) {
                          // Block normal cell selection - we want to insert a cell reference instead
                          event.stopImmediatePropagation();
                          event.preventDefault();
                          
                          const hotRef = hotTableRefs.current.get(sheet.name);
                          const instance = hotRef?.hotInstance;
                          if (!instance) return false;
                          
                          const cellCoords = instance.getCoords(td);
                          if (!cellCoords || cellCoords.row === undefined || cellCoords.col === undefined) {
                            return false;
                          }
                          
                          const row = cellCoords.row;
                          const col = cellCoords.col;
                          
                          // Convert to Excel-style cell reference (A1, B2, etc.)
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
                          
                          console.log('[WorkbookEditor] Inserting cell reference:', cellRef, { isFormulaBarMode, isCellEditorFormulaMode });
                          
                          // Insert into the appropriate editor
                          if (isCellEditorFormulaMode && instance) {
                            // Insert into cell editor
                            const activeEditor = instance.getActiveEditor();
                            if (activeEditor && activeEditor.TEXTAREA) {
                              const textarea = activeEditor.TEXTAREA as HTMLTextAreaElement;
                              const currentValue = textarea.value;
                              const cursorPos = textarea.selectionStart || currentValue.length;
                              const newValue = currentValue.slice(0, cursorPos) + cellRef + currentValue.slice(cursorPos);
                              
                              textarea.value = newValue;
                              textarea.focus();
                              const newCursorPos = cursorPos + cellRef.length;
                              textarea.setSelectionRange(newCursorPos, newCursorPos);
                              
                              // Trigger input event
                              textarea.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                          } else if (formulaBarRef.current) {
                            // Insert into formula bar
                            formulaBarRef.current.appendText(cellRef);
                          }
                          
                          return false; // Block selection
                        }
                        
                        return true;
                      }}
                      afterOnCellMouseUp={(event: MouseEvent, coords: any, td: HTMLElement) => {
                        // After clicking a cell in formula mode, refocus the formula bar
                        const isInFormulaMode = formulaBarRef.current?.isFormulaMode?.();
                        
                        if (isInFormulaMode && selectedCell) {
                          if (formulaBarRef.current) {
                            formulaBarRef.current.focus();
                          }
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
                      // CRITICAL: Use HyperFormulaService's formulas config with sheetId
                      formulas={getFormulasConfig(sheet.name) as any}
                      stretchH="all"
                      allowInsertRow={!readOnly}
                      allowInsertColumn={!readOnly}
                      allowRemoveRow={!readOnly}
                      allowRemoveColumn={!readOnly}
                      enterBeginsEditing={true}
                      autoWrapRow={true}
                      autoWrapCol={true}
                      // Use custom formula editor with autocomplete for all cells
                      editor="formula"
                      cells={(row: number, col: number) => {
                        const cellMeta: any = {};
                        const cellValue = sheet.data[row]?.[col];
                        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
                        
                        // PERFORMANCE: O(1) lookup for user-applied formats from React state
                        const sheetFormats = cellFormats.get(sheet.name);
                        const stateUserFormat = sheetFormats?.get(cellAddress);
                        const sheetNumberFormats = numberFormats.get(sheet.name);
                        const stateNumberFormat = sheetNumberFormats?.get(cellAddress);
                        
                        // Build className from user-applied formats (React state)
                        if (stateUserFormat) {
                          const classes: string[] = [];
                          if (stateUserFormat.bold) classes.push('cell-bold');
                          if (stateUserFormat.italic) classes.push('cell-italic');
                          if (stateUserFormat.underline) classes.push('cell-underline');
                          if (stateUserFormat.textColor) {
                            const colorClass = colorToClassName(stateUserFormat.textColor, 'color');
                            if (colorClass) classes.push(colorClass);
                          }
                          if (stateUserFormat.backgroundColor) {
                            const bgClass = colorToClassName(stateUserFormat.backgroundColor, 'bg');
                            if (bgClass) classes.push(bgClass);
                          }
                          if (classes.length > 0) {
                            cellMeta.className = classes.join(' ');
                          }
                        }
                        
                        // PERFORMANCE: O(1) lookup for pre-computed Excel styles
                        const precomputedSheetMeta = precomputedStyleMeta.get(sheet.name);
                        const precomputedCellMeta = precomputedSheetMeta?.get(cellAddress);
                        const hasExcelStyle = precomputedCellMeta?.hasStyle;
                        const isFormula = typeof cellValue === 'string' && cellValue.trim().startsWith('=');
                        const hasNumberFormat = stateNumberFormat && stateNumberFormat.type !== 'general';
                        
                        // Helper to apply number formatting (only called when needed)
                        const applyNumberFormatting = (td: HTMLElement, cellProperties: any, value: any) => {
                          const numFormat = (cellProperties?.numberFormat as NumberFormat) || stateNumberFormat;
                          if (!numFormat || numFormat.type === 'general' || value === null || value === undefined || value === '') return;
                          
                          const numValue = typeof value === 'number' ? value : parseFloat(String(value));
                          if (isNaN(numValue)) return;
                          
                          let formattedValue = '';
                          if (numFormat.type === 'currency') {
                            const decimals = numFormat.decimals ?? 2;
                            const symbol = numFormat.currencySymbol || '$';
                            const absValue = Math.abs(numValue);
                            formattedValue = absValue.toFixed(decimals);
                            if (numFormat.thousandsSeparator !== false) {
                              const parts = formattedValue.split('.');
                              parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                              formattedValue = parts.join('.');
                            }
                            formattedValue = (numValue < 0 ? '-' : '') + symbol + formattedValue;
                            if (numValue < 0) td.classList.add('cell-color-red');
                          } else if (numFormat.type === 'percentage') {
                            formattedValue = (numValue * 100).toFixed(numFormat.decimals ?? 2) + '%';
                          } else if (numFormat.type === 'number') {
                            formattedValue = numValue.toFixed(numFormat.decimals ?? 2);
                            if (numFormat.thousandsSeparator !== false) {
                              const parts = formattedValue.split('.');
                              parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                              formattedValue = parts.join('.');
                            }
                          } else if (numFormat.type === 'date') {
                            const date = excelSerialToDate(numValue);
                            formattedValue = date && !isNaN(date.getTime()) 
                              ? formatDateValue(date, numFormat.dateFormat || 'MM/DD/YYYY')
                              : String(value);
                          }
                          if (formattedValue) td.textContent = formattedValue;
                        };
                        
                        // Use pre-computed renderer for cells with Excel styles
                        if (hasExcelStyle && precomputedCellMeta) {
                          // Wrap the pre-computed renderer to add formula marking and number formatting
                          const baseRenderer = precomputedCellMeta.renderer;
                          cellMeta.renderer = function(
                            this: any,
                            instance: any, 
                            td: HTMLElement, 
                            rowIdx: number, 
                            colIdx: number, 
                            prop: any, 
                            value: any, 
                            cellProperties: any
                          ) {
                            baseRenderer.apply(this, arguments as any);
                            // Mark formula cells
                            if (isFormula) {
                              td.setAttribute('data-formula', 'true');
                              // Only add highlight if no background color
                              const style = sheet.styles?.[cellAddress];
                              if (!style?.fill?.fgColor?.rgb) {
                                td.classList.add('formula-cell-highlight');
                              }
                            }
                            // Apply number formatting
                            applyNumberFormatting(td, cellProperties, value);
                          };
                        } else if (isFormula) {
                          // Formula cell without Excel styles
                          cellMeta.renderer = function(
                            this: any,
                            instance: any, 
                            td: HTMLElement, 
                            rowIdx: number, 
                            colIdx: number, 
                            prop: any, 
                            value: any, 
                            cellProperties: any
                          ) {
                            Handsontable.renderers.TextRenderer.apply(this, arguments as any);
                            td.setAttribute('data-formula', 'true');
                            td.classList.add('formula-cell-highlight');
                            applyNumberFormatting(td, cellProperties, value);
                          };
                        } else if (hasNumberFormat) {
                          // Cell has number formatting only
                          cellMeta.renderer = function(
                            this: any,
                            instance: any, 
                            td: HTMLElement, 
                            rowIdx: number, 
                            colIdx: number, 
                            prop: any, 
                            value: any, 
                            cellProperties: any
                          ) {
                            Handsontable.renderers.TextRenderer.apply(this, arguments as any);
                            applyNumberFormatting(td, cellProperties, value);
                          };
                        }
                        // For all other cells: NO custom renderer - Handsontable uses default
                        
                        return cellMeta;
                      }}
                      colWidths={(col: number) => {
                        const sheetColumnWidths = columnWidths.get(sheet.name);
                        const baseWidth = sheetColumnWidths?.[col] ?? sheet.columnWidths?.[col] ?? 80;
                        // Scale column width with zoom level
                        return Math.round(Math.max(baseWidth, 80) * zoomLevel);
                      }}
                      // Scale row height with zoom level
                      rowHeights={Math.round(23 * zoomLevel)}
                    />
                  )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
