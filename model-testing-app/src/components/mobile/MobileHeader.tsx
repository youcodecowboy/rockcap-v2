'use client';

import { useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import MobileNavDrawer from './MobileNavDrawer';

export default function MobileHeader() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 shadow-sm z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 -ml-1.5 text-gray-700"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-xl font-normal text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>RockCap</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5 text-sm text-gray-400"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search...</span>
          </button>
          <div className="w-7 h-7">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
