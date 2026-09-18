import { query } from '../../db/pool.js';
import { decrypt } from '../../lib/vault.js';

// ── Live credentials export ────────────────────────────────────────────────
// Builds a CSV of every account's sign-in credential, generated fresh from the
// database so it always reflects the current state:
//   • students  → reg no + their one-time hashkey while unused; once they set
//     their own password (key_used) the hashkey is dead and the password is
//     scrypt-hashed (one-way), so it is reported as "self-set (not recoverable)".
//   • staff     → email/username + the initial password until they change it,
//     after which it is likewise "self-set (not recoverable)".
// An admin key-reset re-issues a fresh hashkey, which shows up here immediately.

export interface CredentialRow {
  role: string;
  loginId: string;
  name: string;
  email: string;
  credential: string;
  status: string;
}

const SELF_SET = 'self-set (not recoverable)';

export async function buildCredentialRows(): Promise<CredentialRow[]> {
  const rows: CredentialRow[] = [];

  const students = await query<{
    reg_no: string; name: string; email_enc: string | null;
    login_key_enc: string | null; key_used: boolean;
  }>(
    `SELECT reg_no, name, email_enc, login_key_enc, key_used
       FROM students ORDER BY reg_no`,
  );
  for (const s of students.rows) {
    rows.push({
      role: 'student',
      loginId: s.reg_no,
      name: s.name,
      email: decrypt(s.email_enc) ?? '',
      credential: s.key_used ? '' : (decrypt(s.login_key_enc) ?? ''),
      status: s.key_used ? SELF_SET : 'hashkey (one-time, unused)',
    });
  }

  const staff = await query<{
    name: string; email_enc: string | null; username: string | null;
    role: string; cred_issued_enc: string | null; pw_self_set: boolean;
  }>(
    `SELECT name, email_enc, username, role, cred_issued_enc, pw_self_set
       FROM staff ORDER BY role, name`,
  );
  for (const s of staff.rows) {
    const email = decrypt(s.email_enc) ?? '';
    rows.push({
      role: s.role === 'admin' ? 'admin' : 'faculty',
      loginId: s.username ?? email, // admin signs in with username, faculty with email
      name: s.name,
      email,
      credential: s.pw_self_set ? '' : (decrypt(s.cred_issued_enc) ?? ''),
      status: s.pw_self_set ? SELF_SET : 'issued',
    });
  }

  return rows;
}

function csvCell(v: string): string {
  // Always quote; escape embedded quotes. Guard against CSV-injection by
  // prefixing a leading =/+/-/@ (formula triggers in spreadsheet apps).
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function buildCredentialsCsv(): Promise<string> {
  const rows = await buildCredentialRows();
  const header = ['role', 'login_id', 'name', 'email', 'credential', 'status'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.role, r.loginId, r.name, r.email, r.credential, r.status].map(csvCell).join(','));
  }
  // CRLF line endings so Excel opens it cleanly.
  return lines.join('\r\n') + '\r\n';
}
