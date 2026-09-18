import { pool } from './pool.js';
import { DEFAULT_SETTINGS } from '../lib/settings.js';
import { encrypt, hashEmail, hashPasswordSync, genHashkey } from '../lib/vault.js';

// How many students to generate (source spec ≈ 2,400). Override with SEED_STUDENTS.
const STUDENT_COUNT = Number(process.env.SEED_STUDENTS ?? 600);

// Sample schools/branches seen in the source spec — treated as seed data, not
// a hardcoded whitelist. Import a real CSV to replace/extend.
const SCHOOLS: { school: string; branches: string[] }[] = [
  { school: 'School of Computer Science & Engineering', branches: ['CCE', 'BCI'] },
  { school: 'School of Computer Science & Info Systems', branches: ['BAI', 'BDS'] },
  { school: 'School of Bio Sciences & Technology', branches: ['BCB'] },
];

const FIRST = ['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ananya','Diya','Aadhya','Isha','Kavya','Rohan','Neha','Priya','Karan','Meera','Rahul','Sneha','Tara'];
const LAST = ['Sharma','Verma','Iyer','Nair','Menon','Reddy','Gupta','Patel','Rao','Das','Bose','Khan','Singh','Mehta','Jain','Pillai','Kulkarni','Chatterjee'];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Settings ──────────────────────────────────────────────────────────
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)],
      );
    }

    // ── Deadlines (seed defaults from the source spec) ─────────────────────
    const deadlines = [
      { key: 'formation_close', label: 'Team formation window closes', at: '2026-08-27T23:59:00+05:30' },
      { key: 'final_confirm', label: 'Final team confirmation deadline', at: '2026-09-05T23:59:00+05:30' },
    ];
    for (const d of deadlines) {
      await client.query(
        `INSERT INTO deadlines (key, label, deadline_at) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO NOTHING`,
        [d.key, d.label, d.at],
      );
    }

    // ── Staff (coordinators / admin / proctor) — encrypted email + scrypt pw ─
    // Faculty (coordinators/proctor) initial password = firstname@cap26.
    // Admin logs in with username "admin" + admin@123.
    const staff = [
      { name: 'Dr. Meera Krishnan', email: 'meera.krishnan@univ.edu', role: 'project_coordinator', username: null, pw: 'meera@cap26' },
      { name: 'Dr. Rahul Iyer', email: 'rahul.iyer@univ.edu', role: 'cdc_coordinator', username: null, pw: 'rahul@cap26' },
      { name: 'Portal Admin', email: 'admin@univ.edu', role: 'admin', username: 'admin', pw: 'admin@123' },
      { name: 'Dr. Sara Nair', email: 'sara.nair@univ.edu', role: 'proctor', username: null, pw: 'sara@cap26' },
    ];
    for (const s of staff) {
      await client.query(
        `INSERT INTO staff (name, email_enc, email_hash, username, password_hash, role, cred_issued_enc)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email_hash) DO NOTHING`,
        // cred_issued_enc keeps the initial password (AES) so it can be exported
        // in the credentials CSV until the staff member changes it themselves.
        [s.name, encrypt(s.email), hashEmail(s.email), s.username, hashPasswordSync(s.pw), s.role, encrypt(s.pw)],
      );
    }

    // ── Roster ──────────────────────────────────────────────────────────────
    // Flatten (school, branch) pairs so we can spread students across them.
    const pairs = SCHOOLS.flatMap((s) => s.branches.map((b) => ({ school: s.school, branch: b })));
    // reg_no, name, school, branch, email_enc, email_hash, password_hash, login_key_enc
    type Row = [string, string, string, string, string, string, string, string];
    const rows: Row[] = [];
    let sampleKey = '';
    for (let i = 0; i < STUDENT_COUNT; i++) {
      const pair = pick(pairs, i);
      const name = `${pick(FIRST, i)} ${pick(LAST, Math.floor(i / FIRST.length) + i)}`;
      const regNo = `22${pair.branch}${String(1000 + i)}`;
      const email = `${regNo.toLowerCase()}@univ.edu`;
      const hashkey = genHashkey(); // 16-char initial login credential
      if (i === 0) sampleKey = `${regNo} / ${hashkey}`;
      rows.push([
        regNo, name, pair.school, pair.branch,
        encrypt(email), hashEmail(email), hashPasswordSync(hashkey), encrypt(hashkey),
      ]);
    }
    // Chunked multi-row insert to keep the parameter count sane.
    const CHUNK = 400;
    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((row) => {
        const b = params.length;
        params.push(...row);
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8})`;
      });
      await client.query(
        `INSERT INTO students (reg_no, name, school, branch, email_enc, email_hash, password_hash, login_key_enc)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (reg_no) DO NOTHING`,
        params,
      );
    }

    await client.query('COMMIT');
    console.log(
      `[seed] settings, ${deadlines.length} deadlines, ${staff.length} staff, ~${STUDENT_COUNT} students`,
    );
    console.log('[seed] Admin:    username "admin"  ·  password "admin@123"');
    console.log('[seed] Faculty:  meera.krishnan@univ.edu (meera@cap26) · rahul.iyer@univ.edu (rahul@cap26) · sara.nair@univ.edu (sara@cap26)');
    console.log('[seed] Student:  registration no + 16-char HASHKEY (one-time → set a password). Sample →  ' + sampleKey);
    console.log('[seed] Admin key tools: GET /api/admin/students/:reg/key  ·  POST /api/admin/students/:reg/reset-key');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
