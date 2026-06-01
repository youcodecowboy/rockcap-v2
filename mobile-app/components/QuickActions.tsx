import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, Plus, FileText } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';

const actions = [
  { label: 'Upload', icon: Camera, route: '/upload' },
  { label: 'New Task', icon: Plus, route: '/tasks?create=true' },
  { label: 'New Note', icon: FileText, route: '/notes/editor' },
] as const;

export default function QuickActions() {
  const router = useRouter();
  const c = useColors();

  return (
    <View className="flex-row gap-2">
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <TouchableOpacity
            key={action.label}
            onPress={() => router.push(action.route)}
            className="flex-1 bg-m-bg-card border border-m-border rounded-xl py-3 items-center gap-1.5"
          >
            <Icon size={18} color={c.text.primary} />
            <Text className="text-m-text-primary text-xs font-medium">
              {action.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
