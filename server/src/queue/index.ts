import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

// BullMQ needs its own Redis connection with maxRetriesPerRequest = null.
const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

export const QUEUE_NAMES = {
  notifications: 'notifications',
  portalSync: 'portal-sync',
} as const;

// Notification dispatch (email/SMS) — kept off the request path.
export const notificationQueue = new Queue(QUEUE_NAMES.notifications, { connection });

// External student-portal sync — fired when a project id is issued.
export const portalSyncQueue = new Queue(QUEUE_NAMES.portalSync, { connection });

export interface NotificationJob {
  studentId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface PortalSyncJob {
  teamId: string;
  projectId: string;
  members: { regNo: string; email: string }[];
}

export async function enqueueNotification(job: NotificationJob): Promise<void> {
  await notificationQueue.add('dispatch', job, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}

export async function enqueuePortalSync(job: PortalSyncJob): Promise<void> {
  await portalSyncQueue.add('sync', job, {
    attempts: 8,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}
