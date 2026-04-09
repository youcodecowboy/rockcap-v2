'use client';

import MobileHeader from './MobileHeader';
import TabManager from './TabManager';
import StickyFooter from './StickyFooter';
import ChatOverlay from './ChatOverlay';
import { useMobileLayout } from '@/contexts/MobileLayoutContext';

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const { hideFooter } = useMobileLayout();

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
