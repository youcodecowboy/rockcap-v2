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

  // getFolderCounts keys projectFolders by projectId, then by doc.folderId (folderType string)
  // Docs without a folderId are keyed as 'uncategorized'
  const projectFolderCounts = folderCounts?.projectFolders?.[projectId] ?? {};

  // Compute unfiled count: 'uncategorized' key holds docs not in any known folder
  const knownFolderTypes = new Set(projectFolders.map(f => f.folderType));
  const unfiledCount = Object.entries(projectFolderCounts)
    .filter(([key]) => !knownFolderTypes.has(key))
    .reduce((sum, [, n]) => sum + (n as number), 0);

  if (isLoading) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">{clientName}</span>
        </button>
        <div className="text-[14px] font-semibold text-[var(--m-text-primary)] truncate ml-2">{projectName}</div>
      </div>

      {/* Folders section label */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Project Folders</span>
      </div>

      {/* Folder list */}
      {projectFolders.length === 0 && unfiledCount === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No documents</div>
      ) : (
        <>
          {projectFolders.map(folder => {
            const count = projectFolderCounts[folder.folderType] ?? 0;
            return (
              <FolderRow
                key={folder._id}
                name={folder.name}
                docCount={count}
                variant="project"
                onTap={() => onSelectFolder(folder._id, folder.folderType, folder.name)}
              />
            );
          })}
          {unfiledCount > 0 && (
            <FolderRow
              name="Unfiled"
              docCount={unfiledCount}
              variant="project"
              onTap={() => onSelectFolder('unfiled', 'unfiled', 'Unfiled')}
            />
          )}
        </>
      )}
    </div>
  );
}
