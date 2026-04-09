'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface MobileLayoutContextType {
  hideFooter: boolean;
  setHideFooter: (hide: boolean) => void;
}

const MobileLayoutContext = createContext<MobileLayoutContextType>({
  hideFooter: false,
  setHideFooter: () => {},
});

export function MobileLayoutProvider({ children }: { children: ReactNode }) {
  const [hideFooter, setHideFooter] = useState(false);
  return (
    <MobileLayoutContext.Provider value={{ hideFooter, setHideFooter }}>
      {children}
    </MobileLayoutContext.Provider>
  );
}

export function useMobileLayout() {
  return useContext(MobileLayoutContext);
}
