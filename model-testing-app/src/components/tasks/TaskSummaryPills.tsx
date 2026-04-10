'use client';

import { Circle, ArrowRight, Pause, CheckCircle, AlertTriangle, CalendarClock } from 'lucide-react';

interface TaskMetrics {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  paused: number;
  dueToday: number;
  overdue: number;
}

interface TaskSummaryPillsProps {
  metrics: TaskMetrics | undefined;
}

const cards: {
  key: keyof TaskMetrics;
  label: string;
  icon: typeof Circle;
  accent: string;    // border-left color
  iconColor: string; // icon color
  numColor: string;  // number color
}[] = [
  { key: 'todo', label: 'To Do', icon: Circle, accent: 'border-l-blue-400', iconColor: 'text-blue-500', numColor: 'text-blue-700' },
  { key: 'inProgress', label: 'In Progress', icon: ArrowRight, accent: 'border-l-blue-600', iconColor: 'text-blue-600', numColor: 'text-blue-700' },
  { key: 'paused', label: 'Paused', icon: Pause, accent: 'border-l-amber-400', iconColor: 'text-amber-500', numColor: 'text-amber-700' },
  { key: 'completed', label: 'Completed', icon: CheckCircle, accent: 'border-l-green-500', iconColor: 'text-green-500', numColor: 'text-green-700' },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, accent: 'border-l-red-500', iconColor: 'text-red-500', numColor: 'text-red-700' },
  { key: 'dueToday', label: 'Due Today', icon: CalendarClock, accent: 'border-l-amber-500', iconColor: 'text-amber-600', numColor: 'text-amber-700' },
];

export default function TaskSummaryPills({ metrics }: TaskSummaryPillsProps) {
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(card => {
        const Icon = card.icon;
        const value = metrics[card.key];
        return (
          <div
            key={card.key}
            className={`bg-white border border-[var(--m-border)] border-l-[3px] ${card.accent} rounded-lg px-2.5 py-2 flex flex-col gap-1`}
          >
            <div className="flex items-center gap-1.5">
              <Icon className={`w-3 h-3 ${card.iconColor}`} />
              <span className="text-[10px] text-[var(--m-text-tertiary)] font-medium truncate">{card.label}</span>
            </div>
            <span className={`text-lg font-bold leading-none ${value > 0 ? card.numColor : 'text-[var(--m-text-tertiary)]'}`}>
              {value}
            </span>
          </div>
        );
      })}
    </div>
  );
}
