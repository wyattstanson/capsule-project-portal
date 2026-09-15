import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireStudent } from '../../auth/rbac.js';
import { config } from '../../config.js';
import { parse } from '../../lib/validate.js';
import { rateLimit } from '../../plugins/ratelimit.js';
import {
  confirmSolo,
  confirmTeam,
  ensureFormingTeam,
  getMyTeam,
  leaveTeam,
  listRequestsFor,
  respondToRequest,
  sendRequest,
} from './service.js';

const sendSchema = z.object({ toStudentId: z.string().uuid() });
const respondSchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['accept', 'reject']),
});
const soloSchema = z.object({ route: z.enum(['inhouse', 'cdc']).default('inhouse') });

export async function registerTeams(app: FastifyInstance): Promise<void> {
  app.get('/team/me', { preHandler: requireStudent }, async (req) => {
    return { team: await getMyTeam(req.principal!.sub) };
  });

  app.post('/team/start', { preHandler: requireStudent }, async (req) => {
    return { team: await ensureFormingTeam(req.principal!.sub) };
  });

  app.get('/requests', { preHandler: requireStudent }, async (req) => {
    return listRequestsFor(req.principal!.sub);
  });

  app.post('/requests/send', { preHandler: requireStudent }, async (req) => {
    const { toStudentId } = parse(sendSchema, req.body);
    // Rate-limit request-sending per student to block spam.
    await rateLimit(`send:${req.principal!.sub}`, config.rateRequestsPerMin, 60);
    await sendRequest(req.principal!.sub, toStudentId);
    return { ok: true };
  });

  app.post('/requests/respond', { preHandler: requireStudent }, async (req) => {
    const { requestId, action } = parse(respondSchema, req.body);
    const team = await respondToRequest(req.principal!.sub, requestId, action);
    return { ok: true, team };
  });

  app.post('/team/confirm', { preHandler: requireStudent }, async (req) => {
    return { team: await confirmTeam(req.principal!.sub) };
  });

  app.post('/team/confirm-solo', { preHandler: requireStudent }, async (req) => {
    const { route } = parse(soloSchema, req.body ?? {});
    return { team: await confirmSolo(req.principal!.sub, route) };
  });

  app.post('/team/leave', { preHandler: requireStudent }, async (req) => {
    await leaveTeam(req.principal!.sub);
    return { ok: true };
  });
}
