import { View, Text } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';

export default function ChatScreen() {
  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />
      <View className="flex-1 items-center justify-center px-8">
        <MessageCircle size={48} color={colors.textTertiary} />
        <Text className="text-lg font-medium text-m-text-primary mt-4">
          Chat Agent
        </Text>
        <Text className="text-sm text-m-text-tertiary text-center mt-2">
          The AI assistant will be available here after the chat overhaul.
        </Text>
      </View>
    </View>
  );
}
