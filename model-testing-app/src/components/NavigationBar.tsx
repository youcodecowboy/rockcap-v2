'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { Search } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import CommandPalette from './CommandPalette';
import { ThemeToggle } from './ThemeToggle';
import { useColors } from '@/lib/useColors';
import { useGlobalSearch } from '@/contexts/GlobalSearchContext';

export default function NavigationBar() {
  // Only render UserButton on client to avoid hydration mismatch
  const [isMounted, setIsMounted] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const colors = useColors();
  const { setIsOpen } = useGlobalSearch();

  useEffect(() => {
    setIsMac(!/windows|linux/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 h-16 shadow-sm z-30"
      style={{
        background: colors.bg.card,
        borderBottom: `1px solid ${colors.border.default}`,
      }}
    >
      <div className="h-full flex items-center justify-between px-6">
        {/* Logo */}
        <Link
          href="/"
          className="text-[1.5625rem] font-normal"
          style={{
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            color: colors.text.primary,
          }}
        >
          RockCap
        </Link>

        {/* Right side icons */}
        <div className="flex items-center space-x-4">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Global Search / Command Palette */}
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 rounded-full border px-4 py-2 transition-colors"
            style={{
              background: colors.bg.card,
              borderColor: colors.border.default,
              color: colors.text.secondary,
            }}
            aria-label="Global Search"
          >
            <Search className="h-4 w-4" />
            <span className="text-sm font-normal">Search</span>
            <kbd
              className="rounded border px-1.5 py-0.5 text-[10px] font-medium"
              style={{ borderColor: colors.border.default, color: colors.text.secondary }}
            >
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <CommandPalette />

          {/* Notification Dropdown */}
          <NotificationDropdown />

          {/* Clerk User Button - only render after mount to avoid hydration mismatch */}
          <div className="w-8 h-8 flex items-center justify-center">
            {isMounted ? (
              <UserButton afterSignOutUrl="/" />
            ) : (
              <div
                className="w-7 h-7 rounded-full animate-pulse"
                style={{ background: colors.bg.cardAlt }}
              />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
