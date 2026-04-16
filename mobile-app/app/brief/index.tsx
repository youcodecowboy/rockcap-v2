import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Animated, Easing,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, RefreshCw, Sparkles } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import MobileHeader from '@/components/MobileHeader';

// ---------------------------------------------------------------------------
// Gateway — server-side AI parser. Mobile app gathers data via Convex (with
// its own Clerk auth) and POSTs it here; the Anthropic key stays server-side.
// ---------------------------------------------------------------------------

const GENERATE_API_URL =
  process.env.EXPO_PUBLIC_API_URL
    ? `${process.env.EXPO_PUBLIC_API_URL}/api/mobile/daily-brief/generate`
    : 'http://localhost:3000/api/mobile/daily-brief/generate';

// ---------------------------------------------------------------------------
// Brief content shape (mirrors the JSON returned by the generator)
// ---------------------------------------------------------------------------

interface BriefSummary {
  overdue: number;
  dueToday: number;
  meetings: number;
  openFlags: number;
}

interface AttentionItem {
  type?: string;
  title: string;
  context?: string;
  urgency?: 'high' | 'medium';
  summary?: string;
}

interface ScheduleItem {
  type: string;
  time: string;
  title: string;
  context?: string;
}

interface RecapItem {
  type: string;
  title?: string;
  summary?: string;
  count?: number;
  context?: string;
}

interface AheadItem {
  title: string;
  context?: string;
  summary?: string;
  urgency?: 'high' | 'medium' | 'low';
}

interface BriefContent {
  summary?: BriefSummary;
  attentionNeeded?: { items?: AttentionItem[]; insight?: string };
  todaySchedule?: { items?: ScheduleItem[]; insight?: string };
  activityRecap?: { items?: RecapItem[]; insight?: string };
  lookingAhead?: { items?: AheadItem[]; insight?: string };
}

function parseBriefContent(content: any): BriefContent | string | null {
  if (!content) return null;
  if (typeof content === 'string') {
    try {
      return JSON.parse(content) as BriefContent;
    } catch {
      return content; // legacy plain-text brief
    }
  }
  return content as BriefContent;
}

// ---------------------------------------------------------------------------
// Stats Bar — four card-style tiles (mirrors mobile web BriefStatsBar)
// ---------------------------------------------------------------------------

function StatTile({
  label, value, color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View className="flex-1 bg-m-bg-card border border-m-border rounded-[10px] px-2 py-2.5 items-center">
      <Text style={{ color, fontSize: 20, fontWeight: '700' }}>{value}</Text>
      <Text
        className="text-m-text-tertiary mt-0.5"
        style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' }}
      >
        {label}
      </Text>
    </View>
  );
}

function StatsBar({ summary }: { summary: BriefSummary }) {
  const overdue = summary.overdue ?? 0;
  const openFlags = summary.openFlags ?? 0;
  return (
    <View className="flex-row gap-2 mb-3">
      <StatTile
        label="Overdue"
        value={overdue}
        color={overdue > 0 ? colors.error : colors.textPrimary}
      />
      <StatTile label="Due Today" value={summary.dueToday ?? 0} color={colors.textPrimary} />
      <StatTile label="Meetings" value={summary.meetings ?? 0} color="#6366f1" />
      <StatTile
        label="Open Flags"
        value={openFlags}
        color={openFlags > 0 ? colors.warning : colors.textPrimary}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section primitives
// ---------------------------------------------------------------------------

function SectionHeader({
  title, dotColor, count,
}: {
  title: string;
  dotColor: string;
  count: number;
}) {
  return (
    <View className="flex-row items-center mb-3">
      <View style={{ backgroundColor: dotColor }} className="w-2 h-2 rounded-full mr-2" />
      <Text className="text-sm font-semibold text-m-text-primary flex-1">{title}</Text>
      {count > 0 && (
        <View style={{ backgroundColor: dotColor }} className="rounded-full px-1.5 py-px">
          <Text className="text-[11px] font-semibold text-white">{count}</Text>
        </View>
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <Text className="text-sm text-m-text-tertiary text-center py-2">
      All clear — nothing here
    </Text>
  );
}

function InsightText({ text }: { text: string }) {
  return (
    <View className="mt-3 pt-3 border-t border-m-border-subtle">
      <Text className="text-[13px] text-m-text-secondary italic leading-5">{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Attention Needed
// ---------------------------------------------------------------------------

function AttentionNeededSection({ data }: { data: BriefContent['attentionNeeded'] }) {
  if (!data) return null;
  const items = data.items ?? [];
  return (
    <Card>
      <SectionHeader title="Attention Needed" dotColor={colors.error} count={items.length} />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2.5">
          {items.map((item, i) => (
            <View key={i} className="flex-row items-start">
              <Text
                className="font-bold mr-2"
                style={{
                  width: 14,
                  textAlign: 'center',
                  color:
                    item.urgency === 'high' ? colors.error :
                    item.type === 'flag' ? colors.warning : colors.textTertiary,
                  marginTop: 1,
                }}
              >
                {item.type === 'flag' ? 'F' : item.urgency === 'high' ? '!' : '›'}
              </Text>
              <View className="flex-1">
                <Text className="text-[14px] text-m-text-primary leading-snug">
                  {item.title}
                </Text>
                {(item.context || item.summary) && (
                  <Text className="text-xs text-m-text-tertiary mt-0.5">
                    {item.context ?? item.summary}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {data.insight && <InsightText text={data.insight} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Today's Schedule (timeline)
// ---------------------------------------------------------------------------

function TodayScheduleSection({ data }: { data: BriefContent['todaySchedule'] }) {
  if (!data) return null;
  const items = data.items ?? [];
  return (
    <Card>
      <SectionHeader title="Today's Schedule" dotColor="#6366f1" count={items.length} />
      {items.length === 0 ? (
        <Text className="text-sm text-m-text-tertiary text-center py-2">
          No events or tasks scheduled for today
        </Text>
      ) : (
        <View className="gap-2.5">
          {items.map((item, i) => (
            <View key={i} className="flex-row items-start">
              <Text
                className="text-xs text-m-text-tertiary font-medium pt-0.5"
                style={{ width: 46 }}
              >
                {item.time}
              </Text>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 5,
                  marginRight: 10,
                  backgroundColor: item.type === 'event' ? '#6366f1' : colors.textPrimary,
                }}
              />
              <View className="flex-1">
                <Text className="text-[14px] text-m-text-primary font-medium">{item.title}</Text>
                {item.context && (
                  <Text className="text-xs text-m-text-tertiary mt-0.5">{item.context}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {data.insight && <InsightText text={data.insight} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Activity Recap
// ---------------------------------------------------------------------------

function ActivityRecapSection({ data }: { data: BriefContent['activityRecap'] }) {
  if (!data) return null;
  const items = data.items ?? [];
  return (
    <Card>
      <SectionHeader title="Activity Recap" dotColor="#3b82f6" count={items.length} />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2.5">
          {items.map((item, i) => {
            const title = item.summary ?? item.title ?? item.type;
            const context = item.count != null ? `${item.count} ${item.type}` : item.context;
            return (
              <View key={i} className="flex-row items-start">
                <Text
                  className="text-m-text-tertiary mr-2"
                  style={{ width: 14, textAlign: 'center', marginTop: 1 }}
                >
                  ›
                </Text>
                <View className="flex-1">
                  <Text className="text-[14px] text-m-text-primary leading-snug">{title}</Text>
                  {context && (
                    <Text className="text-xs text-m-text-tertiary mt-0.5">{context}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
      {data.insight && <InsightText text={data.insight} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Looking Ahead
// ---------------------------------------------------------------------------

function LookingAheadSection({ data }: { data: BriefContent['lookingAhead'] }) {
  if (!data) return null;
  const items = data.items ?? [];
  return (
    <Card>
      <SectionHeader title="Looking Ahead" dotColor={colors.success} count={items.length} />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2.5">
          {items.map((item, i) => (
            <View key={i} className="flex-row items-start">
              <Text
                className="mr-2"
                style={{
                  width: 14,
                  textAlign: 'center',
                  color: item.urgency === 'high' ? colors.error : colors.textTertiary,
                  marginTop: 1,
                }}
              >
                {item.urgency === 'high' ? '!' : '›'}
              </Text>
              <View className="flex-1">
                <Text className="text-[14px] text-m-text-primary leading-snug">{item.title}</Text>
                {(item.context || item.summary) && (
                  <Text className="text-xs text-m-text-tertiary mt-0.5">
                    {item.context ?? item.summary}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
      {data.insight && <InsightText text={data.insight} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function BriefScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();

  // Gathered data (same set the /api/daily-brief/generate web route uses)
  const brief = useQuery(api.dailyBriefs.getToday, isAuthenticated ? {} : 'skip');
  const tasks = useQuery(
    api.tasks.getByUser,
    isAuthenticated ? { includeCreated: true, includeAssigned: true } : 'skip',
  );
  const metrics = useQuery(api.tasks.getMetrics, isAuthenticated ? {} : 'skip');
  const events = useQuery(api.events.getUpcoming, isAuthenticated ? { days: 1 } : 'skip');
  const flags = useQuery(
    api.flags.getMyFlags,
    isAuthenticated ? { status: 'open' as const } : 'skip',
  );
  const notifications = useQuery(
    api.notifications.getRecent,
    isAuthenticated ? { limit: 20, includeRead: false } : 'skip',
  );
  const recentDocs = useQuery(
    api.documents.getRecent,
    isAuthenticated ? { limit: 10 } : 'skip',
  );
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');

  const saveBrief = useMutation(api.dailyBriefs.save);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTriggered, setHasTriggered] = useState(false);

  // Spin animation for the refresh icon
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (generating) {
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      spin.stopAnimation();
      spin.setValue(0);
    }
  }, [generating, spin]);
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const parsed = brief ? parseBriefContent(brief.content) : null;
  const content: BriefContent | null =
    parsed && typeof parsed === 'object' ? (parsed as BriefContent) : null;

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(GENERATE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'personal',
          tasks: tasks ?? [],
          metrics: metrics ?? null,
          events: events ?? [],
          flags: flags ?? [],
          notifications: notifications ?? [],
          recentDocs: recentDocs ?? [],
          clients: clients ?? [],
          projects: projects ?? [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      const now = new Date();
      await saveBrief({
        date: data.date ?? now.toISOString().split('T')[0],
        content: data.brief,
        generatedAt: now.toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate brief');
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate on first visit if no brief exists and we have the data to send.
  // `brief === null` means the query ran and returned nothing; `undefined` means
  // still loading. We also wait for tasks/clients to be loaded so the first run
  // isn't populated with empty arrays.
  const ready =
    tasks !== undefined &&
    clients !== undefined &&
    projects !== undefined &&
    events !== undefined;

  useEffect(() => {
    if (
      isAuthenticated &&
      ready &&
      brief === null &&
      !generating &&
      !error &&
      !hasTriggered
    ) {
      setHasTriggered(true);
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready, brief, generating, error, hasTriggered]);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const attentionCount = content?.summary
    ? (content.summary.overdue ?? 0) + (content.summary.openFlags ?? 0)
    : 0;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Sub-header — back button + title + refresh (RockCap standard) */}
      <View className="bg-m-bg-card border-b border-m-border px-4 py-3 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()} className="p-1 -ml-1">
          <ArrowLeft size={20} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text className="text-[15px] font-medium text-m-text-primary">Daily Brief</Text>
        <TouchableOpacity
          onPress={handleGenerate}
          disabled={generating}
          className="p-1 -mr-1"
          style={{ opacity: generating ? 0.5 : 1 }}
        >
          <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
            <RefreshCw size={16} color={colors.textTertiary} />
          </Animated.View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
      >
        {/* Loading state — first generation or manual refresh with no cached brief */}
        {(brief === undefined || (generating && !content)) && (
          <View className="items-center py-16">
            <View
              className="w-12 h-12 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: colors.bgBrand }}
            >
              <Sparkles size={20} color={colors.textOnBrand} />
            </View>
            <ActivityIndicator size="small" color={colors.textTertiary} style={{ marginBottom: 10 }} />
            <Text className="text-sm text-m-text-secondary font-medium">
              Preparing your daily brief...
            </Text>
            <Text className="text-xs text-m-text-tertiary mt-1">
              Analysing tasks, events, and activity
            </Text>
          </View>
        )}

        {/* Error state */}
        {error && (
          <View
            className="rounded-[12px] px-4 py-3"
            style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }}
          >
            <Text className="text-[13px]" style={{ color: '#b91c1c' }}>
              {error}
            </Text>
            <TouchableOpacity onPress={handleGenerate} className="mt-1">
              <Text
                className="text-[13px] font-medium"
                style={{ color: '#b91c1c', textDecorationLine: 'underline' }}
              >
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Brief content */}
        {content && !error && (
          <>
            {/* Date + meta */}
            <View>
              <Text className="text-[20px] font-semibold text-m-text-primary" style={{ letterSpacing: -0.4 }}>
                {today}
              </Text>
              <Text className="text-xs text-m-text-tertiary mt-1">
                Generated at{' '}
                {brief?.generatedAt
                  ? new Date(brief.generatedAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
                {content.summary ? ` · ${attentionCount} items need attention` : ''}
              </Text>
            </View>

            {/* Stats tiles */}
            {content.summary && <StatsBar summary={content.summary} />}

            {/* Sections */}
            <AttentionNeededSection data={content.attentionNeeded} />
            <TodayScheduleSection data={content.todaySchedule} />
            <ActivityRecapSection data={content.activityRecap} />
            <LookingAheadSection data={content.lookingAhead} />
          </>
        )}

        {/* Legacy plain-text brief (older records) */}
        {parsed && typeof parsed === 'string' && (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">
              Today&apos;s Summary
            </Text>
            <Text className="text-sm text-m-text-secondary leading-5">{parsed}</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
