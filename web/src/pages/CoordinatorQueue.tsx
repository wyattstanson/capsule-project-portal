import { useState } from 'react';
import { api } from '../api/client';
import type { SubmissionRow } from '../api/types';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { EmptyState, LoadingScreen, Pill, useApi } from '../components/ui';

export function CoordinatorQueue() {
  const { principal } = useAuth();
  const toast = useToast();
  const isCdc = principal?.role === 'cdc_coordinator';
  const endpoint = isCdc ? '/queue/cdc' : '/queue/project';
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const q = useApi(() => api<{ submissions: SubmissionRow[] }>(`${endpoint}?status=${tab}`), [endpoint, tab]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      const r = await api<{ status: string; projectId?: string }>('/submissions/review', {
        body: { submissionId: id, decision, remark: remarks[id] ?? '' },
      });
      toast(
        decision === 'approve' ? `Approved — ${r.projectId}` : 'Returned to student with remark',
        decision === 'approve' ? 'success' : 'info',
      );
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (q.loading) return <LoadingScreen />;
  const subs = q.data?.submissions ?? [];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{isCdc ? 'CDC review queue' : 'In-house review queue'}</h1>
        <p>{isCdc ? 'Solo / placement submissions with proof of placement.' : 'In-house team submissions with a proposed title.'}</p>
      </div>

      <div className="row">
        {(['pending', 'approved', 'rejected'] as const).map((t) => (
          <button key={t} className={`btn btn--sm ${tab === t ? 'btn--primary' : 'btn--secondary'}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {subs.length === 0 ? (
        <EmptyState icon="☑" title={`No ${tab} submissions`}>
          {tab === 'pending' ? 'The queue is clear.' : `Nothing ${tab} yet.`}
        </EmptyState>
      ) : (
        subs.map((s) => (
          <div key={s.id} className="panel">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="panel__title" style={{ margin: 0 }}>
                {isCdc ? (s.members?.[0]?.name ?? 'Solo student') : s.title ?? 'Untitled project'}
              </div>
              <Pill status={s.status} />
            </div>

            <div className="stack" style={{ gap: 6, marginTop: 12 }}>
              <div className="list__meta"><b>Members:</b> {s.members?.map((m) => `${m.name} (${m.regNo})`).join(', ')}</div>
              {isCdc && s.reason && <div><b>Reason:</b> {s.reason}</div>}
              {isCdc && s.remark && <div><b>Remark:</b> {s.remark}</div>}
              {isCdc && s.attachment_url && (
                <div><b>Proof:</b> <a href={`/api${s.attachment_url.startsWith('/files') ? s.attachment_url : `/files/${s.attachment_url}`}`} target="_blank" rel="noreferrer">Open file</a></div>
              )}
            </div>

            {s.status === 'pending' && (
              <div className="stack" style={{ marginTop: 16 }}>
                <textarea
                  className="textarea"
                  placeholder="Remark (required for rejection, optional for approval)"
                  value={remarks[s.id] ?? ''}
                  onChange={(e) => setRemarks((r) => ({ ...r, [s.id]: e.target.value }))}
                />
                <div className="row">
                  <button className="btn btn--success" disabled={busy === s.id} onClick={() => decide(s.id, 'approve')}>
                    Approve & issue ID
                  </button>
                  <button
                    className="btn btn--danger"
                    disabled={busy === s.id || !(remarks[s.id] ?? '').trim()}
                    onClick={() => decide(s.id, 'reject')}
                  >
                    Reject with remark
                  </button>
                </div>
              </div>
            )}
            {s.status !== 'pending' && s.reviewer_remark && (
              <p className="panel__hint" style={{ marginTop: 12 }}><b>Your remark:</b> {s.reviewer_remark}</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
