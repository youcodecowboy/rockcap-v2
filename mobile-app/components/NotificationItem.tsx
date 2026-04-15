import { View, Text, TouchableOpacity } from 'react-native';
import { useMutation } from 'convex/react';
import { api } from '../../model-testing-app/convex/_generated/api';
import { Bell } from 'lucide-react-native';
import { colors } from '@/lib/theme';

interface NotificationItemProps {
  notification: {
    _id: string;
    message?: string;
    type: string;
    isRead?: boolean;
    _creationTime: number;
  };
}

export default function NotificationItem({ notification }: NotificationItemProps) {
  const markAsRead = useMutation(api.notifications.markAsRead);

  return (
    <TouchableOpacity
      onPress={() => !notification.isRead && markAsRead({ id: notification._id } as any)}
      className={`bg-m-bg-card border rounded-xl px-4 py-3 flex-row items-start gap-3 ${
        notification.isRead ? 'border-m-border-subtle' : 'border-m-border'
      }`}
    >
      <Bell size={16} color={notification.isRead ? colors.textTertiary : colors.textPrimary} />
      <View className="flex-1">
        <Text
          className={`text-sm ${notification.isRead ? 'text-m-text-tertiary' : 'text-m-text-primary'}`}
          numberOfLines={2}
        >
          {notification.message || notification.type}
        </Text>
        <Text className="text-xs text-m-text-tertiary mt-1">
          {new Date(notification._creationTime).toLocaleDateString('en-GB')}
        </Text>
      </View>
      {!notification.isRead && <View className="w-2 h-2 rounded-full bg-m-accent mt-1" />}
    </TouchableOpacity>
  );
}
