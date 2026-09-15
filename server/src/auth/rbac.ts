import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyToken } from './jwt.js';
import type { Role } from './principal.js';

// Extract + verify the bearer token, attaching the principal. Throws 401 when
// missing/invalid — the global error handler turns that into a clean response.
export async function authenticate(req: FastifyRequest): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  try {
    req.principal = verifyToken(header.slice('Bearer '.length));
  } catch {
    throw unauthorized('Session expired or invalid');
  }
}

// preHandler factory: require authentication and (optionally) one of `roles`.
// Applied per-route so RBAC is explicit at every endpoint, not implicit.
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    await authenticate(req);
    if (roles.length && !roles.includes(req.principal!.role)) {
      throw forbidden();
    }
  };
}

export const requireAuth = requireRole();
export const requireStudent = requireRole('student');
export const requireAdmin = requireRole('admin');
