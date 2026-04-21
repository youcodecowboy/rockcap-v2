import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import MobileHeader from '@/components/MobileHeader';
import {
  Sparkles,
  Camera,
  Plus,
  FileText,
  TrendingUp,
  Calendar,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  Video,
  Phone,
  Mail,
  Check,
  CheckSquare as CheckSq,
  ListTodo,
  AlertCircle,
  Bell,
  Building,
  Activity as ActivityIcon,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// RockCap mobile home — mission-control redesign. Ported from the Claude
// Design prototype at `rockcap-app/project/Mobile Home Prototype.html`. The
// layout keeps the app's visual vocabulary (white cards, 12-radius, #e5e5e5
// borders) but leads with a dark hero command deck + pipeline pulse, then
// quick actions, a tabbed agenda timeline, the daily brief, and a grouped
// HubSpot activity stream.
//
// Data wiring notes:
// - Today / Overdue / In-progress come from `tasks.getByUser`.
// - Pipeline total + stage breakdown from `deals.getAllDeals` (filtered to
//   open deals). Historical sparkline + WoW delta are stubbed until we add
//   a dated-snapshots table.
// - Sync indicator derives from the most recent `company.lastHubSpotSync`.
// - Agenda merges `events` + `tasks` into a single chronological list; tabs
//   partition into Focus / All / Done.
// - Activity stream is `activities.listRecentGlobal`, grouped by day.
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(date: Date | number | string | undefined | null): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${Math.round(n / 1_000)}K`;
  return `£${n}`;
}

// ---------------------------------------------------------------------------
// Hero command deck — dark panel with live sync indicator, greeting, metric
// triptych, and the open-pipeline pulse (£ total, stage breakdown bar).
// ---------------------------------------------------------------------------

interface HeroProps {
  firstName: string;
  todayCount: number;
  overdueCount: number;
  inProgressCount: number;
  pipelineTotal: number;
  pipelineCount: number;
  wonCount: number;
  lostCount: number;
  stages: { label: string; value: number; count: number }[];
  lastSyncAgo: string | null;
  onOpenPipeline: () => void;
}

function HeroCommandDeck(props: HeroProps) {
  const muted = 'rgba(255,255,255,0.55)';
  const sub = 'rgba(255,255,255,0.75)';
  const divider = 'rgba(255,255,255,0.08)';
  const stageTints = [
    'rgba(255,255,255,0.25)',
    'rgba(255,255,255,0.45)',
    'rgba(255,255,255,0.7)',
    '#ffffff',
  ];

  return (
    <View
      style={{
        backgroundColor: '#0a0a0a',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: divider,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Radar backdrop — decorative, anchors the "mission control" feel. */}
      <View
        style={{ position: 'absolute', right: -40, top: -40, opacity: 0.08 }}
        pointerEvents="none"
      >
        <Svg width={180} height={180} viewBox="0 0 180 180">
          <Circle cx={90} cy={90} r={30} fill="none" stroke="#fff" strokeWidth={1} />
          <Circle cx={90} cy={90} r={55} fill="none" stroke="#fff" strokeWidth={1} />
          <Circle cx={90} cy={90} r={80} fill="none" stroke="#fff" strokeWidth={1} />
          <Circle cx={90} cy={90} r={105} fill="none" stroke="#fff" strokeWidth={1} />
          <Line x1={90} y1={0} x2={90} y2={180} stroke="#fff" strokeWidth={0.5} />
          <Line x1={0} y1={90} x2={180} y2={90} stroke="#fff" strokeWidth={0.5} />
        </Svg>
      </View>

      {/* Live sync indicator */}
      {props.lastSyncAgo ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#22c55e',
              shadowColor: '#22c55e',
              shadowOpacity: 0.5,
              shadowRadius: 3,
            }}
          />
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 0.8,
              color: muted,
              textTransform: 'uppercase',
              fontWeight: '600',
            }}
          >
            Live · HubSpot synced {props.lastSyncAgo}
          </Text>
        </View>
      ) : null}

      {/* Greeting + task summary */}
      <View style={{ marginBottom: 18 }}>
        <Text
          style={{
            fontSize: 10,
            letterSpacing: 1.2,
            color: muted,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Mission control
        </Text>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '600',
            letterSpacing: -0.4,
            color: '#fff',
            lineHeight: 26,
          }}
        >
          {getGreeting()}, {props.firstName}.
        </Text>
        <Text style={{ fontSize: 13, color: sub, marginTop: 4 }}>
          You have{' '}
          <Text style={{ color: '#fff', fontWeight: '600' }}>
            {props.todayCount} task{props.todayCount === 1 ? '' : 's'}
          </Text>{' '}
          today and{' '}
          <Text style={{ color: '#f87171', fontWeight: '600' }}>
            {props.overdueCount} overdue
          </Text>
          .
        </Text>
      </View>

      {/* Metric triptych */}
      <View
        style={{
          flexDirection: 'row',
          borderRadius: 10,
          borderWidth: 1,
          borderColor: divider,
          overflow: 'hidden',
        }}
      >
        {[
          { label: 'Today', value: props.todayCount, tint: '#fff' },
          { label: 'Overdue', value: props.overdueCount, tint: '#f87171' },
          { label: 'In progress', value: props.inProgressCount, tint: '#fff' },
        ].map((c, i) => (
          <View
            key={c.label}
            style={{
              flex: 1,
              backgroundColor: '#0a0a0a',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: divider,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                letterSpacing: 0.8,
                color: muted,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {c.label}
            </Text>
            <Text
              style={{
                fontSize: 26,
                fontWeight: '600',
                letterSpacing: -0.6,
                color: c.tint,
                lineHeight: 28,
              }}
            >
              {c.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Open pipeline pulse — tappable, expands into full pipeline sheet */}
      <TouchableOpacity
        onPress={props.onOpenPipeline}
        activeOpacity={0.75}
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: divider,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 9,
                letterSpacing: 0.8,
                color: muted,
                textTransform: 'uppercase',
                marginBottom: 3,
              }}
            >
              Open pipeline · HubSpot
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  letterSpacing: -0.4,
                  color: '#fff',
                }}
              >
                {formatMoney(props.pipelineTotal)}
              </Text>
              <Text style={{ fontSize: 11, color: muted }}>
                · {props.pipelineCount} open
              </Text>
            </View>
            {/* Breakdown chip row — live count of Open / Won / Lost so the
                big number above is unambiguously "active pipeline only". */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#22c55e' }} />
                <Text style={{ fontSize: 10, color: muted, letterSpacing: 0.2 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{props.pipelineCount}</Text> open
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.6)' }} />
                <Text style={{ fontSize: 10, color: muted, letterSpacing: 0.2 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{props.wonCount}</Text> won
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 5, height: 5, borderRadius: 1, backgroundColor: '#f87171' }} />
                <Text style={{ fontSize: 10, color: muted, letterSpacing: 0.2 }}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>{props.lostCount}</Text> lost
                </Text>
              </View>
            </View>
          </View>
          <Svg width={76} height={32} viewBox="0 0 76 32">
            <Polyline
              points="0,24 10,22 20,26 30,18 40,20 50,12 60,14 66,6 74,9"
              fill="none"
              stroke="#fff"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle cx={74} cy={9} r={3} fill="#22c55e" />
          </Svg>
        </View>

        {/* Stage breakdown bar */}
        {props.stages.length > 0 ? (
          <>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8, gap: 2 }}>
              {props.stages.map((s, i) => (
                <View
                  key={s.label}
                  style={{
                    flex: Math.max(s.value, 1),
                    backgroundColor: stageTints[i] || stageTints[stageTints.length - 1],
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {props.stages.map((s, i) => (
                <View key={s.label} style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 1,
                        backgroundColor: stageTints[i] || stageTints[stageTints.length - 1],
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 8,
                        color: muted,
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                      }}
                      numberOfLines={1}
                    >
                      {s.label}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#fff' }}>
                    {formatMoney(s.value)}
                  </Text>
                  <Text style={{ fontSize: 9, color: muted, marginTop: 1 }}>
                    {s.count} {s.count === 1 ? 'deal' : 'deals'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={{ fontSize: 11, color: muted }}>
            No open deals yet — sync HubSpot to see pipeline pulse.
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick action bar — 4 up: Upload / New Task / Note / Ask AI.
// ---------------------------------------------------------------------------

function QuickActionsBar() {
  const router = useRouter();
  const actions = [
    { id: 'upload', label: 'Upload', icon: Camera, onPress: () => router.push('/upload' as any) },
    { id: 'task', label: 'New Task', icon: Plus, onPress: () => router.push('/tasks?create=true' as any) },
    { id: 'note', label: 'Note', icon: FileText, onPress: () => router.push('/notes/editor' as any) },
    // Ask AI routes to the chat screen until the dedicated agent UI lands.
    { id: 'ai', label: 'Ask AI', icon: Sparkles, onPress: () => router.push('/(tabs)/chat' as any) },
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <TouchableOpacity
            key={a.id}
            onPress={a.onPress}
            activeOpacity={0.75}
            style={{
              flex: 1,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#e5e5e5',
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 6,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon size={16} color={colors.textPrimary} />
            <Text style={{ fontSize: 10, fontWeight: '500', color: colors.textPrimary }}>
              {a.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Agenda — Focus / All / Done tabs. Timeline-style list with a vertical
// connector, time column, status dot (red for NOW), title + subtext.
// ---------------------------------------------------------------------------

type AgendaRow = {
  id: string;
  time: string;
  title: string;
  sub: string;
  kind: 'meeting' | 'task';
  icon: React.ComponentType<any>;
  now?: boolean;
  past?: boolean;
  overdue?: boolean;
  onPress?: () => void;
};

interface AgendaProps {
  focusRows: AgendaRow[];
  allRows: AgendaRow[];
  doneRows: AgendaRow[];
  tab: 'focus' | 'all' | 'done';
  setTab: (tab: 'focus' | 'all' | 'done') => void;
  nextMeetingStartsInMin: number | null;
  onJoinNext: () => void;
  totalBookedMin: number;
}

function AgendaCard(props: AgendaProps) {
  const rows =
    props.tab === 'focus' ? props.focusRows : props.tab === 'all' ? props.allRows : props.doneRows;
  const tabs = [
    { id: 'focus' as const, label: 'Focus', count: props.focusRows.length },
    { id: 'all' as const, label: 'All', count: props.allRows.length },
    { id: 'done' as const, label: 'Done', count: props.doneRows.length },
  ];

  const hoursBooked = Math.floor(props.totalBookedMin / 60);
  const minsBooked = props.totalBookedMin % 60;
  const bookedLabel =
    props.totalBookedMin > 0
      ? `${hoursBooked}h ${minsBooked}m booked`
      : 'No meetings booked';

  const todayStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} color={colors.textSecondary} />
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: colors.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Agenda · {todayStr}
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.textSecondary }}>
          {bookedLabel}
        </Text>
      </View>

      {/* Segmented tabs */}
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          marginBottom: 12,
          padding: 3,
          backgroundColor: '#f5f5f4',
          borderRadius: 8,
        }}
      >
        {tabs.map((t) => {
          const active = props.tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => props.setTab(t.id)}
              style={{
                flex: 1,
                paddingVertical: 6,
                paddingHorizontal: 8,
                backgroundColor: active ? '#fff' : 'transparent',
                borderRadius: 6,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                ...(active
                  ? {
                      shadowColor: '#000',
                      shadowOpacity: 0.08,
                      shadowRadius: 2,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: 1,
                    }
                  : {}),
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: active ? colors.textPrimary : '#737373',
                }}
              >
                {t.label}
              </Text>
              <View
                style={{
                  paddingHorizontal: 5,
                  borderRadius: 8,
                  minWidth: 16,
                  backgroundColor: active ? '#0a0a0a' : '#e7e5e4',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: '700',
                    color: active ? '#fff' : colors.textSecondary,
                  }}
                >
                  {t.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Rows */}
      {rows.length === 0 ? (
        <Text
          style={{
            fontSize: 12,
            color: colors.textTertiary,
            textAlign: 'center',
            paddingVertical: 16,
          }}
        >
          Nothing on this tab.
        </Text>
      ) : (
        <View style={{ position: 'relative' }}>
          {/* Vertical connector line */}
          <View
            style={{
              position: 'absolute',
              left: 40,
              top: 4,
              bottom: 4,
              width: 2,
              backgroundColor: '#f5f5f4',
            }}
          />
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <TouchableOpacity
                key={r.id}
                onPress={r.onPress}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  marginBottom: i === rows.length - 1 ? 0 : 12,
                  opacity: r.past ? 0.5 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: colors.textSecondary,
                    fontWeight: '600',
                    width: 34,
                    paddingTop: 2,
                  }}
                >
                  {r.time}
                </Text>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: r.now ? '#ef4444' : r.past ? '#e7e5e4' : '#fff',
                    borderWidth: r.now ? 0 : 2,
                    borderColor: '#e7e5e4',
                    marginTop: 2,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text
                      style={{ fontSize: 12, fontWeight: '600', color: colors.textPrimary, flex: 1 }}
                      numberOfLines={1}
                    >
                      {r.title}
                    </Text>
                    {r.now ? (
                      <View
                        style={{
                          backgroundColor: '#fef2f2',
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 3,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: '700',
                            color: '#991b1b',
                            letterSpacing: 0.4,
                          }}
                        >
                          NOW
                        </Text>
                      </View>
                    ) : r.overdue ? (
                      <View
                        style={{
                          backgroundColor: '#fef2f2',
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 3,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 8,
                            fontWeight: '700',
                            color: '#991b1b',
                            letterSpacing: 0.4,
                          }}
                        >
                          OVERDUE
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 2,
                    }}
                  >
                    <Icon size={10} color={colors.textTertiary} />
                    <Text style={{ fontSize: 10, color: colors.textTertiary }} numberOfLines={1}>
                      {r.sub}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* "Starts in X min" CTA for focus tab */}
      {props.tab === 'focus' && props.nextMeetingStartsInMin !== null && props.nextMeetingStartsInMin <= 60 && props.nextMeetingStartsInMin >= 0 ? (
        <TouchableOpacity
          onPress={props.onJoinNext}
          activeOpacity={0.75}
          style={{
            marginTop: 12,
            paddingVertical: 8,
            paddingHorizontal: 10,
            backgroundColor: '#fafaf9',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#f5f5f5',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Zap size={12} color={colors.textPrimary} />
          <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }}>
            Starts in{' '}
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>
              {props.nextMeetingStartsInMin} min
            </Text>{' '}
            — brief ready
          </Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 5,
              backgroundColor: '#0a0a0a',
              borderRadius: 6,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 0.6,
              }}
            >
              JOIN
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Daily brief card — black left-border, tappable.
// ---------------------------------------------------------------------------

function BriefCard({ content, onPress }: { content: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderLeftWidth: 3,
        borderLeftColor: '#0a0a0a',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Sparkles size={13} color={colors.textPrimary} />
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: colors.textPrimary,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Daily brief
          </Text>
        </View>
        <Text style={{ fontSize: 10, color: colors.textTertiary }}>Read brief →</Text>
      </View>
      <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }} numberOfLines={3}>
        {content}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Activity stream — HubSpot engagement feed with filter chips, day-grouped,
// actor/action/target phrasing + tinted tile icon.
// ---------------------------------------------------------------------------

type ActivityKind =
  | 'email-in'
  | 'email-out'
  | 'meeting'
  | 'doc'
  | 'client'
  | 'note'
  | 'call'
  | 'other';

type ActivityRow = {
  id: string;
  kind: ActivityKind;
  who: string;
  target: string;
  action: string;
  detail: string;
  ago: string;
  timestamp: number;
  clientId?: string | null;
};

function tileFor(k: ActivityKind) {
  switch (k) {
    case 'email-in':
      return { bg: '#dcfce7', tint: '#059669', Icon: ArrowDownLeft };
    case 'email-out':
      return { bg: '#ffedd5', tint: '#ea580c', Icon: ArrowUpRight };
    case 'meeting':
      return { bg: '#dbeafe', tint: '#2563eb', Icon: Video };
    case 'doc':
      return { bg: '#f3e8ff', tint: '#9333ea', Icon: FileText };
    case 'client':
      return { bg: '#fef3c7', tint: '#d97706', Icon: Building };
    case 'note':
      return { bg: '#f5f5f4', tint: colors.textSecondary, Icon: FileText };
    case 'call':
      return { bg: '#ffedd5', tint: '#d97706', Icon: Phone };
    default:
      return { bg: '#f5f5f4', tint: colors.textSecondary, Icon: ActivityIcon };
  }
}

function activityKindFromType(t: string | undefined, direction?: string | null): ActivityKind {
  switch (t) {
    case 'EMAIL':
      return direction === 'inbound' ? 'email-in' : 'email-out';
    case 'INCOMING_EMAIL':
      return 'email-in';
    case 'MEETING':
      return 'meeting';
    case 'NOTE':
      return 'note';
    case 'CALL':
      return 'call';
    default:
      return 'other';
  }
}

const ACTIVITY_FILTERS: { label: string; match: ActivityKind[] | null }[] = [
  { label: 'All', match: null },
  { label: 'Emails', match: ['email-in', 'email-out'] },
  { label: 'Meetings', match: ['meeting'] },
  { label: 'Calls', match: ['call'] },
  { label: 'Notes', match: ['note'] },
];

interface ActivityProps {
  rows: ActivityRow[];
  onRowPress: (row: ActivityRow) => void;
  onViewAll: () => void;
}

const ACTIVITY_PAGE_SIZE = 15;

function ActivityStream(props: ActivityProps) {
  const [filter, setFilter] = useState<string>('All');
  // Paginated limit — resets whenever the filter changes so the user
  // doesn't land on "Show more" with no rows visible for the new filter.
  const [limit, setLimit] = useState<number>(ACTIVITY_PAGE_SIZE);
  const activeFilter = ACTIVITY_FILTERS.find((f) => f.label === filter)!;

  const filtered = useMemo(
    () =>
      activeFilter.match === null
        ? props.rows
        : props.rows.filter((r) => activeFilter.match!.includes(r.kind)),
    [props.rows, activeFilter],
  );

  const visible = filtered.slice(0, limit);
  const hiddenCount = Math.max(0, filtered.length - limit);

  // Group by day (Today / Yesterday / Earlier)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart.getTime() - 86_400_000;
  const groups: { label: string; rows: ActivityRow[] }[] = [
    { label: 'Today', rows: [] },
    { label: 'Yesterday', rows: [] },
    { label: 'Earlier', rows: [] },
  ];
  for (const r of visible) {
    if (r.timestamp >= todayStart.getTime()) groups[0].rows.push(r);
    else if (r.timestamp >= yesterdayStart) groups[1].rows.push(r);
    else groups[2].rows.push(r);
  }

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#22c55e',
            }}
          />
          <Text
            style={{
              fontSize: 10,
              fontWeight: '700',
              color: colors.textTertiary,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Activity stream
          </Text>
        </View>
        <TouchableOpacity onPress={props.onViewAll}>
          <Text style={{ fontSize: 10, color: colors.textSecondary }}>View all</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 5, paddingBottom: 2 }}
        style={{ marginBottom: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        {ACTIVITY_FILTERS.map((f) => {
          const active = filter === f.label;
          return (
            <TouchableOpacity
              key={f.label}
              onPress={() => {
                setFilter(f.label);
                setLimit(ACTIVITY_PAGE_SIZE);
              }}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                backgroundColor: active ? '#0a0a0a' : '#f5f5f4',
                borderRadius: 999,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: active ? '#fff' : colors.textSecondary,
                  letterSpacing: 0.2,
                }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <Text
          style={{
            fontSize: 12,
            color: colors.textTertiary,
            textAlign: 'center',
            paddingVertical: 16,
          }}
        >
          No activity to show.
        </Text>
      ) : (
        <>
          {groups
          .filter((g) => g.rows.length > 0)
          .map((group, gi, arr) => (
            <View
              key={group.label}
              style={{ marginBottom: gi === arr.length - 1 ? 0 : 12 }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '700',
                  color: colors.textTertiary,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                  marginBottom: 6,
                }}
              >
                {group.label}
              </Text>
              <View style={{ position: 'relative' }}>
                <View
                  style={{
                    position: 'absolute',
                    left: 13,
                    top: 4,
                    bottom: 4,
                    width: 1,
                    backgroundColor: '#f5f5f5',
                  }}
                />
                {group.rows.map((r) => {
                  const t = tileFor(r.kind);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      onPress={() => props.onRowPress(r)}
                      activeOpacity={0.75}
                      style={{
                        flexDirection: 'row',
                        gap: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          backgroundColor: t.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: '#fff',
                          shadowOpacity: 1,
                          shadowRadius: 0,
                          shadowOffset: { width: 0, height: 0 },
                        }}
                      >
                        <t.Icon size={13} color={t.tint} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <Text
                            style={{ fontSize: 11, color: colors.textPrimary, lineHeight: 15, flex: 1 }}
                            numberOfLines={2}
                          >
                            <Text style={{ fontWeight: '600' }}>{r.who}</Text>
                            <Text style={{ color: colors.textSecondary }}> {r.action} · </Text>
                            <Text style={{ fontWeight: '600' }}>{r.target}</Text>
                          </Text>
                          <Text style={{ fontSize: 9, color: colors.textTertiary }}>{r.ago}</Text>
                        </View>
                        {r.detail ? (
                          <Text
                            style={{ fontSize: 10, color: colors.textTertiary, marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {r.detail}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          {hiddenCount > 0 ? (
            <TouchableOpacity
              onPress={() => setLimit((l) => l + ACTIVITY_PAGE_SIZE)}
              activeOpacity={0.75}
              style={{
                marginTop: 4,
                paddingVertical: 9,
                alignItems: 'center',
                borderRadius: 8,
                backgroundColor: '#fafaf9',
                borderWidth: 1,
                borderColor: '#f5f5f5',
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.textSecondary,
                  letterSpacing: 0.2,
                }}
              >
                Show more · {hiddenCount} hidden
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Dashboard screen — wires the redesign to Convex queries.
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const { user } = useUser();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [agendaTab, setAgendaTab] = useState<'focus' | 'all' | 'done'>('focus');

  const firstName = user?.firstName || 'there';

  const tasks = useQuery(api.tasks.getByUser, isAuthenticated ? {} : 'skip');
  const brief = useQuery(api.dailyBriefs.getToday, isAuthenticated ? {} : 'skip');
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const deals = useQuery(api.deals.getAllDeals, isAuthenticated ? {} : 'skip');
  const activities = useQuery(
    api.activities.listRecentGlobal,
    // Ceiling generous enough that the activity stream's paginated
    // "Show more" has meaningful room to iterate (page size 15). If a
    // user actually clicks through 100 items, we'd add a proper cursor
    // query; for now this is well under Convex's response-size limits.
    isAuthenticated ? { limit: 100 } : 'skip',
  );
  const events = useQuery(
    api.events.getUpcoming,
    isAuthenticated ? {} : 'skip',
  );
  const companies = useQuery(api.companies.getAll, isAuthenticated ? {} : 'skip');
  const myOpenFlagCount = useQuery(
    api.flags.getMyOpenCount,
    isAuthenticated ? {} : 'skip',
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  if (!isAuthenticated) return <LoadingSpinner message="Authenticating..." />;

  const now = new Date();
  const nowMs = now.getTime();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Task buckets
  const activeTasks =
    tasks?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled') ?? [];
  const overdueTasks = activeTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).getTime() < nowMs,
  );
  const todayTasks = activeTasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString(),
  );
  const inProgressTasks = activeTasks.filter((t) => t.status === 'in_progress');
  const completedToday = (tasks ?? []).filter(
    (t) =>
      t.status === 'completed' &&
      (t as any).completedAt &&
      new Date((t as any).completedAt).toDateString() === now.toDateString(),
  );

  // Pipeline aggregate — open deals only, grouped by actual stage name.
  // HubSpot's canonical "deal is closed" flag is `isClosed` (hs_is_closed);
  // that flips to true for both closed-won and closed-lost, so we filter on
  // it directly rather than string-sniffing stage names. `isClosedWon`
  // separates wins from losses for the breakdown chip row.
  const allDeals = deals ?? [];
  const openDeals = allDeals.filter((d: any) => d.isClosed !== true);
  const wonDeals = allDeals.filter((d: any) => d.isClosedWon === true);
  const lostDeals = allDeals.filter(
    (d: any) => d.isClosed === true && d.isClosedWon !== true,
  );

  // Group open deals by their HubSpot-resolved `stageName` (the
  // human-readable label) — NOT `stage`, which is an internal stage ID
  // like "1234567" or "appointmentscheduled" that keyword-matching can't
  // turn into meaningful buckets across custom pipelines. Fall back to
  // "Unstaged" only when stageName is genuinely missing.
  const stageGroups = new Map<string, { label: string; value: number; count: number }>();
  for (const d of openDeals) {
    const label = ((d as any).stageName as string) || 'Unstaged';
    const existing = stageGroups.get(label);
    const amt = (d as any).amount || 0;
    if (existing) {
      existing.value += amt;
      existing.count += 1;
    } else {
      stageGroups.set(label, { label, value: amt, count: 1 });
    }
  }
  // Top 4 by £ value; if there are more, collapse the tail into "Other".
  const sortedStages = Array.from(stageGroups.values()).sort((a, b) => b.value - a.value);
  const topStages = sortedStages.slice(0, 4);
  const remainder = sortedStages.slice(4);
  if (remainder.length > 0) {
    topStages[topStages.length - 1] = {
      label: 'Other',
      value: remainder.reduce((s, r) => s + r.value, topStages[topStages.length - 1]?.value || 0),
      count: remainder.reduce((s, r) => s + r.count, topStages[topStages.length - 1]?.count || 0),
    };
  }
  const stagesForHero = topStages;
  const pipelineTotal = openDeals.reduce(
    (sum: number, d: any) => sum + ((d as any).amount || 0),
    0,
  );

  // Sync indicator — newest HubSpot sync timestamp across companies
  const latestSyncMs = (companies ?? []).reduce((latest: number, c: any) => {
    const t = c.lastHubSpotSync ? new Date(c.lastHubSpotSync).getTime() : 0;
    return t > latest ? t : latest;
  }, 0);
  const lastSyncAgo = latestSyncMs > 0 ? formatRelativeTime(new Date(latestSyncMs)) : null;

  // Client lookup for agenda + activity context
  const clientMap = new Map(clients?.map((c: any) => [c._id, c.name]) ?? []);

  // Agenda composition
  const todayEvents = (events ?? []).filter(
    (e: any) => new Date(e.startTime).toDateString() === now.toDateString(),
  );
  const nextEvent = todayEvents.find((e: any) => new Date(e.startTime).getTime() >= nowMs);

  function eventToRow(e: any): AgendaRow {
    const start = new Date(e.startTime);
    const isNow =
      e.endTime
        ? start.getTime() <= nowMs && new Date(e.endTime).getTime() >= nowMs
        : Math.abs(start.getTime() - nowMs) < 15 * 60_000;
    const past = e.endTime
      ? new Date(e.endTime).getTime() < nowMs
      : start.getTime() < nowMs - 60 * 60_000;
    return {
      id: `e-${e._id}`,
      time: formatTime(start),
      title: e.title,
      sub: e.location || 'No location',
      kind: 'meeting',
      icon: e.location && /phone|call/i.test(e.location) ? Phone : Video,
      now: isNow,
      past,
      onPress: () => router.push('/tasks' as any),
    };
  }

  function taskToRow(t: any, overdue = false): AgendaRow {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const timeLabel = due
      ? overdue
        ? `-${formatRelativeTime(due).replace(' ago', '')}`
        : due.toDateString() === now.toDateString()
          ? formatTime(due)
          : 'Tmrw'
      : '—';
    return {
      id: `t-${t._id}`,
      time: timeLabel,
      title: t.title,
      sub: (t.clientId && clientMap.get(t.clientId)) || 'No client',
      kind: 'task',
      icon: overdue ? AlertCircle : t.status === 'in_progress' ? ListTodo : Bell,
      overdue,
      onPress: () => router.push(`/tasks?taskId=${t._id}` as never),
    };
  }

  function completedTaskToRow(t: any): AgendaRow {
    const at = (t as any).completedAt ? new Date((t as any).completedAt) : now;
    return {
      id: `d-${t._id}`,
      time: formatTime(at),
      title: t.title,
      sub: (t.clientId && clientMap.get(t.clientId)) || 'No client',
      kind: 'task',
      icon: Check,
      past: true,
      onPress: () => router.push(`/tasks?taskId=${t._id}` as never),
    };
  }

  const allRows: AgendaRow[] = [
    ...todayEvents.map(eventToRow),
    ...todayTasks.map((t) => taskToRow(t)),
  ].sort((a, b) => {
    // Keep raw chronological order — time strings parse ambiguously, so use
    // the original ISO date to sort.
    const aDate =
      a.id.startsWith('e-')
        ? new Date(todayEvents.find((e: any) => `e-${e._id}` === a.id)?.startTime ?? 0).getTime()
        : new Date(todayTasks.find((t: any) => `t-${t._id}` === a.id)?.dueDate ?? 0).getTime();
    const bDate =
      b.id.startsWith('e-')
        ? new Date(todayEvents.find((e: any) => `e-${e._id}` === b.id)?.startTime ?? 0).getTime()
        : new Date(todayTasks.find((t: any) => `t-${t._id}` === b.id)?.dueDate ?? 0).getTime();
    return aDate - bDate;
  });

  const focusRows: AgendaRow[] = [
    ...(nextEvent ? [eventToRow(nextEvent)] : []),
    ...todayTasks.slice(0, 3).map((t) => taskToRow(t)),
    ...overdueTasks.slice(0, 2).map((t) => taskToRow(t, true)),
  ];

  const doneRows: AgendaRow[] = completedToday.slice(0, 6).map(completedTaskToRow);

  const totalBookedMin = todayEvents.reduce((sum: number, e: any) => {
    if (!e.endTime) return sum;
    const dur = (new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60_000;
    return sum + Math.max(0, Math.round(dur));
  }, 0);

  const nextMeetingStartsInMin = nextEvent
    ? Math.max(0, Math.round((new Date(nextEvent.startTime).getTime() - nowMs) / 60_000))
    : null;

  // Activity stream rows
  const activityRows: ActivityRow[] = (activities ?? []).map((a: any) => {
    const kind = activityKindFromType(a.activityType, a.direction);
    const who = a.ownerName || 'Someone';
    const target = a.companyName || clientMap.get(a.clientId ?? '') || 'RockCap';
    const action =
      kind === 'email-out'
        ? 'sent an email'
        : kind === 'email-in'
          ? 'received an email'
          : kind === 'meeting'
            ? 'scheduled a meeting'
            : kind === 'call'
              ? 'logged a call'
              : kind === 'note'
                ? 'added a note'
                : 'logged activity';
    const detail = a.subject || a.bodyPreview || '';
    const ts = a.activityDate ? new Date(a.activityDate).getTime() : 0;
    return {
      id: String(a._id),
      kind,
      who,
      target,
      action,
      detail,
      ago: formatRelativeTime(new Date(ts)),
      timestamp: ts,
      clientId: a.clientId ?? null,
    };
  });

  const briefContent =
    (brief && typeof brief.content === 'string' && brief.content) ||
    `${overdueTasks.length} overdue · ${todayTasks.length} due today · ${myOpenFlagCount ?? 0} open flags`;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, paddingBottom: 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <HeroCommandDeck
          firstName={firstName}
          todayCount={todayTasks.length}
          overdueCount={overdueTasks.length}
          inProgressCount={inProgressTasks.length}
          pipelineTotal={pipelineTotal}
          pipelineCount={openDeals.length}
          wonCount={wonDeals.length}
          lostCount={lostDeals.length}
          stages={stagesForHero.map((s) => ({ label: s.label, value: s.value, count: s.count }))}
          lastSyncAgo={lastSyncAgo}
          onOpenPipeline={() => router.push('/prospects' as any)}
        />

        <QuickActionsBar />

        <AgendaCard
          focusRows={focusRows}
          allRows={allRows}
          doneRows={doneRows}
          tab={agendaTab}
          setTab={setAgendaTab}
          nextMeetingStartsInMin={nextMeetingStartsInMin}
          onJoinNext={() => router.push('/tasks' as any)}
          totalBookedMin={totalBookedMin}
        />

        <BriefCard content={briefContent} onPress={() => router.push('/brief' as any)} />

        <ActivityStream
          rows={activityRows}
          onRowPress={(r) => {
            if (r.clientId) router.push(`/clients/${r.clientId}` as any);
            else router.push('/activity' as any);
          }}
          onViewAll={() => router.push('/activity' as any)}
        />
      </ScrollView>
    </View>
  );
}
