'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import {
  Panel,
  TabStrip,
  DataTable,
  StatusPill,
  EmptyState,
  Button,
  IconButton,
  Field,
  Input,
  Textarea,
  Select,
  Modal,
  SkeletonTable,
  type Column,
} from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Plus, Edit, Trash2, Upload, FileSpreadsheet, Layers } from 'lucide-react';
import type { ColorPalette } from '@/lib/colors';
import TemplateUploadModal from '@/components/TemplateUploadModal';

type ModelType = 'appraisal' | 'operating' | 'custom';
type NewModelType = 'appraisal' | 'operating' | 'other';

function modelTypeTone(type: ModelType | NewModelType, colors: ColorPalette): string {
  switch (type) {
    case 'appraisal':
      return colors.accent.blue;
    case 'operating':
      return colors.accent.green;
    default:
      return colors.text.muted;
  }
}

export default function ModelingTemplatesPage() {
  const colors = useColors();
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
      const { loadExcelTemplateMetadata } = await import('@/lib/templateLoader');
      await loadExcelTemplateMetadata(fileUrl);

      // Load first sheet to scan for placeholders
      // For now, we'll scan the first sheet only - can be enhanced later
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
        await uploadResponse.text().catch(() => 'Could not read error response');
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

  type NewTemplate = NonNullable<typeof newTemplates>[number];
  type LegacyTemplate = NonNullable<typeof templates>[number];

  const newColumns: Column<NewTemplate>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 500, color: colors.text.primary }}>{t.name}</div>
          <div style={{ fontSize: 11, color: colors.text.muted }}>{t.description || 'No description'}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (t) => <StatusPill label={t.modelType} tone={modelTypeTone(t.modelType, colors)} />,
    },
    { key: 'version', header: 'Version', mono: true, render: (t) => `v${t.version}` },
    { key: 'sheets', header: 'Sheets', mono: true, align: 'right', render: (t) => t.totalSheetCount },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <StatusPill
          label={t.isActive ? 'Active' : 'Inactive'}
          tone={t.isActive ? colors.accent.green : colors.text.dim}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 60,
      render: (t) => (
        <IconButton label="Delete" onClick={() => setDeleteNewTemplateId(t._id)}>
          <Trash2 size={14} style={{ color: colors.accent.red }} />
        </IconButton>
      ),
    },
  ];

  const legacyColumns: Column<LegacyTemplate>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (t) => (
        <div>
          <div style={{ fontWeight: 500, color: colors.text.primary }}>{t.name}</div>
          <div style={{ fontSize: 11, color: colors.text.muted }}>{t.description || 'No description'}</div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (t) => <StatusPill label={t.modelType} tone={modelTypeTone(t.modelType, colors)} />,
    },
    { key: 'version', header: 'Version', mono: true, render: (t) => t.version },
    {
      key: 'placeholders',
      header: 'Placeholders',
      mono: true,
      align: 'right',
      render: (t) => (t.placeholderCodes ? t.placeholderCodes.length : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <StatusPill
          label={t.isActive ? 'Active' : 'Inactive'}
          tone={t.isActive ? colors.accent.green : colors.text.dim}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: 80,
      render: (t) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <IconButton label="Edit" onClick={() => handleEdit(t._id)}>
            <Edit size={14} />
          </IconButton>
          <IconButton label="Delete" onClick={() => setDeleteTemplateId(t._id)}>
            <Trash2 size={14} style={{ color: colors.accent.red }} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div style={{ background: colors.bg.light, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1152, margin: '0 auto', padding: '32px 24px' }}>
        {/* Page Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: colors.text.primary }}>
            Modeling Templates
          </h1>
          <p style={{ marginTop: 8, fontSize: 13, color: colors.text.secondary }}>
            Manage financial model templates for the modeling section
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ marginLeft: -24 }}>
            <TabStrip
              entityType="dashboard"
              activeTab={activeTab}
              onChange={setActiveTab}
              tabs={[
                { id: 'optimized', label: 'Optimized Templates' },
                { id: 'legacy', label: 'Legacy Templates' },
              ]}
            />
          </div>
          {activeTab === 'optimized' && (
            <Button variant="primary" onClick={() => setIsNewUploadOpen(true)}>
              <Plus size={14} />
              Upload Template
            </Button>
          )}
          {activeTab === 'legacy' && (
            <Button variant="secondary" onClick={() => setIsUploadDialogOpen(true)}>
              <Plus size={14} />
              Upload Legacy Template
            </Button>
          )}
        </div>

        {/* Optimized Templates Tab */}
        {activeTab === 'optimized' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                borderRadius: 4,
                border: `1px solid ${colors.accent.blue}40`,
                background: `${colors.accent.blue}15`,
                padding: 14,
              }}
            >
              <p style={{ fontSize: 12, color: colors.text.secondary }}>
                <strong>Optimized Templates</strong> use the new sheet-by-sheet architecture for faster loading,
                lazy sheet loading, and support for dynamic sheet generation (e.g., multi-site models).
              </p>
            </div>

            {newTemplates === undefined ? (
              <SkeletonTable rows={4} cols={6} />
            ) : (
              <DataTable
                rows={newTemplates}
                columns={newColumns}
                getRowKey={(t) => t._id}
                empty={
                  <EmptyState
                    icon={<Layers size={40} />}
                    title="No optimized templates uploaded yet"
                    action={
                      <Button variant="primary" onClick={() => setIsNewUploadOpen(true)}>
                        <Upload size={14} />
                        Upload Your First Template
                      </Button>
                    }
                  />
                }
              />
            )}
          </div>
        )}

        {/* Legacy Templates Tab */}
        {activeTab === 'legacy' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                borderRadius: 4,
                border: `1px solid ${colors.accent.yellow}40`,
                background: `${colors.accent.yellow}15`,
                padding: 14,
              }}
            >
              <p style={{ fontSize: 12, color: colors.text.secondary }}>
                <strong>Legacy Templates</strong> use the original Excel-based system.
                Consider migrating to optimized templates for better performance.
              </p>
            </div>

            {templates === undefined ? (
              <SkeletonTable rows={4} cols={6} />
            ) : (
              <DataTable
                rows={templates}
                columns={legacyColumns}
                getRowKey={(t) => t._id}
                empty={
                  <EmptyState
                    icon={<FileSpreadsheet size={40} />}
                    title="No legacy templates uploaded"
                    action={
                      <Button variant="secondary" onClick={() => setIsUploadDialogOpen(true)}>
                        <Upload size={14} />
                        Upload Legacy Template
                      </Button>
                    }
                  />
                }
              />
            )}
          </div>
        )}

        {/* Upload Dialog */}
        <Modal
          open={isUploadDialogOpen}
          onClose={() => setIsUploadDialogOpen(false)}
          title="Upload Template"
          width={640}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpload} disabled={isUploading}>
                {isUploading ? 'Uploading...' : 'Upload Template'}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
            Upload a new Excel template file (.xlsx) for use in the modeling section
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Template Name *">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Appraisal Model v2.0"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Brief description of this template..."
                rows={3}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Model Type *">
                <Select
                  value={templateModelType}
                  onChange={(e) => setTemplateModelType(e.target.value as ModelType)}
                >
                  <option value="appraisal">Appraisal</option>
                  <option value="operating">Operating</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              <Field label="Version *">
                <Input
                  value={templateVersion}
                  onChange={(e) => setTemplateVersion(e.target.value)}
                  placeholder="1.0.0"
                />
              </Field>
            </div>
            <Field
              label="Template File (.xlsx) *"
              hint={
                selectedFile
                  ? `Selected: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`
                  : undefined
              }
            >
              <Input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} />
            </Field>
          </div>
        </Modal>

        {/* Edit Dialog */}
        <Modal
          open={isEditDialogOpen}
          onClose={() => setIsEditDialogOpen(false)}
          title="Edit Template"
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleUpdate}>
                Update Template
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>Update template metadata</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Template Name *">
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
            </Field>
            <Field label="Description">
              <Textarea
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                rows={3}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Model Type *">
                <Select
                  value={templateModelType}
                  onChange={(e) => setTemplateModelType(e.target.value as ModelType)}
                >
                  <option value="appraisal">Appraisal</option>
                  <option value="operating">Operating</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              <Field label="Version *">
                <Input value={templateVersion} onChange={(e) => setTemplateVersion(e.target.value)} />
              </Field>
            </div>
          </div>
        </Modal>

        {/* Delete Legacy Template Confirmation */}
        <Modal
          open={!!deleteTemplateId}
          onClose={() => setDeleteTemplateId(null)}
          title="Delete Template?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteTemplateId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            This action cannot be undone. This will permanently delete the template.
          </p>
        </Modal>

        {/* Delete Optimized Template Confirmation */}
        <Modal
          open={!!deleteNewTemplateId}
          onClose={() => setDeleteNewTemplateId(null)}
          title="Delete Optimized Template?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDeleteNewTemplateId(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteNewTemplate}>
                Delete
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 12, color: colors.text.secondary }}>
            This action cannot be undone. This will permanently delete the template and all its sheet data.
          </p>
        </Modal>

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
