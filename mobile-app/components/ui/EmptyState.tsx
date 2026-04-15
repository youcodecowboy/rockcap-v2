import { View, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <Icon size={32} color={colors.textTertiary} />
      <Text className="text-m-text-primary font-medium text-base mt-4">{title}</Text>
      {description ? (
        <Text className="text-m-text-tertiary text-sm text-center mt-1">{description}</Text>
      ) : null}
    </View>
  );
}
