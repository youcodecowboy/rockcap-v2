import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import FlagListItem from '@/components/FlagListItem';
import NotificationItem from '@/components/NotificationItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { Inbox } from 'lucide-react-native';

type ViewMode = 'flags' | 'notifications';

export default function InboxScreen() {
  const { isAuthenticated } = useConvexAuth();
  const [view, setView] = useState<ViewMode>('flags');

  const flags = useQuery(api.flags.getInboxItemsEnriched, isAuthenticated ? {} : 'skip');
  const notifications = useQuery(api.notifications.getByUser, isAuthenticated ? {} : 'skip');

  return (
    <View className="flex-1 bg-m-bg">
      <View className="bg-m-bg-brand pt-14 pb-4 px-4">
        <Text className="text-xl font-bold text-m-text-on-brand">Inbox</Text>
        <View className="flex-row mt-3 bg-white/10 rounded-lg p-0.5">
          <TouchableOpacity
            onPress={() => setView('flags')}
            className={`flex-1 py-2 rounded-md items-center ${view === 'flags' ? 'bg-white/20' : ''}`}
          >
            <Text className="text-m-text-on-brand text-xs font-medium">
              Flags {flags?.length ? `(${flags.length})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setView('notifications')}
            className={`flex-1 py-2 rounded-md items-center ${view === 'notifications' ? 'bg-white/20' : ''}`}
          >
            <Text className="text-m-text-on-brand text-xs font-medium">Notifications</Text>
          </TouchableOpacity>
        </View>
      </View>

      {view === 'flags' ? (
        !flags ? <LoadingSpinner /> : flags.length === 0 ? (
          <EmptyState icon={Inbox} title="No flags" />
        ) : (
          <FlatList
            data={flags}
            keyExtractor={(item, index) => item._id ?? `flag-${index}`}
            renderItem={({ item }) => <FlagListItem flag={item} />}
            contentContainerStyle={{ padding: 16, gap: 8 }}
          />
        )
      ) : !notifications ? <LoadingSpinner /> : notifications.length === 0 ? (
        <EmptyState icon={Inbox} title="No notifications" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item, index) => item._id ?? `notif-${index}`}
          renderItem={({ item }) => <NotificationItem notification={item} />}
          contentContainerStyle={{ padding: 16, gap: 8 }}
        />
      )}
    </View>
  );
}
