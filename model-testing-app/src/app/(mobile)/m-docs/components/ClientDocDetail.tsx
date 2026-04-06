'use client';

import { useQuery } from 'convex/react';
import { api } from '../../../../../convex/_generated/api';
import { ChevronLeft, ChevronRight, FolderKanban } from 'lucide-react';
import FolderRow from './shared/FolderRow';
import { Id } from '../../../../../convex/_generated/dataModel';

interface ClientDocDetailProps {
  clientId: string;
  clientName: string;
  onBack: () => void;
  onSelectFolder: (folderRecordId: string, folderTypeKey: string, folderName: string, folderLevel: 'client' | 'project', projectId?: string, projectName?: string) => void;
  onSelectProject: (projectId: string, projectName: string) => void;
}

export default function ClientDocDetail({ clientId, clientName, onBack, onSelectFolder, onSelectProject }: ClientDocDetailProps) {
  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId: clientId as Id<'clients'> });

  const isLoading = foldersData === undefined || folderCounts === undefined;
  const clientFolders = foldersData?.clientFolders?.filter(f => !f.parentFolderId) ?? [];
  const projectGroups = foldersData?.projectFolders ?? [];

  // getFolderCounts keys clientFolders by doc.folderId (which is the folderType string, e.g. "background")
  const clientFolderCounts = folderCounts?.clientFolders ?? {};
  const filedCount = Object.values(clientFolderCounts).reduce((sum: number, n: number) => sum + n, 0);
  const unfiledCount = (folderCounts?.clientTotal ?? 0) - filedCount;

  if (isLoading) {
    return <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">Loading...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border)]">
        <button onClick={onBack} className="flex items-center gap-1 mb-1">
          <ChevronLeft className="w-3.5 h-3.5 text-[var(--m-accent-indicator)]" />
          <span className="text-[12px] text-[var(--m-accent-indicator)]">Back</span>
        </button>
        <div className="text-[16px] font-semibold text-[var(--m-text-primary)]">{clientName}</div>
      </div>

      {/* Client-level folders */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Client Documents</span>
      </div>
      {clientFolders.length === 0 && unfiledCount === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No client documents</div>
      ) : (
        <>
          {clientFolders.map(folder => {
            const count = clientFolderCounts[folder.folderType] ?? 0;
            return (
              <FolderRow
                key={folder._id}
                name={folder.name}
                docCount={count}
                variant="client"
                onTap={() => onSelectFolder(folder._id, folder.folderType, folder.name, 'client')}
              />
            );
          })}
          {unfiledCount > 0 && (
            <FolderRow
              name="Unfiled"
              docCount={unfiledCount}
              variant="client"
              onTap={() => onSelectFolder('unfiled', 'unfiled', 'Unfiled', 'client')}
            />
          )}
        </>
      )}

      {/* Projects section */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] border-t border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Projects</span>
      </div>
      {projectGroups.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No projects</div>
      ) : (
        projectGroups.map(group => {
          const folderCount = group.folders?.length ?? 0;
          const projectCounts = folderCounts?.projectFolders?.[group.project._id];
          const totalDocs = projectCounts ? Object.values(projectCounts).reduce((sum: number, n: number) => sum + n, 0) : 0;
          return (
            <button
              key={group.project._id}
              onClick={() => onSelectProject(group.project._id, group.project.name)}
              className="flex items-center gap-2.5 w-full text-left px-[var(--m-page-px)] py-2 border-b border-[var(--m-border-subtle)] active:bg-[var(--m-bg-subtle)]"
            >
              <div className="w-7 h-7 rounded-md bg-[#eff6ff] flex items-center justify-center flex-shrink-0">
                <FolderKanban className="w-3.5 h-3.5 text-[#1e40af]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{group.project.name}</div>
                <div className="text-[10px] text-[var(--m-text-tertiary)]">{folderCount} folder{folderCount !== 1 ? 's' : ''} · {totalDocs} doc{totalDocs !== 1 ? 's' : ''}</div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--m-text-placeholder)] flex-shrink-0" />
            </button>
          );
        })
      )}
    </div>
  );
}
