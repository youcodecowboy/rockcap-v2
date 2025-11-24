'use client';

import { useState } from 'react';
import { Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

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

  if (isEditing) {
    return (
      <div className={`space-y-2 ${className}`}>
        {label && (
          <label className="text-sm font-medium text-gray-700 block">
            {label}
          </label>
        )}
        <div className="flex items-start gap-2">
          {multiline ? (
            <Textarea
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              className="flex-1 min-h-[100px]"
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
          <Button
            size="sm"
            onClick={handleSave}
            className="flex-shrink-0"
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            className="flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">
            {label}
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartEdit}
            className="h-6 w-6 p-0"
            title="Edit"
          >
            <Edit2 className="w-3 h-3 text-gray-500" />
          </Button>
        </div>
      )}
      <div className="text-sm text-gray-900 whitespace-pre-wrap relative">
        {value || <span className="text-gray-400 italic">{placeholder || 'No content'}</span>}
        {!label && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleStartEdit}
            className="h-6 w-6 p-0 absolute top-0 right-0"
            title="Edit"
          >
            <Edit2 className="w-3 h-3 text-gray-500" />
          </Button>
        )}
      </div>
    </div>
  );
}

