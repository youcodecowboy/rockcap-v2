'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, FolderKanban, Plus, X } from 'lucide-react';
import EditableFileTypeBadge from './EditableFileTypeBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RefileModalProps {
  documentId: Id<"documents">;
  currentClientId?: Id<"clients"> | null;
  currentProjectId?: Id<"projects"> | null;
  currentFileType: string;
  currentCategory: string;
  isOpen: boolean;
  onClose: () => void;
  onRefiled: () => void;
}

export default function RefileModal({
  documentId,
  currentClientId,
  currentProjectId,
  currentFileType,
  currentCategory,
  isOpen,
  onClose,
  onRefiled,
}: RefileModalProps) {
  const updateDocument = useMutation(api.documents.update);
  const clients = useClients() || [];
  const createClient = useCreateClient();
  const createProject = useCreateProject();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(
    currentClientId || null
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    currentProjectId || null
  );
  const [newClientName, setNewClientName] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState(currentFileType);
  const [selectedCategory, setSelectedCategory] = useState(currentCategory);
  const [isRefiling, setIsRefiling] = useState(false);

  const selectedClient = useClient(selectedClientId as Id<"clients"> | undefined);
  const projects = useProjectsByClient(selectedClientId as Id<"clients"> | undefined) || [];
  const selectedProject = useProject(selectedProjectId as Id<"projects"> | undefined);

  const handleClientSelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingClient(true);
      setSelectedClientId(null);
    } else if (value === 'internal') {
      setSelectedClientId(null);
      setSelectedProjectId(null);
      setIsCreatingClient(false);
    } else {
      setSelectedClientId(value);
      setIsCreatingClient(false);
      // Reset project when client changes
      setSelectedProjectId(null);
    }
  };

  const handleProjectSelect = (value: string) => {
    if (value === 'new') {
      setIsCreatingProject(true);
      setSelectedProjectId(null);
    } else if (value === 'none') {
      setSelectedProjectId(null);
      setIsCreatingProject(false);
    } else {
      setSelectedProjectId(value);
      setIsCreatingProject(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    try {
      const clientId = await createClient({ name: newClientName.trim() });
      setSelectedClientId(clientId as string);
      setNewClientName('');
      setIsCreatingClient(false);
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Failed to create client. Please try again.');
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedClientId) return;
    try {
      const projectId = await createProject({
        name: newProjectName.trim(),
        clientRoles: [{ clientId: selectedClientId as Id<"clients">, role: 'primary' }],
      });
      setSelectedProjectId(projectId as string);
      setNewProjectName('');
      setIsCreatingProject(false);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    }
  };

  const handleFileTypeChange = (fileType: string, category: string) => {
    setSelectedFileType(fileType);
    setSelectedCategory(category);
  };

  const handleRefile = async () => {
    setIsRefiling(true);
    try {
      // Get client and project names
      const clientName = selectedClientId ? selectedClient?.name : undefined;
      const projectName = selectedProjectId ? selectedProject?.name : undefined;

      await updateDocument({
        id: documentId,
        clientId: selectedClientId ? (selectedClientId as Id<"clients">) : null,
        clientName: clientName || undefined,
        projectId: selectedProjectId ? (selectedProjectId as Id<"projects">) : null,
        projectName: projectName || undefined,
        fileTypeDetected: selectedFileType,
        category: selectedCategory,
      });

      onRefiled();
      onClose();
    } catch (error) {
      console.error('Error refiling document:', error);
      alert('Failed to refile document. Please try again.');
    } finally {
      setIsRefiling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Refile Document</DialogTitle>
          <DialogDescription>
            Update the client, project, file type, and category for this document.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2 -mr-2">
          {/* File Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File Type
            </label>
            <EditableFileTypeBadge
              fileType={selectedFileType}
              category={selectedCategory}
              onFileTypeChange={handleFileTypeChange}
            />
            <p className="text-xs text-gray-500 mt-1">
              Category: {selectedCategory}
            </p>
          </div>

          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client
            </label>
            {isCreatingClient ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Enter client name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateClient();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleCreateClient}
                    size="sm"
                    disabled={!newClientName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Create Client
                  </Button>
                  <Button
                    onClick={() => {
                      setIsCreatingClient(false);
                      setNewClientName('');
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Select
                value={selectedClientId === null ? 'internal' : selectedClientId || ''}
                onValueChange={handleClientSelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">
                    <div className="flex items-center gap-2">
                      <span>Internal Document (No Client)</span>
                    </div>
                  </SelectItem>
                  {clients.map((client) => {
                    const clientId = (client as any)._id || (client as any).id;
                    return (
                      <SelectItem key={clientId} value={clientId as string}>
                        {client.name}
                      </SelectItem>
                    );
                  })}
                  <SelectItem value="new">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      <span>Create New Client</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Project Selection (only if client is selected) */}
          {selectedClientId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project (Optional)
              </label>
              {isCreatingProject ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Enter project name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateProject();
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={handleCreateProject}
                      size="sm"
                      disabled={!newProjectName.trim()}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Create Project
                    </Button>
                    <Button
                      onClick={() => {
                        setIsCreatingProject(false);
                        setNewProjectName('');
                      }}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Select
                  value={selectedProjectId || 'none'}
                  onValueChange={handleProjectSelect}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project (client-level document)</SelectItem>
                    {projects.map((project) => {
                      const projectId = (project as any)._id || (project as any).id;
                      return (
                        <SelectItem key={projectId} value={projectId as string}>
                          {project.name}
                        </SelectItem>
                      );
                    })}
                    <SelectItem value="new">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        <span>Create New Project</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Selected Assignment Display */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 text-sm">
              {selectedClientId ? (
                <>
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{selectedClient?.name || 'Loading...'}</span>
                  {selectedProjectId && (
                    <>
                      <span className="text-gray-400">•</span>
                      <FolderKanban className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{selectedProject?.name || 'Loading...'}</span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-green-600 font-medium">Internal Document</span>
              )}
            </div>
          </div>

        </div>

        {/* Actions - Fixed at bottom */}
        <div className="flex-shrink-0 flex justify-end gap-3 pt-4 border-t mt-4">
          <Button variant="outline" onClick={onClose} disabled={isRefiling}>
            Cancel
          </Button>
          <Button onClick={handleRefile} disabled={isRefiling}>
            {isRefiling ? 'Refiling...' : 'Refile Document'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

