'use client';

import { useConvexAuth } from 'convex/react';
import { Loader2 } from 'lucide-react';
import MobileHeader from './MobileHeader';
import TabManager from './TabManager';
import StickyFooter from './StickyFooter';
import ChatOverlay from './ChatOverlay';
import { useMobileLayout } from '@/contexts/MobileLayoutContext';

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const { hideFooter } = useMobileLayout();
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--m-bg)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--m-text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text-primary)]">
      <MobileHeader />
      <div style={{ paddingTop: 'var(--m-header-h)' }}>
        <TabManager />
        <main style={{
          paddingBottom: hideFooter
            ? 'env(safe-area-inset-bottom, 0px)'
            : 'calc(var(--m-footer-h) + env(safe-area-inset-bottom) + 0.5rem)',
        }}>
          {children}
        </main>
      </div>
      {!hideFooter && <StickyFooter />}
      <ChatOverlay />
    </div>
  );
}
