'use client';

import { useState } from 'react';
import MobileHeader from './MobileHeader';
import TabManager from './TabManager';
import StickyFooter from './StickyFooter';
import ChatOverlay from './ChatOverlay';

export default function MobileShell({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <MobileHeader />
      <div className="pt-14">
        <TabManager />
        <main className="pb-20">
          {children}
        </main>
      </div>
      <StickyFooter onChatOpen={() => setIsChatOpen(true)} />
      <ChatOverlay isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
}
