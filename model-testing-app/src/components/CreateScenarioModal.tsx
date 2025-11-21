'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface CreateScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (scenarioId?: Id<"scenarios">) => void;
  projectId: Id<"projects">;
}

export default function CreateScenarioModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
}: CreateScenarioModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createScenario = useMutation(api.scenarios.create);

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Create a blank 50x10 grid (50 rows, 10 columns)
      // Use Array.from to ensure each row is a new array instance
      const blankGrid = Array.from({ length: 50 }, () => Array.from({ length: 10 }, () => ''));
      
      const scenarioId = await createScenario({
        projectId,
        name: name.trim(),
        description: description.trim() || undefined,
        data: blankGrid, // Initialize with blank 50x10 spreadsheet
      });
      handleClose();
      onSuccess?.(scenarioId);
    } catch (error) {
      console.error('Error creating scenario:', error);
      alert('Failed to create scenario. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Scenario</DialogTitle>
          <DialogDescription>
            Create a new modeling scenario for this project
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Scenario Name *</Label>
            <Input
              id="scenario-name"
              placeholder="e.g., Base Case, Optimistic, Conservative"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scenario-description">Description</Label>
            <Textarea
              id="scenario-description"
              placeholder="Optional description of this scenario..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Creating...' : 'Create Scenario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

