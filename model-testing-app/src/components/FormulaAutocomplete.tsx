'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useMemo,
} from 'react';
import { 
  Calculator, 
  Plus, 
  Minus, 
  TrendingUp, 
  Hash, 
  Calendar,
  Type,
  Search,
  DollarSign,
  BarChart2,
  Grid,
  Clock,
  FileText,
} from 'lucide-react';

export interface FormulaFunction {
  name: string;
  description: string;
  syntax: string;
  category: FormulaCategory;
  icon?: any;
}

export type FormulaCategory = 
  | 'math' 
  | 'statistical' 
  | 'logical' 
  | 'text' 
  | 'date' 
  | 'lookup' 
  | 'financial'
  | 'info';

const CATEGORY_CONFIG: Record<FormulaCategory, { label: string; icon: any; color: string }> = {
  math: { label: 'Math', icon: Calculator, color: 'text-blue-600' },
  statistical: { label: 'Statistical', icon: BarChart2, color: 'text-purple-600' },
  logical: { label: 'Logical', icon: Grid, color: 'text-green-600' },
  text: { label: 'Text', icon: Type, color: 'text-orange-600' },
  date: { label: 'Date & Time', icon: Calendar, color: 'text-pink-600' },
  lookup: { label: 'Lookup', icon: Search, color: 'text-cyan-600' },
  financial: { label: 'Financial', icon: DollarSign, color: 'text-emerald-600' },
  info: { label: 'Information', icon: FileText, color: 'text-gray-600' },
};

// Comprehensive list of HyperFormula-supported functions
export const FORMULA_FUNCTIONS: FormulaFunction[] = [
  // Math & Trig
  { name: 'SUM', description: 'Adds all numbers in a range', syntax: 'SUM(number1, [number2], ...)', category: 'math', icon: Plus },
  { name: 'SUMIF', description: 'Adds cells that meet a condition', syntax: 'SUMIF(range, criteria, [sum_range])', category: 'math', icon: Plus },
  { name: 'SUMIFS', description: 'Adds cells that meet multiple conditions', syntax: 'SUMIFS(sum_range, criteria_range1, criteria1, ...)', category: 'math', icon: Plus },
  { name: 'SUMPRODUCT', description: 'Returns sum of products of array components', syntax: 'SUMPRODUCT(array1, [array2], ...)', category: 'math', icon: Plus },
  { name: 'PRODUCT', description: 'Multiplies all numbers', syntax: 'PRODUCT(number1, [number2], ...)', category: 'math', icon: Calculator },
  { name: 'ABS', description: 'Returns absolute value', syntax: 'ABS(number)', category: 'math', icon: Calculator },
  { name: 'ROUND', description: 'Rounds to specified digits', syntax: 'ROUND(number, num_digits)', category: 'math', icon: Calculator },
  { name: 'ROUNDUP', description: 'Rounds up away from zero', syntax: 'ROUNDUP(number, num_digits)', category: 'math', icon: Calculator },
  { name: 'ROUNDDOWN', description: 'Rounds down toward zero', syntax: 'ROUNDDOWN(number, num_digits)', category: 'math', icon: Calculator },
  { name: 'CEILING', description: 'Rounds up to nearest multiple', syntax: 'CEILING(number, significance)', category: 'math', icon: Calculator },
  { name: 'FLOOR', description: 'Rounds down to nearest multiple', syntax: 'FLOOR(number, significance)', category: 'math', icon: Calculator },
  { name: 'INT', description: 'Rounds down to nearest integer', syntax: 'INT(number)', category: 'math', icon: Calculator },
  { name: 'MOD', description: 'Returns remainder after division', syntax: 'MOD(number, divisor)', category: 'math', icon: Calculator },
  { name: 'POWER', description: 'Returns number raised to power', syntax: 'POWER(number, power)', category: 'math', icon: Calculator },
  { name: 'SQRT', description: 'Returns square root', syntax: 'SQRT(number)', category: 'math', icon: Calculator },
  { name: 'EXP', description: 'Returns e raised to power', syntax: 'EXP(number)', category: 'math', icon: Calculator },
  { name: 'LN', description: 'Returns natural logarithm', syntax: 'LN(number)', category: 'math', icon: Calculator },
  { name: 'LOG', description: 'Returns logarithm to specified base', syntax: 'LOG(number, [base])', category: 'math', icon: Calculator },
  { name: 'LOG10', description: 'Returns base-10 logarithm', syntax: 'LOG10(number)', category: 'math', icon: Calculator },
  { name: 'PI', description: 'Returns value of π', syntax: 'PI()', category: 'math', icon: Calculator },
  { name: 'RAND', description: 'Returns random number 0-1', syntax: 'RAND()', category: 'math', icon: Calculator },
  { name: 'RANDBETWEEN', description: 'Returns random integer between values', syntax: 'RANDBETWEEN(bottom, top)', category: 'math', icon: Calculator },
  
  // Statistical
  { name: 'AVERAGE', description: 'Returns the average of numbers', syntax: 'AVERAGE(number1, [number2], ...)', category: 'statistical', icon: TrendingUp },
  { name: 'AVERAGEIF', description: 'Averages cells meeting a condition', syntax: 'AVERAGEIF(range, criteria, [average_range])', category: 'statistical', icon: TrendingUp },
  { name: 'AVERAGEIFS', description: 'Averages cells meeting multiple conditions', syntax: 'AVERAGEIFS(average_range, criteria_range1, criteria1, ...)', category: 'statistical', icon: TrendingUp },
  { name: 'MIN', description: 'Returns the smallest number', syntax: 'MIN(number1, [number2], ...)', category: 'statistical', icon: Minus },
  { name: 'MAX', description: 'Returns the largest number', syntax: 'MAX(number1, [number2], ...)', category: 'statistical', icon: TrendingUp },
  { name: 'COUNT', description: 'Counts cells with numbers', syntax: 'COUNT(value1, [value2], ...)', category: 'statistical', icon: Hash },
  { name: 'COUNTA', description: 'Counts non-empty cells', syntax: 'COUNTA(value1, [value2], ...)', category: 'statistical', icon: Hash },
  { name: 'COUNTBLANK', description: 'Counts empty cells', syntax: 'COUNTBLANK(range)', category: 'statistical', icon: Hash },
  { name: 'COUNTIF', description: 'Counts cells meeting a condition', syntax: 'COUNTIF(range, criteria)', category: 'statistical', icon: Hash },
  { name: 'COUNTIFS', description: 'Counts cells meeting multiple conditions', syntax: 'COUNTIFS(criteria_range1, criteria1, ...)', category: 'statistical', icon: Hash },
  { name: 'MEDIAN', description: 'Returns the median value', syntax: 'MEDIAN(number1, [number2], ...)', category: 'statistical', icon: BarChart2 },
  { name: 'MODE', description: 'Returns most common value', syntax: 'MODE(number1, [number2], ...)', category: 'statistical', icon: BarChart2 },
  { name: 'STDEV', description: 'Estimates standard deviation', syntax: 'STDEV(number1, [number2], ...)', category: 'statistical', icon: BarChart2 },
  { name: 'VAR', description: 'Estimates variance', syntax: 'VAR(number1, [number2], ...)', category: 'statistical', icon: BarChart2 },
  { name: 'LARGE', description: 'Returns k-th largest value', syntax: 'LARGE(array, k)', category: 'statistical', icon: TrendingUp },
  { name: 'SMALL', description: 'Returns k-th smallest value', syntax: 'SMALL(array, k)', category: 'statistical', icon: Minus },
  { name: 'RANK', description: 'Returns rank of a number', syntax: 'RANK(number, ref, [order])', category: 'statistical', icon: BarChart2 },
  { name: 'PERCENTILE', description: 'Returns k-th percentile', syntax: 'PERCENTILE(array, k)', category: 'statistical', icon: BarChart2 },
  
  // Logical
  { name: 'IF', description: 'Conditional logic', syntax: 'IF(logical_test, value_if_true, [value_if_false])', category: 'logical', icon: Grid },
  { name: 'IFS', description: 'Multiple conditions', syntax: 'IFS(logical_test1, value1, [logical_test2, value2], ...)', category: 'logical', icon: Grid },
  { name: 'IFERROR', description: 'Returns value if error', syntax: 'IFERROR(value, value_if_error)', category: 'logical', icon: Grid },
  { name: 'IFNA', description: 'Returns value if #N/A', syntax: 'IFNA(value, value_if_na)', category: 'logical', icon: Grid },
  { name: 'AND', description: 'Returns TRUE if all true', syntax: 'AND(logical1, [logical2], ...)', category: 'logical', icon: Grid },
  { name: 'OR', description: 'Returns TRUE if any true', syntax: 'OR(logical1, [logical2], ...)', category: 'logical', icon: Grid },
  { name: 'NOT', description: 'Reverses logical value', syntax: 'NOT(logical)', category: 'logical', icon: Grid },
  { name: 'XOR', description: 'Returns exclusive OR', syntax: 'XOR(logical1, [logical2], ...)', category: 'logical', icon: Grid },
  { name: 'TRUE', description: 'Returns TRUE', syntax: 'TRUE()', category: 'logical', icon: Grid },
  { name: 'FALSE', description: 'Returns FALSE', syntax: 'FALSE()', category: 'logical', icon: Grid },
  { name: 'SWITCH', description: 'Matches value against list', syntax: 'SWITCH(expression, value1, result1, ...)', category: 'logical', icon: Grid },
  
  // Text
  { name: 'CONCATENATE', description: 'Joins text strings', syntax: 'CONCATENATE(text1, [text2], ...)', category: 'text', icon: Type },
  { name: 'CONCAT', description: 'Joins text strings', syntax: 'CONCAT(text1, [text2], ...)', category: 'text', icon: Type },
  { name: 'TEXTJOIN', description: 'Joins text with delimiter', syntax: 'TEXTJOIN(delimiter, ignore_empty, text1, ...)', category: 'text', icon: Type },
  { name: 'LEFT', description: 'Returns leftmost characters', syntax: 'LEFT(text, [num_chars])', category: 'text', icon: Type },
  { name: 'RIGHT', description: 'Returns rightmost characters', syntax: 'RIGHT(text, [num_chars])', category: 'text', icon: Type },
  { name: 'MID', description: 'Returns characters from middle', syntax: 'MID(text, start_num, num_chars)', category: 'text', icon: Type },
  { name: 'LEN', description: 'Returns text length', syntax: 'LEN(text)', category: 'text', icon: Type },
  { name: 'TRIM', description: 'Removes extra spaces', syntax: 'TRIM(text)', category: 'text', icon: Type },
  { name: 'UPPER', description: 'Converts to uppercase', syntax: 'UPPER(text)', category: 'text', icon: Type },
  { name: 'LOWER', description: 'Converts to lowercase', syntax: 'LOWER(text)', category: 'text', icon: Type },
  { name: 'PROPER', description: 'Capitalizes first letters', syntax: 'PROPER(text)', category: 'text', icon: Type },
  { name: 'FIND', description: 'Finds text position (case-sensitive)', syntax: 'FIND(find_text, within_text, [start_num])', category: 'text', icon: Search },
  { name: 'SEARCH', description: 'Finds text position (case-insensitive)', syntax: 'SEARCH(find_text, within_text, [start_num])', category: 'text', icon: Search },
  { name: 'REPLACE', description: 'Replaces characters', syntax: 'REPLACE(old_text, start_num, num_chars, new_text)', category: 'text', icon: Type },
  { name: 'SUBSTITUTE', description: 'Substitutes text', syntax: 'SUBSTITUTE(text, old_text, new_text, [instance_num])', category: 'text', icon: Type },
  { name: 'TEXT', description: 'Formats number as text', syntax: 'TEXT(value, format_text)', category: 'text', icon: Type },
  { name: 'VALUE', description: 'Converts text to number', syntax: 'VALUE(text)', category: 'text', icon: Hash },
  { name: 'REPT', description: 'Repeats text', syntax: 'REPT(text, number_times)', category: 'text', icon: Type },
  
  // Date & Time
  { name: 'TODAY', description: 'Returns today\'s date', syntax: 'TODAY()', category: 'date', icon: Calendar },
  { name: 'NOW', description: 'Returns current date and time', syntax: 'NOW()', category: 'date', icon: Clock },
  { name: 'DATE', description: 'Creates a date', syntax: 'DATE(year, month, day)', category: 'date', icon: Calendar },
  { name: 'YEAR', description: 'Returns year from date', syntax: 'YEAR(serial_number)', category: 'date', icon: Calendar },
  { name: 'MONTH', description: 'Returns month from date', syntax: 'MONTH(serial_number)', category: 'date', icon: Calendar },
  { name: 'DAY', description: 'Returns day from date', syntax: 'DAY(serial_number)', category: 'date', icon: Calendar },
  { name: 'HOUR', description: 'Returns hour from time', syntax: 'HOUR(serial_number)', category: 'date', icon: Clock },
  { name: 'MINUTE', description: 'Returns minute from time', syntax: 'MINUTE(serial_number)', category: 'date', icon: Clock },
  { name: 'SECOND', description: 'Returns second from time', syntax: 'SECOND(serial_number)', category: 'date', icon: Clock },
  { name: 'WEEKDAY', description: 'Returns day of week', syntax: 'WEEKDAY(serial_number, [return_type])', category: 'date', icon: Calendar },
  { name: 'WEEKNUM', description: 'Returns week number', syntax: 'WEEKNUM(serial_number, [return_type])', category: 'date', icon: Calendar },
  { name: 'EOMONTH', description: 'Returns end of month', syntax: 'EOMONTH(start_date, months)', category: 'date', icon: Calendar },
  { name: 'EDATE', description: 'Returns date offset by months', syntax: 'EDATE(start_date, months)', category: 'date', icon: Calendar },
  { name: 'DAYS', description: 'Returns days between dates', syntax: 'DAYS(end_date, start_date)', category: 'date', icon: Calendar },
  { name: 'DATEDIF', description: 'Calculates date difference', syntax: 'DATEDIF(start_date, end_date, unit)', category: 'date', icon: Calendar },
  { name: 'NETWORKDAYS', description: 'Returns working days between dates', syntax: 'NETWORKDAYS(start_date, end_date, [holidays])', category: 'date', icon: Calendar },
  
  // Lookup & Reference
  { name: 'VLOOKUP', description: 'Vertical lookup', syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])', category: 'lookup', icon: Search },
  { name: 'HLOOKUP', description: 'Horizontal lookup', syntax: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])', category: 'lookup', icon: Search },
  { name: 'INDEX', description: 'Returns value at position', syntax: 'INDEX(array, row_num, [column_num])', category: 'lookup', icon: Search },
  { name: 'MATCH', description: 'Returns position of value', syntax: 'MATCH(lookup_value, lookup_array, [match_type])', category: 'lookup', icon: Search },
  { name: 'XLOOKUP', description: 'Searches and returns value', syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, ...)', category: 'lookup', icon: Search },
  { name: 'OFFSET', description: 'Returns reference offset', syntax: 'OFFSET(reference, rows, cols, [height], [width])', category: 'lookup', icon: Search },
  { name: 'INDIRECT', description: 'Returns reference from text', syntax: 'INDIRECT(ref_text, [a1])', category: 'lookup', icon: Search },
  { name: 'ROW', description: 'Returns row number', syntax: 'ROW([reference])', category: 'lookup', icon: Hash },
  { name: 'COLUMN', description: 'Returns column number', syntax: 'COLUMN([reference])', category: 'lookup', icon: Hash },
  { name: 'ROWS', description: 'Returns number of rows', syntax: 'ROWS(array)', category: 'lookup', icon: Hash },
  { name: 'COLUMNS', description: 'Returns number of columns', syntax: 'COLUMNS(array)', category: 'lookup', icon: Hash },
  { name: 'CHOOSE', description: 'Chooses from list of values', syntax: 'CHOOSE(index_num, value1, [value2], ...)', category: 'lookup', icon: Search },
  
  // Financial
  { name: 'PMT', description: 'Returns payment for loan', syntax: 'PMT(rate, nper, pv, [fv], [type])', category: 'financial', icon: DollarSign },
  { name: 'PV', description: 'Returns present value', syntax: 'PV(rate, nper, pmt, [fv], [type])', category: 'financial', icon: DollarSign },
  { name: 'FV', description: 'Returns future value', syntax: 'FV(rate, nper, pmt, [pv], [type])', category: 'financial', icon: DollarSign },
  { name: 'NPV', description: 'Returns net present value', syntax: 'NPV(rate, value1, [value2], ...)', category: 'financial', icon: DollarSign },
  { name: 'IRR', description: 'Returns internal rate of return', syntax: 'IRR(values, [guess])', category: 'financial', icon: DollarSign },
  { name: 'RATE', description: 'Returns interest rate', syntax: 'RATE(nper, pmt, pv, [fv], [type], [guess])', category: 'financial', icon: DollarSign },
  { name: 'NPER', description: 'Returns number of periods', syntax: 'NPER(rate, pmt, pv, [fv], [type])', category: 'financial', icon: DollarSign },
  { name: 'SLN', description: 'Straight-line depreciation', syntax: 'SLN(cost, salvage, life)', category: 'financial', icon: DollarSign },
  
  // Information
  { name: 'ISBLANK', description: 'Checks if cell is empty', syntax: 'ISBLANK(value)', category: 'info', icon: FileText },
  { name: 'ISERROR', description: 'Checks if value is error', syntax: 'ISERROR(value)', category: 'info', icon: FileText },
  { name: 'ISNA', description: 'Checks if value is #N/A', syntax: 'ISNA(value)', category: 'info', icon: FileText },
  { name: 'ISNUMBER', description: 'Checks if value is number', syntax: 'ISNUMBER(value)', category: 'info', icon: FileText },
  { name: 'ISTEXT', description: 'Checks if value is text', syntax: 'ISTEXT(value)', category: 'info', icon: FileText },
  { name: 'ISLOGICAL', description: 'Checks if value is logical', syntax: 'ISLOGICAL(value)', category: 'info', icon: FileText },
  { name: 'TYPE', description: 'Returns type of value', syntax: 'TYPE(value)', category: 'info', icon: FileText },
  { name: 'NA', description: 'Returns #N/A error', syntax: 'NA()', category: 'info', icon: FileText },
];

interface FormulaAutocompleteProps {
  items: FormulaFunction[];
  onSelect: (item: FormulaFunction) => void;
  position: { top: number; left: number };
  query?: string;
}

const FormulaAutocomplete = forwardRef((props: FormulaAutocompleteProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<FormulaCategory | 'all'>('all');

  // Filter items based on query and category
  const filteredItems = useMemo(() => {
    let items = props.items;
    
    // Filter by category first
    if (selectedCategory !== 'all') {
      items = items.filter(item => item.category === selectedCategory);
    }
    
    // Then filter by query
    if (props.query) {
      const queryLower = props.query.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().startsWith(queryLower) ||
        item.name.toLowerCase().includes(queryLower) ||
        item.description.toLowerCase().includes(queryLower)
      );
      
      // Sort: exact match first, then startsWith, then includes
      items.sort((a, b) => {
        const aExact = a.name.toLowerCase() === queryLower ? 0 : 1;
        const bExact = b.name.toLowerCase() === queryLower ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        
        const aStarts = a.name.toLowerCase().startsWith(queryLower) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(queryLower) ? 0 : 1;
        return aStarts - bStarts;
      });
    }
    
    return items;
  }, [props.items, props.query, selectedCategory]);

  // Get unique categories from filtered items for display
  const availableCategories = useMemo(() => {
    const categories = new Set<FormulaCategory>();
    props.items.forEach(item => categories.add(item.category));
    return Array.from(categories);
  }, [props.items]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredItems.length, props.query]);

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
      // Tab to cycle through categories
      if (event.key === 'Tab') {
        event.preventDefault();
        const cats: (FormulaCategory | 'all')[] = ['all', ...availableCategories];
        const currentIdx = cats.indexOf(selectedCategory);
        const nextIdx = event.shiftKey 
          ? (currentIdx - 1 + cats.length) % cats.length 
          : (currentIdx + 1) % cats.length;
        setSelectedCategory(cats[nextIdx]);
        return true;
      }
      return false;
    },
  }));

  if (filteredItems.length === 0 && !props.query) {
    return null;
  }

  // Ensure popup doesn't overflow viewport
  const adjustedPosition = {
    top: props.position.top,
    left: Math.min(props.position.left, typeof window !== 'undefined' ? window.innerWidth - 340 : props.position.left),
  };

  // Group items by category for display (only when not filtering)
  const groupedItems = useMemo(() => {
    if (props.query || selectedCategory !== 'all') {
      return null; // Don't group when filtering
    }
    const groups: Record<FormulaCategory, FormulaFunction[]> = {
      math: [],
      statistical: [],
      logical: [],
      text: [],
      date: [],
      lookup: [],
      financial: [],
      info: [],
    };
    filteredItems.forEach(item => {
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredItems, props.query, selectedCategory]);

  return (
    <div
      className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden fixed z-[10001]"
      style={{ 
        top: `${adjustedPosition.top}px`, 
        left: `${adjustedPosition.left}px`,
        width: '320px',
        maxWidth: 'calc(100vw - 20px)',
        maxHeight: '400px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Category tabs */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-2 py-0.5 text-xs rounded whitespace-nowrap transition-colors ${
            selectedCategory === 'all' 
              ? 'bg-blue-100 text-blue-700 font-medium' 
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All
        </button>
        {availableCategories.slice(0, 6).map(cat => {
          const config = CATEGORY_CONFIG[cat];
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 text-xs rounded whitespace-nowrap transition-colors ${
                selectedCategory === cat 
                  ? 'bg-blue-100 text-blue-700 font-medium' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      {/* Function list */}
      <div className="overflow-y-auto flex-1">
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No functions found for "{props.query}"
          </div>
        ) : (
          filteredItems.slice(0, 20).map((item, index) => {
            const config = CATEGORY_CONFIG[item.category];
            const Icon = item.icon || config.icon || Calculator;
            const isSelected = index === selectedIndex;
            
            return (
              <button
                key={item.name}
                className={`w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2 border-b border-gray-50 ${
                  isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                }`}
                onClick={() => props.onSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isSelected ? 'text-blue-600' : config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                      {item.name}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {config.label}
                    </span>
                  </div>
                  <div className={`text-xs mt-0.5 ${isSelected ? 'text-blue-700' : 'text-gray-500'}`}>
                    {item.description}
                  </div>
                  <div className={`text-[11px] mt-0.5 font-mono ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                    {item.syntax}
                  </div>
                </div>
              </button>
            );
          })
        )}
        {filteredItems.length > 20 && (
          <div className="px-3 py-2 text-xs text-gray-400 text-center border-t border-gray-100">
            +{filteredItems.length - 20} more functions. Keep typing to narrow down.
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-2 py-1 bg-gray-50 border-t border-gray-200 flex-shrink-0">
        <div className="text-[10px] text-gray-400 flex items-center gap-2">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Tab Categories</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
});

FormulaAutocomplete.displayName = 'FormulaAutocomplete';

export default FormulaAutocomplete;
