import { createHash, randomInt } from 'node:crypto';
import { config } from '../config.js';
import { redis } from '../redis/client.js';

// OTP flow: reg_no/email → 6-digit code stored (hashed) in Redis with a TTL.
// In dev the code is returned to the caller and logged; in prod it is only
// dispatched via the notification queue (email/SMS), never returned.
const key = (email: string) => `otp:${email.toLowerCase()}`;
const hash = (code: string) => createHash('sha256').update(code).digest('hex');

export async function issueOtp(email: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await redis.set(key(email), hash(code), 'EX', config.otpTtlSeconds);
  return code;
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const stored = await redis.get(key(email));
  if (!stored) return false;
  const ok = stored === hash(code);
  if (ok) await redis.del(key(email)); // single-use
  return ok;
}
