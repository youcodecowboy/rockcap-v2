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
import { Flag, MessageCircle, FileText, Building, FolderOpen, ChevronRight } from 'lucide-react-native';
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

  // Recent flags (limit 3)
  const recentFlags = flags?.slice(0, 3);
  // Recent conversations with unread
  const recentConversations = conversations?.slice(0, 2);

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
          <View className="flex-row mt-3 pt-3 border-t border-m-border-subtle gap-4">
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-m-text-primary">
                {todayTasks?.length ?? 0}
              </Text>
              <Text className="text-[10px] text-m-text-tertiary uppercase">Today</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className={`text-lg font-bold ${(overdueTasks?.length ?? 0) > 0 ? 'text-m-error' : 'text-m-text-primary'}`}>
                {overdueTasks?.length ?? 0}
              </Text>
              <Text className="text-[10px] text-m-text-tertiary uppercase">Overdue</Text>
            </View>
            <View className="flex-1 items-center">
              <Text className="text-lg font-bold text-m-text-primary">
                {inProgressTasks?.length ?? 0}
              </Text>
              <Text className="text-[10px] text-m-text-tertiary uppercase">In Progress</Text>
            </View>
          </View>
        </Card>

        {/* Quick Actions */}
        <QuickActions />

        {/* Daily Brief Widget */}
        {brief ? (
          <TouchableOpacity onPress={() => router.push('/brief')}>
            <Card>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide">
                  Daily Brief
                </Text>
                <ChevronRight size={14} color={colors.textTertiary} />
              </View>
              <Text className="text-sm text-m-text-secondary leading-5" numberOfLines={3}>
                {typeof brief.content === 'string'
                  ? brief.content
                  : `${overdueTasks?.length ?? 0} overdue · ${todayTasks?.length ?? 0} due today · ${recentFlags?.length ?? 0} open flags`}
              </Text>
            </Card>
          </TouchableOpacity>
        ) : null}

        {/* Up Next */}
        <UpNextCard items={upNextItems} />

        {/* Overdue */}
        {overdueTasks && overdueTasks.length > 0 ? (
          <Card className="border-m-error/30">
            <Text className="text-xs font-semibold text-m-error uppercase tracking-wide mb-2">
              Overdue ({overdueTasks.length})
            </Text>
            <View className="gap-2">
              {overdueTasks.slice(0, 3).map((task) => (
                <TouchableOpacity key={task._id} onPress={() => router.push('/tasks')}>
                  <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                    {task.title}
                  </Text>
                </TouchableOpacity>
              ))}
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

        {/* Messages & Flags */}
        {((recentConversations?.length ?? 0) > 0 || (recentFlags?.length ?? 0) > 0) ? (
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
              {recentConversations?.map((conv, i) => (
                <TouchableOpacity key={`conv-${conv._id ?? i}`} onPress={() => router.push('/inbox')} className="flex-row items-start gap-2">
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
                      {formatRelativeTime(conv.lastMessageAt || conv._creationTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {recentFlags?.map((flag, i) => (
                <TouchableOpacity key={`flag-${flag._id ?? i}`} onPress={() => router.push('/inbox')} className="flex-row items-start gap-2">
                  <Flag size={14} color={colors.warning} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {(flag as any).data?.title || (flag as any).entityName || 'Flag'}
                    </Text>
                    {((flag as any).entityName || (flag as any).entityContext) && (
                      <Text className="text-[10px] text-m-text-tertiary" numberOfLines={1}>
                        {[(flag as any).entityName, (flag as any).entityContext].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                    <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                      {formatRelativeTime((flag as any).createdAt || (flag as any)._creationTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
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
