import { redis } from '../redis/client.js';
import { AppError } from '../lib/errors.js';

/**
 * Fixed-window rate limiter backed by Redis (INCR + EXPIRE). Shared across all
 * API instances, so scaling out doesn't dilute the limit. Used to stop a
 * student spamming team requests.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  if (count > max) {
    const ttl = await redis.ttl(redisKey);
    throw new AppError(429, 'rate_limited', `Too many requests — try again in ${ttl}s`);
  }
}
