'use client';

import { useState, useEffect } from 'react';

interface DatePickerCompactProps {
  value: string; // ISO date string (YYYY-MM-DD)
  onChange: (value: string) => void;
  minDate?: Date; // Minimum selectable date
}

export default function DatePickerCompact({ value, onChange, minDate }: DatePickerCompactProps) {
  const today = minDate || new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  // Parse initial value or use today
  const getInitialDate = () => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
        };
      }
    }
    return {
      year: currentYear,
      month: currentMonth,
      day: currentDay,
    };
  };

  const initialDate = getInitialDate();
  const [selectedYear] = useState(initialDate.year);
  const [selectedMonth, setSelectedMonth] = useState(initialDate.month);
  const [selectedDay, setSelectedDay] = useState(initialDate.day);
  const [isInternalChange, setIsInternalChange] = useState(false);

  // Update parent when selection changes (but only if it's an internal change)
  useEffect(() => {
    if (isInternalChange) {
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const validDay = Math.min(selectedDay, daysInMonth);
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
      onChange(dateStr);
      setIsInternalChange(false);
    }
  }, [selectedYear, selectedMonth, selectedDay, isInternalChange, onChange]);

  // Sync with external value changes (but prevent infinite loop)
  useEffect(() => {
    if (value && !isInternalChange) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const newMonth = date.getMonth() + 1;
        const newDay = date.getDate();
        // Only update if different - use setTimeout to avoid synchronous setState
        if (newMonth !== selectedMonth || newDay !== selectedDay) {
          setTimeout(() => {
            setSelectedMonth(newMonth);
            setSelectedDay(newDay);
          }, 0);
        }
      }
    }
  }, [value, isInternalChange, selectedMonth, selectedDay]);

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Determine which months are available (from current month onwards)
  const availableMonths = selectedYear === currentYear
    ? months.slice(currentMonth - 1)
    : months;

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedMonth}
        onChange={(e) => {
          const newMonth = parseInt(e.target.value);
          setIsInternalChange(true);
          setSelectedMonth(newMonth);
          // Adjust day if needed
          const daysInNewMonth = new Date(selectedYear, newMonth, 0).getDate();
          if (selectedDay > daysInNewMonth) {
            setSelectedDay(daysInNewMonth);
          }
        }}
        className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {availableMonths.map((month, index) => {
          const monthNum = selectedYear === currentYear ? currentMonth + index : index + 1;
          return (
            <option key={monthNum} value={monthNum}>
              {month}
            </option>
          );
        })}
      </select>

      <select
        value={selectedDay}
        onChange={(e) => {
          setIsInternalChange(true);
          setSelectedDay(parseInt(e.target.value));
        }}
        className="px-2 py-1 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {days.map((day) => (
          <option key={day} value={day}>
            {day}
          </option>
        ))}
      </select>

      <span className="text-sm text-gray-500 font-medium">{selectedYear}</span>
    </div>
  );
}

