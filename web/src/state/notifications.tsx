import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, API_BASE } from '../api/client';
import type { AppNotification } from '../api/types';
import { useAuth } from './auth';
import { useToast } from './toast';

interface NotifState {
  items: AppNotification[];
  unread: number;
  /** Increments on every live event — pages depend on it to refetch. */
  revision: number;
  reload: () => Promise<void>;
  markAllRead: () => Promise<void>;
}

const Ctx = createContext<NotifState | null>(null);

const HUMAN: Record<string, string> = {
  request_received: 'New team request',
  request_accepted: 'A student accepted your invite',
  request_rejected: 'A student declined your invite',
  request_auto_cancelled: 'A pending request was auto-cancelled',
  team_confirmed: 'Your team is confirmed',
  approved: 'Your project was approved',
  rejected: 'Your submission needs changes',
  team_cancelled_by_admin: 'An admin cancelled your team',
};

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { principal } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [revision, setRevision] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const isStudent = principal?.kind === 'student';

  const reload = async () => {
    if (!isStudent) return;
    const r = await api<{ notifications: AppNotification[] }>('/notifications');
    setItems(r.notifications);
  };

  const markAllRead = async () => {
    if (!isStudent) return;
    await api('/notifications/read', { body: {} });
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  };

  useEffect(() => {
    if (!isStudent) return;
    void reload();

    let closed = false;
    (async () => {
      try {
        const { ticket } = await api<{ ticket: string }>('/realtime/ticket', { body: {} });
        if (closed) return;
        const es = new EventSource(`${API_BASE}/api/realtime/stream?ticket=${encodeURIComponent(ticket)}`);
        esRef.current = es;
        es.addEventListener('notification', (ev) => {
          try {
            const data = JSON.parse((ev as MessageEvent).data) as AppNotification;
            setItems((prev) => [data, ...prev]);
            setRevision((r) => r + 1);
            toast(HUMAN[data.type] ?? 'Update received', data.type === 'approved' ? 'success' : 'info');
          } catch {
            /* ignore malformed frame */
          }
        });
      } catch {
        /* SSE unavailable — the UI still works via manual refresh */
      }
    })();

    return () => {
      closed = true;
      esRef.current?.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, principal?.sub]);

  const unread = items.filter((n) => !n.read_at).length;

  return (
    <Ctx.Provider value={{ items, unread, revision, reload, markAllRead }}>{children}</Ctx.Provider>
  );
}

export function useNotifications(): NotifState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications outside provider');
  return ctx;
}

export function notificationLabel(type: string): string {
  return HUMAN[type] ?? type;
}
