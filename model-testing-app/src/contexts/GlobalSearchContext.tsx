'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface GlobalSearchContextType {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const GlobalSearchContext = createContext<GlobalSearchContextType | undefined>(undefined);

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <GlobalSearchContext.Provider value={{ isOpen, setIsOpen }}>
      {children}
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext);
  if (context === undefined) {
    throw new Error('useGlobalSearch must be used within a GlobalSearchProvider');
  }
  return context;
}

