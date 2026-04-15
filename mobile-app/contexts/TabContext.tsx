import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface DocTab {
  id: string;
  documentId: string;
  title: string;
  fileType: string;
  fileUrl?: string;
}

interface TabContextType {
  tabs: DocTab[];
  activeTabId: string | null;
  openTab: (tab: Omit<DocTab, 'id'>) => string;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
}

const MAX_TABS = 12;
const TabContext = createContext<TabContextType | undefined>(undefined);

export function DocTabProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<DocTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback(
    (tabData: Omit<DocTab, 'id'>) => {
      const existing = tabs.find((t) => t.documentId === tabData.documentId);
      if (existing) {
        setActiveTabId(existing.id);
        return existing.id;
      }

      const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newTab: DocTab = { ...tabData, id };

      setTabs((prev) => {
        const updated = [...prev, newTab];
        if (updated.length > MAX_TABS) {
          const indexToRemove = updated.findIndex(
            (t) => t.id !== activeTabId && t.id !== id
          );
          if (indexToRemove !== -1) updated.splice(indexToRemove, 1);
        }
        return updated;
      });
      setActiveTabId(id);
      return id;
    },
    [tabs, activeTabId]
  );

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (id === activeTabId && filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].id);
        } else if (filtered.length === 0) {
          setActiveTabId(null);
        }
        return filtered;
      });
    },
    [activeTabId]
  );

  const switchTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  return (
    <TabContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab }}>
      {children}
    </TabContext.Provider>
  );
}

export function useDocTabs() {
  const context = useContext(TabContext);
  if (!context) throw new Error('useDocTabs must be used within DocTabProvider');
  return context;
}
