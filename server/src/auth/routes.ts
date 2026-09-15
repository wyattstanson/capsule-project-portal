import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { rateLimit } from '../plugins/ratelimit.js';
import { hashEmail, decrypt, mask, hashPassword, verifyPassword } from '../lib/vault.js';
import { signToken } from './jwt.js';
import { requireAuth } from './rbac.js';
import type { Principal } from './principal.js';

// Same login model as the VIT open-project portal:
//   • students sign in with their REGISTRATION NUMBER (or email) + PASSWORD,
//   • staff/admin with email or username + password,
//   • passwords are scrypt-verified (one-way), emails are AES-encrypted at rest
//     and only ever surfaced masked.
const loginSchema = z.object({
  identifier: z.string().trim().min(1), // reg no | email | admin username
  password: z.string().min(1),
});
const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

interface Identity {
  principal: Principal;
  passwordHash: string | null;
  kind: 'student' | 'staff';
  id: string;
}

async function resolveIdentity(identifier: string): Promise<Identity | null> {
  const id = identifier.trim();
  const emailHash = hashEmail(id); // deterministic; harmless if id isn't an email

  const student = await query(
    `SELECT id, name, email_enc, password_hash FROM students
      WHERE lower(reg_no) = lower($1) OR email_hash = $2 LIMIT 1`,
    [id, emailHash],
  );
  if (student.rowCount && student.rows[0]) {
    const s = student.rows[0];
    return {
      kind: 'student',
      id: s.id,
      passwordHash: s.password_hash,
      principal: { sub: s.id, kind: 'student', role: 'student', email: mask(decrypt(s.email_enc) ?? ''), name: s.name },
    };
  }

  const staff = await query(
    `SELECT id, name, email_enc, username, role, password_hash FROM staff
      WHERE email_hash = $1 OR lower(username) = lower($2) LIMIT 1`,
    [emailHash, id],
  );
  if (staff.rowCount && staff.rows[0]) {
    const s = staff.rows[0];
    return {
      kind: 'staff',
      id: s.id,
      passwordHash: s.password_hash,
      principal: { sub: s.id, kind: 'staff', role: s.role, email: decrypt(s.email_enc) ?? '', name: s.name },
    };
  }
  return null;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req) => {
    const { identifier, password } = parse(loginSchema, req.body);
    // Throttle to blunt brute force / credential stuffing.
    await rateLimit(`login:${identifier.toLowerCase()}`, 10, 300);

    const identity = await resolveIdentity(identifier);
    // Constant-ish response: same error whether the account or password is wrong.
    if (!identity || !identity.passwordHash || !(await verifyPassword(password, identity.passwordHash))) {
      throw unauthorized('Incorrect registration number/email or password');
    }
    const token = signToken(identity.principal);
    return { token, principal: identity.principal };
  });

  app.post('/auth/change-password', { preHandler: requireAuth }, async (req) => {
    const { currentPassword, newPassword } = parse(changeSchema, req.body);
    const p = req.principal!;
    const table = p.kind === 'student' ? 'students' : 'staff';
    const cur = await query(`SELECT password_hash FROM ${table} WHERE id = $1`, [p.sub]);
    const hash = cur.rows[0]?.password_hash as string | null;
    if (!hash || !(await verifyPassword(currentPassword, hash))) {
      throw forbidden('Current password is incorrect');
    }
    if (currentPassword === newPassword) throw badRequest('same_password', 'Choose a different password');
    const next = await hashPassword(newPassword);
    await query(`UPDATE ${table} SET password_hash = $2 WHERE id = $1`, [p.sub, next]);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    return { principal: req.principal };
  });
}
