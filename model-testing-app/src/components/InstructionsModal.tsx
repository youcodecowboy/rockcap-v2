'use client';

import { useState } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { Modal, Field, Textarea, Button } from '@/components/layouts';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Loader2 } from 'lucide-react';
import { useFileQueue } from '@/lib/useFileQueue';
import { useColors } from '@/lib/useColors';

interface InstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: Id<"fileUploadQueue">;
  fileName: string;
  existingInstructions?: string;
  onInstructionsSaved: () => void;
}

export default function InstructionsModal({
  open,
  onOpenChange,
  jobId,
  fileName,
  existingInstructions,
  onInstructionsSaved,
}: InstructionsModalProps) {
  const colors = useColors();
  const [instructions, setInstructions] = useState(existingInstructions || '');
  const [isSaving, setIsSaving] = useState(false);
  const updateJobStatus = useMutation(api.fileQueue.updateJobStatus);
  const job = useQuery(api.fileQueue.getJob, { jobId });
  const { analyzeWithInstructions, isReady } = useFileQueue();

  const handleSave = async () => {
    if (!instructions.trim()) {
      alert('Please enter instructions before saving.');
      return;
    }

    if (!job?.fileStorageId) {
      alert('File storage ID not found. Please try again.');
      return;
    }

    setIsSaving(true);
    try {
      // Save instructions
      await updateJobStatus({
        jobId,
        customInstructions: instructions.trim(),
      });

      // Trigger analysis with instructions (both first time and when editing)
      if (isReady) {
        console.log('[InstructionsModal] Triggering analysis with instructions:', instructions.trim());
        await analyzeWithInstructions(
          jobId,
          job.fileStorageId,
          instructions.trim()
        );
      }

      onInstructionsSaved();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving instructions:', error);
      alert('Failed to save instructions. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title="Add Custom Instructions"
      width={600}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving || !instructions.trim()}>
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save Instructions'
            )}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 12, color: colors.text.secondary, lineHeight: 1.5 }}>
          Provide additional context or instructions to help improve the accuracy of filing for{' '}
          <strong style={{ color: colors.text.primary }}>{fileName}</strong>. For example, you can
          specify the client name, document type, or any other relevant information.
        </p>

        <Field
          label="Instructions"
          hint="These instructions will be included in the AI analysis prompt to improve filing accuracy."
        >
          <Textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Example: This document is for Client ABC. It's a financial report for Project XYZ. The file contains only numbers because it's a budget spreadsheet."
            style={{ minHeight: 120 }}
            disabled={isSaving}
          />
        </Field>
      </div>
    </Modal>
  );
}
