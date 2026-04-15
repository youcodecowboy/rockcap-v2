import { View, ActivityIndicator, Text } from 'react-native';
import { colors } from '@/lib/theme';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  return (
    <View className="flex-1 items-center justify-center py-12">
      <ActivityIndicator size="small" color={colors.textTertiary} />
      {message ? (
        <Text className="text-m-text-tertiary text-sm mt-3">{message}</Text>
      ) : null}
    </View>
  );
}
