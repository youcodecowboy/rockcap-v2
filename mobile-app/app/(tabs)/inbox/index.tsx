import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../../../model-testing-app/convex/_generated/api';
import FlagListItem from '@/components/FlagListItem';
import NotificationItem from '@/components/NotificationItem';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import MobileHeader from '@/components/MobileHeader';
import {
  MessageSquare,
  Flag,
  Bell,
  Inbox,
  CheckCheck,
  Plus,
} from 'lucide-react-native';
import { colors } from '@/lib/theme';

type TabKey = 'messages' | 'flags' | 'notifications';

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof MessageSquare;
}

const TABS: TabDef[] = [
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'flags', label: 'Flags', icon: Flag },
  { key: 'notifications', label: 'Notifications', icon: Bell },
];

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function InboxScreen() {
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>('messages');
  const [flagFilter, setFlagFilter] = useState<'open' | 'resolved'>('open');

  const conversations = useQuery(
    api.conversations.getMyConversations,
    isAuthenticated ? {} : 'skip'
  );
  const flags = useQuery(
    api.flags.getInboxItemsEnriched,
    isAuthenticated ? {} : 'skip'
  );
  const notifications = useQuery(
    api.notifications.getByUser,
    isAuthenticated ? {} : 'skip'
  );
  const markAllAsRead = useMutation(api.notifications.markAllAsRead);

  // Use meaningful counts: unread messages, open flags, unread notifications
  const counts: Record<TabKey, number> = {
    messages: conversations?.filter((c: any) => (c.unreadCount ?? 0) > 0).length ?? 0,
    flags: flags?.filter((f: any) => f.status === 'open').length ?? 0,
    notifications: notifications?.filter((n: any) => !n.isRead).length ?? 0,
  };

  const filteredFlags = useMemo(() => {
    if (!flags) return [];
    return flags.filter((f: any) =>
      flagFilter === 'open' ? f.status === 'open' : f.status !== 'open'
    );
  }, [flags, flagFilter]);

  const unreadNotifications = useMemo(
    () => notifications?.filter((n: any) => !n.isRead).length ?? 0,
    [notifications]
  );

  return (
    <View className="flex-1 bg-m-bg">
      <MobileHeader />

      {/* Tab bar */}
      <View className="bg-m-bg-card border-b border-m-border">
        <View className="flex-row">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const Icon = tab.icon;
            const count = counts[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 items-center border-b-2 ${
                  active ? 'border-m-accent' : 'border-transparent'
                }`}
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon
                    size={14}
                    color={active ? colors.textPrimary : colors.textTertiary}
                  />
                  <Text
                    className={`text-xs font-semibold ${
                      active ? 'text-m-text-primary' : 'text-m-text-tertiary'
                    }`}
                  >
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View className="bg-m-accent rounded-full px-1.5 min-w-[18px] items-center">
                      <Text className="text-[10px] font-bold text-m-text-on-brand">
                        {count > 99 ? '99+' : count}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Messages tab */}
      {activeTab === 'messages' && (
        !conversations ? (
          <LoadingSpinner />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item: any) => item._id}
            contentContainerStyle={{ paddingBottom: 16 }}
            ListHeaderComponent={
              <TouchableOpacity
                onPress={() => router.push('/inbox/conversation/new' as any)}
                className="mx-4 mt-3 mb-2 bg-m-bg-brand rounded-lg py-3 flex-row items-center justify-center"
              >
                <Plus size={16} color={colors.textOnBrand} />
                <Text className="text-sm font-medium text-m-text-on-brand ml-2">New Conversation</Text>
              </TouchableOpacity>
            }
            ListEmptyComponent={<EmptyState icon={MessageSquare} title="No messages" />}
            renderItem={({ item }: { item: any }) => {
              // Extract initials from participants or title
              const initials = (item.participantNames?.[0] || item.title || 'C')
                .split(' ')
                .map((w: string) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <TouchableOpacity
                  onPress={() => router.push(`/inbox/conversation/${item._id}` as any)}
                  className="px-4 py-3 border-b border-m-border flex-row items-center"
                >
                  <View className="w-8 h-8 rounded-full bg-m-bg-inset items-center justify-center">
                    <Text className="text-[11px] font-semibold text-m-text-secondary">{initials}</Text>
                  </View>
                  <View className="flex-1 ml-3">
                    <View className="flex-row items-center justify-between">
                      <Text
                        className="text-sm font-medium text-m-text-primary flex-1"
                        numberOfLines={1}
                      >
                        {item.title || 'Conversation'}
                      </Text>
                      <Text className="text-[10px] text-m-text-tertiary ml-2">
                        {formatRelativeTime(item.lastMessageAt ?? item._creationTime)}
                      </Text>
                    </View>
                    <Text
                      className="text-xs text-m-text-tertiary mt-0.5"
                      numberOfLines={1}
                    >
                      {item.lastMessagePreview || 'No messages yet'}
                    </Text>
                  </View>
                  {(item.unreadCount ?? 0) > 0 && (
                    <View className="ml-2 bg-m-accent rounded-full w-5 h-5 items-center justify-center">
                      <Text className="text-[10px] font-bold text-m-text-on-brand">
                        {item.unreadCount > 9 ? '9+' : item.unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )
      )}

      {/* Flags tab */}
      {activeTab === 'flags' && (
        <View className="flex-1">
          {/* Open/Resolved toggle */}
          <View className="flex-row px-4 pt-3 pb-1 gap-2">
            <TouchableOpacity
              onPress={() => setFlagFilter('open')}
              className={`px-3 py-1.5 rounded-full border ${
                flagFilter === 'open'
                  ? 'bg-m-accent border-m-accent'
                  : 'border-m-border bg-m-bg-card'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  flagFilter === 'open'
                    ? 'text-m-text-on-brand'
                    : 'text-m-text-secondary'
                }`}
              >
                Open
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setFlagFilter('resolved')}
              className={`px-3 py-1.5 rounded-full border ${
                flagFilter === 'resolved'
                  ? 'bg-m-accent border-m-accent'
                  : 'border-m-border bg-m-bg-card'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  flagFilter === 'resolved'
                    ? 'text-m-text-on-brand'
                    : 'text-m-text-secondary'
                }`}
              >
                Resolved
              </Text>
            </TouchableOpacity>
          </View>

          {!flags ? (
            <LoadingSpinner />
          ) : filteredFlags.length === 0 ? (
            <EmptyState
              icon={Flag}
              title={`No ${flagFilter} flags`}
            />
          ) : (
            <FlatList
              data={filteredFlags}
              keyExtractor={(item: any, index: number) =>
                item._id ?? `flag-${index}`
              }
              renderItem={({ item }: { item: any }) => (
                <FlagListItem flag={item} />
              )}
              contentContainerStyle={{ padding: 16, gap: 8 }}
            />
          )}
        </View>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <View className="flex-1">
          {/* Mark all read header */}
          {unreadNotifications > 0 && (
            <View className="flex-row items-center justify-end px-4 pt-3 pb-1">
              <TouchableOpacity
                onPress={() => markAllAsRead({})}
                className="flex-row items-center gap-1"
              >
                <CheckCheck size={14} color={colors.accent} />
                <Text className="text-xs font-medium text-m-text-primary">
                  Mark all read
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {!notifications ? (
            <LoadingSpinner />
          ) : notifications.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications" />
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item: any, index: number) =>
                item._id ?? `notif-${index}`
              }
              renderItem={({ item }: { item: any }) => (
                <NotificationItem notification={item} />
              )}
              contentContainerStyle={{ padding: 16, gap: 8 }}
            />
          )}
        </View>
      )}
    </View>
  );
}
