import { api } from '../../api/client';
import { EmptyState, LoadingScreen, useApi } from '../../components/ui';

interface Entry {
  id: number;
  actor_kind: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export function AdminAudit() {
  const q = useApi(() => api<{ entries: Entry[] }>('/admin/audit?limit=200'), []);
  if (q.loading) return <LoadingScreen />;
  const entries = q.data?.entries ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Audit log</h1>
        <p>Every approve, reject, cancel and override, most recent first.</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="No activity yet">Actions will be recorded here.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString()}</td>
                  <td>{e.actor_kind}</td>
                  <td className="mono">{e.action}</td>
                  <td>{e.target_type}{e.target_id ? ` · ${String(e.target_id).slice(0, 8)}` : ''}</td>
                  <td className="mono" style={{ fontSize: 11, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(e.detail)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
