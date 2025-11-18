'use client';

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { ZoomIn, ZoomOut, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FormulaAutocomplete, { FORMULA_FUNCTIONS, FormulaFunction } from './FormulaAutocomplete';
import FormattingToolbar, { CellFormat } from './FormattingToolbar';
import NumberFormatToolbar, { NumberFormat } from './NumberFormatToolbar';
import KeyboardShortcutsModal from './KeyboardShortcutsModal';

interface FormulaBarProps {
  selectedCell: { row: number; col: number } | null;
  cellValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onRequestCellReference?: () => void;
  readOnly?: boolean;
  sheetName?: string; // Optional: display sheet context for multi-sheet workbooks
  zoomLevel?: number; // Current zoom level (0.5 to 2.0)
  onZoomChange?: (zoom: number) => void; // Callback when zoom changes
  currentFormat?: CellFormat; // Current cell formatting
  onFormatChange?: (format: CellFormat) => void; // Callback when formatting changes
  currentNumberFormat?: NumberFormat; // Current number formatting
  onNumberFormatChange?: (format: NumberFormat) => void; // Callback when number formatting changes
}

export const FormulaBar = forwardRef<any, FormulaBarProps>(({
  selectedCell,
  cellValue,
  onCommit,
  onCancel,
  onRequestCellReference,
  readOnly = false,
  sheetName,
  zoomLevel = 1.0,
  onZoomChange,
  currentFormat,
  onFormatChange,
  currentNumberFormat,
  onNumberFormatChange
}, ref) => {
  const [inputValue, setInputValue] = useState(cellValue);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [formulaQuery, setFormulaQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<any>(null);

  // Update input value when cell selection changes or cell value changes externally
  useEffect(() => {
    if (!isEditing) {
      setInputValue(cellValue);
    }
  }, [cellValue, isEditing]);

  // Handle keyboard shortcut for help modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open shortcuts modal with '?' key
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Only if not typing in an input field
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          setShowShortcutsModal(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Get column letter from index (A, B, C, ... Z, AA, AB, etc.)
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

  // Get cell reference (e.g., "A1", "B5", or "Sheet1!A1" if sheet name provided)
  const getCellReference = (): string => {
    if (!selectedCell) return '';
    const colLetter = getColumnLetter(selectedCell.col);
    const cellRef = `${colLetter}${selectedCell.row + 1}`;
    return sheetName ? `${sheetName}!${cellRef}` : cellRef;
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsEditing(true);

    // Check if formula mode (starts with =)
    if (newValue.startsWith('=')) {
      const query = newValue.slice(1);
      setFormulaQuery(query);
      
      // Show autocomplete if query is empty or matches function names
      if (query.length === 0 || FORMULA_FUNCTIONS.some(f => 
        f.name.toLowerCase().startsWith(query.toLowerCase())
      )) {
        // Calculate autocomplete position
        if (inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect();
          setAutocompletePosition({
            top: rect.bottom + 5,
            left: rect.left
          });
        }
        setShowAutocomplete(true);
      } else {
        setShowAutocomplete(false);
      }
    } else {
      setShowAutocomplete(false);
    }
  };

  // Handle key down
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If autocomplete is showing, let it handle arrow keys and enter
    if (showAutocomplete && autocompleteRef.current) {
      if (['ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) {
        const handled = autocompleteRef.current.onKeyDown?.({ event: e.nativeEvent });
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }

    // Handle Enter - commit value
    if (e.key === 'Enter' && !showAutocomplete) {
      e.preventDefault();
      onCommit(inputValue);
      setIsEditing(false);
      setShowAutocomplete(false);
      inputRef.current?.blur();
    }

    // Handle Escape - cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      setInputValue(cellValue); // Reset to original value
      setIsEditing(false);
      setShowAutocomplete(false);
      onCancel();
      inputRef.current?.blur();
    }
  };

  // Handle autocomplete selection
  const handleAutocompleteSelect = (item: FormulaFunction) => {
    const currentFormula = inputValue || '=';
    const formula = currentFormula === '=' ? `=${item.name}(` : `${currentFormula}${item.name}(`;
    
    setInputValue(formula);
    setShowAutocomplete(false);
    setFormulaQuery('');
    setIsEditing(true);
    
    // Keep input focused and position cursor after the opening parenthesis
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(formula.length, formula.length);
      }
    }, 10);
  };

  // Handle focus
  const handleFocus = () => {
    setIsFocused(true);
    // Don't automatically set editing - only when user types
  };

  // Handle blur
  const handleBlur = () => {
    setIsFocused(false);
    // Don't commit on blur if autocomplete is open OR if we're in formula mode
    // In formula mode, user might be clicking cells to add references
    if (!showAutocomplete && !inputValue.startsWith('=')) {
      if (isEditing && inputValue !== cellValue) {
        // Commit the value after a short delay to allow click events to fire
        setTimeout(() => {
          onCommit(inputValue);
          setIsEditing(false);
        }, 150);
      }
    }
    // If in formula mode, don't commit on blur - user is selecting cells
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
    appendText: (text: string) => {
      console.log('appendText called with:', text); // Debug
      console.log('inputRef.current:', inputRef.current); // Debug
      console.log('inputValue:', inputValue); // Debug
      
      if (inputRef.current) {
        const cursorPos = inputRef.current.selectionStart || inputValue.length;
        const newValue = inputValue.slice(0, cursorPos) + text + inputValue.slice(cursorPos);
        
        console.log('newValue:', newValue); // Debug
        
        setInputValue(newValue);
        setIsEditing(true);
        
        // Immediately update the input element
        inputRef.current.value = newValue;
        
        // Update cursor position and focus
        const newCursorPos = cursorPos + text.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
        
        console.log('appendText completed'); // Debug
      }
    },
    getValue: () => inputValue,
    isEditing: () => isEditing,
    isFormulaMode: () => inputValue.startsWith('=') && isEditing
  }));

  const handleZoomIn = () => {
    if (onZoomChange) {
      // Maximum zoom is 100% (1.0) - can only zoom back in if zoomed out
      const newZoom = Math.min(1.0, zoomLevel + 0.1);
      onZoomChange(newZoom);
    }
  };

  const handleZoomOut = () => {
    if (onZoomChange) {
      const newZoom = Math.max(0.5, zoomLevel - 0.1);
      onZoomChange(newZoom);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="formula-bar-container"
      style={{ 
        zoom: 1,
        WebkitTransform: 'scale(1)',
        transform: 'scale(1)',
        width: '100%',
        isolation: 'isolate',
        willChange: 'transform',
        backfaceVisibility: 'hidden' as any
      }}
    >
      <div 
        className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200"
        style={{ 
          zoom: 1, 
          WebkitTransform: 'scale(1)',
          transform: 'scale(1)',
          isolation: 'isolate',
          width: '100%',
          minWidth: 'max-content'
        }}
      >
        {/* Cell reference label */}
        <div className="cell-reference-label text-sm font-medium text-gray-700 min-w-[60px]">
          {getCellReference() || '—'}
        </div>

        {/* Formula input - fixed width, does not expand */}
        <div className="relative" style={{ width: '400px', flexShrink: 0 }}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={readOnly || !selectedCell}
            placeholder={selectedCell ? "Enter value or formula (=SUM...)" : "Select a cell"}
            className={`w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              inputValue.startsWith('=') ? 'font-mono text-blue-600' : ''
            } ${readOnly || !selectedCell ? 'bg-gray-50 cursor-not-allowed' : 'bg-white'}`}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Zoom controls */}
        {onZoomChange && (
          <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-2">
            <button
              onClick={handleZoomOut}
              disabled={zoomLevel <= 0.5}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm font-medium text-gray-700 min-w-[50px] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoomLevel >= 1.0}
              className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Zoom In (max 100%)"
            >
              <ZoomIn className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        )}

        {/* Formatting toolbar - next to zoom controls */}
        {onFormatChange && (
          <FormattingToolbar
            selectedCell={selectedCell}
            onFormatChange={onFormatChange}
            currentFormat={currentFormat}
            readOnly={readOnly}
          />
        )}

        {/* Number formatting toolbar - next to formatting toolbar */}
        {onNumberFormatChange && (
          <NumberFormatToolbar
            selectedCell={selectedCell}
            onFormatChange={onNumberFormatChange}
            currentFormat={currentNumberFormat}
            readOnly={readOnly}
          />
        )}

        {/* Help button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowShortcutsModal(true)}
          className="h-8 w-8 p-0 border-l border-gray-300 ml-2 pl-2"
          title="Keyboard Shortcuts (?)"
        >
          <HelpCircle className="w-4 h-4 text-gray-600" />
        </Button>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onOpenChange={setShowShortcutsModal}
      />

      {/* Formula Autocomplete */}
      {showAutocomplete && !readOnly && (
        <div className="formula-autocomplete">
          <FormulaAutocomplete
            ref={autocompleteRef}
            items={FORMULA_FUNCTIONS}
            position={autocompletePosition}
            query={formulaQuery}
            onSelect={handleAutocompleteSelect}
          />
        </div>
      )}
    </div>
  );
});

FormulaBar.displayName = 'FormulaBar';

export default FormulaBar;

