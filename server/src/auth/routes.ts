import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { rateLimit } from '../plugins/ratelimit.js';
import { enqueueNotification } from '../queue/index.js';
import { issueOtp, verifyOtp } from './otp.js';
import { signToken } from './jwt.js';
import { requireAuth } from './rbac.js';
import type { Principal } from './principal.js';

const requestSchema = z.object({
  // A student may sign in with reg_no OR email; staff use email.
  identifier: z.string().trim().min(1),
});
const verifySchema = z.object({
  identifier: z.string().trim().min(1),
  code: z.string().trim().length(6),
});

// Resolve an identifier (reg_no or email) to a principal-shaped record.
async function resolveIdentity(identifier: string): Promise<Principal | null> {
  const id = identifier.toLowerCase();
  const student = await query(
    `SELECT id, name, email FROM students WHERE lower(email) = $1 OR lower(reg_no) = $1`,
    [id],
  );
  if (student.rowCount && student.rows[0]) {
    const s = student.rows[0];
    return { sub: s.id, kind: 'student', role: 'student', email: s.email, name: s.name };
  }
  const staff = await query(`SELECT id, name, email, role FROM staff WHERE lower(email) = $1`, [id]);
  if (staff.rowCount && staff.rows[0]) {
    const s = staff.rows[0];
    return { sub: s.id, kind: 'staff', role: s.role, email: s.email, name: s.name };
  }
  return null;
}

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.post('/auth/request-otp', async (req) => {
    const { identifier } = parse(requestSchema, req.body);
    // Throttle OTP requests per identifier to blunt enumeration/spam.
    await rateLimit(`otp:${identifier.toLowerCase()}`, 5, 300);

    const identity = await resolveIdentity(identifier);
    // Always return ok to avoid leaking which identifiers exist.
    if (!identity) return { ok: true };

    const code = await issueOtp(identity.email);
    // Dispatch out-of-band (email/SMS) via the queue.
    enqueueNotification({
      studentId: identity.sub,
      type: 'otp',
      payload: { email: identity.email, code },
    }).catch(() => {});

    if (config.isProd) {
      app.log.info({ email: identity.email }, 'otp issued');
      return { ok: true };
    }
    // Dev convenience: expose the code so you can log in without a mail server.
    app.log.info({ email: identity.email, code }, 'otp issued (dev)');
    return { ok: true, devCode: code, email: identity.email };
  });

  app.post('/auth/verify', async (req) => {
    const { identifier, code } = parse(verifySchema, req.body);
    const identity = await resolveIdentity(identifier);
    if (!identity) throw unauthorized('Unknown account');
    const ok = await verifyOtp(identity.email, code);
    if (!ok) throw badRequest('bad_otp', 'Incorrect or expired code');
    const token = signToken(identity);
    return { token, principal: identity };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (req) => {
    return { principal: req.principal };
  });
}
