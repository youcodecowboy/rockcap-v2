import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Flag, ChevronRight } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface FlagListItemProps {
  flag: {
    _id: string;
    title: string;
    status: string;
    type?: string;
    _creationTime: number;
  };
}

export default function FlagListItem({ flag }: FlagListItemProps) {
  const router = useRouter();
  const isOpen = flag.status === 'open';

  return (
    <TouchableOpacity
      onPress={() => router.push(`/inbox/${flag._id}`)}
      className="bg-m-bg-card border border-m-border rounded-xl px-4 py-3 flex-row items-center"
    >
      <Flag size={16} color={isOpen ? colors.warning : colors.success} fill={isOpen ? colors.warning : 'transparent'} />
      <View className="flex-1 ml-3">
        <Text className="text-sm text-m-text-primary" numberOfLines={1}>{flag.title}</Text>
        <Text className="text-xs text-m-text-tertiary mt-0.5">
          {new Date(flag._creationTime).toLocaleDateString('en-GB')} · {isOpen ? 'Open' : 'Resolved'}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}
