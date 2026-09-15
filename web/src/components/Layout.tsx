import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '../api/types';
import { useAuth } from '../state/auth';
import { useToast } from '../state/toast';
import { useNotifications } from '../state/notifications';
import { cx, initials } from './ui';
import { Brandmark } from './Brandmark';
import { RequestBlade } from './RequestBlade';
import {
  IconAudit, IconBell, IconBrowse, IconChevron, IconDashboard, IconMenu,
  IconReview, IconRoster, IconSettings, IconSignOut, IconSubmissions, IconTeam, IconTeams,
} from './icons';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<{ width?: number; height?: number }>;
  end?: boolean;
}

const NAV: Record<Role, { section: string; items: NavItem[] }[]> = {
  student: [
    {
      section: 'Workspace',
      items: [
        { to: '/', label: 'Dashboard', Icon: IconDashboard, end: true },
        { to: '/team', label: 'My Team', Icon: IconTeam },
        { to: '/browse', label: 'Browse Students', Icon: IconBrowse },
        { to: '/submissions', label: 'Submissions', Icon: IconSubmissions },
      ],
    },
  ],
  project_coordinator: [
    { section: 'Review', items: [{ to: '/review', label: 'In-house Queue', Icon: IconReview, end: true }] },
  ],
  cdc_coordinator: [
    { section: 'Review', items: [{ to: '/review', label: 'CDC Queue', Icon: IconReview, end: true }] },
  ],
  admin: [
    {
      section: 'Administration',
      items: [
        { to: '/admin', label: 'Dashboard', Icon: IconDashboard, end: true },
        { to: '/admin/teams', label: 'Teams & Requests', Icon: IconTeams },
        { to: '/admin/roster', label: 'Roster Import', Icon: IconRoster },
        { to: '/admin/settings', label: 'Deadlines & Rules', Icon: IconSettings },
        { to: '/admin/audit', label: 'Audit Log', Icon: IconAudit },
      ],
    },
  ],
  proctor: [
    {
      section: 'Oversight',
      items: [
        { to: '/admin', label: 'Dashboard', Icon: IconDashboard, end: true },
        { to: '/admin/teams', label: 'Teams', Icon: IconTeams },
      ],
    },
  ],
};

const CRUMBS: Record<string, string> = {
  '/': 'Dashboard',
  '/team': 'My Team',
  '/browse': 'Browse Students',
  '/submissions': 'Submissions',
  '/review': 'Review Queue',
  '/admin': 'Dashboard',
  '/admin/teams': 'Teams & Requests',
  '/admin/roster': 'Roster Import',
  '/admin/settings': 'Deadlines & Rules',
  '/admin/audit': 'Audit Log',
};

export function Layout() {
  const { principal, logout, changePassword } = useAuth();
  const toast = useToast();
  const notif = useNotifications();

  const onChangePassword = async () => {
    const cur = window.prompt('Current hashkey or password:');
    if (cur == null) return;
    const next = window.prompt('New password (at least 6 characters):');
    if (next == null) return;
    try {
      await changePassword(cur, next);
      toast('Password changed', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const location = useLocation();
  const navigate = useNavigate();
  const [bladeOpen, setBladeOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [bump, setBump] = useState(0);

  const sections = useMemo(() => (principal ? NAV[principal.role] : []), [principal]);
  const isStudent = principal?.kind === 'student';
  const crumb = CRUMBS[location.pathname] ?? 'Overview';
  const roleLabel = principal?.role.replace(/_/g, ' ');
  const homeHref = !principal
    ? '/'
    : principal.role === 'student'
      ? '/'
      : principal.role.includes('coordinator')
        ? '/review'
        : '/admin';

  // Per-route document title (tell #5: real page titles).
  useEffect(() => {
    document.title = `${crumb} · Capsule Portal`;
  }, [crumb]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [location.pathname]);

  return (
    <div className="shell">
      <div className={cx('rail-scrim', navOpen && 'open')} onClick={() => setNavOpen(false)} />
      <nav className={cx('rail', navOpen && 'open')} aria-label="Primary">
        {/* Clickable logo (tell #17) */}
        <a
          className="rail__brand"
          href={homeHref}
          onClick={(e) => { e.preventDefault(); navigate(homeHref); }}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <Brandmark size={32} />
          <span>Capsule Portal</span>
        </a>
        <div className="rail__nav">
          {sections.map((s) => (
            <div key={s.section}>
              <div className="rail__section">{s.section}</div>
              {s.items.map(({ to, label, Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('rail__link', isActive && 'active')}>
                  <span className="rail__icon"><Icon width={18} height={18} /></span>
                  <span className="rail__label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </div>
        <div className="rail__spacer" />
        <div className="rail__foot">7th-Sem Capsule Project · {new Date().getFullYear()}</div>
      </nav>

      <div className="main">
        <header className="topbar">
          <button className="iconbtn menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <IconMenu width={20} height={20} />
          </button>
          <div className="topbar__title">{crumb}</div>
          <div className="topbar__grow" />
          {isStudent && (
            <button
              className="iconbtn"
              onClick={() => { setBladeOpen(true); void notif.markAllRead(); }}
              aria-label="Incoming requests"
              title="Incoming requests"
            >
              <IconBell width={19} height={19} />
              {notif.unread > 0 && <span className="badge-dot" />}
            </button>
          )}
          <div className="who">
            <div className="who__avatar">{initials(principal?.name ?? '?')}</div>
            <div className="who__meta">
              <div className="who__name">{principal?.name}</div>
              <div className="who__role">{roleLabel}</div>
            </div>
            <button className="btn btn--subtle btn--sm" onClick={onChangePassword} title="Change password">
              Change password
            </button>
            <button className="btn btn--subtle btn--sm" onClick={logout} title="Sign out">
              <IconSignOut width={16} height={16} /> Sign out
            </button>
          </div>
        </header>

        <div className="breadcrumb">
          <span>Capsule Portal</span>
          <IconChevron width={14} height={14} className="sep" />
          <b>{crumb}</b>
        </div>

        <main className="content">
          <div className="content__inner">
            <Outlet context={{ revision: notif.revision + bump }} />
          </div>
        </main>
      </div>

      {isStudent && (
        <RequestBlade
          open={bladeOpen}
          onClose={() => setBladeOpen(false)}
          onChanged={() => setBump((b) => b + 1)}
          revision={notif.revision + bump}
        />
      )}
    </div>
  );
}
