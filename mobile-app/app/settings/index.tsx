import { View, Text, ScrollView } from 'react-native';
import MobileHeader from '@/components/MobileHeader';
import MiniTabBar from '@/components/MiniTabBar';
import GoogleCalendarCard from '@/components/settings/GoogleCalendarCard';

export default function SettingsScreen() {
  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />
      <ScrollView className="flex-1">
        <View className="px-4 py-4">
          <Text className="text-xs text-m-text-tertiary font-semibold uppercase mb-3">
            Integrations
          </Text>
          <GoogleCalendarCard />
        </View>
      </ScrollView>
      <MiniTabBar />
    </View>
  );
}
