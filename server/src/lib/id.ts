import type { PoolClient } from 'pg';
import { getSettings } from './settings.js';

/**
 * Generate the next unique project id, e.g. "DL0496".
 * Uses a Postgres SEQUENCE (nextval is atomic and concurrency-safe) combined
 * with the admin-configurable prefix + padding. Must run inside the approval
 * transaction so an id is only ever consumed on a real approval.
 */
export async function nextProjectId(client: PoolClient): Promise<string> {
  const { project_id_prefix, project_id_pad } = await getSettings();
  const { rows } = await client.query<{ seq: string }>("SELECT nextval('project_id_seq') AS seq");
  const seq = rows[0].seq;
  return `${project_id_prefix}${seq.padStart(project_id_pad, '0')}`;
}
