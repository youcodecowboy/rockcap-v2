'use client';

import { useState, KeyboardEvent, useRef } from 'react';
import { Send, Loader2, Paperclip } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string, fileMetadata?: { fileName: string; fileStorageId: string; fileSize: number; fileType: string }) => void;
  disabled?: boolean;
  placeholder?: string;
  onFileSelect?: (file: File) => Promise<{ storageId: string }>;
}

export default function ChatInput({ 
  onSend, 
  disabled = false, 
  placeholder = 'Type your message...',
  onFileSelect,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onFileSelect) return;

    setIsUploading(true);
    try {
      const result = await onFileSelect(file);
      // Send message with file metadata
      onSend(`I've uploaded ${file.name}. Please analyze and file it according to my instructions.`, {
        fileName: file.name,
        fileStorageId: result.storageId,
        fileSize: file.size,
        fileType: file.type,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      <div className="flex gap-2 items-end">
        {onFileSelect && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={disabled || isUploading}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="flex-shrink-0 w-11 h-11 border border-gray-300 rounded-lg flex items-center justify-center hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              aria-label="Upload file"
              title="Upload file"
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              ) : (
                <Paperclip className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </>
        )}
        
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isUploading}
          rows={1}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
          style={{
            minHeight: '44px',
            maxHeight: '120px',
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 120) + 'px';
          }}
        />
        
        <button
          onClick={handleSend}
          disabled={disabled || isUploading || !message.trim()}
          className="flex-shrink-0 w-11 h-11 bg-black text-white rounded-lg flex items-center justify-center hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          {disabled || isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
      
      <div className="text-xs text-gray-400 mt-2">
        Press Enter to send, Shift + Enter for new line
      </div>
    </div>
  );
}

