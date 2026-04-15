import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import QuickActions from '@/components/QuickActions';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const [refreshing, setRefreshing] = useState(false);

  const firstName = user?.firstName || 'there';
  const tasks = useQuery(api.tasks.getByUser, isAuthenticated ? {} : 'skip');
  const nextEvent = useQuery(api.events.getNextEvent, isAuthenticated ? {} : 'skip');
  const notifications = useQuery(
    api.notifications.getRecent,
    isAuthenticated ? { limit: 3, includeRead: false } : 'skip'
  );
  const brief = useQuery(api.dailyBriefs.getToday, isAuthenticated ? {} : 'skip');

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  if (!isAuthenticated) return <LoadingSpinner message="Authenticating..." />;

  const now = new Date();
  const overdueTasks = tasks?.filter(
    (t) =>
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      t.dueDate &&
      new Date(t.dueDate) < now
  );
  const todayTasks = tasks?.filter(
    (t) =>
      t.status !== 'completed' &&
      t.status !== 'cancelled' &&
      t.dueDate &&
      new Date(t.dueDate).toDateString() === now.toDateString()
  );

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-5 px-4">
        <Text className="text-2xl font-bold text-m-text-on-brand">
          {getGreeting()}, {firstName}
        </Text>
        <Text className="text-sm text-m-text-on-brand/50 mt-0.5">
          {now.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <QuickActions />

        {brief ? (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
              Daily Brief
            </Text>
            <Text className="text-sm text-m-text-secondary leading-5" numberOfLines={4}>
              {typeof brief.content === 'string'
                ? brief.content
                : 'Brief available — tap to view'}
            </Text>
          </Card>
        ) : null}

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

        {overdueTasks && overdueTasks.length > 0 ? (
          <Card className="border-m-error/30">
            <Text className="text-xs font-semibold text-m-error uppercase tracking-wide mb-2">
              Overdue ({overdueTasks.length})
            </Text>
            <View className="gap-2">
              {overdueTasks.slice(0, 3).map((task) => (
                <Text
                  key={task._id}
                  className="text-sm text-m-text-primary"
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}

        {notifications && notifications.length > 0 ? (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">
              Recent
            </Text>
            <View className="gap-3">
              {notifications.map((n) => (
                <View key={n._id} className="flex-row items-start gap-2">
                  <View className="w-1.5 h-1.5 rounded-full bg-m-accent mt-1.5" />
                  <Text className="text-sm text-m-text-secondary flex-1" numberOfLines={2}>
                    {n.message || n.type}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}
