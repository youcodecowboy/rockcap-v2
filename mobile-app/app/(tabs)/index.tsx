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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d`;
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
        <Card>
          <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">
            Up Next
          </Text>
          {todayTasks && todayTasks.length > 0 ? (
            <View className="gap-2">
              {todayTasks.slice(0, 3).map((task) => (
                <View key={task._id} className="flex-row items-center gap-2">
                  <View className="w-1.5 h-1.5 rounded-full bg-m-accent" />
                  <Text className="text-sm text-m-text-primary flex-1" numberOfLines={1}>
                    {task.title}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-sm text-m-text-tertiary">Nothing scheduled</Text>
          )}
          {nextEvent ? (
            <View className="flex-row items-center gap-2 mt-3 pt-3 border-t border-m-border-subtle">
              <View className="w-1.5 h-1.5 rounded-full bg-m-success" />
              <Text className="text-sm text-m-text-primary flex-1" numberOfLines={1}>
                {nextEvent.title}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Overdue */}
        {overdueTasks && overdueTasks.length > 0 ? (
          <Card className="border-m-error/30">
            <Text className="text-xs font-semibold text-m-error uppercase tracking-wide mb-2">
              Overdue ({overdueTasks.length})
            </Text>
            <View className="gap-2">
              {overdueTasks.slice(0, 3).map((task) => (
                <Text key={task._id} className="text-sm text-m-text-primary" numberOfLines={1}>
                  {task.title}
                </Text>
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
                <View key={n._id} className="flex-row items-start gap-2">
                  <View className="w-1.5 h-1.5 rounded-full bg-m-accent mt-1.5" />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-secondary" numberOfLines={2}>
                      {n.message || n.type}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                      {formatRelativeTime(new Date(n._creationTime))}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Messages & Flags */}
        {((recentConversations && recentConversations.length > 0) || (recentFlags && recentFlags.length > 0)) ? (
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
                <View key={`conv-${conv._id ?? i}`} className="flex-row items-start gap-2">
                  <MessageCircle size={14} color={colors.textTertiary} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {conv.title || 'Conversation'}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                      {formatRelativeTime(new Date(conv.lastMessageAt || conv._creationTime))}
                    </Text>
                  </View>
                </View>
              ))}
              {recentFlags?.map((flag, i) => (
                <View key={`flag-${flag._id ?? i}`} className="flex-row items-start gap-2">
                  <Flag size={14} color={colors.warning} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {flag.title}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary mt-0.5">
                      {formatRelativeTime(new Date(flag._creationTime))}
                    </Text>
                  </View>
                </View>
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
                <View key={p._id} className="flex-row items-center gap-2">
                  <FolderOpen size={16} color={colors.textTertiary} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary capitalize">
                      {p.status || 'active'}
                    </Text>
                  </View>
                </View>
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
                <View key={d._id} className="flex-row items-center gap-2">
                  <FileText size={16} color={colors.textTertiary} />
                  <View className="flex-1">
                    <Text className="text-sm text-m-text-primary" numberOfLines={1}>
                      {d.fileName || 'Document'}
                    </Text>
                    <Text className="text-[10px] text-m-text-tertiary uppercase">
                      {d.category || d.fileType || ''}
                    </Text>
                  </View>
                </View>
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
