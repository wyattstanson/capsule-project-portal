import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';

// Same rule as the API: letters, digits, _ and @ only; 6–24 chars.
const PW_RE = /^[A-Za-z0-9_@]{6,24}$/;
const CHARSET_RE = /^[A-Za-z0-9_@]*$/;

export function SetPassword() {
  const { principal, setPassword, logout } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const lenOk = pw.length >= 6 && pw.length <= 24;
  const charOk = CHARSET_RE.test(pw) && pw.length > 0;
  const matchOk = pw.length > 0 && pw === pw2;
  const valid = PW_RE.test(pw) && matchOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await setPassword(pw);
      toast('Password set — you’re in', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const Req = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className="row" style={{ gap: 8, color: ok ? 'var(--success)' : 'var(--text-tertiary)' }}>
      <span style={{ width: 14 }}>{ok ? '✓' : '○'}</span>
      <span style={{ fontSize: 12.5 }}>{children}</span>
    </div>
  );

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <h1>One-time key used — set your password</h1>
        <p>
          Welcome, {principal?.name?.split(' ')[0]}. Your 16-character hashkey works only once. Set a
          password now — you’ll use it from here on.
        </p>
      </section>
      <section className="login-panel">
        <div className="login-card panel panel--raised">
          <h2>Set a password</h2>
          <p className="panel__hint">Choose something only you know.</p>
          <form onSubmit={submit} className="stack">
            <div className="field">
              <label htmlFor="np">New password</label>
              <input id="np" className="input" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6–24 characters" />
            </div>
            <div className="field">
              <label htmlFor="np2">Confirm password</label>
              <input id="np2" className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Repeat it" />
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <Req ok={lenOk}>6 to 24 characters</Req>
              <Req ok={charOk}>Only letters, numbers, _ and @</Req>
              <Req ok={matchOk}>Both entries match</Req>
            </div>
            <button className="btn btn--primary btn--block" disabled={busy || !valid}>
              {busy ? 'Saving…' : 'Set password & continue'}
            </button>
            <button type="button" className="btn btn--subtle btn--block" onClick={logout}>
              Cancel & sign out
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
