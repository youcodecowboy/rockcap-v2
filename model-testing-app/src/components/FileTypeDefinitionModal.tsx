'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, Plus, Trash2, Upload } from 'lucide-react';

interface FileTypeDefinitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  definitionId?: Id<'fileTypeDefinitions'>;
}

export default function FileTypeDefinitionModal({
  isOpen,
  onClose,
  mode,
  definitionId,
}: FileTypeDefinitionModalProps) {
  const definition = useQuery(
    api.fileTypeDefinitions.getById,
    definitionId ? { id: definitionId } : 'skip'
  );
  const createDefinition = useMutation(api.fileTypeDefinitions.create);
  const updateDefinition = useMutation(api.fileTypeDefinitions.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [fileType, setFileType] = useState('');
  const [category, setCategory] = useState('');
  const [parentType, setParentType] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState<string[]>(['']);
  const [identificationRules, setIdentificationRules] = useState<string[]>(['']);
  const [categoryRules, setCategoryRules] = useState('');
  const [exampleFile, setExampleFile] = useState<File | null>(null);
  const [exampleFileStorageId, setExampleFileStorageId] = useState<Id<'_storage'> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // Load existing definition if editing
  useEffect(() => {
    if (mode === 'edit' && definition) {
      setFileType(definition.fileType);
      setCategory(definition.category);
      setParentType(definition.parentType || '');
      setDescription(definition.description);
      setKeywords(definition.keywords.length > 0 ? definition.keywords : ['']);
      setIdentificationRules(
        definition.identificationRules.length > 0 ? definition.identificationRules : ['']
      );
      setCategoryRules(definition.categoryRules || '');
      setExampleFileStorageId(definition.exampleFileStorageId || null);
      const words = definition.description.trim().split(/\s+/).length;
      setWordCount(words);
    } else if (mode === 'create') {
      // Reset form for create mode
      setFileType('');
      setCategory('');
      setParentType('');
      setDescription('');
      setKeywords(['']);
      setIdentificationRules(['']);
      setCategoryRules('');
      setExampleFile(null);
      setExampleFileStorageId(null);
      setWordCount(0);
    }
  }, [mode, definition]);

  // Update word count when description changes
  useEffect(() => {
    const words = description.trim().split(/\s+/).filter((w) => w.length > 0);
    setWordCount(words.length);
  }, [description]);

  const handleKeywordChange = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    setKeywords(newKeywords);
  };

  const handleAddKeyword = () => {
    setKeywords([...keywords, '']);
  };

  const handleRemoveKeyword = (index: number) => {
    if (keywords.length > 1) {
      setKeywords(keywords.filter((_, i) => i !== index));
    }
  };

  const handleRuleChange = (index: number, value: string) => {
    const newRules = [...identificationRules];
    newRules[index] = value;
    setIdentificationRules(newRules);
  };

  const handleAddRule = () => {
    setIdentificationRules([...identificationRules, '']);
  };

  const handleRemoveRule = (index: number) => {
    if (identificationRules.length > 1) {
      setIdentificationRules(identificationRules.filter((_, i) => i !== index));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setExampleFile(e.target.files[0]);
    }
  };

  const uploadExampleFile = async (file: File): Promise<Id<'_storage'> | null> => {
    try {
      // Generate upload URL from Convex
      const uploadUrl = await generateUploadUrl();
      
      if (!uploadUrl || typeof uploadUrl !== 'string') {
        throw new Error('Invalid upload URL received from Convex');
      }
      
      // Upload file to Convex storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        const statusText = uploadResponse.statusText || 'Unknown error';
        const errorText = await uploadResponse.text().catch(() => 'Could not read error response');
        const errorMessage = `Failed to upload file: HTTP ${uploadResponse.status} ${statusText}${errorText ? ` - ${errorText.substring(0, 200)}` : ''}`;
        console.error('[FileTypeDefinitionModal] Upload failed:', {
          status: uploadResponse.status,
          statusText,
          errorText: errorText.substring(0, 500),
        });
        throw new Error(errorMessage);
      }

      const responseText = await uploadResponse.text();
      let fileStorageId: Id<'_storage'>;
      try {
        const responseData = JSON.parse(responseText);
        fileStorageId = responseData.storageId as Id<'_storage'>;
      } catch {
        fileStorageId = responseText.trim() as Id<'_storage'>;
      }

      return fileStorageId;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (wordCount < 100) {
      alert(`Description must be at least 100 words. Current: ${wordCount} words.`);
      return;
    }

    if (!fileType.trim() || !category.trim() || !description.trim()) {
      alert('Please fill in all required fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload example file if provided
      let finalExampleFileStorageId = exampleFileStorageId;
      if (exampleFile && mode === 'create') {
        finalExampleFileStorageId = await uploadExampleFile(exampleFile);
      }

      // Filter out empty keywords and rules
      const filteredKeywords = keywords.filter((k) => k.trim().length > 0);
      const filteredRules = identificationRules.filter((r) => r.trim().length > 0);

      if (mode === 'create') {
        await createDefinition({
          fileType: fileType.trim(),
          category: category.trim(),
          parentType: parentType.trim() || undefined,
          description: description.trim(),
          keywords: filteredKeywords,
          identificationRules: filteredRules,
          categoryRules: categoryRules.trim() || undefined,
          exampleFileStorageId: finalExampleFileStorageId || undefined,
          exampleFileName: exampleFile?.name || undefined,
        });
      } else if (mode === 'edit' && definitionId) {
        await updateDefinition({
          id: definitionId,
          fileType: fileType.trim(),
          category: category.trim(),
          parentType: parentType.trim() || undefined,
          description: description.trim(),
          keywords: filteredKeywords,
          identificationRules: filteredRules,
          categoryRules: categoryRules.trim() || undefined,
          exampleFileStorageId: finalExampleFileStorageId || undefined,
          exampleFileName: exampleFile?.name || undefined,
        });
      }

      onClose();
    } catch (error) {
      console.error('Error saving file type definition:', error);
      alert(
        error instanceof Error
          ? error.message
          : 'Failed to save file type definition. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Add New File Type' : 'Edit File Type Definition'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Add a new file type definition with examples to help the filing agent categorize files accurately.'
              : 'Edit the file type definition. System defaults cannot be edited.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="fileType">
                File Type Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fileType"
                value={fileType}
                onChange={(e) => setFileType(e.target.value)}
                placeholder="e.g., RedBook Valuation, Initial Monitoring Report"
                required
              />
            </div>

            <div>
              <Label htmlFor="category">
                Category <span className="text-red-500">*</span>
              </Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Appraisals, Inspections, Legal Documents"
                required
              />
            </div>

            <div>
              <Label htmlFor="parentType">Parent Type (if subtype)</Label>
              <Input
                id="parentType"
                value={parentType}
                onChange={(e) => setParentType(e.target.value)}
                placeholder="e.g., Legal Documents (if this is a subtype)"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: If this is a subtype of an existing document type, enter the parent type name.
              </p>
            </div>

            <div>
              <Label htmlFor="description">
                Description <span className="text-red-500">*</span> ({wordCount}/100 words minimum)
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide a detailed description of what this file type is (minimum 100 words)..."
                rows={6}
                required
                className={wordCount < 100 ? 'border-red-300' : ''}
              />
              <p className="text-xs text-gray-500 mt-1">
                {wordCount < 100
                  ? `Need ${100 - wordCount} more words`
                  : 'Description meets minimum requirement'}
              </p>
            </div>
          </div>

          {/* Keywords */}
          <div>
            <Label>Keywords</Label>
            <p className="text-xs text-gray-500 mb-2">
              Keywords that help identify this file type in content and filenames
            </p>
            <div className="space-y-2">
              {keywords.map((keyword, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={keyword}
                    onChange={(e) => handleKeywordChange(index, e.target.value)}
                    placeholder="e.g., rics, valuation report, redbook"
                  />
                  {keywords.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveKeyword(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddKeyword}>
                <Plus className="w-4 h-4 mr-1" />
                Add Keyword
              </Button>
            </div>
          </div>

          {/* Identification Rules */}
          <div>
            <Label>Identification Rules</Label>
            <p className="text-xs text-gray-500 mb-2">
              Specific rules for identifying this file type
            </p>
            <div className="space-y-2">
              {identificationRules.map((rule, index) => (
                <div key={index} className="flex gap-2">
                  <Textarea
                    value={rule}
                    onChange={(e) => handleRuleChange(index, e.target.value)}
                    placeholder="e.g., Look for 'RICS' branding or logos in the document"
                    rows={2}
                  />
                  {identificationRules.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRule(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddRule}>
                <Plus className="w-4 h-4 mr-1" />
                Add Rule
              </Button>
            </div>
          </div>

          {/* Category Rules */}
          <div>
            <Label htmlFor="categoryRules">Category Rules (Optional)</Label>
            <Textarea
              id="categoryRules"
              value={categoryRules}
              onChange={(e) => setCategoryRules(e.target.value)}
              placeholder="Explain why this file type belongs to this category..."
              rows={3}
            />
          </div>

          {/* Example File */}
          <div>
            <Label htmlFor="exampleFile">Example File (Optional)</Label>
            <p className="text-xs text-gray-500 mb-2">
              Upload an example file to help the system learn this file type
            </p>
            <Input
              id="exampleFile"
              type="file"
              onChange={handleFileChange}
              accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
            />
            {exampleFile && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {exampleFile.name} ({(exampleFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
            {exampleFileStorageId && mode === 'edit' && !exampleFile && (
              <p className="text-sm text-gray-600 mt-2">
                Current example file: {definition?.exampleFileName || 'Uploaded file'}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || wordCount < 100}>
              {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create File Type' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

