'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Brain, Sparkles, Plus, X } from 'lucide-react';

interface DocumentNoteFormProps {
  documentId: Id<"documents">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function DocumentNoteForm({ documentId, clientId, projectId }: DocumentNoteFormProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [content, setContent] = useState('');
  const [addToIntelligence, setAddToIntelligence] = useState(false);
  const [intelligenceTarget, setIntelligenceTarget] = useState<"client" | "project">(
    projectId ? "project" : "client"
  );
  const [isSaving, setIsSaving] = useState(false);

  const createNote = useMutation(api.documentNotes.create);

  const hasProject = !!projectId;
  const hasClient = !!clientId;

  const handleSave = async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      await createNote({
        documentId,
        content: content.trim(),
        addToIntelligence,
        intelligenceTarget: addToIntelligence ? intelligenceTarget : undefined,
      });

      // Reset form
      setContent('');
      setAddToIntelligence(false);
      setIsExpanded(false);
    } catch (error) {
      console.error('Failed to create note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setContent('');
    setAddToIntelligence(false);
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="w-full gap-2 text-gray-600"
      >
        <Plus className="w-4 h-4" />
        Add Note
      </Button>
    );
  }

  return (
    <div className="p-3 rounded border bg-gray-50 border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">Add Note</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="h-6 w-6 p-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Add notes about this document for future reference..."
        className="w-full text-sm min-h-[80px] p-2 border border-gray-200 rounded bg-white resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        autoFocus
      />

      {/* Intelligence Toggle */}
      {hasClient && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <Switch
              checked={addToIntelligence}
              onCheckedChange={setAddToIntelligence}
              className="scale-90"
            />
            <label className="text-xs text-gray-600 flex items-center gap-1">
              <Brain className="w-3 h-3" />
              Add to {hasProject ? 'project' : 'client'} intelligence
            </label>
          </div>

          {/* Intelligence Target Options */}
          {addToIntelligence && hasProject && (
            <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-blue-700">File to:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="intel-target"
                    checked={intelligenceTarget === "project"}
                    onChange={() => setIntelligenceTarget("project")}
                    className="w-3 h-3"
                  />
                  <span className="text-blue-700">Project</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="intel-target"
                    checked={intelligenceTarget === "client"}
                    onChange={() => setIntelligenceTarget("client")}
                    className="w-3 h-3"
                  />
                  <span className="text-blue-700">Client</span>
                </label>
              </div>
            </div>
          )}

          {addToIntelligence && (
            <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Note will be available for document generation via client intelligence
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          className="text-xs h-7"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={isSaving || !content.trim()}
          onClick={handleSave}
          className="text-xs h-7"
        >
          {isSaving ? 'Saving...' : 'Save Note'}
        </Button>
      </div>
    </div>
  );
}
