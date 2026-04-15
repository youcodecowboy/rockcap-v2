interface ScheduleItem {
  _id: string;
  [key: string]: any;
}

interface ScheduleGroup<T> {
  label: string;
  color: string;
  tasks: T[];
}

export function groupByDate<T extends ScheduleItem>(
  items: T[],
  getDate: (item: T) => string | undefined,
): ScheduleGroup<T>[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const groups: Map<string, { label: string; color: string; tasks: T[] }> = new Map();

  for (const item of items) {
    let key: string;
    let label: string;
    let color: string;

    const dateStr = getDate(item);

    if (!dateStr) {
      key = 'no-date';
      label = 'No Due Date';
      color = 'text-[var(--m-text-tertiary)]';
    } else {
      const itemDay = new Date(dateStr);
      const itemDayStart = new Date(itemDay.getFullYear(), itemDay.getMonth(), itemDay.getDate());
      const diffDays = Math.round((itemDayStart.getTime() - todayStart.getTime()) / 86400000);

      if (diffDays < 0) {
        key = 'overdue';
        label = 'Overdue';
        color = 'text-red-600';
      } else if (diffDays === 0) {
        key = 'today';
        label = 'Today';
        color = 'text-amber-600';
      } else if (diffDays === 1) {
        key = 'tomorrow';
        label = 'Tomorrow';
        color = 'text-[var(--m-text-secondary)]';
      } else {
        const ds = dateStr.split('T')[0];
        key = ds;
        label = itemDayStart.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        color = 'text-[var(--m-text-secondary)]';
      }
    }

    if (!groups.has(key)) {
      groups.set(key, { label, color, tasks: [] });
    }
    groups.get(key)!.tasks.push(item);
  }

  return Array.from(groups.values());
}

// Backward-compatible alias
export function groupTasksByDate<T extends ScheduleItem>(tasks: T[]): ScheduleGroup<T>[] {
  return groupByDate(tasks, (t) => t.dueDate);
}
