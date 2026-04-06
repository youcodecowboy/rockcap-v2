'use client';

import { useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import MobileNavDrawer from './MobileNavDrawer';

export default function MobileHeader() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-[var(--m-header-h)] bg-[var(--m-bg)] border-b border-[var(--m-border)] z-40 flex items-center justify-between px-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 -ml-1 text-[var(--m-text-secondary)] active:text-[var(--m-text-primary)]"
            aria-label="Open navigation menu"
          >
            <Menu className="w-[18px] h-[18px]" />
          </button>
          <span
            className="text-[1.125rem] font-normal tracking-[-0.01em] text-[var(--m-text-primary)]"
            style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
          >
            RockCap
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            className="p-1.5 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]"
            aria-label="Search"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
          <div className="w-6 h-6">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <MobileNavDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}
