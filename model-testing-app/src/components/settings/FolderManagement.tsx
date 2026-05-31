'use client';

import { useState } from 'react';
import { Folder, FolderPlus, Trash2, Edit2, Check, X, Lock } from 'lucide-react';
import { Panel, Button, IconButton, Field, Input, StatusPill, EmptyState } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Id } from '../../../convex/_generated/dataModel';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';

interface FolderManagementProps {
  entityType: 'client' | 'project';
  clientId?: Id<"clients">;
  projectId?: Id<"projects">;
}

export default function FolderManagement({
  entityType,
  clientId,
  projectId,
}: FolderManagementProps) {
  const colors = useColors();
  const [showAddFolder, setShowAddFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Queries - separate for client vs project
  const clientFolders = useQuery(
    api.clients.getClientFolders,
    entityType === 'client' && clientId ? { clientId } : 'skip'
  ) || [];

  const projectFolders = useQuery(
    api.projects.getProjectFolders,
    entityType === 'project' && projectId ? { projectId } : 'skip'
  ) || [];

  // Client folder mutations
  const addCustomClientFolder = useMutation(api.clients.addCustomFolder);
  const deleteCustomClientFolder = useMutation(api.clients.deleteCustomFolder);
  const renameCustomClientFolder = useMutation(api.clients.renameCustomFolder);

  // Project folder mutations
  const addCustomProjectFolder = useMutation(api.projects.addCustomProjectFolder);
  const deleteCustomProjectFolder = useMutation(api.projects.deleteCustomProjectFolder);
  const renameCustomProjectFolder = useMutation(api.projects.renameCustomProjectFolder);

  const folders = entityType === 'client' ? clientFolders : projectFolders;

  // Separate default and custom folders
  const defaultFolders = folders.filter((f: any) => !f.isCustom);
  const customFolders = folders.filter((f: any) => f.isCustom);

  const handleAddFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      if (entityType === 'client' && clientId) {
        await addCustomClientFolder({
          clientId,
          name: newFolderName.trim(),
          description: newFolderDescription.trim() || undefined,
        });
      } else if (entityType === 'project' && projectId) {
        await addCustomProjectFolder({
          projectId,
          name: newFolderName.trim(),
          description: newFolderDescription.trim() || undefined,
        });
      }
      setNewFolderName('');
      setNewFolderDescription('');
      setShowAddFolder(false);
    } catch (error: any) {
      alert(error.message || 'Failed to create folder');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder?')) return;

    setIsDeleting(folderId);
    try {
      if (entityType === 'client') {
        await deleteCustomClientFolder({ folderId: folderId as Id<"clientFolders"> });
      } else {
        await deleteCustomProjectFolder({ folderId: folderId as Id<"projectFolders"> });
      }
    } catch (error: any) {
      alert(error.message || 'Failed to delete folder');
    } finally {
      setIsDeleting(null);
    }
  };

  const startEditing = (folderId: string, currentName: string) => {
    setEditingFolder(folderId);
    setEditingName(currentName);
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editingName.trim()) {
      setEditingFolder(null);
      return;
    }

    try {
      if (entityType === 'client') {
        await renameCustomClientFolder({
          folderId: folderId as Id<"clientFolders">,
          name: editingName.trim(),
        });
      } else {
        await renameCustomProjectFolder({
          folderId: folderId as Id<"projectFolders">,
          name: editingName.trim(),
        });
      }
      setEditingFolder(null);
    } catch (error: any) {
      alert(error.message || 'Failed to rename folder');
    }
  };

  const cancelEditing = () => {
    setEditingFolder(null);
    setEditingName('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Info */}
      <Panel title="Folder Structure">
        <p style={{ fontSize: 11, color: colors.text.muted }}>
          {folders.length} folders ({defaultFolders.length} default, {customFolders.length} custom)
        </p>
      </Panel>

      {/* Default Folders */}
      {defaultFolders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Default Folders</h3>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Lock style={{ width: 12, height: 12, color: colors.text.muted }} />
              <StatusPill label="Read-only" tone={colors.text.muted} />
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {defaultFolders.map((folder: any) => (
              <div
                key={folder._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 8,
                  background: colors.bg.cardAlt,
                  borderRadius: 4,
                }}
              >
                <Folder style={{ width: 16, height: 16, color: colors.text.dim }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: colors.text.secondary }}>{folder.name}</span>
                  {folder.description && (
                    <p style={{ fontSize: 11, color: colors.text.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Folders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: colors.text.primary }}>Custom Folders</h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddFolder(!showAddFolder)}
            disabled={entityType === 'client' ? !clientId : !projectId}
          >
            <FolderPlus style={{ width: 14, height: 14 }} />
            Add Folder
          </Button>
        </div>

        {showAddFolder && (
          <Panel accent={colors.accent.blue}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Folder Name *">
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g., Archive"
                  autoFocus
                />
              </Field>
              <Field label="Description (optional)">
                <Input
                  value={newFolderDescription}
                  onChange={(e) => setNewFolderDescription(e.target.value)}
                  placeholder="What goes in this folder?"
                />
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button size="sm" variant="secondary" onClick={() => setShowAddFolder(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={handleAddFolder} disabled={!newFolderName.trim()}>
                  Create Folder
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {customFolders.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {customFolders.map((folder: any) => (
              <div
                key={folder._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 8,
                  background: colors.bg.card,
                  border: `1px solid ${colors.border.default}`,
                  borderRadius: 4,
                }}
              >
                <Folder style={{ width: 16, height: 16, color: colors.accent.blue }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingFolder === folder._id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFolder(folder._id);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                      />
                      <IconButton label="Save" onClick={() => handleRenameFolder(folder._id)}>
                        <Check style={{ width: 12, height: 12 }} />
                      </IconButton>
                      <IconButton label="Cancel" onClick={cancelEditing}>
                        <X style={{ width: 12, height: 12 }} />
                      </IconButton>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: 13, color: colors.text.primary }}>{folder.name}</span>
                      {folder.description && (
                        <p style={{ fontSize: 11, color: colors.text.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.description}</p>
                      )}
                    </>
                  )}
                </div>
                {editingFolder !== folder._id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <IconButton label="Rename folder" onClick={() => startEditing(folder._id, folder.name)}>
                      <Edit2 style={{ width: 12, height: 12, color: colors.text.dim }} />
                    </IconButton>
                    <IconButton
                      label="Delete folder"
                      onClick={() => handleDeleteFolder(folder._id)}
                      disabled={isDeleting === folder._id}
                    >
                      <Trash2 style={{ width: 12, height: 12, color: colors.accent.red }} />
                    </IconButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No custom folders yet" />
        )}
      </div>

    </div>
  );
}
