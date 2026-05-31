'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button, IconButton, Field, Input, Textarea, Select, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { X, Plus, Trash2, Upload, FileText, FolderOpen, FileType, Sparkles } from 'lucide-react';
import { FILE_CATEGORIES } from '@/lib/categories';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const colors = useColors();
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

  // Deterministic verification fields
  const [targetFolderKey, setTargetFolderKey] = useState('');
  const [targetLevel, setTargetLevel] = useState<'client' | 'project'>('project');
  const [filenamePatterns, setFilenamePatterns] = useState<string[]>(['']);
  const [excludePatterns, setExcludePatterns] = useState<string[]>(['']);

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
      setIsCreatingCategory(false);
      setIsCreatingParentType(false);
      setNewCategoryName('');
      setNewParentTypeName('');
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

      // Filter out empty keywords, rules, and patterns
      const filteredKeywords = keywords.filter((k) => k.trim().length > 0);
      const filteredRules = identificationRules.filter((r) => r.trim().length > 0);
      const filteredFilenamePatterns = filenamePatterns.filter((p) => p.trim().length > 0);
      const filteredExcludePatterns = excludePatterns.filter((p) => p.trim().length > 0);

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
          category: finalCategory,
          parentType: finalParentType || undefined,
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

  const sectionDividerStyle = { borderTop: `1px solid ${colors.border.default}`, paddingTop: 16, marginTop: 16 };
  const inlineLabelStyle = { fontSize: 13, fontWeight: 500, color: colors.text.primary };

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backdropFilter: 'blur(2px)',
          background: 'rgba(0,0,0,0.2)',
          zIndex: 40,
          transition: 'opacity 300ms ease-in-out',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* Drawer */}
      <div
        className="w-[90vw] sm:w-[600px] lg:w-[700px]"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100%',
          background: colors.bg.card,
          borderLeft: `1px solid ${colors.border.default}`,
          zIndex: 50,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 300ms ease-in-out',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ borderBottom: `1px solid ${colors.border.default}`, padding: '24px 24px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary }}>
              {mode === 'create' ? 'Add New File Type' : 'Edit File Type Definition'}
            </h2>
            <IconButton label="Close" onClick={onClose}>
              <X style={{ width: 18, height: 18 }} />
            </IconButton>
          </div>
          <p style={{ fontSize: 13, color: colors.text.secondary }}>
            {mode === 'create'
              ? 'Add a new file type definition with examples to help the filing agent categorize files accurately.'
              : 'Edit the file type definition. System defaults cannot be edited.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20, flex: 1, overflowY: 'auto' }}>
            {/* Basic Information */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="File Type Name *">
                <Input
                  id="fileType"
                  value={fileType}
                  onChange={(e) => setFileType(e.target.value)}
                  placeholder="e.g., RedBook Valuation, Initial Monitoring Report"
                  required
                />
              </Field>

              <Field label="Category or Subcategory *">
                {isCreatingCategory ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Input
                      id="newCategory"
                      value={newCategoryName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewCategoryName(value);
                        setCategory(value.trim());
                      }}
                      onBlur={() => {
                        if (newCategoryName.trim() && !category.trim()) {
                          setCategory(newCategoryName.trim());
                        }
                      }}
                      placeholder="Enter new category name"
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        type="button"
                        variant="secondary"
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
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            const categoryExists = existingCategories.includes(newCategoryName.trim()) ||
                                                   FILE_CATEGORIES.includes(newCategoryName.trim() as any);
                            if (categoryExists) {
                              setIsCreatingCategory(false);
                            }
                          }
                        }}
                        disabled={!newCategoryName.trim()}
                      >
                        Confirm
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select value={category || ''} onChange={(e) => handleCategorySelect(e.target.value)}>
                    <option value="" disabled>Select or create a category...</option>
                    {existingCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {FILE_CATEGORIES.filter((cat) => !existingCategories.includes(cat)).map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="new">+ Create New Category</option>
                  </Select>
                )}
              </Field>

              <Field label="Parent Type (if subtype)" hint="Optional: If this is a subtype of an existing document type, select the parent type.">
                {isCreatingParentType ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Input
                      id="newParentType"
                      value={newParentTypeName}
                      onChange={(e) => {
                        const value = e.target.value;
                        setNewParentTypeName(value);
                        setParentType(value.trim());
                      }}
                      onBlur={() => {
                        if (newParentTypeName.trim() && !parentType.trim()) {
                          setParentType(newParentTypeName.trim());
                        }
                      }}
                      placeholder="Enter parent file type name"
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        type="button"
                        variant="secondary"
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
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          if (newParentTypeName.trim()) {
                            const typeExists = existingFileTypes.includes(newParentTypeName.trim());
                            if (typeExists) {
                              setIsCreatingParentType(false);
                            }
                          }
                        }}
                        disabled={!newParentTypeName.trim()}
                      >
                        Confirm
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Select value={parentType || 'none'} onChange={(e) => handleParentTypeSelect(e.target.value)}>
                    <option value="none">None (Top-level type)</option>
                    {existingFileTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                    <option value="new">+ Create New Parent Type</option>
                  </Select>
                )}
              </Field>

              <Field
                label={`Description * (${wordCount}/100 words minimum)`}
                hint={wordCount < 100 ? `Need ${100 - wordCount} more words` : 'Description meets minimum requirement'}
              >
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide a detailed description of what this file type is (minimum 100 words)..."
                  rows={6}
                  required
                  style={wordCount < 100 ? { borderColor: colors.accent.red } : undefined}
                />
              </Field>
            </div>

            {/* Keywords */}
            <div>
              <span style={inlineLabelStyle}>Keywords</span>
              <p style={{ fontSize: 11, color: colors.text.muted, margin: '4px 0 12px' }}>
                Keywords that help identify this file type in content and filenames
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {keywords.map((keyword, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8 }}>
                    <Input
                      value={keyword}
                      onChange={(e) => handleKeywordChange(index, e.target.value)}
                      placeholder="e.g., rics, valuation report, redbook"
                    />
                    {keywords.length > 1 && (
                      <IconButton type="button" label="Remove keyword" onClick={() => handleRemoveKeyword(index)}>
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </IconButton>
                    )}
                  </div>
                ))}
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddKeyword}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Add Keyword
                  </Button>
                </div>
              </div>
            </div>

            {/* Deterministic Verification Settings */}
            <div style={sectionDividerStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <FolderOpen style={{ width: 16, height: 16, color: colors.accent.blue }} />
                <span style={inlineLabelStyle}>Filing Settings</span>
              </div>
              <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 16 }}>
                Configure where documents of this type should be filed and how to match them by filename.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Target Folder Key" hint="The folder where documents of this type should be filed">
                  <Input
                    id="targetFolderKey"
                    value={targetFolderKey}
                    onChange={(e) => setTargetFolderKey(e.target.value)}
                    placeholder="e.g., kyc, appraisals, background"
                  />
                </Field>

                <Field label="Target Level" hint="Client-level for identity docs, project-level for project-specific">
                  <Select value={targetLevel} onChange={(e) => setTargetLevel(e.target.value as 'client' | 'project')}>
                    <option value="client">Client Level</option>
                    <option value="project">Project Level</option>
                  </Select>
                </Field>
              </div>
            </div>

            {/* Filename Patterns */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FileType style={{ width: 16, height: 16, color: colors.accent.green }} />
                <span style={inlineLabelStyle}>Filename Patterns</span>
              </div>
              <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
                Patterns to match in filenames for quick identification (case-insensitive)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filenamePatterns.map((pattern, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8 }}>
                    <Input
                      value={pattern}
                      onChange={(e) => handleFilenamePatternChange(index, e.target.value)}
                      placeholder="e.g., valuation, rics, market value"
                    />
                    {filenamePatterns.length > 1 && (
                      <IconButton type="button" label="Remove pattern" onClick={() => handleRemoveFilenamePattern(index)}>
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </IconButton>
                    )}
                  </div>
                ))}
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddFilenamePattern}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Add Pattern
                  </Button>
                </div>
              </div>
            </div>

            {/* Exclude Patterns */}
            <div>
              <span style={inlineLabelStyle}>Exclude Patterns</span>
              <p style={{ fontSize: 11, color: colors.text.muted, margin: '4px 0 12px' }}>
                Patterns to exclude (prevents false positives, e.g., &quot;template&quot;, &quot;guide&quot;)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {excludePatterns.map((pattern, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8 }}>
                    <Input
                      value={pattern}
                      onChange={(e) => handleExcludePatternChange(index, e.target.value)}
                      placeholder="e.g., template, guide, instructions"
                    />
                    {excludePatterns.length > 1 && (
                      <IconButton type="button" label="Remove exclusion" onClick={() => handleRemoveExcludePattern(index)}>
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </IconButton>
                    )}
                  </div>
                ))}
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddExcludePattern}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Add Exclusion
                  </Button>
                </div>
              </div>
            </div>

            {/* Learned Keywords (read-only display) */}
            {mode === 'edit' && definition?.learnedKeywords && definition.learnedKeywords.length > 0 && (
              <div style={sectionDividerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Sparkles style={{ width: 16, height: 16, color: colors.accent.yellow }} />
                  <span style={inlineLabelStyle}>Auto-Learned Keywords</span>
                </div>
                <p style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>
                  Keywords automatically learned from user corrections
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {definition.learnedKeywords.map((lk, index) => (
                    <StatusPill
                      key={index}
                      label={lk.correctionCount ? `${lk.keyword} (${lk.correctionCount} corrections)` : lk.keyword}
                      tone={colors.accent.yellow}
                    />
                  ))}
                </div>
                {definition.lastLearnedAt && (
                  <p style={{ fontSize: 11, color: colors.text.dim, marginTop: 8 }}>
                    Last learned: {new Date(definition.lastLearnedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            {/* Identification Rules */}
            <div>
              <span style={inlineLabelStyle}>Identification Rules</span>
              <p style={{ fontSize: 11, color: colors.text.muted, margin: '4px 0 12px' }}>
                Specific rules for identifying this file type
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {identificationRules.map((rule, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8 }}>
                    <Textarea
                      value={rule}
                      onChange={(e) => handleRuleChange(index, e.target.value)}
                      placeholder="e.g., Look for 'RICS' branding or logos in the document"
                      rows={2}
                      style={{ flex: 1 }}
                    />
                    {identificationRules.length > 1 && (
                      <IconButton type="button" label="Remove rule" onClick={() => handleRemoveRule(index)} style={{ alignSelf: 'flex-start' }}>
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </IconButton>
                    )}
                  </div>
                ))}
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddRule}>
                    <Plus style={{ width: 14, height: 14 }} />
                    Add Rule
                  </Button>
                </div>
              </div>
            </div>

            {/* Category Rules */}
            <Field label="Category Rules (Optional)">
              <Textarea
                id="categoryRules"
                value={categoryRules}
                onChange={(e) => setCategoryRules(e.target.value)}
                placeholder="Explain why this file type belongs to this category..."
                rows={3}
              />
            </Field>

            {/* Example File */}
            <div>
              <span style={inlineLabelStyle}>Example File (Optional)</span>
              <p style={{ fontSize: 11, color: colors.text.muted, margin: '4px 0 12px' }}>
                Upload an example file to help the system learn this file type
              </p>
              <div>
                <label
                  htmlFor="exampleFile"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: 128,
                    border: `2px dashed ${colors.border.mid}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: colors.bg.cardAlt,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                    {exampleFile ? (
                      <>
                        <FileText style={{ width: 40, height: 40, color: colors.accent.blue, marginBottom: 8 }} />
                        <p style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{exampleFile.name}</p>
                        <p style={{ fontSize: 11, color: colors.text.muted }}>
                          {(exampleFile.size / 1024).toFixed(2)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload style={{ width: 40, height: 40, color: colors.text.dim, marginBottom: 8 }} />
                        <p style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600 }}>Click to upload</span> or drag and drop
                        </p>
                        <p style={{ fontSize: 11, color: colors.text.muted }}>PDF, DOC, DOCX, TXT, XLSX, XLS</p>
                      </>
                    )}
                  </div>
                  <input
                    id="exampleFile"
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.txt,.xlsx,.xls"
                    style={{ display: 'none' }}
                  />
                </label>
                {exampleFileStorageId && mode === 'edit' && !exampleFile && (
                  <p style={{ fontSize: 13, color: colors.text.secondary, marginTop: 8 }}>
                    Current example file: {definition?.exampleFileName || 'Uploaded file'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer with buttons */}
          <div style={{ borderTop: `1px solid ${colors.border.default}`, padding: '16px 24px 24px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, width: '100%' }}>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={
                  isSubmitting ||
                  wordCount < 100 ||
                  !fileType.trim() ||
                  !(isCreatingCategory ? newCategoryName.trim() : category.trim()) ||
                  !description.trim()
                }
                style={{ minWidth: 140, justifyContent: 'center' }}
              >
                {isSubmitting ? 'Saving...' : mode === 'create' ? 'Create File Type' : 'Save Changes'}
              </Button>
            </div>
            {/* Debug info */}
            <div style={{ marginTop: 8, fontSize: 11, color: colors.text.dim, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>Word count: {wordCount}/100 {wordCount >= 100 ? '✓' : '✗'}</div>
              <div>File type: {fileType.trim() ? '✓' : '✗'}</div>
              <div>Category: {isCreatingCategory ? (newCategoryName.trim() ? `✓ "${newCategoryName.trim()}"` : '✗') : (category.trim() ? `✓ "${category}"` : '✗')}</div>
              <div>Description: {description.trim() ? '✓' : '✗'}</div>
              <div style={{ color: colors.accent.red }}>
                Button disabled: {isSubmitting || wordCount < 100 || !fileType.trim() || !(isCreatingCategory ? newCategoryName.trim() : category.trim()) || !description.trim() ? 'YES' : 'NO'}
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
