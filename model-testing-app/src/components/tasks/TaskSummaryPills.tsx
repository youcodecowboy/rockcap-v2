'use client';

import { StatTile } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import type { ColorPalette } from '@/lib/colors';

interface TaskMetrics {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  paused: number;
  dueToday: number;
  overdue: number;
  meetingsToday: number;
}

interface TaskSummaryPillsProps {
  metrics: TaskMetrics | undefined;
}

const cards: {
  key: keyof TaskMetrics;
  label: string;
  accent: (c: ColorPalette) => string;
}[] = [
  { key: 'todo', label: 'To Do', accent: (c) => c.accent.blue },
  { key: 'inProgress', label: 'In Progress', accent: (c) => c.accent.blue },
  { key: 'meetingsToday', label: 'Meetings', accent: (c) => c.accent.indigo },
  { key: 'completed', label: 'Completed', accent: (c) => c.accent.green },
  { key: 'overdue', label: 'Overdue', accent: (c) => c.accent.red },
  { key: 'dueToday', label: 'Due Today', accent: (c) => c.accent.yellow },
];

export default function TaskSummaryPills({ metrics }: TaskSummaryPillsProps) {
  const colors = useColors();
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map(card => {
        const value = metrics[card.key];
        return (
          <StatTile
            key={card.key}
            label={card.label}
            value={value}
            accent={value > 0 ? card.accent(colors) : colors.border.mid}
          />
        );
      })}
    </div>
  );
}
