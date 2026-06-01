import { View, Text, TouchableOpacity } from 'react-native';
import { Circle, CheckCircle2 } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import { typography } from '@/lib/theme';

interface TaskListItemProps {
  task: {
    _id: string;
    title: string;
    status: string;
    dueDate?: string;
    priority?: string;
    clientName?: string;
  };
  onComplete: (taskId: string) => void;
  onPress?: (taskId: string) => void;
}

function getDueLabel(dueDate: string, c: ReturnType<typeof useColors>): { text: string; color: string } {
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, color: c.accent.red };
  if (diffDays === 0) return { text: 'Due today', color: c.accent.yellow };
  if (diffDays === 1) return { text: 'Tomorrow', color: c.text.secondary };
  if (diffDays < 7) return { text: due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), color: c.text.muted };
  return { text: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: c.text.muted };
}

// Status → accent: in_progress→blue, paused→amber, overdue→red.
function getAccentColor(task: { status: string; dueDate?: string }, c: ReturnType<typeof useColors>): string {
  if (task.status === 'in_progress') return c.status.active; // blue
  if (task.status === 'paused') return c.accent.yellow; // amber
  if (task.dueDate && task.status !== 'completed') {
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return c.accent.red;
  }
  return 'transparent';
}

export default function TaskListItem({ task, onComplete, onPress }: TaskListItemProps) {
  const c = useColors();
  const isCompleted = task.status === 'completed';
  const accent = getAccentColor(task, c);
  const dueLabel = task.dueDate ? getDueLabel(task.dueDate, c) : null;

  // Priority → tinted pill: high→red, medium→amber, low→muted.
  const priorityChip =
    task.priority === 'high'
      ? { label: 'High', color: c.accent.red }
      : task.priority === 'medium'
        ? { label: 'Med', color: c.accent.yellow }
        : task.priority === 'low'
          ? { label: 'Low', color: c.text.muted }
          : null;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-xl overflow-hidden flex-row">
      {/* Left accent border */}
      <View style={{ width: 3, backgroundColor: accent }} />

      <View className="flex-1 flex-row items-center px-3 py-3">
        {/* Checkbox */}
        <TouchableOpacity
          onPress={() => !isCompleted && onComplete(task._id)}
          className="mr-3"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {isCompleted ? (
            <CheckCircle2 size={20} color={c.accent.green} />
          ) : (
            <Circle size={20} color={c.text.muted} />
          )}
        </TouchableOpacity>

        {/* Content — tappable to open detail */}
        <TouchableOpacity className="flex-1" activeOpacity={0.6} onPress={() => onPress?.(task._id)}>
          <Text
            className={`text-sm ${isCompleted ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}
            numberOfLines={1}
          >
            {task.title}
          </Text>
          <View className="flex-row items-center mt-0.5 gap-2">
            {dueLabel && (
              <Text className="text-xs" style={{ color: dueLabel.color, fontFamily: typography.family.mono }}>
                {dueLabel.text}
              </Text>
            )}
            {task.clientName && (
              <Text className="text-xs text-m-text-tertiary" numberOfLines={1}>
                {task.clientName}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Priority badge */}
        {priorityChip && (
          <View
            className="rounded px-1.5 py-0.5 ml-2"
            style={{
              backgroundColor: `${priorityChip.color}26`,
              borderWidth: 1,
              borderColor: `${priorityChip.color}66`,
            }}
          >
            <Text className="text-[10px] font-medium" style={{ color: priorityChip.color }}>
              {priorityChip.label}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
