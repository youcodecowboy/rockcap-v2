'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Modal, Button, IconButton, Field, Input, Select, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Folder,
  FolderPlus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Edit2,
  Save,
  X,
} from 'lucide-react';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

interface FolderItem {
  name: string;
  folderKey: string;
  parentKey?: string;
  description?: string;
  order: number;
}

interface FolderTemplateEditorProps {
  templateId: Id<"folderTemplates">;
  folders: FolderItem[];
  level: 'client' | 'project';
  clientType: string;
}

export default function FolderTemplateEditor({
  templateId,
  folders,
  level,
  clientType,
}: FolderTemplateEditorProps) {
  const colors = useColors();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderKey, setNewFolderKey] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string>('none');
  const [newFolderDescription, setNewFolderDescription] = useState('');

  // Mutations
  const addFolder = useMutation(api.folderTemplates.addFolder);
  const updateFolder = useMutation(api.folderTemplates.updateFolder);
  const removeFolder = useMutation(api.folderTemplates.removeFolder);

  // Build folder tree structure
  const buildFolderTree = () => {
    const sortedFolders = [...folders].sort((a, b) => a.order - b.order);
    const rootFolders = sortedFolders.filter(f => !f.parentKey);

    const getChildren = (parentKey: string): FolderItem[] => {
      return sortedFolders.filter(f => f.parentKey === parentKey);
    };

    return { rootFolders, getChildren };
  };

  const { rootFolders, getChildren } = buildFolderTree();

  const toggleExpand = (folderKey: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderKey)) {
      newExpanded.delete(folderKey);
    } else {
      newExpanded.add(folderKey);
    }
    setExpandedFolders(newExpanded);
  };

  const startEditing = (folder: FolderItem) => {
    setEditingFolder(folder.folderKey);
    setEditName(folder.name);
    setEditDescription(folder.description || '');
  };

  const cancelEditing = () => {
    setEditingFolder(null);
    setEditName('');
    setEditDescription('');
  };

  const handleSaveEdit = async (folderKey: string) => {
    try {
      await updateFolder({
        templateId,
        folderKey,
        updates: {
          name: editName,
          description: editDescription || undefined,
        },
      });
      setEditingFolder(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update folder');
    }
  };

  const handleDeleteFolder = async (folderKey: string) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderKey}"?`)) {
      return;
    }

    try {
      await removeFolder({ templateId, folderKey });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete folder');
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderName || !newFolderKey) {
      alert('Please fill in folder name and key');
      return;
    }

    try {
      await addFolder({
        templateId,
        folder: {
          name: newFolderName,
          folderKey: newFolderKey.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          parentKey: newFolderParent === 'none' ? undefined : newFolderParent,
          description: newFolderDescription || undefined,
          order: folders.length + 1,
        },
      });

      setShowAddDialog(false);
      setNewFolderName('');
      setNewFolderKey('');
      setNewFolderParent('none');
      setNewFolderDescription('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to add folder');
    }
  };

  const generateFolderKey = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  };

  const renderFolder = (folder: FolderItem, depth: number = 0) => {
    const children = getChildren(folder.folderKey);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.folderKey);
    const isEditing = editingFolder === folder.folderKey;

    return (
      <div key={folder.folderKey}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 4,
            marginLeft: depth > 0 ? 24 : 0,
            borderLeft: depth > 0 ? `1px dashed ${colors.border.mid}` : undefined,
            paddingLeft: depth > 0 ? 16 : 12,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colors.bg.cardAlt)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {/* Expand/Collapse */}
          <button
            style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.text.muted, background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', padding: 0 }}
            onClick={() => hasChildren && toggleExpand(folder.folderKey)}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown style={{ width: 16, height: 16 }} /> : <ChevronRight style={{ width: 16, height: 16 }} />
            ) : (
              <span style={{ width: 16 }} />
            )}
          </button>

          {/* Folder Icon */}
          <Folder style={{ width: 16, height: 16, color: colors.accent.yellow }} />

          {/* Folder Content */}
          {isEditing ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Folder name"
                style={{ width: 160 }}
              />
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                style={{ width: 192 }}
              />
              <IconButton label="Save" onClick={() => handleSaveEdit(folder.folderKey)}>
                <Save style={{ width: 12, height: 12, color: colors.accent.green }} />
              </IconButton>
              <IconButton label="Cancel" onClick={cancelEditing}>
                <X style={{ width: 12, height: 12, color: colors.accent.red }} />
              </IconButton>
            </div>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>{folder.name}</span>
              <StatusPill label={folder.folderKey} tone={colors.text.muted} />
              {folder.description && (
                <span style={{ fontSize: 11, color: colors.text.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                  {folder.description}
                </span>
              )}

              {/* Actions */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconButton label="Edit folder" onClick={() => startEditing(folder)}>
                  <Edit2 style={{ width: 12, height: 12 }} />
                </IconButton>
                <IconButton label="Delete folder" onClick={() => handleDeleteFolder(folder.folderKey)}>
                  <Trash2 style={{ width: 12, height: 12, color: colors.accent.red }} />
                </IconButton>
              </div>
            </>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Folder Tree */}
      <div style={{ border: `1px solid ${colors.border.default}`, borderRadius: 4, padding: 8, minHeight: 200 }}>
        {rootFolders.length === 0 ? (
          <EmptyState
            icon={<Folder style={{ width: 24, height: 24 }} />}
            title="No folders defined"
            body='Click "Add Folder" to create one'
          />
        ) : (
          rootFolders.map(folder => renderFolder(folder))
        )}
      </div>

      {/* Add Button */}
      <div>
        <Button variant="secondary" size="sm" onClick={() => setShowAddDialog(true)}>
          <FolderPlus style={{ width: 14, height: 14 }} />
          Add Folder
        </Button>
      </div>

      {/* Add Folder Dialog */}
      <Modal
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        title="Add New Folder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddFolder} disabled={!newFolderName || !newFolderKey}>
              Add Folder
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 16 }}>
          Add a new folder to the {level}-level template for {clientType} clients
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Folder Name *">
            <Input
              id="folder-name"
              placeholder="e.g., Contracts"
              value={newFolderName}
              onChange={(e) => {
                setNewFolderName(e.target.value);
                if (!newFolderKey || newFolderKey === generateFolderKey(newFolderName.slice(0, -1))) {
                  setNewFolderKey(generateFolderKey(e.target.value));
                }
              }}
            />
          </Field>

          <Field label="Folder Key *" hint="Unique identifier used internally (lowercase, underscores only)">
            <Input
              id="folder-key"
              placeholder="e.g., contracts"
              value={newFolderKey}
              onChange={(e) => setNewFolderKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              style={{ fontFamily: MONO }}
            />
          </Field>

          <Field label="Parent Folder">
            <Select value={newFolderParent} onChange={(e) => setNewFolderParent(e.target.value)}>
              <option value="none">No parent (root level)</option>
              {folders.filter(f => !f.parentKey).map(f => (
                <option key={f.folderKey} value={f.folderKey}>{f.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="Description (Optional)">
            <Input
              id="folder-description"
              placeholder="e.g., Legal contracts and agreements"
              value={newFolderDescription}
              onChange={(e) => setNewFolderDescription(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
