'use client';

import { useState, KeyboardEvent, useRef } from 'react';
import { Send, Loader2, Paperclip, X, FileText } from 'lucide-react';

interface FileMetadata {
  fileName: string;
  fileStorageId: string;
  fileSize: number;
  fileType: string;
}

interface ChatInputProps {
  onSend: (message: string, fileMetadata?: FileMetadata) => void;
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
  const [pendingFile, setPendingFile] = useState<FileMetadata | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((message.trim() || pendingFile) && !disabled) {
      const text = message.trim() || (pendingFile ? `Please analyze and file ${pendingFile.fileName}.` : '');
      onSend(text, pendingFile || undefined);
      setMessage('');
      setPendingFile(null);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onFileSelect) return;

    setIsUploading(true);
    try {
      const result = await onFileSelect(file);
      // Stage the file — let user type their message before sending
      setPendingFile({
        fileName: file.name,
        fileStorageId: result.storageId,
        fileSize: file.size,
        fileType: file.type,
      });
      // Pre-populate a suggestion (user can edit or clear)
      if (!message.trim()) {
        setMessage(`Please analyze and file ${file.name}.`);
      }
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
      {/* Pending File Attachment */}
      {pendingFile && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-blue-50 border border-blue-200 rounded-lg">
          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm text-blue-900 truncate block">{pendingFile.fileName}</span>
            <span className="text-xs text-blue-600">{(pendingFile.fileSize / 1024).toFixed(1)} KB</span>
          </div>
          <button
            onClick={() => setPendingFile(null)}
            className="p-1 hover:bg-blue-100 rounded transition-colors"
            aria-label="Remove file"
          >
            <X className="w-4 h-4 text-blue-600" />
          </button>
        </div>
      )}

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
          placeholder={pendingFile ? 'Add instructions for this file...' : placeholder}
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
          disabled={disabled || isUploading || (!message.trim() && !pendingFile)}
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
