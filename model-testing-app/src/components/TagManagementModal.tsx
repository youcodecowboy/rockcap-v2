'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { X, Plus, Tag } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface TagManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TagManagementModal({ isOpen, onClose }: TagManagementModalProps) {
  const tags = useQuery(api.userTags.get, {});
  const updateTags = useMutation(api.userTags.update);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Initialize local tags from query
  useEffect(() => {
    if (tags) {
      setLocalTags([...tags]);
    }
  }, [tags]);

  const handleAddTag = () => {
    const trimmed = newTag.trim().toLowerCase();
    if (trimmed && !localTags.includes(trimmed)) {
      setLocalTags([...localTags, trimmed]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setLocalTags(localTags.filter(t => t !== tagToRemove));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateTags({ tags: localTags });
      onClose();
    } catch (error) {
      console.error('Failed to save tags:', error);
      alert('Failed to save tags. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            Edit Tags
          </DialogTitle>
          <DialogDescription>
            Manage your tag library. The LLM will use these tags to match natural language inputs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add New Tag */}
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add a new tag..."
              className="flex-1"
            />
            <Button onClick={handleAddTag} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Tags List */}
          <div className="border border-gray-200 rounded-lg p-3 max-h-60 overflow-y-auto">
            {localTags.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No tags yet. Add some tags to get started.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {localTags.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-md text-sm"
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-blue-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Tags'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

