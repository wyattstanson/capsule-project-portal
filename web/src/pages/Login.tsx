import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <section className="login-hero">
        <h1>Capsule Project team formation & approval</h1>
        <p>
          Sign in with your registration number. Form your team or take the CDC placement route,
          submit for coordinator approval, and get your project ID.
        </p>
        <div className="login-hero__points">
          {[
            ['⬡', 'Build a team of up to three, or go solo'],
            ['⚡', 'Real-time invites — no double-booking'],
            ['☑', 'Your email stays private (encrypted, masked)'],
          ].map(([icon, text]) => (
            <div className="login-hero__point" key={text}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card panel panel--raised">
          <h2>Sign in</h2>
          <p className="panel__hint">
            Use your registration number and password. Staff sign in with email or username.
          </p>
          <form onSubmit={submit} className="stack">
            <div className="field">
              <label htmlFor="identifier">Registration number or email</label>
              <input
                id="identifier"
                className="input mono"
                autoFocus
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="22CCE1000"
                style={{ textTransform: 'none' }}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Hashkey or password</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="16-char hashkey, or your password"
              />
              <span className="field__hint">
                First time? Sign in with the 16-character hashkey your admin issued, then change it
                to a password. Admins sign in with username (e.g. <b>admin</b>) + password.
              </span>
            </div>
            <button className="btn btn--primary btn--block" disabled={busy || !identifier.trim() || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
