import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { getActiveSession, signOut as authSignOut } from '@/lib/auth';
import { unregisterNotificationsForUser } from '@/lib/notifications';

interface SessionState {
  userId: string | null;
  sessionId: string | null;
  loading: boolean;
}

interface SessionContextValue extends SessionState {
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ userId: null, sessionId: null, loading: true });

  const refresh = useCallback(async () => {
    const session = await getActiveSession();
    setState({
      userId: session?.userId ?? null,
      sessionId: session?.sessionId ?? null,
      loading: false,
    });
  }, []);

  const signOut = useCallback(async () => {
    if (state.userId) {
      try {
        await unregisterNotificationsForUser(state.userId);
      } catch (e) {
        console.warn('[session] push unregister failed', e);
      }
    }
    try {
      await authSignOut();
    } catch (e) {
      // Server unreachable — still sign out locally; the cookie is cleared either way
      console.warn('[session] remote sign-out failed', e);
    }
    setState({ userId: null, sessionId: null, loading: false });
  }, [state.userId]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <SessionContext.Provider value={{ ...state, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
