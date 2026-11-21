-- Classement Glicko-2 : déviation, volatilité et date de dernière partie
ALTER TABLE elo_profiles ADD COLUMN IF NOT EXISTS rd DOUBLE PRECISION NOT NULL DEFAULT 350;
ALTER TABLE elo_profiles ADD COLUMN IF NOT EXISTS volatility DOUBLE PRECISION NOT NULL DEFAULT 0.06;
ALTER TABLE elo_profiles ADD COLUMN IF NOT EXISTS last_played_at BIGINT;

-- Les profils existants gardent leur classement ; leur déviation reflète
-- le nombre de parties déjà jouées (plus de parties = classement plus sûr).
UPDATE elo_profiles
SET rd = GREATEST(70, 350 - games_played * 14),
    last_played_at = CASE WHEN games_played > 0 THEN updated_at ELSE NULL END;

CREATE INDEX IF NOT EXISTS idx_elo_profiles_rating
  ON elo_profiles (rating DESC);

-- Connexion via Google / Apple / Microsoft / lien e-mail (Firebase Auth)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN salt DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_uid TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_uid
  ON users (provider_uid)
  WHERE provider_uid IS NOT NULL;
