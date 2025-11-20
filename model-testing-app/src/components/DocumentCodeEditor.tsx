'use client';

import { useState } from 'react';
import { Edit2, Check, X, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateDocumentCode } from '@/lib/documentCodeUtils';

interface DocumentCodeEditorProps {
  documentCode: string | undefined;
  fileName: string;
  onSave: (newCode: string) => Promise<void>;
  isInternal?: boolean;
  className?: string;
}

export default function DocumentCodeEditor({
  documentCode,
  fileName,
  onSave,
  isInternal = false,
  className = '',
}: DocumentCodeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(documentCode || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartEdit = () => {
    setEditedCode(documentCode || '');
    setIsEditing(true);
    setError(null);
  };

  const handleCancel = () => {
    setEditedCode(documentCode || '');
    setIsEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    const trimmedCode = editedCode.trim();
    
    // Validate code format
    if (!trimmedCode) {
      setError('Document code cannot be empty');
      return;
    }

    if (!validateDocumentCode(trimmedCode)) {
      setError('Invalid document code format');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(trimmedCode);
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to update document code');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1">
          <input
            type="text"
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-1.5 text-sm font-mono border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={isInternal ? 'ROCK-INT-TOPIC-DDMMYY' : 'CLIENT-TYPE-PROJECT-DDMMYY'}
            autoFocus
            disabled={isSaving}
          />
          {error && (
            <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
              <AlertCircle className="w-3 h-3" />
              <span>{error}</span>
            </div>
          )}
          <div className="mt-1 text-xs text-gray-500">
            Original filename: <span className="font-mono">{fileName}</span>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || editedCode.trim() === documentCode}
          className="flex-shrink-0"
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={isSaving}
          className="flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-gray-900 truncate">
            {documentCode || <span className="text-gray-400 italic">No code assigned</span>}
          </span>
          <button
            onClick={handleStartEdit}
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
            title="Edit document code"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
        <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
          <FileText className="w-3 h-3" />
          <span className="truncate" title={fileName}>{fileName}</span>
        </div>
      </div>
    </div>
  );
}

