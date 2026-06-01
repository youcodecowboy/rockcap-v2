import { View, Text, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LayoutDashboard, Building, File, Upload, Mail, Newspaper,
  CheckSquare, FileText, Users, Settings, X,
  Activity as ActivityIcon,
} from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import type { EntityType } from '@/lib/theme';

interface NavDrawerProps {
  visible: boolean;
  onClose: () => void;
}

// `entity` carries the canon entity colour for entries that map to a typed
// surface (clients=green, docs=deal blue, contacts=purple…). Entries without
// one stay neutral so the dots read as a deliberate accent, not decoration.
const NAV_ITEMS: { label: string; icon: typeof LayoutDashboard; route: string; entity?: EntityType }[] = [
  { label: 'Dashboard', icon: LayoutDashboard, route: '/', entity: 'dashboard' },
  { label: 'Clients', icon: Building, route: '/clients', entity: 'client' },
  { label: 'Documents', icon: File, route: '/docs', entity: 'deal' },
  { label: 'Upload', icon: Upload, route: '/upload' },
  { label: 'Inbox', icon: Mail, route: '/inbox' },
  { label: 'Daily Brief', icon: Newspaper, route: '/brief' },
  { label: 'Activity', icon: ActivityIcon, route: '/activity' },
  { label: 'Tasks', icon: CheckSquare, route: '/tasks' },
  { label: 'Notes', icon: FileText, route: '/notes' },
  { label: 'Contacts', icon: Users, route: '/contacts', entity: 'contact' },
  { label: 'Settings', icon: Settings, route: '/settings' },
];

export default function MobileNavDrawer({ visible, onClose }: NavDrawerProps) {
  const c = useColors();
  const router = useRouter();

  const handlePress = (route: string | null, label: string) => {
    if (route) {
      router.push(route as any);
    } else {
      Alert.alert(label, 'Coming soon');
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 flex-row">
        {/* Drawer panel */}
        <View
          className="w-[280px] bg-m-bg-card pt-14 pb-8 h-full"
          style={{ borderRightWidth: 1, borderRightColor: c.border.default }}
        >
          <View className="flex-row items-center justify-between px-5 mb-6">
            <Text className="text-lg font-bold text-m-text-primary">RockCap</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={c.text.muted} />
            </TouchableOpacity>
          </View>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const dot = item.entity ? c.entityTypes[item.entity] : null;
            return (
              <TouchableOpacity
                key={item.label}
                onPress={() => handlePress(item.route, item.label)}
                className="flex-row items-center gap-3 px-5 py-3"
              >
                <Icon size={18} color={dot ?? c.text.secondary} />
                <Text className="text-sm text-m-text-primary font-medium flex-1">
                  {item.label}
                </Text>
                {dot ? (
                  <View
                    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Backdrop */}
        <Pressable onPress={onClose} className="flex-1 bg-black/40" />
      </View>
    </Modal>
  );
}
