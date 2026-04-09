'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Search, Bell } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { useQuery } from 'convex/react';
import { useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import MobileNavDrawer from './MobileNavDrawer';

export default function MobileHeader() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();

  // Use Convex auth state (not Clerk's isSignedIn) — isAuthenticated only
  // becomes true after the JWT has been passed to the Convex client,
  // preventing "Unauthenticated" errors during the auth handoff window.
  const unreadNotifications = useQuery(api.notifications.getUnreadCount, isAuthenticated ? {} : 'skip');
  const openFlags = useQuery(api.flags.getMyFlags, isAuthenticated ? { status: 'open' as const } : 'skip');
  const unreadMessages = useQuery(api.conversations.getUnreadCount, isAuthenticated ? {} : 'skip');

  const totalUnread =
    (unreadNotifications ?? 0) + (openFlags?.length ?? 0) + (unreadMessages ?? 0);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-[var(--m-header-h)] bg-[var(--m-bg)] border-b border-[var(--m-border)] z-40 flex items-center justify-between px-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 -ml-1 text-[var(--m-text-secondary)] active:text-[var(--m-text-primary)]"
            aria-label="Open navigation menu"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <span
            className="text-[1.125rem] font-normal tracking-[-0.01em] text-[var(--m-text-primary)]"
            style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
          >
            RockCap
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={() => router.push('/m-inbox')}
            className="relative p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
            aria-label="Inbox"
          >
            <Bell className="w-[18px] h-[18px]" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-[var(--m-error)] text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-1 leading-none">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
          <div className="w-6 h-6">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
