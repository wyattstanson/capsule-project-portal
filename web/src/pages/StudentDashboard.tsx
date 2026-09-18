import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Deadline, Team } from '../api/types';
import type { ComponentType } from 'react';
import { useAuth } from '../state/auth';
import { useRevision } from '../state/outlet';
import { EmptyState, Pill, Skeleton, SkeletonLines, useApi } from '../components/ui';
import { IconTeam, IconSettings, IconCheck, IconClock, IconStar, IconRefresh } from '../components/icons';

const BANNER: Record<string, { variant: string; Icon: ComponentType<{ width?: number; height?: number }>; eyebrow: string }> = {
  none: { variant: 'neutral', Icon: IconTeam, eyebrow: 'Get started' },
  forming: { variant: '', Icon: IconSettings, eyebrow: 'Team in progress' },
  confirmed: { variant: 'pending', Icon: IconCheck, eyebrow: 'Team confirmed' },
  submitted: { variant: 'pending', Icon: IconClock, eyebrow: 'Under review' },
  approved: { variant: 'approved', Icon: IconStar, eyebrow: 'Approved' },
  rejected: { variant: 'rejected', Icon: IconRefresh, eyebrow: 'Needs changes' },
};

function bannerCopy(team: Team | null): { title: string; sub: string } {
  if (!team) return { title: 'You haven’t started a team yet', sub: 'Browse peers to invite, or confirm solo.' };
  switch (team.status) {
    case 'forming':
      return { title: `Forming "${team.title ?? 'Untitled team'}"`, sub: `${team.members.length} member(s). Invite more or confirm your team.` };
    case 'confirmed':
      return { title: 'Your team is confirmed', sub: team.route === 'cdc' ? 'Submit your CDC placement proof next.' : 'Propose a title and submit for approval.' };
    case 'submitted':
      return { title: 'Submitted for review', sub: 'A coordinator will approve or return it with a remark.' };
    case 'approved':
      return { title: `Approved · ${team.projectId}`, sub: 'Your project ID has been issued.' };
    case 'rejected':
      return { title: 'Returned for changes', sub: 'Check the coordinator’s remark and resubmit.' };
    default:
      return { title: team.status, sub: '' };
  }
}

export function StudentDashboard() {
  const { principal } = useAuth();
  const revision = useRevision();
  const teamQ = useApi(() => api<{ team: Team | null }>('/team/me'), [revision]);
  const deadlineQ = useApi(() => api<{ deadlines: Deadline[] }>('/deadlines'), []);

  if (teamQ.loading) {
    return (
      <div className="stack">
        <div className="page-head">
          <Skeleton className="sk-line" style={{ width: 220, height: 28 }} />
        </div>
        <Skeleton className="sk-banner" />
        <div className="grid-2">
          <div className="panel"><SkeletonLines count={4} /></div>
          <div className="panel"><SkeletonLines count={3} /></div>
        </div>
      </div>
    );
  }

  const team = teamQ.data?.team ?? null;
  const key = team?.status ?? 'none';
  const meta = BANNER[key] ?? BANNER.none;
  const copy = bannerCopy(team);

  return (
    <div className="stack">
      <div className="page-head animate-in" style={{ animationDelay: '0.02s' }}>
        <h1>Welcome, {principal?.name?.split(' ')[0]}</h1>
        <p>Here’s where your Capstone project stands.</p>
      </div>

      {/* Wide status banner — the distinct hero treatment */}
      <div
        className={`status-banner animate-in ${meta.variant ? `status-banner--${meta.variant}` : ''}`}
        style={{ animationDelay: '0.08s' }}
      >
        <div className="status-banner__icon" aria-hidden><meta.Icon width={24} height={24} /></div>
        <div className="status-banner__body">
          <div className="status-banner__eyebrow">{meta.eyebrow}</div>
          <div className="status-banner__title">{copy.title}</div>
          <div className="status-banner__sub">{copy.sub}</div>
        </div>
        <div className="row">
          {!team && (
            <>
              <Link className="btn btn--secondary" to="/browse">Browse students</Link>
              <Link className="btn btn--secondary" to="/team">Confirm solo</Link>
            </>
          )}
          {team?.status === 'forming' && <Link className="btn btn--secondary" to="/team">Manage team</Link>}
          {(team?.status === 'confirmed' || team?.status === 'rejected') && (
            <Link className="btn btn--secondary" to="/submissions">
              {team.route === 'cdc' ? 'CDC submission' : 'Submit project'}
            </Link>
          )}
          {team?.status === 'submitted' && <Link className="btn btn--secondary" to="/submissions">View submission</Link>}
          {team?.status === 'approved' && <Link className="btn btn--secondary" to="/submissions">View details</Link>}
        </div>
      </div>

      <div className="grid-2 animate-in" style={{ animationDelay: '0.14s' }}>
        <div className="panel panel--hover">
          <div className="panel__title">Your team</div>
          {team ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row">
                <Pill status={team.status} />
                {team.isSolo && <Pill status="neutral">Solo</Pill>}
                <Pill status="neutral">{team.route === 'cdc' ? 'CDC route' : 'In-house'}</Pill>
              </div>
              {team.members.map((m) => (
                <div key={m.studentId} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{m.name}{m.isLeader ? ' · Leader' : ''}</span>
                  <span className="mono list__meta">{m.regNo}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="⬡" title="No team yet">Invite peers or confirm solo to begin.</EmptyState>
          )}
        </div>

        <div className="panel panel--hover">
          <div className="panel__title">Key deadlines</div>
          {deadlineQ.data?.deadlines?.length ? (
            <div className="stack" style={{ gap: 10, marginTop: 8 }}>
              {deadlineQ.data.deadlines.map((d) => (
                <div key={d.key} className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{d.label}</span>
                  <b>{new Date(d.deadline_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="panel__hint">Deadlines will appear once the admin sets them.</p>
          )}
        </div>
      </div>
    </div>
  );
}
