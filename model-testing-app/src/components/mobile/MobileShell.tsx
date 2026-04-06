'use client';

import { useState } from 'react';
import MobileHeader from './MobileHeader';
import TabManager from './TabManager';
import StickyFooter from './StickyFooter';
import ChatOverlay from './ChatOverlay';

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--m-bg)] text-[var(--m-text-primary)]">
      <MobileHeader />
      <div style={{ paddingTop: 'var(--m-header-h)' }}>
        <TabManager />
        <main style={{ paddingBottom: 'calc(var(--m-footer-h) + env(safe-area-inset-bottom) + 0.5rem)' }}>
          {children}
        </main>
      </div>
      <StickyFooter onChatOpen={() => setIsChatOpen(true)} />
      <ChatOverlay isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
