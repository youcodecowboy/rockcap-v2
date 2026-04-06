'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronLeft } from 'lucide-react';
import FolderRow from './shared/FolderRow';
import { Id } from '../../../../../convex/_generated/dataModel';

interface ProjectFolderListProps {
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  onBack: () => void;
  onSelectFolder: (folderRecordId: string, folderTypeKey: string, folderName: string) => void;
}

export default function ProjectFolderList({ clientId, clientName, projectId, projectName, onBack, onSelectFolder }: ProjectFolderListProps) {
  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId: clientId as Id<'clients'> });

  const isLoading = foldersData === undefined || folderCounts === undefined;

  // Find the project's folders from the response
  const projectGroup = foldersData?.projectFolders?.find(g => g.project._id === projectId);
  const projectFolders = projectGroup?.folders?.filter(f => !f.parentFolderId) ?? [];

  // getFolderCounts keys projectFolders by projectId, then by folderId (_id)
  const projectFolderCounts = folderCounts?.projectFolders?.[projectId] ?? {};

  if (isLoading) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 mb-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">{clientName}</span>
        </button>
        <div className="text-[16px] font-semibold text-[var(--m-text-primary)]">{projectName}</div>
      </div>

      {/* Folders section label */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Project Folders</span>
      </div>

      {/* Folder list */}
      {projectFolders.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No folders</div>
      ) : (
        projectFolders.map(folder => {
          const count = projectFolderCounts[folder._id] ?? 0;
          return (
            <FolderRow
              key={folder._id}
              name={folder.name}
              docCount={count}
              variant="project"
              onTap={() => onSelectFolder(folder._id, folder.folderType, folder.name)}
            />
          );
        })
      )}
    </div>
  );
}
