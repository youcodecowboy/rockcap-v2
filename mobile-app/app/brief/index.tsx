import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Animated, Easing,
} from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft, RefreshCw, Sparkles, User, Users } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import MobileHeader from '@/components/MobileHeader';
import { resolveApiBase } from '@/lib/apiBase';

// ---------------------------------------------------------------------------
// Gateway — server-side AI parser. Mobile app gathers data via Convex (with
// its own Clerk auth) and POSTs it here; the Anthropic key stays server-side.
// The hardcoded `http://localhost:3000` fallback was silently breaking brief
// generation on physical devices ("Network request failed"). URL resolution
// via `@/lib/apiBase` auto-derives the Mac's LAN IP from Expo's bundler.
// ---------------------------------------------------------------------------

const GENERATE_API_URL = `${resolveApiBase()}/api/mobile/daily-brief/generate`;

type BriefScope = 'personal' | 'organization';

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
// Segmented control — Personal | Organization
// ---------------------------------------------------------------------------

function ScopeSegmented({
  scope, onChange,
}: {
  scope: BriefScope;
  onChange: (s: BriefScope) => void;
}) {
  return (
    <View
      className="flex-row p-1 rounded-[10px] bg-m-bg-subtle border border-m-border"
      style={{ gap: 4 }}
    >
      <SegmentButton
        active={scope === 'personal'}
        onPress={() => onChange('personal')}
        icon={<User size={14} color={scope === 'personal' ? colors.textOnBrand : colors.textSecondary} />}
        label="Personal"
      />
      <SegmentButton
        active={scope === 'organization'}
        onPress={() => onChange('organization')}
        icon={<Users size={14} color={scope === 'organization' ? colors.textOnBrand : colors.textSecondary} />}
        label="Organization"
      />
    </View>
  );
}

function SegmentButton({
  active, onPress, icon, label,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 flex-row items-center justify-center rounded-[8px] py-2"
      style={{
        backgroundColor: active ? colors.bgBrand : 'transparent',
        gap: 6,
      }}
    >
      {icon}
      <Text
        className="text-[13px] font-medium"
        style={{ color: active ? colors.textOnBrand : colors.textSecondary }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Stats Bar — four card-style tiles
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
// Sections
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
  const [scope, setScope] = useState<BriefScope>('personal');

  // --- Per-scope brief record -------------------------------------------------
  const brief = useQuery(api.dailyBriefs.getToday, isAuthenticated ? { scope } : 'skip');

  // --- Personal-scope data ----------------------------------------------------
  const personalTasks = useQuery(
    api.tasks.getByUser,
    isAuthenticated && scope === 'personal'
      ? { includeCreated: true, includeAssigned: true }
      : 'skip',
  );
  const personalMetrics = useQuery(
    api.tasks.getMetrics,
    isAuthenticated && scope === 'personal' ? {} : 'skip',
  );
  const personalEvents = useQuery(
    api.events.getUpcoming,
    isAuthenticated && scope === 'personal' ? { days: 1 } : 'skip',
  );
  const personalFlags = useQuery(
    api.flags.getMyFlags,
    isAuthenticated && scope === 'personal' ? { status: 'open' as const } : 'skip',
  );
  const personalNotifs = useQuery(
    api.notifications.getRecent,
    isAuthenticated && scope === 'personal' ? { limit: 20, includeRead: false } : 'skip',
  );

  // --- Organization-scope data -----------------------------------------------
  const orgTasks = useQuery(
    api.orgBrief.getAllTasks,
    isAuthenticated && scope === 'organization' ? {} : 'skip',
  );
  const orgMetrics = useQuery(
    api.orgBrief.getTeamMetrics,
    isAuthenticated && scope === 'organization' ? {} : 'skip',
  );
  const orgEvents = useQuery(
    api.orgBrief.getTodayEvents,
    isAuthenticated && scope === 'organization' ? {} : 'skip',
  );
  const orgFlags = useQuery(
    api.orgBrief.getAllOpenFlags,
    isAuthenticated && scope === 'organization' ? { limit: 50 } : 'skip',
  );

  // --- Shared data (org-wide in both tabs) -----------------------------------
  const recentDocs = useQuery(
    api.documents.getRecent,
    isAuthenticated ? { limit: 10 } : 'skip',
  );
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');

  // HubSpot activity for the last 24h — feeds the brief's "CRM pulse" section.
  // Refreshed on mount, passed through to the generate endpoint below.
  const hubspotSince = useMemo(
    () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    [],
  );
  const hubspotSummary = useQuery(
    api.hubspotSync.dailyBriefSummary,
    isAuthenticated ? { sinceISO: hubspotSince } : 'skip',
  );

  const saveBrief = useMutation(api.dailyBriefs.save);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track which scopes have been auto-triggered this mount so switching tabs
  // doesn't re-trigger the one you just saw, and so each tab gets one shot.
  const triggeredRef = useRef<Record<BriefScope, boolean>>({
    personal: false,
    organization: false,
  });

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

  // Select the right payload for the active scope.
  const tasks = scope === 'personal' ? personalTasks : orgTasks;
  const metrics = scope === 'personal' ? personalMetrics : orgMetrics;
  const events = scope === 'personal' ? personalEvents : orgEvents;
  const flags = scope === 'personal' ? personalFlags : orgFlags;
  const notifications = scope === 'personal' ? personalNotifs : [];

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(GENERATE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          tasks: tasks ?? [],
          metrics: metrics ?? null,
          events: events ?? [],
          flags: flags ?? [],
          notifications: notifications ?? [],
          recentDocs: recentDocs ?? [],
          clients: clients ?? [],
          projects: projects ?? [],
          hubspot: hubspotSummary ?? null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      const now = new Date();
      await saveBrief({
        scope,
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

  // Auto-generate when we land on an empty tab and we have the data to send.
  // `tasks === undefined` means the Convex query for this tab is still loading.
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
      !triggeredRef.current[scope]
    ) {
      triggeredRef.current[scope] = true;
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, ready, brief, generating, error, scope]);

  // Clear any stale error when the user switches tabs so each tab gets a
  // clean surface.
  useEffect(() => {
    setError(null);
  }, [scope]);

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
        {/* Scope toggle */}
        <ScopeSegmented scope={scope} onChange={setScope} />

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
              {scope === 'personal'
                ? 'Preparing your daily brief...'
                : 'Preparing your team brief...'}
            </Text>
            <Text className="text-xs text-m-text-tertiary mt-1">
              {scope === 'personal'
                ? 'Analysing your tasks, events, and activity'
                : 'Analysing team tasks, events, and activity'}
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
                {scope === 'personal' ? 'Your brief' : 'Team brief'}
                {' · '}
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
