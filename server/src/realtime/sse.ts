import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { requireStudent } from '../auth/rbac.js';
import { redis, makeSubscriber, CHANNELS } from '../redis/client.js';
import { unauthorized } from '../lib/errors.js';

// EventSource can't send Authorization headers, and putting a JWT in the URL
// would leak it into logs. So we mint a one-time, short-lived ticket bound to
// the student, exchanged for the stream.
const TICKET_TTL = 60;

export async function registerRealtime(app: FastifyInstance): Promise<void> {
  // 1) Authenticated students request a stream ticket.
  app.post('/realtime/ticket', { preHandler: requireStudent }, async (req) => {
    const ticket = randomUUID();
    await redis.set(`sse-ticket:${ticket}`, req.principal!.sub, 'EX', TICKET_TTL);
    return { ticket };
  });

  // 2) The browser opens EventSource(`/realtime/stream?ticket=...`).
  app.get('/realtime/stream', async (req, reply) => {
    const ticket = (req.query as { ticket?: string }).ticket;
    if (!ticket) throw unauthorized('Missing stream ticket');
    const studentId = await redis.getdel(`sse-ticket:${ticket}`);
    if (!studentId) throw unauthorized('Invalid or expired stream ticket');

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write('retry: 3000\n\n');

    const channel = CHANNELS.notify(studentId);
    const sub = makeSubscriber();
    await sub.subscribe(channel);
    sub.on('message', (_ch, message) => {
      reply.raw.write(`event: notification\ndata: ${message}\n\n`);
    });

    // Heartbeat so proxies don't drop the idle connection.
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      sub.quit().catch(() => {});
    };
    req.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);

    // Keep the request open — Fastify must not send its own response.
    return reply;
  });
}
