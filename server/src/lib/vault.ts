/*
 * ============================================================================
 *  CRYPTO VAULT — same scheme as the VIT open-project portal.
 * ============================================================================
 *  • Student emails are AES-256-GCM encrypted at rest (the key lives only on
 *    the server, in VAULT_KEY or data/.vault_key — never sent to a browser).
 *  • A deterministic HMAC-SHA256 email hash gives O(1) login lookup without
 *    decrypting every record, and can't be reversed to the address.
 *  • Student-facing responses only ever get the MASKED email (a****@domain).
 *  • Passwords are scrypt-hashed (one-way, 16-byte random salt) as salt:hash.
 * ============================================================================
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const KEY_FILE = path.join(process.cwd(), 'data', '.vault_key');
const IS_PROD = process.env.NODE_ENV === 'production';

function parseKey(hex: string, source: string): Buffer {
  const buf = Buffer.from(hex.trim(), 'hex');
  if (buf.length !== 32) {
    throw new Error(
      `VAULT_KEY from ${source} must be 32 bytes (64 hex chars); got ${buf.length} bytes. ` +
        'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return buf;
}

// The AES/HMAC key MUST be stable for the life of the data — if it changes,
// every encrypted email and email_hash becomes unreadable and login lookups
// break. In production we therefore REQUIRE an explicit VAULT_KEY env var and
// refuse to boot without it, rather than silently generating a fresh (and, on
// an ephemeral filesystem like Render's, per-restart) key that would corrupt
// access to existing data. In development we fall back to a persisted file.
function loadKey(): Buffer {
  if (process.env.VAULT_KEY) return parseKey(process.env.VAULT_KEY, 'env');

  if (IS_PROD) {
    throw new Error(
      'VAULT_KEY environment variable is required in production and must stay ' +
        'STABLE across deploys (it decrypts stored emails). Generate once with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        'then set it on the API service (e.g. Render → capsule-api → Environment).',
    );
  }

  // Development only: read a persisted key, or generate and persist one.
  try {
    return parseKey(fs.readFileSync(KEY_FILE, 'utf8'), KEY_FILE);
  } catch {
    /* no file yet */
  }
  const k = crypto.randomBytes(32); // 256-bit key
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, k.toString('hex'), { mode: 0o600 });
  return k;
}
let KEY = loadKey();

function tryDecrypt(blob: string, key: Buffer): string | null {
  try {
    const [ivb, tagb, ctb] = String(blob).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivb, 'base64'));
    d.setAuthTag(Buffer.from(tagb, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ctb, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Self-healing key selection: given a known ciphertext from the DB, pick
 * whichever available key actually decrypts it, so a wrong/stale VAULT_KEY
 * can never break email lookup / login.
 */
export function selectKeyFor(sampleBlob: string | null | undefined): boolean {
  if (!sampleBlob) return false;
  const cands: Buffer[] = [KEY];
  if (process.env.VAULT_KEY) {
    try {
      cands.push(Buffer.from(process.env.VAULT_KEY, 'hex'));
    } catch {
      /* ignore */
    }
  }
  try {
    cands.push(Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex'));
  } catch {
    /* ignore */
  }
  for (const k of cands) {
    if (k.length === 32 && tryDecrypt(sampleBlob, k) !== null) {
      KEY = k;
      return true;
    }
  }
  return false;
}

/** Encrypt a string → "iv:tag:ciphertext" (base64). Backend only. */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

/** Decrypt "iv:tag:ciphertext" back to the original. null if wrong/tampered. */
export function decrypt(blob: string | null | undefined): string | null {
  if (!blob) return null;
  return tryDecrypt(blob, KEY);
}

/** Deterministic keyed hash of an email, for O(1) login lookup. */
export function hashEmail(email: string): string {
  return crypto.createHmac('sha256', KEY).update(String(email).trim().toLowerCase()).digest('hex');
}

/** What students may see: first letter + domain only. */
export function mask(email: string): string {
  const s = String(email);
  const at = s.indexOf('@');
  if (at < 1) return '****';
  return s[0] + '****' + s.slice(at);
}

/** scrypt password hash (async, off the event loop) → "salt:hash" hex. */
export function hashPassword(pw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(pw), salt, 32, (err, dk) => {
      if (err) reject(err);
      else resolve(salt.toString('hex') + ':' + dk.toString('hex'));
    });
  });
}

export function verifyPassword(pw: string, stored: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const [s, h] = String(stored).split(':');
      const hb = Buffer.from(h, 'hex');
      crypto.scrypt(String(pw), Buffer.from(s, 'hex'), 32, (err, dk) => {
        if (err) return resolve(false);
        try {
          resolve(dk.length === hb.length && crypto.timingSafeEqual(dk, hb));
        } catch {
          resolve(false);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

/** Sync scrypt hash — only for the offline seed/import scripts. */
export function hashPasswordSync(pw: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(pw), salt, 32);
  return salt.toString('hex') + ':' + dk.toString('hex');
}

export function newToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

// A 16-character login hashkey issued to each student as their initial
// credential (they change to a real password later). Crockford-ish alphabet
// avoids ambiguous 0/O/1/I/L. Uppercase, easy to read off a sheet.
const KEY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function genHashkey(len = 16): string {
  let out = '';
  for (let i = 0; i < len; i++) out += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
  return out;
}
