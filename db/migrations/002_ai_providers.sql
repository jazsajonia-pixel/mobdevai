-- Mobile Development AI — Phase 3: AI provider configuration.
-- API keys are stored ONLY as AES-256-GCM ciphertext (key derived from ENCRYPTION_KEY, bound to
-- user + provider id as additional authenticated data). key_hint is the masked form shown in the UI.

CREATE TABLE IF NOT EXISTS ai_providers (
  id                 TEXT        PRIMARY KEY,
  user_id            BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind               TEXT        NOT NULL CHECK (kind IN ('openai', 'anthropic', 'gemini', 'openai-compatible')),
  label              TEXT        NOT NULL,
  model              TEXT        NOT NULL,
  base_url           TEXT,
  enabled            BOOLEAN     NOT NULL DEFAULT true,
  key_ciphertext     TEXT        NOT NULL,
  key_hint           TEXT        NOT NULL,
  last_test          JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_providers_user_idx ON ai_providers (user_id);

-- Default provider id (a row above or a server "platform:<kind>" provider).
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_default_provider TEXT;
