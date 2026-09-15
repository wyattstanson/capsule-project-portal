import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';

export function Login() {
  const { requestOtp, verify } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState<'id' | 'code'>('id');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitId = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await requestOtp(identifier.trim());
      setStep('code');
      if (r.devCode) {
        setDevCode(r.devCode);
        setCode(r.devCode);
      }
      toast('If that account exists, a code was sent.', 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await verify(identifier.trim(), code.trim());
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
          Form your team or take the CDC placement route, submit for coordinator approval, and get
          your project ID — all in one place.
        </p>
        <div className="login-hero__points">
          {[
            ['⬡', 'Build a team of up to three, or go solo'],
            ['⚡', 'Real-time invites — no double-booking'],
            ['☑', 'Coordinator review with a clear audit trail'],
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
            {step === 'id'
              ? 'Use your registration number or institute email.'
              : `Enter the 6-digit code sent to your email.`}
          </p>

          {step === 'id' ? (
            <form onSubmit={submitId} className="stack">
              <div className="field">
                <label htmlFor="identifier">Registration number or email</label>
                <input
                  id="identifier"
                  className="input"
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="22CCE1000 or you@univ.edu"
                />
              </div>
              <button className="btn btn--primary btn--block" disabled={busy || !identifier.trim()}>
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="stack">
              {devCode && (
                <div className="panel" style={{ background: 'var(--primary-tint)', border: 'none', padding: 12 }}>
                  <b>Dev mode:</b> your code is <span className="mono">{devCode}</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="code">Verification code</label>
                <input
                  id="code"
                  className="input mono"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                />
              </div>
              <button className="btn btn--primary btn--block" disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
              <button
                type="button"
                className="btn btn--subtle btn--block"
                onClick={() => {
                  setStep('id');
                  setCode('');
                  setDevCode(null);
                }}
              >
                Use a different account
              </button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
