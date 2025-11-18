'use client';

import { useState, useRef, useEffect } from 'react';
import { Bold, Italic, Underline, Palette, Highlighter } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FormattingToolbarProps {
  selectedCell: { row: number; col: number } | null;
  onFormatChange?: (format: CellFormat) => void;
  currentFormat?: CellFormat;
  readOnly?: boolean;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: string;
  backgroundColor?: string;
}

export default function FormattingToolbar({ 
  selectedCell, 
  onFormatChange, 
  currentFormat,
  readOnly = false 
}: FormattingToolbarProps) {
  const [format, setFormat] = useState<CellFormat>(currentFormat || {});
  const [textColorPickerOpen, setTextColorPickerOpen] = useState(false);
  const [bgColorPickerOpen, setBgColorPickerOpen] = useState(false);
  const textColorRef = useRef<HTMLDivElement>(null);
  const bgColorRef = useRef<HTMLDivElement>(null);

  // Close color pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (textColorRef.current && !textColorRef.current.contains(event.target as Node)) {
        setTextColorPickerOpen(false);
      }
      if (bgColorRef.current && !bgColorRef.current.contains(event.target as Node)) {
        setBgColorPickerOpen(false);
      }
    };

    if (textColorPickerOpen || bgColorPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [textColorPickerOpen, bgColorPickerOpen]);

  // Update format when currentFormat prop changes
  useEffect(() => {
    if (currentFormat) {
      setFormat(currentFormat);
    }
  }, [currentFormat]);

  const commonColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#800000', '#008000',
    '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080'
  ];

  const handleToggleBold = () => {
    const newFormat = { ...format, bold: !format.bold };
    setFormat(newFormat);
    onFormatChange?.(newFormat);
  };

  const handleToggleItalic = () => {
    const newFormat = { ...format, italic: !format.italic };
    setFormat(newFormat);
    onFormatChange?.(newFormat);
  };

  const handleToggleUnderline = () => {
    const newFormat = { ...format, underline: !format.underline };
    setFormat(newFormat);
    onFormatChange?.(newFormat);
  };

  const handleTextColorChange = (color: string) => {
    const newFormat = { ...format, textColor: color };
    setFormat(newFormat);
    onFormatChange?.(newFormat);
    setTextColorPickerOpen(false);
  };

  const handleBackgroundColorChange = (color: string) => {
    const newFormat = { ...format, backgroundColor: color };
    setFormat(newFormat);
    onFormatChange?.(newFormat);
    setBgColorPickerOpen(false);
  };

  if (readOnly) {
    return null;
  }

  const isDisabled = !selectedCell;

  return (
    <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-2">
      {/* Bold */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleBold}
        disabled={isDisabled}
        className={`h-8 w-8 p-0 ${format.bold ? 'bg-gray-200' : ''}`}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </Button>

      {/* Italic */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleItalic}
        disabled={isDisabled}
        className={`h-8 w-8 p-0 ${format.italic ? 'bg-gray-200' : ''}`}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </Button>

      {/* Underline */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleUnderline}
        disabled={isDisabled}
        className={`h-8 w-8 p-0 ${format.underline ? 'bg-gray-200' : ''}`}
        title="Underline"
      >
        <Underline className="w-4 h-4" />
      </Button>

      {/* Text Color */}
      <div className="relative" ref={textColorRef}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Text Color"
          disabled={isDisabled}
          onClick={() => !isDisabled && setTextColorPickerOpen(!textColorPickerOpen)}
        >
          <Palette className="w-4 h-4" />
        </Button>
        {textColorPickerOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 p-3 w-64">
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 mb-2">Text Color</div>
              <div className="grid grid-cols-8 gap-1">
                {commonColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleTextColorChange(color)}
                    className={`w-6 h-6 rounded border ${
                      format.textColor === color ? 'ring-2 ring-blue-500' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="pt-2 border-t">
                <input
                  type="color"
                  value={format.textColor || '#000000'}
                  onChange={(e) => handleTextColorChange(e.target.value)}
                  className="w-full h-8 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Background Color */}
      <div className="relative" ref={bgColorRef}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Background Color"
          disabled={isDisabled}
          onClick={() => !isDisabled && setBgColorPickerOpen(!bgColorPickerOpen)}
        >
          <Highlighter className="w-4 h-4" />
        </Button>
        {bgColorPickerOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 p-3 w-64">
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 mb-2">Background Color</div>
              <div className="grid grid-cols-8 gap-1">
                {commonColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleBackgroundColorChange(color)}
                    className={`w-6 h-6 rounded border ${
                      format.backgroundColor === color ? 'ring-2 ring-blue-500' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <div className="pt-2 border-t">
                <input
                  type="color"
                  value={format.backgroundColor || '#FFFFFF'}
                  onChange={(e) => handleBackgroundColorChange(e.target.value)}
                  className="w-full h-8 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

