import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useDocTabs } from '@/contexts/TabContext';
import { colors } from '@/lib/theme';

// Tab strip rendered app-wide as an extension of the RockCap MobileHeader
// (dark brand bar). Shows every doc the user has "Added to tabs" from the
// viewer, regardless of which screen they're on. Tapping a tab navigates
// to that doc's viewer. Persists until the user closes each tab.
export default function TabManager() {
  const router = useRouter();
  const { tabs, activeTabId, switchTab, closeTab } = useDocTabs();

  if (tabs.length === 0) return null;

  const handleTabPress = (tab: { id: string; documentId: string; title: string; fileType: string }) => {
    switchTab(tab.id);
    // switchTab only updates active state in context. The user's mental model
    // is "tap the tab → open that doc", so also push the viewer route. If
    // the user is already in the viewer for this tab, this is effectively
    // a no-op (expo-router dedupes same-route pushes with matching params).
    router.push({
      pathname: '/(tabs)/docs/viewer',
      params: {
        documentId: tab.documentId,
        title: tab.title,
        fileType: tab.fileType,
      },
    } as any);
  };

  return (
    <View
      style={{
        backgroundColor: colors.bgBrand,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          gap: 6,
          alignItems: 'center',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => handleTabPress(tab)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 10,
                paddingRight: 6,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: isActive
                  ? 'rgba(255,255,255,0.22)'
                  : 'rgba(255,255,255,0.08)',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '500',
                  color: isActive
                    ? colors.textOnBrand
                    : 'rgba(255,255,255,0.7)',
                  maxWidth: 120,
                }}
                numberOfLines={1}
              >
                {tab.title}
              </Text>
              <TouchableOpacity
                onPress={() => closeTab(tab.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 16,
                  height: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                }}
              >
                <X size={10} color={colors.textOnBrand} strokeWidth={2.5} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
