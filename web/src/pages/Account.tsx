import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { IconCheck } from '../components/icons';

// Same rule as the API: letters, digits, _ and @ only; 6-24 chars.
const PW_RE = /^[A-Za-z0-9_@]{6,24}$/;
const CHARSET_RE = /^[A-Za-z0-9_@]*$/;

const ROLE_LABELS: Record<string, string> = {
  student: 'Student',
  project_coordinator: 'Project Coordinator',
  cdc_coordinator: 'CDC Coordinator',
  admin: 'Administrator',
  proctor: 'Proctor',
};

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={`req${ok ? ' ok' : ''}`}>
      <span className="rd" aria-hidden>
        {ok ? (
          <IconCheck width={14} height={14} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="7" /></svg>
        )}
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Account() {
  const { principal, changePassword } = useAuth();
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const lenOk = pw.length >= 6 && pw.length <= 24;
  const charOk = CHARSET_RE.test(pw) && pw.length > 0;
  const matchOk = pw.length > 0 && pw === pw2;
  const differsOk = pw.length > 0 && pw !== cur;
  const valid = cur.length > 0 && PW_RE.test(pw) && matchOk && differsOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await changePassword(cur, pw);
      toast('Password changed', 'success');
      setCur('');
      setPw('');
      setPw2('');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const detail = (label: string, value: string) => (
    <div className="mrow" style={{ justifyContent: 'space-between' }}>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Account</h1>
        <p>Your sign-in details and password.</p>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title">Profile</div>
          <p className="panel__hint">How you’re signed in.</p>
          {detail('Name', principal?.name ?? '-')}
          {detail('Role', ROLE_LABELS[principal?.role ?? ''] ?? principal?.role ?? '-')}
          {detail('Email', principal?.email ?? '-')}
        </div>

        <div className="panel">
          <div className="panel__title">Change password</div>
          <p className="panel__hint">Choose something only you know.</p>
          <form onSubmit={submit} className="stack">
            <div className="field">
              <label htmlFor="cur">Current password</label>
              <input id="cur" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Your current password or hashkey" />
            </div>
            <div className="field">
              <label htmlFor="np">New password</label>
              <input id="np" className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6 to 24 characters" />
            </div>
            <div className="field">
              <label htmlFor="np2">Confirm new password</label>
              <input id="np2" className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat it" />
            </div>
            <div className="reqs">
              <Req ok={lenOk}>6 to 24 characters</Req>
              <Req ok={charOk}>Only letters, numbers, _ and @</Req>
              <Req ok={matchOk}>Both entries match</Req>
              <Req ok={differsOk}>Different from your current password</Req>
            </div>
            <button className="btn btn--primary btn--block" disabled={busy || !valid}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
