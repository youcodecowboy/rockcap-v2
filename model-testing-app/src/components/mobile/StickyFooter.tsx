'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building, File, CheckSquare, MessageCircle } from 'lucide-react';
import { useMessenger } from '@/contexts/MessengerContext';

const navItems = [
  { href: '/m-dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Docs', icon: File },
  { href: '/m-tasks', label: 'Tasks', icon: CheckSquare },
];

export default function StickyFooter() {
  const pathname = usePathname();
  const { setChatOpen } = useMessenger();

  const isActive = (href: string) => {
    if (href === '/m-dashboard') return pathname === '/m-dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[var(--m-bg)] border-t border-[var(--m-border)] z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[var(--m-footer-h)] px-2">
        {navItems.slice(0, 2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon className={`w-[18px] h-[18px] ${active ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`} />
              <span className={`text-[9px] tracking-wide uppercase ${active ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-tertiary)]'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Chat FAB — dark, authoritative, compact */}
        <button
          onClick={() => setChatOpen(true)}
          className="flex items-center justify-center w-11 h-11 -mt-4 bg-[var(--m-accent)] rounded-full shadow-md"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-[18px] h-[18px] text-white" />
        </button>

        {navItems.slice(2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[44px]"
            >
              <Icon className={`w-[18px] h-[18px] ${active ? 'text-[var(--m-text-primary)]' : 'text-[var(--m-text-tertiary)]'}`} />
              <span className={`text-[9px] tracking-wide uppercase ${active ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-tertiary)]'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
