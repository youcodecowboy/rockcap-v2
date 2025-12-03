'use client';

import { useState, useMemo } from 'react';
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
import { Plus, Trash2, Save, Upload, FileSpreadsheet, X, ChevronDown, ChevronUp, Edit, Code, Link } from 'lucide-react';

type ModelType = 'appraisal' | 'operating' | 'custom';
type ItemCodeDataType = 'currency' | 'number' | 'percentage' | 'string';

interface EditingItemCode {
  id: string | 'new';
  code: string;
  displayName: string;
  category: string;
  dataType: ItemCodeDataType;
  isActive: boolean;
}

export default function ModelingSettings({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'templates' | 'itemCodes' | 'aliases'>('templates');
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

  // Queries
  const templates = useQuery(api.modelingTemplates.list, {});
  const itemCodes = useQuery(api.extractedItemCodes.list, {});
  const aliases = useQuery(api.itemCodeAliases.list, {});

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
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="itemCodes">Item Codes</TabsTrigger>
            <TabsTrigger value="aliases">Alias Dictionary</TabsTrigger>
          </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-0">
          <div className="space-y-6">
            {/* Upload Section - Collapsible */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <button
                onClick={() => setIsUploadSectionOpen(!isUploadSectionOpen)}
                className="w-full bg-blue-600 text-white px-3 py-2 flex items-center justify-between hover:bg-blue-700 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Upload Template
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
                  <Button onClick={handleUploadTemplate} disabled={isUploading}>
                    <Upload className="w-4 h-4 mr-2" />
                    {isUploading ? 'Uploading...' : 'Upload Template'}
                  </Button>
                </CardContent>
              )}
            </Card>

            {/* Update Template Modal */}
            {updatingTemplateId && (
              <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0 border-blue-200">
                <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
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
                    <Button onClick={handleUpdateTemplate} disabled={isUpdating}>
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

            {/* Templates List */}
            <Card className="hover:shadow-lg transition-shadow rounded-xl overflow-hidden p-0 gap-0">
              <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-white" />
                  <span className="text-xs uppercase tracking-wide" style={{ fontWeight: 600 }}>
                    Template Library
                  </span>
                </div>
              </div>
              <CardContent className="pt-0 pb-6">
                {templates === undefined ? (
                  <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>No templates uploaded yet</p>
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
      </Tabs>
      </div>
    </div>
  );
}
