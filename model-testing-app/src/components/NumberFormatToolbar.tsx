'use client';

import { useState, useRef, useEffect } from 'react';
import { DollarSign, Percent, Hash, Calendar } from 'lucide-react';
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
    <div className="flex items-center gap-0.5 border-l border-gray-300 pl-2">
      {/* Currency Format */}
      <div className="relative" ref={currencyRef}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => !isDisabled && setCurrencyPickerOpen(!currencyPickerOpen)}
          disabled={isDisabled}
          className={`h-7 w-7 p-0 ${isCurrency ? 'bg-gray-200' : ''}`}
          title="Currency Format"
        >
          <DollarSign className="w-3.5 h-3.5" />
        </Button>
        {currencyPickerOpen && (
          <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-[10000] p-2 w-40">
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
        className={`h-7 w-7 p-0 ${isPercentage ? 'bg-gray-200' : ''}`}
        title="Percentage Format"
      >
        <Percent className="w-3.5 h-3.5" />
      </Button>

      {/* Number Format */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => !isDisabled && handleFormatChange({ ...format, type: 'number', decimals: format.decimals ?? 2 })}
        disabled={isDisabled}
        className={`h-7 w-7 p-0 ${isNumber ? 'bg-gray-200' : ''}`}
        title="Number Format (with commas)"
      >
        <Hash className="w-3.5 h-3.5" />
      </Button>

      {/* Date Format */}
      <div className="relative" ref={dateFormatRef}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => !isDisabled && setDateFormatPickerOpen(!dateFormatPickerOpen)}
          disabled={isDisabled}
          className={`h-7 w-7 p-0 ${isDate ? 'bg-gray-200' : ''}`}
          title="Date Format"
        >
          <Calendar className="w-3.5 h-3.5" />
        </Button>
        {dateFormatPickerOpen && (
          <div className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-[10000] p-2 w-36">
            <div className="text-xs font-medium text-gray-700 mb-1">Date Format</div>
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

      {/* Decimal Places - compact inline control */}
      {(isCurrency || isPercentage || isNumber) && (
        <div className="flex items-center gap-0 border-l border-gray-300 pl-1.5 ml-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => !isDisabled && handleDecimalsChange(Math.max(0, (format.decimals ?? 2) - 1))}
            disabled={isDisabled}
            className="h-6 w-5 p-0 text-gray-500"
            title="Decrease Decimals"
          >
            <span className="text-[10px] font-medium">.0</span>
          </Button>
          <span className="text-[10px] text-gray-500 w-3 text-center font-medium">
            {format.decimals ?? 2}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => !isDisabled && handleDecimalsChange((format.decimals ?? 2) + 1)}
            disabled={isDisabled}
            className="h-6 w-5 p-0 text-gray-500"
            title="Increase Decimals"
          >
            <span className="text-[10px] font-medium">.00</span>
          </Button>
        </div>
      )}
    </div>
  );
}

