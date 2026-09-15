import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { SubmissionRow, Team } from '../api/types';
import { useRevision } from '../state/outlet';
import { useToast } from '../state/toast';
import { EmptyState, LoadingScreen, Pill, useApi } from '../components/ui';
import { IconClock, IconStar } from '../components/icons';

export function Submissions() {
  const toast = useToast();
  const revision = useRevision();
  const [title, setTitle] = useState('');
  const [remark, setRemark] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useApi(() => api<{ team?: Team; history: SubmissionRow[] }>('/submissions/mine'), [revision]);

  if (q.loading) return <LoadingScreen />;
  const team = q.data?.team;
  const history = q.data?.history ?? [];

  if (!team) {
    return (
      <div className="stack">
        <div className="page-head"><h1>Submissions</h1></div>
        <EmptyState icon="⬡" title="No team yet">
          Confirm a team or go solo first. <Link to="/team">Go to My Team</Link>
        </EmptyState>
      </div>
    );
  }

  const canSubmit = team.status === 'confirmed' || team.status === 'rejected';
  const isCdc = team.route === 'cdc';

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ url: string }>('/uploads', { formData: fd });
      setAttachmentUrl(r.url);
      toast('Proof uploaded', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api('/submissions', {
        body: isCdc
          ? { remark, reason, attachmentUrl }
          : { title: title || team.title },
      });
      toast('Submitted for review', 'success');
      q.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>{isCdc ? 'CDC / placement submission' : 'Project submission'}</h1>
        <p>{isCdc ? 'Submit your placement proof to the CDC coordinator.' : 'Propose a title and submit to the project coordinator.'}</p>
      </div>

      {team.status === 'submitted' && (
        <div className="status-banner status-banner--pending">
          <div className="status-banner__icon"><IconClock width={24} height={24} /></div>
          <div className="status-banner__body">
            <div className="status-banner__eyebrow">Under review</div>
            <div className="status-banner__title">Waiting on the {isCdc ? 'CDC' : 'project'} coordinator</div>
            <div className="status-banner__sub">You’ll be notified the moment a decision is made.</div>
          </div>
        </div>
      )}
      {team.status === 'approved' && (
        <div className="status-banner status-banner--approved">
          <div className="status-banner__icon"><IconStar width={24} height={24} /></div>
          <div className="status-banner__body">
            <div className="status-banner__eyebrow">Approved</div>
            <div className="status-banner__title">Project ID {team.projectId}</div>
            <div className="status-banner__sub">Your registration has been marked for update.</div>
          </div>
        </div>
      )}

      {canSubmit && (
        <div className="panel">
          <div className="panel__title">{team.status === 'rejected' ? 'Edit & resubmit' : 'New submission'}</div>
          <div className="stack">
            {isCdc ? (
              <>
                <div className="field">
                  <label htmlFor="reason">Reason for CDC route</label>
                  <textarea id="reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Confirmed placement at …" />
                </div>
                <div className="field">
                  <label htmlFor="remark">Remark (optional)</label>
                  <textarea id="remark" className="textarea" value={remark} onChange={(e) => setRemark(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="proof">Proof of placement (PDF / PPT / DOC)</label>
                  <input id="proof" type="file" accept=".pdf,.ppt,.pptx,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn btn--secondary btn--sm" disabled={!file || busy} onClick={upload}>Upload</button>
                    {attachmentUrl && <span className="pill pill--approved">uploaded</span>}
                  </div>
                </div>
              </>
            ) : (
              <div className="field">
                <label htmlFor="title">Project title</label>
                <input id="title" className="input" value={title || team.title || ''} onChange={(e) => setTitle(e.target.value)} placeholder="A clear, specific project title" />
              </div>
            )}
            <div>
              <button
                className="btn btn--primary"
                disabled={busy || (isCdc ? !attachmentUrl || !reason.trim() : !(title || team.title))}
                onClick={submit}
              >
                {team.status === 'rejected' ? 'Resubmit' : 'Submit for approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel__title">Review history</div>
        {history.length === 0 ? (
          <EmptyState icon="☑" title="No submissions yet">Your submissions and coordinator remarks appear here.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Submitted</th><th>Route</th><th>Status</th><th>Coordinator remark</th></tr>
              </thead>
              <tbody>
                {history.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.created_at).toLocaleString()}</td>
                    <td>{s.reviewer_role === 'cdc_coordinator' ? 'CDC' : 'In-house'}</td>
                    <td><Pill status={s.status} /></td>
                    <td>{s.reviewer_remark || <span className="list__meta">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
