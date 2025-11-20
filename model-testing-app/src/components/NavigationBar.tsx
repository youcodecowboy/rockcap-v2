'use client';

import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
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
          
          {/* Clerk User Button */}
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  );
}

