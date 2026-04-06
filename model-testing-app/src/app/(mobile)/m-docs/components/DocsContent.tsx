'use client';

import { useState, useCallback } from 'react';
import DocsList from './DocsList';
import ClientDocDetail from './ClientDocDetail';

export type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'projectFolders'; clientId: string; clientName: string; projectId: string; projectName: string }
  | { screen: 'folder'; clientId: string; clientName: string; projectId?: string; projectName?: string; folderRecordId: string; folderTypeKey: string; folderName: string; folderLevel: 'client' | 'project' }
  | { screen: 'viewer'; documentId: string };

// folderRecordId = the _id of the clientFolders/projectFolders record (for resolving children via parentFolderId)
// folderTypeKey = the folderType string key (for querying documents via documents.getByFolder)

export default function DocsContent() {
  const [navStack, setNavStack] = useState<NavScreen[]>([{ screen: 'list' }]);

  const currentScreen = navStack[navStack.length - 1];

  const push = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  // Viewer is an overlay — check if it's anywhere in the stack
  const viewerScreen = navStack.find(s => s.screen === 'viewer') as Extract<NavScreen, { screen: 'viewer' }> | undefined;
  const closeViewer = useCallback(() => {
    setNavStack(prev => prev.filter(s => s.screen !== 'viewer'));
  }, []);

  const openViewer = useCallback((documentId: string) => {
    push({ screen: 'viewer', documentId });
  }, [push]);

  // Render based on current screen (excluding viewer overlay)
  const baseScreen = viewerScreen ? navStack[navStack.length - 2] || navStack[0] : currentScreen;

  return (
    <div className="min-h-[60vh]">
      {baseScreen.screen === 'list' && (
        <DocsList
          onSelectClient={(clientId, clientName) => push({ screen: 'client', clientId, clientName })}
          onOpenViewer={openViewer}
        />
      )}
      {baseScreen.screen === 'client' && (
        <ClientDocDetail
          clientId={baseScreen.clientId}
          clientName={baseScreen.clientName}
          onBack={pop}
          onSelectFolder={(folderRecordId, folderTypeKey, folderName, folderLevel, projectId, projectName) =>
            push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId, projectName, folderRecordId, folderTypeKey, folderName, folderLevel })
          }
          onSelectProject={(projectId, projectName) =>
            push({ screen: 'projectFolders', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId, projectName })
          }
        />
      )}
      {baseScreen.screen === 'projectFolders' && (
        <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
          ProjectFolderList placeholder — Task 4
        </div>
      )}
      {baseScreen.screen === 'folder' && (
        <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
          FolderContents placeholder — Task 5
        </div>
      )}

      {/* Viewer overlay */}
      {viewerScreen && (
        <div className="fixed inset-0 z-50 bg-[var(--m-bg)]">
          <div className="px-[var(--m-page-px)] py-6 text-center text-[var(--m-text-tertiary)] text-[13px]">
            DocumentViewer placeholder — Task 6
            <button onClick={closeViewer} className="block mx-auto mt-2 text-[var(--m-accent-indicator)]">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
