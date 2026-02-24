'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      <div className="p-3 rounded border bg-white border-gray-200">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full text-sm min-h-[60px] p-2 border border-gray-200 rounded bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-6 w-6 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !editContent.trim()}
            className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
          >
            <Check className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded border bg-white border-gray-200 group">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
            {note.createdByInitials}
          </div>
          <span className="text-xs text-gray-500">{formatDate(note.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          {note.addedToIntelligence && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 gap-1 bg-blue-50 text-blue-700 border-blue-200">
              <Brain className="w-3 h-3" />
              {note.intelligenceTarget === 'project' ? 'Project' : 'Client'}
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
    </div>
  );
}
