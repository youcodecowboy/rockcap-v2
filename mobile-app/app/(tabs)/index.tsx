import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuickActions from '@/components/QuickActions';
import MobileHeader from '@/components/MobileHeader';
import {
  Flag,
  MessageCircle,
  FileText,
  Building,
  FolderOpen,
  ChevronRight,
  Sparkles,
  ListTodo,
  AlertCircle,
  Clock,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';
import UpNextCard, { type UpNextItem } from '@/components/UpNextCard';

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
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function DashboardScreen() {
  const { user } = useUser();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [recentsTab, setRecentsTab] = useState<'projects' | 'clients' | 'docs'>('projects');

  const firstName = user?.firstName || 'there';
  const tasks = useQuery(api.tasks.getByUser, isAuthenticated ? {} : 'skip');
  const nextEvent = useQuery(api.events.getNextEvent, isAuthenticated ? {} : 'skip');
  const upcomingReminders = useQuery(
    api.reminders.getUpcoming,
    isAuthenticated ? { limit: 3 } : 'skip'
  );
  const notifications = useQuery(
    api.notifications.getRecent,
    isAuthenticated ? { limit: 3, includeRead: false } : 'skip'
  );
  const brief = useQuery(api.dailyBriefs.getToday, isAuthenticated ? {} : 'skip');
  const projects = useQuery(api.projects.list, isAuthenticated ? {} : 'skip');
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip');
  const recentDocs = useQuery(api.documents.getRecent, isAuthenticated ? { limit: 3 } : 'skip');
  const flags = useQuery(
    api.flags.getInboxItemsEnriched,
    isAuthenticated ? {} : 'skip'
  );
  // True count of open flags. getInboxItemsEnriched is slice()d to 50 and
  // mixes flags + notifications, so its length was misrepresented as the
  // "open flags" number in the daily brief.
  const myOpenFlagCount = useQuery(
    api.flags.getMyOpenCount,
    isAuthenticated ? {} : 'skip'
  );
  const conversations = useQuery(
    api.conversations.getMyConversations,
    isAuthenticated ? {} : 'skip'
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  if (!isAuthenticated) return <LoadingSpinner message="Authenticating..." />;

  const now = new Date();
  const activeTasks = tasks?.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled'
  );
  const overdueTasks = activeTasks?.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now
  );
  const todayTasks = activeTasks?.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString()
  );
  const inProgressTasks = activeTasks?.filter((t) => t.status === 'in_progress');

  // Client lookup (also used by Up Next for context)
  const clientMap = new Map(clients?.map((c) => [c._id, c.name]) ?? []);

  // Build Up Next items: merge tasks + reminders + events, sort by urgency
  // (overdue first, then soonest upcoming). Mirrors web's resolveUpNext().
  const upNextItems: UpNextItem[] = [];

  if (tasks) {
    for (const t of tasks) {
      if (t.status !== 'completed' && t.status !== 'cancelled' && t.dueDate) {
        upNextItems.push({
          id: String(t._id),
          type: 'task',
          title: t.title,
          context: (t.clientId && clientMap.get(t.clientId)) || 'No client',
          dueDate: new Date(t.dueDate),
          href: '/tasks',
        });
      }
    }
  }

  if (upcomingReminders) {
    for (const r of upcomingReminders) {
      upNextItems.push({
        id: String(r._id),
        type: 'reminder',
        title: r.title,
        context: (r.clientId && clientMap.get(r.clientId)) || 'Reminder',
        dueDate: new Date(r.scheduledFor),
        href: '/tasks',
      });
    }
  }

  if (nextEvent) {
    upNextItems.push({
      id: String(nextEvent._id),
      type: 'event',
      title: nextEvent.title,
      context: nextEvent.location || 'No location',
      dueDate: new Date(nextEvent.startTime),
      href: '/tasks',
    });
  }

  const nowMs = now.getTime();
  upNextItems.sort((a, b) => {
    const aOverdue = a.dueDate.getTime() < nowMs;
    const bOverdue = b.dueDate.getTime() < nowMs;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  // Recents data
  const recentProjects = projects?.slice(0, 3);
  const recentClients = clients?.slice(0, 3);

  // Merged messages + flags feed, sorted by timestamp desc, capped at 5 most recent.
  type MessagesFlagsItem =
    | { kind: 'conversation'; item: any; timestamp: number }
    | { kind: 'flag'; item: any; timestamp: number };
  const messagesAndFlags: MessagesFlagsItem[] = [];
  if (conversations) {
    for (const c of conversations) {
      messagesAndFlags.push({
        kind: 'conversation',
        item: c,
        timestamp: (c as any).lastMessageAt || (c as any)._creationTime || 0,
      });
    }
  }
  if (flags) {
    for (const f of flags) {
      messagesAndFlags.push({
        kind: 'flag',
        item: f,
        timestamp: (f as any).createdAt || (f as any)._creationTime || 0,
      });
    }
  }
  messagesAndFlags.sort((a, b) => b.timestamp - a.timestamp);
  const recentMessagesAndFlags = messagesAndFlags.slice(0, 5);
  const openFlagCountForBrief = myOpenFlagCount ?? 0;

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Greeting Card with Metrics */}
        <Card>
          <Text className="text-lg font-bold text-m-text-primary">
            {getGreeting()}, {firstName}
          </Text>
          <Text className="text-xs text-m-text-tertiary mt-0.5">
            {now.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <View className="flex-row mt-4 gap-2">
            <View className="flex-1 rounded-lg bg-m-bg-subtle px-3 py-2.5">
              <View className="flex-row items-center gap-1.5 mb-1.5">
                <ListTodo size={12} color={colors.textTertiary} />
                <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                  Today
                </Text>
              </View>
              <Text className="text-2xl font-bold text-m-text-primary leading-7">
                {todayTasks?.length ?? 0}
              </Text>
            </View>
            <View
              className={`flex-1 rounded-lg px-3 py-2.5 ${
                (overdueTasks?.length ?? 0) > 0 ? 'bg-m-error/10' : 'bg-m-bg-subtle'
              }`}
            >
              <View className="flex-row items-center gap-1.5 mb-1.5">
                <AlertCircle
                  size={12}
                  color={(overdueTasks?.length ?? 0) > 0 ? colors.error : colors.textTertiary}
                />
                <Text
                  className={`text-[10px] font-semibold uppercase tracking-wide ${
                    (overdueTasks?.length ?? 0) > 0 ? 'text-m-error' : 'text-m-text-tertiary'
                  }`}
                >
                  Overdue
                </Text>
              </View>
              <Text
                className={`text-2xl font-bold leading-7 ${
                  (overdueTasks?.length ?? 0) > 0 ? 'text-m-error' : 'text-m-text-primary'
                }`}
              >
                {overdueTasks?.length ?? 0}
              </Text>
            </View>
            <View className="flex-1 rounded-lg bg-m-bg-subtle px-3 py-2.5">
              <View className="flex-row items-center gap-1.5 mb-1.5">
                <Clock size={12} color={colors.textTertiary} />
                <Text className="text-[10px] font-semibold text-m-text-tertiary uppercase tracking-wide">
                  In Progress
                </Text>
              </View>
              <Text className="text-2xl font-bold text-m-text-primary leading-7">
                {inProgressTasks?.length ?? 0}
              </Text>
            </View>
          </View>
        </Card>

        {/* Quick Actions */}
        <QuickActions />

        {/* Daily Brief Widget */}
        {brief ? (
          <TouchableOpacity onPress={() => router.push('/brief')}>
            <Card className="border-l-[3px] border-l-m-accent">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-1.5">
                  <Sparkles size={14} color={colors.accent} />
                  <Text className="text-xs font-semibold text-m-text-primary uppercase tracking-wide">
                    Daily Brief
                  </Text>
                </View>
                <ChevronRight size={14} color={colors.textTertiary} />
              </View>
              <Text className="text-sm text-m-text-secondary leading-5" numberOfLines={3}>
                {typeof brief.content === 'string'
                  ? brief.content
                  : `${overdueTasks?.length ?? 0} overdue · ${todayTasks?.length ?? 0} due today · ${openFlagCountForBrief} open flags`}
              </Text>
            </Card>
          </TouchableOpacity>
        ) : null}

        {/* Up Next */}
        <UpNextCard items={upNextItems} />

        {/* Overdue — matches Up Next styling (icon + title + context · relative
            time + OVERDUE badge + red left border) and taps through to the
            specific task (/tasks?taskId=<id>) so the user lands on the
            TaskDetailSheet instead of the generic task list. */}
        {overdueTasks && overdueTasks.length > 0 ? (
          <Card className="border-m-error/30">
            <Text className="text-xs font-semibold text-m-error uppercase tracking-wide mb-3">
              Overdue ({overdueTasks.length})
            </Text>
            <View className="gap-2">
              {overdueTasks.slice(0, 3).map((task) => {
                const due = task.dueDate ? new Date(task.dueDate) : null;
                const diffMs = due ? now.getTime() - due.getTime() : 0;
                const days = Math.floor(diffMs / 86400000);
                const hours = Math.floor(diffMs / 3600000);
                const minutes = Math.floor(diffMs / 60000);
                const ago =
                  days > 0 ? `${days}d ago`
                  : hours > 0 ? `${hours}h ago`
                  : minutes > 0 ? `${minutes}m ago`
                  : 'just now';
                const clientName =
                  (task.clientId && clientMap.get(task.clientId)) || 'No client';
                return (
                  <TouchableOpacity
                    key={task._id}
                    onPress={() =>
                      router.push(`/tasks?taskId=${task._id}` as never)
                    }
                    className="flex-row items-start gap-3 pl-3 py-1.5"
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: colors.error,
                    }}
                  >
                    <View className="mt-0.5">
                      <ListTodo size={16} color={colors.error} />
                    </View>
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text
                          className="text-sm font-semibold text-m-text-primary flex-1"
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>
                        <View
                          className="px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: '#fef2f2' }}
                        >
                          <Text
                            className="text-[9px] font-semibold tracking-wide"
                            style={{ color: '#991b1b' }}
                          >
                            OVERDUE
                          </Text>
                        </View>
                      </View>
                      <Text
                        className="text-xs text-m-text-tertiary mt-0.5"
                        numberOfLines={1}
                      >
                        {clientName} · Due {ago}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* Notifications */}
        {notifications && notifications.length > 0 ? (
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                Notifications
              </Text>
              <TouchableOpacity onPress={() => router.push('/inbox')}>
                <Text className="text-xs text-m-text-tertiary">View all</Text>
              </TouchableOpacity>
            </View>
            <View className="gap-3">
              {notifications.map((n) => (
                <TouchableOpacity key={n._id} onPress={() => router.push('/inbox')} className="flex-row items-start gap-2">
                  <View className="w-1.5 h-1.5 rounded-full bg-m-accent mt-1.5" />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-secondary" numberOfLines={2}>
                      {n.message || n.type}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                      {formatRelativeTime(n._creationTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Messages & Flags — merged feed, 5 most recent by timestamp */}
        {recentMessagesAndFlags.length > 0 ? (
          <Card>
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                Messages & Flags
              </Text>
              <TouchableOpacity onPress={() => router.push('/inbox')}>
                <Text className="text-xs text-m-text-tertiary">View all</Text>
              </TouchableOpacity>
            </View>
            <View className="gap-3">
              {recentMessagesAndFlags.map((entry, i) => {
                if (entry.kind === 'conversation') {
                  const conv = entry.item;
                  return (
                    <TouchableOpacity
                      key={`conv-${conv._id ?? i}`}
                      onPress={() => router.push('/inbox')}
                      className="flex-row items-start gap-2"
                    >
                      <MessageCircle size={14} color={colors.textTertiary} />
                      <View className="flex-1">
                        <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                          {conv.title || 'Conversation'}
                        </Text>
                        {(conv as any).participants?.length > 0 && (
                          <Text className="text-[10px] text-m-text-tertiary" numberOfLines={1}>
                            {(conv as any).participants.map((p: any) => p.name).join(', ')}
                          </Text>
                        )}
                        <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                          {formatRelativeTime(entry.timestamp)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }
                const flag = entry.item;
                return (
                  <TouchableOpacity
                    key={`flag-${flag._id ?? i}`}
                    onPress={() => router.push('/inbox')}
                    className="flex-row items-start gap-2"
                  >
                    <Flag size={14} color={colors.warning} />
                    <View className="flex-1">
                      <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                        {(flag as any).data?.title || (flag as any).entityName || 'Flag'}
                      </Text>
                      {((flag as any).entityName || (flag as any).entityContext) && (
                        <Text className="text-[10px] text-m-text-tertiary" numberOfLines={1}>
                          {[(flag as any).entityName, (flag as any).entityContext]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      )}
                      <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                        {formatRelativeTime(entry.timestamp)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        ) : null}

        {/* Recents (Tabbed: Projects | Clients | Docs) */}
        <Card>
          <View className="flex-row items-center mb-3">
            {(['projects', 'clients', 'docs'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setRecentsTab(tab)}
                className={`mr-4 pb-1 ${recentsTab === tab ? 'border-b-2 border-m-accent' : ''}`}
              >
                <Text
                  className={`text-xs font-semibold uppercase tracking-wide ${
                    recentsTab === tab ? 'text-m-text-primary' : 'text-m-text-tertiary'
                  }`}
                >
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="gap-3">
            {recentsTab === 'projects' &&
              recentProjects?.map((p) => (
                <TouchableOpacity key={p._id} onPress={() => router.push(`/projects/${p._id}`)} className="flex-row items-center gap-2">
                  <FolderOpen size={16} color={colors.textTertiary} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary capitalize">
                      {p.status || 'active'}
                    </Text>
                  </View>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}

            {recentsTab === 'clients' &&
              recentClients?.map((c) => (
                <TouchableOpacity
                  key={c._id}
                  onPress={() => router.push(`/clients/${c._id}`)}
                  className="flex-row items-center gap-2"
                >
                  <Building size={16} color={colors.textTertiary} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary capitalize">
                      {c.status || 'active'}
                    </Text>
                  </View>
                  <ChevronRight size={14} color={colors.textTertiary} />
                </TouchableOpacity>
              ))}

            {recentsTab === 'docs' &&
              recentDocs?.map((d) => (
                <TouchableOpacity
                  key={d._id}
                  onPress={() => router.push({
                    pathname: '/docs/viewer',
                    params: { documentId: d._id, title: d.fileName || 'Document', fileType: d.fileType || '' },
                  })}
                  className="flex-row items-center gap-2"
                >
                  <FileText size={16} color={colors.textTertiary} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {d.fileName || 'Document'}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary uppercase">
                      {d.category || d.fileType || ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

            {((recentsTab === 'projects' && (!recentProjects || recentProjects.length === 0)) ||
              (recentsTab === 'clients' && (!recentClients || recentClients.length === 0)) ||
              (recentsTab === 'docs' && (!recentDocs || recentDocs.length === 0))) && (
              <Text className="text-sm text-m-text-tertiary text-center py-4">
                No recent {recentsTab}
              </Text>
            )}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
