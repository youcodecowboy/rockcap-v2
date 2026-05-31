'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../../../../../convex/_generated/api';
import { Id } from '../../../../../../../convex/_generated/dataModel';
import { Button, Field, Textarea } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Switch } from '@/components/ui/switch';
import { Brain, Sparkles, Plus, X } from 'lucide-react';

interface DocumentNoteFormProps {
  documentId: Id<"documents">;
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function DocumentNoteForm({ documentId, clientId, projectId }: DocumentNoteFormProps) {
  const colors = useColors();
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
        variant="secondary"
        size="sm"
        onClick={() => setIsExpanded(true)}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        <Plus className="w-4 h-4" />
        Add Note
      </Button>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 4,
        background: colors.bg.light,
        border: `1px solid ${colors.border.default}`,
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 9,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: colors.text.muted,
            fontWeight: 500,
          }}
        >
          Add Note
        </span>
        <button
          onClick={handleCancel}
          aria-label="Cancel"
          style={{ background: 'transparent', border: 'none', color: colors.text.muted, cursor: 'pointer', lineHeight: 1 }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <Field>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add notes about this document for future reference..."
          style={{ minHeight: 80 }}
          autoFocus
        />
      </Field>

      {/* Intelligence Toggle */}
      {hasClient && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border.default}` }}>
          <div className="flex items-center gap-2">
            <Switch
              checked={addToIntelligence}
              onCheckedChange={setAddToIntelligence}
              className="scale-90"
            />
            <label className="flex items-center gap-1" style={{ fontSize: 11, color: colors.text.secondary }}>
              <Brain className="w-3 h-3" />
              Add to {hasProject ? 'project' : 'client'} intelligence
            </label>
          </div>

          {/* Intelligence Target Options */}
          {addToIntelligence && hasProject && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 4,
                background: `${colors.accent.blue}15`,
                border: `1px solid ${colors.accent.blue}40`,
              }}
            >
              <div className="flex items-center gap-3" style={{ fontSize: 11 }}>
                <span style={{ color: colors.accent.blue }}>File to:</span>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="intel-target"
                    checked={intelligenceTarget === "project"}
                    onChange={() => setIntelligenceTarget("project")}
                    className="w-3 h-3"
                  />
                  <span style={{ color: colors.accent.blue }}>Project</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="intel-target"
                    checked={intelligenceTarget === "client"}
                    onChange={() => setIntelligenceTarget("client")}
                    className="w-3 h-3"
                  />
                  <span style={{ color: colors.accent.blue }}>Client</span>
                </label>
              </div>
            </div>
          )}

          {addToIntelligence && (
            <p className="flex items-center gap-1" style={{ fontSize: 10, color: colors.text.muted, marginTop: 8 }}>
              <Sparkles className="w-3 h-3" />
              Note will be available for document generation via client intelligence
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2" style={{ marginTop: 12 }}>
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          accent={colors.accent.blue}
          size="sm"
          disabled={isSaving || !content.trim()}
          onClick={handleSave}
        >
          {isSaving ? 'Saving...' : 'Save Note'}
        </Button>
      </div>
    </div>
  );
}
