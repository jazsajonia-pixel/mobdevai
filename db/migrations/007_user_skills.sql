-- Chrono: custom skills + enabled skill ids, synced per account.
-- The server also applies this lazily (ADD COLUMN IF NOT EXISTS), so it is safe to run more than once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB;
