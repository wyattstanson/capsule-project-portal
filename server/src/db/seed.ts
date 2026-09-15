import { pool } from './pool.js';
import { DEFAULT_SETTINGS } from '../lib/settings.js';

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

    // ── Staff (coordinators / admin / proctor) ─────────────────────────────
    const staff = [
      { name: 'Dr. Project Coordinator', email: 'project.coord@univ.edu', role: 'project_coordinator' },
      { name: 'Dr. CDC Coordinator', email: 'cdc.coord@univ.edu', role: 'cdc_coordinator' },
      { name: 'Portal Admin', email: 'admin@univ.edu', role: 'admin' },
      { name: 'Proctor One', email: 'proctor@univ.edu', role: 'proctor' },
    ];
    for (const s of staff) {
      await client.query(
        `INSERT INTO staff (name, email, role) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [s.name, s.email, s.role],
      );
    }

    // ── Roster ──────────────────────────────────────────────────────────────
    // Flatten (school, branch) pairs so we can spread students across them.
    const pairs = SCHOOLS.flatMap((s) => s.branches.map((b) => ({ school: s.school, branch: b })));
    type Row = [string, string, string, string, string]; // reg_no,name,school,branch,email
    const rows: Row[] = [];
    for (let i = 0; i < STUDENT_COUNT; i++) {
      const pair = pick(pairs, i);
      const name = `${pick(FIRST, i)} ${pick(LAST, Math.floor(i / FIRST.length) + i)}`;
      const regNo = `22${pair.branch}${String(1000 + i)}`;
      rows.push([regNo, name, pair.school, pair.branch, `${regNo.toLowerCase()}@univ.edu`]);
    }
    // Chunked multi-row insert to keep the parameter count sane.
    const CHUNK = 500;
    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((row) => {
        const base = params.length;
        params.push(...row);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });
      await client.query(
        `INSERT INTO students (reg_no, name, school, branch, email)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (reg_no) DO NOTHING`,
        params,
      );
    }

    await client.query('COMMIT');
    console.log(
      `[seed] settings, ${deadlines.length} deadlines, ${staff.length} staff, ~${STUDENT_COUNT} students`,
    );
    console.log('[seed] staff logins (OTP): admin@univ.edu, project.coord@univ.edu, cdc.coord@univ.edu, proctor@univ.edu');
    console.log('[seed] sample student login: reg_no 22CCE1000 or its email');
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
