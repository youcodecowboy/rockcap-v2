'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Button, Field, Input, Textarea, Modal, EmptyState, StatusPill } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import {
  Folder,
  FolderOpen,
  Plus,
  Lock,
  Sparkles,
} from 'lucide-react';
import { FolderSelection } from '@/types/folders';

interface PersonalFolderListProps {
  selectedFolder: FolderSelection | null;
  onFolderSelect: (folder: FolderSelection | null) => void;
}

export default function PersonalFolderList({
  selectedFolder,
  onFolderSelect,
}: PersonalFolderListProps) {
  const colors = useColors();
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
        <div
          className="animate-spin rounded-full h-6 w-6"
          style={{ borderBottom: `2px solid ${colors.accent.purple}` }}
        />
      </div>
    );
  }

  // Show initialize button if no folders
  if (folders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <EmptyState
          icon={<Lock className="w-12 h-12" />}
          title="No personal folders yet"
          body="Create folders for your private documents"
          action={
            <Button variant="secondary" size="sm" onClick={handleInitializeFolders}>
              <Sparkles className="w-4 h-4" />
              Create Default Folders
            </Button>
          }
        />
      </div>
    );
  }

  const counts = documentCounts || {};

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Privacy Notice */}
        <div
          className="px-3 py-2"
          style={{ borderBottom: `1px solid ${colors.border.default}`, background: `${colors.accent.purple}15` }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: colors.accent.purple }}>
            <Lock className="w-3.5 h-3.5" />
            <span>Only you can see these documents</span>
          </div>
        </div>

        {/* Add Folder Button */}
        <div className="px-2 pt-2 pb-1">
          <Button
            variant="secondary"
            size="sm"
            style={{ width: '100%', justifyContent: 'center' }}
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
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left"
                  style={{
                    background: isSelected ? `${colors.accent.purple}15` : 'transparent',
                    color: isSelected ? colors.accent.purple : colors.text.secondary,
                    border: `1px solid ${isSelected ? `${colors.accent.purple}40` : 'transparent'}`,
                    transition: 'background 100ms linear',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = colors.bg.cardAlt; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {isSelected ? (
                    <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: colors.accent.purple }} />
                  ) : (
                    <Folder className="w-4 h-4 flex-shrink-0" style={{ color: colors.text.dim }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{folder.name}</div>
                    {folder.description && (
                      <div className="text-xs truncate" style={{ color: colors.text.muted }}>
                        {folder.description}
                      </div>
                    )}
                  </div>
                  <span className="ml-auto flex-shrink-0">
                    <StatusPill label={String(docCount)} tone={colors.text.muted} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create Folder Dialog */}
      <Modal
        open={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        title="Create Personal Folder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Folder'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div
            className="flex items-center gap-2 p-2 rounded-md text-xs"
            style={{ background: `${colors.accent.purple}15`, color: colors.accent.purple }}
          >
            <Lock className="w-4 h-4" />
            <span>This folder and its contents will be private to you</span>
          </div>
          <Field label="Folder Name">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g., Personal Notes, References"
            />
          </Field>
          <Field label="Description (Optional)">
            <Textarea
              value={newFolderDescription}
              onChange={(e) => setNewFolderDescription(e.target.value)}
              placeholder="What types of documents go in this folder?"
              rows={2}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
