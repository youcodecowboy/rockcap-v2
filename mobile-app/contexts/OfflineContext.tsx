import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { getQueue, removeFromQueue } from '@/lib/offlineQueue';

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
}

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  pendingCount: 0,
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
      if (online) {
        flushQueue();
      }
    });
    return () => unsubscribe();
  }, []);

  const flushQueue = useCallback(async () => {
    const queue = await getQueue();
    setPendingCount(queue.length);

    for (const item of queue) {
      if (item.status === 'pending') {
        try {
          await removeFromQueue(item.id);
        } catch {
          // Will retry on next reconnect
        }
      }
    }

    const remaining = await getQueue();
    setPendingCount(remaining.length);
  }, []);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
