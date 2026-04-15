import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';

// ---------------------------------------------------------------------------
// Types
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
  urgency?: 'high';
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
}

interface BriefContent {
  summary?: BriefSummary;
  attentionNeeded?: { items?: AttentionItem[]; insight?: string };
  todaySchedule?: { items?: ScheduleItem[]; insight?: string };
  activityRecap?: { items?: RecapItem[]; insight?: string };
  lookingAhead?: { items?: AheadItem[]; insight?: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// Stats Bar
// ---------------------------------------------------------------------------

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View className="items-center flex-1">
      <Text style={{ color }} className="text-lg font-bold">
        {value}
      </Text>
      <Text className="text-[10px] text-m-text-tertiary uppercase">
        {label}
      </Text>
    </View>
  );
}

function StatsBar({ summary }: { summary: BriefSummary }) {
  return (
    <View className="flex-row bg-m-bg-card border-b border-m-border px-4 py-3 gap-4">
      <StatPill
        label="Overdue"
        value={summary.overdue ?? 0}
        color={(summary.overdue ?? 0) > 0 ? colors.error : colors.textPrimary}
      />
      <StatPill
        label="Due Today"
        value={summary.dueToday ?? 0}
        color={colors.textPrimary}
      />
      <StatPill
        label="Meetings"
        value={summary.meetings ?? 0}
        color="#6366f1"
      />
      <StatPill
        label="Open Flags"
        value={summary.openFlags ?? 0}
        color={
          (summary.openFlags ?? 0) > 0 ? colors.warning : colors.textPrimary
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  dotColor,
  count,
}: {
  title: string;
  dotColor: string;
  count: number;
}) {
  return (
    <View className="flex-row items-center mb-3">
      <View
        style={{ backgroundColor: dotColor }}
        className="w-2.5 h-2.5 rounded-full mr-2"
      />
      <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide flex-1">
        {title}
      </Text>
      {count > 0 && (
        <View className="bg-m-bg-subtle rounded-full px-2 py-0.5">
          <Text className="text-[10px] font-medium text-m-text-secondary">
            {count}
          </Text>
        </View>
      )}
    </View>
  );
}

function EmptyState() {
  return (
    <Text className="text-sm text-m-text-tertiary text-center py-3">
      All clear — nothing here
    </Text>
  );
}

function InsightText({ text }: { text: string }) {
  return (
    <Text className="text-xs text-m-text-tertiary italic mt-3 leading-4">
      {text}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Attention Needed
// ---------------------------------------------------------------------------

function AttentionNeededSection({
  data,
}: {
  data: BriefContent['attentionNeeded'];
}) {
  if (!data) return null;
  const items = data.items ?? [];

  return (
    <Card>
      <SectionHeader
        title="Attention Needed"
        dotColor={colors.error}
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2">
          {items.map((item, i) => (
            <View
              key={i}
              className="flex-row"
              style={
                item.urgency === 'high'
                  ? { borderLeftWidth: 3, borderLeftColor: colors.error, paddingLeft: 8 }
                  : { paddingLeft: 11 }
              }
            >
              {item.urgency === 'high' && (
                <Text className="text-m-error font-bold mr-1.5 text-sm">!</Text>
              )}
              <View className="flex-1">
                <Text className="text-sm text-m-text-primary font-medium">
                  {item.title}
                </Text>
                {(item.context || item.summary) && (
                  <Text className="text-xs text-m-text-secondary mt-0.5">
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

function TodayScheduleSection({
  data,
}: {
  data: BriefContent['todaySchedule'];
}) {
  if (!data) return null;
  const items = data.items ?? [];

  return (
    <Card>
      <SectionHeader
        title="Today's Schedule"
        dotColor="#6366f1"
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2">
          {items.map((item, i) => (
            <View key={i} className="flex-row items-start">
              <Text
                className="text-xs text-m-text-tertiary font-medium"
                style={{ width: 44 }}
              >
                {item.time}
              </Text>
              <View
                className="w-2 h-2 rounded-full mt-1 mr-2"
                style={{ backgroundColor: '#6366f1' }}
              />
              <View className="flex-1">
                <Text className="text-sm text-m-text-primary font-medium">
                  {item.title}
                </Text>
                {item.context && (
                  <Text className="text-xs text-m-text-secondary mt-0.5">
                    {item.context}
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
// Activity Recap
// ---------------------------------------------------------------------------

function ActivityRecapSection({
  data,
}: {
  data: BriefContent['activityRecap'];
}) {
  if (!data) return null;
  const items = data.items ?? [];

  return (
    <Card>
      <SectionHeader
        title="Activity Recap"
        dotColor="#3b82f6"
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2">
          {items.map((item, i) => (
            <View key={i} className="pl-3">
              <Text className="text-sm text-m-text-primary font-medium">
                {item.title ?? item.summary ?? item.type}
                {item.count != null && (
                  <Text className="text-m-text-tertiary"> ({item.count})</Text>
                )}
              </Text>
              {item.context && (
                <Text className="text-xs text-m-text-secondary mt-0.5">
                  {item.context}
                </Text>
              )}
              {item.summary && item.title && (
                <Text className="text-xs text-m-text-secondary mt-0.5">
                  {item.summary}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
      {data.insight && <InsightText text={data.insight} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Looking Ahead
// ---------------------------------------------------------------------------

function LookingAheadSection({
  data,
}: {
  data: BriefContent['lookingAhead'];
}) {
  if (!data) return null;
  const items = data.items ?? [];

  return (
    <Card>
      <SectionHeader
        title="Looking Ahead"
        dotColor={colors.success}
        count={items.length}
      />
      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <View className="gap-2">
          {items.map((item, i) => (
            <View key={i} className="pl-3">
              <Text className="text-sm text-m-text-primary font-medium">
                {item.title}
              </Text>
              {(item.context || item.summary) && (
                <Text className="text-xs text-m-text-secondary mt-0.5">
                  {item.context ?? item.summary}
                </Text>
              )}
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

  const brief = useQuery(
    api.dailyBriefs.getToday,
    isAuthenticated ? {} : 'skip'
  );

  const parsed = brief ? parseBriefContent(brief.content) : null;

  return (
    <View className="flex-1 bg-m-bg">
      {/* Header */}
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft size={20} color={colors.textOnBrand} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-m-text-on-brand">
          Daily Brief
        </Text>
      </View>

      {/* Stats bar — from brief content or fallback to "no data" */}
      {parsed && typeof parsed === 'object' && parsed.summary && (
        <StatsBar summary={parsed.summary} />
      )}

      {/* Content */}
      <ScrollView
        className="flex-1 px-4 pt-3"
        contentContainerStyle={{ paddingBottom: 24, gap: 12 }}
      >
        {!brief && (
          <Card>
            <Text className="text-sm text-m-text-tertiary text-center py-4">
              No daily brief generated yet
            </Text>
          </Card>
        )}

        {/* Legacy plain-text brief */}
        {parsed && typeof parsed === 'string' && (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">
              Today's Summary
            </Text>
            <Text className="text-sm text-m-text-secondary leading-5">
              {parsed}
            </Text>
          </Card>
        )}

        {/* Structured brief */}
        {parsed && typeof parsed === 'object' && (
          <>
            <AttentionNeededSection data={parsed.attentionNeeded} />
            <TodayScheduleSection data={parsed.todaySchedule} />
            <ActivityRecapSection data={parsed.activityRecap} />
            <LookingAheadSection data={parsed.lookingAhead} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
