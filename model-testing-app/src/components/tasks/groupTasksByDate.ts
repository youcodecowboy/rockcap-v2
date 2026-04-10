/**
 * Groups a sorted task array into date sections for display.
 * Returns sections like "Overdue", "Due Today", "Tomorrow", "Mon 14 Apr", "No Due Date"
 */

interface TaskWithDate {
  _id: string;
  dueDate?: string;
  [key: string]: any;
}

interface TaskGroup<T> {
  label: string;
  color: string; // tailwind text color class
  tasks: T[];
}

export function groupTasksByDate<T extends TaskWithDate>(tasks: T[]): TaskGroup<T>[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);

  const groups: Map<string, { label: string; color: string; tasks: T[] }> = new Map();

  for (const task of tasks) {
    let key: string;
    let label: string;
    let color: string;

    if (!task.dueDate) {
      key = 'no-date';
      label = 'No Due Date';
      color = 'text-[var(--m-text-tertiary)]';
    } else {
      const dueDay = new Date(task.dueDate);
      const dueDayStart = new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate());
      const diffDays = Math.round((dueDayStart.getTime() - todayStart.getTime()) / 86400000);

      if (diffDays < 0) {
        key = 'overdue';
        label = 'Overdue';
        color = 'text-red-600';
      } else if (diffDays === 0) {
        key = 'today';
        label = 'Due Today';
        color = 'text-amber-600';
      } else if (diffDays === 1) {
        key = 'tomorrow';
        label = 'Tomorrow';
        color = 'text-[var(--m-text-secondary)]';
      } else {
        const dateStr = task.dueDate.split('T')[0];
        key = dateStr;
        label = dueDayStart.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        color = 'text-[var(--m-text-secondary)]';
      }
    }

    if (!groups.has(key)) {
      groups.set(key, { label, color, tasks: [] });
    }
    groups.get(key)!.tasks.push(task);
  }

  return Array.from(groups.values());
}
