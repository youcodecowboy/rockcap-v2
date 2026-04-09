'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTabs } from '@/contexts/TabContext';
import ClientList from './ClientList';
import ClientDetail from './ClientDetail';
import ProjectDetail from './ProjectDetail';

export type NavScreen =
  | { screen: 'list' }
  | { screen: 'client'; clientId: string; clientName: string }
  | { screen: 'project'; clientId: string; clientName: string; projectId: string; projectName: string };

export default function ClientsContent() {
  const [navStack, setNavStack] = useState<NavScreen[]>([{ screen: 'list' }]);
  const { tabs: openTabs, activeTabId } = useTabs();
  const activeTab = openTabs.find(t => t.id === activeTabId);

  const currentScreen = navStack[navStack.length - 1];

  const push = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const pop = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  useEffect(() => {
    const paramClientId = activeTab?.params?.clientId;
    const paramClientName = activeTab?.params?.clientName;
    if (paramClientId && paramClientName && navStack.length === 1 && navStack[0].screen === 'list') {
      push({ screen: 'client', clientId: paramClientId, clientName: paramClientName });
    }
  }, [activeTab?.params?.clientId]);

  return (
    <div className="min-h-[60vh]">
      {currentScreen.screen === 'list' && (
        <ClientList
          onSelectClient={(clientId, clientName) =>
            push({ screen: 'client', clientId, clientName })
          }
        />
      )}
      {currentScreen.screen === 'client' && (
        <ClientDetail
          clientId={currentScreen.clientId}
          clientName={currentScreen.clientName}
          onBack={pop}
          onSelectProject={(projectId, projectName) =>
            push({
              screen: 'project',
              clientId: currentScreen.clientId,
              clientName: currentScreen.clientName,
              projectId,
              projectName,
            })
          }
        />
      )}
      {currentScreen.screen === 'project' && (
        <ProjectDetail
          clientId={currentScreen.clientId}
          clientName={currentScreen.clientName}
          projectId={currentScreen.projectId}
          projectName={currentScreen.projectName}
          onBack={pop}
        />
      )}
    </div>
  );
}
