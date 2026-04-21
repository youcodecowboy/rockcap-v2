import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import {
  ArrowLeft, Activity as ActivityIcon,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import MobileHeader from '@/components/MobileHeader';
import MiniTabBar from '@/components/MiniTabBar';
import ActivityCard from '@/components/activity/ActivityCard';

/**
 * Global Activity stream (mobile) — counterpart to desktop /activity.
 *
 * Renders a single chronological feed of HubSpot engagements across the
 * whole organization. Filter chips narrow by type; taps on a row surface
 * type-specific context via the existing mobile ActivityCard (which
 * already handles tap-to-expand + date/time + inbound/outbound badges).
 */

type FilterKey = 'all' | 'EMAIL' | 'MEETING' | 'NOTE' | 'CALL' | 'TASK';

type Bucket = 'Today' | 'Yesterday' | 'This week' | 'Earlier this month' | 'Older';

function bucketOf(iso?: string): Bucket {
  if (!iso) return 'Older';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 'Older';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  if (days < 30) return 'Earlier this month';
  return 'Older';
}

export default function GlobalActivityScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [filter, setFilter] = useState<FilterKey>('all');

  // Mirror of desktop /activity: two queries so EMAIL filter can merge
  // outbound + INCOMING_EMAIL. Rest of the time the second query is 'skip'.
  const outboundOrAll = useQuery(
    api.activities.listRecentGlobal,
    !isAuthenticated
      ? 'skip'
      : filter === 'all'
        ? { limit: 200 }
        : {
            limit: 200,
            typeFilter: filter === 'EMAIL' ? 'EMAIL' : filter,
          },
  );
  const incomingEmails = useQuery(
    api.activities.listRecentGlobal,
    filter === 'EMAIL' && isAuthenticated
      ? { limit: 100, typeFilter: 'INCOMING_EMAIL' }
      : 'skip',
  );

  const loading = outboundOrAll === undefined;
  const all =
    filter === 'EMAIL' && incomingEmails
      ? [...(outboundOrAll ?? []), ...incomingEmails]
      : outboundOrAll ?? [];

  const sorted = useMemo(
    () =>
      all
        .slice()
        .sort((a: any, b: any) =>
          (b.activityDate ?? '').localeCompare(a.activityDate ?? ''),
        ),
    [all],
  );

  const grouped = useMemo(() => {
    const m = new Map<Bucket, any[]>();
    for (const b of ['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]) {
      m.set(b, []);
    }
    for (const a of sorted) m.get(bucketOf(a.activityDate))!.push(a);
    return m;
  }, [sorted]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: `All · ${sorted.length}` },
    { key: 'EMAIL', label: 'Emails' },
    { key: 'MEETING', label: 'Meetings' },
    { key: 'NOTE', label: 'Notes' },
    { key: 'CALL', label: 'Calls' },
    { key: 'TASK', label: 'Tasks' },
  ];

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-header */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3 flex-row items-center gap-2">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1" hitSlop={8}>
          <ArrowLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <View className="flex-row items-center gap-2 flex-1">
          <View
            className="w-7 h-7 rounded-lg items-center justify-center"
            style={{ backgroundColor: '#fafaf9' }}
          >
            <ActivityIcon size={14} color={colors.textPrimary} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-m-text-primary">Activity</Text>
            <Text className="text-[10px] text-m-text-tertiary">
              Company pulse — HubSpot engagements across all clients
            </Text>
          </View>
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="bg-m-bg-card border-b border-m-border flex-grow-0"
        contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 10 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              className="px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: active ? '#0a0a0a' : '#fafaf9',
                borderWidth: active ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-[11px] font-medium"
                style={{ color: active ? '#ffffff' : colors.textSecondary }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      ) : sorted.length === 0 ? (
        <View className="flex-1 items-center justify-center p-12">
          <Text className="text-sm text-m-text-tertiary italic text-center">
            No activity yet
          </Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
          {(['Today', 'Yesterday', 'This week', 'Earlier this month', 'Older'] as Bucket[]).map(
            (bucket) => {
              const rows = grouped.get(bucket) ?? [];
              if (rows.length === 0) return null;
              return (
                <View key={bucket} className="gap-2">
                  <View className="flex-row items-center gap-1.5 px-1">
                    <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                      {bucket}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary">· {rows.length}</Text>
                  </View>
                  {rows.map((a: any) => (
                    // ActivityCard was built for per-client activity but its
                    // render signature (activity: Doc<'activities'>) is the
                    // same shape the global query returns — with the
                    // addition of companyName/clientId which the card
                    // happily ignores. Reuse is clean.
                    <ActivityCard key={a._id} activity={a} />
                  ))}
                </View>
              );
            },
          )}
        </ScrollView>
      )}
      <MiniTabBar />
    </View>
  );
}
