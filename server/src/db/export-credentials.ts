import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { initVault } from '../lib/vault.js';
import { buildCredentialsCsv } from '../modules/admin/credentials.js';

// Dump the live credentials CSV to a file (includes a "Generated at" timestamp).
//   npm run export:creds            → <repo>/credentials.csv (tracked in git)
//   npm run export:creds -- out.csv → ./out.csv (relative to cwd)
const here = dirname(fileURLToPath(import.meta.url)); // server/(src|dist)/db
const REPO_ROOT = resolve(here, '..', '..', '..'); // → repo root

async function main() {
  await initVault();
  const arg = process.argv[2];
  const out = arg ? resolve(process.cwd(), arg) : resolve(REPO_ROOT, 'credentials.csv');
  const csv = await buildCredentialsCsv();
  await writeFile(out, csv, 'utf8');
  const rows = csv.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).length - 1; // minus header
  console.log(`[export] wrote ${rows} credential row(s) → ${out}`);
}

main()
  .catch((err) => {
    console.error('[export] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
