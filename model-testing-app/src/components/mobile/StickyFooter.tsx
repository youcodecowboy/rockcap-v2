'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building, File, Mail, MessageCircle } from 'lucide-react';
import { useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useMessenger } from '@/contexts/MessengerContext';

const navItems = [
  { href: '/m-dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Docs', icon: File },
  { href: '/m-inbox', label: 'Inbox', icon: Mail },
];

export default function StickyFooter() {
  const pathname = usePathname();
  const { setChatOpen } = useMessenger();
  const { isAuthenticated } = useConvexAuth();

  const unreadNotifications = useQuery(api.notifications.getUnreadCount, isAuthenticated ? {} : 'skip');
  const openFlags = useQuery(api.flags.getMyFlags, isAuthenticated ? { status: 'open' as const } : 'skip');
  const unreadMessages = useQuery(api.conversations.getUnreadCount, isAuthenticated ? {} : 'skip');

  const inboxBadge = (unreadNotifications ?? 0) + (openFlags?.length ?? 0) + (unreadMessages ?? 0);

  const isActive = (href: string) => {
    if (href === '/m-dashboard') return pathname === '/m-dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--m-bg-brand)] z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[var(--m-footer-h)] px-2">
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon
                className={`w-[18px] h-[18px] ${
                  active ? 'text-[var(--m-text-on-brand)]' : 'text-[var(--m-text-on-brand-muted)]'
                }`}
              />
              <span
                className={`text-[9px] tracking-wide uppercase ${
                  active
                    ? 'text-[var(--m-text-on-brand)] font-semibold'
                    : 'text-[var(--m-text-on-brand-muted)]'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={() => setChatOpen(true)}
          className="relative flex items-center justify-center w-11 h-11 -mt-4 bg-[var(--m-text-on-brand)] rounded-full shadow-lg"
          aria-label="Open chat"
        >
          <MessageCircle className="w-[18px] h-[18px] text-[var(--m-bg-brand)]" />
          {(unreadMessages ?? 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[var(--m-error)] text-white text-[8px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-0.5 leading-none border-2 border-[var(--m-bg-brand)]">
              {(unreadMessages ?? 0) > 9 ? '9+' : unreadMessages}
            </span>
          )}
        </button>

        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const showBadge = item.href === '/m-inbox' && inboxBadge > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon
                className={`w-[18px] h-[18px] ${
                  active ? 'text-[var(--m-text-on-brand)]' : 'text-[var(--m-text-on-brand-muted)]'
                }`}
              />
              {showBadge && (
                <span className="absolute -top-1 right-1 bg-[var(--m-error)] text-white text-[8px] font-bold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 leading-none border-2 border-[var(--m-bg-brand)]">
                  {inboxBadge > 9 ? '9+' : inboxBadge}
                </span>
              )}
              <span
                className={`text-[9px] tracking-wide uppercase ${
                  active
                    ? 'text-[var(--m-text-on-brand)] font-semibold'
                    : 'text-[var(--m-text-on-brand-muted)]'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
