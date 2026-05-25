'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Archive,
  Building,
  UserSearch,
  File,
  FileText,
  Settings,
  ContactRound,
  Calculator,
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Mail,
  Activity,
  LucideIcon,
} from 'lucide-react';
import { useChatDrawer } from '@/contexts/ChatDrawerContext';
import { useGlobalSearch } from '@/contexts/GlobalSearchContext';
import { useColors } from '@/lib/useColors';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);
  const { isOpen: isChatOpen } = useChatDrawer();
  const { isOpen: isGlobalSearchOpen } = useGlobalSearch();
  const { isAuthenticated } = useConvexAuth();
  const openFlags = useQuery(api.flags.getMyFlags, isAuthenticated ? { status: "open" } : "skip");
  const unreadCount = openFlags?.length ?? 0;
  const colors = useColors();

  // Sidebar uses inverted (dark) surface regardless of app theme mode so
  // the chrome reads as a distinct zone. We pull text/border from the dark
  // palette-equivalent tokens but override the background to always be
  // near-black for visual separation.
  const sidebarBg = "#0a0a0a";
  const sidebarActiveBg = "#1a1a1a";
  const sidebarBorderColor = "#2a2a2a";
  const sidebarTextColor = "#e5e5e5";
  const sidebarIconColor = "#e5e5e5";

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const navItems: NavItem[] = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/tasks', label: 'Tasks', icon: CheckSquare },
    { href: '/calendar', label: 'Calendar', icon: Calendar },
    { href: '/inbox', label: 'Inbox', icon: Mail },
    { href: '/activity', label: 'Activity', icon: Activity },
    { href: '/filing', label: 'Upload & File', icon: Archive },
    { href: '/clients', label: 'Clients', icon: Building },
    { href: '/prospects', label: 'Prospects', icon: UserSearch },
    { href: '/rolodex', label: 'Rolodex', icon: ContactRound },
    { href: '/docs', label: 'Docs', icon: File },
    { href: '/notes', label: 'Notes', icon: FileText },
    { href: '/modeling', label: 'Modeling', icon: Calculator },
  ];

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] transition-all duration-300 ease-in-out z-50 ${
        isHovered ? 'w-64' : 'w-20'
      } ${isChatOpen || isGlobalSearchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ zIndex: 50, background: sidebarBg, color: sidebarTextColor }}
    >
      <div className="flex flex-col h-full">
        {/* Navigation Items */}
        <nav className="flex-1 py-2 px-3 space-y-1.5 overflow-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`flex items-center justify-center w-12 h-10 rounded-md transition-colors ${
                  isHovered ? 'justify-start px-3 w-auto' : ''
                }`}
                style={{
                  background: active ? sidebarActiveBg : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = sidebarActiveBg;
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <span className="relative">
                  <Icon
                    className="h-4 w-4 flex-shrink-0 stroke-[1.5]"
                    style={{ color: sidebarIconColor }}
                  />
                  {item.href === '/inbox' && unreadCount > 0 && !isHovered && (
                    <span
                      className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full text-[10px] font-bold leading-none"
                      style={{ background: colors.accent.orange, color: '#ffffff' }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </span>
                {isHovered && (
                  <span
                    className="text-sm font-normal whitespace-nowrap ml-3 flex items-center gap-2"
                    style={{ color: sidebarTextColor }}
                  >
                    {item.label}
                    {item.href === '/inbox' && unreadCount > 0 && (
                      <span
                        className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none"
                        style={{ background: colors.accent.orange, color: '#ffffff' }}
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Settings Section */}
        <div
          className="py-2 px-3"
          style={{ borderTop: `1px solid ${sidebarBorderColor}` }}
        >
          <Link
            href="/settings"
            prefetch={false}
            className={`flex items-center justify-center w-12 h-10 rounded-md transition-colors ${
              isHovered ? 'justify-start px-3 w-auto' : ''
            }`}
            style={{
              background: isActive('/settings') ? sidebarActiveBg : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!isActive('/settings')) (e.currentTarget as HTMLElement).style.background = sidebarActiveBg;
            }}
            onMouseLeave={(e) => {
              if (!isActive('/settings')) (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <Settings
              className="h-4 w-4 flex-shrink-0 stroke-[1.5]"
              style={{ color: sidebarIconColor }}
            />
            {isHovered && (
              <span
                className="text-sm font-normal whitespace-nowrap ml-3"
                style={{ color: sidebarTextColor }}
              >
                Settings VERSION 2.1
              </span>
            )}
          </Link>
        </div>
      </div>
    </aside>
  );
}
