'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TaskDayStripProps {
  dateCounts: Record<string, number> | undefined;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
}

function getDayInfo(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const iso = date.toISOString().split('T')[0];
  const dayShort = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const dayNum = date.getDate();
  const monthShort = date.toLocaleDateString('en-GB', { month: 'short' });
  return { iso, dayShort, dayNum, monthShort };
}

/** Utility: get the start/end ISO date strings for a given week offset */
export function getWeekRange(weekOffset: number) {
  const start = new Date();
  start.setDate(start.getDate() + weekOffset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export default function TaskDayStrip({ dateCounts, selectedDate, onSelectDate, weekOffset, onWeekChange }: TaskDayStripProps) {
  const startOffset = weekOffset * 7;
  const days = Array.from({ length: 7 }, (_, i) => getDayInfo(startOffset + i));

  // Week label: "10 - 16 Apr" or "28 Mar - 3 Apr" (cross-month)
  const firstDay = days[0];
  const lastDay = days[6];
  const weekLabel = firstDay.monthShort === lastDay.monthShort
    ? `${firstDay.dayNum} – ${lastDay.dayNum} ${firstDay.monthShort}`
    : `${firstDay.dayNum} ${firstDay.monthShort} – ${lastDay.dayNum} ${lastDay.monthShort}`;

  const todayIso = new Date().toISOString().split('T')[0];

  return (
    <div>
      {/* Week navigation header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => onWeekChange(weekOffset - 1)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--m-border)] bg-white text-[var(--m-text-secondary)] active:bg-[var(--m-bg-subtle)]"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--m-text-primary)]">{weekLabel}</span>
          {weekOffset !== 0 && (
            <button
              onClick={() => onWeekChange(0)}
              className="text-[10px] text-[var(--m-accent)] font-medium px-1.5 py-0.5 rounded bg-[var(--m-accent-subtle)]"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => onWeekChange(weekOffset + 1)}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--m-border)] bg-white text-[var(--m-text-secondary)] active:bg-[var(--m-bg-subtle)]"
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day cards */}
      <div className="flex gap-1.5">
        {days.map(day => {
          const count = dateCounts?.[day.iso] || 0;
          const isSelected = selectedDate === day.iso;
          const isToday = day.iso === todayIso;

          return (
            <button
              key={day.iso}
              onClick={() => onSelectDate(isSelected ? null : day.iso)}
              className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-colors ${
                isSelected
                  ? 'bg-[var(--m-accent)] text-white shadow-sm'
                  : isToday
                  ? 'bg-white border-2 border-[var(--m-accent)] border-opacity-40'
                  : 'bg-white border border-[var(--m-border)]'
              }`}
            >
              <span className={`text-[10px] ${
                isSelected ? 'opacity-80' : 'text-[var(--m-text-tertiary)]'
              }`}>
                {day.dayShort}
              </span>
              <span className={`text-sm font-bold ${
                isSelected ? '' : isToday ? 'text-[var(--m-accent)]' : 'text-[var(--m-text-primary)]'
              }`}>
                {day.dayNum}
              </span>
              {/* Task count card */}
              <div className={`mt-1 min-w-[20px] px-1 py-0.5 rounded text-center text-[11px] font-semibold leading-none ${
                isSelected
                  ? count > 0 ? 'bg-white/20 text-white' : 'text-white/40'
                  : count > 0
                  ? 'bg-[var(--m-accent-subtle)] text-[var(--m-accent)]'
                  : 'text-[var(--m-text-placeholder)]'
              }`}>
                {count}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
