import { useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../state/toast';

export function AdminRoster() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; parsed: number } | null>(null);

  const importCsv = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ inserted: number; updated: number; parsed: number }>('/admin/roster/import', { formData: fd });
      setResult(r);
      toast(`Imported ${r.inserted} new, updated ${r.updated}`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Roster import</h1>
        <p>Upload the eligible-student CSV. Existing rows (matched on registration no.) are updated.</p>
      </div>

      <div className="panel">
        <div className="panel__title">CSV format</div>
        <p className="panel__hint">Header row required. Columns: <span className="mono">reg_no, name, school, branch, email</span></p>
        <pre className="mono" style={{ background: 'var(--surface-sunken)', padding: 12, borderRadius: 6, overflowX: 'auto' }}>
{`reg_no,name,school,branch,email
22CCE1000,Aarav Sharma,School of Computer Science & Engineering,CCE,22cce1000@univ.edu`}
        </pre>
        <div className="row" style={{ marginTop: 16 }}>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn btn--primary" disabled={!file || busy} onClick={importCsv}>
            {busy ? 'Importing…' : 'Import roster'}
          </button>
        </div>
        {result && (
          <div className="panel" style={{ marginTop: 16, background: 'var(--success-tint)', border: 'none' }}>
            Parsed {result.parsed} rows · <b>{result.inserted}</b> inserted · <b>{result.updated}</b> updated.
          </div>
        )}
      </div>
    </div>
  );
}
