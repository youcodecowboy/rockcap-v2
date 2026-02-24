'use client';

import { useState } from 'react';
import { Folder, FolderPlus, Trash2, Edit2, Check, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
    <div className="space-y-6">
      {/* Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Folder Structure</p>
            <p className="text-xs text-gray-500 mt-1">
              {folders.length} folders ({defaultFolders.length} default, {customFolders.length} custom)
            </p>
          </div>
        </div>
      </div>

      {/* Default Folders */}
      {defaultFolders.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900">Default Folders</h3>
            <Badge variant="outline" className="text-xs">
              <Lock className="w-3 h-3 mr-1" />
              Read-only
            </Badge>
          </div>
          <div className="space-y-1">
            {defaultFolders.map((folder: any) => (
              <div
                key={folder._id}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                <Folder className="w-4 h-4 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700">{folder.name}</span>
                  {folder.description && (
                    <p className="text-xs text-gray-400 truncate">{folder.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Folders */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">Custom Folders</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddFolder(!showAddFolder)}
            disabled={entityType === 'client' ? !clientId : !projectId}
          >
            <FolderPlus className="w-4 h-4 mr-1" />
            Add Folder
          </Button>
        </div>

        {showAddFolder && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div className="space-y-2">
              <Label className="text-xs">Folder Name *</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Archive"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                placeholder="What goes in this folder?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowAddFolder(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddFolder}
                disabled={!newFolderName.trim()}
              >
                Create Folder
              </Button>
            </div>
          </div>
        )}

        {customFolders.length > 0 ? (
          <div className="space-y-1">
            {customFolders.map((folder: any) => (
              <div
                key={folder._id}
                className="flex items-center gap-3 p-2 bg-white border rounded-lg group"
              >
                <Folder className="w-4 h-4 text-blue-500" />
                <div className="flex-1 min-w-0">
                  {editingFolder === folder._id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFolder(folder._id);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => handleRenameFolder(folder._id)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={cancelEditing}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm text-gray-900">{folder.name}</span>
                      {folder.description && (
                        <p className="text-xs text-gray-400 truncate">{folder.description}</p>
                      )}
                    </>
                  )}
                </div>
                {editingFolder !== folder._id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => startEditing(folder._id, folder.name)}
                    >
                      <Edit2 className="w-3 h-3 text-gray-400" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDeleteFolder(folder._id)}
                      disabled={isDeleting === folder._id}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">
            No custom folders yet
          </p>
        )}
      </div>

    </div>
  );
}
