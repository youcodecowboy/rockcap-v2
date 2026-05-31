'use client';

import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { useClients, useProjectsByClient, useCreateClient, useCreateProject, useClient, useProject } from '@/lib/clientStorage';
import { Button, Input, Select, Field, Modal } from '@/components/layouts';
import { useColors } from '@/lib/useColors';
import { Building2, FolderKanban, Plus } from 'lucide-react';
import EditableFileTypeBadge from './EditableFileTypeBadge';

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
  const colors = useColors();
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
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Refile Document"
      width={640}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isRefiling}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleRefile} disabled={isRefiling}>
            {isRefiling ? 'Refiling...' : 'Refile Document'}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>
        Update the client, project, file type, and category for this document.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* File Type Selection */}
        <Field label="File Type" hint={`Category: ${selectedCategory}`}>
          <EditableFileTypeBadge
            fileType={selectedFileType}
            category={selectedCategory}
            onFileTypeChange={handleFileTypeChange}
          />
        </Field>

        {/* Client Selection */}
        <Field label="Client">
          {isCreatingClient ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Input
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Enter client name"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateClient();
                  }
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" size="sm" onClick={handleCreateClient} disabled={!newClientName.trim()}>
                  <Plus size={14} />
                  Create Client
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsCreatingClient(false);
                    setNewClientName('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Select
              value={selectedClientId === null ? 'internal' : selectedClientId || ''}
              onChange={(e) => handleClientSelect(e.target.value)}
            >
              <option value="internal">Internal Document (No Client)</option>
              {clients.map((client) => {
                const clientId = (client as any)._id || (client as any).id;
                return (
                  <option key={clientId} value={clientId as string}>
                    {client.name}
                  </option>
                );
              })}
              <option value="new">+ Create New Client</option>
            </Select>
          )}
        </Field>

        {/* Project Selection (only if client is selected) */}
        {selectedClientId && (
          <Field label="Project (Optional)">
            {isCreatingProject ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateProject();
                    }
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                    <Plus size={14} />
                    Create Project
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsCreatingProject(false);
                      setNewProjectName('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Select
                value={selectedProjectId || 'none'}
                onChange={(e) => handleProjectSelect(e.target.value)}
              >
                <option value="none">No project (client-level document)</option>
                {projects.map((project) => {
                  const projectId = (project as any)._id || (project as any).id;
                  return (
                    <option key={projectId} value={projectId as string}>
                      {project.name}
                    </option>
                  );
                })}
                <option value="new">+ Create New Project</option>
              </Select>
            )}
          </Field>
        )}

        {/* Selected Assignment Display */}
        <div style={{ padding: 12, background: colors.bg.light, borderRadius: 4, border: `1px solid ${colors.border.default}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            {selectedClientId ? (
              <>
                <Building2 size={16} style={{ color: colors.text.dim }} />
                <span style={{ fontWeight: 500, color: colors.text.primary }}>{selectedClient?.name || 'Loading...'}</span>
                {selectedProjectId && (
                  <>
                    <span style={{ color: colors.text.dim }}>•</span>
                    <FolderKanban size={16} style={{ color: colors.text.dim }} />
                    <span style={{ fontWeight: 500, color: colors.text.primary }}>{selectedProject?.name || 'Loading...'}</span>
                  </>
                )}
              </>
            ) : (
              <span style={{ color: colors.accent.green, fontWeight: 500 }}>Internal Document</span>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

