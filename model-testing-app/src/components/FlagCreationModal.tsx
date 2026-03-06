'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Flag, Loader2, AlertCircle } from 'lucide-react';

interface FlagCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "document" | "meeting" | "task" | "project" | "client" | "checklist_item";
  entityId: string;
  entityName: string;
  entityContext?: string;
  clientId?: string;
  projectId?: string;
}

export default function FlagCreationModal({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityName,
  entityContext,
  clientId,
  projectId,
}: FlagCreationModalProps) {
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createFlag = useMutation(api.flags.create);
  const users = useQuery(api.users.getAll);

  const resetForm = () => {
    setNote('');
    setPriority('normal');
    setAssignedTo('');
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!note.trim()) {
      setError('Please add a note describing the issue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createFlag({
        entityType,
        entityId,
        note: note.trim(),
        priority,
        ...(assignedTo ? { assignedTo: assignedTo as Id<"users"> } : {}),
        ...(clientId ? { clientId: clientId as Id<"clients"> } : {}),
        ...(projectId ? { projectId: projectId as Id<"projects"> } : {}),
      });

      toast.success('Flag created successfully');
      handleClose();
    } catch (err) {
      console.error('Failed to create flag:', err);
      setError(err instanceof Error ? err.message : 'Failed to create flag. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const entityTypeLabel = entityType === 'checklist_item' ? 'Checklist Item' : entityType.charAt(0).toUpperCase() + entityType.slice(1);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-500" />
            Create Flag
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {/* Entity info header */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              {entityTypeLabel}
            </div>
            <div className="text-sm font-medium text-gray-900 truncate">
              {entityName}
            </div>
            {entityContext && (
              <div className="text-xs text-gray-500 mt-1 truncate">
                {entityContext}
              </div>
            )}
          </div>

          {/* Priority toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Priority</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('normal')}
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  priority === 'normal'
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setPriority('urgent')}
                className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                  priority === 'urgent'
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-red-200 hover:text-red-600'
                }`}
              >
                Urgent
              </button>
            </div>
          </div>

          {/* Assign to */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Assign to</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Self (default)" />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user) => (
                  <SelectItem key={user._id} value={user._id}>
                    {user.name || user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Note <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="Describe the issue or action needed..."
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !note.trim()}
              className={`flex-1 ${priority === 'urgent' ? 'bg-red-600 hover:bg-red-700' : ''}`}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Flag className="w-4 h-4 mr-2" />
                  Create Flag
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
