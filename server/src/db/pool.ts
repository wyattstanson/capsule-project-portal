import pg from 'pg';
import { config, pgSsl } from '../config.js';

const { Pool } = pg;

// Application pool → pgbouncer (transaction pooling). Because pgbouncer is in
// transaction mode, we must NOT use session-level features (prepared
// statements across calls, LISTEN/NOTIFY, advisory session locks) on this
// pool. Row-level locking inside a single transaction is fine and is what the
// team-confirmation flow relies on.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: pgSsl(config.databaseUrl),
  max: config.pgPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // pgbouncer in transaction mode does not support server-side prepared
  // statement caching keyed to a session, so keep statements simple.
});

pool.on('error', (err) => {
  // A pooled client hit an error while idle — log, don't crash the process.
  console.error('[pg] idle client error', err);
});

export type QueryParams = ReadonlyArray<unknown>;

// A minimal "thing that can run a query" — satisfied by both the module-level
// `query` helper and a pg PoolClient. Helpers accept this so they work inside
// or outside a transaction.
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<pg.QueryResult>;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: QueryParams,
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/**
 * Run `fn` inside a single BEGIN/COMMIT transaction on one dedicated client.
 * Rolls back on any throw. This is the primitive the team-lock uses so that
 * "confirm team + auto-cancel other requests" is atomic.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection may already be broken; ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
