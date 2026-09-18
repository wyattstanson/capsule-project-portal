import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { StudentRow } from '../api/types';
import { useRevision } from '../state/outlet';
import { useToast } from '../state/toast';
import { EmptyState, Spinner, initials, useApi } from '../components/ui';

interface BrowseResult {
  students: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function BrowseStudents() {
  const toast = useToast();
  const revision = useRevision();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [school, setSchool] = useState('');
  const [branch, setBranch] = useState('');
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, school, branch]);

  const facets = useApi(() => api<{ schools: string[]; branches: string[] }>('/students/facets'), []);
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (debounced) query.set('search', debounced);
  if (school) query.set('school', school);
  if (branch) query.set('branch', branch);

  const list = useApi(
    () => api<BrowseResult>(`/students?${query.toString()}`),
    [debounced, school, branch, page, revision],
  );

  const invite = async (s: StudentRow) => {
    setInviting(s.id);
    try {
      await api('/requests/send', { body: { toStudentId: s.id } });
      toast(`Invite sent to ${s.name}`, 'success');
      list.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setInviting(null);
    }
  };

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Browse students</h1>
        <p>Any un-teamed student, across any school or branch, can be invited.</p>
      </div>

      <div className="list">
        <div className="list__toolbar">
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Search name or registration no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="select" style={{ maxWidth: 220 }} value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">All schools</option>
            {facets.data?.schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 140 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {facets.data?.branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          {list.data && <span className="list__meta">{list.data.total} eligible</span>}
        </div>

        {list.loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>
        ) : list.error ? (
          <EmptyState title="Couldn’t load students">{list.error}</EmptyState>
        ) : list.data && list.data.students.length === 0 ? (
          <EmptyState title="No matches">Try clearing filters or a different search.</EmptyState>
        ) : (
          list.data?.students.map((s) => (
            <div key={s.id} className="list__row">
              <div className="list__avatar">{initials(s.name)}</div>
              <div className="list__main">
                <div className="list__name">{s.name}</div>
                <div className="list__meta">
                  <span className="mono">{s.reg_no}</span> · {s.branch} · {s.school}
                </div>
              </div>
              <button
                className="btn btn--secondary btn--sm"
                disabled={inviting === s.id}
                onClick={() => invite(s)}
              >
                {inviting === s.id ? 'Inviting…' : 'Invite'}
              </button>
            </div>
          ))
        )}
      </div>

      {list.data && totalPages > 1 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn--secondary btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="list__meta">Page {page} of {totalPages}</span>
          <button className="btn btn--secondary btn--sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
