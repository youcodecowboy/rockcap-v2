import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useColors } from '@/lib/useColors';
import Chip from '@/components/ui/Chip';

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

// Role badge — entity-coloured chip. Developer reads as a client (green), borrower
// as a prospect-style amber accent; anything else falls back to a neutral chip.
function RoleBadge({ type }: { type: string }) {
  const c = useColors();
  const roleColor: Record<string, string> = {
    developer: c.entityTypes.client,
    borrower: c.entityTypes.prospect,
  };
  return <Chip label={type.toUpperCase()} color={roleColor[type] ?? c.text.muted} />;
}

export default function ClientListItem({ client, projectCount, docCount, compact }: ClientListItemProps) {
  const router = useRouter();
  const c = useColors();

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
        {client.type && (
          <View className="self-start mt-1">
            <RoleBadge type={client.type} />
          </View>
        )}
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
      <ChevronRight size={16} color={c.text.muted} />
    </TouchableOpacity>
  );
}
