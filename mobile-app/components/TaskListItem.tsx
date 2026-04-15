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
  };
  onComplete: (taskId: string) => void;
}

export default function TaskListItem({ task, onComplete }: TaskListItemProps) {
  const isCompleted = task.status === 'completed';
  const isOverdue = !isCompleted && task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <View className="bg-m-bg-card border border-m-border rounded-xl px-4 py-3 flex-row items-center">
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
      <View className="flex-1">
        <Text
          className={`text-sm ${isCompleted ? 'text-m-text-tertiary line-through' : 'text-m-text-primary'}`}
          numberOfLines={1}
        >
          {task.title}
        </Text>
        {task.dueDate ? (
          <Text className={`text-xs mt-0.5 ${isOverdue ? 'text-m-error' : 'text-m-text-tertiary'}`}>
            {isOverdue ? 'Overdue: ' : 'Due: '}
            {new Date(task.dueDate).toLocaleDateString('en-GB')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
