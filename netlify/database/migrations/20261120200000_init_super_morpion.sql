CREATE TABLE IF NOT EXISTS elo_profiles (
  profile_key TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1200,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  peak_rating INTEGER NOT NULL DEFAULT 1200,
  streak INTEGER NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  state_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS matchmaking_queue (
  player_id TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL,
  pseudo TEXT NOT NULL,
  time_control TEXT NOT NULL,
  matched_code TEXT,
  joined_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_lookup
  ON matchmaking_queue (time_control, matched_code, last_seen_at, joined_at);
