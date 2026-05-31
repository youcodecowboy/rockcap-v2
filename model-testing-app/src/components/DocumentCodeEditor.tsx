'use client';

import { useState } from 'react';
import { Edit2, Check, X, FileText, AlertCircle } from 'lucide-react';
import { Button, IconButton, Input } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { validateDocumentCode } from '@/lib/documentCodeUtils';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
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
      <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input
            type="text"
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ fontFamily: MONO }}
            placeholder={isInternal ? 'ROCK-INT-TOPIC-DDMMYY' : 'CLIENT-TYPE-PROJECT-DDMMYY'}
            autoFocus
            disabled={isSaving}
          />
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: colors.accent.red }}>
              <AlertCircle style={{ width: 12, height: 12 }} />
              <span>{error}</span>
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 11, color: colors.text.muted }}>
            Original filename: <span style={{ fontFamily: MONO }}>{fileName}</span>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || editedCode.trim() === documentCode}
          style={{ flexShrink: 0 }}
        >
          <Check style={{ width: 16, height: 16 }} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCancel}
          disabled={isSaving}
          style={{ flexShrink: 0 }}
        >
          <X style={{ width: 16, height: 16 }} />
        </Button>
      </div>
    );
  }

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0, maxWidth: 300 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{ fontSize: 13, fontFamily: MONO, color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
            title={documentCode || 'No code assigned'}
          >
            {documentCode || <span style={{ color: colors.text.dim, fontStyle: 'italic' }}>No code assigned</span>}
          </span>
          <IconButton label="Edit document code" onClick={handleStartEdit} style={{ flexShrink: 0, width: 24, height: 24 }}>
            <Edit2 style={{ width: 12, height: 12 }} />
          </IconButton>
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: colors.text.muted, display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <FileText style={{ width: 12, height: 12, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={fileName}>{fileName}</span>
        </div>
      </div>
    </div>
  );
}
