'use client';

import { useState } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Loader2 } from 'lucide-react';
import { useFileQueue } from '@/lib/useFileQueue';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Custom Instructions</DialogTitle>
          <DialogDescription>
            Provide additional context or instructions to help improve the accuracy of filing for <strong>{fileName}</strong>.
            For example, you can specify the client name, document type, or any other relevant information.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <label htmlFor="instructions" className="text-sm font-medium text-gray-700 mb-2 block">
              Instructions
            </label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Example: This document is for Client ABC. It's a financial report for Project XYZ. The file contains only numbers because it's a budget spreadsheet."
              className="min-h-[120px]"
              disabled={isSaving}
            />
            <p className="text-xs text-gray-500 mt-2">
              These instructions will be included in the AI analysis prompt to improve filing accuracy.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !instructions.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Instructions'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

