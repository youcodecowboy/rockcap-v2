'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Calculator, Plus, Minus, X, Divide, Percent, TrendingUp, Hash } from 'lucide-react';

export interface FormulaFunction {
  name: string;
  description: string;
  syntax: string;
  icon?: any;
}

export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  { name: 'SUM', description: 'Adds all numbers in a range', syntax: 'SUM(range)', icon: Plus },
  { name: 'AVERAGE', description: 'Returns the average of numbers', syntax: 'AVERAGE(range)', icon: TrendingUp },
  { name: 'MIN', description: 'Returns the smallest number', syntax: 'MIN(range)', icon: Minus },
  { name: 'MAX', description: 'Returns the largest number', syntax: 'MAX(range)', icon: TrendingUp },
  { name: 'COUNT', description: 'Counts numbers in a range', syntax: 'COUNT(range)', icon: Hash },
  { name: 'IF', description: 'Returns one value if true, another if false', syntax: 'IF(condition, value_if_true, value_if_false)', icon: Calculator },
  { name: 'PRODUCT', description: 'Multiplies all numbers', syntax: 'PRODUCT(range)', icon: X },
  { name: 'DIVIDE', description: 'Divides two numbers', syntax: 'A1/B1', icon: Divide },
  { name: 'PERCENTAGE', description: 'Calculates percentage', syntax: 'A1*100%', icon: Percent },
];

interface FormulaAutocompleteProps {
  items: FormulaFunction[];
  onSelect: (item: FormulaFunction) => void;
  position: { top: number; left: number };
  query?: string;
}

const FormulaAutocomplete = forwardRef((props: FormulaAutocompleteProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter items based on query
  const filteredItems = props.query
    ? props.items.filter(item =>
        item.name.toLowerCase().includes(props.query!.toLowerCase()) ||
        item.description.toLowerCase().includes(props.query!.toLowerCase())
      )
    : props.items;

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems]);

  const selectItem = (index: number) => {
    const item = filteredItems[index];
    if (item) {
      props.onSelect(item);
    }
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + filteredItems.length - 1) % filteredItems.length);
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
        return true;
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex);
        return true;
      }
      if (event.key === 'Escape') {
        return true; // Let parent handle escape
      }
      return false;
    },
  }));

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <div
      className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden max-h-64 overflow-y-auto w-80 fixed z-[10001]"
      style={{ 
        top: `${props.position.top}px`, 
        left: `${props.position.left}px`,
        maxWidth: 'calc(100vw - 20px)' // Ensure it doesn't overflow viewport
      }}
    >
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
        Formula Functions
      </div>
      {filteredItems.map((item, index) => {
        const Icon = item.icon || Calculator;
        const isSelected = index === selectedIndex;
        return (
          <button
            key={item.name}
            className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
              isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
            }`}
            onClick={() => props.onSelect(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                {item.name}
              </div>
              <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                {item.description}
              </div>
              <div className={`text-xs mt-0.5 font-mono ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                {item.syntax}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
});

FormulaAutocomplete.displayName = 'FormulaAutocomplete';

export default FormulaAutocomplete;

