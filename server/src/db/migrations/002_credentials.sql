-- ════════════════════════════════════════════════════════════════════════
-- Credentials export support
-- Lets an admin export a live CSV of issued sign-in credentials.
--   • Students already carry login_key_enc (their one-time hashkey, AES) and
--     key_used, so no change is needed there.
--   • Staff get the same treatment: cred_issued_enc holds their INITIAL
--     password (AES-encrypted so it can be re-surfaced for the export) and
--     pw_self_set flips true once they change it — after which the plaintext
--     is no longer recoverable (scrypt is one-way) and the CSV says so.
-- All statements are idempotent so the migration is safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE staff ADD COLUMN IF NOT EXISTS cred_issued_enc TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS pw_self_set BOOLEAN NOT NULL DEFAULT false;
