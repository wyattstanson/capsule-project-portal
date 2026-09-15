import { useState } from 'react';
import { api } from '../api/client';
import type { IncomingRequest } from '../api/types';
import { useToast } from '../state/toast';
import { cx, EmptyState, Spinner, useApi } from './ui';
import { IconClose } from './icons';

export function RequestBlade({
  open,
  onClose,
  onChanged,
  revision,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  revision: number;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, reload } = useApi(
    () => api<{ incoming: IncomingRequest[] }>('/requests'),
    [revision, open],
  );

  const respond = async (id: string, action: 'accept' | 'reject') => {
    setBusy(id);
    try {
      await api('/requests/respond', { body: { requestId: id, action } });
      toast(action === 'accept' ? 'Joined the team' : 'Request declined', 'success');
      reload();
      onChanged();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const incoming = data?.incoming ?? [];

  return (
    <>
      <div className={cx('blade-scrim', open && 'open')} onClick={onClose} />
      <aside className={cx('blade', open && 'open')} aria-hidden={!open} aria-label="Incoming team requests">
        <div className="blade__head">
          <h3>Incoming requests</h3>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><IconClose width={18} height={18} /></button>
        </div>
        <div className="blade__body">
          {loading ? (
            <Spinner />
          ) : incoming.length === 0 ? (
            <EmptyState icon="✉" title="No pending requests">
              When a teammate invites you, it appears here in real time.
            </EmptyState>
          ) : (
            incoming.map((r) => (
              <div key={r.id} className={cx('request-card', r.recipient_teamed && 'conflict')}>
                <div className="list__name">{r.from_name}</div>
                <div className="list__meta mono">{r.from_reg_no}</div>
                {r.recipient_teamed && (
                  <div className="request-card__warn">
                    ⚠ You’re already in a team. Accepting isn’t possible — decline this to keep things clean.
                  </div>
                )}
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn--primary btn--sm"
                    disabled={busy === r.id || r.recipient_teamed}
                    onClick={() => respond(r.id, 'accept')}
                  >
                    Accept
                  </button>
                  <button
                    className="btn btn--secondary btn--sm"
                    disabled={busy === r.id}
                    onClick={() => respond(r.id, 'reject')}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
