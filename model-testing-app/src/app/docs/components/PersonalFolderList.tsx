'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Folder,
  FolderOpen,
  Plus,
  Lock,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FolderSelection {
  type: 'client' | 'project' | 'internal' | 'personal';
  folderId: string;
  folderName: string;
}

interface PersonalFolderListProps {
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection | null) => void;
}

export default function PersonalFolderList({
  selectedFolder,
  onFolderSelect,
}: PersonalFolderListProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDescription, setNewFolderDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Queries
  const folders = useQuery(api.personalFolders.list);
  const documentCounts = useQuery(api.personalFolders.getDocumentCounts);

  // Mutations
  const createFolder = useMutation(api.personalFolders.create);
  const ensureDefaultFolders = useMutation(api.personalFolders.ensureDefaultFolders);

  // Initialize default folders if none exist
  const handleInitializeFolders = async () => {
    try {
      await ensureDefaultFolders({});
    } catch (error) {
      console.error('Failed to create default folders:', error);
    }
  };

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    setIsCreating(true);
    try {
      const folderType = newFolderName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      await createFolder({
        folderType,
        name: newFolderName.trim(),
        description: newFolderDescription.trim() || undefined,
      });

      setNewFolderName('');
      setNewFolderDescription('');
      setIsCreateDialogOpen(false);
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert('Failed to create folder. It may already exist.');
    } finally {
      setIsCreating(false);
    }
  };

  // Select folder
  const handleFolderClick = (folder: { folderType: string; name: string }) => {
    if (selectedFolder?.folderId === folder.folderType) {
      // Deselect if clicking same folder
      onFolderSelect(null);
    } else {
      onFolderSelect({
        type: 'personal',
        folderId: folder.folderType,
        folderName: folder.name,
      });
    }
  };

  // Show loading or empty state
  if (folders === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  // Show initialize button if no folders
  if (folders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
        <div className="text-center text-gray-500 text-sm">
          <Lock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No personal folders yet</p>
          <p className="text-xs mt-1">Create folders for your private documents</p>
        </div>
        <Button
          onClick={handleInitializeFolders}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Sparkles className="w-4 h-4" />
          Create Default Folders
        </Button>
      </div>
    );
  }

  const counts = documentCounts || {};

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Privacy Notice */}
        <div className="px-3 py-2 border-b border-gray-200 bg-purple-50">
          <div className="flex items-center gap-2 text-xs text-purple-700">
            <Lock className="w-3.5 h-3.5" />
            <span>Only you can see these documents</span>
          </div>
        </div>

        {/* Add Folder Button */}
        <div className="px-2 pt-2 pb-1">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 bg-white"
            onClick={() => setIsCreateDialogOpen(true)}
          >
            <Plus className="w-4 h-4" />
            New Folder
          </Button>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-auto p-2 pt-1">
          <div className="space-y-1">
            {folders.map((folder) => {
              const isSelected = selectedFolder?.folderId === folder.folderType;
              const docCount = counts[folder.folderType] || 0;

              return (
                <button
                  key={folder._id}
                  onClick={() => handleFolderClick(folder)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                    isSelected
                      ? "bg-purple-100 text-purple-900"
                      : "hover:bg-gray-100 text-gray-700"
                  )}
                >
                  {isSelected ? (
                    <FolderOpen className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  ) : (
                    <Folder className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{folder.name}</div>
                    {folder.description && (
                      <div className="text-xs text-gray-500 truncate">
                        {folder.description}
                      </div>
                    )}
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-xs ml-auto flex-shrink-0"
                  >
                    {docCount}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Personal Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-md text-xs text-purple-700">
              <Lock className="w-4 h-4" />
              <span>This folder and its contents will be private to you</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folderName">Folder Name</Label>
              <Input
                id="folderName"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Personal Notes, References"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folderDescription">Description (Optional)</Label>
              <Textarea
                id="folderDescription"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                placeholder="What types of documents go in this folder?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
