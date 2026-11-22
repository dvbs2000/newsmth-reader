import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AuthStatusPayload, UnreadSummary } from '../types/smth';

interface AuthContextValue {
  status: AuthStatusPayload | null;
  loading: boolean;
  unread: UnreadSummary;
  loginDialogOpen: boolean;
  openLoginDialog: () => void;
  closeLoginDialog: () => void;
  refreshAuth: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  logout: () => Promise<void>;
}

const EMPTY_UNREAD: UnreadSummary = { at: 0, reply: 0, like: 0, mail: 0, total: 0 };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState<UnreadSummary>(EMPTY_UNREAD);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);

  const refreshUnread = useCallback(async () => {
    try {
      const summary = await api.getUnreadSummary();
      setUnread(summary);
    } catch {
      setUnread(EMPTY_UNREAD);
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await api.getAuthStatus();
      setStatus(data);
      if (data.loggedIn) {
        void refreshUnread();
      } else {
        setUnread(EMPTY_UNREAD);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [refreshUnread]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // Background unread poll every 90s while logged in
  useEffect(() => {
    if (!status?.loggedIn) return;
    const id = setInterval(() => void refreshUnread(), 90_000);
    return () => clearInterval(id);
  }, [status?.loggedIn, refreshUnread]);

  const logout = useCallback(async () => {
    await api.logout();
    setUnread(EMPTY_UNREAD);
    await refreshAuth();
  }, [refreshAuth]);

  return (
    <AuthContext.Provider
      value={{
        status,
        loading,
        unread,
        loginDialogOpen,
        openLoginDialog: () => setLoginDialogOpen(true),
        closeLoginDialog: () => setLoginDialogOpen(false),
        refreshAuth,
        refreshUnread,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
