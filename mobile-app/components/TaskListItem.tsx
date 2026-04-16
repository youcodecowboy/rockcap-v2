import { View, Text, TouchableOpacity } from 'react-native';
import { Circle, CheckCircle2 } from 'lucide-react-native';
import { colors } from '@/lib/theme';

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

function getDueLabel(dueDate: string): { text: string; color: string } {
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) return { text: `Overdue ${Math.abs(diffDays)}d`, color: colors.error };
  if (diffDays === 0) return { text: 'Due today', color: colors.warning };
  if (diffDays === 1) return { text: 'Tomorrow', color: colors.textSecondary };
  if (diffDays < 7) return { text: due.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }), color: colors.textTertiary };
  return { text: due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: colors.textTertiary };
}

function getAccentColor(task: { status: string; dueDate?: string }): string {
  if (task.status === 'in_progress') return '#3b82f6';
  if (task.status === 'paused') return '#f59e0b';
  if (task.dueDate && task.status !== 'completed') {
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return colors.error;
  }
  return 'transparent';
}

export default function TaskListItem({ task, onComplete, onPress }: TaskListItemProps) {
  const isCompleted = task.status === 'completed';
  const accent = getAccentColor(task);
  const dueLabel = task.dueDate ? getDueLabel(task.dueDate) : null;

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
            <CheckCircle2 size={20} color={colors.success} />
          ) : (
            <Circle size={20} color={colors.textTertiary} />
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
              <Text className="text-xs" style={{ color: dueLabel.color }}>
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
        {task.priority === 'high' && (
          <View className="bg-red-50 rounded px-1.5 py-0.5 ml-2">
            <Text className="text-[10px] font-medium" style={{ color: colors.error }}>High</Text>
          </View>
        )}
        {task.priority === 'medium' && (
          <View className="bg-amber-50 rounded px-1.5 py-0.5 ml-2">
            <Text className="text-[10px] font-medium" style={{ color: colors.warning }}>Med</Text>
          </View>
        )}
        {task.priority === 'low' && (
          <View className="bg-gray-50 rounded px-1.5 py-0.5 ml-2">
            <Text className="text-[10px] font-medium" style={{ color: colors.textTertiary }}>Low</Text>
          </View>
        )}
      </View>
    </View>
  );
}
