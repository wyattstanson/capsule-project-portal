import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { requireStudent, requireRole } from '../../auth/rbac.js';
import { badRequest } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { getMyTeam } from '../teams/service.js';
import {
  createSubmission,
  listQueue,
  reviewSubmission,
  submissionHistory,
} from './service.js';

const createSchema = z.object({
  title: z.string().trim().max(200).optional(),
  remark: z.string().trim().max(2000).optional(),
  reason: z.string().trim().max(2000).optional(),
  attachmentUrl: z.string().trim().max(500).optional(),
});
const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  decision: z.enum(['approve', 'reject']),
  remark: z.string().trim().max(2000).default(''),
});

const ALLOWED_EXT = new Set(['.pdf', '.ppt', '.pptx', '.doc', '.docx']);

export async function registerSubmissions(app: FastifyInstance): Promise<void> {
  // ── Proof-of-placement upload (CDC route) ──────────────────────────────
  app.post('/uploads', { preHandler: requireStudent }, async (req) => {
    const file = await req.file();
    if (!file) throw badRequest('no_file', 'No file provided');
    const ext = extname(file.filename).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      throw badRequest('bad_type', 'Allowed: PDF, PPT/PPTX, DOC/DOCX');
    }
    await mkdir(config.uploadDir, { recursive: true });
    const stored = `${randomUUID()}${ext}`;
    const dest = join(config.uploadDir, stored);
    await pipeline(file.file, createWriteStream(dest));
    if (file.file.truncated) {
      throw badRequest('too_large', `File exceeds ${config.maxUploadMb} MB`);
    }
    return { url: `/files/${stored}`, filename: file.filename };
  });

  // ── Student: submit / view history ─────────────────────────────────────
  app.post('/submissions', { preHandler: requireStudent }, async (req) => {
    const input = parse(createSchema, req.body ?? {});
    return createSubmission(req.principal!.sub, input);
  });

  app.get('/submissions/mine', { preHandler: requireStudent }, async (req) => {
    const team = await getMyTeam(req.principal!.sub);
    if (!team) return { history: [] };
    return { team, history: await submissionHistory(team.id) };
  });

  // ── Coordinator: review queue + decision ───────────────────────────────
  app.get(
    '/queue/project',
    { preHandler: requireRole('project_coordinator', 'admin') },
    async (req) => {
      const status = (req.query as { status?: string }).status ?? 'pending';
      return { submissions: await listQueue('project_coordinator', status) };
    },
  );

  app.get(
    '/queue/cdc',
    { preHandler: requireRole('cdc_coordinator', 'admin') },
    async (req) => {
      const status = (req.query as { status?: string }).status ?? 'pending';
      return { submissions: await listQueue('cdc_coordinator', status) };
    },
  );

  app.post(
    '/submissions/review',
    { preHandler: requireRole('project_coordinator', 'cdc_coordinator') },
    async (req) => {
      const { submissionId, decision, remark } = parse(reviewSchema, req.body);
      return reviewSubmission(
        req.principal!.sub,
        req.principal!.role,
        submissionId,
        decision,
        remark,
      );
    },
  );
}
