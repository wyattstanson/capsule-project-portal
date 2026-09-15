import { appendFile, mkdir } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { join } from 'node:path';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { QUEUE_NAMES, type NotificationJob, type PortalSyncJob } from './queue/index.js';
import { writeAudit } from './modules/audit/service.js';

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

// ── Notification dispatch ──────────────────────────────────────────────────
// In dev this just logs. Swap the body for an email/SMS provider in prod.
const notificationWorker = new Worker<NotificationJob>(
  QUEUE_NAMES.notifications,
  async (job) => {
    const { studentId, type, payload } = job.data;
    if (type === 'otp') {
      console.log(`[notify] OTP for ${payload.email}: ${payload.code}`);
      // TODO: integrate email/SMS provider (e.g. SES / Twilio).
      return;
    }
    console.log(`[notify] → student ${studentId}: ${type}`, payload);
  },
  { connection, concurrency: 20 },
);

// ── External student-portal sync ────────────────────────────────────────────
// When a project id is issued we sync it outward. Two modes:
//   • webhook mode — POST a signed payload to EXTERNAL_PORTAL_WEBHOOK_URL
//   • export-only  — no live API: append the payload to a local export file
//                    and record it in the audit log for later reconciliation.
const portalSyncWorker = new Worker<PortalSyncJob>(
  QUEUE_NAMES.portalSync,
  async (job) => {
    const payload = {
      event: 'project_id_assigned',
      teamId: job.data.teamId,
      projectId: job.data.projectId,
      members: job.data.members,
      at: new Date().toISOString(),
    };

    if (config.externalPortalWebhookUrl) {
      const body = JSON.stringify(payload);
      const signature = config.externalPortalWebhookSecret
        ? createHmac('sha256', config.externalPortalWebhookSecret).update(body).digest('hex')
        : undefined;
      const res = await fetch(config.externalPortalWebhookUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature ? { 'x-capsule-signature': signature } : {}),
        },
        body,
      });
      if (!res.ok) throw new Error(`portal sync failed: ${res.status}`);
      await writeAudit({
        action: 'portal.sync.webhook',
        targetType: 'team',
        targetId: job.data.teamId,
        detail: { projectId: job.data.projectId, status: res.status },
      });
      return;
    }

    // Export-only fallback.
    const dir = join(process.cwd(), 'exports');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'portal-sync.ndjson'), JSON.stringify(payload) + '\n', 'utf8');
    await writeAudit({
      action: 'portal.sync.export',
      targetType: 'team',
      targetId: job.data.teamId,
      detail: { projectId: job.data.projectId, mode: 'export-only' },
    });
  },
  { connection, concurrency: 10 },
);

notificationWorker.on('failed', (job, err) => console.error('[notify] failed', job?.id, err.message));
portalSyncWorker.on('failed', (job, err) => console.error('[portal-sync] failed', job?.id, err.message));

console.log('[worker] notification + portal-sync workers started');

const shutdown = async () => {
  await Promise.all([notificationWorker.close(), portalSyncWorker.close()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
