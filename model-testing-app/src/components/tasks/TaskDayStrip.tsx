'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

interface TaskDayStripProps {
  dateCounts: Record<string, number> | undefined;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  weekOffset: number;
  onWeekChange: (offset: number) => void;
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
  const startOffset = weekOffset * 7;
  const days = Array.from({ length: 7 }, (_, i) => getDayInfo(startOffset + i));

  // Week label: "10 - 16 Apr" or "28 Mar - 3 Apr" (cross-month)
  const firstDay = days[0];
  const lastDay = days[6];
  const weekLabel = firstDay.monthShort === lastDay.monthShort
    ? `${firstDay.dayNum} – ${lastDay.dayNum} ${firstDay.monthShort}`
    : `${firstDay.dayNum} ${firstDay.monthShort} – ${lastDay.dayNum} ${lastDay.monthShort}`;

  const todayIso = new Date().toISOString().split('T')[0];
  const accent = colors.accent.blue;

  return (
    <div>
      {/* Week navigation header */}
      <div className="flex items-center justify-between mb-2">
        <IconButton label="Previous week" onClick={() => onWeekChange(weekOffset - 1)}>
          <ChevronLeft size={16} />
        </IconButton>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.05em', fontWeight: 500, color: colors.text.primary }}>
          {weekLabel}
        </span>
        <IconButton label="Next week" onClick={() => onWeekChange(weekOffset + 1)}>
          <ChevronRight size={16} />
        </IconButton>
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
              className="flex-1 flex flex-col items-center relative"
              style={{
                padding: '8px 0',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'background 100ms linear',
                background: isSelected ? accent : colors.bg.card,
                border: isSelected
                  ? `1px solid ${accent}`
                  : isToday
                  ? `2px solid ${accent}`
                  : `1px solid ${colors.border.default}`,
              }}
            >
              {/* Today label */}
              {isToday && !isSelected && (
                <span
                  className="absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: -6,
                    fontFamily: MONO,
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    color: '#ffffff',
                    background: accent,
                    padding: '0 6px',
                    borderRadius: 999,
                    lineHeight: '14px',
                  }}
                >
                  TODAY
                </span>
              )}
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: '0.04em',
                  color: isSelected ? 'rgba(255,255,255,0.85)' : isToday ? accent : colors.text.muted,
                  fontWeight: isToday && !isSelected ? 500 : 400,
                }}
              >
                {day.dayShort}
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: isSelected ? '#ffffff' : isToday ? accent : colors.text.primary,
                }}
              >
                {day.dayNum}
              </span>
              {/* Task count */}
              <div
                style={{
                  marginTop: 4,
                  minWidth: 20,
                  padding: '1px 4px',
                  borderRadius: 3,
                  textAlign: 'center',
                  fontFamily: MONO,
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  background: isSelected
                    ? count > 0 ? 'rgba(255,255,255,0.2)' : 'transparent'
                    : count > 0 ? `${accent}20` : 'transparent',
                  color: isSelected
                    ? count > 0 ? '#ffffff' : 'rgba(255,255,255,0.4)'
                    : count > 0 ? accent : colors.text.dim,
                }}
              >
                {count}
              </div>
            </button>
          );
        })}
      </div>

      {/* Back to today link when viewing other weeks */}
      {weekOffset !== 0 && (
        <button
          onClick={() => onWeekChange(0)}
          className="mt-1.5 w-full text-center"
          style={{
            fontFamily: MONO,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: accent,
            fontWeight: 500,
            padding: '4px 0',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ← Back to this week
        </button>
      )}
    </div>
  );
}
