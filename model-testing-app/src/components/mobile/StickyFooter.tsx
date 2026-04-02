'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Building, File, CheckSquare, MessageCircle } from 'lucide-react';

interface StickyFooterProps {
  onChatOpen: () => void;
}

const navItems = [
  { href: '/', label: 'Home', icon: LayoutDashboard },
  { href: '/clients', label: 'Clients', icon: Building },
  { href: '/docs', label: 'Docs', icon: File },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
];

export default function StickyFooter({ onChatOpen }: StickyFooterProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 px-4">
        {navItems.slice(0, 2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[48px]"
            >
              <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-[10px] ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={onChatOpen}
          className="flex items-center justify-center w-14 h-14 -mt-5 bg-blue-600 rounded-full shadow-lg shadow-blue-600/30"
          aria-label="Open chat assistant"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>

        {navItems.slice(2).map(item => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 min-w-[48px]"
            >
              <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className={`text-[10px] ${active ? 'text-blue-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
