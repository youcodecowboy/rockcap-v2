import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { Id } from '../../../model-testing-app/convex/_generated/dataModel';
import { Clock, ChevronRight, StickyNote, Mail, Video, Phone, CheckSquare } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface RecentActivityCardProps {
  clientId: Id<'clients'>;
  onViewAll?: () => void;
}

const TYPE_TILE = {
  NOTE: { bg: '#f3e8ff', tint: '#9333ea', icon: StickyNote, label: 'Note' },
  EMAIL: { bg: '#ffedd5', tint: '#ea580c', icon: Mail, label: 'Email' },
  INCOMING_EMAIL: { bg: '#dcfce7', tint: '#059669', icon: Mail, label: 'Email' },
  MEETING: { bg: '#dbeafe', tint: '#2563eb', icon: Video, label: 'Meeting' },
  CALL: { bg: '#fef3c7', tint: '#d97706', icon: Phone, label: 'Call' },
  TASK: { bg: '#ffedd5', tint: '#ea580c', icon: CheckSquare, label: 'Task' },
} as const;

function formatRelativeDate(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function RecentActivityCard({ clientId, onViewAll }: RecentActivityCardProps) {
  const recent = useQuery(api.activities.listRecentForClient, { clientId, limit: 2 }) ?? [];
  const total = useQuery(api.activities.countForClient, { clientId }) ?? 0;

  return (
    <View className="bg-m-bg-card border border-m-border rounded-[12px] p-[14px]">
      <View className="flex-row justify-between items-center mb-2.5">
        <View className="flex-row items-center gap-1.5">
          <View
            className="w-5 h-5 rounded-[6px] items-center justify-center"
            style={{ backgroundColor: '#ffedd5' }}
          >
            <Clock size={12} color="#ea580c" strokeWidth={2} />
          </View>
          <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
            Recent activity
          </Text>
        </View>
        <TouchableOpacity onPress={onViewAll} hitSlop={6} className="flex-row items-center gap-0.5">
          <Text className="text-xs font-medium text-m-text-primary">See all</Text>
          <ChevronRight size={12} color={colors.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View className="gap-3">
        {recent.map((a) => {
          const tile = TYPE_TILE[a.activityType as keyof typeof TYPE_TILE] ?? TYPE_TILE.NOTE;
          const Icon = tile.icon;
          return (
            <View key={a._id} className="flex-row gap-2.5">
              <View
                className="w-[30px] h-[30px] rounded-[8px] items-center justify-center"
                style={{ backgroundColor: tile.bg }}
              >
                <Icon size={14} color={tile.tint} strokeWidth={2} />
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-[11px] text-m-text-tertiary mb-0.5">
                  <Text className="text-m-text-secondary font-medium">{tile.label}</Text> ·{' '}
                  {formatRelativeDate(a.activityDate)}
                </Text>
                <Text className="text-[13px] text-m-text-primary" numberOfLines={1}>
                  {a.subject || a.bodyPreview || '(no subject)'}
                </Text>
              </View>
            </View>
          );
        })}
        {recent.length === 0 ? (
          <Text className="text-xs text-m-text-tertiary italic">No activity yet</Text>
        ) : null}
      </View>

      <View className="mt-2.5 pt-2.5 border-t border-m-border-subtle">
        <Text className="text-[11px] text-m-text-tertiary">{total} total touches</Text>
      </View>
    </View>
  );
}
