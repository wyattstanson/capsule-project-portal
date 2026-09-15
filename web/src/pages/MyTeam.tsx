import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { OutgoingRequest, Team } from '../api/types';
import { useAuth } from '../state/auth';
import { useRevision } from '../state/outlet';
import { useToast } from '../state/toast';
import { EmptyState, LoadingScreen, Pill, useApi } from '../components/ui';

export function MyTeam() {
  const { principal } = useAuth();
  const toast = useToast();
  const revision = useRevision();
  const [busy, setBusy] = useState(false);
  const [soloRoute, setSoloRoute] = useState<'inhouse' | 'cdc'>('inhouse');

  const teamQ = useApi(() => api<{ team: Team | null }>('/team/me'), [revision]);
  const reqQ = useApi(() => api<{ outgoing: OutgoingRequest[] }>('/requests'), [revision]);

  if (teamQ.loading) return <LoadingScreen />;
  const team = teamQ.data?.team ?? null;
  const isLeader = team?.leaderId === principal?.sub;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, 'success');
      teamQ.reload();
      reqQ.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pendingOut = (reqQ.data?.outgoing ?? []).filter((r) => r.status === 'pending');

  return (
    <div className="stack">
      <div className="page-head">
        <h1>My team</h1>
        <p>Confirm a team of up to three, or go solo. Confirming locks membership and cancels other pending invites.</p>
      </div>

      {!team ? (
        <div className="grid-2">
          <div className="panel">
            <div className="panel__title">Build a team</div>
            <p className="panel__hint">Invite peers, then confirm once everyone’s in.</p>
            <Link className="btn btn--primary" to="/browse">Browse students</Link>
          </div>
          <div className="panel">
            <div className="panel__title">Or go solo</div>
            <p className="panel__hint">Confirm as a single-member team, or take the CDC placement route.</p>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Route</label>
              <select className="select" value={soloRoute} onChange={(e) => setSoloRoute(e.target.value as 'inhouse' | 'cdc')}>
                <option value="inhouse">In-house project (single member)</option>
                <option value="cdc">CDC / placement route</option>
              </select>
            </div>
            <button
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => act(() => api('/team/confirm-solo', { body: { route: soloRoute } }), 'Confirmed as solo')}
            >
              Confirm solo
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="panel panel--raised">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="panel__title" style={{ margin: 0 }}>
                {team.title ?? 'Untitled team'}
              </div>
              <div className="row">
                <Pill status={team.status} />
                {team.isSolo && <Pill status="neutral">Solo</Pill>}
                <Pill status="neutral">{team.route === 'cdc' ? 'CDC route' : 'In-house'}</Pill>
              </div>
            </div>
            {team.projectId && <p className="panel__hint" style={{ marginTop: 8 }}>Project ID <b className="mono">{team.projectId}</b></p>}

            <div className="stack" style={{ gap: 8, marginTop: 16 }}>
              {team.members.map((m) => (
                <div key={m.studentId} className="list__row" style={{ padding: '10px 0', borderColor: 'var(--border)' }}>
                  <div className="list__avatar">{m.name.slice(0, 2).toUpperCase()}</div>
                  <div className="list__main">
                    <div className="list__name">{m.name}{m.isLeader && ' · Leader'}</div>
                    <div className="list__meta mono">{m.regNo}</div>
                  </div>
                </div>
              ))}
            </div>

            {team.status === 'forming' && isLeader && (
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn btn--secondary" to="/browse">Invite more</Link>
                <button
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => act(() => api('/team/confirm', { body: {} }), 'Team confirmed')}
                >
                  Confirm team ({team.members.length})
                </button>
                <button
                  className="btn btn--subtle"
                  disabled={busy}
                  onClick={() => act(() => api('/team/leave', { body: {} }), 'Left the team')}
                >
                  Disband / leave
                </button>
              </div>
            )}
            {team.status === 'forming' && !isLeader && (
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn btn--subtle" disabled={busy} onClick={() => act(() => api('/team/leave', { body: {} }), 'Left the team')}>
                  Leave team
                </button>
              </div>
            )}
            {(team.status === 'confirmed' || team.status === 'rejected') && (
              <div className="row" style={{ marginTop: 16 }}>
                <Link className="btn btn--primary" to="/submissions">
                  {team.route === 'cdc' ? 'Go to CDC submission' : 'Submit for approval'}
                </Link>
              </div>
            )}
          </div>

          {team.status === 'forming' && isLeader && (
            <div className="panel">
              <div className="panel__title">Pending invites</div>
              {pendingOut.length === 0 ? (
                <EmptyState icon="✉" title="No pending invites">Invite peers from Browse Students.</EmptyState>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {pendingOut.map((r) => (
                    <div key={r.id} className="row" style={{ justifyContent: 'space-between' }}>
                      <span>{r.to_name} <span className="mono list__meta">{r.to_reg_no}</span></span>
                      <Pill status="pending">awaiting</Pill>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
