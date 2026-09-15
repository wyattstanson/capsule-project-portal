import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { AppError } from './lib/errors.js';
import { registerAuth } from './auth/routes.js';
import { registerStudents } from './modules/students/routes.js';
import { registerTeams } from './modules/teams/routes.js';
import { registerSubmissions } from './modules/submissions/routes.js';
import { registerAdmin } from './modules/admin/routes.js';
import { registerRealtime } from './realtime/sse.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'debug' },
    trustProxy: true, // behind a load balancer
    bodyLimit: 1_048_576,
  });

  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  });

  // Serve uploaded proof files (auth is enforced at the app edge in prod via
  // signed URLs / gateway; kept simple here). Ensure the dir exists first —
  // @fastify/static refuses to register against a missing root.
  const uploadRoot = join(process.cwd(), config.uploadDir);
  mkdirSync(uploadRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadRoot,
    prefix: '/files/',
    decorateReply: false,
  });

  // Uniform error shape: { error: { code, message, details? } }.
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }
    if ((err as { validation?: unknown }).validation) {
      reply.status(400).send({ error: { code: 'validation_error', message: err.message } });
      return;
    }
    req.log.error(err);
    reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong' } });
  });

  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  // All API routes live under /api.
  await app.register(
    async (api) => {
      await registerAuth(api);
      await registerStudents(api);
      await registerTeams(api);
      await registerSubmissions(api);
      await registerAdmin(api);
      await registerRealtime(api);
    },
    { prefix: '/api' },
  );

  return app;
}
