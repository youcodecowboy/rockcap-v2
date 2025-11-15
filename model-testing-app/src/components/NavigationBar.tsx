'use client';

import Link from 'next/link';
import { User } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import GlobalSearch from './GlobalSearch';

export default function NavigationBar() {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 shadow-sm z-30">
      <div className="h-full flex items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-gray-900">
          RockCap
        </Link>

        {/* Right side icons */}
        <div className="flex items-center space-x-4">
          {/* Global Search */}
          <GlobalSearch />
          
          {/* Notification Dropdown */}
          <NotificationDropdown />
          
          {/* Profile Icon */}
          <button
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Profile"
          >
            <User className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

