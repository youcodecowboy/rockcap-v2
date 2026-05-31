'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { DataTable, Modal, Button, IconButton, Field, Input, Select, StatusPill, EmptyState, type Column } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Plus,
  Trash2,
  Edit2,
  FileText,
  Folder,
  ArrowRight,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface FolderItem {
  name: string;
  folderKey: string;
  parentKey?: string;
  description?: string;
  order: number;
}

interface PlacementRule {
  _id: Id<"documentPlacementRules">;
  clientType: string;
  documentType: string;
  category: string;
  targetFolderKey: string;
  targetLevel: 'client' | 'project';
  priority: number;
  description?: string;
}

interface PlacementRulesTableProps {
  clientType: string;
  rules: PlacementRule[];
  clientFolders: FolderItem[];
  projectFolders: FolderItem[];
}

// Common document types for dropdown
const DOCUMENT_TYPES = [
  'Red Book Valuation',
  'RICS Valuation',
  'Term Sheet',
  'Credit Memo',
  'Operating Statement',
  'Financial Model',
  'Contract',
  'Agreement',
  'Invoice',
  'Correspondence',
  'KYC Document',
  'Note',
  'Report',
  'Other',
];

// Common categories for dropdown
const CATEGORIES = [
  'Appraisals',
  'Terms',
  'Credit',
  'Financial',
  'Legal',
  'Correspondence',
  'KYC',
  'Notes',
  'Other',
];

export default function PlacementRulesTable({
  clientType,
  rules,
  clientFolders,
  projectFolders,
}: PlacementRulesTableProps) {
  const colors = useColors();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<PlacementRule | null>(null);

  // Form state
  const [formDocType, setFormDocType] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTargetFolder, setFormTargetFolder] = useState('');
  const [formTargetLevel, setFormTargetLevel] = useState<'client' | 'project'>('project');
  const [formPriority, setFormPriority] = useState('50');
  const [formDescription, setFormDescription] = useState('');

  // Mutations
  const createRule = useMutation(api.placementRules.create);
  const updateRule = useMutation(api.placementRules.update);
  const deleteRule = useMutation(api.placementRules.remove);

  const resetForm = () => {
    setFormDocType('');
    setFormCategory('');
    setFormTargetFolder('');
    setFormTargetLevel('project');
    setFormPriority('50');
    setFormDescription('');
  };

  const openEditDialog = (rule: PlacementRule) => {
    setEditingRule(rule);
    setFormDocType(rule.documentType);
    setFormCategory(rule.category);
    setFormTargetFolder(rule.targetFolderKey);
    setFormTargetLevel(rule.targetLevel);
    setFormPriority(String(rule.priority));
    setFormDescription(rule.description || '');
  };

  const closeDialog = () => {
    setShowAddDialog(false);
    setEditingRule(null);
    resetForm();
  };

  const handleSubmit = async () => {
    if (!formDocType || !formCategory || !formTargetFolder) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      if (editingRule) {
        await updateRule({
          id: editingRule._id,
          documentType: formDocType,
          category: formCategory,
          targetFolderKey: formTargetFolder,
          targetLevel: formTargetLevel,
          priority: parseInt(formPriority) || 50,
          description: formDescription || undefined,
        });
      } else {
        await createRule({
          clientType,
          documentType: formDocType,
          category: formCategory,
          targetFolderKey: formTargetFolder,
          targetLevel: formTargetLevel,
          priority: parseInt(formPriority) || 50,
          description: formDescription || undefined,
        });
      }
      closeDialog();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save rule');
    }
  };

  const handleDelete = async (rule: PlacementRule) => {
    if (!confirm(`Delete rule for "${rule.documentType}"?`)) {
      return;
    }

    try {
      await deleteRule({ id: rule._id });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete rule');
    }
  };

  const getFolderName = (folderKey: string, level: 'client' | 'project') => {
    const folders = level === 'client' ? clientFolders : projectFolders;
    const folder = folders.find(f => f.folderKey === folderKey);
    return folder?.name || folderKey;
  };

  const availableFolders = formTargetLevel === 'client' ? clientFolders : projectFolders;

  // Sort rules by priority descending
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  const columns: Column<PlacementRule>[] = [
    {
      key: 'documentType',
      header: 'Document Type',
      width: 180,
      render: (rule) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText style={{ width: 16, height: 16, color: colors.text.muted }} />
          <span style={{ fontWeight: 500, color: colors.text.primary }}>{rule.documentType}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: 120,
      render: (rule) => <StatusPill label={rule.category} tone={colors.text.muted} />,
    },
    {
      key: 'arrow',
      header: '',
      width: 50,
      render: () => <ArrowRight style={{ width: 16, height: 16, color: colors.text.muted }} />,
    },
    {
      key: 'targetFolder',
      header: 'Target Folder',
      width: 180,
      render: (rule) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Folder style={{ width: 16, height: 16, color: colors.accent.yellow }} />
          <span>{getFolderName(rule.targetFolderKey, rule.targetLevel)}</span>
          <span style={{ fontSize: 11, color: colors.text.muted, fontFamily: MONO }}>
            ({rule.targetFolderKey})
          </span>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Level',
      width: 80,
      render: (rule) => (
        <StatusPill label={rule.targetLevel} tone={rule.targetLevel === 'client' ? colors.entityTypes.client : colors.entityTypes.project} />
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      width: 60,
      mono: true,
      render: (rule) => <span style={{ color: colors.text.muted }}>{rule.priority}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 80,
      render: (rule) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconButton label="Edit rule" onClick={() => openEditDialog(rule)}>
            <Edit2 style={{ width: 12, height: 12 }} />
          </IconButton>
          <IconButton label="Delete rule" onClick={() => handleDelete(rule)}>
            <Trash2 style={{ width: 12, height: 12, color: colors.accent.red }} />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Table */}
      <DataTable
        columns={columns}
        rows={sortedRules}
        getRowKey={(r) => r._id}
        empty={
          <EmptyState
            icon={<FileText style={{ width: 24, height: 24 }} />}
            title="No placement rules defined"
            body='Click "Add Rule" to create one'
          />
        }
      />

      {/* Add Button */}
      <div>
        <Button variant="secondary" size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus style={{ width: 14, height: 14 }} />
          Add Rule
        </Button>
      </div>

      {/* Add/Edit Dialog */}
      <Modal
        open={showAddDialog || !!editingRule}
        onClose={closeDialog}
        title={editingRule ? 'Edit Placement Rule' : 'Add Placement Rule'}
        width={560}
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!formDocType || !formCategory || !formTargetFolder}
            >
              {editingRule ? 'Save Changes' : 'Add Rule'}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 16 }}>
          Define which folder a document type should be filed into for {clientType} clients
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Document Type *">
              <Select value={formDocType} onChange={(e) => setFormDocType(e.target.value)}>
                <option value="" disabled>Select type...</option>
                {DOCUMENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </Select>
            </Field>

            <Field label="Category *">
              <Select value={formCategory} onChange={(e) => setFormCategory(e.target.value)}>
                <option value="" disabled>Select category...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Target Level *">
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: colors.text.primary }}>
                <input
                  type="radio"
                  name="targetLevel"
                  value="project"
                  checked={formTargetLevel === 'project'}
                  onChange={() => {
                    setFormTargetLevel('project');
                    setFormTargetFolder('');
                  }}
                  style={{ width: 16, height: 16, accentColor: colors.accent.blue }}
                />
                <span>Project-level folder</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: colors.text.primary }}>
                <input
                  type="radio"
                  name="targetLevel"
                  value="client"
                  checked={formTargetLevel === 'client'}
                  onChange={() => {
                    setFormTargetLevel('client');
                    setFormTargetFolder('');
                  }}
                  style={{ width: 16, height: 16, accentColor: colors.accent.blue }}
                />
                <span>Client-level folder</span>
              </label>
            </div>
          </Field>

          <Field label="Target Folder *">
            <Select value={formTargetFolder} onChange={(e) => setFormTargetFolder(e.target.value)}>
              <option value="" disabled>Select folder...</option>
              {availableFolders.length === 0 ? (
                <option value="" disabled>
                  No {formTargetLevel}-level folders available
                </option>
              ) : (
                availableFolders.map(folder => (
                  <option key={folder.folderKey} value={folder.folderKey}>
                    {folder.name} ({folder.folderKey})
                  </option>
                ))
              )}
            </Select>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Priority" hint="Higher priority rules take precedence (1-100)">
              <Input
                id="priority"
                type="number"
                min="1"
                max="100"
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
              />
            </Field>

            <Field label="Description">
              <Input
                id="description"
                placeholder="Optional note..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
