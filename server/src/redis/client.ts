import { Redis } from 'ioredis';
import { config } from '../config.js';

// A general-purpose connection for commands (cache, rate-limit counters).
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ-compatible clients
  enableReadyCheck: true,
});

redis.on('error', (err) => console.error('[redis] error', err));

// Separate connections for pub/sub — a subscriber connection cannot issue
// normal commands, so SSE fan-out uses its own pair.
export function makeSubscriber(): Redis {
  const sub = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  sub.on('error', (err) => console.error('[redis:sub] error', err));
  return sub;
}

export const CHANNELS = {
  // Per-student notification channel: `notify:<studentId>`
  notify: (studentId: string) => `notify:${studentId}`,
} as const;
