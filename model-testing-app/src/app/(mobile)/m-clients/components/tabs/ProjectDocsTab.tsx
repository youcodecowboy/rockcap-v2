'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import FolderRow from '../../../m-docs/components/shared/FolderRow';
import FolderContents from '../../../m-docs/components/FolderContents';
import DocumentViewer from '../../../m-docs/components/DocumentViewer';

type DocNavState =
  | { view: 'folders' }
  | { view: 'folder'; folderRecordId: string; folderTypeKey: string; folderName: string; folderLevel: 'client' | 'project' }
  | { view: 'viewer'; documentId: string; from: 'folders' | 'folder' };

interface ProjectDocsTabProps {
  projectId: string;
  clientId: string;
  clientName: string;
}

export default function ProjectDocsTab({ projectId, clientId, clientName }: ProjectDocsTabProps) {
  const [nav, setNav] = useState<DocNavState>({ view: 'folders' });
  const [lastFolder, setLastFolder] = useState<Extract<DocNavState, { view: 'folder' }> | null>(null);

  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId: clientId as Id<'clients'> });

  // Extract project-specific folders from the topology
  const projectGroup = foldersData?.projectFolders?.find((g: any) => g.project._id === projectId);
  const folders = projectGroup?.folders ?? [];

  // Project folder counts: keyed by folderId
  const projectFolderCounts = folderCounts?.projectFolders?.[projectId] ?? {};

  // --- Viewer view ---
  if (nav.view === 'viewer') {
    return (
      <DocumentViewer
        documentId={nav.documentId}
        onClose={() => {
          if (nav.from === 'folder' && lastFolder) {
            setNav(lastFolder);
          } else {
            setNav({ view: 'folders' });
          }
        }}
      />
    );
  }

  // --- Folder contents view ---
  if (nav.view === 'folder') {
    return (
      <FolderContents
        clientId={clientId}
        clientName={clientName}
        projectId={projectId}
        folderRecordId={nav.folderRecordId}
        folderTypeKey={nav.folderTypeKey}
        folderName={nav.folderName}
        folderLevel="project"
        onBack={() => setNav({ view: 'folders' })}
        onOpenSubfolder={(folderRecordId, folderTypeKey, folderName) => {
          setLastFolder(nav);
          setNav({ view: 'folder', folderRecordId, folderTypeKey, folderName, folderLevel: 'project' });
        }}
        onOpenViewer={(documentId) => {
          setLastFolder(nav);
          setNav({ view: 'viewer', documentId, from: 'folder' });
        }}
      />
    );
  }

  // --- Folders list view ---
  const isLoading = foldersData === undefined || folderCounts === undefined;

  // Compute unfiled count
  const topLevelFolders = folders.filter((f: any) => !f.parentFolderId);
  const knownFolderIds = new Set(topLevelFolders.map((f: any) => f._id));
  const filedCount = Object.entries(projectFolderCounts)
    .filter(([key]) => knownFolderIds.has(key))
    .reduce((sum, [, n]) => sum + (n as number), 0);

  // Total project docs = sum of all counts in projectFolderCounts
  const totalProjectDocs = Object.values(projectFolderCounts).reduce((sum, n) => sum + (n as number), 0);
  const unfiledCount = totalProjectDocs - filedCount;

  if (isLoading) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading...
      </div>
    );
  }

  return (
    <div>
      {/* Project-level folders */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Project Documents</span>
      </div>
      {topLevelFolders.length === 0 && unfiledCount <= 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No project documents</div>
      ) : (
        <>
          {topLevelFolders.map((folder: any) => {
            const count = projectFolderCounts[folder._id] ?? 0;
            return (
              <FolderRow
                key={folder._id}
                name={folder.name}
                docCount={count}
                variant="project"
                onTap={() => setNav({
                  view: 'folder',
                  folderRecordId: folder._id,
                  folderTypeKey: folder.folderType,
                  folderName: folder.name,
                  folderLevel: 'project',
                })}
              />
            );
          })}
          {unfiledCount > 0 && (
            <FolderRow
              name="Unfiled"
              docCount={unfiledCount}
              variant="project"
              onTap={() => setNav({
                view: 'folder',
                folderRecordId: 'unfiled',
                folderTypeKey: 'unfiled',
                folderName: 'Unfiled',
                folderLevel: 'project',
              })}
            />
          )}
        </>
      )}
    </div>
  );
}
