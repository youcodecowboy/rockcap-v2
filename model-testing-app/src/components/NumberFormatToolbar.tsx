'use client';

import { useState, useRef, useEffect } from 'react';
import { DollarSign, Percent, Hash, Calendar, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface NumberFormat {
  type: 'general' | 'currency' | 'percentage' | 'number' | 'date';
  decimals?: number;
  thousandsSeparator?: boolean;
  currencySymbol?: string;
  dateFormat?: string;
}

interface NumberFormatToolbarProps {
  selectedCell: { row: number; col: number } | null;
  onFormatChange?: (format: NumberFormat) => void;
  currentFormat?: NumberFormat;
  readOnly?: boolean;
}

const CURRENCY_SYMBOLS = ['$', '£', '€', '¥', 'USD', 'GBP', 'EUR'];
const DATE_FORMATS = [
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: 'MMM DD, YYYY', value: 'MMM DD, YYYY' },
  { label: 'DD MMM YYYY', value: 'DD MMM YYYY' },
];

export default function NumberFormatToolbar({ 
  selectedCell, 
  onFormatChange, 
  currentFormat,
  readOnly = false 
}: NumberFormatToolbarProps) {
  const [format, setFormat] = useState<NumberFormat>(currentFormat || { type: 'general' });
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [dateFormatPickerOpen, setDateFormatPickerOpen] = useState(false);
  const currencyRef = useRef<HTMLDivElement>(null);
  const dateFormatRef = useRef<HTMLDivElement>(null);

  // Close pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (currencyRef.current && !currencyRef.current.contains(event.target as Node)) {
        setCurrencyPickerOpen(false);
      }
      if (dateFormatRef.current && !dateFormatRef.current.contains(event.target as Node)) {
        setDateFormatPickerOpen(false);
      }
    };

    if (currencyPickerOpen || dateFormatPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [currencyPickerOpen, dateFormatPickerOpen]);

  // Update format when currentFormat prop changes
  useEffect(() => {
    if (currentFormat) {
      setFormat(currentFormat);
    }
  }, [currentFormat]);

  const handleFormatChange = (newFormat: NumberFormat) => {
    setFormat(newFormat);
    onFormatChange?.(newFormat);
  };

  const handleCurrencyClick = (symbol: string) => {
    handleFormatChange({
      ...format,
      type: 'currency',
      currencySymbol: symbol,
      decimals: format.decimals ?? 2,
      thousandsSeparator: format.thousandsSeparator ?? true
    });
    setCurrencyPickerOpen(false);
  };

  const handleDateFormatClick = (dateFormat: string) => {
    handleFormatChange({
      ...format,
      type: 'date',
      dateFormat
    });
    setDateFormatPickerOpen(false);
  };

  const handleDecimalsChange = (decimals: number) => {
    handleFormatChange({
      ...format,
      decimals
    });
  };

  const handleToggleThousandsSeparator = () => {
    handleFormatChange({
      ...format,
      thousandsSeparator: !format.thousandsSeparator
    });
  };

  if (readOnly) {
    return null;
  }

  const isDisabled = !selectedCell;
  const isCurrency = format.type === 'currency';
  const isPercentage = format.type === 'percentage';
  const isNumber = format.type === 'number';
  const isDate = format.type === 'date';

  return (
    <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-2">
      {/* Currency Format */}
      <div className="relative" ref={currencyRef}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => !isDisabled && setCurrencyPickerOpen(!currencyPickerOpen)}
          disabled={isDisabled}
          className={`h-8 px-2 ${isCurrency ? 'bg-gray-200' : ''}`}
          title="Currency Format"
        >
          <DollarSign className="w-4 h-4 mr-1" />
          <span className="text-xs">Currency</span>
        </Button>
        {currencyPickerOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 p-3 w-48">
            <div className="text-xs font-medium text-gray-700 mb-2">Currency Symbol</div>
            <div className="grid grid-cols-3 gap-1">
              {CURRENCY_SYMBOLS.map((symbol) => (
                <button
                  key={symbol}
                  onClick={() => handleCurrencyClick(symbol)}
                  className={`px-2 py-1 text-xs rounded border ${
                    format.currencySymbol === symbol ? 'bg-blue-100 border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Percentage Format */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => !isDisabled && handleFormatChange({ ...format, type: 'percentage', decimals: format.decimals ?? 2 })}
        disabled={isDisabled}
        className={`h-8 px-2 ${isPercentage ? 'bg-gray-200' : ''}`}
        title="Percentage Format"
      >
        <Percent className="w-4 h-4 mr-1" />
        <span className="text-xs">%</span>
      </Button>

      {/* Number Format */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => !isDisabled && handleFormatChange({ ...format, type: 'number', decimals: format.decimals ?? 2 })}
        disabled={isDisabled}
        className={`h-8 px-2 ${isNumber ? 'bg-gray-200' : ''}`}
        title="Number Format"
      >
        <Hash className="w-4 h-4 mr-1" />
        <span className="text-xs">123</span>
      </Button>

      {/* Date Format */}
      <div className="relative" ref={dateFormatRef}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => !isDisabled && setDateFormatPickerOpen(!dateFormatPickerOpen)}
          disabled={isDisabled}
          className={`h-8 px-2 ${isDate ? 'bg-gray-200' : ''}`}
          title="Date Format"
        >
          <Calendar className="w-4 h-4 mr-1" />
          <span className="text-xs">Date</span>
        </Button>
        {dateFormatPickerOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 p-2 w-48">
            <div className="text-xs font-medium text-gray-700 mb-2">Date Format</div>
            <div className="space-y-1">
              {DATE_FORMATS.map((df) => (
                <button
                  key={df.value}
                  onClick={() => handleDateFormatClick(df.value)}
                  className={`w-full text-left px-2 py-1 text-xs rounded border ${
                    format.dateFormat === df.value ? 'bg-blue-100 border-blue-500' : 'border-gray-300'
                  }`}
                >
                  {df.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Decimal Places (only show for currency, percentage, or number) */}
      {(isCurrency || isPercentage || isNumber) && (
        <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => !isDisabled && handleDecimalsChange(Math.max(0, (format.decimals ?? 2) - 1))}
            disabled={isDisabled}
            className="h-8 w-6 p-0"
            title="Decrease Decimal Places"
          >
            <span className="text-xs">−</span>
          </Button>
          <span className="text-xs text-gray-600 min-w-[20px] text-center">
            {format.decimals ?? 2}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => !isDisabled && handleDecimalsChange((format.decimals ?? 2) + 1)}
            disabled={isDisabled}
            className="h-8 w-6 p-0"
            title="Increase Decimal Places"
          >
            <span className="text-xs">+</span>
          </Button>
        </div>
      )}

      {/* Thousands Separator Toggle (only show for currency or number) */}
      {(isCurrency || isNumber) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggleThousandsSeparator}
          disabled={isDisabled}
          className={`h-8 px-2 ${format.thousandsSeparator ? 'bg-gray-200' : ''}`}
          title={format.thousandsSeparator ? 'Hide Thousands Separator' : 'Show Thousands Separator'}
        >
          <span className="text-xs">1,000</span>
        </Button>
      )}
    </div>
  );
}

