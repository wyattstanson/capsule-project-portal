import { pool } from './pool.js';
import { DEFAULT_SETTINGS } from '../lib/settings.js';
import { encrypt, hashEmail, hashPasswordSync } from '../lib/vault.js';

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
    const staff = [
      { name: 'Dr. Project Coordinator', email: 'project.coord@univ.edu', role: 'project_coordinator', username: null, pw: 'capsule@123' },
      { name: 'Dr. CDC Coordinator', email: 'cdc.coord@univ.edu', role: 'cdc_coordinator', username: null, pw: 'capsule@123' },
      { name: 'Portal Admin', email: 'admin@univ.edu', role: 'admin', username: 'admin', pw: 'admin@123' },
      { name: 'Proctor One', email: 'proctor@univ.edu', role: 'proctor', username: null, pw: 'capsule@123' },
    ];
    for (const s of staff) {
      await client.query(
        `INSERT INTO staff (name, email_enc, email_hash, username, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email_hash) DO NOTHING`,
        [s.name, encrypt(s.email), hashEmail(s.email), s.username, hashPasswordSync(s.pw), s.role],
      );
    }

    // ── Roster ──────────────────────────────────────────────────────────────
    // Flatten (school, branch) pairs so we can spread students across them.
    const pairs = SCHOOLS.flatMap((s) => s.branches.map((b) => ({ school: s.school, branch: b })));
    // reg_no, name, school, branch, email_enc, email_hash, password_hash
    type Row = [string, string, string, string, string, string, string];
    const rows: Row[] = [];
    for (let i = 0; i < STUDENT_COUNT; i++) {
      const pair = pick(pairs, i);
      const name = `${pick(FIRST, i)} ${pick(LAST, Math.floor(i / FIRST.length) + i)}`;
      const regNo = `22${pair.branch}${String(1000 + i)}`;
      const email = `${regNo.toLowerCase()}@univ.edu`;
      const initialPw = name.toLowerCase().replace(/[^a-z0-9]/g, ''); // initial password = name
      rows.push([regNo, name, pair.school, pair.branch, encrypt(email), hashEmail(email), hashPasswordSync(initialPw)]);
    }
    // Chunked multi-row insert to keep the parameter count sane.
    const CHUNK = 400;
    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((row) => {
        const b = params.length;
        params.push(...row);
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7})`;
      });
      await client.query(
        `INSERT INTO students (reg_no, name, school, branch, email_enc, email_hash, password_hash)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (reg_no) DO NOTHING`,
        params,
      );
    }

    await client.query('COMMIT');
    console.log(
      `[seed] settings, ${deadlines.length} deadlines, ${staff.length} staff, ~${STUDENT_COUNT} students`,
    );
    console.log('[seed] Admin login:   username "admin"  ·  password "admin@123"');
    console.log('[seed] Coordinators:  project.coord@univ.edu / cdc.coord@univ.edu  ·  password "capsule@123"');
    console.log('[seed] Student login: registration no (e.g. 22CCE1000)  ·  password = full name lowercased, no spaces (e.g. "aaravsharma")');
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
