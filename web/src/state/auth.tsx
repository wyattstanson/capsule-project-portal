import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import type { Principal } from '../api/types';

interface AuthState {
  principal: Principal | null;
  loading: boolean;
  mustSetPassword: boolean;
  login: (identifier: string, password: string) => Promise<{ mustSetPassword: boolean }>;
  setPassword: (newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustSet, setMustSet] = useState(false);

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
    const r = await api<{ token: string; principal: Principal; mustSetPassword?: boolean }>(
      '/auth/login',
      { body: { identifier, password } },
    );
    setToken(r.token);
    setPrincipal(r.principal);
    setMustSet(!!r.mustSetPassword);
    return { mustSetPassword: !!r.mustSetPassword };
  };

  const setPassword = async (newPassword: string) => {
    await api('/auth/set-password', { body: { newPassword } });
    setMustSet(false);
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api('/auth/change-password', { body: { currentPassword, newPassword } });
  };

  const logout = () => {
    setToken(null);
    setPrincipal(null);
    setMustSet(false);
  };

  return (
    <Ctx.Provider value={{ principal, loading, mustSetPassword: mustSet, login, setPassword, changePassword, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
