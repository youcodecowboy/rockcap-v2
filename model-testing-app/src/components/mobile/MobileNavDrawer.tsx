'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  LayoutDashboard,
  Building,
  File,
  CheckSquare,
  FileText,
  ContactRound,
} from 'lucide-react';

interface MobileNavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { href: '/m-dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/m-clients', label: 'Clients', icon: Building },
  { href: '/m-docs', label: 'Documents', icon: File },
  { href: '/m-tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/m-notes', label: 'Notes', icon: FileText },
  { href: '/m-contacts', label: 'Contacts', icon: ContactRound },
];

export default function MobileNavDrawer({ isOpen, onClose }: MobileNavDrawerProps) {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);

  // Close drawer only when pathname actually changes (not on mount)
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
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <nav className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <span className="text-xl font-normal text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>RockCap</span>
          <button onClick={onClose} className="p-1 text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/m-dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
