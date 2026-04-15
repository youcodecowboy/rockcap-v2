import { Tabs } from 'expo-router';
import { LayoutDashboard, Building, File, Mail } from 'lucide-react-native';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../model-testing-app/convex/_generated/api';
import { colors, layout } from '@/lib/theme';

export default function TabLayout() {
  const { isAuthenticated } = useConvexAuth();

  const unreadNotifications = useQuery(
    api.notifications.getUnreadCount,
    isAuthenticated ? {} : 'skip'
  );
  const openFlags = useQuery(
    api.flags.getMyFlags,
    isAuthenticated ? { status: 'open' as const } : 'skip'
  );
  const unreadMessages = useQuery(
    api.conversations.getUnreadCount,
    isAuthenticated ? {} : 'skip'
  );

  const inboxBadge =
    (unreadNotifications ?? 0) +
    (openFlags?.length ?? 0) +
    (unreadMessages ?? 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.textOnBrand,
        tabBarInactiveTintColor: 'rgba(255,255,255,0.5)',
        tabBarStyle: {
          backgroundColor: colors.bgBrand,
          borderTopWidth: 0,
          height: layout.footerHeight,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={18} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color }) => <Building size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="docs"
        options={{
          title: 'Docs',
          tabBarIcon: ({ color }) => <File size={18} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <Mail size={18} color={color} />,
          tabBarBadge: inboxBadge > 0 ? (inboxBadge > 9 ? '9+' : inboxBadge) : undefined,
        }}
      />
    </Tabs>
  );
}
