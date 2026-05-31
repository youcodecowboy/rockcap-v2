'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { IconButton, FlagChip, Textarea, Field } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Brain, Pencil, Trash2, Check, X } from 'lucide-react';

interface DocumentNote {
  _id: Id<"documentNotes">;
  content: string;
  addedToIntelligence: boolean;
  intelligenceTarget?: "client" | "project";
  createdAt: string;
  createdByName: string;
  createdByInitials: string;
}

interface DocumentNoteCardProps {
  note: DocumentNote;
}

export default function DocumentNoteCard({ note }: DocumentNoteCardProps) {
  const colors = useColors();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [isSaving, setIsSaving] = useState(false);

  const updateNote = useMutation(api.documentNotes.update);
  const deleteNote = useMutation(api.documentNotes.remove);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    });
  };

  const handleSave = async () => {
    if (!editContent.trim()) return;

    setIsSaving(true);
    try {
      await updateNote({
        noteId: note._id,
        content: editContent.trim(),
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this note?')) return;

    try {
      await deleteNote({ noteId: note._id });
    } catch (error) {
      console.error('Failed to delete note:', error);
    }
  };

  const handleCancel = () => {
    setEditContent(note.content);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div
        style={{
          padding: 12,
          borderRadius: 4,
          background: colors.bg.card,
          border: `1px solid ${colors.border.default}`,
        }}
      >
        <Field>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            style={{ minHeight: 60 }}
            autoFocus
          />
        </Field>
        <div className="flex items-center justify-end gap-1" style={{ marginTop: 8 }}>
          <IconButton label="Cancel" onClick={handleCancel}>
            <X className="w-4 h-4" />
          </IconButton>
          <IconButton
            label="Save"
            onClick={handleSave}
            disabled={isSaving || !editContent.trim()}
            style={{ color: colors.accent.green }}
          >
            <Check className="w-4 h-4" />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group"
      style={{
        padding: 12,
        borderRadius: 4,
        background: colors.bg.card,
        border: `1px solid ${colors.border.default}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: colors.bg.cardAlt,
              fontSize: 10,
              fontWeight: 500,
              color: colors.text.muted,
            }}
          >
            {note.createdByInitials}
          </div>
          <span style={{ fontSize: 11, color: colors.text.muted }}>{formatDate(note.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          {note.addedToIntelligence && (
            <FlagChip
              label={note.intelligenceTarget === 'project' ? 'Project' : 'Client'}
              severity="info"
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Note actions"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  background: 'transparent',
                  border: 'none',
                  color: colors.text.muted,
                  cursor: 'pointer',
                }}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} style={{ color: colors.accent.red }}>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <p className="whitespace-pre-wrap" style={{ fontSize: 12, color: colors.text.secondary }}>{note.content}</p>
    </div>
  );
}
