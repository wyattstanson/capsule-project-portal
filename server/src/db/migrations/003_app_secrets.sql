-- ════════════════════════════════════════════════════════════════════════
-- Internal app secrets (server-only; never exposed through any API).
-- Holds the AES/HMAC vault key so it survives restarts on hosts with an
-- ephemeral filesystem (e.g. Render), where writing it to a local file would
-- otherwise regenerate a fresh — and data-corrupting — key on every deploy.
-- An explicit VAULT_KEY env var still overrides this when present.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_secrets (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
