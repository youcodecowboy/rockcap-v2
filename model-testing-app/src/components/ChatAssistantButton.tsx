'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, X } from 'lucide-react';
import ChatAssistantDrawer from './ChatAssistantDrawer';

export default function ChatAssistantButton() {
  const [isOpen, setIsOpen] = useState(false);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
      // ESC to close
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-black text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 ${
          isOpen ? 'bg-gray-800' : 'bg-black'
        }`}
        aria-label="Open AI Assistant"
        title="Open AI Assistant (⌘K)"
      >
        {isOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <MessageSquare className="w-6 h-6" />
        )}
      </button>

      {/* Drawer */}
      <ChatAssistantDrawer isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

