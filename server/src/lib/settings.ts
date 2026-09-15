import type { PoolClient } from 'pg';
import { query, type Queryable } from '../db/pool.js';
import { redis } from '../redis/client.js';

// Everything that "changes every semester" lives here as data, never as a
// constant. Defaults are seeded once; admin edits override them at runtime.
export interface Settings {
  team_size_min: number;
  team_size_max: number;
  // 'individual' = students choose their own teams; 'assigned' = admin assigns.
  formation_mode: 'individual' | 'assigned';
  project_id_prefix: string;
  project_id_pad: number;
}

export const DEFAULT_SETTINGS: Settings = {
  team_size_min: 1,
  team_size_max: 3, // was 5 last semester — hence configurable, not hardcoded
  formation_mode: 'individual',
  project_id_prefix: 'DL',
  project_id_pad: 4,
};

const CACHE_KEY = 'settings:all';
const CACHE_TTL = 60; // seconds

export async function getSettings(): Promise<Settings> {
  const cached = await redis.get(CACHE_KEY).catch(() => null);
  if (cached) return JSON.parse(cached) as Settings;

  const { rows } = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
  const merged: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) {
      (merged as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  await redis.set(CACHE_KEY, JSON.stringify(merged), 'EX', CACHE_TTL).catch(() => {});
  return merged;
}

export async function setSetting<K extends keyof Settings>(
  key: K,
  value: Settings[K],
  client?: PoolClient,
): Promise<void> {
  const runner: Queryable = client ?? { query };
  await runner.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
  await redis.del(CACHE_KEY).catch(() => {});
}

export async function invalidateSettingsCache(): Promise<void> {
  await redis.del(CACHE_KEY).catch(() => {});
}
