'use client';

import { useState, useCallback } from 'react';
import { useTabs } from '@/contexts/TabContext';
import DocsList from './DocsList';
import ClientDocDetail from './ClientDocDetail';
import ProjectFolderList from './ProjectFolderList';
import FolderContents from './FolderContents';
import DocumentViewer from './DocumentViewer';

export type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'projectFolders'; clientId: string; clientName: string; projectId: string; projectName: string }
  | { screen: 'folder'; clientId: string; clientName: string; projectId?: string; projectName?: string; folderRecordId: string; folderTypeKey: string; folderName: string; folderLevel: 'client' | 'project' }
  | { screen: 'viewer'; documentId: string };

export default function DocsContent() {
  const [navStack, setNavStack] = useState<NavScreen[]>([{ screen: 'list' }]);
  const [dismissedTabId, setDismissedTabId] = useState<string | null>(null);
  const { tabs, activeTabId, closeTab, switchTab, updateTab } = useTabs();

  // Check if active tab wants to show a specific document
  const activeTab = tabs.find(t => t.id === activeTabId);
  // Clear dismissed state when active tab changes
  if (dismissedTabId && activeTabId !== dismissedTabId) {
    setDismissedTabId(null);
  }
  // Ignore dismissed tab (prevents flash before React processes closeTab)
  const tabDocumentId = (activeTabId !== dismissedTabId) ? activeTab?.params?.documentId : undefined;

  const currentScreen = navStack[navStack.length - 1];

  const push = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  // Viewer from nav stack
  const viewerScreen = navStack.find(s => s.screen === 'viewer') as Extract<NavScreen, { screen: 'viewer' }> | undefined;
  const closeViewer = useCallback(() => {
    // If opened via tab, just dismiss the viewer — keep the tab alive
    // (tab only closes when user taps X on the tab pill in TabManager)
    if (tabDocumentId && activeTabId) {
      setDismissedTabId(activeTabId);
      // Switch to dashboard tab so the viewer hides
      const dashTab = tabs.find(t => t.id === 'dashboard');
      if (dashTab) switchTab(dashTab.id);
    }
    // Clear from nav stack
    setNavStack(prev => prev.filter(s => s.screen !== 'viewer'));
  }, [tabDocumentId, activeTabId, tabs, switchTab]);

  const openViewer = useCallback((documentId: string) => {
    push({ screen: 'viewer', documentId });
  }, [push]);

  // Determine which document to show: tab param takes priority, then nav stack
  const activeDocumentId = tabDocumentId || viewerScreen?.documentId;
  const isViewerOpen = !!activeDocumentId;

  // When viewer is open, show ONLY the viewer (not as overlay — replaces content)
  // Header + TabManager stay visible via MobileShell
  if (isViewerOpen) {
    return (
      <DocumentViewer
        documentId={activeDocumentId!}
        onClose={closeViewer}
      />
    );
  }

  // Base screen from nav stack (no viewer)
  const baseScreen = currentScreen;

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
        <ProjectFolderList
          clientId={baseScreen.clientId}
          clientName={baseScreen.clientName}
          projectId={baseScreen.projectId}
          projectName={baseScreen.projectName}
          onBack={pop}
          onSelectFolder={(folderRecordId, folderTypeKey, folderName) =>
            push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId: baseScreen.projectId, projectName: baseScreen.projectName, folderRecordId, folderTypeKey, folderName, folderLevel: 'project' })
          }
        />
      )}
      {baseScreen.screen === 'folder' && (
        <FolderContents
          clientId={baseScreen.clientId}
          clientName={baseScreen.clientName}
          projectId={baseScreen.projectId}
          projectName={baseScreen.projectName}
          folderRecordId={baseScreen.folderRecordId}
          folderTypeKey={baseScreen.folderTypeKey}
          folderName={baseScreen.folderName}
          folderLevel={baseScreen.folderLevel}
          onBack={pop}
          onOpenSubfolder={(folderRecordId, folderTypeKey, folderName) =>
            push({ screen: 'folder', clientId: baseScreen.clientId, clientName: baseScreen.clientName, projectId: baseScreen.projectId, projectName: baseScreen.projectName, folderRecordId, folderTypeKey, folderName, folderLevel: baseScreen.folderLevel })
          }
          onOpenViewer={openViewer}
        />
      )}
    </div>
  );
}
