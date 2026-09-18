import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool } from './pool.js';
import { buildCredentialsCsv } from '../modules/admin/credentials.js';

// Dump the live credentials CSV to a file.
//   npm run export:creds            → ./credentials.csv
//   npm run export:creds -- out.csv → ./out.csv
async function main() {
  const out = resolve(process.cwd(), process.argv[2] ?? 'credentials.csv');
  const csv = await buildCredentialsCsv();
  await writeFile(out, csv, 'utf8');
  const rows = csv.trim().split(/\r?\n/).length - 1; // minus header
  console.log(`[export] wrote ${rows} credential row(s) → ${out}`);
}

main()
  .catch((err) => {
    console.error('[export] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
