CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS match_history (
  id BIGSERIAL PRIMARY KEY,
  room_code TEXT NOT NULL,
  profile_key TEXT NOT NULL,
  opponent_pseudo TEXT NOT NULL,
  opponent_elo INTEGER NOT NULL,
  player_symbol TEXT NOT NULL,
  result TEXT NOT NULL,
  end_reason TEXT NOT NULL,
  elo_before INTEGER NOT NULL,
  elo_after INTEGER NOT NULL,
  elo_delta INTEGER NOT NULL,
  moves_count INTEGER NOT NULL,
  time_control TEXT NOT NULL,
  played_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_history_profile_played
  ON match_history (profile_key, played_at DESC);
