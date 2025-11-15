'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive,
  Building,
  FolderKanban,
  UserSearch,
  File,
  FileText,
  Database,
  Settings,
  ContactRound,
  LucideIcon,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isHovered, setIsHovered] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const navItems: NavItem[] = [
    { href: '/', label: 'Filing Agent', icon: Archive },
    { href: '/clients', label: 'Clients', icon: Building },
    { href: '/projects', label: 'Projects', icon: FolderKanban },
    { href: '/prospects', label: 'Prospects', icon: UserSearch },
    { href: '/rolodex', label: 'Rolodex', icon: ContactRound },
    { href: '/docs', label: 'Docs', icon: File },
    { href: '/notes', label: 'Notes', icon: FileText },
    { href: '/knowledge-bank', label: 'Knowledge Bank', icon: Database },
  ];

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-4rem)] bg-black text-white transition-all duration-300 ease-in-out z-40 ${
        isHovered ? 'w-64' : 'w-20'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col h-full">
        {/* Navigation Items */}
        <nav className="flex-1 py-4 px-3 space-y-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center w-12 h-12 rounded-md transition-colors ${
                  active
                    ? 'bg-gray-900'
                    : 'hover:bg-gray-900'
                } ${isHovered ? 'justify-start px-3 w-auto' : ''}`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 stroke-[1.5] ${
                  active ? 'text-white' : 'text-white'
                }`} />
                {isHovered && (
                  <span className={`text-sm font-normal whitespace-nowrap ml-3 ${
                    active ? 'text-white' : 'text-white'
                  }`}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        
        {/* Bottom Settings Section */}
        <div className="border-t border-gray-800 py-4 px-3">
          <Link
            href="/settings"
            className={`flex items-center justify-center w-12 h-12 rounded-md transition-colors ${
              isActive('/settings')
                ? 'bg-gray-900'
                : 'hover:bg-gray-900'
            } ${isHovered ? 'justify-start px-3 w-auto' : ''}`}
          >
            <Settings className={`h-4 w-4 flex-shrink-0 stroke-[1.5] text-white`} />
            {isHovered && (
              <span className="text-sm font-normal whitespace-nowrap ml-3 text-white">
                Settings
              </span>
            )}
          </Link>
        </div>
      </div>
    </aside>
  );
}

