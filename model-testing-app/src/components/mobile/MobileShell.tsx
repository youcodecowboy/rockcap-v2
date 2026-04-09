'use client';

import MobileHeader from './MobileHeader';
import TabManager from './TabManager';
import StickyFooter from './StickyFooter';
import ChatOverlay from './ChatOverlay';

export default function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text-primary)]">
      <MobileHeader />
      <div style={{ paddingTop: 'var(--m-header-h)' }}>
        <TabManager />
        <main style={{ paddingBottom: 'calc(var(--m-footer-h) + env(safe-area-inset-bottom) + 0.5rem)' }}>
          {children}
        </main>
      </div>
      <StickyFooter />
      <ChatOverlay />
    </div>
  );
}
