-- Per-connection counters against abuse (sign-up spam, password guessing,
-- free PDF readings). The key holds a short hash of the IP address, never the
-- address itself; rows expire with their window.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
