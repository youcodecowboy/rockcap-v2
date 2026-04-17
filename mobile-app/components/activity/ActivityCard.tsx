import { View, Text } from 'react-native';
import { StickyNote, Mail, Video, Phone, CheckSquare, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';
import type { Doc } from '../../../model-testing-app/convex/_generated/dataModel';

interface ActivityCardProps {
  activity: Doc<'activities'>;
}

const TYPE_TILE = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', Icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', Icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', Icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', Icon: Video, label: 'Meeting' },
  CALL: { bg: '#fef3c7', tint: '#d97706', Icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', Icon: CheckSquare, label: 'Task' },
} as const;

function formatTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const minutes = Math.round(ms / 60000);
  return `${minutes} min`;
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const typeKey = activity.activityType as keyof typeof TYPE_TILE;
  const tile = TYPE_TILE[typeKey] ?? TYPE_TILE.NOTE;
  const Icon = tile.Icon;
  const direction = activity.direction; // 'inbound' | 'outbound' | undefined
  const isEmail = typeKey === 'EMAIL' || typeKey === 'INCOMING_EMAIL';

  const attribution =
    tile.label +
    (direction ? ` · ${direction}` : '') +
    (activity.duration ? ` · ${formatDuration(activity.duration)}` : '') +
    (activity.ownerName ? ` · ${activity.ownerName}` : '');

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-3 flex-row gap-2.5">
      <View
        className="w-8 h-8 rounded-[8px] items-center justify-center relative"
        style={{ backgroundColor: tile.bg }}
      >
        <Icon size={16} color={tile.tint} strokeWidth={2} />
        {isEmail && direction ? (
          <View
            className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full items-center justify-center"
            style={{
              backgroundColor: direction === 'outbound' ? '#ea580c' : '#059669',
              borderWidth: 2,
              borderColor: '#fafaf9',
            }}
          >
            {direction === 'outbound' ? (
              <ArrowUpRight size={7} color="#ffffff" strokeWidth={3} />
            ) : (
              <ArrowDownLeft size={7} color="#ffffff" strokeWidth={3} />
            )}
          </View>
        ) : null}
      </View>

      <View className="flex-1 min-w-0">
        <View className="flex-row justify-between items-baseline mb-0.5">
          <Text className="text-[11px] text-m-text-tertiary" numberOfLines={1} style={{ flex: 1 }}>
            {attribution}
          </Text>
          <Text className="text-[10px] text-m-text-tertiary ml-2">{formatTime(activity.activityDate)}</Text>
        </View>
        {activity.subject ? (
          <Text className="text-[13px] font-medium text-m-text-primary" numberOfLines={1}>
            {activity.subject}
          </Text>
        ) : null}
        {activity.bodyPreview ? (
          <Text className="text-[11px] text-m-text-secondary mt-0.5" numberOfLines={2}>
            {activity.bodyPreview}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
