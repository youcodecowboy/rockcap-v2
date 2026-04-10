'use client';

import { useState } from 'react';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import InboxTabs, { type MobileInboxTab } from './components/InboxTabs';
import ConversationLibrary from '@/components/chat/ConversationLibrary';
import MobileFlagList from './components/MobileFlagList';
import MobileNotificationList from './components/MobileNotificationList';

export default function MobileInboxPage() {
  const [activeTab, setActiveTab] = useState<MobileInboxTab>('messages');

  const { isAuthenticated } = useConvexAuth();
  const openFlags = useQuery(api.flags.getMyFlags, isAuthenticated ? { status: 'open' } : 'skip');
  const unreadNotifications = useQuery(api.notifications.getUnreadCount, isAuthenticated ? {} : 'skip');
  const unreadMessages = useQuery(api.conversations.getUnreadCount, isAuthenticated ? {} : 'skip');

  const counts = {
    messages: unreadMessages ?? 0,
    flags: openFlags?.length ?? 0,
    notifications: unreadNotifications ?? 0,
  };

  return (
    <div className="flex flex-col h-full">
      <InboxTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts} />
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'messages' && <ConversationLibrary variant="mobile" />}
        {activeTab === 'flags' && <MobileFlagList />}
        {activeTab === 'notifications' && <MobileNotificationList />}
      </div>
    </div>
  );
}
