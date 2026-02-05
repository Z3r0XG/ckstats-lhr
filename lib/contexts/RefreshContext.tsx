'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type RefreshContextType = {
  registerRefresh: (callback: () => void) => void;
  unregisterRefresh: () => void;
  triggerRefresh: () => void;
};

const RefreshContext = createContext<RefreshContextType | undefined>(undefined);

export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [refreshCallback, setRefreshCallback] = useState<(() => void) | null>(
    null
  );

  const registerRefresh = useCallback((callback: () => void) => {
    setRefreshCallback(() => callback);
  }, []);

  const unregisterRefresh = useCallback(() => {
    setRefreshCallback(null);
  }, []);

  const triggerRefresh = useCallback(() => {
    if (refreshCallback) {
      refreshCallback();
    }
  }, [refreshCallback]);

  return (
    <RefreshContext.Provider
      value={{ registerRefresh, unregisterRefresh, triggerRefresh }}
    >
      {children}
    </RefreshContext.Provider>
  );
}

export function useRefresh() {
  const context = useContext(RefreshContext);
  if (context === undefined) {
    throw new Error('useRefresh must be used within RefreshProvider');
  }
  return context;
}
