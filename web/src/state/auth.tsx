import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client';
import type { Principal } from '../api/types';

interface AuthState {
  principal: Principal | null;
  loading: boolean;
  requestOtp: (identifier: string) => Promise<{ devCode?: string; email?: string }>;
  verify: (identifier: string, code: string) => Promise<void>;
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

  const requestOtp = async (identifier: string) => {
    return api<{ devCode?: string; email?: string }>('/auth/request-otp', { body: { identifier } });
  };

  const verify = async (identifier: string, code: string) => {
    const r = await api<{ token: string; principal: Principal }>('/auth/verify', {
      body: { identifier, code },
    });
    setToken(r.token);
    setPrincipal(r.principal);
  };

  const logout = () => {
    setToken(null);
    setPrincipal(null);
  };

  return (
    <Ctx.Provider value={{ principal, loading, requestOtp, verify, logout }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
