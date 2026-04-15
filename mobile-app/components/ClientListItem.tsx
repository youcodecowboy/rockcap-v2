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
}

export default function ClientListItem({ client }: ClientListItemProps) {
  const router = useRouter();

  const statusColor =
    client.status === 'active'
      ? 'bg-m-success'
      : client.status === 'prospect'
        ? 'bg-m-warning'
        : 'bg-m-text-tertiary';

  return (
    <TouchableOpacity
      onPress={() => router.push(`/clients/${client._id}`)}
      className="bg-m-bg-card border border-m-border rounded-xl px-4 py-3.5 flex-row items-center"
    >
      <View className={`w-2 h-2 rounded-full ${statusColor} mr-3`} />
      <View className="flex-1">
        <Text className="text-sm font-medium text-m-text-primary">{client.name}</Text>
        {client.type ? (
          <Text className="text-xs text-m-text-tertiary mt-0.5 capitalize">
            {client.type}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}
