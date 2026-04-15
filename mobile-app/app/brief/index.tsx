import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import Card from '@/components/ui/Card';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function BriefScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();

  const brief = useQuery(api.dailyBriefs.getToday, isAuthenticated ? {} : 'skip');
  const tasks = useQuery(api.tasks.getByUser, isAuthenticated ? {} : 'skip');
  const nextEvent = useQuery(api.events.getNextEvent, isAuthenticated ? {} : 'skip');

  const now = new Date();
  const activeTasks = tasks?.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  const overdueTasks = activeTasks?.filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const todayTasks = activeTasks?.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString()
  );

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4 flex-row items-center">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft size={20} color={colors.textOnBrand} />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-m-text-on-brand">Daily Brief</Text>
      </View>

      <View className="flex-row bg-m-bg-card border-b border-m-border px-4 py-3 gap-4">
        <View className="items-center flex-1">
          <Text className="text-lg font-bold text-m-text-primary">{todayTasks?.length ?? 0}</Text>
          <Text className="text-[10px] text-m-text-tertiary uppercase">Due Today</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-lg font-bold text-m-error">{overdueTasks?.length ?? 0}</Text>
          <Text className="text-[10px] text-m-text-tertiary uppercase">Overdue</Text>
        </View>
        <View className="items-center flex-1">
          <Text className="text-lg font-bold text-m-text-primary">{nextEvent ? '1' : '0'}</Text>
          <Text className="text-[10px] text-m-text-tertiary uppercase">Events</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-3" contentContainerStyle={{ paddingBottom: 24, gap: 12 }}>
        {brief ? (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-3">
              Today's Summary
            </Text>
            <Text className="text-sm text-m-text-secondary leading-5">
              {typeof brief.content === 'string'
                ? brief.content
                : typeof brief.content === 'object'
                  ? JSON.stringify(brief.content, null, 2)
                  : 'No brief content available'}
            </Text>
          </Card>
        ) : (
          <Card>
            <Text className="text-sm text-m-text-tertiary text-center py-4">
              No daily brief generated yet
            </Text>
          </Card>
        )}

        {nextEvent && (
          <Card>
            <Text className="text-xs font-semibold text-m-text-tertiary uppercase tracking-wide mb-2">
              Next Event
            </Text>
            <Text className="text-sm text-m-text-primary font-medium">{nextEvent.title}</Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
