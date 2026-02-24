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
import { X, Plus, Trash2, Upload, Sparkles, FolderOpen, FileType } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

  // Deterministic verification fields
  const [targetFolderKey, setTargetFolderKey] = useState('');
  const [targetLevel, setTargetLevel] = useState<'client' | 'project'>('project');
  const [filenamePatterns, setFilenamePatterns] = useState<string[]>(['']);
  const [excludePatterns, setExcludePatterns] = useState<string[]>(['']);

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
      // Load deterministic verification fields
      setTargetFolderKey(definition.targetFolderKey || '');
      setTargetLevel(definition.targetLevel || 'project');
      setFilenamePatterns(
        definition.filenamePatterns && definition.filenamePatterns.length > 0
          ? definition.filenamePatterns
          : ['']
      );
      setExcludePatterns(
        definition.excludePatterns && definition.excludePatterns.length > 0
          ? definition.excludePatterns
          : ['']
      );
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
      // Reset deterministic verification fields
      setTargetFolderKey('');
      setTargetLevel('project');
      setFilenamePatterns(['']);
      setExcludePatterns(['']);
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

  // Filename pattern handlers
  const handleFilenamePatternChange = (index: number, value: string) => {
    const newPatterns = [...filenamePatterns];
    newPatterns[index] = value;
    setFilenamePatterns(newPatterns);
  };

  const handleAddFilenamePattern = () => {
    setFilenamePatterns([...filenamePatterns, '']);
  };

  const handleRemoveFilenamePattern = (index: number) => {
    if (filenamePatterns.length > 1) {
      setFilenamePatterns(filenamePatterns.filter((_, i) => i !== index));
    }
  };

  // Exclude pattern handlers
  const handleExcludePatternChange = (index: number, value: string) => {
    const newPatterns = [...excludePatterns];
    newPatterns[index] = value;
    setExcludePatterns(newPatterns);
  };

  const handleAddExcludePattern = () => {
    setExcludePatterns([...excludePatterns, '']);
  };

  const handleRemoveExcludePattern = (index: number) => {
    if (excludePatterns.length > 1) {
      setExcludePatterns(excludePatterns.filter((_, i) => i !== index));
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
      const filteredFilenamePatterns = filenamePatterns.filter((p) => p.trim().length > 0);
      const filteredExcludePatterns = excludePatterns.filter((p) => p.trim().length > 0);

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
          // Deterministic verification fields
          targetFolderKey: targetFolderKey.trim() || undefined,
          targetLevel: targetLevel || undefined,
          filenamePatterns: filteredFilenamePatterns.length > 0 ? filteredFilenamePatterns : undefined,
          excludePatterns: filteredExcludePatterns.length > 0 ? filteredExcludePatterns : undefined,
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
          // Deterministic verification fields
          targetFolderKey: targetFolderKey.trim() || undefined,
          targetLevel: targetLevel || undefined,
          filenamePatterns: filteredFilenamePatterns.length > 0 ? filteredFilenamePatterns : undefined,
          excludePatterns: filteredExcludePatterns.length > 0 ? filteredExcludePatterns : undefined,
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

          {/* Deterministic Verification Settings */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-blue-500" />
              <Label className="text-sm font-medium">Filing Settings</Label>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Configure where documents of this type should be filed and how to match them by filename.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="targetFolderKey">Target Folder Key</Label>
                <Input
                  id="targetFolderKey"
                  value={targetFolderKey}
                  onChange={(e) => setTargetFolderKey(e.target.value)}
                  placeholder="e.g., kyc, appraisals, background"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The folder where documents of this type should be filed
                </p>
              </div>

              <div>
                <Label htmlFor="targetLevel">Target Level</Label>
                <Select value={targetLevel} onValueChange={(v) => setTargetLevel(v as 'client' | 'project')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client Level</SelectItem>
                    <SelectItem value="project">Project Level</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Client-level for identity docs, project-level for project-specific
                </p>
              </div>
            </div>
          </div>

          {/* Filename Patterns */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileType className="w-4 h-4 text-green-500" />
              <Label>Filename Patterns</Label>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Patterns to match in filenames for quick identification (case-insensitive)
            </p>
            <div className="space-y-2">
              {filenamePatterns.map((pattern, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={pattern}
                    onChange={(e) => handleFilenamePatternChange(index, e.target.value)}
                    placeholder="e.g., valuation, rics, market value"
                  />
                  {filenamePatterns.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFilenamePattern(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddFilenamePattern}>
                <Plus className="w-4 h-4 mr-1" />
                Add Pattern
              </Button>
            </div>
          </div>

          {/* Exclude Patterns */}
          <div>
            <Label>Exclude Patterns</Label>
            <p className="text-xs text-gray-500 mb-2">
              Patterns to exclude (prevents false positives, e.g., &quot;template&quot;, &quot;guide&quot;)
            </p>
            <div className="space-y-2">
              {excludePatterns.map((pattern, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={pattern}
                    onChange={(e) => handleExcludePatternChange(index, e.target.value)}
                    placeholder="e.g., template, guide, instructions"
                  />
                  {excludePatterns.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveExcludePattern(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddExcludePattern}>
                <Plus className="w-4 h-4 mr-1" />
                Add Exclusion
              </Button>
            </div>
          </div>

          {/* Learned Keywords (read-only display) */}
          {mode === 'edit' && definition?.learnedKeywords && definition.learnedKeywords.length > 0 && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <Label className="text-sm font-medium">Auto-Learned Keywords</Label>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Keywords automatically learned from user corrections
              </p>
              <div className="flex flex-wrap gap-2">
                {definition.learnedKeywords.map((lk, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-amber-50 text-amber-700 border border-amber-200"
                  >
                    {lk.keyword}
                    {lk.correctionCount && (
                      <span className="ml-1 text-xs text-amber-500">
                        ({lk.correctionCount} corrections)
                      </span>
                    )}
                  </span>
                ))}
              </div>
              {definition.lastLearnedAt && (
                <p className="text-xs text-gray-400 mt-2">
                  Last learned: {new Date(definition.lastLearnedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

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

