-- Mobile Development AI — Phase 1 schema (PostgreSQL / Neon)
-- Tokens are NOT stored here: the GitHub access token lives only inside the encrypted session cookie.

CREATE TABLE IF NOT EXISTS users (
  id             BIGSERIAL PRIMARY KEY,
  github_id      BIGINT      NOT NULL UNIQUE,
  login          TEXT        NOT NULL,
  name           TEXT,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS github_connections (
  user_id          BIGINT      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scopes           TEXT[]      NOT NULL DEFAULT '{}',
  include_private  BOOLEAN     NOT NULL DEFAULT false,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
