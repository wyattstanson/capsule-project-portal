import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Load .env from the current working directory first, then fall back to the
// monorepo root (npm workspace scripts run with cwd = server/, but the .env
// lives at the repo root). dotenv does not override already-set vars, so the
// nearer file and real environment variables (e.g. in Docker) always win.
loadEnv();
loadEnv({ path: resolve(process.cwd(), '../.env') });

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be a number`);
  return n;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  apiPort: int('API_PORT', 4000),

  databaseUrl: required('DATABASE_URL', 'postgres://capsule:capsule@localhost:56432/capsule'),
  databaseDirectUrl: required(
    'DATABASE_DIRECT_URL',
    'postgres://capsule:capsule@localhost:55432/capsule',
  ),
  pgPoolMax: int('PG_POOL_MAX', 20),

  redisUrl: required('REDIS_URL', 'redis://localhost:56379'),

  jwtSecret: required('JWT_SECRET', 'dev-only-change-me-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  otpTtlSeconds: int('OTP_TTL_SECONDS', 300),

  rateRequestsPerMin: int('RATE_REQUESTS_PER_MIN', 10),

  externalPortalWebhookUrl: process.env.EXTERNAL_PORTAL_WEBHOOK_URL ?? '',
  externalPortalWebhookSecret: process.env.EXTERNAL_PORTAL_WEBHOOK_SECRET ?? '',

  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: int('MAX_UPLOAD_MB', 10),

  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
} as const;

// TLS for the Postgres connection. Managed providers (Supabase, Neon, RDS,
// Render's external URL) require SSL; a local Docker Postgres does not. Auto-
// detect from the host, with PG_SSL=true/false as an explicit override.
export function pgSsl(url: string): { rejectUnauthorized: boolean } | undefined {
  const flag = process.env.PG_SSL;
  if (flag === 'true') return { rejectUnauthorized: false };
  if (flag === 'false') return undefined;
  return /supabase\.(co|com)|pooler\.supabase|neon\.tech|\.render\.com|amazonaws\.com|sslmode=require/.test(url)
    ? { rejectUnauthorized: false } // managed certs; verification not required for our use
    : undefined;
}
