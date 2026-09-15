import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import type { Principal } from '../api/types';

interface AuthState {
  principal: Principal | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ principal: Principal }>('/auth/me')
      .then((r) => setPrincipal(r.principal))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (identifier: string, password: string) => {
    const r = await api<{ token: string; principal: Principal }>('/auth/login', {
      body: { identifier, password },
    });
    setToken(r.token);
    setPrincipal(r.principal);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api('/auth/change-password', { body: { currentPassword, newPassword } });
  };

  const logout = () => {
    setToken(null);
    setPrincipal(null);
  };

  return (
    <Ctx.Provider value={{ principal, loading, login, changePassword, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
