interface BriefStatsBarProps {
  overdue: number;
  dueToday: number;
  meetings: number;
  openFlags: number;
}

export default function BriefStatsBar({ overdue, dueToday, meetings, openFlags }: BriefStatsBarProps) {
  const pills = [
    { label: 'Overdue', value: overdue, color: overdue > 0 ? 'text-[var(--m-error)]' : 'text-[var(--m-text-primary)]' },
    { label: 'Due Today', value: dueToday, color: 'text-[var(--m-text-primary)]' },
    { label: 'Meetings', value: meetings, color: 'text-indigo-600' },
    { label: 'Open Flags', value: openFlags, color: openFlags > 0 ? 'text-[var(--m-warning)]' : 'text-[var(--m-text-primary)]' },
  ];

  return (
    <div className="flex gap-2 mb-4">
      {pills.map(pill => (
        <div key={pill.label} className="flex-1 bg-[var(--m-bg-card)] border border-[var(--m-border)] rounded-[10px] px-3 py-2.5 text-center">
          <div className={`text-[20px] font-bold ${pill.color}`}>{pill.value}</div>
          <div className="text-[10px] text-[var(--m-text-tertiary)] uppercase tracking-[0.04em] mt-0.5">{pill.label}</div>
        </div>
      ))}
    </div>
  );
}
