import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { User, ExternalLink } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface SyncStripProps {
  ownerName?: string;
  lastSync?: string;
  hubspotUrl?: string;
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function SyncStrip({ ownerName, lastSync, hubspotUrl }: SyncStripProps) {
  return (
    <View className="flex-row items-center gap-2 px-1 py-1" style={{ flexWrap: 'wrap' }}>
      {ownerName ? (
        <View
          className="flex-row items-center gap-1 bg-m-bg-subtle px-2 py-0.5 rounded-full"
        >
          <User size={11} color={colors.textSecondary} strokeWidth={2} />
          <Text className="text-xs text-m-text-secondary font-medium">{ownerName}</Text>
        </View>
      ) : null}
      {lastSync ? (
        <Text className="text-xs text-m-text-tertiary">Synced {formatRelativeTime(lastSync)}</Text>
      ) : null}
      {hubspotUrl ? (
        <TouchableOpacity
          onPress={() => Linking.openURL(hubspotUrl)}
          className="flex-row items-center gap-1 ml-auto"
          hitSlop={8}
        >
          <Text className="text-xs font-medium text-m-text-primary">HubSpot</Text>
          <ExternalLink size={11} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
