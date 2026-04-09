'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../../../convex/_generated/api';
import { Id } from '../../../../../../convex/_generated/dataModel';
import { ChevronRight, FolderKanban } from 'lucide-react';
import FolderRow from '../../../m-docs/components/shared/FolderRow';
import FolderContents from '../../../m-docs/components/FolderContents';
import DocumentViewer from '../../../m-docs/components/DocumentViewer';

type DocNavState =
  | { view: 'folders' }
  | { view: 'folder'; folderRecordId: string; folderTypeKey: string; folderName: string; folderLevel: 'client' | 'project'; projectId?: string; projectName?: string }
  | { view: 'viewer'; documentId: string; from: 'folders' | 'folder' };

interface ClientDocsTabProps {
  clientId: string;
  clientName: string;
}

export default function ClientDocsTab({ clientId, clientName }: ClientDocsTabProps) {
  const [nav, setNav] = useState<DocNavState>({ view: 'folders' });

  // Keep a ref to the last folder state so viewer can return to it
  const [lastFolder, setLastFolder] = useState<Extract<DocNavState, { view: 'folder' }> | null>(null);

  const foldersData = useQuery(api.folderStructure.getAllFoldersForClient, { clientId: clientId as Id<'clients'> });
  const folderCounts = useQuery(api.documents.getFolderCounts, { clientId: clientId as Id<'clients'> });

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
        projectId={nav.projectId}
        projectName={nav.projectName}
        folderRecordId={nav.folderRecordId}
        folderTypeKey={nav.folderTypeKey}
        folderName={nav.folderName}
        folderLevel={nav.folderLevel}
        onBack={() => setNav({ view: 'folders' })}
        onOpenSubfolder={(folderRecordId, folderTypeKey, folderName) => {
          setLastFolder(nav);
          setNav({ view: 'folder', folderRecordId, folderTypeKey, folderName, folderLevel: nav.folderLevel, projectId: nav.projectId, projectName: nav.projectName });
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
  const clientFolders = foldersData?.clientFolders?.filter(f => !f.parentFolderId) ?? [];
  const projectGroups = foldersData?.projectFolders ?? [];
  const clientFolderCounts = folderCounts?.clientFolders ?? {};

  const knownFolderTypes = new Set(clientFolders.map(f => f.folderType));
  const filedCount = Object.entries(clientFolderCounts)
    .filter(([key]) => knownFolderTypes.has(key))
    .reduce((sum, [, n]) => sum + (n as number), 0);
  const unfiledCount = (folderCounts?.clientTotal ?? 0) - filedCount;

  if (isLoading) {
    return (
      <div className="px-[var(--m-page-px)] py-8 text-center text-[12px] text-[var(--m-text-tertiary)]">
        Loading...
      </div>
    );
  }

  return (
    <div>
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
                onTap={() => setNav({
                  view: 'folder',
                  folderRecordId: folder._id,
                  folderTypeKey: folder.folderType,
                  folderName: folder.name,
                  folderLevel: 'client',
                })}
              />
            );
          })}
          {unfiledCount > 0 && (
            <FolderRow
              name="Unfiled"
              docCount={unfiledCount}
              variant="client"
              onTap={() => setNav({
                view: 'folder',
                folderRecordId: 'unfiled',
                folderTypeKey: 'unfiled',
                folderName: 'Unfiled',
                folderLevel: 'client',
              })}
            />
          )}
        </>
      )}

      {/* Project folders — each project shown as a row that drills into its folders */}
      <div className="py-2 px-[var(--m-page-px)] bg-[var(--m-bg-subtle)] border-b border-[var(--m-border)] border-t border-[var(--m-border)]">
        <span className="text-[14px] font-semibold text-[var(--m-text-primary)]">Projects</span>
      </div>
      {projectGroups.length === 0 ? (
        <div className="px-[var(--m-page-px)] py-4 text-center text-[12px] text-[var(--m-text-tertiary)]">No projects</div>
      ) : (
        projectGroups.map(group => {
          const folders = group.folders?.filter((f: { parentFolderId?: string }) => !f.parentFolderId) ?? [];
          const projectCounts = (folderCounts as Record<string, unknown>)?.projectFolders as Record<string, Record<string, number>> | undefined;
          const thisProjCounts = projectCounts?.[group.project._id] ?? {};
          const totalDocs = Object.values(thisProjCounts).reduce((sum, n) => sum + n, 0);

          return (
            <div key={group.project._id}>
              {/* Project header row */}
              <div className="flex items-center gap-2.5 px-[var(--m-page-px)] py-2.5 border-b border-[var(--m-border-subtle)] bg-[var(--m-bg)]">
                <div className="w-7 h-7 rounded-md bg-[#eff6ff] flex items-center justify-center flex-shrink-0">
                  <FolderKanban className="w-3.5 h-3.5 text-[#1e40af]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--m-text-primary)] truncate">{group.project.name}</div>
                  <div className="text-[10px] text-[var(--m-text-tertiary)]">
                    {folders.length} folder{folders.length !== 1 ? 's' : ''} · {totalDocs} doc{totalDocs !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              {/* Project's folder rows */}
              {folders.map((folder: { _id: string; folderType: string; name: string }) => {
                const count = thisProjCounts[folder.folderType] ?? 0;
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
                      projectId: group.project._id,
                      projectName: group.project.name,
                    })}
                  />
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}
