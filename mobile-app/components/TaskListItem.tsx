import { View, Text, TouchableOpacity } from 'react-native';
import { Circle, CheckCircle2 } from 'lucide-react-native';
import { colors } from '@/lib/theme';

// ── Types ────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────

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

const priorityBadge: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: '#fee2e2', text: '#dc2626', label: 'High' },
  medium: { bg: '#fef3c7', text: '#d97706', label: 'Med' },
  low: { bg: '#eff6ff', text: '#2563eb', label: 'Low' },
};

const statusBadge: Record<string, { bg: string; text: string; label: string } | null> = {
  todo: null,
  in_progress: { bg: '#dbeafe', text: '#1d4ed8', label: 'In Progress' },
  paused: { bg: '#fef3c7', text: '#d97706', label: 'Paused' },
  completed: { bg: '#dcfce7', text: '#059669', label: 'Done' },
  cancelled: { bg: '#f1f5f9', text: '#64748b', label: 'Cancelled' },
};

function getCheckBorderColor(task: { status: string; priority?: string; dueDate?: string }): string {
  if (task.dueDate && task.status !== 'completed') {
    const due = new Date(task.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) return colors.error;
  }
  if (task.priority === 'high') return '#ef4444';
  if (task.priority === 'medium') return '#f59e0b';
  if (task.priority === 'low') return '#3b82f6';
  return colors.textTertiary;
}

// ── Component ────────────────────────────────────────────────

export default function TaskListItem({ task, onComplete, onPress }: TaskListItemProps) {
  const isCompleted = task.status === 'completed';
  const accent = getAccentColor(task);
  const dueLabel = task.dueDate ? getDueLabel(task.dueDate) : null;
  const badge = priorityBadge[task.priority || 'medium'];
  const status = statusBadge[task.status];
  const checkColor = getCheckBorderColor(task);

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
            <Circle size={20} color={checkColor} />
          )}
        </TouchableOpacity>

        {/* Content */}
        <TouchableOpacity className="flex-1" activeOpacity={0.6} onPress={() => onPress?.(task._id)}>
          <View className="flex-row items-center gap-1.5">
            <Text
              className={`text-sm font-semibold flex-1 ${isCompleted ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}
              numberOfLines={1}
            >
              {task.title}
            </Text>
            {status && (
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: status.bg }}>
                <Text className="text-[9px] font-semibold" style={{ color: status.text }}>{status.label}</Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center mt-0.5 gap-1">
            {task.clientName && (
              <Text className="text-[11px] text-m-text-tertiary" numberOfLines={1}>
                {task.clientName}
              </Text>
            )}
            {task.clientName && dueLabel && (
              <Text className="text-[11px] text-m-text-tertiary">{'\u00B7'}</Text>
            )}
            {dueLabel && (
              <Text className="text-[11px]" style={{ color: dueLabel.color }}>
                {dueLabel.text}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Priority badge */}
        {badge && (
          <View className="rounded-full px-2 py-0.5 ml-2" style={{ backgroundColor: badge.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: badge.text }}>{badge.label}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
