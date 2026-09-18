import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../state/auth';
import { useToast } from '../../state/toast';
import { EmptyState, LoadingScreen, Pill, useApi } from '../../components/ui';

interface AdminTeam {
  id: string;
  title: string | null;
  route: string;
  status: string;
  is_solo: boolean;
  project_id: string | null;
  created_at: string;
  members: { name: string; regNo: string }[] | null;
}

export function AdminTeams() {
  const { principal } = useAuth();
  const toast = useToast();
  const isAdmin = principal?.role === 'admin';
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const q = useApi(() => api<{ teams: AdminTeam[] }>(`/admin/teams${status ? `?status=${status}` : ''}`), [status]);

  const cancel = async (id: string) => {
    if (!confirm('Cancel this team? Members are freed and pending requests are cancelled.')) return;
    setBusy(id);
    try {
      await api(`/admin/teams/${id}/cancel`, { body: {} });
      toast('Team cancelled', 'success');
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (q.loading) return <LoadingScreen />;
  const teams = q.data?.teams ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Teams & requests</h1>
        <p>Browse every team; {isAdmin ? 'override or cancel any of them.' : 'read-only view.'}</p>
      </div>

      <div className="row">
        <select className="select" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['forming', 'confirmed', 'submitted', 'approved', 'rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {teams.length === 0 ? (
        <EmptyState icon="⬡" title="No teams">Nothing matches this filter yet.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Team / title</th><th>Route</th><th>Members</th><th>Status</th><th>Project ID</th>{isAdmin && <th></th>}</tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>{t.title ?? <span className="list__meta">Untitled</span>}{t.is_solo && ' · solo'}</td>
                  <td>{t.route === 'cdc' ? 'CDC' : 'In-house'}</td>
                  <td>{(t.members ?? []).map((m) => m.name).join(', ') || '-'}</td>
                  <td><Pill status={t.status} /></td>
                  <td className="mono">{t.project_id ?? '-'}</td>
                  {isAdmin && (
                    <td>
                      <button className="btn btn--danger btn--sm" disabled={busy === t.id} onClick={() => cancel(t.id)}>Cancel</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
