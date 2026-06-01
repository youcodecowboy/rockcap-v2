import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LayoutDashboard, Building, MessageCircle, File, Mail } from 'lucide-react-native';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { layout } from '@/lib/theme';
import { useColors } from '@/lib/useColors';

const TABS = [
  { route: '/', label: 'HOME', icon: LayoutDashboard },
  { route: '/clients', label: 'CLIENTS', icon: Building },
  { route: '/chat', label: 'CHAT', icon: MessageCircle },
  { route: '/docs', label: 'DOCS', icon: File },
  { route: '/inbox', label: 'INBOX', icon: Mail },
] as const;

export default function MiniTabBar() {
  const router = useRouter();
  const c = useColors();
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();

  const unreadNotifications = useQuery(api.notifications.getUnreadCount, isAuthenticated ? {} : 'skip');
  const openFlags = useQuery(api.flags.getMyFlags, isAuthenticated ? { status: 'open' as const } : 'skip');
  const unreadMessages = useQuery(api.conversations.getUnreadCount, isAuthenticated ? {} : 'skip');
  const inboxBadge = (unreadNotifications ?? 0) + (openFlags?.length ?? 0) + (unreadMessages ?? 0);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.bg.light,
        borderTopWidth: 1,
        borderTopColor: c.border.default,
        height: layout.footerHeight,
        paddingBottom: 8,
        paddingTop: 8,
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = pathname === tab.route || pathname.startsWith(tab.route + '/');
        const iconColor = isActive ? c.text.primary : c.text.muted;
        const showBadge = tab.route === '/inbox' && inboxBadge > 0;

        return (
          <TouchableOpacity
            key={tab.route}
            onPress={() => router.push(tab.route as any)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ position: 'relative' }}>
              <Icon size={tab.route === '/chat' ? 22 : 18} color={iconColor} />
              {showBadge && (
                <View style={{
                  position: 'absolute', top: -4, right: -8,
                  backgroundColor: c.accent.red, borderRadius: 8,
                  minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 3,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                    {inboxBadge > 9 ? '9+' : inboxBadge}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{
              fontSize: 9, letterSpacing: 0.5, fontWeight: '600',
              color: iconColor, marginTop: 2,
            }}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
