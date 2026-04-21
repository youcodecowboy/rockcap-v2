import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Bell, User, Menu, Search } from 'lucide-react-native';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { useClerk } from '@clerk/clerk-expo';
import Badge from '@/components/ui/Badge';
import MobileNavDrawer from '@/components/MobileNavDrawer';
import TabManager from '@/components/TabManager';
import { colors } from '@/lib/theme';

export default function MobileHeader() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useClerk();
  const [drawerVisible, setDrawerVisible] = useState(false);

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

  const totalBadge = (unreadNotifications ?? 0) + (openFlags?.length ?? 0) + (unreadMessages ?? 0);

  // MobileHeader now owns TabManager too — it renders as a thin extension
  // below the RockCap brand row when there are open doc tabs. Mounting it
  // here means the tab strip appears app-wide (home, clients, inbox,
  // docs…) rather than only inside the docs stack. Styling is kept flush
  // with the brand bar so the chrome reads as one cohesive block.
  return (
    <View>
      <View className="bg-m-bg-brand pt-14 pb-3 px-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5">
          <TouchableOpacity onPress={() => setDrawerVisible(true)} className="p-1">
            <Menu size={18} color={colors.textOnBrand} />
          </TouchableOpacity>
          <Text
            className="text-lg font-normal text-m-text-on-brand"
            style={{ fontFamily: 'Helvetica Neue', letterSpacing: -0.2 }}
          >
            RockCap
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity className="p-1 opacity-60">
            <Search size={18} color={colors.textOnBrand} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/inbox')}
            className="relative p-1"
          >
            <Bell size={18} color={colors.textOnBrand} />
            {totalBadge > 0 && (
              <View className="absolute -top-1 -right-1">
                <Badge count={totalBadge} variant="error" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => signOut()}
            className="w-6 h-6 rounded-full bg-white/20 items-center justify-center"
          >
            <User size={13} color={colors.textOnBrand} />
          </TouchableOpacity>
        </View>

        <MobileNavDrawer
          visible={drawerVisible}
          onClose={() => setDrawerVisible(false)}
        />
      </View>
      <TabManager />
    </View>
  );
}
