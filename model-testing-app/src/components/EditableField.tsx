'use client';

import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { Button, IconButton, Input, Textarea } from '@/components/layouts';
import { useColors } from '@/lib/useColors';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  onSave?: () => void;
  onCancel?: () => void;
}

export default function EditableField({
  value,
  onChange,
  label,
  multiline = false,
  placeholder,
  className = '',
  onSave,
  onCancel,
}: EditableFieldProps) {
  const colors = useColors();
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(value);

  const handleStartEdit = () => {
    setEditedValue(value);
    setIsEditing(true);
  };

  const handleSave = () => {
    onChange(editedValue);
    setIsEditing(false);
    if (onSave) {
      onSave();
    }
  };

  const handleCancel = () => {
    setEditedValue(value);
    setIsEditing(false);
    if (onCancel) {
      onCancel();
    }
  };

  const labelStyle = {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: colors.text.muted,
    fontWeight: 500,
  };

  if (isEditing) {
    return (
      <div className={`space-y-2 ${className}`}>
        {label && <label style={{ ...labelStyle, display: 'block' }}>{label}</label>}
        <div className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              className="flex-1"
              style={{ minHeight: 100 }}
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleCancel();
                }
              }}
              autoFocus
            />
          ) : (
            <Input
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              className="flex-1"
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSave();
                } else if (e.key === 'Escape') {
                  handleCancel();
                }
              }}
              autoFocus
            />
          )}
          <IconButton label="Save" onClick={handleSave} style={{ flexShrink: 0 }}>
            <Check size={14} />
          </IconButton>
          <IconButton label="Cancel" onClick={handleCancel} style={{ flexShrink: 0 }}>
            <X size={14} />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label style={labelStyle}>{label}</label>
          <IconButton label="Edit" onClick={handleStartEdit}>
            <Edit2 size={12} />
          </IconButton>
        </div>
      )}
      <div
        className="whitespace-pre-wrap relative"
        style={{ fontSize: 13, color: colors.text.primary }}
      >
        {value || (
          <span style={{ color: colors.text.dim, fontStyle: 'italic' }}>
            {placeholder || 'No content'}
          </span>
        )}
        {!label && (
          <span className="absolute top-0 right-0">
            <IconButton label="Edit" onClick={handleStartEdit}>
              <Edit2 size={12} />
            </IconButton>
          </span>
        )}
      </div>
    </div>
  );
}
