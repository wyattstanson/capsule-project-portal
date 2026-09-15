import { api } from '../../api/client';
import type { Dashboard } from '../../api/types';
import { CountUp, Pill, Skeleton, Spark, useApi } from '../../components/ui';
import { IconRoster, IconTeams, IconTeam } from '../../components/icons';

export function AdminDashboard() {
  const q = useApi(() => api<Dashboard>('/admin/dashboard'), []);

  if (q.loading || !q.data) {
    return (
      <div className="stack">
        <div className="page-head"><Skeleton className="sk-line" style={{ width: 240, height: 28 }} /></div>
        <div className="grid-3">
          <Skeleton className="sk-tile" /><Skeleton className="sk-tile" /><Skeleton className="sk-tile" />
        </div>
      </div>
    );
  }
  const d = q.data;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Program dashboard</h1>
        <p>Live participation across the 7th-semester Capsule Project.</p>
      </div>

      <div className="grid-3">
        <div className="counter animate-in" style={{ animationDelay: '0.05s' }}>
          <div className="counter__head">
            <span className="counter__chip chip-blue"><IconRoster width={15} height={15} /></span>
            <span className="counter__label">Total students</span>
          </div>
          <div className="counter__value"><CountUp value={d.totalStudents} /></div>
          <div className="counter__sub">on the eligible roster</div>
          <Spark bars={[40, 55, 48, 70, 62, 85, 100]} />
        </div>
        <div className="counter animate-in" style={{ animationDelay: '0.11s' }}>
          <div className="counter__head">
            <span className="counter__chip chip-green"><IconTeams width={15} height={15} /></span>
            <span className="counter__label">Groups formed</span>
          </div>
          <div className="counter__value"><CountUp value={d.groupsFormed} /></div>
          <div className="counter__sub">confirmed · submitted · approved</div>
          <Spark bars={[30, 45, 60, 52, 75, 88, 100]} />
        </div>
        <div className="counter animate-in" style={{ animationDelay: '0.17s' }}>
          <div className="counter__head">
            <span className="counter__chip chip-amber"><IconTeam width={15} height={15} /></span>
            <span className="counter__label">Not yet participated</span>
          </div>
          <div className="counter__value"><CountUp value={d.notParticipated} /></div>
          <div className="counter__sub">no team membership yet</div>
          <Spark bars={[100, 82, 70, 60, 45, 38, 28]} />
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title">Students by status</div>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            {Object.entries(d.studentsByStatus).map(([status, n]) => (
              <div key={status} className="row" style={{ justifyContent: 'space-between' }}>
                <Pill status={status} />
                <b>{n.toLocaleString()}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel__title">Teams by route & status</div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead><tr><th>Route</th><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                {d.teamsByRoute.map((r, i) => (
                  <tr key={i}>
                    <td>{r.route === 'cdc' ? 'CDC' : 'In-house'}</td>
                    <td><Pill status={r.status} /></td>
                    <td>{r.count}</td>
                  </tr>
                ))}
                {d.teamsByRoute.length === 0 && <tr><td colSpan={3} className="list__meta">No teams yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
