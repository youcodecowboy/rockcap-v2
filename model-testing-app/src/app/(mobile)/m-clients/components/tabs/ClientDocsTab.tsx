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
        folderRecordId={nav.folderRecordId}
        folderTypeKey={nav.folderTypeKey}
        folderName={nav.folderName}
        folderLevel={nav.folderLevel}
        onBack={() => setNav({ view: 'folders' })}
        onOpenSubfolder={(folderRecordId, folderTypeKey, folderName) => {
          setLastFolder(nav);
          setNav({ view: 'folder', folderRecordId, folderTypeKey, folderName, folderLevel: nav.folderLevel });
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
    </div>
  );
}
