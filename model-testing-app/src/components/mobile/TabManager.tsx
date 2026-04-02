'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTabs } from '@/contexts/TabContext';

export default function TabManager() {
  const { tabs, activeTabId, switchTab, closeTab } = useTabs();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -150 : 150,
      behavior: 'smooth',
    });
  };

  if (tabs.length <= 1) return null;

  return (
    <div className="flex items-center bg-gray-50 border-b border-gray-200 px-2 h-10">
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-hide py-1.5"
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => switchTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs whitespace-nowrap flex-shrink-0 transition-colors ${
              tab.id === activeTabId
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-white text-gray-500 border border-gray-200 hover:text-gray-700'
            }`}
          >
            <span className="max-w-[120px] truncate">{tab.title}</span>
            {tabs.length > 1 && tab.id !== 'dashboard' && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-0.5 p-0.5 rounded hover:bg-black/10"
              >
                <X className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>

      {tabs.length > 3 && (
        <div className="flex gap-1 pl-2 flex-shrink-0">
          <button
            onClick={() => scrollBy('left')}
            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded-md text-gray-400 hover:text-gray-700"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => scrollBy('right')}
            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded-md text-gray-400 hover:text-gray-700"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
