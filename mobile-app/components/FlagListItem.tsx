import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Flag, ChevronRight } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import { typography } from '@/lib/theme';
import Chip from '@/components/ui/Chip';

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
  const c = useColors();
  const isOpen = flag.status === 'open';
  // Open flags warn (orange), resolved flags read as ok (green).
  const tone = isOpen ? c.accent.orange : c.accent.green;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/inbox/${flag._id}`)}
      className="bg-m-bg-card border border-m-border rounded-xl px-4 py-3 flex-row items-center"
    >
      <Flag size={16} color={tone} fill={isOpen ? tone : 'transparent'} />
      <View className="flex-1 ml-3 gap-1">
        <Text className="text-sm text-m-text-primary" numberOfLines={1}>{flag.title}</Text>
        <View className="flex-row items-center gap-2">
          <Chip label={isOpen ? 'Open' : 'Resolved'} color={tone} dot />
          <Text
            className="text-xs text-m-text-tertiary"
            style={{ fontFamily: typography.family.mono }}
          >
            {new Date(flag._creationTime).toLocaleDateString('en-GB')}
          </Text>
        </View>
      </View>
      <ChevronRight size={16} color={c.text.muted} />
    </TouchableOpacity>
  );
}
