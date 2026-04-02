'use client';

import { useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import MobileNavDrawer from './MobileNavDrawer';

export default function MobileHeader() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-14 bg-zinc-950 border-b border-zinc-800 z-40 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 -ml-1.5 text-white"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold text-white">RockCap</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-500"
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
