'use client';

import { useState, useRef, useEffect } from 'react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Smile } from 'lucide-react';

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void;
  currentEmoji?: string;
}

export default function EmojiPickerButton({ onEmojiSelect, currentEmoji }: EmojiPickerButtonProps) {
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
        className="p-2 rounded-md hover:bg-gray-100 transition-colors flex items-center justify-center w-8 h-8"
        title="Add emoji"
      >
        {currentEmoji ? (
          <span className="text-xl">{currentEmoji}</span>
        ) : (
          <Smile className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 shadow-lg rounded-lg overflow-hidden">
          <EmojiPicker
            onEmojiClick={handleEmojiClick}
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

