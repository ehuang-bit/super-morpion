-- Espace tournoi à élimination directe (4, 8 ou 16 joueurs)
CREATE TABLE IF NOT EXISTS tournaments (
  code TEXT PRIMARY KEY,
  state_json JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tournaments_updated_at
  ON tournaments (updated_at DESC);
