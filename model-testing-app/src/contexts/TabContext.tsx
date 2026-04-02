'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface Tab {
  id: string;
  type: 'dashboard' | 'clients' | 'docs' | 'tasks' | 'notes' | 'contacts' | 'page';
  title: string;
  route: string;
  params?: Record<string, string>;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (tab: Omit<Tab, 'id'>) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Omit<Tab, 'id'>>) => void;
}

const MAX_TABS = 12;

const TabContext = createContext<TabContextType | undefined>(undefined);

const defaultTab: Tab = {
  id: 'dashboard',
  type: 'dashboard',
  title: 'Dashboard',
  route: '/',
};

export function TabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([defaultTab]);
  const [activeTabId, setActiveTabId] = useState<string | null>('dashboard');

  const openTab = useCallback((tabData: Omit<Tab, 'id'>) => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTab: Tab = { ...tabData, id };

    setTabs(prev => {
      const updated = [...prev, newTab];
      if (updated.length > MAX_TABS) {
        const indexToRemove = updated.findIndex(t => t.id !== activeTabId && t.id !== id);
        if (indexToRemove !== -1) {
          updated.splice(indexToRemove, 1);
        }
      }
      return updated;
    });
    setActiveTabId(id);
    return id;
  }, [activeTabId]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (id === activeTabId && filtered.length > 0) {
        setActiveTabId(filtered[filtered.length - 1].id);
      }
      if (filtered.length === 0) {
        setActiveTabId('dashboard');
        return [defaultTab];
      }
      return filtered;
    });
  }, [activeTabId]);

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const updateTab = useCallback((id: string, updates: Partial<Omit<Tab, 'id'>>) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab, updateTab }}>
      {children}
    </TabContext.Provider>
  );
}

export function useTabs() {
  const context = useContext(TabContext);
  if (context === undefined) {
    throw new Error('useTabs must be used within a TabProvider');
  }
  return context;
}
