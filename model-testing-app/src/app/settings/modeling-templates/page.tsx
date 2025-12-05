'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, Upload, FileSpreadsheet, AlertCircle, Layers, Table } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { scanForPlaceholders } from '@/lib/placeholderMapper';
import { loadExcelTemplateMetadata } from '@/lib/templateLoader';
import TemplateUploadModal from '@/components/TemplateUploadModal';

type ModelType = 'appraisal' | 'operating' | 'custom';
type NewModelType = 'appraisal' | 'operating' | 'other';

export default function ModelingTemplatesPage() {
  const [activeTab, setActiveTab] = useState('optimized');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isNewUploadOpen, setIsNewUploadOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<Id<'modelingTemplates'> | null>(null);
  const [deleteNewTemplateId, setDeleteNewTemplateId] = useState<Id<'templateDefinitions'> | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Id<'modelingTemplates'> | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Form state
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateModelType, setTemplateModelType] = useState<ModelType>('custom');
  const [templateVersion, setTemplateVersion] = useState('1.0.0');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Legacy templates
  const templates = useQuery(api.modelingTemplates.list, {});
  const createTemplate = useMutation(api.modelingTemplates.create);
  const updateTemplate = useMutation(api.modelingTemplates.update);
  const removeTemplate = useMutation(api.modelingTemplates.remove);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // New optimized templates
  const newTemplates = useQuery(api.templateDefinitions.listAll, {});
  const deleteNewTemplate = useMutation(api.templateDefinitions.deleteTemplate);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('Please select an Excel file (.xlsx or .xls)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const scanTemplateForPlaceholders = async (file: File): Promise<string[]> => {
    try {
      // Create a temporary URL for the file
      const fileUrl = URL.createObjectURL(file);
      
      // Load template metadata
      const { metadata } = await loadExcelTemplateMetadata(fileUrl);
      
      // Load first sheet to scan for placeholders
      // For now, we'll scan the first sheet only - can be enhanced later
      const placeholderPattern = /<([^>]+)>/g;
      const foundPlaceholders = new Set<string>();
      
      // We need to load the actual data to scan - for now, return empty array
      // This can be enhanced to actually load and scan sheets
      URL.revokeObjectURL(fileUrl);
      
      return Array.from(foundPlaceholders);
    } catch (error) {
      console.error('Error scanning template:', error);
      return [];
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !templateName.trim()) {
      alert('Please provide a template name and select a file');
      return;
    }

    setIsUploading(true);
    try {
      // Step 1: Upload file to Convex storage
      const uploadUrl = await generateUploadUrl();
      
      if (!uploadUrl || typeof uploadUrl !== 'string') {
        throw new Error('Invalid upload URL received from Convex');
      }

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        const statusText = uploadResponse.statusText || 'Unknown error';
        const errorText = await uploadResponse.text().catch(() => 'Could not read error response');
        throw new Error(`Failed to upload file: HTTP ${uploadResponse.status} ${statusText}`);
      }

      const responseText = await uploadResponse.text();
      let fileStorageId: Id<'_storage'>;
      try {
        const responseData = JSON.parse(responseText);
        fileStorageId = responseData.storageId as Id<'_storage'>;
      } catch {
        fileStorageId = responseText.trim() as Id<'_storage'>;
      }

      // Step 2: Scan for placeholder codes (optional, can be done async)
      const placeholderCodes = await scanTemplateForPlaceholders(selectedFile);

      // Step 3: Create template record
      await createTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        modelType: templateModelType,
        fileStorageId,
        version: templateVersion.trim(),
        placeholderCodes: placeholderCodes.length > 0 ? placeholderCodes : undefined,
      });

      // Reset form
      setTemplateName('');
      setTemplateDescription('');
      setTemplateModelType('custom');
      setTemplateVersion('1.0.0');
      setSelectedFile(null);
      setIsUploadDialogOpen(false);
    } catch (error: any) {
      console.error('Error uploading template:', error);
      alert(`Failed to upload template: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = (templateId: Id<'modelingTemplates'>) => {
    const template = templates?.find(t => t._id === templateId);
    if (template) {
      setEditingTemplate(templateId);
      setTemplateName(template.name);
      setTemplateDescription(template.description || '');
      setTemplateModelType(template.modelType);
      setTemplateVersion(template.version);
      setSelectedFile(null);
      setIsEditDialogOpen(true);
    }
  };

  const handleUpdate = async () => {
    if (!editingTemplate || !templateName.trim()) {
      alert('Please provide a template name');
      return;
    }

    try {
      await updateTemplate({
        id: editingTemplate,
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        modelType: templateModelType,
        version: templateVersion.trim(),
      });

      setEditingTemplate(null);
      setIsEditDialogOpen(false);
      setTemplateName('');
      setTemplateDescription('');
      setTemplateModelType('custom');
      setTemplateVersion('1.0.0');
    } catch (error: any) {
      console.error('Error updating template:', error);
      alert(`Failed to update template: ${error.message}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteTemplateId) return;
    try {
      await removeTemplate({ id: deleteTemplateId });
      setDeleteTemplateId(null);
    } catch (error: any) {
      alert(`Failed to delete template: ${error.message}`);
    }
  };

  const handleDeleteNewTemplate = async () => {
    if (!deleteNewTemplateId) return;
    try {
      await deleteNewTemplate({ templateId: deleteNewTemplateId });
      setDeleteNewTemplateId(null);
    } catch (error: any) {
      alert(`Failed to delete template: ${error.message}`);
    }
  };

  const getModelTypeBadgeColor = (type: ModelType | NewModelType) => {
    switch (type) {
      case 'appraisal':
        return 'bg-blue-100 text-blue-800';
      case 'operating':
        return 'bg-green-100 text-green-800';
      case 'custom':
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Modeling Templates</h1>
            <p className="mt-2 text-gray-600">
              Manage financial model templates for the modeling section
            </p>
          </div>
        </div>

        {/* Tabs for Old vs New System */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList>
              <TabsTrigger value="optimized" className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                Optimized Templates
              </TabsTrigger>
              <TabsTrigger value="legacy" className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Legacy Templates
              </TabsTrigger>
            </TabsList>
            
            {activeTab === 'optimized' && (
              <Button onClick={() => setIsNewUploadOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Upload Template
              </Button>
            )}
            {activeTab === 'legacy' && (
              <Button onClick={() => setIsUploadDialogOpen(true)} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Upload Legacy Template
              </Button>
            )}
          </div>

          {/* Optimized Templates Tab */}
          <TabsContent value="optimized">
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Optimized Templates</strong> use the new sheet-by-sheet architecture for faster loading, 
                lazy sheet loading, and support for dynamic sheet generation (e.g., multi-site models).
              </p>
            </div>
            
            {newTemplates === undefined ? (
              <div className="text-center py-12 text-gray-500">Loading templates...</div>
            ) : newTemplates.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Layers className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">No optimized templates uploaded yet</p>
                  <Button onClick={() => setIsNewUploadOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Your First Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {newTemplates.map((template) => (
                  <Card key={template._id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {template.description || 'No description'}
                          </CardDescription>
                        </div>
                        <Badge className={getModelTypeBadgeColor(template.modelType)}>
                          {template.modelType}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Version:</span>
                          <span className="font-medium">v{template.version}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Sheets:</span>
                          <span className="font-medium">{template.totalSheetCount}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Status:</span>
                          <Badge variant={template.isActive ? 'default' : 'secondary'}>
                            {template.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {template.dynamicGroups && template.dynamicGroups.length > 0 && (
                          <div className="text-sm">
                            <span className="text-gray-500">Dynamic Groups:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {template.dynamicGroups.map((group) => (
                                <Badge key={group.groupId} variant="outline" className="text-xs">
                                  {group.label} ({group.sheetIds.length} sheets)
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteNewTemplateId(template._id)}
                            className="flex-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Legacy Templates Tab */}
          <TabsContent value="legacy">
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Legacy Templates</strong> use the original Excel-based system. 
                Consider migrating to optimized templates for better performance.
              </p>
            </div>
            
            {templates === undefined ? (
              <div className="text-center py-12 text-gray-500">Loading templates...</div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600 mb-4">No legacy templates uploaded</p>
                  <Button onClick={() => setIsUploadDialogOpen(true)} variant="outline">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Legacy Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => (
                  <Card key={template._id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          <CardDescription className="mt-1">
                            {template.description || 'No description'}
                          </CardDescription>
                        </div>
                        <Badge className={getModelTypeBadgeColor(template.modelType)}>
                          {template.modelType}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Version:</span>
                          <span className="font-medium">{template.version}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">Status:</span>
                          <Badge variant={template.isActive ? 'default' : 'secondary'}>
                            {template.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                        {template.placeholderCodes && template.placeholderCodes.length > 0 && (
                          <div className="text-sm">
                            <span className="text-gray-500">Placeholders:</span>
                            <span className="ml-2 font-medium">{template.placeholderCodes.length}</span>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(template._id)}
                            className="flex-1"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteTemplateId(template._id)}
                            className="flex-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Upload Dialog */}
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Template</DialogTitle>
              <DialogDescription>
                Upload a new Excel template file (.xlsx) for use in the modeling section
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="template-name">Template Name *</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Appraisal Model v2.0"
                />
              </div>
              <div>
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Brief description of this template..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="template-type">Model Type *</Label>
                  <Select value={templateModelType} onValueChange={(v) => setTemplateModelType(v as ModelType)}>
                    <SelectTrigger id="template-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appraisal">Appraisal</SelectItem>
                      <SelectItem value="operating">Operating</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="template-version">Version *</Label>
                  <Input
                    id="template-version"
                    value={templateVersion}
                    onChange={(e) => setTemplateVersion(e.target.value)}
                    placeholder="1.0.0"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="template-file">Template File (.xlsx) *</Label>
                <Input
                  id="template-file"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                />
                {selectedFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={isUploading}>
                {isUploading ? 'Uploading...' : 'Upload Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Template</DialogTitle>
              <DialogDescription>
                Update template metadata
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="edit-template-name">Template Name *</Label>
                <Input
                  id="edit-template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="edit-template-description">Description</Label>
                <Textarea
                  id="edit-template-description"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-template-type">Model Type *</Label>
                  <Select value={templateModelType} onValueChange={(v) => setTemplateModelType(v as ModelType)}>
                    <SelectTrigger id="edit-template-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appraisal">Appraisal</SelectItem>
                      <SelectItem value="operating">Operating</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-template-version">Version *</Label>
                  <Input
                    id="edit-template-version"
                    value={templateVersion}
                    onChange={(e) => setTemplateVersion(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate}>Update Template</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Legacy Template Confirmation */}
        <AlertDialog open={!!deleteTemplateId} onOpenChange={(open) => !open && setDeleteTemplateId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Template?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the template.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Optimized Template Confirmation */}
        <AlertDialog open={!!deleteNewTemplateId} onOpenChange={(open) => !open && setDeleteNewTemplateId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Optimized Template?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the template and all its sheet data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteNewTemplate} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* New Template Upload Modal */}
        <TemplateUploadModal
          isOpen={isNewUploadOpen}
          onClose={() => setIsNewUploadOpen(false)}
          onSuccess={() => setIsNewUploadOpen(false)}
        />
      </div>
    </div>
  );
}

