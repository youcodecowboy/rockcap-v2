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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Plus, Trash2, Upload, FileText } from 'lucide-react';
import { FILE_CATEGORIES } from '@/lib/categories';

interface FileTypeDefinitionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  definitionId?: Id<'fileTypeDefinitions'>;
}

export default function FileTypeDefinitionDrawer({
  isOpen,
  onClose,
  mode,
  definitionId,
}: FileTypeDefinitionDrawerProps) {
  const definition = useQuery(
    api.fileTypeDefinitions.getById,
    definitionId ? { id: definitionId } : 'skip'
  );
  const allDefinitions = useQuery(api.fileTypeDefinitions.getAllIncludingInactive);
  const createDefinition = useMutation(api.fileTypeDefinitions.create);
  const updateDefinition = useMutation(api.fileTypeDefinitions.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [fileType, setFileType] = useState('');
  const [category, setCategory] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [parentType, setParentType] = useState('');
  const [isCreatingParentType, setIsCreatingParentType] = useState(false);
  const [newParentTypeName, setNewParentTypeName] = useState('');
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState<string[]>(['']);
  const [identificationRules, setIdentificationRules] = useState<string[]>(['']);
  const [categoryRules, setCategoryRules] = useState('');
  const [exampleFile, setExampleFile] = useState<File | null>(null);
  const [exampleFileStorageId, setExampleFileStorageId] = useState<Id<'_storage'> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // Get unique categories from existing definitions
  const existingCategories = Array.from(
    new Set(allDefinitions?.map((d) => d.category) || [])
  ).sort();

  // Get unique file types for parent type selection
  const existingFileTypes = Array.from(
    new Set(allDefinitions?.map((d) => d.fileType) || [])
  ).sort();

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
      setIsCreatingCategory(false);
      setIsCreatingParentType(false);
      setNewCategoryName('');
      setNewParentTypeName('');
    }
  }, [mode, definition]);

  // Update word count when description changes
  useEffect(() => {
    const words = description.trim().split(/\s+/).filter((w) => w.length > 0);
    setWordCount(words.length);
  }, [description]);

  const handleCategorySelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingCategory(true);
      setCategory('');
      setNewCategoryName('');
    } else {
      setCategory(value);
      setIsCreatingCategory(false);
      setNewCategoryName('');
    }
  };

  const handleParentTypeSelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingParentType(true);
      setParentType('');
    } else if (value === 'none') {
      setParentType('');
      setIsCreatingParentType(false);
      setNewParentTypeName('');
    } else {
      setParentType(value);
      setIsCreatingParentType(false);
      setNewParentTypeName('');
    }
  };

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
        console.error('[FileTypeDefinitionDrawer] Upload failed:', {
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
    e.stopPropagation();
    
    // Use new category name if creating new category, otherwise use selected category
    const finalCategory = isCreatingCategory && newCategoryName.trim() 
      ? newCategoryName.trim() 
      : category.trim();
    const finalParentType = isCreatingParentType && newParentTypeName.trim()
      ? newParentTypeName.trim()
      : parentType.trim();
    
    console.log('Form submission:', {
      fileType: fileType.trim(),
      finalCategory,
      finalParentType,
      description: description.trim(),
      wordCount,
      isCreatingCategory,
      isCreatingParentType,
    });
    
    if (wordCount < 100) {
      alert(`Description must be at least 100 words. Current: ${wordCount} words.`);
      return;
    }

    if (!fileType.trim() || !finalCategory || !description.trim()) {
      alert(`Please fill in all required fields. Missing: ${!fileType.trim() ? 'File Type, ' : ''}${!finalCategory ? 'Category, ' : ''}${!description.trim() ? 'Description' : ''}`);
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
          category: finalCategory,
          parentType: finalParentType || undefined,
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
          category: finalCategory,
          parentType: finalParentType || undefined,
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
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 backdrop-blur-sm bg-black/20 z-40 transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[90vw] sm:w-[600px] lg:w-[700px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b pb-4 px-6 pt-6 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">
              {mode === 'create' ? 'Add New File Type' : 'Edit File Type Definition'}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {mode === 'create'
              ? 'Add a new file type definition with examples to help the filing agent categorize files accurately.'
              : 'Edit the file type definition. System defaults cannot be edited.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {/* Basic Information */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="fileType" className="text-sm font-medium">
                  File Type Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fileType"
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value)}
                  placeholder="e.g., RedBook Valuation, Initial Monitoring Report"
                  required
                  className="mt-2"
                />
              </div>

              <div>
                <Label htmlFor="category" className="text-sm font-medium">
                  Category or Subcategory <span className="text-red-500">*</span>
                </Label>
                {isCreatingCategory ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      id="newCategory"
                      value={newCategoryName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewCategoryName(value);
                        // Update category in real-time so it's available for form submission
                        setCategory(value.trim());
                      }}
                      onBlur={() => {
                        // Ensure category is set when user leaves the field
                        if (newCategoryName.trim() && !category.trim()) {
                          setCategory(newCategoryName.trim());
                        }
                      }}
                      placeholder="Enter new category name"
                      autoFocus
                      className="mt-2"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCreatingCategory(false);
                          setNewCategoryName('');
                          setCategory('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            // Category is already set via onChange, just confirm
                            // Optionally switch back to dropdown if category exists in list
                            const categoryExists = existingCategories.includes(newCategoryName.trim()) || 
                                                   FILE_CATEGORIES.includes(newCategoryName.trim() as any);
                            if (categoryExists) {
                              setIsCreatingCategory(false);
                            }
                            // Otherwise keep the input visible
                          }
                        }}
                        disabled={!newCategoryName.trim()}
                      >
                        Confirm
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select value={category || ''} onValueChange={handleCategorySelect}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select or create a category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {existingCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                      {FILE_CATEGORIES.filter((cat) => !existingCategories.includes(cat)).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                      <SelectItem value="new">
                        <div className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          <span>Create New Category</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div>
                <Label htmlFor="parentType" className="text-sm font-medium">
                  Parent Type (if subtype)
                </Label>
                {isCreatingParentType ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      id="newParentType"
                      value={newParentTypeName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewParentTypeName(value);
                        // Update parentType in real-time so it's available for form submission
                        setParentType(value.trim());
                      }}
                      onBlur={() => {
                        // Ensure parentType is set when user leaves the field
                        if (newParentTypeName.trim() && !parentType.trim()) {
                          setParentType(newParentTypeName.trim());
                        }
                      }}
                      placeholder="Enter parent file type name"
                      autoFocus
                      className="mt-2"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsCreatingParentType(false);
                          setNewParentTypeName('');
                          setParentType('');
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (newParentTypeName.trim()) {
                            // Parent type is already set via onChange, just confirm
                            // Optionally switch back to dropdown if type exists in list
                            const typeExists = existingFileTypes.includes(newParentTypeName.trim());
                            if (typeExists) {
                              setIsCreatingParentType(false);
                            }
                            // Otherwise keep the input visible
                          }
                        }}
                        disabled={!newParentTypeName.trim()}
                      >
                        Confirm
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select value={parentType || 'none'} onValueChange={handleParentTypeSelect}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Select parent type (optional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Top-level type)</SelectItem>
                      {existingFileTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                      <SelectItem value="new">
                        <div className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          <span>Create New Parent Type</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Optional: If this is a subtype of an existing document type, select the parent type.
                </p>
              </div>

              <div>
                <Label htmlFor="description" className="text-sm font-medium">
                  Description <span className="text-red-500">*</span> ({wordCount}/100 words minimum)
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide a detailed description of what this file type is (minimum 100 words)..."
                  rows={6}
                  required
                  className={`mt-2 ${wordCount < 100 ? 'border-red-300' : ''}`}
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
              <Label className="text-sm font-medium">Keywords</Label>
              <p className="text-xs text-gray-500 mb-3 mt-1">
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
              <Label className="text-sm font-medium">Identification Rules</Label>
              <p className="text-xs text-gray-500 mb-3 mt-1">
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
                      className="flex-1"
                    />
                    {identificationRules.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveRule(index)}
                        className="self-start"
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
              <Label htmlFor="categoryRules" className="text-sm font-medium">
                Category Rules (Optional)
              </Label>
              <Textarea
                id="categoryRules"
                value={categoryRules}
                onChange={(e) => setCategoryRules(e.target.value)}
                placeholder="Explain why this file type belongs to this category..."
                rows={3}
                className="mt-2"
              />
            </div>

            {/* Example File */}
            <div>
              <Label className="text-sm font-medium">Example File (Optional)</Label>
              <p className="text-xs text-gray-500 mb-3 mt-1">
                Upload an example file to help the system learn this file type
              </p>
              <div className="mt-2">
                <label
                  htmlFor="exampleFile"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    {exampleFile ? (
                      <>
                        <FileText className="w-10 h-10 text-blue-500 mb-2" />
                        <p className="text-sm font-medium text-gray-900">{exampleFile.name}</p>
                        <p className="text-xs text-gray-500">
                          {(exampleFile.size / 1024).toFixed(2)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-10 h-10 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-600 mb-1">
                          <span className="font-semibold">Click to upload</span> or drag and drop
                        </p>
                        <p className="text-xs text-gray-500">PDF, DOC, DOCX, TXT, XLSX, XLS</p>
                      </>
                    )}
                  </div>
                  <input
                    id="exampleFile"
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
                    className="hidden"
                  />
                </label>
                {exampleFileStorageId && mode === 'edit' && !exampleFile && (
                  <p className="text-sm text-gray-600 mt-2">
                    Current example file: {definition?.exampleFileName || 'Uploaded file'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer with buttons */}
          <div className="border-t pt-4 px-6 pb-6 flex-shrink-0">
            <div className="flex justify-end gap-3 w-full">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={
                  isSubmitting || 
                  wordCount < 100 || 
                  !fileType.trim() || 
                  !(isCreatingCategory ? newCategoryName.trim() : category.trim()) ||
                  !description.trim()
                }
                className="min-w-[140px]"
              >
                {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create File Type' : 'Save Changes'}
              </Button>
            </div>
            {/* Debug info */}
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              <div>Word count: {wordCount}/100 {wordCount >= 100 ? '✓' : '✗'}</div>
              <div>File type: {fileType.trim() ? '✓' : '✗'}</div>
              <div>Category: {isCreatingCategory ? (newCategoryName.trim() ? `✓ "${newCategoryName.trim()}"` : '✗') : (category.trim() ? `✓ "${category}"` : '✗')}</div>
              <div>Description: {description.trim() ? '✓' : '✗'}</div>
              <div className="text-red-500">
                Button disabled: {isSubmitting || wordCount < 100 || !fileType.trim() || !(isCreatingCategory ? newCategoryName.trim() : category.trim()) || !description.trim() ? 'YES' : 'NO'}
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

