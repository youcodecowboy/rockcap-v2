'use client';

import { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { Id } from '../../../../../convex/_generated/dataModel';
import { X, Search, ChevronRight, Check } from 'lucide-react';

type Step = 'client' | 'project' | 'folder';

interface FilingSheetProps {
  currentClientId?: string;
  currentProjectId?: string;
  currentFolderTypeKey?: string;
  currentFolderLevel?: 'client' | 'project';
  onSelect: (filing: {
    clientId: string;
    clientName: string;
    projectId?: string;
    projectName?: string;
    folderTypeKey?: string;
    folderLevel?: 'client' | 'project';
    folderName?: string;
  }) => void;
  onClose: () => void;
}

export default function FilingSheet({
  currentClientId,
  currentProjectId,
  currentFolderTypeKey,
  currentFolderLevel,
  onSelect,
  onClose,
}: FilingSheetProps) {
  const [step, setStep] = useState<Step>('client');
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | undefined>(currentClientId);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(currentProjectId);
  const [selectedProjectName, setSelectedProjectName] = useState('');

  // Queries
  const clients = useQuery(api.clients.list, {});
  const projects = useQuery(
    api.projects.getByClient,
    selectedClientId ? { clientId: selectedClientId as Id<'clients'> } : 'skip'
  );
  const foldersData = useQuery(
    api.folderStructure.getAllFoldersForClient,
    selectedClientId ? { clientId: selectedClientId as Id<'clients'> } : 'skip'
  );

  // Filtered clients
  const filteredClients = useMemo(() => {
    if (!clients) return [];
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c: { name?: string }) => (c.name ?? '').toLowerCase().includes(q));
  }, [clients, search]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p: { name?: string }) => (p.name ?? '').toLowerCase().includes(q));
  }, [projects, search]);

  // Filtered folders (top-level only)
  const filteredFolders = useMemo(() => {
    if (!foldersData) return [];
    let folders: { _id: string; name: string; folderType: string; parentFolderId?: string; level: 'client' | 'project'; projectName?: string }[] = [];

    if (selectedProjectId) {
      // Show project folders for selected project
      const projectGroup = (foldersData.projectFolders ?? []).find(
        (g: { project: { _id: string } }) => g.project._id === selectedProjectId
      );
      if (projectGroup) {
        folders = projectGroup.folders
          .filter((f: { parentFolderId?: string }) => !f.parentFolderId)
          .map((f: { _id: string; name: string; folderType: string; parentFolderId?: string }) => ({ ...f, level: 'project' as const }));
      }
    } else {
      // Client-level only (no project selected)
      folders = (foldersData.clientFolders ?? [])
        .filter((f: { parentFolderId?: string }) => !f.parentFolderId)
        .map((f: { _id: string; name: string; folderType: string; parentFolderId?: string }) => ({ ...f, level: 'client' as const }));
    }

    if (!search.trim()) return folders;
    const q = search.toLowerCase();
    return folders.filter(f => f.name.toLowerCase().includes(q));
  }, [foldersData, selectedProjectId, search]);

  function handleSelectClient(client: { _id: string; name?: string }) {
    setSelectedClientId(client._id);
    setSelectedClientName(client.name ?? '');
    setSearch('');
    setStep('project');
  }

  function handleSelectProject(project: { _id: string; name?: string } | null) {
    if (project) {
      setSelectedProjectId(project._id);
      setSelectedProjectName(project.name ?? '');
    } else {
      setSelectedProjectId(undefined);
      setSelectedProjectName('');
    }
    setSearch('');
    setStep('folder');
  }

  function handleSelectFolder(folder: { folderType: string; name: string; level: 'client' | 'project' } | null) {
    onSelect({
      clientId: selectedClientId!,
      clientName: selectedClientName,
      projectId: selectedProjectId,
      projectName: selectedProjectName || undefined,
      folderTypeKey: folder?.folderType,
      folderLevel: folder?.level,
      folderName: folder?.name,
    });
    onClose();
  }

  function handleBack() {
    setSearch('');
    if (step === 'folder') {
      setStep('project');
    } else if (step === 'project') {
      setStep('client');
    }
  }

  const stepTitle = step === 'client' ? 'Select Client' : step === 'project' ? 'Select Project' : 'Select Folder';
  const showBack = step !== 'client';

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-[var(--m-bg)] rounded-t-xl max-h-[85vh] flex flex-col pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-8 h-[3px] bg-[var(--m-border)] rounded-full" />
        </div>

        {/* Header */}
        <div className="px-[var(--m-page-px)] pt-1 pb-3 border-b border-[var(--m-border)] flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showBack && (
              <button
                onClick={handleBack}
                className="text-[13px] text-[var(--m-accent-indicator)] active:opacity-70"
              >
                Back
              </button>
            )}
            <span className="text-[15px] font-semibold text-[var(--m-text-primary)]">{stepTitle}</span>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 text-[var(--m-text-tertiary)] active:text-[var(--m-text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb */}
        {step !== 'client' && (
          <div className="px-[var(--m-page-px)] py-1.5 flex-shrink-0 text-[11px] text-[var(--m-text-tertiary)]">
            {selectedClientName}
            {selectedProjectName ? ` / ${selectedProjectName}` : ''}
          </div>
        )}

        {/* Search */}
        <div className="px-[var(--m-page-px)] py-2.5 flex-shrink-0">
          <div className="flex items-center gap-2 bg-[var(--m-bg-inset)] rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${step === 'client' ? 'clients' : step === 'project' ? 'projects' : 'folders'}...`}
              className="flex-1 bg-transparent text-[var(--m-text-primary)] placeholder:text-[var(--m-text-placeholder)] outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {/* CLIENT STEP */}
          {step === 'client' && (
            <>
              {clients === undefined && (
                <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
                  Loading clients...
                </div>
              )}
              {filteredClients.map((client: { _id: string; name?: string }) => {
                const isActive = client._id === currentClientId;
                return (
                  <button
                    key={client._id}
                    onClick={() => handleSelectClient(client)}
                    className="flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)]"
                  >
                    <span className={`flex-1 text-[13px] ${isActive ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-secondary)]'}`}>
                      {client.name ?? 'Unnamed Client'}
                    </span>
                    {isActive && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                    <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
                  </button>
                );
              })}
              {clients && filteredClients.length === 0 && (
                <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
                  No clients found
                </div>
              )}
            </>
          )}

          {/* PROJECT STEP */}
          {step === 'project' && (
            <>
              {/* Client-level option */}
              <button
                onClick={() => handleSelectProject(null)}
                className="flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border)] text-left active:bg-[var(--m-bg-subtle)] bg-[var(--m-bg-subtle)]"
              >
                <span className="flex-1 text-[13px] text-[var(--m-text-secondary)] italic">
                  Client-level (no project)
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
              </button>

              {projects === undefined && (
                <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
                  Loading projects...
                </div>
              )}
              {filteredProjects.map((project: { _id: string; name?: string }) => {
                const isActive = project._id === currentProjectId;
                return (
                  <button
                    key={project._id}
                    onClick={() => handleSelectProject(project)}
                    className="flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)]"
                  >
                    <span className={`flex-1 text-[13px] ${isActive ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-secondary)]'}`}>
                      {project.name ?? 'Unnamed Project'}
                    </span>
                    {isActive && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                    <ChevronRight className="w-4 h-4 text-[var(--m-text-tertiary)] flex-shrink-0" />
                  </button>
                );
              })}
              {projects && filteredProjects.length === 0 && (
                <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
                  No projects found
                </div>
              )}
            </>
          )}

          {/* FOLDER STEP */}
          {step === 'folder' && (
            <>
              {/* No folder option */}
              <button
                onClick={() => handleSelectFolder(null)}
                className="flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border)] text-left active:bg-[var(--m-bg-subtle)] bg-[var(--m-bg-subtle)]"
              >
                <span className="flex-1 text-[13px] text-[var(--m-text-secondary)] italic">
                  No specific folder
                </span>
              </button>

              {foldersData === undefined && (
                <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
                  Loading folders...
                </div>
              )}
              {filteredFolders.map(folder => {
                const isActive =
                  folder.folderType === currentFolderTypeKey &&
                  folder.level === currentFolderLevel;
                return (
                  <button
                    key={folder._id}
                    onClick={() => handleSelectFolder(folder)}
                    className="flex items-center gap-2.5 w-full py-3 px-[var(--m-page-px)] border-b border-[var(--m-border-subtle)] text-left active:bg-[var(--m-bg-subtle)]"
                  >
                    <span className={`flex-1 text-[13px] ${isActive ? 'text-[var(--m-text-primary)] font-medium' : 'text-[var(--m-text-secondary)]'}`}>
                      {folder.name}
                    </span>
                    {isActive && <Check className="w-4 h-4 text-[var(--m-accent-indicator)] flex-shrink-0" />}
                  </button>
                );
              })}
              {foldersData && filteredFolders.length === 0 && (
                <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
                  No folders found
                </div>
              )}
            </>
          )}
        </div>

        {/* Cancel button */}
        <div className="flex-shrink-0 border-t border-[var(--m-border)] px-[var(--m-page-px)] pt-2.5 pb-1">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-center text-[14px] font-medium text-[var(--m-text-secondary)] bg-[var(--m-bg-inset)] rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
