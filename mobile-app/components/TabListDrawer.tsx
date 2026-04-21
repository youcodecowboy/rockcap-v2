import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { X, FileText } from 'lucide-react-native';
import { useDocTabs } from '@/contexts/TabContext';
import { colors } from '@/lib/theme';

interface TabListDrawerProps {
  visible: boolean;
  onClose: () => void;
}

// Right-side drawer that lists every open doc tab in a vertical list.
// Mirrors MobileNavDrawer's interaction model (slide + backdrop close),
// but the panel docks right — familiar "from the other side" gesture for
// the secondary navigation axis.
//
// Rationale: horizontal tab scrolling gets tedious past ~5 tabs on mobile.
// A vertical list lets users scan full filenames, jump directly to any
// tab, and see the count at a glance. Tap row → open viewer + close drawer.
export default function TabListDrawer({ visible, onClose }: TabListDrawerProps) {
  const router = useRouter();
  const { tabs, activeTabId, switchTab, closeTab } = useDocTabs();

  const handleSelect = (tab: { id: string; documentId: string; title: string; fileType: string }) => {
    switchTab(tab.id);
    router.push({
      pathname: '/(tabs)/docs/viewer',
      params: {
        documentId: tab.documentId,
        title: tab.title,
        fileType: tab.fileType,
      },
    } as any);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 flex-row">
        {/* Backdrop first so the panel sits on the RIGHT. Mirrors
            MobileNavDrawer's left-dock by flipping the order. */}
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />

        <View className="w-[300px] bg-m-bg-card pt-14 pb-8 shadow-2xl h-full">
          <View className="flex-row items-center justify-between px-5 mb-3">
            <View>
              <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                Open Tabs
              </Text>
              <Text className="text-lg font-bold text-m-text-primary">
                {tabs.length} {tabs.length === 1 ? 'doc' : 'docs'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {tabs.length === 0 ? (
            <View className="px-5 pt-4">
              <Text className="text-sm text-m-text-tertiary">
                No tabs open yet. Add docs to tabs from the viewer.
              </Text>
            </View>
          ) : (
            <ScrollView className="flex-1">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTabId;
                return (
                  <View
                    key={tab.id}
                    className="flex-row items-center gap-3 px-5 py-3 border-b border-m-border-subtle"
                    style={{
                      backgroundColor: isActive ? colors.bgSubtle : 'transparent',
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => handleSelect(tab)}
                      className="flex-1 flex-row items-center gap-3 min-w-0"
                      activeOpacity={0.7}
                    >
                      <FileText
                        size={16}
                        color={isActive ? colors.accent : colors.textTertiary}
                      />
                      <View className="flex-1 min-w-0">
                        <Text
                          className="text-sm font-medium text-m-text-primary"
                          numberOfLines={1}
                        >
                          {tab.title}
                        </Text>
                        {tab.fileType ? (
                          <Text
                            className="text-[11px] text-m-text-tertiary mt-0.5"
                            numberOfLines={1}
                          >
                            {tab.fileType}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => closeTab(tab.id)}
                      hitSlop={8}
                      className="w-7 h-7 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.bgSubtle }}
                    >
                      <X size={12} color={colors.textSecondary} strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
