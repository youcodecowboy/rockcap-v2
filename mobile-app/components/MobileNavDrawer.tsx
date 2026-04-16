import { View, Text, TouchableOpacity, Modal, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  LayoutDashboard, Building, File, Upload, Mail, Newspaper,
  CheckSquare, FileText, Users, Settings, X
} from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface NavDrawerProps {
  visible: boolean;
  onClose: () => void;
}

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, route: '/' },
  { label: 'Clients', icon: Building, route: '/clients' },
  { label: 'Documents', icon: File, route: '/docs' },
  { label: 'Upload', icon: Upload, route: '/upload' },
  { label: 'Inbox', icon: Mail, route: '/inbox' },
  { label: 'Daily Brief', icon: Newspaper, route: '/brief' },
  { label: 'Tasks', icon: CheckSquare, route: '/tasks' },
  { label: 'Notes', icon: FileText, route: '/notes' },
  { label: 'Contacts', icon: Users, route: '/contacts' },
  { label: 'Settings', icon: Settings, route: null },
];

export default function MobileNavDrawer({ visible, onClose }: NavDrawerProps) {
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
        <View className="w-[280px] bg-m-bg-card pt-14 pb-8 shadow-2xl h-full">
          <View className="flex-row items-center justify-between px-5 mb-6">
            <Text className="text-lg font-bold text-m-text-primary">RockCap</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.label}
                onPress={() => handlePress(item.route, item.label)}
                className="flex-row items-center gap-3 px-5 py-3"
              >
                <Icon size={18} color={colors.textSecondary} />
                <Text className="text-sm text-m-text-primary font-medium">
                  {item.label}
                </Text>
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
