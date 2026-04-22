import { View, Text, ScrollView } from 'react-native';

export default function SettingsScreen() {
  return (
    <ScrollView className="flex-1 bg-m-bg">
      <View className="px-4 py-4">
        <Text className="text-xs text-m-text-tertiary font-semibold uppercase mb-3">
          Integrations
        </Text>
        {/* GoogleCalendarCard inserted in Task 6 */}
      </View>
    </ScrollView>
  );
}
