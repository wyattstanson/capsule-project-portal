import type { PoolClient } from 'pg';
import { query, type Queryable } from '../../db/pool.js';

export interface AuditEntry {
  actorId?: string | null;
  actorKind?: 'student' | 'staff' | 'system';
  action: string;
  targetType: string;
  targetId?: string | null;
  detail?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry, client?: PoolClient): Promise<void> {
  const runner: Queryable = client ?? { query };
  await runner.query(
    `INSERT INTO audit_log (actor_id, actor_kind, action, target_type, target_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      entry.actorId ?? null,
      entry.actorKind ?? 'system',
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      JSON.stringify(entry.detail ?? {}),
    ],
  );
}
