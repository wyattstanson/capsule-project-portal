import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config, pgSsl } from '../config.js';

// Migrations run against the DIRECT connection (bypassing pgbouncer) because
// DDL and advisory locks require a stable session, which transaction-pooling
// does not guarantee.
const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function main() {
  const client = new Client({
    connectionString: config.databaseDirectUrl,
    ssl: pgSsl(config.databaseDirectUrl),
  });
  await client.connect();
  try {
    // Serialise concurrent migrators with a session advisory lock.
    await client.query('SELECT pg_advisory_lock(918273645)');

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const applied = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (r) => r.filename,
      ),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    console.log(ran === 0 ? '[migrate] up to date' : `[migrate] applied ${ran} migration(s)`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(918273645)').catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
