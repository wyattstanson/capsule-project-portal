import { useState, type ComponentType } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { ThemeToggle } from '../components/ui';
import {
  IconTeam, IconReview, IconSettings, IconCheck, IconBell, IconAudit,
  IconBrowse, IconRoster, IconStar,
} from '../components/icons';

type Role = 'student' | 'faculty' | 'admin';
type IconC = ComponentType<{ width?: number; height?: number }>;

const COPY: Record<Role, {
  eyebrow: string; title: string; sub: string;
  points: [IconC, string][];
  idLabel: string; idPlace: string; idMono: boolean;
  pwLabel: string; pwPlace: string; demo: string;
}> = {
  student: {
    eyebrow: 'Student access',
    title: 'Sign in to your capstone.',
    sub: 'Use your registration number and the hashkey your proctor issued. It works once, then you set a password straight after.',
    points: [[IconTeam, 'Build a team of up to three, or go solo'], [IconBell, 'Real-time invites with no double-booking'], [IconCheck, 'Your email stays private (encrypted, masked)']],
    idLabel: 'Registration number', idPlace: '22BAI1002', idMono: true,
    pwLabel: 'Hashkey or password', pwPlace: '16-char hashkey, or your password',
    demo: 'Reg no + hashkey (one-time). Ask your coordinator, or use the seeded sample.',
  },
  faculty: {
    eyebrow: 'Faculty access',
    title: 'Review and guide teams.',
    sub: 'Coordinators and proctors sign in with their university email. Your starting password is your first name @cap26, which you can change after first login.',
    points: [[IconReview, 'Track the teams you guide'], [IconCheck, 'Approve review submissions'], [IconStar, 'CDC coordinators clear placement leave']],
    idLabel: 'University email', idPlace: 'meera.krishnan@univ.edu', idMono: false,
    pwLabel: 'Password', pwPlace: 'firstname@cap26',
    demo: 'meera.krishnan@univ.edu · meera@cap26',
  },
  admin: {
    eyebrow: 'Administration',
    title: 'Run the portal.',
    sub: 'The portal administrator manages the roster, deadlines, settings and the full audit log. Sign in with the admin username.',
    points: [[IconRoster, 'Import roster and issue hashkeys'], [IconSettings, 'Deadlines, team-size and project-ID rules'], [IconAudit, 'Full audit trail']],
    idLabel: 'Username', idPlace: 'admin', idMono: true,
    pwLabel: 'Password', pwPlace: 'admin@123',
    demo: 'admin · admin@123',
  },
};

const ROLES: { role: Role; blue?: boolean; Icon: IconC; title: string; desc: string }[] = [
  { role: 'student', blue: true, Icon: IconTeam, title: 'Student', desc: 'Reg no + one-time hashkey' },
  { role: 'faculty', Icon: IconReview, title: 'Faculty', desc: 'Coordinator / proctor login' },
  { role: 'admin', Icon: IconBrowse, title: 'Admin', desc: 'Portal administration' },
];

function Brand() {
  return (
    <span className="mono" style={{ display: 'inline-block', background: 'var(--logo-bg)', color: 'var(--logo-ink)', padding: '11px 16px', borderRadius: 9, fontWeight: 700 }}>
      CAPSTONE<span style={{ color: 'var(--accent)' }}>/7</span>
    </span>
  );
}

export function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  // Role comes from the URL (/ = chooser, /login/:role = form) so the browser
  // Back button moves between them naturally.
  const { role: roleParam } = useParams<{ role: string }>();
  const role: Role | null =
    roleParam === 'student' || roleParam === 'faculty' || roleParam === 'admin' ? roleParam : null;
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(identifier.trim(), password); // App.tsx routes to SetPassword when required
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Landing: hero + role chooser
  if (!role) {
    return (
      <div className="login-wrap">
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 40 }}><ThemeToggle /></div>
        <section className="login-hero">
          <Brand />
          <div className="eyebrow" style={{ marginTop: 26 }}>7th Semester · Capstone and CDC placement</div>
          <h1>Ship your <span className="b">capstone.</span></h1>
          <p>Form your team, take the CDC placement route, or go solo. Submit for coordinator approval and get an auto-generated project ID. One portal, three roles.</p>
          <div className="login-hero__points" style={{ flexDirection: 'row', gap: 26 }}>
            {[['Teams', '1 to 3'], ['Removal window', '7 days'], ['Project ID', 'DL####']].map(([k, v]) => (
              <div key={k} className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>
                {k}<b style={{ display: 'block', fontFamily: 'var(--font)', fontSize: 26, letterSpacing: '-1px', color: 'var(--text)', marginTop: 6 }}>{v}</b>
              </div>
            ))}
          </div>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <div className="rolelist">
              <div className="lead">Choose how you sign in</div>
              {ROLES.map(({ role: r, blue, Icon, title, desc }) => (
                <button key={r} className={`role${blue ? ' blue' : ''}`} onClick={() => navigate(`/login/${r}`)}>
                  <span className="rico"><Icon width={22} height={22} /></span>
                  <span>
                    <span className="rt" style={{ display: 'block' }}>{title}</span>
                    <span className="rd">{desc}</span>
                  </span>
                  <span className="rar">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  // Per-role login
  const c = COPY[role];
  return (
    <div className="login-wrap">
      <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 40 }}><ThemeToggle /></div>
      <section className="login-hero">
        <Brand />
        <div className="eyebrow" style={{ marginTop: 26 }}>{c.eyebrow}</div>
        <h1 style={{ fontSize: 46 }}>{c.title}</h1>
        <p>{c.sub}</p>
        <div className="login-hero__points">
          {c.points.map(([Icon, text]) => (
            <div className="login-hero__point" key={text}>
              <span className="i"><Icon width={17} height={17} /></span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card panel panel--raised">
          <button className="back" onClick={() => navigate('/')}>&larr; All roles</button>
          <h2>{role === 'student' ? 'Student sign in' : role === 'faculty' ? 'Faculty sign in' : 'Admin sign in'}</h2>
          <p className="panel__hint">{c.eyebrow} · Capstone / CDC portal</p>
          <form onSubmit={submit} className="stack">
            <div className="field">
              <label htmlFor="identifier">{c.idLabel}</label>
              <input
                id="identifier"
                className={`input${c.idMono ? ' mono' : ''}`}
                autoFocus
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={c.idPlace}
                style={{ textTransform: 'none' }}
              />
            </div>
            <div className="field">
              <label htmlFor="password">{c.pwLabel}</label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={c.pwPlace}
              />
            </div>
            <button className="btn btn--primary btn--block" disabled={busy || !identifier.trim() || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="demo">
            <div className="dl">Try it</div>
            <code>{c.demo}</code>
          </div>
        </div>
      </section>
    </div>
  );
}
