'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import NotificationDropdown from './NotificationDropdown';
import GlobalSearch from './GlobalSearch';

export default function NavigationBar() {
  // Only render UserButton on client to avoid hydration mismatch
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 shadow-sm z-30">
      <div className="h-full flex items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="text-[1.5625rem] font-normal text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
          RockCap
        </Link>

        {/* Right side icons */}
        <div className="flex items-center space-x-4">
          {/* Global Search */}
          <GlobalSearch />
          
          {/* Notification Dropdown */}
          <NotificationDropdown />
          
          {/* Clerk User Button - only render after mount to avoid hydration mismatch */}
          <div className="w-8 h-8 flex items-center justify-center">
            {isMounted ? (
              <UserButton afterSignOutUrl="/" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gray-200 animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

