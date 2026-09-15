import type { PoolClient } from 'pg';
import { query, type Queryable } from '../db/pool.js';
import { redis, CHANNELS } from '../redis/client.js';
import { enqueueNotification } from '../queue/index.js';

export interface NotifyInput {
  studentId: string;
  type: string;
  payload?: Record<string, unknown>;
}

/**
 * Persist a notification, push it to any live SSE subscribers via Redis
 * pub/sub (so it fans out across all API instances), and enqueue out-of-band
 * dispatch (email/SMS). Pass a transaction client when the notification must
 * be part of an atomic operation (e.g. team confirmation).
 */
export async function notifyStudent(input: NotifyInput, client?: PoolClient): Promise<void> {
  const runner: Queryable = client ?? { query };
  const payload = input.payload ?? {};
  const { rows } = await runner.query(
    `INSERT INTO notifications (student_id, type, payload)
     VALUES ($1, $2, $3::jsonb) RETURNING id, created_at`,
    [input.studentId, input.type, JSON.stringify(payload)],
  );

  const event = {
    id: rows[0].id,
    type: input.type,
    payload,
    createdAt: rows[0].created_at,
  };

  // Fire-and-forget side effects — never block the caller's transaction on
  // Redis/queue availability. If the tx later rolls back, a stray SSE ping is
  // harmless (the client re-fetches state on reconnect).
  redis.publish(CHANNELS.notify(input.studentId), JSON.stringify(event)).catch(() => {});
  enqueueNotification({ studentId: input.studentId, type: input.type, payload }).catch(() => {});
}
