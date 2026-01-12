'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Folder,
  FolderPlus,
  Trash2,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Edit2,
  Save,
  X,
} from 'lucide-react';

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
          className={`
            flex items-center gap-2 py-2 px-3 rounded-md 
            hover:bg-muted/50 group
            ${depth > 0 ? 'ml-6 border-l border-dashed border-muted-foreground/30 pl-4' : ''}
          `}
        >
          {/* Expand/Collapse */}
          <button
            className="w-5 h-5 flex items-center justify-center text-muted-foreground"
            onClick={() => hasChildren && toggleExpand(folder.folderKey)}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="w-4" />
            )}
          </button>

          {/* Folder Icon */}
          <Folder className="w-4 h-4 text-amber-500" />

          {/* Folder Content */}
          {isEditing ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm w-40"
                placeholder="Folder name"
              />
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="h-7 text-sm w-48"
                placeholder="Description (optional)"
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => handleSaveEdit(folder.folderKey)}
              >
                <Save className="w-3 h-3 text-green-600" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={cancelEditing}
              >
                <X className="w-3 h-3 text-red-600" />
              </Button>
            </div>
          ) : (
            <>
              <span className="text-sm font-medium">{folder.name}</span>
              <Badge variant="outline" className="text-xs font-mono">
                {folder.folderKey}
              </Badge>
              {folder.description && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {folder.description}
                </span>
              )}
              
              {/* Actions */}
              <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => startEditing(folder)}
                >
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-red-600"
                  onClick={() => handleDeleteFolder(folder.folderKey)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
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
    <div className="space-y-4">
      {/* Folder Tree */}
      <div className="border rounded-lg p-2 min-h-[200px]">
        {rootFolders.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Folder className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No folders defined</p>
            <p className="text-xs">Click "Add Folder" to create one</p>
          </div>
        ) : (
          rootFolders.map(folder => renderFolder(folder))
        )}
      </div>

      {/* Add Button */}
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setShowAddDialog(true)}
      >
        <FolderPlus className="w-4 h-4" />
        Add Folder
      </Button>

      {/* Add Folder Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Folder</DialogTitle>
            <DialogDescription>
              Add a new folder to the {level}-level template for {clientType} clients
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name *</Label>
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-key">Folder Key *</Label>
              <Input
                id="folder-key"
                placeholder="e.g., contracts"
                value={newFolderKey}
                onChange={(e) => setNewFolderKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier used internally (lowercase, underscores only)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-parent">Parent Folder</Label>
              <Select
                value={newFolderParent}
                onValueChange={setNewFolderParent}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select parent folder..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (root level)</SelectItem>
                  {folders.filter(f => !f.parentKey).map(f => (
                    <SelectItem key={f.folderKey} value={f.folderKey}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-description">Description (Optional)</Label>
              <Input
                id="folder-description"
                placeholder="e.g., Legal contracts and agreements"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddFolder} disabled={!newFolderName || !newFolderKey}>
              Add Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
