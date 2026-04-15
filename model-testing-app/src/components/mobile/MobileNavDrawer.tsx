'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  LayoutDashboard,
  Building,
  File,
  Upload,
  CheckSquare,
  FileText,
  ContactRound,
  Mail,
  Settings,
  Sparkles,
} from 'lucide-react';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/m-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Documents', icon: File },
  { href: '/m-upload', label: 'Upload', icon: Upload },
  { href: '/m-inbox', label: 'Inbox', icon: Mail },
  { href: '/m-brief', label: 'Daily Brief', icon: Sparkles },
  { href: '/m-tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/m-notes', label: 'Notes', icon: FileText },
  { href: '/m-contacts', label: 'Contacts', icon: ContactRound },
  { href: '/m-settings', label: 'Settings', icon: Settings },
];

export default function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (prevPathname.current !== pathname) {
      prevPathname.current = pathname;
      onClose();
    }
  }, [pathname, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <nav className="absolute left-0 top-0 bottom-0 w-[280px] bg-[var(--m-bg)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-[var(--m-header-h)] border-b border-[var(--m-border)]">
          <span
            className="text-[1.125rem] font-normal tracking-[-0.01em] text-[var(--m-text-primary)]"
            style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
          >
            RockCap
          </span>
          <button onClick={onClose} className="p-1 text-[var(--m-text-tertiary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 py-3 px-3 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/m-dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] transition-colors ${
                  active
                    ? 'text-[var(--m-text-primary)] font-medium bg-[var(--m-bg-subtle)]'
                    : 'text-[var(--m-text-secondary)] active:bg-[var(--m-bg-subtle)]'
                }`}
              >
                <Icon className="w-[16px] h-[16px] flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
