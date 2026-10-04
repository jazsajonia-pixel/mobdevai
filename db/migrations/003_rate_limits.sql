-- Mobile Development AI — Phase 8: shared rate limiting across function instances.
-- key = truncated SHA-256 of "<bucket>:<user id or IP>" (no raw identifiers stored).
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT    NOT NULL,
  window_start  BIGINT  NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
