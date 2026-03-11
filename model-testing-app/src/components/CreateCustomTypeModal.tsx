'use client';

import React, { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FILE_CATEGORIES, FILE_TYPES } from '@/lib/categories';
import { toast } from 'sonner';

interface CreateCustomTypeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  onCreated: (fileType: string) => void;
  existingCustomTypes?: string[];
}

const categoryOptions = FILE_CATEGORIES.map((cat) => ({
  value: cat,
  label: cat,
}));

export function CreateCustomTypeModal({
  open,
  onOpenChange,
  initialName,
  onCreated,
  existingCustomTypes = [],
}: CreateCustomTypeModalProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [descriptionError, setDescriptionError] = useState('');
  const [saving, setSaving] = useState(false);

  const createCustomType = useMutation(api.fileTypeDefinitions.createFromBulkReview);

  // Reset form when modal opens with new name
  React.useEffect(() => {
    if (open) {
      setName(initialName);
      setCategory('');
      setDescription('');
      setNameError('');
      setDescriptionError('');
      setSaving(false);
    }
  }, [open, initialName]);

  const validateName = (val: string): boolean => {
    const trimmed = val.trim();
    if (!trimmed) {
      setNameError('Name is required');
      return false;
    }
    // Check against built-in FILE_TYPES
    const isBuiltIn = FILE_TYPES.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase()
    );
    if (isBuiltIn) {
      setNameError(`"${trimmed}" already exists as a built-in type`);
      return false;
    }
    // Check against existing custom types
    const isCustomDuplicate = existingCustomTypes.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase()
    );
    if (isCustomDuplicate) {
      setNameError(`"${trimmed}" already exists as a custom type`);
      return false;
    }
    setNameError('');
    return true;
  };

  const validateDescription = (val: string): boolean => {
    const wordCount = val.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) {
      setDescriptionError(`At least 10 words needed so the AI can recognize this type (currently ${wordCount})`);
      return false;
    }
    setDescriptionError('');
    return true;
  };

  const handleSave = async () => {
    const nameValid = validateName(name);
    const descValid = validateDescription(description);
    if (!nameValid || !descValid || !category) return;

    setSaving(true);
    try {
      await createCustomType({
        fileType: name.trim(),
        category,
        description: description.trim(),
      });
      onCreated(name.trim());
      onOpenChange(false);
    } catch (error: any) {
      // Server-side validation errors (e.g. duplicate name race condition)
      if (error.message?.includes('already exists')) {
        setNameError(error.message);
      } else {
        toast.error('Failed to create custom type. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Custom Document Type</DialogTitle>
          <DialogDescription>
            Add a new document type so it can be used for classification.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="custom-type-name">Name</Label>
            <Input
              id="custom-type-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) validateName(e.target.value);
              }}
              placeholder="e.g. Development Appraisal"
            />
            {nameError && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <SearchableSelect
              options={categoryOptions}
              value={category}
              onSelect={setCategory}
              placeholder="Select a category..."
            />
            {!category && saving && (
              <p className="text-xs text-destructive">Category is required</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-type-description">Description</Label>
            <Textarea
              id="custom-type-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) validateDescription(e.target.value);
              }}
              placeholder="Briefly describe this document type so the AI can recognize it in future uploads..."
              rows={3}
            />
            {descriptionError && (
              <p className="text-xs text-destructive">{descriptionError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !category}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
