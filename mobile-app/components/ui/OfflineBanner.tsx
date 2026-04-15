import { View, Text } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { colors } from '@/lib/theme';

export default function OfflineBanner() {
  return (
    <View className="bg-m-warning/10 border-b border-m-warning/20 px-4 py-2 flex-row items-center gap-2">
      <WifiOff size={14} color={colors.warning} />
      <Text className="text-m-warning text-xs font-medium">
        Offline — showing cached data
      </Text>
    </View>
  );
}
