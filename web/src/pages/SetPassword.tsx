import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { ThemeToggle, PasswordInput } from '../components/ui';
import { IconCheck } from '../components/icons';

// Same rule as the API: letters, digits, _ and @ only; 8-24 chars.
const PW_RE = /^[A-Za-z0-9_@]{8,24}$/;
const CHARSET_RE = /^[A-Za-z0-9_@]*$/;

export function SetPassword() {
  const { principal, setPassword, logout } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const lenOk = pw.length >= 8 && pw.length <= 24;
  const charOk = CHARSET_RE.test(pw) && pw.length > 0;
  const matchOk = pw.length > 0 && pw === pw2;
  const valid = PW_RE.test(pw) && matchOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    try {
      await setPassword(pw);
      toast('Password set, you’re in', 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const Req = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
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

  return (
    <div className="login-wrap">
      <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 40 }}><ThemeToggle /></div>
      <section className="login-hero">
        <div className="eyebrow">One-time key used</div>
        <h1 style={{ fontSize: 46 }}>Set your password.</h1>
        <p>
          Welcome, {principal?.name?.split(' ')[0]}. Your 16-character hashkey works only once. Set a
          password now, and you’ll use it from here on.
        </p>
      </section>
      <section className="login-panel">
        <div className="login-card panel panel--raised">
          <h2>Set a password</h2>
          <p className="panel__hint">Choose something only you know.</p>
          <form onSubmit={submit} className="stack">
            <div className="field">
              <label htmlFor="np">New password</label>
              <PasswordInput id="np" autoFocus value={pw} onChange={setPw} placeholder="8 to 24 characters" autoComplete="new-password" />
            </div>
            <div className="field">
              <label htmlFor="np2">Confirm password</label>
              <PasswordInput id="np2" value={pw2} onChange={setPw2} placeholder="Repeat it" autoComplete="new-password" />
            </div>
            <div className="reqs">
              <Req ok={lenOk}>8 to 24 characters</Req>
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
