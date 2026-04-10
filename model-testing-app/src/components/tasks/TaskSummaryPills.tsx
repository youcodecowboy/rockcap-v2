'use client';

interface TaskMetrics {
  active: number;
  completed: number;
  paused: number;
  dueToday: number;
  overdue: number;
}

interface TaskSummaryPillsProps {
  metrics: TaskMetrics | undefined;
}

const pills = [
  { key: 'active' as const, label: 'Active', bg: 'bg-blue-50', text: 'text-blue-700' },
  { key: 'completed' as const, label: 'Done', bg: 'bg-green-50', text: 'text-green-700' },
  { key: 'paused' as const, label: 'Paused', bg: 'bg-slate-100', text: 'text-slate-600' },
  { key: 'dueToday' as const, label: 'Due Today', bg: 'bg-amber-50', text: 'text-amber-700' },
  { key: 'overdue' as const, label: 'Overdue', bg: 'bg-red-50', text: 'text-red-700' },
];

export default function TaskSummaryPills({ metrics }: TaskSummaryPillsProps) {
  if (!metrics) return null;

  const visiblePills = pills.filter(p => p.key === 'active' || metrics[p.key] > 0);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
      {visiblePills.map(pill => (
        <div
          key={pill.key}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${pill.bg} ${pill.text}`}
        >
          {metrics[pill.key]} {pill.label}
        </div>
      ))}
    </div>
  );
}
