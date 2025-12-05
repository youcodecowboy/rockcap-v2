'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Trash2, Save, Upload, FileSpreadsheet, X, ChevronDown, ChevronUp, Edit, Code, Link, FolderOpen, Lock, BookOpen, AlertCircle, CheckCircle2, ArrowRight, Lightbulb, Layers, Calculator, Pencil } from 'lucide-react';
import TemplateUploadModal from './TemplateUploadModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ModelType = 'appraisal' | 'operating' | 'custom';
type NewModelType = 'appraisal' | 'operating' | 'other';
type ItemCodeDataType = 'currency' | 'number' | 'percentage' | 'string';

interface EditingItemCode {
  id: string | 'new';
  code: string;
  displayName: string;
  category: string;
  dataType: ItemCodeDataType;
  isActive: boolean;
}

interface ItemCategory {
  _id: Id<'itemCategories'>;
  name: string;
  normalizedName: string;
  description: string;
  examples: string[];
  isSystem: boolean;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
}

interface EditingCategory {
  id: string | 'new';
  name: string;
  description: string;
  examples: string;
}

export default function ModelingSettings({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'instructions' | 'templates' | 'itemCodes' | 'aliases' | 'categories'>('instructions');
  const [editingCodes, setEditingCodes] = useState<Map<string, EditingItemCode>>(new Map());
  const [newCode, setNewCode] = useState<EditingItemCode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // Template form state
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateModelType, setTemplateModelType] = useState<ModelType>('custom');
  const [templateVersion, setTemplateVersion] = useState('1.0.0');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadSectionOpen, setIsUploadSectionOpen] = useState(false);
  const [updatingTemplateId, setUpdatingTemplateId] = useState<Id<'modelingTemplates'> | null>(null);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // New optimized template state
  const [templateSubTab, setTemplateSubTab] = useState<'optimized' | 'legacy'>('optimized');
  const [isNewUploadOpen, setIsNewUploadOpen] = useState(false);
  const [deleteNewTemplateId, setDeleteNewTemplateId] = useState<Id<'templateDefinitions'> | null>(null);

  // Category form state
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
  const [newCategory, setNewCategory] = useState<EditingCategory | null>(null);

  // Queries
  const templates = useQuery(api.modelingTemplates.list, {});
  const itemCodes = useQuery(api.extractedItemCodes.list, {});
  const aliases = useQuery(api.itemCodeAliases.list, {});
  const itemCategories = useQuery(api.itemCategories.list, {}) as ItemCategory[] | undefined;
  
  // New optimized templates query
  const optimizedTemplates = useQuery(api.templateDefinitions.listAll, {});

  // Mutations - Templates
  const createTemplate = useMutation(api.modelingTemplates.create);
  const updateTemplate = useMutation(api.modelingTemplates.update);
  const removeTemplate = useMutation(api.modelingTemplates.remove);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Mutations - Item Codes
  const createItemCode = useMutation(api.extractedItemCodes.create);
  const updateItemCode = useMutation(api.extractedItemCodes.update);
  const removeItemCode = useMutation(api.extractedItemCodes.remove);

  // Mutations - Aliases
  const removeAlias = useMutation(api.itemCodeAliases.remove);

  // Mutations - Categories
  const createCategory = useMutation(api.itemCategories.create);
  const updateCategory = useMutation(api.itemCategories.update);
  const removeCategory = useMutation(api.itemCategories.remove);
  const seedCategories = useMutation(api.itemCategories.checkAndSeed);

  // Mutations - Optimized Templates
  const deleteOptimizedTemplate = useMutation(api.templateDefinitions.deleteTemplate);

  // Seed categories on first load if empty
  useEffect(() => {
    if (itemCategories && itemCategories.length === 0) {
      seedCategories();
    }
  }, [itemCategories, seedCategories]);

  // Get unique categories from item codes
  const categories = useMemo(() => {
    if (!itemCodes) return [];
    const cats = new Set(itemCodes.map(ic => ic.category));
    return Array.from(cats).sort();
  }, [itemCodes]);

  // Filtered and grouped item codes
  const filteredItemCodes = useMemo(() => {
    if (!itemCodes) return [];
    const query = searchQuery.toLowerCase();
    return itemCodes.filter(ic => {
      const matchesSearch = !searchQuery ||
        ic.code.toLowerCase().includes(query) ||
        ic.displayName.toLowerCase().includes(query) ||
        ic.category.toLowerCase().includes(query);
      const matchesCategory = categoryFilter === 'all' || ic.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [itemCodes, searchQuery, categoryFilter]);

  // Group by category
  const groupedItemCodes = useMemo(() => {
    const groups: Record<string, typeof filteredItemCodes> = {};
    filteredItemCodes.forEach(ic => {
      if (!groups[ic.category]) {
        groups[ic.category] = [];
      }
      groups[ic.category].push(ic);
    });
    return groups;
  }, [filteredItemCodes]);

  // Filtered aliases
  const filteredAliases = useMemo(() => {
    if (!aliases) return [];
    const query = searchQuery.toLowerCase();
    return aliases.filter(a =>
      !searchQuery ||
      a.alias.toLowerCase().includes(query) ||
      a.canonicalCode.toLowerCase().includes(query)
    );
  }, [aliases, searchQuery]);

  const handleAddItemCode = () => {
    setNewCode({
      id: 'new',
      code: '',
      displayName: '',
      category: categories[0] || 'General',
      dataType: 'currency',
      isActive: true,
    });
  };

  const handleSaveItemCode = async (code: EditingItemCode) => {
    if (!code.code.trim() || !code.displayName.trim()) {
      alert('Please provide both code and display name');
      return;
    }

    // Ensure code has angle brackets
    let formattedCode = code.code.trim();
    if (!formattedCode.startsWith('<')) formattedCode = '<' + formattedCode;
    if (!formattedCode.endsWith('>')) formattedCode = formattedCode + '>';

    try {
      if (code.id === 'new') {
        await createItemCode({
          code: formattedCode,
          displayName: code.displayName.trim(),
          category: code.category.trim(),
          dataType: code.dataType,
        });
        setNewCode(null);
      } else {
        await updateItemCode({
          id: code.id as Id<'extractedItemCodes'>,
          code: formattedCode,
          displayName: code.displayName.trim(),
          category: code.category.trim(),
          dataType: code.dataType,
          isActive: code.isActive,
        });
        setEditingCodes(prev => {
          const next = new Map(prev);
          next.delete(code.id);
          return next;
        });
      }
    } catch (error: any) {
      alert(`Failed to save item code: ${error.message}`);
    }
  };

  const handleEditItemCode = (itemCodeId: Id<'extractedItemCodes'>) => {
    const ic = itemCodes?.find(c => c._id === itemCodeId);
    if (ic) {
      setEditingCodes(prev => new Map(prev).set(itemCodeId, {
        id: itemCodeId,
        code: ic.code,
        displayName: ic.displayName,
        category: ic.category,
        dataType: ic.dataType,
        isActive: ic.isActive,
      }));
    }
  };

  const handleDeleteItemCode = async (itemCodeId: Id<'extractedItemCodes'>) => {
    if (!confirm('Delete this item code? This may affect existing codified extractions.')) return;
    try {
      await removeItemCode({ id: itemCodeId });
    } catch (error: any) {
      alert(`Failed to delete item code: ${error.message}`);
    }
  };

  const handleDeleteAlias = async (aliasId: Id<'itemCodeAliases'>) => {
    if (!confirm('Delete this alias?')) return;
    try {
      await removeAlias({ id: aliasId });
    } catch (error: any) {
      alert(`Failed to delete alias: ${error.message}`);
    }
  };

  // Category handlers
  const handleAddCategory = () => {
    setNewCategory({
      id: 'new',
      name: '',
      description: '',
      examples: '',
    });
  };

  const handleEditCategory = (category: ItemCategory) => {
    setEditingCategory({
      id: category._id,
      name: category.name,
      description: category.description,
      examples: category.examples.join(', '),
    });
  };

  const handleSaveCategory = async (cat: EditingCategory) => {
    if (!cat.name.trim() || !cat.description.trim()) {
      alert('Please provide both name and description');
      return;
    }

    const examples = cat.examples
      .split(',')
      .map(e => e.trim())
      .filter(Boolean);

    try {
      if (cat.id === 'new') {
        await createCategory({
          name: cat.name.trim(),
          description: cat.description.trim(),
          examples,
        });
        setNewCategory(null);
      } else {
        await updateCategory({
          id: cat.id as Id<'itemCategories'>,
          name: cat.name.trim(),
          description: cat.description.trim(),
          examples,
        });
        setEditingCategory(null);
      }
    } catch (error: any) {
      alert(`Failed to save category: ${error.message}`);
    }
  };

  const handleDeleteCategory = async (categoryId: Id<'itemCategories'>) => {
    if (!confirm('Delete this category? Make sure no item codes are using it first.')) return;
    try {
      await removeCategory({ id: categoryId });
    } catch (error: any) {
      alert(`Failed to delete category: ${error.message}`);
    }
  };

  // Handler for deleting optimized templates
  const handleDeleteOptimizedTemplate = async () => {
    if (!deleteNewTemplateId) return;
    try {
      await deleteOptimizedTemplate({ templateId: deleteNewTemplateId });
      setDeleteNewTemplateId(null);
    } catch (error: any) {
      alert(`Failed to delete template: ${error.message}`);
    }
  };

  // Helper for model type badge color
  const getModelTypeBadgeColor = (type: ModelType | NewModelType) => {
    switch (type) {
      case 'appraisal':
        return 'bg-blue-100 text-blue-800';
      case 'operating':
        return 'bg-green-100 text-green-800';
      case 'custom':
      case 'other':
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleUploadTemplate = async () => {
    if (!selectedFile || !templateName.trim()) {
      alert('Please provide a template name and select a file');
      return;
    }

    setIsUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const responseText = await uploadResponse.text();
      let fileStorageId: Id<'_storage'>;
      try {
        const responseData = JSON.parse(responseText);
        fileStorageId = responseData.storageId as Id<'_storage'>;
      } catch {
        fileStorageId = responseText.trim() as Id<'_storage'>;
      }

      await createTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        modelType: templateModelType,
        fileStorageId,
        version: templateVersion.trim(),
      });

      setTemplateName('');
      setTemplateDescription('');
      setTemplateModelType('custom');
      setTemplateVersion('1.0.0');
      setSelectedFile(null);
      setIsUploadSectionOpen(false);
    } catch (error: any) {
      alert(`Failed to upload template: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!updatingTemplateId || !updateFile || !updateVersion.trim()) {
      alert('Please select a file and enter a version number');
      return;
    }

    setIsUpdating(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': updateFile.type },
        body: updateFile,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const responseText = await uploadResponse.text();
      let fileStorageId: Id<'_storage'>;
      try {
        const responseData = JSON.parse(responseText);
        fileStorageId = responseData.storageId as Id<'_storage'>;
      } catch {
        fileStorageId = responseText.trim() as Id<'_storage'>;
      }

      await updateTemplate({
        id: updatingTemplateId,
        fileStorageId,
        version: updateVersion.trim(),
      });

      setUpdatingTemplateId(null);
      setUpdateVersion('');
      setUpdateFile(null);
      alert('Template updated successfully!');
    } catch (error: any) {
      alert(`Failed to update template: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-auto" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full pb-24">
        {/* Page Title */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif', fontWeight: 700 }}>
              Modeling Settings
            </h1>
            <p className="mt-2 text-gray-600" style={{ fontWeight: 400 }}>
              Manage templates, item codes, and aliases
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-600 hover:text-gray-900">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="itemCodes">Item Codes</TabsTrigger>
            <TabsTrigger value="aliases">Alias Dictionary</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
          </TabsList>

        {/* Instructions Tab */}
        <TabsContent value="instructions" className="mt-0">
          <div className="space-y-6">
            {/* Overview Card */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-indigo-600 text-white px-3 py-2 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  Template Placeholder Guide
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6">
                <p className="text-gray-600 mb-4">
                  This guide explains how to set up placeholders in your Excel templates so that values from the Data Library 
                  are automatically inserted when you run a model.
                </p>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Two Types of Placeholders</p>
                      <p className="text-sm text-indigo-700 mt-1">
                        <strong>Specific Placeholders</strong> match exact item codes (e.g., <code className="bg-indigo-100 px-1 rounded">&lt;stamp.duty&gt;</code>). 
                        <strong> Category Fallbacks</strong> capture any unmatched items within a category.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Specific Placeholders Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-emerald-600 text-white px-3 py-2 flex items-center gap-2">
                <Code className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  1. Specific Placeholders
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6 space-y-4">
                <p className="text-gray-600">
                  Use specific placeholders when you know the exact item code you want to insert. The template already has 
                  the label; only the value is replaced.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                  <div className="text-gray-500 mb-2">Format:</div>
                  <code className="text-emerald-700">&lt;item.code&gt;</code>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Examples:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 rounded-lg p-3">
                      <code className="text-emerald-700 text-sm">&lt;stamp.duty&gt;</code>
                      <p className="text-xs text-gray-500 mt-1">Inserts the Stamp Duty value</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <code className="text-emerald-700 text-sm">&lt;engineers&gt;</code>
                      <p className="text-xs text-gray-500 mt-1">Inserts the Engineers fee value</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <code className="text-emerald-700 text-sm">&lt;interest.rate&gt;</code>
                      <p className="text-xs text-gray-500 mt-1">Inserts the Interest Rate value</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                      <code className="text-emerald-700 text-sm">&lt;plot.1&gt;</code>
                      <p className="text-xs text-gray-500 mt-1">Inserts Plot 1 value</p>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-900">Template Setup</p>
                      <p className="text-sm text-emerald-700 mt-1">
                        Your template should already have a label like &quot;Stamp Duty&quot; in one column. 
                        Place <code className="bg-emerald-100 px-1 rounded">&lt;stamp.duty&gt;</code> in the adjacent value column.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Category Fallback Placeholders Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-amber-600 text-white px-3 py-2 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  2. Category Fallback Placeholders
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6 space-y-4">
                <p className="text-gray-600">
                  Use category fallbacks to capture items that don&apos;t have a specific placeholder. These are <strong>paired placeholders</strong> — 
                  one for the name and one for the value, placed in adjacent columns on the same row.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm space-y-2">
                  <div className="text-gray-500 mb-2">Format (paired on same row):</div>
                  <div className="flex items-center gap-3">
                    <code className="text-amber-700">&lt;all.{'{category}'}.name&gt;</code>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 text-xs">Item&apos;s original name</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <code className="text-amber-700">&lt;all.{'{category}'}.value&gt;</code>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600 text-xs">Item&apos;s value</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Example Template Layout:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">Row</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">Name Column</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">Value Column</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="px-3 py-2 text-gray-500 text-xs">5</td>
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.professional.fees.name&gt;</td>
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.professional.fees.value&gt;</td>
                        </tr>
                        <tr className="border-b">
                          <td className="px-3 py-2 text-gray-500 text-xs">6</td>
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.professional.fees.name&gt;</td>
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.professional.fees.value&gt;</td>
                        </tr>
                        <tr className="border-b">
                          <td className="px-3 py-2 text-gray-500 text-xs">7</td>
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.professional.fees.name&gt;</td>
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.professional.fees.value&gt;</td>
                        </tr>
                        <tr className="bg-gray-50">
                          <td className="px-3 py-2 text-gray-500 text-xs italic">...</td>
                          <td className="px-3 py-2 text-gray-500 text-xs italic" colSpan={2}>Copy rows as needed for 15-20 fallback slots</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">FIFO Row Filling</p>
                      <p className="text-sm text-amber-700 mt-1">
                        Rows are filled top-to-bottom with remaining items. Use the same placeholder on multiple rows — 
                        the system will automatically fill each row with the next available item. Unfilled rows stay as placeholders 
                        until you click <strong>Clear Unused</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Supported Categories Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-violet-600 text-white px-3 py-2 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  3. Supported Category Codes
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6">
                <p className="text-gray-600 mb-4">
                  Use these normalized category codes in your fallback placeholders:
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { code: 'site.costs', label: 'Site Costs' },
                    { code: 'professional.fees', label: 'Professional Fees' },
                    { code: 'construction.costs', label: 'Construction Costs' },
                    { code: 'financing.costs', label: 'Financing Costs' },
                    { code: 'disposal.costs', label: 'Disposal Costs' },
                    { code: 'plots', label: 'Plots' },
                    { code: 'revenue', label: 'Revenue' },
                    { code: 'other', label: 'Other' },
                  ].map(cat => (
                    <div key={cat.code} className="bg-violet-50 rounded-lg p-3 text-center">
                      <code className="text-violet-700 text-sm font-medium">{cat.code}</code>
                      <p className="text-xs text-gray-500 mt-1">{cat.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-4">
                  Note: You can add custom categories in the Categories tab. Custom categories will also work with fallback placeholders.
                </p>
              </CardContent>
            </Card>

            {/* Duplicate Prevention Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  4. Per-Sheet Duplicate Prevention
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Smart per-sheet deduplication</p>
                      <p className="text-sm text-blue-700 mt-1">
                        When an item is matched to a specific placeholder (like <code className="bg-blue-100 px-1 rounded">&lt;stamp.duty&gt;</code>) on a sheet, 
                        it is excluded from default category fallbacks <strong>on that same sheet only</strong>. The same item can still appear on other sheets.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">How it works:</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0">1</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">First Pass: Specific Matching (All Sheets)</p>
                        <p className="text-xs text-gray-500">System fills ALL <code>&lt;stamp.duty&gt;</code> placeholders everywhere, unlimited</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0">2</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Second Pass: Default Category Fallbacks (Per-Sheet)</p>
                        <p className="text-xs text-gray-500">For each sheet, items with specific placeholders ON THAT SHEET are excluded from fallbacks</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center flex-shrink-0">✓</div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Result: No Duplicates Per Sheet</p>
                        <p className="text-xs text-gray-500">Stamp Duty won&apos;t appear twice on Sheet 1, but CAN appear on both Sheet 1 and Sheet 2</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Advanced Multi-Sheet & Numbered Sets Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-purple-600 text-white px-3 py-2 flex items-center gap-2">
                <Code className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  5. Advanced: Multi-Sheet & Numbered Sets
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6 space-y-4">
                <p className="text-gray-600">
                  For complex multi-sheet templates, use these advanced features to control how data populates across sheets.
                </p>

                {/* Specific Codes Behavior */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-900">Specific Codes: Unlimited Everywhere</p>
                      <p className="text-sm text-emerald-700 mt-1">
                        <code className="bg-emerald-100 px-1 rounded">&lt;plot.1&gt;</code> can appear 100 times across all sheets. 
                        Every occurrence gets filled with the same value.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Default Category Fallbacks */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-900">Default Fallbacks: Per-Sheet Deduplication</p>
                      <p className="text-sm text-amber-700 mt-1">
                        <code className="bg-amber-100 px-1 rounded">&lt;all.plots.name&gt;</code> excludes items that have specific placeholders 
                        <strong> on the same sheet</strong>. The same items can appear in fallbacks on different sheets.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Numbered Sets */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-900">Numbered Sets: Full Copies</p>
                      <p className="text-sm text-purple-700 mt-1">
                        Use <code className="bg-purple-100 px-1 rounded">&lt;all.plots.name.1&gt;</code> to get a <strong>full copy</strong> of ALL items, 
                        regardless of specific placements. Numbered sets ignore deduplication rules.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Example Table */}
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Example: Same Sheet with Specific + Fallbacks</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">Placeholder</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">Fills With</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="px-3 py-2 font-mono text-emerald-700 text-xs">&lt;plot.1&gt;</td>
                          <td className="px-3 py-2 text-xs text-gray-600">Plot 1 (specific)</td>
                        </tr>
                        <tr className="border-b">
                          <td className="px-3 py-2 font-mono text-emerald-700 text-xs">&lt;plot.2&gt;</td>
                          <td className="px-3 py-2 text-xs text-gray-600">Plot 2 (specific)</td>
                        </tr>
                        <tr className="border-b bg-amber-50">
                          <td className="px-3 py-2 font-mono text-amber-700 text-xs">&lt;all.plots.name&gt;</td>
                          <td className="px-3 py-2 text-xs text-amber-700">Plot 3, Unit Count (excludes Plot 1 &amp; 2)</td>
                        </tr>
                        <tr className="bg-purple-50">
                          <td className="px-3 py-2 font-mono text-purple-700 text-xs">&lt;all.plots.name.1&gt;</td>
                          <td className="px-3 py-2 text-xs text-purple-700">Plot 1, Plot 2, Plot 3, Unit Count (full copy)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* When to Use */}
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">When to use numbered sets:</p>
                  <ul className="text-xs text-gray-600 space-y-1 ml-4 list-disc">
                    <li>You need a complete list of items in a summary section, even if they appear elsewhere specifically</li>
                    <li>You want independent copies of category data in different areas of the same sheet</li>
                    <li>You need to duplicate category data multiple times (use .1, .2, .3, etc.)</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Computed Category Totals Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-3 py-2 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  6. Computed Category Totals
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6 space-y-4">
                <p className="text-gray-600">
                  The system automatically computes totals for each category. These totals are available as exportable 
                  item codes and can be used in your templates just like any other code.
                </p>
                
                <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm space-y-2">
                  <div className="text-gray-500 mb-2">Auto-generated codes:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <code className="text-blue-700">&lt;total.construction.costs&gt;</code>
                    <code className="text-blue-700">&lt;total.professional.fees&gt;</code>
                    <code className="text-blue-700">&lt;total.development.costs&gt;</code>
                    <code className="text-blue-700">&lt;total.site.costs&gt;</code>
                    <code className="text-blue-700">&lt;total.financing&gt;</code>
                    <code className="text-blue-700">&lt;total.revenue&gt;</code>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Using in Templates:</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <code className="text-blue-700 text-sm">&lt;total.construction.costs&gt;</code>
                      <p className="text-xs text-blue-600 mt-1">Sum of all Construction Costs items</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <code className="text-blue-700 text-sm">&lt;total.professional.fees&gt;</code>
                      <p className="text-xs text-blue-600 mt-1">Sum of all Professional Fees items</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Pencil className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">Override Capability</p>
                      <p className="text-sm text-blue-700 mt-1">
                        You can manually override any auto-computed total by clicking the edit icon in the Data Library. 
                        Click &quot;Use Computed&quot; to revert to the auto-calculated value.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-indigo-900">Auto-Update Behavior</p>
                      <p className="text-sm text-indigo-700 mt-1">
                        Category totals automatically update when you add, remove, or modify items within that category. 
                        Use these codes when you need a summary total without manually specifying each item.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Template Setup Tips Section */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-gray-800 text-white px-3 py-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-white" />
                <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                  7. Template Setup Tips
                </span>
              </div>
              <CardContent className="pt-4 pb-6 px-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Leave buffer rows for fallbacks</p>
                      <p className="text-xs text-gray-500">Include 15-20 fallback placeholder rows per category to accommodate varying data</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Don&apos;t rely on row insertion</p>
                      <p className="text-xs text-gray-500">The system fills existing rows, it doesn&apos;t insert new ones (which would break formulas)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Unfilled slots are cleared</p>
                      <p className="text-xs text-gray-500">Empty fallback placeholders are replaced with blank values automatically</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Check for overflow warnings</p>
                      <p className="text-xs text-gray-500">If more items exist than slots, you&apos;ll see a warning listing what couldn&apos;t fit</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Use the Item Codes tab</p>
                      <p className="text-xs text-gray-500">Review and manage all available codes to know what specific placeholders you can use</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-0">
          <div className="space-y-6">
            {/* Sub-tabs for Optimized vs Legacy */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button
                  variant={templateSubTab === 'optimized' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTemplateSubTab('optimized')}
                  className="gap-2"
                >
                  <Layers className="w-4 h-4" />
                  Optimized Templates
                </Button>
                <Button
                  variant={templateSubTab === 'legacy' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTemplateSubTab('legacy')}
                  className="gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Legacy Templates
                </Button>
              </div>
              {templateSubTab === 'optimized' && (
                <Button onClick={() => setIsNewUploadOpen(true)} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Upload Template
                </Button>
              )}
            </div>

            {/* Optimized Templates Sub-tab */}
            {templateSubTab === 'optimized' && (
              <>
                {/* Info Banner */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Optimized Templates</strong> support dynamic sheet generation for multi-site models. 
                    Sheets with placeholders like <code className="bg-blue-100 px-1 rounded">{'{N}'}</code> will be duplicated 
                    automatically when running a model.
                  </p>
                </div>

                {/* Optimized Templates List */}
                <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                  <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-white" />
                      <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                        Optimized Template Library
                      </span>
                    </div>
                  </div>
                  <CardContent className="pt-0 pb-6">
                    {optimizedTemplates === undefined ? (
                      <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : optimizedTemplates.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Layers className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <p className="font-medium">No optimized templates yet</p>
                        <p className="text-sm mt-1">Upload a template to get started with dynamic sheets</p>
                        <Button className="mt-4" onClick={() => setIsNewUploadOpen(true)}>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Your First Template
                        </Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-gray-200">
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Name</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Type</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Version</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Sheets</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Dynamic Groups</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Status</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {optimizedTemplates.map((template) => (
                            <TableRow key={template._id} className="hover:bg-gray-50">
                              <TableCell>
                                <div>
                                  <span className="font-medium">{template.name}</span>
                                  {template.description && (
                                    <p className="text-xs text-gray-500 truncate max-w-xs">{template.description}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={getModelTypeBadgeColor(template.modelType)}>
                                  {template.modelType}
                                </Badge>
                              </TableCell>
                              <TableCell>v{template.version}</TableCell>
                              <TableCell>{template.totalSheetCount}</TableCell>
                              <TableCell>
                                {template.dynamicGroups && template.dynamicGroups.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {template.dynamicGroups.map((group) => (
                                      <Badge key={group.groupId} variant="outline" className="text-xs">
                                        {group.label} ({group.sheetIds.length})
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 text-xs">None</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {template.isActive ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800 border-gray-200">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteNewTemplateId(template._id)}
                                  className="text-red-600 hover:text-red-700"
                                  title="Delete template"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Legacy Templates Sub-tab */}
            {templateSubTab === 'legacy' && (
              <>
                {/* Info Banner */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>Legacy Templates</strong> use the original Excel file storage. 
                    Consider migrating to Optimized Templates for better performance and dynamic sheet support.
                  </p>
                </div>

                {/* Upload Section - Collapsible */}
                <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                  <button
                    onClick={() => setIsUploadSectionOpen(!isUploadSectionOpen)}
                    className="w-full bg-amber-600 text-white px-3 py-2 flex items-center justify-between hover:bg-amber-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-white" />
                      <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                        Upload Legacy Template
                      </span>
                    </div>
                    {isUploadSectionOpen ? (
                      <ChevronUp className="w-4 h-4 text-white" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-white" />
                    )}
                  </button>
                  {isUploadSectionOpen && (
                    <CardContent className="pt-4 pb-6 px-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Template Name *</Label>
                        <Input
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          placeholder="e.g., Appraisal Model v2.0"
                        />
                      </div>
                      <div>
                        <Label>Model Type *</Label>
                        <Select value={templateModelType} onValueChange={(v) => setTemplateModelType(v as ModelType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="appraisal">Appraisal</SelectItem>
                            <SelectItem value="operating">Operating</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Version *</Label>
                        <Input
                          value={templateVersion}
                          onChange={(e) => setTemplateVersion(e.target.value)}
                          placeholder="1.0.0"
                        />
                      </div>
                      <div>
                        <Label>Template File (.xlsx) *</Label>
                        <Input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea
                        value={templateDescription}
                        onChange={(e) => setTemplateDescription(e.target.value)}
                        placeholder="Brief description..."
                        rows={2}
                      />
                    </div>
                      <Button onClick={handleUploadTemplate} disabled={isUploading} className="bg-amber-600 hover:bg-amber-700">
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploading ? 'Uploading...' : 'Upload Template'}
                      </Button>
                    </CardContent>
                  )}
                </Card>

                {/* Update Template Modal */}
                {updatingTemplateId && (
                  <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 border-amber-200">
                    <div className="bg-amber-600 text-white px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Edit className="w-4 h-4 text-white" />
                        <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                          Update Template
                        </span>
                      </div>
                    </div>
                    <CardContent className="pt-4 pb-6 px-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>New Version *</Label>
                          <Input
                            value={updateVersion}
                            onChange={(e) => setUpdateVersion(e.target.value)}
                            placeholder="e.g., 2.0.0"
                          />
                        </div>
                        <div>
                          <Label>Template File (.xlsx) *</Label>
                          <Input
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={(e) => setUpdateFile(e.target.files?.[0] || null)}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleUpdateTemplate} disabled={isUpdating} className="bg-amber-600 hover:bg-amber-700">
                          <Upload className="w-4 h-4 mr-2" />
                          {isUpdating ? 'Updating...' : 'Update Template'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setUpdatingTemplateId(null);
                            setUpdateVersion('');
                            setUpdateFile(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Legacy Templates List */}
                <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                  <div className="bg-amber-600 text-white px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-white" />
                      <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                        Legacy Template Library
                      </span>
                    </div>
                  </div>
                  <CardContent className="pt-0 pb-6">
                    {templates === undefined ? (
                      <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : templates.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                        <p>No legacy templates uploaded</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-gray-200">
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Name</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Type</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Version</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Status</TableHead>
                            <TableHead className="text-xs font-semibold text-gray-700 uppercase">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {templates.map((template) => (
                            <TableRow key={template._id} className="cursor-pointer hover:bg-gray-50">
                              <TableCell className="font-medium">{template.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">{template.modelType}</Badge>
                              </TableCell>
                              <TableCell>{template.version}</TableCell>
                              <TableCell>
                                {template.isActive ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800 border-gray-200">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setUpdatingTemplateId(template._id);
                                      setUpdateVersion('');
                                      setUpdateFile(null);
                                    }}
                                    title="Update template file"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeTemplate({ id: template._id });
                                    }}
                                    className="text-red-600 hover:text-red-700"
                                    title="Delete template"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* Item Codes Tab */}
        <TabsContent value="itemCodes" className="mt-0">
          <div className="space-y-6">
            {/* Search and Actions */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-emerald-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Item Codes Library
                  </span>
                  <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                    {itemCodes?.length || 0} codes
                  </Badge>
                </div>
                <Button 
                  size="sm"
                  onClick={handleAddItemCode}
                  className="bg-black text-white hover:bg-gray-800"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item Code
                </Button>
              </div>
              <CardContent className="pt-4 pb-4 px-6">
                <div className="flex gap-4 items-center">
                  <Input
                    placeholder="Search codes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-xs"
                  />
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* New Item Code Form */}
            {newCode && (
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 border-emerald-200">
                <div className="bg-emerald-600 text-white px-3 py-2">
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Add New Item Code
                  </span>
                </div>
                <CardContent className="pt-4 pb-6 px-6">
                  <div className="grid grid-cols-5 gap-4">
                    <div>
                      <Label>Code *</Label>
                      <Input
                        value={newCode.code}
                        onChange={(e) => setNewCode({ ...newCode, code: e.target.value })}
                        placeholder="e.g., build.cost"
                        className="font-mono"
                      />
                      <p className="text-xs text-gray-500 mt-1">Will be formatted as &lt;code&gt;</p>
                    </div>
                    <div>
                      <Label>Display Name *</Label>
                      <Input
                        value={newCode.displayName}
                        onChange={(e) => setNewCode({ ...newCode, displayName: e.target.value })}
                        placeholder="e.g., Build Cost"
                      />
                    </div>
                    <div>
                      <Label>Category *</Label>
                      <Input
                        value={newCode.category}
                        onChange={(e) => setNewCode({ ...newCode, category: e.target.value })}
                        placeholder="e.g., Construction"
                        list="category-suggestions"
                      />
                      <datalist id="category-suggestions">
                        {categories.map(cat => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Select value={newCode.dataType} onValueChange={(v) => setNewCode({ ...newCode, dataType: v as ItemCodeDataType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="currency">Currency</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="string">String</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <Button onClick={() => handleSaveItemCode(newCode)} className="bg-emerald-600 hover:bg-emerald-700">
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setNewCode(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Item Codes by Category */}
            {itemCodes === undefined ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : Object.keys(groupedItemCodes).length === 0 ? (
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                <CardContent className="py-12">
                  <div className="text-center text-gray-500">
                    <Code className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium">No item codes yet</p>
                    <p className="text-sm mt-1">Item codes will appear here as you confirm mappings in the Data Library</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              Object.entries(groupedItemCodes).sort(([a], [b]) => a.localeCompare(b)).map(([category, codes]) => (
                <Card key={category} className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                  <div className="bg-gray-100 text-gray-900 px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{category}</span>
                      <Badge variant="secondary" className="text-xs">{codes.length}</Badge>
                    </div>
                  </div>
                  <CardContent className="pt-0 pb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-gray-200">
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase w-48">Code</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase">Display Name</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase w-32">Type</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase w-24">Status</TableHead>
                          <TableHead className="text-xs font-semibold text-gray-700 uppercase w-32">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {codes.map((ic) => {
                          const editing = editingCodes.get(ic._id);
                          if (editing) {
                            return (
                              <TableRow key={ic._id} className="bg-yellow-50">
                                <TableCell>
                                  <Input
                                    value={editing.code}
                                    onChange={(e) => setEditingCodes(prev => {
                                      const next = new Map(prev);
                                      next.set(ic._id, { ...editing, code: e.target.value });
                                      return next;
                                    })}
                                    className="font-mono text-sm"
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    value={editing.displayName}
                                    onChange={(e) => setEditingCodes(prev => {
                                      const next = new Map(prev);
                                      next.set(ic._id, { ...editing, displayName: e.target.value });
                                      return next;
                                    })}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Select value={editing.dataType} onValueChange={(v) => setEditingCodes(prev => {
                                    const next = new Map(prev);
                                    next.set(ic._id, { ...editing, dataType: v as ItemCodeDataType });
                                    return next;
                                  })}>
                                    <SelectTrigger className="w-28">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="currency">Currency</SelectItem>
                                      <SelectItem value="number">Number</SelectItem>
                                      <SelectItem value="percentage">Percentage</SelectItem>
                                      <SelectItem value="string">String</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Badge className={editing.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                                    {editing.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSaveItemCode(editing)}
                                      className="text-emerald-600 hover:text-emerald-700"
                                    >
                                      <Save className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setEditingCodes(prev => {
                                        const next = new Map(prev);
                                        next.delete(ic._id);
                                        return next;
                                      })}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          }

                          return (
                            <TableRow key={ic._id} className="hover:bg-gray-50">
                              <TableCell className="font-mono text-sm text-emerald-700">{ic.code}</TableCell>
                              <TableCell>{ic.displayName}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize text-xs">{ic.dataType}</Badge>
                              </TableCell>
                              <TableCell>
                                {ic.isActive ? (
                                  <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>
                                ) : (
                                  <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">Inactive</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditItemCode(ic._id)}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteItemCode(ic._id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Aliases Tab */}
        <TabsContent value="aliases" className="mt-0">
          <div className="space-y-6">
            {/* Search */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-violet-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Alias Dictionary
                  </span>
                  <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                    {aliases?.length || 0} aliases
                  </Badge>
                </div>
              </div>
              <CardContent className="pt-4 pb-4 px-6">
                <Input
                  placeholder="Search aliases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-xs"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Aliases are automatically created when you map extracted items to codes. They enable fast matching for future extractions.
                </p>
              </CardContent>
            </Card>

            {/* Aliases Table */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <CardContent className="pt-0 pb-6">
                {aliases === undefined ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : filteredAliases.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Link className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium">No aliases yet</p>
                    <p className="text-sm mt-1">Aliases are created when you confirm item mappings in the Data Library</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-gray-200">
                        <TableHead className="text-xs font-semibold text-gray-700 uppercase">Alias (Original Term)</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-700 uppercase">Maps To (Canonical Code)</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-700 uppercase w-28">Confidence</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-700 uppercase w-32">Source</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-700 uppercase w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAliases.map((alias) => (
                        <TableRow key={alias._id} className="hover:bg-gray-50">
                          <TableCell className="font-medium">{alias.alias}</TableCell>
                          <TableCell className="font-mono text-sm text-violet-700">{alias.canonicalCode}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-violet-500"
                                  style={{ width: `${alias.confidence * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{Math.round(alias.confidence * 100)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {alias.source.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAlias(alias._id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="mt-0">
          <div className="space-y-6">
            {/* Header */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-amber-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Category Library
                  </span>
                  <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                    {itemCategories?.length || 0} categories
                  </Badge>
                </div>
                <Button 
                  size="sm"
                  onClick={handleAddCategory}
                  className="bg-black text-white hover:bg-gray-800"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </div>
              <CardContent className="pt-4 pb-4 px-6">
                <p className="text-sm text-gray-600">
                  Categories help organize item codes and improve LLM codification accuracy. 
                  Add descriptions and examples to help the AI understand what types of items belong in each category.
                </p>
              </CardContent>
            </Card>

            {/* New Category Form */}
            {newCategory && (
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 border-amber-200">
                <div className="bg-amber-600 text-white px-3 py-2">
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Add New Category
                  </span>
                </div>
                <CardContent className="pt-4 pb-6 px-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Category Name *</Label>
                      <Input
                        value={newCategory.name}
                        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                        placeholder="e.g., Professional Fees"
                      />
                    </div>
                    <div>
                      <Label>Examples (comma-separated)</Label>
                      <Input
                        value={newCategory.examples}
                        onChange={(e) => setNewCategory({ ...newCategory, examples: e.target.value })}
                        placeholder="e.g., Engineers, Architects, Solicitors"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Description *</Label>
                    <Textarea
                      value={newCategory.description}
                      onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                      placeholder="Describe what types of items belong in this category..."
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      This description helps the AI understand what items to categorize here
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleSaveCategory(newCategory)} className="bg-amber-600 hover:bg-amber-700">
                      <Save className="w-4 h-4 mr-2" />
                      Save Category
                    </Button>
                    <Button variant="outline" onClick={() => setNewCategory(null)}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Categories List */}
            {itemCategories === undefined ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : itemCategories.length === 0 ? (
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                <CardContent className="py-12">
                  <div className="text-center text-gray-500">
                    <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium">No categories yet</p>
                    <p className="text-sm mt-1 mb-4">Click the button below to seed default categories</p>
                    <Button onClick={() => seedCategories()} className="bg-amber-600 hover:bg-amber-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Seed Default Categories
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {itemCategories.map((category) => {
                  const isEditing = editingCategory?.id === category._id;
                  
                  if (isEditing && editingCategory) {
                    return (
                      <Card key={category._id} className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 border-amber-200">
                        <div className="bg-amber-600 text-white px-3 py-2 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                            Edit Category
                          </span>
                        </div>
                        <CardContent className="pt-4 pb-6 px-6 space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label>Category Name *</Label>
                              <Input
                                value={editingCategory.name}
                                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                placeholder="e.g., Professional Fees"
                                disabled={category.isSystem}
                              />
                              {category.isSystem && (
                                <p className="text-xs text-amber-600 mt-1">System category names cannot be changed</p>
                              )}
                            </div>
                            <div>
                              <Label>Examples (comma-separated)</Label>
                              <Input
                                value={editingCategory.examples}
                                onChange={(e) => setEditingCategory({ ...editingCategory, examples: e.target.value })}
                                placeholder="e.g., Engineers, Architects, Solicitors"
                              />
                            </div>
                          </div>
                          <div>
                            <Label>Description *</Label>
                            <Textarea
                              value={editingCategory.description}
                              onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                              placeholder="Describe what types of items belong in this category..."
                              rows={3}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => handleSaveCategory(editingCategory)} className="bg-amber-600 hover:bg-amber-700">
                              <Save className="w-4 h-4 mr-2" />
                              Save
                            </Button>
                            <Button variant="outline" onClick={() => setEditingCategory(null)}>
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }

                  return (
                    <Card key={category._id} className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
                      <div className="bg-gray-100 text-gray-900 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FolderOpen className="w-5 h-5 text-amber-600" />
                          <span className="font-semibold">{category.name}</span>
                          {category.isSystem && (
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              System
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditCategory(category)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!category.isSystem && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCategory(category._id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <CardContent className="pt-3 pb-4 px-4">
                        <p className="text-sm text-gray-600 mb-3">{category.description}</p>
                        
                        {/* Fallback Placeholder Codes */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                          <span className="text-xs font-medium text-amber-800 uppercase">Category Fallback Placeholders:</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <code className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-mono">
                              &lt;all.{category.normalizedName}.name&gt;
                            </code>
                            <code className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-mono">
                              &lt;all.{category.normalizedName}.value&gt;
                            </code>
                          </div>
                        </div>
                        
                        <div>
                          <span className="text-xs font-medium text-gray-500 uppercase">Examples:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {category.examples.map((example, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {example}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      </div>

      {/* New Template Upload Modal */}
      <TemplateUploadModal
        isOpen={isNewUploadOpen}
        onClose={() => setIsNewUploadOpen(false)}
        onSuccess={() => {
          setIsNewUploadOpen(false);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNewTemplateId} onOpenChange={(open) => !open && setDeleteNewTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot be undone. All associated sheet data will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOptimizedTemplate} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
