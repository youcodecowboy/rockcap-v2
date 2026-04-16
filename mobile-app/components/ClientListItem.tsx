import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface ClientListItemProps {
  client: {
    _id: string;
    name: string;
    status?: string;
    type?: string;
  };
  projectCount?: number;
  docCount?: number;
  compact?: boolean;
}

const roleBadgeStyles: Record<string, { bg: string; text: string }> = {
  developer: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  borrower: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

function RoleBadge({ type }: { type: string }) {
  const style = roleBadgeStyles[type] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <View className={`px-1.5 py-0.5 rounded ${style.bg}`}>
      <Text className={`text-[10px] font-semibold uppercase ${style.text}`}>
        {type}
      </Text>
    </View>
  );
}

export default function ClientListItem({ client, projectCount, docCount, compact }: ClientListItemProps) {
  const router = useRouter();

  const countParts: string[] = [];
  if (projectCount !== undefined) countParts.push(`${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`);
  if (docCount !== undefined) countParts.push(`${docCount} ${docCount === 1 ? 'doc' : 'docs'}`);

  // Compact = horizontal recent card style; default = list row with divider
  if (compact) {
    return (
      <TouchableOpacity
        onPress={() => router.push(`/clients/${client._id}`)}
        className="bg-m-bg-card border border-m-border rounded-xl px-3 py-3"
      >
        <Text className="text-sm font-medium text-m-text-primary" numberOfLines={1}>
          {client.name}
        </Text>
        {client.type && <RoleBadge type={client.type} />}
        {countParts.length > 0 && (
          <Text className="text-xs text-m-text-tertiary mt-1">
            {countParts.join(' · ')}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={() => router.push(`/clients/${client._id}`)}
      className="border-b border-m-border px-4 py-3 flex-row items-center"
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium text-m-text-primary">{client.name}</Text>
          {client.type && <RoleBadge type={client.type} />}
        </View>
        {countParts.length > 0 && (
          <Text className="text-xs text-m-text-tertiary mt-0.5">
            {countParts.join(' · ')}
          </Text>
        )}
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}
