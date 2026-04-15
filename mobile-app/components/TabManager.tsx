import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { X } from 'lucide-react-native';
import { useDocTabs } from '@/contexts/TabContext';
import { colors } from '@/lib/theme';

export default function TabManager() {
  const { tabs, activeTabId, switchTab, closeTab } = useDocTabs();

  if (tabs.length === 0) return null;

  return (
    <View className="bg-m-bg border-b border-m-border h-9">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 4, alignItems: 'center', height: 36 }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => switchTab(tab.id)}
              className={`flex-row items-center gap-1 px-2.5 py-1 rounded-sm ${isActive ? '' : 'opacity-50'}`}
            >
              <Text
                className={`text-[11px] max-w-[100px] ${isActive ? 'text-m-text-primary font-medium' : 'text-m-text-tertiary'}`}
                numberOfLines={1}
              >
                {tab.title}
              </Text>
              <TouchableOpacity
                onPress={() => closeTab(tab.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={10} color={colors.textTertiary} />
              </TouchableOpacity>
              {isActive && (
                <View className="absolute bottom-0 left-1.5 right-1.5 h-[1.5px] bg-m-accent rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
