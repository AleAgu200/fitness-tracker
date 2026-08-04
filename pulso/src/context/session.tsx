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
    const userId = state.userId;
    // Let route guards and screens react before any network cleanup. Logout
    // must be immediate even when the server is slow or unavailable.
    setState({ userId: null, sessionId: null, loading: false });

    const cleanups: Promise<void>[] = [];
    if (userId) {
      // Start this first so it captures the current cookie before authSignOut
      // clears local storage. It still completes in parallel with revocation.
      cleanups.push(
        unregisterNotificationsForUser(userId).catch((e) => {
          console.warn('[session] push unregister failed', e);
        }),
      );
    }
    cleanups.push(
      authSignOut().catch((e) => {
        // authSignOut has already cleared the local cookie at this point.
        console.warn('[session] remote sign-out failed', e);
      }),
    );
    await Promise.all(cleanups);
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
