import { View, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Bell, User, Menu } from 'lucide-react-native';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { useClerk } from '@clerk/clerk-expo';
import Badge from '@/components/ui/Badge';
import MobileNavDrawer from '@/components/MobileNavDrawer';
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

  return (
    <View className="bg-m-bg-brand pt-14 pb-3 px-4 flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <TouchableOpacity onPress={() => setDrawerVisible(true)}>
          <Menu size={20} color={colors.textOnBrand} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-m-text-on-brand tracking-tight">
          RockCap
        </Text>
      </View>
      <View className="flex-row items-center gap-4">
        <TouchableOpacity
          onPress={() => router.push('/inbox')}
          className="relative"
        >
          <Bell size={20} color={colors.textOnBrand} />
          {totalBadge > 0 && (
            <View className="absolute -top-1.5 -right-1.5">
              <Badge count={totalBadge} variant="error" />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => signOut()}
          className="w-7 h-7 rounded-full bg-white/20 items-center justify-center"
        >
          <User size={14} color={colors.textOnBrand} />
        </TouchableOpacity>
      </View>

      <MobileNavDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      />
    </View>
  );
}
