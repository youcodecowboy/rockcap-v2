'use client';

interface TaskDayStripProps {
  dateCounts: Record<string, number> | undefined;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

function getDayInfo(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const iso = date.toISOString().split('T')[0];
  const dayShort = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const dayNum = date.getDate();
  return { iso, dayShort, dayNum };
}

export default function TaskDayStrip({ dateCounts, selectedDate, onSelectDate }: TaskDayStripProps) {
  const days = Array.from({ length: 7 }, (_, i) => getDayInfo(i));

  return (
    <div className="flex gap-1">
      {days.map(day => {
        const count = dateCounts?.[day.iso] || 0;
        const isSelected = selectedDate === day.iso;

        return (
          <button
            key={day.iso}
            onClick={() => onSelectDate(isSelected ? null : day.iso)}
            className={`flex-1 flex flex-col items-center py-2 rounded-lg transition-colors ${
              isSelected
                ? 'bg-[var(--m-accent)] text-white'
                : 'bg-white border border-[var(--m-border)]'
            }`}
          >
            <span className={`text-[10px] ${
              isSelected ? 'opacity-80' : 'text-[var(--m-text-tertiary)]'
            }`}>
              {day.dayShort}
            </span>
            <span className={`text-sm font-bold ${
              isSelected ? '' : 'text-[var(--m-text-primary)]'
            }`}>
              {day.dayNum}
            </span>
            {count > 0 && (
              <span className={`text-[9px] mt-0.5 ${
                isSelected ? 'opacity-80' : 'text-[var(--m-text-tertiary)]'
              }`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
