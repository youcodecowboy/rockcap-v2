'use client';

import { useState, useRef, useEffect } from 'react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import { Smile } from 'lucide-react';
import { useColors } from '@/lib/useColors';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  currentEmoji?: string;
}

export default function EmojiPickerButton({ onEmojiSelect, currentEmoji }: EmojiPickerButtonProps) {
  const colors = useColors();
  // Derive picker theme from the palette (dark card bg => dark theme); avoids a second hook.
  const pickerTheme = colors.bg.card === '#ffffff' ? Theme.LIGHT : Theme.DARK;
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onEmojiSelect(emojiData.emoji);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center"
        style={{ width: 32, height: 32, padding: 8, borderRadius: 4, color: colors.text.muted, cursor: 'pointer' }}
        title="Add emoji"
      >
        {currentEmoji ? (
          <span className="text-xl">{currentEmoji}</span>
        ) : (
          <Smile className="w-4 h-4" />
        )}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 shadow-lg rounded-lg overflow-hidden">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
            theme={pickerTheme}
            width={350}
            height={400}
            previewConfig={{ showPreview: false }}
            skinTonesDisabled
          />
        </div>
      )}
    </div>
  );
}

