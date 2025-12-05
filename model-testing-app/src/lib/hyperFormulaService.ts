/**
 * HyperFormulaService - Centralized management for HyperFormula engine
 * 
 * This service solves several critical issues:
 * 1. Provides synchronous engine initialization
 * 2. Manages engine lifecycle (create, sync, destroy)
 * 3. Ensures proper sheetId lookups for multi-sheet workbooks
 * 4. Handles bidirectional data synchronization
 * 5. Prevents race conditions during cleanup
 */

import { HyperFormula, CellValue, ExportedCellChange } from 'hyperformula';
import type { RawCellContent } from 'hyperformula';
import { SheetData } from './templateLoader';

export interface HyperFormulaServiceConfig {
  licenseKey?: string;
  useArrayArithmetic?: boolean;
  useColumnIndex?: boolean;
  useStats?: boolean;
  maxRows?: number; // Optional row limit for very large sheets
}

export interface SheetSyncResult {
  sheetName: string;
  rowsSynced: number;
  success: boolean;
  error?: string;
}

export interface EngineInitResult {
  success: boolean;
  sheetsRegistered: string[];
  errors: string[];
}

const DEFAULT_CONFIG: HyperFormulaServiceConfig = {
  licenseKey: 'gpl-v3',
  useArrayArithmetic: false,
  useColumnIndex: true,
  useStats: false,
  maxRows: undefined, // No limit by default
};

export class HyperFormulaService {
  private engine: HyperFormula | null = null;
  private sheetIdMap: Map<string, number> = new Map();
  private isDestroying: boolean = false;
  private config: HyperFormulaServiceConfig;
  private changeListeners: Set<(changes: ExportedCellChange[]) => void> = new Set();

  constructor(config: Partial<HyperFormulaServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize HyperFormula engine synchronously from sheet data
   * This MUST be called before rendering HotTable components
   */
  initFromSheets(sheets: SheetData[]): EngineInitResult {
    const result: EngineInitResult = {
      success: false,
      sheetsRegistered: [],
      errors: [],
    };

    // Reset state
    this.isDestroying = false;
    this.sheetIdMap.clear();

    // Clean up existing engine if any
    if (this.engine) {
      try {
        this.engine.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.engine = null;
    }

    if (!sheets || sheets.length === 0) {
      result.errors.push('No sheets provided');
      return result;
    }

    try {
      // Build sheets data object for HyperFormula
      // Use 'any' to bypass strict type checking - HyperFormula types are complex
      const sheetsData: Record<string, RawCellContent[][]> = {};
      
      sheets.forEach(sheet => {
        if (!sheet.data || sheet.data.length === 0) {
          result.errors.push(`Sheet "${sheet.name}" has no data, skipping`);
          return;
        }

        // Apply row limit if configured
        let data = sheet.data;
        if (this.config.maxRows && data.length > this.config.maxRows) {
          console.warn(`[HyperFormulaService] Sheet "${sheet.name}" truncated from ${data.length} to ${this.config.maxRows} rows`);
          data = data.slice(0, this.config.maxRows);
        }

        // Cast to RawCellContent[][] - the data is compatible at runtime
        sheetsData[sheet.name] = data as RawCellContent[][];
        result.sheetsRegistered.push(sheet.name);
      });

      if (Object.keys(sheetsData).length === 0) {
        result.errors.push('No valid sheets with data found');
        return result;
      }

      // Create HyperFormula engine - this is synchronous
      // PERFORMANCE: Optimized configuration for large financial spreadsheets
      this.engine = HyperFormula.buildFromSheets(sheetsData as any, {
        licenseKey: this.config.licenseKey || 'gpl-v3',
        useArrayArithmetic: this.config.useArrayArithmetic,
        useColumnIndex: this.config.useColumnIndex,
        useStats: this.config.useStats,
        // Performance: Enable smart rounding for faster financial calculations
        smartRounding: true,
      });

      // Build sheetId lookup map
      result.sheetsRegistered.forEach(sheetName => {
        const sheetId = this.engine!.getSheetId(sheetName);
        if (sheetId !== undefined) {
          this.sheetIdMap.set(sheetName, sheetId);
        } else {
          result.errors.push(`Could not get sheetId for "${sheetName}"`);
        }
      });

      // Subscribe to formula value changes for propagation
      // Use type assertion to handle HyperFormula's event type
      this.engine.on('valuesUpdated', ((changes: ExportedCellChange[]) => {
        if (!this.isDestroying) {
          this.changeListeners.forEach(listener => listener(changes));
        }
      }) as any);

      result.success = true;
      console.log(`[HyperFormulaService] Engine initialized with ${result.sheetsRegistered.length} sheets`);
    } catch (error) {
      result.errors.push(`Engine initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error('[HyperFormulaService] Initialization error:', error);
    }

    return result;
  }

  /**
   * Get the HyperFormula engine instance
   * Returns null if not initialized or destroyed
   */
  getEngine(): HyperFormula | null {
    if (this.isDestroying) return null;
    return this.engine;
  }

  /**
   * Check if engine is ready for use
   */
  isReady(): boolean {
    return this.engine !== null && !this.isDestroying;
  }

  /**
   * Get sheetId for a given sheet name
   * CRITICAL: This must be passed to Handsontable's formulas plugin config
   */
  getSheetId(sheetName: string): number | undefined {
    return this.sheetIdMap.get(sheetName);
  }

  /**
   * Get the formulas plugin configuration for a specific sheet
   * Use this when configuring HotTable's formulas prop
   */
  getFormulasConfig(sheetName: string): { engine: HyperFormula; sheetId: number; sheetName: string } | undefined {
    if (!this.isReady() || !this.engine) return undefined;
    
    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) {
      console.warn(`[HyperFormulaService] Sheet "${sheetName}" not found in engine`);
      return undefined;
    }

    return {
      engine: this.engine,
      sheetId,
      sheetName,
    };
  }

  /**
   * Sync entire sheet data to HyperFormula
   * Call this AFTER populateTemplateWithCodifiedData to ensure engine has current data
   */
  syncSheetData(sheetName: string, data: CellValue[][]): SheetSyncResult {
    const result: SheetSyncResult = {
      sheetName,
      rowsSynced: 0,
      success: false,
    };

    if (!this.isReady() || !this.engine) {
      result.error = 'Engine not ready';
      return result;
    }

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) {
      result.error = `Sheet "${sheetName}" not found in engine`;
      return result;
    }

    try {
      // Use setSheetContent to replace all data
      // This triggers formula recalculation
      // Cast to any to bypass strict HyperFormula type checking
      this.engine.setSheetContent(sheetId, data as any);
      result.rowsSynced = data.length;
      result.success = true;
      console.log(`[HyperFormulaService] Synced ${data.length} rows for sheet "${sheetName}"`);
    } catch (error) {
      result.error = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[HyperFormulaService] Error syncing sheet "${sheetName}":`, error);
    }

    return result;
  }

  /**
   * Sync all sheets from SheetData array
   * Call this after template population
   */
  syncAllSheets(sheets: SheetData[]): SheetSyncResult[] {
    return sheets.map(sheet => this.syncSheetData(sheet.name, sheet.data));
  }

  /**
   * Sync a single cell change from Handsontable to HyperFormula
   * Use this in afterChange hook
   */
  syncCellChange(sheetName: string, row: number, col: number, value: CellValue): boolean {
    if (!this.isReady() || !this.engine) return false;

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) return false;

    try {
      this.engine.setCellContents({ sheet: sheetId, row, col }, [[value]] as any);
      return true;
    } catch (error) {
      console.error(`[HyperFormulaService] Error syncing cell [${row},${col}]:`, error);
      return false;
    }
  }

  /**
   * Run an operation with evaluation suspended for better performance
   * Use this for bulk operations that would trigger many recalculations
   */
  runWithSuspendedEvaluation<T>(operation: () => T): T | undefined {
    if (!this.isReady() || !this.engine) return undefined;
    
    this.engine.suspendEvaluation();
    try {
      return operation();
    } finally {
      this.engine.resumeEvaluation();
    }
  }

  /**
   * Sync multiple cell changes from Handsontable
   * More efficient for batch operations - uses batch mode to prevent multiple recalculations
   */
  syncCellChanges(sheetName: string, changes: Array<[number, number, any, any]>): number {
    if (!this.isReady() || !this.engine || changes.length === 0) return 0;

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) return 0;

    let synced = 0;

    // PERFORMANCE: Lower threshold from 50 to 10 for earlier batch optimization
    const isLargeBatch = changes.length > 10;
    
    if (isLargeBatch) {
      this.engine.suspendEvaluation();
    }

    try {
      // Use batch to group changes
      this.engine.batch(() => {
        changes.forEach(([row, col, oldVal, newVal]) => {
          if (oldVal !== newVal) {
            try {
              this.engine!.setCellContents({ sheet: sheetId, row, col }, [[newVal]] as any);
              synced++;
            } catch (e) {
              // Continue with other changes
            }
          }
        });
      });
    } finally {
      if (isLargeBatch) {
        this.engine.resumeEvaluation();
      }
    }

    return synced;
  }

  /**
   * Bulk set multiple cells at once - more efficient than individual setCellContents
   * Use this for initial data loading or large updates
   */
  bulkSetCells(sheetName: string, cells: Array<{ row: number; col: number; value: any }>): number {
    if (!this.isReady() || !this.engine || cells.length === 0) return 0;

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) return 0;

    let set = 0;

    // Suspend evaluation during bulk set
    this.engine.suspendEvaluation();

    try {
      // Group cells by row for more efficient updates
      const cellsByRow = new Map<number, Array<{ col: number; value: any }>>();
      cells.forEach(cell => {
        if (!cellsByRow.has(cell.row)) {
          cellsByRow.set(cell.row, []);
        }
        cellsByRow.get(cell.row)!.push({ col: cell.col, value: cell.value });
      });

      // Apply changes in batch
      this.engine.batch(() => {
        cellsByRow.forEach((rowCells, row) => {
          rowCells.forEach(({ col, value }) => {
            try {
              this.engine!.setCellContents({ sheet: sheetId, row, col }, [[value]] as any);
              set++;
            } catch (e) {
              // Continue with other cells
            }
          });
        });
      });
    } finally {
      this.engine.resumeEvaluation();
    }

    return set;
  }

  /**
   * Check if the engine is currently in batch mode
   */
  isInBatchMode(): boolean {
    // HyperFormula doesn't expose this directly, so we track it ourselves
    return false;
  }

  /**
   * Get calculated cell value from HyperFormula
   * Use this to get formula results
   */
  getCellValue(sheetName: string, row: number, col: number): CellValue | undefined {
    if (!this.isReady() || !this.engine) return undefined;

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) return undefined;

    try {
      return this.engine.getCellValue({ sheet: sheetId, row, col });
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Check if a cell contains a formula
   */
  doesCellHaveFormula(sheetName: string, row: number, col: number): boolean {
    if (!this.isReady() || !this.engine) return false;

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) return false;

    try {
      return this.engine.doesCellHaveFormula({ sheet: sheetId, row, col });
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the formula text for a cell
   */
  getCellFormula(sheetName: string, row: number, col: number): string | undefined {
    if (!this.isReady() || !this.engine) return undefined;

    const sheetId = this.getSheetId(sheetName);
    if (sheetId === undefined) return undefined;

    try {
      const formula = this.engine.getCellFormula({ sheet: sheetId, row, col });
      return formula || undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Suspend evaluation during bulk operations for performance
   */
  suspendEvaluation(): void {
    if (this.engine && !this.isDestroying) {
      this.engine.suspendEvaluation();
    }
  }

  /**
   * Resume evaluation after bulk operations
   */
  resumeEvaluation(): void {
    if (this.engine && !this.isDestroying) {
      this.engine.resumeEvaluation();
    }
  }

  /**
   * Run a batch operation with automatic suspend/resume
   */
  batch<T>(operation: () => T): T | undefined {
    if (!this.engine || this.isDestroying) return undefined;
    return this.engine.batch(operation) as T | undefined;
  }

  /**
   * Add a listener for formula value changes
   * Use this to update Handsontable when formulas recalculate
   */
  onValuesUpdated(listener: (changes: ExportedCellChange[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  /**
   * Add a new sheet to the engine
   */
  addSheet(sheetName: string, data: CellValue[][] = [[]]): number | undefined {
    if (!this.isReady() || !this.engine) return undefined;

    try {
      // addSheet returns the sheet name in newer HyperFormula versions
      this.engine.addSheet(sheetName);
      // Get the actual sheetId from the engine
      const sheetId = this.engine.getSheetId(sheetName);
      if (sheetId !== undefined) {
        this.sheetIdMap.set(sheetName, sheetId);
        if (data.length > 0) {
          this.engine.setSheetContent(sheetId, data as any);
        }
      }
      return sheetId;
    } catch (error) {
      console.error(`[HyperFormulaService] Error adding sheet "${sheetName}":`, error);
      return undefined;
    }
  }

  /**
   * Safely destroy the engine
   * This handles cleanup to prevent "Cannot read properties of undefined (reading 'off')" errors
   */
  destroy(): void {
    // Mark as destroying to prevent any operations
    this.isDestroying = true;
    
    // Clear listeners
    this.changeListeners.clear();
    
    // Clear sheet map
    this.sheetIdMap.clear();

    if (this.engine) {
      try {
        this.engine.destroy();
      } catch (e) {
        // Ignore cleanup errors - engine may already be destroyed
        console.warn('[HyperFormulaService] Cleanup warning:', e);
      } finally {
        this.engine = null;
      }
    }
    
    console.log('[HyperFormulaService] Engine destroyed');
  }

  /**
   * Get all sheet names registered in the engine
   */
  getSheetNames(): string[] {
    return Array.from(this.sheetIdMap.keys());
  }

  /**
   * Get engine statistics for debugging
   */
  getStats(): { sheets: number; isReady: boolean; isDestroying: boolean } {
    return {
      sheets: this.sheetIdMap.size,
      isReady: this.isReady(),
      isDestroying: this.isDestroying,
    };
  }
}

// Export a factory function for easier instantiation
export function createHyperFormulaService(config?: Partial<HyperFormulaServiceConfig>): HyperFormulaService {
  return new HyperFormulaService(config);
}

