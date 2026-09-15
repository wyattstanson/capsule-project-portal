import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Deadline } from '../../api/types';
import { useToast } from '../../state/toast';
import { LoadingScreen, useApi } from '../../components/ui';

interface Settings {
  team_size_min: number;
  team_size_max: number;
  formation_mode: 'individual' | 'assigned';
  project_id_prefix: string;
  project_id_pad: number;
}

// datetime-local wants "YYYY-MM-DDTHH:mm"
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function AdminSettings() {
  const toast = useToast();
  const settingsQ = useApi(() => api<{ settings: Settings }>('/admin/settings'), []);
  const deadlinesQ = useApi(() => api<{ deadlines: Deadline[] }>('/admin/deadlines'), []);

  const [form, setForm] = useState<Settings | null>(null);
  const [dl, setDl] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settingsQ.data) setForm(settingsQ.data.settings); }, [settingsQ.data]);
  useEffect(() => {
    if (deadlinesQ.data) {
      setDl(Object.fromEntries(deadlinesQ.data.deadlines.map((d) => [d.key, toLocalInput(d.deadline_at)])));
    }
  }, [deadlinesQ.data]);

  if (settingsQ.loading || deadlinesQ.loading || !form) return <LoadingScreen />;

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api('/admin/settings', { method: 'PUT', body: form });
      toast('Rules saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveDeadline = async (d: Deadline) => {
    setBusy(true);
    try {
      await api('/admin/deadlines', {
        method: 'PUT',
        body: { key: d.key, label: d.label, deadlineAt: new Date(dl[d.key]).toISOString() },
      });
      toast(`${d.label} updated`, 'success');
      deadlinesQ.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Deadlines & rules</h1>
        <p>These drive the whole flow and change every semester — stored as data, never hardcoded.</p>
      </div>

      <div className="panel">
        <div className="panel__title">Milestone deadlines</div>
        <div className="stack" style={{ marginTop: 8 }}>
          {deadlinesQ.data?.deadlines.map((d) => (
            <div key={d.key} className="row" style={{ justifyContent: 'space-between' }}>
              <div style={{ minWidth: 220 }}>
                <div className="list__name">{d.label}</div>
                <div className="list__meta mono">{d.key}</div>
              </div>
              <input
                type="datetime-local"
                className="input"
                style={{ maxWidth: 240 }}
                value={dl[d.key] ?? ''}
                onChange={(e) => setDl((s) => ({ ...s, [d.key]: e.target.value }))}
              />
              <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => saveDeadline(d)}>Save</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel__title">Team-formation rules</div>
        <div className="grid-2" style={{ marginTop: 8 }}>
          <div className="field">
            <label>Minimum team size</label>
            <input type="number" min={1} max={10} className="input" value={form.team_size_min}
              onChange={(e) => setForm({ ...form, team_size_min: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Maximum team size</label>
            <input type="number" min={1} max={10} className="input" value={form.team_size_max}
              onChange={(e) => setForm({ ...form, team_size_max: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Formation mode</label>
            <select className="select" value={form.formation_mode}
              onChange={(e) => setForm({ ...form, formation_mode: e.target.value as Settings['formation_mode'] })}>
              <option value="individual">Individual choice</option>
              <option value="assigned">Admin-assigned</option>
            </select>
          </div>
          <div className="field">
            <label>Project ID prefix</label>
            <input className="input mono" value={form.project_id_prefix}
              onChange={(e) => setForm({ ...form, project_id_prefix: e.target.value.toUpperCase() })} />
            <span className="field__hint">Next ID looks like {form.project_id_prefix}{'0'.repeat(Math.max(0, form.project_id_pad - 1))}1</span>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn--primary" disabled={busy} onClick={saveSettings}>Save rules</button>
        </div>
      </div>
    </div>
  );
}
